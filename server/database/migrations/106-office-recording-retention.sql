-- Retention policy support for async office recordings.

ALTER TABLE office_recordings
  ADD COLUMN IF NOT EXISTS retention_days int;

ALTER TABLE office_recordings
  DROP CONSTRAINT IF EXISTS office_recordings_retention_days_check;

ALTER TABLE office_recordings
  ADD CONSTRAINT office_recordings_retention_days_check
  CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 3650);
