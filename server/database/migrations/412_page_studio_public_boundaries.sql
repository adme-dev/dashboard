-- Page Studio public form and analytics boundary.
-- Additive and idempotent; existing release/version history remains immutable.
BEGIN;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check CHECK (
  source IN ('meta', 'google', 'manual', 'webhook', 'csv', 'email', 'qr', 'page_studio')
  OR source ~ '^future_[a-z][a-z0-9_]{0,23}$'
);

ALTER TABLE lead_form_rules DROP CONSTRAINT IF EXISTS lead_form_rules_source_check;
ALTER TABLE lead_form_rules ADD CONSTRAINT lead_form_rules_source_check CHECK (
  source IN ('meta', 'google', 'webhook', 'csv', 'email', 'qr', 'page_studio')
  OR source ~ '^future_[a-z][a-z0-9_]{0,23}$'
);

CREATE TABLE IF NOT EXISTS page_studio_analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  release_id UUID NOT NULL,
  version_digest CHAR(64) NOT NULL CHECK (version_digest ~ '^[a-f0-9]{64}$'),
  event_id TEXT NOT NULL CHECK (event_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  kind TEXT NOT NULL CHECK (kind IN ('conversion', 'page_view')),
  page_id TEXT NOT NULL CHECK (page_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  page_route TEXT NOT NULL CHECK (
    char_length(page_route) BETWEEN 1 AND 2048
    AND left(page_route, 1) = '/'
    AND left(page_route, 2) <> '//'
  ),
  occurred_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$'),
  delivery_status TEXT NOT NULL DEFAULT 'received' CHECK (delivery_status IN (
    'received', 'not_applicable', 'unmapped', 'profile_not_found',
    'canonical_created', 'canonical_duplicate'
  )),
  canonical_event_id UUID REFERENCES conversion_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, client_id, site_id, id),
  UNIQUE (tenant_id, client_id, site_id, idempotency_key),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, client_id, site_id, release_id)
    REFERENCES page_studio_releases(tenant_id, client_id, site_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_page_studio_analytics_scope_time
  ON page_studio_analytics_events (tenant_id, client_id, site_id, occurred_at DESC);

-- The maintained reference site is synthetic. This server-side flag contains
-- acceptance submissions before normal rules, CRM, notifications, or delivery.
UPDATE page_studio_sites
SET integrations = jsonb_set(COALESCE(integrations, '{}'::jsonb), '{synthetic}', 'true'::jsonb, TRUE),
    updated_at = NOW()
WHERE tenant_id = 'b4a0a130-48da-444b-8fdc-d91db8923318'
  AND client_id = '10000000-0000-4000-8000-000000000101'
  AND id = '10000000-0000-4000-8000-000000000104';

COMMIT;
