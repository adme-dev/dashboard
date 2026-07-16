-- 253_social_news_client_item_states.sql
-- A source story is shared and immutable; selection/use/dismissal belongs to a client.
CREATE TABLE IF NOT EXISTS social_news_client_item_states (
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  news_item_id UUID NOT NULL REFERENCES social_news_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'selected', 'dismissed', 'used')),
  linked_post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, news_item_id)
);

CREATE INDEX IF NOT EXISTS idx_social_news_client_item_state_status
  ON social_news_client_item_states (client_id, status, updated_at DESC);

-- Preserve any pre-client-state uses made by the first release where the linked post identifies the client.
INSERT INTO social_news_client_item_states (client_id, news_item_id, status, linked_post_id)
SELECT p.client_id, n.id, n.status, n.linked_post_id
  FROM social_news_items n
  JOIN social_posts p ON p.id = n.linked_post_id
 WHERE n.linked_post_id IS NOT NULL AND n.status IN ('selected', 'dismissed', 'used')
ON CONFLICT (client_id, news_item_id) DO NOTHING;
