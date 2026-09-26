import { createManagedMarketService } from "../data/managed-market-service.ts";
import type { ManagedMarketCache } from "../data/managed-market-cache.ts";
import { PostgresNavasanQuotaLedger } from "../data/navasan-quota-ledger.ts";
import type { TransactionRunner } from "../data/postgres-observation-repository.ts";
import type { OwnerAuthorization } from "./owner-identity.ts";
import { createOwnerAuthorizedRunner, inspectOwnerIdentityBinding, OwnerAuthorizationError, type OwnerIdentityBinding } from "./postgres-owner-identity-store.ts";

type Input = {
  binding: OwnerIdentityBinding;
  runner: TransactionRunner;
  cache: ManagedMarketCache;
  environment: Readonly<Record<string, string | undefined>>;
  /** Mandatory injection: importing/constructing this module never selects a transport. */
  fetcher: typeof fetch;
  clock?: () => number;
};

/** Inactive server-only composition, not hosted-market activation. The caller must
 * separately establish the sole account quota authority/cutover, exact grants,
 * protected configuration and latest-only cache. No env, key or file reads here.
 * Mount only behind the existing owner's pre/post-response HTTP session gate.
 * Once a reservation commits, logout cannot refund or cancel that shared spend. */
export function createPrivateManagedMarketAdapter(input: Input) {
  const binding = inspectOwnerIdentityBinding(input.binding);
  if (typeof input.runner?.transaction !== "function" || typeof input.cache?.read !== "function"
    || typeof input.cache?.replace !== "function" || typeof input.fetcher !== "function"
    || (input.clock !== undefined && typeof input.clock !== "function")) throw Error("Private market dependency unavailable");
  const environment = Object.freeze({ ...input.environment });
  const runner: TransactionRunner = Object.freeze({ transaction: input.runner.transaction.bind(input.runner) });
  const cache = Object.freeze({ read: input.cache.read.bind(input.cache), replace: input.cache.replace.bind(input.cache) });
  const fetcher = input.fetcher, clock = input.clock ?? Date.now;
  const outcomeRunner: TransactionRunner = {
    transaction(work) {
      return runner.transaction(async database => {
        await database.query("SET LOCAL lock_timeout = '3s'");
        await database.query("SET LOCAL statement_timeout = '5s'");
        await database.query("SET LOCAL idle_in_transaction_session_timeout = '5s'");
        return work(database);
      });
    },
  };
  const outcomes = new PostgresNavasanQuotaLedger(outcomeRunner);
  return Object.freeze({
    async latest(proof: OwnerAuthorization) {
      const authorized = createOwnerAuthorizedRunner(runner, proof, binding);
      // Cached/disabled responses also need a live owner at entry. This short
      // check is released before file/provider work; reserve checks again later.
      await authorized.transaction(async () => undefined);
      const admissions = new PostgresNavasanQuotaLedger(authorized);
      let denied: OwnerAuthorizationError | null = null;
      // A fresh service closure per invocation must never reuse another caller's
      // proof/in-flight result. The existing DB lock and cadence deduplicate spend.
      const latest = createManagedMarketService({ environment, cache, fetcher, clock,
        resolveLedger: async () => ({ available: true, ledger: {
          async reserve(endpoint, fingerprint, cadence) {
            try { return await admissions.reserve(endpoint, fingerprint, cadence); }
            catch (error) { if (error instanceof OwnerAuthorizationError) denied = error; throw error; }
          },
          recordLatestOutcome: input => outcomes.recordLatestOutcome(input),
        } }),
      });
      const response = await latest();
      // The shared service safely catches ledger failures, but a known rejected
      // owner proof must not be converted into a cached adapter success.
      if (denied) throw denied;
      return response;
    },
  });
}
