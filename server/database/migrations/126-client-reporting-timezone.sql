-- 126: per-client reporting timezone for tracking analytics day-bucketing.
ALTER TABLE agency_clients
  ADD COLUMN IF NOT EXISTS reporting_timezone TEXT NOT NULL DEFAULT 'Australia/Brisbane';
