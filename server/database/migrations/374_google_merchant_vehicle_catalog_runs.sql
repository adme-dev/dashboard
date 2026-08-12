-- 374_google_merchant_vehicle_catalog_runs.sql
-- Durable, replayable Merchant API publication evidence for governed vehicle inventory.

BEGIN;

CREATE TABLE IF NOT EXISTS google_merchant_catalog_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  catalog_source_id UUID NOT NULL REFERENCES crm_catalog_sources(id) ON DELETE RESTRICT,
  merchant_account_id TEXT NOT NULL CHECK (merchant_account_id ~ '^[0-9]+$'),
  merchant_data_source TEXT NOT NULL CHECK (
    merchant_data_source ~ '^accounts/[0-9]+/dataSources/[0-9]+$'
  ),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (
    status IN ('PLANNED', 'APPLYING', 'SUCCEEDED', 'FAILED')
  ),
  source_item_count INTEGER NOT NULL DEFAULT 0 CHECK (source_item_count >= 0),
  publish_item_count INTEGER NOT NULL DEFAULT 0 CHECK (publish_item_count >= 0),
  delete_item_count INTEGER NOT NULL DEFAULT 0 CHECK (delete_item_count >= 0),
  excluded_item_count INTEGER NOT NULL DEFAULT 0 CHECK (excluded_item_count >= 0),
  succeeded_item_count INTEGER NOT NULL DEFAULT 0 CHECK (succeeded_item_count >= 0),
  failed_item_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_item_count >= 0),
  exclusion_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_google_merchant_catalog_runs_one_active
  ON google_merchant_catalog_runs (catalog_source_id)
  WHERE status IN ('PLANNED', 'APPLYING');

CREATE INDEX IF NOT EXISTS idx_google_merchant_catalog_runs_client_started
  ON google_merchant_catalog_runs (client_id, started_at DESC);

CREATE TABLE IF NOT EXISTS google_merchant_product_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  catalog_source_id UUID NOT NULL REFERENCES crm_catalog_sources(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES crm_products(id) ON DELETE RESTRICT,
  merchant_account_id TEXT NOT NULL CHECK (merchant_account_id ~ '^[0-9]+$'),
  merchant_data_source TEXT NOT NULL CHECK (
    merchant_data_source ~ '^accounts/[0-9]+/dataSources/[0-9]+$'
  ),
  offer_id TEXT NOT NULL,
  product_input_name TEXT,
  processed_product_name TEXT,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  state TEXT NOT NULL CHECK (
    state IN ('SUBMITTED', 'PROCESSED', 'DISAPPROVED', 'DELETED', 'FAILED')
  ),
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_error_code TEXT,
  last_submitted_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (catalog_source_id, product_id, merchant_data_source),
  UNIQUE (catalog_source_id, offer_id, merchant_data_source)
);

CREATE INDEX IF NOT EXISTS idx_google_merchant_publications_active
  ON google_merchant_product_publications (catalog_source_id, merchant_data_source, state);

CREATE TABLE IF NOT EXISTS google_merchant_catalog_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES google_merchant_catalog_runs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES crm_products(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('PUBLISH', 'DELETE')),
  offer_id TEXT NOT NULL,
  product_input JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  request_id TEXT,
  product_input_name TEXT,
  processed_product_name TEXT,
  error_code TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, product_id, action)
);

CREATE INDEX IF NOT EXISTS idx_google_merchant_run_items_pending
  ON google_merchant_catalog_run_items (run_id, status, created_at);

DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE crm_catalog_sources
     SET connection_config = jsonb_set(
         connection_config,
         '{merchant}',
         COALESCE(connection_config->'merchant', '{}'::jsonb) || jsonb_build_object(
           'tenant_id', 'b4a0a130-48da-444b-8fdc-d91db8923318',
           'ads_connection_id', '06101987-52f5-4556-a93e-d27c5cb67fe3',
           'ads_customer_id', '9962002158',
           'content_language', 'en',
           'auto_publish', true,
           'api_source_display_name', 'XeroFlow Vehicle Inventory · Northern Isuzu',
           'legacy_data_source', COALESCE(
             connection_config #>> '{merchant,legacy_data_source}',
             connection_config #>> '{merchant,data_source}'
           )
         ),
         true
         ),
         updated_at = NOW()
   WHERE id = 'b3d20525-d09b-4847-b29c-5ea16419b9d1'::uuid
     AND client_id = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid
     AND connection_config #>> '{merchant,account_id}' = '5507471616';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Northern Isuzu Merchant publication identity did not match exactly';
  END IF;

  UPDATE crm_catalog_sources
     SET connection_config = jsonb_set(
         connection_config,
         '{merchant}',
         COALESCE(connection_config->'merchant', '{}'::jsonb) || jsonb_build_object(
           'tenant_id', 'b4a0a130-48da-444b-8fdc-d91db8923318',
           'ads_connection_id', '090a3555-2018-4cbe-b16e-74798e45b5ec',
           'ads_customer_id', '3437087580',
           'content_language', 'en',
           'auto_publish', true,
           'api_source_display_name', 'XeroFlow Vehicle Inventory · Brighton GWM',
           'legacy_data_source', COALESCE(
             connection_config #>> '{merchant,legacy_data_source}',
             connection_config #>> '{merchant,data_source}'
           )
         ),
         true
         ),
         updated_at = NOW()
   WHERE id = '95ab9bc4-119d-4671-abe4-0d7240f9eb52'::uuid
     AND client_id = '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid
     AND connection_config #>> '{merchant,account_id}' = '5817965641';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Brighton GWM Merchant publication identity did not match exactly';
  END IF;
END;
$$;

COMMIT;
