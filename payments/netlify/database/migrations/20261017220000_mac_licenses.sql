CREATE TABLE forma_mac_checkout_attempts (
  id uuid PRIMARY KEY,
  cookie_hash char(64) NOT NULL,
  stripe_session_id text UNIQUE,
  payment_failed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
CREATE TABLE forma_mac_payments (
  id uuid PRIMARY KEY,
  checkout_session_id text NOT NULL UNIQUE,
  payment_intent_id text NOT NULL UNIQUE,
  attempt_id uuid NOT NULL UNIQUE REFERENCES forma_mac_checkout_attempts(id),
  amount integer NOT NULL CHECK (amount >= 4900),
  currency text NOT NULL CHECK (currency = 'usd'),
  customer_email text,
  status text NOT NULL CHECK (status IN ('paid', 'refunded', 'disputed')),
  paid_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE forma_mac_licenses (
  id uuid PRIMARY KEY,
  payment_id uuid NOT NULL UNIQUE REFERENCES forma_mac_payments(id),
  key_hash char(64) NOT NULL UNIQUE,
  key_ciphertext text,
  state text NOT NULL DEFAULT 'issued' CHECK (state IN ('issued', 'activated', 'revoked')),
  device_public_key text,
  hardware_hash char(64),
  activation_challenge_id uuid UNIQUE,
  signed_grant text,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state <> 'activated' OR (device_public_key IS NOT NULL AND hardware_hash IS NOT NULL AND activation_challenge_id IS NOT NULL AND signed_grant IS NOT NULL AND activated_at IS NOT NULL))
);
CREATE TABLE forma_mac_activation_challenges (
  id uuid PRIMARY KEY,
  nonce text NOT NULL UNIQUE,
  device_public_key text NOT NULL,
  hardware_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  consumed_at timestamptz,
  license_id uuid REFERENCES forma_mac_licenses(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE forma_mac_licenses ADD CONSTRAINT forma_mac_activation_challenge_fk FOREIGN KEY (activation_challenge_id) REFERENCES forma_mac_activation_challenges(id);
CREATE INDEX forma_mac_challenge_expiry ON forma_mac_activation_challenges(expires_at) WHERE consumed_at IS NULL;
CREATE TABLE forma_mac_webhook_events (
  event_id text PRIMARY KEY,
  kind text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE forma_mac_payment_blocks (
  payment_intent_id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('refunded', 'disputed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE forma_mac_rate_limits (
  client_hash char(64) NOT NULL,
  action text NOT NULL,
  bucket bigint NOT NULL,
  hits integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_hash, action, bucket)
);
