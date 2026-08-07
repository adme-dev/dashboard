-- 356_google_pmax_new_account_bootstrap.sql
-- Expand the launch template for API-capable, from-scratch Google account onboarding.

BEGIN;

DO $$
DECLARE
  v_template_id UUID;
  v_phase_id UUID;
  v_marketing_dept_id UUID;
BEGIN
  SELECT id INTO v_template_id
    FROM project_templates
   WHERE lower(trim(name)) = 'google pmax inventory launch'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Google PMax Inventory Launch template must exist before migration 356';
  END IF;

  SELECT id INTO v_phase_id
    FROM template_phases
   WHERE template_id = v_template_id
     AND name = 'Account & Vehicle Ads Bootstrap'
   LIMIT 1;

  IF v_phase_id IS NULL THEN
    RAISE EXCEPTION 'Google PMax bootstrap phase must exist before migration 356';
  END IF;

  SELECT id INTO v_marketing_dept_id
    FROM departments
   WHERE slug = 'marketing'
   LIMIT 1;

  UPDATE project_templates
     SET description = 'Governed Google Vehicle Ads and PMax Inventory setup for existing or from-scratch accounts, whole-platform evidence review, paused creation, independent activation approval, and monitoring.',
         estimated_duration_days = 30,
         estimated_hours = 40,
         discovery_questions = '[
           "Do Google Ads, Merchant Center, and Business Profile already exist, and who legally owns and administers each identity?",
           "Which Google Ads manager account, approved currency, time zone, billing owner, and payments setup apply?",
           "Is the platform Google Cloud project ready with OAuth, production-capable Google Ads developer-token access, Merchant API, and approved Business Profile APIs?",
           "Which Business Profile location resource and case-sensitive store code represent the physical dealership, and has duplicate-location discovery been completed?",
           "Has the merchant accepted terms, completed business information, and verified and claimed the dealership homepage?",
           "Which exact XeroFlow Google vehicle feed and single-state store codes are in scope?",
           "Which conversions are primary, deduplicated, and economically meaningful?",
           "Which approved PMA, budget ceiling, asset mode, and activation owner apply?",
           "Which boards, Monday discussions, audience signals, performance history, and approved knowledge should inform the plan?"
         ]'::jsonb,
         updated_at = NOW()
   WHERE id = v_template_id;

  UPDATE template_phases
     SET description = 'Resolve the Google API control plane, account ownership, billing, legal acceptance, shop identity, links, one-state Vehicle Ads eligibility, and external reviews.',
         duration_days = 10,
         deliverables = ARRAY['API capability evidence', 'Account ownership and billing evidence', 'Shop identity readback', 'Account/link task list'],
         updated_at = NOW()
   WHERE id = v_phase_id;

  UPDATE template_tasks
     SET title = 'Resolve Google account ownership, commercial settings, and Merchant onboarding',
         description = 'Discover or create the Ads serving customer under the approved manager and the client-owned Merchant Center account. Approve immutable currency/time zone before creation; activate billing; retain a client administrator; accept Merchant terms; complete business information; and verify and claim the homepage.',
         sort_order = 2,
         estimated_hours = 5,
         duration_days = 7,
         checklist = '["Ads manager and serving customer recorded", "Currency and time zone approved before creation", "Billing active", "Merchant account and client administrator recorded", "Merchant terms accepted by the business", "Business information complete", "Homepage verified and claimed"]'::jsonb,
         tags = ARRAY['onboarding', 'google-accounts', 'billing', 'merchant-center'],
         updated_at = NOW()
   WHERE template_id = v_template_id
     AND phase_id = v_phase_id
     AND title IN (
       'Resolve Google account and Vehicle Ads onboarding',
       'Resolve Google account ownership, commercial settings, and Merchant onboarding'
     );

  UPDATE template_tasks
     SET description = 'Confirm Ads–Merchant and Merchant–Business Profile links, case-sensitive feed-to-location store codes, Vehicle Ads-only destination, one-state account scope, add-on enablement, dealership licence review, and website review.',
         sort_order = 4,
         estimated_hours = 4,
         duration_days = 7,
         checklist = '["Ads–Merchant link active", "Merchant–Business Profile link active", "Feed and shop store codes match exactly", "Vehicle source targets Vehicle Ads only", "One-state account scope confirmed", "Vehicle Ads add-on enabled", "Dealership licence approved", "Website review approved"]'::jsonb,
         tags = ARRAY['merchant-center', 'business-profile', 'vehicle-ads', 'external-review'],
         updated_at = NOW()
   WHERE template_id = v_template_id
     AND phase_id = v_phase_id
     AND title = 'Reconcile Google links, store codes, and Vehicle Ads reviews';

  IF NOT EXISTS (
    SELECT 1 FROM template_tasks
     WHERE template_id = v_template_id
       AND phase_id = v_phase_id
       AND title = 'Validate the Google API control plane'
  ) THEN
    INSERT INTO template_tasks (
      template_id, phase_id, title, description, sort_order,
      estimated_hours, start_day_offset, duration_days,
      default_role, default_department_id, task_type, priority,
      checklist, tags, billable
    ) VALUES (
      v_template_id,
      v_phase_id,
      'Validate the Google API control plane',
      'Read back the governed Google Cloud project, OAuth consent/client and offline grant, Google Ads API plus production-capable developer token, Merchant API provider capability, and Business Profile API project approval. Store secrets only in encrypted connection storage.',
      1,
      3,
      0,
      3,
      'Platform Engineer',
      v_marketing_dept_id,
      'review',
      'urgent',
      '["Cloud project recorded", "OAuth client and consent configured", "Offline grants encrypted", "Google Ads API and developer token ready", "Merchant API ready", "Business Profile API project approved and services enabled", "No credentials stored in tasks or evidence"]'::jsonb,
      ARRAY['google-cloud', 'oauth', 'google-ads-api', 'merchant-api', 'business-profile-api'],
      true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM template_tasks
     WHERE template_id = v_template_id
       AND phase_id = v_phase_id
       AND title = 'Discover and bind the dealership shop identity'
  ) THEN
    INSERT INTO template_tasks (
      template_id, phase_id, title, description, sort_order,
      estimated_hours, start_day_offset, duration_days,
      default_role, default_department_id, task_type, priority,
      checklist, tags, billable
    ) VALUES (
      v_template_id,
      v_phase_id,
      'Discover and bind the dealership shop identity',
      'Search before creating. Resolve duplicate or ownership conflicts, confirm the brick-and-mortar dealership, bind the Business Profile account and locations/{locationId} resource or governed Merchant store data source, set the case-sensitive store code, and complete human location verification.',
      3,
      4,
      1,
      8,
      'Paid Media Specialist',
      v_marketing_dept_id,
      'review',
      'urgent',
      '["Existing profiles searched before creation", "Duplicate and ownership conflicts cleared", "Physical dealership confirmed", "Business Profile account recorded", "Location resource or store data source recorded", "Store code recorded exactly", "Location verification complete"]'::jsonb,
      ARRAY['business-profile', 'shop-identity', 'store-code', 'verification'],
      true
    );
  END IF;
END $$;

COMMIT;
