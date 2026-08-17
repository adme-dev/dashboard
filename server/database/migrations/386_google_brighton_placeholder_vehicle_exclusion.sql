-- 386_google_brighton_placeholder_vehicle_exclusion.sql
-- Google disapproved this exact Brighton record because its image is a
-- "PHOTOS COMING SOON" placeholder. Exclude only that source identity until
-- the upstream dealer inventory supplies a real vehicle image.

BEGIN;

DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE crm_catalog_sources source
     SET connection_config = jsonb_set(
           source.connection_config,
           '{selection,excluded_source_product_ids}',
           CASE
             WHEN COALESCE(
               source.connection_config #> '{selection,excluded_source_product_ids}',
               '[]'::jsonb
             ) @> '["0d55fdf9-f0a1-45a9-be43-55813c4a6fbc"]'::jsonb
               THEN source.connection_config #> '{selection,excluded_source_product_ids}'
             ELSE COALESCE(
               source.connection_config #> '{selection,excluded_source_product_ids}',
               '[]'::jsonb
             ) || '["0d55fdf9-f0a1-45a9-be43-55813c4a6fbc"]'::jsonb
           END,
           true
         ),
         updated_at = NOW()
   WHERE source.id = '95ab9bc4-119d-4671-abe4-0d7240f9eb52'::uuid
     AND source.client_id = '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid
     AND source.source_key = 'supabase-brighton-gwm'
     AND source.status = 'active'
     AND source.connection_config #>> '{merchant,account_id}' = '5817965641'
     AND EXISTS (
       SELECT 1
         FROM crm_products product
        WHERE product.client_id = source.client_id
          AND product.catalog_source_id = source.id
          AND product.source_product_id = '0d55fdf9-f0a1-45a9-be43-55813c4a6fbc'
          AND product.attributes->>'merchant_offer_id' = 'XF-H987447'
          AND product.primary_image_url = 'https://carsales.pxcrush.net/cars/dealer/99w6bokrqq6zrq38mjvb20bdf.jpg'
     );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Exact Brighton placeholder-image vehicle or governed source is unavailable or changed';
  END IF;
END;
$$;

COMMIT;
