BEGIN;

ALTER TABLE observations ADD COLUMN correction_reason text;
ALTER TABLE observations ADD CONSTRAINT observations_correction_reason_contract CHECK (
  (correction_of IS NULL AND correction_reason IS NULL)
  OR (correction_of IS NOT NULL AND length(btrim(correction_reason)) BETWEEN 3 AND 500)
);

CREATE TABLE source_reconciliations (
  id text PRIMARY KEY CHECK (id ~ '^reconciliation_[a-f0-9]{64}$'),
  policy_id text NOT NULL CHECK (policy_id ~ '^[a-z0-9][a-z0-9_.:-]{0,99}$'),
  policy_version integer NOT NULL CHECK (policy_version >= 1),
  instrument_code text NOT NULL REFERENCES instruments(code),
  cutoff_at timestamptz NOT NULL,
  selected_observation_id text NOT NULL REFERENCES observations(id),
  reason_code text NOT NULL CHECK (reason_code IN (
    'source_quality', 'source_priority', 'latest_availability', 'stable_identity'
  )),
  candidate_count integer NOT NULL CHECK (candidate_count >= 2),
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (policy_id, policy_version, instrument_code, cutoff_at, input_hash)
);

CREATE TABLE source_reconciliation_candidates (
  reconciliation_id text NOT NULL REFERENCES source_reconciliations(id),
  observation_id text NOT NULL REFERENCES observations(id),
  rank integer NOT NULL CHECK (rank >= 1),
  selected boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (reconciliation_id, observation_id),
  UNIQUE (reconciliation_id, rank)
);

CREATE UNIQUE INDEX source_reconciliation_one_selected_idx
  ON source_reconciliation_candidates (reconciliation_id) WHERE selected;

CREATE FUNCTION check_source_reconciliation_parent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  selected observations%ROWTYPE;
BEGIN
  SELECT * INTO STRICT selected FROM observations WHERE id = NEW.selected_observation_id;
  IF selected.instrument_code <> NEW.instrument_code
     OR greatest(selected.observed_at, COALESCE(selected.published_at, selected.observed_at), selected.collected_at) > NEW.cutoff_at THEN
    RAISE EXCEPTION 'selected reconciliation observation violates instrument or cutoff';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION check_source_reconciliation_candidate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  reconciliation source_reconciliations%ROWTYPE;
  candidate observations%ROWTYPE;
BEGIN
  SELECT * INTO STRICT reconciliation FROM source_reconciliations WHERE id = NEW.reconciliation_id;
  SELECT * INTO STRICT candidate FROM observations WHERE id = NEW.observation_id;
  IF candidate.instrument_code <> reconciliation.instrument_code
     OR greatest(candidate.observed_at, COALESCE(candidate.published_at, candidate.observed_at), candidate.collected_at) > reconciliation.cutoff_at
     OR NEW.selected <> (NEW.observation_id = reconciliation.selected_observation_id) THEN
    RAISE EXCEPTION 'reconciliation candidate violates instrument, cutoff or selection contract';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER source_reconciliation_parent_before_insert
  BEFORE INSERT ON source_reconciliations
  FOR EACH ROW EXECUTE FUNCTION check_source_reconciliation_parent();
CREATE TRIGGER source_reconciliation_candidate_before_insert
  BEFORE INSERT ON source_reconciliation_candidates
  FOR EACH ROW EXECUTE FUNCTION check_source_reconciliation_candidate();

CREATE TRIGGER source_reconciliations_are_immutable BEFORE UPDATE OR DELETE ON source_reconciliations
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER source_reconciliation_candidates_are_immutable BEFORE UPDATE OR DELETE ON source_reconciliation_candidates
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER source_reconciliations_cannot_be_truncated BEFORE TRUNCATE ON source_reconciliations
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER source_reconciliation_candidates_cannot_be_truncated BEFORE TRUNCATE ON source_reconciliation_candidates
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();

COMMIT;
