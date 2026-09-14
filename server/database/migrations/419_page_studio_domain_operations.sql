-- Durable initial attachment only. No live application or provider effects.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_domain_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  domain_id UUID NOT NULL UNIQUE,
  owner_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  zone_id TEXT CHECK (zone_id IS NULL OR zone_id ~ '^[a-fA-F0-9]{32}$'),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'creating', 'attached')),
  attempt_id UUID UNIQUE,
  create_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((state = 'reserved' AND attempt_id IS NULL AND create_started_at IS NULL)
    OR (state IN ('creating', 'attached') AND attempt_id IS NOT NULL AND create_started_at IS NOT NULL AND zone_id IS NOT NULL)),
  FOREIGN KEY (tenant_id, client_id, site_id, domain_id)
    REFERENCES page_studio_domains(tenant_id, client_id, site_id, id) ON DELETE RESTRICT
);
COMMIT;
