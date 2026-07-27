BEGIN;

-- GA4 becomes a third measurement platform alongside meta/google_data_manager,
-- delivering browser-tracking-event micro-conversions (phone_click,
-- add_to_wishlist, form_submit) via GA4 Measurement Protocol. Google Ads sees
-- these through each client's own GA4-Google Ads Link (configured in Google's
-- UI, not built here) rather than a second, direct Data Manager call.
ALTER TABLE conversion_destinations
  DROP CONSTRAINT IF EXISTS conversion_destinations_platform_check;
ALTER TABLE conversion_destinations
  ADD CONSTRAINT conversion_destinations_platform_check
  CHECK (platform IN ('meta', 'google_data_manager', 'ga4'));

ALTER TABLE conversion_destination_capabilities
  DROP CONSTRAINT IF EXISTS conversion_destination_capabilities_platform_check;
ALTER TABLE conversion_destination_capabilities
  ADD CONSTRAINT conversion_destination_capabilities_platform_check
  CHECK (platform IN ('meta', 'google_data_manager', 'ga4'));

ALTER TABLE conversion_destination_capabilities
  DROP CONSTRAINT IF EXISTS conversion_destination_capabilities_mode_check;
ALTER TABLE conversion_destination_capabilities
  ADD CONSTRAINT conversion_destination_capabilities_mode_check
  CHECK (mode IN (
    'meta_pixel', 'meta_web_capi', 'meta_crm_capi', 'meta_conversion_leads',
    'google_tag_enhanced_conversions', 'google_enhanced_conversions_for_leads',
    'google_data_manager', 'ga4_measurement_protocol'
  ));

-- New canonical event names for browser-originated micro-conversions.
-- lead_status_events.canonical_event_name is untouched — these signals
-- aren't CRM lead-status transitions, same reason purchase/web_conversion
-- are already absent from that table's narrower check.
ALTER TABLE conversion_event_mappings
  DROP CONSTRAINT IF EXISTS conversion_event_mappings_canonical_event_name_check;
ALTER TABLE conversion_event_mappings
  ADD CONSTRAINT conversion_event_mappings_canonical_event_name_check
  CHECK (canonical_event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion',
    'phone_click', 'add_to_wishlist', 'form_submit'
  ));

ALTER TABLE conversion_events
  DROP CONSTRAINT IF EXISTS conversion_events_event_name_check;
ALTER TABLE conversion_events
  ADD CONSTRAINT conversion_events_event_name_check
  CHECK (event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion',
    'phone_click', 'add_to_wishlist', 'form_submit'
  ));

-- Real GA4 client_id (parsed from the _ga cookie), threaded alongside the
-- existing per-attribution-identifier columns (gclid, gbraid, wbraid, fbclid,
-- fbc, fbp, ttclid, msclkid, li_fat_id) so server-side Measurement Protocol
-- hits correlate with the visitor's actual GA4 session instead of creating a
-- disconnected synthetic user.
ALTER TABLE tracking_events
  ADD COLUMN IF NOT EXISTS ga_client_id TEXT NULL;

COMMIT;
