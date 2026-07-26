BEGIN;

-- Conversion delivery to Meta CAPI and Google Data Manager has been
-- binary-only ("this happened") with no monetary value, blocking
-- value-based bidding on both platforms. crm_opportunities.amount already
-- holds a real deal value at the point a lead_won lifecycle event fires;
-- these columns let that value flow through the canonical conversion
-- pipeline to delivery. Nullable and additive: existing rows are unaffected,
-- and every event that isn't a valued lead_won keeps delivering binary.
ALTER TABLE conversion_events
  ADD COLUMN value NUMERIC(14,2) NULL,
  ADD COLUMN currency_code TEXT NULL;

ALTER TABLE conversion_events
  ADD CONSTRAINT conversion_events_value_currency_pair
  CHECK ((value IS NULL) = (currency_code IS NULL));

COMMIT;
