-- Governed nearby automotive market discovery persistence boundary.
-- Google display payloads, coordinates, URLs, types, distances, and raw responses stay transient.

BEGIN;

CREATE TABLE IF NOT EXISTS client_market_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
  address_text TEXT NOT NULL CHECK (char_length(address_text) BETWEEN 1 AND 500),
  google_place_id TEXT NOT NULL CHECK (char_length(google_place_id) BETWEEN 1 AND 500),
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS client_market_locations_one_primary
  ON client_market_locations (client_id)
  WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_client_market_locations_client_confirmed
  ON client_market_locations (client_id, confirmed_at DESC);

CREATE TABLE IF NOT EXISTS site_intelligence_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  market_location_id UUID NOT NULL,
  google_place_id TEXT NOT NULL CHECK (char_length(google_place_id) BETWEEN 1 AND 500),
  state TEXT NOT NULL DEFAULT 'saved'
    CHECK (state IN ('saved', 'nominated', 'approved', 'dismissed')),
  source TEXT NOT NULL DEFAULT 'agency'
    CHECK (source IN ('agency', 'client_portal')),
  approved_domain_id UUID,
  radius_km_at_decision INTEGER NOT NULL
    CHECK (radius_km_at_decision IN (10, 25, 50)),
  nomination_reason TEXT CHECK (
    nomination_reason IS NULL OR char_length(nomination_reason) BETWEEN 1 AND 1000
  ),
  nominated_at TIMESTAMPTZ,
  nominated_by_client_user_id UUID REFERENCES client_users(id) ON DELETE SET NULL,
  agency_review_reason TEXT CHECK (
    agency_review_reason IS NULL OR char_length(agency_review_reason) BETWEEN 1 AND 1000
  ),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  UNIQUE (client_id, market_location_id, google_place_id),
  FOREIGN KEY (client_id, market_location_id)
    REFERENCES client_market_locations(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, approved_domain_id)
    REFERENCES site_intelligence_domains(client_id, id) ON DELETE SET NULL (approved_domain_id)
);

CREATE INDEX IF NOT EXISTS idx_site_intelligence_candidates_client_state
  ON site_intelligence_candidates (client_id, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_intelligence_candidates_review_age
  ON site_intelligence_candidates (client_id, nominated_at ASC)
  WHERE state = 'nominated';

ALTER TABLE site_intelligence_candidates
  DROP CONSTRAINT IF EXISTS site_intelligence_candidates_client_id_approved_domain_id_fkey;
ALTER TABLE site_intelligence_candidates
  ADD CONSTRAINT site_intelligence_candidates_client_id_approved_domain_id_fkey
  FOREIGN KEY (client_id, approved_domain_id)
  REFERENCES site_intelligence_domains(client_id, id) ON DELETE SET NULL (approved_domain_id);

ALTER TABLE client_users
  ADD COLUMN IF NOT EXISTS can_nominate_competitors BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE site_intelligence_audit_events
  ADD COLUMN IF NOT EXISTS client_actor_id UUID REFERENCES client_users(id) ON DELETE SET NULL;

ALTER TABLE site_intelligence_audit_events
  DROP CONSTRAINT IF EXISTS site_intelligence_audit_events_actor_id_fkey;
ALTER TABLE site_intelligence_audit_events
  ADD CONSTRAINT site_intelligence_audit_events_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES team_members(id) ON DELETE SET NULL;

ALTER TABLE site_intelligence_audit_events
  DROP CONSTRAINT IF EXISTS site_intelligence_audit_events_entity_type_check;
ALTER TABLE site_intelligence_audit_events
  ADD CONSTRAINT site_intelligence_audit_events_entity_type_check
  CHECK (entity_type IN ('domain', 'run', 'change', 'insight', 'market_location', 'candidate'));

ALTER TABLE site_intelligence_audit_events
  DROP CONSTRAINT IF EXISTS site_intelligence_audit_events_one_actor_check;
ALTER TABLE site_intelligence_audit_events
  ADD CONSTRAINT site_intelligence_audit_events_one_actor_check
  CHECK (NOT (actor_id IS NOT NULL AND client_actor_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_site_intelligence_audit_client_actor
  ON site_intelligence_audit_events (client_id, client_actor_id, created_at DESC)
  WHERE client_actor_id IS NOT NULL;

COMMIT;
