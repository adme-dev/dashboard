-- 070-drive-agent-engineering-board.sql
-- Seed the "Drive Agent — Engineering" board (department) used to
-- track build / optimize / battle-test work for the promotion-knoxgwmhaval
-- project. Idempotent: skips if board already exists.

BEGIN;

DO $$
DECLARE
  v_dept_id UUID;
  v_owner_id UUID;
  v_workspace_id UUID;

  v_status_backlog UUID;
  v_status_in_build UUID;
  v_status_in_testing UUID;
  v_status_bugs UUID;
  v_status_optimization UUID;
  v_status_verified UUID;
  v_status_done UUID;

  v_grp_dealers UUID;
  v_grp_crm UUID;
  v_grp_marketing UUID;
  v_grp_email UUID;
  v_grp_ai UUID;
  v_grp_automation UUID;
  v_grp_commerce UUID;
  v_grp_system UUID;

  -- (group_id, section_title) pairs to insert
  r RECORD;
BEGIN
  -- Idempotency guard
  SELECT id INTO v_dept_id FROM departments WHERE slug = 'drive-agent-engineering';
  IF v_dept_id IS NOT NULL THEN
    RAISE NOTICE 'Drive Agent — Engineering board already exists (id=%). Skipping seed.', v_dept_id;
    RETURN;
  END IF;

  -- Pick first team member as default reporter
  SELECT id INTO v_owner_id FROM team_members ORDER BY created_at LIMIT 1;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'No team_members exist - create one before seeding this board';
  END IF;

  -- Default to "Main" workspace; fallback to first workspace if Main missing
  SELECT id INTO v_workspace_id FROM workspaces WHERE slug = 'main';
  IF v_workspace_id IS NULL THEN
    SELECT id INTO v_workspace_id FROM workspaces ORDER BY created_at LIMIT 1;
  END IF;

  -- 1. Create the board
  INSERT INTO departments (name, slug, description, color, icon, workspace_id, is_active, sort_order)
  VALUES (
    'Drive Agent — Engineering',
    'drive-agent-engineering',
    'Build, optimize, and battle-test the Drive Agent (promotion-knoxgwmhaval) platform. ' ||
    'Items map to admin sections; subtasks are the standard test checklist.',
    '#6366F1',
    'wrench',
    v_workspace_id,
    true,
    999
  )
  RETURNING id INTO v_dept_id;

  -- 2. Statuses (workflow stages)
  INSERT INTO task_statuses (department_id, name, slug, category, color, is_default, sort_order) VALUES
    (v_dept_id, 'Backlog',       'backlog',       'not_started', '#9CA3AF', true,  0) RETURNING id INTO v_status_backlog;
  INSERT INTO task_statuses (department_id, name, slug, category, color, sort_order) VALUES
    (v_dept_id, 'In Build',      'in-build',      'in_progress', '#3B82F6', 1) RETURNING id INTO v_status_in_build;
  INSERT INTO task_statuses (department_id, name, slug, category, color, sort_order) VALUES
    (v_dept_id, 'In Testing',    'in-testing',    'in_progress', '#F59E0B', 2) RETURNING id INTO v_status_in_testing;
  INSERT INTO task_statuses (department_id, name, slug, category, color, sort_order) VALUES
    (v_dept_id, 'Bugs Found',    'bugs-found',    'review',      '#EF4444', 3) RETURNING id INTO v_status_bugs;
  INSERT INTO task_statuses (department_id, name, slug, category, color, sort_order) VALUES
    (v_dept_id, 'Optimizations', 'optimizations', 'in_progress', '#8B5CF6', 4) RETURNING id INTO v_status_optimization;
  INSERT INTO task_statuses (department_id, name, slug, category, color, sort_order) VALUES
    (v_dept_id, 'Verified',      'verified',      'review',      '#22C55E', 5) RETURNING id INTO v_status_verified;
  INSERT INTO task_statuses (department_id, name, slug, category, color, is_final, sort_order) VALUES
    (v_dept_id, 'Done',          'done',          'done',        '#10B981', true,  6) RETURNING id INTO v_status_done;

  -- 3. Groups (one row per row of the board)
  INSERT INTO board_groups (department_id, name, color, sort_order) VALUES
    (v_dept_id, 'Dealers & Inventory',     '#06B6D4', 0) RETURNING id INTO v_grp_dealers;
  INSERT INTO board_groups (department_id, name, color, sort_order) VALUES
    (v_dept_id, 'Customer & CRM',          '#10B981', 1) RETURNING id INTO v_grp_crm;
  INSERT INTO board_groups (department_id, name, color, sort_order) VALUES
    (v_dept_id, 'Marketing & Campaigns',   '#F59E0B', 2) RETURNING id INTO v_grp_marketing;
  INSERT INTO board_groups (department_id, name, color, sort_order) VALUES
    (v_dept_id, 'Email & Outreach',        '#EAB308', 3) RETURNING id INTO v_grp_email;
  INSERT INTO board_groups (department_id, name, color, sort_order) VALUES
    (v_dept_id, 'AI & Analytics',          '#8B5CF6', 4) RETURNING id INTO v_grp_ai;
  INSERT INTO board_groups (department_id, name, color, sort_order) VALUES
    (v_dept_id, 'Forms & Automation',      '#EC4899', 5) RETURNING id INTO v_grp_automation;
  INSERT INTO board_groups (department_id, name, color, sort_order) VALUES
    (v_dept_id, 'Commerce & Sales',        '#F97316', 6) RETURNING id INTO v_grp_commerce;
  INSERT INTO board_groups (department_id, name, color, sort_order) VALUES
    (v_dept_id, 'System & Operations',     '#6B7280', 7) RETURNING id INTO v_grp_system;

  -- 4. Items (one task per admin section under pages/admin/)
  -- Use a temp table so we can drive subtask insertion off it
  CREATE TEMP TABLE _seed_items (group_id UUID, section TEXT, sort_order INT) ON COMMIT DROP;

  INSERT INTO _seed_items VALUES
    (v_grp_dealers,    'Dealers',                0),
    (v_grp_dealers,    'Inventory',              1),
    (v_grp_dealers,    'OEM',                    2),
    (v_grp_dealers,    'Trade-In',               3),
    (v_grp_dealers,    'Warranty & Service',     4),
    (v_grp_dealers,    'Servicing',              5),

    (v_grp_crm,        'Customers',              0),
    (v_grp_crm,        'CRM',                    1),
    (v_grp_crm,        'Identity',               2),
    (v_grp_crm,        'Communications',         3),
    (v_grp_crm,        'Chat',                   4),
    (v_grp_crm,        'Messages',               5),

    (v_grp_marketing,  'Marketing',              0),
    (v_grp_marketing,  'Social Marketing',       1),
    (v_grp_marketing,  'Drip Campaigns',         2),
    (v_grp_marketing,  'Brochures',              3),
    (v_grp_marketing,  'Content',                4),
    (v_grp_marketing,  'CMS',                    5),
    (v_grp_marketing,  'SEO',                    6),

    (v_grp_email,      'Email',                  0),
    (v_grp_email,      'Email Templates',        1),
    (v_grp_email,      'Lead Emails',            2),
    (v_grp_email,      'Call Tracking',          3),

    (v_grp_ai,         'AI Analytics',           0),
    (v_grp_ai,         'AI Conversations',       1),
    (v_grp_ai,         'Knowledge Base',         2),
    (v_grp_ai,         'Benchmarking',           3),
    (v_grp_ai,         'Dashboards',             4),

    (v_grp_automation, 'Forms',                  0),
    (v_grp_automation, 'Automation',             1),
    (v_grp_automation, 'Widgets',                2),

    (v_grp_commerce,   'Online Ordering',        0),
    (v_grp_commerce,   'Marketplace',            1),
    (v_grp_commerce,   'Subscription',           2),
    (v_grp_commerce,   'Cost Tracking',          3),
    (v_grp_commerce,   'Advertising',            4),

    (v_grp_system,     'Account',                0),
    (v_grp_system,     'Config',                 1),
    (v_grp_system,     'Settings',               2),
    (v_grp_system,     'Team',                   3),
    (v_grp_system,     'Webhooks',               4),
    (v_grp_system,     'Cloudflare',             5),
    (v_grp_system,     'Guard Rails',            6),
    (v_grp_system,     'Monitoring',             7),
    (v_grp_system,     'Performance',            8),
    (v_grp_system,     'Reliability',            9),
    (v_grp_system,     'Categories',             10),
    (v_grp_system,     'Groups',                 11);

  -- Insert parent items
  INSERT INTO tasks (department_id, group_id, status_id, title, task_type, priority, reporter_id, sort_order)
  SELECT v_dept_id, group_id, v_status_backlog, section, 'task', 'medium', v_owner_id, sort_order
  FROM _seed_items;

  -- 5. Standard 5-subtask test checklist per item
  INSERT INTO tasks (department_id, parent_task_id, status_id, title, task_type, priority, reporter_id, sort_order)
  SELECT
    v_dept_id,
    parent.id,
    v_status_backlog,
    subtasks.title,
    'review',
    'medium',
    v_owner_id,
    subtasks.sort_order
  FROM tasks parent
  CROSS JOIN (VALUES
    ('Smoke test — page loads, no console errors',     1),
    ('Core functionality — CRUD / main flows',         2),
    ('Permissions — admin vs limited roles enforced',  3),
    ('Mobile + dark mode',                             4),
    ('Error states + edge cases',                      5)
  ) AS subtasks(title, sort_order)
  WHERE parent.department_id = v_dept_id
    AND parent.parent_task_id IS NULL;

  RAISE NOTICE 'Seeded board % with % items and % subtasks',
    v_dept_id,
    (SELECT COUNT(*) FROM tasks WHERE department_id = v_dept_id AND parent_task_id IS NULL),
    (SELECT COUNT(*) FROM tasks WHERE department_id = v_dept_id AND parent_task_id IS NOT NULL);
END $$;

COMMIT;
