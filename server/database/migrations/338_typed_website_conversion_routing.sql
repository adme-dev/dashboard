-- Exact typed website-conversion routing. Untyped mappings remain supported,
-- but a destination cannot have both an aggregate and multiple ambiguous rows.

BEGIN;

ALTER TABLE conversion_event_mappings
  ADD COLUMN IF NOT EXISTS enquiry_type TEXT CHECK (enquiry_type IS NULL OR enquiry_type IN (
    'stock', 'finance', 'test_drive', 'contact', 'model_variant'
  ));

ALTER TABLE conversion_events
  ADD COLUMN IF NOT EXISTS enquiry_type TEXT CHECK (enquiry_type IS NULL OR enquiry_type IN (
    'stock', 'finance', 'test_drive', 'contact', 'model_variant'
  ));

DROP INDEX IF EXISTS idx_conversion_event_mappings_one_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversion_event_mappings_one_active
  ON conversion_event_mappings (
    destination_id,
    canonical_event_name,
    COALESCE(enquiry_type, '__aggregate__')
  )
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_conversion_event_mappings_typed_lookup
  ON conversion_event_mappings (
    client_id, destination_id, canonical_event_name, enquiry_type
  )
  WHERE is_active = TRUE;

COMMENT ON COLUMN conversion_event_mappings.enquiry_type IS
  'Optional exact website enquiry type. NULL is the legacy aggregate mapping.';
COMMENT ON COLUMN conversion_events.enquiry_type IS
  'Trusted connector-derived enquiry type used for exact conversion routing.';

COMMIT;
