import { createHash } from "node:crypto";

import type { TransactionRunner } from "./postgres-observation-repository.ts";

type Currency = "IRR" | "TOMAN" | "USD";
type TransactionKind = "trade" | "transfer" | "income" | "fee" | "adjustment";

export type TransactionEventInput = {
  subjectId: string;
  eventKind: TransactionKind;
  assetKey: string;
  quantityDelta: string | null;
  quantityUnit: string | null;
  cashDelta: string | null;
  cashCurrency: Currency | null;
  feeAmount: string;
  occurredAt: string;
  correctionOf: string | null;
  correctionReason: string | null;
  evidenceHash: string | null;
};

export type ValuationPositionInput = {
  positionKey: string;
  assetKey: string;
  quantity: string;
  unit: string;
  observationId: string;
  price: string;
  value: string;
};

export type ValuationSnapshotInput = {
  subjectId: string;
  portfolioVersion: number;
  asOf: string;
  dataset: { entityId: string; version: number };
  methodology: { entityId: string; version: number };
  reportingCurrency: Currency;
  totalValue: string;
  positions: ValuationPositionInput[];
  transactionIds: string[];
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function decimal(value: string, scale: number, allowNegative: boolean, allowZero: boolean) {
  const match = value.trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match || (!allowNegative && match[1]) || (match[3]?.length ?? 0) > scale) throw new Error("ledger decimal is invalid");
  const integer = match[2].replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  const zero = /^0+$/.test(integer) && fraction.length === 0;
  if (!allowZero && zero) throw new Error("ledger decimal must be non-zero");
  return `${match[1] && !zero ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

function instant(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("ledger timestamp is invalid");
  return parsed.toISOString();
}

function assetKey(value: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(value)) throw new Error("ledger asset key is invalid");
  return value;
}

export function buildTransactionEvent(input: TransactionEventInput) {
  if (!input.subjectId || input.subjectId.length > 200) throw new Error("ledger subject is invalid");
  const quantityDelta = input.quantityDelta === null ? null : decimal(input.quantityDelta, 12, true, false);
  const cashDelta = input.cashDelta === null ? null : decimal(input.cashDelta, 2, true, false);
  const feeAmount = decimal(input.feeAmount, 2, false, true);
  if ((quantityDelta === null) !== (input.quantityUnit === null) || (!quantityDelta && !cashDelta)) throw new Error("ledger deltas are incomplete");
  if ((cashDelta === null && feeAmount === "0") !== (input.cashCurrency === null)) throw new Error("ledger cash currency is incomplete");
  const correctionReason = input.correctionReason?.trim() || null;
  if ((input.correctionOf === null && correctionReason !== null) || (input.correctionOf !== null && (!correctionReason || correctionReason.length < 3 || correctionReason.length > 500))) throw new Error("ledger correction reason is invalid");
  if (input.evidenceHash !== null && !/^[a-f0-9]{64}$/.test(input.evidenceHash)) throw new Error("ledger evidence hash is invalid");
  const payload = { ...input, assetKey: assetKey(input.assetKey), quantityDelta, cashDelta, feeAmount, occurredAt: instant(input.occurredAt), correctionReason };
  const payloadHash = hash(payload);
  return { ...payload, id: `transaction_${payloadHash}`, payloadHash };
}

function fixedMinor(value: string) {
  const normalized = decimal(value, 2, false, true);
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * BigInt(100) + BigInt((fraction + "00").slice(0, 2));
}

export function buildValuationSnapshot(input: ValuationSnapshotInput) {
  if (!input.subjectId || input.subjectId.length > 200 || input.positions.length === 0 || new Set(input.positions.map((position) => position.positionKey)).size !== input.positions.length || new Set(input.transactionIds).size !== input.transactionIds.length) throw new Error("valuation membership is invalid");
  if (!Number.isInteger(input.portfolioVersion) || input.portfolioVersion < 0 || input.dataset.version < 1 || input.methodology.version < 1) throw new Error("valuation version is invalid");
  if (input.transactionIds.some((id) => !/^transaction_[a-f0-9]{64}$/.test(id))) throw new Error("valuation transaction reference is invalid");
  const positions = input.positions.map((position) => {
    if (position.positionKey.length < 1 || position.positionKey.length > 120 || position.unit.length < 1 || position.unit.length > 40 || !/^obs_[a-f0-9]{64}$/.test(position.observationId)) throw new Error("valuation position contract is invalid");
    const canonical = {
      ...position,
      assetKey: assetKey(position.assetKey),
      quantity: decimal(position.quantity, 12, false, false),
      price: decimal(position.price, 12, false, false),
      value: decimal(position.value, 2, false, true),
    };
    return { ...canonical, inputHash: hash({ assetKey: canonical.assetKey, quantity: canonical.quantity, unit: canonical.unit, observationId: canonical.observationId, price: canonical.price }) };
  }).sort((left, right) => left.positionKey.localeCompare(right.positionKey));
  const totalValue = decimal(input.totalValue, 2, false, true);
  if (positions.reduce((sum, position) => sum + fixedMinor(position.value), BigInt(0)) !== fixedMinor(totalValue)) throw new Error("valuation total does not equal position values");
  const canonical = { ...input, asOf: instant(input.asOf), totalValue, positions, transactionIds: [...input.transactionIds].sort() };
  const inputHash = hash({
    ...canonical,
    totalValue: undefined,
    positions: positions.map((position) => ({
      positionKey: position.positionKey,
      assetKey: position.assetKey,
      quantity: position.quantity,
      unit: position.unit,
      observationId: position.observationId,
      price: position.price,
      inputHash: position.inputHash,
    })),
  });
  const outputHash = hash({ totalValue, values: positions.map((position) => ({ positionKey: position.positionKey, value: position.value })) });
  const id = `valuation_${hash({ inputHash, outputHash })}`;
  return { ...canonical, id, inputHash, outputHash };
}

async function setSubject(executor: { query(sql: string, parameters?: readonly unknown[]): Promise<unknown> }, subjectId: string) {
  await executor.query("SELECT set_config('asha.subject_id',$1,true)", [subjectId]);
}

export class PostgresPortfolioLedgerRepository {
  private readonly runner: TransactionRunner;
  constructor(runner: TransactionRunner) { this.runner = runner; }

  async recordTransaction(input: TransactionEventInput) {
    const event = buildTransactionEvent(input);
    return this.runner.transaction(async (executor) => {
      await setSubject(executor, event.subjectId);
      const result = await executor.query(`INSERT INTO portfolio_transaction_events (
        id,subject_id,event_kind,asset_key,quantity_delta,quantity_unit,cash_delta,cash_currency,
        fee_amount,occurred_at,correction_of,correction_reason,evidence_hash,payload_hash
      ) VALUES ($1,$2,$3,$4,$5::numeric,$6,$7::numeric,$8,$9::numeric,$10,$11,$12,$13,$14)
      ON CONFLICT (id) DO NOTHING`, [event.id,event.subjectId,event.eventKind,event.assetKey,event.quantityDelta,event.quantityUnit,event.cashDelta,event.cashCurrency,event.feeAmount,event.occurredAt,event.correctionOf,event.correctionReason,event.evidenceHash,event.payloadHash]);
      return { id: event.id, alreadyRecorded: result.rowCount === 0 };
    });
  }

  async recordValuation(input: ValuationSnapshotInput) {
    const snapshot = buildValuationSnapshot(input);
    return this.runner.transaction(async (executor) => {
      await setSubject(executor, snapshot.subjectId);
      const existing = await executor.query<{ input_hash: string; output_hash: string }>("SELECT input_hash,output_hash FROM portfolio_valuation_snapshots WHERE id=$1", [snapshot.id]);
      if (existing.rows?.[0]) {
        if (existing.rows[0].input_hash !== snapshot.inputHash || existing.rows[0].output_hash !== snapshot.outputHash) throw new Error("valuation replay fingerprint differs");
        return { id: snapshot.id, alreadyRecorded: true, inputHash: snapshot.inputHash, outputHash: snapshot.outputHash };
      }
      const portfolio = await executor.query<{ version: number }>("SELECT version FROM user_portfolios WHERE subject_id=$1", [snapshot.subjectId]);
      if (portfolio.rows?.[0]?.version !== snapshot.portfolioVersion) throw new Error("valuation portfolio version is unavailable");
      const observationIds = snapshot.positions.map((position) => position.observationId);
      const known = await executor.query<{ count: number }>(`SELECT count(*)::integer AS count FROM observations o
        JOIN dataset_observations d ON d.observation_id=o.id AND d.dataset_id=$3 AND d.dataset_version=$4
        WHERE o.id=ANY($1::text[]) AND greatest(o.observed_at,COALESCE(o.published_at,o.observed_at),o.collected_at) <= $2::timestamptz`, [observationIds,snapshot.asOf,snapshot.dataset.entityId,snapshot.dataset.version]);
      if (known.rows?.[0]?.count !== observationIds.length) throw new Error("valuation observation is unavailable at the cutoff");
      const result = await executor.query(`INSERT INTO portfolio_valuation_snapshots (
        id,subject_id,portfolio_version,as_of,dataset_id,dataset_version,methodology_id,methodology_version,
        reporting_currency,total_value,input_hash,output_hash,status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::numeric,$11,$12,'evaluation_only') ON CONFLICT (id) DO NOTHING`,
      [snapshot.id,snapshot.subjectId,snapshot.portfolioVersion,snapshot.asOf,snapshot.dataset.entityId,snapshot.dataset.version,snapshot.methodology.entityId,snapshot.methodology.version,snapshot.reportingCurrency,snapshot.totalValue,snapshot.inputHash,snapshot.outputHash]);
      for (const position of snapshot.positions) await executor.query(`INSERT INTO portfolio_valuation_positions (
        valuation_id,position_key,asset_key,quantity,unit,observation_id,price,value,input_hash
      ) VALUES ($1,$2,$3,$4::numeric,$5,$6,$7::numeric,$8::numeric,$9) ON CONFLICT DO NOTHING`,
      [snapshot.id,position.positionKey,position.assetKey,position.quantity,position.unit,position.observationId,position.price,position.value,position.inputHash]);
      for (const transactionId of snapshot.transactionIds) await executor.query("INSERT INTO portfolio_valuation_transactions (valuation_id,transaction_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [snapshot.id,transactionId]);
      return { id: snapshot.id, alreadyRecorded: result.rowCount === 0, inputHash: snapshot.inputHash, outputHash: snapshot.outputHash };
    });
  }
}
