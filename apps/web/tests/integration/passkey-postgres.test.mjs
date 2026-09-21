import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { Client, Pool } from "pg";
import { readMigrations, applyMigrations } from "../../db/migrations.ts";
import { createPgTransactionRunner, inspectOperatorDatabaseEnvironment } from "../../db/postgres-runtime.ts";
import { PostgresPasskeyStore, issuePasskeyBootstrap, resetOwnerPasskeys } from "../../auth/postgres-passkey-store.ts";
import { identityBindingHash, OwnerAuthorizationError } from "../../auth/postgres-owner-identity-store.ts";
import { PasskeyRateLimitError } from "../../auth/passkey-types.ts";
import { createPrivatePasskeyRuntime } from "../../auth/private-runtime.ts";
import { probePrivatePortfolioDatabase } from "../../auth/private-database-readiness.ts";
import { emptyPortfolioPreferences } from "../../data/postgres-portfolio-repository.ts";
import { transientIdentityTables, identityBackupExclusions } from "../../scripts/private-backup-policy.ts";
import { authenticator, origin, subject, hash, paths, request, cookieFrom } from "../fixtures/passkey-fixture.mjs";

const connectionString = process.env.ASHA_TEST_DATABASE_URL;
const config = inspectOperatorDatabaseEnvironment({ ASHA_OPERATOR_COMMIT_ENABLED: "true", DATABASE_URL: connectionString });
if (!config.available || new URL(connectionString).pathname !== "/asha_integration") throw Error("Passkey tests require explicit loopback asha_integration. No fallback or skipped database tests.");
const opaque = () => randomBytes(32).toString("base64url");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test("real PostgreSQL owner passkey state, admission, atomic authorization and restore", { timeout: 120_000 }, async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("Synthetic authenticator must never contact an external service"));
  const id = randomBytes(8).toString("hex"), schema = `asha_identity_test_${id}`, restored = `${schema}_restored`, role = `asha_passkey_${id}`;
  const admin = new Client({ connectionString, connectionTimeoutMillis: 3000 }), pool = new Pool({ connectionString, max: 6, connectionTimeoutMillis: 3000 });
  let schemaCreated = false, roleCreated = false, restoredCreated = false;
  await admin.connect();
  t.after(async () => {
    await pool.end();
    if (restoredCreated) await admin.query(`DROP SCHEMA "${restored}" CASCADE`);
    if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  });
  await admin.query(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
  await admin.query(`SET search_path TO "${schema}"`);
  const migrations = await readMigrations(); await applyMigrations(admin, migrations);
  await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`); roleCreated = true;
  async function grant(target) {
    await admin.query(`GRANT USAGE ON SCHEMA "${target}" TO "${role}"`);
    await admin.query(`GRANT SELECT ON "${target}".asha_schema_migrations TO "${role}"`);
    for (const table of [...transientIdentityTables, "user_portfolios", "portfolio_holdings", "portfolio_preferences"]) await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON "${target}"."${table}" TO "${role}"`);
  }
  await grant(schema);
  function scoped(target = schema, privileged = false) { return { async connect() {
    const client = await pool.connect(); await client.query(privileged ? "RESET ROLE" : `SET ROLE "${role}"`); await client.query(`SET search_path TO "${target}"`); return client;
  } }; }
  const runner = createPgTransactionRunner(scoped()), operator = createPgTransactionRunner(scoped(schema, true));
  function context(label) {
    const binding = { origin, issuer: origin, ownerSubject: subject, portfolioSubject: `private-passkey-${label}` };
    return { binding, store: new PostgresPasskeyStore(runner, binding), bindingHash: identityBindingHash(binding) };
  }
  async function issue(c) { const token = opaque(), now = Date.now(); await issuePasskeyBootstrap(operator, c.binding, { grantHash: hash(token), now, expiresAt: now + 300_000 }); return token; }
  async function seeded(label) {
    const c = context(label), device = authenticator(), token = await issue(c), key = opaque();
    await c.store.beginRegistration({ key, challenge: opaque(), authority: { kind: "bootstrap", grantHash: hash(token) }, now: Date.now() });
    assert.ok(await c.store.claimChallenge(key, "registration", Date.now()));
    assert.equal(await c.store.completeRegistration({ challengeKey: key, credential: device.credential, now: Date.now() }), true);
    return { ...c, device };
  }
  async function claimed(c, store = c.store) {
    const key = opaque(); await store.beginAuthentication({ key, challenge: opaque(), now: Date.now() });
    const value = await store.claimChallenge(key, "authentication", Date.now()); assert.ok(value);
    return { key, credential: value.credentials.find(value => value.id === c.device.id) };
  }
  function finish(c, pending, extra = {}) {
    const now = Date.now(); return { challengeKey: pending.key, credentialId: c.device.id, expectedCounter: pending.credential.counter, newCounter: pending.credential.counter + 1,
      sessionKey: opaque(), session: { issuer: origin, subject, createdAt: now, expiresAt: now + 120_000 }, previousSessionKey: null, now, ...extra };
  }
  async function mint(c) { const input = finish(c, await claimed(c)); assert.equal(await c.store.completeAuthentication(input), true); return input; }

  await t.test("forced binding RLS and nine-table exact readiness deny other bindings/unsafe metadata", async () => {
    const client = await scoped().connect();
    try {
      assert.equal((await probePrivatePortfolioDatabase(client, migrations, schema)).state, "ready");
      for (const table of transientIdentityTables.slice(2)) {
        assert.equal(Number((await client.query(`SELECT count(*) FROM ${table}`)).rows[0].count), 0);
        await assert.rejects(client.query(`TRUNCATE ${table}`), /permission denied/);
      }
    } finally { client.release(); }
    const c = await seeded("isolation");
    assert.equal(await context("another-binding").store.claimChallenge(opaque(), "authentication", Date.now()), null);
    const other = await scoped().connect();
    try { assert.equal(Number((await other.query("SELECT count(*) FROM private_passkey_credentials")).rows[0].count), 0); } finally { other.release(); }
    assert.ok(c.device.id);
  });

  await t.test("no first visitor enrollment, one-use expiring grants and committed durable cross-worker throttle", async () => {
    const c = context("admission");
    const now = Date.now();
    await assert.rejects(issuePasskeyBootstrap(runner, c.binding, { grantHash: opaque(), now, expiresAt: now + 300_000 }), OwnerAuthorizationError);
    await assert.rejects(resetOwnerPasskeys(runner, c.binding), OwnerAuthorizationError);
    await assert.rejects(c.store.beginRegistration({ key: opaque(), challenge: opaque(), authority: { kind: "bootstrap", grantHash: opaque() }, now: Date.now() }), OwnerAuthorizationError);
    assert.equal(Number((await admin.query("SELECT count(*) FROM private_passkey_owners WHERE binding_hash=$1", [c.bindingHash])).rows[0].count), 0);
    const token = await issue(c);
    await assert.rejects(admin.query(`INSERT INTO private_passkey_challenges(hash,binding_hash,purpose,challenge,owner_revision,created_at,expires_at,claimed,authority_kind,authority_hash)
      VALUES($1,$2,'registration',$3,1,clock_timestamp(),clock_timestamp()+interval '1 minute',false,NULL,$4)`, [opaque(), c.bindingHash, opaque(), opaque()]), /check constraint/);
    await assert.rejects(issue(c), OwnerAuthorizationError);
    const attempts = Array.from({ length: 20 }, () => new PostgresPasskeyStore(runner, c.binding).beginRegistration({ key: opaque(), challenge: opaque(), authority: { kind: "bootstrap", grantHash: opaque() }, now: Date.now() }));
    assert.ok((await Promise.allSettled(attempts)).every(result => result.status === "rejected"));
    assert.equal((await admin.query("SELECT attempts FROM private_passkey_owners WHERE binding_hash=$1", [c.bindingHash])).rows[0].attempts, 20);
    await assert.rejects(new PostgresPasskeyStore(runner, c.binding).beginRegistration({ key: opaque(), challenge: opaque(), authority: { kind: "bootstrap", grantHash: hash(token) }, now: Date.now() }), PasskeyRateLimitError);
    await admin.query("UPDATE private_passkey_owners SET window_started_at=clock_timestamp()-interval '6 minutes' WHERE binding_hash=$1", [c.bindingHash]);
    const challengeKey = opaque();
    await c.store.beginRegistration({ key: challengeKey, challenge: opaque(), authority: { kind: "bootstrap", grantHash: hash(token) }, now: Date.now() });
    await assert.rejects(c.store.beginRegistration({ key: opaque(), challenge: opaque(), authority: { kind: "bootstrap", grantHash: hash(token) }, now: Date.now() }), OwnerAuthorizationError);
    assert.ok(await c.store.claimChallenge(challengeKey, "registration", Date.now()));
    await admin.query("UPDATE private_passkey_bootstrap_grants SET created_at=now()-interval '6 minutes',expires_at=now()-interval '1 minute' WHERE binding_hash=$1", [c.bindingHash]);
    assert.equal(await c.store.completeRegistration({ challengeKey, credential: authenticator().credential, now: Date.now() }), false);
    assert.equal(Number((await admin.query("SELECT count(*) FROM private_passkey_credentials WHERE binding_hash=$1", [c.bindingHash])).rows[0].count), 0);
  });

  let signedContext, signedSessionHash;
  await t.test("actual signed passkey runtime enrolls, saves, exports, reloads and survives a new process without providers", async () => {
    const c = context("signed"), device = authenticator(), token = await issue(c); signedContext = c;
    const app = () => createPrivatePasskeyRuntime({ binding: c.binding, runner, release: "a".repeat(40), publicUi: async () => new Response("Synthetic shell") });
    const first = app();
    const options = await first(request(paths.registrationOptions, { json: { bootstrapToken: token } })); assert.equal(options.status, 200);
    const registrationCookie = cookieFrom(options), generated = (await options.json()).options;
    const enrolled = await first(request(paths.registrationVerify, { cookie: registrationCookie, json: device.registration(generated.challenge) })); assert.equal(enrolled.status, 200);
    assert.equal(cookieFrom(enrolled, "__Host-asha-owner"), undefined); // Enrollment is not login.
    const auth = await first(request(paths.authenticationOptions)); assert.equal(auth.status, 200);
    const pendingCookie = cookieFrom(auth), challenge = (await auth.json()).options.challenge, assertion = device.assertion(challenge);
    const authenticated = await first(request(paths.authenticationVerify, { cookie: pendingCookie, json: assertion })); assert.equal(authenticated.status, 200);
    const cookie = cookieFrom(authenticated, "__Host-asha-owner"); signedSessionHash = hash(cookie.split("=")[1]);
    assert.equal((await first(request(paths.authenticationVerify, { cookie: pendingCookie, json: assertion }))).status, 401);
    const payload = { expectedVersion: 0, holdings: [{ id: "synthetic-passkey", name: "Synthetic only", amount: 1, unit: "gram", costToman: null, purchaseDate: null, note: "Synthetic test" }], preferences: emptyPortfolioPreferences };
    const put = await first(new Request(origin + "/api/portfolio", { method: "PUT", headers: { cookie, origin, "sec-fetch-site": "same-origin", "x-asha-intent": "owner-action", "x-asha-portfolio-request": "save", "content-type": "application/json" }, body: JSON.stringify(payload) }));
    assert.equal(put.status, 200); assert.equal((await put.json()).snapshot.version, 1);
    const restarted = app(), get = () => new Request(origin + "/api/portfolio", { headers: { cookie } });
    assert.deepEqual((await (await restarted(get())).json()).snapshot.holdings, payload.holdings);
    assert.equal((await restarted(new Request(origin + "/api/portfolio/export", { headers: { cookie, "sec-fetch-site": "same-origin" } }))).status, 200);
    const script = `import {Pool} from 'pg';import{createPgTransactionRunner}from'./db/postgres-runtime.ts';import{PostgresPasskeyStore}from'./auth/postgres-passkey-store.ts';
      const schema=process.env.ASHA_PASSKEY_SCHEMA,role=process.env.ASHA_PASSKEY_ROLE;if(!/^asha_identity_test_[a-f0-9]{16}$/.test(schema)||!/^asha_passkey_[a-f0-9]{16}$/.test(role))throw Error();
      const pool=new Pool({connectionString:process.env.ASHA_TEST_DATABASE_URL,connectionTimeoutMillis:3000});try{const runner=createPgTransactionRunner({async connect(){const c=await pool.connect();await c.query('SET ROLE "'+role+'"');await c.query('SET search_path TO "'+schema+'"');return c;}});const value=await new PostgresPasskeyStore(runner,JSON.parse(process.env.ASHA_PASSKEY_BINDING)).getSession(process.env.ASHA_PASSKEY_SESSION,Date.now());process.stdout.write(JSON.stringify({found:!!value}));}catch{process.stdout.write('{"found":false}');process.exitCode=1;}finally{await pool.end();}`;
    const output = execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { cwd: new URL("../../", import.meta.url), env: { ...process.env, ASHA_PASSKEY_SCHEMA: schema, ASHA_PASSKEY_ROLE: role, ASHA_PASSKEY_BINDING: JSON.stringify(c.binding), ASHA_PASSKEY_SESSION: signedSessionHash }, windowsHide: true, stdio: "pipe", timeout: 15_000, maxBuffer: 4096 });
    assert.deepEqual(JSON.parse(output.toString()), { found: true });
  });

  await t.test("atomic one-use claims, zero counters, counter CAS and late SQL failures preserve prior state", async () => {
    const c = await seeded("atomic"), key = opaque();
    await c.store.beginAuthentication({ key, challenge: opaque(), now: Date.now() });
    const claims = await Promise.all([c.store.claimChallenge(key, "authentication", Date.now()), new PostgresPasskeyStore(runner, c.binding).claimChallenge(key, "authentication", Date.now())]);
    assert.equal(claims.filter(Boolean).length, 1);
    const zero = finish(c, { key, credential: claims.find(Boolean).credentials[0] }, { newCounter: 0 });
    assert.equal(await c.store.completeAuthentication(zero), true);
    const pending = await claimed(c), input = finish(c, pending, { previousSessionKey: zero.sessionKey });
    const failing = new PostgresPasskeyStore({ transaction(work) { return runner.transaction(db => work({ async query(sql, values) { const result = await db.query(sql, values); if (sql.startsWith("INSERT INTO private_owner_sessions")) throw Error("Synthetic late rollback"); return result; } })); } }, c.binding);
    await assert.rejects(failing.completeAuthentication(input), /Synthetic late rollback/);
    assert.ok(await c.store.getSession(zero.sessionKey, Date.now())); assert.equal(await c.store.getSession(input.sessionKey, Date.now()), null);
    assert.equal(Number((await admin.query("SELECT counter FROM private_passkey_credentials WHERE binding_hash=$1", [c.bindingHash])).rows[0].counter), 0);
    assert.equal(await c.store.completeAuthentication(input), true);
    assert.equal(await c.store.completeAuthentication(input), false);
    const stale = await claimed(c), staleInput = finish(c, stale, { expectedCounter: 0, newCounter: 2 });
    assert.equal(await c.store.completeAuthentication(staleInput), false);
  });

  await t.test("logout waits for committing login then revokes undelivered session; reset invalidates already verified results", async () => {
    const c = await seeded("races"), input = finish(c, await claimed(c)), entered = deferred(), release = deferred();
    const blocked = new PostgresPasskeyStore({ transaction(work) { return runner.transaction(db => work({ async query(sql, values) { if (sql.startsWith("INSERT INTO private_owner_sessions")) { entered.resolve(); await release.promise; } return db.query(sql, values); } })); } }, c.binding);
    const completing = blocked.completeAuthentication(input);
    await Promise.race([entered.promise, completing.then(() => { throw Error("Expected insertion barrier"); })]);
    let revoked = false; const logout = c.store.revokeBrowser(null, input.challengeKey).then(() => { revoked = true; });
    await pause(30); assert.equal(revoked, false); release.resolve(); assert.equal(await completing, true); await logout;
    assert.equal(await c.store.getSession(input.sessionKey, Date.now()), null);
    const verified = finish(c, await claimed(c)); await resetOwnerPasskeys(operator, c.binding);
    assert.equal(await c.store.completeAuthentication(verified), false);
    await assert.rejects(c.store.beginAuthentication({ key: opaque(), challenge: opaque(), now: Date.now() }), OwnerAuthorizationError);
    assert.equal(Number((await admin.query("SELECT count(*) FROM private_owner_sessions WHERE binding_hash=$1", [c.bindingHash])).rows[0].count), 0);
  });

  await t.test("additional registration needs fresh still-live session, respects maximum and bootstrap cannot overwrite owner", async () => {
    const c = await seeded("additional"), session = await mint(c), key = opaque();
    await assert.rejects(issue(c), OwnerAuthorizationError);
    await c.store.beginRegistration({ key, challenge: opaque(), authority: { kind: "session", sessionHash: session.sessionKey }, now: Date.now() });
    assert.ok(await c.store.claimChallenge(key, "registration", Date.now()));
    await c.store.revokeBrowser(session.sessionKey, null);
    assert.equal(await c.store.completeRegistration({ challengeKey: key, credential: authenticator().credential, now: Date.now() }), false);
    const fresh = await mint(c);
    await admin.query("UPDATE private_owner_sessions SET created_at=clock_timestamp()-interval '6 minutes' WHERE hash=$1", [fresh.sessionKey]);
    await assert.rejects(c.store.beginRegistration({ key: opaque(), challenge: opaque(), authority: { kind: "session", sessionHash: fresh.sessionKey }, now: Date.now() }), OwnerAuthorizationError);
    for (let index = 0; index < 9; index++) { const credential = authenticator().credential; await admin.query("INSERT INTO private_passkey_credentials (binding_hash,id,public_key,counter,transports,device_type,backed_up) VALUES($1,$2,$3,0,$4,'singleDevice',false)", [c.bindingHash, credential.id, Buffer.from(credential.publicKey), credential.transports]); }
    await assert.rejects(c.store.beginRegistration({ key: opaque(), challenge: opaque(), authority: { kind: "session", sessionHash: fresh.sessionKey }, now: Date.now() }), OwnerAuthorizationError);
    assert.equal(Number((await admin.query("SELECT count(*) FROM private_passkey_credentials WHERE binding_hash=$1", [c.bindingHash])).rows[0].count), 10);
  });

  await t.test("real dump/restore preserves portfolio but cannot revive credentials, grants, owner state or sessions", async () => {
    const pending = context("restore-grant"); await issue(pending);
    const url = new URL(connectionString), env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
    const args = ["--host", url.hostname, "--port", url.port || "5432", "--username", decodeURIComponent(url.username), "--dbname", "asha_integration", "--no-password"];
    const container = process.env.ASHA_PG_CONTAINER_ID;
    if (container && !/^[a-f0-9]{12,64}$/.test(container)) throw Error("Invalid synthetic PostgreSQL container");
    function command(name, parameters, input) {
      const executable = process.env.ASHA_PG_BIN ? join(process.env.ASHA_PG_BIN, name + (process.platform === "win32" ? ".exe" : "")) : name;
      try { return execFileSync(container ? "docker" : executable, container ? ["exec", "-i", "--env", "PGPASSWORD", container, name, ...parameters] : parameters, { env, input, windowsHide: true, stdio: "pipe", timeout: 30_000, maxBuffer: 10_485_760 }).toString(); }
      catch { throw Error("Synthetic passkey backup/restore failed"); }
    }
    const dump = command("pg_dump", [...args, "--schema", schema, "--no-owner", "--no-privileges", ...identityBackupExclusions]).replaceAll(schema, restored);
    assert.equal(dump.includes(signedSessionHash), false);
    command("psql", [...args, "--set", "ON_ERROR_STOP=1", "--single-transaction"], dump); restoredCreated = true;
    for (const table of transientIdentityTables) assert.equal(Number((await admin.query(`SELECT count(*) FROM "${restored}"."${table}"`)).rows[0].count), 0);
    for (const table of ["user_portfolios", "portfolio_holdings", "portfolio_preferences"]) {
      const rows = async target => (await admin.query(`SELECT to_jsonb(t) AS row FROM "${target}"."${table}" t ORDER BY to_jsonb(t)::text`)).rows;
      assert.deepEqual(await rows(restored), await rows(schema));
    }
    await grant(restored);
    const restoredRunner = createPgTransactionRunner(scoped(restored)), restoredStore = new PostgresPasskeyStore(restoredRunner, signedContext.binding);
    assert.equal(await restoredStore.getSession(signedSessionHash, Date.now()), null);
    await assert.rejects(restoredStore.beginAuthentication({ key: opaque(), challenge: opaque(), now: Date.now() }), OwnerAuthorizationError);
    assert.equal(Number((await admin.query(`SELECT count(*) FROM "${restored}".private_passkey_owners`)).rows[0].count), 0);
  });
});
