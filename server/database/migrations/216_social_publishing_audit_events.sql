-- 216_social_publishing_audit_events.sql
-- Durable audit trail for organic social publishing workflow actions.

CREATE TABLE IF NOT EXISTS social_publishing_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  social_account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_publishing_audit_client
  ON social_publishing_audit_events(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_publishing_audit_post
  ON social_publishing_audit_events(post_id, created_at DESC)
  WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_publishing_audit_account
  ON social_publishing_audit_events(social_account_id, created_at DESC)
  WHERE social_account_id IS NOT NULL;
