# Specialist review and recovery correctness — September 16, 2026

## Baseline, authority and team

Started clean at `123b46fa950fa73c874c10e86659102f898af6ec` on
`codex/phase-2-decision-engine`. Fresh remote reads matched that branch and main
`5c03fabb1c8090497c0b03c9059a6e51fdb91d03`. Prior CI run `35071628489` passed,
but does not attest the new changes. Verified complete Git backup:
`.cache/checkpoints/team-review-20260916T120100/before.bundle`.

Owner explicitly authorized real delegation, a broad evidence-based review and
the next necessary independent unit. Three subagents ran alongside the coordinator:

| Actual agent | Coverage and work |
|---|---|
| `finance_data_review` | Shared/action mathematics, data/provenance boundaries, Python comparison; reproduces and corrects the no-trade comparator |
| `security_storage_review` | Local persistence/API, browser snapshot guards, concurrent database reads; implements bounded recovery fixes |
| `architecture_qa_review` | Registered needs, integration, tests/CI limits; independently reviews financial, storage and coordinator changes |
| Coordinator | Scope, backup, Persian browser journey, presentation fixes, durable team policy, integration and delivery checks |

All subagents inherit the current session's model/settings; no external agent was
installed and no global ranking is claimed. Edit ownership was separated; only
the coordinator publishes. The durable workflow is
[SPECIALIST_TEAM.md](../00-governance/SPECIALIST_TEAM.md), linked by `CLAUDE.md`.
This preserves instructions for sessions that read the guide, not live workers or
unconditional cross-chat memory.

## Findings and selected unit

The selected unit is **consistent saved-portfolio recovery and correction of the
existing no-trade comparison**, with small directly evidenced presentation gaps.
Acceptance requires fresh validated restore without losing edits on failure,
coherent database snapshots, existing no-trade semantics, unchanged other controls
and physical sizing, safe request failures and regression evidence.

| Finding | Evidence at baseline | Resolution / acceptance |
|---|---|---|
| P2: no-trade reference incorrectly rebalances | `method_comparison.py` applies the same period-weighted evaluator to all methods; `controls.py` defines no-trade as fixed holdings | Reproduce 50% asset/50% cash with asset 100→200→100: fixed holdings return 0%, not 12.5%; validate drawdown and delayed availability |
| P2: stale personal Restore never fetches latest version | `page.tsx` reapplies initial snapshot; synthetic Save→Restore→Save issues only two PUTs and repeats conflict | Fresh validated GET and safe async state; conflicting/failed restore must preserve input |
| P2: empty saved personal portfolio cannot restore | Restore button tests holding count instead of saved version | Existing empty version and its preferences must be restorable |
| P2: mixed database snapshot possible | Separate version/holdings/preferences reads under read-committed transaction | Lock parent during snapshot read; isolated two-connection test must prove coherent read and writer release |
| P3: JSON null escapes API validation | Same-origin PUT `null` throws before controlled response | Nonobject/unreadable payloads must fail closed without repository writes |
| P2: personal numeric input can silently round in SQL | Cost `1.005`, amount `1.1234567890123`, percentage `12.345` and fractional/exponent horizons pass legacy API validation despite fixed database scales/types | Reject incompatible representations before writes; never round or rewrite the owner's draft |
| P2: shared holdings not sortable | `USER_REQUIREMENTS.md` requests sorting; shared table has static headers | Presentation-only name/value/weight sort; exact amounts, unknown-last, fixed cash footer, unchanged canonical input and selection |
| P2: freshness navigation gap | Navasan view clock only updated by a 60-second interval, unlike file workspace | Refresh local evaluation time on view/source/activation; no new quote request or storage read |
| P2: hydrated UI automation absent from CI | Unit coverage targets imported `.ts`; `.tsx` interaction wiring is partly source assertions | Remains open; do not present coverage as browser interaction coverage. Actual manual browser checks and behavior tests are recorded separately |

The review is broad but bounded, not proof that every line/path is defect-free.
Data/method/identity gates remain dependencies, not permission to bypass them.

## Verification and delivery

Local acceptance passed on September 16 after the final numeric-precision change:

| Check | Result / boundary |
|---|---|
| Web regression and coverage | 246 passed, 0 failed; 95.33% lines, 87.46% branches, 96.51% functions in the configured coverage scope |
| Real PostgreSQL integration | 18 passed, 0 failed in disposable `asha_integration` schemas, including concurrent snapshot reads, precision rejection/round-trip and independent backup/restore |
| Typecheck, lint and production build | Passed; build retains its known static route-classification advisory, not a failed gate |
| Dependency audit | 0 known production dependency vulnerabilities reported; no dependencies changed afterwards |
| Local readiness | 15 checks passed; no external API requested and financial execution remains locked |
| Financial/data review | 58 targeted web tests and 9 Python comparator tests; 500 deterministic synthetic action probes checked conservation/cash/bounds; six other method objects and fourteen physical comparison rows unchanged |
| Independent review | Architecture/QA agent reviewed the comparator, recovery, request ownership, sorting/freshness and precision deltas; final separate 24 numeric boundary assertions passed with no blocking finding |

The web total includes the focused web cases; do not add them to manufacture a
larger total. Final gate logs are retained locally under
`.cache/checkpoints/team-review-20260916T120100/` (`*-final.log`, `audit.log`).
The complete Python suite and all three remote jobs must additionally pass for
the exact pushed SHA. GitHub run/job results and the final SHA are verified at
delivery and recorded in this checkpoint's ignored `delivery.json`; an earlier
run is not evidence for this unit and a commit cannot contain its own SHA.

Actual browser checks used a separate local synthetic workspace without writing
to the owner's personal database or replacing existing browser snapshots:

- All eight shared views agreed on 1,000,000 toman total, 3,920 cost and 179,080
  final cash. Empty cash input stopped valuation/decision; explicit restore
  recovered the same saved input and result.
- Name/value/weight sorting worked in both directions, kept cash last and
  preserved totals/selection. Selecting silver from a sorted row opened its
  matching asset view. An unsupported asset remained unknown-last and blocked
  the incomplete decision instead of becoming zero-valued; restore removed the
  unsaved test draft.
- Both seven-method reference tables remained available with seven rows each,
  clearly separate from the owner's portfolio and without claiming a winner.
- Final reload of the updated UI restored the same synthetic portfolio and
  visible sorting controls; captured warning/error logs were empty.

Personal-database conflict/empty restore, timeout, abort, initial-load ownership
and rejected precision were exercised through the actual page-handler test harness
and isolated SQL integration, **not a hydrated personal-browser session**. The
owner's stored data was not used as a test fixture. External browsers/mobile and
an actual market-price freshness boundary were not exercised in this unit.
Hydrated browser CI remains a separate open gap despite the passing handler tests.

No main/server change, provider query, real market file, mailbox polling, new
dependency or operational financial permission is part of this unit.

Recovery uses a reviewed forward revert from the verified Git bundle. No history
rewrite or owner-data reset is required. Source identity changes caused by a bug
correction must be recorded; old incorrect reports must not silently replay as valid.

### Numerical provenance correction

The no-trade defect belongs to the index-level Python report, not the physical-lot
web comparison. Corrected reference-fold returns are `2.554857193934%` and
`2.705915380296%`, replacing `2.665356464165%` and `2.811121702621%`.
Actual old/new report comparison leaves the other six complete method objects
identical. The web bridge was regenerated canonically: only `methodComparisonId`
and `bridgeId` changed, with all fourteen physical orders/paths/metrics identical.

- Old report: `ASHA_METHOD_COMPARISON_fe17496603dcb11e79dfe09275cf3c076e12a8e0faae3b8299a891656e09f985`
- Corrected report: `ASHA_METHOD_COMPARISON_2abb068d508e27b4276669f9f046581e5b29954aeae5e6ed0f56a982633c891c`
- Old bridge: `ASHA_PHYSICAL_SIZING_BRIDGE_18683b5526a03a9419ba597007f2514e6e148e31ade68e0ab0ebedad72ab2d3e`
- Corrected bridge: `ASHA_PHYSICAL_SIZING_BRIDGE_a4ca9e031e0c36c3dba64be366aa7d7c028eebe0991207e14e0234ad49798eba`

Schemas, method parameters and operational locks are unchanged; exact replay rejects
old incorrect metrics rather than silently accepting them under the corrected code.

## Remaining route

Next independent engineering work: add a bounded hydrated browser regression lane
for save/recovery and draft/navigation, using isolated synthetic fixtures and the
existing three-job quality structure where practical. Tool/dependency choice must
follow existing governance; no owner database or stored browser content is a test
fixture. Do not replace this with more source-regex claims.

External gates are unchanged: reviewed Rahavard permission and minimal real file
profile, permitted actual market evidence and Iran calibration, registered
historical/regime method decisions, private hosted identity/storage, later deployment
acceptance and owner approval. This is not R3 hosted completion, a new financial
method, whole-project completion or approval to merge main.
