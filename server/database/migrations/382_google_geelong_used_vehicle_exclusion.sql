-- 382_google_geelong_used_vehicle_exclusion.sql
-- Correct the exact Geelong GWM Haval Used catalogue exclusion. The working
-- feed supplied stock numbers, while XeroFlow's governed source identity is the
-- Supabase vehicle UUID. Stock 217401 now has complete imagery and stays live;
-- only stock 217394 remains excluded because its source record has no image.

BEGIN;

DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE crm_catalog_sources
     SET connection_config = jsonb_set(
           connection_config,
           '{selection,excluded_source_product_ids}',
           '["ce6bbb63-3595-4682-8423-443b18bdd114"]'::jsonb,
           false
         ),
         last_sync_error = CASE
           WHEN last_sync_error IN (
             'Excluded products with incomplete required fields: primary_image_url (1)',
             'Excluded products with incomplete required fields: primary_image_url (2)'
           ) THEN NULL
           ELSE last_sync_error
         END,
         updated_at = NOW()
   WHERE id = '56c22734-f966-4f60-bfac-14545016eb11'::uuid
     AND client_id = 'ef849136-7368-4650-bf89-853cbfa6a24a'::uuid
     AND source_key = 'google-merchant-api-used'
     AND source_type = 'supabase'
     AND feed_url = 'https://tsheefvkecaervnrxvdf.supabase.co'
     AND field_mapping @> '{"source_product_id": "id", "stock_id": "stock_number"}'::jsonb
     AND connection_config #>> '{schema}' = 'public'
     AND connection_config #>> '{table}' = 'vehicles'
     AND connection_config #>> '{selection,seller_ids,0}' = 'd00498d9-f077-780f-5be5-8d0956ce0458'
     AND connection_config #>> '{selection,listing_types,0}' = 'Used';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Exact Geelong GWM Haval Used source is unavailable or changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM crm_catalog_sources
     WHERE id = '56c22734-f966-4f60-bfac-14545016eb11'::uuid
       AND connection_config #> '{selection,excluded_source_product_ids}'
         = '["ce6bbb63-3595-4682-8423-443b18bdd114"]'::jsonb
       AND last_sync_error IS NULL
  ) THEN
    RAISE EXCEPTION 'Geelong GWM Haval Used exclusion correction did not persist exactly';
  END IF;
END $$;

COMMIT;
