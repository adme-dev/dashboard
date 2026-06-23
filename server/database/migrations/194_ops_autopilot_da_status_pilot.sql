-- 194_ops_autopilot_da_status_pilot.sql
-- Ops Autopilot — Phase 1 of the status-taxonomy migration plan
-- (docs/superpowers/plans/2026-06-23-ops-autopilot-status-taxonomy-migration-plan.md).
--
-- Seeds the Digital Advertising lifecycle status taxonomy on the PILOT board only:
--   "ADME Creative Request"  (department 121f79ca-400e-4292-8784-a091e9f6a729).
--
-- ADDITIVE · IDEMPOTENT · FORWARD-ONLY:
--   * Status NAMES match STATUS_TO_STAGE in server/utils/automation/lifecycle.ts so
--     the lifecycle guard resolves them (verified by test/automation/daStatusSeed.test.ts).
--   * ON CONFLICT (department_id, slug) DO NOTHING — re-runnable; never touches the
--     existing To Do / In Progress / Done triad. The 147 current tasks stay on "To Do".
--   * No task remap, no is_default change, no deletes (sort_order 10+ keeps these after
--     the legacy triad).
--
-- SAFETY: the lifecycle guard stays OFF (LIFECYCLE_GUARD_ENABLED unset) until Phase 4 —
-- seeding statuses changes nothing automated; it only makes them selectable on the board.
--
-- Rollback:
--   DELETE FROM task_statuses
--    WHERE department_id = '121f79ca-400e-4292-8784-a091e9f6a729'
--      AND slug IN ('brief-required','copy-required','working-on-it','qa',
--                   'awaiting-creative-approval','awaiting-approval','awaiting-client',
--                   'approved','check-daily','budget-update','roll-this-next-month',
--                   'approved-to-be-billed','da-cancelled');

INSERT INTO task_statuses (department_id, name, slug, color, category, is_final, sort_order)
VALUES
  ('121f79ca-400e-4292-8784-a091e9f6a729', 'Brief Required',              'brief-required',             '#6B7280', 'not_started', false, 10),
  ('121f79ca-400e-4292-8784-a091e9f6a729', 'Copy Required',              'copy-required',              '#9CA3AF', 'not_started', false, 11),
  ('121f79ca-400e-4292-8784-a091e9f6a729', 'Working on it',              'working-on-it',              '#3B82F6', 'in_progress', false, 12),
  ('121f79ca-400e-4292-8784-a091e9f6a729', 'QA',                         'qa',                         '#8B5CF6', 'review',      false, 13),
  ('121f79ca-400e-4292-8784-a091e9f6a729', 'Awaiting Creative Approval', 'awaiting-creative-approval', '#F59E0B', 'review',      false, 14),
  ('121f79ca-400e-4292-8784-a091e9f6a729', 'Awaiting Approval',          'awaiting-approval',          '#F59E0B', 'review',      false, 15),
  ('121f79ca-400e-4292-8784-a091e9f6a729', 'Awaiting Client',            'awaiting-client',            '#F97316', 'review',      false, 16),
  ('121f79ca-400e-4292-8784-a091e9f6a729', 'Approved',                   'approved',                   '#10B981', 'in_progress', false, 17),
  ('121f79ca-400e-4292-8784-a091e9f6a729', 'Check Daily',                'check-daily',                '#06B6D4', 'in_progress', false, 18),
  ('121f79ca-400e-4292-8784-a091e9f6a729', 'Budget Update',              'budget-update',              '#06B6D4', 'in_progress', false, 19),
  ('121f79ca-400e-4292-8784-a091e9f6a729', 'Roll This/Next Month',       'roll-this-next-month',       '#14B8A6', 'in_progress', false, 20),
  ('121f79ca-400e-4292-8784-a091e9f6a729', 'Approved To Be Billed',      'approved-to-be-billed',      '#84CC16', 'review',      false, 21),
  ('121f79ca-400e-4292-8784-a091e9f6a729', 'Cancelled',                  'da-cancelled',               '#EF4444', 'cancelled',   true,  22)
ON CONFLICT (department_id, slug) DO NOTHING;
