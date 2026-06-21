-- 184_ai_conversations_portal.sql
-- Phase 3 (portal-agent spec §9): extend ai_conversations with nullable portal columns so the client
-- portal co-pilot reuses ONE conversation engine. Agency rows leave these null; portal rows set both.
-- client_user_id = client_users.id (the portal user); client_id = agency_clients.id (the tenant key).
-- Additive only. user_id stays NOT NULL for agency rows, so portal rows reuse it as the client_user_id
-- mirror is avoided — instead user_id is made nullable to admit portal conversations that have no
-- team_members owner.

ALTER TABLE ai_conversations ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS client_user_id UUID;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS client_id UUID;

CREATE INDEX IF NOT EXISTS idx_ai_conversations_client_user
  ON ai_conversations(client_user_id) WHERE client_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_conversations_client
  ON ai_conversations(client_id) WHERE client_id IS NOT NULL;
