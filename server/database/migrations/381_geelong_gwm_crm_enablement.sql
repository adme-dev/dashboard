-- 381_geelong_gwm_crm_enablement.sql
-- Enable the internal XeroFlow CRM for the exact active Xero-linked Geelong
-- GWM Haval client so governed inbound CRM email routes are available.

BEGIN;

DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE agency_clients
     SET lead_capture_mode = 'full_crm',
         updated_at = NOW()
   WHERE id = 'ef849136-7368-4650-bf89-853cbfa6a24a'::uuid
     AND name = 'Geelong GWM Haval'
     AND xero_contact_id = '23c8c676-9e99-46d4-b66c-a4a9c87996da'
     AND is_active = true
     AND lead_capture_mode IN ('capture_only', 'full_crm');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Exact active Xero client Geelong GWM Haval is unavailable or changed';
  END IF;

  INSERT INTO client_feature_entitlements (
    client_id, feature_key, status, source, limits, starts_at, expires_at
  ) VALUES
    (
      'ef849136-7368-4650-bf89-853cbfa6a24a'::uuid,
      'crm.core', 'active', 'agency', '{}'::jsonb, NOW(), NULL
    ),
    (
      'ef849136-7368-4650-bf89-853cbfa6a24a'::uuid,
      'crm.external', 'suspended', 'agency', '{}'::jsonb, NOW(), NULL
    )
  ON CONFLICT (client_id, feature_key)
  DO UPDATE SET
    status = EXCLUDED.status,
    expires_at = NULL,
    updated_at = NOW();

  IF NOT EXISTS (
    SELECT 1
      FROM agency_clients client
      JOIN client_feature_entitlements core
        ON core.client_id = client.id
       AND core.feature_key = 'crm.core'
       AND core.status = 'active'
      JOIN client_feature_entitlements external
        ON external.client_id = client.id
       AND external.feature_key = 'crm.external'
       AND external.status = 'suspended'
     WHERE client.id = 'ef849136-7368-4650-bf89-853cbfa6a24a'::uuid
       AND client.lead_capture_mode = 'full_crm'
  ) THEN
    RAISE EXCEPTION 'Geelong GWM Haval CRM enablement did not persist exactly';
  END IF;
END $$;

COMMIT;
