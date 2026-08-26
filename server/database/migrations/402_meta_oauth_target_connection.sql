-- 402: bind catalogue-permission OAuth rerequests to one existing Meta connection.
-- Prevents a zero-ad-account OAuth response from refreshing unrelated mapped accounts.

BEGIN;

ALTER TABLE meta_oauth_attempts
  ADD COLUMN IF NOT EXISTS target_connection_id UUID
    REFERENCES social_connections(id) ON DELETE SET NULL;

COMMIT;
