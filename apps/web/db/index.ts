import { PostgresObservationRepository, type TransactionRunner } from "../data/postgres-observation-repository.ts";

export function createObservationRepository(runner: TransactionRunner) {
  return new PostgresObservationRepository(runner);
}
