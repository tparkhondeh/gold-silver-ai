BEGIN;

CREATE TABLE portfolio_transaction_events (
  id text PRIMARY KEY CHECK (id ~ '^transaction_[a-f0-9]{64}$'),
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  subject_id text NOT NULL REFERENCES user_portfolios(subject_id),
  event_kind text NOT NULL CHECK (event_kind IN ('trade','transfer','income','fee','adjustment')),
  asset_key text NOT NULL CHECK (asset_key ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$'),
  quantity_delta numeric(38,12),
  quantity_unit text,
  cash_delta numeric(38,2),
  cash_currency text CHECK (cash_currency IN ('IRR','TOMAN','USD')),
  fee_amount numeric(38,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  occurred_at timestamptz NOT NULL,
  correction_of text REFERENCES portfolio_transaction_events(id),
  correction_reason text,
  evidence_hash text CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[a-f0-9]{64}$'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (quantity_delta IS NULL OR quantity_delta <> 0),
  CHECK ((quantity_delta IS NULL) = (quantity_unit IS NULL)),
  CHECK (cash_delta IS NULL OR cash_delta <> 0),
  CHECK ((cash_delta IS NULL AND fee_amount = 0) = (cash_currency IS NULL)),
  CHECK (quantity_delta IS NOT NULL OR cash_delta IS NOT NULL),
  CHECK (correction_of IS NULL OR correction_of <> id),
  CHECK ((correction_of IS NULL AND correction_reason IS NULL) OR
    (correction_of IS NOT NULL AND length(btrim(correction_reason)) BETWEEN 3 AND 500))
);

CREATE INDEX portfolio_transaction_subject_time_idx
  ON portfolio_transaction_events(subject_id, occurred_at DESC);

CREATE FUNCTION check_portfolio_transaction_correction()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original portfolio_transaction_events%ROWTYPE;
BEGIN
  IF NEW.correction_of IS NOT NULL THEN
    SELECT * INTO STRICT original FROM portfolio_transaction_events WHERE id=NEW.correction_of;
    IF original.subject_id <> NEW.subject_id OR original.asset_key <> NEW.asset_key THEN
      RAISE EXCEPTION 'transaction correction target violates owner or asset contract';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER portfolio_transaction_correction_before_insert
  BEFORE INSERT ON portfolio_transaction_events
  FOR EACH ROW EXECUTE FUNCTION check_portfolio_transaction_correction();

CREATE TABLE portfolio_valuation_snapshots (
  id text PRIMARY KEY CHECK (id ~ '^valuation_[a-f0-9]{64}$'),
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  subject_id text NOT NULL REFERENCES user_portfolios(subject_id),
  portfolio_version integer NOT NULL CHECK (portfolio_version >= 0),
  as_of timestamptz NOT NULL,
  dataset_kind text NOT NULL DEFAULT 'dataset' CHECK (dataset_kind='dataset'),
  dataset_id text NOT NULL,
  dataset_version integer NOT NULL,
  methodology_kind text NOT NULL DEFAULT 'methodology' CHECK (methodology_kind='methodology'),
  methodology_id text NOT NULL,
  methodology_version integer NOT NULL,
  reporting_currency text NOT NULL CHECK (reporting_currency IN ('IRR','TOMAN','USD')),
  total_value numeric(38,2) NOT NULL CHECK (total_value >= 0),
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  output_hash text NOT NULL CHECK (output_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'evaluation_only' CHECK (status='evaluation_only'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (dataset_kind,dataset_id,dataset_version)
    REFERENCES artifact_versions(kind,entity_id,version),
  FOREIGN KEY (methodology_kind,methodology_id,methodology_version)
    REFERENCES artifact_versions(kind,entity_id,version)
);

CREATE TABLE portfolio_valuation_positions (
  valuation_id text NOT NULL REFERENCES portfolio_valuation_snapshots(id),
  position_key text NOT NULL CHECK (length(position_key) BETWEEN 1 AND 120),
  asset_key text NOT NULL CHECK (asset_key ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$'),
  quantity numeric(38,12) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (length(unit) BETWEEN 1 AND 40),
  observation_id text NOT NULL REFERENCES observations(id),
  price numeric(38,12) NOT NULL CHECK (price > 0),
  value numeric(38,2) NOT NULL CHECK (value >= 0),
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (valuation_id,position_key)
);

CREATE TABLE portfolio_valuation_transactions (
  valuation_id text NOT NULL REFERENCES portfolio_valuation_snapshots(id),
  transaction_id text NOT NULL REFERENCES portfolio_transaction_events(id),
  PRIMARY KEY (valuation_id,transaction_id)
);

ALTER TABLE portfolio_transaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_transaction_events FORCE ROW LEVEL SECURITY;
ALTER TABLE portfolio_valuation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_valuation_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE portfolio_valuation_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_valuation_positions FORCE ROW LEVEL SECURITY;
ALTER TABLE portfolio_valuation_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_valuation_transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY portfolio_transaction_subject_isolation ON portfolio_transaction_events
  USING (subject_id=current_setting('asha.subject_id',true))
  WITH CHECK (subject_id=current_setting('asha.subject_id',true));
CREATE POLICY portfolio_valuation_subject_isolation ON portfolio_valuation_snapshots
  USING (subject_id=current_setting('asha.subject_id',true))
  WITH CHECK (subject_id=current_setting('asha.subject_id',true));
CREATE POLICY portfolio_valuation_position_subject_isolation ON portfolio_valuation_positions
  USING (EXISTS (SELECT 1 FROM portfolio_valuation_snapshots s WHERE s.id=valuation_id AND s.subject_id=current_setting('asha.subject_id',true)))
  WITH CHECK (EXISTS (SELECT 1 FROM portfolio_valuation_snapshots s WHERE s.id=valuation_id AND s.subject_id=current_setting('asha.subject_id',true)));
CREATE POLICY portfolio_valuation_transaction_subject_isolation ON portfolio_valuation_transactions
  USING (EXISTS (SELECT 1 FROM portfolio_valuation_snapshots s WHERE s.id=valuation_id AND s.subject_id=current_setting('asha.subject_id',true)))
  WITH CHECK (EXISTS (SELECT 1 FROM portfolio_valuation_snapshots s WHERE s.id=valuation_id AND s.subject_id=current_setting('asha.subject_id',true)));

CREATE TRIGGER portfolio_transactions_are_immutable BEFORE UPDATE OR DELETE ON portfolio_transaction_events
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER portfolio_valuations_are_immutable BEFORE UPDATE OR DELETE ON portfolio_valuation_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER portfolio_valuation_positions_are_immutable BEFORE UPDATE OR DELETE ON portfolio_valuation_positions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER portfolio_valuation_transactions_are_immutable BEFORE UPDATE OR DELETE ON portfolio_valuation_transactions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER portfolio_transactions_cannot_be_truncated BEFORE TRUNCATE ON portfolio_transaction_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER portfolio_valuations_cannot_be_truncated BEFORE TRUNCATE ON portfolio_valuation_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER portfolio_valuation_positions_cannot_be_truncated BEFORE TRUNCATE ON portfolio_valuation_positions
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER portfolio_valuation_transactions_cannot_be_truncated BEFORE TRUNCATE ON portfolio_valuation_transactions
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();

COMMIT;
