-- 378_supabase_vehicle_catalog_default_currency.sql
-- Govern the currency for Australian Supabase vehicle sources that do not expose
-- an ISO currency column. Currency is applied before required-field validation.

BEGIN;

DO $$
DECLARE
  v_source RECORD;
  v_updated INTEGER;
BEGIN
  FOR v_source IN
    SELECT *
      FROM (VALUES
        (
          'b3d20525-d09b-4847-b29c-5ea16419b9d1'::uuid,
          'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid,
          '5507471616'::text
        ),
        (
          '95ab9bc4-119d-4671-abe4-0d7240f9eb52'::uuid,
          '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid,
          '5817965641'::text
        )
      ) AS configured(source_id, client_id, merchant_account_id)
  LOOP
    UPDATE crm_catalog_sources
       SET connection_config = jsonb_set(
             jsonb_set(
               connection_config,
               '{selection,default_currency}',
               '"AUD"'::jsonb,
               true
             ),
             '{selection,required_fields}',
             CASE
               WHEN connection_config #> '{selection,required_fields}' @> '["currency"]'::jsonb
                 THEN connection_config #> '{selection,required_fields}'
               ELSE (connection_config #> '{selection,required_fields}') || '["currency"]'::jsonb
             END,
             true
           ),
           updated_at = NOW()
     WHERE id = v_source.source_id
       AND client_id = v_source.client_id
       AND source_type = 'supabase'
       AND status = 'active'
       AND connection_config #>> '{merchant,account_id}' = v_source.merchant_account_id
       AND connection_config #> '{selection,sale_statuses}' @> '["For Sale"]'::jsonb
       AND jsonb_typeof(connection_config #> '{selection,required_fields}') = 'array';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'Australian vehicle source % did not match the guarded currency migration', v_source.source_id;
    END IF;
  END LOOP;
END $$;

COMMIT;
