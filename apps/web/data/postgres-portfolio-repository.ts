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

export type PortfolioSnapshot = { version: number; holdings: PortfolioHolding[] };

export class PortfolioVersionConflictError extends Error {
  constructor() {
    super("portfolio version conflict");
    this.name = "PortfolioVersionConflictError";
  }
}

type PortfolioRow = { id: string; version: number };
type HoldingRow = { id: string; asset_name: string; amount: string; unit: string; cost_toman: string | null; purchase_date: string | null; note: string };

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
      if (!row) return { version: 0, holdings: [] };
      const holdings = await executor.query<HoldingRow>(`
        SELECT id, asset_name, amount::text, unit, cost_toman::text, purchase_date, note
        FROM portfolio_holdings WHERE portfolio_id=$1 ORDER BY created_at, id
      `, [row.id]);
      return { version: row.version, holdings: (holdings.rows ?? []).map(toHolding) };
    });
  }

  async save(subjectId: string, expectedVersion: number, holdings: readonly PortfolioHolding[]): Promise<PortfolioSnapshot> {
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
      return { version: portfolio.version, holdings: [...holdings] };
    });
  }
}

export const portfolioRepositoryInternals = { portfolioId };
