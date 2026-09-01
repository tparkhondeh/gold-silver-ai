import assert from "node:assert/strict";
import test from "node:test";

import { evaluateLocalHealth, validateLocalHealthUrl } from "../scripts/local-readiness.ts";

function healthyPayload() {
  return {
    service: "asha-web",
    status: "evaluation_only",
    release: { phase: "phase_1_data_foundation", stableForFinancialUse: false },
    engines: [
      { id: "web", state: "ready" },
      { id: "global-market", state: "fallback" },
      { id: "iran-market", state: "blocked" },
      { id: "navasan-quota", state: "quota_ready" },
      { id: "observation-persistence", state: "connected" },
      { id: "portfolio-persistence", state: "local_ready" },
      { id: "provenance-registry", state: "registry_ready" },
      { id: "portfolio-ledger", state: "ledger_ready" },
      { id: "scenario", state: "demo_only" },
      { id: "financial-decision", state: "blocked" },
    ],
  };
}

test("accepts the complete fail-closed local evaluation contract", () => {
  const result = evaluateLocalHealth(healthyPayload());
  assert.equal(result.readyForLocalEvaluation, true);
  assert.equal(result.financialUseBlocked, true);
  assert.equal(result.externalApiCallsMade, false);
  assert.deepEqual(result.violations, []);
});

test("fails when persistence is unavailable or financial use is unlocked", () => {
  const payload = healthyPayload();
  payload.release.stableForFinancialUse = true;
  payload.engines.find(({ id }) => id === "observation-persistence").state = "blocked";
  payload.engines.find(({ id }) => id === "financial-decision").state = "ready";
  const result = evaluateLocalHealth(payload);
  assert.equal(result.readyForLocalEvaluation, false);
  assert.equal(result.financialUseBlocked, false);
  assert.equal(result.violations.some((value) => value.startsWith("engine.observation-persistence")), true);
  assert.equal(result.violations.some((value) => value.startsWith("engine.financial-decision")), true);
});

test("rejects malformed or duplicate health-engine contracts", () => {
  const malformed = evaluateLocalHealth({ service: "asha-web", engines: [{ id: "web", state: "ready" }, { id: "web", state: "ready" }] });
  assert.equal(malformed.readyForLocalEvaluation, false);
  assert.equal(malformed.violations.includes("engines: duplicate web"), true);
  assert.equal(evaluateLocalHealth(null).violations.includes("engines: expected an array"), true);
});

test("allows only the exact documented loopback health endpoint", () => {
  assert.equal(validateLocalHealthUrl("http://localhost:4174/api/health").href, "http://localhost:4174/api/health");
  assert.equal(validateLocalHealthUrl("http://127.0.0.1:4174/api/health").hostname, "127.0.0.1");
  assert.equal(validateLocalHealthUrl("http://[::1]:4174/api/health").hostname, "[::1]");
  for (const value of [
    "https://example.com/api/health",
    "http://localhost:4175/api/health",
    "http://user:pass@localhost:4174/api/health",
    "http://localhost:4174/",
    "http://localhost:4174/api/health?token=secret",
    "not-a-url",
  ]) assert.throws(() => validateLocalHealthUrl(value));
});
