import {
  DATA_CONTRACT_VERSION,
  type ContractRegistry,
  type IngestionBatch,
  type QuarantineRecord,
  type RawObservationInput,
  type ValidationIssue,
} from "./contracts.ts";
import { sha256Hex, validateObservation } from "./validation.ts";

const CSV_HEADERS = [
  "instrument_code",
  "source_id",
  "value",
  "currency",
  "unit",
  "observed_at",
  "published_at",
  "collected_at",
  "effective_from",
  "effective_to",
  "correction_of",
  "correction_reason",
] as const;
const REQUIRED_CSV_HEADERS = CSV_HEADERS.filter((name) => name !== "correction_reason");

const SENSITIVE_KEY = /(authorization|password|secret|token|api[_-]?key)/i;

export class CsvStructureError extends Error {}

export function sanitizeRawPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeRawPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeRawPayload(child)]));
  }
  return value;
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }

  if (quoted) throw new CsvStructureError("CSV contains an unterminated quoted field");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((values) => values.some((value) => value.trim().length > 0));
}

function requiredHeaderIndexes(header: string[]) {
  const duplicates = header.filter((value, index) => header.indexOf(value) !== index);
  if (duplicates.length) throw new CsvStructureError(`CSV contains duplicate headers: ${[...new Set(duplicates)].join(", ")}`);
  const missing = REQUIRED_CSV_HEADERS.filter((required) => !header.includes(required));
  if (missing.length) throw new CsvStructureError(`CSV is missing required headers: ${missing.join(", ")}`);
  return Object.fromEntries(CSV_HEADERS.map((name) => [name, header.indexOf(name)])) as Record<(typeof CSV_HEADERS)[number], number>;
}

function cell(row: string[], index: number) {
  return row[index]?.trim() ?? "";
}

function rawInputFromRow(row: string[], indexes: ReturnType<typeof requiredHeaderIndexes>): RawObservationInput {
  const payload = Object.fromEntries(CSV_HEADERS.map((name) => [name, cell(row, indexes[name])]));
  return {
    instrumentCode: payload.instrument_code,
    sourceId: payload.source_id,
    value: payload.value,
    currency: payload.currency,
    unit: payload.unit,
    observedAt: payload.observed_at,
    publishedAt: payload.published_at || null,
    collectedAt: payload.collected_at,
    effectiveFrom: payload.effective_from,
    effectiveTo: payload.effective_to || null,
    correctionOf: payload.correction_of || null,
    correctionReason: payload.correction_reason || null,
    rawPayload: sanitizeRawPayload(payload) as Record<string, unknown>,
  };
}

export async function ingestManualCsv(options: {
  text: string;
  fileName: string;
  sourceId: string;
  registry: ContractRegistry;
  now?: Date;
}): Promise<IngestionBatch> {
  const rows = parseCsv(options.text);
  if (rows.length === 0) throw new CsvStructureError("CSV is empty");
  const header = rows[0].map((value) => value.trim().toLowerCase());
  const indexes = requiredHeaderIndexes(header);
  const now = options.now ?? new Date();
  const batchHash = await sha256Hex([DATA_CONTRACT_VERSION, options.sourceId, options.fileName, options.text].join("|"));
  const batchId = `batch_${batchHash}`;
  const accepted: IngestionBatch["accepted"] = [];
  const quarantined: QuarantineRecord[] = [];
  const duplicates: IngestionBatch["duplicates"] = [];
  const seen = new Set<string>();

  for (let index = 1; index < rows.length; index += 1) {
    const rowNumber = index + 1;
    const raw = rawInputFromRow(rows[index], indexes);
    const result = await validateObservation(raw, options.registry, now);
    const issues: ValidationIssue[] = [...result.issues];
    if (raw.sourceId !== options.sourceId) {
      issues.push({ code: "source_mismatch", field: "sourceId", message: "row source does not match the ingestion batch source" });
    }

    if (!result.observation || issues.length > 0) {
      const quarantineHash = await sha256Hex(`${batchId}|${rowNumber}|${JSON.stringify(raw.rawPayload)}`);
      quarantined.push({
        schemaVersion: DATA_CONTRACT_VERSION,
        id: `quarantine_${quarantineHash}`,
        batchId,
        rowNumber,
        receivedAt: now.toISOString(),
        rawPayload: raw.rawPayload,
        issues,
      });
      continue;
    }

    if (seen.has(result.observation.idempotencyKey)) {
      duplicates.push({ rowNumber, idempotencyKey: result.observation.idempotencyKey });
      continue;
    }
    seen.add(result.observation.idempotencyKey);
    // CSV-reported collection time remains in rawPayload, never as system receipt.
    accepted.push({ ...result.observation, collectedAt: now.toISOString() });
  }

  return {
    schemaVersion: DATA_CONTRACT_VERSION,
    id: batchId,
    sourceId: options.sourceId,
    fileName: options.fileName,
    collectedAt: now.toISOString(),
    accepted,
    quarantined,
    duplicates,
  };
}

export const manualCsvHeaders = [...CSV_HEADERS];
