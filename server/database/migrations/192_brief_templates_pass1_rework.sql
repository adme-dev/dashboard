-- ============================================
-- 192 · Brief Templates Pass 1 — REWORKS (11 templates)
-- Full field-set rewrite (DELETE+INSERT) — safe while brief_field_values = 0.
-- + template-flag UPDATEs + retire instagram-ads.
-- ============================================
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM brief_field_values) <> 0 THEN
    RAISE EXCEPTION '192 aborted: brief_field_values is not empty — switch to additive mode';
  END IF;
END $$;

-- ============================================================
-- Task 7: facebook-ads → "Meta Ads Campaign" + retire instagram-ads
-- ============================================================
-- Starting point: FB (29 fields) merged with IG distinctive fields (instagram_handle,
-- visual_style, reference_accounts). Added: platform, campaign_subtype, auto_catalogue_id
-- (cond:aia), lead_form_name (cond:lead_gen), meta_pixel_id, utm_template.
-- Removed: audience_heading (layout only), hashtags (no paid value).
-- Tier A + Tier B(auto_catalogue_id cond:aia, auto_stock_feed_url cond:aia) + acct block.
-- Total: 50 fields.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'facebook-ads';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id = tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES

  -- ── Step 1: Campaign Setup ──────────────────────────────────────────
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Basics','full',1),
  (tmpl_id,'campaign_name','Campaign Name','text','e.g. Meta — June New Car Campaign',NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Basics','full',2),
  (tmpl_id,'platform','Platform(s)','checkboxgroup',NULL,'Which Meta platforms this campaign will run on.',true,
   '[{"label":"Facebook","value":"facebook"},{"label":"Instagram","value":"instagram"},{"label":"Both","value":"both"}]'::jsonb,
   NULL,1,'Campaign Setup','Basics','full',3),
  (tmpl_id,'campaign_subtype','Campaign Sub-type','radio',NULL,'Determines which downstream fields are required.',true,
   '[{"label":"Standard","value":"standard"},{"label":"Auto Inventory Ads (AIA)","value":"aia"},{"label":"Lead Gen","value":"lead_gen"}]'::jsonb,
   NULL,1,'Campaign Setup','Basics','full',4),
  (tmpl_id,'campaign_objective','Campaign Objective','dropdown',NULL,NULL,true,
   '[{"label":"Awareness","value":"awareness"},{"label":"Traffic","value":"traffic"},{"label":"Engagement","value":"engagement"},{"label":"Leads","value":"leads"},{"label":"App Promotion","value":"app_promo"},{"label":"Sales","value":"sales"}]'::jsonb,
   NULL,1,'Campaign Setup','Basics','half',5),
  (tmpl_id,'campaign_description','Campaign Description','richtext',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Basics','full',6),
  (tmpl_id,'instagram_handle','Instagram Handle','text','@dealership',NULL,false,'[]'::jsonb,NULL,1,'Campaign Setup','Basics','half',7),

  -- ── Step 2: Audience ────────────────────────────────────────────────
  (tmpl_id,'age_min','Minimum Age','number','18',NULL,false,'[]'::jsonb,NULL,2,'Audience','Demographics','half',1),
  (tmpl_id,'age_max','Maximum Age','number','65',NULL,false,'[]'::jsonb,NULL,2,'Audience','Demographics','half',2),
  (tmpl_id,'gender','Gender','dropdown',NULL,NULL,true,
   '[{"label":"All","value":"all"},{"label":"Male","value":"male"},{"label":"Female","value":"female"}]'::jsonb,
   NULL,2,'Audience','Demographics','half',3),
  (tmpl_id,'locations','Target Locations','textarea','e.g. Melbourne 25km radius + Mornington Peninsula',NULL,true,'[]'::jsonb,NULL,2,'Audience','Geography','full',4),
  (tmpl_id,'interests','Interests & Behaviors','textarea','e.g. In-market auto buyers, car finance',NULL,false,'[]'::jsonb,NULL,2,'Audience','Interests','full',5),
  (tmpl_id,'custom_audiences','Custom Audiences','checkboxgroup',NULL,NULL,false,
   '[{"label":"Retargeting (Website)","value":"retargeting_web"},{"label":"Retargeting (Video)","value":"retargeting_video"},{"label":"Customer List","value":"customer_list"},{"label":"Lookalike","value":"lookalike"},{"label":"None","value":"none"}]'::jsonb,
   NULL,2,'Audience','Custom Audiences','full',6),
  (tmpl_id,'excluded_audiences','Excluded Audiences','textarea',NULL,NULL,false,'[]'::jsonb,NULL,2,'Audience','Exclusions','full',7),

  -- ── Step 3: Creative & Copy ─────────────────────────────────────────
  (tmpl_id,'ad_format','Ad Format','checkboxgroup',NULL,NULL,true,
   '[{"label":"Single Image","value":"single_image"},{"label":"Single Video","value":"single_video"},{"label":"Carousel","value":"carousel"},{"label":"Collection","value":"collection"},{"label":"Instant Experience","value":"instant_experience"},{"label":"Stories","value":"stories"},{"label":"Reels","value":"reels"}]'::jsonb,
   NULL,3,'Creative & Copy','Formats','full',1),
  (tmpl_id,'placements','Ad Placements','checkboxgroup',NULL,NULL,true,
   '[{"label":"Facebook Feed","value":"fb_feed"},{"label":"Instagram Feed","value":"ig_feed"},{"label":"Facebook Stories","value":"fb_stories"},{"label":"Instagram Stories","value":"ig_stories"},{"label":"Reels","value":"reels"},{"label":"Audience Network","value":"audience_network"},{"label":"Advantage+ (Auto)","value":"advantage_plus"}]'::jsonb,
   NULL,3,'Creative & Copy','Formats','full',2),
  (tmpl_id,'primary_text','Primary Text','textarea',NULL,NULL,true,'[]'::jsonb,NULL,3,'Creative & Copy','Copy','full',3),
  (tmpl_id,'headline','Headline','text',NULL,NULL,true,'[]'::jsonb,NULL,3,'Creative & Copy','Copy','full',4),
  (tmpl_id,'description','Description','text',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative & Copy','Copy','full',5),
  (tmpl_id,'cta_button','Call to Action Button','dropdown',NULL,NULL,true,
   '[{"label":"Learn More","value":"learn_more"},{"label":"Shop Now","value":"shop_now"},{"label":"Get Quote","value":"get_quote"},{"label":"Book Test Drive","value":"book_test_drive"},{"label":"Contact Us","value":"contact_us"},{"label":"Get Offer","value":"get_offer"},{"label":"Apply Now","value":"apply_now"},{"label":"Download","value":"download"}]'::jsonb,
   NULL,3,'Creative & Copy','Copy','half',6),
  (tmpl_id,'visual_style','Visual Style & Direction','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative & Copy','Direction','full',7),
  (tmpl_id,'reference_accounts','Reference Accounts / Posts','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative & Copy','Direction','full',8),
  (tmpl_id,'creative_assets','Creative Assets','files',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative & Copy','Assets','full',9),
  (tmpl_id,'creative_notes','Creative Direction Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative & Copy','Notes','full',10),

  -- ── Step 4: Budget & Schedule ────────────────────────────────────────
  (tmpl_id,'budget_type','Budget Type','radio',NULL,NULL,true,
   '[{"label":"Daily","value":"daily"},{"label":"Lifetime","value":"lifetime"}]'::jsonb,
   NULL,4,'Budget & Schedule','Budget','half',1),
  (tmpl_id,'budget_amount','Budget Amount ($)','currency',NULL,NULL,true,'[]'::jsonb,NULL,4,'Budget & Schedule','Budget','half',2),
  (tmpl_id,'bid_strategy','Bid Strategy','dropdown',NULL,NULL,false,
   '[{"label":"Lowest Cost (Auto)","value":"lowest_cost"},{"label":"Cost Cap","value":"cost_cap"},{"label":"Bid Cap","value":"bid_cap"},{"label":"Target Cost","value":"target_cost"}]'::jsonb,
   NULL,4,'Budget & Schedule','Budget','half',3),
  (tmpl_id,'start_date','Start Date','date',NULL,NULL,true,'[]'::jsonb,NULL,4,'Budget & Schedule','Schedule','half',4),
  (tmpl_id,'end_date','End Date','date',NULL,NULL,false,'[]'::jsonb,NULL,4,'Budget & Schedule','Schedule','half',5),
  (tmpl_id,'ad_scheduling','Ad Scheduling','dropdown',NULL,NULL,false,
   '[{"label":"Run all the time","value":"always"},{"label":"Run on a schedule","value":"scheduled"}]'::jsonb,
   NULL,4,'Budget & Schedule','Schedule','half',6),
  (tmpl_id,'landing_page_url','Landing Page URL','url','https://',NULL,false,'[]'::jsonb,
   '{"fieldKey":"campaign_subtype","operator":"not_equals","value":"lead_gen","action":"require"}'::jsonb,
   4,'Budget & Schedule','Destination','full',7),
  (tmpl_id,'success_metrics','Success Metrics / KPIs','textarea','e.g. CPL < $25, ROAS > 3×',NULL,true,'[]'::jsonb,NULL,4,'Budget & Schedule','Goals','full',8),
  (tmpl_id,'meta_pixel_id','Meta Pixel ID','text','e.g. 123456789012345','The Meta Pixel / Dataset ID used for conversion tracking on this account.',false,'[]'::jsonb,NULL,4,'Budget & Schedule','Tracking','half',9),
  (tmpl_id,'lead_form_name','Lead Form Name','text',NULL,'Name of the Meta Instant Form to use for this campaign.',false,'[]'::jsonb,
   '{"fieldKey":"campaign_subtype","operator":"equals","value":"lead_gen","action":"show"}'::jsonb,
   4,'Budget & Schedule','Tracking','half',10),
  (tmpl_id,'utm_template','UTM Tracking Template','url','https://example.com/?utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}','ValueTrack / UTM template for click tracking.',false,'[]'::jsonb,NULL,4,'Budget & Schedule','Tracking','full',11),
  (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,4,'Budget & Schedule','Notes','full',12),

  -- ── Step 5: Offer & Accountability (Tier A + Tier B + acct) ──────────
  -- Tier A — Offer block
  (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,
   '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','full',1),
  (tmpl_id,'auto_vehicle_focus','Vehicle(s) Featured','text','e.g. 2024 Mazda CX-5 Touring','Make / model / year being promoted.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',2),
  (tmpl_id,'auto_vehicle_category','Vehicle Category','dropdown',NULL,'Drives offer type and audience.',false,
   '[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',3),
  (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. $500 cashback + 3.9% comparison rate','The specific deal the ad features.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',4),
  (tmpl_id,'auto_driveaway_price','Drive-Away / EGC Price','text','e.g. Drive Away from $34,990','Price/wording as it must appear. Text — values are ranges/wording.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',5),
  (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC).',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',6),
  (tmpl_id,'auto_oem_coop','OEM Co-op Funded?','radio',NULL,'If yes, OEM brand guidelines + approval apply.',false,
   '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',7),
  (tmpl_id,'auto_oem_assets','OEM Brand Guidelines / Assets','files',NULL,'OEM-supplied guidelines / approved assets.',false,'[]'::jsonb,
   '{"fieldKey":"auto_oem_coop","operator":"equals","value":"yes","action":"show"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',8),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this is for.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',9),
  -- Tier B — feed extension (conditional on AIA subtype)
  (tmpl_id,'auto_stock_feed_url','Stock / Inventory Feed URL','url','https://feed.autogate.com.au/...','Autogate / dealer DMS export / Merchant Centre feed.',false,'[]'::jsonb,
   '{"fieldKey":"campaign_subtype","operator":"equals","value":"aia","action":"show"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','half',10),
  (tmpl_id,'auto_catalogue_id','Product Catalogue / Feed ID','text',NULL,'Meta vehicle catalogue ID.',false,'[]'::jsonb,
   '{"fieldKey":"campaign_subtype","operator":"equals","value":"aia","action":"show"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','half',11),
  -- acct block
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',12),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Accountability','half',13),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
   '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
   NULL,5,'Offer & Accountability','Accountability','full',14)

  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates
SET name = 'Meta Ads Campaign',
    require_client_link = true,
    description = 'Facebook & Instagram paid campaigns — objective, audience, creative, offer & compliance.'
WHERE slug = 'facebook-ads';

UPDATE brief_templates SET is_active = false WHERE slug = 'instagram-ads';

-- ============================================================
-- Task 8: google-ads — Search-focused trim
-- ============================================================
-- Starting point: 28 fields. Remove: display_assets (Display/Video only, not Search).
-- Add: conversion_action (text).
-- Retype: target_cpa_roas text → number.
-- Target Languages: drop required flag.
-- Splice Tier A (9 fields) + acct block (3 fields).
-- Total: 27 base + 1 conversion_action = 28 base, -1 display_assets = 27,
--        + Tier A 9 + acct 3 = 39 fields.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'google-ads';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id = tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES

  -- ── Step 1: Campaign Setup ──────────────────────────────────────────
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Basic Info','full',1),
  (tmpl_id,'campaign_name','Campaign Name','text','e.g. Google Search — New Cars June',NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Basic Info','full',2),
  (tmpl_id,'campaign_type','Campaign Type','dropdown',NULL,'Select the Search network type for this campaign.',true,
   '[{"label":"Search","value":"search"},{"label":"Dynamic Search Ads (DSA)","value":"dsa"},{"label":"Call-Only","value":"call_only"}]'::jsonb,
   NULL,1,'Campaign Setup','Campaign Type','half',3),
  (tmpl_id,'campaign_goal','Campaign Goal','dropdown',NULL,NULL,true,
   '[{"label":"Sales / Leads","value":"sales_leads"},{"label":"Website Traffic","value":"traffic"},{"label":"Brand Awareness","value":"awareness"},{"label":"App Promotion","value":"app_promo"},{"label":"Local Store Visits","value":"store_visits"}]'::jsonb,
   NULL,1,'Campaign Setup','Objectives','half',4),
  (tmpl_id,'campaign_description','Campaign Description','richtext',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Objectives','full',5),
  (tmpl_id,'landing_page_url','Landing Page URL','url','https://',NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Destination','full',6),
  (tmpl_id,'success_metrics','Success Metrics / KPIs','textarea','e.g. CPL < $35, CTR > 5%',NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Goals','full',7),

  -- ── Step 2: Targeting ────────────────────────────────────────────────
  (tmpl_id,'target_keywords','Target Keywords','textarea','One keyword per line, e.g.\nnew mazda cx-5 dealership\nbuy mazda near me',NULL,true,'[]'::jsonb,NULL,2,'Targeting','Keywords','full',1),
  (tmpl_id,'negative_keywords','Negative Keywords','textarea','One per line, e.g.\nused\ndiy repair',NULL,false,'[]'::jsonb,NULL,2,'Targeting','Keywords','full',2),
  (tmpl_id,'keyword_match_types','Keyword Match Types','checkboxgroup',NULL,NULL,true,
   '[{"label":"Broad Match","value":"broad"},{"label":"Phrase Match","value":"phrase"},{"label":"Exact Match","value":"exact"}]'::jsonb,
   NULL,2,'Targeting','Keywords','full',3),
  (tmpl_id,'target_locations','Target Locations','textarea','e.g. Melbourne metro, Geelong',NULL,true,'[]'::jsonb,NULL,2,'Targeting','Geography','full',4),
  (tmpl_id,'languages','Target Languages','multiselect',NULL,'Default: English. Add others only if required.',false,
   '[{"label":"English","value":"en"},{"label":"Mandarin","value":"zh"},{"label":"Vietnamese","value":"vi"},{"label":"Arabic","value":"ar"},{"label":"Italian","value":"it"},{"label":"Greek","value":"el"},{"label":"Cantonese","value":"yue"},{"label":"Hindi","value":"hi"}]'::jsonb,
   NULL,2,'Targeting','Geography','half',5),
  (tmpl_id,'audience_targeting','Audience Targeting','checkboxgroup',NULL,NULL,false,
   '[{"label":"In-market: Autos","value":"inmarket_autos"},{"label":"In-market: Finance","value":"inmarket_finance"},{"label":"Remarketing","value":"remarketing"},{"label":"Customer Match","value":"customer_match"},{"label":"Similar Audiences","value":"similar"}]'::jsonb,
   NULL,2,'Targeting','Audiences','full',6),
  (tmpl_id,'device_targeting','Device Targeting','checkboxgroup',NULL,NULL,false,
   '[{"label":"Desktop","value":"desktop"},{"label":"Mobile","value":"mobile"},{"label":"Tablet","value":"tablet"}]'::jsonb,
   NULL,2,'Targeting','Devices','full',7),

  -- ── Step 3: Ad Creative (Search) ─────────────────────────────────────
  (tmpl_id,'headlines','Headlines','textarea',NULL,'Up to 15 headlines, max 30 characters each. One per line.',true,'[]'::jsonb,NULL,3,'Ad Creative','Search Ads','full',1),
  (tmpl_id,'descriptions','Descriptions','textarea',NULL,'Up to 4 descriptions, max 90 characters each. One per line.',true,'[]'::jsonb,NULL,3,'Ad Creative','Search Ads','full',2),
  (tmpl_id,'display_path','Display URL Path','text','e.g. /new-cars/mazda','Up to 2 path fields appended to your domain, 15 chars each.',false,'[]'::jsonb,NULL,3,'Ad Creative','Search Ads','half',3),
  (tmpl_id,'ad_extensions','Ad Extensions','checkboxgroup',NULL,NULL,false,
   '[{"label":"Callout","value":"callout"},{"label":"Structured Snippet","value":"structured_snippet"},{"label":"Call","value":"call"},{"label":"Location","value":"location"},{"label":"Image","value":"image"},{"label":"Price","value":"price"},{"label":"Promotion","value":"promotion"},{"label":"Lead Form","value":"lead_form"}]'::jsonb,
   NULL,3,'Ad Creative','Extensions','full',4),
  (tmpl_id,'sitelinks_info','Sitelinks Details','textarea','Sitelink 1: Book Test Drive | https://…\nSitelink 2: Finance Calculator | https://…','List each sitelink with headline + URL.',false,'[]'::jsonb,NULL,3,'Ad Creative','Extensions','full',5),

  -- ── Step 4: Budget & Bidding ─────────────────────────────────────────
  (tmpl_id,'daily_budget','Daily Budget ($)','currency',NULL,NULL,true,'[]'::jsonb,NULL,4,'Budget & Bidding','Budget','half',1),
  (tmpl_id,'monthly_budget','Monthly Budget Cap ($)','currency',NULL,NULL,false,'[]'::jsonb,NULL,4,'Budget & Bidding','Budget','half',2),
  (tmpl_id,'bidding_strategy','Bidding Strategy','dropdown',NULL,NULL,true,
   '[{"label":"Maximise Conversions","value":"max_conversions"},{"label":"Maximise Conversion Value","value":"max_conv_value"},{"label":"Target CPA","value":"target_cpa"},{"label":"Target ROAS","value":"target_roas"},{"label":"Maximise Clicks","value":"max_clicks"},{"label":"Manual CPC","value":"manual_cpc"}]'::jsonb,
   NULL,4,'Budget & Bidding','Bidding','half',3),
  (tmpl_id,'target_cpa_roas','Target CPA / ROAS Value','number',NULL,'Enter as a number: CPA in dollars (e.g. 35) or ROAS as multiplier (e.g. 4 for 400%).',false,'[]'::jsonb,NULL,4,'Budget & Bidding','Bidding','half',4),
  (tmpl_id,'conversion_action','Conversion Action','text','e.g. Lead Form Submit','Name of the Google Ads conversion action to optimise toward.',false,'[]'::jsonb,NULL,4,'Budget & Bidding','Bidding','full',5),
  (tmpl_id,'start_date','Start Date','date',NULL,NULL,true,'[]'::jsonb,NULL,4,'Budget & Bidding','Schedule','half',6),
  (tmpl_id,'end_date','End Date','date',NULL,NULL,false,'[]'::jsonb,NULL,4,'Budget & Bidding','Schedule','half',7),
  (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,4,'Budget & Bidding','Notes','full',8),

  -- ── Step 5: Offer & Accountability (Tier A + acct) ───────────────────
  -- Tier A — Offer block
  (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,
   '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','full',1),
  (tmpl_id,'auto_vehicle_focus','Vehicle(s) Featured','text','e.g. 2024 Mazda CX-5 Touring','Make / model / year being promoted.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',2),
  (tmpl_id,'auto_vehicle_category','Vehicle Category','dropdown',NULL,'Drives offer type and audience.',false,
   '[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',3),
  (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. $500 cashback + 3.9% comparison rate','The specific deal the ad features.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',4),
  (tmpl_id,'auto_driveaway_price','Drive-Away / EGC Price','text','e.g. Drive Away from $34,990','Price/wording as it must appear. Text — values are ranges/wording.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',5),
  (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC).',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',6),
  (tmpl_id,'auto_oem_coop','OEM Co-op Funded?','radio',NULL,'If yes, OEM brand guidelines + approval apply.',false,
   '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',7),
  (tmpl_id,'auto_oem_assets','OEM Brand Guidelines / Assets','files',NULL,'OEM-supplied guidelines / approved assets.',false,'[]'::jsonb,
   '{"fieldKey":"auto_oem_coop","operator":"equals","value":"yes","action":"show"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',8),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this is for.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',9),
  -- acct block
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',10),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Accountability','half',11),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
   '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
   NULL,5,'Offer & Accountability','Accountability','full',12)

  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET require_client_link = true WHERE slug = 'google-ads';

-- ============================================================
-- Task 9: marketing-campaign — Full rework
-- ============================================================
-- Starting point: batch-1 §6 (18 fields, missing client field).
-- ADD: client (client, R), platforms (checkboxgroup, R), target_locations (textarea, R),
--      success_kpis (textarea, R).
-- UPDATE: campaign_type options → Monday taxonomy.
-- OPTIONALISE: psychographics.
-- Splice Tier A (9 fields) + acct block (3 fields).
-- Steps: 1 Campaign Overview, 2 Audience, 3 Messaging & Deliverables, 4 Budget & Timeline, 5 Offer & Accountability.
-- Total estimate: ~30 fields.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'marketing-campaign';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id = tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES

  -- ── Step 1: Campaign Overview ───────────────────────────────────────
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Overview','Basics','full',1),
  (tmpl_id,'project_name','Campaign / Project Name','text','e.g. Mazda EOFY 2026 Campaign',NULL,true,'[]'::jsonb,NULL,1,'Campaign Overview','Basics','full',2),
  (tmpl_id,'campaign_type','Campaign Type','dropdown',NULL,'Select the primary campaign type matching Monday taxonomy.',true,
   '[{"label":"Meta Traffic","value":"meta_traffic"},{"label":"Meta Leads","value":"meta_leads"},{"label":"Meta AIA","value":"meta_aia"},{"label":"Google Search","value":"google_search"},{"label":"Google PMax (Standard)","value":"google_pmax_standard"},{"label":"Google PMax (Inventory)","value":"google_pmax_inventory"},{"label":"TikTok","value":"tiktok"},{"label":"Display / Programmatic","value":"display"},{"label":"Brand Awareness","value":"brand_awareness"},{"label":"Integrated / Multi-Channel","value":"integrated"},{"label":"Other","value":"other"}]'::jsonb,
   NULL,1,'Campaign Overview','Basics','half',3),
  (tmpl_id,'platforms','Platform(s)','checkboxgroup',NULL,'Which channels this campaign will run on.',true,
   '[{"label":"Meta (Facebook/Instagram)","value":"meta"},{"label":"Google","value":"google"},{"label":"TikTok","value":"tiktok"},{"label":"Display / Programmatic","value":"display"},{"label":"Other","value":"other"}]'::jsonb,
   NULL,1,'Campaign Overview','Basics','full',4),
  (tmpl_id,'campaign_objectives','Campaign Objectives','richtext',NULL,'What are the overarching business/campaign goals?',true,'[]'::jsonb,NULL,1,'Campaign Overview','Goals','full',5),
  (tmpl_id,'success_kpis','Success KPIs','textarea','e.g. CPL < $30, ROAS > 4×, 200 leads/month','Specific, measurable KPIs — distinct from objectives.',true,'[]'::jsonb,NULL,1,'Campaign Overview','Goals','full',6),
  (tmpl_id,'background_context','Background / Context','richtext',NULL,'Relevant history, seasonality, previous campaign results.',false,'[]'::jsonb,NULL,1,'Campaign Overview','Goals','full',7),

  -- ── Step 2: Audience ─────────────────────────────────────────────────
  (tmpl_id,'demographics','Demographics','textarea','e.g. Age 25–55, household income $80k+, in-market car buyers',NULL,true,'[]'::jsonb,NULL,2,'Audience','Audience Profile','full',1),
  (tmpl_id,'target_locations','Target Locations / Geographic Market','textarea','e.g. Melbourne metro + Geelong, 30km radius per store','Geographic markets to target.',true,'[]'::jsonb,NULL,2,'Audience','Audience Profile','full',2),
  (tmpl_id,'psychographics','Psychographics','textarea',NULL,'Optional — values, lifestyle, motivators. For dealers: in-market signals matter more than lifestyle.',false,'[]'::jsonb,NULL,2,'Audience','Audience Profile','full',3),
  (tmpl_id,'pain_points','Pain Points & Needs','richtext',NULL,NULL,false,'[]'::jsonb,NULL,2,'Audience','Audience Insights','full',4),

  -- ── Step 3: Messaging & Deliverables ────────────────────────────────
  (tmpl_id,'key_messages','Key Messages','richtext',NULL,NULL,true,'[]'::jsonb,NULL,3,'Messaging & Deliverables','Messaging','full',1),
  (tmpl_id,'tone_of_voice','Tone of Voice','multiselect',NULL,NULL,true,
   '[{"label":"Professional","value":"professional"},{"label":"Friendly","value":"friendly"},{"label":"Urgent","value":"urgent"},{"label":"Aspirational","value":"aspirational"},{"label":"Educational","value":"educational"},{"label":"Bold","value":"bold"},{"label":"Trustworthy","value":"trustworthy"}]'::jsonb,
   NULL,3,'Messaging & Deliverables','Messaging','full',2),
  (tmpl_id,'required_deliverables','Required Deliverables','checkboxgroup',NULL,NULL,true,
   '[{"label":"Social Media Ads","value":"social_ads"},{"label":"Search Ads","value":"search_ads"},{"label":"Display Banners","value":"display_banners"},{"label":"Landing Page","value":"landing_page"},{"label":"Email","value":"email"},{"label":"Video","value":"video"},{"label":"Print Collateral","value":"print"},{"label":"OOH / Signage","value":"ooh"},{"label":"Content / Blog","value":"content"},{"label":"Photography","value":"photography"}]'::jsonb,
   NULL,3,'Messaging & Deliverables','Deliverables','full',3),
  (tmpl_id,'key_milestones','Key Milestones','textarea',NULL,NULL,false,'[]'::jsonb,NULL,3,'Messaging & Deliverables','Deliverables','full',4),
  (tmpl_id,'brand_guidelines','Brand Guidelines','files',NULL,NULL,false,'[]'::jsonb,NULL,3,'Messaging & Deliverables','Assets','half',5),
  (tmpl_id,'reference_inspiration','Reference / Inspiration','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Messaging & Deliverables','Assets','half',6),

  -- ── Step 4: Budget & Timeline ────────────────────────────────────────
  (tmpl_id,'budget_range','Budget Range','dropdown',NULL,NULL,true,
   '[{"label":"Under $5,000","value":"under_5k"},{"label":"$5,000 – $15,000","value":"5k_15k"},{"label":"$15,000 – $30,000","value":"15k_30k"},{"label":"$30,000 – $50,000","value":"30k_50k"},{"label":"$50,000 – $100,000","value":"50k_100k"},{"label":"Over $100,000","value":"over_100k"}]'::jsonb,
   NULL,4,'Budget & Timeline','Budget','half',1),
  (tmpl_id,'campaign_start_date','Campaign Start Date','date',NULL,NULL,true,'[]'::jsonb,NULL,4,'Budget & Timeline','Timeline','half',2),
  (tmpl_id,'campaign_end_date','Campaign End Date','date',NULL,NULL,false,'[]'::jsonb,NULL,4,'Budget & Timeline','Timeline','half',3),
  (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,4,'Budget & Timeline','Notes','full',4),

  -- ── Step 5: Offer & Accountability (Tier A + acct) ───────────────────
  (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,
   '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','full',1),
  (tmpl_id,'auto_vehicle_focus','Vehicle(s) Featured','text','e.g. 2024 Mazda CX-5 Touring','Make / model / year being promoted.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',2),
  (tmpl_id,'auto_vehicle_category','Vehicle Category','dropdown',NULL,'Drives offer type and audience.',false,
   '[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',3),
  (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. $500 cashback + 3.9% comparison rate','The specific deal the campaign features.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',4),
  (tmpl_id,'auto_driveaway_price','Drive-Away / EGC Price','text','e.g. Drive Away from $34,990','Price/wording as it must appear. Text — values are ranges/wording.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',5),
  (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC).',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',6),
  (tmpl_id,'auto_oem_coop','OEM Co-op Funded?','radio',NULL,'If yes, OEM brand guidelines + approval apply.',false,
   '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',7),
  (tmpl_id,'auto_oem_assets','OEM Brand Guidelines / Assets','files',NULL,'OEM-supplied guidelines / approved assets.',false,'[]'::jsonb,
   '{"fieldKey":"auto_oem_coop","operator":"equals","value":"yes","action":"show"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',8),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this is for.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',9),
  -- acct block
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',10),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Accountability','half',11),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
   '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
   NULL,5,'Offer & Accountability','Accountability','full',12)

  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET require_client_link = true WHERE slug = 'marketing-campaign';

-- ============================================================
-- Task 10: ad-creative — Full rework
-- ============================================================
-- Starting point: batch-1 §8 (22 fields).
-- RETYPE: campaign_objective richtext → dropdown.
-- ADD: platforms (checkboxgroup), dealer_vs_oem_brand (radio), confirmed_budget (currency).
-- MAKE REQUIRED: mandatory_elements.
-- REMOVE: age_range (text field, duplicate of target_audience richtext).
-- Splice Tier A (9 fields) + acct block (3 fields).
-- Steps: 1 Campaign Context, 2 Audience & Messaging, 3 Creative Specs, 4 Timeline & Assets, 5 Offer & Accountability.
-- Total estimate: ~37 fields (22 - 1 age_range + 3 new + 9 Tier A + 3 acct).
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'ad-creative';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id = tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES

  -- ── Step 1: Campaign Context ────────────────────────────────────────
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Context','Basic Info','full',1),
  (tmpl_id,'campaign_name','Campaign Name','text','e.g. June EOFY Creative — Mazda',NULL,true,'[]'::jsonb,NULL,1,'Campaign Context','Basic Info','full',2),
  (tmpl_id,'ad_type','Ad Type','multiselect',NULL,'Select all formats this creative will be used for.',true,
   '[{"label":"Social Media Ad","value":"social"},{"label":"Display / Programmatic","value":"display"},{"label":"Video","value":"video"},{"label":"Search","value":"search"},{"label":"Print","value":"print"},{"label":"Outdoor / OOH","value":"ooh"},{"label":"Radio / Audio","value":"radio"},{"label":"TV / Broadcast","value":"tv"}]'::jsonb,
   NULL,1,'Campaign Context','Basic Info','full',3),
  (tmpl_id,'platforms','Platform(s)','checkboxgroup',NULL,'Which platforms / channels the creative will run on.',true,
   '[{"label":"Meta (Facebook/Instagram)","value":"meta"},{"label":"Google","value":"google"},{"label":"TikTok","value":"tiktok"},{"label":"Display / Programmatic","value":"display"},{"label":"Carsales","value":"carsales"},{"label":"Print","value":"print"},{"label":"OOH","value":"ooh"}]'::jsonb,
   NULL,1,'Campaign Context','Basic Info','full',4),
  (tmpl_id,'campaign_objective','Campaign Objective','dropdown',NULL,'Primary campaign objective — drives creative direction.',true,
   '[{"label":"Brand Awareness","value":"brand_awareness"},{"label":"New Model Launch","value":"new_model_launch"},{"label":"Clearance / End-of-Run","value":"clearance"},{"label":"Finance Offer","value":"finance_offer"},{"label":"Seasonal Campaign","value":"seasonal"},{"label":"Event Promotion","value":"event"},{"label":"Dealer Awareness","value":"dealer_awareness"},{"label":"Lead Generation","value":"lead_gen"}]'::jsonb,
   NULL,1,'Campaign Context','Objectives','half',5),
  (tmpl_id,'dealer_vs_oem_brand','Brand Hierarchy','radio',NULL,'Who is the dominant visual brand on the creative?',false,
   '[{"label":"Dealer brand dominant","value":"dealer_dominant"},{"label":"OEM brand dominant","value":"oem_dominant"},{"label":"Co-branded","value":"co_branded"}]'::jsonb,
   NULL,1,'Campaign Context','Objectives','half',6),
  (tmpl_id,'success_metrics','Success Metrics / KPIs','textarea','e.g. CPL < $30, ROAS > 4×',NULL,true,'[]'::jsonb,NULL,1,'Campaign Context','Objectives','full',7),

  -- ── Step 2: Audience & Messaging ────────────────────────────────────
  (tmpl_id,'target_audience','Target Audience','richtext',NULL,NULL,true,'[]'::jsonb,NULL,2,'Audience & Messaging','Demographics','full',1),
  (tmpl_id,'geographic_location','Geographic Location','text','e.g. Melbourne + Geelong',NULL,false,'[]'::jsonb,NULL,2,'Audience & Messaging','Demographics','full',2),
  (tmpl_id,'key_message','Key Message','richtext',NULL,NULL,true,'[]'::jsonb,NULL,2,'Audience & Messaging','Messaging','full',3),
  (tmpl_id,'call_to_action','Call to Action','text','e.g. Book a Test Drive',NULL,true,'[]'::jsonb,NULL,2,'Audience & Messaging','Messaging','half',4),
  (tmpl_id,'tone_style','Tone & Style','multiselect',NULL,NULL,true,
   '[{"label":"Professional","value":"professional"},{"label":"Friendly","value":"friendly"},{"label":"Urgent","value":"urgent"},{"label":"Aspirational","value":"aspirational"},{"label":"Bold","value":"bold"},{"label":"Trustworthy","value":"trustworthy"},{"label":"Premium","value":"premium"}]'::jsonb,
   NULL,2,'Audience & Messaging','Messaging','half',5),
  (tmpl_id,'customer_insights','Customer Insights','richtext',NULL,NULL,false,'[]'::jsonb,NULL,2,'Audience & Messaging','Insights','full',6),

  -- ── Step 3: Creative Specs ───────────────────────────────────────────
  (tmpl_id,'required_sizes','Required Sizes / Formats','checkboxgroup',NULL,NULL,true,
   '[{"label":"1080×1080 (Social Square)","value":"1080_1080"},{"label":"1200×628 (Facebook Feed)","value":"1200_628"},{"label":"1080×1920 (Stories/Reels)","value":"1080_1920"},{"label":"1200×1200 (Instagram)","value":"1200_1200"},{"label":"300×250 (Banner)","value":"300_250"},{"label":"728×90 (Leaderboard)","value":"728_90"},{"label":"160×600 (Skyscraper)","value":"160_600"},{"label":"970×250 (Billboard)","value":"970_250"},{"label":"1920×1080 (Video/TV)","value":"1920_1080"},{"label":"Custom","value":"custom"}]'::jsonb,
   NULL,3,'Creative Specs','Deliverables','full',1),
  (tmpl_id,'custom_sizes','Custom Sizes (if any)','textarea',NULL,'Specify dimensions and format.',false,'[]'::jsonb,
   '{"fieldKey":"required_sizes","operator":"contains","value":"custom","action":"show"}'::jsonb,
   3,'Creative Specs','Deliverables','full',2),
  (tmpl_id,'mandatory_elements','Mandatory Elements','textarea',NULL,'Legal requirements, logos, slogans, disclaimer text that MUST appear on the creative.',true,'[]'::jsonb,NULL,3,'Creative Specs','Requirements','full',3),
  (tmpl_id,'things_to_avoid','Things to Avoid','textarea',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative Specs','Requirements','full',4),

  -- ── Step 4: Timeline & Assets ────────────────────────────────────────
  (tmpl_id,'creative_budget','Creative Budget','dropdown',NULL,NULL,false,
   '[{"label":"Under $2,000","value":"under_2k"},{"label":"$2,000 – $5,000","value":"2k_5k"},{"label":"$5,000 – $10,000","value":"5k_10k"},{"label":"$10,000 – $20,000","value":"10k_20k"},{"label":"Over $20,000","value":"over_20k"}]'::jsonb,
   NULL,4,'Timeline & Assets','Budget','half',1),
  (tmpl_id,'confirmed_budget','Confirmed Budget','currency',NULL,'Actual confirmed production budget once known.',false,'[]'::jsonb,NULL,4,'Timeline & Assets','Budget','half',2),
  (tmpl_id,'creative_deadline','Creative Deadline','date',NULL,NULL,true,'[]'::jsonb,NULL,4,'Timeline & Assets','Timeline','half',3),
  (tmpl_id,'campaign_launch_date','Campaign Launch Date','date',NULL,NULL,false,'[]'::jsonb,NULL,4,'Timeline & Assets','Timeline','half',4),
  (tmpl_id,'brand_assets','Brand Assets','files',NULL,NULL,false,'[]'::jsonb,NULL,4,'Timeline & Assets','Assets','half',5),
  (tmpl_id,'creative_references','Creative References','richtext',NULL,NULL,false,'[]'::jsonb,NULL,4,'Timeline & Assets','Assets','half',6),
  (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,4,'Timeline & Assets','Notes','full',7),

  -- ── Step 5: Offer & Accountability (Tier A + acct) ───────────────────
  (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,
   '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','full',1),
  (tmpl_id,'auto_vehicle_focus','Vehicle(s) Featured','text','e.g. 2024 Mazda CX-5 Touring','Make / model / year being promoted.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',2),
  (tmpl_id,'auto_vehicle_category','Vehicle Category','dropdown',NULL,'Drives offer type and audience.',false,
   '[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',3),
  (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. $500 cashback + 3.9% comparison rate','The specific deal the creative features.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',4),
  (tmpl_id,'auto_driveaway_price','Drive-Away / EGC Price','text','e.g. Drive Away from $34,990','Price/wording as it must appear. Text — values are ranges/wording.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',5),
  (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC).',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',6),
  (tmpl_id,'auto_oem_coop','OEM Co-op Funded?','radio',NULL,'If yes, OEM brand guidelines + approval apply.',false,
   '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',7),
  (tmpl_id,'auto_oem_assets','OEM Brand Guidelines / Assets','files',NULL,'OEM-supplied guidelines / approved assets.',false,'[]'::jsonb,
   '{"fieldKey":"auto_oem_coop","operator":"equals","value":"yes","action":"show"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',8),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this is for.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',9),
  -- acct block
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',10),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Accountability','half',11),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
   '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
   NULL,5,'Offer & Accountability','Accountability','full',12)

  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET require_client_link = true WHERE slug = 'ad-creative';

-- ============================================================
-- Task 11: landing-page — Full rework
-- ============================================================
-- Starting point: batch-3 §2 (17 fields).
-- ADD: auto_offer_details (required for this template), utm_params (text, R),
--      campaign_ad_account (text).
-- MAKE REQUIRED: tracking_requirements.
-- EXTEND form_fields options: Vehicle of Interest, Trade-In, Preferred Contact Method.
-- Splice Tier A (9 fields, auto_offer_details REQUIRED here) + Tier B (2 fields) + acct block (3).
-- UPDATE: require_client_link=true, default_priority='high'.
-- Steps: 1 Page Basics, 2 Content, 3 Technical & Tracking, 4 Form & Design, 5 Offer & Accountability.
-- Total estimate: ~34 fields (17 + 3 new + 9 Tier A + 2 Tier B + 3 acct).
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'landing-page';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id = tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES

  -- ── Step 1: Page Basics ──────────────────────────────────────────────
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Page Basics','Basic Information','full',1),
  (tmpl_id,'page_name','Page Name','text','e.g. Mazda June EOFY Landing Page',NULL,true,'[]'::jsonb,NULL,1,'Page Basics','Basic Information','full',2),
  (tmpl_id,'page_purpose','Page Purpose','dropdown',NULL,NULL,true,
   '[{"label":"Lead Generation","value":"lead_gen"},{"label":"Product / Model Showcase","value":"product_showcase"},{"label":"Event Registration","value":"event_reg"},{"label":"Offer / Promotion","value":"offer"},{"label":"Contact / Enquiry","value":"contact"},{"label":"Service Booking","value":"service_booking"},{"label":"Finance Application","value":"finance"},{"label":"Other","value":"other"}]'::jsonb,
   NULL,1,'Page Basics','Basic Information','half',3),
  (tmpl_id,'cms_platform','CMS / Platform','dropdown',NULL,NULL,false,
   '[{"label":"WordPress","value":"wordpress"},{"label":"Custom Build","value":"custom"},{"label":"Unbounce","value":"unbounce"},{"label":"Leadpages","value":"leadpages"},{"label":"Webflow","value":"webflow"},{"label":"Shopify","value":"shopify"},{"label":"Other","value":"other"}]'::jsonb,
   NULL,1,'Page Basics','Basic Information','half',4),
  (tmpl_id,'launch_date','Launch Date','date',NULL,NULL,true,'[]'::jsonb,NULL,1,'Page Basics','Timeline','half',5),
  (tmpl_id,'desired_url','Desired URL / Slug','text','e.g. /june-eofy-mazda',NULL,false,'[]'::jsonb,NULL,1,'Page Basics','Technical','half',6),

  -- ── Step 2: Content ───────────────────────────────────────────────────
  (tmpl_id,'headline','Headline / Value Proposition','textarea','e.g. Drive Away a New Mazda CX-5 from $34,990 this June',NULL,true,'[]'::jsonb,NULL,2,'Content','Content','full',1),
  (tmpl_id,'page_content','Page Content / Copy','richtext',NULL,NULL,true,'[]'::jsonb,NULL,2,'Content','Content','full',2),
  (tmpl_id,'primary_cta','Primary Call-to-Action','text','e.g. Get This Deal',NULL,true,'[]'::jsonb,NULL,2,'Content','CTA','half',3),
  (tmpl_id,'traffic_sources','Traffic Sources','checkboxgroup',NULL,'Which channels will drive traffic to this page?',true,
   '[{"label":"Meta Ads","value":"meta"},{"label":"Google Search","value":"google_search"},{"label":"Google PMax","value":"google_pmax"},{"label":"TikTok","value":"tiktok"},{"label":"Display","value":"display"},{"label":"Email","value":"email"},{"label":"SMS","value":"sms"},{"label":"Organic / SEO","value":"organic"},{"label":"Direct","value":"direct"}]'::jsonb,
   NULL,2,'Content','Traffic','full',4),
  (tmpl_id,'reference_inspiration','Reference / Inspiration','richtext',NULL,NULL,false,'[]'::jsonb,NULL,2,'Content','References','full',5),
  (tmpl_id,'assets','Assets','files',NULL,NULL,false,'[]'::jsonb,NULL,2,'Content','Assets','full',6),

  -- ── Step 3: Technical & Tracking ─────────────────────────────────────
  (tmpl_id,'tracking_requirements','Tracking Requirements','checkboxgroup',NULL,'All tracking that must be installed on this page before launch.',true,
   '[{"label":"Google Analytics 4 (GA4)","value":"ga4"},{"label":"Google Tag Manager (GTM)","value":"gtm"},{"label":"Meta Pixel","value":"meta_pixel"},{"label":"Google Ads Conversion","value":"google_ads_conv"},{"label":"TikTok Pixel","value":"tiktok_pixel"},{"label":"Call Tracking","value":"call_tracking"},{"label":"Heatmap (Hotjar/CrazyEgg)","value":"heatmap"}]'::jsonb,
   NULL,3,'Technical & Tracking','Tracking','full',1),
  (tmpl_id,'utm_params','UTM Parameters','text','e.g. utm_source=meta&utm_medium=paid&utm_campaign=mazda-june-eofy','Required for attribution. Provide the UTM string or campaign naming convention.',true,'[]'::jsonb,NULL,3,'Technical & Tracking','Tracking','full',2),
  (tmpl_id,'campaign_ad_account','Campaign / Ad Account','text','e.g. Meta Act_123456789 / Google CID 123-456-7890','Which ad account / campaign is this page supporting? Drives attribution setup.',false,'[]'::jsonb,NULL,3,'Technical & Tracking','Tracking','full',3),
  (tmpl_id,'design_approach','Design Approach','dropdown',NULL,NULL,true,
   '[{"label":"New custom design","value":"custom"},{"label":"Use existing template","value":"template"},{"label":"Clone / adapt existing page","value":"clone"},{"label":"Landing page builder (Unbounce/Leadpages)","value":"builder"}]'::jsonb,
   NULL,3,'Technical & Tracking','Design','half',4),
  (tmpl_id,'budget','Budget','dropdown',NULL,NULL,false,
   '[{"label":"Under $500","value":"under_500"},{"label":"$500 – $1,500","value":"500_1500"},{"label":"$1,500 – $3,000","value":"1500_3000"},{"label":"Over $3,000","value":"over_3k"}]'::jsonb,
   NULL,3,'Technical & Tracking','Design','half',5),
  (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Technical & Tracking','Notes','full',6),

  -- ── Step 4: Form & Design ─────────────────────────────────────────────
  (tmpl_id,'form_fields','Form Fields Required','checkboxgroup',NULL,'Select all fields the lead capture form should include.',false,
   '[{"label":"Full Name","value":"full_name"},{"label":"Email","value":"email"},{"label":"Phone","value":"phone"},{"label":"Vehicle of Interest","value":"vehicle_of_interest"},{"label":"Trade-In","value":"trade_in"},{"label":"Preferred Contact Method","value":"preferred_contact"},{"label":"Message / Notes","value":"message"},{"label":"Postcode","value":"postcode"},{"label":"Preferred Test Drive Date","value":"test_drive_date"}]'::jsonb,
   NULL,4,'Form & Design','Form','full',1),

  -- ── Step 5: Offer & Accountability (Tier A + Tier B + acct) ──────────
  -- Tier A — Offer block (auto_offer_details is REQUIRED for landing pages)
  (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,
   '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','full',1),
  (tmpl_id,'auto_vehicle_focus','Vehicle(s) Featured','text','e.g. 2024 Mazda CX-5 Touring','Make / model / year being promoted.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',2),
  (tmpl_id,'auto_vehicle_category','Vehicle Category','dropdown',NULL,'Drives offer type and audience.',false,
   '[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',3),
  -- auto_offer_details is REQUIRED for landing-page
  (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. $500 cashback + 3.9% comparison rate','The specific offer this landing page is built around. Required — every dealer landing page has an offer.',true,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',4),
  (tmpl_id,'auto_driveaway_price','Drive-Away / EGC Price','text','e.g. Drive Away from $34,990','Price/wording as it must appear. Text — values are ranges/wording.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',5),
  (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC).',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',6),
  (tmpl_id,'auto_oem_coop','OEM Co-op Funded?','radio',NULL,'If yes, OEM brand guidelines + approval apply.',false,
   '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',7),
  (tmpl_id,'auto_oem_assets','OEM Brand Guidelines / Assets','files',NULL,'OEM-supplied guidelines / approved assets.',false,'[]'::jsonb,
   '{"fieldKey":"auto_oem_coop","operator":"equals","value":"yes","action":"show"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',8),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this is for.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',9),
  -- Tier B — feed extension
  (tmpl_id,'auto_stock_feed_url','Stock / Inventory Feed URL','url','https://feed.autogate.com.au/...','Autogate / dealer DMS export / Merchant Centre feed. For inventory-specific pages.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',10),
  (tmpl_id,'auto_catalogue_id','Product Catalogue / Feed ID','text',NULL,'Meta vehicle catalogue ID or Google Merchant Centre feed ID.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',11),
  -- acct block
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',12),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Accountability','half',13),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
   '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
   NULL,5,'Offer & Accountability','Accountability','full',14)

  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates
SET require_client_link = true,
    default_priority = 'high'
WHERE slug = 'landing-page';

-- ============================================================
-- Task 12: email-campaign — Full rework
-- ============================================================
-- Starting point: batch-3 §3 (14 fields).
-- ADD: list_segment (text, R), list_size (number), send_datetime (datetime, R — replaces target_send_date),
--      from_name (text), from_email (email), preview_text (text),
--      spam_compliance (checkbox, R — Spam Act 2003).
-- REMOVE: target_send_date (replaced by send_datetime).
-- MAKE REQUIRED: email_platform, cta_landing_page.
-- Partial Tier A: auto_offer_details, auto_offer_disclaimer (cond_logic=NULL — no driveaway field),
--                 auto_dealer_locations.
-- acct block: acct_compliance_ack cond_logic=NULL (no driveaway field in this template).
-- Steps: 1 Campaign Details, 2 Audience & List, 3 Content, 4 Technical, 5 Offer & Accountability.
-- Total: 11 base (14 - target_send_date + 4 new fields) + 3 partial Tier A + 3 acct = ~24 fields.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'email-campaign';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id = tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES

  -- ── Step 1: Campaign Details ─────────────────────────────────────────
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Details','Basic Information','full',1),
  (tmpl_id,'campaign_name','Campaign Name','text','e.g. June EOFY Mazda EDM',NULL,true,'[]'::jsonb,NULL,1,'Campaign Details','Basic Information','full',2),
  (tmpl_id,'campaign_goal','Campaign Goal','dropdown',NULL,NULL,true,
   '[{"label":"Promotion / Offer","value":"promotion"},{"label":"New Model Launch","value":"new_model_launch"},{"label":"Service Reminder","value":"service_reminder"},{"label":"Event Invitation","value":"event"},{"label":"Newsletter","value":"newsletter"},{"label":"Re-engagement","value":"re_engagement"},{"label":"Lead Nurture","value":"lead_nurture"},{"label":"Other","value":"other"}]'::jsonb,
   NULL,1,'Campaign Details','Basic Information','half',3),
  (tmpl_id,'email_type','Email Type','dropdown',NULL,NULL,true,
   '[{"label":"Promotional","value":"promotional"},{"label":"Transactional","value":"transactional"},{"label":"Newsletter","value":"newsletter"},{"label":"Automated / Drip","value":"automated"},{"label":"Event","value":"event"},{"label":"Re-engagement","value":"re_engagement"}]'::jsonb,
   NULL,1,'Campaign Details','Basic Information','half',4),
  (tmpl_id,'email_platform','Email Platform','dropdown',NULL,'The ESP / platform the campaign will be sent from.',true,
   '[{"label":"Mailchimp","value":"mailchimp"},{"label":"Klaviyo","value":"klaviyo"},{"label":"ActiveCampaign","value":"activecampaign"},{"label":"HubSpot","value":"hubspot"},{"label":"Campaign Monitor","value":"campaign_monitor"},{"label":"Dotdigital","value":"dotdigital"},{"label":"Constant Contact","value":"constant_contact"},{"label":"Other","value":"other"}]'::jsonb,
   NULL,1,'Campaign Details','Platform','half',5),
  (tmpl_id,'from_name','From Name','text','e.g. Mazda Berwick','Sender name recipients will see in their inbox.',false,'[]'::jsonb,NULL,1,'Campaign Details','Platform','half',6),
  (tmpl_id,'from_email','From Email','email','e.g. hello@mazdasoutheast.com.au','Sender email address. Must be an authenticated domain.',false,'[]'::jsonb,NULL,1,'Campaign Details','Platform','half',7),
  (tmpl_id,'send_datetime','Send Date & Time','datetime',NULL,'Exact date and time to send — automotive EDMs are often time-sensitive (EOM, weekend promo).',true,'[]'::jsonb,NULL,1,'Campaign Details','Schedule','half',8),

  -- ── Step 2: Audience & List ──────────────────────────────────────────
  (tmpl_id,'list_segment','List / Segment','text','e.g. All Mazda leads — June 2026','Name or ID of the email list / segment in the ESP.',true,'[]'::jsonb,NULL,2,'Audience & List','Audience','full',1),
  (tmpl_id,'list_size','Estimated List Size','number',NULL,'Approximate number of recipients. Affects scheduling and deliverability planning.',false,'[]'::jsonb,NULL,2,'Audience & List','Audience','half',2),
  (tmpl_id,'target_audience','Target Audience / Segment Details','textarea','e.g. Past Toyota service customers, in-market SUV buyers','Describe the audience being targeted.',true,'[]'::jsonb,NULL,2,'Audience & List','Audience','full',3),

  -- ── Step 3: Content ───────────────────────────────────────────────────
  (tmpl_id,'subject_line_ideas','Subject Line Ideas','textarea',NULL,'Draft subject lines — include emoji options if appropriate.',false,'[]'::jsonb,NULL,3,'Content','Copy','full',1),
  (tmpl_id,'preview_text','Preview Text','text','e.g. Drive away this month — see the deal inside','Inbox preview snippet shown alongside subject line.',false,'[]'::jsonb,NULL,3,'Content','Copy','half',2),
  (tmpl_id,'email_content','Email Content / Copy','richtext',NULL,'Full email body copy, sections, and key messages.',true,'[]'::jsonb,NULL,3,'Content','Copy','full',3),
  (tmpl_id,'call_to_action','Call-to-Action Text','text','e.g. See the Deal',NULL,true,'[]'::jsonb,NULL,3,'Content','CTA','half',4),
  (tmpl_id,'cta_landing_page','CTA Landing Page URL','url','https://','The destination URL for the primary CTA. Must be verified before build starts.',true,'[]'::jsonb,NULL,3,'Content','CTA','half',5),
  (tmpl_id,'design_requirements','Design Requirements','dropdown',NULL,NULL,true,
   '[{"label":"New design from brief","value":"new_design"},{"label":"Use existing template","value":"existing_template"},{"label":"Client-supplied HTML","value":"client_html"},{"label":"Plain text only","value":"plain_text"}]'::jsonb,
   NULL,3,'Content','Design','half',6),
  (tmpl_id,'assets_images','Assets / Images','files',NULL,NULL,false,'[]'::jsonb,NULL,3,'Content','Assets','full',7),
  (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Content','Notes','full',8),

  -- ── Step 4: Compliance ───────────────────────────────────────────────
  (tmpl_id,'spam_compliance','Spam Act 2003 Compliance','checkbox',NULL,'I confirm the email includes: a working unsubscribe mechanism AND a physical postal address for the sender. Required under Australian Spam Act 2003.',true,'[]'::jsonb,NULL,4,'Compliance','Legal','full',1),

  -- ── Step 5: Offer & Accountability (Partial Tier A + acct) ──────────
  -- Partial Tier A: auto_offer_details, auto_offer_disclaimer (NULL cond — no driveaway field),
  --                 auto_dealer_locations.
  -- auto_offer_disclaimer cond_logic = NULL (no auto_driveaway_price in this template).
  (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. $500 cashback + 3.9% comparison rate','The promotional offer this email campaign features.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',1),
  (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC). Required if a price or rate is quoted.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',2),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this email is for.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',3),
  -- acct block — acct_compliance_ack cond_logic = NULL (no auto_driveaway_price field here)
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',4),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',5),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
   '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
   NULL,5,'Offer & Accountability','Accountability','full',6)

  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET require_client_link = true WHERE slug = 'email-campaign';

-- ============================================================
-- Task 13: social-content — Full rework (fixes duplicate content_brief_title)
-- Committed: 2026-06-23
-- ============================================================
-- Starting point: batch-2 §10 (15 unique fields — 17 rows but duplicate content_brief_title;
--   DELETE+INSERT inherently drops the dup, single content_brief_title authored here).
-- EXTEND content_type options: add Vehicle Showcase, Inventory Post, OEM Content, GBP Post, ReelMotion.
-- ADD: num_posts (number).
-- MAKE REQUIRED: posting_frequency, content_period.
-- FULL Tier A (9 fields — all auto_* incl driveaway) + Tier B (auto_stock_feed_url) + full acct block.
-- auto_offer_disclaimer cond_logic: require when auto_driveaway_price is_not_empty (field exists here).
-- acct_compliance_ack cond_logic: require when auto_driveaway_price is_not_empty (field exists here).
-- Steps: 1 Brief Overview, 2 Content Strategy, 3 Schedule & Budget, 4 Assets, 5 Offer & Accountability.
-- Total: ~14 base + 10 Tier A + 1 Tier B + 3 acct = ~28 fields.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'social-content';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id = tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES

  -- ── Step 1: Brief Overview ────────────────────────────────────────────
  (tmpl_id,'content_brief_title','Content Brief Title','text','e.g. Mazda June Social Package',NULL,true,'[]'::jsonb,NULL,1,'Brief Overview','Basic Information','full',1),
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Brief Overview','Basic Information','full',2),
  (tmpl_id,'platforms','Platforms','checkboxgroup',NULL,'Which platforms this content is for.',true,
   '[{"label":"Facebook","value":"facebook"},{"label":"Instagram","value":"instagram"},{"label":"TikTok","value":"tiktok"},{"label":"LinkedIn","value":"linkedin"},{"label":"YouTube","value":"youtube"},{"label":"Google Business Profile","value":"gbp"},{"label":"Pinterest","value":"pinterest"}]'::jsonb,
   NULL,1,'Brief Overview','Platforms','full',3),
  (tmpl_id,'content_type','Content Type','checkboxgroup',NULL,'Select all content types in this brief.',true,
   '[{"label":"Static Post","value":"static_post"},{"label":"Carousel","value":"carousel"},{"label":"Reel / Short Video","value":"reel"},{"label":"Story","value":"story"},{"label":"Vehicle Showcase","value":"vehicle_showcase"},{"label":"Inventory Post","value":"inventory_post"},{"label":"OEM Content","value":"oem_content"},{"label":"GBP Post","value":"gbp_post"},{"label":"ReelMotion","value":"reelmotion"},{"label":"Animation / Motion Graphic","value":"animation"},{"label":"User-Generated Content","value":"ugc"}]'::jsonb,
   NULL,1,'Brief Overview','Content','full',4),

  -- ── Step 2: Content Strategy ─────────────────────────────────────────
  (tmpl_id,'content_goals','Content Goals','checkboxgroup',NULL,NULL,true,
   '[{"label":"Brand Awareness","value":"brand_awareness"},{"label":"Lead Generation","value":"lead_gen"},{"label":"Engagement","value":"engagement"},{"label":"Website Traffic","value":"traffic"},{"label":"Inventory / Offer Promotion","value":"inventory_offer"},{"label":"Community Building","value":"community"},{"label":"Customer Retention","value":"retention"}]'::jsonb,
   NULL,2,'Content Strategy','Goals','full',1),
  (tmpl_id,'scope','What Do You Need From Us?','checkboxgroup',NULL,NULL,true,
   '[{"label":"Copywriting","value":"copywriting"},{"label":"Design / Graphics","value":"design"},{"label":"Photography","value":"photography"},{"label":"Video Production","value":"video"},{"label":"Scheduling / Publishing","value":"scheduling"},{"label":"Reporting","value":"reporting"}]'::jsonb,
   NULL,2,'Content Strategy','Scope','full',2),
  (tmpl_id,'target_audience','Target Audience','textarea','e.g. In-market car buyers, 25–55, Melbourne metro',NULL,true,'[]'::jsonb,NULL,2,'Content Strategy','Audience','full',3),
  (tmpl_id,'tone_of_voice','Tone of Voice','multiselect',NULL,NULL,true,
   '[{"label":"Professional","value":"professional"},{"label":"Friendly","value":"friendly"},{"label":"Urgent","value":"urgent"},{"label":"Aspirational","value":"aspirational"},{"label":"Educational","value":"educational"},{"label":"Humorous","value":"humorous"},{"label":"Bold","value":"bold"}]'::jsonb,
   NULL,2,'Content Strategy','Tone','full',4),
  (tmpl_id,'num_posts','Number of Posts','number',NULL,'How many posts are included in this content package?',false,'[]'::jsonb,NULL,2,'Content Strategy','Volume','half',5),
  (tmpl_id,'content_pillars','Content Pillars / Themes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,2,'Content Strategy','Themes','full',6),
  (tmpl_id,'hashtag_strategy','Hashtag Strategy','textarea',NULL,NULL,false,'[]'::jsonb,NULL,2,'Content Strategy','Themes','full',7),

  -- ── Step 3: Schedule & Budget ────────────────────────────────────────
  (tmpl_id,'content_due_date','Content Due Date','date',NULL,NULL,true,'[]'::jsonb,NULL,3,'Schedule & Budget','Timeline','half',1),
  (tmpl_id,'posting_frequency','Posting Frequency','dropdown',NULL,'How often content will be posted.',true,
   '[{"label":"Daily","value":"daily"},{"label":"2–3× per week","value":"2_3_week"},{"label":"Weekly","value":"weekly"},{"label":"Fortnightly","value":"fortnightly"},{"label":"Monthly","value":"monthly"},{"label":"One-off","value":"one_off"}]'::jsonb,
   NULL,3,'Schedule & Budget','Schedule','half',2),
  (tmpl_id,'content_period','Content Period','daterange',NULL,'Date range this content package covers.',true,'[]'::jsonb,NULL,3,'Schedule & Budget','Schedule','full',3),
  (tmpl_id,'monthly_budget','Monthly Budget','dropdown',NULL,NULL,false,
   '[{"label":"Under $500","value":"under_500"},{"label":"$500 – $1,500","value":"500_1500"},{"label":"$1,500 – $3,000","value":"1500_3000"},{"label":"$3,000 – $5,000","value":"3k_5k"},{"label":"Over $5,000","value":"over_5k"}]'::jsonb,
   NULL,3,'Schedule & Budget','Budget','half',4),

  -- ── Step 4: Assets & References ─────────────────────────────────────
  (tmpl_id,'brand_assets','Brand Assets / Guidelines','files',NULL,NULL,false,'[]'::jsonb,NULL,4,'Assets & References','Assets','full',1),
  (tmpl_id,'reference_accounts','Reference Accounts / Inspiration','richtext',NULL,NULL,false,'[]'::jsonb,NULL,4,'Assets & References','References','full',2),
  (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,4,'Assets & References','Notes','full',3),

  -- ── Step 5: Offer & Accountability (Full Tier A + Tier B stock feed + acct) ─
  -- Full Tier A: all 9 auto_* fields incl auto_driveaway_price
  (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,
   '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','full',1),
  (tmpl_id,'auto_vehicle_focus','Vehicle(s) Featured','text','e.g. 2024 Mazda CX-5 Touring','Make / model / year being promoted.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',2),
  (tmpl_id,'auto_vehicle_category','Vehicle Category','dropdown',NULL,'Drives offer type and audience.',false,
   '[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',3),
  (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. $500 cashback + 3.9% comparison rate','The specific deal or promotion featured in this content.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',4),
  (tmpl_id,'auto_driveaway_price','Drive-Away / EGC Price','text','e.g. Drive Away from $34,990','Price/wording as it must appear. Text — values are ranges/wording.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',5),
  (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC).',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',6),
  (tmpl_id,'auto_oem_coop','OEM Co-op Funded?','radio',NULL,'If yes, OEM brand guidelines + approval apply.',false,
   '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',7),
  (tmpl_id,'auto_oem_assets','OEM Brand Guidelines / Assets','files',NULL,'OEM-supplied guidelines / approved assets.',false,'[]'::jsonb,
   '{"fieldKey":"auto_oem_coop","operator":"equals","value":"yes","action":"show"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',8),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this content is for.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',9),
  -- Tier B — feed extension
  (tmpl_id,'auto_stock_feed_url','Stock / Inventory Feed URL','url','https://feed.autogate.com.au/...','Autogate / dealer DMS export — for inventory post content.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',10),
  -- acct block — full conditional logic (auto_driveaway_price exists in this template)
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',11),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Accountability','half',12),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
   '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
   NULL,5,'Offer & Accountability','Accountability','full',13)

  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET require_client_link = true WHERE slug = 'social-content';

-- ============================================================
-- Task 14: website-dev — Full rework
-- Committed: 2026-06-23
-- ============================================================
-- Starting point: batch-3 §1 (18 fields).
-- ADD: vdp_required (radio: Yes/No), analytics_gtm_setup (checkbox).
-- MAKE REQUIRED: current_website_url.
-- ADD "Automotive Dealership" as the FIRST option of website_type.
-- Partial Tier A: auto_oem_brand, auto_dealer_locations (NO offer/driveaway/disclaimer/oem_coop/vehicle).
-- Tier B: auto_stock_feed_url, auto_catalogue_id.
-- acct block: acct_compliance_ack cond_logic = NULL (no auto_driveaway_price in this template).
-- Steps: 1 Project Overview, 2 Site Type & Design, 3 Technical, 4 Pages & Features, 5 Offer & Accountability.
-- Total: ~18 base + 2 new + 2 partial Tier A + 2 Tier B + 3 acct = ~27 fields.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'website-dev';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id = tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES

  -- ── Step 1: Project Overview ─────────────────────────────────────────
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Project Overview','Basic Info','full',1),
  (tmpl_id,'project_name','Project Name','text','e.g. Mazda Berwick Website Redesign',NULL,true,'[]'::jsonb,NULL,1,'Project Overview','Basic Info','full',2),
  (tmpl_id,'project_type','Project Type','dropdown',NULL,NULL,true,
   '[{"label":"New Build","value":"new_build"},{"label":"Redesign","value":"redesign"},{"label":"Migration","value":"migration"},{"label":"Ongoing Maintenance","value":"maintenance"}]'::jsonb,
   NULL,1,'Project Overview','Basic Info','half',3),
  (tmpl_id,'current_website_url','Current Website URL','url','https://','Existing site URL — required for redesigns and migrations.',true,'[]'::jsonb,NULL,1,'Project Overview','Basic Info','half',4),
  (tmpl_id,'project_goals','Project Goals','richtext',NULL,NULL,true,'[]'::jsonb,NULL,1,'Project Overview','Goals','full',5),
  (tmpl_id,'target_audience','Target Audience','richtext',NULL,NULL,true,'[]'::jsonb,NULL,1,'Project Overview','Goals','full',6),
  (tmpl_id,'target_launch_date','Target Launch Date','date',NULL,NULL,true,'[]'::jsonb,NULL,1,'Project Overview','Timeline','half',7),
  (tmpl_id,'budget_range','Budget Range','dropdown',NULL,NULL,true,
   '[{"label":"Under $5,000","value":"under_5k"},{"label":"$5,000 – $15,000","value":"5k_15k"},{"label":"$15,000 – $30,000","value":"15k_30k"},{"label":"$30,000 – $60,000","value":"30k_60k"},{"label":"Over $60,000","value":"over_60k"}]'::jsonb,
   NULL,1,'Project Overview','Budget','half',8),

  -- ── Step 2: Site Type & Design ───────────────────────────────────────
  (tmpl_id,'website_type','Website Type','multiselect',NULL,NULL,true,
   '[{"label":"Automotive Dealership","value":"automotive_dealership"},{"label":"Corporate / Business","value":"corporate"},{"label":"E-commerce","value":"ecommerce"},{"label":"Landing Page / Microsites","value":"landing_page"},{"label":"Blog / Content Site","value":"blog"},{"label":"Portfolio","value":"portfolio"},{"label":"Membership / Community","value":"membership"},{"label":"Other","value":"other"}]'::jsonb,
   NULL,2,'Site Type & Design','Site Type','full',1),
  (tmpl_id,'vdp_required','Vehicle Detail Page (VDP) Required','radio',NULL,'Flags need for VDP template, stock-feed integration, and drive-away / EGC pricing display.',false,
   '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,
   NULL,2,'Site Type & Design','Site Type','half',2),
  (tmpl_id,'design_style','Design Style','multiselect',NULL,NULL,true,
   '[{"label":"Modern / Minimal","value":"modern"},{"label":"Bold / High-Impact","value":"bold"},{"label":"Corporate / Professional","value":"corporate"},{"label":"Premium / Luxury","value":"luxury"},{"label":"Friendly / Approachable","value":"friendly"}]'::jsonb,
   NULL,2,'Site Type & Design','Design','full',3),
  (tmpl_id,'design_references','Design References','richtext',NULL,NULL,false,'[]'::jsonb,NULL,2,'Site Type & Design','Design','full',4),
  (tmpl_id,'content_status','Content Status','dropdown',NULL,NULL,true,
   '[{"label":"Client supplies all content","value":"client_supplied"},{"label":"Agency to write all content","value":"agency_writes"},{"label":"Mix — client + agency","value":"mixed"},{"label":"Migrating from existing site","value":"migrating"}]'::jsonb,
   NULL,2,'Site Type & Design','Content','half',5),

  -- ── Step 3: Technical ────────────────────────────────────────────────
  (tmpl_id,'cms_preference','CMS Preference','dropdown',NULL,NULL,false,
   '[{"label":"WordPress","value":"wordpress"},{"label":"Custom Build","value":"custom"},{"label":"Webflow","value":"webflow"},{"label":"Shopify","value":"shopify"},{"label":"DealerSocket / CDK","value":"dealer_platform"},{"label":"Other","value":"other"}]'::jsonb,
   NULL,3,'Technical','Platform','half',1),
  (tmpl_id,'hosting','Hosting','dropdown',NULL,'Leave blank if ADME manages hosting.',false,
   '[{"label":"ADME Managed","value":"adme"},{"label":"Client Managed","value":"client"},{"label":"Cloudflare Pages","value":"cloudflare"},{"label":"WP Engine","value":"wp_engine"},{"label":"Other","value":"other"}]'::jsonb,
   NULL,3,'Technical','Platform','half',2),
  (tmpl_id,'third_party_integrations','Third-party Integrations','checkboxgroup',NULL,NULL,false,
   '[{"label":"CRM (HubSpot / Salesforce)","value":"crm"},{"label":"Live Chat","value":"live_chat"},{"label":"Finance Calculator","value":"finance_calc"},{"label":"Trade-In Tool","value":"trade_in"},{"label":"Booking / Scheduling","value":"booking"},{"label":"Google Analytics / Tag Manager","value":"ga_gtm"},{"label":"Meta Pixel","value":"meta_pixel"},{"label":"Heatmap (Hotjar)","value":"heatmap"},{"label":"Other","value":"other"}]'::jsonb,
   NULL,3,'Technical','Integrations','full',3),
  (tmpl_id,'analytics_gtm_setup','Google Analytics / GTM Setup Required','checkbox',NULL,'Check if GA4 and Google Tag Manager need to be installed or reconfigured as part of this project.',false,'[]'::jsonb,NULL,3,'Technical','Integrations','half',4),

  -- ── Step 4: Pages & Features ─────────────────────────────────────────
  (tmpl_id,'required_pages','Required Pages','checkboxgroup',NULL,NULL,true,
   '[{"label":"Home","value":"home"},{"label":"About Us","value":"about"},{"label":"Contact","value":"contact"},{"label":"New Vehicles","value":"new_vehicles"},{"label":"Used Vehicles","value":"used_vehicles"},{"label":"Demonstrators","value":"demos"},{"label":"Finance","value":"finance"},{"label":"Service / Parts","value":"service"},{"label":"Specials / Offers","value":"specials"},{"label":"Blog","value":"blog"},{"label":"Privacy Policy","value":"privacy"},{"label":"Custom","value":"custom"}]'::jsonb,
   NULL,4,'Pages & Features','Pages','full',1),
  (tmpl_id,'features_needed','Features Needed','checkboxgroup',NULL,NULL,false,
   '[{"label":"Vehicle Search / Filter","value":"vehicle_search"},{"label":"Finance Calculator","value":"finance_calc"},{"label":"Test Drive Booking","value":"test_drive_booking"},{"label":"Service Booking","value":"service_booking"},{"label":"Live Chat","value":"live_chat"},{"label":"Trade-In Valuation","value":"trade_in"},{"label":"Social Media Feed","value":"social_feed"},{"label":"Google Maps / Directions","value":"maps"},{"label":"Offer / Specials Carousel","value":"specials_carousel"}]'::jsonb,
   NULL,4,'Pages & Features','Features','full',2),
  (tmpl_id,'brand_assets','Brand Assets','files',NULL,NULL,false,'[]'::jsonb,NULL,4,'Pages & Features','Assets','half',3),
  (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,4,'Pages & Features','Notes','full',4),

  -- ── Step 5: Offer & Accountability (Partial Tier A + Tier B + acct) ──
  -- Partial Tier A: auto_oem_brand + auto_dealer_locations ONLY
  -- (NO offer/driveaway/disclaimer/oem_coop/vehicle fields per §4.3)
  -- Tier B: auto_stock_feed_url, auto_catalogue_id
  -- acct_compliance_ack cond_logic = NULL (no auto_driveaway_price in this template)
  (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,
   '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','full',1),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this site is for.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',2),
  -- Tier B — feed extension (key for VDP / inventory pages)
  (tmpl_id,'auto_stock_feed_url','Stock / Inventory Feed URL','url','https://feed.autogate.com.au/...','Autogate / dealer DMS export / Merchant Centre feed. Required for VDP and inventory listing pages.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',3),
  (tmpl_id,'auto_catalogue_id','Product Catalogue / Feed ID','text',NULL,'Meta vehicle catalogue ID or Google Merchant Centre feed ID.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',4),
  -- acct block — acct_compliance_ack cond_logic = NULL (no auto_driveaway_price field)
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',5),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',6),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
   '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
   NULL,5,'Offer & Accountability','Accountability','full',7)

  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET require_client_link = true WHERE slug = 'website-dev';

-- ============================================================
-- Task 15: seo-audit → "SEO Retainer Brief"
-- ============================================================
-- Starting point: batch-3 §5 (12 fields).
-- ADD "GBP Management" option to scope_of_work checkboxgroup.
-- ADD: num_locations (number, R), auto_dealer_locations (required, Tier C),
--      monthly_reporting_format (dropdown), access_checklist (checkboxgroup).
-- MAKE REQUIRED: target_geo_locations.
-- Tier C: auto_oem_brand (dropdown), auto_vehicle_category (checkboxgroup — "Vehicle Segments to Focus On"),
--         auto_oem_incentive_period (text), auto_inventory_context (textarea).
-- acct block: acct_compliance_ack.conditional_logic = NULL (no driveaway field here).
-- UPDATE: name, description, require_client_link=true.
-- Steps: 1 Project Info, 2 Scope & Locations, 3 Keywords & Context, 4 Tools & Access, 5 Offer & Accountability.
-- Total: ~12 base + 4 new + 4 Tier C + 3 acct = ~23 fields.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'seo-audit';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id = tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES

  -- ── Step 1: Project Info ─────────────────────────────────────────────
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Project Info','Basic Information','full',1),
  (tmpl_id,'project_name','Project Name','text','e.g. Mazda Berwick SEO Retainer',NULL,true,'[]'::jsonb,NULL,1,'Project Info','Basic Information','full',2),
  (tmpl_id,'website_url','Website URL','url','https://','The primary domain this retainer covers.',true,'[]'::jsonb,NULL,1,'Project Info','Basic Information','full',3),
  (tmpl_id,'delivery_date','Delivery / Start Date','date',NULL,'When the retainer commences or the audit is due.',true,'[]'::jsonb,NULL,1,'Project Info','Timeline','half',4),
  (tmpl_id,'seo_goals','SEO Goals','richtext',NULL,'Business objectives driving this SEO engagement.',true,'[]'::jsonb,NULL,1,'Project Info','Goals','full',5),
  (tmpl_id,'budget','Budget','dropdown',NULL,NULL,false,
   '[{"label":"Under $1,000/month","value":"under_1k"},{"label":"$1,000 – $2,000/month","value":"1k_2k"},{"label":"$2,000 – $5,000/month","value":"2k_5k"},{"label":"Over $5,000/month","value":"over_5k"},{"label":"One-off audit — quote required","value":"audit_quote"}]'::jsonb,
   NULL,1,'Project Info','Budget','half',6),
  (tmpl_id,'monthly_reporting_format','Monthly Reporting Format','dropdown',NULL,'How results will be reported to the client each month.',false,
   '[{"label":"Dashboard access","value":"dashboard"},{"label":"Monthly PDF report","value":"monthly_pdf"},{"label":"Quarterly review call","value":"quarterly_call"},{"label":"Monthly PDF + quarterly call","value":"pdf_and_call"}]'::jsonb,
   NULL,1,'Project Info','Reporting','half',7),

  -- ── Step 2: Scope & Locations ────────────────────────────────────────
  (tmpl_id,'scope_of_work','Scope of Work','checkboxgroup',NULL,'Select all deliverables included in this retainer.',true,
   '[{"label":"Full Technical SEO Audit","value":"technical_audit"},{"label":"On-Page Optimisation","value":"on_page"},{"label":"Keyword Research","value":"keyword_research"},{"label":"Content Strategy","value":"content_strategy"},{"label":"Local SEO","value":"local_seo"},{"label":"Link Building Strategy","value":"link_building"},{"label":"Competitor Analysis","value":"competitor_analysis"},{"label":"Monthly SEO Retainer","value":"monthly_retainer"},{"label":"GBP Management","value":"gbp_management"}]'::jsonb,
   NULL,2,'Scope & Locations','Scope','full',1),
  (tmpl_id,'num_locations','Number of Locations','number',NULL,'How many dealership rooftops / GBP profiles are covered? Drives Local SEO and GBP management scope.',true,'[]'::jsonb,NULL,2,'Scope & Locations','Locations','half',2),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Mazda Berwick — 123 High St; Mazda Narre Warren — 456 Main Rd','List each suburb/city + address. Directly drives Local SEO and GBP scope.',true,'[]'::jsonb,NULL,2,'Scope & Locations','Locations','full',3),
  (tmpl_id,'target_geo_locations','Target Geographic Locations','textarea','e.g. Berwick, Narre Warren, Cranbourne, SE Melbourne suburbs','Priority suburbs and regions to rank for. Required for Local SEO targeting.',true,'[]'::jsonb,NULL,2,'Scope & Locations','Locations','full',4),
  (tmpl_id,'key_competitors','Key Competitors','textarea','e.g. Mazda Fountain Gate, City Mazda','Competitor dealer sites / GBP listings to benchmark against.',false,'[]'::jsonb,NULL,2,'Scope & Locations','Competitors','full',5),

  -- ── Step 3: Keywords & Context ───────────────────────────────────────
  (tmpl_id,'target_keywords','Target Keywords (if known)','textarea','e.g. new mazda cx-5 berwick, mazda dealer near me',NULL,false,'[]'::jsonb,NULL,3,'Keywords & Context','Keywords','full',1),
  (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Keywords & Context','Notes','full',2),

  -- ── Step 4: Tools & Access ───────────────────────────────────────────
  (tmpl_id,'current_seo_tools','Current SEO Tools','checkboxgroup',NULL,'Which tools does the client currently have access to?',false,
   '[{"label":"Google Search Console","value":"gsc"},{"label":"Google Analytics","value":"ga"},{"label":"SEMrush","value":"semrush"},{"label":"Ahrefs","value":"ahrefs"},{"label":"Moz","value":"moz"},{"label":"Other","value":"other"}]'::jsonb,
   NULL,4,'Tools & Access','Current Tools','full',1),
  (tmpl_id,'access_checklist','Access Required','checkboxgroup',NULL,'Confirm which platform access the AM has secured before work commences.',false,
   '[{"label":"Google Search Console","value":"gsc"},{"label":"Google Analytics","value":"ga"},{"label":"Google Ads","value":"google_ads"},{"label":"GBP Manager","value":"gbp_manager"}]'::jsonb,
   NULL,4,'Tools & Access','Access','full',2),

  -- ── Step 5: Offer & Accountability (Tier C + acct) ───────────────────
  -- Tier C: auto_oem_brand (gates keyword frameworks), auto_vehicle_category (as checkboxgroup — segments),
  --         auto_oem_incentive_period (text), auto_inventory_context (textarea).
  -- NO auto_vehicle_focus (not Tier A), NO auto_driveaway_price / disclaimer (not creative/paid).
  -- acct_compliance_ack.conditional_logic = NULL (no driveaway field).
  (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'OEM brand — some OEMs (Toyota, Kia) have preferred keyword frameworks or co-op SEO programs.',false,
   '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','full',1),
  (tmpl_id,'auto_vehicle_category','Vehicle Segments to Focus On','checkboxgroup',NULL,'Which vehicle categories should receive priority SEO coverage? Drives landing page and keyword strategy.',false,
   '[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','full',2),
  (tmpl_id,'auto_oem_incentive_period','OEM Incentive / Co-op Period','text','e.g. EOFY, plate clearance, OEM bonus periods','OEM incentive periods shape keyword priorities and content calendar. e.g. EOFY, plate clearance, OEM bonus periods.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',3),
  (tmpl_id,'auto_inventory_context','Inventory Context','textarea','e.g. Overstocked on SUVs — push CX-5 and CX-9 content','Current stock situation — informs which models/categories to prioritise in content and on-page work.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',4),
  -- acct block — acct_compliance_ack cond_logic = NULL (no driveaway field here)
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',5),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',6),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
   '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
   NULL,5,'Offer & Accountability','Accountability','full',7)

  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates
SET name = 'SEO Retainer Brief',
    description = 'Ongoing SEO + Google Business Profile retainer — scope, locations, reporting, access.',
    require_client_link = true
WHERE slug = 'seo-audit';

-- ============================================================
-- Task 16: billboard-ooh — Full rework
-- ============================================================
-- Starting point: batch-2 §5 (21 fields — note: batch listed 18+3 extras = 21 total rows).
-- RETYPE: key_visual textarea → files.
-- RETYPE: print_specifications + digital_billboard_specs textarea → structured dropdowns
--         with conditional "custom" text field.
-- ADD Campaign Objective options: "New Model Launch", "Clearance / End-of-Run".
-- MAKE REQUIRED: production_budget.
-- ADD: booking_reference (text).
-- FULL Tier A (9 fields: all auto_* incl driveaway, vehicle_focus) + full acct block (3 fields).
-- acct_compliance_ack.conditional_logic: require when auto_driveaway_price is_not_empty (field exists).
-- UPDATE: require_client_link=true.
-- Steps: 1 Campaign Overview, 2 Format & Technical, 3 Creative, 4 Budget & Schedule, 5 Offer & Accountability.
-- Total: ~21 base + 1 booking_reference - 0 removals + 9 Tier A + 3 acct = ~34 fields.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'billboard-ooh';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id = tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES

  -- ── Step 1: Campaign Overview ────────────────────────────────────────
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Overview','Basic Information','full',1),
  (tmpl_id,'campaign_name','Campaign Name','text','e.g. Mazda EOFY OOH — June 2026',NULL,true,'[]'::jsonb,NULL,1,'Campaign Overview','Basic Information','full',2),
  (tmpl_id,'campaign_objective','Campaign Objective','dropdown',NULL,'Primary objective for this OOH campaign.',true,
   '[{"label":"Brand Awareness","value":"brand_awareness"},{"label":"New Model Launch","value":"new_model_launch"},{"label":"Clearance / End-of-Run","value":"clearance"},{"label":"Finance Offer","value":"finance_offer"},{"label":"Seasonal Campaign","value":"seasonal"},{"label":"Event Promotion","value":"event"},{"label":"Dealer Awareness","value":"dealer_awareness"},{"label":"Traffic / Directional","value":"traffic_directional"}]'::jsonb,
   NULL,1,'Campaign Overview','Objectives','half',3),
  (tmpl_id,'target_locations_markets','Target Locations / Markets','textarea','e.g. Berwick, Narre Warren, SE Melbourne corridors','Specific suburbs, roads, or trade areas where OOH placements will appear.',true,'[]'::jsonb,NULL,1,'Campaign Overview','Locations','full',4),
  (tmpl_id,'campaign_context','Campaign Context','richtext',NULL,'Relevant background, seasonality, previous campaign results, or messaging context.',true,'[]'::jsonb,NULL,1,'Campaign Overview','Context','full',5),

  -- ── Step 2: Format & Technical ───────────────────────────────────────
  (tmpl_id,'ooh_format','OOH Format','checkboxgroup',NULL,'Select all formats this campaign uses.',true,
   '[{"label":"Large Format Billboard (48-sheet / 96-sheet)","value":"large_format"},{"label":"6-Sheet (bus shelter / retail)","value":"6_sheet"},{"label":"Transit / Bus Side","value":"transit"},{"label":"Digital Billboard (DOOH)","value":"digital"},{"label":"Street Furniture","value":"street_furniture"},{"label":"Airport","value":"airport"},{"label":"Shopping Centre","value":"shopping_centre"},{"label":"Other","value":"other"}]'::jsonb,
   NULL,2,'Format & Technical','Formats','full',1),
  (tmpl_id,'illumination','Illumination','dropdown',NULL,'Required for physical (non-digital) formats only.',false,
   '[{"label":"Backlit / Illuminated","value":"backlit"},{"label":"Non-illuminated","value":"non_illuminated"},{"label":"Solar-powered","value":"solar"},{"label":"N/A (digital format)","value":"na"}]'::jsonb,
   NULL,2,'Format & Technical','Formats','half',2),
  (tmpl_id,'number_of_creative_versions','Number of Creative Versions','dropdown',NULL,NULL,false,
   '[{"label":"1","value":"1"},{"label":"2","value":"2"},{"label":"3","value":"3"},{"label":"4+","value":"4_plus"}]'::jsonb,
   NULL,2,'Format & Technical','Versions','half',3),
  -- Print specs — structured dropdown replacing textarea
  (tmpl_id,'print_substrate','Print Substrate / Material','dropdown',NULL,'Standard substrate for physical OOH production.',false,
   '[{"label":"Gloss laminate (standard)","value":"gloss_laminate"},{"label":"Matt laminate","value":"matt_laminate"},{"label":"Vinyl (adhesive)","value":"vinyl_adhesive"},{"label":"Mesh / perforated vinyl","value":"mesh"},{"label":"Fabric / canvas","value":"fabric"},{"label":"Corflute","value":"corflute"},{"label":"Custom / Vendor spec","value":"custom"}]'::jsonb,
   NULL,2,'Format & Technical','Print Specs','half',4),
  (tmpl_id,'print_resolution','Print Resolution','dropdown',NULL,'Required print resolution for production files.',false,
   '[{"label":"100 DPI @ full size (standard large format)","value":"100dpi"},{"label":"150 DPI @ full size","value":"150dpi"},{"label":"300 DPI @ full size (short-run / short-distance)","value":"300dpi"},{"label":"Vendor to specify","value":"vendor_spec"}]'::jsonb,
   NULL,2,'Format & Technical','Print Specs','half',5),
  -- Digital billboard specs — structured replacing textarea
  (tmpl_id,'digital_pixel_dimensions','Digital Billboard Pixel Dimensions','dropdown',NULL,'Standard pixel dimensions for digital OOH formats.',false,
   '[{"label":"1920 × 1080 (Full HD, landscape)","value":"1920x1080"},{"label":"1080 × 1920 (Full HD, portrait)","value":"1080x1920"},{"label":"1280 × 960","value":"1280x960"},{"label":"960 × 640","value":"960x640"},{"label":"Custom (see notes)","value":"custom"}]'::jsonb,
   NULL,2,'Format & Technical','Digital Specs','half',6),
  (tmpl_id,'digital_pixel_custom','Custom Digital Dimensions','text','e.g. 2560 × 1440','Specify custom pixel dimensions if your format is not listed above.',false,'[]'::jsonb,
   '{"fieldKey":"digital_pixel_dimensions","operator":"equals","value":"custom","action":"show"}'::jsonb,
   2,'Format & Technical','Digital Specs','half',7),
  (tmpl_id,'digital_file_format','Digital File Format','dropdown',NULL,'Accepted file formats for digital OOH panels.',false,
   '[{"label":"JPEG (static)","value":"jpeg"},{"label":"PNG (static)","value":"png"},{"label":"MP4 (animated, ≤15s)","value":"mp4"},{"label":"Vendor to specify","value":"vendor_spec"}]'::jsonb,
   NULL,2,'Format & Technical','Digital Specs','half',8),
  (tmpl_id,'vendor_spec_sheet','Vendor Spec Sheet','files',NULL,'Upload the OOH vendor spec sheet if available.',false,'[]'::jsonb,NULL,2,'Format & Technical','Vendor','half',9),
  (tmpl_id,'ooh_vendor','OOH Vendor / Media Owner','text','e.g. oOh!media, JCDecaux, QMS',NULL,false,'[]'::jsonb,NULL,2,'Format & Technical','Vendor','half',10),
  (tmpl_id,'booking_reference','Booking Reference','text',NULL,'Media buy / booking reference from the OOH provider.',false,'[]'::jsonb,NULL,2,'Format & Technical','Vendor','half',11),

  -- ── Step 3: Creative ─────────────────────────────────────────────────
  (tmpl_id,'key_message_headline','Key Message / Headline','textarea','e.g. Drive Away from $34,990 this June',NULL,true,'[]'::jsonb,NULL,3,'Creative','Messaging','full',1),
  (tmpl_id,'supporting_text','Supporting Text','text',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative','Messaging','full',2),
  (tmpl_id,'key_visual','Key Visual / Hero Image','files',NULL,'Upload existing hero imagery or reference images for the creative team.',true,'[]'::jsonb,NULL,3,'Creative','Visual','full',3),
  (tmpl_id,'brand_assets_guidelines','Brand Assets & Guidelines','files',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative','Visual','half',4),
  (tmpl_id,'reference_inspiration','Reference / Inspiration','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative','References','half',5),
  (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative','Notes','full',6),

  -- ── Step 4: Budget & Schedule ────────────────────────────────────────
  (tmpl_id,'production_budget','Production Budget','dropdown',NULL,'Required — OOH production costs vary significantly by format and quantity.',true,
   '[{"label":"Under $2,000","value":"under_2k"},{"label":"$2,000 – $5,000","value":"2k_5k"},{"label":"$5,000 – $15,000","value":"5k_15k"},{"label":"$15,000 – $30,000","value":"15k_30k"},{"label":"Over $30,000","value":"over_30k"}]'::jsonb,
   NULL,4,'Budget & Schedule','Budget','half',1),
  (tmpl_id,'campaign_display_dates','Campaign Display Dates','daterange',NULL,'When the OOH placements will be live.',true,'[]'::jsonb,NULL,4,'Budget & Schedule','Timeline','half',2),
  (tmpl_id,'artwork_deadline','Artwork Deadline','date',NULL,'Material deadline for submitting print-ready or digital artwork to the vendor.',true,'[]'::jsonb,NULL,4,'Budget & Schedule','Timeline','half',3),

  -- ── Step 5: Offer & Accountability (Full Tier A + acct) ─────────────
  -- Full Tier A: all 9 auto_* fields incl auto_driveaway_price + vehicle_focus
  (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,
   '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','full',1),
  (tmpl_id,'auto_vehicle_focus','Vehicle(s) Featured','text','e.g. 2024 Mazda CX-5 Touring','Make / model / year being promoted.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',2),
  (tmpl_id,'auto_vehicle_category','Vehicle Category','dropdown',NULL,'Drives offer type and audience.',false,
   '[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',3),
  (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. Drive Away from $34,990 — June EOFY','The specific deal this OOH campaign features.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',4),
  (tmpl_id,'auto_driveaway_price','Drive-Away / EGC Price','text','e.g. Drive Away from $34,990','Price/wording as it must appear on the OOH creative. Text — values are ranges/wording.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',5),
  (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC). Required on any OOH that features a price.',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',6),
  (tmpl_id,'auto_oem_coop','OEM Co-op Funded?','radio',NULL,'If yes, OEM brand guidelines + approval apply before production.',false,
   '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',7),
  (tmpl_id,'auto_oem_assets','OEM Brand Guidelines / Assets','files',NULL,'OEM-supplied guidelines / approved assets.',false,'[]'::jsonb,
   '{"fieldKey":"auto_oem_coop","operator":"equals","value":"yes","action":"show"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',8),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this OOH campaign is for.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',9),
  -- acct block — full conditional logic (auto_driveaway_price exists in this template)
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',10),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Accountability','half',11),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
   '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
   NULL,5,'Offer & Accountability','Accountability','full',12)

  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET require_client_link = true WHERE slug = 'billboard-ooh';

-- ============================================================
-- Task 17: signage-wraps — Full rework
-- ============================================================
-- Starting point: batch-2 §4 (13 unique fields — 15 rows per audit, but actual current DB has 13).
-- SPLIT: dimensions (textarea) → vehicle_make (text), vehicle_model (text), vehicle_year (text).
-- ADD: vehicle_vin_stock (text).
-- ADD: wrap_coverage (dropdown, cond show when signage_type contains "vehicle_full").
-- ADD: print_install_scope (radio: Design only / Design + print / Design + print + install, R).
-- RETYPE: quantity text → number.
-- FULL Tier A EXCEPT OMIT auto_vehicle_focus (structured vehicle_make/model/year replace it semantically).
-- Full acct block: acct_compliance_ack live conditional (auto_driveaway_price exists here).
-- UPDATE: require_client_link=true.
-- Steps: 1 Project Info, 2 Vehicle & Signage Details, 3 Creative & Messaging, 4 Timeline & Budget, 5 Offer & Accountability.
-- Total: ~13 base - 1 dimensions + 3 (make/model/year) + 2 new (vin, wrap_coverage, print_install) = ~17 base,
--        + 8 Tier A (no vehicle_focus) + 3 acct = ~28 fields.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug = 'signage-wraps';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id = tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES

  -- ── Step 1: Project Info ─────────────────────────────────────────────
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Project Info','Basic Information','full',1),
  (tmpl_id,'project_name','Project Name','text','e.g. Mazda Berwick Fleet Wrap — June 2026',NULL,true,'[]'::jsonb,NULL,1,'Project Info','Basic Information','full',2),
  (tmpl_id,'signage_type','Signage Type','checkboxgroup',NULL,'Select all types included in this brief.',true,
   '[{"label":"Vehicle Wrap (full)","value":"vehicle_full"},{"label":"Vehicle Wrap (partial)","value":"vehicle_partial"},{"label":"Window Graphics / Frosting","value":"window"},{"label":"Building / Fascia Signage","value":"building"},{"label":"A-Frame / Pavement Sign","value":"a_frame"},{"label":"Trade Show / Exhibition","value":"trade_show"},{"label":"Retail POS / Display","value":"retail_pos"},{"label":"Wayfinding / Directional","value":"wayfinding"},{"label":"Wall Mural / Graphics","value":"wall_mural"},{"label":"Other","value":"other"}]'::jsonb,
   NULL,1,'Project Info','Type','full',3),
  (tmpl_id,'quantity','Quantity','number',NULL,'How many units / vehicles are included in this order?',false,'[]'::jsonb,NULL,1,'Project Info','Specs','half',4),
  (tmpl_id,'print_install_scope','Print & Install Scope','radio',NULL,'Determines full scope of production deliverable.',true,
   '[{"label":"Design only","value":"design_only"},{"label":"Design + print","value":"design_print"},{"label":"Design + print + install","value":"design_print_install"}]'::jsonb,
   NULL,1,'Project Info','Specs','half',5),

  -- ── Step 2: Vehicle & Signage Details ───────────────────────────────
  -- Vehicle structured fields (replaces dimensions/vehicle_details textarea for vehicle wraps)
  (tmpl_id,'vehicle_make','Vehicle Make','text','e.g. Mazda','Make / manufacturer of the vehicle to be wrapped.',false,'[]'::jsonb,NULL,2,'Vehicle & Signage Details','Vehicle','half',1),
  (tmpl_id,'vehicle_model','Vehicle Model','text','e.g. CX-5','Model name as it appears on the manufacturer site.',false,'[]'::jsonb,NULL,2,'Vehicle & Signage Details','Vehicle','half',2),
  (tmpl_id,'vehicle_year','Vehicle Year','text','e.g. 2023','Year of manufacture.',false,'[]'::jsonb,NULL,2,'Vehicle & Signage Details','Vehicle','half',3),
  (tmpl_id,'vehicle_vin_stock','VIN / Stock Number','text',NULL,'Vehicle Identification Number or dealer stock ID — links wrap to inventory for fleet/dealer wraps.',false,'[]'::jsonb,NULL,2,'Vehicle & Signage Details','Vehicle','half',4),
  -- Wrap coverage — conditional on vehicle wrap signage type
  (tmpl_id,'wrap_coverage','Wrap Coverage','dropdown',NULL,'How much of the vehicle surface will be wrapped.',false,
   '[{"label":"Full wrap","value":"full_wrap"},{"label":"3/4 wrap","value":"three_quarter_wrap"},{"label":"Half wrap","value":"half_wrap"},{"label":"Bonnet only","value":"bonnet_only"},{"label":"Rear only","value":"rear_only"},{"label":"Doors only","value":"doors_only"},{"label":"Custom","value":"custom_coverage"}]'::jsonb,
   '{"fieldKey":"signage_type","operator":"contains","value":"vehicle_full","action":"show"}'::jsonb,
   2,'Vehicle & Signage Details','Wrap','half',5),
  (tmpl_id,'production_vendor','Production Vendor','text','e.g. Sign-A-Rama, local wrap shop',NULL,false,'[]'::jsonb,NULL,2,'Vehicle & Signage Details','Vendor','half',6),

  -- ── Step 3: Creative & Messaging ────────────────────────────────────
  (tmpl_id,'key_message','Key Message','textarea','e.g. Drive Away from $34,990 this June',NULL,true,'[]'::jsonb,NULL,3,'Creative & Messaging','Messaging','full',1),
  (tmpl_id,'contact_info','Contact Info to Include','textarea','e.g. (03) 9999 0000 | mazdaberwick.com.au | LMCT# 12345','Dealer phone, website, LMCT# or other contact details to appear on the signage.',false,'[]'::jsonb,NULL,3,'Creative & Messaging','Messaging','full',2),
  (tmpl_id,'brand_assets','Brand Assets','files',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative & Messaging','Assets','half',3),
  (tmpl_id,'reference_inspiration','Reference / Inspiration','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative & Messaging','References','half',4),
  (tmpl_id,'project_description','Project Description / Creative Direction','richtext',NULL,NULL,true,'[]'::jsonb,NULL,3,'Creative & Messaging','Context','full',5),
  (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative & Messaging','Notes','full',6),

  -- ── Step 4: Timeline & Budget ────────────────────────────────────────
  (tmpl_id,'due_date','Design Proof Due Date','date',NULL,NULL,true,'[]'::jsonb,NULL,4,'Timeline & Budget','Timeline','half',1),
  (tmpl_id,'install_date','Installation Date','date',NULL,NULL,false,'[]'::jsonb,NULL,4,'Timeline & Budget','Timeline','half',2),
  (tmpl_id,'budget_range','Budget Range','dropdown',NULL,NULL,false,
   '[{"label":"Under $2,000","value":"under_2k"},{"label":"$2,000 – $5,000","value":"2k_5k"},{"label":"$5,000 – $15,000","value":"5k_15k"},{"label":"$15,000+","value":"15k_plus"},{"label":"TBD","value":"tbd"}]'::jsonb,
   NULL,4,'Timeline & Budget','Budget','half',3),

  -- ── Step 5: Offer & Accountability (Full Tier A excl auto_vehicle_focus + acct) ─
  -- Tier A EXCEPT auto_vehicle_focus (structured vehicle_make/model/year fields replace it above).
  -- Full Tier A fields: auto_oem_brand, auto_vehicle_category, auto_offer_details,
  --   auto_driveaway_price, auto_offer_disclaimer (cond_logic live), auto_oem_coop,
  --   auto_oem_assets (cond_logic live), auto_dealer_locations. (8 fields, NOT auto_vehicle_focus.)
  (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,
   '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','full',1),
  (tmpl_id,'auto_vehicle_category','Vehicle Category','dropdown',NULL,'Drives offer type and audience.',false,
   '[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',2),
  (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. Drive Away from $34,990 — June EOFY','The specific deal or promotion this signage carries.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',3),
  (tmpl_id,'auto_driveaway_price','Drive-Away / EGC Price','text','e.g. Drive Away from $34,990','Price/wording as it must appear on the signage. Text — values are ranges/wording.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',4),
  (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC). Required when a price appears on the signage.',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',5),
  (tmpl_id,'auto_oem_coop','OEM Co-op Funded?','radio',NULL,'If yes, OEM brand guidelines + approval apply — manufacturer logo placement and colour restrictions on wraps.',false,
   '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,
   NULL,5,'Offer & Accountability','Offer & Compliance','half',6),
  (tmpl_id,'auto_oem_assets','OEM Brand Guidelines / Assets','files',NULL,'OEM-supplied guidelines / approved assets.',false,'[]'::jsonb,
   '{"fieldKey":"auto_oem_coop","operator":"equals","value":"yes","action":"show"}'::jsonb,
   5,'Offer & Accountability','Offer & Compliance','full',7),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) these vehicle wraps / signs are for.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',8),
  -- acct block — full conditional logic (auto_driveaway_price exists in this template)
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',9),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,
   '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
   5,'Offer & Accountability','Accountability','half',10),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
   '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
   NULL,5,'Offer & Accountability','Accountability','full',11)

  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET require_client_link = true WHERE slug = 'signage-wraps';
