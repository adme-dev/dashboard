-- Retain TikTok's first-party browser identifier for consent-governed matching.
-- The value remains in the tracking event store and is never exposed in client
-- or agency analytics payloads; those surfaces report aggregate coverage only.

ALTER TABLE tracking_events
  ADD COLUMN IF NOT EXISTS ttp TEXT;
