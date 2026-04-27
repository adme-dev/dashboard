-- 071-drive-agent-mobile-app-items.sql
-- Adds the "Mobile App" group + items to the Drive Agent — Engineering board.
-- Items map to the Ionic mobile app (apps/mobile/src/views) feature flows.
-- Idempotent: skips if the Mobile App group already exists.

BEGIN;

DO $$
DECLARE
  v_dept_id UUID;
  v_owner_id UUID;
  v_status_backlog UUID;
  v_grp_mobile UUID;
  v_existing UUID;
BEGIN
  SELECT id INTO v_dept_id FROM departments WHERE slug = 'drive-agent-engineering';
  IF v_dept_id IS NULL THEN
    RAISE EXCEPTION 'Drive Agent — Engineering board not found - run 070 first';
  END IF;

  -- Idempotency guard
  SELECT id INTO v_existing FROM board_groups
   WHERE department_id = v_dept_id AND name = 'Mobile App';
  IF v_existing IS NOT NULL THEN
    RAISE NOTICE 'Mobile App group already exists (id=%). Skipping.', v_existing;
    RETURN;
  END IF;

  SELECT id INTO v_owner_id FROM team_members ORDER BY created_at LIMIT 1;
  SELECT id INTO v_status_backlog FROM task_statuses
   WHERE department_id = v_dept_id AND slug = 'backlog';

  -- 1. Create the Mobile App group (sort_order 8, after System & Operations at 7)
  INSERT INTO board_groups (department_id, name, color, sort_order)
  VALUES (v_dept_id, 'Mobile App', '#0EA5E9', 8)
  RETURNING id INTO v_grp_mobile;

  -- 2. Items — one per mobile feature flow
  CREATE TEMP TABLE _mobile_items (section TEXT, sort_order INT) ON COMMIT DROP;
  INSERT INTO _mobile_items VALUES
    ('Auth & Onboarding (Login, Welcome, Privacy, Terms)',  0),
    ('Dashboard / Home',                                    1),
    ('Customers (List, Detail, Form)',                      2),
    ('Deals Pipeline (Pipeline, Detail, Form)',             3),
    ('Leads & Enquiries (Enquiries, Lead Queue, Followups)',4),
    ('Test Drives (full flow: start, license, inspection, tracking, complete)', 5),
    ('Trade-Ins (List, New, Detail)',                       6),
    ('Inventory & Vehicles (Search, Detail, Insights)',     7),
    ('Tasks (List, Detail, Form)',                          8),
    ('Inbox & Messaging (Inbox, Threads, Compose, Templates)', 9),
    ('Calendar & Appointments',                             10),
    ('Reporting & Finance (Sales, Team, Finance Calc)',     11),
    ('Reviews & Call History',                              12),
    ('Settings & Notifications (Settings, More, Prefs)',    13);

  -- 3. Insert parent items
  INSERT INTO tasks (department_id, group_id, status_id, title, task_type, priority, reporter_id, sort_order)
  SELECT v_dept_id, v_grp_mobile, v_status_backlog, section, 'task', 'medium', v_owner_id, sort_order
  FROM _mobile_items;

  -- 4. Mobile-specific subtask checklist (different from web — adds device/native concerns)
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
    ('Smoke test — view loads on iOS + Android, no errors',       1),
    ('Core flow — primary user journey works end-to-end',         2),
    ('Native features — camera / location / notifications behave',3),
    ('Offline + poor network handling',                           4),
    ('Form validation, keyboard handling, accessibility',         5),
    ('Performance — scroll, transitions, memory on low-end device', 6)
  ) AS subtasks(title, sort_order)
  WHERE parent.department_id = v_dept_id
    AND parent.group_id = v_grp_mobile
    AND parent.parent_task_id IS NULL;

  RAISE NOTICE 'Added Mobile App group (id=%) with % items and % subtasks',
    v_grp_mobile,
    (SELECT COUNT(*) FROM tasks WHERE department_id = v_dept_id AND group_id = v_grp_mobile AND parent_task_id IS NULL),
    (SELECT COUNT(*) FROM tasks t WHERE t.department_id = v_dept_id
       AND t.parent_task_id IN (SELECT id FROM tasks WHERE group_id = v_grp_mobile));
END $$;

COMMIT;
