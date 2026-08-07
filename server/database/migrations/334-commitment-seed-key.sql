-- 334: durable identity for seeded statutory commitments.
-- The seeder previously keyed idempotency on a marker inside notes — a
-- user-editable field, so an edited note could cause silent duplicates.
-- seed_key + partial unique index makes INSERT ... ON CONFLICT DO NOTHING
-- genuinely idempotent, including under concurrent seed runs.
ALTER TABLE cashflow_commitments
  ADD COLUMN IF NOT EXISTS seed_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cashflow_commitments_seed_key
  ON cashflow_commitments (tenant_id, seed_key)
  WHERE source = 'statutory-seed' AND seed_key IS NOT NULL;
