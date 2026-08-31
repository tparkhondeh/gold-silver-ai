BEGIN;

CREATE FUNCTION check_portfolio_valuation_parent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_version integer;
BEGIN
  SELECT version INTO STRICT current_version FROM user_portfolios WHERE subject_id=NEW.subject_id;
  IF current_version <> NEW.portfolio_version THEN
    RAISE EXCEPTION 'valuation portfolio version is not current';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION check_portfolio_valuation_position_lineage()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot portfolio_valuation_snapshots%ROWTYPE;
DECLARE observation observations%ROWTYPE;
BEGIN
  SELECT * INTO STRICT snapshot FROM portfolio_valuation_snapshots WHERE id=NEW.valuation_id;
  SELECT * INTO STRICT observation FROM observations WHERE id=NEW.observation_id;
  IF greatest(observation.observed_at,COALESCE(observation.published_at,observation.observed_at),observation.collected_at) > snapshot.as_of
     OR NOT EXISTS (
       SELECT 1 FROM dataset_observations d
       WHERE d.dataset_id=snapshot.dataset_id AND d.dataset_version=snapshot.dataset_version
         AND d.observation_id=NEW.observation_id
     ) THEN
    RAISE EXCEPTION 'valuation observation violates dataset or cutoff lineage';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION check_portfolio_valuation_transaction_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot_subject text;
DECLARE transaction_subject text;
BEGIN
  SELECT subject_id INTO STRICT snapshot_subject FROM portfolio_valuation_snapshots WHERE id=NEW.valuation_id;
  SELECT subject_id INTO STRICT transaction_subject FROM portfolio_transaction_events WHERE id=NEW.transaction_id;
  IF snapshot_subject <> transaction_subject THEN
    RAISE EXCEPTION 'valuation transaction violates owner lineage';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER portfolio_valuation_parent_before_insert
  BEFORE INSERT ON portfolio_valuation_snapshots
  FOR EACH ROW EXECUTE FUNCTION check_portfolio_valuation_parent();
CREATE TRIGGER portfolio_valuation_position_lineage_before_insert
  BEFORE INSERT ON portfolio_valuation_positions
  FOR EACH ROW EXECUTE FUNCTION check_portfolio_valuation_position_lineage();
CREATE TRIGGER portfolio_valuation_transaction_owner_before_insert
  BEFORE INSERT ON portfolio_valuation_transactions
  FOR EACH ROW EXECUTE FUNCTION check_portfolio_valuation_transaction_owner();

COMMIT;
