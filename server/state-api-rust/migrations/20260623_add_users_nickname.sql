ALTER TABLE users
  ADD COLUMN IF NOT EXISTS nickname text;

COMMENT ON COLUMN users.nickname IS 'User nickname/remark, maintained by tx2 for operator identification.';
