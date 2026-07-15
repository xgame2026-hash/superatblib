BEGIN;

-- LIQ2 no longer accepts, stores, or verifies a user password.
ALTER TABLE IF EXISTS liq2_user_profiles
  DROP COLUMN IF EXISTS password;

COMMIT;
