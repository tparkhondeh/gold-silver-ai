import { createHash } from "node:crypto";
import type { SqlExecutor, TransactionRunner } from "../data/postgres-observation-repository.ts";
import type { LoginTransaction, OwnerAuthorization, OwnerIdentityStore, OwnerSession } from "./owner-identity.ts";

export type OwnerIdentityBinding = Readonly<{ origin: string; issuer: string; ownerSubject: string; portfolioSubject: string }>;
export class OwnerAuthorizationError extends Error {
  constructor() { super("Owner authorization is unavailable or expired"); this.name = "OwnerAuthorizationError"; }
}

const opaqueHash = /^[A-Za-z0-9_-]{43}$/;
const identitySubject = /^[\x21-\x7E]{1,255}$/;
export function inspectOwnerIdentityBinding(binding: OwnerIdentityBinding): OwnerIdentityBinding {
  if (!binding || [binding.origin, binding.issuer, binding.ownerSubject, binding.portfolioSubject].some(value => typeof value !== "string")) throw new Error("Invalid private identity binding");
  const origin = new URL(binding.origin), issuer = new URL(binding.issuer);
  if (origin.origin !== binding.origin || origin.protocol !== "https:" || origin.username || origin.password || binding.origin.length > 2048
    || issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash || binding.issuer.length > 2048
    || !identitySubject.test(binding.ownerSubject) || !/^[A-Za-z0-9_.:-]{1,200}$/.test(binding.portfolioSubject) || binding.portfolioSubject === "local-owner-v1") throw new Error("Invalid private identity binding");
  return Object.freeze({ origin: binding.origin, issuer: binding.issuer, ownerSubject: binding.ownerSubject, portfolioSubject: binding.portfolioSubject });
}
export function identityBindingHash(input: OwnerIdentityBinding): string {
  const binding = inspectOwnerIdentityBinding(input);
  return createHash("sha256").update(JSON.stringify(["asha.private_identity.v1", binding.origin, binding.issuer, binding.ownerSubject, binding.portfolioSubject])).digest("hex");
}
function validKey(key: string) { if (typeof key !== "string" || !opaqueHash.test(key)) throw new OwnerAuthorizationError(); }
function iso(now: number) {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isFinite(new Date(now).getTime())) throw new OwnerAuthorizationError();
  return new Date(now).toISOString();
}
function validLifetime(value: { createdAt: number; expiresAt: number }, now: number, maximum: number) {
  iso(value.createdAt); iso(value.expiresAt); iso(now);
  if (value.createdAt > now || value.expiresAt <= now || value.expiresAt - value.createdAt > maximum) throw new OwnerAuthorizationError();
}
function milliseconds(value: unknown) {
  const result = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(result) || result < 0) throw new OwnerAuthorizationError();
  return result;
}
async function setBinding(executor: SqlExecutor, hash: string) {
  await executor.query("SET LOCAL lock_timeout = '3s'");
  await executor.query("SET LOCAL statement_timeout = '5s'");
  await executor.query("SET LOCAL idle_in_transaction_session_timeout = '5s'");
  await executor.query("SELECT set_config('asha.identity_binding', $1, true)", [hash]);
}
async function capacity(executor: SqlExecutor, table: "private_owner_login_transactions" | "private_owner_sessions", hash: string, limit: number) {
  // Fixed table allowlist, never caller input. Serializes cleanup/count/insert across workers.
  await executor.query(`DELETE FROM ${table} WHERE binding_hash=$1 AND expires_at <= clock_timestamp()`, [hash]);
  const result = await executor.query<{ count: number }>(`SELECT count(*)::integer AS count FROM ${table} WHERE binding_hash=$1`, [hash]);
  if (!Number.isSafeInteger(result.rows?.[0]?.count) || result.rows![0].count >= limit) throw new Error("Identity capacity reached");
}

type SessionRow = { issuer: string; subject: string; created_at: Date | string; expires_at: Date | string };
type LoginRow = { state: string; nonce: string; pkce_verifier: string; created_at: Date | string; expires_at: Date | string; claimed: boolean };

/** Bounded shared PostgreSQL storage. No raw cookie or OAuth token is retained. */
export class PostgresOwnerIdentityStore implements OwnerIdentityStore {
  private readonly runner: TransactionRunner;
  private readonly binding: OwnerIdentityBinding;
  private readonly bindingHash: string;
  private readonly capacity: number;
  constructor(runner: TransactionRunner, binding: OwnerIdentityBinding, maximum = 256) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 4096) throw new Error("Invalid identity capacity");
    this.runner = runner; this.binding = inspectOwnerIdentityBinding(binding); this.bindingHash = identityBindingHash(this.binding); this.capacity = maximum;
  }
  private transaction<T>(work: (executor: SqlExecutor) => Promise<T>) {
    return this.runner.transaction(async executor => { await setBinding(executor, this.bindingHash); return work(executor); });
  }
  async putTransaction(key: string, input: LoginTransaction, now: number): Promise<void> {
    validKey(key); const value = { ...input }; validLifetime(value, now, 5 * 60_000);
    if (![value.state, value.nonce, value.codeVerifier].every(item => typeof item === "string" && opaqueHash.test(item)) || value.claimed !== false) throw new OwnerAuthorizationError();
    await this.transaction(async executor => {
      await executor.query("SELECT pg_advisory_xact_lock(174228532, 7)");
      await capacity(executor, "private_owner_login_transactions", this.bindingHash, this.capacity);
      const inserted = await executor.query(`INSERT INTO private_owner_login_transactions
        (hash,binding_hash,origin,issuer,subject,state,nonce,pkce_verifier,created_at,expires_at,claimed)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,false
        WHERE $9::timestamptz <= clock_timestamp() AND $10::timestamptz > clock_timestamp()
        RETURNING hash`, [key, this.bindingHash, this.binding.origin, this.binding.issuer, this.binding.ownerSubject, value.state, value.nonce, value.codeVerifier, iso(value.createdAt), iso(value.expiresAt)]);
      if (inserted.rowCount !== 1) throw new OwnerAuthorizationError();
    });
  }
  async claimTransaction(key: string, now: number): Promise<LoginTransaction | null> {
    validKey(key); const at = iso(now);
    return this.transaction(async executor => {
      const result = await executor.query<LoginRow>(`UPDATE private_owner_login_transactions SET claimed=true
        WHERE hash=$1 AND binding_hash=$2 AND origin=$3 AND issuer=$4 AND subject=$5 AND claimed=false
          AND created_at <= clock_timestamp() AND expires_at > clock_timestamp()
          AND created_at <= $6::timestamptz AND expires_at > $6::timestamptz
        RETURNING state,nonce,pkce_verifier,created_at,expires_at,claimed`, [key, this.bindingHash, this.binding.origin, this.binding.issuer, this.binding.ownerSubject, at]);
      const row = result.rows?.[0];
      if (!row) return null;
      if (![row.state, row.nonce, row.pkce_verifier].every(item => typeof item === "string" && opaqueHash.test(item)) || row.claimed !== true) throw new OwnerAuthorizationError();
      const value = { state: row.state, nonce: row.nonce, codeVerifier: row.pkce_verifier, createdAt: milliseconds(row.created_at), expiresAt: milliseconds(row.expires_at), claimed: true };
      validLifetime(value, now, 5 * 60_000); return value;
    });
  }
  async completeLogin(transactionKey: string, sessionKey: string, input: OwnerSession, previousSessionKey: string | null, now: number): Promise<boolean> {
    validKey(transactionKey); validKey(sessionKey); if (previousSessionKey !== null) validKey(previousSessionKey);
    const value = { ...input }; validLifetime(value, now, 8 * 60 * 60_000);
    if (value.issuer !== this.binding.issuer || value.subject !== this.binding.ownerSubject) throw new OwnerAuthorizationError();
    return this.transaction(async executor => {
      await executor.query("SELECT pg_advisory_xact_lock(174228532, 7)");
      const pending = await executor.query(`SELECT hash FROM private_owner_login_transactions
        WHERE hash=$1 AND binding_hash=$2 AND origin=$3 AND issuer=$4 AND subject=$5 AND claimed=true
          AND created_at <= clock_timestamp() AND expires_at > clock_timestamp()
          AND created_at <= $6::timestamptz AND expires_at > $6::timestamptz FOR UPDATE`,
      [transactionKey, this.bindingHash, this.binding.origin, this.binding.issuer, this.binding.ownerSubject, iso(now)]);
      if (pending.rowCount !== 1) return false;
      if (previousSessionKey) await executor.query("DELETE FROM private_owner_sessions WHERE hash=$1 AND binding_hash=$2", [previousSessionKey, this.bindingHash]);
      await capacity(executor, "private_owner_sessions", this.bindingHash, this.capacity);
      const inserted = await executor.query(`INSERT INTO private_owner_sessions
        (hash,binding_hash,login_transaction_hash,origin,issuer,subject,portfolio_subject,created_at,expires_at)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz
        FROM private_owner_login_transactions
        WHERE hash=$3 AND binding_hash=$2 AND claimed=true
          AND created_at <= clock_timestamp() AND expires_at > clock_timestamp()
          AND $8::timestamptz <= clock_timestamp() AND $9::timestamptz > clock_timestamp()
        RETURNING hash`, [sessionKey, this.bindingHash, transactionKey, this.binding.origin, this.binding.issuer, this.binding.ownerSubject, this.binding.portfolioSubject, iso(value.createdAt), iso(value.expiresAt)]);
      if (inserted.rowCount !== 1) throw new OwnerAuthorizationError();
      await executor.query("DELETE FROM private_owner_login_transactions WHERE hash=$1 AND binding_hash=$2", [transactionKey, this.bindingHash]);
      return true;
    });
  }
  async deleteTransaction(key: string): Promise<void> {
    validKey(key);
    await this.transaction(async executor => { await executor.query("DELETE FROM private_owner_login_transactions WHERE hash=$1 AND binding_hash=$2", [key, this.bindingHash]); });
  }
  async getSession(key: string, now: number): Promise<OwnerSession | null> {
    validKey(key); const at = iso(now);
    return this.transaction(async executor => {
      const result = await executor.query<SessionRow>(`SELECT issuer,subject,created_at,expires_at FROM private_owner_sessions
        WHERE hash=$1 AND binding_hash=$2 AND origin=$3 AND issuer=$4 AND subject=$5 AND portfolio_subject=$6
          AND created_at <= clock_timestamp() AND expires_at > clock_timestamp()
          AND created_at <= $7::timestamptz AND expires_at > $7::timestamptz`,
      [key, this.bindingHash, this.binding.origin, this.binding.issuer, this.binding.ownerSubject, this.binding.portfolioSubject, at]);
      const row = result.rows?.[0]; if (!row) return null;
      if (row.issuer !== this.binding.issuer || row.subject !== this.binding.ownerSubject) throw new OwnerAuthorizationError();
      const value = { issuer: row.issuer, subject: row.subject, createdAt: milliseconds(row.created_at), expiresAt: milliseconds(row.expires_at) };
      validLifetime(value, now, 8 * 60 * 60_000); return value;
    });
  }
  async revokeBrowser(sessionKey: string | null, transactionKey: string | null): Promise<void> {
    if (sessionKey !== null) validKey(sessionKey); if (transactionKey !== null) validKey(transactionKey);
    if (sessionKey === null && transactionKey === null) return;
    await this.transaction(async executor => {
      // Same lock order as completion. The second statement sees a callback that
      // committed while DELETE waited, including its not-yet-delivered cookie.
      if (transactionKey) await executor.query("DELETE FROM private_owner_login_transactions WHERE hash=$1 AND binding_hash=$2", [transactionKey, this.bindingHash]);
      await executor.query("DELETE FROM private_owner_sessions WHERE binding_hash=$1 AND (hash=$2 OR login_transaction_hash=$3)", [this.bindingHash, sessionKey, transactionKey]);
    });
  }
}

/** Wrap only database work: parse/validate request bodies and finish network calls first.
 * A session SHARE lock orders commits against logout's DELETE. If save wins the
 * lock, it may commit before logout returns; a later HTTP denial is not rollback.
 */
export function createOwnerAuthorizedRunner(runner: TransactionRunner, input: OwnerAuthorization, configuredBinding: OwnerIdentityBinding): TransactionRunner {
  const binding = inspectOwnerIdentityBinding(configuredBinding), bindingHash = identityBindingHash(binding), proof = Object.freeze({ ...input });
  validKey(proof.sessionHash);
  if (proof.issuer !== binding.issuer || proof.subject !== binding.ownerSubject) throw new OwnerAuthorizationError();
  const parameters = [proof.sessionHash, bindingHash, binding.origin, binding.issuer, binding.ownerSubject, binding.portfolioSubject];
  const activeSession = `SELECT hash FROM private_owner_sessions
    WHERE hash=$1 AND binding_hash=$2 AND origin=$3 AND issuer=$4 AND subject=$5 AND portfolio_subject=$6
      AND created_at <= clock_timestamp() AND expires_at > clock_timestamp()`;
  return {
    transaction<T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T> {
      return runner.transaction(async executor => {
        await setBinding(executor, bindingHash);
        if ((await executor.query(`${activeSession} FOR SHARE`, parameters)).rowCount !== 1) throw new OwnerAuthorizationError();
        await executor.query("SELECT set_config('asha.subject_id', $1, true)", [binding.portfolioSubject]);
        const result = await work(executor);
        if ((await executor.query(`${activeSession}
          AND current_setting('asha.identity_binding',true)=$2
          AND current_setting('asha.subject_id',true)=$6`, parameters)).rowCount !== 1) throw new OwnerAuthorizationError();
        return result;
      });
    },
  };
}
