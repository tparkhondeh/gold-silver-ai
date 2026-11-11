import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPersonalCashToman, emptyPersonalPlanning, personalPlanningCashRial, validatePersonalPlanning, MAX_PERSONAL_MEDIUM_MONTHS } from "../app/personal-planning.ts";
import { buildPersonalPortfolioAnalysis, PERSONAL_PORTFOLIO_ANALYSIS_VERSION } from "../app/personal-portfolio-analysis.ts";
import { emptyPortfolioPreferences } from "../data/postgres-portfolio-repository.ts";
import { decodePortfolioSnapshot } from "../app/portfolio-persistence.ts";
import { parsePortfolioSaveInput } from "../app/portfolio-save-input.ts";
import { decodePersonalBackup, personalBackup, samePortfolioContent, saveUnifiedPortfolio } from "../app/unified-portfolio-client.ts";

const now = Date.parse("2000-01-03T12:00:00.000Z");
const exact = (n, d = 1) => ({ numerator: String(n), denominator: String(d) });
const planning = (cash = null, months = null) => ({ ...emptyPersonalPlanning(), spendableCashToman: cash, mediumTermMonths: months });
const snapshot = () => ({ version: 2, holdings: [], preferences: { ...emptyPortfolioPreferences, shortTermMonths: "3", longTermYears: "5" } });

test("planning contract distinguishes absent, unknown and declared zero without inference", () => {
  const original = snapshot();
  assert.equal(Object.hasOwn(decodePortfolioSnapshot(original), "planning"), false);
  assert.equal(personalPlanningCashRial(planning()), null);
  assert.deepEqual(personalPlanningCashRial(planning("0")), exact(0));
  assert.deepEqual(personalPlanningCashRial(planning("0.01")), exact(1, 10));
  assert.deepEqual(personalPlanningCashRial(planning("9007199254740993.01")), exact("900719925474099301", 10));
  const value = "9".repeat(36) + ".99";
  assert.deepEqual(personalPlanningCashRial(planning(value)), exact("9".repeat(38), 10));
  assert.equal(canonicalPersonalCashToman(" 123.20 "), "123.2");
  assert.equal(canonicalPersonalCashToman("0.00"), "0");
  const checked = validatePersonalPlanning(planning("0", MAX_PERSONAL_MEDIUM_MONTHS));
  checked.spendableCashToman = "1";
  assert.deepEqual(original, snapshot());
});

test("planning strictly bounds numbers, keys and units before money arithmetic or network use", async () => {
  const invalid = [null, {}, [], { ...planning(), extra: "secret" }, { ...planning(), version: "v2" }, { ...planning(), mediumTermMonths: undefined }];
  for (const value of [0, "", "-1", "+1", "-0", "1e6", "01", "1.00", "1.001", "0." , " 1", "1 ", "NaN", "Infinity", "9".repeat(37), "9".repeat(500)]) invalid.push(planning(value));
  for (const value of [0, -1, 0.5, "6", NaN, Infinity, MAX_PERSONAL_MEDIUM_MONTHS + 1]) invalid.push(planning(null, value));
  for (const value of invalid) {
    assert.throws(() => validatePersonalPlanning(value));
    const candidate = { ...snapshot(), planning: value };
    assert.throws(() => decodePortfolioSnapshot(candidate));
    // JSON has no NaN/Infinity; it serializes those as null (explicit unknown).
    if (value?.mediumTermMonths !== Infinity && !Number.isNaN(value?.mediumTermMonths)) {
      assert.throws(() => parsePortfolioSaveInput(JSON.stringify({ ...candidate, expectedVersion: 2 })), error => error.code === "invalid_planning");
    }
    let requests = 0;
    await assert.rejects(saveUnifiedPortfolio(candidate, async () => { requests++; throw Error("must not request"); }));
    assert.equal(requests, 0);
  }
});

test("analysis consumes only declared cash and medium duration; no executable budget or double reserve", () => {
  const saved = { ...snapshot(), planning: planning("123.45", 9) };
  saved.preferences.liquidityReservePercent = "90";
  const before = structuredClone(saved), result = buildPersonalPortfolioAnalysis(saved, null, now);
  assert.equal(result.version, PERSONAL_PORTFOLIO_ANALYSIS_VERSION);
  assert.equal(result.source.planningVersion, saved.planning.version);
  assert.deepEqual(result.budget.cashRial, exact(2469, 2));
  assert.equal(result.budget.spendableRial, null);
  assert.equal(result.budget.prospectiveTradingCostRial, null);
  assert.deepEqual(result.budget.proposedSpendRial, exact(0));
  assert.deepEqual(result.budget.orders, []);
  assert.ok(result.horizons.every(row => row.budgetReference === result.budget.id && row.state === "no_decision"));
  assert.ok(result.horizons.every(row => !row.missingInputs.includes("cash_not_recorded") && row.missingInputs.includes("trading_inputs_missing")));
  assert.deepEqual(result.horizons.map(row => row.savedDuration), [{ value: "3", unit: "months" }, { value: "9", unit: "months" }]);
  assert.equal(result.horizons[1].missingInputs.includes("medium_horizon_missing"), false);
  assert.equal(result.financialUseAllowed, false); assert.equal(result.executionAllowed, false);
  assert.deepEqual(saved, before);
  assert.ok(buildPersonalPortfolioAnalysis({ ...saved, planning: planning("0", 9) }, null, now).horizons.every(row => !row.missingInputs.includes("cash_not_recorded")));
  const absent = buildPersonalPortfolioAnalysis(snapshot(), null, now);
  assert.equal(absent.source.planningVersion, null);
  assert.equal(absent.horizons[1].savedDuration, null);
  assert.ok(absent.horizons[1].missingInputs.includes("medium_horizon_missing"));
});

test("contradictory horizon order is disclosed, never rewritten or inferred from long-term", () => {
  for (const months of [1, 3]) {
    const saved = { ...snapshot(), planning: planning("1", months) };
    const result = buildPersonalPortfolioAnalysis(saved, null, now);
    assert.equal(result.horizons[1].savedDuration.value, String(months));
    assert.ok(result.horizons.every(row => row.missingInputs.includes("horizon_order_conflict")));
    assert.equal(saved.planning.mediumTermMonths, months);
  }
  const saved = { ...snapshot(), planning: planning(null, 9) };
  saved.preferences.shortTermMonths = "";
  const result = buildPersonalPortfolioAnalysis(saved, null, now);
  assert.ok(result.horizons[0].missingInputs.includes("short_horizon_missing"));
  assert.equal(result.horizons[1].missingInputs.includes("horizon_order_conflict"), false);
});

test("backup and save verification preserve planning exactly including an older draft omitting it", async () => {
  const current = { ...snapshot(), planning: planning("9007199254740993.01", 12) };
  assert.deepEqual(decodePersonalBackup(personalBackup(current, new Date(now).toISOString())), current);
  assert.equal(samePortfolioContent(current, snapshot()), false);
  const request = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(Object.hasOwn(payload, "planning"), false);
    return Response.json({ ok: true, snapshot: { ...current, version: 3 } });
  };
  assert.deepEqual(await saveUnifiedPortfolio(snapshot(), request), { ...current, version: 3 });
  const changed = { ...current, planning: planning("0", 15) };
  await assert.rejects(saveUnifiedPortfolio(changed, async () => Response.json({ ok: true, snapshot: { ...current, version: 3 } })));
  const saved = await saveUnifiedPortfolio(changed, async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body).planning, changed.planning);
    return Response.json({ ok: true, snapshot: { ...changed, version: 3 } });
  });
  assert.deepEqual(saved.planning, changed.planning);
});
