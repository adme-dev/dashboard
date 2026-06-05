-- 169: allow form-originated suppression audit events.
-- Double opt-in confirmation is a proven consent form flow and may lift a
-- prior global_unsubscribe suppression for the subscriber.

ALTER TABLE suppression_events
  DROP CONSTRAINT IF EXISTS suppression_events_source_check;

ALTER TABLE suppression_events
  ADD CONSTRAINT suppression_events_source_check
  CHECK (source IN (
    'form',
    'webhook',
    'one_click',
    'preference_center',
    'manual',
    'system'
  ));
