-- 380_google_geelong_new_vehicle_price_guard.sql
-- Keep the exact Xero-sourced Geelong GWM Haval New/Demo catalogue on its
-- working FILE source until the upstream inventory explicitly supplies an
-- Australian-compliant drive-away or estimated drive-away price.

BEGIN;

DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM agency_clients
     WHERE id = 'ef849136-7368-4650-bf89-853cbfa6a24a'::uuid
       AND name = 'Geelong GWM Haval'
       AND xero_contact_id = '23c8c676-9e99-46d4-b66c-a4a9c87996da'
       AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Exact active Xero client Geelong GWM Haval is unavailable';
  END IF;

  UPDATE crm_catalog_sources
     SET connection_config = jsonb_set(
       jsonb_set(
         jsonb_set(
           connection_config,
           '{merchant,data_source}',
           to_jsonb('accounts/5727572526/dataSources/10615475689'::text),
           true
         ),
         '{merchant,auto_publish}',
         'false'::jsonb,
         true
       ),
       '{merchant,api_cutover_blocker}',
       to_jsonb('NEW_VEHICLE_DRIVE_AWAY_PRICE_REQUIRED'::text),
       true
     ),
     updated_at = NOW()
   WHERE id = 'da931735-9784-44fc-9a2a-d64738925fa4'::uuid
     AND client_id = 'ef849136-7368-4650-bf89-853cbfa6a24a'::uuid
     AND source_key = 'google-merchant-api-new-demo'
     AND connection_config #>> '{merchant,legacy_data_source}'
       = 'accounts/5727572526/dataSources/10615475689'
     AND connection_config #>> '{merchant,data_source}' IN (
       'accounts/5727572526/dataSources/10615475689',
       'accounts/5727572526/dataSources/10707765487'
     );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Exact Geelong GWM Haval New/Demo source is unavailable or changed';
  END IF;
END $$;

COMMIT;
