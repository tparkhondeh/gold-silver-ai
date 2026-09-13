import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildRawMetalDiagnostics, emptyMetalReferences, exampleMetalReferences, validateMetalReferences } from "../app/shared-metal-reference.ts";
import { calculatePremiumPercent } from "../app/scenario-engine.ts";
import { buildActionFixture } from "../app/decision-action-plan.ts";
import { createSharedPortfolio, encodeSharedPortfolio, decodeSharedPortfolio, evaluateSharedPortfolio } from "../app/shared-portfolio.ts";
import { buildSharedAnalysis } from "../app/shared-analysis.ts";

const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const changePrice = (asset, value) => { asset.referencePriceToman = value; asset.bidToman = value; asset.askToman = value; };

test("raw metal preserves the approved formula with exact fractions and no decision influence", () => {
  const p = createSharedPortfolio(), original = structuredClone(p), before = evaluateSharedPortfolio(p);
  p.metalReferences = exampleMetalReferences();
  const report = buildRawMetalDiagnostics(p.input, p.metalReferences);
  assert.deepEqual(evaluateSharedPortfolio(p), before);
  assert.equal(report.affectsDecision, false); assert.equal(report.financialUseAllowed, false);
  assert.equal(report.troyOunceGrams, "31.1034768");
  assert.equal(report.rows[1].state, "unavailable", "coin fine weight is never guessed from purity alone");
  for (const i of [0, 2]) {
    const row = report.rows[i], a = p.input.assets[i], ref = p.metalReferences.quotes[i === 0 ? 1 : 2];
    const expected = calculatePremiumPercent(a.referencePriceToman, ref.value / 100, p.metalReferences.quotes[0].value, a.purityPermille / 1000);
    assert.ok(Math.abs(Number(row.premiumPercent.numerator) / Number(row.premiumPercent.denominator) - expected) < 1e-10);
  }
  assert.deepEqual(p.input, original.input);
  assert.deepEqual(report.source, p.metalReferences);
  report.source.quotes[0].value++;
  assert.equal(p.metalReferences.quotes[0].value, 1000, "source is an immutable snapshot");
});

test("hand-computable parity, positive/negative premiums and amounts have explicit denominators", () => {
  const p = createSharedPortfolio(); p.metalReferences = exampleMetalReferences();
  p.metalReferences.quotes[1].value = 311034768;
  changePrice(p.input.assets[0], 75000000);
  let r = buildRawMetalDiagnostics(p.input, p.metalReferences).rows[0];
  assert.equal(r.rawMetalTomanPerGram.scaled10000, "750000000000");
  assert.equal(r.premiumPercent.scaled10000, "0");
  assert.equal(r.differenceTomanPerGram.scaled10000, "0");
  changePrice(p.input.assets[0], 80000000);
  r = buildRawMetalDiagnostics(p.input, p.metalReferences).rows[0];
  assert.equal(r.differenceTomanPerGram.scaled10000, "50000000000");
  assert.equal(r.premiumPercent.scaled10000, "66666");
  changePrice(p.input.assets[0], 70000000);
  r = buildRawMetalDiagnostics(p.input, p.metalReferences).rows[0];
  assert.equal(r.differenceTomanPerGram.scaled10000, "-50000000000");
  assert.equal(r.premiumPercent.scaled10000, "-66666", "negative display truncates toward zero, not floor");
  p.metalReferences.quotes[0].value = 1_000_000_000;
  p.metalReferences.quotes[1].value = 1_000_000_000;
  r = buildRawMetalDiagnostics(p.input, p.metalReferences).rows[0];
  assert.equal(r.rawMetalTomanPerGram.numerator, "75000000000000000000000", "multiplication beyond Number precision remains exact");
});

test("missing, stale, future, noncontemporaneous and unsupported diagnostics stay unavailable", () => {
  const input = buildActionFixture();
  assert.ok(buildRawMetalDiagnostics(input, emptyMetalReferences()).rows.every(r => r.state === "unavailable"));
  for (const [mutate, issue] of [
    [q => { q.value = null; }, "missing"],
    [q => { q.quotedOn = "1999-12-01"; q.validUntil = "1999-12-31"; }, "expired"],
    [q => { q.quotedOn = "2000-01-02"; }, "future"],
    [q => { q.quotedOn = "1999-12-31"; }, "different_date"],
  ]) {
    const refs = exampleMetalReferences(); mutate(refs.quotes[1]);
    const report = buildRawMetalDiagnostics(input, refs);
    assert.equal(report.rows[0].premiumPercent, null);
    assert.ok(report.rows[0].issues.includes(`XAU_USD:${issue}`));
    assert.equal(report.rows[2].state, "calculated", "independent silver reference is not discarded");
    mutate(refs.quotes[0]);
    assert.ok(buildRawMetalDiagnostics(input, refs).rows.every(r => r.state === "unavailable"));
  }
  for (const [quotedOn, validUntil, issue] of [["1999-12-01", "1999-12-31", "expired_domestic_quote"], ["2000-01-02", "2000-01-07", "future_domestic_quote"]]) {
    const changed = structuredClone(input); Object.assign(changed.assets[0], {quotedOn, validUntil});
    assert.ok(buildRawMetalDiagnostics(changed, exampleMetalReferences()).rows[0].issues.includes(issue));
  }
  input.assets[0].bidToman = null;
  assert.equal(buildRawMetalDiagnostics(input, exampleMetalReferences()).rows[0].state, "calculated", "nonexecuting diagnostic needs reference price, not an executable bid");
});

test("reference identity, units, limits, exact dates and no unmarked real data fail closed", () => {
  for (const mutate of [
    r => {r.schemaVersion = "v2";}, r => {r.datasetKind = "real";}, r => {r.sourceId = "NAVASAN";},
    r => {r.extra = 1;}, r => {r.quotes.pop();}, r => {r.quotes = null;}, r => {r.quotes.reverse();},
    r => {r.quotes[0].unit = "IRR_PER_USD";}, r => {r.quotes[1].unit = "USD_PER_OUNCE";},
    r => {r.quotes[1].code = "XAG_USD";}, r => {r.quotes[0].extra = 1;},
    ...[0, -1, 1.1, NaN, Infinity, 1_000_000_001, "100"].map(v => r => {r.quotes[0].value = v;}),
    ...["2000-02-31", "2000-1-01", "0001-01-01", "9999-01-01", null].map(v => r => {r.quotes[0].quotedOn = v;}),
    r => {r.quotes[0].validUntil = "1999-12-31";},
  ]) {
    const p = createSharedPortfolio(); p.metalReferences = exampleMetalReferences(); mutate(p.metalReferences);
    assert.throws(() => validateMetalReferences(p.metalReferences));
    assert.throws(() => encodeSharedPortfolio(p));
    assert.equal(evaluateSharedPortfolio(p).plan, null);
  }
});

test("V2 save replays reference diagnostics, rejects canonical tampering, and does not change orders", () => {
  const p = createSharedPortfolio(); p.metalReferences = exampleMetalReferences(); p.revision = 7;
  const saved = encodeSharedPortfolio(p), report = buildSharedAnalysis(p), result = evaluateSharedPortfolio(p);
  assert.deepEqual(decodeSharedPortfolio(saved), p);
  assert.equal(encodeSharedPortfolio(decodeSharedPortfolio(saved)), saved);
  assert.deepEqual(buildSharedAnalysis(decodeSharedPortfolio(saved)), report);
  for (const mutate of [
    doc => {doc.metalDiagnostics.rows[0].premiumPercent.scaled10000 = "0";},
    doc => {doc.portfolio.metalReferences.quotes[0].value++;},
    doc => {delete doc.metalDiagnostics;},
    doc => {doc.metalDiagnostics.affectsDecision = true;},
  ]) { const doc = JSON.parse(saved); mutate(doc); assert.throws(() => decodeSharedPortfolio(canonical(doc))); }
  p.metalReferences.quotes[0].value *= 2; p.revision++;
  assert.notDeepEqual(buildSharedAnalysis(p).rawMetal, report.rawMetal);
  assert.deepEqual(evaluateSharedPortfolio(p), result, "references cannot silently recalibrate eight-factor targets or consume another budget");
});

test("legacy V1 documents migrate in memory only with verified old result and empty references", () => {
  const p = createSharedPortfolio(); p.revision = 33; p.input.cashToman = 250000; p.selectedAssetId = "SYNTH_SILVER";
  const legacyPortfolio = structuredClone(p); delete legacyPortfolio.metalReferences; legacyPortfolio.schemaVersion = "asha.synthetic.shared_portfolio.v1";
  const payload = {schemaVersion:"asha.synthetic.shared_document.v1", portfolio:legacyPortfolio, result:evaluateSharedPortfolio(p)};
  const original = canonical(payload), restored = decodeSharedPortfolio(original);
  assert.deepEqual(restored, p); assert.deepEqual(restored.metalReferences, emptyMetalReferences());
  assert.equal(original, canonical(payload));
  assert.equal(JSON.parse(encodeSharedPortfolio(restored)).schemaVersion, "asha.synthetic.shared_document.v2");
  for (const mutate of [doc => {doc.result.totalToman = "1";}, doc => {doc.portfolio.schemaVersion = "asha.synthetic.shared_portfolio.v2";}, doc => {doc.portfolio.metalReferences = exampleMetalReferences();}]) {
    const bad = JSON.parse(original); mutate(bad); assert.throws(() => decodeSharedPortfolio(canonical(bad)));
  }
});

test("reference editor and exact diagnostics are wired to one shared state without network or HTML injection", async () => {
  const ui = await readFile(new URL("../app/shared-metal-panel.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../app/shared-portfolio-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /<MetalReferenceEditor references=\{portfolio.metalReferences\}/);
  assert.match(workspace, /revision: previous.revision \+ 1, metalReferences/);
  assert.match(ui, /exampleMetalReferences\(\)/);
  assert.match(ui, /report.rows.map/);
  assert.doesNotMatch(ui, /fetch\(|localStorage|dangerouslySetInnerHTML|\/api\//);
});
