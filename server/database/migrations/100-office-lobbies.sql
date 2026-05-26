-- Persistent public lobby definitions for personal/team/company handles.

CREATE TABLE IF NOT EXISTS office_lobbies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id           uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  owner_user_id       uuid REFERENCES team_members(id) ON DELETE SET NULL,
  handle              text NOT NULL,
  name                text NOT NULL,
  description         text NOT NULL DEFAULT '',
  destination_zone_id uuid REFERENCES office_zones(id) ON DELETE SET NULL,
  is_active           boolean NOT NULL DEFAULT true,
  config              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT office_lobbies_handle_format CHECK (handle ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$')
);

DROP INDEX IF EXISTS idx_office_lobbies_handle;
CREATE UNIQUE INDEX IF NOT EXISTS idx_office_lobbies_handle
  ON office_lobbies(lower(handle))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_office_lobbies_office
  ON office_lobbies(office_id, is_active, created_at DESC);

CREATE OR REPLACE FUNCTION update_office_lobbies_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_office_lobbies_updated_at ON office_lobbies;
CREATE TRIGGER update_office_lobbies_updated_at
  BEFORE UPDATE ON office_lobbies
  FOR EACH ROW
  EXECUTE FUNCTION update_office_lobbies_updated_at();
