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

-- NOT VALID defers the constraint's validation scan so this transaction's
-- ACCESS EXCLUSIVE lock is brief. The VALIDATE CONSTRAINT below runs in its
-- own transaction (after this COMMIT) so its scan only needs the lighter
-- SHARE UPDATE EXCLUSIVE lock, which doesn't block reads/writes on the
-- table. Matches the pattern in migrations 225 and 273.
ALTER TABLE conversion_events
  ADD CONSTRAINT conversion_events_value_currency_pair
  CHECK ((value IS NULL) = (currency_code IS NULL))
  NOT VALID;

COMMIT;

ALTER TABLE conversion_events
  VALIDATE CONSTRAINT conversion_events_value_currency_pair;
