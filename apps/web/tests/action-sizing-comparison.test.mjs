import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import bridge from "../data/physical-sizing-bridge-v1.json" with { type: "json" };
import { buildActionFixture, buildSyntheticSizingTrial } from "../app/decision-action-plan.ts";
import { buildActionSizingComparison, encodeActionSizingComparison, evaluateSyntheticSizingTrial } from "../app/action-sizing-comparison.ts";

const report = buildActionSizingComparison();

test("all seven methods use identical initial holdings, costs and constraints on two folds", () => {
  assert.equal(report.folds.length, 2); assert.equal(report.rankingPolicy, "none");
  assert.equal(report.aggregationPolicy, "none"); assert.equal(report.financialUseAllowed, false);
  assert.equal(report.executionAllowed, false);
  for (const fold of report.folds) {
    assert.equal(fold.methods.length, 7);
    assert.ok(fold.trainEndIndex < fold.testStartIndex && fold.executionCutoffIndex < fold.testStartIndex);
    const original = fold.methods[0].trial.inputSnapshot;
    for (const method of fold.methods) {
      assert.deepEqual(method.trial.inputSnapshot, original);
      assert.equal(BigInt(method.trial.portfolio.afterToman) + BigInt(method.trial.portfolio.totalCostToman), 1_000_000n);
      assert.equal(Object.values(method.trial.targetWeightsBps).reduce((sum, weight) => sum + weight, 0), 10_000);
      assert.equal(method.evaluation.paths.length, 20);
      assert.equal(method.evaluation.paths[0].periodIndex, fold.testStartIndex);
      assert.equal(method.evaluation.paths.at(-1).periodIndex, fold.testEndIndex);
      assert.equal(method.evaluation.initialToman, "1000000");
      assert.equal(new Set(method.trial.orders.map((order) => order.assetId)).size, method.trial.orders.length);
    }
  }
});

test("holding keeps common original quantities; cash has one initial cost and no later mark gain", () => {
  for (const fold of report.folds) {
    const hold = fold.methods.find((method) => method.methodId.includes("NO_TRADE"));
    assert.equal(hold.targetSource, "common_starting_holdings");
    assert.equal(hold.trial.state, "hold"); assert.deepEqual(hold.trial.orders, []);
    assert.equal(hold.trial.portfolio.totalCostToman, "0");
    const cash = fold.methods.find((method) => method.methodId === "ASHA_BENCHMARK_CASH_CONTROL_V1");
    assert.ok(cash.trial.rows.every((row) => row.afterQuantityMilli === "0"));
    assert.ok(cash.trial.orders.every((order) => order.side === "sell"));
    assert.equal(cash.evaluation.finalToman, cash.evaluation.afterCostToman);
    assert.equal(BigInt(cash.evaluation.changeToman), -BigInt(cash.trial.portfolio.totalCostToman));
  }
});

test("future-path shocks change evaluation but never the previously calculated trial", () => {
  const fold = bridge.folds[0], method = report.folds[0].methods.find((entry) => entry.methodId.includes("NO_TRADE"));
  const before = JSON.stringify(method.trial), points = structuredClone(fold.evaluationPoints);
  points.at(-1).levels.SYNTH_DEFENSIVE = "1.00000000";
  const shocked = evaluateSyntheticSizingTrial(method.trial, fold.startingLevels, points, fold.executionCutoffIndex);
  assert.ok(BigInt(shocked.finalToman) < BigInt(method.evaluation.finalToman));
  assert.ok(shocked.maximumDrawdownBps > method.evaluation.maximumDrawdownBps);
  assert.equal(JSON.stringify(method.trial), before);
  assert.deepEqual(buildSyntheticSizingTrial(method.trial.inputSnapshot, method.trial.targetWeightsBps), method.trial);
});

test("flat future prices hand-reconcile to post-cost NAV without charging costs twice", () => {
  const fold = bridge.folds[0], method = report.folds[0].methods.find((entry) => entry.methodId.includes("EQUAL_WEIGHT"));
  const points = fold.evaluationPoints.map((point) => ({ ...point, levels: { ...fold.startingLevels } }));
  const result = evaluateSyntheticSizingTrial(method.trial, fold.startingLevels, points, fold.executionCutoffIndex);
  assert.equal(result.finalToman, method.trial.portfolio.afterToman);
  assert.equal(BigInt(result.changeToman), -BigInt(method.trial.portfolio.totalCostToman));
  const costs = BigInt(method.trial.portfolio.totalCostToman);
  assert.equal(result.maximumDrawdownBps, Number((costs * 10000n + 999999n) / 1000000n));
});

test("future evaluation rejects pre-cutoff, unordered, missing and malformed path data", () => {
  const fold = bridge.folds[0], trial = report.folds[0].methods[0].trial;
  for (const mutate of [
    (p) => { p[0].periodIndex = fold.executionCutoffIndex; },
    (p) => { p[1].periodIndex = p[0].periodIndex; },
    (p) => { delete p[0].levels.SYNTH_DEFENSIVE; },
    (p) => { p[0].levels.SYNTH_DEFENSIVE = "NaN"; },
    (p) => { p[0].levels.SYNTH_DEFENSIVE = "0"; },
    (p) => { p[0].levels.SYNTH_CASH = "101"; },
    (p) => { p.length = 0; },
  ]) { const points = structuredClone(fold.evaluationPoints); mutate(points); assert.throws(() => evaluateSyntheticSizingTrial(trial, fold.startingLevels, points, fold.executionCutoffIndex)); }
  const changed = structuredClone(trial); changed.portfolio.cashAfterToman = "1";
  assert.throws(() => evaluateSyntheticSizingTrial(changed, fold.startingLevels, fold.evaluationPoints, fold.executionCutoffIndex));
});

test("comparison bridge and result must reproduce exactly, not just carry a familiar ID", () => {
  assert.deepEqual(buildActionSizingComparison(), report);
  assert.equal(encodeActionSizingComparison(report), JSON.stringify(report));
  for (const mutate of [
    (p) => { p.folds[0].executionCutoffIndex = 999; },
    (p) => { p.folds[0].methods[0].weights[0].weight = "0.900000000000"; },
    (p) => { p.executionAllowed = true; },
  ]) { const altered = structuredClone(bridge); mutate(altered); assert.throws(() => buildActionSizingComparison(altered)); }
  const altered = structuredClone(report); altered.folds[0].methods[0].evaluation.finalToman = "999999999";
  assert.throws(() => encodeActionSizingComparison(altered));
});

test("research sizing accepts only exact synthetic target membership, integer weights and sum", () => {
  const input = buildActionFixture();
  for (const targets of [null, {}, { SYNTH_GOLD: 4000, SYNTH_COIN: 3000, SYNTH_SILVER: 2000, SYNTH_CASH: 999 }, { SYNTH_GOLD: 4000.5, SYNTH_COIN: 3000, SYNTH_SILVER: 2000, SYNTH_CASH: 999.5 }, { SYNTH_GOLD: 4000, SYNTH_COIN: 3000, SYNTH_SILVER: 2000, SYNTH_CASH: 1000, REAL: 0 }]) assert.throws(() => buildSyntheticSizingTrial(input, targets));
});

test("comparison panel is wired into the owner workbench with its own non-ranking boundary", async () => {
  const panel = await readFile(new URL("../app/action-sizing-comparison-panel.tsx", import.meta.url), "utf8");
  const workbench = await readFile(new URL("../app/decision-action-workbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /<ActionSizingComparisonPanel\s*\/>/);
  assert.match(panel, /data-testid="action-sizing-comparison"/);
  assert.match(panel, /رتبه‌بندی یا انتخاب برنده انجام نمی‌شود/);
  assert.doesNotMatch(panel, /fetch\(|localStorage|dangerouslySetInnerHTML/);
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /portfolioMode === "demo" \? "PHASE 2 · LABORATORY" : "PHASE 1 · EVALUATION"/);
});
