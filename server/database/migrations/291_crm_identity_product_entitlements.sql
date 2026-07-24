-- CRM foundation: feature entitlements, privacy-preserving 360 identity,
-- generic product catalog, and immutable inquiry-time product snapshots.
-- All objects are additive. Lead capture remains available independently of CRM access.

CREATE TABLE IF NOT EXISTS client_feature_entitlements (
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('trial', 'active', 'grace', 'capped', 'overdue', 'suspended', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'agency',
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, feature_key)
);

INSERT INTO client_feature_entitlements (client_id, feature_key, status, source)
SELECT id, 'crm.core', 'active', 'legacy_mode'
FROM agency_clients
WHERE lead_capture_mode IN ('lightweight_crm', 'full_crm')
ON CONFLICT (client_id, feature_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS crm_identity_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id)
);

CREATE TABLE IF NOT EXISTS crm_identity_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  identity_type TEXT NOT NULL CHECK (identity_type IN ('email', 'phone', 'provider', 'browser')),
  identity_hash TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_identity_profiles(client_id, id) ON DELETE CASCADE,
  UNIQUE (client_id, identity_type, identity_hash)
);

CREATE INDEX IF NOT EXISTS idx_crm_identity_keys_profile
  ON crm_identity_keys (client_id, profile_id);

CREATE TABLE IF NOT EXISTS crm_lead_identity_links (
  lead_id UUID PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  match_method TEXT NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_identity_profiles(client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_identity_profile
  ON crm_lead_identity_links (client_id, profile_id, linked_at DESC);

CREATE TABLE IF NOT EXISTS crm_catalog_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'api',
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'error', 'disconnected')),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, source_key),
  UNIQUE (client_id, id)
);

CREATE TABLE IF NOT EXISTS crm_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  catalog_source_id UUID NOT NULL,
  source_product_id TEXT NOT NULL,
  sku TEXT,
  stock_id TEXT,
  name TEXT NOT NULL,
  product_type TEXT NOT NULL DEFAULT 'generic',
  availability TEXT NOT NULL DEFAULT 'unknown'
    CHECK (availability IN ('available', 'reserved', 'sold', 'removed', 'unknown')),
  price NUMERIC(14,2),
  currency CHAR(3),
  product_url TEXT,
  primary_image_url TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (client_id, catalog_source_id)
    REFERENCES crm_catalog_sources(client_id, id) ON DELETE CASCADE,
  UNIQUE (client_id, catalog_source_id, source_product_id),
  UNIQUE (client_id, id)
);

CREATE INDEX IF NOT EXISTS idx_crm_products_client_availability
  ON crm_products (client_id, availability, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_product_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  catalog_source_id UUID NOT NULL,
  product_id UUID NOT NULL,
  identifier_type TEXT NOT NULL
    CHECK (identifier_type IN ('vin', 'stock_id', 'sku', 'source_product_id', 'product_url')),
  normalized_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, catalog_source_id)
    REFERENCES crm_catalog_sources(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, product_id)
    REFERENCES crm_products(client_id, id) ON DELETE CASCADE,
  UNIQUE (client_id, catalog_source_id, identifier_type, normalized_value)
);

CREATE INDEX IF NOT EXISTS idx_crm_product_identifier_lookup
  ON crm_product_identifiers (client_id, identifier_type, normalized_value);

CREATE TABLE IF NOT EXISTS crm_lead_product_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  product_id UUID,
  interest_key TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  match_method TEXT NOT NULL,
  match_confidence INTEGER NOT NULL DEFAULT 0 CHECK (match_confidence BETWEEN 0 AND 100),
  inquiry_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, product_id)
    REFERENCES crm_products(client_id, id) ON DELETE RESTRICT,
  UNIQUE (lead_id, interest_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_product_interests_product
  ON crm_lead_product_interests (client_id, product_id, created_at DESC);

COMMENT ON TABLE crm_identity_profiles IS
  'Client-scoped privacy-preserving 360 identities linked by HMAC fingerprints; raw PII is not stored here.';
COMMENT ON TABLE crm_lead_product_interests IS
  'Immutable inquiry-time product context. Current product availability must be read from crm_products, never inferred from this snapshot.';
