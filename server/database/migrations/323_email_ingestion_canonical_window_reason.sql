-- Record truthful recovery admission-window releases in content-free audits.

BEGIN;

ALTER TABLE lead_email_ingestion_audits
  DROP CONSTRAINT IF EXISTS lead_email_ingestion_audits_reason_check,
  ADD CONSTRAINT lead_email_ingestion_audits_reason_check CHECK (
    reason IS NULL OR reason IN (
      'missing_evidence',
      'corrupt_evidence',
      'endpoint_unavailable',
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
