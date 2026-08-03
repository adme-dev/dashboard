-- Mobile PageSpeed evidence. Stores normalized lab/field metrics, never raw provider payloads.

BEGIN;

CREATE TABLE IF NOT EXISTS search_authority_performance_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL,
  page_id UUID NOT NULL,
  page_url TEXT NOT NULL CHECK (char_length(page_url) BETWEEN 1 AND 4096),
  strategy TEXT NOT NULL DEFAULT 'mobile' CHECK (strategy IN ('mobile')),
  status TEXT NOT NULL CHECK (status IN ('available', 'partial', 'unavailable')),
  reason_code TEXT CHECK (reason_code IS NULL OR char_length(reason_code) <= 120),
  provider_at TIMESTAMPTZ,
  provider_version TEXT CHECK (provider_version IS NULL OR char_length(provider_version) <= 120),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, domain_id)
    REFERENCES site_intelligence_domains(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, page_id)
    REFERENCES site_intelligence_pages(client_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(evidence) = 'object'),
  CHECK (octet_length(evidence::text) <= 16384)
);

CREATE INDEX IF NOT EXISTS idx_search_authority_performance_latest
  ON search_authority_performance_evidence (client_id, page_id, collected_at DESC);

COMMIT;
