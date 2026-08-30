import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

export type Migration = { id: string; checksum: string; sql: string };
export type MigrationClient = {
  query(sql: string, parameters?: unknown[]): Promise<{ rows: Array<{ id: string; checksum: string }> }>;
};

export async function readMigrations(directory = new URL("./migrations/", import.meta.url)): Promise<Migration[]> {
  const files = (await readdir(directory)).filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file)).sort();
  if (!files.length) throw new Error("No versioned migrations found");
  if (new Set(files.map((file) => file.slice(0, 4))).size !== files.length) throw new Error("Duplicate migration version");
  return Promise.all(files.map(async (id) => {
    const source = (await readFile(new URL(id, directory), "utf8")).replace(/\r\n/g, "\n");
    const body = /^\s*BEGIN;\s*([\s\S]*?)\s*COMMIT;\s*$/.exec(source);
    if (!body) throw new Error(`Migration ${id} requires explicit BEGIN/COMMIT boundaries`);
    return { id, checksum: createHash("sha256").update(source).digest("hex"), sql: body[1] };
  }));
}

// Caller owns one dedicated connection and its trusted schema search_path.
// No downgrade/reset path: failures roll back the whole unapplied migration set.
export async function applyMigrations(client: MigrationClient, migrations: Migration[]) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(174228531, 1)");
    await client.query(`CREATE TABLE IF NOT EXISTS asha_schema_migrations (
      id text PRIMARY KEY, checksum text NOT NULL CHECK (length(checksum) = 64),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )`);
    const prior = (await client.query("SELECT id, checksum FROM asha_schema_migrations ORDER BY id")).rows;
    for (const entry of prior) {
      if (!migrations.some((migration) => migration.id === entry.id && migration.checksum === entry.checksum)) {
        throw new Error(`Applied migration checksum/version mismatch: ${entry.id}`);
      }
    }
    const applied: string[] = [];
    for (const migration of migrations) {
      if (prior.some((entry) => entry.id === migration.id)) continue;
      if (prior.some((entry) => entry.id > migration.id)) throw new Error("Out-of-order migration refused");
      await client.query(migration.sql);
      await client.query("INSERT INTO asha_schema_migrations (id, checksum) VALUES ($1, $2)", [migration.id, migration.checksum]);
      applied.push(migration.id);
    }
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Keep the primary failure. */ }
    throw error;
  }
}
