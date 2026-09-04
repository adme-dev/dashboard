-- Preserve the consent decision used by the canonical outbox policy so the
-- operational lineage can report evidence rather than infer it from outcomes.

BEGIN;

ALTER TABLE conversion_events
  ADD COLUMN IF NOT EXISTS consent_decision TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE conversion_events
  DROP CONSTRAINT IF EXISTS conversion_events_consent_decision_check;
ALTER TABLE conversion_events
  ADD CONSTRAINT conversion_events_consent_decision_check
  CHECK (consent_decision IN ('granted', 'denied', 'unknown'));

COMMIT;
