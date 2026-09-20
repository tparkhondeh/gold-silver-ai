# Known Issues

**Source of truth for:** known limitations and gaps in the current state.

## Current private-domain limits — September 20, 2026

Private session/storage integration and production-entry code are now tested, but
not deployed. Actual Google login, verified owner binding, dedicated server DB,
service restart persistence, server restore and real cross-device acceptance remain
unverified. The approved external local secret destination is prepared; direct
browser Save As, replacement-client creation and key transfer remain gated.
Domain HTTPS remains 503. Full dependency audit still has existing advisories;
the private Node runtime uses some devDependencies, so omit-dev audit is not the
complete release security proof. Exact evidence and bounded handoffs:
[September 20 checkpoint](PRIVATE_DOMAIN_READINESS_2026-09-20.md).

Historical status paragraphs below do not override this checkpoint.

## Latest unified-workspace limits — September 17, 2026

The [current review](UNIFIED_PORTFOLIO_REVIEW_2026-09-17.md) supersedes historical
public-laboratory/manual-price-control descriptions below. Local confirmed
database saves are implemented; private hosted login, server storage, supervised
restart and cross-device recovery are **not**. Domain HTTPS currently returns 503
because its proxy backend is absent; no release SHA is deployed/verified.
Google-login preparation is authorized, but terms/credential handoffs remain.

Existing browser-only recovery records are preserved, not automatically merged;
three prior explicitly synthetic test purchases in the local database were not
deleted. New acceptance records use an isolated database. Do not describe the
owner database as an empty, production-ready personal account. Local backup is
daily while the launcher is running, not an off-device/disaster-recovery guarantee.
Actual quote receipt into the new shared cache is still gated by current cooldown;
historical FX, silver/other source gaps and analytical-input gates remain.

## Latest actual-market status — September 16, 2026

The former authenticated Navasan acquisition blocker is closed by one successful
latest request and browser valuation/replay acceptance. See
[actual evidence and remaining limits](REAL_MARKET_REVIEW_2026-09-16.md).
Rahavard permission/file profile, Iran-silver coverage and full analytical inputs
remain missing; global reference prices do not substitute for them. Free-feed
cadence and the 60-minute freshness rule remain distinct from successful receipt.

## Latest specialist review — September 16, 2026

See [the current review](SPECIALIST_REVIEW_2026-09-16.md) for corrected no-trade and
local persistence defects, evidence and retained gates. A hydrated browser
interaction regression lane is still absent from CI; imported TypeScript coverage,
handler tests and manual browser passes must not be represented as full automated
UI coverage. This is the next independent engineering task, not a data dependency.

## Phase 1 Limitations

2026-09-13 follow-up: [Node local compatibility](LOCAL_NODE_REVIEW_2026-09-13.md)
provides a tested alternate dev runtime with the same headers/loopback/market gates.
This avoids dependence on the failing Worker transport for the next local test;
authenticated Navasan quote success is still unverified. No added quota consumption.
Raw-metal shared diagnostics are connected, but historical bubble/regime are not.

Current 2026-09-13 observations supersede older connectivity claims: GitHub remote
read and npm audit now succeed. Domain 503 is consistent with an absent 3012
backend, not missing write permission; production identity remains unresolved.
Navasan times out in Worker transport while OS root HTTPS succeeds. Exact quota,
partial R2 coverage and untested hosted paths: [current audit](R2_DOMAIN_REVIEW_2026-09-13.md).

Historical checkpoint:

Current 2026-09-10 blockers supersede older connectivity statements below:
no usable new real snapshot yet (corrected Navasan transport awaits the retained
cooldown), Rahavard transfer permission absent, and fresh GitHub/npm audit TLS
connections failing. Exact evidence and retry boundary:
[`MARKET_TECHNICAL_TEST_2026-09-10.md`](MARKET_TECHNICAL_TEST_2026-09-10.md).

1. **Resolved: private Git publication.** Browser-authorized Git Credential Manager
   now authenticates successfully. The development branch was published with verified
   HEAD/upstream and unchanged remote `main`; no tag or backup branch was published.
2. **Original CI failure resolved; code checkpoint passes both jobs.**
   Run 33316064205 passed quality and real PostgreSQL integration/restore at ec3f410.
   This does not establish owner-host or personal-data readiness.
   Branch protection is not configured.
3. **Resolved on the transferred host: PostgreSQL ownership and local portfolio
   persistence.** The owner-created protected cluster passes migration, isolation
   and restore tests. Local save/restore is loopback-only; production authentication
   and hosted multi-user storage are still open.
4. **Iranian source continuity and redundancy are missing.** Navasan has a tested
   replacement key, toman/per-symbol scale adapter and durable local quota gate.
   The rotation flag remains an operator declaration, not proof from the vendor.
   TGJU still requires licensed access; the manual Rahavard snapshot is expired.
   Navasan alone cannot satisfy independent cross-checking.
5. **Financial decisions remain intentionally locked.** The owner-constraint form is
   implemented and can be explicitly versioned with the local portfolio; production
   account synchronization is still absent. Iran-specific
   history, methodology approval, backtesting, and walk-forward validation are also
   incomplete.
6. **The shared portfolio is synthetic and browser-local.** R1 now joins six views
   and saves/replays a versioned three-metal/cash input in its own browser namespace.
   Unsupported instrument classes block the whole decision. Old session demos and
   personal database storage are not migrated or mixed. Hosted synchronized storage,
   complete specialized analysis and real-data validation remain separate roadmap
   steps; see `SHARED_PORTFOLIO_DELIVERY_AUDIT.md`.
7. **The public review link has no shared-account backend.** Local owner persistence
   does not alter the public deployment. A visitor's entered
   holdings stay in that browser session and cannot be reviewed by the owner. Because
   the link is public and unauthenticated, testers must not enter real sensitive
   financial information.
8. **Development-dependency audit findings remain; production audit is clean.**
   A fresh registry audit on 2026-09-16 reports 11 affected development packages
   (5 high, 6 moderate), superseding the earlier single-finding count. These are
   pre-existing packages, not the new purchase importer dependencies. Advisory groups:
   [sharp/libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c),
   [Browserslist](https://github.com/advisories/GHSA-c83g-rgw3-j3cx),
   [Browserslist query complexity](https://github.com/advisories/GHSA-73wf-gq98-2v4g),
   [baseline-browser-mapping](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv),
   [fflate ZIP64](https://github.com/advisories/GHSA-px8p-9vwx-vf98), and the existing
   [drizzle-kit/esbuild chain](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99).
   The XLSX reader uses neither sharp nor fflate; local Node mode excludes the
   Cloudflare runtime plugin. This is not a blanket claim that every development
   dependency is unreachable in builds. Next bounded maintenance task: review and
   test compatible patched Cloudflare/miniflare/sharp, Browserslist, baseline and
   fflate versions; retain the separately tracked drizzle-kit issue. Do not force
   an audit fix that downgrades or changes the stack without compatibility review.
9. **Navasan backfill is not authorized.** Durable append-only accounting now
   serializes workers and caps application calls at 115 per rolling 31 days;
   `dailyCurrency` and `ohlcSearch` are normalized behind a local-only route. No
   historical call was made. A no-network readiness planner now exposes the proposed
   range, exact call count and unresolved gates without enabling execution. Licensed
   date scope, retention, market-calendar interpretation, empirical disagreement
   thresholds and independent cross-check coverage remain pending. An offline
   synthetic-fixture audit can already report raw calendar gaps and mark
   date/range/instrument inconsistencies as quarantine-required without
   interpolation, but it does not resolve those source-policy requirements.
10. **The approved real baseline is not implemented.** The independent locked Python
    laboratory, complete registries, train-only feature normalization, calibrated
    confidence, benchmark comparisons, nested walk-forward, and immutable decision
    ledger must follow the Data Foundation gate. Synthetic UI scores are not
    validated returns, confidence, or investment advice.
