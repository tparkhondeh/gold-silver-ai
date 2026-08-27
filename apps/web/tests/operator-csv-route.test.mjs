import assert from "node:assert/strict";
import test from "node:test";

import { POST, createOperatorCsvPost } from "../app/api/operator/csv/route.ts";
import { PHASE1_MANUAL_SOURCE_ID, phase1Instruments } from "../data/phase1-registry.ts";

const headers = "instrument_code,source_id,value,currency,unit,observed_at,published_at,collected_at,effective_from,effective_to,correction_of";
const validRow = "GOLD_18K_IRR,owner-local-csv,100,IRR,gram,2026-08-25T10:00:00.000Z,,2026-08-25T10:01:00.000Z,2026-08-25T10:00:00.000Z,,";
const invalidRow = "GOLD_18K_IRR,owner-local-csv,100,TOMAN,gram,2026-08-25T10:00:00.000Z,,2026-08-25T10:01:00.000Z,2026-08-25T10:00:00.000Z,,";

function operatorRequest(payload, url = "http://localhost/api/operator/csv", intent = payload.action ?? "preview") {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "http://localhost",
      "sec-fetch-site": "same-origin",
      "x-asha-operator-request": intent,
    },
    body: JSON.stringify(payload),
  });
}

test("Phase 1 local registry exposes only the owner-approved instrument slice", () => {
  assert.deepEqual(phase1Instruments.map((instrument) => instrument.code), [
    "GOLD_18K_IRR",
    "MESGHAL_IRR",
    "EMAMI_COIN_IRR",
    "SILVER_999_IRR",
    "USD_IRR",
    "XAU_USD",
  ]);
});

test("local operator preview reports accepted, duplicate, and quarantined rows without persistence", async () => {
  const response = await POST(operatorRequest({
    action: "preview",
    fileName: "synthetic-contract-test.csv",
    sourceId: PHASE1_MANUAL_SOURCE_ID,
    text: `${headers}\n${validRow}\n${validRow}\n${invalidRow}\n`,
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { accepted: 1, duplicates: 1, quarantined: 1, total: 3 });
  assert.equal(result.quarantined[0].issues[0].code, "currency_mismatch");
  assert.equal(result.persistence.available, false);
  assert.equal("rawPayload" in result.quarantined[0], false);
});

test("operator endpoint rejects non-loopback and cross-origin requests", async () => {
  const request = operatorRequest({ action: "preview", fileName: "test.csv", sourceId: PHASE1_MANUAL_SOURCE_ID, text: headers }, "https://example.com/api/operator/csv");
  const response = await POST(request);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "operator_boundary");
});

test("operator commit fails closed while PostgreSQL is unavailable", async () => {
  const post = createOperatorCsvPost(() => ({ available: false, reason: "test database is unavailable" }));
  const response = await post(operatorRequest({
    action: "commit",
    fileName: "synthetic-contract-test.csv",
    sourceId: PHASE1_MANUAL_SOURCE_ID,
    text: `${headers}\n${validRow}\n`,
  }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "database_not_configured");
});

test("operator commit persists the validated batch through the configured repository", async () => {
  let persistedBatch = null;
  const repository = {
    async persistBatch(batch) {
      persistedBatch = batch;
      return {
        alreadyProcessed: false,
        insertedObservations: batch.accepted.length,
        duplicateObservations: batch.duplicates.length,
        insertedQuarantineRecords: batch.quarantined.length,
      };
    },
  };
  const post = createOperatorCsvPost(() => ({ available: true, repository }));
  const response = await post(operatorRequest({
    action: "commit",
    fileName: "synthetic-contract-test.csv",
    sourceId: PHASE1_MANUAL_SOURCE_ID,
    text: `${headers}\n${validRow}\n${invalidRow}\n`,
  }));

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.mode, "commit");
  assert.deepEqual(result.persistence.result, {
    alreadyProcessed: false,
    insertedObservations: 1,
    duplicateObservations: 0,
    insertedQuarantineRecords: 1,
  });
  assert.equal(persistedBatch.accepted.length, 1);
  assert.equal(persistedBatch.quarantined.length, 1);
});

test("operator rejects a commit body paired with a preview intent header", async () => {
  const response = await POST(operatorRequest({
    action: "commit",
    fileName: "synthetic-contract-test.csv",
    sourceId: PHASE1_MANUAL_SOURCE_ID,
    text: `${headers}\n${validRow}\n`,
  }, "http://localhost/api/operator/csv", "preview"));

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "operator_intent_mismatch");
});
