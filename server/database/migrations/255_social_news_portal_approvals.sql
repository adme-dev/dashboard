-- 255_social_news_portal_approvals.sql
-- Client portal decisions are a distinct gate from internal publishing approval.
-- A client approval never changes social_posts.status or approved_at.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS client_approval_status TEXT,
  ADD COLUMN IF NOT EXISTS client_approval_responded_by TEXT,
  ADD COLUMN IF NOT EXISTS client_approval_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_approval_feedback TEXT;

DO $$
BEGIN
  ALTER TABLE social_posts
    ADD CONSTRAINT social_posts_client_approval_status_check
    CHECK (client_approval_status IN ('pending', 'approved', 'rejected', 'revision_requested'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_social_posts_client_approval
  ON social_posts (client_id, client_approval_status, approval_requested_at DESC)
  WHERE metadata->>'source' = 'mcp_news' AND approval_requested_at IS NOT NULL;

-- Preserve source attribution as it appeared when the draft was created. New
-- drafts write this snapshot at insert time; this backfills existing news posts.
UPDATE social_posts post
   SET metadata = jsonb_set(
     post.metadata,
     '{newsAttribution}',
     jsonb_build_object(
       'title', news.title,
       'url', news.source_url,
       'author', news.author,
       'publishedAt', news.published_at
     ),
     TRUE
   )
  FROM social_news_items news
 WHERE post.metadata->>'source' = 'mcp_news'
   AND news.id::text = post.metadata->>'newsItemId'
   AND NOT (post.metadata ? 'newsAttribution');

-- Existing requested, unpublished news posts enter the client queue. Posts that
-- have already cleared internal approval are deliberately not reopened.
UPDATE social_posts
   SET client_approval_status = 'pending'
 WHERE metadata->>'source' = 'mcp_news'
   AND approval_requested_at IS NOT NULL
   AND approved_at IS NULL
   AND client_approval_status IS NULL;

ALTER TABLE social_news_feedback_events
  DROP CONSTRAINT IF EXISTS social_news_feedback_events_event_type_check;
ALTER TABLE social_news_feedback_events
  ADD CONSTRAINT social_news_feedback_events_event_type_check CHECK (event_type IN (
    'selected', 'dismissed', 'rewritten', 'drafted', 'scheduled',
    'approval_requested', 'approved', 'rejected', 'revision_requested',
    'published', 'failed', 'performance'
  ));
