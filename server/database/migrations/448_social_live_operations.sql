-- Retain provider changes independently of the original publication receipt.
CREATE TABLE IF NOT EXISTS social_live_operations (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE RESTRICT,
  provider_post_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('edit','remove')),
  status TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','uncertain')),
  before_message TEXT NOT NULL,
  after_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS social_live_one_unresolved_target
  ON social_live_operations(post_id,account_id) WHERE status IN ('pending','uncertain');
CREATE INDEX IF NOT EXISTS social_live_post_history
  ON social_live_operations(client_id,post_id,created_at DESC);
