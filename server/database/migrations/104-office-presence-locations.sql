-- Persist live office location enough for assistant watches, admin views, and mobile summaries.

CREATE TABLE IF NOT EXISTS office_presence_locations (
  office_id    uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  actor_type   text NOT NULL CHECK (actor_type IN ('user','client')),
  actor_id     uuid NOT NULL,
  handle       text NOT NULL,
  zone_id      uuid REFERENCES office_zones(id) ON DELETE SET NULL,
  presence     text NOT NULL DEFAULT 'online' CHECK (presence IN ('online','offline')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (office_id, actor_type, actor_id)
);

CREATE INDEX IF NOT EXISTS idx_office_presence_locations_zone
  ON office_presence_locations(office_id, zone_id, presence, last_seen_at DESC)
  WHERE zone_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_office_presence_locations_actor
  ON office_presence_locations(actor_type, actor_id, last_seen_at DESC);
