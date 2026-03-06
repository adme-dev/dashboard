-- ============================================
-- Project Templates Expansion
-- Adds phases and tasks to existing templates,
-- plus new templates for agency workflows
-- ============================================

-- ============================================
-- 1. MARKETING CAMPAIGN (existing — add phases & tasks)
-- ============================================
DO $$
DECLARE
  tmpl_id UUID := '4d273756-2abb-4dcb-8f29-63d342101e98';
  p1 UUID; p2 UUID; p3 UUID; p4 UUID; p5 UUID;
BEGIN
  -- Update template metadata
  UPDATE project_templates SET
    description = 'End-to-end marketing campaign from strategy through creative production, media buying, and reporting',
    estimated_duration_days = 42,
    estimated_hours = 120,
    default_budget_type = 'time_materials',
    default_budget_amount = 25000,
    tags = ARRAY['marketing', 'campaign', 'media', 'creative'],
    is_public = true
  WHERE id = tmpl_id;

  -- Phases
  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Strategy & Planning', 'Research, audience definition, channel strategy, and budget allocation', 1, 7, 15, true),
    (uuid_generate_v4(), tmpl_id, 'Creative Development', 'Concept creation, copywriting, design, and asset production', 2, 14, 35, true),
    (uuid_generate_v4(), tmpl_id, 'Campaign Setup', 'Platform setup, tracking, audience building, and ad creation', 3, 5, 15, false),
    (uuid_generate_v4(), tmpl_id, 'Launch & Optimise', 'Campaign go-live, daily monitoring, and performance optimisation', 4, 14, 25, false),
    (uuid_generate_v4(), tmpl_id, 'Reporting & Wrap-up', 'Performance report, learnings, and recommendations', 5, 5, 10, true);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;
  SELECT id INTO p5 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 5;

  -- Phase 1: Strategy
  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Client kick-off meeting', 'Align on objectives, KPIs, budget, and timeline', 1, 2, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Audience research & personas', 'Define target audience segments and create personas', 2, 4, 'Strategist', 'task', 'high'),
  (tmpl_id, p1, 'Competitor & market analysis', 'Analyse competitor campaigns, messaging, and media mix', 3, 4, 'Strategist', 'task', 'medium'),
  (tmpl_id, p1, 'Channel strategy & media plan', 'Recommend channels, budget splits, and targeting approach', 4, 6, 'Media Buyer', 'deliverable', 'high'),
  (tmpl_id, p1, 'Campaign brief sign-off', 'Client approves strategy document', 5, 1, 'Account Manager', 'approval', 'high');

  -- Phase 2: Creative
  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p2, 'Creative concept development', 'Develop 2-3 creative concepts aligned to strategy', 1, 8, 'Creative Director', 'task', 'high'),
  (tmpl_id, p2, 'Copywriting — ad copy & headlines', 'Write copy for all ad formats and platforms', 2, 6, 'Copywriter', 'task', 'high'),
  (tmpl_id, p2, 'Design — static ad creatives', 'Design display and social ad creatives across all sizes', 3, 12, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Design — animated/video ads', 'Produce motion graphics or video ad content', 4, 16, 'Designer', 'deliverable', 'medium'),
  (tmpl_id, p2, 'Landing page design & build', 'Design and develop campaign landing page', 5, 12, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Creative review & client approval', 'Present creatives for feedback and sign-off', 6, 2, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p2, 'Revisions & final asset production', 'Incorporate feedback and produce final files', 7, 6, 'Designer', 'task', 'medium');

  -- Phase 3: Setup
  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p3, 'Tracking & pixel setup', 'Install tracking pixels, conversion events, UTMs', 1, 3, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p3, 'Audience building & targeting', 'Create custom/lookalike audiences, set targeting', 2, 3, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p3, 'Campaign build in ad platforms', 'Create campaigns, ad sets, and ads in each platform', 3, 6, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p3, 'QA & test conversions', 'Test all tracking, links, and conversion flow', 4, 2, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p3, 'Pre-launch checklist', 'Final review before going live', 5, 1, 'Account Manager', 'milestone', 'high');

  -- Phase 4: Launch & Optimise
  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p4, 'Campaign launch', 'Switch campaigns live and confirm delivery', 1, 1, 'Media Buyer', 'milestone', 'urgent'),
  (tmpl_id, p4, 'Daily performance monitoring', 'Monitor spend, CPM, CPC, CPA, and pacing', 2, 8, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p4, 'Bid & budget optimisation', 'Adjust bids, budgets, and targeting based on data', 3, 6, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p4, 'Creative performance review', 'Identify winning/losing creatives, rotate as needed', 4, 3, 'Media Buyer', 'task', 'medium'),
  (tmpl_id, p4, 'Weekly client status update', 'Send weekly performance snapshot to client', 5, 4, 'Account Manager', 'task', 'medium');

  -- Phase 5: Reporting
  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p5, 'Data export & analysis', 'Pull data from all platforms and analyse results', 1, 4, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p5, 'Campaign performance report', 'Build comprehensive report with insights and benchmarks', 2, 6, 'Account Manager', 'deliverable', 'high'),
  (tmpl_id, p5, 'Recommendations & next steps', 'Document learnings and recommendations for future', 3, 2, 'Strategist', 'task', 'medium'),
  (tmpl_id, p5, 'Client debrief meeting', 'Present results and discuss next steps', 4, 2, 'Account Manager', 'task', 'high');
END $$;


-- ============================================
-- 2. WEBSITE REDESIGN (existing — add phases & tasks)
-- ============================================
DO $$
DECLARE
  tmpl_id UUID := '5c675ee5-9629-4d17-b80b-2f62d83059e2';
  p1 UUID; p2 UUID; p3 UUID; p4 UUID; p5 UUID;
BEGIN
  UPDATE project_templates SET
    description = 'Full website redesign from discovery through UX, design, development, and launch',
    estimated_duration_days = 60,
    estimated_hours = 200,
    default_budget_type = 'fixed',
    default_budget_amount = 40000,
    tags = ARRAY['website', 'design', 'development', 'ux'],
    is_public = true
  WHERE id = tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Discovery & Planning', 'Stakeholder interviews, content audit, sitemap, and project plan', 1, 10, 15, true),
    (uuid_generate_v4(), tmpl_id, 'UX & Wireframes', 'Information architecture, user flows, and wireframes', 2, 10, 20, true),
    (uuid_generate_v4(), tmpl_id, 'Visual Design', 'UI design, style guide, and responsive mockups', 3, 12, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Development', 'Frontend and backend build, CMS integration, and content population', 4, 20, 30, false),
    (uuid_generate_v4(), tmpl_id, 'QA & Launch', 'Testing, bug fixes, migration, and go-live', 5, 8, 10, true);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;
  SELECT id INTO p5 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 5;

  INSERT INTO template_tasks (template_id, phase_id, title, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  -- Discovery
  (tmpl_id, p1, 'Stakeholder interviews & requirements', 1, 4, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Content audit & inventory', 2, 6, 'Content Strategist', 'task', 'high'),
  (tmpl_id, p1, 'Competitor website analysis', 3, 4, 'Strategist', 'task', 'medium'),
  (tmpl_id, p1, 'Sitemap & information architecture', 4, 6, 'UX Designer', 'deliverable', 'high'),
  (tmpl_id, p1, 'Technical requirements & platform selection', 5, 3, 'Developer', 'task', 'high'),
  (tmpl_id, p1, 'Project plan & timeline sign-off', 6, 2, 'Account Manager', 'approval', 'high'),
  -- UX
  (tmpl_id, p2, 'User flow mapping', 1, 6, 'UX Designer', 'task', 'high'),
  (tmpl_id, p2, 'Wireframes — key pages', 2, 16, 'UX Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Mobile responsive wireframes', 3, 8, 'UX Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Wireframe review & approval', 4, 2, 'Account Manager', 'approval', 'high'),
  -- Design
  (tmpl_id, p3, 'Moodboard & style direction', 1, 4, 'Designer', 'task', 'high'),
  (tmpl_id, p3, 'Homepage design', 2, 8, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p3, 'Inner page templates', 3, 12, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p3, 'Responsive design variants', 4, 8, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p3, 'UI component library / style guide', 5, 6, 'Designer', 'deliverable', 'medium'),
  (tmpl_id, p3, 'Design review & approval', 6, 2, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p3, 'Design revisions', 7, 6, 'Designer', 'task', 'medium'),
  -- Development
  (tmpl_id, p4, 'Development environment setup', 1, 4, 'Developer', 'task', 'high'),
  (tmpl_id, p4, 'Frontend build — HTML/CSS/JS', 2, 24, 'Developer', 'task', 'high'),
  (tmpl_id, p4, 'CMS integration & templating', 3, 16, 'Developer', 'task', 'high'),
  (tmpl_id, p4, 'Forms, integrations & functionality', 4, 8, 'Developer', 'task', 'medium'),
  (tmpl_id, p4, 'Content population', 5, 8, 'Content Strategist', 'task', 'medium'),
  (tmpl_id, p4, 'SEO setup (meta, sitemap, schema)', 6, 4, 'Developer', 'task', 'medium'),
  (tmpl_id, p4, 'Analytics & tracking setup', 7, 3, 'Developer', 'task', 'medium'),
  -- QA & Launch
  (tmpl_id, p5, 'Cross-browser & device testing', 1, 6, 'QA', 'task', 'high'),
  (tmpl_id, p5, 'Accessibility audit (WCAG)', 2, 4, 'QA', 'task', 'medium'),
  (tmpl_id, p5, 'Performance optimisation', 3, 4, 'Developer', 'task', 'medium'),
  (tmpl_id, p5, 'Bug fixes & revisions', 4, 6, 'Developer', 'task', 'high'),
  (tmpl_id, p5, 'Client UAT sign-off', 5, 2, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p5, 'DNS & hosting migration', 6, 3, 'Developer', 'task', 'high'),
  (tmpl_id, p5, 'Go-live & post-launch monitoring', 7, 3, 'Developer', 'milestone', 'urgent');
END $$;


-- ============================================
-- 3. BRAND IDENTITY (existing — add phases & tasks)
-- ============================================
DO $$
DECLARE
  tmpl_id UUID := 'a43effe4-da6f-4bf5-80d2-02fdc7bb1378';
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  UPDATE project_templates SET
    description = 'Complete brand identity development — research, logo, visual system, and brand guidelines',
    estimated_duration_days = 35,
    estimated_hours = 80,
    default_budget_type = 'fixed',
    default_budget_amount = 15000,
    tags = ARRAY['branding', 'logo', 'identity', 'design'],
    is_public = true
  WHERE id = tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Discovery & Research', 'Brand audit, competitor review, and positioning', 1, 7, 20, true),
    (uuid_generate_v4(), tmpl_id, 'Concept Development', 'Logo concepts, visual direction, and initial explorations', 2, 10, 30, true),
    (uuid_generate_v4(), tmpl_id, 'Refinement', 'Refine chosen direction, colour palette, typography, and applications', 3, 10, 30, true),
    (uuid_generate_v4(), tmpl_id, 'Delivery', 'Brand guidelines document and final asset delivery', 4, 8, 20, true);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Brand discovery workshop', 1, 3, 'Creative Director', 'task', 'high'),
  (tmpl_id, p1, 'Competitor & industry visual audit', 2, 4, 'Designer', 'task', 'high'),
  (tmpl_id, p1, 'Brand positioning & personality', 3, 4, 'Strategist', 'deliverable', 'high'),
  (tmpl_id, p1, 'Moodboard & style direction', 4, 3, 'Designer', 'task', 'medium'),
  (tmpl_id, p2, 'Logo concept sketches (3 directions)', 1, 10, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Colour palette exploration', 2, 3, 'Designer', 'task', 'high'),
  (tmpl_id, p2, 'Typography selection', 3, 2, 'Designer', 'task', 'medium'),
  (tmpl_id, p2, 'Concept presentation to client', 4, 2, 'Creative Director', 'approval', 'high'),
  (tmpl_id, p3, 'Logo refinement & variations', 1, 8, 'Designer', 'task', 'high'),
  (tmpl_id, p3, 'Colour system finalisation', 2, 3, 'Designer', 'task', 'high'),
  (tmpl_id, p3, 'Typography hierarchy & usage rules', 3, 3, 'Designer', 'task', 'medium'),
  (tmpl_id, p3, 'Brand application mockups', 4, 6, 'Designer', 'deliverable', 'medium'),
  (tmpl_id, p3, 'Client review & final approval', 5, 2, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p4, 'Brand guidelines document', 1, 12, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p4, 'Final logo files (all formats)', 2, 3, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p4, 'Social media templates', 3, 4, 'Designer', 'deliverable', 'medium'),
  (tmpl_id, p4, 'Stationery design (business cards, letterhead)', 4, 4, 'Designer', 'deliverable', 'medium'),
  (tmpl_id, p4, 'Asset handoff & brand training', 5, 2, 'Creative Director', 'task', 'medium');
END $$;


-- ============================================
-- 4. NEW: TV Commercial Production
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (name, description, category, tags, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, is_public, is_active)
  VALUES ('TV Commercial Production', 'Full TVC production from creative brief through pre-production, shoot, post-production, and broadcast delivery', 'Broadcast', ARRAY['tv', 'commercial', 'video', 'broadcast'], 'fixed', 80000, 56, 160, true, true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Creative & Pre-Production', 1, 14, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Production (Shoot)', 2, 5, 35, false),
    (uuid_generate_v4(), tmpl_id, 'Post-Production', 3, 21, 30, true),
    (uuid_generate_v4(), tmpl_id, 'Delivery & Clearance', 4, 7, 10, true);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Creative brief & strategy alignment', 1, 4, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Script development', 2, 12, 'Copywriter', 'deliverable', 'high'),
  (tmpl_id, p1, 'Storyboard / shooting board', 3, 8, 'Creative Director', 'deliverable', 'high'),
  (tmpl_id, p1, 'Script & storyboard client approval', 4, 2, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p1, 'Director & production company selection', 5, 4, 'Producer', 'task', 'high'),
  (tmpl_id, p1, 'Casting & talent booking', 6, 6, 'Producer', 'task', 'high'),
  (tmpl_id, p1, 'Location scouting', 7, 4, 'Producer', 'task', 'medium'),
  (tmpl_id, p1, 'Pre-production meeting (PPM)', 8, 3, 'Producer', 'milestone', 'high'),
  (tmpl_id, p2, 'Shoot day 1 — principal photography', 1, 12, 'Producer', 'task', 'urgent'),
  (tmpl_id, p2, 'Shoot day 2 (if needed)', 2, 12, 'Producer', 'task', 'high'),
  (tmpl_id, p2, 'Behind-the-scenes content capture', 3, 4, 'Videographer', 'task', 'low'),
  (tmpl_id, p3, 'Offline edit (rough cut)', 1, 12, 'Editor', 'deliverable', 'high'),
  (tmpl_id, p3, 'Client rough cut review', 2, 2, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p3, 'Fine cut & revisions', 3, 8, 'Editor', 'task', 'high'),
  (tmpl_id, p3, 'Colour grading', 4, 6, 'Editor', 'task', 'medium'),
  (tmpl_id, p3, 'Sound design & music', 5, 8, 'Editor', 'task', 'high'),
  (tmpl_id, p3, 'Voiceover recording', 6, 4, 'Producer', 'task', 'high'),
  (tmpl_id, p3, 'Online cutdowns (15s, 6s, social)', 7, 8, 'Editor', 'deliverable', 'medium'),
  (tmpl_id, p3, 'Final client approval', 8, 2, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p4, 'Ad clearance submission (CAD/ClearAds)', 1, 3, 'Producer', 'task', 'high'),
  (tmpl_id, p4, 'Master file delivery to networks', 2, 2, 'Producer', 'deliverable', 'high'),
  (tmpl_id, p4, 'Digital format delivery', 3, 2, 'Editor', 'deliverable', 'medium'),
  (tmpl_id, p4, 'Archival & asset management', 4, 2, 'Producer', 'task', 'low');
END $$;


-- ============================================
-- 5. NEW: Radio Campaign
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID;
BEGIN
  INSERT INTO project_templates (name, description, category, tags, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, is_public, is_active)
  VALUES ('Radio Campaign', 'Radio ad production — scripting, voiceover, audio production, and station delivery', 'Broadcast', ARRAY['radio', 'audio', 'broadcast', 'ads'], 'fixed', 8000, 21, 40, true, true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Scripting', 1, 7, 30, true),
    (uuid_generate_v4(), tmpl_id, 'Production', 2, 7, 50, false),
    (uuid_generate_v4(), tmpl_id, 'Delivery', 3, 7, 20, true);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;

  INSERT INTO template_tasks (template_id, phase_id, title, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Creative brief review', 1, 2, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Script writing (2-3 options)', 2, 6, 'Copywriter', 'deliverable', 'high'),
  (tmpl_id, p1, 'Script client approval', 3, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p1, 'Script revisions', 4, 2, 'Copywriter', 'task', 'medium'),
  (tmpl_id, p2, 'Voiceover artist selection & booking', 1, 2, 'Producer', 'task', 'high'),
  (tmpl_id, p2, 'Voiceover recording session', 2, 3, 'Producer', 'task', 'high'),
  (tmpl_id, p2, 'Music selection / licensing', 3, 2, 'Producer', 'task', 'medium'),
  (tmpl_id, p2, 'Audio mixing & production', 4, 4, 'Producer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Produce duration variants (15s, 30s, 60s)', 5, 3, 'Producer', 'task', 'medium'),
  (tmpl_id, p3, 'Client audio approval', 1, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p3, 'Final mix & master', 2, 2, 'Producer', 'task', 'high'),
  (tmpl_id, p3, 'Station delivery (WAV/MP3)', 3, 2, 'Producer', 'deliverable', 'high'),
  (tmpl_id, p3, 'Campaign monitoring & rotation check', 4, 2, 'Media Buyer', 'task', 'medium');
END $$;


-- ============================================
-- 6. NEW: Billboard / OOH Campaign
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID;
BEGIN
  INSERT INTO project_templates (name, description, category, tags, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, is_public, is_active)
  VALUES ('Billboard / OOH Campaign', 'Out-of-home advertising — billboard and signage design, production, and vendor coordination', 'Print & OOH', ARRAY['billboard', 'ooh', 'outdoor', 'signage'], 'fixed', 12000, 28, 50, true, true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Planning & Creative', 1, 10, 40, true),
    (uuid_generate_v4(), tmpl_id, 'Design & Production', 2, 10, 40, true),
    (uuid_generate_v4(), tmpl_id, 'Vendor Delivery & Install', 3, 8, 20, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;

  INSERT INTO template_tasks (template_id, phase_id, title, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Campaign brief & location strategy', 1, 3, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Vendor spec sheet collection', 2, 2, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Creative concept development', 3, 6, 'Creative Director', 'task', 'high'),
  (tmpl_id, p1, 'Headline & copy writing', 4, 3, 'Copywriter', 'task', 'high'),
  (tmpl_id, p1, 'Concept client approval', 5, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p2, 'Billboard artwork design', 1, 8, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Size adaptations (digital, poster, bus shelter)', 2, 6, 'Designer', 'task', 'high'),
  (tmpl_id, p2, 'Artwork review & client approval', 3, 2, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p2, 'Revisions & final art production', 4, 4, 'Designer', 'task', 'medium'),
  (tmpl_id, p2, 'Print-ready file preparation', 5, 2, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p3, 'Files to vendor / print house', 1, 1, 'Account Manager', 'task', 'high'),
  (tmpl_id, p3, 'Print proof review', 2, 2, 'Designer', 'task', 'high'),
  (tmpl_id, p3, 'Installation coordination', 3, 2, 'Account Manager', 'task', 'medium'),
  (tmpl_id, p3, 'Post-install photo verification', 4, 1, 'Account Manager', 'task', 'medium'),
  (tmpl_id, p3, 'Campaign live confirmation', 5, 1, 'Account Manager', 'milestone', 'high');
END $$;


-- ============================================
-- 7. NEW: Display Banner Production
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID;
BEGIN
  INSERT INTO project_templates (name, description, category, tags, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, is_public, is_active)
  VALUES ('Display Banner Production', 'HTML5, static, and animated display banner design and production for digital ad campaigns', 'Digital Ads', ARRAY['banners', 'display', 'html5', 'ads', 'digital'], 'time_materials', 5000, 14, 35, true, true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Brief & Concept', 1, 3, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Design & Build', 2, 7, 55, true),
    (uuid_generate_v4(), tmpl_id, 'QA & Delivery', 3, 4, 20, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;

  INSERT INTO template_tasks (template_id, phase_id, title, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Review creative brief & brand assets', 1, 1, 'Designer', 'task', 'high'),
  (tmpl_id, p1, 'Confirm sizes, specs & ad network requirements', 2, 1, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p1, 'Key visual & messaging concept', 3, 3, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p1, 'Concept client approval', 4, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p2, 'Design hero size (300x250)', 1, 3, 'Designer', 'task', 'high'),
  (tmpl_id, p2, 'Adapt to all required sizes', 2, 6, 'Designer', 'task', 'high'),
  (tmpl_id, p2, 'Animation / HTML5 build', 3, 6, 'Designer', 'task', 'high'),
  (tmpl_id, p2, 'A/B creative variants', 4, 3, 'Designer', 'task', 'medium'),
  (tmpl_id, p2, 'Client creative review', 5, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p2, 'Revisions', 6, 2, 'Designer', 'task', 'medium'),
  (tmpl_id, p3, 'File size & spec compliance check', 1, 2, 'Designer', 'task', 'high'),
  (tmpl_id, p3, 'Click-through URL verification', 2, 1, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p3, 'Cross-browser render testing', 3, 2, 'QA', 'task', 'medium'),
  (tmpl_id, p3, 'Final file delivery & upload', 4, 1, 'Media Buyer', 'deliverable', 'high');
END $$;


-- ============================================
-- 8. NEW: Social Media Management (Monthly)
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (name, description, category, tags, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, is_public, is_active)
  VALUES ('Social Media Management', 'Monthly social media content — strategy, content creation, scheduling, community management, and reporting', 'Social Media', ARRAY['social', 'content', 'instagram', 'facebook', 'linkedin', 'tiktok'], 'retainer_allocation', 5000, 30, 60, true, true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Strategy & Planning', 1, 5, 20, true),
    (uuid_generate_v4(), tmpl_id, 'Content Creation', 2, 12, 40, true),
    (uuid_generate_v4(), tmpl_id, 'Scheduling & Community', 3, 30, 25, false),
    (uuid_generate_v4(), tmpl_id, 'Reporting', 4, 3, 15, true);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Monthly content strategy meeting', 1, 2, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Content calendar creation', 2, 4, 'Content Strategist', 'deliverable', 'high'),
  (tmpl_id, p1, 'Calendar client approval', 3, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p1, 'Hashtag & trend research', 4, 2, 'Content Strategist', 'task', 'medium'),
  (tmpl_id, p2, 'Copywriting — post captions', 1, 6, 'Copywriter', 'task', 'high'),
  (tmpl_id, p2, 'Graphic design — feed posts', 2, 8, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Reels / short video creation', 3, 8, 'Videographer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Story content creation', 4, 4, 'Designer', 'task', 'medium'),
  (tmpl_id, p2, 'Content client review & approval', 5, 2, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p3, 'Schedule posts in platform', 1, 3, 'Content Strategist', 'task', 'high'),
  (tmpl_id, p3, 'Daily community management', 2, 8, 'Community Manager', 'task', 'high'),
  (tmpl_id, p3, 'Respond to DMs & comments', 3, 4, 'Community Manager', 'task', 'high'),
  (tmpl_id, p3, 'Monitor brand mentions & sentiment', 4, 2, 'Community Manager', 'task', 'medium'),
  (tmpl_id, p4, 'Monthly analytics data pull', 1, 2, 'Analyst', 'task', 'high'),
  (tmpl_id, p4, 'Monthly performance report', 2, 3, 'Account Manager', 'deliverable', 'high'),
  (tmpl_id, p4, 'Recommendations for next month', 3, 2, 'Content Strategist', 'task', 'medium');
END $$;


-- ============================================
-- 9. NEW: SEO Campaign
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID;
BEGIN
  INSERT INTO project_templates (name, description, category, tags, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, is_public, is_active)
  VALUES ('SEO Campaign', 'Search engine optimisation — technical audit, on-page optimisation, content strategy, and link building', 'SEO', ARRAY['seo', 'search', 'content', 'technical'], 'retainer_allocation', 6000, 90, 80, true, true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Audit & Strategy', 1, 14, 30, true),
    (uuid_generate_v4(), tmpl_id, 'Implementation', 2, 45, 50, false),
    (uuid_generate_v4(), tmpl_id, 'Monitoring & Reporting', 3, 30, 20, true);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;

  INSERT INTO template_tasks (template_id, phase_id, title, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Technical SEO audit', 1, 8, 'SEO Specialist', 'deliverable', 'high'),
  (tmpl_id, p1, 'Keyword research & mapping', 2, 6, 'SEO Specialist', 'deliverable', 'high'),
  (tmpl_id, p1, 'Competitor SEO analysis', 3, 4, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Content gap analysis', 4, 4, 'Content Strategist', 'task', 'medium'),
  (tmpl_id, p1, 'SEO strategy & roadmap', 5, 4, 'SEO Specialist', 'deliverable', 'high'),
  (tmpl_id, p1, 'Strategy client sign-off', 6, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p2, 'Technical fixes (sitemap, schema, speed)', 1, 8, 'Developer', 'task', 'high'),
  (tmpl_id, p2, 'On-page optimisation (titles, metas, headings)', 2, 8, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p2, 'Content creation (blog posts, landing pages)', 3, 12, 'Copywriter', 'task', 'high'),
  (tmpl_id, p2, 'Internal linking optimisation', 4, 3, 'SEO Specialist', 'task', 'medium'),
  (tmpl_id, p2, 'Link building & outreach', 5, 8, 'SEO Specialist', 'task', 'medium'),
  (tmpl_id, p2, 'Local SEO optimisation (if applicable)', 6, 4, 'SEO Specialist', 'task', 'medium'),
  (tmpl_id, p3, 'Rank tracking setup & monitoring', 1, 3, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p3, 'Monthly SEO performance report', 2, 4, 'SEO Specialist', 'deliverable', 'high'),
  (tmpl_id, p3, 'Monthly strategy adjustment', 3, 2, 'SEO Specialist', 'task', 'medium'),
  (tmpl_id, p3, 'Quarterly business review', 4, 3, 'Account Manager', 'task', 'medium');
END $$;


-- ============================================
-- 10. NEW: Email Marketing Campaign
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID;
BEGIN
  INSERT INTO project_templates (name, description, category, tags, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, is_public, is_active)
  VALUES ('Email Marketing Campaign', 'Email campaign production — strategy, design, copywriting, build, and deployment', 'Email', ARRAY['email', 'edm', 'newsletter', 'automation'], 'time_materials', 4000, 14, 30, true, true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Strategy & Content', 1, 5, 35, true),
    (uuid_generate_v4(), tmpl_id, 'Design & Build', 2, 5, 45, true),
    (uuid_generate_v4(), tmpl_id, 'Test & Deploy', 3, 4, 20, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;

  INSERT INTO template_tasks (template_id, phase_id, title, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Campaign brief & objectives', 1, 1, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Audience segmentation', 2, 2, 'Strategist', 'task', 'high'),
  (tmpl_id, p1, 'Email copywriting', 3, 4, 'Copywriter', 'deliverable', 'high'),
  (tmpl_id, p1, 'Subject line options & A/B plan', 4, 1, 'Copywriter', 'task', 'medium'),
  (tmpl_id, p1, 'Copy client approval', 5, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p2, 'Email template design', 1, 4, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'HTML email build', 2, 4, 'Developer', 'task', 'high'),
  (tmpl_id, p2, 'Design client approval', 3, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p2, 'Revisions', 4, 2, 'Designer', 'task', 'medium'),
  (tmpl_id, p3, 'Email rendering test (Litmus/Email on Acid)', 1, 2, 'Developer', 'task', 'high'),
  (tmpl_id, p3, 'Send test & internal review', 2, 1, 'Account Manager', 'task', 'high'),
  (tmpl_id, p3, 'UTM & tracking setup', 3, 1, 'Media Buyer', 'task', 'medium'),
  (tmpl_id, p3, 'Deploy / schedule send', 4, 1, 'Account Manager', 'milestone', 'high'),
  (tmpl_id, p3, 'Post-send performance report', 5, 2, 'Analyst', 'deliverable', 'medium');
END $$;


-- ============================================
-- 11. NEW: Video Production
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID;
BEGIN
  INSERT INTO project_templates (name, description, category, tags, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, is_public, is_active)
  VALUES ('Video Production', 'Corporate and social video production — concept, filming, editing, and delivery', 'Video', ARRAY['video', 'production', 'filming', 'social'], 'fixed', 15000, 28, 60, true, true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Pre-Production', 1, 7, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Production', 2, 5, 40, false),
    (uuid_generate_v4(), tmpl_id, 'Post-Production', 3, 16, 35, true);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;

  INSERT INTO template_tasks (template_id, phase_id, title, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Creative brief & concept', 1, 3, 'Creative Director', 'task', 'high'),
  (tmpl_id, p1, 'Script / interview questions', 2, 4, 'Copywriter', 'deliverable', 'high'),
  (tmpl_id, p1, 'Shot list / storyboard', 3, 3, 'Videographer', 'deliverable', 'high'),
  (tmpl_id, p1, 'Location & talent logistics', 4, 3, 'Producer', 'task', 'high'),
  (tmpl_id, p1, 'Client pre-production sign-off', 5, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p2, 'Shoot day — filming', 1, 10, 'Videographer', 'task', 'urgent'),
  (tmpl_id, p2, 'B-roll & supplementary footage', 2, 4, 'Videographer', 'task', 'medium'),
  (tmpl_id, p2, 'Audio recording / interviews', 3, 3, 'Videographer', 'task', 'high'),
  (tmpl_id, p3, 'Rough cut edit', 1, 8, 'Editor', 'deliverable', 'high'),
  (tmpl_id, p3, 'Client rough cut review', 2, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p3, 'Revisions & fine cut', 3, 4, 'Editor', 'task', 'high'),
  (tmpl_id, p3, 'Music & sound design', 4, 3, 'Editor', 'task', 'medium'),
  (tmpl_id, p3, 'Subtitles / captions', 5, 2, 'Editor', 'task', 'medium'),
  (tmpl_id, p3, 'Social cutdowns (9:16, 1:1)', 6, 3, 'Editor', 'deliverable', 'medium'),
  (tmpl_id, p3, 'Final delivery & asset handoff', 7, 2, 'Producer', 'deliverable', 'high');
END $$;


-- ============================================
-- 12. NEW: Print & Collateral Production
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID;
BEGIN
  INSERT INTO project_templates (name, description, category, tags, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, is_public, is_active)
  VALUES ('Print & Collateral Production', 'Design and production of brochures, flyers, posters, stationery, and printed materials', 'Print & OOH', ARRAY['print', 'brochure', 'flyer', 'collateral', 'design'], 'time_materials', 5000, 14, 30, true, true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Brief & Content', 1, 3, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Design', 2, 7, 50, true),
    (uuid_generate_v4(), tmpl_id, 'Print Production', 3, 4, 25, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;

  INSERT INTO template_tasks (template_id, phase_id, title, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Brief review & content gathering', 1, 2, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Copywriting / content creation', 2, 4, 'Copywriter', 'task', 'high'),
  (tmpl_id, p1, 'Copy client approval', 3, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p2, 'Layout & design concept', 1, 6, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Design client review', 2, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p2, 'Revisions', 3, 3, 'Designer', 'task', 'medium'),
  (tmpl_id, p2, 'Final artwork preparation', 4, 2, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p3, 'Print-ready file export (PDF/X)', 1, 1, 'Designer', 'task', 'high'),
  (tmpl_id, p3, 'Vendor liaison & quote', 2, 2, 'Account Manager', 'task', 'medium'),
  (tmpl_id, p3, 'Print proof review', 3, 2, 'Designer', 'task', 'high'),
  (tmpl_id, p3, 'Final print approval & dispatch', 4, 1, 'Account Manager', 'milestone', 'high');
END $$;


-- ============================================
-- 13. NEW: Landing Page
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID;
BEGIN
  INSERT INTO project_templates (name, description, category, tags, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, is_public, is_active)
  VALUES ('Landing Page', 'Campaign landing page — design, development, tracking setup, and launch', 'Web Development', ARRAY['landing-page', 'web', 'conversion', 'campaign'], 'fixed', 6000, 14, 35, true, true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Planning & Content', 1, 3, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Design & Build', 2, 7, 55, true),
    (uuid_generate_v4(), tmpl_id, 'QA & Launch', 3, 4, 20, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;

  INSERT INTO template_tasks (template_id, phase_id, title, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Brief review & wireframe', 1, 3, 'UX Designer', 'task', 'high'),
  (tmpl_id, p1, 'Landing page copywriting', 2, 3, 'Copywriter', 'deliverable', 'high'),
  (tmpl_id, p1, 'Copy & wireframe approval', 3, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p2, 'Visual design', 1, 6, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Design client approval', 2, 1, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p2, 'Frontend development', 3, 8, 'Developer', 'task', 'high'),
  (tmpl_id, p2, 'Form & CRM integration', 4, 3, 'Developer', 'task', 'high'),
  (tmpl_id, p3, 'Cross-device testing', 1, 2, 'QA', 'task', 'high'),
  (tmpl_id, p3, 'Tracking setup (GA, pixels, UTMs)', 2, 2, 'Developer', 'task', 'high'),
  (tmpl_id, p3, 'Speed & performance check', 3, 1, 'Developer', 'task', 'medium'),
  (tmpl_id, p3, 'Go-live', 4, 1, 'Developer', 'milestone', 'high'),
  (tmpl_id, p3, 'Post-launch conversion check', 5, 1, 'Media Buyer', 'task', 'high');
END $$;
