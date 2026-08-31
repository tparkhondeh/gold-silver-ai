import { Pool } from "pg";

import {
  PostgresObservationRepository,
  type QueryResult,
  type SqlExecutor,
  type TransactionRunner,
} from "../data/postgres-observation-repository.ts";
import { PostgresPortfolioRepository } from "../data/postgres-portfolio-repository.ts";

type RuntimeEnvironment = Record<string, string | undefined>;

type PoolClientLike = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, parameters?: unknown[]): Promise<{ rowCount: number | null; rows: Row[] }>;
  release(): void;
};

type PoolLike = {
  connect(): Promise<PoolClientLike>;
};

export type OperatorRepositoryResolution =
  | { available: false; reason: string }
  | { available: true; repository: PostgresObservationRepository };

export type OperatorDatabaseConfiguration =
  | { available: false; reason: string }
  | { available: true; connectionString: string };

const LOOPBACK_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

let runtimePool: Pool | null = null;
let runtimeConnectionString: string | null = null;

export function inspectOperatorDatabaseEnvironment(
  environment: RuntimeEnvironment = process.env,
): OperatorDatabaseConfiguration {
  if (environment.ASHA_OPERATOR_COMMIT_ENABLED !== "true") {
    return { available: false, reason: "operator database commit is not explicitly enabled" };
  }

  const connectionString = environment.DATABASE_URL?.trim();
  if (!connectionString) {
    return { available: false, reason: "DATABASE_URL is not configured" };
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    return { available: false, reason: "DATABASE_URL is invalid" };
  }

  if (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:") {
    return { available: false, reason: "DATABASE_URL must use PostgreSQL" };
  }
  if (!LOOPBACK_DATABASE_HOSTS.has(databaseUrl.hostname.toLowerCase())) {
    return { available: false, reason: "Phase 1 operator database must be loopback-only" };
  }
  // pg-connection-string lets query parameters override host and other options.
  // Validate the complete supported contract, not only URL.hostname.
  if (databaseUrl.search || databaseUrl.hash) {
    return { available: false, reason: "PostgreSQL URL options and fragments are not permitted" };
  }

  return { available: true, connectionString };
}

export function createPgTransactionRunner(pool: PoolLike): TransactionRunner {
  return {
    async transaction<T>(work: (executor: SqlExecutor) => Promise<T>) {
      const client = await pool.connect();
      const executor: SqlExecutor = {
        async query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, parameters: readonly unknown[] = []): Promise<QueryResult<Row>> {
          const result = await client.query(sql, [...parameters]);
          return { rowCount: result.rowCount ?? 0, rows: result.rows as Row[] };
        },
      };

      try {
        await client.query("BEGIN");
        const result = await work(executor);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original transaction error; the route reports a safe failure.
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

function getRuntimePool(connectionString: string) {
  if (runtimePool && runtimeConnectionString === connectionString) return runtimePool;
  if (runtimePool) throw new Error("operator database configuration changed during runtime");

  runtimeConnectionString = connectionString;
  runtimePool = new Pool({
    connectionString,
    max: 4,
    // Cloudflare's local request runtime cannot safely reuse a TCP client created
    // in a previous request context. Retire it after release to avoid alternating
    // healthy/failed probes while preserving transaction reuse within one request.
    maxUses: 1,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 10_000,
    query_timeout: 3_000,
    allowExitOnIdle: true,
  });
  runtimePool.on("error", () => {
    // pg removes failed idle clients; health probes report a sanitized failure.
  });
  return runtimePool;
}

export type DatabaseProbe = {
  query(sql: string): Promise<{ rows: Array<{ migrated: boolean; least_privilege: boolean }> }>;
};

export async function probeObservationDatabase(pool: DatabaseProbe) {
  try {
    const result = await pool.query(`SELECT
      to_regclass('public.observations') IS NOT NULL
        AND to_regclass('public.validation_results') IS NOT NULL
        AND to_regclass('public.source_contract_versions') IS NOT NULL
        AND to_regclass('public.asha_schema_migrations') IS NOT NULL AS migrated,
      NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls
        AND NOT has_schema_privilege(current_user, 'public', 'CREATE') AS least_privilege
      FROM pg_roles WHERE rolname = current_user`);
    if (result.rows[0]?.migrated !== true) return { state: "blocked", reason: "database_schema_missing" } as const;
    if (result.rows[0]?.least_privilege !== true) return { state: "blocked", reason: "database_role_too_privileged" } as const;
    return { state: "connected", reason: "database_connected_schema_present" } as const;
  } catch {
    return { state: "blocked", reason: "database_unreachable_or_probe_failed" } as const;
  }
}

export async function inspectObservationDatabaseHealth(environment: RuntimeEnvironment = process.env) {
  const configuration = inspectOperatorDatabaseEnvironment(environment);
  if (!configuration.available) return { state: "blocked", reason: configuration.reason } as const;
  try {
    return await probeObservationDatabase(getRuntimePool(configuration.connectionString));
  } catch {
    return { state: "blocked", reason: "database_unreachable_or_probe_failed" } as const;
  }
}

export async function resolveOperatorObservationRepository(
  environment: RuntimeEnvironment = process.env,
): Promise<OperatorRepositoryResolution> {
  const configuration = inspectOperatorDatabaseEnvironment(environment);
  if (!configuration.available) return configuration;
  const health = await inspectObservationDatabaseHealth(environment);
  if (health.state !== "connected") return { available: false, reason: health.reason };
  const runner = createPgTransactionRunner(getRuntimePool(configuration.connectionString));
  return { available: true, repository: new PostgresObservationRepository(runner) };
}

export async function inspectLocalPortfolioDatabaseHealth(environment: RuntimeEnvironment = process.env) {
  if (environment.ASHA_LOCAL_PORTFOLIO_ENABLED !== "true") {
    return { state: "blocked", reason: "local_portfolio_not_enabled" } as const;
  }
  const configuration = inspectOperatorDatabaseEnvironment(environment);
  if (!configuration.available) return { state: "blocked", reason: configuration.reason } as const;
  try {
    const result = await getRuntimePool(configuration.connectionString).query<{ ready: boolean }>(`SELECT
      count(*) = 3
      AND bool_and(c.relrowsecurity AND c.relforcerowsecurity)
      AND bool_and(has_table_privilege(current_user, c.oid, 'SELECT,INSERT,UPDATE,DELETE')) AS ready
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('user_portfolios', 'portfolio_holdings', 'portfolio_preferences')`);
    return result.rows[0]?.ready === true
      ? { state: "local_ready", reason: "local_portfolio_database_ready" } as const
      : { state: "blocked", reason: "local_portfolio_schema_or_policy_missing" } as const;
  } catch {
    return { state: "blocked", reason: "database_unreachable_or_probe_failed" } as const;
  }
}

export async function inspectProvenanceDatabaseHealth(environment: RuntimeEnvironment = process.env) {
  const configuration = inspectOperatorDatabaseEnvironment(environment);
  if (!configuration.available) return { state: "blocked", reason: configuration.reason } as const;
  try {
    const result = await getRuntimePool(configuration.connectionString).query<{ ready: boolean }>(`SELECT
      count(*) = 8
      AND bool_and(has_table_privilege(current_user, c.oid, 'SELECT'))
      AND bool_and(NOT has_table_privilege(current_user, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')) AS ready
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN
        ('source_contract_versions','artifact_versions','dataset_observations','decision_records','decision_assumptions','decision_features','source_reconciliations','source_reconciliation_candidates')`);
    return result.rows[0]?.ready === true
      ? { state: "registry_ready", reason: "provenance_registry_ready_read_only" } as const
      : { state: "blocked", reason: "provenance_registry_or_privileges_missing" } as const;
  } catch {
    return { state: "blocked", reason: "database_unreachable_or_probe_failed" } as const;
  }
}

export async function resolveLocalPortfolioRepository(environment: RuntimeEnvironment = process.env) {
  const configuration = inspectOperatorDatabaseEnvironment(environment);
  if (!configuration.available) return { available: false as const, reason: configuration.reason };
  const health = await inspectLocalPortfolioDatabaseHealth(environment);
  if (health.state !== "local_ready") return { available: false as const, reason: health.reason };
  return {
    available: true as const,
    repository: new PostgresPortfolioRepository(createPgTransactionRunner(getRuntimePool(configuration.connectionString))),
  };
}
