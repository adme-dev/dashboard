-- 139-tracking-enforce-origin.sql
-- Per-site hard Origin enforcement flag for the public tracking beacon.
-- Additive + idempotent. Default FALSE so every existing site stays in soft mode.
ALTER TABLE tracking_sites
  ADD COLUMN IF NOT EXISTS enforce_origin BOOLEAN NOT NULL DEFAULT FALSE;
