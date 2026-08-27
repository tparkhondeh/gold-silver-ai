# Known Issues

**Source of truth for:** known limitations and gaps in the current state.

## Phase 1 Limitations

1. **The Phase 1 branch is not confirmed on GitHub.** The private `origin` is
   configured, but authentication has stalled every non-force push attempt and the
   branch has no verified upstream. Local commits are intact; `main` is untouched.
2. **No CI or enforced branch protection is verified.** Lint, build, and tests run
   locally only.
3. **PostgreSQL is designed but not connected.** Schema version 1, migration SQL,
   repository code, and isolated tests exist, but PostgreSQL/Docker/`psql` are not
   installed on the current development host. The protected CSV preview works; its
   commit action returns an explicit unavailable state and stores nothing.
4. **Iranian source redundancy is missing.** Navasan remains inactive without a key
   and declared IRR/toman contract; TGJU requires licensed access; the Rahavard
   snapshot is manual and expired.
5. **Financial decisions remain intentionally locked.** Owner constraints,
   Iran-specific history, methodology approval, backtesting, and walk-forward
   validation are incomplete.
6. **The demo portfolio is opt-in, synthetic, and session-local.** It supports UI
   evaluation only and must never be interpreted as owner or market data.
