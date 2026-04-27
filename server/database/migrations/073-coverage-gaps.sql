-- 073-coverage-gaps.sql
-- Closes coverage gaps in the Drive Agent — Engineering board after the
-- graphify-driven discovery sweep:
--  • backfills 18 standalone admin pages into existing groups
--  • adds 4 new groups: Customer-Facing Web, Workers & Background Jobs,
--    Layers (Modular Features), Backend Services & APIs
--  • adds 1 item under System & Operations: API Shield
--
-- Each item type uses a checklist tailored to its concerns
-- (admin web / public web / worker / layer / service).
-- Idempotent: skips if Customer-Facing Web group already exists.

BEGIN;

DO $$
DECLARE
  v_dept_id UUID;
  v_owner_id UUID;
  v_status_backlog UUID;

  -- Existing groups we'll backfill into
  v_grp_crm UUID;
  v_grp_ai UUID;
  v_grp_system UUID;

  -- New groups
  v_grp_customer_web UUID;
  v_grp_workers UUID;
  v_grp_layers UUID;
  v_grp_services UUID;
BEGIN
  SELECT id INTO v_dept_id FROM departments WHERE slug = 'drive-agent-engineering';
  IF v_dept_id IS NULL THEN
    RAISE EXCEPTION 'Drive Agent — Engineering board not found - run 070 first';
  END IF;

  -- Idempotency guard
  IF EXISTS (
    SELECT 1 FROM board_groups
     WHERE department_id = v_dept_id AND name = 'Customer-Facing Web'
  ) THEN
    RAISE NOTICE 'Coverage-gaps migration already applied. Skipping.';
    RETURN;
  END IF;

  SELECT id INTO v_owner_id FROM team_members ORDER BY created_at LIMIT 1;
  SELECT id INTO v_status_backlog FROM task_statuses
   WHERE department_id = v_dept_id AND slug = 'backlog';

  SELECT id INTO v_grp_crm    FROM board_groups WHERE department_id = v_dept_id AND name = 'Customer & CRM';
  SELECT id INTO v_grp_ai     FROM board_groups WHERE department_id = v_dept_id AND name = 'AI & Analytics';
  SELECT id INTO v_grp_system FROM board_groups WHERE department_id = v_dept_id AND name = 'System & Operations';

  -- Create new groups (continuing sort_order after Mobile App at 8)
  INSERT INTO board_groups (department_id, name, color, sort_order) VALUES
    (v_dept_id, 'Customer-Facing Web',     '#22C55E',  9) RETURNING id INTO v_grp_customer_web;
  INSERT INTO board_groups (department_id, name, color, sort_order) VALUES
    (v_dept_id, 'Workers & Background Jobs', '#A855F7', 10) RETURNING id INTO v_grp_workers;
  INSERT INTO board_groups (department_id, name, color, sort_order) VALUES
    (v_dept_id, 'Layers (Modular Features)', '#14B8A6', 11) RETURNING id INTO v_grp_layers;
  INSERT INTO board_groups (department_id, name, color, sort_order) VALUES
    (v_dept_id, 'Backend Services & APIs',   '#F43F5E', 12) RETURNING id INTO v_grp_services;

  -- Stage all new items in a temp table, tagged with which checklist they need
  CREATE TEMP TABLE _gap_items (
    group_id      UUID NOT NULL,
    title         TEXT NOT NULL,
    subtask_set   TEXT NOT NULL,    -- web | public_web | worker | layer | service
    sort_order    INT NOT NULL,
    parent_id     UUID
  ) ON COMMIT DROP;

  -- ──────── Backfill: standalone admin pages → existing groups ────────
  -- (sort_order ≥100 to land after existing items)
  INSERT INTO _gap_items (group_id, title, subtask_set, sort_order) VALUES
    -- Customer & CRM (+3)
    (v_grp_crm,    'Action Items',           'web', 100),
    (v_grp_crm,    'Activities',             'web', 101),
    (v_grp_crm,    'Valuations',             'web', 102),

    -- AI & Analytics (+6)
    (v_grp_ai,     'Agent Chat History',     'web', 100),
    (v_grp_ai,     'Agent Metrics',          'web', 101),
    (v_grp_ai,     'AI Handoffs',            'web', 102),
    (v_grp_ai,     'AI Performance',         'web', 103),
    (v_grp_ai,     'Chat Sessions',          'web', 104),
    (v_grp_ai,     'Transcription Metrics',  'web', 105),

    -- System & Operations (+9 + 1 API Shield = +10)
    (v_grp_system, 'Audit Logs',             'web', 100),
    (v_grp_system, 'Calendar (admin)',       'web', 101),
    (v_grp_system, 'HTML Blocks',            'web', 102),
    (v_grp_system, 'Security',               'web', 103),
    (v_grp_system, 'Staff Calendar',         'web', 104),
    (v_grp_system, 'Staff Scheduling',       'web', 105),
    (v_grp_system, 'Users',                  'web', 106),
    (v_grp_system, 'Notifications',          'web', 107),
    (v_grp_system, 'Reviews (admin)',        'web', 108),
    (v_grp_system, 'API Shield (CF)',        'web', 109);

  -- ──────── Customer-Facing Web (7 items, public_web checklist) ────────
  INSERT INTO _gap_items (group_id, title, subtask_set, sort_order) VALUES
    (v_grp_customer_web, 'Vehicle Catalog (cars-for-sale, models, specifications, vehicle pages)', 'public_web', 0),
    (v_grp_customer_web, 'Customer Account (customer, onboarding, edit, preview)',                  'public_web', 1),
    (v_grp_customer_web, 'Buy & Build Flow (build, deposits, test-drive, appointments)',            'public_web', 2),
    (v_grp_customer_web, 'Service Booking',                                                         'public_web', 3),
    (v_grp_customer_web, 'Public Forms',                                                            'public_web', 4),
    (v_grp_customer_web, 'SMS & Social entry pages',                                                'public_web', 5),
    (v_grp_customer_web, 'Public Auth (login, signup, password reset)',                             'public_web', 6);

  -- ──────── Workers & Background Jobs (10 items, worker checklist) ────────
  INSERT INTO _gap_items (group_id, title, subtask_set, sort_order) VALUES
    (v_grp_workers, 'Analytics & Reporting Crons (8 crons: cache-sync, attribution, funnel, site-visits, archive-events, precompute, scheduled-reports, search-analytics)', 'worker', 0),
    (v_grp_workers, 'Marketing Crons (drip-campaigns, marketing-digest, marketing-insights, takeover-campaigns, scheduled-content)', 'worker', 1),
    (v_grp_workers, 'Customer Lifecycle Crons (abandoned-deposits, lifecycle-transitions, review-requests)', 'worker', 2),
    (v_grp_workers, 'Inventory & Vehicle Crons (inventory-sync, inventory-aging, ancap-refresh, vehicle-enrichment, enrichment)', 'worker', 3),
    (v_grp_workers, 'Service & Reminder Crons (test-drive-reminders, service-reminders, warranty-alerts, odometer-checkin, price-alerts)', 'worker', 4),
    (v_grp_workers, 'AI Agents (vehicle-chat-agent, ford-agent, social-planner-agent)', 'worker', 5),
    (v_grp_workers, 'Real-time Workers (realtime-hub, realtime-transcription, voice-assistant)', 'worker', 6),
    (v_grp_workers, 'Integration Workers (email-router, gps-tracker, embeddable-widgets, pdf-processor, marketplace-scraper, meta-ads-proxy, sgtm-proxy, media-cdn)', 'worker', 7),
    (v_grp_workers, 'Engagement & Scoring Crons (engagement-scores, content-scores, drive-score-rollup, ai-insights, ai-visibility, seo-metrics)', 'worker', 8),
    (v_grp_workers, 'Data Retention & Maintenance (data-retention, audit-logs-cleanup, gps-points-cleanup, bulk-operations-consumer, queue-consumer, flow-engine, workflow-rules, review-workflow)', 'worker', 9);

  -- ──────── Layers / Modular Features (8 items, layer checklist) ────────
  INSERT INTO _gap_items (group_id, title, subtask_set, sort_order) VALUES
    (v_grp_layers, 'base layer',                                        'layer', 0),
    (v_grp_layers, 'call-tracking layer',                               'layer', 1),
    (v_grp_layers, 'edm (Email Direct Marketing) layer — 42 .vue',      'layer', 2),
    (v_grp_layers, 'motor-groups layer — 11 .vue',                      'layer', 3),
    (v_grp_layers, 'platform-ops layer — 26 .vue',                      'layer', 4),
    (v_grp_layers, 'sms layer — 15 .vue',                               'layer', 5),
    (v_grp_layers, 'test-drives layer — 66 .vue (largest)',             'layer', 6),
    (v_grp_layers, 'widgets layer — 18 .vue (embeddable)',              'layer', 7);

  -- ──────── Backend Services & APIs (6 items, service checklist) ────────
  INSERT INTO _gap_items (group_id, title, subtask_set, sort_order) VALUES
    (v_grp_services, 'AI Services (RAG pipeline, voice agent, SMS agent, message generator, engagement, handoff, review response, market research)', 'service', 0),
    (v_grp_services, 'Appointments Suite (confirmation, reminders, conflicts, recurrence, waitlist, status workflow, staff notifications)', 'service', 1),
    (v_grp_services, 'Abuse Detection & Security Services',                                       'service', 2),
    (v_grp_services, 'Analytics & Reporting Services',                                            'service', 3),
    (v_grp_services, 'Vehicle Data Services (ABS, ANCAP, enrichment)',                            'service', 4),
    (v_grp_services, 'Communications Delivery (email, SMS, webhooks)',                            'service', 5);

  -- ──────── Insert parent items ────────
  INSERT INTO tasks (department_id, group_id, status_id, title, task_type, priority, reporter_id, sort_order)
  SELECT v_dept_id, group_id, v_status_backlog, title, 'task', 'medium', v_owner_id, sort_order
  FROM _gap_items;

  -- Backfill parent_id on the staging table
  UPDATE _gap_items g
     SET parent_id = t.id
    FROM tasks t
   WHERE t.department_id = v_dept_id
     AND t.parent_task_id IS NULL
     AND t.group_id = g.group_id
     AND t.title    = g.title;

  -- ──────── Subtasks: 5-step admin web checklist ────────
  INSERT INTO tasks (department_id, parent_task_id, status_id, title, task_type, priority, reporter_id, sort_order)
  SELECT v_dept_id, g.parent_id, v_status_backlog, st.title, 'review', 'medium', v_owner_id, st.sort_order
  FROM _gap_items g
  CROSS JOIN (VALUES
    ('Smoke test — page loads, no console errors',     1),
    ('Core functionality — CRUD / main flows',         2),
    ('Permissions — admin vs limited roles enforced',  3),
    ('Mobile + dark mode',                             4),
    ('Error states + edge cases',                      5)
  ) AS st(title, sort_order)
  WHERE g.subtask_set = 'web';

  -- ──────── Subtasks: 7-step public web checklist ────────
  INSERT INTO tasks (department_id, parent_task_id, status_id, title, task_type, priority, reporter_id, sort_order)
  SELECT v_dept_id, g.parent_id, v_status_backlog, st.title, 'review', 'medium', v_owner_id, st.sort_order
  FROM _gap_items g
  CROSS JOIN (VALUES
    ('SEO — meta tags, structured data, canonical URLs',   1),
    ('Core Web Vitals — LCP, FID/INP, CLS within target',  2),
    ('Accessibility — WCAG 2.1 AA, keyboard nav',          3),
    ('Mobile responsive — sm / md / lg breakpoints',       4),
    ('Cross-browser — Chrome, Safari, Firefox',            5),
    ('Forms — validation + spam / abuse protection',       6),
    ('Privacy — GDPR / consent banners / cookie policy',   7)
  ) AS st(title, sort_order)
  WHERE g.subtask_set = 'public_web';

  -- ──────── Subtasks: 6-step worker checklist ────────
  INSERT INTO tasks (department_id, parent_task_id, status_id, title, task_type, priority, reporter_id, sort_order)
  SELECT v_dept_id, g.parent_id, v_status_backlog, st.title, 'review', 'medium', v_owner_id, st.sort_order
  FROM _gap_items g
  CROSS JOIN (VALUES
    ('Triggers correctly — cron schedule fires / queue receives', 1),
    ('Success path — produces expected output',                   2),
    ('Failure handling — retries, DLQ, alerts wired',             3),
    ('Idempotency — safe to run twice on same input',             4),
    ('Observability — structured logs, metrics emitted',          5),
    ('Performance — within timeout / memory / CPU budget',        6)
  ) AS st(title, sort_order)
  WHERE g.subtask_set = 'worker';

  -- ──────── Subtasks: 5-step layer checklist ────────
  INSERT INTO tasks (department_id, parent_task_id, status_id, title, task_type, priority, reporter_id, sort_order)
  SELECT v_dept_id, g.parent_id, v_status_backlog, st.title, 'review', 'medium', v_owner_id, st.sort_order
  FROM _gap_items g
  CROSS JOIN (VALUES
    ('Composables auto-import in consuming app',                  1),
    ('Public types / interfaces exported correctly',              2),
    ('Server utilities accessible via correct alias',             3),
    ('No conflicts with sibling layers (component / alias)',      4),
    ('Layer documentation present (README / AGENTS)',             5)
  ) AS st(title, sort_order)
  WHERE g.subtask_set = 'layer';

  -- ──────── Subtasks: 5-step service checklist ────────
  INSERT INTO tasks (department_id, parent_task_id, status_id, title, task_type, priority, reporter_id, sort_order)
  SELECT v_dept_id, g.parent_id, v_status_backlog, st.title, 'review', 'medium', v_owner_id, st.sort_order
  FROM _gap_items g
  CROSS JOIN (VALUES
    ('Public interface stable — input / output contract',         1),
    ('Error handling — typed errors, no silent failures',         2),
    ('Tested — unit + integration coverage',                      3),
    ('Performance — response time / throughput within target',    4),
    ('Observability — structured logs, traces, metrics',          5)
  ) AS st(title, sort_order)
  WHERE g.subtask_set = 'service';

  RAISE NOTICE 'Coverage-gaps applied. Board now has % groups, % items, % subtasks',
    (SELECT COUNT(*) FROM board_groups WHERE department_id = v_dept_id),
    (SELECT COUNT(*) FROM tasks WHERE department_id = v_dept_id AND parent_task_id IS NULL),
    (SELECT COUNT(*) FROM tasks WHERE department_id = v_dept_id AND parent_task_id IS NOT NULL);
END $$;

COMMIT;
