-- ============================================
-- Enhanced @Mentions System with Teams/Groups
-- ============================================

-- ============================================
-- 1. Mention Types Lookup Table
-- ============================================
CREATE TABLE IF NOT EXISTS mention_types (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(50) DEFAULT 'i-lucide-users',
  category VARCHAR(50) NOT NULL CHECK (category IN ('person', 'team', 'special')),
  description TEXT,
  requires_resolution BOOLEAN DEFAULT true -- Whether to expand to individual users
);

-- Insert default mention types
INSERT INTO mention_types (id, name, icon, category, description, requires_resolution) VALUES
  ('user', 'Person', 'i-lucide-user', 'person', 'Individual team member', true),
  ('board', 'Everyone on this board', 'i-lucide-users', 'team', 'All members of this board/department', true),
  ('item', 'Everyone on this item', 'i-lucide-file-text', 'team', 'All assignees and followers of this task', true),
  ('workspace', 'Everyone on this workspace', 'i-lucide-building', 'team', 'All workspace members', true),
  ('company', 'Everyone at company', 'i-lucide-building-2', 'team', 'All organization members', true),
  ('here', 'Active here', 'i-lucide-radio', 'special', 'All currently active users in this task', false),
  ('channel', 'All participants', 'i-lucide-message-circle', 'special', 'All task participants', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. Enhanced Mentions Table
-- ============================================
ALTER TABLE task_comment_mentions 
  ADD COLUMN IF NOT EXISTS mention_type VARCHAR(50) DEFAULT 'user' REFERENCES mention_types(id),
  ADD COLUMN IF NOT EXISTS resolved_user_ids UUID[] DEFAULT '{}', -- Array of user IDs for team mentions
  ADD COLUMN IF NOT EXISTS resolution_expires_at TIMESTAMPTZ; -- When to recalculate team members

-- ============================================
-- 3. Task Subscribers/Followers Table
-- ============================================
CREATE TABLE IF NOT EXISTS task_subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  notify_on_all_comments BOOLEAN DEFAULT false, -- Get all updates or just mentions
  UNIQUE(task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_subscribers_task ON task_subscribers(task_id);
CREATE INDEX IF NOT EXISTS idx_task_subscribers_user ON task_subscribers(user_id);

-- ============================================
-- 4. Function: Resolve Team Mentions to Users
-- ============================================
CREATE OR REPLACE FUNCTION resolve_team_mention(
  p_mention_type VARCHAR(50),
  p_task_id UUID,
  p_board_id UUID DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL
)
RETURNS TABLE (user_id UUID) AS $$
BEGIN
  CASE p_mention_type
    WHEN 'board' THEN
      -- Everyone on this board (department members)
      RETURN QUERY
      SELECT DISTINCT dm.team_member_id
      FROM department_members dm
      WHERE dm.department_id = p_board_id;
      
    WHEN 'item' THEN
      -- Everyone on this task (assignees + subscribers)
      RETURN QUERY
      SELECT t.assignee_id FROM tasks t WHERE t.id = p_task_id AND t.assignee_id IS NOT NULL
      UNION
      SELECT ts.user_id FROM task_subscribers ts WHERE ts.task_id = p_task_id
      UNION
      SELECT t.user_id FROM task_activities t WHERE t.task_id = p_task_id AND t.activity_type = 'comment';
      
    WHEN 'workspace' THEN
      -- All workspace members (placeholder - depends on workspace structure)
      RETURN QUERY
      SELECT DISTINCT dm.team_member_id
      FROM department_members dm
      JOIN departments d ON dm.department_id = d.id
      WHERE d.workspace_id = p_workspace_id OR d.workspace_id IS NOT NULL;
      
    WHEN 'company' THEN
      -- All active team members
      RETURN QUERY
      SELECT tm.id FROM team_members tm WHERE tm.is_active = true;
      
    WHEN 'here' THEN
      -- Currently active (handled differently - no stored resolution)
      RETURN QUERY SELECT NULL::UUID WHERE false;
      
    WHEN 'channel' THEN
      -- All participants
      RETURN QUERY
      SELECT t.user_id FROM task_activities t WHERE t.task_id = p_task_id AND t.activity_type = 'comment'
      UNION
      SELECT ts.user_id FROM task_subscribers ts WHERE ts.task_id = p_task_id
      UNION
      SELECT t.assignee_id FROM tasks t WHERE t.id = p_task_id AND t.assignee_id IS NOT NULL;
      
    ELSE
      -- Default: return empty
      RETURN QUERY SELECT NULL::UUID WHERE false;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. Function: Process Mentions with Team Support
-- ============================================
CREATE OR REPLACE FUNCTION process_comment_mentions_v2()
RETURNS TRIGGER AS $$
DECLARE
  mention RECORD;
  mentioned_user_id UUID;
  mention_type_record RECORD;
  resolved_users UUID[];
  board_id UUID;
  workspace_id UUID;
BEGIN
  -- Only process for comment activity type
  IF NEW.activity_type != 'comment' THEN
    RETURN NEW;
  END IF;

  -- Get board/workspace context
  SELECT t.department_id, d.workspace_id 
  INTO board_id, workspace_id
  FROM tasks t
  LEFT JOIN departments d ON t.department_id = d.id
  WHERE t.id = NEW.task_id;

  -- Delete existing mentions for this comment (in case of edit)
  DELETE FROM task_comment_mentions WHERE comment_id = NEW.id;

  -- Extract and create mentions
  FOR mention IN SELECT * FROM extract_mentions(NEW.content)
  LOOP
    -- Determine mention type and resolve
    resolved_users := ARRAY[]::UUID[];
    
    -- Check for team mentions first
    SELECT * INTO mention_type_record
    FROM mention_types mt
    WHERE LOWER(mention.username) = LOWER(mt.name)
       OR LOWER(mention.username) LIKE LOWER('%' || mt.id || '%')
    LIMIT 1;
    
    IF FOUND AND mention_type_record.requires_resolution THEN
      -- Team mention - resolve to users
      SELECT ARRAY_AGG(user_id) INTO resolved_users
      FROM resolve_team_mention(mention_type_record.id, NEW.task_id, board_id, workspace_id);
      
      -- Create team mention record
      INSERT INTO task_comment_mentions (
        comment_id, 
        mentioned_user_id, 
        mentioned_by_user_id, 
        mention_text,
        mention_type,
        resolved_user_ids,
        resolution_expires_at
      ) VALUES (
        NEW.id, 
        NULL, -- Team mentions have no single user
        NEW.user_id, 
        mention.mention_text,
        mention_type_record.id,
        resolved_users,
        NOW() + INTERVAL '1 hour'
      );
      
      -- Create notifications for all resolved users
      FOR mentioned_user_id IN SELECT unnest(resolved_users)
      LOOP
        IF mentioned_user_id IS NOT NULL AND mentioned_user_id != NEW.user_id THEN
          INSERT INTO notifications (
            user_id, type, title, message, link, actor_id, metadata
          ) VALUES (
            mentioned_user_id,
            'task_mentioned',
            'You were mentioned in a comment',
            format('You were mentioned by %s in "%s"', 
              (SELECT name FROM team_members WHERE id = NEW.user_id),
              mention_type_record.name
            ),
            '/agency/boards/' || COALESCE(
              (SELECT slug FROM departments WHERE id = board_id),
              board_id::text
            ) || '?task=' || NEW.task_id,
            NEW.user_id,
            jsonb_build_object(
              'taskId', NEW.task_id, 
              'commentId', NEW.id,
              'mentionType', mention_type_record.id,
              'isTeamMention', true
            )
          );
        END IF;
      END LOOP;
      
    ELSE
      -- Individual user mention
      SELECT tm.id INTO mentioned_user_id
      FROM team_members tm
      WHERE LOWER(tm.name) = LOWER(mention.username)
         OR LOWER(SPLIT_PART(tm.email, '@', 1)) = LOWER(mention.username)
      LIMIT 1;

      IF mentioned_user_id IS NOT NULL AND mentioned_user_id != NEW.user_id THEN
        -- Create mention record
        INSERT INTO task_comment_mentions (
          comment_id, mentioned_user_id, mentioned_by_user_id, 
          mention_text, mention_type
        ) VALUES (
          NEW.id, mentioned_user_id, NEW.user_id, 
          mention.mention_text, 'user'
        )
        ON CONFLICT DO NOTHING;

        -- Create notification
        INSERT INTO notifications (
          user_id, type, title, message, link, actor_id, metadata
        ) VALUES (
          mentioned_user_id,
          'task_mentioned',
          'You were mentioned in a comment',
          format('%s mentioned you', (SELECT name FROM team_members WHERE id = NEW.user_id)),
          '/agency/boards/' || COALESCE(
            (SELECT slug FROM departments WHERE id = board_id),
            board_id::text
          ) || '?task=' || NEW.task_id,
          NEW.user_id,
          jsonb_build_object('taskId', NEW.task_id, 'commentId', NEW.id)
        );
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace old trigger with new one
DROP TRIGGER IF EXISTS trigger_process_mentions ON task_activities;
CREATE TRIGGER trigger_process_mentions_v2
  AFTER INSERT OR UPDATE OF content ON task_activities
  FOR EACH ROW
  WHEN (NEW.activity_type = 'comment')
  EXECUTE FUNCTION process_comment_mentions_v2();

-- ============================================
-- 6. API Helper: Get Mention Suggestions
-- ============================================
CREATE OR REPLACE FUNCTION get_mention_suggestions(
  p_query TEXT,
  p_task_id UUID,
  p_board_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  type VARCHAR(50),
  category VARCHAR(50),
  icon VARCHAR(50),
  subtitle TEXT,
  is_team BOOLEAN
) AS $$
BEGIN
  -- Individual users
  RETURN QUERY
  SELECT 
    tm.id::TEXT as id,
    tm.name,
    'user'::VARCHAR(50) as type,
    'person'::VARCHAR(50) as category,
    'i-lucide-user'::VARCHAR(50) as icon,
    tm.email as subtitle,
    false as is_team
  FROM team_members tm
  WHERE tm.is_active = true
    AND (
      LOWER(tm.name) LIKE LOWER(p_query || '%')
      OR LOWER(tm.email) LIKE LOWER(p_query || '%')
      OR LOWER(SPLIT_PART(tm.name, ' ', 1)) LIKE LOWER(p_query || '%')
    )
  ORDER BY tm.name
  LIMIT p_limit;
  
  -- Team mentions
  RETURN QUERY
  SELECT 
    mt.id::TEXT as id,
    mt.name,
    mt.id::VARCHAR(50) as type,
    mt.category::VARCHAR(50),
    mt.icon::VARCHAR(50),
    mt.description as subtitle,
    true as is_team
  FROM mention_types mt
  WHERE mt.category = 'team'
    AND (
      LOWER(mt.name) LIKE LOWER('%' || p_query || '%')
      OR LOWER(mt.id) LIKE LOWER(p_query || '%')
    )
  ORDER BY mt.category, mt.name
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Statistics
-- ============================================
ANALYZE mention_types;
ANALYZE task_comment_mentions;
ANALYZE task_subscribers;
