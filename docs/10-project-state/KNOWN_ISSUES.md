# Known Issues

**Source of truth for:** known limitations and gaps in the current state.

## Phase 1 Limitations

1. **Resolved: private Git publication.** Browser-authorized Git Credential Manager
   now authenticates successfully. The development branch was published with verified
   HEAD/upstream and unchanged remote `main`; no tag or backup branch was published.
2. **Remote CI needs a passing rerun.** Run 33303448183 passed locked install, lint,
   typecheck, and build, then failed with `ERR_UNKNOWN_FILE_EXTENSION` because Node
   22.13.1 does not enable TypeScript stripping by default. The test command now
   enables it explicitly and has a regression contract test. Remote verification of
   the fix and production dependency audit remain pending; branch protection is not
   configured.
3. **PostgreSQL is wired but not running.** Schema version 1, migration SQL,
   repository code, guarded runtime adapter, preview/commit route, and isolated tests
   exist, but PostgreSQL/Docker/`psql` are not installed on the current development
   host. Commit therefore returns an explicit unavailable state and stores nothing.
4. **Iranian source continuity and redundancy are missing.** Navasan has a tested
   toman/per-symbol scale adapter but is paused until its exposed key is revoked and
   replaced. The rotation flag is an operator declaration, not proof from the vendor.
   TGJU still requires licensed access; the manual Rahavard snapshot is expired.
   Even after rotation, Navasan alone cannot satisfy independent cross-checking.
5. **Financial decisions remain intentionally locked.** The owner-constraint form is
   implemented and session-local; this audit cannot establish another browser's
   saved values. Iran-specific
   history, methodology approval, backtesting, and walk-forward validation are also
   incomplete.
6. **The demo portfolio is synthetic and session-local.** It opens by default in a
   fresh browser so the whole product can be tested, remains visibly labelled, and
   must never be interpreted as owner or market data. Personal/demo preference and
   holdings are still independent in every browser.
7. **The public review link has no shared-account backend.** A visitor's entered
   holdings stay in that browser session and cannot be reviewed by the owner. Because
   the link is public and unauthenticated, testers must not enter real sensitive
   financial information.
8. **Four moderate development-only audit findings remain under `drizzle-kit`.**
   The previous audit reported a clean runtime tree; it was not rerun against the
   live registry during this stabilization. The registry's automated remedy would downgrade
   `drizzle-kit` across a breaking boundary, so it was not forced; the local migration
   generator must not process untrusted input and should be upgraded when its upstream
   chain removes the legacy esbuild loader.
9. **Navasan quota/backfill are incomplete.** Only `latest` is implemented. The
   six-hour in-process cache does not enforce a monthly quota across restarts or
   workers. Durable accounting, `dailyCurrency`, `ohlcSearch`, permitted backfill,
   persisted source disagreement, and point-in-time revisions remain pending.
10. **The approved real baseline is not implemented.** The independent locked Python
    laboratory, complete registries, train-only feature normalization, calibrated
    confidence, benchmark comparisons, nested walk-forward, and immutable decision
    ledger must follow the Data Foundation gate. Synthetic UI scores are not
    validated returns, confidence, or investment advice.
