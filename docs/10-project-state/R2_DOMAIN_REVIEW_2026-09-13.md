# Shared analysis / domain review — 2026-09-13

## Scope and actual versions

Owner authorized bounded R2, independent-browser/domain verification, relevant
repairs and private deployment, but not secret/real-data transfer, purchase, new
financial methodology or main changes. Initial checkout: `a27fc7a`, clean, branch
`codex/phase-2-decision-engine`. Fresh GitHub `ls-remote` on this date returned
`dc83079e08680262f8228c2f1972baaf738d96bf` for that branch and
`5c03fabb1c8090497c0b03c9059a6e51fdb91d03` for main. Thus the preceding market-test
commit had **not** reached GitHub; local origin was not used as proof.

## Domain — blocked, not deployed

At 09:01 UTC, certificate-verified public HTTPS returned **503**. SSH at 09:01:51
UTC confirmed the domain directory is writable; `.htaccess` still proxies to
`127.0.0.1:3012`, with no listener there. The accessible account's apps directory
has no Gold/Silver release. Node 22.23.2 and a running user systemd manager exist;
boot persistence and a working Gold/Silver service are **not** established.
No deployed Git SHA can be attested. No server file, proxy, service or other site
was modified. This is not the historical write-permission blocker.

Owner identity/provider selection is unresolved under ADR 0008 and
`IDENTITY_RECOMMENDATION.md`. No login/logout route, private hosted storage or
cross-device owner session exists in the current product. Publishing it without
an identity gate would not satisfy this request. A shared password, bypass of
loopback controls or a public synthetic release was not substituted.

The local port also had no listener initially. The existing launcher starts the
project PostgreSQL and web process successfully. HTTP root 200 and all 15 readiness
checks pass after cold compilation. A first cold-start readiness request timed out;
the warmed check passed without relaxed limits. Runtime remains a foreground local
process, not a permanent hosted service.

Only the in-app browser was exposed by the browser tool. Selecting Chrome returned
unavailable. Chrome/Edge/Firefox/mobile, external-device login and reboot recovery
are **not browser-tested**. Public HTTPS was independently checked by the OS HTTP
client and server state by SSH, neither of which is a browser acceptance test.

## R2 implementation and requirement mapping

`apps/web/app/shared-analysis.ts` adds `asha.synthetic.shared_analysis.v1`, bound to
the exact validated shared input, revision, fixture, method and history identity.
`analyzeActionHorizon` is extracted from the existing action planner and reused by
both planner and diagnostics; formulas, weights and targets are unchanged.
The v1 saved-portfolio format is preserved and replays the new report exactly.

| Requirement | Actual implementation / boundary |
|---|---|
| Shared selection, quantity, cash and prices | Eight views now include market and data quality; the reference review/comparison stays separate |
| Quality, units, dates | Strict existing contract; missing bid/ask, future/expired quotes shown by asset; current spread/ratio blocked appropriately |
| Valuation / concentration | Same BigInt portfolio values; exact cross-product concentration check avoids losing an over-limit amount through display rounding |
| Gold/silver relation | Ratio of equal pure-metal grams, `(gold price / purity)/(silver price / purity)`; exact fraction plus floored display; requires valid same-date quotes; not a conversion signal |
| Trend / volatility / drawdown | Existing 90-observation synthetic history, 20/60-observation features, now visible for shared selected asset and both horizons |
| Crisis / liquidity / conversion factor | Existing fixture scenarios and factors, clearly separated from user-input order capacity and actual plan costs; not an empirical market assessment |
| Eight factors | Raw input, points, weight, contribution and invalidation exposed; fixed-target scenarios explicitly do not derive their targets from these factors |
| Allocation / actions / alternatives | Existing single-budget physical solver retained, not the sandbox's independent amount suggestions; same-class and cross-class funding, exact fees/cash and seven-method comparison preserved |
| Horizon changes | Calendar days and feature-observation windows distinguished; changing days does not refit the method or manufacture history |
| Intrinsic value / bubble | Missing intrinsic inputs; no invented coin mass, currency factor or intrinsic price |
| Market regime | No approved classifier in this shared contract; explicit missing state, no ratio-based trading signal |
| Save / replay | Same-browser only; no login, hosted sync or movement of personal data |

UI keeps essential source/gap notices visible. Detailed calculations and scenarios
are expandable; duplicate factor blocks in the same analysis view were removed.
R2 is **partial**, not all specialized requirements complete or financially validated.

## Tests and browser acceptance

- 186 web tests pass; 95.00% lines, 85.37% branches, 96.12% functions.
  The new numeric report has 100% line/branch/function coverage.
- 16 real PostgreSQL isolation/migration/persistence/restore tests pass.
- Typecheck, production build and full lint pass; final-source gates must precede
  delivery. Production npm audit reports zero known vulnerabilities at this check;
  this does not claim absence of all security risk.
- Existing eight action scenarios, exact cash conservation, shared save/replay and
  seven-method numerical comparison are covered by the unchanged regression suite.
- Python source/dependencies are unchanged; do not restate the older 257-test run
  as a new local run. The separate GitHub laboratory job must pass for this commit.

| Journey | Evidence |
|---|---|
| Eight shared views | Browser: 71 g test gold, 300,000 toman test cash; each view showed total 1,310,000 and revision 9 |
| Selection / numerical reasons | Browser: selected gold, opened 20-observation trend and eight-factor/scenario detail |
| Horizons | Browser: 14/90 days propagated to both analysis cards, one final budget retained |
| Price / constraints | Browser: gold reference 20,000, bid 19,900, ask 20,100; ratio changed 13.32 → 26.64, total 2,020,000; 50% cap raised exact concentration notice |
| Save / invalid edit / restore / reload | Browser: saved shared input, rejected fractional 1.5 coin and failed save, recovered valid input; reload recovered same 1,310,000 total |
| Missing price | Browser keyboard cleared bid; quality marked missing, spread and ratio unavailable, orders blocked |
| Stale price | Browser keyboard changed as-of to 2000-02-01; all three prices expired, costs zero and cash unchanged; saved valid input restored |
| Invalid unit / future / mismatched dates / unknown asset | Controlled automated tests; no current ratio or whole-portfolio order falsely issued |
| Denied/full storage and transport errors | Existing controlled adapter/route regression tests, not injected real market data |
| Real-price valuation | Blocked: no valid new snapshot obtained |
| Domain login / cross-device save | Blocked by absent hosted identity/runtime, not claimed passed |

## One authorized Navasan attempt

Fresh local ledger: 7 used / 108 remaining; eligible. Verified database backup was
completed before requesting. One UI request reserved at `2026-09-13T09:10:41.921Z`
timed out in 8,016 ms; no quote returned and no automatic retry. Ledger now 8 used /
107 remaining. Earliest next request `2026-09-13T15:50:41.921Z` (19:20:41 Tehran),
subject to a fresh quota check; no reservation refunded or scheduled task created.

No-key HEAD to provider root returned 200 using OS HTTPS but timed out inside the
same isolated Worker runtime. This narrows the failure to the runtime/network path;
it is not proof that the API key is invalid or that a paid plan is required.
No market history, Rahavard data, local API key or personal holdings were transferred
to GitHub/server. Prior Rahavard transfer-permission boundary remains.

## Backup / self-review / delivery boundary

Complete verified Git bundle: `.cache/checkpoints/r2-20260913/repository.bundle`.
Database: `asha-local-20260913T090910Z-c3f8f0ec.dump`, 25 tables fully restored and
verified; SHA-256 `6f95d0b059ff6a143153f2dea2c65cbb5fb70b57fffb167470c0069e6903f7ca`.
Backups/logs remain local and ignored. No secrets, database files or market payloads
belong in this commit. No main change, new dependency or financial formula change.

Self-review: completed bounded diagnostics are tested and isolated; hosted access,
real-price acceptance and the remaining intrinsic/regime inputs are unresolved.
Owner acceptance is pending. GitHub publication and each of its three jobs must be
verified against the final SHA; an older green run is not this delivery's evidence.
Final publication identifiers are recorded in the delivery message/local checkpoint.

Next: resolve production identity choice before private deployment; keep the local
Worker transport investigation separate from paid-source acquisition. Do not repeat
the completed R1/R2 adapter work or manufacture missing inputs to close R2.
