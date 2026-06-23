# Brief Templates Pass 1 — Automotive Enrichment + Automation/Accountability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 new dealer brief templates (Meta AIA, Google PMax, Newspaper Ad, SMS/MMS) and rework 11 existing high-value templates so each captures the dealer offer/disclaimer/feed (`auto_*`) and an accountability chain (`acct_*`), via two idempotent SQL migrations run against Neon Postgres.

**Architecture:** Pure data change to `brief_templates` / `brief_template_fields` — no app code. Migration `191` inserts the 4 new templates (`INSERT … ON CONFLICT DO NOTHING` + `DO $$` field blocks, exactly like `054-brief-templates-expansion.sql`). Migration `192` reworks 11 templates by full field-set rewrite (`DELETE` then re-`INSERT` — safe because the DB has **zero briefs / zero field-values**) plus template-flag `UPDATE`s and retiring `instagram-ads`. Each template is an independently verifiable deliverable (run the file, query the rows).

**Tech Stack:** Neon serverless Postgres, raw SQL migrations under `server/database/migrations/`, `psql` CLI. Spec: `docs/superpowers/specs/2026-06-23-brief-templates-automotive-design.md`. Synthesis (per-template change detail): `docs/superpowers/research/2026-06-23-brief-template-audit-SYNTHESIS.md`. Current field lists for reworks: `docs/superpowers/research/2026-06-23-brief-template-audit-batch-{1,2,3}.md`.

## Global Constraints

- **Two migration files**, underscore convention (matching `190_banner_render_jobs.sql`): `server/database/migrations/195_brief_templates_pass1_new.sql` and `196_brief_templates_pass1_rework.sql`.
- **Run command (verbatim):** `export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-)` then `psql "$DATABASE_URL" -f server/database/migrations/<file>`. Migrations are run as part of this workflow (CLAUDE.md), not handed to the user.
- **Field INSERT column order (verbatim):** `(template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)`.
- **`options`** = jsonb array `'[{"label":"…","value":"…"}]'::jsonb` (or `'[]'::jsonb`). **`conditional_logic`** = jsonb single object `'{"fieldKey":"…","operator":"…","value":"…","action":"…"}'::jsonb` (or `NULL`). Operators: `equals|not_equals|contains|not_contains|is_empty|is_not_empty`. Actions: `show|hide|require|unrequire`.
- **`width`** ∈ `'full'|'half'|'third'`. **`field_type`** ∈ the 33-type set incl. `text,textarea,richtext,number,currency,date,datetime,daterange,dropdown,multiselect,checkbox,checkboxgroup,radio,url,email,phone,files,images,user,client,heading`.
- **Uniqueness:** `brief_templates` UNIQUE `(category_id, slug)`; `brief_template_fields` UNIQUE `(template_id, field_key)`. Reference templates by `slug`, never `id`.
- **Stable key namespaces:** `auto_*` (offer/automotive), `acct_*` (accountability) — identical across every template.
- **New templates flags:** `is_multi_step=true, requires_approval=true, require_client_link=true, is_active=true`. **All 11 reworks:** `require_client_link=true`.
- **Zero-data guard:** before any `DELETE` in `192`, assert `SELECT COUNT(*) FROM brief_field_values = 0`. If a real brief ever exists, switch that template to additive `INSERT … ON CONFLICT DO NOTHING` + surgical `UPDATE` instead of DELETE+INSERT.

---

## Reference — canonical block SQL (splice these into template field INSERTs)

These are the **verbatim** field tuples for the reusable blocks. Per template, substitute the placeholders `‹S›` (step_number, integer), `‹STEP›` (step_title, the final step's title for that template, e.g. `'Offer & Accountability'`), and `‹n›` (sort_order start within that step). Keep the section labels (`'Offer & Compliance'`, `'Accountability'`) as written.

**Tier A — Offer block (section `'Offer & Compliance'`):**
```sql
(tmpl_id,'auto_oem_brand','OEM / Manufacturer Brand','dropdown',NULL,'Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off.',false,
 '[{"label":"Toyota","value":"toyota"},{"label":"Mazda","value":"mazda"},{"label":"Ford","value":"ford"},{"label":"Hyundai","value":"hyundai"},{"label":"Kia","value":"kia"},{"label":"Mitsubishi","value":"mitsubishi"},{"label":"Nissan","value":"nissan"},{"label":"Subaru","value":"subaru"},{"label":"Volkswagen","value":"volkswagen"},{"label":"Honda","value":"honda"},{"label":"MG","value":"mg"},{"label":"GWM","value":"gwm"},{"label":"Isuzu","value":"isuzu"},{"label":"Suzuki","value":"suzuki"},{"label":"Mercedes-Benz","value":"mercedes_benz"},{"label":"BMW","value":"bmw"},{"label":"Audi","value":"audi"},{"label":"Alfa Romeo","value":"alfa_romeo"},{"label":"Jeep","value":"jeep"},{"label":"RAM","value":"ram"},{"label":"LDV","value":"ldv"},{"label":"Chery","value":"chery"},{"label":"BYD","value":"byd"},{"label":"Tesla","value":"tesla"},{"label":"Multi-franchise","value":"multi_franchise"},{"label":"Independent / Used","value":"independent"},{"label":"Other / N/A","value":"na"}]'::jsonb,
 NULL,‹S›,‹STEP›,'Offer & Compliance','full',‹n›),
(tmpl_id,'auto_vehicle_focus','Vehicle(s) Featured','text','e.g. 2024 Mazda CX-5 Touring','Make / model / year being promoted.',false,'[]'::jsonb,NULL,‹S›,‹STEP›,'Offer & Compliance','half',‹n›+1),
(tmpl_id,'auto_vehicle_category','Vehicle Category','dropdown',NULL,'Drives offer type and audience.',false,
 '[{"label":"New","value":"new"},{"label":"Demonstrator","value":"demo"},{"label":"Used","value":"used"},{"label":"Fleet & Government","value":"fleet"},{"label":"Finance","value":"finance"},{"label":"Service","value":"service"},{"label":"Parts","value":"parts"}]'::jsonb,
 NULL,‹S›,‹STEP›,'Offer & Compliance','half',‹n›+2),
(tmpl_id,'auto_offer_details','Offer / Key Deal','textarea','e.g. $500 cashback + 3.9% comparison rate','The specific deal the ad features.',false,'[]'::jsonb,NULL,‹S›,‹STEP›,'Offer & Compliance','full',‹n›+3),
(tmpl_id,'auto_driveaway_price','Drive-Away / EGC Price','text','e.g. Drive Away from $34,990','Price/wording as it must appear. Text — values are ranges/wording.',false,'[]'::jsonb,NULL,‹S›,‹STEP›,'Offer & Compliance','half',‹n›+4),
(tmpl_id,'auto_offer_disclaimer','Offer Disclaimer / Legal Fine Print','textarea',NULL,'VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC).',false,'[]'::jsonb,
 '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,‹S›,‹STEP›,'Offer & Compliance','full',‹n›+5),
(tmpl_id,'auto_oem_coop','OEM Co-op Funded?','radio',NULL,'If yes, OEM brand guidelines + approval apply.',false,'[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,NULL,‹S›,‹STEP›,'Offer & Compliance','half',‹n›+6),
(tmpl_id,'auto_oem_assets','OEM Brand Guidelines / Assets','files',NULL,'OEM-supplied guidelines / approved assets.',false,'[]'::jsonb,
 '{"fieldKey":"auto_oem_coop","operator":"equals","value":"yes","action":"show"}'::jsonb,‹S›,‹STEP›,'Offer & Compliance','full',‹n›+7),
(tmpl_id,'auto_dealer_locations','Dealer Location(s)','textarea','e.g. Berwick + Narre Warren','Which rooftop(s) this is for.',false,'[]'::jsonb,NULL,‹S›,‹STEP›,'Offer & Compliance','full',‹n›+8),
```
**Tier B — feed extension (same section):**
```sql
(tmpl_id,'auto_stock_feed_url','Stock / Inventory Feed URL','url','https://feed.autogate.com.au/...','Autogate / dealer DMS export / Merchant Centre feed.',false,'[]'::jsonb,NULL,‹S›,‹STEP›,'Offer & Compliance','half',‹n›),
(tmpl_id,'auto_catalogue_id','Product Catalogue / Feed ID','text',NULL,'Meta vehicle catalogue ID or Google Merchant Centre feed ID.',false,'[]'::jsonb,NULL,‹S›,‹STEP›,'Offer & Compliance','half',‹n›+1),
```
**`acct_*` — Accountability block (section `'Accountability'`):**
```sql
(tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies.',false,'[]'::jsonb,NULL,‹S›,‹STEP›,'Accountability','half',‹n›),
(tmpl_id,'acct_compliance_ack','Compliance Confirmed','checkbox',NULL,'I confirm the offer claims + disclaimer are ACCC/ASIC compliant.',false,'[]'::jsonb,
 '{"fieldKey":"auto_driveaway_price","operator":"is_not_empty","action":"require"}'::jsonb,‹S›,‹STEP›,'Accountability','half',‹n›+1),
(tmpl_id,'acct_approval_required','Sign-off Before Go-Live','dropdown',NULL,'Sign-off needed before go-live. Copilots will not auto-proceed past proposed until satisfied.',false,
 '[{"label":"None","value":"none"},{"label":"Client","value":"client"},{"label":"OEM","value":"oem"},{"label":"Client + OEM","value":"client_oem"}]'::jsonb,NULL,‹S›,‹STEP›,'Accountability','full',‹n›+2),
```
> For templates that take only **partial Tier A** (email, sms, website per spec §4.3), splice only the named `auto_*` rows, not the whole block.

---

## Task 1: Scaffold both migration files + zero-data guard

**Files:**
- Create: `server/database/migrations/195_brief_templates_pass1_new.sql`
- Create: `server/database/migrations/196_brief_templates_pass1_rework.sql`

- [ ] **Step 1: Confirm the zero-data precondition (the guard)**

Run:
```bash
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-)
psql "$DATABASE_URL" -tA -c "SELECT (SELECT COUNT(*) FROM briefs) AS briefs, (SELECT COUNT(*) FROM brief_field_values) AS field_values;"
```
Expected: `0|0`. **If non-zero, STOP** and switch `192` rework blocks from DELETE+INSERT to additive `INSERT … ON CONFLICT DO NOTHING` + surgical `UPDATE` (see Global Constraints).

- [ ] **Step 2: Create `195_brief_templates_pass1_new.sql` with header**

```sql
-- ============================================
-- 191 · Brief Templates Pass 1 — NEW templates
-- Meta AIA, Google PMax, Newspaper Ad, SMS/MMS
-- Pattern: INSERT template ON CONFLICT DO NOTHING + DO $$ field block.
-- Idempotent. Spec: docs/superpowers/specs/2026-06-23-brief-templates-automotive-design.md
-- ============================================
```

- [ ] **Step 3: Create `196_brief_templates_pass1_rework.sql` with header + guard**

```sql
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
```

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/195_brief_templates_pass1_new.sql server/database/migrations/196_brief_templates_pass1_rework.sql
git commit -m "feat(briefs): scaffold Pass-1 brief-template migrations 195/196 + zero-data guard"
```

---

## Task 2: New template — Meta AIA (`meta-aia`) — WORKED EXEMPLAR

This task is fully expanded; Tasks 3–5 follow the identical pattern from their field tables.

**Files:** Modify: `server/database/migrations/195_brief_templates_pass1_new.sql`

**Interfaces — Produces:** template slug `meta-aia` in category `digital-marketing` with the fields below; later verification relies on field_key `auto_catalogue_id`, `acct_approval_required` existing.

- [ ] **Step 1: Write the verification query (the acceptance check)**

```bash
psql "$DATABASE_URL" -tA -F'|' -c "SELECT t.is_active, (SELECT COUNT(*) FROM brief_template_fields f WHERE f.template_id=t.id) FROM brief_templates t WHERE t.slug='meta-aia';"
```
Expected NOW: empty (template absent).

- [ ] **Step 2: Append the template INSERT + field block to `191_…`**

```sql
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
```

- [ ] **Step 3: Run the migration (idempotent)**

```bash
psql "$DATABASE_URL" -f server/database/migrations/195_brief_templates_pass1_new.sql
```
Expected: no errors (INSERT/DO output).

- [ ] **Step 4: Re-run the verification query**

```bash
psql "$DATABASE_URL" -tA -F'|' -c "SELECT t.is_active, (SELECT COUNT(*) FROM brief_template_fields f WHERE f.template_id=t.id) FROM brief_templates t WHERE t.slug='meta-aia';"
```
Expected: `t|33` (active, 33 fields). Also confirm JSON parses:
```bash
psql "$DATABASE_URL" -tA -c "SELECT COUNT(*) FROM brief_template_fields f JOIN brief_templates t ON t.id=f.template_id WHERE t.slug='meta-aia' AND f.conditional_logic IS NOT NULL;"
```
Expected: `4` (the conditional fields: `auto_offer_disclaimer`, `auto_oem_assets`, `lead_form_name`, `acct_compliance_ack`).

- [ ] **Step 5: Commit**

```bash
git add server/database/migrations/195_brief_templates_pass1_new.sql
git commit -m "feat(briefs): add Meta AIA brief template (191)"
```

---

## Task 3: New template — Google Performance Max (`google-pmax`)

**Files:** Modify: `195_brief_templates_pass1_new.sql`. Build exactly like Task 2 from this field table; template INSERT: category `digital-marketing`, name `Google Performance Max`, icon `i-lucide-trending-up`, `default_priority 'high'`, sort_order 21.

| step / step_title | section | field_key | type | req | options / conditional_logic |
|---|---|---|---|---|---|
| 1 Setup | Basics | client | client | Y | |
| 1 | Basics | campaign_name | text | Y | |
| 1 | Basics | pmax_type | dropdown | Y | Standard / Inventory (Vehicle Ads) |
| 1 | Basics | conversion_goal | dropdown | Y | Leads / Sales / Calls / Store visits |
| 1 | Basics | auto_oem_brand | dropdown | N | (Tier A brand options) |
| 2 Feed | Feed | merchant_centre_id | text | N | cond: require `{fieldKey:pmax_type,operator:equals,value:inventory,action:require}` |
| 2 | Feed | auto_stock_feed_url | url | N | cond show when pmax_type=inventory |
| 2 | Feed | feed_partner | dropdown | N | Autogate/CarLoop/Dealer DMS/Other |
| 3 Asset Group | Assets | asset_group_name | text | Y | |
| 3 | Assets | final_url | url | Y | |
| 3 | Assets | business_name | text | Y | |
| 3 | Assets | headlines | textarea | Y | help "up to 15, ≤30 chars each" |
| 3 | Assets | long_headlines | textarea | N | help "≤90 chars" |
| 3 | Assets | descriptions | textarea | Y | help "≤90 chars" |
| 3 | Assets | images | images | N | |
| 3 | Assets | logos | files | N | |
| 3 | Assets | video_links | textarea | N | help "YouTube URLs" |
| 3 | Assets | audience_signals | textarea | Y | |
| 4 Budget & Geo | Budget | daily_budget | currency | Y | |
| 4 | Budget | bidding | dropdown | Y | Max Conversions / Max Value / Target CPA / Target ROAS |
| 4 | Budget | target_cpa_roas | number | N | |
| 4 | Budget | locations | textarea | Y | |
| 4 | Budget | languages | multiselect | N | English default |
| 4 | Budget | start_date | date | Y | |
| 4 | Budget | end_date | date | N | |
| 5 Offer & Accountability | — | **Tier A block** + **acct block** | | | splice from Reference, ‹S›=5, ‹STEP›='Offer & Accountability' |

Steps: (1) verify query `slug='google-pmax'` empty → (2) append SQL → (3) run `191` → (4) verify field count = **36** (25 base + Tier A 9 + acct 3, **minus** the `auto_oem_brand` already in S1 — it appears once; do NOT re-add it in the S5 Tier A splice); conditional fields present → (5) `git commit -m "feat(briefs): add Google Performance Max brief template (191)"`.

---

## Task 4: New template — Newspaper Ad (`newspaper-ad`)

**Files:** Modify: `191_…`. Template INSERT: category `print-ooh`, name `Newspaper Ad`, icon `i-lucide-newspaper`, `default_priority 'medium'`, sort_order 20.

| step / step_title | section | field_key | type | req | options / conditional_logic |
|---|---|---|---|---|---|
| 1 Booking | Booking | client | client | Y | |
| 1 | Booking | ad_title | text | Y | |
| 1 | Booking | publication | text | Y | "e.g. Herald Sun" |
| 1 | Booking | publication_section | text | N | "Motoring / Classifieds / Main" |
| 1 | Booking | booking_deadline | date | Y | help "material deadline" |
| 1 | Booking | publish_date | date | Y | |
| 1 | Booking | frequency | dropdown | Y | One-off / Weekly / Fortnightly / Repeat booking |
| 2 Spec | Spec | ad_size | dropdown | Y | Full page/Half/Quarter/Strip/Custom col×cm/Classified line |
| 2 | Spec | custom_dimensions | text | N | cond show `{fieldKey:ad_size,operator:equals,value:custom,action:show}` (use value `custom` for the Custom option) |
| 2 | Spec | colour_mode | dropdown | Y | Full colour / Spot / Mono |
| 2 | Spec | bleed_required | radio | N | Yes / No |
| 2 | Spec | supplied_or_design | radio | Y | Press-ready supplied / ADME to design |
| 2 | Spec | print_specs | textarea | N | help "DPI, format, max file size per rate card" |
| 3 Content | Content | key_message | textarea | Y | cond show `{fieldKey:supplied_or_design,operator:equals,value:design,action:show}` |
| 3 | Content | headline | text | N | cond show (design) |
| 3 | Content | body_copy | richtext | N | cond show (design) |
| 3 | Content | cta | text | N | cond show (design) |
| 3 | Content | contact_details | textarea | N | "dealer address / phone / LMCT#" |
| 3 | Content | brand_assets | files | N | |
| 4 Offer & Accountability | — | **Tier A block** + **acct block** | | | ‹S›=4 |

Steps: verify empty → append → run `191` → verify count = 19 + 12 = **31** → `git commit -m "feat(briefs): add Newspaper Ad brief template (191)"`.

---

## Task 5: New template — SMS / MMS (`sms-mms`)

**Files:** Modify: `191_…`. Template INSERT: category `email-crm`, name `SMS / MMS Campaign`, icon `i-lucide-message-square`, `default_priority 'medium'`, sort_order 20.

| step / step_title | section | field_key | type | req | options / conditional_logic |
|---|---|---|---|---|---|
| 1 Setup | Basics | client | client | Y | |
| 1 | Basics | campaign_name | text | Y | |
| 1 | Basics | message_type | radio | Y | SMS / MMS |
| 1 | Basics | objective | dropdown | Y | Promotion / Service reminder / Event / Re-engagement |
| 2 Audience & Consent | Audience | list_segment | text | Y | "e.g. Past Toyota service customers" |
| 2 | Audience | list_size | number | N | |
| 2 | Audience | consent_confirmed | checkbox | Y | "Recipients opted in per Spam Act 2003" |
| 2 | Audience | data_source | dropdown | N | DMS / CRM / Form opt-ins / Purchased — NOT permitted |
| 3 Message | Message | sender_id | text | Y | "alphanumeric sender or number" |
| 3 | Message | message_copy | textarea | Y | help "160 chars/SMS segment; include opt-out" |
| 3 | Message | optout_text | text | Y | default_value `"Reply STOP to opt out"` → set via `default_value` jsonb `'"Reply STOP to opt out"'::jsonb` |
| 3 | Message | mms_creative | files | N | cond show `{fieldKey:message_type,operator:equals,value:MMS,action:show}` (value matches the MMS option value) |
| 3 | Message | link_url | url | N | |
| 3 | Message | utm_params | text | N | |
| 3 | Message | link_shortener | radio | N | Yes / No |
| 4 Schedule, Offer & Accountability | Schedule | send_datetime | datetime | Y | |
| 4 | — | auto_offer_details, auto_offer_disclaimer, auto_dealer_locations | (partial Tier A) | N | offer_disclaimer keeps its cond-require |
| 4 | — | **acct block** | | | ‹S›=4 |

> `optout_text` uses the `default_value` column (jsonb) — column order in the INSERT does not include `default_value`, so for this one field write a separate `UPDATE brief_template_fields SET default_value='"Reply STOP to opt out"'::jsonb WHERE template_id=tmpl_id AND field_key='optout_text';` after the INSERT, inside the same `DO $$` block.

Steps: verify empty → append → run `191` → verify count = 16 + 3 (partial Tier A) + 3 (acct) = **22** → `git commit -m "feat(briefs): add SMS/MMS brief template (191)"`.

---

## Task 6: Migration 191 acceptance gate

**Files:** none (verification only).

- [ ] **Step 1: Re-run full `191` and assert all 4 new templates**

```bash
psql "$DATABASE_URL" -f server/database/migrations/195_brief_templates_pass1_new.sql
psql "$DATABASE_URL" -tA -F'|' -c "SELECT slug, is_active, (SELECT COUNT(*) FROM brief_template_fields f WHERE f.template_id=t.id) FROM brief_templates t WHERE slug IN ('meta-aia','google-pmax','newspaper-ad','sms-mms') ORDER BY slug;"
```
Expected: 4 rows, all `…|t|N` with N matching Tasks 2–5 (meta-aia 33 / google-pmax 36 / newspaper-ad 31 / sms-mms 22).

- [ ] **Step 2: Assert every conditional_logic object is well-formed**

```bash
psql "$DATABASE_URL" -tA -c "SELECT count(*) FROM brief_template_fields f JOIN brief_templates t ON t.id=f.template_id WHERE t.slug IN ('meta-aia','google-pmax','newspaper-ad','sms-mms') AND f.conditional_logic IS NOT NULL AND NOT (f.conditional_logic ? 'fieldKey' AND f.conditional_logic ? 'operator' AND f.conditional_logic ? 'action');"
```
Expected: `0` (every conditional has fieldKey+operator+action).

- [ ] **Step 3: No commit (verification gate).** If any assertion fails, fix the offending block in `191` and re-run its task's verify before proceeding.

---

## Task 7: Rework — `facebook-ads` → "Meta Ads Campaign" + retire `instagram-ads`

**Files:** Modify: `server/database/migrations/196_brief_templates_pass1_rework.sql`

**Starting field set:** audit `…-batch-1.md §1` (Facebook, 28 fields) merged with IG's distinctive fields. **Deltas (synthesis §6):** add `platform`(checkboxgroup: Facebook/Instagram/Both, R), `campaign_subtype`(radio: Standard / Auto Inventory Ads (AIA) / Lead Gen); conditional reveal `auto_catalogue_id` (when subtype=aia) + `lead_form_name` (when subtype=lead_gen); add `meta_pixel_id`, `utm_template`(url); **drop** Hashtags; `Landing Page URL` cond-required when subtype≠lead_gen; group age min/max `width:'half'` in one section; splice **Tier A** + **Tier B (auto_catalogue_id)** + **acct block** in a final "Offer & Accountability" step.

- [ ] **Step 1: Verification query (current state)**

```bash
psql "$DATABASE_URL" -tA -F'|' -c "SELECT name, require_client_link, (SELECT COUNT(*) FROM brief_template_fields f WHERE f.template_id=t.id) FROM brief_templates t WHERE slug='facebook-ads';"
```
Expected NOW: `Facebook Ads Campaign|f|29`.

- [ ] **Step 2: Append rework block to `192_…`**

```sql
-- ---- facebook-ads → Meta Ads Campaign ----
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='facebook-ads';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id=tmpl_id;
  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type, placeholder, help_text, is_required, options, conditional_logic, step_number, step_title, section, width, sort_order) VALUES
    -- … full corrected field set: client, campaign_name, platform, campaign_subtype, objective, …
    -- (transcribe the merged field list per the delta above; splice Tier A + auto_catalogue_id + acct block at the final step)
    (tmpl_id,'client','Client','client',NULL,NULL,true,'[]'::jsonb,NULL,1,'Campaign Setup','Basics','full',1)
    -- … remaining rows …
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;
UPDATE brief_templates SET name='Meta Ads Campaign', require_client_link=true,
  description='Facebook & Instagram paid campaigns — objective, audience, creative, offer & compliance.'
  WHERE slug='facebook-ads';
UPDATE brief_templates SET is_active=false WHERE slug='instagram-ads';
```

- [ ] **Step 3: Run `192`**

```bash
psql "$DATABASE_URL" -f server/database/migrations/196_brief_templates_pass1_rework.sql
```

- [ ] **Step 4: Verify**

```bash
psql "$DATABASE_URL" -tA -F'|' -c "SELECT (SELECT name FROM brief_templates WHERE slug='facebook-ads'), (SELECT require_client_link FROM brief_templates WHERE slug='facebook-ads'), (SELECT is_active FROM brief_templates WHERE slug='instagram-ads'), EXISTS(SELECT 1 FROM brief_template_fields f JOIN brief_templates t ON t.id=f.template_id WHERE t.slug='facebook-ads' AND f.field_key='platform');"
```
Expected: `Meta Ads Campaign|t|f|t` (renamed, client-link on, IG retired, `platform` field exists).

- [ ] **Step 5: Commit**

```bash
git add server/database/migrations/196_brief_templates_pass1_rework.sql
git commit -m "feat(briefs): rework facebook-ads → Meta Ads Campaign, retire instagram-ads (192)"
```

---

## Tasks 8–17: Reworks (one task each)

Each follows the **Task 7 pattern**: verify current → append a `DO $$ … DELETE+INSERT … END $$` block (full corrected field set) + `UPDATE brief_templates SET require_client_link=true …` → run `192` → verify (`require_client_link=t`, expected new field count, key new field_key exists) → commit `feat(briefs): rework <slug> (192)`. The **corrected field set = current fields (audit batch table) − removals + additions (synthesis §6) + spliced blocks (Reference)**.

- [ ] **Task 8 — `google-ads` (Search trim).** Start: batch-1 §4 (28 fields). Remove PMax/Display/Shopping-only fields (now in `google-pmax`); keep Search (keywords, match types, RSA headlines/descriptions, extensions, sitelinks); `target_cpa_roas` retype text→`number`; add `conversion_action`(text); Target Languages drop required; splice **Tier A** + **acct block**. Verify: `target_cpa_roas` type=`number`, `auto_offer_details` exists, `require_client_link=t`.
- [ ] **Task 9 — `marketing-campaign`.** Start: batch-1 §6 (18 fields). Ensure `client`(client,R) present; add `platforms`(checkboxgroup: Meta/Google/TikTok/Display/Other,R), `target_locations`(textarea,R), `success_kpis`(textarea,R); update Campaign Type options to Monday taxonomy; optionalise Psychographics; splice **Tier A** + **acct**. Verify `client` + `platforms` exist.
- [ ] **Task 10 — `ad-creative`.** Start: batch-1 §8 (22). Campaign Objective `richtext`→`dropdown` (Brand Awareness/New Model Launch/Clearance/Finance Offer/Seasonal/Event/Dealer Awareness/Lead Gen); add `platforms`(checkboxgroup), `dealer_vs_oem_brand`(radio: Dealer dominant/OEM dominant/Co-branded), `confirmed_budget`(currency); make Mandatory Elements required; remove duplicate Age Range; splice **Tier A** + **acct**. Verify objective type=`dropdown`.
- [ ] **Task 11 — `landing-page`.** Start: batch-3 §2 (17). Add `auto_offer_details`(R), `utm_params`(text,R), `campaign_ad_account`(text); make Tracking Requirements required; Form Fields add Vehicle of Interest/Trade-In/Preferred Contact; splice **Tier A** + **Tier B** + **acct**; `UPDATE … SET require_client_link=true, default_priority='high'`. Verify `default_priority='high'`, `utm_params` exists.
- [ ] **Task 12 — `email-campaign`.** Start: batch-3 §3 (14). Add `list_segment`(text,R), `list_size`(number), `send_datetime`(**datetime**,R, replace date-only), `from_name`(text), `from_email`(email), `preview_text`(text), `spam_compliance`(checkbox,R), `auto_offer_details`, `auto_offer_disclaimer`; make Email Platform + CTA Landing Page required; splice **acct**. Verify `send_datetime` type=`datetime`, `spam_compliance` exists.
- [ ] **Task 13 — `social-content`.** Start: batch-2 §10 (17, has the **duplicate `Content Brief Title`**). **DELETE+INSERT inherently drops the dup** (single `content_brief_title` key). Content Type options add Vehicle Showcase/Inventory Post/OEM Content/GBP Post/ReelMotion; add `num_posts`(number), `auto_stock_feed_url`; make Posting Frequency + Content Period required; splice **Tier A** + **acct**. Verify exactly one `content_brief_title` field; `require_client_link=t`.
- [ ] **Task 14 — `website-dev`.** Start: batch-3 §1 (18). Add `vdp_required`(radio Y/N), `analytics_gtm_setup`(checkbox), `auto_oem_brand`, `auto_dealer_locations`, **Tier B** (`auto_stock_feed_url`); Website Type add "Automotive Dealership" (first option); make Current Website URL required; splice **acct**. Verify `vdp_required`, `auto_stock_feed_url` exist.
- [ ] **Task 15 — `seo-audit` → "SEO Retainer Brief".** Start: batch-3 §5 (12). Scope add "GBP Management" option; add `num_locations`(number,R), `auto_dealer_locations`(R), `monthly_reporting_format`(dropdown), `access_checklist`(checkboxgroup: GSC/GA/Google Ads/GBP); make Target Geographic Locations required; splice **Tier C** (`auto_oem_brand`,`auto_oem_incentive_period`,`auto_inventory_context`) + **acct**; `UPDATE … SET name='SEO Retainer Brief', description='Ongoing SEO + Google Business Profile retainer …', require_client_link=true`. Verify name updated.
- [ ] **Task 16 — `billboard-ooh`.** Start: batch-2 §5 (21). Key Visual `textarea`→`files`; Print/Digital specs `textarea`→structured `dropdown`s; Campaign Objective options add New Model Launch/Clearance; make Production Budget required; add `booking_reference`(text); splice **Tier A** + **acct**. Verify Key Visual type=`files`.
- [ ] **Task 17 — `signage-wraps`.** Start: batch-2 §4 (15). Split `Dimensions / Vehicle Details` textarea → `vehicle_make`,`vehicle_model`,`vehicle_year`(text) + `vehicle_vin_stock`(text); add `wrap_coverage`(dropdown, cond show when Signage Type∋wrap), `print_install_scope`(radio: Design only/+print/+print+install,R); Quantity `text`→`number`; splice **Tier A** + **acct**. Verify `vehicle_make` + `wrap_coverage` exist.

---

## Task 18: Migration 192 acceptance gate + full inventory verification

**Files:** none (verification only).

- [ ] **Step 1: Full inventory re-query (all 28 + 4 new)**

```bash
psql "$DATABASE_URL" -tA -F'|' -c "
SELECT t.name, t.slug, t.is_active, t.require_client_link, t.default_priority,
  (SELECT COUNT(*) FROM brief_template_fields f WHERE f.template_id=t.id) AS nfields
FROM brief_templates t ORDER BY t.is_active DESC, t.name;"
```
Expected: `meta-aia/google-pmax/newspaper-ad/sms-mms` present & active; `instagram-ads` `is_active=f`; the 11 reworks all `require_client_link=t`; `landing-page` `default_priority=high`; `facebook-ads`.name='Meta Ads Campaign'; `seo-audit`.name='SEO Retainer Brief'.

- [ ] **Step 2: Assert acct block on every Pass-1 client-facing template**

```bash
psql "$DATABASE_URL" -tA -F'|' -c "
SELECT t.slug, COUNT(*) FILTER (WHERE f.field_key LIKE 'acct\_%') AS acct
FROM brief_templates t JOIN brief_template_fields f ON f.template_id=t.id
WHERE t.slug IN ('meta-aia','google-pmax','newspaper-ad','sms-mms','facebook-ads','google-ads','marketing-campaign','ad-creative','landing-page','email-campaign','social-content','website-dev','seo-audit','billboard-ooh','signage-wraps')
GROUP BY t.slug ORDER BY t.slug;"
```
Expected: every row `… | 3` (all three `acct_*` fields present).

- [ ] **Step 3: Assert conditional_logic well-formed across all touched templates** (reuse Task 6 Step 2 query without the slug filter, scoped to the 15 Pass-1 slugs). Expected `0` malformed.

- [ ] **Step 4: Browser eyeball**

Open `/agency/briefs/templates`, open **Meta Automotive Inventory Ads** and the merged **Meta Ads Campaign**; confirm steps/sections render and a conditional field hides/shows (set OEM Co-op = Yes → OEM assets appears; enter a Drive-Away price → disclaimer becomes required).

- [ ] **Step 5: No code commit (verification gate).** Record results. If a template fails an assertion, fix its block in `191`/`192`, re-run that file, re-verify.

---

## Self-Review notes (author)

- **Spec coverage:** §4 blocks → Reference + every task; §5 new templates → Tasks 2–5; §6 reworks → Tasks 7–17; §7 mechanics → Task 1 + run/verify steps; §8 verification → Tasks 6 & 18. ✔
- **Field counts** in verify steps are computed (current ± delta + block sizes); treat as expected targets — if a transcription legitimately differs by a field, update the assertion to the actual authored count, don't pad.
- **Marketing sync (spec §9)** is a separate confirm-first follow-up — NOT a task here.
- **Support Slice + Pass 2** are out of scope (spec §9).
