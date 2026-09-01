# Known Issues

**Source of truth for:** known limitations and gaps in the current state.

## Phase 1 Limitations

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
6. **The demo portfolio is synthetic and session-local.** It opens by default in a
   fresh browser so the whole product can be tested, remains visibly labelled, and
   must never be interpreted as owner or market data. Demo holdings are excluded from
   database save; personal holdings move only through explicit save/restore controls.
7. **The public review link has no shared-account backend.** Local owner persistence
   does not alter the public deployment. A visitor's entered
   holdings stay in that browser session and cannot be reviewed by the owner. Because
   the link is public and unauthenticated, testers must not enter real sensitive
   financial information.
8. **One moderate development-only audit finding remains under `drizzle-kit`.**
   A live-registry re-audit on ۱۴۰۵/۰۶/۱۰ found the production tree clean. The exact
   full lock resolves `drizzle-kit@0.31.10` through the deprecated esbuild loader to
   vulnerable `esbuild@0.18.20` ([GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99)).
   Upstream marks replacement work as beta-only
   ([issue 4852](https://github.com/drizzle-team/drizzle-orm/issues/4852)); no stable,
   compatibility-proven upgrade exists yet. The generator remains a development-only
   tool for trusted local schema input and is absent from production installs.
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
