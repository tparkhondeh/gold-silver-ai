import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { actionScenarios, buildActionFixture, buildActionPlan } from "../app/decision-action-plan.ts";
import { createSharedPortfolio, decodeSharedPortfolio, encodeSharedPortfolio, evaluateSharedPortfolio, replaceSharedInput, validateSharedPortfolio, sharedViews, unsupportedCatalog } from "../app/shared-portfolio.ts";

test("one versioned input supplies all six portfolio views and the unchanged engine", () => {
  assert.deepEqual(sharedViews, ["overview", "portfolio", "asset-center", "analysis", "decisions", "risk"]);
  const portfolio = createSharedPortfolio();
  const original = structuredClone(portfolio);
  const result = evaluateSharedPortfolio(portfolio);
  assert.equal(result.totalToman, "1000000");
  assert.equal(result.cashToman, "100000");
  assert.deepEqual(result.values, { SYNTH_GOLD: "600000", SYNTH_COIN: "200000", SYNTH_SILVER: "100000" });
  assert.deepEqual(result.weightsBps, { SYNTH_GOLD: 6000, SYNTH_COIN: 2000, SYNTH_SILVER: 1000, SYNTH_CASH: 1000 });
  assert.deepEqual(result.plan, buildActionPlan(portfolio.input));
  assert.deepEqual(portfolio, original);
});

test("quantity, cash, explicit quotes and constraints propagate without stale fixture values", () => {
  let portfolio = createSharedPortfolio();
  const input = structuredClone(portfolio.input);
  input.assets[0].quantityMilli = 70000;
  input.assets[0].referencePriceToman = 11000;
  input.assets[0].bidToman = 10950;
  input.assets[0].askToman = 11050;
  input.cashToman = 250000; input.minimumCashBps = 2000; input.maximumAssetBps = 6000;
  portfolio = replaceSharedInput(portfolio, input);
  const result = evaluateSharedPortfolio(portfolio);
  assert.equal(portfolio.revision, 2);
  assert.equal(result.totalToman, "1320000");
  assert.equal(result.values.SYNTH_GOLD, "770000");
  assert.equal(result.plan.inputSnapshot.cashToman, 250000);
  assert.equal(result.plan.inputSnapshot.minimumCashBps, 2000);
  assert.equal(result.plan.inputSnapshot.maximumAssetBps, 6000);
  assert.equal(result.plan.rows[0].currentQuantityMilli, "70000");
  assert.equal(result.plan.rows[0].currentValueToman, result.values.SYNTH_GOLD);
  assert.equal(result.plan.rows[0].currentWeightBps, result.weightsBps.SYNTH_GOLD);
  assert.equal(result.plan.portfolio.beforeToman, result.totalToman);
  input.assets[0].quantityMilli = 0;
  assert.equal(portfolio.input.assets[0].quantityMilli, 70000, "input replacement clones caller data");
});

test("all eight existing scenarios retain exact cash, physical quantities, costs and one funding budget", () => {
  for (const scenario of actionScenarios) {
    const portfolio = replaceSharedInput(createSharedPortfolio(), buildActionFixture(scenario));
    const result = evaluateSharedPortfolio(portfolio), plan = result.plan;
    assert.ok(plan);
    assert.deepEqual(plan, buildActionPlan(portfolio.input));
    assert.equal(BigInt(plan.portfolio.beforeToman), BigInt(plan.portfolio.afterToman) + BigInt(plan.portfolio.totalCostToman));
    let cash = BigInt(plan.portfolio.cashBeforeToman);
    const quantities = new Map(portfolio.input.assets.map((asset) => [asset.id, BigInt(asset.quantityMilli)]));
    const used = new Map();
    for (const order of plan.orders) {
      const direction = order.side === "buy" ? 1n : -1n;
      cash -= direction * BigInt(order.cashMovementToman);
      assert.ok(cash >= 0n);
      quantities.set(order.assetId, quantities.get(order.assetId) + direction * BigInt(order.quantityMilli));
      assert.ok(quantities.get(order.assetId) >= 0n);
      assert.ok(!plan.orders.some((other) => other.assetId === order.assetId && other.side !== order.side));
      if (order.side === "buy") for (const funding of order.funding) used.set(funding.sourceId, (used.get(funding.sourceId) ?? 0n) + BigInt(funding.amountToman));
    }
    for (const [source, amount] of used) {
      const available = source === "SYNTH_CASH" ? BigInt(plan.portfolio.cashBeforeToman) - BigInt(plan.portfolio.cashReserveToman) : BigInt(plan.orders.find((order) => order.assetId === source && order.side === "sell").cashMovementToman);
      assert.ok(amount <= available);
    }
    assert.equal(cash.toString(), plan.portfolio.cashAfterToman);
    for (const row of plan.rows) assert.equal(quantities.get(row.assetId).toString(), row.afterQuantityMilli);
  }
});

test("each unsupported class blocks the whole decision, not just the unsupported row", () => {
  for (const id of Object.keys(unsupportedCatalog)) {
    const portfolio = createSharedPortfolio();
    portfolio.unsupported = [{ id, quantityMilli: 1000, referencePriceToman: null }];
    portfolio.selectedAssetId = id;
    const result = evaluateSharedPortfolio(portfolio);
    assert.equal(result.state, "undecidable"); assert.equal(result.plan, null);
    assert.equal(result.totalToman, null);
    assert.equal(result.weightsBps.SYNTH_GOLD, null, "do not silently exclude unknown assets from denominator");
    assert.equal(result.values[id], null);
    assert.match(result.errors[0], /پشتیبانی/);
    assert.deepEqual(decodeSharedPortfolio(encodeSharedPortfolio(portfolio)), portfolio);
    portfolio.unsupported[0].referencePriceToman = 1234;
    const priced = evaluateSharedPortfolio(portfolio);
    assert.equal(priced.totalToman, "1001234"); assert.equal(priced.plan, null);
    assert.equal(priced.values[id], "1234");
  }
});

test("missing, expired and future quotes remain explicit undecidable plans without orders", () => {
  for (const change of [asset => { asset.bidToman = null; }, asset => { asset.askToman = null; }, asset => { asset.validUntil = "1999-12-31"; asset.quotedOn = "1999-12-30"; }, asset => { asset.quotedOn = "2000-01-02"; }]) {
    const portfolio = createSharedPortfolio(); change(portfolio.input.assets[0]);
    const result = evaluateSharedPortfolio(portfolio);
    assert.equal(result.state, "undecidable");
    assert.equal(result.plan.state, "undecidable");
    assert.equal(result.plan.orders.length, 0); assert.equal(result.plan.portfolio.totalCostToman, "0");
    assert.equal(result.plan.portfolio.cashAfterToman, result.cashToman);
    assert.deepEqual(decodeSharedPortfolio(encodeSharedPortfolio(portfolio)), portfolio);
  }
});

test("currency, units, purity, identities, unsupported metadata and invalid edits fail closed", () => {
  const mutations = [
    p => { p.currency = "IRR"; }, p => { p.quantityScale = 1; }, p => { p.schemaVersion = "v2"; }, p => { p.portfolioId = "PERSONAL"; },
    p => { p.revision = 0; }, p => { p.revision = Number.MAX_SAFE_INTEGER; },
    p => { p.input.assets[0].unit = "piece"; }, p => { p.input.assets[0].purityPermille = 999; },
    p => { p.input.assets[0].assetClass = "silver"; }, p => { p.input.assets[0].name = "[ساختگی] Other"; },
    p => { p.input.assets[0].id = "SYNTH_OTHER"; }, p => { p.input.assets.reverse(); }, p => { p.input.assets.pop(); },
    p => { p.input.assets[1].quantityMilli = 1500; }, p => { p.input.assets[0].quantityMilli = 100.1; },
    p => { p.input.cashToman = NaN; }, p => { p.input.assets[0].referencePriceToman = 20000; },
    p => { p.input.datasetKind = "real"; }, p => { p.input.asOf = "2000-02-31"; },
    p => { p.selectedAssetId = "NOT_IN_PORTFOLIO"; }, p => { p.unsupported = null; },
    p => { p.extra = "not allowed"; }, p => { p.unsupported = [{id: "SYNTH_UNKNOWN", quantityMilli: 1000, referencePriceToman: null}]; },
    p => { p.unsupported = Array(8).fill({id: "SYNTH_STOCKS", quantityMilli: 1000, referencePriceToman: null}); },
    p => { p.unsupported = Array(2).fill({id: "SYNTH_STOCKS", quantityMilli: 1000, referencePriceToman: null}); },
    p => { p.unsupported = [{id: "SYNTH_STOCKS", quantityMilli: -1, referencePriceToman: null}]; },
    p => { p.unsupported = [{id: "SYNTH_STOCKS", quantityMilli: 1000, referencePriceToman: 0}]; },
  ];
  for (const mutate of mutations) {
    const portfolio = createSharedPortfolio(); mutate(portfolio);
    assert.throws(() => validateSharedPortfolio(portfolio));
    assert.throws(() => encodeSharedPortfolio(portfolio));
    const result = evaluateSharedPortfolio(portfolio);
    assert.equal(result.plan, null); assert.equal(result.totalToman, null);
    assert.ok(result.errors.length > 0);
  }
});

test("storage replays exact input, selected asset and both horizons; tampering is rejected", () => {
  const portfolio = createSharedPortfolio();
  portfolio.selectedAssetId = "SYNTH_SILVER"; portfolio.revision = 9;
  portfolio.input.shortDays = 45; portfolio.input.mediumDays = 120; portfolio.input.shortBudgetBps = 3500;
  const document = encodeSharedPortfolio(portfolio);
  assert.deepEqual(decodeSharedPortfolio(document), portfolio);
  assert.equal(encodeSharedPortfolio(decodeSharedPortfolio(document)), document);
  assert.deepEqual(evaluateSharedPortfolio(decodeSharedPortfolio(document)), evaluateSharedPortfolio(portfolio));
  for (const mutate of [p => { p.result.plan.portfolio.cashAfterToman = "99999999"; }, p => { p.portfolio.input.cashToman += 1; }, p => { p.schemaVersion = "v0"; }, p => { p.extra = 1; }]) {
    const payload = JSON.parse(document); mutate(payload);
    assert.throws(() => decodeSharedPortfolio(JSON.stringify(payload)));
  }
  assert.throws(() => decodeSharedPortfolio("x".repeat(1000001)));
  assert.throws(() => decodeSharedPortfolio("bad json"));
  assert.throws(() => decodeSharedPortfolio(document.replace('"currency":"TOMAN"', '"currency":"IRR","currency":"TOMAN"')));
});

test("UI wiring isolates browser-only synthetic persistence and keeps the existing comparison", async () => {
  const ui = await readFile(new URL("../app/shared-portfolio-workspace.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const desk = await readFile(new URL("../app/decision-action-workbench.tsx", import.meta.url), "utf8");
  assert.match(page, /<SharedPortfolioWorkspace active=\{sharedPortfolioActive\}/);
  assert.match(page, /!sharedPortfolioActive &&/);
  assert.match(page, /!holdingsLoaded \|\| portfolioMode === "demo"/);
  assert.match(ui, /<DecisionActionWorkbench input=\{portfolio.input\} onInputChange=\{updateInput\}/);
  assert.match(ui, /blockedReason=\{evaluation.errors.join/);
  assert.doesNotMatch(ui, /fetch\(|\/api\/|sessionStorage|dangerouslySetInnerHTML/);
  assert.match(ui, /localStorage.setItem\(`\$\{SHARED_STORAGE_KEY\}-previous`, previous\)/);
  assert.match(desk, /<ActionSizingComparisonPanel/);
  assert.match(desk, /if \(blockedReason\) throw new Error/);
  assert.match(desk, /key === "referencePriceToman" && !sharedInput/);
});
