-- 343_board_knowledge_agency_chunks.sql
-- Allow the dedicated knowledge index to carry existing agency-wide articles
-- alongside governed board submissions, with an explicit scope discriminator.

ALTER TABLE ai_knowledge_chunks
  ADD COLUMN IF NOT EXISTS scope_key VARCHAR(100);

UPDATE ai_knowledge_chunks
SET scope_key = 'board:' || department_id::text
WHERE scope_key IS NULL AND department_id IS NOT NULL;

ALTER TABLE ai_knowledge_chunks
  ALTER COLUMN submission_id DROP NOT NULL,
  ALTER COLUMN department_id DROP NOT NULL,
  ALTER COLUMN scope_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_knowledge_chunks_scope_owner_check'
      AND conrelid = 'ai_knowledge_chunks'::regclass
  ) THEN
    ALTER TABLE ai_knowledge_chunks
      ADD CONSTRAINT ai_knowledge_chunks_scope_owner_check CHECK (
        (
          scope_key = 'agency'
          AND submission_id IS NULL
          AND department_id IS NULL
        )
        OR
        (
          scope_key = 'board:' || department_id::text
          AND submission_id IS NOT NULL
          AND department_id IS NOT NULL
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_scope
  ON ai_knowledge_chunks (scope_key, article_id, chunk_index);
