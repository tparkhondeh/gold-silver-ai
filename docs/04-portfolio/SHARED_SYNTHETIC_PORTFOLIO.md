# Shared synthetic portfolio v2

Status: implemented for owner-local evaluation on the working branch. This is R1,
not completion of the financial product. The owner explicitly authorized this
bounded integration after the 2026-09-09 read-only audit. No methodology, provider,
production identity or deployment decision is added.

## One source of input

`apps/web/app/shared-portfolio.ts` defines `asha.synthetic.shared_portfolio.v2`:
portfolio identity, revision, `TOMAN`, quantity scale 1000, selected asset, the existing
`asha.synthetic.action_input.v1` input, an explicit unsupported-holdings list and
`asha.synthetic.metal_references.v1` diagnostic input. Missing references are null,
not a loaded example. The action input/method itself is unchanged.
The input snapshot is retained in each computed plan. No quote, value, quantity,
constraint or target is copied into an independently editable view model.

`SharedPortfolioWorkspace` stays mounted in the existing page shell across navigation.
Overview, holdings, asset center, analysis, decision, risk, market and quality views share this state.
Personal mode remains separate. Old session drafts, the previous independent desk
snapshot, protected environment and database are not imported, migrated or rewritten.
The reference starts with the desk's existing three instruments and cash, not the
legacy ten-position dashboard with unrelated fixed value totals. Unsupported classes
remain explicit; their absence from the sizing adapter is not presented as support.

| Identity | Class | Unit | Purity per mille | Quantity lot |
|---|---|---|---|---|
| SYNTH_GOLD | gold | gram | 750 | 100 milli = 0.1 gram |
| SYNTH_COIN | gold | piece | 900 | 1000 milli = 1 piece |
| SYNTH_SILVER | silver | gram | 999 | 1000 milli = 1 gram |
| SYNTH_CASH | cash | toman | not applicable | integer toman |

Price is per gram/piece **of the named instrument**, not per pure-metal gram.
Purity is validated instrument metadata; multiplying the quoted instrument price
by purity again would be incorrect. Fixed identity/class/unit/purity/lot mappings
cannot silently change. All three instruments stay in the universe; a zero holding
permits testing entry without inventing a previous-quantity percentage.

## Arithmetic and decisions

- Position value = floor(quantityMilli × referencePriceToman / 1000), with BigInt.
- Total before = cash + all position values. If any value is unknown, total and
  weights are unknown, rather than computed over a silently reduced portfolio.
- Display weight bps = floor(value × 10000 / total before), including cash.
  Display rounding can leave a small residual; it does not allocate extra capital.
- Core decisions call the unchanged `buildActionPlan` and existing eight-factor
  engine. Short/medium target views do not spend money. Only the final combined
  target passes through the single funded, physical-lot plan. Horizon-only previews
  are alternatives with the whole budget, not additive orders.
- The existing plan supplies quantities, price limits, conditional quantities,
  costs, sale proceeds/funding, cash/positions before and after and numeric reasons.
  Entry/exit, same/cross-class conversions, hold, wait and undecidable remain distinct.
  Price tolerance limits are not renamed forecasts or optimal market turning points.
- Shared price editors never regenerate bid/ask when the reference changes. Null
  bid/ask and expired/future quotes issue no orders. Invalid inputs clear computed
  views, not preserve a stale valid result. Precision beyond the quantity contract
  is rejected, not rounded into an eligible trade lot.

Stock, FX, deposit, fund, crypto, property and business test rows have explicit
catalog identities. An unpriced row makes total unknown; an explicitly priced row
contributes its exact reference value. In **both** cases the whole plan is blocked,
including when the unsupported row's quantity is zero. There is no subset plan
mislabelled as a whole-portfolio result. This adapter does not claim financial
support or validate instrument-specific market rules for these classes.

The seven-method/two-fold sizing comparison remains a labelled independent fixture.
Its existing data/method is not
silently replaced with the owner's shared input and their results are not its budget.

## Storage and boundary

`asha.synthetic.shared_document.v2` contains the full shared portfolio, computed
result and replayed raw-metal diagnostic. Browser storage key remains
`asha-shared-synthetic-portfolio-v1`; an explicit save
also retains the previous document at the `-previous` key. Refresh/restore uses only
this namespace. It validates keys/types/units/identity and size (1,000,000 characters),
requires canonical JSON (including duplicate-key rejection), recomputes the result
and rejects any mismatch. Invalid recovery preserves both current state and stored
bytes. An unreadable initial save is explicitly distinguished from a new reference.

### Browser save protection (2026-09-16)

The shared, market-test and synthetic-file workspaces now compare the exact bytes
last successfully read/saved with the current storage slot before writing. Unknown
initial storage, corruption and intervening writes/removals fail closed; recovering
updates the baseline only after validation. A conflict keeps the draft in memory
and explicitly warns that Restore replaces unsaved edits, never silently merges.
Shared unchanged saves are no-ops and do not rotate the `-previous` slot. Failure
to write that backup aborts the primary write; failure of the primary write leaves
the prior current bytes intact (the backup can already contain the same bytes).
Market/file storage still retains one snapshot only, not new market history.

All three writers cooperate through the same origin/key-scoped exclusive
[Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request)
(reviewed September 16). A busy/unavailable lock rejects the write, with no unsafe
fallback; read-only recovery and calculations remain usable. There is no new
dependency, storage namespace or document version. UI edits are disabled during
the short save operation. This is not protection against old application tabs,
extensions or other code that ignores locks; reload old tabs before testing.
It is not hosted synchronization, an atomic multi-key transaction, immutable audit
history, or backup against browser/profile deletion. Test evidence and unresolved
dependencies: [September 16 audit](../10-project-state/BROWSER_STORAGE_REVIEW_2026-09-16.md).

## V2 impact, compatibility and rollback (2026-09-13)

The only changed consumers are the shared workspace/diagnostic panel and its local
document codec; there is no server, API, database or financial method migration.
Newly written V2 documents are not readable by old V1 code. The reader retains V1:
first validate exact old keys/version and replay the old result, then migrate in
memory with empty reference slots. No old data is guessed, deleted or written on
load. The first explicit V2 save keeps the original bytes in the previous slot.
To roll back, restore that V1 slot alongside the previous code, retaining the V2
document separately. Later saves retain one previous version, not unlimited history.
Tests cover canonical legacy migration, forged versions/results, V2 reference
tampering, exact replay, existing method outputs and failed-save preservation.
This is a bounded Tier B engineering extension of the already implemented raw
metal diagnostic, not selection of a new financial method or provider.

## Raw metal diagnostic contract

`shared-metal-reference.ts` reuses the Phase 1 formula defined in
`../03-market/BUBBLE_MODEL.md` and the existing troy-ounce constant. It belongs to
shared metals infrastructure; only shared diagnostics depend on it, never sizing.

- Exactly three source-tagged synthetic slots: USD_TOMAN in integer toman/USD,
  XAU_USD and XAG_USD in integer US cents/troy ounce. The UI shows dollar inputs to
  two decimals. Values are null or positive safe integers at most 1,000,000,000 in
  the declared storage unit; mismatched currency/unit/source/precision is rejected.
- Dated quotes must be valid at the portfolio's asOf and on the same publication
  date as that metal's domestic reference. This date-level fixture contract is not
  a real-market timestamp synchronization policy. Missing/expired/future/misaligned
  quotes suppress the dependent result. Gold-only gaps do not suppress silver.
- Raw value per gram = ounceUSD / 31.1034768 × tomanPerUSD × purityPermille / 1000.
  Exact integer form: numerator = ounceCents × FX × purityPermille × 100;
  denominator = 311034768. Difference = domesticReference − rawValue;
  premiumPercent = difference / rawValue × 100. BigInt fractions preserve every
  digit. Four-decimal display truncates toward zero, including negative values.
- Applicable to gram gold/silver, not coins without approved fine-weight specs.
  Domestic reference price is not a bid/ask execution quote. Manufacturing,
  tax, fees and transport are not included in raw metal value; the result is
  neither historical bubble rank, full fair value, entry/exit signal nor forecast.
- `asha.synthetic.raw_metal_premium.v1` retains source, date, purity, exact fractions,
  formula and missing reasons. `affectsDecision=false`; changing references must
  leave the existing eight-factor targets, plan, costs and cash byte-equivalent.
  Historical calibration/regime and cost-factor mapping remain separate gaps.

This is local synthetic storage, not authentication, encryption, signed evidence,
cross-device synchronization or an append-only audit log. A user with local storage
access could consistently rewrite input and result; replay checks detect mismatch,
not prove authorship. Save is explicit; unsaved edits can be lost on reload. Production
identity, durable hosted storage/concurrency and backups remain R3. No new endpoint,
network permission, package or database schema is introduced.

Acceptance evidence: [R1 delivery audit](../10-project-state/SHARED_PORTFOLIO_DELIVERY_AUDIT.md).
Owner route: [short Persian guide](../09-operations/OWNER_DECISION_TEST_FA.md).
