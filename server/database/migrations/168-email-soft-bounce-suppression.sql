-- 168: allow optional repeated soft-bounce suppression.
-- Soft bounces remain historical by default; when operators configure a
-- threshold, repeated delivery delays can create a suppression_list hard stop.

ALTER TABLE suppression_list
  DROP CONSTRAINT IF EXISTS suppression_list_reason_check;

ALTER TABLE suppression_list
  ADD CONSTRAINT suppression_list_reason_check
  CHECK (reason IN (
    'hard_bounce',
    'complaint',
    'manual',
    'global_unsubscribe',
    'soft_bounce'
  ));
