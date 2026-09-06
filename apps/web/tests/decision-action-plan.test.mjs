import assert from "node:assert/strict";
import test from "node:test";
import { actionScenarios, buildActionFixture, buildActionPlan, encodeActionPlan, decodeActionPlan, validateActionInput } from "../app/decision-action-plan.ts";

function reconcile(plan) {
  const { portfolio: p, orders, inputSnapshot: input } = plan;
  assert.equal(BigInt(p.afterToman) + BigInt(p.totalCostToman), BigInt(p.beforeToman));
  let cash = BigInt(input.cashToman), costs = 0n;
  const funded = new Map();
  const quantities = new Map(input.assets.map((asset) => [asset.id, BigInt(asset.quantityMilli)]));
  for (const order of orders) {
    const asset = input.assets.find((item) => item.id === order.assetId);
    const q = BigInt(order.quantityMilli);
    assert.equal(q % BigInt(asset.lotMilli), 0n);
    assert.ok(q > 0n && q <= BigInt(asset.capacityMilli));
    assert.equal(BigInt(order.totalCostToman), ["spreadToman", "slippageToman", "roundingToman", "feeToman", "taxToman"].reduce((sum, key) => sum + BigInt(order[key]), 0n));
    if (order.side === "buy") {
      assert.equal(order.funding.reduce((sum, fund) => sum + BigInt(fund.amountToman), 0n), BigInt(order.cashMovementToman));
      for (const fund of order.funding) {
        funded.set(fund.sourceId, (funded.get(fund.sourceId) ?? 0n) + BigInt(fund.amountToman));
        if (fund.saleOrderId) assert.ok(orders.slice(0, orders.indexOf(order)).some((sale) => sale.id === fund.saleOrderId));
      }
      cash -= BigInt(order.cashMovementToman);
      quantities.set(asset.id, quantities.get(asset.id) + q);
      assert.ok(BigInt(order.priceToman) <= BigInt(order.limitPriceToman));
    } else {
      cash += BigInt(order.cashMovementToman);
      quantities.set(asset.id, quantities.get(asset.id) - q);
      assert.ok(BigInt(order.priceToman) >= BigInt(order.limitPriceToman));
    }
    costs += BigInt(order.totalCostToman);
    assert.ok(cash >= 0n);
    assert.ok(quantities.get(asset.id) >= 0n);
  }
  for (const [source, amount] of funded) {
    const available = source === "SYNTH_CASH" ? BigInt(input.cashToman) - BigInt(p.cashReserveToman)
      : BigInt(orders.find((order) => order.side === "sell" && order.assetId === source).cashMovementToman);
    assert.ok(amount <= available);
  }
  assert.equal(cash, BigInt(p.cashAfterToman)); assert.equal(costs, BigInt(p.totalCostToman));
  assert.equal(new Set(orders.map((order) => order.id)).size, orders.length);
  for (const row of plan.rows) assert.equal(BigInt(row.afterQuantityMilli), quantities.get(row.assetId));
  if (plan.state === "proposed") {
    assert.ok(cash * 10_000n >= BigInt(p.afterToman) * BigInt(input.minimumCashBps));
    assert.ok(p.turnoverBps <= input.maximumTurnoverBps);
    assert.ok(BigInt(p.stressLossAfterToman) * 100n <= BigInt(p.afterToman) * BigInt(input.maximumDrawdownPercent));
    for (const row of plan.rows) assert.ok(BigInt(row.afterValueToman) * 10_000n <= BigInt(p.afterToman) * BigInt(input.maximumAssetBps));
    assert.ok(BigInt(p.objectiveImprovementToman) > 0n);
  } else assert.equal(orders.length, 0);
  assert.equal(plan.financialUseAllowed, false); assert.equal(plan.executionAllowed, false);
}

test("all eight fixtures replay and keep one reconciled budget", () => {
  for (const scenario of actionScenarios) {
    const input = buildActionFixture(scenario), original = structuredClone(input);
    const plan = buildActionPlan(input);
    reconcile(plan); assert.deepEqual(input, original); assert.deepEqual(buildActionPlan(input), plan);
  }
});

test("hand checks complete exit, fees, exact cash and destination quantity", () => {
  const plan = buildActionPlan(buildActionFixture("exit"));
  const sale = plan.orders.find((order) => order.assetId === "SYNTH_GOLD");
  assert.equal(sale.side, "sell"); assert.equal(sale.quantityMilli, "60000");
  // 9,950 bid, 20 bps adverse slippage: floor(9,950 * .998) = 9,930.
  assert.equal(sale.priceToman, "9930"); assert.equal(sale.grossToman, "595800");
  assert.equal(sale.feeToman, "1192"); assert.equal(sale.cashMovementToman, "594608");
  assert.equal(plan.rows.find((row) => row.assetId === "SYNTH_GOLD").afterQuantityMilli, "0");
  assert.equal(plan.portfolio.cashAfterToman, "593606");
  assert.equal(plan.portfolio.totalCostToman, "6394");
  reconcile(plan);
});

test("same-class and cross-class links use distinct source funding, not duplicated sales", () => {
  const peer = buildActionPlan(buildActionFixture("peer"));
  assert.ok(peer.conversions.some((route) => route.kind === "same_class" && route.sourceId === "SYNTH_GOLD" && route.destinationId === "SYNTH_COIN"));
  const cross = buildActionPlan(buildActionFixture("cross"));
  assert.ok(cross.conversions.length > 0 && cross.conversions.every((route) => route.kind === "cross_class"));
  reconcile(peer); reconcile(cross);
});

test("entry from cash reports exact amounts and lot sizes", () => {
  const plan = buildActionPlan(buildActionFixture("entry"));
  assert.ok(plan.orders.every((order) => order.side === "buy" && order.funding.every((fund) => fund.sourceId === "SYNTH_CASH")));
  assert.equal(plan.rows.find((row) => row.assetId === "SYNTH_COIN").quantityMilli, "1000");
  reconcile(plan);
});

test("hold, conditional wait and missing data remain distinct with no cash movement", () => {
  for (const [scenario, state] of [["hold", "hold"], ["wait", "wait"], ["missing", "undecidable"]]) {
    const plan = buildActionPlan(buildActionFixture(scenario));
    assert.equal(plan.state, state); assert.equal(plan.portfolio.totalCostToman, "0");
    assert.equal(plan.portfolio.cashAfterToman, plan.portfolio.cashBeforeToman);
    if (state === "wait") assert.ok(plan.rows.some((row) => BigInt(row.conditionalQuantityMilli) > 0n));
    if (state === "undecidable") assert.deepEqual(plan.inputIssues, [{ assetId: "SYNTH_GOLD", code: "missing_bid" }]);
    reconcile(plan);
  }
});

test("stale and future quotes invalidate the entire proposed budget", () => {
  for (const field of ["quotedOn", "validUntil"]) {
    const input = buildActionFixture("entry");
    if (field === "quotedOn") { input.assets[0].quotedOn = "2000-01-02"; }
    else { input.assets[0].quotedOn = "1999-12-30"; input.assets[0].validUntil = "1999-12-31"; }
    assert.equal(buildActionPlan(input).state, "undecidable");
  }
});

test("price ceiling applies to asks and slippage, not only reference price", () => {
  const input = buildActionFixture("entry"); input.assets[0].askToman = 11_000;
  const plan = buildActionPlan(input);
  assert.equal(plan.state, "wait"); assert.equal(plan.rows[0].entryLimitToman, "10150");
  assert.equal(plan.orders.length, 0);
});

test("short and medium budgets produce one exact target, and calendar horizons are explicit", () => {
  const input = buildActionFixture();
  input.shortBudgetBps = 10_000;
  let plan = buildActionPlan(input);
  assert.deepEqual(plan.combinedTargetsBps, plan.horizons[0].targetsBps);
  assert.equal(plan.horizons[0].endsOn, "2000-01-31"); assert.equal(plan.horizons[1].endsOn, "2000-06-29");
  input.shortBudgetBps = 0;
  plan = buildActionPlan(input);
  assert.deepEqual(plan.combinedTargetsBps, plan.horizons[1].targetsBps);
  input.shortBudgetBps = 3_333;
  plan = buildActionPlan(input);
  assert.equal(Object.values(plan.combinedTargetsBps).reduce((sum, value) => sum + value, 0), 10_000);
  assert.equal(plan.objective.noReturnForecast, true);
});

test("zero holdings support finite entry factors without a fictitious source percentage", () => {
  const input = buildActionFixture(); input.assets[2].quantityMilli = 0;
  const plan = buildActionPlan(input);
  assert.ok(plan.horizons.every((horizon) => horizon.factors.SYNTH_SILVER.every((factor) => Number.isFinite(factor.input) && Number.isFinite(factor.weightedContribution))));
  assert.equal(plan.rows.find((row) => row.assetId === "SYNTH_SILVER").changeOfSourceBps, null);
  reconcile(plan);
});

test("turnover, impossible constraints, large lots and liquidity cannot force unsafe changes", () => {
  for (const change of [
    (i) => { i.maximumTurnoverBps = 0; },
    (i) => { i.maximumAssetBps = 100; },
    (i) => { i.minimumOrderToman = 1_000_000_000; },
    (i) => { i.assets.forEach((asset) => { asset.capacityMilli = 0; }); },
    (i) => { i.minimumImprovementBps = 10_000; },
  ]) {
    const input = buildActionFixture("cross"); change(input);
    const plan = buildActionPlan(input); assert.notEqual(plan.state, "proposed"); reconcile(plan);
  }
});

test("tax, fees and non-divisible price/quantity rounding reconcile under deterministic perturbations", () => {
  for (let n = 0; n < 30; n++) {
    const input = buildActionFixture(n % 2 ? "cross" : "entry");
    input.assets[0].referencePriceToman += n * 13;
    input.assets[0].bidToman = input.assets[0].referencePriceToman - 50;
    input.assets[0].askToman = input.assets[0].referencePriceToman + 50;
    input.assets[0].quantityMilli += n * 100;
    input.assets.forEach((asset) => { asset.feeBps = n * 3; asset.taxBps = n; });
    input.maximumTurnoverBps = 1_000 + n * 300;
    reconcile(buildActionPlan(input));
  }
});

test("stress envelope blocks an impossible risk budget without disguising it as hold", () => {
  const input = buildActionFixture("cross"); input.maximumDrawdownPercent = 1;
  const plan = buildActionPlan(input);
  assert.equal(plan.state, "wait");
  assert.ok(plan.reasonCodes.includes("STRESS_BUDGET_BREACH_REMAINS"));
  assert.ok(plan.alternatives.slice(1).every((option) => option.state === "infeasible"));
  const weightedLoss = input.assets.reduce((sum, asset) => sum + BigInt(plan.rows.find((row) => row.assetId === asset.id).currentValueToman) * BigInt(Math.round(Math.abs(plan.horizons[0].worstStressPercent[asset.id]) * 100)), 0n);
  assert.equal(BigInt(plan.portfolio.stressLossBeforeToman), (weightedLoss + 9999n) / 10000n);
  reconcile(plan);
});

test("chosen alternative has the smallest feasible penalized target distance", () => {
  const plan = buildActionPlan(buildActionFixture("cross"));
  assert.deepEqual(plan.alternatives.map((option) => option.fractionBps), [0, 2500, 5000, 7500, 10000]);
  const chosen = plan.alternatives.find((option) => option.fractionBps === plan.portfolio.chosenFractionBps);
  assert.equal(BigInt(chosen.objectiveToman), BigInt(plan.portfolio.trackingErrorAfterToman) + 2n * BigInt(plan.portfolio.totalCostToman));
  for (const option of plan.alternatives.filter((option) => option.objectiveToman !== null)) assert.ok(BigInt(chosen.objectiveToman) <= BigInt(option.objectiveToman));
  const coin = buildActionPlan(buildActionFixture()).rows.find((row) => row.assetId === "SYNTH_COIN");
  assert.equal(coin.action, "hold"); assert.equal(coin.reasonCode, "LOT_CAPACITY_COST_OR_BUDGET_LIMIT");
});

test("snapshot restoration recomputes every amount and rejects tampering and duplicate JSON", () => {
  const plan = buildActionPlan(buildActionFixture());
  const doc = encodeActionPlan(plan); assert.deepEqual(decodeActionPlan(doc), plan);
  for (const mutate of [
    (p) => { p.portfolio.cashAfterToman = "999999999"; },
    (p) => { p.executionAllowed = true; },
    (p) => { p.inputSnapshot.cashToman += 1; },
  ]) { const altered = structuredClone(plan); mutate(altered); assert.throws(() => decodeActionPlan(JSON.stringify(altered))); assert.throws(() => encodeActionPlan(altered)); }
  for (const bad of ["null", "{}", doc + " ", doc.replace('"state":', '"state":"hold","state":'), "x".repeat(200_001)]) assert.throws(() => decodeActionPlan(bad));
});

test("rejects malformed, extra, nonfinite, real-namespace and ambiguous input", () => {
  for (const mutate of [
    (i) => { i.schemaVersion = "v2"; }, (i) => { i.datasetKind = "real"; },
    (i) => { i.credentials = "test"; }, (i) => { i.assets[0].provider = "test"; },
    (i) => { i.cashToman = NaN; }, (i) => { i.shortBudgetBps = 10_001; },
    (i) => { i.mediumDays = 1; }, (i) => { i.asOf = "2000-02-30"; }, (i) => { i.asOf = "9999-12-31"; },
    (i) => { i.assets[0].id = "REAL_GOLD"; }, (i) => { i.assets[1].id = i.assets[0].id; },
    (i) => { i.assets[0].quantityMilli = 12.3; }, (i) => { i.assets[1].lotMilli = 100; },
    (i) => { i.assets[0].bidToman = 50_000; }, (i) => { i.assets[0].quotedOn = "2000-02-01"; },
    (i) => { i.assets[0].assetClass = "__proto__"; }, (i) => { i.assets[0].name = "طلا"; },
    (i) => { i.assets = []; }, (i) => { i.assets.forEach((asset) => { asset.quantityMilli = 0; }); i.cashToman = 0; },
  ]) { const input = buildActionFixture(); mutate(input); assert.throws(() => validateActionInput(input)); }
  assert.throws(() => validateActionInput(null));
});
