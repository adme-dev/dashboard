-- ============================================
-- 191 · Brief Templates Pass 1 — NEW templates
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
