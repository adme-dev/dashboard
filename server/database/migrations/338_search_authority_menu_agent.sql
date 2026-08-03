-- Bounded, kill-switchable menu-link configuration for Search Authority.

BEGIN;

CREATE TABLE IF NOT EXISTS search_authority_menu_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  label TEXT NOT NULL DEFAULT 'Buying Guides'
    CHECK (char_length(label) BETWEEN 1 AND 60 AND label !~ '[<>]'),
  href TEXT NOT NULL CHECK (char_length(href) BETWEEN 10 AND 2048),
  desktop_selector TEXT NOT NULL CHECK (char_length(desktop_selector) BETWEEN 1 AND 200),
  mobile_selector TEXT NOT NULL CHECK (char_length(mobile_selector) BETWEEN 1 AND 200),
  insertion TEXT NOT NULL DEFAULT 'append'
    CHECK (insertion IN ('append', 'before-last')),
  last_observed_at TIMESTAMPTZ,
  updated_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, site_id),
  FOREIGN KEY (client_id, site_id)
    REFERENCES search_authority_sites(client_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS search_authority_site_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  actor_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 120),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, site_id)
    REFERENCES search_authority_sites(client_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(details) = 'object'),
  CHECK (octet_length(details::text) <= 8192)
);

CREATE INDEX IF NOT EXISTS idx_search_authority_site_audit
  ON search_authority_site_audit_events (client_id, site_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_search_authority_site_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Search Authority site audit events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_search_authority_site_audit_immutable
  ON search_authority_site_audit_events;
CREATE TRIGGER trg_search_authority_site_audit_immutable
  BEFORE UPDATE OR DELETE ON search_authority_site_audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_search_authority_site_audit_mutation();

COMMIT;
