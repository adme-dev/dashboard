-- 157-crm-activation-crons.sql
-- P4.1 — CRM activation crons. Additive, idempotent (IF NOT EXISTS guards).
--   * crm_tasks.reminded_at  — idempotency marker so a reminder fires exactly once.
--   * crm_settings.dormancy_days — per-client inactivity threshold before an
--     'active' contact auto-goes dormant (NULL → app default of 90 days).

ALTER TABLE crm_tasks    ADD COLUMN IF NOT EXISTS reminded_at   TIMESTAMPTZ;
ALTER TABLE crm_settings ADD COLUMN IF NOT EXISTS dormancy_days INTEGER;

-- Drives the reminder sweep: open tasks with a due reminder not yet sent.
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due_reminder
  ON crm_tasks (reminder_at)
  WHERE reminded_at IS NULL AND deleted_at IS NULL AND status IN ('pending','in_progress');
