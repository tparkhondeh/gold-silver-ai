# Asha Phase 1 Stabilization Audit

**Version 1.0.0** · Local engineering evidence · ۱۴۰۵/۰۶/۰۸ · Evaluation only

## AI READING INSTRUCTION

Read all `[SPEC]` and `[BUG]` blocks as scoped local evidence. `[?]` identifies
unverified external state. `[NOTE]` provides context, not additional approval.
This report does not authorize bypassing the owner's sequential quality gates.

## 1. Outcome

**[SPEC]**

- Local stabilization checks pass; remote stabilization gate is BLOCKED.
- Private GitHub authentication is unavailable to the configured Git workflow.
- No Phase 2 branch, Python runtime package, or real baseline engine was created.
- No `main` write, force push, tag push, backup-branch push, reset, or deletion occurred.
- PostgreSQL integration and cross-browser portfolio persistence remain incomplete.
- The synthetic laboratory can be reviewed at [localhost](http://localhost:4174/).
- This report does not establish readiness for actual financial use.

## 2. Canonical Repository and Preserved Copies

**[SPEC]**

| Checkout | Branch / initial HEAD | Finding |
|---|---|---|
| `C:\Users\Saraytell\.codex\visualizations\2026\08\17\01a01094-baba-78a0-aca5-29b34bd4235d\gold-silver-phase1` | `codex/phase-1-data-ui` / `3a82a3409095549e733abc19f21f1a7c4e683515` | Canonical: owner-named running app, actual Phase 1 history, tests, and correct private origin |
| `C:\Users\Saraytell\OneDrive\Desktop\پروژه 1` | `phase-0-foundation` / `57d2730f32dc13c2661d9b68a3a0588596518478` | Preserved clean Phase 0 worktree; shares Git metadata with canonical worktree |
| `C:\Users\Saraytell\OneDrive\Desktop\Gold Silver\Gold Silver` | `phase-0-foundation` / `4522772ea1fd903c37fa8b330dd2f32583ad3015` | Preserved independent older repository; no origin, no Phase 1 app |

**[SPEC]**

- Canonical origin: `https://github.com/tparkhondeh/gold-silver-ai.git`.
- Initial canonical state: 19 modified and 12 untracked files; no staged files.
- `AGENTS.md` is the compact bridge to `CLAUDE.md` in the canonical checkout.
- `.claude/settings.local.json` is absent from the active checkout and history
  reachable from the initial active HEAD. Local backup history is not published.
- `apps/web/.env.local` is Git-ignored and not staged; no credential is reproduced here.
- Existing local recovery branch and both OneDrive copies were retained.

**[?]**

- The owner confirms the GitHub repository is private; this run could not independently
  verify repository visibility, remote branches, remote `main`, or remote CI.
- No upstream or remote-tracking ref was available locally. Remote comparison is
  unknown, not clean or up-to-date by assumption.

## 3. Local Commits and Change Inventory

**[SPEC]**

| Commit | Scope | Files |
|---|---|---:|
| `aedbf86b310a79027da5210ca64416ef5a733495` | Market adapters, units/source precedence, compromised-key gate, setup and contracts | 12 |
| `62f0f06313141a05b6e839e2a5dd1ed9becf729d` | Existing deterministic synthetic simulation/intelligence and tests | 5 |
| `0ba589d1313ec5e16f3616ebbbd7e6bbad553f5b` | Existing UI interactions plus remaining typography fixes and tests | 8 |

**[NOTE]**

The documentation commit containing this report follows these three commits; its
identifier is the final Phase 1 HEAD reported at handoff. No commit is claimed
remotely stored. The stabilization preserves accumulated work rather than claiming
all of that work was newly authored in this audit.

**[SPEC]**

- Data: `apps/web/.env.example`, `app/api/health/route.ts`, `app/api/market/route.ts`,
  `app/currency-display.ts`, `app/navasan-adapter.ts`, `app/quote-priority.ts`,
  `package.json`, `scripts/configure-market-apis.ps1`, and currency/navasan/priority/
  rendered-HTML tests (all app-relative paths are under `apps/web`).
- Sandbox: `app/scenario-engine.ts`, `app/simulation-engine.ts`,
  `app/sandbox-intelligence-engine.ts`, and their simulation/intelligence tests.
- UI: `app/asha-theme.css`, `app/boho-theme.css`, `app/globals.css`,
  `app/operator-csv-import.tsx`, `app/page.tsx`, `app/persian-date-picker.tsx`,
  `app/workspace-navigation.ts`, and `tests/typography.test.mjs`.
- Documentation: root README, CHANGELOG, this audit, DATA_SOURCES, DECISION_ENGINE,
  TESTING_STRATEGY, COMPLETED, CURRENT_STATE, KNOWN_ISSUES, and NEXT_TASK.
- No PostgreSQL schema/persistence implementation was added by this stabilization.

## 4. Verified Fixes and Local Checks

**[BUG] Persian typography**

- Symptom: visible facts and labels could still render below the declared 13px minimum.
- Cause: legacy compact selectors and later button rules overrode the token scale.
- Fix: scoped final typography overrides and regression assertions; read-only computed
  style inspection across all nine workspaces found no visible text below 13px after
  the correction. This is not a comprehensive accessibility or device audit.

**[BUG] Exposed Navasan credential**

- Symptom: an API credential pasted into conversation was still eligible for provider calls.
- Cause: configuration previously checked only key presence and value unit.
- Fix: both health and market configuration fail closed until the operator confirms
  revocation/replacement; hidden-input setup requires an explicit rotation declaration.
- Limitation: this flag does not verify vendor revocation. Only the owner/provider can
  revoke and issue the replacement; no provider-account mutation was performed here.

**[SPEC]**

| Check | Result | Scope / limitation |
|---|---|---|
| TypeScript `tsc --noEmit` | PASS | Installed local dependency tree |
| ESLint | PASS | Source, excluding generated build directories |
| Production `vinext build` | PASS | Local production bundle, not deployment |
| Node test runner | PASS: 50 / 50; zero skipped | Includes deterministic units and mocked API/DB contracts |
| `git diff --check` | PASS | No whitespace-error finding; CRLF normalization warnings only |
| Browser typography | PASS in nine inspected workspaces | Visible DOM/computed styles at inspected layout |
| Browser console | No warnings/errors observed in inspected run | Not a guarantee for every interaction/device |
| Local HTTP root / health | 200 / 200 | Health honestly reports evaluation-only and blocked real services |
| Credential guard contract | PASS | Dummy key, mocked network, no unrotated Navasan call or echoed key |
| Secret-pattern review | No identified secret in reviewed change set | Pattern screening is not a complete secret-detection guarantee |
| Actual PostgreSQL / migration rollback | NOT RUN | No runtime or database URL configured |
| Cross-browser persisted portfolio | NOT PASSED | Browser-session storage only |
| Live-provider tests / backfill | NOT RUN in stabilization | Exposed Navasan key paused; test network mocked |
| Live dependency vulnerability audit | NOT RERUN | Previous findings remain recorded, not newly verified |
| Remote push / CI | BLOCKED / UNVERIFIED | Secure GitHub login required |

**[NOTE]**

Node's test suite includes tests named PostgreSQL transaction/migration tests, but
these use mock connections or inspect SQL. They do not demonstrate an actual
PostgreSQL server, applied migrations, persistence, or rollback against a database.
The bundled Node runtime and installed local binaries were used directly because
npm was not on PATH; the fallback package manager attempted a module reinstall and
was not forced. No dependency tree was replaced.

## 5. Requested 22-Point Handoff

**[SPEC]**

| # | Requested item | Actual state |
|---:|---|---|
| 1 | Canonical repository | Active Phase 1 linked worktree in section 2; private origin configured |
| 2 | Branches / HEADs | Section 2 and local commits in section 3; no Phase 2 created |
| 3 | Commits / pushes | Three code commits plus documentation commit; zero successful pushes |
| 4 | Changed files | Section 3; 35 files including preserved changes and this audit |
| 5 | Data Foundation | Initial contracts, CSV validation/quarantine, repository and SQL exist; requested complete PIT/provenance contract and operational gate incomplete |
| 6 | PostgreSQL | No configured/running local runtime found; migration not applied to a real server |
| 7 | Portfolio persistence | Session-local; no secure shared-user server-side holdings/transactions/valuations |
| 8 | Sources / backfill | Navasan latest adapter paused for key rotation; dailyCurrency/ohlcSearch, durable quota, licensed history and Iranian cross-check pending |
| 9 | Registries | Initial instrument/source registry exists; complete Dataset/Assumption/Feature/Model/Methodology registries and Decision Ledger not implemented |
| 10 | Financial lab architecture | Planned independent locked Python package behind versioned contracts; not installed or connected |
| 11 | ASHA_DETERMINISTIC_BASELINE_V1 | NOT IMPLEMENTED; preceding gates not passed |
| 12 | Class factors | Existing synthetic momentum/volatility/drawdown/stress and supported metal premium fixtures only; real class-specific factors/fit not implemented |
| 13 | Same-class / cross-class / portfolio decisions | Demonstration routes exist in isolated synthetic engine; no real decision engine or order execution |
| 14 | Short / long horizon | Separate synthetic paths/weights exist; real horizon-specific methodology and models pending |
| 15 | Benchmarks | Required no-trade/cash/1N/inverse-volatility/HRP/minimum-CVaR comparison suite pending |
| 16 | Backtest / walk-forward | No historical OOS or nested walk-forward result produced |
| 17 | Stress tests | Deterministic synthetic scenario/risk checks pass; historical crisis validation pending |
| 18 | Tests | 50 local tests, typecheck/lint/build pass; exclusions in section 4 |
| 19 | Remaining risks | GitHub auth, exposed provider key, missing DB/account persistence, incomplete history/provenance, uncalibrated models and prior dev dependency findings |
| 20 | Real-use blockers | Data Foundation, historical data/license/cost/calendar coverage, independent verification, methodology/backtest/shadow/owner acceptance all required |
| 21 | Local review | http://localhost:4174/ — synthetic evaluation; keep real sensitive data out of public review links |
| 22 | Exact next stage | Secure GitHub login → fetch/compare/push current branch/verify → actual PostgreSQL and scoped persistence/PIT/source work → only then independent baseline lab |

## 6. Security, Financial Boundaries, and Next Gate

**[SPEC]**

- No LLM-produced real price, return, financial score, or confidence was introduced.
- Synthetic methodology constants remain explicitly synthetic and cannot be promoted
  into the real baseline as calibrated coefficients.
- No missing real observation is fabricated and no stale quote is relabelled current.
- No third-party runtime/model dependency was installed or copied in this stabilization.
- Review-board guidance kept implementation evidence separate from financial validation;
  typography guidance set the readable type hierarchy; HADS separates verified and
  unverified documentation claims.
- The owner must securely sign in to the GitHub account with repository access; do
  not send a token/password through chat. No alternate credential source is assumed.
- Separately, revoke the exposed Navasan credential and supply its replacement only
  through local hidden-input configuration. No paid subscription was acquired.
- Follow `docs/10-project-state/NEXT_TASK.md`; failed remote or Data Foundation gates
  cannot be waived by treating synthetic UI readiness as financial readiness.

**[NOTE]**

The installed Git Credential Manager help confirms browser login is supported.
Run this in PowerShell and complete the GitHub authorization in the browser; no
password or token belongs in the command or chat:

```powershell
git credential-manager github login --username tparkhondeh --browser
```

## 7. Changelog

**[SPEC]**

- 1.0.0 — Recorded local stabilization, actual tests, thematic code commits, preserved
  checkouts, credential/typography fixes, and unresolved sequential gates.
