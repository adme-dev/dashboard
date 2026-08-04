-- 342_board_knowledge.sql
-- Governed, board-scoped document knowledge with review and retrieval provenance.
-- Additive and idempotent: existing agency knowledge remains agency-wide.

ALTER TABLE ai_knowledge_articles
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS board_knowledge_submission_id UUID,
  ADD COLUMN IF NOT EXISTS source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS source_entity_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_knowledge_articles_source_entity_type_check'
  ) THEN
    ALTER TABLE ai_knowledge_articles
      ADD CONSTRAINT ai_knowledge_articles_source_entity_type_check
      CHECK (
        source_entity_type IS NULL
        OR source_entity_type IN ('board_file', 'task_attachment', 'manual')
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS board_knowledge_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  board_file_id UUID REFERENCES board_files(id) ON DELETE SET NULL,
  task_attachment_id UUID REFERENCES task_attachments(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL
    CONSTRAINT board_knowledge_source_type_check
    CHECK (source_type IN ('board_file', 'task_attachment')),
  source_entity_id UUID NOT NULL,
  source_file_name VARCHAR(500) NOT NULL,
  source_mime_type VARCHAR(255) NOT NULL,
  source_size BIGINT NOT NULL DEFAULT 0 CHECK (source_size >= 0),
  source_version_key VARCHAR(500) NOT NULL,
  source_checksum_sha256 CHAR(64)
    CHECK (source_checksum_sha256 IS NULL OR source_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  source_deleted_at TIMESTAMPTZ,
  submitted_by UUID NOT NULL REFERENCES team_members(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'archived')),
  reviewed_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_reason VARCHAR(2000),
  extraction_status TEXT NOT NULL DEFAULT 'queued'
    CHECK (extraction_status IN ('queued', 'processing', 'ready', 'failed')),
  extraction_method TEXT
    CHECK (extraction_method IS NULL OR extraction_method IN ('native', 'gemini', 'huggingface')),
  extraction_provider VARCHAR(100),
  extraction_model VARCHAR(255),
  extraction_started_at TIMESTAMPTZ,
  extraction_completed_at TIMESTAMPTZ,
  extraction_metrics JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (octet_length(extraction_metrics::text) <= 16384),
  extraction_warnings JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (octet_length(extraction_warnings::text) <= 16384),
  extraction_error_code VARCHAR(100),
  extraction_error_message VARCHAR(1000),
  index_status TEXT NOT NULL DEFAULT 'not_indexed'
    CHECK (index_status IN ('not_indexed', 'queued', 'indexing', 'indexed', 'failed', 'removed')),
  ai_knowledge_article_id UUID REFERENCES ai_knowledge_articles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (board_file_id IS NOT NULL)::int + (task_attachment_id IS NOT NULL)::int = 1
    OR (
      review_status = 'archived'
      AND source_deleted_at IS NOT NULL
      AND board_file_id IS NULL
      AND task_attachment_id IS NULL
    )
  ),
  CHECK (source_deleted_at IS NULL OR review_status = 'archived')
);

-- These guards also complete databases where an interrupted deployment created
-- the table before immutable source identity was added.
ALTER TABLE board_knowledge_submissions
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_entity_id UUID;

UPDATE board_knowledge_submissions
SET
  source_type = CASE
    WHEN board_file_id IS NOT NULL THEN 'board_file'
    WHEN task_attachment_id IS NOT NULL THEN 'task_attachment'
    ELSE source_type
  END,
  source_entity_id = COALESCE(source_entity_id, board_file_id, task_attachment_id)
WHERE source_type IS NULL OR source_entity_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'board_knowledge_source_type_check'
  ) THEN
    ALTER TABLE board_knowledge_submissions
      ADD CONSTRAINT board_knowledge_source_type_check
      CHECK (source_type IN ('board_file', 'task_attachment'));
  END IF;
END $$;

ALTER TABLE board_knowledge_submissions
  ALTER COLUMN source_type SET NOT NULL,
  ALTER COLUMN source_entity_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_board_knowledge_source_version
  ON board_knowledge_submissions (
    department_id,
    source_type,
    source_entity_id,
    source_version_key
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_board_knowledge_one_approved_board_file
  ON board_knowledge_submissions (board_file_id)
  WHERE board_file_id IS NOT NULL AND review_status = 'approved';

CREATE UNIQUE INDEX IF NOT EXISTS idx_board_knowledge_one_approved_task_attachment
  ON board_knowledge_submissions (task_attachment_id)
  WHERE task_attachment_id IS NOT NULL AND review_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_board_knowledge_department_review
  ON board_knowledge_submissions (department_id, review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_board_knowledge_processing
  ON board_knowledge_submissions (extraction_status, index_status, updated_at);

CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES ai_knowledge_articles(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES board_knowledge_submissions(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
  heading VARCHAR(500),
  page_start INTEGER CHECK (page_start IS NULL OR page_start > 0),
  page_end INTEGER CHECK (page_end IS NULL OR page_end > 0),
  sheet_name VARCHAR(255),
  slide_number INTEGER CHECK (slide_number IS NULL OR slide_number > 0),
  content_hash CHAR(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  vector_id VARCHAR(200) UNIQUE,
  token_estimate INTEGER CHECK (token_estimate IS NULL OR token_estimate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (article_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_submission
  ON ai_knowledge_chunks (submission_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_department
  ON ai_knowledge_chunks (department_id, created_at DESC);

CREATE TABLE IF NOT EXISTS board_knowledge_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES board_knowledge_submissions(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'submit',
    'extraction_start',
    'extraction_success',
    'extraction_failure',
    'retry',
    'approve',
    'reject',
    'index_success',
    'index_failure',
    'archive',
    'deindex',
    'source_version_mismatch'
  )),
  previous_state JSONB,
  next_state JSONB,
  actor_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (octet_length(metadata::text) <= 16384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_knowledge_audit_submission
  ON board_knowledge_audit (submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_board_knowledge_audit_actor
  ON board_knowledge_audit (actor_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_knowledge_articles_board_knowledge_submission_fk'
  ) THEN
    ALTER TABLE ai_knowledge_articles
      ADD CONSTRAINT ai_knowledge_articles_board_knowledge_submission_fk
      FOREIGN KEY (board_knowledge_submission_id)
      REFERENCES board_knowledge_submissions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_knowledge_articles_board_submission
  ON ai_knowledge_articles (board_knowledge_submission_id)
  WHERE board_knowledge_submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_articles_department_published
  ON ai_knowledge_articles (department_id, is_published, review_status);
