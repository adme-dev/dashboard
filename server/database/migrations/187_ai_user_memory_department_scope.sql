-- 187_ai_user_memory_department_scope.sql
-- Phase 4 (observe-and-learn spec §4b): the missing middle memory tier. ai_user_memory already has a
-- `scope` (user|org); add `scope_ref` so a 'department'-scoped memory can name WHICH department it
-- belongs to (= departments.id). Personal rows keep scope='user', scope_ref NULL; org rows scope='org',
-- scope_ref NULL; department rows scope='department', scope_ref = department_id. Additive.
-- Sharing is by READ scope, never by relaxing per-user isolation: personal stays user_id-scoped;
-- department/org are intentionally shared and curated (promotion is human-gated — DS-2).

ALTER TABLE ai_user_memory ADD COLUMN IF NOT EXISTS scope_ref UUID;

CREATE INDEX IF NOT EXISTS idx_ai_user_memory_dept_scope
  ON ai_user_memory(scope, scope_ref) WHERE scope <> 'user';
