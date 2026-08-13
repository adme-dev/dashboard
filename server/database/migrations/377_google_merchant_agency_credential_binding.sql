-- 377_google_merchant_agency_credential_binding.sql
-- Bind Northern's governed catalogue to the verified agency Merchant OAuth profile.

BEGIN;

DO $$
DECLARE
  v_updated INTEGER;
BEGIN
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
   WHERE id = 'b3d20525-d09b-4847-b29c-5ea16419b9d1'::uuid
     AND client_id = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid
     AND connection_config #>> '{merchant,account_id}' = '5507471616'
     AND EXISTS (
       SELECT 1
         FROM google_credential_profiles profile
        WHERE profile.id = '906883f9-8cf3-4cfa-a98e-a044b703bf8c'::uuid
          AND profile.status = 'active'
          AND profile.metadata->>'purpose' = 'merchant'
          AND profile.metadata->>'merchantParentId' = '551257489'
          AND profile.metadata->>'googleAccountEmail' = 'advertising@adme.net.au'
          AND profile.metadata->'merchantCenterIds' ? '5507471616'
          AND 'https://www.googleapis.com/auth/content' = ANY(profile.scopes)
     );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Northern Isuzu agency Merchant credential binding did not match exactly';
  END IF;
END;
$$;

COMMIT;
