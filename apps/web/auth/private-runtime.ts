import type { IdentityAdapter } from "./owner-identity.ts";
import { createOwnerIdentityGate } from "./owner-identity.ts";
import { createOwnerAuthorizedRunner, inspectOwnerIdentityBinding, PostgresOwnerIdentityStore, type OwnerIdentityBinding } from "./postgres-owner-identity-store.ts";
import { PostgresPortfolioRepository } from "../data/postgres-portfolio-repository.ts";
import type { TransactionRunner } from "../data/postgres-observation-repository.ts";
import { createPrivatePortfolioHandlers } from "./private-portfolio.ts";
import { createPrivateApplication } from "./private-application.ts";

/** Server-only composition; no env/credential loading, enrollment or local portfolio migration. */
export function createPrivatePortfolioRuntime(input: { binding: OwnerIdentityBinding; adapter: IdentityAdapter; runner: TransactionRunner; release: string; publicUi: (request: Request) => Promise<Response> }) {
  const binding = inspectOwnerIdentityBinding(input.binding);
  if (input.adapter.issuer !== binding.issuer) throw new Error("Private issuer binding mismatch");
  const store = new PostgresOwnerIdentityStore(input.runner, binding);
  const gate = createOwnerIdentityGate({ origin: binding.origin, ownerSubject: binding.ownerSubject, adapter: input.adapter, store });
  return createPrivateApplication({ origin: binding.origin, release: input.release, gate, publicUi: input.publicUi,
    async portfolio(request, proof) {
      const repository = new PostgresPortfolioRepository(createOwnerAuthorizedRunner(input.runner, proof, binding));
      const bound = createPrivatePortfolioHandlers({ origin: binding.origin, repository: {
        load: () => repository.load(binding.portfolioSubject),
        save: (version, holdings, preferences, book) => repository.save(binding.portfolioSubject, version, holdings, preferences, book),
      } });
      if (new URL(request.url).pathname === "/api/portfolio/export") return bound.export(request);
      if (request.method === "GET") return bound.get(request);
      if (request.method === "PUT") return bound.put(request);
      return Response.json({ error: "method_unavailable" }, { status: 405 });
    },
  });
}
