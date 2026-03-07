-- 062-custom-roles-permissions.sql
-- Custom roles & permissions management system
-- Adds dynamic role definitions with configurable permission groups

BEGIN;

-- 1. Custom roles table
CREATE TABLE IF NOT EXISTS custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  color VARCHAR(7) DEFAULT '#6366f1',
  icon VARCHAR(100) DEFAULT 'i-lucide-user',
  is_system BOOLEAN DEFAULT false,
  is_read_only BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_roles_slug ON custom_roles(slug);
CREATE INDEX IF NOT EXISTS idx_custom_roles_is_system ON custom_roles(is_system);

-- 2. Role permission groups junction table
CREATE TABLE IF NOT EXISTS role_permission_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
  permission_group VARCHAR(50) NOT NULL,
  UNIQUE(role_id, permission_group)
);

CREATE INDEX IF NOT EXISTS idx_role_permission_groups_role_id ON role_permission_groups(role_id);

-- 3. Add custom_role_id to team_members
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES custom_roles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_team_members_custom_role_id ON team_members(custom_role_id);

-- 4. Add custom_role_id to team_invitations (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_invitations') THEN
    ALTER TABLE team_invitations ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES custom_roles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Seed 15 system roles
INSERT INTO custom_roles (name, slug, description, color, icon, is_system, is_read_only, sort_order)
VALUES
  ('Owner',           'owner',           'Full platform control. Cannot be removed.',                    '#dc2626', 'i-lucide-crown',              true, false, 1),
  ('Admin',           'admin',           'Full operational access without billing control.',              '#ea580c', 'i-lucide-shield',             true, false, 2),
  ('Lead',            'lead',            'Team leads with approval authority.',                           '#d97706', 'i-lucide-star',               true, false, 3),
  ('Project Manager', 'project_manager', 'Project oversight with pricing and brief template access.',     '#ca8a04', 'i-lucide-folder-kanban',      true, false, 4),
  ('Account Manager', 'account_manager', 'Client-facing role with project and brief access.',             '#65a30d', 'i-lucide-handshake',          true, false, 5),
  ('Creative',        'creative',        'Designers, art directors and copywriters.',                     '#059669', 'i-lucide-palette',            true, false, 6),
  ('Media Buyer',     'media_buyer',     'Ad platform management and spend tracking.',                   '#0891b2', 'i-lucide-megaphone',          true, false, 7),
  ('Producer',        'producer',        'Production coordination and task management.',                  '#0284c7', 'i-lucide-clapperboard',       true, false, 8),
  ('Finance',         'finance',         'Financial operations and reporting.',                           '#4f46e5', 'i-lucide-calculator',         true, false, 9),
  ('Accounts',        'accounts',        'Bookkeeping, accounts payable and receivable.',                 '#7c3aed', 'i-lucide-receipt',            true, false, 10),
  ('Developer',       'developer',       'R&D and technical team members.',                               '#9333ea', 'i-lucide-code',               true, false, 11),
  ('Sales',           'sales',           'Business development with client and invoice access.',           '#c026d3', 'i-lucide-badge-dollar-sign',  true, false, 12),
  ('Member',          'member',          'Standard team member with day-to-day access.',                   '#6366f1', 'i-lucide-user',               true, false, 13),
  ('Viewer',          'viewer',          'Read-only access to boards and projects.',                       '#78716c', 'i-lucide-eye',                true, true,  14),
  ('Guest',           'guest',           'Limited external collaborator access.',                          '#a8a29e', 'i-lucide-user-round',         true, true,  15)
ON CONFLICT (slug) DO NOTHING;

-- 6. Seed permission groups for each system role
-- Helper: insert permission groups for a role by slug
DO $$
DECLARE
  v_role_id UUID;
BEGIN
  -- Owner: ALL 9 groups
  SELECT id INTO v_role_id FROM custom_roles WHERE slug = 'owner';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_permission_groups (role_id, permission_group) VALUES
      (v_role_id, 'ADMIN'), (v_role_id, 'MANAGEMENT'), (v_role_id, 'FINANCE'),
      (v_role_id, 'SALES'), (v_role_id, 'CLIENTS'), (v_role_id, 'CREATIVE'),
      (v_role_id, 'MEDIA_BUYING'), (v_role_id, 'TIME_APPROVALS'), (v_role_id, 'AUTOMATION')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Admin: ALL 9 groups
  SELECT id INTO v_role_id FROM custom_roles WHERE slug = 'admin';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_permission_groups (role_id, permission_group) VALUES
      (v_role_id, 'ADMIN'), (v_role_id, 'MANAGEMENT'), (v_role_id, 'FINANCE'),
      (v_role_id, 'SALES'), (v_role_id, 'CLIENTS'), (v_role_id, 'CREATIVE'),
      (v_role_id, 'MEDIA_BUYING'), (v_role_id, 'TIME_APPROVALS'), (v_role_id, 'AUTOMATION')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Lead: 8 groups (no ADMIN)
  SELECT id INTO v_role_id FROM custom_roles WHERE slug = 'lead';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_permission_groups (role_id, permission_group) VALUES
      (v_role_id, 'MANAGEMENT'), (v_role_id, 'FINANCE'), (v_role_id, 'SALES'),
      (v_role_id, 'CLIENTS'), (v_role_id, 'CREATIVE'), (v_role_id, 'MEDIA_BUYING'),
      (v_role_id, 'TIME_APPROVALS'), (v_role_id, 'AUTOMATION')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Project Manager: 8 groups (no ADMIN)
  SELECT id INTO v_role_id FROM custom_roles WHERE slug = 'project_manager';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_permission_groups (role_id, permission_group) VALUES
      (v_role_id, 'MANAGEMENT'), (v_role_id, 'FINANCE'), (v_role_id, 'SALES'),
      (v_role_id, 'CLIENTS'), (v_role_id, 'CREATIVE'), (v_role_id, 'MEDIA_BUYING'),
      (v_role_id, 'TIME_APPROVALS'), (v_role_id, 'AUTOMATION')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Account Manager: CLIENTS, MEDIA_BUYING
  SELECT id INTO v_role_id FROM custom_roles WHERE slug = 'account_manager';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_permission_groups (role_id, permission_group) VALUES
      (v_role_id, 'CLIENTS'), (v_role_id, 'MEDIA_BUYING')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Creative: CREATIVE
  SELECT id INTO v_role_id FROM custom_roles WHERE slug = 'creative';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_permission_groups (role_id, permission_group) VALUES
      (v_role_id, 'CREATIVE')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Media Buyer: MEDIA_BUYING
  SELECT id INTO v_role_id FROM custom_roles WHERE slug = 'media_buyer';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_permission_groups (role_id, permission_group) VALUES
      (v_role_id, 'MEDIA_BUYING')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Producer: CREATIVE
  SELECT id INTO v_role_id FROM custom_roles WHERE slug = 'producer';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_permission_groups (role_id, permission_group) VALUES
      (v_role_id, 'CREATIVE')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Finance: FINANCE
  SELECT id INTO v_role_id FROM custom_roles WHERE slug = 'finance';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_permission_groups (role_id, permission_group) VALUES
      (v_role_id, 'FINANCE')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Accounts: FINANCE
  SELECT id INTO v_role_id FROM custom_roles WHERE slug = 'accounts';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_permission_groups (role_id, permission_group) VALUES
      (v_role_id, 'FINANCE')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Developer: no groups
  -- Sales: SALES, CLIENTS
  SELECT id INTO v_role_id FROM custom_roles WHERE slug = 'sales';
  IF v_role_id IS NOT NULL THEN
    INSERT INTO role_permission_groups (role_id, permission_group) VALUES
      (v_role_id, 'SALES'), (v_role_id, 'CLIENTS')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Member: no groups
  -- Viewer: no groups (is_read_only=true)
  -- Guest: no groups (is_read_only=true)
END $$;

-- 7. Backfill team_members.custom_role_id from existing user_role
UPDATE team_members tm
SET custom_role_id = cr.id
FROM custom_roles cr
WHERE cr.slug = tm.user_role::text
  AND tm.custom_role_id IS NULL;

-- 8. View: roles with aggregated permission groups
CREATE OR REPLACE VIEW v_roles_with_permissions AS
SELECT
  cr.id,
  cr.name,
  cr.slug,
  cr.description,
  cr.color,
  cr.icon,
  cr.is_system,
  cr.is_read_only,
  cr.sort_order,
  cr.created_by,
  cr.created_at,
  cr.updated_at,
  COALESCE(
    array_agg(rpg.permission_group ORDER BY rpg.permission_group)
    FILTER (WHERE rpg.permission_group IS NOT NULL),
    '{}'
  ) AS permission_groups
FROM custom_roles cr
LEFT JOIN role_permission_groups rpg ON rpg.role_id = cr.id
GROUP BY cr.id;

COMMIT;
