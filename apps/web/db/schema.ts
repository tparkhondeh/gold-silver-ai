import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const utcTimestamp = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const instruments = pgTable("instruments", {
  code: text("code").primaryKey(),
  schemaVersion: smallint("schema_version").notNull(),
  displayName: text("display_name").notNull(),
  assetClass: text("asset_class").notNull(),
  canonicalCurrency: text("canonical_currency").notNull(),
  canonicalUnit: text("canonical_unit").notNull(),
  activeFrom: utcTimestamp("active_from").notNull(),
  retiredAt: utcTimestamp("retired_at"),
});

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  schemaVersion: smallint("schema_version").notNull(),
  displayName: text("display_name").notNull(),
  quality: text("quality").notNull(),
  accessMode: text("access_mode").notNull(),
  active: boolean("active").notNull().default(true),
});

export const sourceContractVersions = pgTable("source_contract_versions", {
  sourceId: text("source_id").notNull().references(() => sources.id),
  version: smallint("version").notNull(),
  displayName: text("display_name").notNull(),
  quality: text("quality").notNull(),
  accessMode: text("access_mode").notNull(),
  active: boolean("active").notNull(),
  validFrom: utcTimestamp("valid_from"),
  validUntil: utcTimestamp("valid_until"),
  registeredAt: utcTimestamp("registered_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.sourceId, table.version] })]);

export const ingestionBatches = pgTable("ingestion_batches", {
  id: text("id").primaryKey(),
  schemaVersion: smallint("schema_version").notNull(),
  sourceId: text("source_id").notNull().references(() => sources.id),
  fileName: text("file_name").notNull(),
  collectedAt: utcTimestamp("collected_at").notNull(),
  acceptedCount: integer("accepted_count").notNull(),
  quarantinedCount: integer("quarantined_count").notNull(),
  duplicateCount: integer("duplicate_count").notNull(),
  createdAt: utcTimestamp("created_at").notNull().defaultNow(),
});

export const observations = pgTable("observations", {
  id: text("id").primaryKey(),
  schemaVersion: smallint("schema_version").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  payloadHash: text("payload_hash").notNull(),
  instrumentCode: text("instrument_code").notNull().references(() => instruments.code),
  sourceId: text("source_id").notNull().references(() => sources.id),
  sourceContractVersion: smallint("source_contract_version").notNull().default(1),
  value: numeric("value", { precision: 38, scale: 12 }).notNull(),
  currency: text("currency").notNull(),
  unit: text("unit").notNull(),
  observedAt: utcTimestamp("observed_at").notNull(),
  publishedAt: utcTimestamp("published_at"),
  collectedAt: utcTimestamp("collected_at").notNull(),
  effectiveFrom: utcTimestamp("effective_from").notNull(),
  effectiveTo: utcTimestamp("effective_to"),
  correctionOf: text("correction_of").references((): AnyPgColumn => observations.id),
  correctionReason: text("correction_reason"),
  rawPayload: jsonb("raw_payload").notNull(),
  createdAt: utcTimestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("observations_idempotency_key_idx").on(table.idempotencyKey),
  index("observations_instrument_point_in_time_idx").on(table.instrumentCode, table.observedAt, table.collectedAt),
  index("observations_source_collected_idx").on(table.sourceId, table.collectedAt),
  check("observations_value_positive", sql`${table.value} > 0`),
]);

export const quarantineRecords = pgTable("quarantine_records", {
  id: text("id").primaryKey(),
  schemaVersion: smallint("schema_version").notNull(),
  batchId: text("batch_id").notNull().references(() => ingestionBatches.id),
  rowNumber: integer("row_number").notNull(),
  receivedAt: utcTimestamp("received_at").notNull(),
  rawPayload: jsonb("raw_payload").notNull(),
  issues: jsonb("issues").notNull(),
  createdAt: utcTimestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("quarantine_batch_row_idx").on(table.batchId, table.rowNumber)]);

export const quarantineResolutions = pgTable("quarantine_resolutions", {
  id: text("id").primaryKey(),
  quarantineId: text("quarantine_id").notNull().references(() => quarantineRecords.id),
  status: text("status").notNull(),
  reason: text("reason").notNull(),
  resolvedAt: utcTimestamp("resolved_at").notNull(),
  createdAt: utcTimestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("quarantine_resolution_once_idx").on(table.quarantineId)]);

export const validationResults = pgTable("validation_results", {
  id: text("id").primaryKey(),
  schemaVersion: smallint("schema_version").notNull(),
  batchId: text("batch_id").notNull().references(() => ingestionBatches.id),
  observationId: text("observation_id").references(() => observations.id),
  quarantineId: text("quarantine_id").references(() => quarantineRecords.id),
  passed: boolean("passed").notNull(),
  issues: jsonb("issues").notNull(),
  createdAt: utcTimestamp("created_at").notNull().defaultNow(),
});

export const userPortfolios = pgTable("user_portfolios", {
  id: text("id").primaryKey(),
  schemaVersion: smallint("schema_version").notNull().default(1),
  subjectId: text("subject_id").notNull().unique(),
  version: integer("version").notNull().default(0),
  createdAt: utcTimestamp("created_at").notNull().defaultNow(),
  updatedAt: utcTimestamp("updated_at").notNull().defaultNow(),
});

export const portfolioHoldings = pgTable("portfolio_holdings", {
  id: text("id").primaryKey(),
  portfolioId: text("portfolio_id").notNull().references(() => userPortfolios.id, { onDelete: "cascade" }),
  assetName: text("asset_name").notNull(),
  amount: numeric("amount", { precision: 38, scale: 12 }).notNull(),
  unit: text("unit").notNull(),
  costToman: numeric("cost_toman", { precision: 38, scale: 2 }),
  purchaseDate: text("purchase_date"),
  note: text("note").notNull().default(""),
  createdAt: utcTimestamp("created_at").notNull().defaultNow(),
  updatedAt: utcTimestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("portfolio_holdings_portfolio_idx").on(table.portfolioId)]);

export const portfolioPreferences = pgTable("portfolio_preferences", {
  portfolioId: text("portfolio_id").primaryKey().references(() => userPortfolios.id, { onDelete: "cascade" }),
  liquidityReservePercent: numeric("liquidity_reserve_percent", { precision: 5, scale: 2 }),
  maxSingleAssetPercent: numeric("max_single_asset_percent", { precision: 5, scale: 2 }),
  maxAcceptableDrawdownPercent: numeric("max_acceptable_drawdown_percent", { precision: 5, scale: 2 }),
  shortTermMonths: smallint("short_term_months"),
  longTermYears: smallint("long_term_years"),
  analysisHorizon: text("analysis_horizon").notNull().default("short"),
  decisionHorizon: text("decision_horizon").notNull().default("short"),
  updatedAt: utcTimestamp("updated_at").notNull().defaultNow(),
});

export const artifactVersions = pgTable("artifact_versions", {
  kind: text("kind").notNull(),
  entityId: text("entity_id").notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull(),
  description: text("description").notNull(),
  content: jsonb("content").notNull(),
  contentHash: text("content_hash").notNull(),
  validFrom: utcTimestamp("valid_from"),
  validUntil: utcTimestamp("valid_until"),
  createdAt: utcTimestamp("created_at").notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.kind, table.entityId, table.version] }),
  uniqueIndex("artifact_versions_content_once_idx").on(table.kind, table.entityId, table.contentHash),
]);

export const datasetObservations = pgTable("dataset_observations", {
  datasetKind: text("dataset_kind").notNull().default("dataset"),
  datasetId: text("dataset_id").notNull(),
  datasetVersion: integer("dataset_version").notNull(),
  observationId: text("observation_id").notNull().references(() => observations.id),
  recordedAt: utcTimestamp("recorded_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.datasetId, table.datasetVersion, table.observationId] })]);

export const decisionRecords = pgTable("decision_records", {
  id: text("id").notNull(),
  version: integer("version").notNull(),
  modelKind: text("model_kind"),
  modelId: text("model_id"),
  modelVersion: integer("model_version"),
  methodologyKind: text("methodology_kind").notNull().default("methodology"),
  methodologyId: text("methodology_id").notNull(),
  methodologyVersion: integer("methodology_version").notNull(),
  datasetKind: text("dataset_kind").notNull().default("dataset"),
  datasetId: text("dataset_id").notNull(),
  datasetVersion: integer("dataset_version").notNull(),
  producedAt: utcTimestamp("produced_at").notNull(),
  riskState: text("risk_state").notNull(),
  inputHash: text("input_hash").notNull(),
  output: jsonb("output").notNull(),
  outputHash: text("output_hash").notNull(),
  status: text("status").notNull(),
  executionAllowed: boolean("execution_allowed").notNull().default(false),
  createdAt: utcTimestamp("created_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.id, table.version] })]);

export const decisionAssumptions = pgTable("decision_assumptions", {
  decisionId: text("decision_id").notNull(),
  decisionVersion: integer("decision_version").notNull(),
  assumptionKind: text("assumption_kind").notNull().default("assumption"),
  assumptionId: text("assumption_id").notNull(),
  assumptionVersion: integer("assumption_version").notNull(),
}, (table) => [primaryKey({ columns: [table.decisionId, table.decisionVersion, table.assumptionId, table.assumptionVersion] })]);

export const decisionFeatures = pgTable("decision_features", {
  decisionId: text("decision_id").notNull(),
  decisionVersion: integer("decision_version").notNull(),
  featureKind: text("feature_kind").notNull().default("feature"),
  featureId: text("feature_id").notNull(),
  featureVersion: integer("feature_version").notNull(),
}, (table) => [primaryKey({ columns: [table.decisionId, table.decisionVersion, table.featureId, table.featureVersion] })]);

export const sourceReconciliations = pgTable("source_reconciliations", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").notNull(),
  policyVersion: integer("policy_version").notNull(),
  instrumentCode: text("instrument_code").notNull().references(() => instruments.code),
  cutoffAt: utcTimestamp("cutoff_at").notNull(),
  selectedObservationId: text("selected_observation_id").notNull().references(() => observations.id),
  reasonCode: text("reason_code").notNull(),
  candidateCount: integer("candidate_count").notNull(),
  inputHash: text("input_hash").notNull(),
  createdAt: utcTimestamp("created_at").notNull().defaultNow(),
});

export const sourceReconciliationCandidates = pgTable("source_reconciliation_candidates", {
  reconciliationId: text("reconciliation_id").notNull().references(() => sourceReconciliations.id),
  observationId: text("observation_id").notNull().references(() => observations.id),
  rank: integer("rank").notNull(),
  selected: boolean("selected").notNull(),
  recordedAt: utcTimestamp("recorded_at").notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.reconciliationId, table.observationId] }),
  uniqueIndex("source_reconciliation_rank_once_idx").on(table.reconciliationId, table.rank),
]);
