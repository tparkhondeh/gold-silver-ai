# Current State

**Source of truth for:** where the project stands right now.

_Last reviewed: 2026-09-26 (fresh delivery review; owner activation still final-stage)_

## Current delivery coordinate

Follow [September26 delivery readiness](DELIVERY_READINESS_2026-09-26.md) for the
fresh Git/CI/domain/capacity evidence, six delivery packages, conditional estimates,
independent corrections and remaining owner/data/hosting dependencies. Do not
infer a whole-project completion percentage from the number of passing tests.
The pre-change exact source was dcc1822; the domain still serves51e0791 and its
evaluation path is not deployed. This review supersedes prior timestamped capacity
and backup observations, without undoing their recorded work or final-stage login
deferral. No server/data/key transfer or grant was performed.

## Public-evaluation implementation checkpoint (September23)

Follow [September23 public evaluation](PUBLIC_EVALUATION_2026-09-23.md) and
[ADR0014](../08-decisions/ADR/0014-isolated-public-evaluation-route.md).
The owner has deferred passkey activation to final acceptance: STOP bootstrap
issuance/follow-up; preserve existing artifacts and private authorization.
The new `/evaluation` route reuses product components with isolated nonprivate
browser-tab records. Local implementation, browser acceptance and all three
exact-source-SHA GitHub checks succeeded; evidence is recorded in that checkpoint.
The hosted release remains51e0791; new deployment is blocked by freshly observed
3.52GiB available space, below the8GiB backup guard. No server changes or deletion.
Historical enrollment and capacity instructions below do not override this scope.

## September22 owner-activation checkpoint (historical sequence)

Exactly one approved five-minute bootstrap grant has been securely delivered
after focused tests, independent review and all three exact-SHA GitHub jobs.
Follow [September22 activation](PRIVATE_OWNER_ACTIVATION_2026-09-22.md) for expiry,
Git, deployment, backup and handoff evidence. Do not issue again or overwrite the
handoff artifacts. Actual device confirmation and authenticated owner login are
still unconfirmed; delivery is not enrollment or session success.

## Deployed private-domain baseline

Google is no longer a required dependency. The owner authorized choosing and
implementing an independent private login and project-only deployment; see
[ADR 0013](../08-decisions/ADR/0013-owner-passkey-private-domain.md).
Owner-bound passkey implementation, signed protocol tests and all 37 isolated
PostgreSQL integration tests pass. Existing purchase/Excel/valuation contracts
are reused, not rebuilt. The actual owner enrollment and safe grant handoff
were separately gated at the September21 baseline; today's actual bootstrap
delivery is recorded above. No real passkey, API key transfer or personal-portfolio
transfer is confirmed.

The latest execution record, including server changes and deployment evidence,
is [September 21 passkey delivery](PRIVATE_PASSKEY_DELIVERY_2026-09-21.md).
This record supersedes the older Google-only next steps below. Technical test
success is not a completed owner login or independent-device acceptance.

Actual hosted code: `51e0791b94416f8c85c0e6d01ab4c1ee2013ffed`, all three exact-SHA
GitHub jobs passed. Public HTTPS root and eight assets return200; health reports
that SHA, anonymous session/portfolio/export return401 and local operator routes
remain404. Dedicated PostgreSQL15432,14migrations, real backup/separate restore,
project-only supervision and verified release upgrade are installed. No dependency
on a local launcher/SSH session remains for serving the login page.

The public edge had stripped origin no-store. Two narrowly scoped existing-plan
rules on `goldsilver.wealthos.ir/**` now disable edge/browser caching; external
and independent checks confirm no-store and unchanged access denials. Other
hosts, DNS, shared cache/security defaults and existing rules were not changed.

Still NOT accepted: actual owner enrollment/login, authenticated save/reload/logout,
second-device recovery, live hosted prices, actual host reboot and off-host disaster
recovery. The hosted portfolio is empty and the market adapter remains disabled;
no private portfolio/API key was transferred. Read the linked checkpoint and
[short acceptance guide](../09-operations/PRIVATE_OWNER_ACCEPTANCE.md), not the
historical statuses below. This is not yet a usable signed-in owner account.

## Historical Google-only checkpoint (superseded)

Owner-directed workflow clarification is now recorded in [CLAUDE.md § 9](../../CLAUDE.md#9-autonomy-and-necessary-owner-approval).
The earlier documentation-only clarification preserved approval gates and the
AGENTS.md pointer. The later owner-authorized implementation is recorded above.

## Historical private-identity checkpoint (September20)

Durable owner sessions, server-authorized portfolio storage, the private browser
shell and a fail-closed Node production entry are implemented and independently
reviewed. Existing purchase/Excel/math contracts are reused. The approved external
credential destination failed today's shared-parent recheck. The owner explicitly
approved a new isolated destination; the fixed-path helper was independently
reviewed, the new directories created safely and metadata verification passed.
Old paths/permissions remain unchanged. Current evidence and active handoff:
[September 21 isolated destination](PRIVATE_CREDENTIAL_DESTINATION_2026-09-21.md).
The owner confirmed direct Save As and the harmless file now passes metadata,
single-link and directory checks. No agent-observed dialog is claimed. No secret
was created or transferred. One replacement and local-only retention are now
explicitly authorized, but official Google console access is blocked; execution
has not occurred. The linked September 21 checkpoint owns the fresh evidence,
resolved exact path, supported-browser limitation and next prerequisite.

Real Google login and domain access are **not activated**. The latest domain check
(September 20) returned 503; server database provisioning, persistent supervision, actual key/owner binding,
server restore and independent-device acceptance remain gates. Existing local data,
main and server were not changed. Code readiness is not deployed readiness.
The [September 20 checkpoint](PRIVATE_DOMAIN_READINESS_2026-09-20.md) owns exact
changes, 552 web/29 database tests, browser limits, security findings and handoff.
Final-SHA GitHub results must be verified separately from earlier run evidence.

## Historical unified personal-workspace checkpoint (September17)

The paragraphs below retain September17 evidence. Identity/runtime readiness was
subsequently recorded in the September20 checkpoint; current status is the active
September21 section above, not either historical deferred-work list.

The public page now has one purchase/editor/Excel path backed by confirmed local
PostgreSQL writes, automatic reads, exact per-lot/weighted Rial and USD basis,
explicit coverage and protected drafts/version conflicts. Synthetic laboratories
and manual price save/receive/replay controls are not imported by the public page;
their internal regression implementations remain. The blank downloadable workbook
has three sheets and no example holdings. No existing rows or browser drafts were
deleted; browser-only drafts are preserved for explicit recovery, not silently merged.

Automatic latest-only market handling now uses one private runtime cache plus the
existing durable quota ledger and cross-process exclusion. Current source cooldown
is respected; this checkpoint does **not** claim a new actual quote acquisition.
Daily verified local backups run only while the local launcher is alive; they are
not off-host backups or a deployed service. Actual restore verified all 25 tables.

Three specialists and the coordinator reviewed/integrated the work. Browser
acceptance used a new isolated database, never the owner portfolio: manual and
XLSX saves/reload, date/FX validation, precise quantities, duplicate/corrupt files,
two-tab conflict and failed-save draft retention were exercised. HTTP backup file
download was verified after correcting the Blob-download path. Full evidence,
code/test/CI distinctions and owner steps:
[September 17 unified-workspace review](UNIFIED_PORTFOLIO_REVIEW_2026-09-17.md).
Implementation `9d8537c` was pushed; all three exact-SHA GitHub jobs passed in
run35191323042. This documentation-only evidence follow-up has a separate final
delivery-SHA verification gate; it changes no tested product code.

Private domain release is **not complete**: fresh read-only preflight found HTTPS
503 and no backend on proxy port 3012. The owner authorized Google-login
preparation. After the owner's manual acceptance, the original **Gold Silver AI**
project now visibly reports **OAuth configuration created!**; this gate is complete.
The owner subsequently authorized one web OAuth client and local-only credential
retention. It was created, but its secret appeared in tool output during UI
inspection; treat it as compromised. It was not downloaded, stored or connected
to the application/server. After specific owner confirmation, this unused client
was deleted and the Google active-client list was verified empty. No replacement,
safe credential or completed login is claimed. Follow the
[incident, containment and exact next action](GOOGLE_IDENTITY_SETUP_2026-09-17.md).
A second empty Google project was not deleted or used for this setup.
Hosted identity, persistent runtime,
server storage and cross-device acceptance remain open. No server/main change or
private portfolio/key transfer occurred. This supersedes older UI/priority claims
below; historical implementation evidence remains useful, not current readiness.

## Latest Rahavard checkpoint

The owner requested Gold-subscription data alongside the existing Navasan personal
connection. Fresh review still did not obtain an authorized minimal source file or
provider permission reply. The previously open menu showed Gold, but fresh pages
require sign-in; manual owner login was requested. No new data/API/history,
scheduled export, message or server change occurred. The real Rahavard connection
and real-file acceptance remain blocked, not finished by a synthetic test.

Independent specialist review found and corrected two timing defects in the
existing isolated file test: future local receipt and delayed UI expiry. Existing
valid saved records are preserved; real-profile permission/schema gates remain
closed. See [fresh evidence, verification and exact next action](RAHAVARD_REVIEW_2026-09-17.md).
The personal-market implementation below remains intact. Exact final-SHA CI and
owner acceptance are separate gates.

## Latest personal-market checkpoint

The owner-authorized local price connection now joins the personal purchase book
and retained holdings to validated latest Navasan observations. Exact quantity,
weighted acquisition/landed basis, current value and unrealized P&L are separated;
incomplete totals, stale FX, unsupported units and absent silver are explicit.
One actual request succeeded with eight observations (seven fresh, USD stale).
The existing synthetic gold purchases were valued in the browser; real prices
never rewrote their costs, dates or historical FX. Personal overview, portfolio,
asset center, analysis/readiness and separate latest-only save/replay were tested.

Three specialist agents and coordinator integration completed independent
arithmetic/security reviews. Final local gates: 352 web tests, 19 isolated real
PostgreSQL tests, build/typecheck/lint/readiness and clean production audit.
See [evidence, limitations and owner test steps](PERSONAL_MARKET_REVIEW_2026-09-17.md)
and [versioned contract](../04-portfolio/PERSONAL_MARKET_VALUATION.md).
Exact-SHA GitHub verification is a separate final handoff gate. No main/server,
historical download, financial-method change, deployment or owner acceptance.
Older checkpoints below are retained context, not authority to undo this connection.

## Latest purchase-book checkpoint

Owner-requested independent purchase rows, exact weighted raw/landed costs,
per-purchase dated USD and atomic browser-local Excel intake are implemented in
the separate personal portfolio. All four personal views use the same projected
holdings and retained purchase basis. Legacy data is preserved; historical FX is
manual/unverified when available, otherwise explicitly missing. Actual download,
fill, preview, save, edit, duplicate/corrupt-file rejection and database restore
were exercised locally. The browser found a JSONB key-order recovery defect and
a missing decision-view summary; both were corrected and regression-tested.
See [scope, verification and owner test guide](PURCHASE_LOTS_REVIEW_2026-09-16.md)
and the [implemented contract](../04-portfolio/PURCHASE_LOTS.md).
Three explicitly synthetic purchases remain in the previously empty local test
portfolio. No new market/history request or server/main change occurred. Local
implementation, exact-commit GitHub verification, hosted readiness and owner
acceptance remain separate gates.

## Latest actual-market checkpoint

One permitted Navasan latest request now succeeded with eight approved observations.
Gold/coin prices reached the existing isolated portfolio path; nine views, exact
valuation edits, missing inputs, risk, latest-only save and reload were tested in
the browser. The previous "authenticated receipt unverified" checkpoint is superseded.
No licensed Rahavard file or silver price was received. Same-method concentration
warnings and configured request cadence were corrected; 252 web tests and local
build/typecheck/lint/audit pass. Actual-source versus controlled-fixture evidence,
quota/next eligibility, source research and remaining gates:
[September 16 actual-market review](REAL_MARKET_REVIEW_2026-09-16.md).
No main/server change, financial unlock or owner acceptance is implied.

## Latest specialist-team checkpoint

Owner-authorized specialist delegation is now a persistent development rule linked
from `CLAUDE.md`; `AGENTS.md` remains its pointer. Three real subagents covered
financial/data, security/storage and architecture/QA alongside coordinator UI work.
The review identified and corrected existing no-trade comparison and personal
save/restore consistency defects; shared sorting and local freshness navigation
were also addressed. Inputs incompatible with existing database precision now
fail explicitly before writes instead of silently rounding. Final local gates:
246 web tests and 18 isolated PostgreSQL integration tests pass, alongside
typecheck, lint, build and production dependency audit. Exact scope, numerical provenance, verification evidence,
review limits and the next independent test gap live in the
[September 16 specialist review](SPECIALIST_REVIEW_2026-09-16.md).
No new financial method, licensed data, hosted identity, main/server change or
owner acceptance is implied. Final-SHA publication/CI is a separate delivery check.

## Latest presentation and continuity checkpoint

Owner-requested one-decimal display is implemented with exact-value disclosure;
editable inputs, saved contracts, financial calculations and price limits retain
their precision. The next independently reproduced defect is fixed: unsaved file
test input survives source/workspace navigation instead of silently reverting.
228 web tests, build/typecheck/lint/audit and local readiness pass. Eight-view
budget consistency, exact display, saved replay, two horizons and seven-method
comparison were exercised in the available local browser. Evidence, backup,
limitations, final-SHA verification policy and remaining gates:
[September 16 presentation review](NUMBER_DISPLAY_REVIEW_2026-09-16.md).
No provider request, server/main change, real-file acceptance or owner approval.

## Latest independent-work checkpoint

While provider clarification remains pending, a real local persistence gap was
closed: shared-portfolio and market-test saves now reject stale-tab overwrites and
unread/corrupt stored documents. All three test workspaces use exclusive browser
locks; repeated unchanged shared saves preserve the useful previous copy. No
financial formula, input schema, source access, main or server changed.
220 web tests, coverage gates, typecheck, lint, build, dependency audit and 15 local
readiness checks pass. Edge verified eight shared views, numeric consistency,
invalid-input recovery and two-tab conflicts before its tool disconnected. In-app
browser completed file/market conflict checks and reload/replay, including shared
horizons/selection. Exact scope, limitations, recovery and next dependencies:
[September 16 audit](BROWSER_STORAGE_REVIEW_2026-09-16.md).
Final-SHA publication and all three CI jobs are verified separately at delivery;
older CI does not attest this change. Owner acceptance is still pending.

## Latest Rahavard access checkpoint

Owner-operated browser/native login, browser Gold and desktop installation are now
verified. The latest owner screenshot shows export off after an automatic schedule
was noticed; the configured output folder was empty at its recorded check. The
authorized support inquiry is now verified in Gmail Sent via the official email
alternative; a provider reply/permission is still pending. Minimal
licensed scope and the actual file remain pending; no real-file acceptance or
product/server/main change is claimed.
[Sending evidence and next gate](../05-data/RAHAVARD_FILE_INTAKE.md#september-15-support-email-sent).
The completed synthetic intake below is unchanged; do not rebuild it or repeat the
resolved browser-login request without new evidence of a failure.

## Latest file-intake checkpoint

The owner authorized the official Rahavard file route, conditional on actual access
and permission. On September 14, fresh reload required login; that access uncertainty
is superseded above. Official TXT availability is confirmed, but its actual layout,
units/times and licensed retention remain unresolved. No real quote was received.
Independent file-intake contracts and all nine test views are implemented using
explicit synthetic TXT, separate storage and the existing exact valuation math;
real import remains closed, not replaced with guessed vendor fields.
[Evidence, owner test and next gate](RAHAVARD_FILE_REVIEW_2026-09-14.md).
The scope correction below is preserved; no tia work belongs to this checkpoint.

## Conversation scope correction — 2026-09-14

The owner clarified that the Personal Agent / tia store-readiness request was
pasted into this Gold/Silver conversation by mistake. That request, its permissions,
test counts, APK/store work and readiness report are **not Gold/Silver requirements
or progress**. Do not continue tia work from this conversation on that basis.

Read-only reconciliation found this checkout clean on
`codex/phase-2-decision-engine` at `eb4f390b85eb3eabb1f3a4fc3a2a88f459c77eb8`;
fresh `git ls-remote` confirmed the same GitHub branch SHA. The last Gold/Silver
commit/reflog entry was 2026-09-13 14:28:21 +03:30. No tia implementation had been
written into this repository. The separate `personal agent` repository retains
the published tia code commit `56978d4` and evidence commit `ec9ab6c`; neither was
reverted or transferred here. Reversing those published changes requires explicit
scope from the owner rather than a history rewrite or an inferred deletion.

Only this clarification was added locally, after a hash-verified copy of this
file under `.cache/checkpoints/scope-correction-20260914T161145/`. No product code,
data, server, branch, commit history or runtime was changed in this correction.
The product checkpoint below and [NEXT_TASK.md](NEXT_TASK.md) remain the basis for
Gold/Silver continuation; their older tests and runtime observations were not rerun
or promoted to fresh evidence by this scope-only review.

## Latest R2/domain checkpoint

Latest local-runtime follow-up: Windows launcher now uses an explicit, loopback-only
Node development alternative. Root/health/UI and unchanged quota guard were tested;
197 web tests pass. Builds retain Worker. No new quote or domain deployment.
[Evidence, recovery and next gate](LOCAL_NODE_REVIEW_2026-09-13.md).
Raw-metal commit `b9d3109` passed all three GitHub jobs in run 34752898053;
the runtime follow-up requires its own final-SHA checks.

Follow-up: the existing raw-metal premium diagnostic is now connected to the shared
synthetic portfolio with explicit FX/ounce inputs, exact fractions and V2 save/replay
with read-only V1 migration. All eight views and the existing plan remain consistent.
193 web tests and browser checks pass; see [current follow-up](SHARED_METAL_REVIEW_2026-09-13.md).
Historical bubble/regime methodology, actual market evidence, private domain identity
and cross-device storage remain incomplete. No server change is claimed.

Earlier checkpoint (same day):

Eight shared synthetic views now include price quality, pure-metal ratio and
source-linked existing horizon/factor/scenario diagnostics. Exact single-budget
orders and saved v1 portfolios are preserved. Browser, numeric, persistence and
security checks are recorded in [the current audit](R2_DOMAIN_REVIEW_2026-09-13.md).
R2 remains partial: intrinsic/bubble and market-regime inputs/method mapping are
not complete. Private hosted identity and cross-device storage are also absent.
The domain returned 503 with no configured backend listener; write access exists.
No server change or successful deployment is claimed. One permitted local Navasan
request timed out; the quota reservation is retained. These fresh observations
supersede older connectivity and publication-blocker statements below.
Owner acceptance and financial use remain separate gates.

## Prior 2026-09-10 review and execution scope

The owner now explicitly permits licensed real market observations for **local
software testing only**, under [ADR 0011](../08-decisions/ADR/0011-isolated-authorized-market-software-test.md).
A separate versioned market-test workspace and quota-protected Navasan latest route
are implemented; personal and synthetic portfolios are not merged or overwritten.
The nine-view browser journey, controlled failures, save/replay and prior synthetic
decision scenarios were exercised. No financial method, main or server change.

**Not yet complete with real data:** no usable quote was acquired this turn.
Rahavard transfer requires provider permission; the initial Navasan transport error
was reproduced and fixed, but its conservative durable cooldown is retained before
a further keyed request. Current source, quota/time, tests, backup, publication
limitations and acceptance matrix are recorded once in
[`MARKET_TECHNICAL_TEST_2026-09-10.md`](MARKET_TECHNICAL_TEST_2026-09-10.md).
Do not call this full real-data acceptance, successful CI, or project completion.

## Prior R1 review scope (historical)

The owner explicitly authorized local startup, R1 shared-portfolio implementation,
tests, documentation, commit and push after the same-day read-only audit. Work is
restricted to `codex/phase-2-decision-engine` in the existing owner checkout. No
server change, deployment, live data, financial API, purchase or main change is authorized.

R1 is implemented for owner testing: six portfolio views share one versioned
synthetic input, exact cash/quantity calculations and browser save/replay. Existing
methods and the seven-method reference comparison are reused. Three metals/cash
are supported; other classes are explicit blockers, not silently excluded. The local
launcher is running on `http://127.0.0.1:4174/` at verification; runtime continuity
after the active session is not promised. All 15 readiness checks and 169 web tests
pass. Source, acceptance matrix, security limitations, CI verification policy and
remaining work: [`SHARED_PORTFOLIO_DELIVERY_AUDIT.md`](SHARED_PORTFOLIO_DELIVERY_AUDIT.md).
Owner acceptance of this unit is pending; it is not stable or overall project completion.

The preceding audit evidence, date reconciliation, explicit distinction between code,
tests, runtime, conditional permission, deployment and owner acceptance are in
[`PROJECT_COORDINATES_2026-09-09_FA.md`](PROJECT_COORDINATES_2026-09-09_FA.md).
Its GitHub checks apply only to `122586d`, not the new integration commit. The
reviewed audit edits are included with this implementation. The completion path is in
[`ROADMAP.md`](../01-product/ROADMAP.md#proposed-route-to-the-first-owner-operational-release).
The former 67% management estimate is historical, not a measured current total.

## Implementation checkpoint before this review

The preceding implementation request authorized a quantitative short/medium decision workbench
with exact price/quantity/cost/funding outputs and editable synthetic examples. Its
scope and acceptance inventory are in `../04-portfolio/DECISION_ACTION_PLAN.md`.
The preceding 64-slot empty intake plan passes all 254 laboratory tests locally
(247 existing plus seven new, 344 seconds). Its commit `6e3c4ae` passed all three
GitHub jobs in run 34009462993.
The quantitative workbench is now implemented: exact BigInt quantities/costs,
single-budget short/medium sizing, seven explicit action/error fixtures plus the
existing factor method, editable controls, ordered funding, risk constraints and
canonical browser save/restore. All 161 web tests and 16 PostgreSQL integration
tests pass. Local health is ready, online market calls are disabled, and a complete
25-table backup/restore is verified. The source-linked engine map, exact evidence
and remaining release dependencies are in `DECISION_WORKBENCH_DELIVERY_AUDIT.md`.
Owner testing instructions are in `../09-operations/OWNER_DECISION_TEST_FA.md`.
Only passed acceptance items in the bounded workbench inventory count toward its
completion; do not describe that as the percentage of the full financial product.
Workbench checkpoint `7986e67` passed all three jobs in run 34010665537.
The next independent unit is also implemented: seven actual train-only Python
weight sets pass through the shared physical-lot solver on two identical synthetic
folds, with common costs/constraints and no future input to sizing. Eight web tests
and three new Python bridge tests verify this; the comparison panel is connected.
The lab now has 257 tests in total. Final comparison-commit CI is checked separately
from the earlier workbench checkpoint; no financial winner or rank is produced.
No recurring automation should be recreated. The working branch remains
`codex/phase-2-decision-engine`; the clean pre-change Git history is backed up in a
verified local bundle under `.cache/checkpoints/`.

On 2026-09-01 the owner accepted the Phase 1 Data Foundation for progression while
keeping financial use locked, and authorized Phase 2 only as a completely synthetic,
non-operational financial laboratory. ADR 0009 records the exact boundary. Branch
`codex/phase-2-decision-engine` was created from verified Phase 1 HEAD `0f90210`;
neither acceptance nor branching authorizes a merge to `main`, real data, a paid API,
financial recommendations, or execution.
On 2026-09-05 the owner separately authorized selecting and implementing a proposed
method **inside that laboratory only**. ADR 0010 records the narrow authorization.
Eighteen reviewed primary/official sources and ten equally weighted engineering-fit
criteria compare nine candidates without using synthetic returns to choose a winner.
`ASHA_TRANSPARENT_GUARDED_DECISION_V1` is the selected laboratory proposal: eight
visible 12.5% factor bands feed exact constrained targets, percentage changes and
whole-toman amounts, with reasons, invalidation, evidence gaps and alternatives.
A versioned requirements-only Iran calibration manifest now predeclares the exact
factor/constraint fields, 1,260-observation train/validation/test isolation, parameter
freeze and ten fail-closed promotion gates without selecting a provider or containing
real data.
A deterministic synthetic evaluator now applies twenty artificial checks to those ten
gates and reports passed, failed or dependency-blocked mechanics. Even an all-pass
fixture keeps every real-world gate unevaluated and promotion disabled.
A canonical parameter bundle now freezes the complete laboratory-v1 factors, cutoffs,
horizons, constraints and calculation rules before future evaluation links. Real
acceptance thresholds and stress magnitudes remain null and cannot be set from
synthetic outcomes.
A freeze-aware synthetic preflight now binds that exact bundle to the ordered gate
evaluator. G07 mechanics pass only when the freeze remains canonical, pre-evaluation,
outcome-independent and empty of real thresholds/stress values; missing, failed,
blocked or tampered inputs fail closed. Real G07 remains unevaluated.
A canonical Persian readiness report now separates the synthetic and real state of
all ten gates and lists 64 exact remaining real-evidence requirements from the
manifest and freeze. The count is an inventory, not a score; it creates no data
request and every real gate remains unevaluated.
A checked-in canonical copy is now displayed only inside the local synthetic demo.
The Persian panel verifies the exact report fingerprint, all ten ordered gates, all
64 evidence items and every financial lock before showing the headline or expandable
detail. Missing or changed content and any enabled permission stop the panel; the web
runtime imports no Python laboratory code and calls no provider.
Synthetic reference actions and a same-fold two-window comparison against six controls
are exactly replayable and unranked. The web demo mirrors the method and exposes its
calculations behind a plain-language disclosure. Financial use, execution, Iran
fitness and real-data approval remain false. Two hundred and forty-seven laboratory tests,
the production web build, lint, typecheck, all 136 web tests and coverage gates pass
locally.
Code checkpoint `909d537` passed all three GitHub Actions jobs in run
33992126608; `main` remained unchanged.
Iran-calibration-manifest checkpoint `4588088` passed all three GitHub Actions jobs
in run 33993319908; `main` remained unchanged.
Synthetic calibration-gate evaluator checkpoint `2d33a01` passed all three GitHub
Actions jobs in run 33996055637; `main` remained unchanged.
Laboratory-v1 parameter-freeze checkpoint `c11e4e7` passed all three GitHub Actions
jobs in run 33998926719; `main` remained unchanged.
Freeze-aware calibration-preflight checkpoint `eb2749c` passed all three GitHub
Actions jobs in run 34001635329; `main` remained unchanged.
Calibration-readiness-report checkpoint `0fff4d9` passed all three GitHub Actions
jobs in run 34007016125; `main` remained unchanged.
Calibration-readiness-panel checkpoint `67277a5` passed all three GitHub Actions
jobs in run 34007882823; `main` remained unchanged.
The isolated `packages/financial-lab` Python 3.12 package now defines strict v1 JSON
contracts for synthetic datasets and evaluation results. Canonical SHA-256 identities
make exact replay/tampering visible; real namespaces, real units, premature
availability, approved-method claims, financial use and execution fail closed. Six
standard-library tests pass, and the project workflow now has a separate laboratory
job without adding a Python runtime dependency.
Contract checkpoint `a7ee94d` passed all three GitHub jobs (web quality/audit, real
PostgreSQL integration, and synthetic Python laboratory) in run 33508480738.
The fixed reference generator now produces four synthetic index paths over 120 ordinal
periods with no market symbol, currency, calendar date, provider, or randomness. Its
fingerprint is pinned for exact replay. The first `ASHA_DETERMINISTIC_BASELINE_V1`
operation counts only observations known by a requested cutoff and always returns a
fingerprinted `no_decision`, evaluation-only, execution-disabled result. Fifteen
laboratory tests passed at checkpoint `fcfbb22`; all three GitHub jobs passed in run
33509106798.
Canonical artifact encoding and decoding now reject duplicate keys, invalid UTF-8,
alternate formatting, oversized documents and contract violations. Exact replay
recomputes the no-decision result and rejects a resealed false result or result from a
different model. Twenty laboratory tests pass locally; this is mechanics evidence,
not a selected methodology.
Canonical artifact checkpoint `10de1d7` passed all three GitHub jobs in run
33509410256. Constant synthetic-cash, period-rebalanced synthetic 1/N, and initially
equal no-trade comparison controls now use only then-known levels, count carried-forward delays, and expose
deterministic cumulative-change and maximum-drawdown metrics. The 1–110 reference
result is pinned to an exact identity; twenty-five laboratory tests pass locally.
Every output remains `no_decision`, financial-use-disabled, execution-disabled and
methodology-unapproved.
Cash/1N control checkpoint `a5087d6` passed all three GitHub jobs in run 33509893452.
No-trade checkpoint `804657b` passed all three GitHub jobs in run 33510192013.
A versioned walk-forward plan now supports parameterized rolling/anchored folds,
explicit purge/embargo ranges and exact training-observation fingerprints. Its pinned
54-fold reference excludes a delayed observation from the first training cutoff and
round-trips only with the exact referenced dataset. Thirty laboratory tests pass; no
window size, financial methodology or real-data use has been approved.
Walk-forward checkpoint `dda4cfa` passed all three GitHub jobs in run 33510661448.
Parquet transport is implemented with hash-locked Apache-2.0 `pyarrow==25.0.1`, after
official compatibility/license/wheel review and a zero-result OSV query for the exact
version. It is limited to serialization; files are bounded and must reconstruct the
canonical JSON dataset fingerprint. Thirty-four laboratory tests and `pip check` pass
locally.
Parquet checkpoint `cd9d8d3` passed all three GitHub jobs—including the hash-locked
Linux install—in run 33511252725. A versioned point-in-time synthetic return matrix now
records 12-decimal latest-known changes and explicit carried-forward instrument IDs.
Its pinned reference has 109 rows and 11 visible delays; exact artifact replay is
dataset-bound. Thirty-nine laboratory tests pass, with no fitting, forecast, ranking
or decision output.
Point-in-time feature checkpoint `d1363c7` passed all three GitHub jobs in run
33511686844. Train-only population z-score statistics are now bound to the exact
dataset, return matrix, walk-forward plan and fold. A test changes only future/test
levels and proves the fitted statistics stay identical. The zero-variance policy is
explicit, artifacts replay exactly, and forty-five laboratory tests pass locally;
still no model, forecast, ranking or decision exists.
Train-only standardizer checkpoint `cf6e362` passed all three GitHub jobs in run
33512088284. Frozen statistics can now transform the same fold's complete test interval
without refitting; zero variance maps explicitly to zero. The reference transform has
a pinned identity and all upstream provenance is required for replay. Fifty laboratory
tests pass locally; the output remains feature-only with no prediction, score,
allocation or decision.
Train-fitted transform checkpoint `8ec4b1b` passed all three GitHub jobs in run
33512453084. A train-only inverse-volatility comparison-control artifact now produces
12-decimal weights with an exact sum of one, explicit zero-variance exclusion and
all-zero fail-closed behavior. Reference identity and full provenance are pinned;
fifty-five laboratory tests pass. It remains `no_decision`, no-use, no-execution and
is not an approved allocation methodology.
Inverse-volatility weight checkpoint `5cca28b` passed all three GitHub jobs in run
33512985341. The frozen train-only weights can now be evaluated over their exact
synthetic test fold without refitting. A versioned artifact records the deterministic
period path, cumulative change and maximum drawdown and rejects incomplete coverage,
foreign provenance, or resealed false metrics. Sixty laboratory tests pass locally;
every evaluation remains `no_decision`, no-use, no-execution and methodology-
unapproved.
Frozen-weight test-fold evaluation checkpoint `a41e931` passed all three GitHub jobs
in run 33513624194.
The inverse-volatility comparison can now replay every fold of a complete synthetic
walk-forward plan. Its report preserves separate train/test ranges and exact
standardizer, weight and evaluation identities for each fold, while an explicit
`none_fold_metrics_only` policy prevents a combined performance claim. A future-value
mutation test proves the first fold's fitted statistics and weights do not change.
Sixty-five laboratory tests pass locally; the report remains no-decision and cannot
enable financial use or execution.
Multi-fold comparison-report checkpoint `486fb6b` passed all three GitHub jobs in run
33514166000.
A versioned train-only population-covariance artifact now computes the exact symmetric
matrix for one synthetic fold. It is bound to the dataset, return matrix, walk-forward
plan and standardizer, records zero-variance paths, and rejects future-influenced or
resealed false values. Seventy laboratory tests pass locally. This is deterministic
risk-feature plumbing only; no risk model, allocation method, recommendation or
execution has been selected.
Train-only covariance checkpoint `39e29dd` passed all three GitHub jobs in run
33514636287. The covariance artifact can now produce a versioned Pearson-correlation
matrix for its non-zero-variance synthetic paths. Zero-variance paths are explicitly
excluded and disclosed; an insufficient active set fails closed. Future test changes
cannot alter fitted values, exact provenance/replay is required, and seventy-five
laboratory tests pass locally. No portfolio methodology or decision is produced.
Train-only correlation checkpoint `5a213e1` passed all three GitHub jobs in run
33515041657. The reviewed correlation artifact can now produce a versioned zero-to-one
correlation-distance matrix: identical synthetic paths have distance zero and perfect
opposites have distance one. Exact upstream provenance and replay are mandatory;
future test changes cannot alter fitted distances. Eighty tests pass locally and no
cluster, portfolio weight, recommendation or execution is produced.
Correlation-distance checkpoint `77b279e` passed all three GitHub jobs in run
33515393483. Deterministic train-only single-linkage clustering now records each
nearest-path merge with a fixed lexicographic tie-break. Exact upstream provenance and
replay are required and future test changes cannot alter fitted merges. Eighty-five
tests pass locally. Leaf ordering and HRP weights are deliberately absent, so this
artifact cannot allocate a portfolio or emit a decision.
Single-linkage clustering checkpoint `4fac0eb` passed all three GitHub jobs in run
33515814787. Its exact tree can now be traversed into a versioned left-to-right leaf
order containing every active path exactly once. Excluded zero-variance paths remain
disclosed; future test changes cannot alter the train-only order and reversed/resealed
orders fail closed. Ninety tests pass locally. The contract explicitly keeps HRP
weighting uncomputed and cannot allocate or recommend.
Cluster leaf-order checkpoint `a80ac2e` passed all three GitHub jobs in run
33516266233. A separate HRP-style synthetic comparison control now consumes the exact
train-only covariance and reviewed cluster order. Ordered-half recursive bisection
records every cluster variance/allocation and emits 12-decimal weights summing exactly
to one; excluded zero-variance paths receive zero. Ninety-five tests pass locally.
The output stays `no_decision`, no-use, no-execution and does not approve HRP as the
project's real allocation methodology.
HRP comparison-control checkpoint `9e0b3e1` passed all three GitHub jobs in run
33517070244. Those frozen train-only HRP weights can now be evaluated on only their
associated synthetic test fold. The shared versioned evaluation contract preserves
the full upstream covariance-to-order provenance, deterministic return/wealth path,
cumulative change and maximum drawdown. One hundred laboratory tests pass locally;
future test changes do not refit the weights and resealed false metrics fail closed.
The evaluation remains `no_decision`, no-use and no-execution.
HRP test-fold evaluation checkpoint `c44d255` passed all three GitHub jobs in run
33518097199. A separate discrete minimum-CVaR synthetic comparison control now
exhausts every long-only, fully invested candidate on a bounded weight grid using only
the selected fold's training scenarios. The experiment caller must state the tail
scenario count and weight step; no hidden confidence level, target return or real
methodology is selected. Exact candidate count, selected tail losses, CVaR loss, mean
return and weights are replayable. One hundred and five laboratory tests pass locally;
future test changes cannot alter fitted results and grid-size limits fail closed. The
artifact is permanently `no_decision`, no-use and no-execution.
Minimum-CVaR comparison-control checkpoint `4f4e7be` passed all three GitHub jobs in
run 33520594615. Its selected train-only grid weights can now be frozen and evaluated
only on the exact associated synthetic test interval. The shared versioned artifact
records the deterministic return/wealth path, cumulative change and maximum drawdown,
requires exact dataset/matrix/plan/weight provenance and rejects incomplete intervals
or resealed false metrics. One hundred and ten laboratory tests pass locally. Future
test changes alter the evaluation but cannot refit the weights; every output remains
`no_decision`, no-use and no-execution.
Minimum-CVaR test-fold checkpoint `897da2b` passed all three GitHub jobs in run
33521035243. A dedicated multi-fold report now refits the explicit bounded grid on
each fold's training interval and freezes those weights for only that fold's test
interval. It records scenario/candidate counts, exact weight/evaluation identities and
separate fold metrics. The aggregation policy is permanently
`none_fold_metrics_only`, so no stitched or headline performance number is claimed.
One hundred and fifteen laboratory tests pass locally; omitted folds, incomplete
matrices, invalid tail sizes and resealed reports fail closed. The report remains
`no_decision`, no-use and no-execution.
Minimum-CVaR multi-fold checkpoint `548a2fa` passed all three GitHub jobs in run
33521541570. Exercising the same multi-fold mechanics against HRP then exposed a real
transport-rounding defect: fold 2 could derive a correlation just over one from
12-decimal covariance values. Correlation contract v2 now recomputes exact train-only
moments from the provenance-bound return matrix and uses rounded covariance only as a
validated upstream identity. The previously failing fold now completes without a
loose numerical clamp. The complete HRP standardizer/covariance/correlation/distance/
clustering/order/weight/evaluation chain can now replay independently across all three
synthetic folds. Its report records every artifact identity and keeps fold metrics
separate with no aggregate claim. One hundred and twenty tests pass locally; every
output remains `no_decision`, no-use and no-execution.
An explicit synthetic stress-scenario contract can now apply bounded additive shocks
to exact cells of a provenance-bound return matrix. Every output cell preserves its
base return, explicit shock (including visible zero for unspecified cells), and
stressed return. Real identifiers, ambiguous ordering, out-of-matrix shocks, total-
loss arithmetic and resealed false values fail closed. One hundred and twenty-six
laboratory tests pass locally. This is crisis-test plumbing only: no crisis definition,
threshold, benchmark ranking, financial decision, real use or execution is approved.
Synthetic stress-matrix checkpoint `860ed2b` passed all three GitHub jobs in run
33962814546.
Frozen train-only inverse-volatility weights can now be applied to the exact stressed
test fold without refitting. The versioned side-by-side artifact preserves both
return/wealth paths and their separate cumulative-change/drawdown metrics, requires
every explicit shock to be used exactly once, and contains no winner, rank or
threshold. One hundred and thirty-two laboratory tests pass locally; the result stays
`no_decision`, no-use and no-execution.
Frozen inverse-volatility stress-evaluation checkpoint `069018d` passed all three
GitHub jobs in run 33963506190.
The same exact frozen-weight stress contract now covers the reviewed HRP and
minimum-CVaR comparison controls. Each control keeps its training-derived weights
fixed over the associated shocked test fold, records separate base/stressed paths,
and rejects foreign provenance, altered metrics or canonical-transport drift. One
hundred and thirty-eight laboratory tests pass locally. The shared contract still
cannot rank controls, set a threshold, recommend, approve a methodology or execute.
Extended frozen-control stress checkpoint `4a1ace9` passed all three GitHub jobs in
run 33965934288.
A versioned multi-scenario stress suite now replays between two and sixteen explicit
synthetic scenarios against one exact frozen inverse-volatility, HRP or minimum-CVaR
weight set. Every scenario keeps its own stressed-matrix/evaluation identities and
metrics; the suite has a permanent `none_scenario_metrics_only` policy and rejects
missing, reordered, duplicate or resealed results. One hundred and forty-five
laboratory tests pass locally. No cross-scenario aggregation, ranking, threshold,
methodology approval, recommendation or execution is possible.
Multi-scenario stress-suite checkpoint `90d307d` passed all three GitHub jobs in run
33966709184.
A versioned walk-forward stress report now refits each reviewed comparison control on
every exact synthetic training fold, freezes those weights for the matching test fold,
and replays that fold's explicit scenario suite. Each of the six fold/scenario cells
keeps separate matrix, evaluation and suite identities. One hundred and fifty-two
laboratory tests pass locally; missing/reordered folds, altered metrics and noncanonical
minimum-CVaR parameters fail closed. The permanent
`none_fold_or_scenario_metrics_only` policy forbids a combined score, ranking,
threshold, methodology approval, recommendation or execution.
Multi-fold/multi-scenario stress checkpoint `eaf41c6` passed all three GitHub jobs
in run 33972395723.
A versioned methodology-evaluation rubric now predeclares ten evidence questions, and
a paired registry contract requires source identity/version/currentness review,
assumptions, explainability, data requirements, Iran gaps, robustness requirements and
one separate evidence cell per criterion. Eight new tests bring the laboratory total
to one hundred and sixty. No score, weight, threshold, ranking or selection exists;
real source entries and every financial-methodology decision remain pending.
Methodology-evidence governance checkpoint `5ca14c5` passed all three GitHub jobs in
run 33975366552.
An exact research registry now records one primary publication for each existing
inverse-volatility, HRP and minimum-CVaR comparison control, the 2026-09-05 review
date, method-specific non-equivalence limitations and the pinned synthetic stress
artifact. Data sufficiency, Iranian validation and real cost/liquidity evidence remain
explicitly unmet. One hundred and sixty-six tests pass locally; source identity is now
auditable but no method is scored, ranked, selected or approved.
Reviewed-source registry checkpoint `1aeed02` passed all three GitHub jobs in run
33978255294.
A versioned evidence-gap report now derives only from that exact registry and keeps
all 30 method/criterion cells separate. Each cell exposes `documented`,
`synthetic_only` or `not_evaluated`, evidence references, limitations and exact open
requirements. Method-level data needs, Iranian gaps, robustness checks and failure
modes remain visible. One hundred and seventy-two laboratory tests pass locally; the
report cannot compute completeness, rank methods, select one or enter application
runtime.
Evidence-gap report checkpoint `b8d5878` passed all three GitHub jobs in run
33981364535.
A versioned research-candidate intake now prevents a newly discovered method from
entering even the research list without dated manual search, human review,
authoritative source identity, explicit scope, non-equivalence limits and all ten
unresolved evidence cells. Marketing sources, source chronology errors, automated-
search claims, implementation, Iranian-fitness claims and selection fail closed. One
hundred and eighty laboratory tests pass locally. The contract contains only synthetic
test fixtures and performs no network search or runtime integration.
Research-candidate intake checkpoint `f70c594` passed all three GitHub jobs in run
33984497183.
A dated, exact candidate-discovery catalog now records four research-only methods from
a bounded 2017–2026 primary-literature review: HCAA, generalized risk parity with
ADMM, Wasserstein distributionally robust mean-variance and fast HRP. All four remain
`not_implemented` and Iran-unevaluated. Only their four source cells are documented;
the other 36 evidence cells remain `not_evaluated`, and source currentness remains
explicitly unresolved. Six new tests bring the laboratory to one hundred and
eighty-six. The catalog has no performance comparison, score, rank, selection,
financial permission or runtime connection.
Reviewed candidate-catalog checkpoint `cc18418` passed all three GitHub jobs in run
33987575792.

The owner authorized staged Data Foundation and deterministic-baseline development,
with each stage dependent on the previous quality gate. Private GitHub authentication
is working: Phase 1 HEAD `2823864138ef1ee7eb722b7a6c54d3a028a55403` was published and
verified with upstream configured; remote `main` stayed at
`5c03fabb1c8090497c0b03c9059a6e51fdb91d03`, with no tags or backup branch published.
The Node 22 TypeScript test-command repair passed GitHub run 33304773397.
The owner requested a development checkpoint for transfer to another computer;
the code checkpoint `ec3f410` subsequently passed GitHub quality and real PostgreSQL
integration/restore in run 33316064205. This handoff is
not a phase acceptance or authorization to repair the old host's ACL. Follow
[`CONTINUE_ON_ANOTHER_SYSTEM.md`](../../CONTINUE_ON_ANOTHER_SYSTEM.md).
On the transferred Windows host, the official PostgreSQL 17.11 runtime was verified,
the project-owned cluster was initialized as the interactive Windows owner, and the
real local integration/restore suite passed (13/13). The protected runtime environment
passed activation checks; with explicit process-environment forwarding,
`/api/health` reports observation persistence as connected. See
[`POSTGRES_FOUNDATION_CHECKPOINT.md`](POSTGRES_FOUNDATION_CHECKPOINT.md). No Phase 2
branch has been created. Local owner-scoped portfolio, constraint and horizon save/restore is implemented;
production account authentication, historical backfill, and the real baseline remain pending. See
[`PHASE_1_STABILIZATION_AUDIT.md`](../../PHASE_1_STABILIZATION_AUDIT.md).
Preference-persistence checkpoint `c5a5d16` passed both GitHub quality and real
PostgreSQL jobs in run 33389444502.
Migration 0005 now adds the immutable provenance registry and exact dataset/decision
lineage foundation. Provenance checkpoint `61ab33c` passed both GitHub quality and
real PostgreSQL jobs in run 33392420564; verification details are tracked in
`POSTGRES_FOUNDATION_CHECKPOINT.md`.
Migration 0006 now requires a reason for every append-only correction and stores exact
point-in-time source-reconciliation candidates, ranks, selections and reason codes.
Checkpoint `0d1c2e9` passed both GitHub jobs in run 33393986374. It does not define
empirical price-divergence thresholds or activate financial use.
Migrations 0007–0009 add an owner-isolated, append-only transaction and valuation storage
foundation. It is runtime-read-only and `evaluation_only`; no real event/value is
seeded and no financial methodology is selected. A plain-language Persian production
identity proposal now includes a dated official pricing/terms snapshot. Iran account
eligibility is still unverified. The owner accepted an owner-only next real release in
ADR 0006 and accepted an external identity service limited to minimum login data in
ADR 0007; the exact provider, terms, cost and Iran eligibility remain owner-required.
ADR 0008 keeps the current local/demo experience without new production login and
makes strong owner-only identity a fail-closed gate before hosted real financial data.
The read-only owner-server preflight found an existing local override for Cloudflare's
API hostname; no remote setting was changed and that candidate is not host-ready. See
`docs/09-operations/DEPLOYMENT.md`.
Checkpoint `d0ea16f` passed both GitHub jobs in run 33396556534.
Migration 0010 adds the immutable Navasan request-reservation ledger. The replacement
credential, durable quota health, eight-quote live normalization, historical endpoint
contracts and backup/restore path pass locally; no historical backfill was requested.
Migration 0011 adds a single mutable latest-runtime-status row and moves the live
refresh cooldown into the serialized PostgreSQL reservation transaction. Restarts,
hot reloads and browser refreshes cannot spend another call before the cooldown ends;
the status row stores no credential, payload, price or long-term market history.
The local Persian readiness planner validates proposed Jalali ranges, approved
symbols and exact request counts without network or storage, while execution remains
locked. That readiness checkpoint covered 90 unit and 14 real PostgreSQL tests.
Code checkpoint `b0bb80a` passed both GitHub quality and real PostgreSQL jobs in
run 33417744818.
Backfill-readiness checkpoint `8a21a97` passed both GitHub quality and real
PostgreSQL jobs in run 33421273488.
The safe parallel history-quality checkpoint adds an offline deterministic OHLC
continuity audit. Synthetic fixtures prove detection of unobserved Jalali dates,
duplicates, rows outside the requested range, mixed instruments and Tehran
timestamp/date mismatches; zero values are interpolated and the audit cannot permit
storage or financial use.
The public Navasan and TGJU material has now been reviewed and a plain-language
licensed-backfill proposal plus ready-to-send Persian inquiries are recorded in
`docs/05-data/HISTORICAL_BACKFILL_PROPOSAL.md`. On 2026-08-31 the owner authorized
and sent the no-secret Navasan permission inquiry through the official contact bot;
Telegram displayed it as read, but no written vendor answer has been received or
treated as permission. No purchase was authorized and no historical request was made.
The owner later deferred further vendor contact and subscription purchase until the
final API-integration stage. No active monitor, purchase, provider call, or historical
request is part of the current autonomous work.

The safe non-API hardening lane now enforces source-only test coverage floors of 85%
lines, 65% branches, and 80% functions. Four direct repository tests cover empty
restore, exact holding/preference restore, atomic versioned save, and stale-version
failure before holdings are replaced. Generated build output cannot inflate coverage.
Coverage checkpoint `01095cb` passed both GitHub jobs in run 33477121188; remote
`main` remained at `5c03fabb1c8090497c0b03c9059a6e51fdb91d03`.
The project-owned database now also has a manual verified-backup command. It creates
a unique custom-format file in the restricted Git-ignored cache, restores it into a
temporary database, compares all 25 governed table counts and the migration journal,
then removes the temporary database. Three real local backups passed this flow. It is
not encrypted or offsite, so production backup policy remains open. Backup checkpoint
`5fd67d0` passed both GitHub jobs in run 33478298802; remote `main` remained unchanged.
The local operations command now checks only `localhost:4174/api/health`, requires all
database-backed Phase 1 surfaces, and fails unless real financial use remains locked.
The real running application passed this check without a provider request. Readiness
checkpoint `d3da848` passed both GitHub jobs in run 33479256145; remote `main`
remained unchanged.
The prepared Windows owner host now has a one-step local launcher. It validates the
exact protected persistence environment, starts project PostgreSQL, and starts or
confirms the loopback web app without logging credentials. The real host correctly
recognized its already-healthy application. Launcher checkpoint `38fba17` passed
both GitHub jobs in run 33480065419; remote `main` remained unchanged.
The consolidated Persian pre-API audit is in `PRE_API_READINESS_AUDIT_FA.md`. It marks
the accepted Phase 1 no-paid-API/local scope complete and gives a provisional 55%
whole-real-release coordinate, with the remaining weight explicitly assigned to
licensed real data, validation, financial methodology and production operations.

## Snapshot

- **Phase:** Phase 1 Data Foundation is owner-accepted for progression. Phase 2 —
  synthetic-only independent financial laboratory — is active under ADR 0009.
- **Branch:** Phase 2 work is isolated on `codex/phase-2-decision-engine`, created
  from verified Phase 1 HEAD `0f90210`; `main` remains untouched pending separate
  owner-approved merges.
- **Application:** a Persian RTL personal-wealth dashboard exists in `apps/web` with
  category-first portfolio session entry, filtered asset types, asset-specific units,
  and an optional no-typing Persian calendar purchase-date picker, market watch,
  deterministic per-holding and total profit/loss calculation, market watch,
  sortable holdings and market tables (numeric columns default descending), a compact
  asset workflow split into List, Asset Center, Analysis, and Decisions, risk/data readiness surfaces, and
  explicit source/freshness labels. The analysis workspace now separates summary,
  geopolitical, political/policy, macroeconomic, industry/supply-demand, technical,
  bubble/valuation, and portfolio/risk lenses across short- and long-term horizons.
  A deterministic, version-labelled multi-driver what-if engine reports per-holding
  and portfolio impacts, but its disclosed UI sensitivities are not calibrated or
  approved as forecasts. A clearly labelled ten-position, cross-asset demo portfolio
  is the default for a fresh browser session so every browser can evaluate the full
  product immediately; an explicit switch returns to the browser's personal portfolio.
  The demo spans precious metals, currency, cash/deposit,
  equities, ETF, crypto, property, and private business. It supports realistic UI
  evaluation without presenting synthetic holdings or cost basis as user or market data.
  In demo mode, a versioned full-experience laboratory supplies 14 explicitly
  synthetic market quotes and activates scenario, multi-lens analysis, premium,
  portfolio weights, concentration, return, stress, and per-asset decision views.
  All eight analysis lenses now use `ASHA_SYNTHETIC_INTELLIGENCE_V1` to calculate
  short/long-horizon momentum, 20-observation volatility, maximum drawdown, premium
  distance/range where applicable, best/worst scenario impact, score breakdown,
  decision amount/reason, and invalidation condition from a versioned 90-observation
  synthetic history. The same engine ranks same-class and cross-class routes, enforces
  drawdown tolerance, liquidity target, concentration cap, and rotation limits, and
  produces the overall demonstration action. It does not invent VaR, Sharpe, or
  statistical confidence from the synthetic series. Supported metal examples also
  expose a versioned synthetic premium-history fixture. `ASHA_SANDBOX_DECISION_V1`
  remains the lower-level constraint calculation feeding this engine; every surface is
  labelled synthetic, execution remains disabled, and the prior personal portfolio
  is restored when the laboratory is closed. These are product-experience fixtures,
  not market claims or financial recommendations. Personal mode now offers explicit
  local PostgreSQL save/restore; browser data is never uploaded or overwritten
  automatically, and demo holdings are never persisted. The UI
  uses Asha's matte-white and pastel-violet token layer,
  organic radii, accessible contrast, a custom inline SVG mark, and a matching favicon.
  Persian typography now bundles the variable Vazirmatn font and uses a readable
  13px minimum supporting-text size with a consistent heading/body scale. The Asset
  Center explicitly overrides the legacy compact theme so facts, values, signals,
  and card titles keep the same hierarchy at desktop and responsive widths.
  The oversized overview slogan has been replaced by a compact command bar; card,
  table, panel, and guardrail spacing is tightened to reduce scrolling without hiding
  provenance or safety state. Every monetary UI output is paired as toman and USD. The
  conversion rate comes from the labelled `USD_IRR` observation; demo portfolio values
  use an explicit synthetic rate, and a missing rate yields an unknown counterpart
  instead of a fabricated conversion.
- **Dashboard priority:** the first page now prioritizes the owner's portfolio and
  a high-importance opportunity surface. Market watch is removed from the overview
  and remains available through its own tab. Portfolio positions are grouped into
  compact, keyboard-accessible asset-category accordions; opening a category reveals
  its holdings and provides a direct route to each Asset Center. Opportunity absence is explicit; only
  already-labelled demo opportunity notifications can appear as synthetic examples.
  Decorative geometric glyphs have been removed from navigation, analysis, risk,
  review, and overview cards so labels and financial state carry the hierarchy
  directly.
- **Portfolio operations:** holdings can now be created and edited through the same
  category-first, unit-aware form, including preservation of an optional Jalali
  purchase date. Deletion requires a separate confirmation dialog. Wide portfolio,
  premium, and market tables keep horizontal scrolling inside the table surface
  instead of expanding the entire page.
- **Information architecture:** selecting a holding carries its context into a
  three-column Asset Center (information, analysis readiness, decision readiness),
  the multi-lens analysis tab, and the dedicated per-asset decision tab. The overview
  retains only a compact decision brief so the daily dashboard stays scannable. In
  the labelled laboratory, Asset Center now exposes the selected holding's calculated
  homogeneous and heterogeneous actions plus the best overall portfolio action,
  each with its score-derived explanation, horizon, method ID, and disabled
  execution state; readiness-gate detail remains in the dedicated Decisions tab.
- **Assistant identity:** the owner-facing decision assistant is named **Asha / اشا**;
  Gold/Silver AI remains the repository and product identity.
- **Decision taxonomy:** the owner-approved UI separates homogeneous comparisons
  within an asset class, heterogeneous conversion comparisons across classes, and
  a best overall portfolio action. `DECISION_FRAMEWORK_UI_V1` deterministically
  reports readiness gates and currently fails closed; it does not rank targets or
  produce financial actions while methodology, owner constraints, Iranian history,
  backtesting, and walk-forward validation remain unresolved.
  The separately labelled sandbox decision engine can render a complete interaction
  flow, but its six passing gates are synthetic UI fixtures and do not unlock or alter
  this real readiness state.
  The Decisions tab captures the owner's five explicit constraints (liquidity
  reserve, concentration cap, tolerated drawdown, and short/long horizons). They
  remain session-local until the owner explicitly saves the personal portfolio;
  that action persists and versions them atomically with holdings. Completing them
  opens only that single gate.
- **Bubble boundary:** for supported gram-based gold and silver holdings, the UI can
  compute a raw current metal-content premium only when the domestic quote, global
  ounce quote, and USD/IRR quote are all present and valid. Historical minimum,
  average, and maximum remain explicitly unavailable until Iranian point-in-time
  history and an owner-approved, backtested methodology exist. Coins are excluded
  from this interim calculation because their exact reference specification is not
  yet approved. The clearly labelled laboratory separately supplies
  deterministic synthetic current/minimum/average/maximum figures for UI evaluation;
  those fixtures never enter the real premium path.
- **Calendar boundary:** all user-facing dates use the Persian calendar and Tehran
  time. New purchase dates are entered as Jalali `YYYY/MM/DD`. Provider timestamps and
  audit storage remain ISO-8601 UTC so ingestion, ordering, and provenance stay
  interoperable; they are converted only at the presentation boundary.
- **Notifications:** a session-local notification center detects severe moves only by
  comparing two newer, valid, same-unit observations within 24 hours. Instrument-specific
  thresholds are deterministic. Stale-data alerts fail closed. Opportunity alerts are
  available as clearly synthetic demo content only; real opportunity claims remain
  disabled until an approved, backtested, walk-forward-validated methodology exists.
- **Live data:** the normalized `/api/market` boundary supports an eight-symbol keyed
  Navasan adapter for 18k gold, mesghal, five coin products, and free-market USD.
  On ۱۴۰۵/۰۶/۰۹ the owner obtained a replacement key from the official bot; it was
  transferred directly into Git-ignored local configuration and a fresh live check
  returned all eight normalized observations. The setup script itself does not revoke
  provider keys. Provider `dailyCurrency` and `ohlcSearch` contracts are now
  implemented behind a loopback/same-origin route, but no historical request or
  backfill has been made. Its string values
  and Unix timestamps are normalized deterministically. The official public table
  establishes a toman contract; direct-toman 18k/USD values and fixed thousand-toman
  mesghal/coin scales are encoded per symbol, while wrong scale/unit ranges fail closed.
  A local Persian plan-only surface now validates proposed Jalali ranges and approved
  symbols, reports one planned OHLC call per selected symbol, and keeps execution
  disabled without consuming quota or storing data.
  A later provider connection timeout was reported explicitly; stale Rahavard values
  remain visible only as provenance and are never presented or used as a current rate.
  The free-plan policy enforces at least 24,000 seconds (6h40m), which schedules
  at most 112 calls in a 31-day window. The interval is checked inside PostgreSQL,
  so process restarts and page reloads cannot bypass it. Before
  every uncached Navasan call, PostgreSQL now serializes workers and appends an
  immutable reservation; a conservative 115-call rolling 31-day limit preserves five
  calls of safety headroom below the provider's 120-call plan. Missing quota storage
  or exhausted allowance fails closed before network access. The loopback Data Trust
  card and `/api/health` show aggregate usage, a sanitized latest outcome and the
  exact next eligible call time derived from local reservations only. A browser-only
  30-second timer updates the Persian time remaining without another health or
  provider request.
  An explicitly
  authorized live verification on ۱۴۰۵/۰۶/۱۰ returned all eight approved valid quotes;
  a development reload later exposed one pre-fix extra reservation. After the durable
  fix, a controlled replay left the counter unchanged at 4 used and 111 remaining.
  No historical request or write occurred. GoldAPI.io now uses its
  current official `/api/price/{metal}/{currency}` route and rejects a response unless
  the metal, USD currency, Unix time and plausible range match the request. Its
  documented ordered daily-history range is normalized separately, split into
  inclusive chunks of at most 90 days, and audited for gaps without interpolation.
  A local Persian plan-only surface calculates the exact future request count for
  XAU and XAG while purchase, network access and storage stay locked. XAUS and
  Gold-API.com are now fetched independently on each
  uncached refresh: XAUS supplies the displayed informational XAU/XAG feed when valid,
  while Gold-API.com is an independent public cross-check and becomes the display
  fallback only if XAUS fails. Their status remains informational and cannot unlock a
  decision. A hidden-input PowerShell setup command writes provider keys only
  to Git-ignored `.env.local`; its owner-facing prompts are now Persian and keep the
  revoked-key confirmation mandatory. An owner-approved Rahavard browser capture supplies a local-only manual
  snapshot for 13 instruments; raw IRR provenance is retained, display values use an
  exact IRR/10 conversion, and every observation becomes stale after 60 minutes. It is
  not an automated feed and stale values are excluded from portfolio valuation. No
  fabricated market value enters the real-data path; synthetic values exist only in
  the clearly labelled laboratory and carry the `asha-sandbox` provenance on every record.
  The official TGJU web-service/order path is exposed as a pending licensed source;
  no page scraping, credential reuse, hidden endpoint abuse, or third-party script
  injection is used.
  The market-watch page is independent of the demo portfolio and always renders the
  validated online feed. Duplicate instruments are selected by explicit status,
  quality, source-priority, and observation-time rules, so a valid keyed Navasan rate
  outranks a valid manual Rahavard duplicate without depending on insertion order.
- **Repository:** Phase 1 branch publication and upstream tracking are verified. The
  repository was made public for transfer; access policy should be reviewed before
  licensed data, operational configuration, or sensitive functionality is added.
  The initial remote CI failure is resolved at the
  published repair HEAD; current database work is a development handoff, not a release. The
  active canonical directory is the current checkout on this Windows host. Its
  development history supersedes older copies, which remain preserved.
  The published branch tracks `origin/codex/phase-1-data-ui`; `main` is not modified.
- **Decision record:** Phase 1 scope, wealth UI scope, live-source boundary, and the
  temporary Rahavard manual-snapshot boundary are in ADR 0001 through ADR 0004.
- **Data Foundation:** schema version 1 now defines instrument, source, observation,
  validation, quarantine, duplicate, and ingestion-batch contracts. Manual CSV rows
  pass through deterministic registry/unit/decimal/UTC/point-in-time validation;
  invalid rows are retained in quarantine and repeated source events are idempotent.
  A PostgreSQL migration and parameterized transactional repository are implemented
  without loading market values. The Data Trust tab now exposes a loopback-only,
  same-origin CSV operator preview for the six instruments accepted in ADR 0001. It
  reports accepted, duplicate, and quarantined rows without returning raw payloads;
  the revalidation-and-commit path is wired to the transactional repository behind
  an explicit enable flag and loopback-only PostgreSQL URL. Runtime PostgreSQL,
  applied migrations and current-source integration evidence are connected on the
  transferred host; no real market observations have been committed yet. The
  development checkpoint adds migration
  checksums/rollback, database probes, immutable batch/truncate protection, correction
  constraints, exact decimal limits and server-controlled collection time; real
  PostgreSQL integration and fixture restore passed both isolated GitHub CI and the
  transferred Windows owner host. Local observation persistence is connected.
  Migrations 0003 and 0004 add versioned portfolio, holding and preference tables
  with forced row-level security, least-privilege grants and conflict detection.
  Owner constraints and analysis/decision horizons save and restore in the same
  transaction as holdings, with no assumed financial defaults. The API remains loopback-only;
  production identity and public multi-user persistence are not implemented.
  Migration 0005 attaches observations to immutable Source contract versions and
  adds versioned Dataset, Assumption, Feature, Model, Methodology, and evaluation-only
  Decision records. Dataset membership is exact and cutoff-bounded; registry rows
  cannot be updated, deleted, or truncated. Runtime access is read-only, and no real
  financial decision has been created or enabled.
  Migration 0006 adds immutable source-reconciliation records and requires a bounded
  plain-language reason on every correction. Migrations 0007–0011 add exact transaction
  and evaluation-only valuation lineage, immutable provider-call reservations and a
  bounded latest provider-runtime status and a pre-quota dual authorization lock for
  real Navasan history; 129 unit and 16 real PostgreSQL tests pass locally. Source
  coverage is 93.78% lines, 79.51% branches and 94.67% functions.
  GoldAPI global-history checkpoint `eab4b16` passed GitHub quality/audit and real
  PostgreSQL jobs in run 33489418166; remote `main` remained unchanged.
  Navasan free-plan safety checkpoint `6b64e16` also passed both GitHub jobs in run
  33493075764; remote `main` remained unchanged.
  Durable restart-guard checkpoint `23a8e82` passed both GitHub jobs in run
  33496090925; remote `main` remained unchanged.
  Next-eligible visibility checkpoint `9a07947` passed both GitHub jobs in run
  33497221903; remote `main` remained unchanged.
  Local countdown checkpoint `6ce6d9b` passed both GitHub jobs in run 33497834262;
  remote `main` remained unchanged.
  A ۱۴۰۵/۰۶/۱۰ live-registry dependency re-audit found the production tree clean
  and one moderate development-only esbuild advisory under drizzle-kit. The latest
  stable generator still carries that deprecated loader; no beta/breaking upgrade
  was forced. See `KNOWN_ISSUES.md` item 8.
  A controlled owner-local history request returned HTTP 423 before quota resolution
  or network access; the Navasan counter remained 4 used / 111 remaining. Health now
  exposes this as a separate `navasan-history: locked` engine, and strict local
  readiness fails if the lock is missing or authorized during Phase 1.
  History-lock checkpoint `12728ee` passed both GitHub jobs in run 33500322761;
  remote `main` remained unchanged.
  Monitoring checkpoint `58c3325` passed both GitHub jobs in run 33500854728.
  The local Persian history planner now consumes the same strict health contract:
  only `navasan-history: locked` produces a safe label; missing, malformed or
  authorized state produces a visible stop warning, and the execution button stays
  disabled. Local build, lint, typecheck, 129 unit tests and 16 real PostgreSQL tests
  pass with 93.78% line, 79.51% branch and 94.67% function coverage.
  Owner-local visibility checkpoint `2908564` passed both GitHub jobs in run
  33501750783; remote `main` remained unchanged.
  In the fresh-session laboratory, a fixed
  five-row CSV sample exercises preview plus a memory-only commit result (three
  accepted, one duplicate, one quarantined) without reaching the server or implying
  persistence.
- **Public review:** Asha is available through a public Sites URL for UI review. It
  has no shared portfolio backend: each visitor's holdings remain in that browser
  session and are not visible to the owner or other visitors. The public operator
  import surface is explicitly disabled because its hostname is not loopback.
- **Operational visibility:** `GET /api/health` and the Data Trust engine panel expose
  web, market, persistence, scenario, and financial-decision readiness without secrets.
  The response remains `evaluation_only`. A read-only GitHub Actions workflow now
  encodes install, lint, typecheck, build, test, and production-audit gates; the first
  remote run exposed the now-resolved Node 22 TypeScript test-command issue. The
  default quality command also enforces source-only coverage regression floors. The
  database job uses a real PostgreSQL service and matching in-container
  backup/restore clients; it passed for the code checkpoint described above.
  Health exposes `provenance-registry: registry_ready` separately from the still
  blocked financial-decision engine.
- **Open-source review:** high-star same-concept projects were license-screened.
  AGPL product code was not copied; compatible patterns were independently implemented
  and recorded in `docs/07-engineering/OPEN_SOURCE_ADOPTION.md`.

## Immediate Next Step

See `NEXT_TASK.md`.
