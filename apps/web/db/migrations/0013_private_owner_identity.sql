BEGIN;

-- Authentication state survives a process/database restart, not a backup restore.
-- Backup tooling must exclude DATA from both tables while retaining this schema.
CREATE TABLE private_owner_login_transactions (
  hash text PRIMARY KEY CHECK (hash ~ '^[A-Za-z0-9_-]{43}$'),
  binding_hash text NOT NULL CHECK (binding_hash ~ '^[a-f0-9]{64}$'),
  origin text NOT NULL CHECK (length(origin) BETWEEN 1 AND 2048),
  issuer text NOT NULL CHECK (length(issuer) BETWEEN 1 AND 2048),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  state text NOT NULL CHECK (state ~ '^[A-Za-z0-9_-]{43}$'),
  nonce text NOT NULL CHECK (nonce ~ '^[A-Za-z0-9_-]{43}$'),
  pkce_verifier text NOT NULL CHECK (pkce_verifier ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes')
);

CREATE TABLE private_owner_sessions (
  hash text PRIMARY KEY CHECK (hash ~ '^[A-Za-z0-9_-]{43}$'),
  binding_hash text NOT NULL CHECK (binding_hash ~ '^[a-f0-9]{64}$'),
  -- Retained after the temporary row is deleted, so a pending-cookie logout can
  -- revoke a committed login even before its response cookie reaches the browser.
  login_transaction_hash text NOT NULL CHECK (login_transaction_hash ~ '^[A-Za-z0-9_-]{43}$'),
  origin text NOT NULL CHECK (length(origin) BETWEEN 1 AND 2048),
  issuer text NOT NULL CHECK (length(issuer) BETWEEN 1 AND 2048),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  portfolio_subject text NOT NULL CHECK (length(portfolio_subject) BETWEEN 1 AND 200 AND portfolio_subject <> 'local-owner-v1'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '8 hours'),
  UNIQUE (binding_hash, login_transaction_hash)
);

CREATE INDEX private_owner_login_expiry_idx ON private_owner_login_transactions(binding_hash, expires_at);
CREATE INDEX private_owner_session_expiry_idx ON private_owner_sessions(binding_hash, expires_at);

ALTER TABLE private_owner_login_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_owner_login_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE private_owner_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_owner_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY private_owner_login_binding ON private_owner_login_transactions
  USING (binding_hash = current_setting('asha.identity_binding', true))
  WITH CHECK (binding_hash = current_setting('asha.identity_binding', true));
CREATE POLICY private_owner_session_binding ON private_owner_sessions
  USING (binding_hash = current_setting('asha.identity_binding', true))
  WITH CHECK (binding_hash = current_setting('asha.identity_binding', true));
REVOKE ALL ON private_owner_login_transactions, private_owner_sessions FROM PUBLIC;

COMMIT;
