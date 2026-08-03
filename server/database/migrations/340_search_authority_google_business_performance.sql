-- Optional Google Business Profile Performance API evidence for Search Authority.
-- Stores normalized dated facts and bounded sync state only; provider payloads and
-- OAuth credentials are intentionally excluded.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_accounts_client_id
  ON social_accounts (client_id, id);

CREATE TABLE IF NOT EXISTS search_authority_google_business_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL CHECK (location_id ~ '^[0-9]{1,40}$'),
  metric_name TEXT NOT NULL CHECK (
    metric_name IN (
      'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
      'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
      'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
      'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
      'BUSINESS_CONVERSATIONS',
      'BUSINESS_DIRECTION_REQUESTS',
      'CALL_CLICKS',
      'WEBSITE_CLICKS',
      'BUSINESS_BOOKINGS',
      'BUSINESS_FOOD_ORDERS',
      'BUSINESS_FOOD_MENU_CLICKS'
    )
  ),
  metric_date DATE NOT NULL,
  metric_value BIGINT NOT NULL CHECK (metric_value >= 0),
  provider_fetched_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (social_account_id, metric_name, metric_date),
  CONSTRAINT search_authority_gbp_metrics_client_account_fk
  FOREIGN KEY (client_id, social_account_id)
    REFERENCES social_accounts(client_id, id) ON DELETE CASCADE
);

DO $$ BEGIN
  ALTER TABLE search_authority_google_business_metrics
    ADD CONSTRAINT search_authority_gbp_metrics_client_account_fk
    FOREIGN KEY (client_id, social_account_id)
    REFERENCES social_accounts(client_id, id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_search_authority_gbp_metrics_client_date
  ON search_authority_google_business_metrics (client_id, metric_date DESC, metric_name);

CREATE TABLE IF NOT EXISTS search_authority_google_business_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  requested_start_date DATE NOT NULL,
  requested_end_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'partial', 'failed')),
  reason_code TEXT CHECK (reason_code IS NULL OR char_length(reason_code) <= 80),
  rows_upserted INTEGER NOT NULL DEFAULT 0 CHECK (rows_upserted >= 0),
  provider_fetched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requested_end_date >= requested_start_date),
  CONSTRAINT search_authority_gbp_sync_client_account_fk
  FOREIGN KEY (client_id, social_account_id)
    REFERENCES social_accounts(client_id, id) ON DELETE CASCADE
);

DO $$ BEGIN
  ALTER TABLE search_authority_google_business_sync_runs
    ADD CONSTRAINT search_authority_gbp_sync_client_account_fk
    FOREIGN KEY (client_id, social_account_id)
    REFERENCES social_accounts(client_id, id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_search_authority_gbp_sync_client
  ON search_authority_google_business_sync_runs (client_id, completed_at DESC);

COMMIT;
