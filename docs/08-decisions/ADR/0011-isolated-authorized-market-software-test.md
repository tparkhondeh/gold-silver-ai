# 0011. Isolated authorized market-data software test

Status: Accepted (explicit owner instruction, 2026-09-10)
Date: 2026-09-10

## Context

The owner authorized authorized real market observations for local software testing,
not financial-method approval, personal portfolio extraction, purchases or execution.
ADRs 0009/0010 retain the synthetic-only financial laboratory and its locked methods.

## Problem

Real observations must never enter the synthetic input under a false label, while
the existing laboratory and owner data must remain intact.

## Options Considered

1. Relabel real prices as synthetic: rejected; false provenance and mixed factors.
2. Enable the generic market route: rejected; it enables out-of-scope providers.
3. Separate versioned technical valuation workspace and explicit local Navasan
   latest-only request: selected within the owner's authorized scope.

## Decision

Add `asha.market_technical_test.v1` and `asha.navasan.latest_snapshot.v1`, isolated
from the synthetic and personal contracts. Positions/cash are explicitly fictitious;
quotes are real only when obtained through the validated source path. Preserve raw
numeric quote, declared currency, provider multiplier, unit, symbol and timestamps.
Unknown purity remains null; the symbol 18ayar explicitly denotes 750-per-mille gold.

Only owner-local same-origin POST can use the configured rotated Navasan key and
the existing durable free-plan quota. No history, polling, other source calls,
redirect following, deployment or financial engine activation. The browser stores
only the latest current test document in a separate namespace, never a price series.

Rahavard's current terms, article 2.1, require explicit provider permission for
copying/transferring information. The earlier manual-capture ADR 0004 is historical,
not authority to ignore current terms. No new Rahavard capture is permitted until
that provider permission is evidenced. Existing records are not deleted or rewritten.

## Rationale

Implements the owner's expressly requested separation, provenance, quota and
no-financial-use boundary while reusing the existing normalization and quota logic.
Deterministic technical valuation does not constitute a financial recommendation.

## Trade-offs

No real-market action amounts are produced without the required evidence. Price
edits belong to the separate artificial laboratory, not the real observation.
Latest-only browser persistence is device-local, not authenticated server storage
or cryptographic attestation of source authenticity. No cross-device durability claim.

## Consequences

The technical workspace can be tested independently of provider availability.
Blocked real-data paths remain blocked in the acceptance matrix; synthetic transport
tests cannot substitute for successful real acquisition. See
[delivery evidence](../../10-project-state/MARKET_TECHNICAL_TEST_2026-09-10.md).

Sources reviewed 2026-09-10:
[Navasan free API](https://www.navasan.tech/api/),
[official latest endpoint guide](https://www.navasan.tech/api/webserviceguide/),
[Rahavard terms](https://rahavard365.com/terms-and-conditions) (read in signed-in UI;
no account information or portfolio collected).
