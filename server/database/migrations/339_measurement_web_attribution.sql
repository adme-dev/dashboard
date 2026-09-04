-- Extend the canonical conversion attribution envelope with bounded browser
-- context required for server-side Meta, TikTok, Google Ads, and GA4 delivery.
-- Raw contact fields remain prohibited by conversion_events_attribution_check1.

BEGIN;

ALTER TABLE conversion_events
  DROP CONSTRAINT IF EXISTS conversion_events_attribution_check2;

ALTER TABLE conversion_events
  ADD CONSTRAINT conversion_events_attribution_check2
  CHECK (
    attribution - ARRAY[
      'browserEventId',
      'metaLeadId',
      'gclid',
      'gbraid',
      'wbraid',
      'fbc',
      'fbp',
      'ttclid',
      'ttp',
      'gaClientId',
      'eventSourceUrl',
      'clientUserAgent'
    ] = '{}'::jsonb
  );

COMMIT;
