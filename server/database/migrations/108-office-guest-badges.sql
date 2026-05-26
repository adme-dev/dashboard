-- Durable guest badges for approved lobby access.

CREATE TABLE IF NOT EXISTS office_guest_badges (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id        uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  lobby_request_id uuid UNIQUE REFERENCES office_lobby_requests(id) ON DELETE SET NULL,
  guest_name       text NOT NULL,
  guest_email      text NOT NULL,
  allowed_zone_id  uuid REFERENCES office_zones(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','revoked','expired')),
  expires_at       timestamptz NOT NULL,
  created_by       uuid REFERENCES team_members(id) ON DELETE SET NULL,
  revoked_by       uuid REFERENCES team_members(id) ON DELETE SET NULL,
  revoked_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_guest_badges_office_status
  ON office_guest_badges(office_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_office_guest_badges_email
  ON office_guest_badges(lower(guest_email), expires_at DESC);
