-- 170: record suppression reason upgrades distinctly in audit history.
-- Used when a historical soft-bounce suppression is upgraded to a provider
-- hard-stop such as hard_bounce or complaint.

ALTER TABLE suppression_events
  DROP CONSTRAINT IF EXISTS suppression_events_action_check;

ALTER TABLE suppression_events
  ADD CONSTRAINT suppression_events_action_check
  CHECK (action IN ('added', 'ignored', 'removed', 'recorded', 'updated'));
