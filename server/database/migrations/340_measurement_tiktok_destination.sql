-- Extend the measurement control-plane allowlists for TikTok while preserving
-- the GA4 destination contract and web-action vocabulary already present in
-- deployed databases. All destinations remain dormant/test by default.

BEGIN;

ALTER TABLE conversion_destinations
  DROP CONSTRAINT IF EXISTS conversion_destinations_platform_check;
ALTER TABLE conversion_destinations
  ADD CONSTRAINT conversion_destinations_platform_check
  CHECK (platform IN ('meta', 'google_data_manager', 'ga4', 'tiktok'));

ALTER TABLE conversion_destination_capabilities
  DROP CONSTRAINT IF EXISTS conversion_destination_capabilities_platform_check;
ALTER TABLE conversion_destination_capabilities
  ADD CONSTRAINT conversion_destination_capabilities_platform_check
  CHECK (platform IN ('meta', 'google_data_manager', 'ga4', 'tiktok'));

ALTER TABLE conversion_destination_capabilities
  DROP CONSTRAINT IF EXISTS conversion_destination_capabilities_mode_check;
ALTER TABLE conversion_destination_capabilities
  ADD CONSTRAINT conversion_destination_capabilities_mode_check
  CHECK (mode IN (
    'meta_pixel',
    'meta_web_capi',
    'meta_crm_capi',
    'meta_conversion_leads',
    'google_tag_enhanced_conversions',
    'google_enhanced_conversions_for_leads',
    'google_data_manager',
    'ga4_measurement_protocol',
    'tiktok_pixel',
    'tiktok_events_api'
  ));

ALTER TABLE conversion_destination_capabilities
  DROP CONSTRAINT IF EXISTS conversion_destination_capabilities_check;
ALTER TABLE conversion_destination_capabilities
  ADD CONSTRAINT conversion_destination_capabilities_check
  CHECK (
    (platform = 'meta' AND mode LIKE 'meta\_%' ESCAPE '\')
    OR (platform = 'google_data_manager' AND mode LIKE 'google\_%' ESCAPE '\')
    OR (platform = 'ga4' AND mode LIKE 'ga4\_%' ESCAPE '\')
    OR (platform = 'tiktok' AND mode LIKE 'tiktok\_%' ESCAPE '\')
  );

ALTER TABLE conversion_event_mappings
  DROP CONSTRAINT IF EXISTS conversion_event_mappings_canonical_event_name_check;
ALTER TABLE conversion_event_mappings
  ADD CONSTRAINT conversion_event_mappings_canonical_event_name_check
  CHECK (canonical_event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion', 'phone_click',
    'directions_click', 'add_to_wishlist', 'form_submit', 'vehicle_view',
    'site_search', 'phone_contact', 'test_drive_booked'
  ));

ALTER TABLE conversion_events
  DROP CONSTRAINT IF EXISTS conversion_events_event_name_check;
ALTER TABLE conversion_events
  ADD CONSTRAINT conversion_events_event_name_check
  CHECK (event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion', 'phone_click',
    'directions_click', 'add_to_wishlist', 'form_submit', 'vehicle_view',
    'site_search', 'phone_contact', 'test_drive_booked'
  ));

ALTER TABLE measurement_provider_test_runs
  DROP CONSTRAINT IF EXISTS measurement_provider_test_runs_platform_check;
ALTER TABLE measurement_provider_test_runs
  ADD CONSTRAINT measurement_provider_test_runs_platform_check
  CHECK (platform IN ('meta', 'google_data_manager', 'tiktok'));

ALTER TABLE measurement_provider_test_runs
  DROP CONSTRAINT IF EXISTS measurement_provider_test_runs_mode_check;
ALTER TABLE measurement_provider_test_runs
  ADD CONSTRAINT measurement_provider_test_runs_mode_check
  CHECK (mode IN ('meta_test_events', 'google_validate_only', 'tiktok_test_events'));

ALTER TABLE measurement_provider_test_runs
  DROP CONSTRAINT IF EXISTS measurement_provider_test_runs_canonical_event_name_check;
ALTER TABLE measurement_provider_test_runs
  ADD CONSTRAINT measurement_provider_test_runs_canonical_event_name_check
  CHECK (canonical_event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion', 'phone_click',
    'directions_click', 'add_to_wishlist', 'form_submit', 'vehicle_view',
    'site_search', 'phone_contact', 'test_drive_booked'
  ));

ALTER TABLE measurement_provider_test_runs
  DROP CONSTRAINT IF EXISTS measurement_provider_test_runs_check1;
ALTER TABLE measurement_provider_test_runs
  ADD CONSTRAINT measurement_provider_test_runs_check1
  CHECK (
    (platform = 'meta' AND mode = 'meta_test_events')
    OR (platform = 'google_data_manager' AND mode = 'google_validate_only')
    OR (platform = 'tiktok' AND mode = 'tiktok_test_events')
  );

COMMIT;
