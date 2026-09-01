# Monitoring

**Source of truth for:** how the system's health and correctness are observed
once running.

## Requirement (once implemented)

At minimum, the system should eventually make observable:

- Data pipeline health (is data arriving, is it passing validation) — see
  `docs/05-data/DATA_QUALITY.md`.
- Data freshness/staleness per source.
- Errors surfaced per `docs/07-engineering/ERROR_HANDLING.md`.
- Whether deterministic outputs (valuation, allocation, risk) are being produced
  successfully.

## Implemented Phase 1 Surface

- `GET /api/health` returns a non-secret, non-cached readiness document.
- Web availability, global feed configuration, Iranian feed configuration,
  operator persistence, scenario methodology, and financial-decision readiness are
  reported separately.
- Navasan's non-secret health detail reports the active free plan, effective refresh
  cadence, rolling 31-day usage, safe remainder and hard limit. The loopback-only
  Data Trust card translates those counters into Persian without calling the provider.
- Migration 0011 retains only Navasan's latest sanitized operational outcome. Health
  and Data Trust can show whether that call succeeded, when it completed and how many
  normalized quotes it produced, without storing or exposing payloads or prices.
- The same local health contract derives the exact next eligible call time from the
  newest immutable reservation and active cadence. Reading it never calls Navasan.
- The Persian card updates only its time-remaining text every 30 seconds in the
  browser; that timer does not refetch health or contact a provider.
- The Data Trust tab exposes the same boundaries in owner-facing language.
- `npm run ops:check-local` converts the health document into a strict local
  readiness result. It contacts only `localhost:4174`, requires persistence,
  provenance, ledger and quota health, and treats the financial-use lock as a
  mandatory success condition.
- Worker responses receive `nosniff`, no-referrer, disabled browser capability, and
  DNS-prefetch security headers.

## Status

`STATUS: PARTIAL`. Runtime health and a strict local preflight are observable and
fail-closed, but there is no external uptime probe, alert delivery channel,
persistence metric store, or incident dashboard. `/api/health` deliberately reports
`evaluation_only`; HTTP availability must never be interpreted as readiness for
financial use.

## Related Documents

- Data quality signals to monitor: `docs/05-data/DATA_QUALITY.md`
- Error handling: `docs/07-engineering/ERROR_HANDLING.md`
- Incident response when monitoring reveals a problem: `INCIDENT_RESPONSE.md`
