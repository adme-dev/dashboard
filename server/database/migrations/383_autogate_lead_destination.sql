BEGIN;

ALTER TABLE lead_rule_destinations
  DROP CONSTRAINT IF EXISTS lead_rule_destinations_destination_type_check;

ALTER TABLE lead_rule_destinations
  ADD CONSTRAINT lead_rule_destinations_destination_type_check
  CHECK (destination_type IN (
    'portal', 'webhook', 'slack', 'email', 'sheets', 'assign_user',
    'sms', 'autoresponder_email', 'autoresponder_sms', 'autogate'
  ));

COMMIT;
