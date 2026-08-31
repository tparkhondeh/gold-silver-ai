import { PostgresObservationRepository, type TransactionRunner } from "../data/postgres-observation-repository.ts";

export {
  createPgTransactionRunner,
  inspectOperatorDatabaseEnvironment,
  inspectNavasanQuotaDatabaseHealth,
  resolveOperatorObservationRepository,
  resolveNavasanQuotaLedger,
  resolveLocalPortfolioRepository,
} from "./postgres-runtime.ts";

export function createObservationRepository(runner: TransactionRunner) {
  return new PostgresObservationRepository(runner);
}
