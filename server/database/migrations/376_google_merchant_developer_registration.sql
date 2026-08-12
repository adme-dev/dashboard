-- 376_google_merchant_developer_registration.sql
-- Govern the one-time Merchant API Cloud project registration contact in database configuration.

BEGIN;

DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE crm_catalog_sources
     SET connection_config = jsonb_set(
           connection_config,
           '{merchant,developer_email}',
           to_jsonb('advertising@adme.net.au'::text),
           true
         ),
         updated_at = NOW()
   WHERE id = 'b3d20525-d09b-4847-b29c-5ea16419b9d1'::uuid
     AND client_id = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid
     AND connection_config #>> '{merchant,account_id}' = '5507471616';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Northern Isuzu Merchant developer identity did not match exactly';
  END IF;

  UPDATE crm_catalog_sources
     SET connection_config = jsonb_set(
           connection_config,
           '{merchant,developer_email}',
           to_jsonb('advertising@adme.net.au'::text),
           true
         ),
         updated_at = NOW()
   WHERE id = '95ab9bc4-119d-4671-abe4-0d7240f9eb52'::uuid
     AND client_id = '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid
     AND connection_config #>> '{merchant,account_id}' = '5817965641';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Brighton GWM Merchant developer identity did not match exactly';
  END IF;
END;
$$;

COMMIT;
