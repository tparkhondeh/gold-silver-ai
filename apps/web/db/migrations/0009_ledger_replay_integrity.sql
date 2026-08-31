BEGIN;

CREATE OR REPLACE FUNCTION check_portfolio_valuation_parent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_version integer;
BEGIN
  IF EXISTS (SELECT 1 FROM portfolio_valuation_snapshots WHERE id=NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT version INTO STRICT current_version FROM user_portfolios WHERE subject_id=NEW.subject_id;
  IF current_version <> NEW.portfolio_version THEN
    RAISE EXCEPTION 'valuation portfolio version is not current';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
