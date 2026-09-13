BEGIN;

CREATE TABLE IF NOT EXISTS page_studio_setup_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  source TEXT NOT NULL CHECK (source IN ('template', 'chat')),
  brief TEXT CHECK (brief IS NULL OR char_length(brief) <= 4000),
  plan JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected')),
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, client_id, site_id, revision),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_page_studio_setup_proposals_site
  ON page_studio_setup_proposals (tenant_id, client_id, site_id, revision DESC);

COMMIT;
