-- ============================================
-- Default Brief Template Fields
-- Run after schema-briefs.sql
-- ============================================

-- ============================================
-- Marketing Campaign Brief Fields
-- ============================================

-- Step 1: Project Overview
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order, show_in_list)
SELECT bt.id, 'project_name', 'Project Name', 'text', 'Enter a descriptive project name', 'Give your project a clear, memorable name', true, 1, 'Project Overview', 'Basic Information', 1, true
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'campaign_type', 'Campaign Type', 'dropdown', NULL, 'Select the type of marketing campaign', true, 1, 'Project Overview', 'Basic Information', 2,
'[{"value": "brand_awareness", "label": "Brand Awareness"}, {"value": "lead_generation", "label": "Lead Generation"}, {"value": "product_launch", "label": "Product Launch"}, {"value": "event_promotion", "label": "Event Promotion"}, {"value": "content_marketing", "label": "Content Marketing"}, {"value": "email_campaign", "label": "Email Campaign"}, {"value": "social_media", "label": "Social Media Campaign"}, {"value": "other", "label": "Other"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'objectives', 'Campaign Objectives', 'richtext', 'What are you trying to achieve?', 'Describe the main goals and KPIs for this campaign', true, 1, 'Project Overview', 'Goals', 3
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'background', 'Background/Context', 'richtext', 'Provide context about the campaign...', 'Help us understand the background and why this campaign is needed', false, 1, 'Project Overview', 'Goals', 4
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

-- Step 2: Target Audience
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'audience_heading', 'Define Your Target Audience', 'heading', false, 2, 'Target Audience', NULL, 1
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'target_demographics', 'Demographics', 'textarea', 'Age, gender, location, income level...', 'Describe the demographic profile of your target audience', true, 2, 'Target Audience', 'Audience Profile', 'half', 2
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'target_psychographics', 'Psychographics', 'textarea', 'Interests, values, behaviors...', 'Describe the psychological characteristics', false, 2, 'Target Audience', 'Audience Profile', 'half', 3
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'pain_points', 'Pain Points & Needs', 'richtext', 'What problems does your audience face?', 'Understanding their challenges helps craft better messaging', false, 2, 'Target Audience', 'Audience Insights', 4
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

-- Step 3: Creative Direction
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'key_messages', 'Key Messages', 'richtext', 'What are the main messages to communicate?', 'List the core messages in order of priority', true, 3, 'Creative Direction', 'Messaging', 1
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'tone_of_voice', 'Tone of Voice', 'multiselect', 'Select all that apply', true, 3, 'Creative Direction', 'Messaging', 2,
'[{"value": "professional", "label": "Professional"}, {"value": "friendly", "label": "Friendly"}, {"value": "playful", "label": "Playful"}, {"value": "authoritative", "label": "Authoritative"}, {"value": "inspirational", "label": "Inspirational"}, {"value": "educational", "label": "Educational"}, {"value": "urgent", "label": "Urgent"}, {"value": "casual", "label": "Casual"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'deliverables', 'Required Deliverables', 'checkboxgroup', 'Select all deliverables needed', true, 3, 'Creative Direction', 'Deliverables', 3,
'[{"value": "social_posts", "label": "Social Media Posts"}, {"value": "email_templates", "label": "Email Templates"}, {"value": "blog_posts", "label": "Blog Posts"}, {"value": "landing_page", "label": "Landing Page"}, {"value": "video_content", "label": "Video Content"}, {"value": "graphics", "label": "Graphics/Images"}, {"value": "brochure", "label": "Brochure/Print"}, {"value": "presentation", "label": "Presentation"}, {"value": "other", "label": "Other"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'brand_guidelines', 'Brand Guidelines', 'files', NULL, false, 3, 'Creative Direction', 'Assets', 4
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'reference_materials', 'Reference/Inspiration', 'richtext', 'Links or descriptions of campaigns you admire...', false, 3, 'Creative Direction', 'Assets', 5
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

-- Step 4: Timeline & Budget
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'start_date', 'Campaign Start Date', 'date', 'When should the campaign go live?', true, 4, 'Timeline & Budget', 'Timeline', 'half', 1
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'end_date', 'Campaign End Date', 'date', 'When does the campaign end?', false, 4, 'Timeline & Budget', 'Timeline', 'half', 2
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'key_milestones', 'Key Milestones', 'textarea', 'List any important dates or deadlines', false, 4, 'Timeline & Budget', 'Timeline', 3
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'budget_range', 'Budget Range', 'dropdown', 'Select your budget range', true, 4, 'Timeline & Budget', 'Budget', 4,
'[{"value": "under_5k", "label": "Under $5,000"}, {"value": "5k_15k", "label": "$5,000 - $15,000"}, {"value": "15k_50k", "label": "$15,000 - $50,000"}, {"value": "50k_100k", "label": "$50,000 - $100,000"}, {"value": "over_100k", "label": "Over $100,000"}, {"value": "tbd", "label": "To Be Determined"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'additional_notes', 'Additional Notes', 'richtext', 'Any other information we should know?', false, 4, 'Timeline & Budget', 'Other', 5
FROM brief_templates bt WHERE bt.slug = 'marketing-campaign';

-- ============================================
-- Website Development Brief Fields
-- ============================================

-- Step 1: Project Overview
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order, show_in_list)
SELECT bt.id, 'project_name', 'Project Name', 'text', 'e.g., Company Website Redesign', true, 1, 'Project Overview', 'Basic Info', 1, true
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'project_type', 'Project Type', 'dropdown', 'What type of website project is this?', true, 1, 'Project Overview', 'Basic Info', 2,
'[{"value": "new_website", "label": "New Website"}, {"value": "redesign", "label": "Website Redesign"}, {"value": "updates", "label": "Updates/Enhancements"}, {"value": "migration", "label": "Platform Migration"}, {"value": "landing_page", "label": "Landing Page"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'current_website', 'Current Website URL', 'url', 'https://example.com', false, 1, 'Project Overview', 'Basic Info', 3
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'project_goals', 'Project Goals', 'richtext', 'What do you want to achieve with this website?', true, 1, 'Project Overview', 'Goals', 4
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'target_audience', 'Target Audience', 'richtext', 'Who will be using this website?', true, 1, 'Project Overview', 'Goals', 5
FROM brief_templates bt WHERE bt.slug = 'website-dev';

-- Step 2: Features & Functionality
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'site_type', 'Website Type', 'multiselect', 'Select all that apply', true, 2, 'Features', 'Site Type', 1,
'[{"value": "corporate", "label": "Corporate/Business"}, {"value": "ecommerce", "label": "E-commerce"}, {"value": "portfolio", "label": "Portfolio"}, {"value": "blog", "label": "Blog/News"}, {"value": "webapp", "label": "Web Application"}, {"value": "directory", "label": "Directory/Listing"}, {"value": "membership", "label": "Membership Site"}, {"value": "nonprofit", "label": "Non-profit"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'required_pages', 'Required Pages', 'checkboxgroup', 'Select the pages you need', true, 2, 'Features', 'Pages', 2,
'[{"value": "home", "label": "Home"}, {"value": "about", "label": "About Us"}, {"value": "services", "label": "Services"}, {"value": "products", "label": "Products"}, {"value": "portfolio", "label": "Portfolio/Work"}, {"value": "blog", "label": "Blog"}, {"value": "contact", "label": "Contact"}, {"value": "team", "label": "Team"}, {"value": "faq", "label": "FAQ"}, {"value": "pricing", "label": "Pricing"}, {"value": "testimonials", "label": "Testimonials"}, {"value": "careers", "label": "Careers"}, {"value": "other", "label": "Other"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'features_needed', 'Features Needed', 'checkboxgroup', 'Select all features you need', false, 2, 'Features', 'Functionality', 3,
'[{"value": "contact_form", "label": "Contact Form"}, {"value": "newsletter", "label": "Newsletter Signup"}, {"value": "search", "label": "Site Search"}, {"value": "social_integration", "label": "Social Media Integration"}, {"value": "live_chat", "label": "Live Chat"}, {"value": "booking", "label": "Booking/Scheduling"}, {"value": "ecommerce", "label": "E-commerce/Shop"}, {"value": "payment", "label": "Payment Processing"}, {"value": "user_accounts", "label": "User Accounts"}, {"value": "multilingual", "label": "Multi-language"}, {"value": "blog_cms", "label": "Blog/CMS"}, {"value": "analytics", "label": "Analytics Integration"}, {"value": "maps", "label": "Maps Integration"}, {"value": "video", "label": "Video Integration"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'integrations', 'Third-party Integrations', 'checkboxgroup', 'Select integrations you need', false, 2, 'Features', 'Integrations', 4,
'[{"value": "crm", "label": "CRM (Salesforce, HubSpot, etc.)"}, {"value": "email_marketing", "label": "Email Marketing (Mailchimp, etc.)"}, {"value": "payment_gateway", "label": "Payment Gateway (Stripe, PayPal)"}, {"value": "social_login", "label": "Social Login"}, {"value": "google_analytics", "label": "Google Analytics"}, {"value": "google_tag_manager", "label": "Google Tag Manager"}, {"value": "zapier", "label": "Zapier"}, {"value": "slack", "label": "Slack"}, {"value": "calendar", "label": "Calendar (Google, Calendly)"}, {"value": "other", "label": "Other"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'website-dev';

-- Step 3: Design & Content
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'design_style', 'Design Style', 'multiselect', 'Select styles that match your vision', true, 3, 'Design & Content', 'Design', 1,
'[{"value": "modern", "label": "Modern/Minimalist"}, {"value": "corporate", "label": "Corporate/Professional"}, {"value": "creative", "label": "Creative/Artistic"}, {"value": "playful", "label": "Playful/Fun"}, {"value": "elegant", "label": "Elegant/Luxury"}, {"value": "bold", "label": "Bold/Vibrant"}, {"value": "tech", "label": "Tech/Futuristic"}, {"value": "traditional", "label": "Traditional/Classic"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'design_references', 'Design References', 'richtext', 'Share URLs or descriptions of websites you like...', false, 3, 'Design & Content', 'Design', 2
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'brand_assets', 'Brand Assets', 'files', false, 3, 'Design & Content', 'Assets', 3
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'content_status', 'Content Status', 'dropdown', 'Is your content ready?', true, 3, 'Design & Content', 'Content', 4,
'[{"value": "ready", "label": "Content is ready"}, {"value": "needs_updates", "label": "Needs updates/revisions"}, {"value": "needs_creation", "label": "Needs to be created"}, {"value": "need_help", "label": "Need help with content"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'website-dev';

-- Step 4: Technical & Timeline
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'cms_preference', 'CMS Preference', 'dropdown', 'Do you have a preferred content management system?', false, 4, 'Technical & Timeline', 'Technical', 1,
'[{"value": "wordpress", "label": "WordPress"}, {"value": "webflow", "label": "Webflow"}, {"value": "shopify", "label": "Shopify"}, {"value": "squarespace", "label": "Squarespace"}, {"value": "custom", "label": "Custom Built"}, {"value": "no_preference", "label": "No Preference"}, {"value": "other", "label": "Other"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'hosting', 'Hosting', 'dropdown', 'Do you have existing hosting?', false, 4, 'Technical & Timeline', 'Technical', 2,
'[{"value": "have_hosting", "label": "Already have hosting"}, {"value": "need_hosting", "label": "Need hosting setup"}, {"value": "need_recommendation", "label": "Need recommendation"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'launch_date', 'Target Launch Date', 'date', 'When do you need the website live?', true, 4, 'Technical & Timeline', 'Timeline', 3
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'budget_range', 'Budget Range', 'dropdown', 'What is your budget for this project?', true, 4, 'Technical & Timeline', 'Budget', 4,
'[{"value": "under_5k", "label": "Under $5,000"}, {"value": "5k_10k", "label": "$5,000 - $10,000"}, {"value": "10k_25k", "label": "$10,000 - $25,000"}, {"value": "25k_50k", "label": "$25,000 - $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "tbd", "label": "To Be Determined"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'website-dev';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'additional_notes', 'Additional Notes', 'richtext', 'Any other information we should know?', false, 4, 'Technical & Timeline', 'Other', 5
FROM brief_templates bt WHERE bt.slug = 'website-dev';

-- ============================================
-- IT Support Request Fields (Single Step)
-- ============================================

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, section, sort_order, show_in_list)
SELECT bt.id, 'subject', 'Subject', 'text', 'Brief description of your request', true, 1, 'Request Details', 1, true
FROM brief_templates bt WHERE bt.slug = 'it-support';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, section, sort_order, show_in_list, options)
SELECT bt.id, 'request_type', 'Request Type', 'dropdown', 'What type of IT request is this?', true, 1, 'Request Details', 2, true,
'[{"value": "hardware", "label": "Hardware Issue"}, {"value": "software", "label": "Software Issue"}, {"value": "access", "label": "Access/Permissions"}, {"value": "network", "label": "Network/Connectivity"}, {"value": "new_equipment", "label": "New Equipment Request"}, {"value": "new_software", "label": "New Software Request"}, {"value": "account", "label": "Account Setup/Changes"}, {"value": "security", "label": "Security Concern"}, {"value": "other", "label": "Other"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'it-support';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, section, sort_order, options)
SELECT bt.id, 'priority', 'Priority', 'radio', 'How urgent is this request?', true, 1, 'Request Details', 3,
'[{"value": "low", "label": "Low - Can wait a few days"}, {"value": "medium", "label": "Medium - Needed this week"}, {"value": "high", "label": "High - Needed today"}, {"value": "urgent", "label": "Urgent - Blocking my work"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'it-support';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, section, sort_order)
SELECT bt.id, 'description', 'Description', 'richtext', 'Please describe your issue or request in detail...', 'Include any error messages, when the issue started, and steps to reproduce', true, 1, 'Details', 4
FROM brief_templates bt WHERE bt.slug = 'it-support';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, section, width, sort_order)
SELECT bt.id, 'device_type', 'Device Type', 'text', 'e.g., MacBook Pro, Dell Monitor', false, 1, 'Environment', 'half', 5
FROM brief_templates bt WHERE bt.slug = 'it-support';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, section, width, sort_order)
SELECT bt.id, 'operating_system', 'Operating System', 'text', 'e.g., macOS Sonoma, Windows 11', false, 1, 'Environment', 'half', 6
FROM brief_templates bt WHERE bt.slug = 'it-support';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, section, sort_order)
SELECT bt.id, 'attachments', 'Screenshots/Attachments', 'files', 'Upload any relevant screenshots or files', false, 1, 'Attachments', 7
FROM brief_templates bt WHERE bt.slug = 'it-support';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, section, sort_order)
SELECT bt.id, 'preferred_contact', 'Preferred Contact Time', 'text', 'When is the best time to reach you?', false, 1, 'Contact', 8
FROM brief_templates bt WHERE bt.slug = 'it-support';

-- ============================================
-- Support Ticket Fields (Single Step)
-- ============================================

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, section, sort_order, show_in_list)
SELECT bt.id, 'subject', 'Subject', 'text', 'Brief summary of your issue', true, 1, 'Ticket Details', 1, true
FROM brief_templates bt WHERE bt.slug = 'support-ticket';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, section, sort_order, show_in_list, options)
SELECT bt.id, 'category', 'Category', 'dropdown', 'Select the category that best fits your issue', true, 1, 'Ticket Details', 2, true,
'[{"value": "technical", "label": "Technical Issue"}, {"value": "account", "label": "Account/Billing"}, {"value": "feature_request", "label": "Feature Request"}, {"value": "bug_report", "label": "Bug Report"}, {"value": "question", "label": "General Question"}, {"value": "feedback", "label": "Feedback"}, {"value": "other", "label": "Other"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'support-ticket';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, section, sort_order, options)
SELECT bt.id, 'priority', 'Priority', 'radio', 'How urgent is this?', true, 1, 'Ticket Details', 3,
'[{"value": "low", "label": "Low"}, {"value": "medium", "label": "Medium"}, {"value": "high", "label": "High"}, {"value": "urgent", "label": "Urgent"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'support-ticket';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, section, sort_order)
SELECT bt.id, 'description', 'Description', 'richtext', 'Please describe your issue in detail...', 'The more detail you provide, the faster we can help', true, 1, 'Details', 4
FROM brief_templates bt WHERE bt.slug = 'support-ticket';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, section, sort_order)
SELECT bt.id, 'steps_to_reproduce', 'Steps to Reproduce', 'textarea', '1. Go to...\n2. Click on...\n3. See error...', false, 1, 'Details', 5
FROM brief_templates bt WHERE bt.slug = 'support-ticket';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, section, sort_order)
SELECT bt.id, 'attachments', 'Attachments', 'files', 'Upload screenshots or relevant files', false, 1, 'Attachments', 6
FROM brief_templates bt WHERE bt.slug = 'support-ticket';

-- ============================================
-- Advertising Creative Brief Fields
-- ============================================

-- Step 1: Campaign Overview
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order, show_in_list)
SELECT bt.id, 'campaign_name', 'Campaign Name', 'text', 'Enter a campaign name', true, 1, 'Campaign Overview', 'Basic Info', 1, true
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'client', 'Client', 'client', true, 1, 'Campaign Overview', 'Basic Info', 2
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'ad_type', 'Ad Type', 'multiselect', 'Select all ad types needed', true, 1, 'Campaign Overview', 'Campaign Type', 3,
'[{"value": "display", "label": "Display Ads"}, {"value": "social", "label": "Social Media Ads"}, {"value": "video", "label": "Video Ads"}, {"value": "search", "label": "Search Ads"}, {"value": "native", "label": "Native Ads"}, {"value": "print", "label": "Print Ads"}, {"value": "outdoor", "label": "Outdoor/OOH"}, {"value": "radio", "label": "Radio/Audio"}, {"value": "tv", "label": "TV/Broadcast"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'campaign_objective', 'Campaign Objective', 'richtext', 'What is the primary goal of this campaign?', true, 1, 'Campaign Overview', 'Objectives', 4
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'success_metrics', 'Success Metrics/KPIs', 'textarea', 'How will you measure success? (CTR, conversions, reach, etc.)', true, 1, 'Campaign Overview', 'Objectives', 5
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

-- Step 2: Target Audience
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'target_audience', 'Target Audience', 'richtext', 'Describe your ideal customer...', true, 2, 'Target Audience', 'Demographics', 1
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'age_range', 'Age Range', 'text', 'e.g., 25-45', false, 2, 'Target Audience', 'Demographics', 'half', 2
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'location', 'Geographic Location', 'text', 'e.g., USA, UK, Global', false, 2, 'Target Audience', 'Demographics', 'half', 3
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'customer_insights', 'Customer Insights', 'richtext', 'What do we know about their behavior, pain points, motivations?', false, 2, 'Target Audience', 'Insights', 4
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

-- Step 3: Creative Direction
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'key_message', 'Key Message', 'richtext', 'What is the single most important message?', true, 3, 'Creative Direction', 'Messaging', 1
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'call_to_action', 'Call to Action', 'text', 'e.g., Shop Now, Learn More, Sign Up', true, 3, 'Creative Direction', 'Messaging', 2
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'tone', 'Tone & Style', 'multiselect', 'Select all that apply', true, 3, 'Creative Direction', 'Style', 3,
'[{"value": "professional", "label": "Professional"}, {"value": "friendly", "label": "Friendly"}, {"value": "playful", "label": "Playful"}, {"value": "bold", "label": "Bold"}, {"value": "elegant", "label": "Elegant"}, {"value": "urgent", "label": "Urgent"}, {"value": "inspirational", "label": "Inspirational"}, {"value": "humorous", "label": "Humorous"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'mandatory_elements', 'Mandatory Elements', 'textarea', 'List any required elements (logo placement, legal disclaimers, etc.)', false, 3, 'Creative Direction', 'Requirements', 4
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'avoid', 'Things to Avoid', 'textarea', 'List anything that should NOT be included', false, 3, 'Creative Direction', 'Requirements', 5
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'brand_assets', 'Brand Assets', 'files', false, 3, 'Creative Direction', 'Assets', 6
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'references', 'Creative References', 'richtext', 'Share links or describe ads that inspire you', false, 3, 'Creative Direction', 'Assets', 7
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

-- Step 4: Deliverables & Timeline
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'deliverables', 'Required Sizes/Formats', 'checkboxgroup', 'Select all sizes needed', true, 4, 'Deliverables & Timeline', 'Deliverables', 1,
'[{"value": "300x250", "label": "300x250 (Medium Rectangle)"}, {"value": "728x90", "label": "728x90 (Leaderboard)"}, {"value": "160x600", "label": "160x600 (Wide Skyscraper)"}, {"value": "320x50", "label": "320x50 (Mobile Leaderboard)"}, {"value": "1200x628", "label": "1200x628 (Facebook/LinkedIn)"}, {"value": "1080x1080", "label": "1080x1080 (Instagram Square)"}, {"value": "1080x1920", "label": "1080x1920 (Stories)"}, {"value": "1920x1080", "label": "1920x1080 (Video 16:9)"}, {"value": "custom", "label": "Custom Sizes"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'custom_sizes', 'Custom Sizes (if any)', 'textarea', 'List any additional sizes needed', false, 4, 'Deliverables & Timeline', 'Deliverables', 2
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'deadline', 'Creative Deadline', 'date', 'When do you need the creative assets?', true, 4, 'Deliverables & Timeline', 'Timeline', 'half', 3
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'launch_date', 'Campaign Launch Date', 'date', 'When does the campaign go live?', false, 4, 'Deliverables & Timeline', 'Timeline', 'half', 4
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'budget', 'Creative Budget', 'dropdown', 'Budget for creative development', true, 4, 'Deliverables & Timeline', 'Budget', 5,
'[{"value": "under_2k", "label": "Under $2,000"}, {"value": "2k_5k", "label": "$2,000 - $5,000"}, {"value": "5k_10k", "label": "$5,000 - $10,000"}, {"value": "10k_25k", "label": "$10,000 - $25,000"}, {"value": "over_25k", "label": "Over $25,000"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'additional_notes', 'Additional Notes', 'richtext', 'Any other information for the creative team?', false, 4, 'Deliverables & Timeline', 'Other', 6
FROM brief_templates bt WHERE bt.slug = 'ad-creative';

-- ============================================
-- Facebook Ads Campaign Fields
-- ============================================

-- Step 1: Campaign Overview
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order, show_in_list)
SELECT bt.id, 'campaign_name', 'Campaign Name', 'text', 'e.g., Summer Sale 2025', true, 1, 'Campaign Overview', 'Basic Info', 1, true
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'client', 'Client', 'client', true, 1, 'Campaign Overview', 'Basic Info', 2
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'campaign_objective', 'Campaign Objective', 'dropdown', 'What is the primary goal of this campaign?', true, 1, 'Campaign Overview', 'Objectives', 3,
'[{"value": "awareness", "label": "Brand Awareness"}, {"value": "reach", "label": "Reach"}, {"value": "traffic", "label": "Traffic"}, {"value": "engagement", "label": "Engagement"}, {"value": "app_installs", "label": "App Installs"}, {"value": "video_views", "label": "Video Views"}, {"value": "lead_generation", "label": "Lead Generation"}, {"value": "messages", "label": "Messages"}, {"value": "conversions", "label": "Conversions"}, {"value": "catalog_sales", "label": "Catalog Sales"}, {"value": "store_traffic", "label": "Store Traffic"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'campaign_description', 'Campaign Description', 'richtext', 'Describe what you want to achieve with this campaign...', true, 1, 'Campaign Overview', 'Objectives', 4
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'landing_page_url', 'Landing Page URL', 'url', 'https://example.com/landing-page', false, 1, 'Campaign Overview', 'Destination', 5
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'success_metrics', 'Success Metrics/KPIs', 'textarea', 'e.g., CTR > 2%, CPA < $20, ROAS > 3x', true, 1, 'Campaign Overview', 'Goals', 6
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

-- Step 2: Target Audience
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'audience_heading', 'Define Your Target Audience', 'heading', false, 2, 'Target Audience', NULL, 1
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'age_min', 'Minimum Age', 'number', '18', true, 2, 'Target Audience', 'Demographics', 'half', 2
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'age_max', 'Maximum Age', 'number', '65', true, 2, 'Target Audience', 'Demographics', 'half', 3
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'gender', 'Gender', 'dropdown', 'Target gender', true, 2, 'Target Audience', 'Demographics', 4,
'[{"value": "all", "label": "All Genders"}, {"value": "male", "label": "Male"}, {"value": "female", "label": "Female"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'locations', 'Target Locations', 'textarea', 'e.g., United States, Canada, United Kingdom', 'Enter countries, regions, or cities to target', true, 2, 'Target Audience', 'Geography', 5
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'interests', 'Interests & Behaviors', 'textarea', 'e.g., Online shopping, Fashion, Technology enthusiasts', 'List interests and behaviors to target', false, 2, 'Target Audience', 'Interests', 6
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'custom_audiences', 'Custom Audiences', 'checkboxgroup', 'Do you have existing audiences to use?', false, 2, 'Target Audience', 'Custom Audiences', 7,
'[{"value": "website_visitors", "label": "Website Visitors (Pixel)"}, {"value": "customer_list", "label": "Customer Email List"}, {"value": "app_users", "label": "App Users"}, {"value": "video_viewers", "label": "Video Viewers"}, {"value": "page_engagers", "label": "Page/Post Engagers"}, {"value": "lookalike", "label": "Lookalike Audience"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'excluded_audiences', 'Excluded Audiences', 'textarea', 'e.g., Existing customers, Recent purchasers', false, 2, 'Target Audience', 'Exclusions', 8
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

-- Step 3: Ad Creative
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'ad_format', 'Ad Format', 'checkboxgroup', 'Select ad formats to create', true, 3, 'Ad Creative', 'Formats', 1,
'[{"value": "single_image", "label": "Single Image"}, {"value": "carousel", "label": "Carousel (Multiple Images)"}, {"value": "video", "label": "Video"}, {"value": "slideshow", "label": "Slideshow"}, {"value": "collection", "label": "Collection"}, {"value": "instant_experience", "label": "Instant Experience"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'placements', 'Ad Placements', 'checkboxgroup', 'Where should ads appear?', true, 3, 'Ad Creative', 'Placements', 2,
'[{"value": "feed", "label": "Facebook Feed"}, {"value": "stories", "label": "Facebook Stories"}, {"value": "reels", "label": "Facebook Reels"}, {"value": "right_column", "label": "Right Column"}, {"value": "marketplace", "label": "Marketplace"}, {"value": "video_feeds", "label": "Video Feeds"}, {"value": "search", "label": "Search Results"}, {"value": "messenger", "label": "Messenger"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'primary_text', 'Primary Text', 'textarea', 'The main ad copy that appears above the image/video (max 125 chars recommended)', true, 3, 'Ad Creative', 'Copy', 3
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'headline', 'Headline', 'text', 'Catchy headline (max 40 chars recommended)', true, 3, 'Ad Creative', 'Copy', 4
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'description', 'Description', 'text', 'Additional description text', false, 3, 'Ad Creative', 'Copy', 5
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'cta_button', 'Call to Action Button', 'dropdown', 'Select the CTA button', true, 3, 'Ad Creative', 'Copy', 6,
'[{"value": "learn_more", "label": "Learn More"}, {"value": "shop_now", "label": "Shop Now"}, {"value": "sign_up", "label": "Sign Up"}, {"value": "book_now", "label": "Book Now"}, {"value": "contact_us", "label": "Contact Us"}, {"value": "download", "label": "Download"}, {"value": "get_offer", "label": "Get Offer"}, {"value": "get_quote", "label": "Get Quote"}, {"value": "subscribe", "label": "Subscribe"}, {"value": "watch_more", "label": "Watch More"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'creative_assets', 'Creative Assets', 'files', 'Upload images, videos, or brand assets', false, 3, 'Ad Creative', 'Assets', 7
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'creative_notes', 'Creative Direction Notes', 'richtext', 'Any specific requirements for creative design...', false, 3, 'Ad Creative', 'Notes', 8
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

-- Step 4: Budget & Schedule
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'budget_type', 'Budget Type', 'radio', 'How do you want to set your budget?', true, 4, 'Budget & Schedule', 'Budget', 1,
'[{"value": "daily", "label": "Daily Budget"}, {"value": "lifetime", "label": "Lifetime Budget"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'budget_amount', 'Budget Amount ($)', 'currency', '500', 'Enter the budget amount in USD', true, 4, 'Budget & Schedule', 'Budget', 'half', 2
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, width, sort_order, options)
SELECT bt.id, 'bid_strategy', 'Bid Strategy', 'dropdown', 'How should Facebook optimize spending?', false, 4, 'Budget & Schedule', 'Budget', 'half', 3,
'[{"value": "lowest_cost", "label": "Lowest Cost"}, {"value": "cost_cap", "label": "Cost Cap"}, {"value": "bid_cap", "label": "Bid Cap"}, {"value": "target_cost", "label": "Target Cost"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'start_date', 'Start Date', 'date', 'When should the campaign start?', true, 4, 'Budget & Schedule', 'Schedule', 'half', 4
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'end_date', 'End Date', 'date', 'When should the campaign end? (Leave blank for ongoing)', false, 4, 'Budget & Schedule', 'Schedule', 'half', 5
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'ad_scheduling', 'Ad Scheduling', 'dropdown', 'When should ads run?', false, 4, 'Budget & Schedule', 'Schedule', 6,
'[{"value": "all_time", "label": "Run ads all the time"}, {"value": "schedule", "label": "Run ads on a schedule"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'additional_notes', 'Additional Notes', 'richtext', 'Any other requirements or information...', false, 4, 'Budget & Schedule', 'Other', 7
FROM brief_templates bt WHERE bt.slug = 'facebook-ads';

-- ============================================
-- Google Ads Campaign Fields
-- ============================================

-- Step 1: Campaign Overview
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order, show_in_list)
SELECT bt.id, 'campaign_name', 'Campaign Name', 'text', 'e.g., Brand Keywords Q1 2025', true, 1, 'Campaign Overview', 'Basic Info', 1, true
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'client', 'Client', 'client', true, 1, 'Campaign Overview', 'Basic Info', 2
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'campaign_type', 'Campaign Type', 'dropdown', 'Select the type of Google Ads campaign', true, 1, 'Campaign Overview', 'Campaign Type', 3,
'[{"value": "search", "label": "Search Ads"}, {"value": "display", "label": "Display Network"}, {"value": "shopping", "label": "Shopping"}, {"value": "video", "label": "Video (YouTube)"}, {"value": "app", "label": "App Campaigns"}, {"value": "smart", "label": "Smart Campaigns"}, {"value": "performance_max", "label": "Performance Max"}, {"value": "discovery", "label": "Discovery"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'campaign_goal', 'Campaign Goal', 'dropdown', 'What is the primary goal?', true, 1, 'Campaign Overview', 'Objectives', 4,
'[{"value": "sales", "label": "Sales"}, {"value": "leads", "label": "Leads"}, {"value": "website_traffic", "label": "Website Traffic"}, {"value": "brand_awareness", "label": "Brand Awareness & Reach"}, {"value": "product_consideration", "label": "Product & Brand Consideration"}, {"value": "app_promotion", "label": "App Promotion"}, {"value": "local_store", "label": "Local Store Visits"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'campaign_description', 'Campaign Description', 'richtext', 'Describe the campaign goals and context...', true, 1, 'Campaign Overview', 'Objectives', 5
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'landing_page_url', 'Landing Page URL', 'url', 'https://example.com/landing-page', true, 1, 'Campaign Overview', 'Destination', 6
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'success_metrics', 'Success Metrics/KPIs', 'textarea', 'e.g., CPC < $2, Conversion Rate > 5%, ROAS > 4x', true, 1, 'Campaign Overview', 'Goals', 7
FROM brief_templates bt WHERE bt.slug = 'google-ads';

-- Step 2: Keywords & Targeting
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'target_keywords', 'Target Keywords', 'textarea', 'Enter keywords, one per line', 'List the keywords you want to target', true, 2, 'Keywords & Targeting', 'Keywords', 1
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'negative_keywords', 'Negative Keywords', 'textarea', 'Enter negative keywords, one per line', 'Keywords to exclude from targeting', false, 2, 'Keywords & Targeting', 'Keywords', 2
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'keyword_match_types', 'Keyword Match Types', 'checkboxgroup', 'Select match types to use', true, 2, 'Keywords & Targeting', 'Keywords', 3,
'[{"value": "broad", "label": "Broad Match"}, {"value": "phrase", "label": "Phrase Match"}, {"value": "exact", "label": "Exact Match"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'target_locations', 'Target Locations', 'textarea', 'e.g., United States, New York, 10-mile radius of NYC', true, 2, 'Keywords & Targeting', 'Geography', 4
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'languages', 'Target Languages', 'multiselect', 'Select languages to target', true, 2, 'Keywords & Targeting', 'Geography', 5,
'[{"value": "en", "label": "English"}, {"value": "es", "label": "Spanish"}, {"value": "fr", "label": "French"}, {"value": "de", "label": "German"}, {"value": "pt", "label": "Portuguese"}, {"value": "it", "label": "Italian"}, {"value": "zh", "label": "Chinese"}, {"value": "ja", "label": "Japanese"}, {"value": "ko", "label": "Korean"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'audience_targeting', 'Audience Targeting', 'checkboxgroup', 'Additional audience targeting options', false, 2, 'Keywords & Targeting', 'Audiences', 6,
'[{"value": "in_market", "label": "In-Market Audiences"}, {"value": "affinity", "label": "Affinity Audiences"}, {"value": "custom_intent", "label": "Custom Intent"}, {"value": "remarketing", "label": "Remarketing Lists"}, {"value": "similar_audiences", "label": "Similar Audiences"}, {"value": "customer_match", "label": "Customer Match"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'device_targeting', 'Device Targeting', 'checkboxgroup', 'Which devices to target?', false, 2, 'Keywords & Targeting', 'Devices', 7,
'[{"value": "desktop", "label": "Desktop/Laptop"}, {"value": "mobile", "label": "Mobile"}, {"value": "tablet", "label": "Tablet"}, {"value": "tv", "label": "TV Screens"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'google-ads';

-- Step 3: Ad Copy & Creative
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'headlines', 'Headlines', 'textarea', 'Headline 1 (max 30 chars)\nHeadline 2 (max 30 chars)\nHeadline 3 (max 30 chars)', 'Enter up to 15 headlines for responsive ads', true, 3, 'Ad Copy & Creative', 'Search Ads', 1
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'descriptions', 'Descriptions', 'textarea', 'Description 1 (max 90 chars)\nDescription 2 (max 90 chars)', 'Enter up to 4 descriptions for responsive ads', true, 3, 'Ad Copy & Creative', 'Search Ads', 2
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'display_path', 'Display URL Path', 'text', 'e.g., /shoes/sale', false, 3, 'Ad Copy & Creative', 'Search Ads', 3
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'ad_extensions', 'Ad Extensions', 'checkboxgroup', 'Select extensions to include', false, 3, 'Ad Copy & Creative', 'Extensions', 4,
'[{"value": "sitelinks", "label": "Sitelink Extensions"}, {"value": "callouts", "label": "Callout Extensions"}, {"value": "structured_snippets", "label": "Structured Snippets"}, {"value": "call", "label": "Call Extension"}, {"value": "location", "label": "Location Extension"}, {"value": "price", "label": "Price Extension"}, {"value": "promotion", "label": "Promotion Extension"}, {"value": "app", "label": "App Extension"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'sitelinks_info', 'Sitelinks Details', 'textarea', 'List sitelink text and URLs if using sitelink extensions', false, 3, 'Ad Copy & Creative', 'Extensions', 5
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'display_assets', 'Display/Video Assets', 'files', 'Upload images, logos, or videos for Display/Video campaigns', false, 3, 'Ad Copy & Creative', 'Assets', 6
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'creative_notes', 'Creative Direction Notes', 'richtext', 'Any specific requirements for ad creative...', false, 3, 'Ad Copy & Creative', 'Notes', 7
FROM brief_templates bt WHERE bt.slug = 'google-ads';

-- Step 4: Budget & Bidding
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'daily_budget', 'Daily Budget ($)', 'currency', '100', 'Average daily spend', true, 4, 'Budget & Bidding', 'Budget', 'half', 1
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'monthly_budget', 'Monthly Budget Cap ($)', 'currency', '3000', 'Maximum monthly spend', false, 4, 'Budget & Bidding', 'Budget', 'half', 2
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'bidding_strategy', 'Bidding Strategy', 'dropdown', 'How should Google optimize bids?', true, 4, 'Budget & Bidding', 'Bidding', 3,
'[{"value": "maximize_clicks", "label": "Maximize Clicks"}, {"value": "maximize_conversions", "label": "Maximize Conversions"}, {"value": "target_cpa", "label": "Target CPA"}, {"value": "target_roas", "label": "Target ROAS"}, {"value": "manual_cpc", "label": "Manual CPC"}, {"value": "enhanced_cpc", "label": "Enhanced CPC"}, {"value": "target_impression_share", "label": "Target Impression Share"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'target_cpa_roas', 'Target CPA/ROAS Value', 'text', 'e.g., $25 CPA or 400% ROAS', 'If using Target CPA or Target ROAS', false, 4, 'Budget & Bidding', 'Bidding', 4
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'start_date', 'Start Date', 'date', 'Campaign start date', true, 4, 'Budget & Bidding', 'Schedule', 'half', 5
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'end_date', 'End Date', 'date', 'Leave blank for ongoing campaigns', false, 4, 'Budget & Bidding', 'Schedule', 'half', 6
FROM brief_templates bt WHERE bt.slug = 'google-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'additional_notes', 'Additional Notes', 'richtext', 'Any other requirements or information...', false, 4, 'Budget & Bidding', 'Other', 7
FROM brief_templates bt WHERE bt.slug = 'google-ads';

-- ============================================
-- TikTok Ads Campaign Fields
-- ============================================

-- Step 1: Campaign Overview
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order, show_in_list)
SELECT bt.id, 'campaign_name', 'Campaign Name', 'text', 'e.g., Gen Z Summer Campaign', true, 1, 'Campaign Overview', 'Basic Info', 1, true
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'client', 'Client', 'client', true, 1, 'Campaign Overview', 'Basic Info', 2
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'advertising_objective', 'Advertising Objective', 'dropdown', 'What is the main goal?', true, 1, 'Campaign Overview', 'Objectives', 3,
'[{"value": "reach", "label": "Reach"}, {"value": "traffic", "label": "Traffic"}, {"value": "video_views", "label": "Video Views"}, {"value": "community_interaction", "label": "Community Interaction"}, {"value": "app_promotion", "label": "App Promotion"}, {"value": "lead_generation", "label": "Lead Generation"}, {"value": "website_conversions", "label": "Website Conversions"}, {"value": "product_sales", "label": "Product Sales"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'campaign_description', 'Campaign Description', 'richtext', 'Describe your campaign goals and what you want to achieve...', true, 1, 'Campaign Overview', 'Objectives', 4
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'landing_page_url', 'Landing Page URL', 'url', 'https://example.com/tiktok-offer', false, 1, 'Campaign Overview', 'Destination', 5
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'success_metrics', 'Success Metrics/KPIs', 'textarea', 'e.g., Video Views > 1M, CTR > 1%, CPA < $15', true, 1, 'Campaign Overview', 'Goals', 6
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

-- Step 2: Target Audience
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'age_min', 'Minimum Age', 'number', '13', true, 2, 'Target Audience', 'Demographics', 'half', 1
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'age_max', 'Maximum Age', 'number', '55', true, 2, 'Target Audience', 'Demographics', 'half', 2
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'gender', 'Gender', 'dropdown', 'Target gender', true, 2, 'Target Audience', 'Demographics', 3,
'[{"value": "all", "label": "All Genders"}, {"value": "male", "label": "Male"}, {"value": "female", "label": "Female"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'locations', 'Target Locations', 'textarea', 'e.g., United States, United Kingdom, Australia', true, 2, 'Target Audience', 'Geography', 4
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'interest_categories', 'Interest Categories', 'checkboxgroup', 'Select interests to target', false, 2, 'Target Audience', 'Interests', 5,
'[{"value": "apparel_accessories", "label": "Apparel & Accessories"}, {"value": "beauty_personal_care", "label": "Beauty & Personal Care"}, {"value": "food_beverage", "label": "Food & Beverage"}, {"value": "games", "label": "Games"}, {"value": "tech_electronics", "label": "Tech & Electronics"}, {"value": "sports_outdoors", "label": "Sports & Outdoors"}, {"value": "travel", "label": "Travel"}, {"value": "financial_services", "label": "Financial Services"}, {"value": "education", "label": "Education"}, {"value": "entertainment", "label": "Entertainment"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'behavior_targeting', 'Behavior Targeting', 'checkboxgroup', 'Target based on user behavior', false, 2, 'Target Audience', 'Behaviors', 6,
'[{"value": "video_interaction", "label": "Video Interaction"}, {"value": "creator_interaction", "label": "Creator Interaction"}, {"value": "hashtag_interaction", "label": "Hashtag Interaction"}, {"value": "purchase_intent", "label": "Purchase Intent"}, {"value": "app_activity", "label": "App Activity"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'custom_audiences', 'Custom Audiences', 'checkboxgroup', 'Do you have existing audiences?', false, 2, 'Target Audience', 'Custom Audiences', 7,
'[{"value": "customer_file", "label": "Customer File"}, {"value": "website_traffic", "label": "Website Traffic (Pixel)"}, {"value": "app_activity", "label": "App Activity"}, {"value": "engagement", "label": "Engagement Audiences"}, {"value": "lookalike", "label": "Lookalike Audiences"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

-- Step 3: Creative Content
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'ad_format', 'Ad Format', 'checkboxgroup', 'Select ad formats to use', true, 3, 'Creative Content', 'Formats', 1,
'[{"value": "in_feed", "label": "In-Feed Ads"}, {"value": "topview", "label": "TopView"}, {"value": "brand_takeover", "label": "Brand Takeover"}, {"value": "branded_hashtag", "label": "Branded Hashtag Challenge"}, {"value": "branded_effects", "label": "Branded Effects"}, {"value": "spark_ads", "label": "Spark Ads (Boosted Organic)"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'video_orientation', 'Video Orientation', 'radio', 'TikTok is vertical-first', true, 3, 'Creative Content', 'Specs', 2,
'[{"value": "vertical_9_16", "label": "Vertical 9:16 (Recommended)"}, {"value": "square_1_1", "label": "Square 1:1"}, {"value": "horizontal_16_9", "label": "Horizontal 16:9"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'video_concept', 'Video Concept', 'richtext', 'Describe the video concept, story, or script...', 'TikTok videos should feel native and authentic', true, 3, 'Creative Content', 'Content', 3
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'ad_text', 'Ad Text/Caption', 'textarea', 'Write engaging caption (max 100 chars recommended)', true, 3, 'Creative Content', 'Copy', 4
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'cta_button', 'Call to Action', 'dropdown', 'Select CTA button', true, 3, 'Creative Content', 'Copy', 5,
'[{"value": "learn_more", "label": "Learn More"}, {"value": "shop_now", "label": "Shop Now"}, {"value": "sign_up", "label": "Sign Up"}, {"value": "download", "label": "Download"}, {"value": "contact_us", "label": "Contact Us"}, {"value": "apply_now", "label": "Apply Now"}, {"value": "book_now", "label": "Book Now"}, {"value": "get_quote", "label": "Get Quote"}, {"value": "watch_more", "label": "Watch More"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'music_preference', 'Music/Sound', 'dropdown', 'Sound is crucial on TikTok', true, 3, 'Creative Content', 'Audio', 6,
'[{"value": "trending_sound", "label": "Use Trending Sound"}, {"value": "original_audio", "label": "Original Audio/Voiceover"}, {"value": "licensed_music", "label": "Licensed Music"}, {"value": "no_sound", "label": "No Sound (Not Recommended)"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'hashtags', 'Suggested Hashtags', 'textarea', '#brand #campaign #trending', false, 3, 'Creative Content', 'Discovery', 7
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'video_assets', 'Video Assets', 'files', 'Upload existing videos or raw footage', false, 3, 'Creative Content', 'Assets', 8
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'creative_notes', 'Creative Direction Notes', 'richtext', 'Reference TikToks, trends, or influencer styles to emulate...', false, 3, 'Creative Content', 'Notes', 9
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

-- Step 4: Budget & Schedule
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'budget_type', 'Budget Type', 'radio', 'How to set your budget', true, 4, 'Budget & Schedule', 'Budget', 1,
'[{"value": "daily", "label": "Daily Budget"}, {"value": "lifetime", "label": "Lifetime Budget"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'budget_amount', 'Budget Amount ($)', 'currency', '500', true, 4, 'Budget & Schedule', 'Budget', 'half', 2
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, width, sort_order, options)
SELECT bt.id, 'bid_strategy', 'Bid Strategy', 'dropdown', 'Optimization goal', false, 4, 'Budget & Schedule', 'Budget', 'half', 3,
'[{"value": "lowest_cost", "label": "Lowest Cost"}, {"value": "cost_cap", "label": "Cost Cap"}, {"value": "bid_cap", "label": "Bid Cap"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'start_date', 'Start Date', 'date', true, 4, 'Budget & Schedule', 'Schedule', 'half', 4
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'end_date', 'End Date', 'date', false, 4, 'Budget & Schedule', 'Schedule', 'half', 5
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'additional_notes', 'Additional Notes', 'richtext', 'Any other requirements...', false, 4, 'Budget & Schedule', 'Other', 6
FROM brief_templates bt WHERE bt.slug = 'tiktok-ads';

-- ============================================
-- Instagram Ads Campaign Fields
-- ============================================

-- Step 1: Campaign Overview
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order, show_in_list)
SELECT bt.id, 'campaign_name', 'Campaign Name', 'text', 'e.g., Holiday Collection Launch', true, 1, 'Campaign Overview', 'Basic Info', 1, true
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'client', 'Client', 'client', true, 1, 'Campaign Overview', 'Basic Info', 2
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'campaign_objective', 'Campaign Objective', 'dropdown', 'Primary goal for this campaign', true, 1, 'Campaign Overview', 'Objectives', 3,
'[{"value": "awareness", "label": "Brand Awareness"}, {"value": "reach", "label": "Reach"}, {"value": "traffic", "label": "Traffic"}, {"value": "engagement", "label": "Engagement"}, {"value": "app_installs", "label": "App Installs"}, {"value": "video_views", "label": "Video Views"}, {"value": "lead_generation", "label": "Lead Generation"}, {"value": "messages", "label": "Messages"}, {"value": "conversions", "label": "Conversions"}, {"value": "catalog_sales", "label": "Catalog Sales"}, {"value": "store_visits", "label": "Store Visits"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'campaign_description', 'Campaign Description', 'richtext', 'Describe your campaign goals, product/service, and key messaging...', true, 1, 'Campaign Overview', 'Objectives', 4
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'landing_page_url', 'Landing Page URL', 'url', 'https://example.com/instagram-offer', false, 1, 'Campaign Overview', 'Destination', 5
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'instagram_handle', 'Instagram Handle', 'text', '@yourbrand', true, 1, 'Campaign Overview', 'Account', 6
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'success_metrics', 'Success Metrics/KPIs', 'textarea', 'e.g., Engagement Rate > 3%, CTR > 1.5%, CPA < $25', true, 1, 'Campaign Overview', 'Goals', 7
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

-- Step 2: Target Audience
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'age_min', 'Minimum Age', 'number', '18', true, 2, 'Target Audience', 'Demographics', 'half', 1
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'age_max', 'Maximum Age', 'number', '55', true, 2, 'Target Audience', 'Demographics', 'half', 2
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'gender', 'Gender', 'dropdown', 'Target gender', true, 2, 'Target Audience', 'Demographics', 3,
'[{"value": "all", "label": "All Genders"}, {"value": "male", "label": "Male"}, {"value": "female", "label": "Female"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'locations', 'Target Locations', 'textarea', 'e.g., United States, Los Angeles, 25-mile radius', true, 2, 'Target Audience', 'Geography', 4
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'interests', 'Interests', 'textarea', 'e.g., Fashion, Beauty, Fitness, Travel, Photography', false, 2, 'Target Audience', 'Interests', 5
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'behaviors', 'Behaviors', 'textarea', 'e.g., Online shoppers, Engaged shoppers, Frequent travelers', false, 2, 'Target Audience', 'Behaviors', 6
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'custom_audiences', 'Custom Audiences', 'checkboxgroup', 'Use existing audience data', false, 2, 'Target Audience', 'Custom Audiences', 7,
'[{"value": "website_visitors", "label": "Website Visitors (Pixel)"}, {"value": "customer_list", "label": "Customer Email List"}, {"value": "instagram_engagers", "label": "Instagram Profile Engagers"}, {"value": "video_viewers", "label": "Video Viewers"}, {"value": "shopping_engagers", "label": "Shopping Engagers"}, {"value": "lookalike", "label": "Lookalike Audience"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

-- Step 3: Ad Creative
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'ad_placement', 'Ad Placements', 'checkboxgroup', 'Where should ads appear?', true, 3, 'Ad Creative', 'Placements', 1,
'[{"value": "feed", "label": "Instagram Feed"}, {"value": "stories", "label": "Instagram Stories"}, {"value": "reels", "label": "Instagram Reels"}, {"value": "explore", "label": "Explore Page"}, {"value": "shop", "label": "Instagram Shop"}, {"value": "profile_feed", "label": "Profile Feed"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'ad_format', 'Ad Format', 'checkboxgroup', 'Select ad formats to create', true, 3, 'Ad Creative', 'Formats', 2,
'[{"value": "single_image", "label": "Single Image"}, {"value": "carousel", "label": "Carousel (Multiple Images/Videos)"}, {"value": "video", "label": "Video"}, {"value": "stories_image", "label": "Stories - Image"}, {"value": "stories_video", "label": "Stories - Video"}, {"value": "reels", "label": "Reels"}, {"value": "collection", "label": "Collection"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'primary_text', 'Primary Text/Caption', 'textarea', 'Write engaging caption (max 2200 chars, first 125 visible)', true, 3, 'Ad Creative', 'Copy', 3
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'headline', 'Headline (for Feed)', 'text', 'Compelling headline (max 40 chars)', false, 3, 'Ad Creative', 'Copy', 4
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'cta_button', 'Call to Action', 'dropdown', 'Select CTA button', true, 3, 'Ad Creative', 'Copy', 5,
'[{"value": "learn_more", "label": "Learn More"}, {"value": "shop_now", "label": "Shop Now"}, {"value": "sign_up", "label": "Sign Up"}, {"value": "book_now", "label": "Book Now"}, {"value": "contact_us", "label": "Contact Us"}, {"value": "download", "label": "Download"}, {"value": "get_offer", "label": "Get Offer"}, {"value": "watch_more", "label": "Watch More"}, {"value": "send_message", "label": "Send Message"}, {"value": "apply_now", "label": "Apply Now"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'hashtags', 'Hashtags', 'textarea', '#brand #campaign #trending #sponsored', false, 3, 'Ad Creative', 'Discovery', 6
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'creative_assets', 'Creative Assets', 'files', 'Upload images, videos, or brand assets (1080x1080 for Feed, 1080x1920 for Stories/Reels)', false, 3, 'Ad Creative', 'Assets', 7
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'visual_style', 'Visual Style & Direction', 'richtext', 'Describe the visual style, mood, colors, aesthetic...', false, 3, 'Ad Creative', 'Direction', 8
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'reference_accounts', 'Reference Accounts/Posts', 'richtext', 'Share Instagram accounts or posts that inspire this campaign...', false, 3, 'Ad Creative', 'Direction', 9
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

-- Step 4: Budget & Schedule
INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'budget_type', 'Budget Type', 'radio', 'How to set your budget', true, 4, 'Budget & Schedule', 'Budget', 1,
'[{"value": "daily", "label": "Daily Budget"}, {"value": "lifetime", "label": "Lifetime Budget"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'budget_amount', 'Budget Amount ($)', 'currency', '500', true, 4, 'Budget & Schedule', 'Budget', 'half', 2
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, width, sort_order, options)
SELECT bt.id, 'optimization_goal', 'Optimization Goal', 'dropdown', 'What to optimize for', false, 4, 'Budget & Schedule', 'Budget', 'half', 3,
'[{"value": "impressions", "label": "Impressions"}, {"value": "reach", "label": "Reach"}, {"value": "link_clicks", "label": "Link Clicks"}, {"value": "landing_page_views", "label": "Landing Page Views"}, {"value": "conversions", "label": "Conversions"}, {"value": "engagement", "label": "Engagement"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'start_date', 'Start Date', 'date', true, 4, 'Budget & Schedule', 'Schedule', 'half', 4
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, is_required, step_number, step_title, section, width, sort_order)
SELECT bt.id, 'end_date', 'End Date', 'date', false, 4, 'Budget & Schedule', 'Schedule', 'half', 5
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, help_text, is_required, step_number, step_title, section, sort_order, options)
SELECT bt.id, 'ad_scheduling', 'Ad Scheduling', 'dropdown', 'When should ads run?', false, 4, 'Budget & Schedule', 'Schedule', 6,
'[{"value": "all_time", "label": "Run ads all the time"}, {"value": "schedule", "label": "Run ads on a schedule"}]'::jsonb
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';

INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, is_required, step_number, step_title, section, sort_order)
SELECT bt.id, 'additional_notes', 'Additional Notes', 'richtext', 'Any other requirements or information...', false, 4, 'Budget & Schedule', 'Other', 7
FROM brief_templates bt WHERE bt.slug = 'instagram-ads';
