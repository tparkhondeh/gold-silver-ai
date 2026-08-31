import { createHash } from "node:crypto";

import type { SqlExecutor, TransactionRunner } from "./postgres-observation-repository.ts";

export type PortfolioHolding = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  costToman: number | null;
  purchaseDate: string | null;
  note: string;
};

export type PortfolioPreferences = {
  liquidityReservePercent: string;
  maxSingleAssetPercent: string;
  maxAcceptableDrawdownPercent: string;
  shortTermMonths: string;
  longTermYears: string;
  analysisHorizon: "short" | "long";
  decisionHorizon: "short" | "long";
};

export const emptyPortfolioPreferences: PortfolioPreferences = {
  liquidityReservePercent: "",
  maxSingleAssetPercent: "",
  maxAcceptableDrawdownPercent: "",
  shortTermMonths: "",
  longTermYears: "",
  analysisHorizon: "short",
  decisionHorizon: "short",
};

export type PortfolioSnapshot = { version: number; holdings: PortfolioHolding[]; preferences: PortfolioPreferences };

export class PortfolioVersionConflictError extends Error {
  constructor() {
    super("portfolio version conflict");
    this.name = "PortfolioVersionConflictError";
  }
}

type PortfolioRow = { id: string; version: number };
type HoldingRow = { id: string; asset_name: string; amount: string; unit: string; cost_toman: string | null; purchase_date: string | null; note: string };
type PreferenceRow = {
  liquidity_reserve_percent: string | null;
  max_single_asset_percent: string | null;
  max_acceptable_drawdown_percent: string | null;
  short_term_months: number | null;
  long_term_years: number | null;
  analysis_horizon: "short" | "long";
  decision_horizon: "short" | "long";
};

function portfolioId(subjectId: string) {
  return `portfolio_${createHash("sha256").update(subjectId).digest("hex").slice(0, 32)}`;
}

async function setSubject(executor: SqlExecutor, subjectId: string) {
  await executor.query("SELECT set_config('asha.subject_id', $1, true)", [subjectId]);
}

function toHolding(row: HoldingRow): PortfolioHolding {
  return {
    id: row.id,
    name: row.asset_name,
    amount: Number(row.amount),
    unit: row.unit,
    costToman: row.cost_toman === null ? null : Number(row.cost_toman),
    purchaseDate: row.purchase_date,
    note: row.note,
  };
}

function toPreferences(row: PreferenceRow | undefined): PortfolioPreferences {
  if (!row) return { ...emptyPortfolioPreferences };
  const compactDecimal = (value: string | null) => value === null ? "" : Number(value).toString();
  return {
    liquidityReservePercent: compactDecimal(row.liquidity_reserve_percent),
    maxSingleAssetPercent: compactDecimal(row.max_single_asset_percent),
    maxAcceptableDrawdownPercent: compactDecimal(row.max_acceptable_drawdown_percent),
    shortTermMonths: row.short_term_months?.toString() ?? "",
    longTermYears: row.long_term_years?.toString() ?? "",
    analysisHorizon: row.analysis_horizon,
    decisionHorizon: row.decision_horizon,
  };
}

export class PostgresPortfolioRepository {
  private readonly runner: TransactionRunner;

  constructor(runner: TransactionRunner) {
    this.runner = runner;
  }

  async load(subjectId: string): Promise<PortfolioSnapshot> {
    return this.runner.transaction(async (executor) => {
      await setSubject(executor, subjectId);
      const portfolio = await executor.query<PortfolioRow>("SELECT id, version FROM user_portfolios WHERE subject_id=$1", [subjectId]);
      const row = portfolio.rows?.[0];
      if (!row) return { version: 0, holdings: [], preferences: { ...emptyPortfolioPreferences } };
      const holdings = await executor.query<HoldingRow>(`
        SELECT id, asset_name, amount::text, unit, cost_toman::text, purchase_date, note
        FROM portfolio_holdings WHERE portfolio_id=$1 ORDER BY created_at, id
      `, [row.id]);
      const preferences = await executor.query<PreferenceRow>(`
        SELECT liquidity_reserve_percent::text, max_single_asset_percent::text,
          max_acceptable_drawdown_percent::text, short_term_months, long_term_years,
          analysis_horizon, decision_horizon
        FROM portfolio_preferences WHERE portfolio_id=$1
      `, [row.id]);
      return { version: row.version, holdings: (holdings.rows ?? []).map(toHolding), preferences: toPreferences(preferences.rows?.[0]) };
    });
  }

  async save(subjectId: string, expectedVersion: number, holdings: readonly PortfolioHolding[], preferences: PortfolioPreferences): Promise<PortfolioSnapshot> {
    return this.runner.transaction(async (executor) => {
      await setSubject(executor, subjectId);
      const id = portfolioId(subjectId);
      await executor.query("INSERT INTO user_portfolios (id, subject_id) VALUES ($1,$2) ON CONFLICT (subject_id) DO NOTHING", [id, subjectId]);
      const updated = await executor.query<PortfolioRow>(`
        UPDATE user_portfolios SET version=version+1, updated_at=clock_timestamp()
        WHERE subject_id=$1 AND version=$2 RETURNING id, version
      `, [subjectId, expectedVersion]);
      const portfolio = updated.rows?.[0];
      if (!portfolio) throw new PortfolioVersionConflictError();
      await executor.query("DELETE FROM portfolio_holdings WHERE portfolio_id=$1", [portfolio.id]);
      for (const holding of holdings) {
        await executor.query(`
          INSERT INTO portfolio_holdings (id, portfolio_id, asset_name, amount, unit, cost_toman, purchase_date, note)
          VALUES ($1,$2,$3,$4::numeric,$5,$6::numeric,$7,$8)
        `, [holding.id, portfolio.id, holding.name, holding.amount.toString(), holding.unit, holding.costToman?.toString() ?? null, holding.purchaseDate, holding.note]);
      }
      const optionalNumber = (value: string) => value === "" ? null : value;
      await executor.query(`
        INSERT INTO portfolio_preferences (
          portfolio_id, liquidity_reserve_percent, max_single_asset_percent,
          max_acceptable_drawdown_percent, short_term_months, long_term_years,
          analysis_horizon, decision_horizon
        ) VALUES ($1,$2::numeric,$3::numeric,$4::numeric,$5::smallint,$6::smallint,$7,$8)
        ON CONFLICT (portfolio_id) DO UPDATE SET
          liquidity_reserve_percent=EXCLUDED.liquidity_reserve_percent,
          max_single_asset_percent=EXCLUDED.max_single_asset_percent,
          max_acceptable_drawdown_percent=EXCLUDED.max_acceptable_drawdown_percent,
          short_term_months=EXCLUDED.short_term_months,
          long_term_years=EXCLUDED.long_term_years,
          analysis_horizon=EXCLUDED.analysis_horizon,
          decision_horizon=EXCLUDED.decision_horizon,
          updated_at=clock_timestamp()
      `, [portfolio.id, optionalNumber(preferences.liquidityReservePercent), optionalNumber(preferences.maxSingleAssetPercent), optionalNumber(preferences.maxAcceptableDrawdownPercent), optionalNumber(preferences.shortTermMonths), optionalNumber(preferences.longTermYears), preferences.analysisHorizon, preferences.decisionHorizon]);
      return { version: portfolio.version, holdings: [...holdings], preferences: { ...preferences } };
    });
  }
}

export const portfolioRepositoryInternals = { portfolioId };
