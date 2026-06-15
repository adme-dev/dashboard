-- 179_campaign_action_log_executing_status.sql
-- IM-01 concurrency hardening: add a transient 'executing' status to
-- campaign_action_log so the budget-write execute endpoint can atomically
-- claim an approved action before touching the platform API. Two simultaneous
-- "Apply" clicks on the same approved action can otherwise both POST to the
-- platform before either records 'applied'. The claim is:
--   UPDATE ... SET action_status='executing' WHERE id=$1 AND action_status='approved'
-- which only one concurrent request can win (row lock). On a guardrail block the
-- claim is released back to 'approved'; on completion it moves to a terminal
-- state ('applied' / 'failed' / 'skipped').
--
-- Additive + idempotent: drops the existing inline CHECK (conventional name) if
-- present and re-adds it with the extra value, guarded so re-runs are no-ops.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_action_log_action_status_check'
      AND conrelid = 'campaign_action_log'::regclass
  ) THEN
    ALTER TABLE campaign_action_log
      DROP CONSTRAINT campaign_action_log_action_status_check;
  END IF;

  ALTER TABLE campaign_action_log
    ADD CONSTRAINT campaign_action_log_action_status_check
    CHECK (action_status IN (
      'planned', 'pending', 'approved', 'executing', 'applied', 'failed', 'skipped', 'cancelled'
    ));
END $$;
