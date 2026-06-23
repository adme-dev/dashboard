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
