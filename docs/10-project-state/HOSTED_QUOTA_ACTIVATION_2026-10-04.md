# October 4 hosted quota-authority cutover

## Scope and starting evidence

Continue from [the completed approved key delivery](HOSTED_KEY_TRANSFER_2026-10-04.md).
Its exact source commit `e7940e7c40a82d144faea55054e30ed3e7c5e4da` passed all three
[GitHub checks](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/37212851154).
The existing key is already private on the server. Do not transfer it again.
The owner confirmed this project is the only consumer of the account. This is
not a provider-reported remaining balance or permission for historical prices.

The verified post-delivery Git bundle is in the ignored October4 checkpoint.
Before source changes, a fresh local backup was separately restored and all25
persistent tables verified. The source still had13total/9current/4expired quota
reservations. Source identity and the exact12migration journal were verified.
Fresh target inspection found0reservations/0outcomes and no runtime INSERT access.
It matched the existing hosted database and owner-identity binding. No holdings,
prices, credentials or authorization records are part of the quota payload.

## Bounded technical implementation

The operator helper commits source admission revocation under the provider lock,
then requires actual caller retirement/inventory before taking the transferable
capture. It reuses the existing microsecond-preserving format and original rows.
Failure never re-enables source admission. The target checks its independently
selected physical database identity, exact migration journal and expected digest
before importing and applying only the two existing least-privilege grants in
one transaction. A receipt is returned only after commit.

The fixed private `market-activation.json` is separate from the key. Its exclusive
publication requires fresh owner-binding/configuration, exact runtime privileges,
baseline accounting and private latest-cache checks. Creation is durable and
never overwrites an existing or ambiguous file. No receipt means the unchanged
auth-only service; a malformed present receipt stops startup instead of silently
falling back. Startup never fetches a price or creates an owner session.

Restart verification preserves every imported row exactly while allowing later
legitimate reservations/outcomes. It checks the existing cadence and does not
reset accounting on restart. The adapter is passed only to the existing private
session gate. Public evaluation cannot request private quotes or write holdings.
No financial formula, schema, dependency, user-interface feature or source vendor
changes in this unit.

## Operational gates and rollback

Implementation is not evidence that an operation occurred. Until the operational
receipt below is completed, source fencing, target import, activation-file
publication and production release remain unconfirmed.

Before execution: exact-source CI, independent security review, positive local
caller inventory, safe target capacity, candidate-bound backup/separate restore,
and verified SSH identity are required. Keep the source fenced on any ambiguous
failure and preserve the local protected capture and target artifacts. Do not
automatically retry publication, clear markers, reset usage or grant source INSERT.

Rollback is **code-only with current quota data preserved**. Once hosted calls
occur, restoring a pre-call database or re-enabling the source could erase later
usage/cooldown. Reverse handoff requires separate reviewed reconciliation of all
later target reservations first. The baseline receipt cannot detect a malicious
administrator or a restore that discarded later rows. Same-OS-owner processes
and the authorized operator remain trusted boundaries; this is not cryptographic
proof of account completeness or protection from manual out-of-band key use.

## Verification and remaining acceptance

Independent quota, private-cache/security and release-boundary reviews completed.
Local full web validation:863tests,858passed,0failed,5Linux-only skips;
coverage95.74%lines/91.68%branches/91.78%functions. Real PostgreSQL integration:
74/74passed with no skips. The first parallel run reached the existing20-client
local database ceiling; limiting test workers to2 fixed the harness contention
without changing database capacity or within-test concurrency. Focused runtime
contract checks passed2/2; lint/typecheck passed. Production dependency audit
reported0vulnerabilities; the previously recorded full development audit is not
claimed clean. Windows capture-guard synthetic tests passed.

STATUS: exact-source CI and operational execution pending. Real source/target
changes and release evidence will be recorded after execution, not inferred from
tests. Test fixtures contain only explicit synthetic data. Retained local logs
are under the ignored October4 hosted-market checkpoint.

Actual owner login and authenticated hosted acquisition are deliberately FINAL.
Do not issue bootstrap grants or bypass a session to manufacture a successful
live-price test. Cross-device private persistence, private-user acceptance and
financial-method validation remain separate. Existing audit, independent-browser,
actual-reboot and same-host-only-backup limitations are unchanged.
