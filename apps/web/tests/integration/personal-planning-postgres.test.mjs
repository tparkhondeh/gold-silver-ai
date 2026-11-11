import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { Client, Pool } from "pg";
import { applyMigrations, readMigrations } from "../../db/migrations.ts";
import { createPgTransactionRunner, inspectOperatorDatabaseEnvironment } from "../../db/postgres-runtime.ts";
import { emptyPortfolioPreferences, PostgresPortfolioRepository, PortfolioVersionConflictError, portfolioRepositoryInternals } from "../../data/postgres-portfolio-repository.ts";
import { emptyPersonalPlanning } from "../../app/personal-planning.ts";
import { emptyPurchaseBook } from "../../app/purchase-book.ts";

// Only an explicitly disposable loopback database; never load local/user config.
const connectionString = process.env.ASHA_TEST_DATABASE_URL;
const configuration = inspectOperatorDatabaseEnvironment({ ASHA_OPERATOR_COMMIT_ENABLED: "true", DATABASE_URL: connectionString });
if (!configuration.available || new URL(connectionString).pathname !== "/asha_integration") throw Error("Planning DB tests require explicit loopback asha_integration. No tests skipped.");
const plan = (cash = null, months = null) => ({ ...emptyPersonalPlanning(), spendableCashToman: cash, mediumTermMonths: months });
const preferences = { ...emptyPortfolioPreferences, shortTermMonths: "3" };
const book = { ...emptyPurchaseBook(), lots: [{ id: "synthetic-history", assetId: "GOLD_18K_IRR", assetClass: "gold", unit: "gram", purityPermille: 750,
  quantity: "1.123456789012", purchaseDate: "2000-01-01", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: "99.01", fees: "0.5", note: "Synthetic only", source: { kind: "manual", reference: null }, fx: null }] };

test("planning additive migration, exact atomic persistence, RLS and independent backup restore", { timeout: 90000 }, async t => {
  const suffix = randomBytes(8).toString("hex"), schema = `asha_planning_${suffix}`, restored = `${schema}_restore`, role = `${schema}_writer`;
  const admin = new Client({ connectionString, connectionTimeoutMillis: 3000 });
  const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 3000 });
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
  const migrations = await readMigrations();
  await applyMigrations(admin, migrations.filter(row => row.id < "0015_personal_planning.sql"));
  await admin.query("INSERT INTO user_portfolios(id,subject_id,purchase_book) VALUES($1,$2,$3::jsonb)", [portfolioRepositoryInternals.portfolioId("synthetic-owner"), "synthetic-owner", JSON.stringify(book)]);
  await t.test("0015 preserves old rows and nullable unknown values without rewriting purchases", async () => {
    assert.deepEqual(await applyMigrations(admin, migrations), ["0015_personal_planning.sql"]);
    const row = (await admin.query("SELECT planning,purchase_book,version FROM user_portfolios WHERE subject_id=$1", ["synthetic-owner"])).rows[0];
    assert.equal(row.planning, null); assert.equal(row.version, 0); assert.deepEqual(row.purchase_book, book);
    assert.deepEqual(await applyMigrations(admin, migrations), []);
  });
  await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`); roleCreated = true;
  async function grant(target) {
    await admin.query(`GRANT USAGE ON SCHEMA "${target}" TO "${role}"`);
    await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON "${target}".user_portfolios,"${target}".portfolio_holdings,"${target}".portfolio_preferences TO "${role}"`);
  }
  await grant(schema);
  const runtimePool = target => ({ async connect() {
    const client = await pool.connect(); await client.query(`SET ROLE "${role}"`); await client.query(`SET search_path TO "${target}"`); return client;
  } });
  const repository = new PostgresPortfolioRepository(createPgTransactionRunner(runtimePool(schema)));
  const maximum = plan("9".repeat(36) + ".99", 32767);
  await t.test("SQL contract rejects malformed units, keys and scalars; null and maximum stay exact", async () => {
    for (const value of [plan(), plan("0", 1), plan("0.01", 6), maximum]) {
      await admin.query("UPDATE user_portfolios SET planning=$1::jsonb WHERE subject_id=$2", [JSON.stringify(value), "synthetic-owner"]);
      assert.deepEqual((await repository.load("synthetic-owner")).planning, value);
    }
    for (const value of [null, [], {}, { ...plan(), extra: true }, { ...plan(), version: "unknown" }, { ...plan(), spendableCashToman: 1 }, plan("-1"), plan("01"), plan("1.00"), plan("1e3"), plan("9".repeat(37)), plan("0.001"), plan(null, 0), plan(null, "6"), plan(null, 32768), plan(null, 1.5)]) {
      await assert.rejects(admin.query("UPDATE user_portfolios SET planning=$1::jsonb WHERE subject_id=$2", [JSON.stringify(value), "synthetic-owner"]), error => error.code === "23514");
    }
    assert.deepEqual((await repository.load("synthetic-owner")).planning, maximum);
  });
  let expected;
  await t.test("versioned owner writes preserve receipts and cash across old clients and concurrent edits", async () => {
    const saved = await repository.save("synthetic-owner", 0, [], preferences, book, plan("9007199254740993.01", 9));
    assert.equal(saved.version, 1); assert.deepEqual(saved.purchaseBook, book);
    const legacySave = await repository.save("synthetic-owner", 1, [], preferences, book);
    assert.deepEqual(legacySave.planning, saved.planning); assert.deepEqual(legacySave.purchaseBook, book);
    const concurrent = await Promise.allSettled([
      repository.save("synthetic-owner", 2, [], preferences, book, plan("0", 12)),
      repository.save("synthetic-owner", 2, [], preferences, book, plan("10.25", 15)),
    ]);
    assert.equal(concurrent.filter(row => row.status === "fulfilled").length, 1);
    assert.ok(concurrent.find(row => row.status === "rejected").reason instanceof PortfolioVersionConflictError);
    expected = concurrent.find(row => row.status === "fulfilled").value;
    assert.deepEqual(await repository.load("synthetic-owner"), expected);
    assert.equal(Object.hasOwn(await repository.load("synthetic-other-owner"), "planning"), false);
    const runner = createPgTransactionRunner(runtimePool(schema));
    await runner.transaction(async tx => {
      await tx.query("SELECT set_config('asha.subject_id',$1,true)", ["synthetic-other-owner"]);
      assert.equal((await tx.query("SELECT planning FROM user_portfolios WHERE subject_id=$1", ["synthetic-owner"])).rows.length, 0);
      assert.equal((await tx.query("UPDATE user_portfolios SET planning=$1::jsonb WHERE subject_id=$2 RETURNING id", [JSON.stringify(plan("0", 1)), "synthetic-owner"])).rows.length, 0);
    });
    assert.deepEqual(await repository.load("synthetic-owner"), expected);
  });
  await t.test("older application SQL can run while the new column and declarations remain intact", async () => {
    // Mirrors the prior release's parent update: it never writes an unknown column.
    await admin.query("UPDATE user_portfolios SET version=version+1,updated_at=clock_timestamp() WHERE subject_id=$1 AND version=$2 RETURNING id,version,purchase_book", ["synthetic-owner", expected.version]);
    expected = { ...expected, version: expected.version + 1 };
    assert.deepEqual(await repository.load("synthetic-owner"), expected);
  });
  await t.test("pg_dump restore retains exact planning, purchases and forced owner isolation", async () => {
    const url = new URL(connectionString), env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
    const args = ["--host", url.hostname, "--port", url.port || "5432", "--username", decodeURIComponent(url.username), "--dbname", "asha_integration", "--no-password"];
    const container = process.env.ASHA_PG_CONTAINER_ID;
    if (container && !/^[a-f0-9]{12,64}$/.test(container)) throw Error("Unexpected CI PostgreSQL container identifier");
    const executable = name => process.env.ASHA_PG_BIN ? join(process.env.ASHA_PG_BIN, name + (process.platform === "win32" ? ".exe" : "")) : name;
    const command = (name, values, input) => execFileSync(container ? "docker" : executable(name), container ? ["exec", "-i", "--env", "PGPASSWORD", container, name, ...values] : values, { input, env, windowsHide: true, stdio: "pipe", timeout: 30000, maxBuffer: 10485760 }).toString();
    const dump = command("pg_dump", [...args, "--schema", schema, "--no-owner", "--no-privileges"]).replaceAll(schema, restored);
    command("psql", [...args, "--set", "ON_ERROR_STOP=1", "--single-transaction"], dump); restoredCreated = true;
    await grant(restored);
    const restoredRepository = new PostgresPortfolioRepository(createPgTransactionRunner(runtimePool(restored)));
    assert.deepEqual(await restoredRepository.load("synthetic-owner"), expected);
    assert.equal(Object.hasOwn(await restoredRepository.load("synthetic-other-owner"), "planning"), false);
    const savedAgain = await restoredRepository.save("synthetic-owner", expected.version, [], preferences, book);
    assert.deepEqual(savedAgain.planning, expected.planning); assert.deepEqual(savedAgain.purchaseBook, book);
    const rls = (await admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass", [`${restored}.user_portfolios`])).rows[0];
    assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });
  });
});
