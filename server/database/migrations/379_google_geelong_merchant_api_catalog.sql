-- 379_google_geelong_merchant_api_catalog.sql
-- Bind the exact Xero-sourced Geelong GWM Haval client to two governed
-- catalogue sources which preserve the working upstream selections while
-- moving Google delivery from FILE ingestion to Merchant API publication.

BEGIN;

DO $$
DECLARE
  v_source_id UUID;
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

  IF NOT EXISTS (
    SELECT 1
      FROM social_connections
     WHERE id = '87d6e44f-e6a0-47d1-9a32-27ade143b538'::uuid
       AND client_id = 'ef849136-7368-4650-bf89-853cbfa6a24a'::uuid
       AND platform = 'google'
       AND account_id = '7979828031'
       AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Exact Geelong GWM Haval Google Ads connection is unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM google_credential_profiles
     WHERE id = '906883f9-8cf3-4cfa-a98e-a044b703bf8c'::uuid
       AND status = 'active'
       AND metadata->>'purpose' = 'merchant'
       AND metadata->>'merchantParentId' = '551257489'
       AND metadata->>'googleAccountEmail' = 'advertising@adme.net.au'
       AND metadata->'merchantCenterIds' ? '5727572526'
       AND 'https://www.googleapis.com/auth/content' = ANY(scopes)
  ) THEN
    RAISE EXCEPTION 'Exact agency Merchant credential is unavailable for Geelong GWM Haval';
  END IF;

  INSERT INTO crm_catalog_sources (
    id, client_id, source_key, source_type, display_name, status,
    feed_url, feed_format, item_path, field_mapping, connection_config
  ) VALUES (
    'da931735-9784-44fc-9a2a-d64738925fa4'::uuid,
    'ef849136-7368-4650-bf89-853cbfa6a24a'::uuid,
    'google-merchant-api-new-demo',
    'feed',
    'Geelong GWM Haval · New & Demo · Merchant API',
    'active',
    'https://vehicle-inventory-system.adme-dev.workers.dev/api/feed/carsales?dealer_id=STORE08',
    'json',
    NULL,
    '{
      "source_product_id": "id",
      "stock_id": "stockid",
      "vin": "vin",
      "name": "title",
      "availability": "availability",
      "price": "price",
      "currency": "currency",
      "product_url": "product_url",
      "primary_image_url": "thumb",
      "listing_type": "condition.value",
      "make": "make.value",
      "model": "model.value",
      "color": "genericolour",
      "merchant_offer_id": "merchant_offer_id",
      "build_year": "year.value",
      "odometer_reading": "kms",
      "odometer_unit": "odometer_unit",
      "body_style": "body.value",
      "series": "series.value",
      "badge": "badge.value",
      "description": "Comments"
    }'::jsonb,
    '{
      "working_feed": {
        "id": "32dd5377-3c5c-46a5-9db6-7c97a9cce8d8",
        "source": {"type": "inventory_api", "dealerId": "STORE08"},
        "filters": {"condition": ["new", "demo"], "sellerIds": ["STORE08"], "onlyActive": true}
      },
      "governance": {
        "default_availability": "available",
        "default_sale_status": "For Sale",
        "default_currency": "AUD",
        "default_odometer_unit": "KM",
        "product_url_template": "https://geelonggwmhaval.com.au/vehicle-for-sale/{source_product_id}/{name_slug}?store=geelonggwm"
      },
      "selection": {"listing_types": ["New", "Demo"]},
      "merchant": {
        "tenant_id": "b4a0a130-48da-444b-8fdc-d91db8923318",
        "ads_connection_id": "87d6e44f-e6a0-47d1-9a32-27ade143b538",
        "ads_customer_id": "7979828031",
        "account_id": "5727572526",
        "data_source": "accounts/5727572526/dataSources/10615475689",
        "legacy_data_source": "accounts/5727572526/dataSources/10615475689",
        "api_source_display_name": "XeroFlow Vehicle Inventory · Geelong GWM Haval · New & Demo",
        "feed_label": "AU",
        "content_language": "en",
        "store_code": "geelonggwm",
        "developer_email": "advertising@adme.net.au",
        "credential_profile_id": "906883f9-8cf3-4cfa-a98e-a044b703bf8c",
        "registration_account_id": "551257489",
        "auto_publish": true
      }
    }'::jsonb
  )
  ON CONFLICT (client_id, source_key)
  DO UPDATE SET
    source_type = EXCLUDED.source_type,
    display_name = EXCLUDED.display_name,
    status = 'active',
    feed_url = EXCLUDED.feed_url,
    feed_format = EXCLUDED.feed_format,
    item_path = EXCLUDED.item_path,
    field_mapping = EXCLUDED.field_mapping,
    connection_config = jsonb_set(
      EXCLUDED.connection_config,
      '{merchant,data_source}',
      to_jsonb(CASE
        WHEN crm_catalog_sources.connection_config #>> '{merchant,data_source}'
          ~ '^accounts/5727572526/dataSources/[0-9]+$'
          THEN crm_catalog_sources.connection_config #>> '{merchant,data_source}'
        ELSE EXCLUDED.connection_config #>> '{merchant,data_source}'
      END),
      true
    ),
    updated_at = NOW()
  RETURNING id INTO v_source_id;
  IF v_source_id <> 'da931735-9784-44fc-9a2a-d64738925fa4'::uuid THEN
    RAISE EXCEPTION 'Geelong GWM Haval New/Demo source key belongs to another record';
  END IF;

  INSERT INTO crm_catalog_sources (
    id, client_id, source_key, source_type, display_name, status,
    feed_url, feed_format, item_path, field_mapping, connection_config
  ) VALUES (
    '56c22734-f966-4f60-bfac-14545016eb11'::uuid,
    'ef849136-7368-4650-bf89-853cbfa6a24a'::uuid,
    'google-merchant-api-used',
    'supabase',
    'Geelong GWM Haval · Used · Merchant API',
    'active',
    'https://tsheefvkecaervnrxvdf.supabase.co',
    'json',
    NULL,
    '{
      "source_product_id": "id",
      "stock_id": "stock_number",
      "vin": "vin",
      "name": "title",
      "availability": "sale_status",
      "price": "dap_price",
      "currency": "currency",
      "product_url": "product_url",
      "primary_image_url": "main_photo_url",
      "source_updated_at": "last_modified_utc",
      "seller_id": "seller_id",
      "sale_status": "sale_status",
      "listing_type": "listing_type",
      "make": "make",
      "model": "model",
      "color": "exterior_colour_generic",
      "merchant_offer_id": "merchant_offer_id",
      "build_year": "build_year",
      "odometer_reading": "odometer_reading",
      "odometer_unit": "odometer_unit",
      "body_style": "body_style",
      "series": "series",
      "badge": "badge",
      "description": "description"
    }'::jsonb,
    '{
      "schema": "public",
      "table": "vehicles",
      "selection": {
        "seller_ids": ["d00498d9-f077-780f-5be5-8d0956ce0458"],
        "sale_statuses": ["For Sale"],
        "listing_types": ["Used"],
        "excluded_source_product_ids": ["217394", "217401"],
        "required_fields": ["source_product_id", "stock_id", "vin", "name", "price", "currency", "product_url", "primary_image_url", "color", "merchant_offer_id"],
        "default_currency": "AUD",
        "product_url_template": "https://geelonggwmhaval.com.au/vehicle-for-sale/{source_product_id}/{name_slug}?store=geelonggwm"
      },
      "working_feed": {
        "id": "3421db30-241c-49a2-bd83-d40c104ea046",
        "source": {"type": "supabase"},
        "filters": {"condition": ["Used"], "sellerIds": ["d00498d9-f077-780f-5be5-8d0956ce0458"], "excludeIds": ["217401", "217394"], "onlyActive": true}
      },
      "merchant": {
        "tenant_id": "b4a0a130-48da-444b-8fdc-d91db8923318",
        "ads_connection_id": "87d6e44f-e6a0-47d1-9a32-27ade143b538",
        "ads_customer_id": "7979828031",
        "account_id": "5727572526",
        "data_source": "accounts/5727572526/dataSources/10706366787",
        "legacy_data_source": "accounts/5727572526/dataSources/10706366787",
        "api_source_display_name": "XeroFlow Vehicle Inventory · Geelong GWM Haval · Used",
        "feed_label": "AU",
        "content_language": "en",
        "store_code": "geelonggwm",
        "developer_email": "advertising@adme.net.au",
        "credential_profile_id": "906883f9-8cf3-4cfa-a98e-a044b703bf8c",
        "registration_account_id": "551257489",
        "auto_publish": true
      }
    }'::jsonb
  )
  ON CONFLICT (client_id, source_key)
  DO UPDATE SET
    source_type = EXCLUDED.source_type,
    display_name = EXCLUDED.display_name,
    status = 'active',
    feed_url = EXCLUDED.feed_url,
    feed_format = EXCLUDED.feed_format,
    item_path = EXCLUDED.item_path,
    field_mapping = EXCLUDED.field_mapping,
    connection_config = jsonb_set(
      EXCLUDED.connection_config,
      '{merchant,data_source}',
      to_jsonb(CASE
        WHEN crm_catalog_sources.connection_config #>> '{merchant,data_source}'
          ~ '^accounts/5727572526/dataSources/[0-9]+$'
          THEN crm_catalog_sources.connection_config #>> '{merchant,data_source}'
        ELSE EXCLUDED.connection_config #>> '{merchant,data_source}'
      END),
      true
    ),
    updated_at = NOW()
  RETURNING id INTO v_source_id;
  IF v_source_id <> '56c22734-f966-4f60-bfac-14545016eb11'::uuid THEN
    RAISE EXCEPTION 'Geelong GWM Haval Used source key belongs to another record';
  END IF;
END $$;

COMMIT;
