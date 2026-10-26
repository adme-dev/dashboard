-- Permit GA4 debug validation evidence while retaining all deployed provider pairs,
-- including TikTok. Only these three CHECK constraints change; tenant foreign keys,
-- status transitions, idempotency, and append-only evidence triggers stay intact.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE measurement_provider_test_runs
  DROP CONSTRAINT measurement_provider_test_runs_platform_check,
  DROP CONSTRAINT measurement_provider_test_runs_mode_check,
  DROP CONSTRAINT measurement_provider_test_runs_check1,
  ADD CONSTRAINT measurement_provider_test_runs_platform_check
    CHECK (platform IN ('meta', 'google_data_manager', 'tiktok', 'ga4')),
  ADD CONSTRAINT measurement_provider_test_runs_mode_check
    CHECK (mode IN (
      'meta_test_events', 'google_validate_only', 'tiktok_test_events', 'ga4_debug_validation'
    )),
  ADD CONSTRAINT measurement_provider_test_runs_check1
    CHECK (
      (platform = 'meta' AND mode = 'meta_test_events')
      OR (platform = 'google_data_manager' AND mode = 'google_validate_only')
      OR (platform = 'tiktok' AND mode = 'tiktok_test_events')
      OR (platform = 'ga4' AND mode = 'ga4_debug_validation')
    );

COMMIT;
