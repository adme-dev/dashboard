-- 219: Dealer Feed Workbook project template
-- Adds an operational workbook for vehicle catalog feed setup, QA, and handoff.
-- Idempotent: reruns update the template and replace its workbook phases/tasks.

DO $$
DECLARE
  tmpl_id UUID;
  p_intake UUID;
  p_readiness UUID;
  p_build UUID;
  p_activation UUID;
  p_monitoring UUID;
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
  WHERE lower(trim(name)) = 'dealer feed workbook'
  ORDER BY created_at DESC
  LIMIT 1;

  IF tmpl_id IS NULL THEN
    INSERT INTO project_templates (
      name,
      description,
      category,
      tags,
      default_budget_type,
      default_budget_amount,
      estimated_duration_days,
      estimated_hours,
      default_billing_method,
      is_public,
      is_active,
      is_system,
      department_id,
      phases,
      default_tasks,
      required_skills,
      recommended_team_size,
      discovery_questions,
      ai_context
    ) VALUES (
      'Dealer Feed Workbook',
      'Operational workbook for dealership vehicle feeds across XeroFlow, social-dashboard, Meta catalogs, Google Merchant vehicle ads, Monday-style project tasks, and Slack handoff.',
      'Paid Media',
      ARRAY['dealer-feeds', 'feed-workbook', 'inventory', 'meta-catalog', 'google-merchant', 'monday', 'slack', 'ai-enrichment'],
      'time_materials',
      3500,
      21,
      36,
      'hourly',
      true,
      true,
      true,
      v_marketing_dept_id,
      '[]'::jsonb,
      '[]'::jsonb,
      '["Paid media", "Inventory feed QA", "Meta catalog setup", "Google Merchant Center", "Client operations"]'::jsonb,
      3,
      '[
        "Which dealership seller refs or rooftops are in scope?",
        "Which platform is required: Meta, Google Merchant, or both?",
        "What vehicle conditions are in scope: new, demo, used, or a campaign stock list?",
        "Does Google require an in-store store code for this feed?",
        "Where should the launch/readiness summary be posted in Slack or Monday?"
      ]'::jsonb,
      'AI may normalise descriptive fields from verified vehicle data, but must not invent source-backed commercial facts such as VDP URLs, prices, VINs, stock numbers, mileage, images, or store codes.'
    )
    RETURNING id INTO tmpl_id;
  ELSE
    UPDATE project_templates
    SET
      description = 'Operational workbook for dealership vehicle feeds across XeroFlow, social-dashboard, Meta catalogs, Google Merchant vehicle ads, Monday-style project tasks, and Slack handoff.',
      category = 'Paid Media',
      tags = ARRAY['dealer-feeds', 'feed-workbook', 'inventory', 'meta-catalog', 'google-merchant', 'monday', 'slack', 'ai-enrichment'],
      default_budget_type = 'time_materials',
      default_budget_amount = 3500,
      estimated_duration_days = 21,
      estimated_hours = 36,
      default_billing_method = 'hourly',
      is_public = true,
      is_active = true,
      is_system = true,
      department_id = COALESCE(v_marketing_dept_id, department_id),
      required_skills = '["Paid media", "Inventory feed QA", "Meta catalog setup", "Google Merchant Center", "Client operations"]'::jsonb,
      recommended_team_size = 3,
      discovery_questions = '[
        "Which dealership seller refs or rooftops are in scope?",
        "Which platform is required: Meta, Google Merchant, or both?",
        "What vehicle conditions are in scope: new, demo, used, or a campaign stock list?",
        "Does Google require an in-store store code for this feed?",
        "Where should the launch/readiness summary be posted in Slack or Monday?"
      ]'::jsonb,
      ai_context = 'AI may normalise descriptive fields from verified vehicle data, but must not invent source-backed commercial facts such as VDP URLs, prices, VINs, stock numbers, mileage, images, or store codes.',
      updated_at = NOW()
    WHERE id = tmpl_id;

    DELETE FROM template_tasks WHERE template_id = tmpl_id;
    DELETE FROM template_phases WHERE template_id = tmpl_id;
    DELETE FROM template_documents
    WHERE template_id = tmpl_id
      AND name IN ('Dealer Feed Workbook SOP', 'AI enrichment guardrails');
  END IF;

  INSERT INTO template_phases (
    id,
    template_id,
    name,
    description,
    sort_order,
    duration_days,
    budget_percentage,
    deliverables,
    requires_client_approval
  ) VALUES
    (uuid_generate_v4(), tmpl_id, 'Feed Intake & Access', 'Confirm scope, platform access, source workspace, and campaign prerequisites.', 1, 4, 15, ARRAY['Scoped Feed Workbook', 'Access checklist'], false),
    (uuid_generate_v4(), tmpl_id, 'Inventory Readiness', 'Validate saleable inventory, source-backed fields, and AI enrichment boundaries.', 2, 5, 25, ARRAY['Catalog readiness summary', 'Remediation list'], false),
    (uuid_generate_v4(), tmpl_id, 'Campaign Feed Build', 'Create feed filters, optional stock-list scope, and platform-specific mappings.', 3, 5, 25, ARRAY['Meta feed draft', 'Google feed draft'], false),
    (uuid_generate_v4(), tmpl_id, 'Platform Activation & QA', 'Validate preview links, generated feed URLs, platform imports, and refresh cadence.', 4, 4, 20, ARRAY['QA evidence', 'Feed URLs'], true),
    (uuid_generate_v4(), tmpl_id, 'Launch Monitoring & Handoff', 'Record feed IDs, post Slack/Monday handoff, and monitor the first refreshes.', 5, 3, 15, ARRAY['Launch handoff', 'First-refresh checks'], false);

  SELECT id INTO p_intake FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p_readiness FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p_build FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p_activation FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;
  SELECT id INTO p_monitoring FROM template_phases WHERE template_id = tmpl_id AND sort_order = 5;

  INSERT INTO template_tasks (
    template_id,
    phase_id,
    title,
    description,
    sort_order,
    estimated_hours,
    start_day_offset,
    duration_days,
    default_role,
    default_department_id,
    task_type,
    priority,
    checklist,
    tags,
    billable
  ) VALUES
    (tmpl_id, p_intake, 'Confirm dealership feed scope', 'Confirm dealership, seller refs, rooftop scope, source social-dashboard organization, and whether the campaign is Meta, Google, or both.', 1, 2, 0, 1, 'Account Manager', COALESCE(v_account_dept_id, v_marketing_dept_id), 'task', 'high', '["Confirm selected XeroFlow client", "Confirm social-dashboard org link", "Confirm seller refs", "Confirm platform scope"]'::jsonb, ARRAY['dealer-feeds', 'intake'], true),
    (tmpl_id, p_intake, 'Confirm platform and account access', 'Verify Meta catalog permissions, Google Merchant Center access, ad account access, and Business Profile store-code ownership when Google vehicle ads are in scope.', 2, 2, 0, 2, 'Paid Media Specialist', v_marketing_dept_id, 'task', 'high', '["Meta catalog access confirmed", "Google Merchant Center access confirmed", "Ad account access confirmed", "Business Profile store codes confirmed if needed"]'::jsonb, ARRAY['access', 'meta', 'google'], true),
    (tmpl_id, p_intake, 'Capture Feed Workbook requirements', 'Document campaign requirements that marketing will use in Monday or Slack: condition, make/model, price, kilometres, title keywords, and stock-list rules.', 3, 2, 1, 2, 'Account Manager', COALESCE(v_account_dept_id, v_marketing_dept_id), 'deliverable', 'medium', '["Condition scope captured", "Campaign filter rules captured", "CSV stock-list owner confirmed", "Slack/Monday destination captured"]'::jsonb, ARRAY['workbook', 'monday', 'slack'], true),

    (tmpl_id, p_readiness, 'Audit saleable inventory only', 'Confirm the feed excludes withdrawn, sold, archived, or non-saleable vehicles before any catalog export is shared.', 1, 3, 3, 2, 'Paid Media Specialist', v_marketing_dept_id, 'review', 'high', '["Saleable inventory source checked", "Withdrawn status excluded", "Stock count reconciled with dealer expectation"]'::jsonb, ARRAY['inventory', 'qa'], true),
    (tmpl_id, p_readiness, 'Resolve source-required catalog gaps', 'Fix missing URL, price, image, VIN or stock number, mileage, make, model, year, and store-code fields at the source or verified VDP.', 2, 5, 4, 4, 'Feed Operations', v_marketing_dept_id, 'task', 'urgent', '["VDP URL gaps assigned", "Price gaps assigned", "Image gaps assigned", "VIN/stock gaps assigned", "Mileage gaps assigned"]'::jsonb, ARRAY['source-fix', 'catalog-readiness'], true),
    (tmpl_id, p_readiness, 'Define AI enrichment guardrails', 'List fields AI can assist with and fields that must stay source-backed. AI can normalise titles, condition labels, and descriptions from verified data; it cannot invent commercial facts.', 3, 2, 5, 2, 'AI Operations', v_marketing_dept_id, 'review', 'high', '["AI-assisted fields documented", "Source-required fields documented", "Approval owner assigned", "No invented price, URL, image, VIN, mileage, or store code"]'::jsonb, ARRAY['ai-enrichment', 'governance'], true),

    (tmpl_id, p_build, 'Build campaign filters in XeroFlow', 'Configure title keyword, condition, make, model, year, price, kilometre, and stock-list filters; confirm dynamic readiness updates while filters change.', 1, 3, 7, 2, 'Paid Media Specialist', v_marketing_dept_id, 'task', 'high', '["Condition selected", "Make/model filters entered", "Ranges checked", "Readiness count reviewed", "Filters match brief"]'::jsonb, ARRAY['filters', 'preview'], true),
    (tmpl_id, p_build, 'Validate campaign CSV stock list', 'Upload or paste stock, VIN, or vehicle IDs for campaigns that must include or exclude a fixed set of vehicles.', 2, 2, 8, 2, 'Paid Media Specialist', v_marketing_dept_id, 'task', 'medium', '["CSV header accepted", "Reference count reconciled", "Include/exclude mode confirmed", "No stale stock refs left in scope"]'::jsonb, ARRAY['csv', 'stock-list'], true),
    (tmpl_id, p_build, 'Configure Google vehicle-feed store code', 'Add the Google store code when the feed uses in-store vehicle fulfillment, and confirm it matches the Merchant Center or Business Profile store code.', 3, 2, 9, 2, 'Paid Media Specialist', v_marketing_dept_id, 'task', 'high', '["Store code entered", "Case sensitivity checked", "Merchant Center store match confirmed", "Online/in-store fulfillment choice recorded"]'::jsonb, ARRAY['google-merchant', 'store-code'], true),
    (tmpl_id, p_build, 'Create Meta and Google feed drafts', 'Create platform-specific feed drafts and verify the preview shows feed-valid vehicles before sharing generated feed URLs.', 4, 4, 10, 2, 'Paid Media Specialist', v_marketing_dept_id, 'deliverable', 'high', '["Meta feed created if in scope", "Google feed created if in scope", "Generated URL copied", "Feed IDs saved in XeroFlow"]'::jsonb, ARRAY['meta-catalog', 'google-merchant'], true),

    (tmpl_id, p_activation, 'QA preview and generated feed URLs', 'Check the preview cards, image visibility, condition labels, search, scroll behaviour, and generated feed URL response before platform import.', 1, 4, 12, 2, 'QA', v_marketing_dept_id, 'review', 'high', '["Preview cards render", "Images render or source gaps listed", "Condition shown", "Search works", "Content scrolls", "Feed URL returns catalog data"]'::jsonb, ARRAY['qa', 'feed-url'], true),
    (tmpl_id, p_activation, 'Import feed into platform catalog', 'Connect the generated feed URL to Meta catalog or Google Merchant Center and record import diagnostics and rejected-row reasons.', 2, 4, 13, 3, 'Paid Media Specialist', v_marketing_dept_id, 'task', 'urgent', '["Meta import scheduled", "Google data source scheduled", "Rejected rows captured", "Refresh cadence recorded"]'::jsonb, ARRAY['platform-import', 'catalog'], true),
    (tmpl_id, p_activation, 'Client or internal approval checkpoint', 'Confirm the feed is scoped correctly for the campaign before activating ads or handing to the media buyer.', 3, 1, 15, 1, 'Account Manager', COALESCE(v_account_dept_id, v_marketing_dept_id), 'approval', 'high', '["Scope approved", "Known blocked rows accepted or assigned", "Launch owner confirmed"]'::jsonb, ARRAY['approval'], true),

    (tmpl_id, p_monitoring, 'Post Slack or Monday launch handoff', 'Share the feed URL, platform, feed ID, readiness count, filters, stock-list mode, unresolved source gaps, and refresh cadence to the agreed Slack channel or Monday item.', 1, 2, 16, 1, 'Account Manager', COALESCE(v_account_dept_id, v_marketing_dept_id), 'deliverable', 'high', '["Feed URL included", "Readiness count included", "Filters included", "Unresolved issues included", "Owner and next refresh included"]'::jsonb, ARRAY['slack', 'monday', 'handoff'], true),
    (tmpl_id, p_monitoring, 'Monitor first catalog refresh', 'Check the first platform refresh/import after launch and triage any rejects into source fixes, AI-assisted enrichment, mapping fixes, or manual review.', 2, 3, 17, 3, 'Paid Media Specialist', v_marketing_dept_id, 'task', 'high', '["First refresh checked", "Rejected rows categorised", "Critical issues assigned", "Campaign safe to activate"]'::jsonb, ARRAY['monitoring', 'catalog-readiness'], true),
    (tmpl_id, p_monitoring, 'Close workbook with feed IDs and evidence', 'Record final feed IDs, generated URLs, readiness results, platform diagnostics, and links to Slack/Monday handoff notes.', 3, 2, 20, 1, 'Account Manager', COALESCE(v_account_dept_id, v_marketing_dept_id), 'milestone', 'medium', '["Feed IDs recorded", "URLs recorded", "Evidence linked", "Workbook closed or recurring monitor created"]'::jsonb, ARRAY['evidence', 'closeout'], true);

  INSERT INTO template_documents (
    template_id,
    name,
    description,
    document_type,
    content,
    include_on_creation,
    sort_order
  ) VALUES
    (
      tmpl_id,
      'Dealer Feed Workbook SOP',
      'Operating model for marketing teams setting up vehicle feeds.',
      'checklist',
      $doc$Use the Dealer Feeds dashboard to select the client, confirm the feed workspace, set campaign filters, review catalog readiness, create the feed, copy the generated feed URL, and then complete the platform import. The workbook project is the operational record for Monday/Slack handoff, QA evidence, feed IDs, rejected-row triage, and first-refresh monitoring.$doc$,
      true,
      1
    ),
    (
      tmpl_id,
      'AI enrichment guardrails',
      'Rules for safe AI assistance on inventory feeds.',
      'guideline',
      $doc$AI may assist with descriptive normalisation when grounded in verified source data: title formatting, condition label mapping, description drafting from known options, and issue summaries. AI must not invent or backfill source-backed commercial facts: VDP URL, price, VIN, stock number, mileage, images, store code, availability, or sale status. Those fields must come from the inventory source, verified VDP, dealer data, or platform mapping.$doc$,
      true,
      2
    );
END $$;
