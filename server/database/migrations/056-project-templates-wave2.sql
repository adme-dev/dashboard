-- ============================================
-- Project Templates Wave 2
-- 13 new templates covering remaining agency services
-- ============================================

-- ============================================
-- 1. PAID SEARCH (PPC) CAMPAIGN
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (id, name, description, category, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, tags, is_public)
  VALUES (uuid_generate_v4(), 'Paid Search (PPC) Campaign', 'Google/Bing search campaign from keyword research through launch, optimisation, and performance reporting', 'Paid Media', 'retainer_allocation', 7000, 30, 80, ARRAY['ppc', 'search', 'google-ads', 'sem'], true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Search Strategy & Account Setup', 'Audit existing account, define goals, structure campaigns', 1, 7, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Keyword & Ad Copy Development', 'Research keywords, write ad copy, build extensions', 2, 7, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Campaign Launch & Optimisation', 'Go live, monitor performance, optimise bids and quality scores', 3, 14, 35, false),
    (uuid_generate_v4(), tmpl_id, 'Monitoring & Reporting', 'Ongoing performance analysis and client reporting', 4, 5, 15, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Account audit & competitor analysis', 'Review existing account structure, quality scores, and competitor landscape', 1, 4, 'SEM Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Goal & KPI definition', 'Define target CPA, ROAS, conversion goals with client', 2, 2, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Campaign structure planning', 'Design account hierarchy — campaigns, ad groups, match types', 3, 3, 'SEM Specialist', 'deliverable', 'high'),
  (tmpl_id, p1, 'Conversion tracking setup', 'Install Google Tag, set up conversion actions, import goals', 4, 3, 'SEM Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Strategy sign-off', 'Client approves campaign structure and budget allocation', 5, 1, 'Account Manager', 'approval', 'high'),

  (tmpl_id, p2, 'Keyword research & grouping', 'Build keyword lists, group by theme, assign match types', 1, 6, 'SEM Specialist', 'task', 'high'),
  (tmpl_id, p2, 'Negative keyword list', 'Compile negative keywords to prevent wasted spend', 2, 2, 'SEM Specialist', 'task', 'medium'),
  (tmpl_id, p2, 'Ad copy writing (RSAs)', 'Write responsive search ads — headlines, descriptions, pins', 3, 6, 'Copywriter', 'deliverable', 'high'),
  (tmpl_id, p2, 'Ad extensions setup', 'Create sitelinks, callouts, structured snippets, call extensions', 4, 3, 'SEM Specialist', 'task', 'medium'),
  (tmpl_id, p2, 'Landing page review & recommendations', 'Audit landing pages for quality score and conversion rate', 5, 3, 'SEM Specialist', 'task', 'high'),
  (tmpl_id, p2, 'Client ad copy approval', 'Present ad copy for review and sign-off', 6, 1, 'Account Manager', 'approval', 'high'),

  (tmpl_id, p3, 'Campaign build & launch', 'Build campaigns in Google Ads and launch', 1, 4, 'SEM Specialist', 'milestone', 'urgent'),
  (tmpl_id, p3, 'Daily bid management', 'Monitor and adjust bids based on performance', 2, 10, 'SEM Specialist', 'task', 'high'),
  (tmpl_id, p3, 'Search term mining', 'Review search term reports, add negatives, find new keywords', 3, 6, 'SEM Specialist', 'task', 'high'),
  (tmpl_id, p3, 'Quality score optimisation', 'Improve ad relevance, landing page experience, CTR', 4, 4, 'SEM Specialist', 'task', 'medium'),
  (tmpl_id, p3, 'A/B test ad variations', 'Test headline and description variations for CTR improvement', 5, 4, 'SEM Specialist', 'task', 'medium'),
  (tmpl_id, p3, 'Weekly client status update', 'Send performance snapshot with spend, conversions, CPA', 6, 4, 'Account Manager', 'task', 'medium'),

  (tmpl_id, p4, 'Performance data export', 'Pull data from Google Ads, Analytics, and CRM', 1, 3, 'SEM Specialist', 'task', 'high'),
  (tmpl_id, p4, 'Monthly performance report', 'Build report with KPIs, trends, and insights', 2, 5, 'Account Manager', 'deliverable', 'high'),
  (tmpl_id, p4, 'Budget pacing review', 'Review spend against forecast and adjust allocation', 3, 2, 'SEM Specialist', 'task', 'high'),
  (tmpl_id, p4, 'Recommendations & next steps', 'Document optimisation recommendations for next period', 4, 2, 'SEM Specialist', 'task', 'medium');
END $$;

-- ============================================
-- 2. CONTENT MARKETING PROGRAM
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (id, name, description, category, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, tags, is_public)
  VALUES (uuid_generate_v4(), 'Content Marketing Program', 'Ongoing content strategy with editorial calendar, content creation, publishing, and performance tracking', 'Content', 'retainer_allocation', 8000, 30, 90, ARRAY['content', 'blog', 'editorial', 'seo-content'], true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Strategy & Editorial Calendar', 'Define content pillars, topics, and publishing schedule', 1, 7, 20, true),
    (uuid_generate_v4(), tmpl_id, 'Content Creation', 'Write, design, and produce content assets', 2, 14, 45, true),
    (uuid_generate_v4(), tmpl_id, 'Publishing & Promotion', 'Publish content and promote across channels', 3, 5, 20, false),
    (uuid_generate_v4(), tmpl_id, 'Performance Analysis', 'Measure content performance and refine strategy', 4, 4, 15, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Content audit & gap analysis', 'Review existing content, identify gaps and opportunities', 1, 4, 'Content Strategist', 'task', 'high'),
  (tmpl_id, p1, 'Keyword & topic research', 'Identify high-value topics and search intent clusters', 2, 4, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Define content pillars & themes', 'Establish core content themes aligned to business goals', 3, 3, 'Content Strategist', 'deliverable', 'high'),
  (tmpl_id, p1, 'Build editorial calendar', 'Plan content topics, formats, and publish dates for the period', 4, 3, 'Content Strategist', 'deliverable', 'high'),
  (tmpl_id, p1, 'Editorial calendar sign-off', 'Client approves content plan', 5, 1, 'Account Manager', 'approval', 'high'),

  (tmpl_id, p2, 'Article brief creation', 'Write detailed briefs with keywords, structure, and CTAs', 1, 4, 'Content Strategist', 'task', 'high'),
  (tmpl_id, p2, 'Long-form article writing', 'Write SEO-optimised blog posts and articles', 2, 20, 'Copywriter', 'deliverable', 'high'),
  (tmpl_id, p2, 'Short-form content writing', 'Write social posts, email snippets, and repurposed content', 3, 8, 'Copywriter', 'deliverable', 'medium'),
  (tmpl_id, p2, 'Content design & graphics', 'Create featured images, infographics, and visual assets', 4, 10, 'Designer', 'deliverable', 'medium'),
  (tmpl_id, p2, 'Internal review & editing', 'Proofread, fact-check, and editorial review', 5, 6, 'Content Strategist', 'review', 'high'),
  (tmpl_id, p2, 'Client content approval', 'Submit content for client review and feedback', 6, 2, 'Account Manager', 'approval', 'high'),

  (tmpl_id, p3, 'CMS upload & formatting', 'Upload to WordPress/CMS, format, add images and meta', 1, 4, 'Content Strategist', 'task', 'high'),
  (tmpl_id, p3, 'On-page SEO optimisation', 'Optimise title tags, meta descriptions, internal links, schema', 2, 3, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p3, 'Social media promotion', 'Share across social channels with tailored messaging', 3, 3, 'Social Media Manager', 'task', 'medium'),
  (tmpl_id, p3, 'Email newsletter distribution', 'Include in email newsletter or dedicated send', 4, 2, 'Email Specialist', 'task', 'medium'),
  (tmpl_id, p3, 'Outreach & link building', 'Pitch content for backlinks and guest placements', 5, 4, 'SEO Specialist', 'task', 'medium'),

  (tmpl_id, p4, 'Traffic & engagement analysis', 'Review pageviews, time on page, bounce rate, shares', 1, 3, 'Content Strategist', 'task', 'high'),
  (tmpl_id, p4, 'SEO ranking tracker update', 'Check keyword ranking movements and organic traffic', 2, 2, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p4, 'Conversion attribution', 'Track content-driven leads and conversions', 3, 2, 'Content Strategist', 'task', 'medium'),
  (tmpl_id, p4, 'Monthly content performance report', 'Build report with insights and next-period recommendations', 4, 4, 'Account Manager', 'deliverable', 'high');
END $$;

-- ============================================
-- 3. INFLUENCER MARKETING CAMPAIGN
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (id, name, description, category, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, tags, is_public)
  VALUES (uuid_generate_v4(), 'Influencer Marketing Campaign', 'End-to-end influencer campaign from research and vetting through contracts, content execution, and ROI reporting', 'Social Media', 'fixed', 25000, 45, 100, ARRAY['influencer', 'social', 'creator', 'partnerships'], true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Strategy & Influencer Research', 'Define objectives, identify and vet influencers', 1, 10, 20, true),
    (uuid_generate_v4(), tmpl_id, 'Negotiation & Contracts', 'Outreach, negotiate terms, execute agreements', 2, 10, 15, true),
    (uuid_generate_v4(), tmpl_id, 'Content & Execution', 'Brief influencers, review content, coordinate posting', 3, 18, 45, true),
    (uuid_generate_v4(), tmpl_id, 'Reporting & ROI Analysis', 'Track performance, calculate ROI, compile learnings', 4, 7, 20, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Campaign objectives & KPIs', 'Define awareness, engagement, and conversion goals', 1, 3, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Influencer research & shortlist', 'Identify potential influencers by niche, audience size, engagement', 2, 8, 'Social Media Manager', 'task', 'high'),
  (tmpl_id, p1, 'Audience & authenticity vetting', 'Verify audience demographics, engagement authenticity, brand safety', 3, 6, 'Social Media Manager', 'task', 'high'),
  (tmpl_id, p1, 'Influencer shortlist presentation', 'Present recommended influencers with rationale and pricing', 4, 3, 'Account Manager', 'deliverable', 'high'),
  (tmpl_id, p1, 'Client shortlist approval', 'Client selects influencers to proceed with', 5, 1, 'Account Manager', 'approval', 'high'),

  (tmpl_id, p2, 'Influencer outreach', 'Contact selected influencers with campaign brief', 1, 4, 'Social Media Manager', 'task', 'high'),
  (tmpl_id, p2, 'Rate negotiation', 'Negotiate fees, deliverables, and usage rights', 2, 4, 'Account Manager', 'task', 'high'),
  (tmpl_id, p2, 'Contract drafting & execution', 'Draft influencer agreements including exclusivity and FTC compliance', 3, 4, 'Account Manager', 'deliverable', 'high'),
  (tmpl_id, p2, 'Product seeding / gifting', 'Ship products or provide service access to influencers', 4, 2, 'Producer', 'task', 'medium'),

  (tmpl_id, p3, 'Creative brief to influencers', 'Send detailed brief with key messages, hashtags, dos and donts', 1, 3, 'Social Media Manager', 'deliverable', 'high'),
  (tmpl_id, p3, 'Content draft review', 'Review influencer content drafts before posting', 2, 8, 'Social Media Manager', 'review', 'high'),
  (tmpl_id, p3, 'Content revision requests', 'Request changes to ensure brand alignment and compliance', 3, 4, 'Social Media Manager', 'task', 'medium'),
  (tmpl_id, p3, 'Content approval & scheduling', 'Approve final content and coordinate posting schedule', 4, 3, 'Account Manager', 'approval', 'high'),
  (tmpl_id, p3, 'Go-live coordination', 'Monitor posts going live, engage with comments', 5, 4, 'Social Media Manager', 'task', 'high'),
  (tmpl_id, p3, 'Content amplification (paid boost)', 'Boost top-performing influencer content via paid ads', 6, 4, 'Media Buyer', 'task', 'medium'),
  (tmpl_id, p3, 'Community engagement', 'Engage with comments and shares on influencer posts', 7, 4, 'Social Media Manager', 'task', 'medium'),

  (tmpl_id, p4, 'Engagement & reach data collection', 'Compile impressions, reach, engagement, clicks from all posts', 1, 4, 'Social Media Manager', 'task', 'high'),
  (tmpl_id, p4, 'Conversion & sales attribution', 'Track promo codes, UTMs, and conversion data', 2, 3, 'SEM Specialist', 'task', 'high'),
  (tmpl_id, p4, 'ROI calculation & benchmarking', 'Calculate cost per engagement, CPM, ROAS vs industry benchmarks', 3, 3, 'Account Manager', 'task', 'high'),
  (tmpl_id, p4, 'Campaign performance report', 'Comprehensive report with top performers and recommendations', 4, 5, 'Account Manager', 'deliverable', 'high'),
  (tmpl_id, p4, 'Client debrief & next steps', 'Present results and discuss ongoing partnerships', 5, 2, 'Account Manager', 'task', 'medium');
END $$;

-- ============================================
-- 4. CONVERSION RATE OPTIMISATION (CRO)
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (id, name, description, category, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, tags, is_public)
  VALUES (uuid_generate_v4(), 'Conversion Rate Optimisation (CRO)', 'Data-driven CRO program with analytics audit, hypothesis testing, A/B experiments, and iterative improvement', 'Analytics', 'time_materials', 6000, 30, 70, ARRAY['cro', 'ab-testing', 'conversion', 'analytics', 'ux'], true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Discovery & Analysis', 'Audit analytics, heatmaps, user recordings, identify drop-offs', 1, 7, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Testing Plan', 'Prioritise hypotheses, design experiments', 2, 5, 20, true),
    (uuid_generate_v4(), tmpl_id, 'A/B Test Execution', 'Build variations, run experiments, monitor statistical significance', 3, 14, 40, false),
    (uuid_generate_v4(), tmpl_id, 'Results & Recommendations', 'Analyse results, document learnings, plan next round', 4, 4, 15, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Google Analytics & funnel audit', 'Analyse conversion funnels, drop-off points, and traffic quality', 1, 4, 'CRO Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Heatmap & session recording analysis', 'Install Hotjar/FullStory, review user behaviour patterns', 2, 4, 'CRO Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Form & checkout analysis', 'Identify friction in forms, checkout flows, and CTAs', 3, 3, 'CRO Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Competitor UX benchmarking', 'Compare conversion flows against top competitors', 4, 3, 'CRO Specialist', 'task', 'medium'),
  (tmpl_id, p1, 'Insights & opportunities report', 'Document findings with prioritised improvement opportunities', 5, 3, 'CRO Specialist', 'deliverable', 'high'),

  (tmpl_id, p2, 'Hypothesis generation', 'Create testable hypotheses based on analysis findings', 1, 3, 'CRO Specialist', 'task', 'high'),
  (tmpl_id, p2, 'ICE scoring & prioritisation', 'Score hypotheses by Impact, Confidence, Ease', 2, 2, 'CRO Specialist', 'task', 'high'),
  (tmpl_id, p2, 'Test design & wireframes', 'Design variation mockups for top-priority tests', 3, 4, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Testing plan sign-off', 'Client approves testing roadmap', 4, 1, 'Account Manager', 'approval', 'high'),

  (tmpl_id, p3, 'Variation build & QA', 'Build test variations in A/B testing tool', 1, 6, 'Developer', 'task', 'high'),
  (tmpl_id, p3, 'Experiment launch', 'Launch A/B tests with proper traffic allocation', 2, 2, 'CRO Specialist', 'milestone', 'high'),
  (tmpl_id, p3, 'Monitor statistical significance', 'Track test progress and ensure valid sample sizes', 3, 4, 'CRO Specialist', 'task', 'high'),
  (tmpl_id, p3, 'Iterate & launch follow-up tests', 'Apply learnings and launch next round of experiments', 4, 6, 'CRO Specialist', 'task', 'medium'),

  (tmpl_id, p4, 'Test results analysis', 'Analyse winning/losing variations with statistical rigour', 1, 3, 'CRO Specialist', 'task', 'high'),
  (tmpl_id, p4, 'Implement winning variations', 'Push winning changes to production', 2, 4, 'Developer', 'task', 'high'),
  (tmpl_id, p4, 'CRO performance report', 'Report showing lift, revenue impact, and test insights', 3, 3, 'Account Manager', 'deliverable', 'high'),
  (tmpl_id, p4, 'Next-round testing roadmap', 'Plan next batch of hypotheses and experiments', 4, 2, 'CRO Specialist', 'task', 'medium');
END $$;

-- ============================================
-- 5. EVENT MARKETING
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (id, name, description, category, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, tags, is_public)
  VALUES (uuid_generate_v4(), 'Event Marketing', 'Full event marketing campaign — planning, promotion, production, attendee management, and post-event follow-up', 'Events', 'fixed', 20000, 60, 130, ARRAY['event', 'conference', 'launch', 'activation'], true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Planning & Strategy', 'Define event concept, objectives, budget, and timeline', 1, 14, 20, true),
    (uuid_generate_v4(), tmpl_id, 'Promotion & Registration', 'Build event page, launch marketing, drive registrations', 2, 21, 30, true),
    (uuid_generate_v4(), tmpl_id, 'Event Production & Management', 'On-site coordination, content capture, attendee experience', 3, 7, 35, false),
    (uuid_generate_v4(), tmpl_id, 'Post-Event Follow-up', 'Thank-you comms, lead nurture, ROI report', 4, 14, 15, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Event concept & objectives', 'Define event type, theme, audience, and success metrics', 1, 4, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Budget planning', 'Itemise venue, catering, AV, marketing, and staffing costs', 2, 3, 'Producer', 'task', 'high'),
  (tmpl_id, p1, 'Venue sourcing & booking', 'Research, shortlist, and secure venue', 3, 6, 'Producer', 'task', 'high'),
  (tmpl_id, p1, 'Speaker / talent coordination', 'Identify and confirm speakers, panellists, or entertainment', 4, 6, 'Producer', 'task', 'high'),
  (tmpl_id, p1, 'Event branding & design brief', 'Brief designers on event branding, signage, and collateral', 5, 3, 'Account Manager', 'deliverable', 'medium'),
  (tmpl_id, p1, 'Event plan sign-off', 'Client approves event concept and budget', 6, 1, 'Account Manager', 'approval', 'high'),

  (tmpl_id, p2, 'Registration page design & build', 'Create event landing page with registration form', 1, 8, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Email invitation campaign', 'Design and send invitation emails with RSVP tracking', 2, 6, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p2, 'Social media promotion', 'Organic and paid social campaign to drive registrations', 3, 6, 'Social Media Manager', 'task', 'high'),
  (tmpl_id, p2, 'PR & media outreach', 'Pitch event to media, bloggers, and industry publications', 4, 4, 'PR Specialist', 'task', 'medium'),
  (tmpl_id, p2, 'Event collateral production', 'Design and produce signage, badges, programs, swag', 5, 8, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Registration tracking & reminders', 'Monitor RSVPs, send reminder emails, manage waitlist', 6, 3, 'Account Manager', 'task', 'medium'),

  (tmpl_id, p3, 'Venue setup & AV check', 'Coordinate venue setup, signage, AV, and WiFi', 1, 6, 'Producer', 'task', 'urgent'),
  (tmpl_id, p3, 'On-site event management', 'Run the event — registration desk, schedule, troubleshooting', 2, 10, 'Producer', 'task', 'urgent'),
  (tmpl_id, p3, 'Photography & videography', 'Capture professional photos and video content', 3, 8, 'Videographer', 'task', 'high'),
  (tmpl_id, p3, 'Live social media coverage', 'Post live updates, stories, and highlights to social channels', 4, 4, 'Social Media Manager', 'task', 'high'),
  (tmpl_id, p3, 'Attendee engagement & feedback', 'Collect feedback via survey, manage networking moments', 5, 2, 'Account Manager', 'task', 'medium'),

  (tmpl_id, p4, 'Thank-you email & assets', 'Send post-event thank-you with photos, slides, recordings', 1, 3, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p4, 'Lead capture & CRM sync', 'Import attendee data and leads into CRM', 2, 3, 'Account Manager', 'task', 'high'),
  (tmpl_id, p4, 'Post-event content creation', 'Write recap blog, edit highlight reel, publish photos', 3, 8, 'Content Strategist', 'deliverable', 'medium'),
  (tmpl_id, p4, 'Lead nurture sequence', 'Set up automated follow-up email sequence for leads', 4, 4, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p4, 'Event ROI report', 'Report on attendance, engagement, leads generated, and ROI', 5, 4, 'Account Manager', 'deliverable', 'high');
END $$;

-- ============================================
-- 6. LOCAL SEO & GOOGLE MY BUSINESS
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (id, name, description, category, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, tags, is_public)
  VALUES (uuid_generate_v4(), 'Local SEO & Google Business Profile', 'Local search optimisation including Google Business Profile, citation building, review management, and local ranking tracking', 'SEO', 'retainer_allocation', 3000, 30, 45, ARRAY['local-seo', 'google-business', 'citations', 'reviews'], true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Audit & Strategy', 'Audit current local presence, identify opportunities', 1, 5, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Citation Building & Optimisation', 'Build and clean up local directory listings', 2, 10, 30, false),
    (uuid_generate_v4(), tmpl_id, 'Review Management', 'Set up review generation and response workflows', 3, 7, 20, false),
    (uuid_generate_v4(), tmpl_id, 'Local Performance Tracking', 'Monitor rankings, traffic, and conversions', 4, 8, 25, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Google Business Profile audit', 'Review and optimise GBP listing — categories, attributes, photos, posts', 1, 3, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Local keyword research', 'Identify local search terms and near-me variations', 2, 3, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Citation audit', 'Check existing directory listings for NAP consistency', 3, 3, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Competitor local analysis', 'Analyse top local competitors in map pack', 4, 2, 'SEO Specialist', 'task', 'medium'),
  (tmpl_id, p1, 'Local SEO strategy document', 'Deliverable outlining full local SEO plan', 5, 2, 'SEO Specialist', 'deliverable', 'high'),

  (tmpl_id, p2, 'Core citation submissions', 'Submit to top 40 directories (Yelp, Yellow Pages, etc.)', 1, 4, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p2, 'Industry-specific directories', 'Submit to niche directories relevant to client vertical', 2, 3, 'SEO Specialist', 'task', 'medium'),
  (tmpl_id, p2, 'NAP consistency cleanup', 'Fix inconsistent Name, Address, Phone across the web', 3, 3, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p2, 'Schema markup implementation', 'Add LocalBusiness schema to website', 4, 2, 'Developer', 'task', 'high'),

  (tmpl_id, p3, 'Review generation strategy', 'Set up review request email/SMS flows', 1, 3, 'Account Manager', 'task', 'high'),
  (tmpl_id, p3, 'Review response templates', 'Create positive and negative review response templates', 2, 2, 'Account Manager', 'deliverable', 'medium'),
  (tmpl_id, p3, 'Review monitoring setup', 'Configure alerts for new reviews across platforms', 3, 1, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p3, 'GBP post schedule', 'Plan and schedule weekly Google Business Profile posts', 4, 3, 'Social Media Manager', 'task', 'medium'),

  (tmpl_id, p4, 'Local rank tracking setup', 'Configure local rank tracking for target keywords', 1, 2, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p4, 'Monthly local SEO report', 'Report on map pack rankings, GBP insights, reviews, and traffic', 2, 3, 'Account Manager', 'deliverable', 'high'),
  (tmpl_id, p4, 'Ongoing optimisation', 'Continuous GBP updates, new citations, review responses', 3, 4, 'SEO Specialist', 'task', 'medium');
END $$;

-- ============================================
-- 7. REPUTATION MANAGEMENT & PR
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (id, name, description, category, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, tags, is_public)
  VALUES (uuid_generate_v4(), 'Reputation Management & PR', 'Brand reputation monitoring, press release creation, media outreach, and crisis response planning', 'PR & Communications', 'retainer_allocation', 5000, 30, 65, ARRAY['pr', 'reputation', 'media', 'crisis', 'press'], true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Monitoring Setup & Audit', 'Establish monitoring tools and baseline brand sentiment', 1, 5, 20, true),
    (uuid_generate_v4(), tmpl_id, 'Content & Press Release Creation', 'Write press releases, thought leadership pieces, and media kits', 2, 10, 30, true),
    (uuid_generate_v4(), tmpl_id, 'Media Outreach', 'Pitch stories, build media relationships, secure coverage', 3, 10, 30, false),
    (uuid_generate_v4(), tmpl_id, 'Crisis Response & Reporting', 'Prepare crisis protocols and deliver monthly reputation reports', 4, 5, 20, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Brand mention monitoring setup', 'Configure Google Alerts, social listening, and review monitoring', 1, 3, 'PR Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Sentiment baseline analysis', 'Analyse current brand sentiment across search, social, reviews', 2, 4, 'PR Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Media landscape audit', 'Identify key journalists, publications, and bloggers in vertical', 3, 3, 'PR Specialist', 'task', 'high'),
  (tmpl_id, p1, 'PR strategy & messaging framework', 'Define key messages, brand voice, and spokesperson guidelines', 4, 4, 'PR Specialist', 'deliverable', 'high'),

  (tmpl_id, p2, 'Press release drafting', 'Write newsworthy press releases for distribution', 1, 6, 'Copywriter', 'deliverable', 'high'),
  (tmpl_id, p2, 'Thought leadership articles', 'Ghost-write expert opinion pieces for industry publications', 2, 8, 'Copywriter', 'deliverable', 'medium'),
  (tmpl_id, p2, 'Media kit & press page', 'Create downloadable media kit with logos, bios, and assets', 3, 4, 'Designer', 'deliverable', 'medium'),
  (tmpl_id, p2, 'Content approval from client', 'Client reviews and approves all PR content', 4, 1, 'Account Manager', 'approval', 'high'),

  (tmpl_id, p3, 'Media list building', 'Build targeted media list for pitching', 1, 3, 'PR Specialist', 'task', 'high'),
  (tmpl_id, p3, 'Press release distribution', 'Distribute via wire service and direct pitches', 2, 3, 'PR Specialist', 'task', 'high'),
  (tmpl_id, p3, 'Journalist relationship building', 'Personalised outreach and relationship development', 3, 6, 'PR Specialist', 'task', 'medium'),
  (tmpl_id, p3, 'Interview & media prep', 'Prepare spokespeople with talking points and media training', 4, 3, 'PR Specialist', 'task', 'medium'),
  (tmpl_id, p3, 'Coverage tracking', 'Track and document all media placements and mentions', 5, 2, 'PR Specialist', 'task', 'high'),

  (tmpl_id, p4, 'Crisis response protocol', 'Document crisis communication plan with escalation matrix', 1, 4, 'PR Specialist', 'deliverable', 'high'),
  (tmpl_id, p4, 'Negative review response', 'Draft and implement response templates for negative reviews', 2, 2, 'Account Manager', 'task', 'high'),
  (tmpl_id, p4, 'Monthly reputation report', 'Report on sentiment, mentions, coverage, and review trends', 3, 3, 'PR Specialist', 'deliverable', 'high'),
  (tmpl_id, p4, 'PR value & impact analysis', 'Calculate media value equivalency and audience reach', 4, 2, 'PR Specialist', 'task', 'medium');
END $$;

-- ============================================
-- 8. PODCAST PRODUCTION & DISTRIBUTION
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (id, name, description, category, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, tags, is_public)
  VALUES (uuid_generate_v4(), 'Podcast Production & Distribution', 'Full podcast production from concept and recording setup through editing, distribution, and audience growth', 'Content', 'fixed', 12000, 45, 85, ARRAY['podcast', 'audio', 'content', 'distribution'], true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Planning & Setup', 'Define concept, format, branding, and recording environment', 1, 10, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Episode Production', 'Record, edit, and produce podcast episodes', 2, 21, 45, true),
    (uuid_generate_v4(), tmpl_id, 'Distribution & Promotion', 'Publish to platforms and promote each episode', 3, 7, 15, false),
    (uuid_generate_v4(), tmpl_id, 'Analytics & Growth', 'Track performance and optimise for audience growth', 4, 7, 15, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Podcast concept & format', 'Define show concept, episode format, length, and frequency', 1, 3, 'Content Strategist', 'task', 'high'),
  (tmpl_id, p1, 'Branding & cover art', 'Design podcast logo, cover art, and visual identity', 2, 6, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p1, 'Intro/outro music & sound design', 'Create or license intro/outro music and sound effects', 3, 4, 'Audio Producer', 'deliverable', 'high'),
  (tmpl_id, p1, 'Recording setup & testing', 'Configure recording equipment, software, and test audio quality', 4, 3, 'Audio Producer', 'task', 'high'),
  (tmpl_id, p1, 'Platform account setup', 'Create accounts on Apple Podcasts, Spotify, Google Podcasts', 5, 2, 'Audio Producer', 'task', 'medium'),
  (tmpl_id, p1, 'Episode topic planning', 'Plan first season of episode topics and guest list', 6, 3, 'Content Strategist', 'deliverable', 'high'),

  (tmpl_id, p2, 'Guest research & booking', 'Identify, outreach, and schedule guest interviews', 1, 6, 'Producer', 'task', 'high'),
  (tmpl_id, p2, 'Episode script & questions', 'Write episode outlines, interview questions, and talking points', 2, 8, 'Content Strategist', 'deliverable', 'high'),
  (tmpl_id, p2, 'Recording session', 'Record podcast episode with host and guests', 3, 8, 'Audio Producer', 'task', 'high'),
  (tmpl_id, p2, 'Audio editing & mixing', 'Edit, mix, and master episode audio', 4, 12, 'Audio Producer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Show notes & transcript', 'Write episode show notes and generate transcript', 5, 4, 'Copywriter', 'deliverable', 'medium'),
  (tmpl_id, p2, 'Client episode approval', 'Client reviews and approves episode before publishing', 6, 1, 'Account Manager', 'approval', 'high'),

  (tmpl_id, p3, 'Episode upload & metadata', 'Upload to hosting platform with title, description, tags', 1, 2, 'Audio Producer', 'task', 'high'),
  (tmpl_id, p3, 'Social media promotion', 'Create audiograms, quote cards, and social posts per episode', 2, 4, 'Social Media Manager', 'task', 'high'),
  (tmpl_id, p3, 'Email newsletter feature', 'Include episode in email newsletter', 3, 1, 'Email Specialist', 'task', 'medium'),
  (tmpl_id, p3, 'Cross-promotion & collaborations', 'Arrange guest cross-promotion and podcast swaps', 4, 3, 'Producer', 'task', 'medium'),

  (tmpl_id, p4, 'Download & listener analytics', 'Track downloads, unique listeners, completion rates', 1, 2, 'Content Strategist', 'task', 'high'),
  (tmpl_id, p4, 'Audience feedback & reviews', 'Monitor and respond to listener reviews and feedback', 2, 2, 'Account Manager', 'task', 'medium'),
  (tmpl_id, p4, 'Growth strategy optimisation', 'Analyse what drives growth and adjust strategy', 3, 3, 'Content Strategist', 'task', 'medium'),
  (tmpl_id, p4, 'Sponsorship & monetisation', 'Identify sponsorship opportunities and ad placements', 4, 3, 'Account Manager', 'task', 'low');
END $$;

-- ============================================
-- 9. MARKETING AUTOMATION IMPLEMENTATION
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (id, name, description, category, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, tags, is_public)
  VALUES (uuid_generate_v4(), 'Marketing Automation Implementation', 'CRM and marketing automation platform setup with workflow design, template creation, integrations, and team training', 'Email', 'fixed', 10000, 30, 85, ARRAY['automation', 'crm', 'workflows', 'nurture', 'hubspot'], true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'CRM Setup & Integration', 'Configure CRM, import data, connect integrations', 1, 7, 30, true),
    (uuid_generate_v4(), tmpl_id, 'Workflow Design', 'Design automation workflows, lead scoring, and segmentation', 2, 7, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Template Creation', 'Build email templates, landing pages, and forms', 3, 10, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Training & Handoff', 'Team training, documentation, and go-live support', 4, 6, 20, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Platform selection & setup', 'Configure HubSpot/Mailchimp/ActiveCampaign account', 1, 4, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Data migration & import', 'Clean and import existing contacts, deals, and history', 2, 6, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Third-party integrations', 'Connect website, e-commerce, analytics, and social platforms', 3, 6, 'Developer', 'task', 'high'),
  (tmpl_id, p1, 'Custom fields & properties', 'Set up custom contact and deal properties', 4, 3, 'Email Specialist', 'task', 'medium'),
  (tmpl_id, p1, 'Tracking code installation', 'Install tracking scripts on website for visitor identification', 5, 2, 'Developer', 'task', 'high'),

  (tmpl_id, p2, 'Lead scoring model', 'Design and configure lead scoring rules based on behaviour and demographics', 1, 4, 'Email Specialist', 'deliverable', 'high'),
  (tmpl_id, p2, 'Contact segmentation', 'Create smart lists and segments for targeting', 2, 3, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p2, 'Welcome sequence automation', 'Build automated welcome series for new contacts', 3, 4, 'Email Specialist', 'deliverable', 'high'),
  (tmpl_id, p2, 'Lead nurture workflows', 'Design multi-step nurture sequences with branching logic', 4, 6, 'Email Specialist', 'deliverable', 'high'),
  (tmpl_id, p2, 'Re-engagement automation', 'Build win-back workflow for inactive contacts', 5, 3, 'Email Specialist', 'task', 'medium'),
  (tmpl_id, p2, 'Workflow sign-off', 'Client approves automation workflows before activation', 6, 1, 'Account Manager', 'approval', 'high'),

  (tmpl_id, p3, 'Email template design', 'Design branded email templates for campaigns and automations', 1, 8, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p3, 'Landing page templates', 'Build conversion-optimised landing page templates', 2, 6, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p3, 'Form & popup creation', 'Build lead capture forms and popup CTAs', 3, 4, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p3, 'Template testing & QA', 'Test templates across email clients and devices', 4, 3, 'Email Specialist', 'task', 'high'),

  (tmpl_id, p4, 'Admin user training', 'Train client team on platform administration', 1, 4, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p4, 'End user training', 'Train sales and marketing teams on daily usage', 2, 4, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p4, 'Documentation & playbook', 'Create user guides, workflow documentation, and SOPs', 3, 4, 'Account Manager', 'deliverable', 'high'),
  (tmpl_id, p4, 'Go-live support', 'Provide 2 weeks of post-launch support and troubleshooting', 4, 4, 'Email Specialist', 'task', 'medium');
END $$;

-- ============================================
-- 10. WEBINAR SERIES PRODUCTION
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (id, name, description, category, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, tags, is_public)
  VALUES (uuid_generate_v4(), 'Webinar Series Production', 'End-to-end webinar series from planning and promotion through platform setup, live production, and post-event nurture', 'Content', 'fixed', 8000, 30, 65, ARRAY['webinar', 'virtual-event', 'lead-gen', 'content'], true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Planning & Promotion', 'Define topics, speakers, and launch registration campaign', 1, 10, 30, true),
    (uuid_generate_v4(), tmpl_id, 'Platform Setup', 'Configure webinar platform, landing pages, and tech stack', 2, 5, 15, false),
    (uuid_generate_v4(), tmpl_id, 'Technical Production', 'Run rehearsals, manage live webinar, handle Q&A', 3, 7, 30, false),
    (uuid_generate_v4(), tmpl_id, 'Follow-up & Nurture', 'Post-webinar recording distribution, lead nurture, ROI report', 4, 8, 25, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Webinar topic & speaker selection', 'Choose compelling topics and confirm speakers/panellists', 1, 3, 'Content Strategist', 'task', 'high'),
  (tmpl_id, p1, 'Registration page design', 'Design and build webinar registration landing page', 2, 5, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p1, 'Email invitation campaign', 'Create and send invitation emails with registration link', 3, 4, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Social media promotion', 'Promote webinar across social channels with countdown', 4, 3, 'Social Media Manager', 'task', 'medium'),
  (tmpl_id, p1, 'Presentation deck creation', 'Design branded slide deck for webinar content', 5, 6, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p1, 'Reminder email sequence', 'Set up 1-week, 1-day, and 1-hour reminder emails', 6, 2, 'Email Specialist', 'task', 'medium'),

  (tmpl_id, p2, 'Webinar platform configuration', 'Set up Zoom/Teams/GoToWebinar with branding and settings', 1, 3, 'Producer', 'task', 'high'),
  (tmpl_id, p2, 'Registration integration', 'Connect registration form to webinar platform and CRM', 2, 2, 'Developer', 'task', 'high'),
  (tmpl_id, p2, 'Poll & Q&A setup', 'Prepare polls, Q&A prompts, and interactive elements', 3, 2, 'Content Strategist', 'task', 'medium'),
  (tmpl_id, p2, 'Technical rehearsal', 'Run full rehearsal with speakers, test audio/video/screen share', 4, 3, 'Producer', 'task', 'high'),

  (tmpl_id, p3, 'Pre-show setup & checks', 'Final AV check, presenter briefing, green room', 1, 2, 'Producer', 'task', 'urgent'),
  (tmpl_id, p3, 'Live webinar production', 'Manage live event — slides, transitions, Q&A moderation', 2, 3, 'Producer', 'task', 'urgent'),
  (tmpl_id, p3, 'Live chat & engagement', 'Monitor and engage with attendee chat during the event', 3, 2, 'Account Manager', 'task', 'high'),
  (tmpl_id, p3, 'Recording capture', 'Ensure clean recording of full webinar session', 4, 1, 'Producer', 'task', 'high'),

  (tmpl_id, p4, 'Recording editing & upload', 'Edit recording and upload to hosting platform', 1, 4, 'Producer', 'task', 'high'),
  (tmpl_id, p4, 'On-demand page creation', 'Build on-demand replay page with gated access', 2, 3, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p4, 'Attendee follow-up email', 'Send recording, slides, and resources to attendees', 3, 2, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p4, 'No-show follow-up', 'Send recording link to registrants who did not attend', 4, 1, 'Email Specialist', 'task', 'medium'),
  (tmpl_id, p4, 'Lead scoring & CRM update', 'Score attendees by engagement and update CRM records', 5, 2, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p4, 'Webinar performance report', 'Report on registrations, attendance rate, engagement, and leads', 6, 3, 'Account Manager', 'deliverable', 'high');
END $$;

-- ============================================
-- 11. TRADE SHOW / CONFERENCE MARKETING
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (id, name, description, category, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, tags, is_public)
  VALUES (uuid_generate_v4(), 'Trade Show & Conference Marketing', 'Full trade show marketing campaign — booth design, pre-show promotion, on-site management, and post-show lead follow-up', 'Events', 'fixed', 18000, 45, 110, ARRAY['tradeshow', 'conference', 'exhibition', 'booth', 'b2b'], true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Planning & Booth Design', 'Select shows, design booth, plan logistics', 1, 14, 30, true),
    (uuid_generate_v4(), tmpl_id, 'Pre-Show Marketing', 'Drive booth traffic with email, social, and appointment setting', 2, 14, 20, false),
    (uuid_generate_v4(), tmpl_id, 'On-Site Execution', 'Booth setup, staffing, lead capture, and networking', 3, 5, 30, false),
    (uuid_generate_v4(), tmpl_id, 'Post-Show Follow-up', 'Lead processing, nurture campaigns, and ROI analysis', 4, 12, 20, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Show selection & registration', 'Research and register for target trade shows', 1, 3, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Booth design concept', 'Design booth layout, graphics, and interactive elements', 2, 8, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p1, 'Promotional materials design', 'Design brochures, business cards, flyers, and giveaways', 3, 6, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p1, 'Booth production & fabrication', 'Coordinate booth build, printing, and shipping', 4, 4, 'Producer', 'task', 'high'),
  (tmpl_id, p1, 'Staff training & briefing', 'Train booth staff on key messages, demos, and lead capture', 5, 3, 'Account Manager', 'task', 'high'),
  (tmpl_id, p1, 'Logistics & travel planning', 'Book travel, hotels, shipping, and on-site services', 6, 4, 'Producer', 'task', 'medium'),
  (tmpl_id, p1, 'Booth design approval', 'Client approves booth design and materials', 7, 1, 'Account Manager', 'approval', 'high'),

  (tmpl_id, p2, 'Pre-show email campaign', 'Email prospects and clients with booth location and meeting scheduler', 1, 4, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p2, 'Social media countdown', 'Post countdown content and show previews on social channels', 2, 3, 'Social Media Manager', 'task', 'medium'),
  (tmpl_id, p2, 'Appointment setting', 'Schedule on-site meetings with key prospects and partners', 3, 6, 'Account Manager', 'task', 'high'),
  (tmpl_id, p2, 'Show guide advertising', 'Place ads in show guide, app, or sponsorship placements', 4, 2, 'Media Buyer', 'task', 'medium'),
  (tmpl_id, p2, 'Lead capture setup', 'Configure badge scanners, forms, or app for lead capture', 5, 2, 'Developer', 'task', 'high'),

  (tmpl_id, p3, 'Booth setup & inspection', 'Set up booth, test displays, organise materials', 1, 6, 'Producer', 'task', 'urgent'),
  (tmpl_id, p3, 'On-site booth management', 'Staff booth, engage attendees, capture leads', 2, 16, 'Account Manager', 'task', 'urgent'),
  (tmpl_id, p3, 'Live social coverage', 'Post live updates, photos, and videos from the show floor', 3, 4, 'Social Media Manager', 'task', 'medium'),
  (tmpl_id, p3, 'Networking & meetings', 'Attend scheduled meetings, networking events, and sessions', 4, 8, 'Account Manager', 'task', 'high'),
  (tmpl_id, p3, 'Daily lead summary', 'Compile and categorise leads captured each day', 5, 3, 'Account Manager', 'task', 'high'),

  (tmpl_id, p4, 'Lead data processing', 'Clean, deduplicate, and import leads into CRM', 1, 4, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p4, 'Thank-you email campaign', 'Send personalised follow-up emails within 48 hours', 2, 3, 'Email Specialist', 'task', 'urgent'),
  (tmpl_id, p4, 'Lead qualification & routing', 'Score leads and route hot leads to sales team', 3, 3, 'Account Manager', 'task', 'high'),
  (tmpl_id, p4, 'Nurture sequence activation', 'Enroll leads into automated nurture workflows', 4, 3, 'Email Specialist', 'task', 'high'),
  (tmpl_id, p4, 'Show ROI report', 'Calculate cost per lead, pipeline generated, and ROI', 5, 4, 'Account Manager', 'deliverable', 'high'),
  (tmpl_id, p4, 'Booth teardown & storage', 'Coordinate booth disassembly, shipping, and storage', 6, 2, 'Producer', 'task', 'low');
END $$;

-- ============================================
-- 12. MOBILE APP MARKETING / ASO
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (id, name, description, category, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, tags, is_public)
  VALUES (uuid_generate_v4(), 'Mobile App Marketing & ASO', 'App Store Optimisation, user acquisition campaigns, in-app engagement strategy, and retention optimisation', 'Digital Ads', 'retainer_allocation', 7000, 30, 75, ARRAY['aso', 'mobile', 'app-marketing', 'user-acquisition', 'retention'], true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'ASO Audit & Strategy', 'Audit app store listings and develop optimisation strategy', 1, 7, 25, true),
    (uuid_generate_v4(), tmpl_id, 'User Acquisition Campaigns', 'Launch paid and organic user acquisition campaigns', 2, 10, 35, true),
    (uuid_generate_v4(), tmpl_id, 'Engagement & Retention', 'Optimise onboarding, push notifications, and in-app experience', 3, 7, 25, false),
    (uuid_generate_v4(), tmpl_id, 'Analytics & Optimisation', 'Track installs, retention, LTV, and optimise spend', 4, 6, 15, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'App store listing audit', 'Review title, subtitle, keywords, screenshots, and description', 1, 3, 'ASO Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Keyword research', 'Research high-volume, low-competition keywords for app stores', 2, 4, 'ASO Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Competitor app analysis', 'Analyse competitor listings, ratings, and keyword strategies', 3, 3, 'ASO Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Screenshot & video optimisation', 'Design new app store screenshots and preview video', 4, 6, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p1, 'Listing copy optimisation', 'Rewrite title, subtitle, description with target keywords', 5, 3, 'Copywriter', 'deliverable', 'high'),
  (tmpl_id, p1, 'ASO strategy sign-off', 'Client approves optimised listing and keyword strategy', 6, 1, 'Account Manager', 'approval', 'high'),

  (tmpl_id, p2, 'Apple Search Ads setup', 'Configure Apple Search Ads campaigns and keyword targeting', 1, 4, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p2, 'Google App Campaigns setup', 'Configure Google UAC campaigns across Search, Display, YouTube', 2, 4, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p2, 'Social app install campaigns', 'Launch Meta/TikTok app install campaigns', 3, 4, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p2, 'Creative production for ads', 'Design ad creatives for app install campaigns', 4, 6, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Attribution & tracking setup', 'Configure AppsFlyer/Adjust/Branch for attribution', 5, 3, 'Developer', 'task', 'high'),
  (tmpl_id, p2, 'Influencer & review campaigns', 'Coordinate app reviews from tech bloggers and influencers', 6, 4, 'PR Specialist', 'task', 'medium'),

  (tmpl_id, p3, 'Onboarding flow optimisation', 'Analyse and improve first-time user experience', 1, 4, 'CRO Specialist', 'task', 'high'),
  (tmpl_id, p3, 'Push notification strategy', 'Design push notification sequences for engagement and retention', 2, 4, 'Email Specialist', 'deliverable', 'high'),
  (tmpl_id, p3, 'In-app messaging setup', 'Configure in-app messages for feature discovery and upgrades', 3, 3, 'Email Specialist', 'task', 'medium'),
  (tmpl_id, p3, 'Rating & review prompts', 'Optimise timing and messaging for app store rating prompts', 4, 2, 'ASO Specialist', 'task', 'high'),

  (tmpl_id, p4, 'Install & retention dashboards', 'Build dashboards tracking installs, DAU/MAU, retention curves', 1, 3, 'Analyst', 'task', 'high'),
  (tmpl_id, p4, 'Cost per install optimisation', 'Optimise bids and creative to reduce CPI across channels', 2, 4, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p4, 'LTV analysis', 'Calculate lifetime value by acquisition channel', 3, 3, 'Analyst', 'task', 'medium'),
  (tmpl_id, p4, 'Monthly app marketing report', 'Report on installs, retention, revenue, and channel performance', 4, 3, 'Account Manager', 'deliverable', 'high');
END $$;

-- ============================================
-- 13. MARKETPLACE OPTIMISATION
-- ============================================
DO $$
DECLARE
  tmpl_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID;
BEGIN
  INSERT INTO project_templates (id, name, description, category, default_budget_type, default_budget_amount, estimated_duration_days, estimated_hours, tags, is_public)
  VALUES (uuid_generate_v4(), 'Marketplace Optimisation', 'Amazon, Shopify, and e-commerce marketplace optimisation — listing SEO, advertising, inventory management, and conversion improvement', 'E-Commerce', 'retainer_allocation', 6000, 30, 70, ARRAY['amazon', 'shopify', 'ecommerce', 'marketplace', 'product-listing'], true)
  RETURNING id INTO tmpl_id;

  INSERT INTO template_phases (id, template_id, name, description, sort_order, duration_days, budget_percentage, requires_client_approval)
  VALUES
    (uuid_generate_v4(), tmpl_id, 'Store Audit & Strategy', 'Audit existing listings, identify opportunities, define strategy', 1, 7, 25, true),
    (uuid_generate_v4(), tmpl_id, 'Listing Optimisation', 'Optimise product titles, descriptions, images, and keywords', 2, 10, 30, true),
    (uuid_generate_v4(), tmpl_id, 'Marketplace Advertising', 'Set up and manage Sponsored Products, Brands, and Display campaigns', 3, 7, 30, false),
    (uuid_generate_v4(), tmpl_id, 'Performance & Growth', 'Monitor sales, reviews, and optimise for growth', 4, 6, 15, false);

  SELECT id INTO p1 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 1;
  SELECT id INTO p2 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 2;
  SELECT id INTO p3 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 3;
  SELECT id INTO p4 FROM template_phases WHERE template_id = tmpl_id AND sort_order = 4;

  INSERT INTO template_tasks (template_id, phase_id, title, description, sort_order, estimated_hours, default_role, task_type, priority) VALUES
  (tmpl_id, p1, 'Store & listing audit', 'Review all product listings for completeness, quality, and SEO', 1, 4, 'E-Commerce Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Competitor analysis', 'Analyse top competitors pricing, listings, reviews, and ad presence', 2, 4, 'E-Commerce Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Keyword research (marketplace)', 'Research search terms shoppers use to find products', 3, 3, 'SEO Specialist', 'task', 'high'),
  (tmpl_id, p1, 'Category & taxonomy review', 'Ensure products are in optimal categories and browse nodes', 4, 2, 'E-Commerce Specialist', 'task', 'medium'),
  (tmpl_id, p1, 'Strategy & roadmap document', 'Present optimisation plan with prioritised actions', 5, 3, 'Account Manager', 'deliverable', 'high'),

  (tmpl_id, p2, 'Product title optimisation', 'Rewrite titles with keywords, brand, and key features', 1, 4, 'Copywriter', 'task', 'high'),
  (tmpl_id, p2, 'Bullet points & description', 'Write keyword-rich bullet points and enhanced descriptions', 2, 6, 'Copywriter', 'task', 'high'),
  (tmpl_id, p2, 'Product photography', 'Shoot or source lifestyle and infographic product images', 3, 6, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'A+ / Enhanced Brand Content', 'Design A+ content modules for brand-registered products', 4, 6, 'Designer', 'deliverable', 'high'),
  (tmpl_id, p2, 'Backend keyword optimisation', 'Fill backend search terms and hidden keywords', 5, 2, 'SEO Specialist', 'task', 'medium'),
  (tmpl_id, p2, 'Listing approval', 'Client approves optimised listings before publishing', 6, 1, 'Account Manager', 'approval', 'high'),

  (tmpl_id, p3, 'Sponsored Products setup', 'Create auto and manual keyword campaigns for key products', 1, 4, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p3, 'Sponsored Brands setup', 'Create brand-awareness campaigns with custom headline', 2, 3, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p3, 'Bid management & optimisation', 'Daily bid adjustments based on ACoS and ROAS targets', 3, 6, 'Media Buyer', 'task', 'high'),
  (tmpl_id, p3, 'Negative keyword harvesting', 'Review search term reports and add negatives to reduce waste', 4, 3, 'Media Buyer', 'task', 'medium'),
  (tmpl_id, p3, 'Deal & promotion management', 'Set up Lightning Deals, coupons, and promotional pricing', 5, 2, 'E-Commerce Specialist', 'task', 'medium'),

  (tmpl_id, p4, 'Sales & revenue dashboard', 'Build dashboard tracking units, revenue, BSR, and share of voice', 1, 3, 'Analyst', 'task', 'high'),
  (tmpl_id, p4, 'Review monitoring & strategy', 'Monitor reviews, address negatives, encourage positive reviews', 2, 3, 'Account Manager', 'task', 'high'),
  (tmpl_id, p4, 'Inventory forecasting', 'Track inventory levels and flag reorder points', 3, 2, 'E-Commerce Specialist', 'task', 'medium'),
  (tmpl_id, p4, 'Monthly marketplace report', 'Report on sales, ad spend, ACoS, reviews, and market trends', 4, 3, 'Account Manager', 'deliverable', 'high');
END $$;
