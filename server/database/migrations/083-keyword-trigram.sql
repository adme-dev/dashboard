-- 083-keyword-trigram.sql
-- Phase F polish: push keyword matching from app-side scan to a SQL-level
-- filter, using pg_trgm to index LOWER(keyword) so the dispatcher can
-- ask Postgres "which keywords does this haystack contain?" instead of
-- pulling every row.
--
-- The query the dispatcher will run:
--   SELECT user_id, keyword FROM keyword_subscriptions
--   WHERE LOWER($1) LIKE '%' || LOWER(keyword) || '%'
--
-- The trigram GIN index lets PG short-circuit the LIKE evaluation by
-- only checking rows whose 3-grams overlap with the haystack.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_keyword_subs_keyword_trgm
  ON keyword_subscriptions USING gin (LOWER(keyword) gin_trgm_ops);

COMMIT;
