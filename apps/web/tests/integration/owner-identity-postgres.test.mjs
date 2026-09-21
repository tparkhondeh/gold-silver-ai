import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { Client, Pool } from "pg";
import { readMigrations, applyMigrations } from "../../db/migrations.ts";
import { createPgTransactionRunner, inspectOperatorDatabaseEnvironment } from "../../db/postgres-runtime.ts";
import { PostgresPortfolioRepository, emptyPortfolioPreferences } from "../../data/postgres-portfolio-repository.ts";
import { PostgresOwnerIdentityStore, createOwnerAuthorizedRunner, identityBindingHash, OwnerAuthorizationError } from "../../auth/postgres-owner-identity-store.ts";
import { probePrivatePortfolioDatabase } from "../../auth/private-database-readiness.ts";
import { createPrivatePortfolioRuntime } from "../../auth/private-runtime.ts";
import { identityBackupExclusions, transientIdentityTables } from "../../scripts/private-backup-policy.ts";

// No .env loading and never DATABASE_URL: only the explicitly disposable database.
const connectionString = process.env.ASHA_TEST_DATABASE_URL;
const configuration = inspectOperatorDatabaseEnvironment({ ASHA_OPERATOR_COMMIT_ENABLED: "true", DATABASE_URL: connectionString });
if (!configuration.available || new URL(connectionString).pathname !== "/asha_integration") throw new Error("Identity DB tests require explicit loopback asha_integration. No tests skipped.");
const binding = { origin: "https://portfolio.invalid", issuer: "https://identity.invalid", ownerSubject: "synthetic-owner", portfolioSubject: "private-owner-synthetic" };
const opaque = () => randomBytes(32).toString("base64url");
const loginValue = () => { const createdAt = Date.now() - 1000; return { state: opaque(), nonce: opaque(), codeVerifier: opaque(), createdAt, expiresAt: createdAt + 300_000, claimed: false }; };
const sessionValue = (expiresAt = Date.now() + 120_000) => ({ issuer: binding.issuer, subject: binding.ownerSubject, createdAt: Date.now() - 1000, expiresAt });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test("durable private-owner PostgreSQL isolation, restart, atomic revocation and restore", { timeout: 90_000 }, async t => {
  const id = randomBytes(8).toString("hex"), schema = `asha_identity_test_${id}`, restored = `${schema}_restored`, role = `asha_identity_${id}`, memberRole = `${role}_member`;
  const admin = new Client({ connectionString, connectionTimeoutMillis: 3000 });
  const pool = new Pool({ connectionString, max: 6, connectionTimeoutMillis: 3000 });
  let schemaCreated = false, roleCreated = false, restoredCreated = false, memberRoleCreated = false;
  await admin.connect();
  t.after(async () => {
    await pool.end();
    if (restoredCreated) await admin.query(`DROP SCHEMA "${restored}" CASCADE`);
    if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
    if (memberRoleCreated) await admin.query(`DROP ROLE "${memberRole}"`);
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
  const scopedPool = target => ({ async connect() { const client = await pool.connect(); await client.query(`SET ROLE "${role}"`); await client.query(`SET search_path TO "${target}"`); return client; } });
  const runner = createPgTransactionRunner(scopedPool(schema)), storeA = new PostgresOwnerIdentityStore(runner, binding), storeB = new PostgresOwnerIdentityStore(runner, binding);
  async function minted(store = storeA, expiry) {
    const transaction = opaque(), session = opaque(), value = loginValue();
    await store.putTransaction(transaction, value, Date.now()); assert.ok(await store.claimTransaction(transaction, Date.now()));
    assert.equal(await store.completeLogin(transaction, session, sessionValue(expiry), null, Date.now()), true);
    return { transaction, session, proof: { sessionHash: session, issuer: binding.issuer, subject: binding.ownerSubject } };
  }
  const readiness = async target => { const client = await scopedPool(target).connect(); try { return await probePrivatePortfolioDatabase(client, migrations, target); } finally { client.release(); } };

  await t.test("forced binding RLS, least privilege and exact schema/policy readiness", async () => {
    const ready = await readiness(schema); assert.equal(ready.state, "ready", JSON.stringify(ready));
    const active = await minted();
    const client = await scopedPool(schema).connect();
    try {
      assert.equal(Number((await client.query("SELECT count(*) FROM private_owner_sessions")).rows[0].count), 0);
      for (const sql of ["TRUNCATE private_owner_sessions", "ALTER TABLE private_owner_sessions DISABLE ROW LEVEL SECURITY", "CREATE TABLE forbidden_identity_test(id integer)"]) await assert.rejects(client.query(sql), /permission denied|must be owner/);
    } finally { client.release(); }
    const other = new PostgresOwnerIdentityStore(runner, { ...binding, portfolioSubject: "private-other-synthetic" });
    assert.equal(await other.getSession(active.session, Date.now()), null);
    await admin.query(`GRANT TRUNCATE ON private_owner_sessions TO "${role}"`);
    assert.notEqual((await readiness(schema)).state, "ready");
    await admin.query(`REVOKE TRUNCATE ON private_owner_sessions FROM "${role}"`);
    await admin.query("ALTER TABLE private_owner_sessions NO FORCE ROW LEVEL SECURITY");
    assert.notEqual((await readiness(schema)).state, "ready");
    await admin.query("ALTER TABLE private_owner_sessions FORCE ROW LEVEL SECURITY");
    await admin.query("DROP POLICY private_owner_session_binding ON private_owner_sessions");
    assert.notEqual((await readiness(schema)).state, "ready");
    await admin.query("CREATE POLICY private_owner_session_binding ON private_owner_sessions USING (binding_hash=current_setting('asha.identity_binding',true)) WITH CHECK (binding_hash=current_setting('asha.identity_binding',true))");
    assert.equal((await readiness(schema)).state, "ready");
    await admin.query(`CREATE ROLE "${memberRole}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`); memberRoleCreated = true;
    await admin.query(`GRANT "${memberRole}" TO "${role}"`);
    assert.notEqual((await readiness(schema)).state, "ready");
    await admin.query(`REVOKE "${memberRole}" FROM "${role}"`);
    assert.equal((await readiness(schema)).state, "ready");
  });

  await t.test("two worker objects share one-use claims and a new process can read an existing unexpired session", async () => {
    const transaction = opaque(), key = opaque(); await storeA.putTransaction(transaction, loginValue(), Date.now());
    const claims = await Promise.all([storeA.claimTransaction(transaction, Date.now()), storeB.claimTransaction(transaction, Date.now())]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(await storeB.completeLogin(transaction, key, sessionValue(), null, Date.now()), true);
    assert.equal(await storeA.completeLogin(transaction, opaque(), sessionValue(), null, Date.now()), false);
    assert.equal((await new PostgresOwnerIdentityStore(runner, binding).getSession(key, Date.now())).subject, binding.ownerSubject);
    const script = `
      import { Pool } from 'pg';
      import { createPgTransactionRunner } from './db/postgres-runtime.ts';
      import { PostgresOwnerIdentityStore } from './auth/postgres-owner-identity-store.ts';
      const schema=process.env.ASHA_IDENTITY_TEST_SCHEMA, role=process.env.ASHA_IDENTITY_TEST_ROLE;
      if(!/^asha_identity_test_[a-f0-9]{16}$/.test(schema)||!/^asha_identity_[a-f0-9]{16}$/.test(role)) throw Error('Synthetic scope invalid');
      const pool=new Pool({connectionString:process.env.ASHA_TEST_DATABASE_URL,connectionTimeoutMillis:3000});
      try {
        const runner=createPgTransactionRunner({async connect(){const c=await pool.connect();await c.query('SET ROLE "'+role+'"');await c.query('SET search_path TO "'+schema+'"');return c;}});
        const found=await new PostgresOwnerIdentityStore(runner,JSON.parse(process.env.ASHA_IDENTITY_TEST_BINDING)).getSession(process.env.ASHA_IDENTITY_TEST_SESSION,Date.now());
        process.stdout.write(JSON.stringify({found:!!found}));
      } catch {process.stdout.write(JSON.stringify({found:false}));process.exitCode=1;} finally {await pool.end();}
    `;
    const result = execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { cwd: new URL("../../", import.meta.url), env: { ...process.env, ASHA_IDENTITY_TEST_SCHEMA: schema, ASHA_IDENTITY_TEST_ROLE: role, ASHA_IDENTITY_TEST_BINDING: JSON.stringify(binding), ASHA_IDENTITY_TEST_SESSION: key }, windowsHide: true, timeout: 15_000, stdio: "pipe", maxBuffer: 4096 });
    assert.deepEqual(JSON.parse(result.toString()), { found: true });
    await storeB.revokeBrowser(key, null); assert.equal(await storeA.getSession(key, Date.now()), null);
  });

  await t.test("pending-cookie logout cancels both exchange-first and logout-first completion without resurrection", async () => {
    const transaction = opaque(); await storeA.putTransaction(transaction, loginValue(), Date.now()); await storeA.claimTransaction(transaction, Date.now());
    const entered = deferred(), release = deferred();
    const blocked = { transaction(work) { return runner.transaction(executor => work({ async query(sql, parameters) { if (sql.startsWith("INSERT INTO private_owner_sessions")) { entered.resolve(); await release.promise; } return executor.query(sql, parameters); } })); } };
    const completing = new PostgresOwnerIdentityStore(blocked, binding), session = opaque();
    const done = completing.completeLogin(transaction, session, sessionValue(), null, Date.now());
    await entered.promise; let revoked = false;
    const logout = storeB.revokeBrowser(null, transaction).then(() => { revoked = true; });
    await wait(40); assert.equal(revoked, false); release.resolve();
    assert.equal(await done, true); await logout; assert.equal(await storeA.getSession(session, Date.now()), null);
    const earlier = opaque(); await storeA.putTransaction(earlier, loginValue(), Date.now()); await storeA.claimTransaction(earlier, Date.now()); await storeB.revokeBrowser(null, earlier);
    assert.equal(await storeA.completeLogin(earlier, opaque(), sessionValue(), null, Date.now()), false);
  });

  await t.test("logout-first blocks portfolio work; save-lock-first commits before revocation finishes", async () => {
    const revoked = await minted(); await storeB.revokeBrowser(revoked.session, null); let ran = false;
    await assert.rejects(createOwnerAuthorizedRunner(runner, revoked.proof, binding).transaction(async () => { ran = true; }), OwnerAuthorizationError); assert.equal(ran, false);
    const active = await minted(), entered = deferred(), release = deferred();
    const blocked = { transaction(work) { return runner.transaction(executor => work({ async query(sql, parameters) { if (sql.includes("UPDATE user_portfolios SET version=version+1")) { entered.resolve(); await release.promise; } return executor.query(sql, parameters); } })); } };
    const portfolio = new PostgresPortfolioRepository(createOwnerAuthorizedRunner(blocked, active.proof, binding));
    const saving = portfolio.save(binding.portfolioSubject, 0, [], emptyPortfolioPreferences);
    await entered.promise; let revokedDone = false;
    const logout = storeB.revokeBrowser(active.session, null).then(() => { revokedDone = true; });
    await wait(40); assert.equal(revokedDone, false); release.resolve();
    assert.equal((await saving).version, 1); await logout;
    assert.equal(await storeA.getSession(active.session, Date.now()), null);
    assert.equal((await admin.query("SELECT version FROM user_portfolios WHERE subject_id=$1", [binding.portfolioSubject])).rows[0].version, 1);
  });

  await t.test("expiry during portfolio transaction rolls back every mutation and a changed RLS subject cannot commit", async () => {
    const active = await minted(storeA, Date.now() + 1500);
    await assert.rejects(createOwnerAuthorizedRunner(runner, active.proof, binding).transaction(async executor => {
      await executor.query("UPDATE user_portfolios SET version=version+1 WHERE subject_id=$1", [binding.portfolioSubject]);
      await executor.query("SELECT pg_sleep(1.6)");
    }), OwnerAuthorizationError);
    assert.equal((await admin.query("SELECT version FROM user_portfolios WHERE subject_id=$1", [binding.portfolioSubject])).rows[0].version, 1);
    const current = await minted();
    const wrong = new PostgresPortfolioRepository(createOwnerAuthorizedRunner(runner, current.proof, binding));
    await assert.rejects(wrong.save("private-wrong-subject", 0, [], emptyPortfolioPreferences), OwnerAuthorizationError);
    assert.equal(Number((await admin.query("SELECT count(*) FROM user_portfolios WHERE subject_id='private-wrong-subject'")).rows[0].count), 0);
  });

  await t.test("concurrent pending inserts enforce shared capacity and late session failure preserves claimed login atomically", async () => {
    const boundedBinding = { ...binding, portfolioSubject: "private-capacity-synthetic" }, boundedA = new PostgresOwnerIdentityStore(runner, boundedBinding, 1), boundedB = new PostgresOwnerIdentityStore(runner, boundedBinding, 1);
    const results = await Promise.allSettled([boundedA.putTransaction(opaque(), loginValue(), Date.now()), boundedB.putTransaction(opaque(), loginValue(), Date.now())]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(Number((await admin.query("SELECT count(*) FROM private_owner_login_transactions WHERE binding_hash=$1", [identityBindingHash(boundedBinding)])).rows[0].count), 1);
    const transaction = opaque(); await storeA.putTransaction(transaction, loginValue(), Date.now()); await storeA.claimTransaction(transaction, Date.now());
    const failed = new PostgresOwnerIdentityStore({ transaction(work) { return runner.transaction(executor => work({ async query(sql, parameters) { const result = await executor.query(sql, parameters); if (sql.startsWith("INSERT INTO private_owner_sessions")) throw Error("Synthetic late failure"); return result; } })); } }, binding);
    const session = opaque(); await assert.rejects(failed.completeLogin(transaction, session, sessionValue(), null, Date.now()), /Synthetic late failure/);
    assert.equal(await storeA.getSession(session, Date.now()), null);
    assert.equal((await admin.query("SELECT claimed FROM private_owner_login_transactions WHERE hash=$1", [transaction])).rows[0].claimed, true);
    assert.equal(await storeA.completeLogin(transaction, session, sessionValue(), null, Date.now()), true);
  });

  await t.test("actual private runtime authenticates, saves/exports, survives reconstruction and denies non-owner/nonce replay", async subtest => {
    subtest.mock.method(globalThis, "fetch", () => assert.fail("Synthetic composition must not contact Google or a market provider"));
    const authorizations = new Map();
    const adapter = {
      issuer: binding.issuer, redirectUri: `${binding.origin}/auth/google/callback`,
      authorizationUrl(input) { authorizations.set(input.state, input); return new URL(`${binding.issuer}/authorize?state=${input.state}`); },
      async exchange({ callbackUrl, state, nonce, codeVerifier }) {
        const pending = authorizations.get(state); authorizations.delete(state);
        if (!pending || pending.nonce !== nonce || callbackUrl.searchParams.get("code") === "bad-nonce" || pending.codeChallenge !== createHash("sha256").update(codeVerifier).digest("base64url")) throw Error("Synthetic provider denied");
        return { issuer: binding.issuer, subject: callbackUrl.searchParams.get("code") === "non-owner" ? "synthetic-stranger" : binding.ownerSubject, emailVerified: true, expiresAt: Date.now() + 120_000 };
      },
    };
    const runtime = () => createPrivatePortfolioRuntime({ binding, adapter, runner, release: "a".repeat(40), publicUi: async () => new Response("Synthetic public login shell") });
    const appA = runtime(), jarA = new Map(), jarB = new Map();
    async function send(app, jar, path, { method = "GET", headers = {}, body } = {}) {
      const response = await app(new Request(new URL(path, binding.origin), { method, headers: { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "), "sec-fetch-site": "same-origin", ...(method !== "GET" ? { origin: binding.origin } : {}), ...headers }, ...(body === undefined ? {} : { body }) }));
      for (const value of response.headers.getSetCookie()) { const pair = value.split(";")[0], index = pair.indexOf("="), name = pair.slice(0, index); if (value.includes("Max-Age=0")) jar.delete(name); else jar.set(name, pair.slice(index + 1)); }
      return response;
    }
    async function signIn(app, jar, choice = "owner") {
      const begun = await send(app, jar, "/auth/google/start", { method: "POST", headers: { "x-asha-intent": "owner-login" } }); assert.equal(begun.status, 200);
      const url = new URL((await begun.json()).authorizationUrl), callback = `/auth/google/callback?state=${url.searchParams.get("state")}&code=${choice}`;
      return { response: await send(app, jar, callback), callback };
    }
    assert.equal((await send(appA, jarA, "/api/portfolio", { headers: { "x-owner-sub": binding.ownerSubject } })).status, 401);
    for (const choice of ["non-owner", "bad-nonce"]) {
      assert.equal((await signIn(appA, jarA, choice)).response.status, 401); assert.equal((await send(appA, jarA, "/api/portfolio")).status, 401);
    }
    assert.equal((await signIn(appA, jarA)).response.status, 303);
    const before = await (await send(appA, jarA, "/api/portfolio")).json(); assert.equal(before.snapshot.version, 1);
    const holding = { id: "synthetic-private-runtime", name: "Synthetic gold", amount: 1.25, unit: "gram", costToman: null, purchaseDate: null, note: "Synthetic only" };
    const payload = { expectedVersion: 1, holdings: [holding], preferences: emptyPortfolioPreferences };
    const saved = await send(appA, jarA, "/api/portfolio", { method: "PUT", headers: { "content-type": "application/json", "x-asha-intent": "owner-action", "x-asha-portfolio-request": "save" }, body: JSON.stringify(payload) });
    assert.equal(saved.status, 200); assert.equal((await saved.json()).snapshot.version, 2);
    const appB = runtime();
    assert.deepEqual((await (await send(appB, jarA, "/api/portfolio")).json()).snapshot.holdings, [holding]);
    assert.equal((await signIn(appB, jarB)).response.status, 303);
    assert.equal((await (await send(appB, jarB, "/api/portfolio")).json()).snapshot.version, 2);
    const exported = await send(appB, jarB, "/api/portfolio/export"); assert.equal(exported.status, 200); assert.match(exported.headers.get("content-disposition"), /attachment/);
    assert.ok((await exported.text()).includes("synthetic-private-runtime"));
    const conflict = await send(appB, jarB, "/api/portfolio", { method: "PUT", headers: { "content-type": "application/json", "x-asha-intent": "owner-action", "x-asha-portfolio-request": "save" }, body: JSON.stringify(payload) });
    assert.equal(conflict.status, 409);
    const copied = new Map(jarA);
    assert.equal((await send(appA, jarA, "/auth/logout", { method: "POST", headers: { "x-asha-intent": "owner-logout" } })).status, 200);
    assert.equal((await send(appB, copied, "/api/portfolio/export")).status, 401);
    assert.equal((await send(appB, jarB, "/api/portfolio")).status, 200); // Separate owner login is not silently logged out.
  });

  await t.test("real dump/restore retains portfolio and auth schema/policies but excludes login/session data", async () => {
    const active = await minted(); const pending = opaque(); await storeA.putTransaction(pending, loginValue(), Date.now());
    assert.ok(Number((await admin.query("SELECT count(*) FROM private_owner_sessions")).rows[0].count) > 0);
    assert.ok(Number((await admin.query("SELECT count(*) FROM private_owner_login_transactions")).rows[0].count) > 0);
    const url = new URL(connectionString), env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
    const args = ["--host", url.hostname, "--port", url.port || "5432", "--username", decodeURIComponent(url.username), "--dbname", "asha_integration", "--no-password"];
    const container = process.env.ASHA_PG_CONTAINER_ID;
    if (container && !/^[a-f0-9]{12,64}$/.test(container)) throw new Error("Invalid synthetic PostgreSQL container");
    function command(name, parameters, input) {
      const executable = process.env.ASHA_PG_BIN ? join(process.env.ASHA_PG_BIN, name + (process.platform === "win32" ? ".exe" : "")) : name;
      try { return execFileSync(container ? "docker" : executable, container ? ["exec", "-i", "--env", "PGPASSWORD", container, name, ...parameters] : parameters, { env, input, windowsHide: true, stdio: "pipe", timeout: 30_000, maxBuffer: 10_485_760 }).toString(); }
      catch { throw new Error("Synthetic identity backup/restore command failed"); }
    }
    const dump = command("pg_dump", [...args, "--schema", schema, "--no-owner", "--no-privileges", ...identityBackupExclusions]).replaceAll(schema, restored);
    assert.equal(dump.includes(active.session), false); assert.equal(dump.includes(pending), false);
    command("psql", [...args, "--set", "ON_ERROR_STOP=1", "--single-transaction"], dump); restoredCreated = true;
    for (const table of transientIdentityTables) assert.equal(Number((await admin.query(`SELECT count(*) FROM "${restored}"."${table}"`)).rows[0].count), 0);
    for (const table of ["user_portfolios", "portfolio_holdings", "portfolio_preferences"]) {
      const rows = async target => (await admin.query(`SELECT to_jsonb(t) AS row FROM "${target}"."${table}" t ORDER BY to_jsonb(t)::text`)).rows;
      assert.deepEqual(await rows(restored), await rows(schema));
    }
    await grant(restored); assert.equal((await readiness(restored)).state, "ready");
    const restoredStore = new PostgresOwnerIdentityStore(createPgTransactionRunner(scopedPool(restored)), binding);
    assert.equal(await restoredStore.getSession(active.session, Date.now()), null);
  });
});
