-- =============================================================================
-- Virtual Office Foundation
-- Phase 1a: schema + chat_channels/user_chat_status/clients extensions
-- =============================================================================

BEGIN;

-- ---------- 1. Office tables ------------------------------------------------

CREATE TABLE IF NOT EXISTS offices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  layout      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS office_zones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id         uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  slug              text NOT NULL,
  name              text NOT NULL,
  zone_type         text NOT NULL CHECK (zone_type IN ('lobby','meeting','focus','theater','client_lounge')),
  position          jsonb NOT NULL,
  capacity          int  NOT NULL DEFAULT 20,
  is_private        boolean NOT NULL DEFAULT false,
  acl               jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes             text NOT NULL DEFAULT '',
  notes_version     bigint NOT NULL DEFAULT 0,
  notes_updated_at  timestamptz,
  notes_updated_by  uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, slug)
);

CREATE TABLE IF NOT EXISTS office_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id       uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  user_id         uuid,
  client_user_id  uuid,
  role            text NOT NULL CHECK (role IN ('admin','member','guest')),
  added_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NULL) <> (client_user_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_office_members_uniq_user
  ON office_members(office_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_office_members_uniq_client
  ON office_members(office_id, client_user_id)
  WHERE client_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS zone_visits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id     uuid NOT NULL REFERENCES office_zones(id) ON DELETE CASCADE,
  actor_id    uuid NOT NULL,
  actor_type  text NOT NULL CHECK (actor_type IN ('user','client')),
  entered_at  timestamptz NOT NULL,
  left_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_office_zones_office ON office_zones(office_id);
CREATE INDEX IF NOT EXISTS idx_office_members_user
  ON office_members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_office_members_client
  ON office_members(client_user_id) WHERE client_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_zone_visits_zone_time
  ON zone_visits(zone_id, entered_at DESC);

-- ---------- 2. chat_channels extension (for Phase 1c chat reuse) -----------

ALTER TABLE chat_channels DROP CONSTRAINT IF EXISTS chat_channels_type_check;
ALTER TABLE chat_channels ADD CONSTRAINT chat_channels_type_check
  CHECK (type IN ('channel','dm','group_dm','office_zone'));

ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS external_id uuid;
CREATE INDEX IF NOT EXISTS idx_chat_channels_external
  ON chat_channels(type, external_id) WHERE external_id IS NOT NULL;

-- ---------- 3. user_chat_status extension for client presence --------------
-- Decision: extend the existing table with a nullable client_user_id rather than
-- creating a parallel table. CHECK enforces one-or-the-other.

ALTER TABLE user_chat_status ADD COLUMN IF NOT EXISTS client_user_id uuid;
ALTER TABLE user_chat_status DROP CONSTRAINT IF EXISTS user_chat_status_actor_check;
ALTER TABLE user_chat_status ADD CONSTRAINT user_chat_status_actor_check
  CHECK ((user_id IS NULL) <> (client_user_id IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_chat_status_user
  ON user_chat_status(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_chat_status_client
  ON user_chat_status(client_user_id) WHERE client_user_id IS NOT NULL;

-- ---------- 4. agency_clients table flag for Phase 1d portal entry ---------
-- Note: the table is named `agency_clients` (not `clients`) in this project.
-- ALTER ... IF NOT EXISTS is safe / idempotent on re-run.

ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS office_access boolean NOT NULL DEFAULT false;

COMMIT;
