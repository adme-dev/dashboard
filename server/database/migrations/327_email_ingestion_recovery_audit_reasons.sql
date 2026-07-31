-- Keep the audit constraint aligned with every bounded recovery transition.

BEGIN;

ALTER TABLE lead_email_ingestion_audits
  DROP CONSTRAINT IF EXISTS lead_email_ingestion_audits_reason_check,
  ADD CONSTRAINT lead_email_ingestion_audits_reason_check CHECK (
    reason IS NULL OR reason IN (
      'missing_evidence',
      'corrupt_evidence',
      'content_mismatch',
      'identity_mismatch',
      'parse_failed',
      'endpoint_unavailable',
      'capture_mode_ineligible',
      'sender_policy_denied',
      'attempts_exhausted',
      'evidence_expired',
      'legacy_evidence',
      'canonical_window_elapsed',
      'canonical_transient',
      'lease_lost'
    )
  );

COMMIT;
