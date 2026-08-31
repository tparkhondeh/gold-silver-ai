BEGIN;

CREATE TABLE portfolio_preferences (
  portfolio_id text PRIMARY KEY REFERENCES user_portfolios(id) ON DELETE CASCADE,
  liquidity_reserve_percent numeric(5,2) CHECK (liquidity_reserve_percent BETWEEN 0 AND 100),
  max_single_asset_percent numeric(5,2) CHECK (max_single_asset_percent BETWEEN 1 AND 100),
  max_acceptable_drawdown_percent numeric(5,2) CHECK (max_acceptable_drawdown_percent BETWEEN 1 AND 100),
  short_term_months smallint CHECK (short_term_months BETWEEN 1 AND 24),
  long_term_years smallint CHECK (long_term_years BETWEEN 1 AND 20),
  analysis_horizon text NOT NULL DEFAULT 'short' CHECK (analysis_horizon IN ('short', 'long')),
  decision_horizon text NOT NULL DEFAULT 'short' CHECK (decision_horizon IN ('short', 'long')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE portfolio_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY portfolio_preferences_subject_isolation ON portfolio_preferences
  USING (EXISTS (
    SELECT 1 FROM user_portfolios p
    WHERE p.id = portfolio_preferences.portfolio_id
      AND p.subject_id = current_setting('asha.subject_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_portfolios p
    WHERE p.id = portfolio_preferences.portfolio_id
      AND p.subject_id = current_setting('asha.subject_id', true)
  ));

COMMIT;
