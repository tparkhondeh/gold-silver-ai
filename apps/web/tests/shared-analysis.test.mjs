import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildSharedAnalysis } from "../app/shared-analysis.ts";
import { analyzeActionHorizon, buildActionFixture, buildActionPlan, actionScenarios } from "../app/decision-action-plan.ts";
import { createSharedPortfolio, encodeSharedPortfolio, decodeSharedPortfolio, evaluateSharedPortfolio } from "../app/shared-portfolio.ts";

test("shared diagnostics reuse exact horizon factors without creating a second budget", () => {
  const p = createSharedPortfolio(), before = structuredClone(p);
  const report = buildSharedAnalysis(p), plan = buildActionPlan(p.input);
  assert.deepEqual(p, before);
  assert.equal(report.schemaVersion, "asha.synthetic.shared_analysis.v1");
  assert.equal(report.financialUseAllowed, false);
  assert.equal(report.executionAllowed, false);
  assert.deepEqual(report.source.inputSnapshot, p.input);
  for (const [i, horizon] of report.horizons.entries()) {
    const source = analyzeActionHorizon(p.input, horizon.id);
    assert.equal(horizon.featureObservations, i === 0 ? 20 : 60);
    for (const asset of horizon.assets) {
      assert.deepEqual(asset.factors, plan.horizons[i].factors[asset.assetId]);
      assert.deepEqual(asset.history, source.assets.find(a => a.id === asset.assetId).history);
      assert.deepEqual(asset.scenarios, source.assets.find(a => a.id === asset.assetId).scenarios);
      assert.equal(Object.hasOwn(asset, "homogeneousDecision"), false);
      assert.equal(Object.hasOwn(asset, "targetWeightPercent"), false);
    }
  }
});

test("pure-metal ratio, executable spread and concentration have exact hand-checkable denominators", () => {
  const p = createSharedPortfolio();
  p.input.assets[0].bidToman = 9900; p.input.assets[0].askToman = 10100;
  const r = buildSharedAnalysis(p);
  assert.deepEqual(r.metalRatio, {numerator:"9990000",denominator:"750000",scaled10000:"133200"});
  assert.deepEqual(r.quotes[0].spread, {numerator:"200",denominator:"10000",scaled10000:"200"});
  assert.equal(r.concentration[0].aboveLimit, 6000 > p.input.maximumAssetBps);
  p.input.maximumAssetBps = 6000;
  assert.equal(buildSharedAnalysis(p).concentration[0].aboveLimit, false);
  p.input.cashToman -= 1;
  assert.equal(buildSharedAnalysis(p).concentration[0].aboveLimit, true, "do not compare floored bps");
});

test("edits to prices, holdings, cash, constraints and dates cannot leave stale diagnostics", () => {
  const p = createSharedPortfolio(); const before = buildSharedAnalysis(p);
  p.revision++;
  p.input.assets[0].referencePriceToman = 20000;
  p.input.assets[0].bidToman = 19900; p.input.assets[0].askToman = 20100;
  p.input.assets[0].quantityMilli = 70000; p.input.cashToman = 500000;
  p.input.shortDays = 14; p.input.mediumDays = 90;
  const after = buildSharedAnalysis(p);
  assert.equal(after.source.revision, 2);
  assert.equal(after.metalRatio.scaled10000, "266400");
  assert.equal(after.quotes[0].spread.scaled10000, "100");
  assert.equal(after.horizons[0].days, 14); assert.equal(after.horizons[1].days, 90);
  assert.notDeepEqual(after.concentration, before.concentration);
  assert.notDeepEqual(after.horizons[0].assets[0].scenarios, before.horizons[0].assets[0].scenarios);
  assert.equal(after.horizons[0].featureObservations, 20, "display days do not re-fit existing method");
});

test("missing, stale, future and noncontemporaneous quotes never produce a current ratio", () => {
  for (const mutate of [
    a => {a.bidToman = null;}, a => {a.askToman = null;},
    a => {a.quotedOn = "1999-12-20"; a.validUntil = "1999-12-31";},
    a => {a.quotedOn = "2000-01-02";},
  ]) {
    const p = createSharedPortfolio(); mutate(p.input.assets[0]);
    const report = buildSharedAnalysis(p);
    assert.equal(report.metalRatio, null); assert.equal(report.quotes[0].spread, null);
    assert.ok(report.quotes[0].issues.length); assert.equal(report.planState, "undecidable");
    assert.equal(evaluateSharedPortfolio(p).plan.orders.length, 0);
  }
  const p = createSharedPortfolio(); p.input.assets[0].quotedOn = "1999-12-31";
  assert.equal(buildSharedAnalysis(p).metalRatio, null);
  assert.equal(buildSharedAnalysis(p).quotes[0].state, "usable");
});

test("unsupported positions block the whole plan, invalid units reject diagnostics", () => {
  const p = createSharedPortfolio();
  p.unsupported = [{id:"SYNTH_FX", quantityMilli:1000, referencePriceToman:null}];
  const report = buildSharedAnalysis(p);
  assert.equal(report.planState, "undecidable"); assert.equal(report.concentration, null);
  assert.equal(report.gaps.find(g => g.id === "intrinsic_bubble").state, "missing");
  assert.equal(report.gaps.find(g => g.id === "market_regime").state, "missing");
  p.input.assets[0].unit = "piece";
  assert.throws(() => buildSharedAnalysis(p));
});

test("saved input reproduces diagnostics, all existing scenarios retain one reconciled plan", () => {
  for (const scenario of actionScenarios) {
    const p = createSharedPortfolio(); p.input = buildActionFixture(scenario);
    const r = buildSharedAnalysis(p), plan = buildActionPlan(p.input);
    assert.deepEqual(buildSharedAnalysis(decodeSharedPortfolio(encodeSharedPortfolio(p))), r);
    assert.equal(r.horizons[0].targetSource, scenario === "method" ? "eight_factor_method" : "explicit_test_targets");
    assert.equal(BigInt(plan.portfolio.beforeToman), BigInt(plan.portfolio.afterToman) + BigInt(plan.portfolio.totalCostToman));
    const cash = plan.orders.reduce((cash, order) => cash + (order.side === "buy" ? -1n : 1n) * BigInt(order.cashMovementToman), BigInt(p.input.cashToman));
    assert.equal(cash.toString(), plan.portfolio.cashAfterToman);
    const ids = plan.orders.map(o => o.assetId); assert.equal(new Set(ids).size, ids.length);
  }
});

test("quality and metal views use shared report; UI has explicit source gaps and no network", async () => {
  const ui = await readFile(new URL("../app/shared-analysis-panel.tsx", import.meta.url),"utf8");
  const workspace = await readFile(new URL("../app/shared-portfolio-workspace.tsx", import.meta.url),"utf8");
  assert.match(workspace, /buildSharedAnalysis\(portfolio\)/);
  assert.match(workspace, /selectedAssetId=\{portfolio.selectedAssetId\}/);
  assert.match(ui, /report.gaps.map/);
  assert.match(ui, /targetSource === "explicit_test_targets"/);
  assert.doesNotMatch(ui, /fetch\(|localStorage|\/api\/|dangerouslySetInnerHTML/);
});
