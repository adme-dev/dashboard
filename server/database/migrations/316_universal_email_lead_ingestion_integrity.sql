-- Forward-fix Task 1 integrity constraints after migration 315 was applied.
-- Every operation is safe to repeat so live and fresh environments converge.

BEGIN;

ALTER TABLE lead_email_ingestions
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_lifecycle_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_external_id_hash_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_message_id_hash_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_parser_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_processing_ms_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_duplicate_window_hours_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_safe_evidence_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_duplicate_signal_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_replay_self_check;

UPDATE lead_email_ingestions
   SET safe_evidence = '{"hasText":false,"hasHtml":false,"hasAdf":false,"fieldKeys":[]}'::jsonb
 WHERE CASE
   WHEN jsonb_typeof(safe_evidence) = 'object'
    AND safe_evidence ?& ARRAY['hasText', 'hasHtml', 'hasAdf', 'fieldKeys']
    AND (safe_evidence - ARRAY['hasText', 'hasHtml', 'hasAdf', 'fieldKeys']) = '{}'::jsonb
    AND jsonb_typeof(safe_evidence->'hasText') = 'boolean'
    AND jsonb_typeof(safe_evidence->'hasHtml') = 'boolean'
    AND jsonb_typeof(safe_evidence->'hasAdf') = 'boolean'
    AND jsonb_typeof(safe_evidence->'fieldKeys') = 'array'
   THEN jsonb_array_length(safe_evidence->'fieldKeys') > 100
   ELSE TRUE
 END;

ALTER TABLE lead_email_ingestions
  ALTER COLUMN safe_evidence
    SET DEFAULT '{"hasText":false,"hasHtml":false,"hasAdf":false,"fieldKeys":[]}'::jsonb,
  ADD CONSTRAINT lead_email_ingestions_external_id_hash_check
    CHECK (external_id_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT lead_email_ingestions_message_id_hash_check
    CHECK (message_id_hash IS NULL OR message_id_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT lead_email_ingestions_parser_check
    CHECK (parser IS NULL OR parser IN ('adf', 'provider', 'generic', 'ai_fallback')),
  ADD CONSTRAINT lead_email_ingestions_processing_ms_check
    CHECK (processing_ms IS NULL OR processing_ms >= 0),
  ADD CONSTRAINT lead_email_ingestions_duplicate_window_hours_check
    CHECK (duplicate_window_hours IS NULL OR duplicate_window_hours BETWEEN 1 AND 8760),
  ADD CONSTRAINT lead_email_ingestions_safe_evidence_check CHECK (
    CASE
      WHEN jsonb_typeof(safe_evidence) = 'object'
        AND safe_evidence ?& ARRAY['hasText', 'hasHtml', 'hasAdf', 'fieldKeys']
        AND (safe_evidence - ARRAY['hasText', 'hasHtml', 'hasAdf', 'fieldKeys']) = '{}'::jsonb
        AND jsonb_typeof(safe_evidence->'hasText') = 'boolean'
        AND jsonb_typeof(safe_evidence->'hasHtml') = 'boolean'
        AND jsonb_typeof(safe_evidence->'hasAdf') = 'boolean'
        AND jsonb_typeof(safe_evidence->'fieldKeys') = 'array'
      THEN jsonb_array_length(safe_evidence->'fieldKeys') <= 100
      ELSE FALSE
    END
  ),
  ADD CONSTRAINT lead_email_ingestions_duplicate_signal_check CHECK (
    (
      duplicate_match_basis IS NULL
      AND duplicate_confidence IS NULL
      AND duplicate_window_hours IS NULL
      AND possible_duplicate_of_lead_id IS NULL
    )
    OR (
      duplicate_match_basis IS NOT NULL
      AND duplicate_confidence IS NOT NULL
      AND duplicate_window_hours IS NOT NULL
    )
  ),
  ADD CONSTRAINT lead_email_ingestions_replay_self_check
    CHECK (replayed_from IS NULL OR replayed_from <> id),
  ADD CONSTRAINT lead_email_ingestions_lifecycle_check CHECK (
    (status IN ('accepted', 'duplicate', 'quarantined') AND terminal_at IS NOT NULL AND next_attempt_at IS NULL)
    OR (status = 'received' AND terminal_at IS NULL AND next_attempt_at IS NOT NULL AND attempt_count < 5)
    OR (status = 'failed' AND (
      (terminal_at IS NOT NULL AND next_attempt_at IS NULL)
      OR (terminal_at IS NULL AND next_attempt_at IS NOT NULL AND attempt_count < 5)
    ))
  );

COMMIT;
