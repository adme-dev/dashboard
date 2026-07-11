ALTER TABLE hr_notification_deliveries
  ADD COLUMN IF NOT EXISTS delivery_key VARCHAR(160) NOT NULL DEFAULT 'initial';

DROP INDEX IF EXISTS idx_hr_notification_delivery_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_notification_delivery_unique_v2
  ON hr_notification_deliveries (assignment_id, recipient_id, channel, kind, delivery_key);

ALTER TABLE hr_notification_deliveries
  DROP CONSTRAINT IF EXISTS hr_notification_deliveries_kind_check;
ALTER TABLE hr_notification_deliveries
  ADD CONSTRAINT hr_notification_deliveries_kind_check
  CHECK (kind IN ('assignment', 'reminder', 'overdue', 'extension', 'interview', 'reschedule', 'cancel', 'reopen'));
