BEGIN;

CREATE TRIGGER ingestion_batches_are_immutable
  BEFORE UPDATE OR DELETE ON ingestion_batches
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();

CREATE TRIGGER observations_cannot_be_truncated
  BEFORE TRUNCATE ON observations
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER batches_cannot_be_truncated
  BEFORE TRUNCATE ON ingestion_batches
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER quarantine_cannot_be_truncated
  BEFORE TRUNCATE ON quarantine_records
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER validations_cannot_be_truncated
  BEFORE TRUNCATE ON validation_results
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER resolutions_cannot_be_truncated
  BEFORE TRUNCATE ON quarantine_resolutions
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();

CREATE FUNCTION check_observation_contract_and_correction()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  instrument instruments%ROWTYPE;
  original observations%ROWTYPE;
BEGIN
  SELECT * INTO STRICT instrument FROM instruments WHERE code = NEW.instrument_code;
  IF NEW.currency <> instrument.canonical_currency OR NEW.unit <> instrument.canonical_unit THEN
    RAISE EXCEPTION 'observation does not match instrument unit/currency contract';
  END IF;
  IF NEW.observed_at > NEW.collected_at + interval '5 minutes'
     OR NEW.published_at > NEW.collected_at + interval '5 minutes' THEN
    RAISE EXCEPTION 'observation timestamp order is invalid';
  END IF;
  IF NEW.correction_of IS NOT NULL THEN
    SELECT * INTO STRICT original FROM observations WHERE id = NEW.correction_of;
    IF original.instrument_code <> NEW.instrument_code OR original.source_id <> NEW.source_id
       OR NEW.collected_at < original.collected_at THEN
      RAISE EXCEPTION 'correction target/source/receipt time is invalid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER observation_contract_before_insert
  BEFORE INSERT ON observations
  FOR EACH ROW EXECUTE FUNCTION check_observation_contract_and_correction();

COMMIT;
