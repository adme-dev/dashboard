-- ============================================
-- 197 · Brief Templates Pass 2 — REWORKS (first 3 of 16 deferred)
-- Reworks: tiktok-ads, display-banner, media-plan
-- Full field-set rewrite (DELETE+INSERT) — safe while brief_field_values = 0.
-- + template-flag UPDATEs (require_client_link=true on all three).
-- Idempotent guard: aborts if any brief field-values exist.
-- Spec: docs/superpowers/plans/2026-06-23-brief-templates-pass1.md (Global Constraints)
--       docs/superpowers/research/2026-06-23-brief-template-audit-SYNTHESIS.md §4
--       docs/superpowers/research/2026-06-23-brief-template-audit-batch-1.md §3, §5, §7
-- ============================================

DO $$ BEGIN
  IF (SELECT COUNT(*) FROM brief_field_values) <> 0 THEN
    RAISE EXCEPTION '193 aborted: brief_field_values is not empty — switch to additive mode';
  END IF;
END $$;

-- ============================================================
-- REWORK 1: tiktok-ads
-- Assembly: 28 current − 0 removals + Tier A (9) + tiktok_pixel_id
--           + lead_form_name + spark_ads_post_id + acct_* (3) = 43 fields
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='tiktok-ads';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id=tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text,
     is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES
    -- Step 1: Campaign Setup
    (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Basics','full',1),
    (tmpl_id,'campaign_name','Campaign Name','text','e.g. Toyota Corolla — EOFY TikTok',NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Basics','full',2),
    (tmpl_id,'advertising_objective','Advertising Objective','dropdown',NULL,NULL,true,
     '[{"label":"Reach","value":"reach"},{"label":"Traffic","value":"traffic"},{"label":"Video Views","value":"video_views"},{"label":"Community Interaction","value":"community_interaction"},{"label":"App Promotion","value":"app_promotion"},{"label":"Lead Generation","value":"lead_generation"},{"label":"Website Conversions","value":"website_conversions"},{"label":"Product Sales","value":"product_sales"}]'::jsonb,
     NULL,1,'Campaign Setup','Basics','half',3),
    (tmpl_id,'campaign_description','Campaign Description','richtext',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Basics','full',4),
    (tmpl_id,'landing_page_url','Landing Page URL','url',NULL,NULL,false,'[]'::jsonb,NULL,1,'Campaign Setup','Destination','half',5),
    (tmpl_id,'success_metrics','Success Metrics/KPIs','textarea',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Goals','full',6),

    -- Step 2: Audience
    (tmpl_id,'age_min','Minimum Age','number',NULL,NULL,false,'[]'::jsonb,NULL,2,'Audience','Demographics','half',1),
    (tmpl_id,'age_max','Maximum Age','number',NULL,NULL,false,'[]'::jsonb,NULL,2,'Audience','Demographics','half',2),
    (tmpl_id,'gender','Gender','dropdown',NULL,NULL,true,
     '[{"label":"All Genders","value":"all"},{"label":"Male","value":"male"},{"label":"Female","value":"female"}]'::jsonb,
     NULL,2,'Audience','Demographics','half',3),
    (tmpl_id,'locations','Target Locations','textarea',NULL,NULL,true,'[]'::jsonb,NULL,2,'Audience','Geography','full',4),
    (tmpl_id,'interest_categories','Interest Categories','checkboxgroup',NULL,NULL,false,
     '[{"label":"Automotive / Cars & Vehicles","value":"automotive"},{"label":"Financial Services","value":"financial_services"},{"label":"Apparel & Accessories","value":"apparel_accessories"},{"label":"Beauty & Personal Care","value":"beauty_personal_care"},{"label":"Food & Beverage","value":"food_beverage"},{"label":"Games","value":"games"},{"label":"Tech & Electronics","value":"tech_electronics"},{"label":"Sports & Outdoors","value":"sports_outdoors"},{"label":"Travel","value":"travel"},{"label":"Education","value":"education"},{"label":"Entertainment","value":"entertainment"},{"label":"Home & Garden","value":"home_garden"}]'::jsonb,
     NULL,2,'Audience','Interests','full',5),
    (tmpl_id,'behavior_targeting','Behavior Targeting','checkboxgroup',NULL,NULL,false,
     '[{"label":"Video Interaction","value":"video_interaction"},{"label":"Creator Interaction","value":"creator_interaction"},{"label":"Hashtag Interaction","value":"hashtag_interaction"},{"label":"Purchase Intent","value":"purchase_intent"},{"label":"App Activity","value":"app_activity"}]'::jsonb,
     NULL,2,'Audience','Behaviors','full',6),
    (tmpl_id,'custom_audiences','Custom Audiences','checkboxgroup',NULL,NULL,false,
     '[{"label":"Customer File","value":"customer_file"},{"label":"Website Traffic (Pixel)","value":"website_traffic"},{"label":"App Activity","value":"app_activity"},{"label":"Engagement Audiences","value":"engagement"},{"label":"Lookalike Audiences","value":"lookalike"}]'::jsonb,
     NULL,2,'Audience','Custom Audiences','full',7),

    -- Step 3: Creative & Content
    (tmpl_id,'ad_format','Ad Format','checkboxgroup',NULL,NULL,true,
     '[{"label":"In-Feed Ads","value":"in_feed"},{"label":"TopView","value":"topview"},{"label":"Brand Takeover","value":"brand_takeover"},{"label":"Branded Hashtag Challenge","value":"branded_hashtag"},{"label":"Branded Effects","value":"branded_effects"},{"label":"Spark Ads (Boosted Organic)","value":"spark_ads"}]'::jsonb,
     NULL,3,'Creative & Content','Formats','full',1),
    (tmpl_id,'video_orientation','Video Orientation','radio',NULL,NULL,true,
     '[{"label":"Vertical 9:16 (Recommended)","value":"vertical_9_16"},{"label":"Square 1:1","value":"square_1_1"},{"label":"Horizontal 16:9","value":"horizontal_16_9"}]'::jsonb,
     NULL,3,'Creative & Content','Specs','half',2),
    (tmpl_id,'spark_ads_post_id','Spark Ads — Organic Post ID','text',NULL,'TikTok post ID or URL to boost as a Spark Ad.',false,'[]'::jsonb,
     '{"fieldKey":"ad_format","operator":"contains","value":"spark_ads","action":"show"}'::jsonb,
     3,'Creative & Content','Specs','half',3),
    (tmpl_id,'video_concept','Video Concept','richtext',NULL,NULL,true,'[]'::jsonb,NULL,3,'Creative & Content','Content','full',4),
    (tmpl_id,'ad_text','Ad Text/Caption','textarea',NULL,NULL,true,'[]'::jsonb,NULL,3,'Creative & Content','Copy','full',5),
    (tmpl_id,'cta_button','Call to Action','dropdown',NULL,NULL,true,
     '[{"label":"Learn More","value":"learn_more"},{"label":"Shop Now","value":"shop_now"},{"label":"Sign Up","value":"sign_up"},{"label":"Download","value":"download"},{"label":"Contact Us","value":"contact_us"},{"label":"Apply Now","value":"apply_now"},{"label":"Book Now","value":"book_now"},{"label":"Get Quote","value":"get_quote"},{"label":"Watch More","value":"watch_more"}]'::jsonb,
     NULL,3,'Creative & Content','Copy','half',6),
    (tmpl_id,'hashtags','Suggested Hashtags','textarea',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative & Content','Discovery','half',7),
    (tmpl_id,'music_preference','Music/Sound','dropdown',NULL,NULL,true,
     '[{"label":"Use Trending Sound","value":"trending_sound"},{"label":"Original Audio/Voiceover","value":"original_audio"},{"label":"Licensed Music","value":"licensed_music"},{"label":"No Sound (Not Recommended)","value":"no_sound"}]'::jsonb,
     NULL,3,'Creative & Content','Audio','half',8),
    (tmpl_id,'video_assets','Video Assets','files',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative & Content','Assets','full',9),
    (tmpl_id,'creative_notes','Creative Direction Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative & Content','Notes','full',10),

    -- Step 4: Budget & Schedule
    (tmpl_id,'budget_type','Budget Type','radio',NULL,NULL,true,
     '[{"label":"Daily","value":"daily"},{"label":"Lifetime","value":"lifetime"}]'::jsonb,
     NULL,4,'Budget & Schedule','Budget','half',1),
    (tmpl_id,'budget_amount','Budget Amount ($)','currency',NULL,NULL,true,'[]'::jsonb,NULL,4,'Budget & Schedule','Budget','half',2),
    (tmpl_id,'bid_strategy','Bid Strategy','dropdown',NULL,NULL,false,
     '[{"label":"Lowest Cost","value":"lowest_cost"},{"label":"Cost Cap","value":"cost_cap"},{"label":"Bid Cap","value":"bid_cap"}]'::jsonb,
     NULL,4,'Budget & Schedule','Budget','half',3),
    (tmpl_id,'start_date','Start Date','date',NULL,NULL,true,'[]'::jsonb,NULL,4,'Budget & Schedule','Schedule','half',4),
    (tmpl_id,'end_date','End Date','date',NULL,NULL,false,'[]'::jsonb,NULL,4,'Budget & Schedule','Schedule','half',5),
    (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,4,'Budget & Schedule','Other','full',6),

    -- Step 5: Offer & Accountability — Tier A + tiktok-specific tracking + acct_*
    -- Tier A: Offer block (section 'Offer & Compliance')
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
    -- TikTok tracking fields
    (tmpl_id,'tiktok_pixel_id','TikTok Pixel ID','text',NULL,'Required for website conversion tracking.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Tracking','half',10),
    (tmpl_id,'lead_form_name','Lead Generation Form Name','text',NULL,'TikTok native lead gen form name or ID.',false,'[]'::jsonb,
     '{"fieldKey":"advertising_objective","operator":"equals","value":"lead_generation","action":"show"}'::jsonb,
     5,'Offer & Accountability','Tracking','half',11),
    -- acct_* Accountability block
    (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',12),
    (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,
     '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
     5,'Offer & Accountability','Accountability','half',13),
    (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
     '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
     NULL,5,'Offer & Accountability','Accountability','full',14)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET
  require_client_link=true,
  description='TikTok paid campaigns for automotive dealers — video creative, audience, offer compliance & accountability.'
WHERE slug='tiktok-ads';


-- ============================================================
-- REWORK 2: display-banner
-- Assembly: 22 current − language_versions − background − additional_notes
--           + context_notes (merged) + retype key_message textarea→text
--           + fix custom_sizes conditional + add Carsales sizes + Carsales network
--           + Tier A (9) + acct_* (3) = 32 fields
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='display-banner';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id=tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text,
     is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES
    -- Step 1: Campaign Overview
    (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Overview','Basic Information','full',1),
    (tmpl_id,'project_name','Campaign Name','text','e.g. Mazda EOFY Display — June',NULL,true,'[]'::jsonb,NULL,1,'Campaign Overview','Basic Information','full',2),
    (tmpl_id,'campaign_objective','Campaign Objective','dropdown',NULL,NULL,true,
     '[{"label":"Brand Awareness","value":"awareness"},{"label":"Traffic/Clicks","value":"traffic"},{"label":"Conversions/Sales","value":"conversions"},{"label":"Retargeting","value":"retargeting"},{"label":"App Install","value":"app_install"},{"label":"Event Promotion","value":"event"}]'::jsonb,
     NULL,1,'Campaign Overview','Basic Information','half',3),
    (tmpl_id,'landing_url','Landing Page URL','url',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Overview','Basic Information','half',4),

    -- Step 2: Specs & Distribution
    (tmpl_id,'banner_sizes','Required Banner Sizes','checkboxgroup',NULL,NULL,true,
     '[{"label":"300x250 (Medium Rectangle)","value":"300x250"},{"label":"728x90 (Leaderboard)","value":"728x90"},{"label":"160x600 (Wide Skyscraper)","value":"160x600"},{"label":"320x50 (Mobile Leaderboard)","value":"320x50"},{"label":"300x600 (Half Page)","value":"300x600"},{"label":"300x600 (Carsales Half Page)","value":"300x600_carsales"},{"label":"970x250 (Billboard)","value":"970x250"},{"label":"970x250 (Carsales Billboard)","value":"970x250_carsales"},{"label":"336x280 (Large Rectangle)","value":"336x280"},{"label":"320x100 (Large Mobile)","value":"320x100"},{"label":"250x250 (Square)","value":"250x250"},{"label":"970x90 (Large Leaderboard)","value":"970x90"},{"label":"468x60 (Banner)","value":"468x60"},{"label":"Custom Size","value":"custom"}]'::jsonb,
     NULL,2,'Specs & Distribution','Banner Sizes','full',1),
    (tmpl_id,'custom_sizes','Custom Sizes','textarea','e.g. 480x320, 640x100','Specify custom dimensions (width × height in px).',false,'[]'::jsonb,
     '{"fieldKey":"banner_sizes","operator":"contains","value":"custom","action":"show"}'::jsonb,
     2,'Specs & Distribution','Banner Sizes','full',2),
    (tmpl_id,'banner_format','Banner Format','checkboxgroup',NULL,NULL,true,
     '[{"label":"Static (JPG/PNG)","value":"static"},{"label":"Animated (GIF)","value":"gif"},{"label":"HTML5 Animated","value":"html5"},{"label":"Responsive HTML5","value":"responsive_html5"},{"label":"AMP HTML","value":"amp"}]'::jsonb,
     NULL,2,'Specs & Distribution','Format','full',3),
    (tmpl_id,'ad_network','Target Ad Network','checkboxgroup',NULL,NULL,false,
     '[{"label":"Carsales","value":"carsales"},{"label":"Google Display Network","value":"gdn"},{"label":"Meta/Facebook Audience Network","value":"meta_an"},{"label":"DV360","value":"dv360"},{"label":"Amazon DSP","value":"amazon"},{"label":"Programmatic/Other DSP","value":"programmatic"},{"label":"Direct Publisher","value":"direct"}]'::jsonb,
     NULL,2,'Specs & Distribution','Distribution','full',4),
    (tmpl_id,'max_file_size','Max File Size','dropdown',NULL,NULL,false,
     '[{"label":"150KB (Google standard)","value":"150kb"},{"label":"200KB","value":"200kb"},{"label":"500KB","value":"500kb"},{"label":"1MB","value":"1mb"},{"label":"No limit","value":"none"}]'::jsonb,
     NULL,2,'Specs & Distribution','Constraints','half',5),
    (tmpl_id,'animation_duration','Animation Duration','dropdown',NULL,NULL,false,
     '[{"label":"15 seconds","value":"15s"},{"label":"30 seconds","value":"30s"},{"label":"No loop limit","value":"none"}]'::jsonb,
     NULL,2,'Specs & Distribution','Constraints','half',6),

    -- Step 3: Messaging & Assets
    (tmpl_id,'key_message','Key Message / Headline','text','e.g. Drive Away from $34,990','Single-line headline as it appears on the banner (max ~30 chars).',true,'[]'::jsonb,NULL,3,'Messaging & Assets','Messaging','full',1),
    (tmpl_id,'cta_text','Call-to-Action Text','text','e.g. Get Quote Today',NULL,true,'[]'::jsonb,NULL,3,'Messaging & Assets','Messaging','half',2),
    (tmpl_id,'offer_details','Offer/Promotion Details','textarea',NULL,NULL,false,'[]'::jsonb,NULL,3,'Messaging & Assets','Messaging','full',3),
    (tmpl_id,'brand_guidelines','Brand Guidelines / Assets','files',NULL,NULL,false,'[]'::jsonb,NULL,3,'Messaging & Assets','Assets','full',4),
    (tmpl_id,'colour_palette','Colour Requirements','textarea',NULL,'e.g. Primary #C8102E, white on dark background.',false,'[]'::jsonb,NULL,3,'Messaging & Assets','Assets','half',5),
    (tmpl_id,'reference_banners','Reference / Inspiration','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Messaging & Assets','Assets','full',6),
    (tmpl_id,'context_notes','Campaign Context / Notes','richtext',NULL,'Campaign background, brief history, and any additional creative or production notes.',false,'[]'::jsonb,NULL,3,'Messaging & Assets','Notes','full',7),

    -- Step 4: Timeline & Versions
    (tmpl_id,'due_date','Required Delivery Date','date',NULL,NULL,true,'[]'::jsonb,NULL,4,'Timeline & Versions','Timeline','half',1),
    (tmpl_id,'campaign_start','Campaign Go-Live Date','date',NULL,NULL,false,'[]'::jsonb,NULL,4,'Timeline & Versions','Timeline','half',2),
    (tmpl_id,'num_versions','Number of Creative Versions','dropdown',NULL,NULL,false,
     '[{"label":"1 version","value":"1"},{"label":"2 versions (A/B test)","value":"2"},{"label":"3 versions","value":"3"},{"label":"4+ versions","value":"4_plus"}]'::jsonb,
     NULL,4,'Timeline & Versions','Versions','half',3),

    -- Step 5: Offer & Accountability — Tier A + acct_*
    -- Tier A: Offer block
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
    -- acct_* Accountability block
    (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',10),
    (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,
     '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
     5,'Offer & Accountability','Accountability','half',11),
    (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
     '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
     NULL,5,'Offer & Accountability','Accountability','full',12)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET
  require_client_link=true,
  description='Display banner campaigns for automotive dealers — specs, Carsales sizes, offer compliance & accountability.'
WHERE slug='display-banner';


-- ============================================================
-- REWORK 3: media-plan
-- Assembly: 15 current + Tier C (5 fields) + new additions (4) + acct_* (3) = 27 fields
-- Tier C applied: auto_oem_brand, auto_dealer_locations, auto_vehicle_category (checkboxgroup
--   "segments"), auto_oem_incentive_period, auto_inventory_context — NOT full Tier A offer block.
-- acct_compliance_ack conditional_logic = NULL (no auto_driveaway_price in this template).
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='media-plan';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id=tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text,
     is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES
    -- Step 1: Plan Overview
    (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Plan Overview','Basic Information','full',1),
    (tmpl_id,'project_name','Campaign / Plan Name','text',NULL,NULL,true,'[]'::jsonb,NULL,1,'Plan Overview','Basic Information','full',2),
    (tmpl_id,'plan_type','Plan Type','dropdown',NULL,NULL,true,
     '[{"label":"Full Media Plan","value":"full_plan"},{"label":"Digital Media Plan","value":"digital"},{"label":"Channel Recommendation","value":"channel_rec"},{"label":"Budget Reallocation","value":"budget_realloc"},{"label":"Competitor Analysis","value":"competitor"},{"label":"Market Research","value":"market_research"}]'::jsonb,
     NULL,1,'Plan Overview','Type','half',3),
    (tmpl_id,'campaign_objective','Business Objective','richtext',NULL,NULL,true,'[]'::jsonb,NULL,1,'Plan Overview','Objectives','full',4),
    (tmpl_id,'kpis','Key Performance Indicators','textarea',NULL,NULL,true,'[]'::jsonb,NULL,1,'Plan Overview','Objectives','full',5),
    (tmpl_id,'target_audience','Target Audience','richtext',NULL,NULL,true,'[]'::jsonb,NULL,1,'Plan Overview','Audience','full',6),

    -- Step 2: Market & Channels
    (tmpl_id,'geographic_market','Geographic Market','textarea',NULL,NULL,true,'[]'::jsonb,NULL,2,'Market & Channels','Market','full',1),
    (tmpl_id,'campaign_dates','Campaign Dates','daterange',NULL,NULL,true,'[]'::jsonb,NULL,2,'Market & Channels','Timeline','half',2),
    (tmpl_id,'total_budget','Total Media Budget','dropdown',NULL,NULL,true,
     '[{"label":"Under $10,000","value":"under_10k"},{"label":"$10,000 - $50,000","value":"10k_50k"},{"label":"$50,000 - $150,000","value":"50k_150k"},{"label":"$150,000 - $500,000","value":"150k_500k"},{"label":"$500,000+","value":"500k_plus"},{"label":"TBD — need recommendation","value":"tbd"}]'::jsonb,
     NULL,2,'Market & Channels','Budget','half',3),
    (tmpl_id,'confirmed_budget','Confirmed Budget','currency',NULL,'Actual confirmed budget if known.',false,'[]'::jsonb,NULL,2,'Market & Channels','Budget','half',4),
    (tmpl_id,'channels','Channels to Consider','checkboxgroup',NULL,NULL,false,
     '[{"label":"Search (Google/Bing)","value":"search"},{"label":"Social (Meta, LinkedIn, TikTok)","value":"social"},{"label":"Display/Programmatic","value":"display"},{"label":"YouTube/Video","value":"video"},{"label":"TV","value":"tv"},{"label":"Radio","value":"radio"},{"label":"OOH/Billboard","value":"ooh"},{"label":"Print","value":"print"},{"label":"Influencer","value":"influencer"},{"label":"Email","value":"email"},{"label":"SEO/Content","value":"seo"},{"label":"All (full recommendation)","value":"all"}]'::jsonb,
     NULL,2,'Market & Channels','Channels','full',5),
    (tmpl_id,'existing_activity','Current / Previous Activity','richtext',NULL,NULL,false,'[]'::jsonb,NULL,2,'Market & Channels','History','full',6),
    (tmpl_id,'competitors','Key Competitors','textarea',NULL,NULL,false,'[]'::jsonb,NULL,2,'Market & Channels','Competitive','full',7),

    -- Step 3: Deliverables & Planning Context
    (tmpl_id,'deliverables','Required Deliverables','checkboxgroup',NULL,NULL,true,
     '[{"label":"Media plan document","value":"plan"},{"label":"Budget breakdown by channel","value":"budget"},{"label":"Media calendar","value":"calendar"},{"label":"Audience strategy","value":"audience"},{"label":"Competitive analysis","value":"competitive"},{"label":"Measurement framework","value":"measurement"},{"label":"Presentation deck","value":"presentation"}]'::jsonb,
     NULL,3,'Deliverables & Context','Deliverables','full',1),
    (tmpl_id,'due_date','Plan Due Date','date',NULL,NULL,true,'[]'::jsonb,NULL,3,'Deliverables & Context','Timeline','half',2),
    (tmpl_id,'creative_lead_time','Creative Production Lead Time','dropdown',NULL,'Time needed for creative assets before campaign launch.',false,
     '[{"label":"1 week","value":"1_week"},{"label":"2 weeks","value":"2_weeks"},{"label":"3 weeks","value":"3_weeks"},{"label":"4 weeks","value":"4_weeks"}]'::jsonb,
     NULL,3,'Deliverables & Context','Timeline','half',3),
    (tmpl_id,'vfacts_market_context','VFACTS / Market Context','textarea',NULL,'Current VFACTS position, market share, competitor context — essential for strategy.',false,'[]'::jsonb,NULL,3,'Deliverables & Context','Context','full',4),
    (tmpl_id,'seasonality','Seasonality / Key Dates','textarea',NULL,'e.g. EOFY, plate clearance, OEM incentive end dates, public holiday campaigns.',false,'[]'::jsonb,NULL,3,'Deliverables & Context','Context','full',5),
    (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Deliverables & Context','Other','full',6),

    -- Step 4: Automotive Context & Accountability — Tier C + acct_*
    -- Tier C: auto_oem_brand, auto_vehicle_category (checkboxgroup segments), auto_dealer_locations,
    --         auto_oem_incentive_period, auto_inventory_context
    (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — shapes OEM incentive period and co-op eligibility.',false,
     '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
     NULL,4,'Automotive Context & Accountability','Automotive Context','full',1),
    (tmpl_id,'auto_vehicle_category','Vehicle Segments to Focus On','checkboxgroup',NULL,'Which vehicle categories does this plan prioritise?',false,
     '[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,
     NULL,4,'Automotive Context & Accountability','Automotive Context','full',2),
    (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) / suburbs this plan covers.',false,'[]'::jsonb,NULL,4,'Automotive Context & Accountability','Automotive Context','full',3),
    (tmpl_id,'auto_oem_incentive_period','OEM Incentive / Co-op Period','text',NULL,'EOFY, plate-clearance, OEM bonus periods — these shape the media plan significantly.',false,'[]'::jsonb,NULL,4,'Automotive Context & Accountability','Automotive Context','half',4),
    (tmpl_id,'auto_inventory_context','Inventory Context','textarea',NULL,'e.g. "Overstocked on SUVs — push SUVs in media mix." Context drives channel allocation.',false,'[]'::jsonb,NULL,4,'Automotive Context & Accountability','Automotive Context','full',5),
    -- acct_* Accountability block
    -- acct_compliance_ack: no auto_driveaway_price in media-plan → conditional_logic = NULL
    (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,4,'Automotive Context & Accountability','Accountability','half',6),
    (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the strategy and media plan content is accurate and approved for client delivery.',false,'[]'::jsonb,NULL,4,'Automotive Context & Accountability','Accountability','half',7),
    (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
     '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
     NULL,4,'Automotive Context & Accountability','Accountability','full',8)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET
  require_client_link=true,
  description='Strategy & media planning for automotive dealers — channels, budget, VFACTS context, OEM incentive periods & accountability.'
WHERE slug='media-plan';


-- ============================================================
-- REWORK 4: influencer-campaign
-- Assembly: 16 current fields (all retained, keys rekeyed for
--   consistency) + automotive subset (3 fields: auto_vehicle_focus,
--   auto_offer_details, auto_dealer_locations) + influencer-specific
--   adds (geographic_requirement, exclusivity_restriction,
--   influencer_niche) + fix num_influencers + make usage_rights
--   required + acct_* (3, compliance_ack is_required=true,
--   conditional_logic=NULL) = 28 fields total.
-- acct_compliance_ack is_required=true: captures ACCC paid-partnership
--   disclosure acknowledgment (no driveaway_price → conditional=NULL).
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='influencer-campaign';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id=tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text,
     is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES
    -- Step 1: Campaign Overview
    (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Overview','Basic Information','full',1),
    (tmpl_id,'project_name','Campaign Name','text','e.g. Toyota EOFY Influencer Campaign',NULL,true,'[]'::jsonb,NULL,1,'Campaign Overview','Basic Information','full',2),
    (tmpl_id,'campaign_objective','Campaign Objective','dropdown',NULL,NULL,true,
     '[{"label":"Brand Awareness","value":"awareness"},{"label":"Product Launch","value":"launch"},{"label":"Sales/Conversions","value":"sales"},{"label":"Content Creation","value":"content"},{"label":"Event Promotion","value":"event"},{"label":"App Downloads","value":"app"}]'::jsonb,
     NULL,1,'Campaign Overview','Objectives','half',3),
    (tmpl_id,'campaign_dates','Campaign Dates','daterange',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Overview','Timeline','half',4),
    (tmpl_id,'target_audience','Target Audience','richtext',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Overview','Audience','full',5),
    (tmpl_id,'geographic_requirement','Geographic Requirement','text','e.g. Must be based in Melbourne / willing to travel to Frankston','Influencer must be local to the dealer market — non-negotiable for car dealer campaigns.',true,'[]'::jsonb,NULL,1,'Campaign Overview','Geographic','full',6),

    -- Step 2: Influencer Spec
    (tmpl_id,'platforms','Target Platforms','checkboxgroup',NULL,NULL,true,
     '[{"label":"Instagram","value":"instagram"},{"label":"TikTok","value":"tiktok"},{"label":"YouTube","value":"youtube"},{"label":"Facebook","value":"facebook"},{"label":"Twitter/X","value":"twitter"},{"label":"Blog","value":"blog"},{"label":"Podcast","value":"podcast"}]'::jsonb,
     NULL,2,'Influencer Spec','Platforms','full',1),
    (tmpl_id,'influencer_tier','Influencer Tier','checkboxgroup',NULL,NULL,true,
     '[{"label":"Nano (1K-10K followers)","value":"nano"},{"label":"Micro (10K-50K followers)","value":"micro"},{"label":"Mid-tier (50K-500K)","value":"mid"},{"label":"Macro (500K-1M)","value":"macro"},{"label":"Mega (1M+)","value":"mega"}]'::jsonb,
     NULL,2,'Influencer Spec','Size','half',2),
    (tmpl_id,'num_influencers','Number of Influencers','dropdown',NULL,NULL,true,
     '[{"label":"1-3","value":"1_3"},{"label":"4","value":"4"},{"label":"5-10","value":"5_10"},{"label":"10-20","value":"10_20"},{"label":"20+","value":"20_plus"}]'::jsonb,
     NULL,2,'Influencer Spec','Size','half',3),
    (tmpl_id,'influencer_niche','Influencer Niche / Category','checkboxgroup',NULL,'Preferred content niche for influencer selection.',false,
     '[{"label":"Automotive","value":"automotive"},{"label":"Family","value":"family"},{"label":"Lifestyle","value":"lifestyle"},{"label":"Finance","value":"finance"},{"label":"Local","value":"local"},{"label":"Other","value":"other"}]'::jsonb,
     NULL,2,'Influencer Spec','Niche','full',4),

    -- Step 3: Content & Messaging
    (tmpl_id,'content_deliverables','Content Deliverables Per Influencer','checkboxgroup',NULL,NULL,true,
     '[{"label":"Feed Post","value":"feed"},{"label":"Story Set (3-5 frames)","value":"stories"},{"label":"Reel/TikTok","value":"reel"},{"label":"YouTube Video","value":"youtube"},{"label":"Blog Post","value":"blog"},{"label":"Unboxing","value":"unboxing"},{"label":"Review","value":"review"},{"label":"Giveaway","value":"giveaway"}]'::jsonb,
     NULL,3,'Content & Messaging','Deliverables','full',1),
    (tmpl_id,'key_messages','Key Messages / Talking Points','richtext',NULL,NULL,true,'[]'::jsonb,NULL,3,'Content & Messaging','Messaging','full',2),
    (tmpl_id,'product_info','Product / Service Details','richtext',NULL,NULL,true,'[]'::jsonb,NULL,3,'Content & Messaging','Product','full',3),
    (tmpl_id,'exclusivity_restriction','Exclusivity / Competitor Restriction','textarea','e.g. Cannot promote competing dealers for 60 days','Prevents the influencer from promoting other dealers in the same market during or after this campaign.',false,'[]'::jsonb,NULL,3,'Content & Messaging','Restrictions','full',4),
    (tmpl_id,'exclusions','Content Restrictions','textarea',NULL,NULL,false,'[]'::jsonb,NULL,3,'Content & Messaging','Restrictions','full',5),
    (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Content & Messaging','Other','full',6),

    -- Step 4: Budget & Rights
    (tmpl_id,'total_budget','Total Campaign Budget','dropdown',NULL,NULL,true,
     '[{"label":"Under $5,000","value":"under_5k"},{"label":"$5,000 - $15,000","value":"5k_15k"},{"label":"$15,000 - $50,000","value":"15k_50k"},{"label":"$50,000 - $100,000","value":"50k_100k"},{"label":"$100,000+","value":"100k_plus"},{"label":"TBD","value":"tbd"}]'::jsonb,
     NULL,4,'Budget & Rights','Budget','half',1),
    (tmpl_id,'compensation_type','Compensation Model','checkboxgroup',NULL,NULL,true,
     '[{"label":"Paid fee","value":"paid"},{"label":"Product gifting","value":"gifting"},{"label":"Commission/affiliate","value":"commission"},{"label":"Contra/exchange","value":"contra"}]'::jsonb,
     NULL,4,'Budget & Rights','Budget','half',2),
    (tmpl_id,'usage_rights','Content Usage Rights','dropdown',NULL,'Governs whether ADME can boost influencer content as paid ads — significant financial and legal implication.',true,
     '[{"label":"Organic repost only","value":"organic"},{"label":"Paid amplification (30 days)","value":"paid_30"},{"label":"Full usage rights (12 months)","value":"full_12m"},{"label":"Perpetual usage","value":"perpetual"}]'::jsonb,
     NULL,4,'Budget & Rights','Rights','full',3),

    -- Step 5: Offer & Accountability
    -- Automotive subset: auto_vehicle_focus, auto_offer_details, auto_dealer_locations
    (tmpl_id,'auto_vehicle_focus','Vehicle(s) to Feature','text','e.g. 2024 Toyota RAV4 Hybrid','Make / model / year to be featured in the influencer content.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',1),
    (tmpl_id,'auto_offer_details','Offer / Promotion to Feature','textarea','e.g. Drive Away from $45,990 — EOFY Special','Specific deal or promotion the influencer should reference.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',2),
    (tmpl_id,'auto_dealer_locations','Dealer Location(s) to Feature','textarea','e.g. Berwick Toyota — 1 Clyde Rd Berwick','Showroom / test-drive location the influencer should reference or visit.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',3),
    -- acct_* Accountability block
    -- acct_compliance_ack is_required=true: ACCC paid-partnership disclosure requirement
    -- (no auto_driveaway_price in this template → conditional_logic=NULL)
    (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',4),
    (tmpl_id,'acct_compliance_ack','Compliance & Disclosure Confirmed','checkbox',NULL,'I confirm the influencer will disclose this as a paid partnership per ACCC guidelines, and all offer claims are accurate.',true,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',5),
    (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
     '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
     NULL,5,'Offer & Accountability','Accountability','full',6)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET
  require_client_link=true,
  description='Influencer campaigns for automotive dealers — influencer spec, content deliverables, ACCC disclosure & accountability.'
WHERE slug='influencer-campaign';


-- ============================================================
-- REWORK 5: graphic-design
-- Assembly: 10 current fields (rekeyed for consistency) + full
--   Tier A offer block (9 fields) + new automotive deltas
--   (extend design_type, retype dimensions→dropdown + custom
--   conditional, add output_format, add num_sizes) + acct_* (3)
--   = 27 fields total.
-- Full Tier A means auto_driveaway_price present →
--   auto_offer_disclaimer + acct_compliance_ack keep their
--   is_not_empty conditional.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='graphic-design';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id=tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text,
     is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES
    -- Step 1: Brief Details
    (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Brief Details','Basic Information','full',1),
    (tmpl_id,'project_name','Request Title','text','e.g. Toyota EOFY Social Tiles',NULL,true,'[]'::jsonb,NULL,1,'Brief Details','Basic Information','full',2),
    (tmpl_id,'design_type','Design Type','dropdown',NULL,NULL,true,
     '[{"label":"Social Media Graphic","value":"social"},{"label":"Presentation / Pitch Deck","value":"presentation"},{"label":"Infographic","value":"infographic"},{"label":"Email Header / Banner","value":"email"},{"label":"Web Banner / Hero","value":"web_banner"},{"label":"Icon Set","value":"icons"},{"label":"Illustration","value":"illustration"},{"label":"Report / Document Layout","value":"report"},{"label":"Vehicle Wrap","value":"vehicle_wrap"},{"label":"Carsales Banner / Card","value":"carsales_banner"},{"label":"OOH / Billboard","value":"ooh_billboard"},{"label":"Pull-up Banner","value":"pullup_banner"},{"label":"Mirror Hangers","value":"mirror_hangers"},{"label":"Newspaper Ad","value":"newspaper_ad"},{"label":"Email Signature","value":"email_signature"},{"label":"Business Card","value":"business_card"},{"label":"Other","value":"other"}]'::jsonb,
     NULL,1,'Brief Details','Type','full',3),
    (tmpl_id,'dimensions','Size / Dimensions','dropdown',NULL,'Select the common size or choose Custom to specify.',true,
     '[{"label":"A4 (210 × 297mm)","value":"a4"},{"label":"A5 (148 × 210mm)","value":"a5"},{"label":"A3 (297 × 420mm)","value":"a3"},{"label":"DL (99 × 210mm)","value":"dl"},{"label":"1200 × 628px (Social/Web)","value":"1200x628"},{"label":"1080 × 1080px (Square Social)","value":"1080x1080"},{"label":"1080 × 1920px (Story/Reel)","value":"1080x1920"},{"label":"300 × 250px (Display Rectangle)","value":"300x250"},{"label":"728 × 90px (Leaderboard)","value":"728x90"},{"label":"Custom","value":"custom"}]'::jsonb,
     NULL,1,'Brief Details','Specs','half',4),
    (tmpl_id,'custom_dimensions','Custom Size / Dimensions','text','e.g. 480 × 320mm or 640 × 100px','Specify custom width × height with units.',false,'[]'::jsonb,
     '{"fieldKey":"dimensions","operator":"equals","value":"custom","action":"show"}'::jsonb,
     1,'Brief Details','Specs','half',5),
    (tmpl_id,'num_sizes','Number of Sizes / Formats','number',NULL,'How many resize variants or size combinations are required.',true,'[]'::jsonb,NULL,1,'Brief Details','Specs','half',6),
    (tmpl_id,'output_format','Output Format','checkboxgroup',NULL,NULL,false,
     '[{"label":"Print-ready PDF","value":"print_pdf"},{"label":"Digital (PNG/JPG)","value":"digital"},{"label":"Source files (AI/PSD/Figma)","value":"source"},{"label":"Both print + digital","value":"both"}]'::jsonb,
     NULL,1,'Brief Details','Specs','half',7),

    -- Step 2: Content & Assets
    (tmpl_id,'description','Description & Requirements','richtext',NULL,NULL,true,'[]'::jsonb,NULL,2,'Content & Assets','Content','full',1),
    (tmpl_id,'copy_text','Copy / Text Content','richtext',NULL,NULL,false,'[]'::jsonb,NULL,2,'Content & Assets','Content','full',2),
    (tmpl_id,'brand_assets','Brand Assets / Reference','files',NULL,NULL,false,'[]'::jsonb,NULL,2,'Content & Assets','Assets','full',3),
    (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,2,'Content & Assets','Other','full',4),

    -- Step 3: Timeline
    (tmpl_id,'due_date','Due Date','date',NULL,NULL,true,'[]'::jsonb,NULL,3,'Timeline','Timeline','half',1),
    (tmpl_id,'priority','Priority','dropdown',NULL,NULL,true,
     '[{"label":"Low","value":"low"},{"label":"Normal","value":"normal"},{"label":"High","value":"high"},{"label":"Urgent","value":"urgent"}]'::jsonb,
     NULL,3,'Timeline','Timeline','half',2),

    -- Step 4: Offer & Accountability — full Tier A + acct_*
    -- Tier A: Offer block (section 'Offer & Compliance')
    (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,
     '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
     NULL,4,'Offer & Accountability','Offer & Compliance','full',1),
    (tmpl_id,'auto_vehicle_focus','Vehicle(s) Featured','text','e.g. 2024 Mazda CX-5 Touring','Make / model / year being promoted.',false,'[]'::jsonb,NULL,4,'Offer & Accountability','Offer & Compliance','half',2),
    (tmpl_id,'auto_vehicle_category','Vehicle Category','dropdown',NULL,'Drives offer type and audience.',false,
     '[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,
     NULL,4,'Offer & Accountability','Offer & Compliance','half',3),
    (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. $500 cashback + 3.9% comparison rate','The specific deal the ad features.',false,'[]'::jsonb,NULL,4,'Offer & Accountability','Offer & Compliance','full',4),
    (tmpl_id,'auto_driveaway_price','Drive-Away / EGC Price','text','e.g. Drive Away from $34,990','Price/wording as it must appear. Text — values are ranges/wording.',false,'[]'::jsonb,NULL,4,'Offer & Accountability','Offer & Compliance','half',5),
    (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC).',false,'[]'::jsonb,
     '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
     4,'Offer & Accountability','Offer & Compliance','full',6),
    (tmpl_id,'auto_oem_coop','OEM Co-op Funded?','radio',NULL,'If yes, OEM brand guidelines + approval apply.',false,
     '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,
     NULL,4,'Offer & Accountability','Offer & Compliance','half',7),
    (tmpl_id,'auto_oem_assets','OEM Brand Guidelines / Assets','files',NULL,'OEM-supplied guidelines / approved assets.',false,'[]'::jsonb,
     '{"fieldKey":"auto_oem_coop","operator":"equals","value":"yes","action":"show"}'::jsonb,
     4,'Offer & Accountability','Offer & Compliance','full',8),
    (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this is for.',false,'[]'::jsonb,NULL,4,'Offer & Accountability','Offer & Compliance','full',9),
    -- acct_* Accountability block
    (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,4,'Offer & Accountability','Accountability','half',10),
    (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,
     '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,
     4,'Offer & Accountability','Accountability','half',11),
    (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
     '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
     NULL,4,'Offer & Accountability','Accountability','full',12)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET
  require_client_link=true,
  requires_approval=true,
  description='Graphic design requests for automotive dealers — automotive design types, sizing, output format, offer compliance & accountability.'
WHERE slug='graphic-design';


-- ============================================================
-- REWORK 6: brand-identity
-- Assembly: 16 current fields (all retained, sort order adjusted)
--   + automotive: auto_oem_brand ONLY (optional compliance flag)
--   + brand-specific adds: revision_rounds, current_brand_audit,
--     franchise_type + make num_concepts REQUIRED
--   + sort order fix: project_type moved up near client fields
--   + acct_* (3, compliance_ack conditional=NULL — no driveaway)
--   = 22 fields total.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='brand-identity';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id=tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text,
     is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES
    -- Step 1: Project Overview
    -- project_type moved up near client fields per audit sort-order fix
    (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Project Overview','Basic Information','full',1),
    (tmpl_id,'project_name','Project Name','text','e.g. Berwick Toyota Rebrand',NULL,true,'[]'::jsonb,NULL,1,'Project Overview','Basic Information','full',2),
    (tmpl_id,'project_type','Project Type','dropdown',NULL,NULL,true,
     '[{"label":"New Logo Design","value":"new_logo"},{"label":"Logo Refresh/Update","value":"logo_refresh"},{"label":"Full Brand Identity","value":"full_identity"},{"label":"Brand Extension","value":"extension"},{"label":"Sub-brand","value":"sub_brand"}]'::jsonb,
     NULL,1,'Project Overview','Type','half',3),
    (tmpl_id,'franchise_type','Franchise Type','dropdown',NULL,'Determines OEM co-op fund eligibility and brand compliance requirements.',false,
     '[{"label":"New car dealer","value":"new_car"},{"label":"Used car dealer","value":"used_car"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent","value":"independent"},{"label":"OEM direct","value":"oem_direct"}]'::jsonb,
     NULL,1,'Project Overview','Type','half',4),
    (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'If OEM-affiliated, the parent brand constrains logo colours, type, and placement — flag here for compliance review.',false,
     '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
     NULL,1,'Project Overview','Type','full',5),

    -- Step 2: Brand Context
    (tmpl_id,'business_description','About the Business','richtext',NULL,NULL,true,'[]'::jsonb,NULL,2,'Brand Context','Context','full',1),
    (tmpl_id,'target_audience','Target Audience','richtext',NULL,NULL,true,'[]'::jsonb,NULL,2,'Brand Context','Context','full',2),
    (tmpl_id,'competitors','Key Competitors','textarea',NULL,NULL,false,'[]'::jsonb,NULL,2,'Brand Context','Context','full',3),
    (tmpl_id,'brand_values','Brand Values / Personality','multiselect',NULL,NULL,true,
     '[{"label":"Modern","value":"modern"},{"label":"Traditional","value":"traditional"},{"label":"Luxury","value":"luxury"},{"label":"Affordable","value":"affordable"},{"label":"Playful","value":"playful"},{"label":"Serious","value":"serious"},{"label":"Innovative","value":"innovative"},{"label":"Trustworthy","value":"trustworthy"},{"label":"Bold","value":"bold"},{"label":"Minimal","value":"minimal"}]'::jsonb,
     NULL,2,'Brand Context','Personality','full',4),

    -- Step 3: Visual Direction
    (tmpl_id,'style_direction','Style Direction','checkboxgroup',NULL,NULL,false,
     '[{"label":"Wordmark (text-based)","value":"wordmark"},{"label":"Icon/Symbol","value":"icon"},{"label":"Combination Mark","value":"combo"},{"label":"Emblem","value":"emblem"},{"label":"Abstract","value":"abstract"},{"label":"Mascot","value":"mascot"},{"label":"No preference","value":"no_pref"}]'::jsonb,
     NULL,3,'Visual Direction','Visual','full',1),
    (tmpl_id,'colour_preferences','Colour Preferences','textarea',NULL,NULL,false,'[]'::jsonb,NULL,3,'Visual Direction','Visual','full',2),
    (tmpl_id,'inspiration','Brands You Admire','richtext',NULL,NULL,false,'[]'::jsonb,NULL,3,'Visual Direction','References','full',3),

    -- Step 4: Scope & Deliverables
    (tmpl_id,'deliverables','Required Deliverables','checkboxgroup',NULL,NULL,true,
     '[{"label":"Primary Logo","value":"primary_logo"},{"label":"Logo Variations (horizontal, stacked, icon)","value":"logo_variations"},{"label":"Colour Palette","value":"colours"},{"label":"Typography System","value":"typography"},{"label":"Brand Guidelines PDF","value":"guidelines"},{"label":"Business Card Design","value":"business_card"},{"label":"Letterhead & Stationery","value":"stationery"},{"label":"Social Media Templates","value":"social_templates"},{"label":"Email Signature","value":"email_sig"},{"label":"Favicon & App Icon","value":"favicon"}]'::jsonb,
     NULL,4,'Scope & Deliverables','Deliverables','full',1),
    (tmpl_id,'num_concepts','Number of Initial Concepts','dropdown',NULL,'Directly scopes the job — required.',true,
     '[{"label":"2 concepts","value":"2"},{"label":"3 concepts","value":"3"},{"label":"5 concepts","value":"5"}]'::jsonb,
     NULL,4,'Scope & Deliverables','Concepts','half',2),
    (tmpl_id,'revision_rounds','Revision Rounds Included','dropdown',NULL,'Sets expectations for the number of revision cycles included in scope.',false,
     '[{"label":"1 round","value":"1"},{"label":"2 rounds","value":"2"},{"label":"3 rounds","value":"3"},{"label":"Unlimited","value":"unlimited"}]'::jsonb,
     NULL,4,'Scope & Deliverables','Concepts','half',3),
    (tmpl_id,'current_brand_audit','Current Brand Audit','dropdown',NULL,'How much reference material exists — helps the designer calibrate starting point.',false,
     '[{"label":"No existing brand","value":"none"},{"label":"Logo only","value":"logo_only"},{"label":"Partial brand (logo + some assets)","value":"partial"},{"label":"Full brand guidelines","value":"full"}]'::jsonb,
     NULL,4,'Scope & Deliverables','Concepts','half',4),
    (tmpl_id,'existing_assets','Existing Brand Assets','files',NULL,NULL,false,'[]'::jsonb,NULL,4,'Scope & Deliverables','Assets','full',5),
    (tmpl_id,'due_date','Concept Presentation Date','date',NULL,NULL,true,'[]'::jsonb,NULL,4,'Scope & Deliverables','Timeline','half',6),
    (tmpl_id,'budget_range','Budget','dropdown',NULL,NULL,true,
     '[{"label":"Under $3,000","value":"under_3k"},{"label":"$3,000 - $8,000","value":"3k_8k"},{"label":"$8,000 - $20,000","value":"8k_20k"},{"label":"$20,000+","value":"20k_plus"},{"label":"TBD","value":"tbd"}]'::jsonb,
     NULL,4,'Scope & Deliverables','Budget','half',7),
    (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,4,'Scope & Deliverables','Other','full',8),

    -- Step 5: Accountability
    -- acct_compliance_ack conditional=NULL (no auto_driveaway_price in this template)
    (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Accountability','Accountability','half',1),
    (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the brief is accurate and approved for creative commencement.',false,'[]'::jsonb,NULL,5,'Accountability','Accountability','half',2),
    (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
     '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,
     NULL,5,'Accountability','Accountability','full',3)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET
  require_client_link=true,
  description='Logo & brand identity projects for automotive dealers — OEM compliance, franchise type, revision scope & accountability.'
WHERE slug='brand-identity';
