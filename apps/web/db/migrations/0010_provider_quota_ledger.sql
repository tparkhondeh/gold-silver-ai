BEGIN;

CREATE TABLE provider_request_reservations (
  id text PRIMARY KEY CHECK (id ~ '^navasan_request_[0-9a-f-]{36}$'),
  provider_id text NOT NULL CHECK (provider_id = 'navasan'),
  endpoint text NOT NULL CHECK (endpoint IN ('latest', 'dailyCurrency', 'ohlcSearch')),
  request_hash text NOT NULL CHECK (length(request_hash) = 64 AND request_hash ~ '^[a-f0-9]+$'),
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  window_days smallint NOT NULL CHECK (window_days = 31),
  limit_snapshot smallint NOT NULL CHECK (limit_snapshot = 115),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX provider_request_reservations_window_idx
  ON provider_request_reservations (provider_id, reserved_at DESC);

CREATE TRIGGER provider_request_reservations_are_immutable
  BEFORE UPDATE OR DELETE ON provider_request_reservations
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();

CREATE TRIGGER provider_request_reservations_cannot_be_truncated
  BEFORE TRUNCATE ON provider_request_reservations
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();

COMMIT;
