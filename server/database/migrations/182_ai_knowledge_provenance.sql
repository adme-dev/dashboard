-- 182_ai_knowledge_provenance.sql
-- Phase 3 (command-center spec §3): agent KB contribution provenance + review state.
-- Additive only — agents PROPOSE knowledge as is_published=false drafts that a human reviews→publishes.
-- search_knowledge stays fail-closed to is_published=true, so drafts are never searchable until approved.

ALTER TABLE ai_knowledge_articles ADD COLUMN IF NOT EXISTS proposed_by_agent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ai_knowledge_articles ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved'; -- draft | approved | rejected
ALTER TABLE ai_knowledge_articles ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE ai_knowledge_articles ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Existing rows are already-published agency knowledge → leave them 'approved' (the default above).
-- New agent drafts are inserted with review_status='draft' AND is_published=false explicitly.
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_review_status ON ai_knowledge_articles(review_status);
