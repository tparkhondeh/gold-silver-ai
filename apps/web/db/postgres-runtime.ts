import { Pool } from "pg";

import {
  PostgresObservationRepository,
  type QueryResult,
  type SqlExecutor,
  type TransactionRunner,
} from "../data/postgres-observation-repository.ts";

type RuntimeEnvironment = Record<string, string | undefined>;

type PoolClientLike = {
  query(sql: string, parameters?: unknown[]): Promise<{ rowCount: number | null }>;
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

  return { available: true, connectionString };
}

export function createPgTransactionRunner(pool: PoolLike): TransactionRunner {
  return {
    async transaction<T>(work: (executor: SqlExecutor) => Promise<T>) {
      const client = await pool.connect();
      const executor: SqlExecutor = {
        async query(sql: string, parameters: readonly unknown[] = []): Promise<QueryResult> {
          const result = await client.query(sql, [...parameters]);
          return { rowCount: result.rowCount ?? 0 };
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
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  return runtimePool;
}

export function resolveOperatorObservationRepository(
  environment: RuntimeEnvironment = process.env,
): OperatorRepositoryResolution {
  const configuration = inspectOperatorDatabaseEnvironment(environment);
  if (!configuration.available) return configuration;

  const runner = createPgTransactionRunner(getRuntimePool(configuration.connectionString));
  return { available: true, repository: new PostgresObservationRepository(runner) };
}
