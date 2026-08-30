import { Client } from "pg";
import { applyMigrations, readMigrations } from "../db/migrations.ts";
import { inspectOperatorDatabaseEnvironment } from "../db/postgres-runtime.ts";

const configuration = inspectOperatorDatabaseEnvironment({
  ASHA_OPERATOR_COMMIT_ENABLED: process.env.ASHA_MIGRATIONS_ENABLED,
  DATABASE_URL: process.env.ASHA_MIGRATION_DATABASE_URL,
});
if (!configuration.available) {
  console.error("Migration disabled: set ASHA_MIGRATIONS_ENABLED=true and a loopback ASHA_MIGRATION_DATABASE_URL securely.");
  process.exitCode = 1;
} else {
  const client = new Client({ connectionString: configuration.connectionString, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    await client.query("SET search_path TO public");
    console.log(JSON.stringify({ applied: await applyMigrations(client, await readMigrations()) }));
  } catch {
    console.error("Migration failed; no readiness claim. Check local database access and migration checksums without exposing credentials.");
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
