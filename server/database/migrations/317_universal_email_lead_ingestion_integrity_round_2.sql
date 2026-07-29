-- Forward-fix round 2 for environments where base migrations 315 and 316 ran.
-- Safe to reapply: constraints are replaced transactionally and source checks widen.

BEGIN;

ALTER TABLE lead_email_ingestions
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_safe_evidence_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_duplicate_signal_check,
  DROP CONSTRAINT IF EXISTS lead_email_ingestions_lifecycle_check;

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
     OR jsonb_array_length(jsonb_path_query_array(
       safe_evidence,
       '$.fieldKeys[*] ? (@.type() == "string" && @ like_regex "^[A-Za-z][A-Za-z0-9_.-]{0,254}$")'
     )) <> jsonb_array_length(safe_evidence->'fieldKeys')
   ELSE TRUE
 END;

UPDATE lead_email_ingestions
   SET next_attempt_at = created_at
 WHERE status = 'received'
   AND terminal_at IS NULL
   AND next_attempt_at IS NULL;

UPDATE lead_email_ingestions
   SET next_attempt_at = NULL
 WHERE status = 'failed'
   AND terminal_at IS NOT NULL
   AND next_attempt_at IS NOT NULL;

ALTER TABLE lead_email_ingestions
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
        AND jsonb_array_length(jsonb_path_query_array(
          safe_evidence,
          '$.fieldKeys[*] ? (@.type() == "string" && @ like_regex "^[A-Za-z][A-Za-z0-9_.-]{0,254}$")'
        )) = jsonb_array_length(safe_evidence->'fieldKeys')
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
      AND possible_duplicate_of_lead_id IS NOT NULL
    )
  ),
  ADD CONSTRAINT lead_email_ingestions_lifecycle_check CHECK (
    (status IN ('accepted', 'duplicate', 'quarantined') AND terminal_at IS NOT NULL AND next_attempt_at IS NULL)
    OR (status = 'received' AND terminal_at IS NULL AND next_attempt_at IS NOT NULL AND attempt_count < 5)
    OR (status = 'failed' AND (
      (terminal_at IS NOT NULL AND next_attempt_at IS NULL)
      OR (terminal_at IS NULL AND next_attempt_at IS NOT NULL AND attempt_count < 5)
    ))
  );

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check CHECK (
  source IN ('meta', 'google', 'manual', 'webhook', 'csv', 'email')
  OR source ~ '^future_[a-z][a-z0-9_]{0,23}$'
);

ALTER TABLE lead_form_rules DROP CONSTRAINT IF EXISTS lead_form_rules_source_check;
ALTER TABLE lead_form_rules ADD CONSTRAINT lead_form_rules_source_check CHECK (
  source IN ('meta', 'google', 'webhook', 'csv', 'email')
  OR source ~ '^future_[a-z][a-z0-9_]{0,23}$'
);

COMMIT;
