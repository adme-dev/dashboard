-- ============================================
-- Teams Schema for @Mentions
-- ============================================

-- ============================================
-- 1. Teams Table
-- ============================================
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT 'i-lucide-users', -- Lucide icon name
  color VARCHAR(7) DEFAULT '#6B7280', -- Hex color
  is_system BOOLEAN DEFAULT false, -- System teams like "Everyone" can't be deleted
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_active ON teams(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);

-- ============================================
-- 2. Team Members (Many-to-Many)
-- ============================================
CREATE TABLE IF NOT EXISTS team_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  added_by UUID REFERENCES team_members(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, team_member_id)
);

CREATE INDEX IF NOT EXISTS idx_team_memberships_team ON team_memberships(team_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_member ON team_memberships(team_member_id);

-- ============================================
-- 3. Create Default System Teams
-- ============================================
INSERT INTO teams (id, name, slug, description, icon, color, is_system) VALUES
  ('00000000-0000-0000-0000-000000000001', 'ADME Everyone', 'adme-everyone', 'All team members at ADME', 'i-lucide-building-2', '#3B82F6', true),
  ('00000000-0000-0000-0000-000000000002', 'Digital Advertising Team', 'digital-advertising', 'Digital advertising specialists', 'i-lucide-monitor', '#8B5CF6', false),
  ('00000000-0000-0000-0000-000000000003', 'Marketing Team', 'marketing', 'Marketing department', 'i-lucide-megaphone', '#EC4899', false),
  ('00000000-0000-0000-0000-000000000004', 'Production Team', 'production', 'Creative production team', 'i-lucide-palette', '#F59E0B', false),
  ('00000000-0000-0000-0000-000000000005', 'Social Media', 'social-media', 'Social media management', 'i-lucide-share-2', '#10B981', false),
  ('00000000-0000-0000-0000-000000000006', 'Toyota Team', 'toyota-team', 'Toyota account team', 'i-lucide-car', '#EF4444', false),
  ('00000000-0000-0000-0000-000000000007', 'Web Team', 'web-team', 'Web development team', 'i-lucide-globe', '#6366F1', false),
  ('00000000-0000-0000-0000-000000000008', 'Approval', 'approval', 'Approval workflow team', 'i-lucide-check-circle', '#14B8A6', false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color;

-- ============================================
-- 4. Add All Active Users to "ADME Everyone"
-- ============================================
INSERT INTO team_memberships (team_id, team_member_id, role)
SELECT 
  '00000000-0000-0000-0000-000000000001',
  tm.id,
  CASE WHEN tm.user_role IN ('owner', 'admin') THEN 'admin' ELSE 'member' END
FROM team_members tm
WHERE tm.is_active = true
ON CONFLICT (team_id, team_member_id) DO NOTHING;

-- ============================================
-- 5. Update Mention Types to Include Custom Teams
-- ============================================
-- Add 'custom_team' as a new mention type category
INSERT INTO mention_types (id, name, icon, category, description, requires_resolution)
VALUES ('custom_team', 'Custom Team', 'i-lucide-users', 'team', 'Custom created team', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 6. Enhanced Function: Get Mention Suggestions (WITH TEAMS)
-- ============================================
CREATE OR REPLACE FUNCTION get_mention_suggestions_v2(
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
  is_team BOOLEAN,
  color TEXT,
  member_count INTEGER
) AS $$
BEGIN
  -- Custom Teams (NEW - matches Monday.com)
  RETURN QUERY
  SELECT 
    t.id::TEXT,
    t.name,
    'team'::VARCHAR(50) as type,
    'team'::VARCHAR(50) as category,
    t.icon::VARCHAR(50),
    t.description as subtitle,
    true as is_team,
    t.color as color,
    (SELECT COUNT(*) FROM team_memberships tm WHERE tm.team_id = t.id)::INTEGER as member_count
  FROM teams t
  WHERE t.is_active = true
    AND (
      LOWER(t.name) LIKE LOWER('%' || p_query || '%')
      OR LOWER(t.slug) LIKE LOWER('%' || p_query || '%')
    )
  ORDER BY 
    CASE WHEN t.is_system THEN 0 ELSE 1 END,
    t.name
  LIMIT GREATEST(p_limit / 2, 5);
  
  -- Individual users
  RETURN QUERY
  SELECT 
    tm.id::TEXT,
    tm.name,
    'user'::VARCHAR(50) as type,
    'person'::VARCHAR(50) as category,
    'i-lucide-user'::VARCHAR(50) as icon,
    COALESCE(
      (SELECT string_agg(t.name, ', ') 
       FROM teams t 
       JOIN team_memberships tms ON t.id = tms.team_id 
       WHERE tms.team_member_id = tm.id 
       LIMIT 2),
      tm.email
    ) as subtitle,
    false as is_team,
    NULL::TEXT as color,
    NULL::INTEGER as member_count
  FROM team_members tm
  WHERE tm.is_active = true
    AND (
      LOWER(tm.name) LIKE LOWER(p_query || '%')
      OR LOWER(tm.email) LIKE LOWER(p_query || '%')
      OR LOWER(SPLIT_PART(tm.name, ' ', 1)) LIKE LOWER(p_query || '%')
    )
  ORDER BY tm.name
  LIMIT p_limit;
  
  -- System teams (generic mentions)
  RETURN QUERY
  SELECT 
    mt.id::TEXT,
    mt.name,
    mt.id::VARCHAR(50) as type,
    mt.category::VARCHAR(50),
    mt.icon::VARCHAR(50),
    mt.description as subtitle,
    true as is_team,
    '#6B7280'::TEXT as color,
    NULL::INTEGER as member_count
  FROM mention_types mt
  WHERE mt.category IN ('team', 'special')
    AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.id::TEXT = mt.id) -- Don't duplicate custom teams
    AND (
      LOWER(mt.name) LIKE LOWER('%' || p_query || '%')
      OR LOWER(mt.id) LIKE LOWER(p_query || '%')
    )
  ORDER BY mt.category, mt.name
  LIMIT 3;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Function: Resolve Custom Team Mentions
-- ============================================
CREATE OR REPLACE FUNCTION resolve_custom_team(
  p_team_id UUID
)
RETURNS TABLE (user_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT tm.team_member_id
  FROM team_memberships tm
  WHERE tm.team_id = p_team_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. View: Teams with Member Count
-- ============================================
CREATE OR REPLACE VIEW v_teams_with_members AS
SELECT 
  t.*,
  COUNT(tm.team_member_id) as member_count,
  ARRAY_AGG(
    jsonb_build_object(
      'id', tm_inner.id,
      'name', tm_inner.name,
      'email', tm_inner.email,
      'avatar_url', tm_inner.avatar_url,
      'role', tms.role
    )
  ) FILTER (WHERE tm_inner.id IS NOT NULL) as members
FROM teams t
LEFT JOIN team_memberships tms ON t.id = tms.team_id
LEFT JOIN team_members tm_inner ON tms.team_member_id = tm_inner.id
GROUP BY t.id;

-- ============================================
-- 9. Trigger: Update timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. Statistics
-- ============================================
ANALYZE teams;
ANALYZE team_memberships;
