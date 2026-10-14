-- Email intake appends provider metadata accepted by CanonicalAttributionSchema.
-- The older database whitelist rejects it, rolling back the canonical lead too.
-- Keep the existing advertising keys and the separate object/PII restrictions.
-- Apply this file in a transaction so a failed validation restores the old check.
ALTER TABLE conversion_events
  DROP CONSTRAINT IF EXISTS conversion_events_attribution_check2,
  ADD CONSTRAINT conversion_events_attribution_check2 CHECK (
    attribution - ARRAY[
      'browserEventId', 'metaLeadId', 'gclid', 'gbraid', 'wbraid', 'gaClientId',
      'fbc', 'fbp', 'ttclid', 'ttp', 'eventSourceUrl', 'clientUserAgent',
      'utm_source', 'utm_medium', 'provider', 'email_endpoint_id',
      'parser', 'confidence_band', 'transport'
    ] = '{}'::jsonb
  ) NOT VALID;

ALTER TABLE conversion_events
  VALIDATE CONSTRAINT conversion_events_attribution_check2;
