-- Per-site provider controls for the universal tracker. Passive interaction
-- observation defaults on to preserve existing behaviour; confirmed provider
-- leads require an explicit opt-in and a separate server-side credential.

BEGIN;

ALTER TABLE tracking_sites
  ADD COLUMN IF NOT EXISTS provider_tracking JSONB NOT NULL DEFAULT
    '{"podium":{"interactions":true,"confirmedLeads":false},"xtime":{"interactions":true,"confirmedLeads":false}}'::jsonb;

ALTER TABLE tracking_sites
  DROP CONSTRAINT IF EXISTS tracking_sites_provider_tracking_shape;

ALTER TABLE tracking_sites
  ADD CONSTRAINT tracking_sites_provider_tracking_shape CHECK (
    jsonb_typeof(provider_tracking) = 'object'
    AND jsonb_typeof(provider_tracking->'podium') = 'object'
    AND jsonb_typeof(provider_tracking->'xtime') = 'object'
    AND jsonb_typeof(provider_tracking->'podium'->'interactions') = 'boolean'
    AND jsonb_typeof(provider_tracking->'podium'->'confirmedLeads') = 'boolean'
    AND jsonb_typeof(provider_tracking->'xtime'->'interactions') = 'boolean'
    AND jsonb_typeof(provider_tracking->'xtime'->'confirmedLeads') = 'boolean'
  );

COMMIT;
