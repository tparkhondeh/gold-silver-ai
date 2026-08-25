# 0005. Notification and Opportunity-Alert Safety Boundary

Status: Accepted
Date: 2026-08-25

## Context

The owner requested in-product notifications for severe market volatility and highly
attractive opportunities. The product currently has a read-only quote boundary but no
approved opportunity methodology, historical point-in-time store, or validated model.

## Problem

The application must surface important changes without fabricating a price movement,
turning a simple decline into investment advice, or presenting an untested score as an
attractive opportunity.

## Options Considered

1. Emit alerts from any large single price change and label declines as opportunities.
2. Implement deterministic volatility/data alerts now, demo opportunity notifications
   for UI testing, and keep real opportunity claims fail-closed.
3. Keep the entire notification interface unavailable until all models exist.

## Decision

Choose option 2:

- A real volatility alert requires two valid observations for the same instrument,
  currency, and unit. The second observation must be newer and no more than 24 hours
  after the first.
- Instrument-specific absolute percentage thresholds are deterministic and versioned in
  application code. The alert reports direction, percentage, time window, old value, and
  new value; it does not recommend an action.
- Stale observations never create volatility or opportunity alerts. A separate data-
  quality notification explains that stale values are excluded.
- Quote baselines and notifications are session-local; no background polling, browser
  push, email, SMS, or external delivery is implied.
- Synthetic volatility and opportunity notifications are allowed only in demo mode and
  must carry an explicit demo label.
- A decline, discount, percentile, or model output cannot become a real opportunity
  notification until the owner accepts a methodology that has point-in-time data,
  backtesting, walk-forward validation, uncertainty language, and false-positive limits.

## Rationale

This makes the requested notification experience testable now while preserving the
project's deterministic-finance and no-fabrication boundary.

## Trade-offs

The app detects changes only when the user loads or refreshes prices. It cannot guarantee
immediate delivery while closed, and it intentionally emits no real opportunity alerts
in the current phase.

## Consequences

Background monitoring and external push channels require a separate operational design.
Enabling real opportunity notifications requires a later ADR that defines and approves
the financial methodology and supersedes only that part of this boundary.
