-- ============================================
-- Task Comments, Mentions & Reactions Schema
-- Phase 1: Database Foundation
-- ============================================

-- ============================================
-- 1. Enhance task_activities for threaded comments
-- ============================================
ALTER TABLE task_activities 
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES task_activities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES team_members(id);

-- Index for threaded queries
CREATE INDEX IF NOT EXISTS idx_task_activities_parent ON task_activities(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_activities_thread ON task_activities(task_id, parent_id, created_at DESC);

-- ============================================
-- 2. Comment Mentions Table
-- ============================================
CREATE TABLE IF NOT EXISTS task_comment_mentions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id UUID NOT NULL REFERENCES task_activities(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  mentioned_by_user_id UUID NOT NULL REFERENCES team_members(id),
  mention_text TEXT NOT NULL, -- The @username or @Name that was used
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_mentions_comment ON task_comment_mentions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_user ON task_comment_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_created ON task_comment_mentions(created_at);

-- ============================================
-- 3. Comment Reactions/Likes Table
-- ============================================
CREATE TABLE IF NOT EXISTS task_comment_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id UUID NOT NULL REFERENCES task_activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  reaction_type VARCHAR(50) DEFAULT 'like' CHECK (reaction_type IN ('like', 'heart', 'thumbs_up', 'thumbs_down', 'laugh', 'sad')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, user_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON task_comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_user ON task_comment_reactions(user_id);

-- ============================================
-- 4. Function: Extract mentions from content
-- ============================================
CREATE OR REPLACE FUNCTION extract_mentions(content_text TEXT)
RETURNS TABLE (mention_text TEXT, username TEXT) AS $$
BEGIN
  -- Extract @username or @First Last patterns
  RETURN QUERY
  SELECT 
    regexp_matches[1] as mention_text,
    regexp_replace(regexp_matches[1], '^@', '') as username
  FROM regexp_matches(content_text, '@([A-Za-z0-9_]+|(?:[A-Za-z]+\s+[A-Za-z]+))', 'gi') as regexp_matches;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. Function: Create mentions from comment
-- ============================================
CREATE OR REPLACE FUNCTION process_comment_mentions()
RETURNS TRIGGER AS $$
DECLARE
  mention RECORD;
  mentioned_user_id UUID;
BEGIN
  -- Only process for comment activity type
  IF NEW.activity_type != 'comment' THEN
    RETURN NEW;
  END IF;

  -- Delete existing mentions for this comment (in case of edit)
  DELETE FROM task_comment_mentions WHERE comment_id = NEW.id;

  -- Extract and create mentions
  FOR mention IN SELECT * FROM extract_mentions(NEW.content)
  LOOP
    -- Try to find user by name (first+last) or email prefix
    SELECT tm.id INTO mentioned_user_id
    FROM team_members tm
    WHERE 
      -- Match by first+last name
      LOWER(tm.name) = LOWER(mention.username)
      -- Or match by email prefix
      OR LOWER(SPLIT_PART(tm.email, '@', 1)) = LOWER(mention.username)
    LIMIT 1;

    IF mentioned_user_id IS NOT NULL AND mentioned_user_id != NEW.user_id THEN
      -- Create mention record
      INSERT INTO task_comment_mentions (comment_id, mentioned_user_id, mentioned_by_user_id, mention_text)
      VALUES (NEW.id, mentioned_user_id, NEW.user_id, mention.mention_text)
      ON CONFLICT DO NOTHING;

      -- Create notification for mention
      INSERT INTO notifications (user_id, type, title, message, link, actor_id, metadata)
      VALUES (
        mentioned_user_id,
        'task_mentioned',
        'You were mentioned in a comment',
        'Someone mentioned you in a task comment',
        '/agency/boards/' || (SELECT d.slug FROM tasks t JOIN departments d ON t.department_id = d.id WHERE t.id = NEW.task_id) || '?task=' || NEW.task_id,
        NEW.user_id,
        jsonb_build_object('taskId', NEW.task_id, 'commentId', NEW.id)
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-process mentions on comment insert/update
DROP TRIGGER IF EXISTS trigger_process_mentions ON task_activities;
CREATE TRIGGER trigger_process_mentions
  AFTER INSERT OR UPDATE OF content ON task_activities
  FOR EACH ROW
  WHEN (NEW.activity_type = 'comment')
  EXECUTE FUNCTION process_comment_mentions();

-- ============================================
-- 6. View: Comments with metadata
-- ============================================
CREATE OR REPLACE VIEW v_task_comments AS
SELECT 
  ta.id,
  ta.task_id,
  ta.user_id as author_id,
  tm.name as author_name,
  tm.avatar_url as author_avatar,
  ta.parent_id,
  ta.content,
  ta.is_internal,
  ta.created_at,
  ta.edited_at,
  ta.is_deleted,
  -- Reaction counts
  COUNT(DISTINCT CASE WHEN tcr.reaction_type = 'like' THEN tcr.user_id END) as likes_count,
  -- Reply count
  (SELECT COUNT(*) FROM task_activities replies 
   WHERE replies.parent_id = ta.id 
   AND replies.activity_type = 'comment' 
   AND replies.is_deleted = false) as reply_count,
  -- Mentioned users
  (SELECT jsonb_agg(jsonb_build_object(
    'userId', tcm.mentioned_user_id,
    'name', tm2.name,
    'mentionText', tcm.mention_text
  ))
  FROM task_comment_mentions tcm
  JOIN team_members tm2 ON tcm.mentioned_user_id = tm2.id
  WHERE tcm.comment_id = ta.id
  ) as mentions
FROM task_activities ta
JOIN team_members tm ON ta.user_id = tm.id
LEFT JOIN task_comment_reactions tcr ON tcr.comment_id = ta.id
WHERE ta.activity_type = 'comment'
  AND ta.is_deleted = false
GROUP BY ta.id, ta.task_id, ta.user_id, tm.name, tm.avatar_url, 
         ta.parent_id, ta.content, ta.is_internal, ta.created_at, ta.edited_at, ta.is_deleted;

-- ============================================
-- 7. Statistics update
-- ============================================
ANALYZE task_activities;
ANALYZE task_comment_mentions;
ANALYZE task_comment_reactions;
