-- ============================================
-- Migration: Fix Slow Queries Performance
-- ============================================
-- Issue: Multiple UPDATE and SELECT queries were taking 200-1600ms
-- Root causes: Missing indexes for timestamp columns and foreign key lookups

-- ============================================
-- 1. Fix UPDATE user_sessions SET last_used_at queries (was 242-420ms)
-- ============================================
-- The UPDATE by primary key is fast, but adding an index on last_used_at 
-- helps with the cleanup function that deletes expired sessions
CREATE INDEX IF NOT EXISTS idx_sessions_last_used ON user_sessions(last_used_at);

-- ============================================
-- 2. Fix UPDATE team_members SET last_active_at queries (was 248-420ms, 1047ms)
-- ============================================
-- Adding index on last_active_at helps with queries that filter/order by activity time
CREATE INDEX IF NOT EXISTS idx_team_members_last_active ON team_members(last_active_at);

-- ============================================
-- 3. Optimize SELECT with JOIN on user_sessions (was 1035ms, 1400-1500ms)
-- ============================================
-- The query joins user_sessions with team_members on user_id
-- An index on user_id already exists (idx_sessions_user), but we can add 
-- a covering index that includes expires_at for the WHERE clause
DROP INDEX IF EXISTS idx_sessions_user;
CREATE INDEX IF NOT EXISTS idx_sessions_user_covering ON user_sessions(user_id) INCLUDE (token_hash, expires_at, last_used_at);

-- ============================================
-- 4. Optimize departments slug lookup (was 246ms, 312ms)
-- ============================================
-- idx_departments_slug already exists, but we can add a covering index
-- that includes commonly selected columns to avoid table lookups
DROP INDEX IF EXISTS idx_departments_slug;
CREATE INDEX IF NOT EXISTS idx_departments_slug_covering ON departments(slug) INCLUDE (name, color, icon);

-- ============================================
-- 5. Additional optimization: Composite index for session validation
-- ============================================
-- This helps the main session validation query that filters by token_hash and expires_at
DROP INDEX IF EXISTS idx_sessions_token;
CREATE INDEX IF NOT EXISTS idx_sessions_token_expires ON user_sessions(token_hash, expires_at);

-- ============================================
-- 6. Optimize team_members primary key lookups with common columns
-- ============================================
-- The validateSession query selects several columns from team_members after the join
CREATE INDEX IF NOT EXISTS idx_team_members_email_lookup ON team_members(id) INCLUDE (email, name, user_role, avatar_url, department_id);

-- ============================================
-- 7. Fix workspaces query (was 699-1488ms)
-- ============================================
-- Check if workspaces table exists and add indexes
DO $$
BEGIN
  -- Check if workspaces table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspaces') THEN
    -- Index for workspace lookups
    CREATE INDEX IF NOT EXISTS idx_workspaces_active ON workspaces(is_active) WHERE is_active = true;
    CREATE INDEX IF NOT EXISTS idx_workspaces_sort ON workspaces(sort_order, name);
    
    -- Check if departments has workspace_id column
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'departments' AND column_name = 'workspace_id') THEN
      CREATE INDEX IF NOT EXISTS idx_departments_workspace ON departments(workspace_id) WHERE is_active = true;
    END IF;
  END IF;
END $$;

-- ============================================
-- 8. Fix tasks query for workspace/board views (was 467-523ms)
-- ============================================
-- The tasks query likely filters by department_id frequently
-- idx_tasks_department already exists but let's ensure it's being used
-- Also add a composite index for department + status queries which are common
CREATE INDEX IF NOT EXISTS idx_tasks_dept_status_covering ON tasks(department_id, status_id) INCLUDE (title, description, due_date, priority);

-- ============================================
-- Statistics update for query planner
-- ============================================
ANALYZE user_sessions;
ANALYZE team_members;
ANALYZE departments;
ANALYZE workspaces;
ANALYZE tasks;
