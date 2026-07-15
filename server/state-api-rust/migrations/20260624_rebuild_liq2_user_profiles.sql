BEGIN;

-- Hard cutover: no compatibility with pre-1.6.0 private member data.
-- Clients must start with liq2 1.6.0 and register again.
TRUNCATE TABLE
  sessions,
  leaderboard_current,
  wallet_runtime_settings,
  user_wallets,
  rpc_credits,
  licenses,
  users
RESTART IDENTITY CASCADE;

DROP TABLE IF EXISTS liq2_user_profiles CASCADE;

CREATE TABLE liq2_user_profiles (
  system_id text PRIMARY KEY,
  chain text NOT NULL,
  wallet_address text NOT NULL,
  rpc_url text,
  rpc_token text,
  encrypted_private_key text,
  credential_auth_mode text NOT NULL DEFAULT 'single',
  single_trade_auth_amount_usdt numeric NOT NULL DEFAULT 0,
  arbitrage_intensity text NOT NULL DEFAULT 'conservative',
  rpc_plan_type text NOT NULL DEFAULT 'unknown',
  rpc_plan_name text NOT NULL DEFAULT 'Unknown',
  wallet_usdt numeric NOT NULL DEFAULT 0,
  nickname text,
  status text NOT NULL DEFAULT 'online',
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT liq2_user_profiles_status_ck CHECK (status IN ('online', 'offline', 'stopped')),
  CONSTRAINT liq2_user_profiles_credential_mode_ck CHECK (credential_auth_mode IN ('single', 'loop'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_liq2_user_profiles_chain_wallet
  ON liq2_user_profiles (chain, wallet_address);

CREATE INDEX IF NOT EXISTS idx_liq2_user_profiles_status_heartbeat
  ON liq2_user_profiles (status, heartbeat_at DESC);

CREATE INDEX IF NOT EXISTS idx_liq2_user_profiles_wallet_usdt
  ON liq2_user_profiles (wallet_usdt DESC);

ALTER TABLE user_wallets
  ADD COLUMN IF NOT EXISTS system_id text,
  ADD COLUMN IF NOT EXISTS encrypted_private_key text,
  ADD COLUMN IF NOT EXISTS private_key_uploaded_at timestamptz;

ALTER TABLE leaderboard_current
  ADD COLUMN IF NOT EXISTS system_id text;

CREATE INDEX IF NOT EXISTS idx_user_wallets_system_id_v160
  ON user_wallets (system_id);

CREATE INDEX IF NOT EXISTS idx_leaderboard_current_system_id_v160
  ON leaderboard_current (system_id);

COMMENT ON TABLE liq2_user_profiles IS 'Liq2 private member master table uniquely identified by chain plus full wallet address.';
COMMENT ON COLUMN liq2_user_profiles.system_id IS 'Stable system id: normalized chain plus full normalized wallet address.';
COMMENT ON COLUMN liq2_user_profiles.encrypted_private_key IS 'Private key ciphertext encrypted for tx2; only filled once unless currently null.';
COMMENT ON COLUMN liq2_user_profiles.heartbeat_at IS 'Last startup/heartbeat timestamp; offline state is derived from this plus the server protection window.';

COMMIT;
