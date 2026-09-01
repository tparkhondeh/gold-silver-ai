import { basename, join, relative, resolve, sep } from "node:path";

export const localBackupTables = [
  "asha_schema_migrations",
  "instruments",
  "sources",
  "source_contract_versions",
  "ingestion_batches",
  "observations",
  "quarantine_records",
  "validation_results",
  "quarantine_resolutions",
  "user_portfolios",
  "portfolio_holdings",
  "portfolio_preferences",
  "artifact_versions",
  "dataset_observations",
  "decision_records",
  "decision_assumptions",
  "decision_features",
  "source_reconciliations",
  "source_reconciliation_candidates",
  "portfolio_transaction_events",
  "portfolio_valuation_snapshots",
  "portfolio_valuation_positions",
  "portfolio_valuation_transactions",
  "provider_request_reservations",
  "provider_runtime_status",
] as const;

function assertInside(parent: string, child: string) {
  const result = relative(resolve(parent), resolve(child));
  if (!result || result === ".." || result.startsWith(`..${sep}`) || resolve(result) === result) {
    throw new Error("Backup path must stay inside the protected local directory");
  }
}

export function createLocalBackupPlan(privateRoot: string, now: Date, nonce: string) {
  if (!Number.isFinite(now.getTime())) throw new Error("Backup timestamp is invalid");
  if (!/^[a-f0-9]{8}$/.test(nonce)) throw new Error("Backup nonce is invalid");
  const backupRoot = resolve(privateRoot, "backups");
  const timestamp = now.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
  const stem = `asha-local-${timestamp}-${nonce}`;
  const backupPath = join(backupRoot, `${stem}.dump`);
  const manifestPath = join(backupRoot, `${stem}.json`);
  const temporaryBackupPath = `${backupPath}.tmp`;
  const temporaryManifestPath = `${manifestPath}.tmp`;
  for (const path of [backupPath, manifestPath, temporaryBackupPath, temporaryManifestPath]) assertInside(backupRoot, path);
  return {
    backupRoot,
    backupPath,
    manifestPath,
    temporaryBackupPath,
    temporaryManifestPath,
    backupFile: basename(backupPath),
    manifestFile: basename(manifestPath),
    verificationDatabase: `asha_backup_verify_${nonce}`,
  };
}

export function quoteVerificationDatabase(value: string) {
  if (!/^asha_backup_verify_[a-f0-9]{8}$/.test(value)) throw new Error("Verification database name is invalid");
  return `"${value}"`;
}
