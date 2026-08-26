BEGIN;

CREATE TABLE instruments (
  code text PRIMARY KEY,
  schema_version smallint NOT NULL CHECK (schema_version = 1),
  display_name text NOT NULL,
  asset_class text NOT NULL CHECK (asset_class IN ('gold', 'silver', 'currency', 'reference', 'test')),
  canonical_currency text NOT NULL CHECK (canonical_currency IN ('IRR', 'TOMAN', 'USD')),
  canonical_unit text NOT NULL CHECK (canonical_unit IN ('gram', 'mesghal', 'unit', 'usd', 'troy_ounce')),
  active_from timestamptz NOT NULL,
  retired_at timestamptz,
  CHECK (retired_at IS NULL OR retired_at >= active_from)
);

CREATE TABLE sources (
  id text PRIMARY KEY,
  schema_version smallint NOT NULL CHECK (schema_version = 1),
  display_name text NOT NULL,
  quality text NOT NULL CHECK (quality IN ('primary', 'cross_check', 'informational', 'manual_snapshot', 'test_only')),
  access_mode text NOT NULL CHECK (access_mode IN ('keyed_api', 'licensed_file', 'manual_csv', 'manual_snapshot', 'test')),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE ingestion_batches (
  id text PRIMARY KEY,
  schema_version smallint NOT NULL CHECK (schema_version = 1),
  source_id text NOT NULL REFERENCES sources(id),
  file_name text NOT NULL,
  collected_at timestamptz NOT NULL,
  accepted_count integer NOT NULL CHECK (accepted_count >= 0),
  quarantined_count integer NOT NULL CHECK (quarantined_count >= 0),
  duplicate_count integer NOT NULL CHECK (duplicate_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE observations (
  id text PRIMARY KEY,
  schema_version smallint NOT NULL CHECK (schema_version = 1),
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) = 64),
  payload_hash text NOT NULL CHECK (length(payload_hash) = 64),
  instrument_code text NOT NULL REFERENCES instruments(code),
  source_id text NOT NULL REFERENCES sources(id),
  value numeric(38, 12) NOT NULL CHECK (value > 0),
  currency text NOT NULL CHECK (currency IN ('IRR', 'TOMAN', 'USD')),
  unit text NOT NULL CHECK (unit IN ('gram', 'mesghal', 'unit', 'usd', 'troy_ounce')),
  observed_at timestamptz NOT NULL,
  published_at timestamptz,
  collected_at timestamptz NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  correction_of text REFERENCES observations(id),
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (correction_of IS NULL OR correction_of <> id)
);

CREATE INDEX observations_instrument_point_in_time_idx
  ON observations (instrument_code, observed_at DESC, collected_at DESC);
CREATE INDEX observations_source_collected_idx
  ON observations (source_id, collected_at DESC);

CREATE TABLE quarantine_records (
  id text PRIMARY KEY,
  schema_version smallint NOT NULL CHECK (schema_version = 1),
  batch_id text NOT NULL REFERENCES ingestion_batches(id),
  row_number integer NOT NULL CHECK (row_number >= 2),
  received_at timestamptz NOT NULL,
  raw_payload jsonb NOT NULL,
  issues jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_number)
);

CREATE TABLE quarantine_resolutions (
  id text PRIMARY KEY,
  quarantine_id text NOT NULL REFERENCES quarantine_records(id),
  status text NOT NULL CHECK (status IN ('accepted_as_correction', 'rejected')),
  reason text NOT NULL,
  resolved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quarantine_id)
);

CREATE TABLE validation_results (
  id text PRIMARY KEY,
  schema_version smallint NOT NULL CHECK (schema_version = 1),
  batch_id text NOT NULL REFERENCES ingestion_batches(id),
  observation_id text REFERENCES observations(id),
  quarantine_id text REFERENCES quarantine_records(id),
  passed boolean NOT NULL,
  issues jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((observation_id IS NOT NULL)::integer + (quarantine_id IS NOT NULL)::integer = 1),
  CHECK ((passed AND observation_id IS NOT NULL) OR (NOT passed AND quarantine_id IS NOT NULL))
);

CREATE OR REPLACE FUNCTION reject_immutable_data_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable data records cannot be updated or deleted';
END;
$$;

CREATE TRIGGER observations_are_immutable
  BEFORE UPDATE OR DELETE ON observations
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER quarantine_records_are_immutable
  BEFORE UPDATE OR DELETE ON quarantine_records
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER validation_results_are_immutable
  BEFORE UPDATE OR DELETE ON validation_results
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER quarantine_resolutions_are_immutable
  BEFORE UPDATE OR DELETE ON quarantine_resolutions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();

COMMIT;
