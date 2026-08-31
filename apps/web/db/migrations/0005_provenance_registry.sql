BEGIN;

CREATE TABLE source_contract_versions (
  source_id text NOT NULL REFERENCES sources(id),
  version smallint NOT NULL CHECK (version >= 1),
  display_name text NOT NULL,
  quality text NOT NULL CHECK (quality IN ('primary', 'cross_check', 'informational', 'manual_snapshot', 'test_only')),
  access_mode text NOT NULL CHECK (access_mode IN ('keyed_api', 'licensed_file', 'manual_csv', 'manual_snapshot', 'test')),
  active boolean NOT NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (source_id, version),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

INSERT INTO source_contract_versions (source_id, version, display_name, quality, access_mode, active)
SELECT id, schema_version, display_name, quality, access_mode, active FROM sources;

ALTER TABLE observations ADD COLUMN source_contract_version smallint NOT NULL DEFAULT 1;
ALTER TABLE observations ADD CONSTRAINT observations_source_contract_version_fk
  FOREIGN KEY (source_id, source_contract_version)
  REFERENCES source_contract_versions(source_id, version);

CREATE TABLE artifact_versions (
  kind text NOT NULL CHECK (kind IN ('dataset', 'assumption', 'feature', 'model', 'methodology')),
  entity_id text NOT NULL CHECK (entity_id ~ '^[a-z0-9][a-z0-9_.:-]{0,99}$'),
  version integer NOT NULL CHECK (version >= 1),
  status text NOT NULL CHECK (status IN ('draft', 'active', 'deprecated', 'superseded')),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 2000),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (kind, entity_id, version),
  UNIQUE (kind, entity_id, content_hash),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
  CHECK (kind <> 'dataset' OR content ?& ARRAY['cutoffAt', 'purpose', 'observationIds']),
  CHECK (kind <> 'assumption' OR content ?& ARRAY['value', 'unit', 'source', 'sourceDate', 'confidence']),
  CHECK (kind <> 'feature' OR content ?& ARRAY['dataType', 'unit', 'transformation']),
  CHECK (kind <> 'model' OR content ? 'implementationRef'),
  CHECK (kind <> 'methodology' OR content ? 'decisionRecordRef')
);

CREATE TABLE dataset_observations (
  dataset_kind text NOT NULL DEFAULT 'dataset' CHECK (dataset_kind = 'dataset'),
  dataset_id text NOT NULL,
  dataset_version integer NOT NULL,
  observation_id text NOT NULL REFERENCES observations(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (dataset_id, dataset_version, observation_id),
  FOREIGN KEY (dataset_kind, dataset_id, dataset_version)
    REFERENCES artifact_versions(kind, entity_id, version)
);

CREATE TABLE decision_records (
  id text NOT NULL CHECK (id ~ '^decision_[a-f0-9]{64}$'),
  version integer NOT NULL CHECK (version >= 1),
  model_kind text CHECK (model_kind = 'model'),
  model_id text,
  model_version integer,
  methodology_kind text NOT NULL DEFAULT 'methodology' CHECK (methodology_kind = 'methodology'),
  methodology_id text NOT NULL,
  methodology_version integer NOT NULL,
  dataset_kind text NOT NULL DEFAULT 'dataset' CHECK (dataset_kind = 'dataset'),
  dataset_id text NOT NULL,
  dataset_version integer NOT NULL,
  produced_at timestamptz NOT NULL,
  risk_state text NOT NULL CHECK (risk_state IN ('normal', 'automation_paused', 'execution_disabled', 'safe_mode')),
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  output jsonb NOT NULL CHECK (jsonb_typeof(output) = 'object'),
  output_hash text NOT NULL CHECK (output_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('evaluation_only', 'operational')),
  execution_allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id, version),
  CHECK ((model_id IS NULL AND model_version IS NULL AND model_kind IS NULL) OR
         (model_id IS NOT NULL AND model_version IS NOT NULL AND model_kind = 'model')),
  CHECK (status <> 'evaluation_only' OR NOT execution_allowed),
  FOREIGN KEY (model_kind, model_id, model_version)
    REFERENCES artifact_versions(kind, entity_id, version) MATCH FULL,
  FOREIGN KEY (methodology_kind, methodology_id, methodology_version)
    REFERENCES artifact_versions(kind, entity_id, version),
  FOREIGN KEY (dataset_kind, dataset_id, dataset_version)
    REFERENCES artifact_versions(kind, entity_id, version)
);

CREATE TABLE decision_assumptions (
  decision_id text NOT NULL,
  decision_version integer NOT NULL,
  assumption_kind text NOT NULL DEFAULT 'assumption' CHECK (assumption_kind = 'assumption'),
  assumption_id text NOT NULL,
  assumption_version integer NOT NULL,
  PRIMARY KEY (decision_id, decision_version, assumption_id, assumption_version),
  FOREIGN KEY (decision_id, decision_version) REFERENCES decision_records(id, version),
  FOREIGN KEY (assumption_kind, assumption_id, assumption_version)
    REFERENCES artifact_versions(kind, entity_id, version)
);

CREATE TABLE decision_features (
  decision_id text NOT NULL,
  decision_version integer NOT NULL,
  feature_kind text NOT NULL DEFAULT 'feature' CHECK (feature_kind = 'feature'),
  feature_id text NOT NULL,
  feature_version integer NOT NULL,
  PRIMARY KEY (decision_id, decision_version, feature_id, feature_version),
  FOREIGN KEY (decision_id, decision_version) REFERENCES decision_records(id, version),
  FOREIGN KEY (feature_kind, feature_id, feature_version)
    REFERENCES artifact_versions(kind, entity_id, version)
);

CREATE TRIGGER source_contract_versions_are_immutable BEFORE UPDATE OR DELETE ON source_contract_versions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER artifact_versions_are_immutable BEFORE UPDATE OR DELETE ON artifact_versions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER dataset_observations_are_immutable BEFORE UPDATE OR DELETE ON dataset_observations
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER decision_records_are_immutable BEFORE UPDATE OR DELETE ON decision_records
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER decision_assumptions_are_immutable BEFORE UPDATE OR DELETE ON decision_assumptions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER decision_features_are_immutable BEFORE UPDATE OR DELETE ON decision_features
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation();

CREATE TRIGGER source_contract_versions_cannot_be_truncated BEFORE TRUNCATE ON source_contract_versions
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER artifact_versions_cannot_be_truncated BEFORE TRUNCATE ON artifact_versions
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER dataset_observations_cannot_be_truncated BEFORE TRUNCATE ON dataset_observations
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER decision_records_cannot_be_truncated BEFORE TRUNCATE ON decision_records
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER decision_assumptions_cannot_be_truncated BEFORE TRUNCATE ON decision_assumptions
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();
CREATE TRIGGER decision_features_cannot_be_truncated BEFORE TRUNCATE ON decision_features
  FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_data_mutation();

COMMIT;
