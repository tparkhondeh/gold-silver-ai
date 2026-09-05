import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSandboxAnalysisLens,
  calculateSandboxIntelligence,
  sandboxIntelligenceMethodology,
} from "../app/sandbox-intelligence-engine.ts";

const inputs = [
  {
    id: "gold",
    name: "طلای ۱۸ عیار",
    assetClassId: "gold",
    assetClassLabel: "طلا",
    valueToman: 700,
    costToman: 600,
    allocationPercent: 70,
    returnPercent: 16.6666666667,
    riskScore: 2,
    riskLabel: "متوسط · ساختگی",
    premium: { applicable: true, current: 33, minimum: 18, average: 28, maximum: 42 },
  },
  {
    id: "coin",
    name: "سکه امامی",
    assetClassId: "gold",
    assetClassLabel: "طلا",
    valueToman: 200,
    costToman: 210,
    allocationPercent: 20,
    returnPercent: -4.7619047619,
    riskScore: 3,
    riskLabel: "متوسط · ساختگی",
    premium: { applicable: true, current: 21, minimum: 8, average: 17, maximum: 30 },
  },
  {
    id: "cash",
    name: "وجه نقد و سپرده بانکی",
    assetClassId: "cash",
    assetClassLabel: "نقد و سپرده",
    valueToman: 100,
    costToman: 100,
    allocationPercent: 10,
    returnPercent: 0,
    riskScore: 1,
    riskLabel: "کم · ساختگی",
    premium: { applicable: false, current: null, minimum: null, average: null, maximum: null },
  },
];

const profile = {
  liquidityReservePercent: 20,
  maxSingleAssetPercent: 50,
  maxAcceptableDrawdownPercent: 20,
};

test("calculates deterministic, traceable synthetic intelligence", () => {
  const first = calculateSandboxIntelligence(inputs, profile, "short");
  const second = calculateSandboxIntelligence(inputs, profile, "short");
  assert.deepEqual(first, second);
  assert.equal(first.methodologyId, sandboxIntelligenceMethodology.id);
  assert.equal(first.datasetId, sandboxIntelligenceMethodology.datasetId);
  assert.equal(first.assets.length, 3);
  assert.ok(first.assets.every((asset) => asset.history.observationCount === 90));
  assert.ok(first.assets.every((asset) => Number.isFinite(asset.score)));
  assert.ok(first.assets.every((asset) => asset.factorContributions.length === 8));
  assert.ok(first.assets.find((asset) => asset.id === "cash")?.factorContributions.every((factor) => factor.points === 0));
  assert.ok(first.assets.every((asset) => asset.evidenceAdequacyPercent === 100));
  assert.ok(first.assets.every((asset) => asset.worstScenario.movePercent <= asset.bestScenario.movePercent));
  assert.ok(new Set(first.assets.map((asset) => asset.signal)).size >= 2);
});

test("forces risk reduction when scenario loss breaches the owner tolerance", () => {
  const result = calculateSandboxIntelligence([...inputs, {
    id: "crypto",
    name: "رمزارز",
    assetClassId: "crypto",
    assetClassLabel: "دارایی دیجیتال",
    valueToman: 500,
    costToman: 120,
    allocationPercent: 33.3333333333,
    returnPercent: 25,
    riskScore: 5,
    riskLabel: "بسیار بالا · ساختگی",
    premium: { applicable: false, current: null, minimum: null, average: null, maximum: null },
  }], profile, "short");
  const crypto = result.assets.find((asset) => asset.id === "crypto");
  assert.equal(crypto?.signal, "reduce");
  assert.equal(crypto?.heterogeneousDecision.code, "rotate");
  assert.equal(crypto?.heterogeneousDecision.destinationName, "وجه نقد و سپرده بانکی");
  assert.ok((crypto?.heterogeneousDecision.amountToman ?? 0) > 0);
  assert.match(crypto?.invalidation ?? "", /بدترین فشار/);
});

test("keeps score arithmetic hand-verifiable and decision amounts bounded", () => {
  const result = calculateSandboxIntelligence(inputs, profile, "short");
  const gold = result.assets.find((asset) => asset.id === "gold");
  assert.ok(gold);
  const expected = gold.factorContributions.reduce((sum, factor) => sum + factor.weightedContribution, 0) * 50;
  assert.ok(Math.abs(gold.score - expected) < 0.02);
  assert.ok(gold.heterogeneousDecision.amountToman <= result.totalValueToman * 0.25);
  assert.ok(result.overallDecision.destinationName);
  assert.ok(result.overallDecision.amountToman <= result.totalValueToman * 0.25);
  assert.ok(Math.abs(result.assets.reduce((sum, asset) => sum + asset.targetWeightPercent, 0) - 100) < 0.0001);
});

test("produces tangible analysis lenses without inventing unsupported VaR", () => {
  const result = calculateSandboxIntelligence(inputs, profile, "long");
  const technical = buildSandboxAnalysisLens(result, "gold", "technical");
  const bubble = buildSandboxAnalysisLens(result, "gold", "bubble");
  const portfolio = buildSandboxAnalysisLens(result, "gold", "portfolio");
  assert.equal(technical?.metrics.length, 4);
  assert.match(technical?.headline ?? "", /روند|سیگنال/);
  assert.equal((technical?.findings.join(" ") ?? "").includes("VaR جعلی"), true);
  assert.match(bubble?.verdict ?? "", /حباب فعلی/);
  assert.match(portfolio?.verdict ?? "", /ذخیره|وزن|امتیاز|تغییر/);
  assert.equal(sandboxIntelligenceMethodology.executionAllowed, false);
  assert.equal(sandboxIntelligenceMethodology.financialUseAllowed, false);
  assert.equal(result.evidenceState.iranValidationStatus, "not_evaluated");
});

test("keeps every owner-approved analysis lens numeric and actionable", () => {
  const result = calculateSandboxIntelligence(inputs, profile, "short");
  const categories = ["summary", "geopolitical", "political", "economic", "industry", "technical", "bubble", "portfolio"];
  categories.forEach((category) => {
    const lens = buildSandboxAnalysisLens(result, "gold", category);
    assert.ok(lens, `${category} lens should exist`);
    assert.equal(lens.metrics.length, 4);
    assert.equal(lens.findings.length, 3);
    assert.ok(lens.decision.length > 0);
    assert.ok(lens.invalidation.length > 0);
  });
});
