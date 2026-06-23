-- ============================================
-- 193 · Brief Templates Pass 2 — REWORKS (first 3 of 16 deferred)
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
