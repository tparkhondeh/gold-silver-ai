# Shared synthetic portfolio v1

Status: implemented for owner-local evaluation on the working branch. This is R1,
not completion of the financial product. The owner explicitly authorized this
bounded integration after the 2026-09-09 read-only audit. No methodology, provider,
production identity or deployment decision is added.

## One source of input

`apps/web/app/shared-portfolio.ts` defines `asha.synthetic.shared_portfolio.v1`:
portfolio identity, revision, `TOMAN`, quantity scale 1000, selected asset, the existing
`asha.synthetic.action_input.v1` input and an explicit unsupported-holdings list.
The input snapshot is retained in each computed plan. No quote, value, quantity,
constraint or target is copied into an independently editable view model.

`SharedPortfolioWorkspace` stays mounted in the existing page shell across navigation.
Overview, holdings, asset center, analysis, decision and risk views share this state.
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

The seven-method/two-fold sizing comparison and market/data-quality reference
screens remain labelled independent fixtures. Their existing data/method is not
silently replaced with the owner's shared input and their results are not its budget.

## Storage and boundary

`asha.synthetic.shared_document.v1` contains the full shared portfolio and computed
result. Browser storage key: `asha-shared-synthetic-portfolio-v1`; an explicit save
also retains the previous document at the `-previous` key. Refresh/restore uses only
this namespace. It validates keys/types/units/identity and size (1,000,000 characters),
requires canonical JSON (including duplicate-key rejection), recomputes the result
and rejects any mismatch. Invalid recovery preserves both current state and stored
bytes. An unreadable initial save is explicitly distinguished from a new reference.

This is local synthetic storage, not authentication, encryption, signed evidence,
cross-device synchronization or an append-only audit log. A user with local storage
access could consistently rewrite input and result; replay checks detect mismatch,
not prove authorship. Save is explicit; unsaved edits can be lost on reload. Production
identity, durable hosted storage/concurrency and backups remain R3. No new endpoint,
network permission, package or database schema is introduced.

Acceptance evidence: [R1 delivery audit](../10-project-state/SHARED_PORTFOLIO_DELIVERY_AUDIT.md).
Owner route: [short Persian guide](../09-operations/OWNER_DECISION_TEST_FA.md).
