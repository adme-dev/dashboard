-- ============================================
-- 196 · Brief Templates Pass 1 — NEW templates
-- Meta AIA, Google PMax, Newspaper Ad, SMS/MMS
-- Pattern: INSERT template ON CONFLICT DO NOTHING + DO $$ field block.
-- Idempotent. Spec: docs/superpowers/specs/2026-06-23-brief-templates-automotive-design.md
-- ============================================

-- ---- Meta AIA ----
INSERT INTO brief_templates (category_id, slug, name, description, icon, requires_approval, is_multi_step, default_priority, require_client_link, sort_order)
SELECT c.id, 'meta-aia', 'Meta Automotive Inventory Ads',
  'Dynamic vehicle inventory ads on Facebook/Instagram — feed, vehicle set, creative templates, offer & compliance.',
  'i-lucide-car', true, true, 'high', true, 20
FROM brief_categories c WHERE c.slug='digital-marketing'
ON CONFLICT (category_id, slug) DO NOTHING;

DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='meta-aia';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order) VALUES
  -- S1 Campaign Setup
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Basics','full',1),
  (tmpl_id,'campaign_name','Campaign Name','text','e.g. Mazda New-Car AIA — June',NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Basics','full',2),
  (tmpl_id,'meta_ad_account_id','Meta Ad Account ID','text','act_XXXXXXXXXX',NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Basics','half',3),
  (tmpl_id,'objective','Objective','dropdown',NULL,NULL,true,'[{"label":"Traffic","value":"traffic"},{"label":"Leads","value":"leads"},{"label":"Sales","value":"sales"}]'::jsonb,NULL,1,'Campaign Setup','Basics','half',4),
  (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,'[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,NULL,1,'Campaign Setup','Basics','half',5),
  -- S2 Inventory & Feed
  (tmpl_id,'auto_catalogue_id','Product Catalogue / Feed ID','text',NULL,'Meta vehicle catalogue ID.',true,'[]'::jsonb,NULL,2,'Inventory & Feed','Feed','half',1),
  (tmpl_id,'auto_stock_feed_url','Stock / Inventory Feed URL','url','https://feed.autogate.com.au/...','Autogate / dealer DMS export.',false,'[]'::jsonb,NULL,2,'Inventory & Feed','Feed','half',2),
  (tmpl_id,'feed_partner','Feed Partner','dropdown',NULL,NULL,false,'[{"label":"Autogate","value":"autogate"},{"label":"CarLoop","value":"carloop"},{"label":"Dealer DMS","value":"dms"},{"label":"Meta-direct","value":"meta"},{"label":"Other","value":"other"}]'::jsonb,NULL,2,'Inventory & Feed','Feed','half',3),
  (tmpl_id,'vehicle_set_filter','Vehicle Set Filter','textarea','e.g. New Mazda under $40k',NULL,false,'[]'::jsonb,NULL,2,'Inventory & Feed','Feed','full',4),
  (tmpl_id,'auto_vehicle_category','Vehicle Category','checkboxgroup',NULL,NULL,false,'[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"}]'::jsonb,NULL,2,'Inventory & Feed','Feed','full',5),
  -- S3 Creative & Copy
  (tmpl_id,'ad_format','Ad Format','checkboxgroup',NULL,NULL,true,'[{"label":"Single image","value":"single"},{"label":"Carousel","value":"carousel"},{"label":"Collection","value":"collection"}]'::jsonb,NULL,3,'Creative & Copy','Creative','full',1),
  (tmpl_id,'primary_text','Primary Text','textarea',NULL,NULL,true,'[]'::jsonb,NULL,3,'Creative & Copy','Creative','full',2),
  (tmpl_id,'headline_template','Headline Template','text','{{make}} {{model}} from {{price}}','Supports {{make}} {{model}} {{price}} tokens.',false,'[]'::jsonb,NULL,3,'Creative & Copy','Creative','full',3),
  (tmpl_id,'description_template','Description Template','text',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative & Copy','Creative','full',4),
  (tmpl_id,'cta','Call to Action','dropdown',NULL,NULL,true,'[{"label":"Learn More","value":"learn_more"},{"label":"Shop Now","value":"shop_now"},{"label":"Get Offer","value":"get_offer"},{"label":"Book Now","value":"book_now"}]'::jsonb,NULL,3,'Creative & Copy','Creative','half',5),
  (tmpl_id,'creative_assets','Creative Assets','files',NULL,NULL,false,'[]'::jsonb,NULL,3,'Creative & Copy','Creative','full',6),
  -- S4 Targeting & Budget
  (tmpl_id,'budget_type','Budget Type','radio',NULL,NULL,true,'[{"label":"Daily","value":"daily"},{"label":"Lifetime","value":"lifetime"}]'::jsonb,NULL,4,'Targeting & Budget','Budget','half',1),
  (tmpl_id,'budget_amount','Budget Amount','currency',NULL,NULL,true,'[]'::jsonb,NULL,4,'Targeting & Budget','Budget','half',2),
  (tmpl_id,'audience','Audience','textarea','retargeting / in-market auto',NULL,false,'[]'::jsonb,NULL,4,'Targeting & Budget','Targeting','full',3),
  (tmpl_id,'locations','Target Locations','textarea',NULL,NULL,true,'[]'::jsonb,NULL,4,'Targeting & Budget','Targeting','full',4),
  (tmpl_id,'start_date','Start Date','date',NULL,NULL,true,'[]'::jsonb,NULL,4,'Targeting & Budget','Schedule','half',5),
  (tmpl_id,'end_date','End Date','date',NULL,NULL,false,'[]'::jsonb,NULL,4,'Targeting & Budget','Schedule','half',6),
  -- S5 Offer & Accountability  (Tier A block @ sort 1-9, then meta extras, then acct block)
  (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. $500 cashback + 3.9% comparison rate','The specific deal the ad features.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',1),
  (tmpl_id,'auto_driveaway_price','Drive-Away / EGC Price','text','e.g. Drive Away from $34,990','Price/wording as it must appear.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',2),
  (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS, drive-away terms, comparison-rate wording (ACCC/ASIC).',false,'[]'::jsonb,'{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,5,'Offer & Accountability','Offer & Compliance','full',3),
  (tmpl_id,'auto_oem_coop','OEM Co-op Funded?','radio',NULL,'If yes, OEM guidelines + approval apply.',false,'[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',4),
  (tmpl_id,'auto_oem_assets','OEM Brand Guidelines / Assets','files',NULL,NULL,false,'[]'::jsonb,'{"fieldKey":"auto_oem_coop","operator":"equals","value":"yes","action":"show"}'::jsonb,5,'Offer & Accountability','Offer & Compliance','full',5),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea',NULL,'Which rooftop(s) this is for.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',6),
  (tmpl_id,'meta_pixel_id','Meta Pixel ID','text',NULL,NULL,false,'[]'::jsonb,NULL,5,'Offer & Accountability','Tracking','half',7),
  (tmpl_id,'lead_form_name','Lead Form Name','text',NULL,NULL,false,'[]'::jsonb,'{"fieldKey":"objective","operator":"equals","value":"leads","action":"show"}'::jsonb,5,'Offer & Accountability','Tracking','half',8),
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',9),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,'{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,5,'Offer & Accountability','Accountability','half',10),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Copilots will not auto-proceed past proposed until satisfied.',false,'[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,NULL,5,'Offer & Accountability','Accountability','full',11)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

-- ---- Google Performance Max ----
INSERT INTO brief_templates (category_id, slug, name, description, icon, requires_approval, is_multi_step, default_priority, require_client_link, sort_order)
SELECT c.id, 'google-pmax', 'Google Performance Max',
  'Google Performance Max campaigns — asset groups, feed, audience signals, offer & compliance.',
  'i-lucide-trending-up', true, true, 'high', true, 21
FROM brief_categories c WHERE c.slug='digital-marketing'
ON CONFLICT (category_id, slug) DO NOTHING;

DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='google-pmax';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order) VALUES
  -- S1 Setup
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Setup','Basics','full',1),
  (tmpl_id,'campaign_name','Campaign Name','text',NULL,NULL,true,'[]'::jsonb,NULL,1,'Setup','Basics','full',2),
  (tmpl_id,'pmax_type','Campaign Type','dropdown',NULL,NULL,true,'[{"label":"Standard","value":"standard"},{"label":"Inventory (Vehicle Ads)","value":"inventory"}]'::jsonb,NULL,1,'Setup','Basics','half',3),
  (tmpl_id,'conversion_goal','Conversion Goal','dropdown',NULL,NULL,true,'[{"label":"Leads","value":"leads"},{"label":"Sales","value":"sales"},{"label":"Calls","value":"calls"},{"label":"Store visits","value":"store_visits"}]'::jsonb,NULL,1,'Setup','Basics','half',4),
  (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,'[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,NULL,1,'Setup','Basics','half',5),
  -- S2 Feed
  (tmpl_id,'merchant_centre_id','Google Merchant Centre ID','text',NULL,NULL,false,'[]'::jsonb,'{"fieldKey":"pmax_type","operator":"equals","value":"inventory","action":"require"}'::jsonb,2,'Feed','Feed','half',1),
  (tmpl_id,'auto_stock_feed_url','Stock / Inventory Feed URL','url','https://feed.autogate.com.au/...','Autogate / dealer DMS export / Merchant Centre feed.',false,'[]'::jsonb,'{"fieldKey":"pmax_type","operator":"equals","value":"inventory","action":"show"}'::jsonb,2,'Feed','Feed','half',2),
  (tmpl_id,'feed_partner','Feed Partner','dropdown',NULL,NULL,false,'[{"label":"Autogate","value":"autogate"},{"label":"CarLoop","value":"carloop"},{"label":"Dealer DMS","value":"dms"},{"label":"Other","value":"other"}]'::jsonb,NULL,2,'Feed','Feed','half',3),
  -- S3 Asset Group
  (tmpl_id,'asset_group_name','Asset Group Name','text',NULL,NULL,true,'[]'::jsonb,NULL,3,'Asset Group','Assets','full',1),
  (tmpl_id,'final_url','Final URL','url',NULL,NULL,true,'[]'::jsonb,NULL,3,'Asset Group','Assets','full',2),
  (tmpl_id,'business_name','Business Name','text',NULL,NULL,true,'[]'::jsonb,NULL,3,'Asset Group','Assets','half',3),
  (tmpl_id,'headlines','Headlines','textarea',NULL,'Up to 15, ≤30 chars each.',true,'[]'::jsonb,NULL,3,'Asset Group','Assets','full',4),
  (tmpl_id,'long_headlines','Long Headlines','textarea',NULL,'≤90 chars.',false,'[]'::jsonb,NULL,3,'Asset Group','Assets','full',5),
  (tmpl_id,'descriptions','Descriptions','textarea',NULL,'≤90 chars.',true,'[]'::jsonb,NULL,3,'Asset Group','Assets','full',6),
  (tmpl_id,'images','Images','images',NULL,NULL,false,'[]'::jsonb,NULL,3,'Asset Group','Assets','full',7),
  (tmpl_id,'logos','Logos','files',NULL,NULL,false,'[]'::jsonb,NULL,3,'Asset Group','Assets','half',8),
  (tmpl_id,'video_links','Video Links','textarea',NULL,'YouTube URLs.',false,'[]'::jsonb,NULL,3,'Asset Group','Assets','full',9),
  (tmpl_id,'audience_signals','Audience Signals','textarea',NULL,NULL,true,'[]'::jsonb,NULL,3,'Asset Group','Assets','full',10),
  -- S4 Budget & Geo
  (tmpl_id,'daily_budget','Daily Budget','currency',NULL,NULL,true,'[]'::jsonb,NULL,4,'Budget & Geo','Budget','half',1),
  (tmpl_id,'bidding','Bidding Strategy','dropdown',NULL,NULL,true,'[{"label":"Max Conversions","value":"max_conversions"},{"label":"Max Conversion Value","value":"max_value"},{"label":"Target CPA","value":"target_cpa"},{"label":"Target ROAS","value":"target_roas"}]'::jsonb,NULL,4,'Budget & Geo','Budget','half',2),
  (tmpl_id,'target_cpa_roas','Target CPA / ROAS','number',NULL,NULL,false,'[]'::jsonb,NULL,4,'Budget & Geo','Budget','half',3),
  (tmpl_id,'locations','Target Locations','textarea',NULL,NULL,true,'[]'::jsonb,NULL,4,'Budget & Geo','Budget','full',4),
  (tmpl_id,'languages','Languages','multiselect',NULL,'English default.',false,'[{"label":"English","value":"en"},{"label":"Mandarin","value":"zh"},{"label":"Arabic","value":"ar"},{"label":"Vietnamese","value":"vi"},{"label":"Greek","value":"el"},{"label":"Italian","value":"it"},{"label":"Other","value":"other"}]'::jsonb,NULL,4,'Budget & Geo','Budget','half',5),
  (tmpl_id,'start_date','Start Date','date',NULL,NULL,true,'[]'::jsonb,NULL,4,'Budget & Geo','Budget','half',6),
  (tmpl_id,'end_date','End Date','date',NULL,NULL,false,'[]'::jsonb,NULL,4,'Budget & Geo','Budget','half',7),
  -- S5 Offer & Accountability — Tier A block (auto_oem_brand already inserted in S1 above) + acct block
  (tmpl_id,'auto_vehicle_focus','Vehicle(s) Featured','text','e.g. 2024 Mazda CX-5 Touring','Make / model / year being promoted.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',1),
  (tmpl_id,'auto_vehicle_category','Vehicle Category','dropdown',NULL,'Drives offer type and audience.',false,'[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',2),
  (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. $500 cashback + 3.9% comparison rate','The specific deal the ad features.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',3),
  (tmpl_id,'auto_driveaway_price','Drive-Away / EGC Price','text','e.g. Drive Away from $34,990','Price/wording as it must appear. Text — values are ranges/wording.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',4),
  (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC).',false,'[]'::jsonb,'{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,5,'Offer & Accountability','Offer & Compliance','full',5),
  (tmpl_id,'auto_oem_coop','OEM Co-op Funded?','radio',NULL,'If yes, OEM brand guidelines + approval apply.',false,'[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','half',6),
  (tmpl_id,'auto_oem_assets','OEM Brand Guidelines / Assets','files',NULL,'OEM-supplied guidelines / approved assets.',false,'[]'::jsonb,'{"fieldKey":"auto_oem_coop","operator":"equals","value":"yes","action":"show"}'::jsonb,5,'Offer & Accountability','Offer & Compliance','full',7),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this is for.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Offer & Compliance','full',8),
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,5,'Offer & Accountability','Accountability','half',9),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,'{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,5,'Offer & Accountability','Accountability','half',10),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,'[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,NULL,5,'Offer & Accountability','Accountability','full',11)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

-- ---- Newspaper Ad ----
INSERT INTO brief_templates (category_id, slug, name, description, icon, requires_approval, is_multi_step, default_priority, require_client_link, sort_order)
SELECT c.id, 'newspaper-ad', 'Newspaper Ad',
  'Print newspaper advertising — booking, spec, content, offer & compliance.',
  'i-lucide-newspaper', true, true, 'medium', true, 20
FROM brief_categories c WHERE c.slug='print-ooh'
ON CONFLICT (category_id, slug) DO NOTHING;

DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='newspaper-ad';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order) VALUES
  -- S1 Booking
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Booking','Booking','full',1),
  (tmpl_id,'ad_title','Ad Title','text',NULL,NULL,true,'[]'::jsonb,NULL,1,'Booking','Booking','full',2),
  (tmpl_id,'publication','Publication','text','e.g. Herald Sun',NULL,true,'[]'::jsonb,NULL,1,'Booking','Booking','half',3),
  (tmpl_id,'publication_section','Publication Section','text','Motoring / Classifieds / Main',NULL,false,'[]'::jsonb,NULL,1,'Booking','Booking','half',4),
  (tmpl_id,'booking_deadline','Booking / Material Deadline','date',NULL,'Material deadline.',true,'[]'::jsonb,NULL,1,'Booking','Booking','half',5),
  (tmpl_id,'publish_date','Publish Date','date',NULL,NULL,true,'[]'::jsonb,NULL,1,'Booking','Booking','half',6),
  (tmpl_id,'frequency','Frequency','dropdown',NULL,NULL,true,'[{"label":"One-off","value":"one_off"},{"label":"Weekly","value":"weekly"},{"label":"Fortnightly","value":"fortnightly"},{"label":"Repeat booking","value":"repeat"}]'::jsonb,NULL,1,'Booking','Booking','half',7),
  -- S2 Spec
  (tmpl_id,'ad_size','Ad Size','dropdown',NULL,NULL,true,'[{"label":"Full page","value":"full_page"},{"label":"Half page","value":"half_page"},{"label":"Quarter page","value":"quarter_page"},{"label":"Strip","value":"strip"},{"label":"Custom col×cm","value":"custom"},{"label":"Classified line","value":"classified_line"}]'::jsonb,NULL,2,'Spec','Spec','half',1),
  (tmpl_id,'custom_dimensions','Custom Dimensions','text',NULL,NULL,false,'[]'::jsonb,'{"fieldKey":"ad_size","operator":"equals","value":"custom","action":"show"}'::jsonb,2,'Spec','Spec','half',2),
  (tmpl_id,'colour_mode','Colour Mode','dropdown',NULL,NULL,true,'[{"label":"Full colour","value":"full_colour"},{"label":"Spot colour","value":"spot"},{"label":"Mono","value":"mono"}]'::jsonb,NULL,2,'Spec','Spec','half',3),
  (tmpl_id,'bleed_required','Bleed Required','radio',NULL,NULL,false,'[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,NULL,2,'Spec','Spec','half',4),
  (tmpl_id,'supplied_or_design','Supply or Design','radio',NULL,NULL,true,'[{"label":"Press-ready supplied","value":"supplied"},{"label":"ADME to design","value":"design"}]'::jsonb,NULL,2,'Spec','Spec','full',5),
  (tmpl_id,'print_specs','Print Specifications','textarea',NULL,'DPI, format, max file size per rate card.',false,'[]'::jsonb,NULL,2,'Spec','Spec','full',6),
  -- S3 Content
  (tmpl_id,'key_message','Key Message','textarea',NULL,NULL,true,'[]'::jsonb,'{"fieldKey":"supplied_or_design","operator":"equals","value":"design","action":"show"}'::jsonb,3,'Content','Content','full',1),
  (tmpl_id,'headline','Headline','text',NULL,NULL,false,'[]'::jsonb,'{"fieldKey":"supplied_or_design","operator":"equals","value":"design","action":"show"}'::jsonb,3,'Content','Content','full',2),
  (tmpl_id,'body_copy','Body Copy','richtext',NULL,NULL,false,'[]'::jsonb,'{"fieldKey":"supplied_or_design","operator":"equals","value":"design","action":"show"}'::jsonb,3,'Content','Content','full',3),
  (tmpl_id,'cta','Call to Action','text',NULL,NULL,false,'[]'::jsonb,'{"fieldKey":"supplied_or_design","operator":"equals","value":"design","action":"show"}'::jsonb,3,'Content','Content','half',4),
  (tmpl_id,'contact_details','Contact Details','textarea','dealer address / phone / LMCT#',NULL,false,'[]'::jsonb,NULL,3,'Content','Content','full',5),
  (tmpl_id,'brand_assets','Brand Assets','files',NULL,NULL,false,'[]'::jsonb,NULL,3,'Content','Content','full',6),
  -- S4 Offer & Accountability — full Tier A block + acct block
  (tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,'[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,NULL,4,'Offer & Accountability','Offer & Compliance','full',1),
  (tmpl_id,'auto_vehicle_focus','Vehicle(s) Featured','text','e.g. 2024 Mazda CX-5 Touring','Make / model / year being promoted.',false,'[]'::jsonb,NULL,4,'Offer & Accountability','Offer & Compliance','half',2),
  (tmpl_id,'auto_vehicle_category','Vehicle Category','dropdown',NULL,'Drives offer type and audience.',false,'[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,NULL,4,'Offer & Accountability','Offer & Compliance','half',3),
  (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. $500 cashback + 3.9% comparison rate','The specific deal the ad features.',false,'[]'::jsonb,NULL,4,'Offer & Accountability','Offer & Compliance','full',4),
  (tmpl_id,'auto_driveaway_price','Drive-Away / EGC Price','text','e.g. Drive Away from $34,990','Price/wording as it must appear. Text — values are ranges/wording.',false,'[]'::jsonb,NULL,4,'Offer & Accountability','Offer & Compliance','half',5),
  (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC).',false,'[]'::jsonb,'{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,4,'Offer & Accountability','Offer & Compliance','full',6),
  (tmpl_id,'auto_oem_coop','OEM Co-op Funded?','radio',NULL,'If yes, OEM brand guidelines + approval apply.',false,'[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,NULL,4,'Offer & Accountability','Offer & Compliance','half',7),
  (tmpl_id,'auto_oem_assets','OEM Brand Guidelines / Assets','files',NULL,'OEM-supplied guidelines / approved assets.',false,'[]'::jsonb,'{"fieldKey":"auto_oem_coop","operator":"equals","value":"yes","action":"show"}'::jsonb,4,'Offer & Accountability','Offer & Compliance','full',8),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this is for.',false,'[]'::jsonb,NULL,4,'Offer & Accountability','Offer & Compliance','full',9),
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,4,'Offer & Accountability','Accountability','half',10),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,'{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,4,'Offer & Accountability','Accountability','half',11),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,'[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,NULL,4,'Offer & Accountability','Accountability','full',12)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

-- ---- SMS / MMS Campaign ----
INSERT INTO brief_templates (category_id, slug, name, description, icon, requires_approval, is_multi_step, default_priority, require_client_link, sort_order)
SELECT c.id, 'sms-mms', 'SMS / MMS Campaign',
  'SMS and MMS messaging campaigns — audience consent, message copy, schedule, offer & compliance.',
  'i-lucide-message-square', true, true, 'medium', true, 20
FROM brief_categories c WHERE c.slug='email-crm'
ON CONFLICT (category_id, slug) DO NOTHING;

DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='sms-mms';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order) VALUES
  -- S1 Setup
  (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Setup','Basics','full',1),
  (tmpl_id,'campaign_name','Campaign Name','text',NULL,NULL,true,'[]'::jsonb,NULL,1,'Setup','Basics','full',2),
  (tmpl_id,'message_type','Message Type','radio',NULL,NULL,true,'[{"label":"SMS","value":"SMS"},{"label":"MMS","value":"MMS"}]'::jsonb,NULL,1,'Setup','Basics','half',3),
  (tmpl_id,'objective','Objective','dropdown',NULL,NULL,true,'[{"label":"Promotion","value":"promotion"},{"label":"Service reminder","value":"service_reminder"},{"label":"Event","value":"event"},{"label":"Re-engagement","value":"re_engagement"}]'::jsonb,NULL,1,'Setup','Basics','half',4),
  -- S2 Audience & Consent
  (tmpl_id,'list_segment','List / Segment','text','e.g. Past Toyota service customers',NULL,true,'[]'::jsonb,NULL,2,'Audience & Consent','Audience','full',1),
  (tmpl_id,'list_size','Estimated List Size','number',NULL,NULL,false,'[]'::jsonb,NULL,2,'Audience & Consent','Audience','half',2),
  (tmpl_id,'consent_confirmed','Consent Confirmed','checkbox',NULL,'Recipients opted in per Spam Act 2003.',true,'[]'::jsonb,NULL,2,'Audience & Consent','Audience','full',3),
  (tmpl_id,'data_source','Data Source','dropdown',NULL,NULL,false,'[{"label":"DMS","value":"dms"},{"label":"CRM","value":"crm"},{"label":"Form opt-ins","value":"form_optins"},{"label":"Purchased — NOT permitted","value":"purchased_not_permitted"}]'::jsonb,NULL,2,'Audience & Consent','Audience','half',4),
  -- S3 Message
  (tmpl_id,'sender_id','Sender ID','text','alphanumeric sender or number',NULL,true,'[]'::jsonb,NULL,3,'Message','Message','half',1),
  (tmpl_id,'message_copy','Message Copy','textarea',NULL,'160 chars/SMS segment; include opt-out.',true,'[]'::jsonb,NULL,3,'Message','Message','full',2),
  (tmpl_id,'optout_text','Opt-Out Text','text',NULL,NULL,true,'[]'::jsonb,NULL,3,'Message','Message','full',3),
  (tmpl_id,'mms_creative','MMS Creative','files',NULL,NULL,false,'[]'::jsonb,'{"fieldKey":"message_type","operator":"equals","value":"MMS","action":"show"}'::jsonb,3,'Message','Message','full',4),
  (tmpl_id,'link_url','Link URL','url',NULL,NULL,false,'[]'::jsonb,NULL,3,'Message','Message','full',5),
  (tmpl_id,'utm_params','UTM Parameters','text',NULL,NULL,false,'[]'::jsonb,NULL,3,'Message','Message','full',6),
  (tmpl_id,'link_shortener','Use Link Shortener','radio',NULL,NULL,false,'[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,NULL,3,'Message','Message','half',7),
  -- S4 Schedule, Offer & Accountability — partial Tier A (auto_offer_details, auto_offer_disclaimer, auto_dealer_locations) + acct block
  (tmpl_id,'send_datetime','Send Date & Time','datetime',NULL,NULL,true,'[]'::jsonb,NULL,4,'Schedule, Offer & Accountability','Schedule','half',1),
  (tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. $500 cashback + 3.9% comparison rate','The specific deal the ad features.',false,'[]'::jsonb,NULL,4,'Schedule, Offer & Accountability','Offer & Compliance','full',2),
  (tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC).',false,'[]'::jsonb,NULL,4,'Schedule, Offer & Accountability','Offer & Compliance','full',3),
  (tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this is for.',false,'[]'::jsonb,NULL,4,'Schedule, Offer & Accountability','Offer & Compliance','full',4),
  (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,4,'Schedule, Offer & Accountability','Accountability','half',5),
  (tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,NULL,4,'Schedule, Offer & Accountability','Accountability','half',6),
  (tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,'[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,NULL,4,'Schedule, Offer & Accountability','Accountability','full',7)
  ON CONFLICT (template_id, field_key) DO NOTHING;
  -- Set default_value for optout_text
  UPDATE brief_template_fields SET default_value='"Reply STOP to opt out"'::jsonb WHERE template_id=tmpl_id AND field_key='optout_text';
END $$;
