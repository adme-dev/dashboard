ALTER TABLE social_conversations
  ADD COLUMN IF NOT EXISTS source_post_id text,
  ADD COLUMN IF NOT EXISTS source_post_url text,
  ADD COLUMN IF NOT EXISTS source_post_title text,
  ADD COLUMN IF NOT EXISTS source_post_content text,
  ADD COLUMN IF NOT EXISTS source_post_media jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_post_author_name text,
  ADD COLUMN IF NOT EXISTS source_post_author_avatar_url text,
  ADD COLUMN IF NOT EXISTS source_post_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS linked_social_post_id uuid REFERENCES social_posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_social_conversations_source_post
  ON social_conversations(client_id, platform, source_post_id)
  WHERE source_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_conversations_source_post_url
  ON social_conversations(client_id, source_post_url)
  WHERE source_post_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_conversations_linked_social_post
  ON social_conversations(client_id, linked_social_post_id)
  WHERE linked_social_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_conversations_last_message
  ON social_conversations(client_id, last_message_at DESC);
