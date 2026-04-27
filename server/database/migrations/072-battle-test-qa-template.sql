-- 072-battle-test-qa-template.sql
-- Snapshot the "Drive Agent — Engineering" board structure as a reusable
-- "Battle Test QA" template (board_templates row). Lets future projects
-- clone the same group/column/view layout in one click via the existing
-- POST /api/agency/boards/templates/:id/apply endpoint.
-- Idempotent: skips if template with this name already exists.

BEGIN;

DO $$
DECLARE
  v_dept_id UUID;
  v_owner_id UUID;
  v_template_id UUID;
  v_columns JSONB;
  v_groups JSONB;
  v_views JSONB;
BEGIN
  SELECT id INTO v_dept_id FROM departments WHERE slug = 'drive-agent-engineering';
  IF v_dept_id IS NULL THEN
    RAISE EXCEPTION 'Drive Agent — Engineering board not found - run 070 first';
  END IF;

  IF EXISTS (
    SELECT 1 FROM board_templates
     WHERE name = 'Battle Test QA' AND source_department_id = v_dept_id
  ) THEN
    RAISE NOTICE 'Battle Test QA template already exists - skipping';
    RETURN;
  END IF;

  SELECT id INTO v_owner_id FROM team_members ORDER BY created_at LIMIT 1;

  -- Build column snapshot (will be empty since this board has no custom_columns yet,
  -- but format matches what POST /templates produces so it's compatible)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name',        cc.name,
    'slug',        cc.slug,
    'columnType',  cc.column_type,
    'description', cc.description,
    'settings',    cc.settings,
    'isVisible',   cc.is_visible,
    'isRequired',  cc.is_required,
    'width',       cc.width,
    'sortOrder',   cc.sort_order,
    'options',     '[]'::jsonb
  ) ORDER BY cc.sort_order), '[]'::jsonb)
  INTO v_columns
  FROM custom_columns cc WHERE cc.department_id = v_dept_id;

  -- Groups snapshot — the meaty part: 9 domain groups
  SELECT jsonb_agg(jsonb_build_object(
    'name',      name,
    'color',     color,
    'sortOrder', sort_order
  ) ORDER BY sort_order)
  INTO v_groups
  FROM board_groups WHERE department_id = v_dept_id;

  -- Views snapshot
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name',      name,
    'viewType',  view_type,
    'isDefault', is_default,
    'config',    config,
    'sortOrder', sort_order
  ) ORDER BY sort_order), '[]'::jsonb)
  INTO v_views
  FROM board_views WHERE department_id = v_dept_id;

  INSERT INTO board_templates (
    name, description, category, icon, color,
    columns, groups, views,
    source_department_id, is_public, is_system, created_by
  ) VALUES (
    'Battle Test QA',
    'QA + dev tracking layout. Domain-grouped (Dealers, CRM, Marketing, Email, AI, Automation, Commerce, System, Mobile) with work-stream statuses (Backlog → In Build → In Testing → Bugs Found → Optimizations → Verified → Done). Apply to any new product, then add items per its admin sections.',
    'engineering',
    'wrench',
    '#6366F1',
    v_columns,
    v_groups,
    v_views,
    v_dept_id,
    true,
    false,
    v_owner_id
  )
  RETURNING id INTO v_template_id;

  RAISE NOTICE 'Created Battle Test QA template id=% (% groups, % columns)',
    v_template_id,
    jsonb_array_length(v_groups),
    jsonb_array_length(v_columns);
END $$;

COMMIT;
