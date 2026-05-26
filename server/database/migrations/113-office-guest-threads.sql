-- =============================================================================
-- Office guest threads
-- Adds a first-class chat channel type for guest badge access discussions.
-- =============================================================================

BEGIN;

ALTER TABLE chat_channels DROP CONSTRAINT IF EXISTS chat_channels_type_check;
ALTER TABLE chat_channels ADD CONSTRAINT chat_channels_type_check
  CHECK (type IN ('channel','dm','group_dm','office_zone','office_meeting','office_recording','office_guest'));

ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS external_id uuid;
CREATE INDEX IF NOT EXISTS idx_chat_channels_external
  ON chat_channels(type, external_id) WHERE external_id IS NOT NULL;

COMMIT;
