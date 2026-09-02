-- Extend the existing Measurement Signal Hub identity vocabulary for dealer
-- service enquiries and directions intent. These events remain dormant until
-- an exact destination mapping is configured.

BEGIN;

ALTER TABLE conversion_event_mappings
  DROP CONSTRAINT IF EXISTS conversion_event_mappings_canonical_event_name_check;
ALTER TABLE conversion_event_mappings
  ADD CONSTRAINT conversion_event_mappings_canonical_event_name_check
  CHECK (canonical_event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion',
    'phone_click', 'directions_click', 'add_to_wishlist', 'form_submit'
  ));

ALTER TABLE conversion_events
  DROP CONSTRAINT IF EXISTS conversion_events_event_name_check;
ALTER TABLE conversion_events
  ADD CONSTRAINT conversion_events_event_name_check
  CHECK (event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion',
    'phone_click', 'directions_click', 'add_to_wishlist', 'form_submit'
  ));

ALTER TABLE measurement_provider_test_runs
  DROP CONSTRAINT IF EXISTS measurement_provider_test_runs_canonical_event_name_check;
ALTER TABLE measurement_provider_test_runs
  ADD CONSTRAINT measurement_provider_test_runs_canonical_event_name_check
  CHECK (canonical_event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion',
    'phone_click', 'directions_click', 'add_to_wishlist', 'form_submit'
  ));

ALTER TABLE conversion_event_mappings
  DROP CONSTRAINT IF EXISTS conversion_event_mappings_enquiry_type_check;
ALTER TABLE conversion_event_mappings
  ADD CONSTRAINT conversion_event_mappings_enquiry_type_check
  CHECK (enquiry_type IS NULL OR enquiry_type IN (
    'stock', 'finance', 'test_drive', 'contact', 'model_variant', 'service_booking'
  ));

ALTER TABLE conversion_events
  DROP CONSTRAINT IF EXISTS conversion_events_enquiry_type_check;
ALTER TABLE conversion_events
  ADD CONSTRAINT conversion_events_enquiry_type_check
  CHECK (enquiry_type IS NULL OR enquiry_type IN (
    'stock', 'finance', 'test_drive', 'contact', 'model_variant', 'service_booking'
  ));

COMMIT;
