import type { SqlExecutor } from "../data/postgres-observation-repository.ts";

const quotaMigration = "0010_provider_quota_ledger.sql";
const failure = () => new Error("Local quota initialization unavailable; existing authority preserved");

/** Quota-only exception for backup inspection. SELECT and immutability remain
 * mandatory; ordinary configure/activation still requires table-wide INSERT. */
export function localQuotaPrivilegePredicate(allowReadonly: boolean): string {
  return `has_table_privilege(current_user,c.oid,'SELECT')
    AND (${allowReadonly === true ? "true" : "false"} OR has_table_privilege(current_user,c.oid,'INSERT'))
    AND NOT has_any_column_privilege(current_user,c.oid,'UPDATE')
    AND NOT has_table_privilege(current_user,c.oid,'DELETE,TRUNCATE,TRIGGER')`;
}

/** One dedicated connection, initially outside a transaction; caller must close
 * it in finally (including connection loss/ambiguous lock-query results).
 * Session exclusion spans applyMigrations' own transactions and the final grant
 * transaction. Contention fails without work; this never waits indefinitely or
 * reactivates a retained table. Test identifiers target disposable schemas only. */
export async function initializeLocalQuotaLifecycle(
  client: SqlExecutor,
  migrate: () => Promise<string[]>,
  seedAndGrant: () => Promise<void>,
  target: { schema: string; role: string } = { schema: "public", role: "asha_runtime" },
): Promise<string[]> {
  const { schema, role } = target;
  if (!(schema === "public" && role === "asha_runtime")
    && !(/^asha_quota_lifecycle_[a-f0-9]{16}$/.test(schema) && role === schema.replace("lifecycle", "runtime"))) throw failure();
  let locked = false, failed = false, applied: string[] = [];
  try {
    const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(174228531, 10) AS locked");
    if (lock.rows?.length !== 1 || lock.rows[0].locked !== true) throw failure();
    locked = true;
    const before = await client.query<{ quota_table: string | null; journal: string | null }>(
      "SELECT to_regclass($1)::text AS quota_table, to_regclass($2)::text AS journal",
      [`${schema}.provider_request_reservations`, `${schema}.asha_schema_migrations`],
    );
    if (before.rows?.length !== 1) throw failure();
    const state = before.rows[0];
    if (![state.quota_table, state.journal].every(value => value === null || typeof value === "string")) throw failure();
    const recorded = state.journal === null ? [] : (await client.query<{ id: string }>(
      `SELECT id FROM "${schema}".asha_schema_migrations WHERE id=$1`, [quotaMigration],
    )).rows;
    if (!recorded || recorded.length > 1 || recorded.some(row => row.id !== quotaMigration)
      || (state.quota_table !== null) !== (recorded.length === 1)) throw failure();
    const fresh = state.quota_table === null;
    applied = await migrate();
    if (!Array.isArray(applied) || applied.some(value => typeof value !== "string") || applied.includes(quotaMigration) !== fresh) throw failure();
    await client.query("BEGIN");
    // Existing-table grants are deliberately untouched, including absent INSERT
    // after a source fence. Only this run's reviewed new-table migration grants it.
    if (fresh) await client.query(`GRANT INSERT ON "${schema}".provider_request_reservations TO "${role}"`);
    await seedAndGrant();
    await client.query("COMMIT");
  } catch { failed = true; }
  finally {
    if (locked) {
      // Roll back a failed/aborted callback transaction before trying to unlock.
      // A successful callback committed above; no outside transaction is owned.
      if (failed) try { await client.query("ROLLBACK"); } catch { /* Still attempt unlock; caller closes the dedicated connection. */ }
      try {
        const released = await client.query<{ unlocked: boolean }>("SELECT pg_advisory_unlock(174228531, 10) AS unlocked");
        if (released.rows?.length !== 1 || released.rows[0].unlocked !== true) failed = true;
      } catch { failed = true; }
    }
  }
  if (failed) throw failure();
  return applied;
}
