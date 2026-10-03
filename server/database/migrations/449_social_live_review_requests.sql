-- A decision authorises one immutable proposed change, never the original publication.
CREATE TABLE IF NOT EXISTS social_live_review_requests (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE RESTRICT,
  provider_post_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('edit','remove')),
  before_message TEXT NOT NULL,
  after_message TEXT,
  post_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revision_requested','superseded','submitted')),
  responded_by TEXT,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  responded_at TIMESTAMPTZ,
  CHECK ((action='edit' AND after_message IS NOT NULL AND length(after_message) BETWEEN 1 AND 10000) OR (action='remove' AND after_message IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS social_live_review_open_target
  ON social_live_review_requests(post_id,account_id) WHERE status IN ('pending','approved');
CREATE INDEX IF NOT EXISTS social_live_review_client
  ON social_live_review_requests(client_id,created_at DESC);
