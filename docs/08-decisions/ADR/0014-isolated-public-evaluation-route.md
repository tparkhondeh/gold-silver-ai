# 0014. Isolated public evaluation route; final-stage owner activation

Status: Accepted under explicit owner instruction
Date: 2026-09-23

## Context and decision

The owner explicitly deferred bootstrap issuance and passkey enrollment until
final acceptance and authorized a no-login evaluation path on the existing domain.
This changes the activation sequence, not ADR0013's private identity boundary.

Expose only exact GET `/evaluation` through the existing production gateway.
Reuse the existing purchase editor, Excel preview/import, validation, exact cost
calculations and valuation components. Do not build a second financial laboratory
or disable authorization on the private workspace to make it reachable.

The evaluation wrapper starts empty and handles clearly nonprivate test records
only. Its versioned sessionStorage namespace is separate from every existing
private/local portfolio, draft and market key. It neither reads those stores nor
calls portfolio, identity, operator or market APIs. Even an authenticated owner
visiting this route must not silently load or change the private portfolio.

## Alternatives and rationale

- Removing private authorization would expose information and writes: rejected.
- A public shared database would create privacy, abuse and ownership risks and
  unnecessary persistence work: rejected.
- A thin isolated browser wrapper around existing product components allows
  useful purchase/import/math testing without private credentials: selected.

## Consequences

Same-tab reload persistence is not a durable backup or cross-device sync. Say this
briefly in the page; storage denial/corruption must be explicit and never overwrite
unreadable data. Never import existing personal information automatically.
Real market prices are unavailable on this route: no copied provider key, private
cache, invented quote or purchase-price substitute. Current valuation and decisions
must report missing inputs; financial methods and the financial-use lock stay intact.

Preserve login implementation and tests. Final acceptance still requires actual
owner enrollment/login/logout, unauthorized denial, authenticated persistence,
second-device recovery and tested backup/recovery. Public review is neither private
readiness nor financial validation. Deployment must retain normal backup, capacity,
exact-SHA CI and rollback gates; no bypass is authorized by this decision.

Current execution and evidence: [September23 checkpoint](../../10-project-state/PUBLIC_EVALUATION_2026-09-23.md).
