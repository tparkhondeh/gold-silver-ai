BEGIN;

CREATE TABLE user_portfolios (
  id text PRIMARY KEY CHECK (id ~ '^portfolio_[a-f0-9]{32}$'),
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  subject_id text NOT NULL UNIQUE CHECK (length(subject_id) BETWEEN 1 AND 200),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE portfolio_holdings (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 100),
  portfolio_id text NOT NULL REFERENCES user_portfolios(id) ON DELETE CASCADE,
  asset_name text NOT NULL CHECK (length(asset_name) BETWEEN 1 AND 120),
  amount numeric(38,12) NOT NULL CHECK (amount > 0),
  unit text NOT NULL CHECK (length(unit) BETWEEN 1 AND 60),
  cost_toman numeric(38,2) CHECK (cost_toman >= 0),
  purchase_date text CHECK (purchase_date ~ '^\d{4}-\d{2}-\d{2}$'),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (portfolio_id, id)
);

CREATE INDEX portfolio_holdings_portfolio_idx ON portfolio_holdings(portfolio_id);

ALTER TABLE user_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_portfolios FORCE ROW LEVEL SECURITY;
ALTER TABLE portfolio_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_holdings FORCE ROW LEVEL SECURITY;

CREATE POLICY user_portfolios_subject_isolation ON user_portfolios
  USING (subject_id = current_setting('asha.subject_id', true))
  WITH CHECK (subject_id = current_setting('asha.subject_id', true));

CREATE POLICY portfolio_holdings_subject_isolation ON portfolio_holdings
  USING (EXISTS (
    SELECT 1 FROM user_portfolios p
    WHERE p.id = portfolio_holdings.portfolio_id
      AND p.subject_id = current_setting('asha.subject_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_portfolios p
    WHERE p.id = portfolio_holdings.portfolio_id
      AND p.subject_id = current_setting('asha.subject_id', true)
  ));

COMMIT;
