# Monitoring

**Source of truth for:** how the system's health and correctness are observed
once running. Nothing is deployed yet.

## Requirement (once implemented)

At minimum, the system should eventually make observable:

- Data pipeline health (is data arriving, is it passing validation) — see
  `docs/05-data/DATA_QUALITY.md`.
- Data freshness/staleness per source.
- Errors surfaced per `docs/07-engineering/ERROR_HANDLING.md`.
- Whether deterministic outputs (valuation, allocation, risk) are being produced
  successfully.

## Status

`STATUS: TBD` for tooling and implementation — depends on the technology stack and
deployment approach (`DEPLOYMENT.md`).

## Related Documents

- Data quality signals to monitor: `docs/05-data/DATA_QUALITY.md`
- Error handling: `docs/07-engineering/ERROR_HANDLING.md`
- Incident response when monitoring reveals a problem: `INCIDENT_RESPONSE.md`
