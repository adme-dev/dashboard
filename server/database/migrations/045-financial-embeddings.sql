-- 045-financial-embeddings.sql
-- Widen ai_embeddings_log.entity_id from UUID to TEXT
-- to support string-based financial embedding IDs (e.g. 'fin-expenses-2026-03')

ALTER TABLE ai_embeddings_log ALTER COLUMN entity_id TYPE TEXT;
