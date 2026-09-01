BEGIN;

-- This table deliberately keeps only the latest operational result. It stores no
-- provider payload, price, credential, or long-term market history.
CREATE TABLE provider_runtime_status (
  provider_id text PRIMARY KEY CHECK (provider_id = 'navasan'),
  last_reservation_id text NOT NULL UNIQUE REFERENCES provider_request_reservations(id),
  last_outcome text NOT NULL CHECK (last_outcome IN ('success', 'failure')),
  quote_count smallint,
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 0 AND 120000),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (last_outcome = 'success' AND quote_count BETWEEN 1 AND 64)
    OR (last_outcome = 'failure' AND quote_count IS NULL)
  )
);

REVOKE ALL ON provider_runtime_status FROM PUBLIC;

COMMIT;
