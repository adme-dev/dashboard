-- A delivery kind may be completed at most once per assignment, recipient and
-- channel. Cron retries claim this key before notifying, preventing duplicates.

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_notification_delivery_unique
  ON hr_notification_deliveries (assignment_id, recipient_id, channel, kind);
