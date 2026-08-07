-- 354_google_pmax_launch_project_template.sql
-- Convert an approved Google PMax brief into a governed project/task lifecycle.

BEGIN;

DO $$
DECLARE
  tmpl_id UUID;
  p_bootstrap UUID;
  p_strategy UUID;
  p_readiness UUID;
  p_creation UUID;
  p_activation UUID;
  v_marketing_dept_id UUID;
  v_account_dept_id UUID;
BEGIN
  SELECT id INTO v_marketing_dept_id
    FROM departments
   WHERE slug = 'marketing'
   LIMIT 1;

  SELECT id INTO v_account_dept_id
    FROM departments
   WHERE slug = 'account-services'
   LIMIT 1;

  SELECT id INTO tmpl_id
    FROM project_templates
   WHERE lower(trim(name)) = 'google pmax inventory launch'
   ORDER BY created_at DESC
   LIMIT 1;

  IF tmpl_id IS NULL THEN
    INSERT INTO project_templates (
      name, description, category, tags,
      default_budget_type, default_budget_amount,
      estimated_duration_days, estimated_hours, default_billing_method,
      is_public, is_active, is_system, department_id,
      phases, default_tasks, required_skills, recommended_team_size,
      discovery_questions, ai_context
    ) VALUES (
      'Google PMax Inventory Launch',
      'Governed Google Vehicle Ads and PMax Inventory onboarding, evidence review, paused creation, independent activation approval, and monitoring.',
      'Paid Media',
      ARRAY['google-ads', 'pmax', 'vehicle-ads', 'merchant-center', 'business-profile', 'cloudflare-ai-gateway', 'governed-launch'],
      'time_materials',
      0,
      21,
      32,
      'hourly',
      true,
      true,
      true,
      v_marketing_dept_id,
      '[]'::jsonb,
      '[]'::jsonb,
      '["Google Ads", "Merchant Center", "Vehicle Ads", "Conversion measurement", "Inventory feed QA"]'::jsonb,
      3,
      '[
        "Are Google Ads, Merchant Center, and Business Profile identities already owned and verified?",
        "Which exact XeroFlow Google vehicle feed and store codes are in scope?",
        "Which conversions are primary, deduplicated, and economically meaningful?",
        "Which approved PMA, budget ceiling, asset mode, and activation owner apply?",
        "Which boards, Monday discussions, audience signals, performance history, and approved knowledge should inform the plan?"
      ]'::jsonb,
      'Pool tenant-authorized evidence from the approved brief, tasks, boards, Monday provenance, internal feed, Merchant Center, measurement, audiences, personas, spend, anomalies, and approved knowledge. Cloudflare AI Gateway may rank, explain, and draft tasks, but must not approve, mutate Google, or override deterministic gates.'
    )
    RETURNING id INTO tmpl_id;
  ELSE
    UPDATE project_templates
       SET description = 'Governed Google Vehicle Ads and PMax Inventory onboarding, evidence review, paused creation, independent activation approval, and monitoring.',
           category = 'Paid Media',
           tags = ARRAY['google-ads', 'pmax', 'vehicle-ads', 'merchant-center', 'business-profile', 'cloudflare-ai-gateway', 'governed-launch'],
           estimated_duration_days = 21,
           estimated_hours = 32,
           is_public = true,
           is_active = true,
           is_system = true,
           department_id = COALESCE(v_marketing_dept_id, department_id),
           ai_context = 'Pool tenant-authorized evidence from the approved brief, tasks, boards, Monday provenance, internal feed, Merchant Center, measurement, audiences, personas, spend, anomalies, and approved knowledge. Cloudflare AI Gateway may rank, explain, and draft tasks, but must not approve, mutate Google, or override deterministic gates.',
           updated_at = NOW()
     WHERE id = tmpl_id;

    DELETE FROM template_tasks WHERE template_id = tmpl_id;
    DELETE FROM template_phases WHERE template_id = tmpl_id;
  END IF;

  INSERT INTO template_phases (
    id, template_id, name, description, sort_order, duration_days,
    budget_percentage, deliverables, requires_client_approval
  ) VALUES
    (uuid_generate_v4(), tmpl_id, 'Account & Vehicle Ads Bootstrap', 'Resolve Google identities, access, links, store locations, program eligibility, and external reviews.', 1, 5, 20, ARRAY['Onboarding evidence', 'Account/link task list'], true),
    (uuid_generate_v4(), tmpl_id, 'Strategy & Whole-Platform Evidence', 'Pool approved, operational, and advisory evidence without allowing draft discussion to override approvals.', 2, 4, 20, ARRAY['Versioned evidence snapshot', 'Approved launch decisions'], true),
    (uuid_generate_v4(), tmpl_id, 'Feed & Measurement Readiness', 'Bind the exact internal Google feed, reconcile Merchant eligibility, and prove conversion deduplication.', 3, 4, 25, ARRAY['Feed reconciliation', 'Conversion test evidence'], false),
    (uuid_generate_v4(), tmpl_id, 'Paused Campaign Creation', 'Run read-only preflight, obtain creation approval, create paused, and verify provider readback.', 4, 3, 20, ARRAY['Paused Google campaign', 'Verification evidence'], true),
    (uuid_generate_v4(), tmpl_id, 'Activation & Monitoring', 'Obtain a separate activation approval, enable once, verify, and monitor early delivery.', 5, 7, 15, ARRAY['Activation approval', '24-hour and 7-day reviews'], true);

  SELECT id INTO p_bootstrap FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p_strategy FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p_readiness FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p_creation FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;
  SELECT id INTO p_activation FROM template_phases WHERE template_id = tmpl_id AND sort_order = 5;

  INSERT INTO template_tasks (
    template_id, phase_id, title, description, sort_order,
    estimated_hours, start_day_offset, duration_days,
    default_role, default_department_id, task_type, priority,
    checklist, tags, billable
  ) VALUES
    (tmpl_id, p_bootstrap, 'Resolve Google account and Vehicle Ads onboarding', 'Discover or create the distinct Google Ads customer, Merchant Center account, Business Profile account/location, and governed store data source where applicable. Record API capability versus human verification work.', 1, 4, 0, 3, 'Paid Media Specialist', v_marketing_dept_id, 'task', 'urgent', '["Google Ads customer recorded", "Merchant Center account recorded", "Business Profile account recorded", "Location source recorded", "Human verification tasks assigned"]'::jsonb, ARRAY['onboarding', 'google-accounts'], true),
    (tmpl_id, p_bootstrap, 'Reconcile Google links, store codes, and Vehicle Ads reviews', 'Confirm Ads–Merchant and Merchant–Business Profile links, case-sensitive store codes, Vehicle Ads-only feed destination, dealership licence review, and website review.', 2, 4, 1, 4, 'Paid Media Specialist', v_marketing_dept_id, 'review', 'urgent', '["Account links active", "Store codes match", "Vehicle Ads add-on enabled", "Dealership licence approved", "Website review approved"]'::jsonb, ARRAY['merchant-center', 'business-profile', 'vehicle-ads'], true),

    (tmpl_id, p_strategy, 'Review whole-platform campaign evidence', 'Review the versioned client-scoped evidence snapshot: approved brief, tasks, boards, Monday discussions, audiences, personas, approved knowledge, spend, anomalies, feed, Merchant, and measurement. Draft discussions remain advisory.', 1, 4, 4, 2, 'Account Manager', COALESCE(v_account_dept_id, v_marketing_dept_id), 'review', 'high', '["Every evidence source has provenance", "Stale or unavailable sources disclosed", "Draft discussion marked advisory", "Approved knowledge distinguished", "Snapshot hash recorded"]'::jsonb, ARRAY['evidence', 'monday', 'boards', 'audiences', 'knowledge'], true),
    (tmpl_id, p_strategy, 'Confirm budget, PMA, conversions, assets, and activation owner', 'Resolve the commercial and launch decisions that automation cannot infer: fixed-flight allocation, named PMA, primary conversions and values, Merchant-only versus complete assets, and named activation approver.', 2, 3, 5, 2, 'Account Manager', COALESCE(v_account_dept_id, v_marketing_dept_id), 'approval', 'urgent', '["Budget approved", "PMA approved", "Primary conversions approved", "Asset mode approved", "Activation owner named"]'::jsonb, ARRAY['strategy', 'approval'], true),

    (tmpl_id, p_readiness, 'Bind and reconcile the exact Google vehicle feed', 'Select one active client-owned Google feed by link and feed ID. Reconcile validated XeroFlow stock, conditions, store codes, Merchant imports, eligible offers, disapprovals, and count drift.', 1, 4, 7, 3, 'Feed Operations', v_marketing_dept_id, 'review', 'urgent', '["Exact feed identity bound", "Source validation ready", "Conditions match brief", "Merchant eligible count reconciled", "Disapprovals assigned"]'::jsonb, ARRAY['dealer-feeds', 'inventory', 'merchant-center'], true),
    (tmpl_id, p_readiness, 'Prove conversion deduplication and primary-goal health', 'Audit server-side and browser-side measurement, run one controlled lead test, prove exactly one conversion is recorded, verify primary/include-in-conversions settings, and retain provider readback.', 2, 4, 8, 3, 'Analytics Specialist', v_marketing_dept_id, 'review', 'urgent', '["No duplicate tag path", "Controlled lead tested", "Exactly one conversion recorded", "Primary goals verified", "Recent signal reviewed"]'::jsonb, ARRAY['measurement', 'deduplication'], true),
    (tmpl_id, p_readiness, 'Resolve generated preflight remediation tasks', 'Close every idempotently generated blocker task from account, feed, Merchant, measurement, targeting, assets, destination, and onboarding checks before requesting creation approval.', 3, 3, 9, 3, 'Paid Media Specialist', v_marketing_dept_id, 'task', 'high', '["All blocker task keys resolved", "Warnings accepted or assigned", "Evidence refreshed", "No provider writes performed"]'::jsonb, ARRAY['preflight', 'remediation'], true),

    (tmpl_id, p_creation, 'Run read-only launch preflight', 'Read provider and platform evidence only. Persist the config-bound result and return to remediation if any deterministic blocker remains.', 1, 2, 11, 1, 'Paid Media Specialist', v_marketing_dept_id, 'review', 'urgent', '["Evidence is fresh", "Config hash matches", "No critical blockers", "Provider request IDs recorded"]'::jsonb, ARRAY['preflight', 'read-only'], true),
    (tmpl_id, p_creation, 'Approve paused campaign creation', 'A named human approves the exact config version and hash for creation in PAUSED state. This approval does not authorize activation.', 2, 1, 12, 1, 'Account Manager', COALESCE(v_account_dept_id, v_marketing_dept_id), 'approval', 'urgent', '["Config version shown", "Config hash shown", "Paused-only scope acknowledged", "Approver reason recorded"]'::jsonb, ARRAY['approval', 'paused-only'], true),
    (tmpl_id, p_creation, 'Create the campaign paused', 'Create the fixed-flight PMax Inventory resource graph idempotently in PAUSED state. Record only provider resource names and request IDs; never credentials.', 3, 2, 13, 1, 'Paid Media Specialist', v_marketing_dept_id, 'task', 'urgent', '["Idempotency key checked", "Campaign created PAUSED", "Budget uses CUSTOM_PERIOD", "Resource names recorded", "No activation performed"]'::jsonb, ARRAY['google-ads', 'creation', 'paused'], true),
    (tmpl_id, p_creation, 'Verify paused provider readback', 'Read back budget, schedule, shopping settings, listing group, locations, conversions, asset mode, URLs, and PAUSED status. Route mismatches to recovery.', 4, 2, 13, 2, 'QA', v_marketing_dept_id, 'review', 'urgent', '["Campaign remains PAUSED", "Budget and dates match", "Merchant/listing type match", "Conversions match", "Assets and URLs match"]'::jsonb, ARRAY['verification', 'provider-readback'], true),

    (tmpl_id, p_activation, 'Approve campaign activation', 'After paused verification and final conversion testing, a named human separately approves activation for the exact unchanged config hash.', 1, 1, 15, 1, 'Account Manager', COALESCE(v_account_dept_id, v_marketing_dept_id), 'approval', 'urgent', '["Paused verification passed", "Conversion test passed", "Config hash unchanged", "Activation reason recorded"]'::jsonb, ARRAY['activation', 'approval'], true),
    (tmpl_id, p_activation, 'Enable once and verify serving state', 'Send one guarded enable mutation, then read back enabled status, budget, eligibility, and conversion configuration. Any ambiguity enters recovery instead of retrying blindly.', 2, 2, 16, 1, 'Paid Media Specialist', v_marketing_dept_id, 'task', 'urgent', '["Activation approval consumed", "Single enable mutation sent", "Enabled status read back", "No duplicate campaign", "Ambiguity routed to recovery"]'::jsonb, ARRAY['activation', 'idempotency'], true),
    (tmpl_id, p_activation, 'Monitor first 24 hours and 7 days', 'Review spend pacing, eligibility, disapprovals, feed drift, conversion volume, lead quality, audience signals, anomalies, and search/category insights without silently changing strategy.', 3, 4, 17, 7, 'Paid Media Specialist', v_marketing_dept_id, 'review', 'high', '["24-hour review complete", "7-day review complete", "Spend reconciled", "Feed drift checked", "Conversion quality reviewed", "Changes proposed for approval"]'::jsonb, ARRAY['monitoring', 'pacing', 'anomalies'], true),
    (tmpl_id, p_activation, 'Post governed launch handoff to XeroFlow and Monday', 'Record account and campaign IDs, evidence hash, approvals, feed identity, monitoring owners, and unresolved warnings in the project and linked Monday workflow without exposing secrets.', 4, 2, 18, 2, 'Account Manager', COALESCE(v_account_dept_id, v_marketing_dept_id), 'deliverable', 'medium', '["XeroFlow project updated", "Monday handoff linked", "Approvals referenced", "Monitoring owners assigned", "No secrets included"]'::jsonb, ARRAY['handoff', 'monday', 'evidence'], true);

  UPDATE brief_templates
     SET project_template_id = tmpl_id,
         updated_at = NOW()
   WHERE slug = 'google-pmax'
     AND project_template_id IS NULL;
END $$;

COMMIT;
