# R1 — Shared portfolio delivery audit

Date: 2026-09-09, Asia/Tehran. Scope: owner-local synthetic integration only.
Branch: `codex/phase-2-decision-engine`; starting HEAD `122586d37739bc68112b17d20e5f82120911552d`.
Owner acceptance of this delivery remains pending; main, server and live data remain untouched.

## Before and after

The [earlier same-day audit](PROJECT_COORDINATES_2026-09-09_FA.md) is preserved as
historical evidence. Its documentation-only restriction was superseded by the
owner's explicit R1 implementation request, not by inference. Seven prior audit
documents were reviewed and retained. Before any edit they were copied with SHA256
verification under `.cache/checkpoints/shared-portfolio-20260909T184654Z/`; the
`repository.bundle` there passed `git bundle verify` and preserves prior refs/history.

The main demo used fixed ten-position value totals while the physical decision desk
owned a separate three-instrument input. Six portfolio views now use the same
versioned synthetic input; the previous personal/session state is preserved, not
silently migrated using guessed prices. The instrument support boundary is explicit
in the [contract](../04-portfolio/SHARED_SYNTHETIC_PORTFOLIO.md).

## Acceptance matrix and self-review

| Gate | Evidence / outcome |
|---|---|
| Shared input | One mounted controller; quantity, cash, quote, constraints and selection feed overview, holdings, center, analysis, decisions and risk |
| Exact arithmetic | New integration tests plus existing solver tests check values/weight denominators, quantity lots, fees, cash before/after, one funding budget and no opposite orders for an asset |
| Recovery | Canonical input+result document, exact replay, selection and horizons retained, corruption/duplicate keys rejected, old namespaces preserved |
| Failure handling | Missing/expired/future quotes, invalid unit/purity/currency/lot, unsupported assets, unknown identifiers and invalid numeric edits fail closed; no subset/fallback plan |
| Regression | Eight added web tests; existing eight scenarios and seven-method/two-fold comparison retained. Python methods and DB code unchanged |
| Local service | Existing launcher retained; HTTP root 200; all 15 readiness checks pass, provider/history network disabled |
| Automated quality | Typecheck, ESLint and Vinext build pass. Web suite 169 tests; line/branch/function coverage 94.72% / 83.32% / 96.21%. Shared contract line/function coverage 100%, branch 98.77% |
| Security review | No new deps/endpoints/server changes; strict bounded synthetic contract; no HTML injection, real-data ingestion or secret transfer. Browser recovery is not an authenticity/security claim |
| Architecture | Reuses action solver and eight-factor method; one canonical portfolio input plus separate unsupported catalog; same existing application shell/theme |
| Documentation | Prior audit preserved; current/next/roadmap, contract, owner guide and limitations updated; this table records self-review |
| Owner approval | Pending hands-on acceptance; no main merge or stable/financial release claimed |

Live npm audit initially failed with registry `ECONNRESET`; it is not recorded as a
clean audit. The quality CI job includes the production dependency audit and must
pass for the exact published commit. Final three-job status and immutable run URL
are verified at delivery, not inferred from cached `origin` or this document.
The production dependency manifest/lockfile are unchanged. The previously recorded
moderate development-only esbuild/drizzle limitation remains in `KNOWN_ISSUES.md`.

## Browser evidence

The existing local tab was tested through real UI actions, not direct state injection:

- Editing gold 60→70 grams and cash 100,000→250,000 produced total 1,250,000 toman;
  with minimum cash 20%, the center and both analyses used the same 56% gold weight.
  Final cost 5,691 and cash after 258,309 matched across views.
- Selecting silver in analysis carried the same selection into the decision screen.
  Short/medium targets were separately visible; only one final desk was rendered.
- Save → switch scenario → restore recovered exact input, selection and amounts.
  Full page reload also restored total 1,250,000, selected silver, cost 5,691 and
  cash after 258,309; verified in the accessibility tree and narrow-viewport screenshot.
- 1.5 coins (lot 1 coin) showed invalid quantity; an empty sell quote showed
  undecidable. Moving the artificial review date beyond quote validity produced
  zero cost/no budget use. Correcting inputs restored the calculation.
- Adding unsupported stock without a price made total unknown and removed all
  decision cards; it did not optimize only the metals. Restoring the saved snapshot
  returned the original portfolio.
- Exit still sells 60g for net 594,608; peer/cross conversions, hold, conditional wait
  and missing-data states remain visible; both comparison tables contain seven methods.

Browser automation's empty/date `fill` did not always dispatch native change events;
keyboard deletion/date-arrow changes were used and visible final states verified.
The early tab had stale scripts from before local startup; a fresh load restored
interaction. Neither observation was disguised as a passing application test.

## Remaining work

This closes the bounded synthetic shared-input implementation, not the whole product.
R2 must map specialized valuation/bubble/data-quality/analysis requirements to this
common input without changing the method or inventing missing data. Unsupported
instrument families, production shared storage/authentication, licensed real-data
validation, private deployment and final owner acceptance remain on the roadmap.
No API purchase, provider contact, SSH/server change or deployment occurred here.
