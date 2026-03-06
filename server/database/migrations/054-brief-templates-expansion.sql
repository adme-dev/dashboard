-- ============================================
-- Brief Templates Expansion
-- Adds new categories and comprehensive templates
-- for a full-service digital marketing agency
-- ============================================

-- ============================================
-- NEW CATEGORIES
-- ============================================

-- Creative & Design
INSERT INTO brief_categories (name, slug, description, icon, color, sort_order)
VALUES (
  'Creative & Design',
  'creative-design',
  'Graphic design, branding, video production, and all creative deliverables',
  'i-lucide-palette',
  'purple',
  2
) ON CONFLICT (slug) DO NOTHING;

-- Print & OOH (Out of Home)
INSERT INTO brief_categories (name, slug, description, icon, color, sort_order)
VALUES (
  'Print & OOH',
  'print-ooh',
  'Billboards, signage, print ads, brochures, and all physical media',
  'i-lucide-layout-panel-top',
  'orange',
  3
) ON CONFLICT (slug) DO NOTHING;

-- Broadcast & Audio
INSERT INTO brief_categories (name, slug, description, icon, color, sort_order)
VALUES (
  'Broadcast & Audio',
  'broadcast-audio',
  'TV commercials, radio ads, podcasts, and audio/video production',
  'i-lucide-radio',
  'red',
  4
) ON CONFLICT (slug) DO NOTHING;

-- Social Media
INSERT INTO brief_categories (name, slug, description, icon, color, sort_order)
VALUES (
  'Social Media',
  'social-media',
  'Social media content, influencer campaigns, and community management',
  'i-lucide-share-2',
  'blue',
  5
) ON CONFLICT (slug) DO NOTHING;

-- Content & SEO
INSERT INTO brief_categories (name, slug, description, icon, color, sort_order)
VALUES (
  'Content & SEO',
  'content-seo',
  'Blog content, copywriting, SEO audits, and content strategy',
  'i-lucide-pen-tool',
  'green',
  6
) ON CONFLICT (slug) DO NOTHING;

-- Email & CRM
INSERT INTO brief_categories (name, slug, description, icon, color, sort_order)
VALUES (
  'Email & CRM',
  'email-crm',
  'Email campaigns, automations, newsletters, and CRM workflows',
  'i-lucide-mail',
  'amber',
  7
) ON CONFLICT (slug) DO NOTHING;

-- Strategy & Research
INSERT INTO brief_categories (name, slug, description, icon, color, sort_order)
VALUES (
  'Strategy & Research',
  'strategy-research',
  'Market research, brand strategy, competitor analysis, and media plans',
  'i-lucide-lightbulb',
  'blue',
  8
) ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- TEMPLATE: Display Banner Campaign
-- Category: Advertising
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'advertising'),
  'Display Banner Campaign',
  'display-banner',
  'Request HTML5, static, or animated display banners for ad networks and programmatic campaigns',
  'i-lucide-image',
  true, true, 'medium', true, 2
) ON CONFLICT (category_id, slug) DO NOTHING;

-- Display Banner fields
DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'display-banner';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  -- Step 1: Overview
  (tmpl_id, 'project_name', 'Campaign Name', 'text', 'e.g. Spring Sale 2025 Banners', NULL, true, '[]', 1, 'Campaign Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Campaign Overview', 'Basic Information', 2),
  (tmpl_id, 'campaign_objective', 'Campaign Objective', 'dropdown', NULL, NULL, true,
    '[{"label":"Brand Awareness","value":"awareness"},{"label":"Traffic/Clicks","value":"traffic"},{"label":"Conversions/Sales","value":"conversions"},{"label":"Retargeting","value":"retargeting"},{"label":"App Install","value":"app_install"},{"label":"Event Promotion","value":"event"}]',
    1, 'Campaign Overview', 'Basic Information', 3),
  (tmpl_id, 'landing_url', 'Landing Page URL', 'url', 'https://', 'Where should the banners link to?', true, '[]', 1, 'Campaign Overview', 'Basic Information', 4),
  (tmpl_id, 'background', 'Campaign Background', 'richtext', 'Describe the campaign context, product, or promotion...', NULL, false, '[]', 1, 'Campaign Overview', 'Context', 5),

  -- Step 2: Sizes & Specs
  (tmpl_id, 'banner_sizes', 'Required Banner Sizes', 'checkboxgroup', NULL, 'Select all sizes needed', true,
    '[{"label":"300x250 (Medium Rectangle)","value":"300x250"},{"label":"728x90 (Leaderboard)","value":"728x90"},{"label":"160x600 (Wide Skyscraper)","value":"160x600"},{"label":"320x50 (Mobile Leaderboard)","value":"320x50"},{"label":"300x600 (Half Page)","value":"300x600"},{"label":"970x250 (Billboard)","value":"970x250"},{"label":"336x280 (Large Rectangle)","value":"336x280"},{"label":"320x100 (Large Mobile)","value":"320x100"},{"label":"250x250 (Square)","value":"250x250"},{"label":"970x90 (Large Leaderboard)","value":"970x90"},{"label":"468x60 (Banner)","value":"468x60"},{"label":"Custom Size","value":"custom"}]',
    2, 'Sizes & Specs', 'Banner Sizes', 1),
  (tmpl_id, 'custom_sizes', 'Custom Sizes', 'textarea', 'e.g. 1200x628, 1080x1080', 'Specify any custom dimensions not listed above', false, '[]', 2, 'Sizes & Specs', 'Banner Sizes', 2),
  (tmpl_id, 'banner_format', 'Banner Format', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Static (JPG/PNG)","value":"static"},{"label":"Animated (GIF)","value":"gif"},{"label":"HTML5 Animated","value":"html5"},{"label":"Responsive HTML5","value":"responsive_html5"},{"label":"AMP HTML","value":"amp"}]',
    2, 'Sizes & Specs', 'Format', 3),
  (tmpl_id, 'ad_network', 'Target Ad Network', 'checkboxgroup', NULL, 'Different networks have different specs', false,
    '[{"label":"Google Display Network","value":"gdn"},{"label":"Meta/Facebook Audience Network","value":"meta_an"},{"label":"DV360","value":"dv360"},{"label":"Amazon DSP","value":"amazon"},{"label":"Programmatic/Other DSP","value":"programmatic"},{"label":"Direct Publisher","value":"direct"}]',
    2, 'Sizes & Specs', 'Distribution', 4),
  (tmpl_id, 'max_file_size', 'Max File Size', 'dropdown', NULL, NULL, false,
    '[{"label":"150KB (Google standard)","value":"150kb"},{"label":"200KB","value":"200kb"},{"label":"500KB","value":"500kb"},{"label":"1MB","value":"1mb"},{"label":"No limit","value":"none"}]',
    2, 'Sizes & Specs', 'Constraints', 5),
  (tmpl_id, 'animation_duration', 'Animation Duration', 'dropdown', NULL, 'Max loop duration for animated banners', false,
    '[{"label":"15 seconds","value":"15s"},{"label":"30 seconds","value":"30s"},{"label":"No loop limit","value":"none"}]',
    2, 'Sizes & Specs', 'Constraints', 6),

  -- Step 3: Creative Direction
  (tmpl_id, 'key_message', 'Key Message / Headline', 'textarea', 'What''s the primary message or CTA?', NULL, true, '[]', 3, 'Creative Direction', 'Messaging', 1),
  (tmpl_id, 'cta_text', 'Call-to-Action Text', 'text', 'e.g. Shop Now, Learn More, Get Started', NULL, true, '[]', 3, 'Creative Direction', 'Messaging', 2),
  (tmpl_id, 'offer_details', 'Offer/Promotion Details', 'textarea', 'e.g. 20% off, Free shipping, Limited time', 'Include any legal disclaimers or T&C requirements', false, '[]', 3, 'Creative Direction', 'Messaging', 3),
  (tmpl_id, 'brand_guidelines', 'Brand Guidelines / Assets', 'files', NULL, 'Upload logos, brand guide PDFs, fonts, color specs', false, '[]', 3, 'Creative Direction', 'Assets', 4),
  (tmpl_id, 'reference_banners', 'Reference / Inspiration', 'richtext', 'Links to banners you like, style references, mood boards...', NULL, false, '[]', 3, 'Creative Direction', 'Assets', 5),
  (tmpl_id, 'colour_palette', 'Colour Requirements', 'textarea', 'Specify hex codes, brand colours, or colour preferences', NULL, false, '[]', 3, 'Creative Direction', 'Assets', 6),

  -- Step 4: Timeline & Versions
  (tmpl_id, 'due_date', 'Required Delivery Date', 'date', NULL, NULL, true, '[]', 4, 'Timeline & Delivery', 'Timeline', 1),
  (tmpl_id, 'campaign_start', 'Campaign Go-Live Date', 'date', NULL, NULL, false, '[]', 4, 'Timeline & Delivery', 'Timeline', 2),
  (tmpl_id, 'num_versions', 'Number of Creative Versions', 'dropdown', NULL, 'How many different creative concepts?', false,
    '[{"label":"1 version","value":"1"},{"label":"2 versions (A/B test)","value":"2"},{"label":"3 versions","value":"3"},{"label":"4+ versions","value":"4_plus"}]',
    4, 'Timeline & Delivery', 'Versions', 3),
  (tmpl_id, 'language_versions', 'Language Versions Required', 'checkboxgroup', NULL, NULL, false,
    '[{"label":"English","value":"en"},{"label":"Spanish","value":"es"},{"label":"French","value":"fr"},{"label":"German","value":"de"},{"label":"Chinese","value":"zh"},{"label":"Other","value":"other"}]',
    4, 'Timeline & Delivery', 'Versions', 4),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', 'Anything else we should know?', NULL, false, '[]', 4, 'Timeline & Delivery', 'Other', 5)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Billboard / OOH Campaign
-- Category: Print & OOH
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'print-ooh'),
  'Billboard / OOH Campaign',
  'billboard-ooh',
  'Outdoor advertising — billboards, bus shelters, street furniture, digital screens, and transit wraps',
  'i-lucide-monitor',
  true, true, 'high', true, 1
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'billboard-ooh';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  -- Step 1: Overview
  (tmpl_id, 'project_name', 'Campaign Name', 'text', 'e.g. Summer Highway Billboard Campaign', NULL, true, '[]', 1, 'Campaign Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Campaign Overview', 'Basic Information', 2),
  (tmpl_id, 'campaign_objective', 'Campaign Objective', 'dropdown', NULL, NULL, true,
    '[{"label":"Brand Awareness","value":"awareness"},{"label":"Store/Location Promotion","value":"store_promo"},{"label":"Product Launch","value":"product_launch"},{"label":"Event Promotion","value":"event"},{"label":"Directional/Wayfinding","value":"directional"},{"label":"Seasonal Campaign","value":"seasonal"}]',
    1, 'Campaign Overview', 'Basic Information', 3),
  (tmpl_id, 'background', 'Campaign Context', 'richtext', 'What is this campaign about? Who is the target audience?', NULL, true, '[]', 1, 'Campaign Overview', 'Context', 4),
  (tmpl_id, 'target_locations', 'Target Locations / Markets', 'textarea', 'e.g. Sydney CBD, Melbourne freeway corridors, Brisbane airport precinct', 'Where should these appear?', true, '[]', 1, 'Campaign Overview', 'Context', 5),

  -- Step 2: Format & Specs
  (tmpl_id, 'ooh_format', 'OOH Format', 'checkboxgroup', NULL, 'Select all formats needed', true,
    '[{"label":"Standard Billboard (14x48ft / 4x12m)","value":"billboard_standard"},{"label":"Digital Billboard","value":"billboard_digital"},{"label":"Supersite / Spectacular","value":"supersite"},{"label":"Bus Shelter / Street Furniture","value":"bus_shelter"},{"label":"Transit (Bus/Tram Wrap)","value":"transit_wrap"},{"label":"Airport / Station Panels","value":"airport"},{"label":"Poster (6-sheet / 48-sheet)","value":"poster"},{"label":"Hoarding / Construction Wrap","value":"hoarding"},{"label":"Point of Sale / Retail","value":"pos"},{"label":"Custom / Other","value":"custom"}]',
    2, 'Format & Specifications', 'Format', 1),
  (tmpl_id, 'print_specs', 'Print Specifications', 'textarea', 'Exact dimensions, bleed requirements, resolution, file format', 'Contact vendor for exact specs if unsure', false, '[]', 2, 'Format & Specifications', 'Technical', 2),
  (tmpl_id, 'is_illuminated', 'Illumination', 'dropdown', NULL, NULL, false,
    '[{"label":"Standard (no illumination)","value":"none"},{"label":"Front-lit","value":"front_lit"},{"label":"Back-lit","value":"back_lit"},{"label":"Digital/LED","value":"digital"},{"label":"Unknown","value":"unknown"}]',
    2, 'Format & Specifications', 'Technical', 3),
  (tmpl_id, 'digital_specs', 'Digital Billboard Specs', 'textarea', 'Resolution, aspect ratio, animation limits, file format for digital boards', 'Typically 8-10 second slots, static or simple motion', false, '[]', 2, 'Format & Specifications', 'Technical', 4),
  (tmpl_id, 'vendor_name', 'OOH Vendor / Media Owner', 'text', 'e.g. JCDecaux, oOh!media, QMS', NULL, false, '[]', 2, 'Format & Specifications', 'Vendor', 5),
  (tmpl_id, 'vendor_specs_file', 'Vendor Spec Sheet', 'files', NULL, 'Upload spec sheets from the media owner', false, '[]', 2, 'Format & Specifications', 'Vendor', 6),

  -- Step 3: Creative Direction
  (tmpl_id, 'key_message', 'Key Message / Headline', 'textarea', 'Keep it to 7 words or fewer for readability at speed', 'Billboards need to communicate in under 3 seconds', true, '[]', 3, 'Creative Direction', 'Messaging', 1),
  (tmpl_id, 'supporting_text', 'Supporting Text', 'text', 'e.g. website URL, phone number, hashtag', 'Keep minimal — drivers have limited reading time', false, '[]', 3, 'Creative Direction', 'Messaging', 2),
  (tmpl_id, 'key_visual', 'Key Visual / Hero Image', 'textarea', 'Describe the primary visual — product shot, lifestyle, illustration?', NULL, true, '[]', 3, 'Creative Direction', 'Visual', 3),
  (tmpl_id, 'brand_guidelines', 'Brand Assets & Guidelines', 'files', NULL, 'Logos (vector), brand guide, approved imagery', false, '[]', 3, 'Creative Direction', 'Assets', 4),
  (tmpl_id, 'reference_materials', 'Reference / Inspiration', 'richtext', 'Links or images of OOH campaigns you admire', NULL, false, '[]', 3, 'Creative Direction', 'Assets', 5),

  -- Step 4: Timeline & Budget
  (tmpl_id, 'artwork_deadline', 'Artwork Deadline', 'date', NULL, 'When must final files be delivered to vendor?', true, '[]', 4, 'Timeline & Budget', 'Timeline', 1),
  (tmpl_id, 'campaign_dates', 'Campaign Display Dates', 'daterange', NULL, 'When will the OOH be live?', true, '[]', 4, 'Timeline & Budget', 'Timeline', 2),
  (tmpl_id, 'num_versions', 'Number of Creative Versions', 'dropdown', NULL, NULL, false,
    '[{"label":"1 version","value":"1"},{"label":"2 versions","value":"2"},{"label":"3+ versions","value":"3_plus"}]',
    4, 'Timeline & Budget', 'Versions', 3),
  (tmpl_id, 'production_budget', 'Production Budget', 'dropdown', NULL, 'Design and print production cost', false,
    '[{"label":"Under $2,000","value":"under_2k"},{"label":"$2,000 - $5,000","value":"2k_5k"},{"label":"$5,000 - $15,000","value":"5k_15k"},{"label":"$15,000+","value":"15k_plus"},{"label":"TBD","value":"tbd"}]',
    4, 'Timeline & Budget', 'Budget', 4),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', 'Legal disclaimers, council restrictions, compliance needs...', NULL, false, '[]', 4, 'Timeline & Budget', 'Other', 5)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Print Collateral
-- Category: Print & OOH
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'print-ooh'),
  'Print Collateral',
  'print-collateral',
  'Brochures, flyers, posters, business cards, stationery, and all printed materials',
  'i-lucide-printer',
  true, true, 'medium', true, 2
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'print-collateral';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Project Name', 'text', 'e.g. Product Brochure Redesign', NULL, true, '[]', 1, 'Project Details', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Project Details', 'Basic Information', 2),
  (tmpl_id, 'collateral_type', 'Collateral Type', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Brochure","value":"brochure"},{"label":"Flyer / Leaflet","value":"flyer"},{"label":"Poster","value":"poster"},{"label":"Business Cards","value":"business_cards"},{"label":"Letterhead / Stationery","value":"stationery"},{"label":"Booklet / Catalogue","value":"booklet"},{"label":"Packaging","value":"packaging"},{"label":"Pull-up Banner","value":"pullup_banner"},{"label":"Menu","value":"menu"},{"label":"Other","value":"other"}]',
    1, 'Project Details', 'Type', 3),
  (tmpl_id, 'dimensions', 'Size / Dimensions', 'text', 'e.g. A4, DL, 210x297mm, 6x4 inches', NULL, true, '[]', 1, 'Project Details', 'Specs', 4),
  (tmpl_id, 'page_count', 'Number of Pages / Sides', 'text', 'e.g. 4-page, 2-sided, 16-page booklet', NULL, false, '[]', 1, 'Project Details', 'Specs', 5),
  (tmpl_id, 'finish', 'Print Finish', 'checkboxgroup', NULL, NULL, false,
    '[{"label":"Matt","value":"matt"},{"label":"Gloss","value":"gloss"},{"label":"Satin","value":"satin"},{"label":"Uncoated","value":"uncoated"},{"label":"Spot UV","value":"spot_uv"},{"label":"Foil Stamping","value":"foil"},{"label":"Embossing","value":"emboss"},{"label":"Die Cut","value":"die_cut"}]',
    1, 'Project Details', 'Specs', 6),
  (tmpl_id, 'quantity', 'Print Quantity', 'text', 'How many copies?', NULL, false, '[]', 1, 'Project Details', 'Specs', 7),

  -- Step 2: Content
  (tmpl_id, 'copy_status', 'Copy / Content Status', 'dropdown', NULL, NULL, true,
    '[{"label":"Copy to be supplied by us","value":"client_supply"},{"label":"Need agency to write copy","value":"agency_write"},{"label":"Existing copy to be updated","value":"update_existing"},{"label":"Partially supplied, need help","value":"partial"}]',
    2, 'Content & Creative', 'Content', 1),
  (tmpl_id, 'copy_text', 'Content / Copy', 'richtext', 'Paste or describe the content to be included', NULL, false, '[]', 2, 'Content & Creative', 'Content', 2),
  (tmpl_id, 'key_message', 'Key Message', 'textarea', 'What is the main takeaway for the reader?', NULL, true, '[]', 2, 'Content & Creative', 'Messaging', 3),
  (tmpl_id, 'brand_guidelines', 'Brand Assets', 'files', NULL, 'Logos, brand guide, fonts, images', false, '[]', 2, 'Content & Creative', 'Assets', 4),
  (tmpl_id, 'reference_materials', 'Reference / Inspiration', 'richtext', 'Examples of designs you like', NULL, false, '[]', 2, 'Content & Creative', 'Assets', 5),

  -- Step 3: Delivery
  (tmpl_id, 'due_date', 'Design Proof Due Date', 'date', NULL, NULL, true, '[]', 3, 'Timeline & Delivery', 'Timeline', 1),
  (tmpl_id, 'print_date', 'Print-Ready Deadline', 'date', NULL, 'When must files go to printer?', false, '[]', 3, 'Timeline & Delivery', 'Timeline', 2),
  (tmpl_id, 'budget_range', 'Design Budget', 'dropdown', NULL, NULL, false,
    '[{"label":"Under $1,000","value":"under_1k"},{"label":"$1,000 - $3,000","value":"1k_3k"},{"label":"$3,000 - $8,000","value":"3k_8k"},{"label":"$8,000+","value":"8k_plus"},{"label":"TBD","value":"tbd"}]',
    3, 'Timeline & Delivery', 'Budget', 3),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', NULL, NULL, false, '[]', 3, 'Timeline & Delivery', 'Other', 4)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: TV Commercial
-- Category: Broadcast & Audio
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'broadcast-audio'),
  'TV Commercial',
  'tv-commercial',
  'Television advertising — TVC production from concept through to broadcast-ready delivery',
  'i-lucide-tv',
  true, true, 'high', true, 1
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'tv-commercial';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  -- Step 1: Overview
  (tmpl_id, 'project_name', 'Campaign / TVC Name', 'text', 'e.g. Brand X Summer TVC 2025', NULL, true, '[]', 1, 'Campaign Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Campaign Overview', 'Basic Information', 2),
  (tmpl_id, 'tvc_type', 'TVC Type', 'dropdown', NULL, NULL, true,
    '[{"label":"Brand/Image","value":"brand"},{"label":"Product/Retail","value":"product"},{"label":"Direct Response","value":"direct_response"},{"label":"Testimonial","value":"testimonial"},{"label":"Animation/Motion Graphics","value":"animation"},{"label":"Docu-style","value":"docu"},{"label":"Comedy/Entertainment","value":"comedy"}]',
    1, 'Campaign Overview', 'Basic Information', 3),
  (tmpl_id, 'tvc_duration', 'TVC Duration', 'checkboxgroup', NULL, 'Select all versions needed', true,
    '[{"label":"15 seconds","value":"15s"},{"label":"30 seconds","value":"30s"},{"label":"45 seconds","value":"45s"},{"label":"60 seconds","value":"60s"},{"label":"90 seconds","value":"90s"},{"label":"Long-form (2min+)","value":"long_form"}]',
    1, 'Campaign Overview', 'Duration', 4),
  (tmpl_id, 'broadcast_networks', 'Target Networks / Channels', 'textarea', 'e.g. Free-to-air (Ch7, Ch9, Ch10), Foxtel, BVOD (7Plus, 9Now)', NULL, false, '[]', 1, 'Campaign Overview', 'Distribution', 5),
  (tmpl_id, 'online_cutdowns', 'Online Cutdowns Required?', 'checkboxgroup', NULL, 'Shorter versions for digital', false,
    '[{"label":"6s bumper (YouTube)","value":"6s"},{"label":"15s pre-roll","value":"15s_preroll"},{"label":"Social edits (9:16, 1:1)","value":"social_edits"},{"label":"No online cutdowns","value":"none"}]',
    1, 'Campaign Overview', 'Distribution', 6),

  -- Step 2: Creative
  (tmpl_id, 'campaign_objective', 'Campaign Objective', 'richtext', 'What should viewers think, feel, or do after seeing the ad?', NULL, true, '[]', 2, 'Creative Brief', 'Objective', 1),
  (tmpl_id, 'target_audience', 'Target Audience', 'richtext', 'Demographics, psychographics, viewing habits', NULL, true, '[]', 2, 'Creative Brief', 'Audience', 2),
  (tmpl_id, 'key_message', 'Key Message / Proposition', 'textarea', 'The single most important thing to communicate', NULL, true, '[]', 2, 'Creative Brief', 'Messaging', 3),
  (tmpl_id, 'supporting_messages', 'Supporting Messages', 'richtext', 'Secondary points, RTBs (reasons to believe)', NULL, false, '[]', 2, 'Creative Brief', 'Messaging', 4),
  (tmpl_id, 'tone_mood', 'Tone & Mood', 'multiselect', NULL, NULL, true,
    '[{"label":"Aspirational","value":"aspirational"},{"label":"Humorous","value":"humorous"},{"label":"Emotional","value":"emotional"},{"label":"Energetic","value":"energetic"},{"label":"Sophisticated","value":"sophisticated"},{"label":"Warm/Family","value":"warm"},{"label":"Edgy/Bold","value":"edgy"},{"label":"Informative","value":"informative"},{"label":"Cinematic","value":"cinematic"}]',
    2, 'Creative Brief', 'Tone', 5),
  (tmpl_id, 'mandatory_elements', 'Mandatory Inclusions', 'checkboxgroup', NULL, 'Must appear in the TVC', false,
    '[{"label":"Logo (end frame)","value":"logo"},{"label":"Product shot","value":"product_shot"},{"label":"Phone number","value":"phone"},{"label":"Website URL","value":"url"},{"label":"Legal disclaimer","value":"disclaimer"},{"label":"Offer/Price","value":"offer"},{"label":"Tagline","value":"tagline"}]',
    2, 'Creative Brief', 'Requirements', 6),
  (tmpl_id, 'reference_tvcs', 'Reference TVCs / Inspiration', 'richtext', 'Links to TVCs you like or want to emulate', NULL, false, '[]', 2, 'Creative Brief', 'References', 7),

  -- Step 3: Production
  (tmpl_id, 'production_approach', 'Production Approach', 'dropdown', NULL, NULL, true,
    '[{"label":"Full live-action shoot","value":"live_action"},{"label":"Animation / Motion Graphics","value":"animation"},{"label":"Stock footage + voiceover","value":"stock"},{"label":"Mixed (live + animation)","value":"mixed"},{"label":"User-generated content edit","value":"ugc"},{"label":"Existing footage re-edit","value":"re_edit"}]',
    3, 'Production Details', 'Approach', 1),
  (tmpl_id, 'talent_requirements', 'Talent / Casting', 'textarea', 'On-screen talent, voiceover artist, extras', NULL, false, '[]', 3, 'Production Details', 'Talent', 2),
  (tmpl_id, 'music_audio', 'Music / Audio', 'dropdown', NULL, NULL, false,
    '[{"label":"Licensed track needed","value":"licensed"},{"label":"Original composition","value":"original"},{"label":"Stock music","value":"stock"},{"label":"Existing track/jingle","value":"existing"},{"label":"No music (VO only)","value":"none"}]',
    3, 'Production Details', 'Audio', 3),
  (tmpl_id, 'locations', 'Shoot Locations', 'textarea', 'Studio, on-location (where?), or both?', NULL, false, '[]', 3, 'Production Details', 'Logistics', 4),
  (tmpl_id, 'existing_assets', 'Existing Assets Available', 'files', NULL, 'Previous footage, logos, product images, brand guides', false, '[]', 3, 'Production Details', 'Assets', 5),

  -- Step 4: Timeline & Budget
  (tmpl_id, 'concept_deadline', 'Concept Presentation Date', 'date', NULL, 'When do you need to see creative concepts?', true, '[]', 4, 'Timeline & Budget', 'Key Dates', 1),
  (tmpl_id, 'final_delivery', 'Final Delivery Date', 'date', NULL, 'Broadcast-ready master delivery', true, '[]', 4, 'Timeline & Budget', 'Key Dates', 2),
  (tmpl_id, 'air_date', 'On-Air Date', 'date', NULL, 'First scheduled broadcast', false, '[]', 4, 'Timeline & Budget', 'Key Dates', 3),
  (tmpl_id, 'production_budget', 'Production Budget', 'dropdown', NULL, NULL, true,
    '[{"label":"Under $20,000","value":"under_20k"},{"label":"$20,000 - $50,000","value":"20k_50k"},{"label":"$50,000 - $150,000","value":"50k_150k"},{"label":"$150,000 - $500,000","value":"150k_500k"},{"label":"$500,000+","value":"500k_plus"},{"label":"TBD","value":"tbd"}]',
    4, 'Timeline & Budget', 'Budget', 4),
  (tmpl_id, 'budget_includes', 'Budget Should Cover', 'checkboxgroup', NULL, NULL, false,
    '[{"label":"Creative concept & scripting","value":"creative"},{"label":"Production / filming","value":"production"},{"label":"Post-production / editing","value":"post"},{"label":"Music licensing","value":"music"},{"label":"Talent fees","value":"talent"},{"label":"Media buying","value":"media"}]',
    4, 'Timeline & Budget', 'Budget', 5),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', 'Compliance requirements, clearance (CAD/ClearAds), territorial rights...', NULL, false, '[]', 4, 'Timeline & Budget', 'Other', 6)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Radio Ad
-- Category: Broadcast & Audio
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'broadcast-audio'),
  'Radio Ad',
  'radio-ad',
  'Radio commercials and audio ads — scripting, voiceover, production, and delivery to stations',
  'i-lucide-mic',
  true, true, 'medium', true, 2
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'radio-ad';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Campaign Name', 'text', 'e.g. Winter Sale Radio Campaign', NULL, true, '[]', 1, 'Campaign Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Campaign Overview', 'Basic Information', 2),
  (tmpl_id, 'ad_duration', 'Ad Duration', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"15 seconds","value":"15s"},{"label":"30 seconds","value":"30s"},{"label":"45 seconds","value":"45s"},{"label":"60 seconds","value":"60s"}]',
    1, 'Campaign Overview', 'Format', 3),
  (tmpl_id, 'num_scripts', 'Number of Scripts', 'dropdown', NULL, NULL, true,
    '[{"label":"1 script","value":"1"},{"label":"2 scripts","value":"2"},{"label":"3 scripts","value":"3"},{"label":"4+ scripts","value":"4_plus"}]',
    1, 'Campaign Overview', 'Format', 4),
  (tmpl_id, 'target_stations', 'Target Radio Stations', 'textarea', 'e.g. KIIS FM, Triple M, 2GB, Spotify Audio Ads', NULL, false, '[]', 1, 'Campaign Overview', 'Distribution', 5),
  (tmpl_id, 'campaign_dates', 'Campaign Dates', 'daterange', NULL, NULL, true, '[]', 1, 'Campaign Overview', 'Timeline', 6),

  -- Step 2: Script & Creative
  (tmpl_id, 'campaign_objective', 'Campaign Objective', 'richtext', 'What should listeners do after hearing the ad?', NULL, true, '[]', 2, 'Script & Creative', 'Objective', 1),
  (tmpl_id, 'target_audience', 'Target Audience', 'textarea', 'Demographics, listening habits', NULL, true, '[]', 2, 'Script & Creative', 'Audience', 2),
  (tmpl_id, 'key_message', 'Key Message', 'textarea', 'The single most important thing to communicate', NULL, true, '[]', 2, 'Script & Creative', 'Messaging', 3),
  (tmpl_id, 'cta', 'Call-to-Action', 'text', 'e.g. Visit website, Call now, Use promo code SUMMER', NULL, true, '[]', 2, 'Script & Creative', 'Messaging', 4),
  (tmpl_id, 'offer_details', 'Offer / Promotion Details', 'textarea', 'Prices, discounts, T&Cs to mention', NULL, false, '[]', 2, 'Script & Creative', 'Messaging', 5),
  (tmpl_id, 'tone_style', 'Tone & Style', 'multiselect', NULL, NULL, true,
    '[{"label":"Conversational","value":"conversational"},{"label":"Humorous","value":"humorous"},{"label":"Urgent/Retail","value":"urgent"},{"label":"Warm/Friendly","value":"warm"},{"label":"Professional","value":"professional"},{"label":"High-energy","value":"high_energy"},{"label":"Story-driven","value":"story"},{"label":"Presenter-read (live read)","value":"live_read"}]',
    2, 'Script & Creative', 'Tone', 6),
  (tmpl_id, 'voiceover_pref', 'Voiceover Preference', 'dropdown', NULL, NULL, false,
    '[{"label":"Male voice","value":"male"},{"label":"Female voice","value":"female"},{"label":"Duo / dialogue","value":"duo"},{"label":"Client spokesperson","value":"spokesperson"},{"label":"Celebrity / known voice","value":"celebrity"},{"label":"No preference","value":"no_pref"}]',
    2, 'Script & Creative', 'Production', 7),
  (tmpl_id, 'music_sfx', 'Music & Sound Effects', 'dropdown', NULL, NULL, false,
    '[{"label":"Licensed music bed","value":"licensed"},{"label":"Stock music","value":"stock"},{"label":"Existing jingle","value":"jingle"},{"label":"Sound effects only","value":"sfx"},{"label":"Voice only (no music)","value":"vo_only"}]',
    2, 'Script & Creative', 'Production', 8),
  (tmpl_id, 'reference_audio', 'Reference Audio / Inspiration', 'richtext', 'Links to radio ads you like or want to emulate', NULL, false, '[]', 2, 'Script & Creative', 'References', 9),

  -- Step 3: Delivery
  (tmpl_id, 'script_deadline', 'Script Approval Deadline', 'date', NULL, NULL, true, '[]', 3, 'Timeline & Delivery', 'Timeline', 1),
  (tmpl_id, 'final_delivery', 'Final Audio Delivery Date', 'date', NULL, 'When must finished audio go to stations?', true, '[]', 3, 'Timeline & Delivery', 'Timeline', 2),
  (tmpl_id, 'delivery_format', 'Delivery Format', 'checkboxgroup', NULL, NULL, false,
    '[{"label":"WAV (broadcast standard)","value":"wav"},{"label":"MP3","value":"mp3"},{"label":"Station upload portal","value":"portal"}]',
    3, 'Timeline & Delivery', 'Format', 3),
  (tmpl_id, 'budget_range', 'Production Budget', 'dropdown', NULL, 'Script, VO, and production', false,
    '[{"label":"Under $2,000","value":"under_2k"},{"label":"$2,000 - $5,000","value":"2k_5k"},{"label":"$5,000 - $15,000","value":"5k_15k"},{"label":"$15,000+","value":"15k_plus"},{"label":"TBD","value":"tbd"}]',
    3, 'Timeline & Delivery', 'Budget', 4),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', 'Legal disclaimers, compliance, sponsor mentions...', NULL, false, '[]', 3, 'Timeline & Delivery', 'Other', 5)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Video Production
-- Category: Broadcast & Audio
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'broadcast-audio'),
  'Video Production',
  'video-production',
  'Corporate videos, product demos, social video content, testimonials, and event videography',
  'i-lucide-video',
  true, true, 'medium', true, 3
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'video-production';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Project Name', 'text', 'e.g. Product Demo Video', NULL, true, '[]', 1, 'Project Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Project Overview', 'Basic Information', 2),
  (tmpl_id, 'video_type', 'Video Type', 'dropdown', NULL, NULL, true,
    '[{"label":"Corporate / Brand","value":"corporate"},{"label":"Product Demo","value":"demo"},{"label":"Testimonial / Case Study","value":"testimonial"},{"label":"Social Media Content","value":"social"},{"label":"Explainer / How-To","value":"explainer"},{"label":"Event Recap","value":"event"},{"label":"Training / Internal","value":"training"},{"label":"Motion Graphics / Animation","value":"motion"}]',
    1, 'Project Overview', 'Basic Information', 3),
  (tmpl_id, 'video_length', 'Target Video Length', 'dropdown', NULL, NULL, true,
    '[{"label":"Under 30 seconds","value":"under_30s"},{"label":"30-60 seconds","value":"30_60s"},{"label":"1-2 minutes","value":"1_2min"},{"label":"2-5 minutes","value":"2_5min"},{"label":"5-10 minutes","value":"5_10min"},{"label":"10+ minutes","value":"10_plus"}]',
    1, 'Project Overview', 'Format', 4),
  (tmpl_id, 'delivery_formats', 'Delivery Formats', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Landscape 16:9","value":"16_9"},{"label":"Square 1:1","value":"1_1"},{"label":"Vertical 9:16","value":"9_16"},{"label":"4:5 (Instagram/FB feed)","value":"4_5"}]',
    1, 'Project Overview', 'Format', 5),
  (tmpl_id, 'platforms', 'Target Platforms', 'checkboxgroup', NULL, NULL, false,
    '[{"label":"Website","value":"website"},{"label":"YouTube","value":"youtube"},{"label":"Instagram","value":"instagram"},{"label":"Facebook","value":"facebook"},{"label":"LinkedIn","value":"linkedin"},{"label":"TikTok","value":"tiktok"},{"label":"Internal / Intranet","value":"internal"},{"label":"Paid Media","value":"paid"}]',
    1, 'Project Overview', 'Distribution', 6),
  (tmpl_id, 'objective', 'Project Objective', 'richtext', 'What should viewers take away from this video?', NULL, true, '[]', 1, 'Project Overview', 'Context', 7),

  -- Step 2: Creative
  (tmpl_id, 'target_audience', 'Target Audience', 'textarea', NULL, NULL, true, '[]', 2, 'Creative Direction', 'Audience', 1),
  (tmpl_id, 'key_messages', 'Key Messages', 'richtext', NULL, NULL, true, '[]', 2, 'Creative Direction', 'Messaging', 2),
  (tmpl_id, 'tone_mood', 'Tone & Mood', 'multiselect', NULL, NULL, true,
    '[{"label":"Professional","value":"professional"},{"label":"Casual/Friendly","value":"casual"},{"label":"Inspirational","value":"inspirational"},{"label":"Humorous","value":"humorous"},{"label":"Emotional","value":"emotional"},{"label":"Corporate","value":"corporate"},{"label":"Cinematic","value":"cinematic"},{"label":"Fast-paced","value":"fast_paced"}]',
    2, 'Creative Direction', 'Tone', 3),
  (tmpl_id, 'script_status', 'Script / Storyboard Status', 'dropdown', NULL, NULL, true,
    '[{"label":"Need full script written","value":"need_script"},{"label":"Have draft script","value":"draft"},{"label":"Have approved script","value":"approved"},{"label":"No script — interview/documentary style","value":"no_script"}]',
    2, 'Creative Direction', 'Script', 4),
  (tmpl_id, 'reference_videos', 'Reference Videos', 'richtext', 'Links to videos you like', NULL, false, '[]', 2, 'Creative Direction', 'References', 5),
  (tmpl_id, 'brand_assets', 'Brand Assets', 'files', NULL, 'Logos, brand guide, existing footage, images', false, '[]', 2, 'Creative Direction', 'Assets', 6),

  -- Step 3: Timeline & Budget
  (tmpl_id, 'due_date', 'Final Delivery Date', 'date', NULL, NULL, true, '[]', 3, 'Timeline & Budget', 'Timeline', 1),
  (tmpl_id, 'shoot_dates', 'Preferred Shoot Dates', 'textarea', 'Any date constraints or preferences?', NULL, false, '[]', 3, 'Timeline & Budget', 'Timeline', 2),
  (tmpl_id, 'budget_range', 'Budget', 'dropdown', NULL, NULL, true,
    '[{"label":"Under $5,000","value":"under_5k"},{"label":"$5,000 - $15,000","value":"5k_15k"},{"label":"$15,000 - $50,000","value":"15k_50k"},{"label":"$50,000 - $100,000","value":"50k_100k"},{"label":"$100,000+","value":"100k_plus"},{"label":"TBD","value":"tbd"}]',
    3, 'Timeline & Budget', 'Budget', 3),
  (tmpl_id, 'subtitles', 'Subtitles / Captions', 'dropdown', NULL, NULL, false,
    '[{"label":"Yes — burned-in captions","value":"burned_in"},{"label":"Yes — SRT/VTT file","value":"srt"},{"label":"No subtitles needed","value":"none"}]',
    3, 'Timeline & Budget', 'Delivery', 4),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', NULL, NULL, false, '[]', 3, 'Timeline & Budget', 'Other', 5)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Social Media Content
-- Category: Social Media
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'social-media'),
  'Social Media Content',
  'social-content',
  'Organic social posts, stories, reels, and content calendars for any platform',
  'i-lucide-message-circle',
  true, true, 'medium', true, 1
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'social-content';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Content Brief Title', 'text', 'e.g. March Content Calendar', NULL, true, '[]', 1, 'Content Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Content Overview', 'Basic Information', 2),
  (tmpl_id, 'content_type', 'Content Type', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Feed Posts (static)","value":"feed_static"},{"label":"Carousel Posts","value":"carousel"},{"label":"Reels / Short Video","value":"reels"},{"label":"Stories","value":"stories"},{"label":"Long-form Video","value":"long_video"},{"label":"Content Calendar","value":"calendar"},{"label":"Community Management","value":"community"}]',
    1, 'Content Overview', 'Type', 3),
  (tmpl_id, 'platforms', 'Platforms', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Instagram","value":"instagram"},{"label":"Facebook","value":"facebook"},{"label":"LinkedIn","value":"linkedin"},{"label":"TikTok","value":"tiktok"},{"label":"X (Twitter)","value":"twitter"},{"label":"YouTube","value":"youtube"},{"label":"Pinterest","value":"pinterest"},{"label":"Threads","value":"threads"}]',
    1, 'Content Overview', 'Platforms', 4),
  (tmpl_id, 'post_frequency', 'Posting Frequency', 'dropdown', NULL, NULL, false,
    '[{"label":"Daily","value":"daily"},{"label":"3-5x per week","value":"3_5_week"},{"label":"2-3x per week","value":"2_3_week"},{"label":"Weekly","value":"weekly"},{"label":"Ad-hoc / one-off","value":"adhoc"}]',
    1, 'Content Overview', 'Schedule', 5),
  (tmpl_id, 'content_period', 'Content Period', 'daterange', NULL, 'What dates does this content cover?', false, '[]', 1, 'Content Overview', 'Schedule', 6),

  -- Step 2: Creative
  (tmpl_id, 'content_goals', 'Content Goals', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Brand Awareness","value":"awareness"},{"label":"Engagement","value":"engagement"},{"label":"Traffic to Website","value":"traffic"},{"label":"Lead Generation","value":"leads"},{"label":"Sales / Conversions","value":"sales"},{"label":"Community Building","value":"community"},{"label":"Thought Leadership","value":"thought_leadership"}]',
    2, 'Creative Direction', 'Goals', 1),
  (tmpl_id, 'target_audience', 'Target Audience', 'textarea', NULL, NULL, true, '[]', 2, 'Creative Direction', 'Audience', 2),
  (tmpl_id, 'content_pillars', 'Content Pillars / Themes', 'richtext', 'e.g. Educational, Behind-the-scenes, Product features, User stories', 'What topics should content cover?', false, '[]', 2, 'Creative Direction', 'Themes', 3),
  (tmpl_id, 'tone_of_voice', 'Tone of Voice', 'multiselect', NULL, NULL, true,
    '[{"label":"Professional","value":"professional"},{"label":"Playful","value":"playful"},{"label":"Educational","value":"educational"},{"label":"Inspirational","value":"inspirational"},{"label":"Casual","value":"casual"},{"label":"Bold","value":"bold"},{"label":"Witty","value":"witty"}]',
    2, 'Creative Direction', 'Tone', 4),
  (tmpl_id, 'brand_assets', 'Brand Assets / Guidelines', 'files', NULL, NULL, false, '[]', 2, 'Creative Direction', 'Assets', 5),
  (tmpl_id, 'hashtag_strategy', 'Hashtag Strategy', 'textarea', 'Branded hashtags, industry hashtags to use', NULL, false, '[]', 2, 'Creative Direction', 'Strategy', 6),
  (tmpl_id, 'reference_accounts', 'Reference Accounts / Inspiration', 'richtext', 'Social accounts you admire', NULL, false, '[]', 2, 'Creative Direction', 'References', 7),

  -- Step 3: Delivery
  (tmpl_id, 'content_needs', 'What Do You Need From Us?', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Copywriting","value":"copy"},{"label":"Graphic Design","value":"design"},{"label":"Photography","value":"photography"},{"label":"Video Editing","value":"video"},{"label":"Content Calendar","value":"calendar"},{"label":"Scheduling & Publishing","value":"scheduling"},{"label":"Reporting","value":"reporting"}]',
    3, 'Delivery', 'Scope', 1),
  (tmpl_id, 'due_date', 'Content Due Date', 'date', NULL, NULL, true, '[]', 3, 'Delivery', 'Timeline', 2),
  (tmpl_id, 'budget_range', 'Monthly Budget', 'dropdown', NULL, NULL, false,
    '[{"label":"Under $2,000/month","value":"under_2k"},{"label":"$2,000 - $5,000/month","value":"2k_5k"},{"label":"$5,000 - $10,000/month","value":"5k_10k"},{"label":"$10,000+/month","value":"10k_plus"},{"label":"TBD","value":"tbd"}]',
    3, 'Delivery', 'Budget', 3),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', NULL, NULL, false, '[]', 3, 'Delivery', 'Other', 4)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Influencer Campaign
-- Category: Social Media
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'social-media'),
  'Influencer Campaign',
  'influencer-campaign',
  'Influencer partnerships, collaborations, gifting, and sponsored content campaigns',
  'i-lucide-users',
  true, true, 'medium', true, 2
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'influencer-campaign';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Campaign Name', 'text', NULL, NULL, true, '[]', 1, 'Campaign Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Campaign Overview', 'Basic Information', 2),
  (tmpl_id, 'campaign_objective', 'Campaign Objective', 'dropdown', NULL, NULL, true,
    '[{"label":"Brand Awareness","value":"awareness"},{"label":"Product Launch","value":"launch"},{"label":"Sales/Conversions","value":"sales"},{"label":"Content Creation","value":"content"},{"label":"Event Promotion","value":"event"},{"label":"App Downloads","value":"app"}]',
    1, 'Campaign Overview', 'Objective', 3),
  (tmpl_id, 'target_audience', 'Target Audience', 'richtext', NULL, NULL, true, '[]', 1, 'Campaign Overview', 'Audience', 4),
  (tmpl_id, 'campaign_dates', 'Campaign Dates', 'daterange', NULL, NULL, true, '[]', 1, 'Campaign Overview', 'Timeline', 5),
  (tmpl_id, 'platforms', 'Target Platforms', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Instagram","value":"instagram"},{"label":"TikTok","value":"tiktok"},{"label":"YouTube","value":"youtube"},{"label":"Facebook","value":"facebook"},{"label":"Twitter/X","value":"twitter"},{"label":"Blog","value":"blog"},{"label":"Podcast","value":"podcast"}]',
    1, 'Campaign Overview', 'Platforms', 6),

  -- Step 2: Influencer Requirements
  (tmpl_id, 'influencer_tier', 'Influencer Tier', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Nano (1K-10K followers)","value":"nano"},{"label":"Micro (10K-50K followers)","value":"micro"},{"label":"Mid-tier (50K-500K)","value":"mid"},{"label":"Macro (500K-1M)","value":"macro"},{"label":"Mega (1M+)","value":"mega"}]',
    2, 'Influencer Requirements', 'Size', 1),
  (tmpl_id, 'num_influencers', 'Number of Influencers', 'dropdown', NULL, NULL, true,
    '[{"label":"1-3","value":"1_3"},{"label":"5-10","value":"5_10"},{"label":"10-20","value":"10_20"},{"label":"20+","value":"20_plus"}]',
    2, 'Influencer Requirements', 'Size', 2),
  (tmpl_id, 'content_deliverables', 'Content Deliverables Per Influencer', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Feed Post","value":"feed"},{"label":"Story Set (3-5 frames)","value":"stories"},{"label":"Reel/TikTok","value":"reel"},{"label":"YouTube Video","value":"youtube"},{"label":"Blog Post","value":"blog"},{"label":"Unboxing","value":"unboxing"},{"label":"Review","value":"review"},{"label":"Giveaway","value":"giveaway"}]',
    2, 'Influencer Requirements', 'Deliverables', 3),
  (tmpl_id, 'key_messages', 'Key Messages / Talking Points', 'richtext', NULL, 'What should influencers communicate?', true, '[]', 2, 'Influencer Requirements', 'Messaging', 4),
  (tmpl_id, 'product_info', 'Product / Service Details', 'richtext', 'What is being promoted? Include key features.', NULL, true, '[]', 2, 'Influencer Requirements', 'Product', 5),
  (tmpl_id, 'exclusions', 'Content Restrictions', 'textarea', 'Anything influencers must NOT do or say', NULL, false, '[]', 2, 'Influencer Requirements', 'Restrictions', 6),

  -- Step 3: Budget & Delivery
  (tmpl_id, 'total_budget', 'Total Campaign Budget', 'dropdown', NULL, 'Including influencer fees, gifting, and management', true,
    '[{"label":"Under $5,000","value":"under_5k"},{"label":"$5,000 - $15,000","value":"5k_15k"},{"label":"$15,000 - $50,000","value":"15k_50k"},{"label":"$50,000 - $100,000","value":"50k_100k"},{"label":"$100,000+","value":"100k_plus"},{"label":"TBD","value":"tbd"}]',
    3, 'Budget & Logistics', 'Budget', 1),
  (tmpl_id, 'compensation_type', 'Compensation Model', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Paid fee","value":"paid"},{"label":"Product gifting","value":"gifting"},{"label":"Commission/affiliate","value":"commission"},{"label":"Contra/exchange","value":"contra"}]',
    3, 'Budget & Logistics', 'Budget', 2),
  (tmpl_id, 'usage_rights', 'Content Usage Rights', 'dropdown', NULL, NULL, false,
    '[{"label":"Organic repost only","value":"organic"},{"label":"Paid amplification (30 days)","value":"paid_30"},{"label":"Full usage rights (12 months)","value":"full_12m"},{"label":"Perpetual usage","value":"perpetual"}]',
    3, 'Budget & Logistics', 'Rights', 3),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', 'Known influencers in mind, special requirements...', NULL, false, '[]', 3, 'Budget & Logistics', 'Other', 4)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Logo & Brand Identity
-- Category: Creative & Design
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'creative-design'),
  'Logo & Brand Identity',
  'brand-identity',
  'Logo design, brand identity systems, style guides, and visual language creation',
  'i-lucide-figma',
  true, true, 'medium', true, 1
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'brand-identity';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Project Name', 'text', NULL, NULL, true, '[]', 1, 'Project Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Project Overview', 'Basic Information', 2),
  (tmpl_id, 'project_type', 'Project Type', 'dropdown', NULL, NULL, true,
    '[{"label":"New Logo Design","value":"new_logo"},{"label":"Logo Refresh/Update","value":"logo_refresh"},{"label":"Full Brand Identity","value":"full_identity"},{"label":"Brand Extension","value":"extension"},{"label":"Sub-brand","value":"sub_brand"}]',
    1, 'Project Overview', 'Type', 3),
  (tmpl_id, 'business_description', 'About the Business', 'richtext', 'What does the business do? Industry, products, services.', NULL, true, '[]', 1, 'Project Overview', 'Context', 4),
  (tmpl_id, 'target_audience', 'Target Audience', 'richtext', NULL, NULL, true, '[]', 1, 'Project Overview', 'Context', 5),
  (tmpl_id, 'competitors', 'Key Competitors', 'textarea', 'Who are the main competitors? Links to their branding.', NULL, false, '[]', 1, 'Project Overview', 'Context', 6),

  -- Step 2: Creative Direction
  (tmpl_id, 'brand_values', 'Brand Values / Personality', 'multiselect', NULL, NULL, true,
    '[{"label":"Modern","value":"modern"},{"label":"Traditional","value":"traditional"},{"label":"Luxury","value":"luxury"},{"label":"Affordable","value":"affordable"},{"label":"Playful","value":"playful"},{"label":"Serious","value":"serious"},{"label":"Innovative","value":"innovative"},{"label":"Trustworthy","value":"trustworthy"},{"label":"Bold","value":"bold"},{"label":"Minimal","value":"minimal"}]',
    2, 'Creative Direction', 'Personality', 1),
  (tmpl_id, 'colour_preferences', 'Colour Preferences', 'textarea', 'Any colours you love or hate? Industry conventions?', NULL, false, '[]', 2, 'Creative Direction', 'Visual', 2),
  (tmpl_id, 'style_direction', 'Style Direction', 'checkboxgroup', NULL, NULL, false,
    '[{"label":"Wordmark (text-based)","value":"wordmark"},{"label":"Icon/Symbol","value":"icon"},{"label":"Combination Mark","value":"combo"},{"label":"Emblem","value":"emblem"},{"label":"Abstract","value":"abstract"},{"label":"Mascot","value":"mascot"},{"label":"No preference","value":"no_pref"}]',
    2, 'Creative Direction', 'Visual', 3),
  (tmpl_id, 'inspiration', 'Brands You Admire', 'richtext', 'Links or names of brands whose visual identity you like', NULL, false, '[]', 2, 'Creative Direction', 'References', 4),
  (tmpl_id, 'existing_assets', 'Existing Brand Assets', 'files', NULL, 'Current logo, brand guide, fonts, colours', false, '[]', 2, 'Creative Direction', 'Assets', 5),

  -- Step 3: Deliverables
  (tmpl_id, 'deliverables', 'Required Deliverables', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Primary Logo","value":"primary_logo"},{"label":"Logo Variations (horizontal, stacked, icon)","value":"logo_variations"},{"label":"Colour Palette","value":"colours"},{"label":"Typography System","value":"typography"},{"label":"Brand Guidelines PDF","value":"guidelines"},{"label":"Business Card Design","value":"business_card"},{"label":"Letterhead & Stationery","value":"stationery"},{"label":"Social Media Templates","value":"social_templates"},{"label":"Email Signature","value":"email_sig"},{"label":"Favicon & App Icon","value":"favicon"}]',
    3, 'Deliverables & Timeline', 'Deliverables', 1),
  (tmpl_id, 'num_concepts', 'Number of Initial Concepts', 'dropdown', NULL, NULL, false,
    '[{"label":"2 concepts","value":"2"},{"label":"3 concepts","value":"3"},{"label":"5 concepts","value":"5"}]',
    3, 'Deliverables & Timeline', 'Concepts', 2),
  (tmpl_id, 'due_date', 'Concept Presentation Date', 'date', NULL, NULL, true, '[]', 3, 'Deliverables & Timeline', 'Timeline', 3),
  (tmpl_id, 'budget_range', 'Budget', 'dropdown', NULL, NULL, true,
    '[{"label":"Under $3,000","value":"under_3k"},{"label":"$3,000 - $8,000","value":"3k_8k"},{"label":"$8,000 - $20,000","value":"8k_20k"},{"label":"$20,000+","value":"20k_plus"},{"label":"TBD","value":"tbd"}]',
    3, 'Deliverables & Timeline', 'Budget', 4),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', NULL, NULL, false, '[]', 3, 'Deliverables & Timeline', 'Other', 5)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Graphic Design Request
-- Category: Creative & Design
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'creative-design'),
  'Graphic Design Request',
  'graphic-design',
  'General design requests — social graphics, presentations, infographics, illustrations, and ad hoc creative',
  'i-lucide-brush',
  false, false, 'medium', true, 2
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'graphic-design';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Request Title', 'text', 'e.g. Instagram Post — March Promo', NULL, true, '[]', 1, 'Design Request', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Design Request', 'Basic Information', 2),
  (tmpl_id, 'design_type', 'Design Type', 'dropdown', NULL, NULL, true,
    '[{"label":"Social Media Graphic","value":"social"},{"label":"Presentation / Pitch Deck","value":"presentation"},{"label":"Infographic","value":"infographic"},{"label":"Email Header / Banner","value":"email"},{"label":"Web Banner / Hero","value":"web_banner"},{"label":"Icon Set","value":"icons"},{"label":"Illustration","value":"illustration"},{"label":"Report / Document Layout","value":"report"},{"label":"Other","value":"other"}]',
    1, 'Design Request', 'Type', 3),
  (tmpl_id, 'dimensions', 'Size / Dimensions', 'text', 'e.g. 1080x1080, A4, 1920x1080', NULL, true, '[]', 1, 'Design Request', 'Specs', 4),
  (tmpl_id, 'description', 'Description & Requirements', 'richtext', 'Describe what you need designed, key content to include, and any specific requirements', NULL, true, '[]', 1, 'Design Request', 'Content', 5),
  (tmpl_id, 'copy_text', 'Copy / Text Content', 'richtext', 'Exact text to appear in the design', NULL, false, '[]', 1, 'Design Request', 'Content', 6),
  (tmpl_id, 'brand_assets', 'Brand Assets / Reference', 'files', NULL, 'Logos, images, brand guide, references', false, '[]', 1, 'Design Request', 'Assets', 7),
  (tmpl_id, 'due_date', 'Due Date', 'date', NULL, NULL, true, '[]', 1, 'Design Request', 'Timeline', 8),
  (tmpl_id, 'priority', 'Priority', 'dropdown', NULL, NULL, true,
    '[{"label":"Low — no rush","value":"low"},{"label":"Medium — within a week","value":"medium"},{"label":"High — within 2 days","value":"high"},{"label":"Urgent — ASAP","value":"urgent"}]',
    1, 'Design Request', 'Timeline', 9),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', NULL, NULL, false, '[]', 1, 'Design Request', 'Other', 10)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: SEO Audit & Optimisation
-- Category: Content & SEO
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'content-seo'),
  'SEO Audit & Optimisation',
  'seo-audit',
  'Technical SEO audit, on-page optimisation, keyword research, and SEO strategy',
  'i-lucide-search',
  true, true, 'medium', true, 1
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'seo-audit';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Project Name', 'text', NULL, NULL, true, '[]', 1, 'Project Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Project Overview', 'Basic Information', 2),
  (tmpl_id, 'website_url', 'Website URL', 'url', 'https://', NULL, true, '[]', 1, 'Project Overview', 'Basic Information', 3),
  (tmpl_id, 'seo_scope', 'Scope of Work', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Full Technical SEO Audit","value":"technical_audit"},{"label":"On-Page Optimisation","value":"on_page"},{"label":"Keyword Research","value":"keyword_research"},{"label":"Content Strategy","value":"content_strategy"},{"label":"Local SEO","value":"local_seo"},{"label":"Link Building Strategy","value":"link_building"},{"label":"Competitor Analysis","value":"competitor"},{"label":"Monthly SEO Retainer","value":"retainer"}]',
    1, 'Project Overview', 'Scope', 4),
  (tmpl_id, 'target_keywords', 'Target Keywords (if known)', 'textarea', 'List any keywords you want to rank for', NULL, false, '[]', 1, 'Project Overview', 'Keywords', 5),
  (tmpl_id, 'target_locations', 'Target Geographic Locations', 'textarea', 'e.g. Sydney, Australia-wide, US market', NULL, false, '[]', 1, 'Project Overview', 'Keywords', 6),
  (tmpl_id, 'competitors', 'Key Competitors', 'textarea', 'URLs of competitor websites', NULL, false, '[]', 1, 'Project Overview', 'Competitors', 7),
  (tmpl_id, 'current_tools', 'Current SEO Tools', 'checkboxgroup', NULL, NULL, false,
    '[{"label":"Google Search Console","value":"gsc"},{"label":"Google Analytics","value":"ga"},{"label":"SEMrush","value":"semrush"},{"label":"Ahrefs","value":"ahrefs"},{"label":"Moz","value":"moz"},{"label":"None","value":"none"}]',
    1, 'Project Overview', 'Tools', 8),

  -- Step 2: Goals & Timeline
  (tmpl_id, 'seo_goals', 'SEO Goals', 'richtext', 'What does SEO success look like? More traffic, leads, rankings?', NULL, true, '[]', 2, 'Goals & Timeline', 'Goals', 1),
  (tmpl_id, 'due_date', 'Delivery Date', 'date', NULL, NULL, true, '[]', 2, 'Goals & Timeline', 'Timeline', 2),
  (tmpl_id, 'budget_range', 'Budget', 'dropdown', NULL, NULL, false,
    '[{"label":"Under $3,000","value":"under_3k"},{"label":"$3,000 - $8,000","value":"3k_8k"},{"label":"$8,000 - $15,000","value":"8k_15k"},{"label":"$15,000+/month retainer","value":"15k_plus"},{"label":"TBD","value":"tbd"}]',
    2, 'Goals & Timeline', 'Budget', 3),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', 'CMS platform, past SEO work, known issues...', NULL, false, '[]', 2, 'Goals & Timeline', 'Other', 4)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Blog / Article Content
-- Category: Content & SEO
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'content-seo'),
  'Blog / Article Content',
  'blog-content',
  'Blog posts, articles, thought leadership pieces, and long-form written content',
  'i-lucide-file-text',
  false, true, 'medium', true, 2
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'blog-content';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Article Title / Topic', 'text', NULL, NULL, true, '[]', 1, 'Content Brief', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Content Brief', 'Basic Information', 2),
  (tmpl_id, 'content_type', 'Content Type', 'dropdown', NULL, NULL, true,
    '[{"label":"Blog Post","value":"blog"},{"label":"Long-form Article","value":"article"},{"label":"Case Study","value":"case_study"},{"label":"White Paper","value":"white_paper"},{"label":"Press Release","value":"press_release"},{"label":"Newsletter","value":"newsletter"},{"label":"Landing Page Copy","value":"landing_page"}]',
    1, 'Content Brief', 'Type', 3),
  (tmpl_id, 'word_count', 'Target Word Count', 'dropdown', NULL, NULL, false,
    '[{"label":"500-800 words","value":"500_800"},{"label":"800-1200 words","value":"800_1200"},{"label":"1200-2000 words","value":"1200_2000"},{"label":"2000+ words","value":"2000_plus"}]',
    1, 'Content Brief', 'Specs', 4),
  (tmpl_id, 'topic_brief', 'Topic Brief / Outline', 'richtext', 'What should the article cover? Key points, angle, structure.', NULL, true, '[]', 1, 'Content Brief', 'Content', 5),
  (tmpl_id, 'target_keywords', 'Target SEO Keywords', 'textarea', 'Primary and secondary keywords', NULL, false, '[]', 1, 'Content Brief', 'SEO', 6),
  (tmpl_id, 'target_audience', 'Target Audience', 'textarea', NULL, NULL, true, '[]', 1, 'Content Brief', 'Audience', 7),
  (tmpl_id, 'tone_of_voice', 'Tone of Voice', 'dropdown', NULL, NULL, true,
    '[{"label":"Professional / Formal","value":"professional"},{"label":"Conversational","value":"conversational"},{"label":"Educational","value":"educational"},{"label":"Thought Leadership","value":"thought_leadership"},{"label":"Sales-driven","value":"sales"}]',
    1, 'Content Brief', 'Tone', 8),
  (tmpl_id, 'reference_articles', 'Reference / Inspiration', 'richtext', 'Links to similar articles or competitor content', NULL, false, '[]', 1, 'Content Brief', 'References', 9),
  (tmpl_id, 'due_date', 'Due Date', 'date', NULL, NULL, true, '[]', 1, 'Content Brief', 'Timeline', 10),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', NULL, NULL, false, '[]', 1, 'Content Brief', 'Other', 11)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Email Campaign
-- Category: Email & CRM
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'email-crm'),
  'Email Campaign',
  'email-campaign',
  'Email marketing campaigns — newsletters, promotional emails, drip sequences, and automations',
  'i-lucide-send',
  true, true, 'medium', true, 1
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'email-campaign';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Campaign Name', 'text', NULL, NULL, true, '[]', 1, 'Campaign Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Campaign Overview', 'Basic Information', 2),
  (tmpl_id, 'email_type', 'Email Type', 'dropdown', NULL, NULL, true,
    '[{"label":"One-off Campaign","value":"campaign"},{"label":"Newsletter","value":"newsletter"},{"label":"Drip/Nurture Sequence","value":"drip"},{"label":"Automated Trigger Email","value":"automation"},{"label":"Welcome Series","value":"welcome"},{"label":"Re-engagement","value":"re_engagement"},{"label":"Transactional","value":"transactional"}]',
    1, 'Campaign Overview', 'Type', 3),
  (tmpl_id, 'email_platform', 'Email Platform', 'dropdown', NULL, NULL, false,
    '[{"label":"Mailchimp","value":"mailchimp"},{"label":"Klaviyo","value":"klaviyo"},{"label":"HubSpot","value":"hubspot"},{"label":"ActiveCampaign","value":"activecampaign"},{"label":"Brevo (Sendinblue)","value":"brevo"},{"label":"Other","value":"other"}]',
    1, 'Campaign Overview', 'Platform', 4),
  (tmpl_id, 'audience_segment', 'Target Audience / Segment', 'textarea', 'Which list or segment should receive this?', NULL, true, '[]', 1, 'Campaign Overview', 'Audience', 5),
  (tmpl_id, 'send_date', 'Target Send Date', 'date', NULL, NULL, true, '[]', 1, 'Campaign Overview', 'Timeline', 6),

  -- Step 2: Content
  (tmpl_id, 'campaign_goal', 'Campaign Goal', 'dropdown', NULL, NULL, true,
    '[{"label":"Drive sales/conversions","value":"sales"},{"label":"Drive traffic to website","value":"traffic"},{"label":"Event registration","value":"event"},{"label":"Product announcement","value":"announcement"},{"label":"Education/nurture","value":"nurture"},{"label":"Customer retention","value":"retention"}]',
    2, 'Email Content', 'Goals', 1),
  (tmpl_id, 'subject_lines', 'Subject Line Ideas', 'textarea', 'Suggest 2-3 subject line options', NULL, false, '[]', 2, 'Email Content', 'Content', 2),
  (tmpl_id, 'email_content', 'Email Content / Copy', 'richtext', 'Body copy, or key points to include', NULL, true, '[]', 2, 'Email Content', 'Content', 3),
  (tmpl_id, 'cta', 'Call-to-Action', 'text', 'e.g. Shop Now, Register, Download', NULL, true, '[]', 2, 'Email Content', 'Content', 4),
  (tmpl_id, 'landing_url', 'CTA Landing Page', 'url', 'https://', NULL, false, '[]', 2, 'Email Content', 'Content', 5),
  (tmpl_id, 'design_requirements', 'Design Requirements', 'dropdown', NULL, NULL, true,
    '[{"label":"Use existing template","value":"existing"},{"label":"New design needed","value":"new"},{"label":"Text-only (no design)","value":"text_only"},{"label":"Refresh existing design","value":"refresh"}]',
    2, 'Email Content', 'Design', 6),
  (tmpl_id, 'brand_assets', 'Assets / Images', 'files', NULL, NULL, false, '[]', 2, 'Email Content', 'Assets', 7),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', 'A/B testing requirements, personalisation, UTM tracking...', NULL, false, '[]', 2, 'Email Content', 'Other', 8)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Landing Page
-- Category: Website
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'website'),
  'Landing Page',
  'landing-page',
  'Campaign landing pages, lead capture pages, and conversion-focused web pages',
  'i-lucide-layout',
  true, true, 'medium', true, 2
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'landing-page';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Page Name', 'text', 'e.g. Summer Sale Landing Page', NULL, true, '[]', 1, 'Page Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Page Overview', 'Basic Information', 2),
  (tmpl_id, 'page_purpose', 'Page Purpose', 'dropdown', NULL, NULL, true,
    '[{"label":"Lead Capture / Form","value":"lead_capture"},{"label":"Product/Service Promo","value":"product_promo"},{"label":"Event Registration","value":"event"},{"label":"App Download","value":"app_download"},{"label":"Content Download","value":"content_download"},{"label":"eCommerce Sale","value":"ecommerce"},{"label":"Coming Soon / Launch","value":"coming_soon"}]',
    1, 'Page Overview', 'Purpose', 3),
  (tmpl_id, 'target_url', 'Desired URL', 'text', 'e.g. /summer-sale or dedicated domain', NULL, false, '[]', 1, 'Page Overview', 'Technical', 4),
  (tmpl_id, 'traffic_sources', 'Traffic Sources', 'checkboxgroup', NULL, 'Where will traffic come from?', true,
    '[{"label":"Google Ads","value":"google_ads"},{"label":"Meta Ads","value":"meta_ads"},{"label":"Email","value":"email"},{"label":"Organic Search","value":"organic"},{"label":"Social Media","value":"social"},{"label":"QR Code / Print","value":"qr"},{"label":"Direct","value":"direct"}]',
    1, 'Page Overview', 'Traffic', 5),

  -- Step 2: Content & Design
  (tmpl_id, 'headline', 'Headline / Value Proposition', 'textarea', 'What is the main offer or value proposition?', NULL, true, '[]', 2, 'Content & Design', 'Content', 1),
  (tmpl_id, 'page_content', 'Page Content / Copy', 'richtext', 'Body copy, benefits, features, social proof', NULL, true, '[]', 2, 'Content & Design', 'Content', 2),
  (tmpl_id, 'cta', 'Primary Call-to-Action', 'text', 'e.g. Get Started, Download Now, Register', NULL, true, '[]', 2, 'Content & Design', 'CTA', 3),
  (tmpl_id, 'form_fields', 'Form Fields Required', 'checkboxgroup', NULL, NULL, false,
    '[{"label":"Name","value":"name"},{"label":"Email","value":"email"},{"label":"Phone","value":"phone"},{"label":"Company","value":"company"},{"label":"Message","value":"message"},{"label":"Custom fields","value":"custom"}]',
    2, 'Content & Design', 'Form', 4),
  (tmpl_id, 'design_approach', 'Design Approach', 'dropdown', NULL, NULL, true,
    '[{"label":"Match existing website style","value":"match_site"},{"label":"Match campaign creative","value":"match_campaign"},{"label":"New standalone design","value":"standalone"},{"label":"Template-based","value":"template"}]',
    2, 'Content & Design', 'Design', 5),
  (tmpl_id, 'reference_pages', 'Reference / Inspiration', 'richtext', 'Links to landing pages you like', NULL, false, '[]', 2, 'Content & Design', 'References', 6),
  (tmpl_id, 'brand_assets', 'Assets', 'files', NULL, NULL, false, '[]', 2, 'Content & Design', 'Assets', 7),

  -- Step 3: Technical & Launch
  (tmpl_id, 'cms_platform', 'CMS / Platform', 'dropdown', NULL, NULL, false,
    '[{"label":"WordPress","value":"wordpress"},{"label":"Webflow","value":"webflow"},{"label":"Shopify","value":"shopify"},{"label":"Unbounce","value":"unbounce"},{"label":"Instapage","value":"instapage"},{"label":"Custom HTML","value":"custom"},{"label":"Other","value":"other"}]',
    3, 'Technical & Launch', 'Platform', 1),
  (tmpl_id, 'tracking', 'Tracking Requirements', 'checkboxgroup', NULL, NULL, false,
    '[{"label":"Google Analytics","value":"ga"},{"label":"Meta Pixel","value":"meta_pixel"},{"label":"Google Ads conversion","value":"gads_conv"},{"label":"UTM tracking","value":"utm"},{"label":"CRM integration","value":"crm"}]',
    3, 'Technical & Launch', 'Tracking', 2),
  (tmpl_id, 'launch_date', 'Launch Date', 'date', NULL, NULL, true, '[]', 3, 'Technical & Launch', 'Timeline', 3),
  (tmpl_id, 'budget_range', 'Budget', 'dropdown', NULL, NULL, false,
    '[{"label":"Under $2,000","value":"under_2k"},{"label":"$2,000 - $5,000","value":"2k_5k"},{"label":"$5,000 - $10,000","value":"5k_10k"},{"label":"$10,000+","value":"10k_plus"},{"label":"TBD","value":"tbd"}]',
    3, 'Technical & Launch', 'Budget', 4),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', NULL, NULL, false, '[]', 3, 'Technical & Launch', 'Other', 5)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Strategy & Media Plan
-- Category: Strategy & Research
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'strategy-research'),
  'Strategy & Media Plan',
  'media-plan',
  'Media strategy, channel planning, budget allocation, and campaign planning',
  'i-lucide-bar-chart-3',
  true, true, 'high', true, 1
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'media-plan';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Campaign / Plan Name', 'text', NULL, NULL, true, '[]', 1, 'Brief Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Brief Overview', 'Basic Information', 2),
  (tmpl_id, 'plan_type', 'Plan Type', 'dropdown', NULL, NULL, true,
    '[{"label":"Full Media Plan","value":"full_plan"},{"label":"Digital Media Plan","value":"digital"},{"label":"Channel Recommendation","value":"channel_rec"},{"label":"Budget Reallocation","value":"budget_realloc"},{"label":"Competitor Analysis","value":"competitor"},{"label":"Market Research","value":"market_research"}]',
    1, 'Brief Overview', 'Type', 3),
  (tmpl_id, 'campaign_objective', 'Business Objective', 'richtext', 'What business outcome do you want to achieve?', NULL, true, '[]', 1, 'Brief Overview', 'Objectives', 4),
  (tmpl_id, 'kpis', 'Key Performance Indicators', 'textarea', 'e.g. 50 leads/month, 10% increase in brand awareness, 3x ROAS', NULL, true, '[]', 1, 'Brief Overview', 'Objectives', 5),
  (tmpl_id, 'target_audience', 'Target Audience', 'richtext', 'Demographics, psychographics, media consumption habits', NULL, true, '[]', 1, 'Brief Overview', 'Audience', 6),

  -- Step 2: Scope
  (tmpl_id, 'channels', 'Channels to Consider', 'checkboxgroup', NULL, NULL, false,
    '[{"label":"Search (Google/Bing)","value":"search"},{"label":"Social (Meta, LinkedIn, TikTok)","value":"social"},{"label":"Display/Programmatic","value":"display"},{"label":"YouTube/Video","value":"video"},{"label":"TV","value":"tv"},{"label":"Radio","value":"radio"},{"label":"OOH/Billboard","value":"ooh"},{"label":"Print","value":"print"},{"label":"Influencer","value":"influencer"},{"label":"Email","value":"email"},{"label":"SEO/Content","value":"seo"},{"label":"All (full recommendation)","value":"all"}]',
    2, 'Scope & Budget', 'Channels', 1),
  (tmpl_id, 'geographic_market', 'Geographic Market', 'textarea', 'Where should media run?', NULL, true, '[]', 2, 'Scope & Budget', 'Market', 2),
  (tmpl_id, 'campaign_dates', 'Campaign Dates', 'daterange', NULL, NULL, true, '[]', 2, 'Scope & Budget', 'Timeline', 3),
  (tmpl_id, 'total_budget', 'Total Media Budget', 'dropdown', NULL, NULL, true,
    '[{"label":"Under $10,000","value":"under_10k"},{"label":"$10,000 - $50,000","value":"10k_50k"},{"label":"$50,000 - $150,000","value":"50k_150k"},{"label":"$150,000 - $500,000","value":"150k_500k"},{"label":"$500,000+","value":"500k_plus"},{"label":"TBD — need recommendation","value":"tbd"}]',
    2, 'Scope & Budget', 'Budget', 4),
  (tmpl_id, 'existing_activity', 'Current / Previous Activity', 'richtext', 'What media is currently running? Past results?', NULL, false, '[]', 2, 'Scope & Budget', 'History', 5),
  (tmpl_id, 'competitors', 'Key Competitors', 'textarea', 'Who are you competing against?', NULL, false, '[]', 2, 'Scope & Budget', 'Competitive', 6),

  -- Step 3: Delivery
  (tmpl_id, 'deliverables', 'Required Deliverables', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Media plan document","value":"plan"},{"label":"Budget breakdown by channel","value":"budget"},{"label":"Media calendar","value":"calendar"},{"label":"Audience strategy","value":"audience"},{"label":"Competitive analysis","value":"competitive"},{"label":"Measurement framework","value":"measurement"},{"label":"Presentation deck","value":"presentation"}]',
    3, 'Delivery', 'Deliverables', 1),
  (tmpl_id, 'due_date', 'Plan Due Date', 'date', NULL, NULL, true, '[]', 3, 'Delivery', 'Timeline', 2),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', NULL, NULL, false, '[]', 3, 'Delivery', 'Other', 3)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: General Support Request (enhanced)
-- Category: Support Ticket — update existing
-- ============================================

-- First, enrich the existing Support Ticket category
UPDATE brief_categories
SET description = 'Internal support requests, bug reports, change requests, and general help tickets',
    icon = 'i-lucide-life-buoy'
WHERE slug = 'support-ticket';

-- Add a Bug Report template
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'support-ticket'),
  'Bug Report',
  'bug-report',
  'Report a bug, error, or unexpected behaviour in any system or tool',
  'i-lucide-bug',
  false, false, 'high', true, 2
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'bug-report';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Bug Summary', 'text', 'Short description of the issue', NULL, true, '[]', 1, 'Bug Report', 'Issue', 1),
  (tmpl_id, 'severity', 'Severity', 'dropdown', NULL, NULL, true,
    '[{"label":"Critical — system down or data loss","value":"critical"},{"label":"High — major feature broken","value":"high"},{"label":"Medium — feature impaired but workaround exists","value":"medium"},{"label":"Low — cosmetic or minor","value":"low"}]',
    1, 'Bug Report', 'Issue', 2),
  (tmpl_id, 'system_affected', 'System / Tool Affected', 'dropdown', NULL, NULL, true,
    '[{"label":"Website","value":"website"},{"label":"CRM / CMS","value":"crm"},{"label":"Ad Platforms","value":"ads"},{"label":"Email / Marketing Automation","value":"email"},{"label":"Analytics / Reporting","value":"analytics"},{"label":"Internal Tools","value":"internal"},{"label":"Other","value":"other"}]',
    1, 'Bug Report', 'Issue', 3),
  (tmpl_id, 'url_affected', 'URL / Location of Issue', 'url', 'https://', 'Link to the page or screen where the issue occurs', false, '[]', 1, 'Bug Report', 'Issue', 4),
  (tmpl_id, 'steps_to_reproduce', 'Steps to Reproduce', 'richtext', '1. Go to...\n2. Click on...\n3. See error...', NULL, true, '[]', 1, 'Bug Report', 'Details', 5),
  (tmpl_id, 'expected_behaviour', 'Expected Behaviour', 'textarea', 'What should happen?', NULL, true, '[]', 1, 'Bug Report', 'Details', 6),
  (tmpl_id, 'actual_behaviour', 'Actual Behaviour', 'textarea', 'What actually happens?', NULL, true, '[]', 1, 'Bug Report', 'Details', 7),
  (tmpl_id, 'browser_device', 'Browser / Device', 'text', 'e.g. Chrome 120, iPhone 15, Windows 11', NULL, false, '[]', 1, 'Bug Report', 'Environment', 8),
  (tmpl_id, 'screenshots', 'Screenshots / Screen Recording', 'files', NULL, 'Upload screenshots or Loom/video recording', false, '[]', 1, 'Bug Report', 'Evidence', 9),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', 'Workarounds, frequency, impact on work...', NULL, false, '[]', 1, 'Bug Report', 'Other', 10)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- Add a Change Request template
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'support-ticket'),
  'Change Request',
  'change-request',
  'Request a change, update, or enhancement to an existing system, process, or asset',
  'i-lucide-git-pull-request',
  false, true, 'medium', true, 3
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'change-request';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Change Request Title', 'text', 'e.g. Update homepage banner, Add new form field', NULL, true, '[]', 1, 'Change Request', 'Request', 1),
  (tmpl_id, 'change_type', 'Type of Change', 'dropdown', NULL, NULL, true,
    '[{"label":"Content Update","value":"content"},{"label":"Design Change","value":"design"},{"label":"Feature Enhancement","value":"feature"},{"label":"Configuration Change","value":"config"},{"label":"Access / Permissions","value":"access"},{"label":"Process Change","value":"process"},{"label":"Other","value":"other"}]',
    1, 'Change Request', 'Request', 2),
  (tmpl_id, 'description', 'Description of Change', 'richtext', 'What needs to change and why?', NULL, true, '[]', 1, 'Change Request', 'Details', 3),
  (tmpl_id, 'current_state', 'Current State', 'richtext', 'What does it look/work like now?', NULL, false, '[]', 1, 'Change Request', 'Details', 4),
  (tmpl_id, 'desired_state', 'Desired State', 'richtext', 'What should it look/work like after the change?', NULL, true, '[]', 1, 'Change Request', 'Details', 5),
  (tmpl_id, 'affected_url', 'URL / Location', 'url', 'https://', NULL, false, '[]', 1, 'Change Request', 'Location', 6),
  (tmpl_id, 'priority', 'Priority', 'dropdown', NULL, NULL, true,
    '[{"label":"Low — nice to have","value":"low"},{"label":"Medium — needed this week","value":"medium"},{"label":"High — needed today","value":"high"},{"label":"Urgent — blocking work","value":"urgent"}]',
    1, 'Change Request', 'Priority', 7),
  (tmpl_id, 'attachments', 'Supporting Files', 'files', NULL, 'Screenshots, mockups, documents', false, '[]', 1, 'Change Request', 'Files', 8),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', NULL, NULL, false, '[]', 1, 'Change Request', 'Other', 9)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Signage & Vehicle Wraps
-- Category: Print & OOH
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'print-ooh'),
  'Signage & Vehicle Wraps',
  'signage-wraps',
  'Retail signage, window graphics, vehicle wraps, trade show displays, and environmental graphics',
  'i-lucide-truck',
  true, true, 'medium', true, 3
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'signage-wraps';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Project Name', 'text', NULL, NULL, true, '[]', 1, 'Project Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Project Overview', 'Basic Information', 2),
  (tmpl_id, 'signage_type', 'Signage Type', 'checkboxgroup', NULL, NULL, true,
    '[{"label":"Vehicle Wrap (full)","value":"vehicle_full"},{"label":"Vehicle Wrap (partial)","value":"vehicle_partial"},{"label":"Window Graphics / Frosting","value":"window"},{"label":"Building / Fascia Signage","value":"building"},{"label":"A-Frame / Pavement Sign","value":"a_frame"},{"label":"Trade Show / Exhibition","value":"trade_show"},{"label":"Retail POS / Display","value":"retail_pos"},{"label":"Wayfinding / Directional","value":"wayfinding"},{"label":"Wall Mural / Graphics","value":"wall_mural"},{"label":"Other","value":"other"}]',
    1, 'Project Overview', 'Type', 3),
  (tmpl_id, 'dimensions', 'Dimensions / Vehicle Details', 'textarea', 'Exact sizes, vehicle make/model, or location details', NULL, true, '[]', 1, 'Project Overview', 'Specs', 4),
  (tmpl_id, 'quantity', 'Quantity', 'text', 'How many units?', NULL, false, '[]', 1, 'Project Overview', 'Specs', 5),
  (tmpl_id, 'description', 'Project Description', 'richtext', 'What do you need and what should it achieve?', NULL, true, '[]', 1, 'Project Overview', 'Context', 6),

  -- Step 2: Creative
  (tmpl_id, 'key_message', 'Key Message', 'textarea', NULL, NULL, true, '[]', 2, 'Creative Direction', 'Messaging', 1),
  (tmpl_id, 'contact_info', 'Contact Info to Include', 'textarea', 'Phone, website, social handles, QR code?', NULL, false, '[]', 2, 'Creative Direction', 'Content', 2),
  (tmpl_id, 'brand_assets', 'Brand Assets', 'files', NULL, 'Logos (vector), brand guide, images, vehicle templates', false, '[]', 2, 'Creative Direction', 'Assets', 3),
  (tmpl_id, 'reference_materials', 'Reference / Inspiration', 'richtext', NULL, NULL, false, '[]', 2, 'Creative Direction', 'References', 4),

  -- Step 3: Delivery
  (tmpl_id, 'vendor', 'Production Vendor', 'text', 'Who will produce/install?', NULL, false, '[]', 3, 'Production & Delivery', 'Vendor', 1),
  (tmpl_id, 'due_date', 'Design Proof Due Date', 'date', NULL, NULL, true, '[]', 3, 'Production & Delivery', 'Timeline', 2),
  (tmpl_id, 'install_date', 'Installation Date', 'date', NULL, NULL, false, '[]', 3, 'Production & Delivery', 'Timeline', 3),
  (tmpl_id, 'budget_range', 'Budget', 'dropdown', NULL, 'Design + production', false,
    '[{"label":"Under $2,000","value":"under_2k"},{"label":"$2,000 - $5,000","value":"2k_5k"},{"label":"$5,000 - $15,000","value":"5k_15k"},{"label":"$15,000+","value":"15k_plus"},{"label":"TBD","value":"tbd"}]',
    3, 'Production & Delivery', 'Budget', 4),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', NULL, NULL, false, '[]', 3, 'Production & Delivery', 'Other', 5)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- TEMPLATE: Podcast / Audio Content
-- Category: Broadcast & Audio
-- ============================================
INSERT INTO brief_templates (category_id, name, slug, description, icon, is_multi_step, requires_approval, default_priority, allow_attachments, sort_order)
VALUES (
  (SELECT id FROM brief_categories WHERE slug = 'broadcast-audio'),
  'Podcast / Audio Content',
  'podcast-audio',
  'Podcast production, audio content, jingles, and audio branding',
  'i-lucide-headphones',
  true, true, 'medium', true, 4
) ON CONFLICT (category_id, slug) DO NOTHING;

DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'podcast-audio';
  IF tmpl_id IS NULL THEN RETURN; END IF;

  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, step_number, step_title, section, sort_order) VALUES
  (tmpl_id, 'project_name', 'Project Name', 'text', NULL, NULL, true, '[]', 1, 'Project Overview', 'Basic Information', 1),
  (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', 1, 'Project Overview', 'Basic Information', 2),
  (tmpl_id, 'audio_type', 'Content Type', 'dropdown', NULL, NULL, true,
    '[{"label":"Podcast Episode","value":"podcast"},{"label":"Podcast Series","value":"podcast_series"},{"label":"Audio Ad / Sponsorship","value":"audio_ad"},{"label":"Jingle / Audio Logo","value":"jingle"},{"label":"Voiceover Recording","value":"voiceover"},{"label":"Music Production","value":"music"}]',
    1, 'Project Overview', 'Type', 3),
  (tmpl_id, 'description', 'Project Description', 'richtext', 'What do you need produced?', NULL, true, '[]', 1, 'Project Overview', 'Context', 4),
  (tmpl_id, 'target_audience', 'Target Audience', 'textarea', NULL, NULL, true, '[]', 1, 'Project Overview', 'Audience', 5),
  (tmpl_id, 'duration', 'Target Duration', 'dropdown', NULL, NULL, true,
    '[{"label":"Under 30 seconds","value":"under_30s"},{"label":"30-60 seconds","value":"30_60s"},{"label":"1-5 minutes","value":"1_5min"},{"label":"15-30 minutes","value":"15_30min"},{"label":"30-60 minutes","value":"30_60min"},{"label":"60+ minutes","value":"60_plus"}]',
    1, 'Project Overview', 'Format', 6),

  -- Step 2: Creative
  (tmpl_id, 'key_messages', 'Key Messages / Topics', 'richtext', NULL, NULL, true, '[]', 2, 'Creative Direction', 'Content', 1),
  (tmpl_id, 'tone_style', 'Tone & Style', 'multiselect', NULL, NULL, false,
    '[{"label":"Professional","value":"professional"},{"label":"Conversational","value":"conversational"},{"label":"Educational","value":"educational"},{"label":"Entertaining","value":"entertaining"},{"label":"Intimate","value":"intimate"},{"label":"High-energy","value":"high_energy"}]',
    2, 'Creative Direction', 'Tone', 2),
  (tmpl_id, 'reference_audio', 'Reference Audio', 'richtext', 'Links to podcasts/audio you like', NULL, false, '[]', 2, 'Creative Direction', 'References', 3),
  (tmpl_id, 'existing_assets', 'Existing Assets', 'files', NULL, 'Scripts, recordings, brand audio', false, '[]', 2, 'Creative Direction', 'Assets', 4),

  -- Step 3: Delivery
  (tmpl_id, 'due_date', 'Delivery Date', 'date', NULL, NULL, true, '[]', 3, 'Delivery', 'Timeline', 1),
  (tmpl_id, 'delivery_platforms', 'Distribution Platforms', 'checkboxgroup', NULL, NULL, false,
    '[{"label":"Spotify","value":"spotify"},{"label":"Apple Podcasts","value":"apple"},{"label":"YouTube","value":"youtube"},{"label":"Website","value":"website"},{"label":"Social Media","value":"social"},{"label":"Radio","value":"radio"}]',
    3, 'Delivery', 'Distribution', 2),
  (tmpl_id, 'budget_range', 'Budget', 'dropdown', NULL, NULL, false,
    '[{"label":"Under $2,000","value":"under_2k"},{"label":"$2,000 - $5,000","value":"2k_5k"},{"label":"$5,000 - $15,000","value":"5k_15k"},{"label":"$15,000+","value":"15k_plus"},{"label":"TBD","value":"tbd"}]',
    3, 'Delivery', 'Budget', 3),
  (tmpl_id, 'additional_notes', 'Additional Notes', 'richtext', NULL, NULL, false, '[]', 3, 'Delivery', 'Other', 4)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;


-- ============================================
-- Update sort orders for existing categories
-- ============================================
UPDATE brief_categories SET sort_order = 1 WHERE slug = 'marketing';
UPDATE brief_categories SET sort_order = 9 WHERE slug = 'advertising';
UPDATE brief_categories SET sort_order = 10 WHERE slug = 'digital-marketing';
UPDATE brief_categories SET sort_order = 11 WHERE slug = 'website';
UPDATE brief_categories SET sort_order = 12 WHERE slug = 'it-request';
UPDATE brief_categories SET sort_order = 13 WHERE slug = 'support-ticket';
