-- 270_send_scan_jobs.sql
-- Canonical, idempotent malware-scan work. Applying this migration does not
-- create a Queue, R2 event notification, Container, or public route.

BEGIN;

CREATE TABLE IF NOT EXISTS send_scan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL,
  file_id UUID NOT NULL UNIQUE,
  object_key TEXT NOT NULL CHECK (octet_length(object_key) BETWEEN 1 AND 1024),
  expected_size_bytes BIGINT NOT NULL CHECK (expected_size_bytes > 0),
  expected_mime_type TEXT NOT NULL CHECK (char_length(expected_mime_type) BETWEEN 1 AND 255),
  object_etag TEXT NOT NULL CHECK (char_length(object_etag) BETWEEN 1 AND 255),
  upload_method TEXT NOT NULL CHECK (upload_method IN ('single', 'multipart')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'clean', 'detected', 'error', 'timeout')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  available_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  provider TEXT CHECK (provider IS NULL OR char_length(provider) BETWEEN 1 AND 100),
  engine_version TEXT CHECK (engine_version IS NULL OR char_length(engine_version) BETWEEN 1 AND 100),
  signature_version TEXT CHECK (signature_version IS NULL OR char_length(signature_version) BETWEEN 1 AND 100),
  result_code TEXT CHECK (result_code IS NULL OR char_length(result_code) BETWEEN 1 AND 100),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(evidence) = 'object'
    AND NOT (evidence ?| ARRAY[
      'filename', 'objectKey', 'signedUrl', 'rawOutput', 'providerResponse', 'password', 'token'
    ])
    AND evidence::TEXT !~* '"(file_?name|object_?key|signed_?url|raw_?output|provider_?response|password|token)"[[:space:]]*:'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (transfer_id, file_id)
    REFERENCES send_files(transfer_id, id) ON DELETE CASCADE,
  CHECK ((status = 'running') = (lease_expires_at IS NOT NULL) OR status IN ('pending', 'clean', 'detected', 'error', 'timeout')),
  CHECK ((status IN ('clean', 'detected', 'error', 'timeout')) = (completed_at IS NOT NULL)),
  CHECK (completed_at IS NULL OR claimed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_send_scan_jobs_available
  ON send_scan_jobs (available_at, created_at)
  WHERE status IN ('pending', 'running');

DROP TRIGGER IF EXISTS trg_send_scan_jobs_updated_at ON send_scan_jobs;
CREATE TRIGGER trg_send_scan_jobs_updated_at
  BEFORE UPDATE ON send_scan_jobs
  FOR EACH ROW EXECUTE FUNCTION set_send_updated_at();

COMMENT ON TABLE send_scan_jobs IS
  'Canonical scan work. Queue and R2 event messages are wake-ups only and never authoritative object evidence.';
COMMENT ON COLUMN send_scan_jobs.available_at IS
  'Single PUT jobs wait for presigned capability expiry; completed multipart jobs may scan immediately.';
COMMENT ON COLUMN send_scan_jobs.evidence IS
  'Allowlisted, normalized scan evidence only; never raw scanner output, filenames, object keys, URLs, or tokens.';

COMMIT;
