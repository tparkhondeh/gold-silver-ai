import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CALIBRATION_READINESS_REFERENCE_ID,
  CALIBRATION_READINESS_REFERENCE_PATH,
  loadCalibrationReadinessReference,
  validateCalibrationReadinessReport,
} from "../app/calibration-readiness-report.ts";

const artifactUrl = new URL(
  "../public/artifacts/calibration-readiness-report.v1.json",
  import.meta.url,
);

async function reference() {
  return JSON.parse(await readFile(artifactUrl, "utf8"));
}

test("accepts the exact checked-in report with ten locked gates and 64 missing items", async () => {
  const report = await validateCalibrationReadinessReport(await reference());
  assert.equal(report.reportId, CALIBRATION_READINESS_REFERENCE_ID);
  assert.equal(report.gateReadiness.length, 10);
  assert.equal(report.gateReadiness.reduce((total, gate) => total + gate.remainingEvidenceCount, 0), 64);
  assert.equal(report.summary.realCalibrationState, "not_evaluated");
  assert.equal(report.financialUseAllowed, false);
  assert.equal(report.executionAllowed, false);
});

test("rejects text drift even when the old report identity is retained", async () => {
  const report = await reference();
  report.summary.ownerHeadlineFa = "آمادهٔ استفادهٔ واقعی";
  await assert.rejects(validateCalibrationReadinessReport(report), /اثر انگشت/);
});

test("rejects missing gates and mismatched evidence counts", async () => {
  const missingGate = await reference();
  missingGate.gateReadiness.pop();
  await assert.rejects(validateCalibrationReadinessReport(missingGate));

  const missingEvidence = await reference();
  missingEvidence.gateReadiness[0].remainingEvidence.pop();
  await assert.rejects(validateCalibrationReadinessReport(missingEvidence));
});

test("rejects any financial, execution or parameter permission", async () => {
  for (const field of ["financialUseAllowed", "executionAllowed", "parameterMutationAllowed"]) {
    const report = await reference();
    report[field] = true;
    await assert.rejects(validateCalibrationReadinessReport(report));
  }
});

test("loads only the same-origin reference path and fails closed on a missing file", async () => {
  const expected = await reference();
  const calls = [];
  const loaded = await loadCalibrationReadinessReference(async (path, init) => {
    calls.push({ path, init });
    return { ok: true, async json() { return expected; } };
  });
  assert.equal(loaded.reportId, CALIBRATION_READINESS_REFERENCE_ID);
  assert.deepEqual(calls, [{
    path: CALIBRATION_READINESS_REFERENCE_PATH,
    init: { cache: "no-store", credentials: "same-origin" },
  }]);
  await assert.rejects(
    loadCalibrationReadinessReference(async () => ({ ok: false, async json() { return {}; } })),
    /در دسترس نیست/,
  );
});

test("wires the read-only expandable panel only into the synthetic demo", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../app/calibration-readiness-panel.tsx", import.meta.url), "utf8");
  assert.match(page, /portfolioMode === "demo" && <CalibrationReadinessPanel\/>/);
  assert.match(panel, /report\.gateReadiness\.map/);
  assert.match(panel, /<details className="calibration-gate"/);
  assert.match(panel, /این فهرست درصد پیشرفت یا تأیید عملکرد نیست/);
  assert.doesNotMatch(panel, /navasan\.tech|goldapi\.io|api\/market|api\/portfolio/i);
});
