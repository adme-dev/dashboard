-- 373_google_pmax_client_catalog_governance.sql
-- Convert the already-encrypted Northern Isuzu and Brighton GWM Supabase
-- sources from legacy broad selections to exact, fail-closed campaign scopes.

BEGIN;

DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE crm_catalog_sources
     SET field_mapping = COALESCE(field_mapping, '{}'::jsonb) || '{
           "source_product_id": "id",
           "stock_id": "stock_number",
           "vin": "vin",
           "name": "title",
           "availability": "sale_status",
           "price": "dap_price",
           "product_url": "product_url",
           "primary_image_url": "main_photo_url",
           "source_updated_at": "last_modified_utc",
           "seller_id": "seller_id",
           "sale_status": "sale_status",
           "listing_type": "listing_type",
           "make": "make",
           "model": "model",
           "color": "exterior_colour_generic",
           "merchant_offer_id": "merchant_offer_id"
         }'::jsonb,
         connection_config = connection_config || '{
           "selection": {
             "seller_ids": ["a3429b2d-6cc2-42d3-9d05-7e08e4e9cbe4"],
             "sale_statuses": ["For Sale"],
             "makes": ["Isuzu"],
             "listing_types": ["New"],
             "required_fields": ["source_product_id", "stock_id", "vin", "name", "price", "product_url", "primary_image_url", "color", "merchant_offer_id"],
             "color_overrides": {"B4298": "Red", "35159S": "White", "B4672X": "Beige"},
             "product_url_template": "https://www.northernisuzuute.com.au/vehicle-for-sale/{stock_id}/{name_slug}?store=Northernisuzu"
           }
         }'::jsonb,
         updated_at = NOW()
   WHERE id = 'b3d20525-d09b-4847-b29c-5ea16419b9d1'::uuid
     AND client_id = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid
     AND source_type = 'supabase'
     AND connection_config #>> '{merchant,account_id}' = '5507471616'
     AND connection_config #>> '{merchant,data_source}' = 'accounts/5507471616/dataSources/10705683272'
     AND EXISTS (
       SELECT 1
         FROM crm_catalog_source_credentials credential
        WHERE credential.catalog_source_id = crm_catalog_sources.id
          AND credential.client_id = crm_catalog_sources.client_id
          AND credential.credential_type = 'supabase_api_key'
     );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Northern Isuzu governed Supabase source identity did not match exactly';
  END IF;

  UPDATE crm_catalog_sources
     SET field_mapping = COALESCE(field_mapping, '{}'::jsonb) || '{
           "source_product_id": "id",
           "stock_id": "stock_number",
           "vin": "vin",
           "name": "title",
           "availability": "sale_status",
           "price": "dap_price",
           "product_url": "product_url",
           "primary_image_url": "main_photo_url",
           "source_updated_at": "last_modified_utc",
           "seller_id": "seller_id",
           "sale_status": "sale_status",
           "listing_type": "listing_type",
           "make": "make",
           "model": "model",
           "color": "exterior_colour_name",
           "merchant_offer_id": "merchant_offer_id"
         }'::jsonb,
         connection_config = connection_config || '{
           "selection": {
             "seller_ids": ["fc5ee6c1-c5cb-381a-16c6-2aa5f5bf8a3e"],
             "sale_statuses": ["For Sale"],
             "makes": ["GWM"],
             "listing_types": ["New", "Demo"],
             "required_fields": ["source_product_id", "stock_id", "vin", "name", "price", "product_url", "primary_image_url", "color", "merchant_offer_id"],
             "product_url_template": "https://www.brightongwm.com.au/vehicle-for-sale/{stock_id}/{name_slug}?store=BrightonGWM"
           }
         }'::jsonb,
         updated_at = NOW()
   WHERE id = '95ab9bc4-119d-4671-abe4-0d7240f9eb52'::uuid
     AND client_id = '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid
     AND source_type = 'supabase'
     AND connection_config #>> '{merchant,account_id}' = '5817965641'
     AND connection_config #>> '{merchant,data_source}' = 'accounts/5817965641/dataSources/10705708313'
     AND EXISTS (
       SELECT 1
         FROM crm_catalog_source_credentials credential
        WHERE credential.catalog_source_id = crm_catalog_sources.id
          AND credential.client_id = crm_catalog_sources.client_id
          AND credential.credential_type = 'supabase_api_key'
     );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Brighton GWM governed Supabase source identity did not match exactly';
  END IF;

  UPDATE social_connections
     SET client_id = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid,
         updated_at = NOW()
   WHERE id = '06101987-52f5-4556-a93e-d27c5cb67fe3'::uuid
     AND platform = 'google'
     AND account_id = '9962002158'
     AND status = 'active'
     AND (client_id IS NULL OR client_id = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'::uuid);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Northern Isuzu Google Ads connection identity did not match exactly';
  END IF;

  UPDATE social_connections
     SET client_id = '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid,
         updated_at = NOW()
   WHERE id = '090a3555-2018-4cbe-b16e-74798e45b5ec'::uuid
     AND platform = 'google'
     AND account_id = '3437087580'
     AND status = 'active'
     AND (client_id IS NULL OR client_id = '6e072410-8893-4ef8-a38c-3bb655e0eaa0'::uuid);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Brighton GWM Google Ads connection identity did not match exactly';
  END IF;
END;
$$;

COMMIT;
