-- 385_google_brighton_merchant_credential_binding.sql
-- Bind Brighton's already-synced governed inventory source to the exact agency
-- Merchant OAuth profile after provider readback confirmed account 5817965641.

BEGIN;

DO $$
DECLARE
  v_profile_updated INTEGER;
  v_source_updated INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM agency_clients
     WHERE id = '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid
       AND name = 'Brighton Auto Group'
       AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Exact active Brighton Auto Group client is unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM social_connections
     WHERE id = '090a3555-2018-4cbe-b16e-74798e45b5ec'::uuid
       AND client_id = '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid
       AND platform = 'google'
       AND account_id = '3437087580'
       AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Exact active Brighton GWM Google Ads connection is unavailable';
  END IF;

  UPDATE google_credential_profiles
     SET metadata = jsonb_set(
           metadata,
           '{merchantCenterIds}',
           CASE
             WHEN metadata->'merchantCenterIds' ? '5817965641'
               THEN metadata->'merchantCenterIds'
             ELSE metadata->'merchantCenterIds' || '["5817965641"]'::jsonb
           END,
           true
         ),
         updated_at = NOW()
   WHERE id = '906883f9-8cf3-4cfa-a98e-a044b703bf8c'::uuid
     AND status = 'active'
     AND metadata->>'purpose' = 'merchant'
     AND metadata->>'merchantParentId' = '551257489'
     AND metadata->>'googleAccountEmail' = 'advertising@adme.net.au'
     AND jsonb_typeof(metadata->'merchantCenterIds') = 'array'
     AND metadata->'merchantCenterIds' ? '5507471616'
     AND metadata->'merchantCenterIds' ? '5727572526'
     AND 'https://www.googleapis.com/auth/content' = ANY(scopes);
  GET DIAGNOSTICS v_profile_updated = ROW_COUNT;
  IF v_profile_updated <> 1 THEN
    RAISE EXCEPTION 'Exact agency Merchant credential profile is unavailable or changed';
  END IF;

  UPDATE crm_catalog_sources
     SET connection_config = jsonb_set(
           jsonb_set(
             connection_config,
             '{merchant,credential_profile_id}',
             to_jsonb('906883f9-8cf3-4cfa-a98e-a044b703bf8c'::text),
             true
           ),
           '{merchant,registration_account_id}',
           to_jsonb('551257489'::text),
           true
         ),
         updated_at = NOW()
   WHERE id = '95ab9bc4-119d-4671-abe4-0d7240f9eb52'::uuid
     AND client_id = '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid
     AND source_key = 'supabase-brighton-gwm'
     AND source_type = 'supabase'
     AND status = 'active'
     AND last_sync_status = 'succeeded'
     AND last_item_count IN (312, 313)
     AND connection_config #>> '{merchant,tenant_id}' = 'b4a0a130-48da-444b-8fdc-d91db8923318'
     AND connection_config #>> '{merchant,ads_connection_id}' = '090a3555-2018-4cbe-b16e-74798e45b5ec'
     AND connection_config #>> '{merchant,ads_customer_id}' = '3437087580'
     AND connection_config #>> '{merchant,account_id}' = '5817965641'
     AND (
       connection_config #>> '{merchant,data_source}' = 'accounts/5817965641/dataSources/10705708313'
       OR (
         connection_config #>> '{merchant,data_source}' = 'accounts/5817965641/dataSources/10707976745'
         AND connection_config #>> '{merchant,legacy_data_source}' = 'accounts/5817965641/dataSources/10705708313'
         AND connection_config #>> '{merchant,api_source_display_name}' = 'XeroFlow Vehicle Inventory · Brighton GWM'
       )
     )
     AND connection_config #>> '{merchant,developer_email}' = 'advertising@adme.net.au'
     AND connection_config #>> '{merchant,auto_publish}' = 'true';
  GET DIAGNOSTICS v_source_updated = ROW_COUNT;
  IF v_source_updated <> 1 THEN
    RAISE EXCEPTION 'Exact governed Brighton GWM catalogue source is unavailable or changed';
  END IF;
END;
$$;

COMMIT;
