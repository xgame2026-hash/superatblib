BEGIN;

-- Use the same collision-free identity for startup writes and heartbeats.
UPDATE liq2_user_profiles
   SET system_id = lower(chain) || ':' || lower(wallet_address);

UPDATE user_wallets
   SET system_id = lower(COALESCE(NULLIF(split_part(system_id, ':', 1), ''), NULLIF(metadata->>'chain', ''), 'bnb')) || ':' || lower(wallet_address)
 WHERE wallet_address IS NOT NULL;

UPDATE leaderboard_current
   SET system_id = lower(chain) || ':' || lower(wallet_address)
 WHERE wallet_address IS NOT NULL;

COMMENT ON TABLE liq2_user_profiles IS 'Liq2 private member master table uniquely identified by chain plus full wallet address.';
COMMENT ON COLUMN liq2_user_profiles.system_id IS 'Stable system id: normalized chain plus full normalized wallet address.';

COMMIT;
