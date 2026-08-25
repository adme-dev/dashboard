-- CanonicalAttributionSchema (server/utils/measurement/contracts.ts) emits gaClientId, but the
-- conversion_events attribution check (migration 256) never allowed the key, so every zero_lead
-- lead_created publish failed the constraint. Widen the whitelist to match the contract.
ALTER TABLE conversion_events DROP CONSTRAINT IF EXISTS conversion_events_attribution_check2;
ALTER TABLE conversion_events ADD CONSTRAINT conversion_events_attribution_check2
  CHECK (attribution - ARRAY['browserEventId', 'metaLeadId', 'gclid', 'gbraid', 'wbraid', 'gaClientId'] = '{}'::jsonb);
