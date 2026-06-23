-- 195_ops_autopilot_c7_actioned.sql
-- Ops Autopilot C7 — dedup stamps for the actioned-confirmation loop. Additive, dormant
-- (only read/written when C7_CONFIRMATION_ENABLED=true). Rollback: drop the two columns.
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS c7_acknowledged_at TIMESTAMPTZ;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS c7_stall_alerted_at TIMESTAMPTZ;
