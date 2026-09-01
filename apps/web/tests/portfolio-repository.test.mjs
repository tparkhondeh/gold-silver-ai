import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyPortfolioPreferences,
  portfolioRepositoryInternals,
  PortfolioVersionConflictError,
  PostgresPortfolioRepository,
} from "../data/postgres-portfolio-repository.ts";

function createRunner(resolveQuery) {
  const calls = [];
  const executor = {
    async query(sql, parameters = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: normalized, parameters });
      return resolveQuery(normalized, parameters);
    },
  };
  return {
    calls,
    runner: {
      async transaction(work) {
        return work(executor);
      },
    },
  };
}

test("portfolio repository returns an explicit empty owner snapshot", async () => {
  const { runner, calls } = createRunner((sql) => {
    if (sql.includes("set_config")) return { rows: [] };
    if (sql.includes("FROM user_portfolios")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const repository = new PostgresPortfolioRepository(runner);

  assert.deepEqual(await repository.load("owner-a"), {
    version: 0,
    holdings: [],
    preferences: emptyPortfolioPreferences,
  });
  assert.deepEqual(calls[0].parameters, ["owner-a"]);
  assert.equal(calls.length, 2);
});

test("portfolio repository restores exact holdings and compact owner preferences", async () => {
  const { runner } = createRunner((sql) => {
    if (sql.includes("set_config")) return { rows: [] };
    if (sql.includes("SELECT id, version FROM user_portfolios")) {
      return { rows: [{ id: "portfolio-a", version: 7 }] };
    }
    if (sql.includes("FROM portfolio_holdings")) {
      return { rows: [{ id: "gold-1", asset_name: "طلای ۱۸ عیار", amount: "2.500000000000", unit: "گرم", cost_toman: "25000000.00", purchase_date: "1405-06-09", note: "شخصی" }] };
    }
    if (sql.includes("FROM portfolio_preferences")) {
      return { rows: [{ liquidity_reserve_percent: "20.0000", max_single_asset_percent: null, max_acceptable_drawdown_percent: "12.5000", short_term_months: 6, long_term_years: null, analysis_horizon: "long", decision_horizon: "short" }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const repository = new PostgresPortfolioRepository(runner);

  assert.deepEqual(await repository.load("owner-a"), {
    version: 7,
    holdings: [{ id: "gold-1", name: "طلای ۱۸ عیار", amount: 2.5, unit: "گرم", costToman: 25000000, purchaseDate: "1405-06-09", note: "شخصی" }],
    preferences: {
      liquidityReservePercent: "20",
      maxSingleAssetPercent: "",
      maxAcceptableDrawdownPercent: "12.5",
      shortTermMonths: "6",
      longTermYears: "",
      analysisHorizon: "long",
      decisionHorizon: "short",
    },
  });
});

test("portfolio repository saves holdings and preferences in one versioned transaction", async () => {
  const subjectId = "owner-a";
  const expectedPortfolioId = portfolioRepositoryInternals.portfolioId(subjectId);
  const { runner, calls } = createRunner((sql) => {
    if (sql.includes("UPDATE user_portfolios")) return { rows: [{ id: expectedPortfolioId, version: 3 }] };
    return { rows: [], rowCount: 1 };
  });
  const repository = new PostgresPortfolioRepository(runner);
  const holdings = [{ id: "silver-1", name: "نقره", amount: 12.5, unit: "گرم", costToman: null, purchaseDate: null, note: "آزمایشی" }];
  const preferences = {
    liquidityReservePercent: "20",
    maxSingleAssetPercent: "35",
    maxAcceptableDrawdownPercent: "10",
    shortTermMonths: "6",
    longTermYears: "4",
    analysisHorizon: "long",
    decisionHorizon: "short",
  };

  assert.deepEqual(await repository.save(subjectId, 2, holdings, preferences), {
    version: 3,
    holdings,
    preferences,
  });
  assert.deepEqual(calls[0].parameters, [subjectId]);
  assert.ok(calls.some((call) => call.sql.startsWith("DELETE FROM portfolio_holdings")));
  const holdingInsert = calls.find((call) => call.sql.includes("INSERT INTO portfolio_holdings"));
  assert.deepEqual(holdingInsert.parameters, ["silver-1", expectedPortfolioId, "نقره", "12.5", "گرم", null, null, "آزمایشی"]);
  const preferencesInsert = calls.find((call) => call.sql.includes("INSERT INTO portfolio_preferences"));
  assert.deepEqual(preferencesInsert.parameters, [expectedPortfolioId, "20", "35", "10", "6", "4", "long", "short"]);
});

test("portfolio repository rejects a stale version before replacing holdings", async () => {
  const { runner, calls } = createRunner((sql) => {
    if (sql.includes("UPDATE user_portfolios")) return { rows: [] };
    return { rows: [], rowCount: 1 };
  });
  const repository = new PostgresPortfolioRepository(runner);

  await assert.rejects(
    repository.save("owner-a", 99, [], emptyPortfolioPreferences),
    PortfolioVersionConflictError,
  );
  assert.equal(calls.some((call) => call.sql.startsWith("DELETE FROM portfolio_holdings")), false);
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO portfolio_preferences")), false);
});
