export const DATA_CONTRACT_VERSION = 1 as const;

export type Currency = "IRR" | "TOMAN" | "USD";
export type ObservationUnit = "gram" | "mesghal" | "unit" | "usd" | "troy_ounce";
export type SourceQuality = "primary" | "cross_check" | "informational" | "manual_snapshot" | "test_only";

export type InstrumentContract = {
  schemaVersion: typeof DATA_CONTRACT_VERSION;
  code: string;
  displayName: string;
  assetClass: "gold" | "silver" | "currency" | "reference" | "test";
  canonicalCurrency: Currency;
  canonicalUnit: ObservationUnit;
  activeFrom: string;
  retiredAt: string | null;
};

export type SourceContract = {
  schemaVersion: typeof DATA_CONTRACT_VERSION;
  id: string;
  displayName: string;
  quality: SourceQuality;
  accessMode: "keyed_api" | "licensed_file" | "manual_csv" | "manual_snapshot" | "test";
  active: boolean;
};

export type RawObservationInput = {
  instrumentCode: string;
  sourceId: string;
  value: string;
  currency: string;
  unit: string;
  observedAt: string;
  publishedAt: string | null;
  collectedAt: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  correctionOf: string | null;
  rawPayload: Record<string, unknown>;
};

export type ValidationIssueCode =
  | "unknown_instrument"
  | "unknown_source"
  | "inactive_source"
  | "source_mismatch"
  | "invalid_decimal"
  | "decimal_precision_exceeded"
  | "non_positive_value"
  | "currency_mismatch"
  | "unit_mismatch"
  | "invalid_utc_timestamp"
  | "future_timestamp"
  | "timestamp_order"
  | "invalid_correction_reference";

export type ValidationIssue = {
  code: ValidationIssueCode;
  field: string;
  message: string;
};

export type ValidatedObservation = {
  schemaVersion: typeof DATA_CONTRACT_VERSION;
  id: string;
  idempotencyKey: string;
  payloadHash: string;
  instrumentCode: string;
  sourceId: string;
  value: string;
  currency: Currency;
  unit: ObservationUnit;
  observedAt: string;
  publishedAt: string | null;
  collectedAt: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  correctionOf: string | null;
  rawPayload: Record<string, unknown>;
};

export type QuarantineRecord = {
  schemaVersion: typeof DATA_CONTRACT_VERSION;
  id: string;
  batchId: string;
  rowNumber: number;
  receivedAt: string;
  rawPayload: Record<string, unknown>;
  issues: ValidationIssue[];
};

export type DuplicateRecord = {
  rowNumber: number;
  idempotencyKey: string;
};

export type IngestionBatch = {
  schemaVersion: typeof DATA_CONTRACT_VERSION;
  id: string;
  sourceId: string;
  fileName: string;
  collectedAt: string;
  accepted: ValidatedObservation[];
  quarantined: QuarantineRecord[];
  duplicates: DuplicateRecord[];
};

export type ContractRegistry = {
  instruments: ReadonlyMap<string, InstrumentContract>;
  sources: ReadonlyMap<string, SourceContract>;
};
