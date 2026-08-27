import { CsvStructureError, ingestManualCsv } from "../../../../data/csv-ingestion.ts";
import { PHASE1_MANUAL_SOURCE_ID, phase1ContractRegistry } from "../../../../data/phase1-registry.ts";
import type { IngestionBatch } from "../../../../data/contracts.ts";
import type { PostgresObservationRepository } from "../../../../data/postgres-observation-repository.ts";
import {
  resolveOperatorObservationRepository,
  type OperatorRepositoryResolution,
} from "../../../../db/postgres-runtime.ts";

const MAX_REQUEST_BYTES = 1_048_576;
const MAX_CSV_CHARACTERS = 524_288;
const FILE_NAME_PATTERN = /^[\p{L}\p{N}_. -]{1,120}\.csv$/u;

type OperatorRequest = {
  action?: unknown;
  fileName?: unknown;
  sourceId?: unknown;
  text?: unknown;
};

type ResolveRepository = () => OperatorRepositoryResolution;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function localBoundaryError(request: Request) {
  const requestUrl = new URL(request.url);
  if (!isLoopbackHost(requestUrl.hostname)) return "operator ingestion is available on loopback only";

  const origin = request.headers.get("origin");
  if (!origin) return "a same-origin request is required";
  try {
    if (new URL(origin).origin !== requestUrl.origin) return "cross-origin operator requests are rejected";
  } catch {
    return "request origin is invalid";
  }

  if (request.headers.get("sec-fetch-site") !== "same-origin") return "same-origin browser context is required";
  const intent = request.headers.get("x-asha-operator-request");
  if (intent !== "preview" && intent !== "commit") return "operator intent header is missing or invalid";
  return null;
}

function validatePayload(payload: OperatorRequest) {
  if (payload.action !== "preview" && payload.action !== "commit") return "action must be preview or commit";
  if (payload.sourceId !== PHASE1_MANUAL_SOURCE_ID) return "source is not approved for the Phase 1 local operator";
  if (typeof payload.fileName !== "string" || !FILE_NAME_PATTERN.test(payload.fileName) || /[\\/]/.test(payload.fileName)) {
    return "fileName must be a plain .csv name with at most 120 characters";
  }
  if (typeof payload.text !== "string" || payload.text.length === 0) return "CSV text is required";
  if (payload.text.length > MAX_CSV_CHARACTERS) return "CSV text exceeds the local preview limit";
  return null;
}

function batchCounts(batch: IngestionBatch) {
  return {
    accepted: batch.accepted.length,
    duplicates: batch.duplicates.length,
    quarantined: batch.quarantined.length,
    total: batch.accepted.length + batch.duplicates.length + batch.quarantined.length,
  };
}

function safeResolveRepository(resolveRepository: ResolveRepository): OperatorRepositoryResolution {
  try {
    return resolveRepository();
  } catch {
    return { available: false, reason: "PostgreSQL runtime could not be initialized" };
  }
}

function previewResponse(batch: IngestionBatch, persistence: OperatorRepositoryResolution) {
  return {
    ok: true,
    mode: "preview",
    batchId: batch.id,
    schemaVersion: batch.schemaVersion,
    sourceId: batch.sourceId,
    fileName: batch.fileName,
    counts: batchCounts(batch),
    accepted: batch.accepted.map((observation) => ({
      instrumentCode: observation.instrumentCode,
      value: observation.value,
      currency: observation.currency,
      unit: observation.unit,
      observedAt: observation.observedAt,
    })),
    duplicates: batch.duplicates.map((duplicate) => ({ rowNumber: duplicate.rowNumber })),
    quarantined: batch.quarantined.map((record) => ({
      rowNumber: record.rowNumber,
      issues: record.issues.map((issue) => ({ code: issue.code, field: issue.field, message: issue.message })),
    })),
    persistence: persistence.available
      ? { available: true, reason: null }
      : { available: false, reason: persistence.reason },
  };
}

export function createOperatorCsvPost(
  resolveRepository: ResolveRepository = resolveOperatorObservationRepository,
) {
  return async function post(request: Request) {
    const boundaryError = localBoundaryError(request);
    if (boundaryError) return json({ ok: false, code: "operator_boundary", message: boundaryError }, 403);

    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return json({ ok: false, code: "unsupported_media_type", message: "application/json is required" }, 415);
    }

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return json({ ok: false, code: "request_too_large", message: "request exceeds the one-megabyte limit" }, 413);
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json({ ok: false, code: "request_too_large", message: "request exceeds the one-megabyte limit" }, 413);
    }

    let payload: OperatorRequest;
    try {
      payload = JSON.parse(rawBody) as OperatorRequest;
    } catch {
      return json({ ok: false, code: "invalid_json", message: "request body is not valid JSON" }, 400);
    }

    const payloadError = validatePayload(payload);
    if (payloadError) return json({ ok: false, code: "invalid_request", message: payloadError }, 400);

    const action = payload.action as "preview" | "commit";
    if (request.headers.get("x-asha-operator-request") !== action) {
      return json({ ok: false, code: "operator_intent_mismatch", message: "operator intent does not match the requested action" }, 403);
    }

    let batch: IngestionBatch;
    try {
      batch = await ingestManualCsv({
        text: payload.text as string,
        fileName: payload.fileName as string,
        sourceId: PHASE1_MANUAL_SOURCE_ID,
        registry: phase1ContractRegistry,
      });
    } catch (error) {
      if (error instanceof CsvStructureError) {
        return json({ ok: false, code: "invalid_csv_structure", message: error.message }, 422);
      }
      return json({ ok: false, code: "validation_failed", message: "CSV validation failed safely" }, 500);
    }

    const persistence = safeResolveRepository(resolveRepository);
    if (action === "preview") return json(previewResponse(batch, persistence));
    if (!persistence.available) {
      return json({
        ok: false,
        code: "database_not_configured",
        message: "PostgreSQL is not ready; no records were persisted",
      }, 503);
    }

    try {
      const result = await (persistence.repository as PostgresObservationRepository).persistBatch(batch);
      return json({
        ok: true,
        mode: "commit",
        batchId: batch.id,
        schemaVersion: batch.schemaVersion,
        sourceId: batch.sourceId,
        fileName: batch.fileName,
        counts: batchCounts(batch),
        persistence: { available: true, result },
      });
    } catch {
      return json({
        ok: false,
        code: "database_unavailable",
        message: "PostgreSQL transaction failed; the batch was not committed",
      }, 503);
    }
  };
}

export const POST = createOperatorCsvPost();
