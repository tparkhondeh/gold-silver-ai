import {
  DATA_CONTRACT_VERSION,
  type ContractRegistry,
  type Currency,
  type ObservationUnit,
  type RawObservationInput,
  type ValidatedObservation,
  type ValidationIssue,
} from "./contracts.ts";

const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DECIMAL_PATTERN = /^\+?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const FUTURE_TOLERANCE_MS = 5 * 60_000;

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function canonicalDecimal(value: string) {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) return null;
  const unsigned = trimmed.replace(/^\+/, "");
  const [wholePart, fractionalPart = ""] = unsigned.split(".");
  const whole = wholePart.replace(/^0+(?=\d)/, "");
  const fractional = fractionalPart.replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole;
}

function isPositiveDecimal(value: string) {
  return value.replace(/[.0]/g, "").length > 0;
}

function canonicalUtc(value: string | null, field: string, issues: ValidationIssue[]) {
  if (value === null) return null;
  if (!UTC_ISO_PATTERN.test(value) || !Number.isFinite(new Date(value).getTime())) {
    issues.push({ code: "invalid_utc_timestamp", field, message: `${field} must be an ISO-8601 UTC timestamp` });
    return null;
  }
  const canonical = new Date(value).toISOString();
  const expected = value.includes(".") ? value : value.replace(/Z$/, ".000Z");
  if (canonical !== expected) {
    issues.push({ code: "invalid_utc_timestamp", field, message: `${field} must identify a real calendar date` });
    return null;
  }
  return canonical;
}

function pushFutureIssue(field: string, value: string | null, nowMs: number, issues: ValidationIssue[]) {
  if (value !== null && new Date(value).getTime() > nowMs + FUTURE_TOLERANCE_MS) {
    issues.push({ code: "future_timestamp", field, message: `${field} exceeds the five-minute future tolerance` });
  }
}

export async function validateObservation(
  input: RawObservationInput,
  registry: ContractRegistry,
  now = new Date(),
): Promise<{ observation: ValidatedObservation | null; issues: ValidationIssue[] }> {
  const issues: ValidationIssue[] = [];
  const instrument = registry.instruments.get(input.instrumentCode);
  const source = registry.sources.get(input.sourceId);

  if (!instrument) issues.push({ code: "unknown_instrument", field: "instrumentCode", message: "instrument is not present in the versioned registry" });
  if (!source) issues.push({ code: "unknown_source", field: "sourceId", message: "source is not present in the versioned registry" });
  if (source && !source.active) issues.push({ code: "inactive_source", field: "sourceId", message: "source contract is inactive" });

  const value = canonicalDecimal(input.value);
  if (value === null) issues.push({ code: "invalid_decimal", field: "value", message: "value must be an unsigned base-10 decimal string" });
  else if (!isPositiveDecimal(value)) issues.push({ code: "non_positive_value", field: "value", message: "value must be greater than zero" });
  if (value !== null) {
    const [whole, fraction = ""] = value.split(".");
    if (whole.length > 26 || fraction.length > 12) {
      issues.push({ code: "decimal_precision_exceeded", field: "value", message: "value must fit numeric(38,12) exactly without rounding" });
    }
  }

  if (instrument && input.currency !== instrument.canonicalCurrency) {
    issues.push({ code: "currency_mismatch", field: "currency", message: `expected ${instrument.canonicalCurrency}` });
  }
  if (instrument && input.unit !== instrument.canonicalUnit) {
    issues.push({ code: "unit_mismatch", field: "unit", message: `expected ${instrument.canonicalUnit}` });
  }

  const observedAt = canonicalUtc(input.observedAt, "observedAt", issues);
  const publishedAt = canonicalUtc(input.publishedAt, "publishedAt", issues);
  const collectedAt = canonicalUtc(input.collectedAt, "collectedAt", issues);
  const effectiveFrom = canonicalUtc(input.effectiveFrom, "effectiveFrom", issues);
  const effectiveTo = canonicalUtc(input.effectiveTo, "effectiveTo", issues);
  const nowMs = now.getTime();

  pushFutureIssue("observedAt", observedAt, nowMs, issues);
  pushFutureIssue("publishedAt", publishedAt, nowMs, issues);
  pushFutureIssue("collectedAt", collectedAt, nowMs, issues);
  pushFutureIssue("effectiveFrom", effectiveFrom, nowMs, issues);

  if (observedAt && collectedAt && new Date(observedAt).getTime() > new Date(collectedAt).getTime() + FUTURE_TOLERANCE_MS) {
    issues.push({ code: "timestamp_order", field: "observedAt", message: "observedAt cannot be materially later than collectedAt" });
  }
  if (publishedAt && collectedAt && new Date(publishedAt).getTime() > new Date(collectedAt).getTime() + FUTURE_TOLERANCE_MS) {
    issues.push({ code: "timestamp_order", field: "publishedAt", message: "publishedAt cannot be materially later than collectedAt" });
  }
  if (effectiveFrom && effectiveTo && new Date(effectiveFrom).getTime() > new Date(effectiveTo).getTime()) {
    issues.push({ code: "timestamp_order", field: "effectiveTo", message: "effectiveTo must be later than effectiveFrom" });
  }
  if (input.correctionOf !== null && !/^obs_[a-f0-9]{64}$/.test(input.correctionOf)) {
    issues.push({ code: "invalid_correction_reference", field: "correctionOf", message: "correctionOf must reference an immutable observation id" });
  }
  const correctionReason = input.correctionReason?.trim() || null;
  if ((input.correctionOf === null && correctionReason !== null)
    || (input.correctionOf !== null && (correctionReason === null || correctionReason.length < 3 || correctionReason.length > 500))) {
    issues.push({ code: "invalid_correction_reason", field: "correctionReason", message: "a correction requires a 3-500 character reason, and non-corrections cannot carry one" });
  }

  if (!instrument || !source || value === null || !observedAt || !collectedAt || !effectiveFrom || issues.length > 0) {
    return { observation: null, issues };
  }

  const identity = [
    DATA_CONTRACT_VERSION,
    input.sourceId,
    input.instrumentCode,
    value,
    input.currency,
    input.unit,
    observedAt,
    publishedAt ?? "",
    // Preserve original v1 IDs; corrections get a distinct, replayable revision ID.
    ...(input.correctionOf ? ["correction-v3", input.correctionOf, correctionReason, effectiveFrom, effectiveTo ?? ""] : []),
  ].join("|");
  const payloadHash = await sha256Hex(stableJson(input.rawPayload));
  const idempotencyKey = await sha256Hex(identity);

  return {
    issues,
    observation: {
      schemaVersion: DATA_CONTRACT_VERSION,
      id: `obs_${idempotencyKey}`,
      idempotencyKey,
      payloadHash,
      instrumentCode: input.instrumentCode,
      sourceId: input.sourceId,
      sourceContractVersion: source.schemaVersion,
      value,
      currency: input.currency as Currency,
      unit: input.unit as ObservationUnit,
      observedAt,
      publishedAt,
      collectedAt,
      effectiveFrom,
      effectiveTo,
      correctionOf: input.correctionOf,
      correctionReason,
      rawPayload: input.rawPayload,
    },
  };
}
