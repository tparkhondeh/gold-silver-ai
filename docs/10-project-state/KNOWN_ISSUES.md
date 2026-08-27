# Known Issues

**Source of truth for:** known limitations and gaps in the current state.

## Phase 1 Limitations

1. **The Phase 1 branch is not confirmed on GitHub.** The private `origin` is
   configured, but authentication has stalled every non-force push attempt and the
   branch has no verified upstream. Local commits are intact; `main` is untouched.
2. **No CI or enforced branch protection is verified.** Lint, build, and tests run
   locally only.
3. **PostgreSQL is wired but not running.** Schema version 1, migration SQL,
   repository code, guarded runtime adapter, preview/commit route, and isolated tests
   exist, but PostgreSQL/Docker/`psql` are not installed on the current development
   host. Commit therefore returns an explicit unavailable state and stores nothing.
4. **Iranian source redundancy is missing.** Navasan remains inactive without a key
   and declared IRR/toman contract; TGJU requires licensed access; the Rahavard
   snapshot is manual and expired.
5. **Financial decisions remain intentionally locked.** Owner constraints,
   Iran-specific history, methodology approval, backtesting, and walk-forward
   validation are incomplete.
6. **The demo portfolio is opt-in, synthetic, and session-local.** It supports UI
   evaluation only and must never be interpreted as owner or market data.
7. **The public review link has no shared-account backend.** A visitor's entered
   holdings stay in that browser session and cannot be reviewed by the owner. Because
   the link is public and unauthenticated, testers must not enter real sensitive
   financial information.
8. **Four moderate development-only audit findings remain under `drizzle-kit`.**
   Runtime dependencies audit clean. The registry's automated remedy would downgrade
   `drizzle-kit` across a breaking boundary, so it was not forced; the local migration
   generator must not process untrusted input and should be upgraded when its upstream
   chain removes the legacy esbuild loader.
