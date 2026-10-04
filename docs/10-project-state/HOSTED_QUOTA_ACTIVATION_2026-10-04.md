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

Implementation alone is not evidence that an operation occurred. The actual
source fencing, target import, activation-file publication and release evidence
are recorded separately below.

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

The first exact-source CI at414b64e passed the web/Linux-native and Python gates,
but its new PostgreSQL fixture rejected Docker's server-side bridge address.
The correction is tests-only: after verifying the actual integration database,
OID/port/role and explicit CI/container scope, it normalizes only that fixture
transport address. Production identity restrictions remain unchanged; new unit
regressions reject nonloopback source/target identities before any transaction.
Six focused unit tests pass and independent review accepted the bounded repair.

Corrected source `d588a8cf1ac8c011097e3c550e03034a9d4a62a5` passed all three
[exact-SHA CI jobs](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/37215716318):
web/build/security, real PostgreSQL integration/restore and synthetic Python lab.
The corrected native local PostgreSQL rerun also passed74/74. Linux candidate
locked installation, private build, identity-mode route/security smoke tests and
production audit passed. Test fixtures contain only explicit synthetic data.
Retained local logs are under the ignored October4 hosted-market checkpoint.

## Actual one-time cutover and release

The protected Windows capture and transfer succeeded on October4. The guard
retained source/checkpoint ancestor and script/credential handles, rechecked
identity and owner-only capture permissions, and allowed only hash-reviewed
operator bytes. Independent review and native synthetic tests passed; this account
could not create a file symlink, so hardlink/junction rejection was tested without
claiming that unavailable case. Reviewed guard SHA256:
`544d1b6040ca4ac137718fa1e1afb37e1d93d7e4a501c33509a4cc9c41e9a6a2`;
operator SHA256:`4c3e962e8bac5dc3044277a5edd6f5b8499f054fbf8ec62c6d4aad342a9d3b0b`.
No raw child errors, key, holdings or price data were transported or displayed.

Actual fixed receipt: `quota_cutover_verified`, sourceFenced=true,
insertedRows=9, used=9, cooldownPreserved=true, receiptStored=true,
startupValidated=true, providerCalls=0. The source's13lifetime rows were not
deleted;4expired rows remain there, while the9current rows and exact cooldown
became the target baseline. No counter was reset. The protected source capture
is retained in `.cache/postgres-local/navasan-hosted-handoff-20261004.json`;
the target receipt is `PRIVATE_DATA_ROOT/market-activation.json`. Do not rerun
the one-shot capture/import or overwrite either artifact.

Candidate-bound server backup and separate restore passed both before the
operation and after importing the ledger. At16:18:29Z,39,611,277,312bytes were
available against the8GiB reserve. Only this project's supervision block was
upgraded from50a9c3a to d588a8c; unrelated bytes/services were preserved. Protected
rollback crontab: `PRIVATE_DATA_ROOT/crontab-before-1791130713507.txt`.
Old supervisor3498024 was identified by UID, exact command and process-start
identity before SIGTERM; PostgreSQL was not stopped. Existing minute recovery
started the new service without an attached management session. Reboot recovery
is configured but an actual shared-server reboot was not tested.

At16:19:34Z, actual HTTPS health200 identified d588a8c. `/evaluation` returned200;
anonymous `/api/portfolio`, `/api/portfolio/export` and `/api/managed-market`
returned401; `/api/local-market` returned404. All sampled responses retained
no-store. Post-release native adapter readiness passed with9reservations,
0hosted outcomes and0provider requests. This proves guarded runtime attachment,
**not successful authenticated acquisition, current account validity or a price**.

## Browser regression and final-stage boundary

The existing HTTPS evaluation interface was tested in a fresh in-app browser tab:
negative quantity rejected; correction saved; two explicitly synthetic purchases
(2units at100 with0.4fee,1unit at200 with0.6fee) produced3units and401total cost.
Weighted price displayed133.3 and landed average133.7 with exact-cost disclosure.
Same-tab reload retained both purchases and401; a separate tab started empty.
Missing historical FX/current prices and both decision horizons stayed explicitly
unavailable. These records did not write the private server portfolio. Previous
unchanged Excel/export/deduplication browser evidence remains in the October3
release report; those unchanged manual paths were not claimed newly repeated.

Chrome was explicitly requested from the connected browser tool but unavailable.
Independent Chrome/Edge/Firefox/mobile and real cross-device private recovery
are therefore untested, not equivalent to this in-app/domain acceptance. A clean
evaluation tab was retained for the owner. Storage remains same-tab temporary,
not private account storage. Public evaluation deliberately has no provider-price
adapter and cannot be used to bypass owner authorization.

STATUS: quota authority and guarded hosted runtime attached; real private-user
acceptance and authenticated acquisition remain deliberately FINAL.
Do not issue bootstrap grants or bypass a session to manufacture a successful
live-price test. Cross-device private persistence, private-user acceptance and
financial-method validation remain separate. Existing audit, independent-browser,
actual-reboot and same-host-only-backup limitations are unchanged.
