BEGIN;

-- These four tables are authorization state, NOT portfolio data. Exclude their
-- DATA from every backup; a restore deliberately requires fresh owner enrollment.
CREATE TABLE private_passkey_owners (
  binding_hash text PRIMARY KEY CHECK (binding_hash ~ '^[a-f0-9]{64}$'),
  revision integer NOT NULL CHECK (revision > 0),
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts BETWEEN 0 AND 20)
);
CREATE TABLE private_passkey_credentials (
  binding_hash text NOT NULL REFERENCES private_passkey_owners(binding_hash),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 1366 AND id ~ '^[A-Za-z0-9_-]+$'),
  public_key bytea NOT NULL CHECK (octet_length(public_key) BETWEEN 1 AND 4096),
  counter bigint NOT NULL CHECK (counter BETWEEN 0 AND 4294967295),
  transports text[] NOT NULL CHECK (cardinality(transports) <= 5 AND transports <@ ARRAY['usb','nfc','ble','internal','hybrid']::text[]),
  device_type text NOT NULL CHECK (device_type IN ('singleDevice','multiDevice')),
  backed_up boolean NOT NULL,
  CHECK (device_type <> 'singleDevice' OR NOT backed_up),
  PRIMARY KEY (binding_hash,id)
);
CREATE TABLE private_passkey_bootstrap_grants (
  binding_hash text PRIMARY KEY REFERENCES private_passkey_owners(binding_hash),
  hash text NOT NULL UNIQUE CHECK (hash ~ '^[A-Za-z0-9_-]{43}$'),
  owner_revision integer NOT NULL CHECK (owner_revision > 0),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  challenge_hash text CHECK (challenge_hash ~ '^[A-Za-z0-9_-]{43}$'),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes')
);
CREATE TABLE private_passkey_challenges (
  hash text PRIMARY KEY CHECK (hash ~ '^[A-Za-z0-9_-]{43}$'),
  binding_hash text NOT NULL REFERENCES private_passkey_owners(binding_hash),
  purpose text NOT NULL CHECK (purpose IN ('authentication','registration')),
  challenge text NOT NULL CHECK (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  owner_revision integer NOT NULL CHECK (owner_revision > 0),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  authority_kind text,
  authority_hash text,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes'),
  CHECK ((purpose='authentication' AND authority_kind IS NULL AND authority_hash IS NULL)
    OR (purpose='registration' AND authority_kind IS NOT NULL AND authority_kind IN ('bootstrap','session') AND authority_hash ~ '^[A-Za-z0-9_-]{43}$' AND authority_hash IS NOT NULL))
);
CREATE INDEX private_passkey_challenge_expiry_idx ON private_passkey_challenges(binding_hash,expires_at);

ALTER TABLE private_passkey_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_passkey_owners FORCE ROW LEVEL SECURITY;
ALTER TABLE private_passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_passkey_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE private_passkey_bootstrap_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_passkey_bootstrap_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE private_passkey_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_passkey_challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY private_passkey_owner_binding ON private_passkey_owners USING (binding_hash=current_setting('asha.identity_binding',true)) WITH CHECK (binding_hash=current_setting('asha.identity_binding',true));
CREATE POLICY private_passkey_credential_binding ON private_passkey_credentials USING (binding_hash=current_setting('asha.identity_binding',true)) WITH CHECK (binding_hash=current_setting('asha.identity_binding',true));
CREATE POLICY private_passkey_bootstrap_binding ON private_passkey_bootstrap_grants USING (binding_hash=current_setting('asha.identity_binding',true)) WITH CHECK (binding_hash=current_setting('asha.identity_binding',true));
CREATE POLICY private_passkey_challenge_binding ON private_passkey_challenges USING (binding_hash=current_setting('asha.identity_binding',true)) WITH CHECK (binding_hash=current_setting('asha.identity_binding',true));
REVOKE ALL ON private_passkey_owners,private_passkey_credentials,private_passkey_bootstrap_grants,private_passkey_challenges FROM PUBLIC;
COMMIT;
