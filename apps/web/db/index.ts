import { PostgresObservationRepository, type TransactionRunner } from "../data/postgres-observation-repository.ts";

export {
  createPgTransactionRunner,
  inspectOperatorDatabaseEnvironment,
  resolveOperatorObservationRepository,
} from "./postgres-runtime.ts";

export function createObservationRepository(runner: TransactionRunner) {
  return new PostgresObservationRepository(runner);
}
