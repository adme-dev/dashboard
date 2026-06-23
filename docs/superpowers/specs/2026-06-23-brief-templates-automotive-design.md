# Spec — Brief Templates: Automotive Enrichment + Automation/Accountability (Pass 1)

**Date:** 2026-06-23 · **Status:** approved design, ready for implementation plan
**Branch:** `feat/brief-templates-automotive-pass1` (off `origin/main` @ 334cb2b2)
**Inputs:** audit `…-batch-{1,2,3}.md` + `…-rubric.md`, `…-SYNTHESIS.md` (all in
`docs/superpowers/research/`), memory `monday-job-types-rnd.md` + `ops-autopilot-program.md`,
live-DB recon.

---

## 1. Objective

Rebuild the highest-value brief templates so they serve **three readers at once** — the
human filling the brief, the **C5 brief-gatekeeper** auto-triaging it, and the **AI
copilots** reading it to act — against two program objectives: **Automation** and
**Accountability**. The agency is a digital-marketing shop for **car dealerships**, so the
field design must match real dealer job types (the Monday taxonomy) and capture the dealer
offer, its legal disclaimer, OEM co-op status, inventory feed, and a clear accountability
chain.

Concretely the templates become the **structured operational substrate**:
- **Automation:** required-flags are the gatekeeper's completeness contract; structured
  types (not freetext) for anything a machine branches on; stable `field_key` namespaces.
- **Accountability:** a named owner + compliance attestation + sign-off gate on every brief.
- **Copilot-readiness:** consistent keys + `help_text`-as-AI-context, so a copilot binds
  once and acts across templates — while **spend/deploy stay human-approved** (dashboard =
  System of Record).

This is **Pass 1**. It does not change app code — only `brief_templates` /
`brief_template_fields` rows via two SQL migrations.

---

## 2. Locked decisions

1. **FB + IG → merge** into one **Meta Ads Campaign** (`facebook-ads` rebuilt; `instagram-ads`
   retired via `is_active=false` — zero briefs, safe).
2. **Google → split**: `google-ads` trimmed to **Search**; new `google-pmax` template.
3. **Scope = phased.** Pass 1 = 4 new + 11 HIGH reworks (§3). Pass 2 = the other 16.
4. **`requires_quote`** recs dropped (column doesn't exist; not added this pass).
5. **Per-template field rows** with consistent `field_key`s (no shared field-library).
6. **Accountability block = Standard (3 `acct_*` fields)** on all client-facing templates.
7. **`require_client_link = true`** on all client-facing templates.

---

## 3. Pass-1 scope (15 templates)

**4 new** (category): `meta-aia` (digital-marketing), `google-pmax` (digital-marketing),
`newspaper-ad` (print-ooh), `sms-mms` (email-crm).

**11 reworks:** `facebook-ads`→Meta Ads Campaign (+retire `instagram-ads`), `google-ads`→Search,
`marketing-campaign`, `ad-creative`, `landing-page`, `email-campaign`, `social-content`,
`website-dev`, `seo-audit`→"SEO Retainer Brief", `billboard-ooh`, `signage-wraps`.

**Deferred to Pass 2 (12 — creative/media MINOR retypes):** tiktok-ads, display-banner,
media-plan, influencer-campaign, graphic-design, brand-identity, print-collateral,
tv-commercial, video-production, radio-ad, podcast-audio, blog-content.

**Carved into a dedicated Support Slice (next, after Pass 1 — see §9):** it-support,
support-ticket, bug-report, change-request. (Not a generic Pass-2 deferral — support gets
its own design grounded in the live Monday support boards.)

---

## 4. Canonical reusable blocks (exact field definitions)

DB column reminder (`brief_template_fields`): `field_key, field_label, field_type,
placeholder, help_text, is_required, options(jsonb [{label,value}]), conditional_logic(jsonb
{fieldKey,operator,value,action}), step_number, step_title, section, width, sort_order`.

### 4.1 Automotive / Offer block — `auto_*`

**Tier A — Offer** (section "Offer & Compliance"):

| field_key | label | type | req | options / conditional_logic | help_text |
|---|---|---|---|---|---|
| `auto_oem_brand` | OEM / Manufacturer Brand | dropdown | N | Toyota, Mazda, Ford, Hyundai, Kia, Mitsubishi, Nissan, Subaru, Volkswagen, Honda, MG, GWM, Isuzu, Suzuki, Mercedes-Benz, BMW, Audi, Alfa Romeo, Jeep, RAM, LDV, Chery, BYD, Tesla, **Multi-franchise**, **Independent / Used**, **Other / N/A** | "Manufacturer brand — gates OEM co-op funds and brand-compliance sign-off." |
| `auto_vehicle_focus` | Vehicle(s) Featured | text | N | placeholder "e.g. 2024 Mazda CX-5 Touring" | "Make / model / year being promoted." |
| `auto_vehicle_category` | Vehicle Category | dropdown | N | New, Demonstrator, Used, Fleet & Government, Finance, Service, Parts | "Drives offer type and audience." |
| `auto_offer_details` | Offer / Key Deal | textarea | N* | *required per-template when ad carries a price | "The specific deal the ad features (cashback, rate, bonus)." |
| `auto_driveaway_price` | Drive-Away / EGC Price | text | N | placeholder "e.g. Drive Away from $34,990" | "Price/wording as it must appear. Text (not currency) — values are ranges/wording." |
| `auto_offer_disclaimer` | Offer Disclaimer / Legal Fine Print | textarea | N | `{fieldKey:'auto_driveaway_price', operator:'is_not_empty', action:'require'}` | "VFACTS class, drive-away terms, finance comparison-rate wording (ACCC/ASIC)." |
| `auto_oem_coop` | OEM Co-op Funded? | radio | N | Yes, No | "If yes, OEM brand guidelines + approval apply." |
| `auto_oem_assets` | OEM Brand Guidelines / Assets | files | N | `{fieldKey:'auto_oem_coop', operator:'equals', value:'yes', action:'show'}` | "OEM-supplied guidelines / approved assets." |
| `auto_dealer_locations` | Dealer Location(s) | textarea | N | placeholder "e.g. Berwick + Narre Warren" | "Which rooftop(s) this is for." |

**Tier B — Inventory/feed extension** (add for AIA, PMax-Inventory, website VDP, inventory social):

| field_key | label | type | req | help_text |
|---|---|---|---|---|
| `auto_stock_feed_url` | Stock / Inventory Feed URL | url | N | "Autogate / dealer DMS export / Merchant Centre feed." |
| `auto_catalogue_id` | Product Catalogue / Feed ID | text | N | "Meta vehicle catalogue ID or Google Merchant Centre feed ID." |

**Tier C — Strategy context** (media-plan, seo only): reuse `auto_oem_brand`,
`auto_dealer_locations`, `auto_vehicle_category` (as **checkboxgroup** "segments to focus on")
plus `auto_oem_incentive_period` (text — "EOFY, plate clearance, OEM bonus periods") and
`auto_inventory_context` (textarea — "e.g. overstocked on SUVs → push SUVs").

### 4.2 Accountability & Compliance block — `acct_*` (section "Accountability")

| field_key | label | type | req | options / conditional_logic | help_text |
|---|---|---|---|---|---|
| `acct_accountable_owner` | Accountable Owner | user | N | — | "Named human responsible for delivery — who the gatekeeper/copilot routes to & notifies." |
| `acct_compliance_ack` | Compliance Confirmed | checkbox | N | `{fieldKey:'auto_driveaway_price', operator:'is_not_empty', action:'require'}` | "I confirm the offer claims + disclaimer are ACCC/ASIC compliant." |
| `acct_approval_required` | Sign-off Before Go-Live | dropdown | N | None, Client, OEM, Client + OEM | "Sign-off needed before go-live. Copilots will not auto-proceed past 'proposed' until this is satisfied." |

### 4.3 Block application matrix (Pass-1 templates)

| template | Tier A | Tier B | Tier C | `acct_*` |
|---|:-:|:-:|:-:|:-:|
| meta-aia (new) | ✓ | ✓ | | ✓ |
| google-pmax (new) | ✓ | ✓ (inventory) | | ✓ |
| newspaper-ad (new) | ✓ | | | ✓ |
| sms-mms (new) | partial† | | | ✓ |
| facebook-ads → Meta | ✓ | ✓ (when AIA) | | ✓ |
| google-ads (Search) | ✓ | | | ✓ |
| marketing-campaign | ✓ | | | ✓ |
| ad-creative | ✓ | | | ✓ |
| landing-page | ✓ | ✓ | | ✓ |
| email-campaign | partial† | | | ✓ |
| social-content | ✓ | ✓ | | ✓ |
| website-dev | partial‡ | ✓ | | ✓ |
| seo-audit | | | ✓ | ✓ |
| billboard-ooh | ✓ | | | ✓ |
| signage-wraps | ✓ | | | ✓ |

†sms/email: `auto_offer_details` + `auto_offer_disclaimer` + `auto_dealer_locations` only.
‡website: `auto_oem_brand` + `auto_dealer_locations` (+ Tier B VDP feed).

---

## 5. New template designs (full field specs)

All four: `is_multi_step=true`, `requires_approval=true`, `require_client_link=true`,
`allow_drafts=true`, `is_active=true`. Each ends with the `acct_*` block in its final step.
Field rows below list **step → section → field_key (type, req)**.

### 5.1 Meta AIA — "Meta Automotive Inventory Ads" (`meta-aia`, digital-marketing)
- **S1 Campaign Setup / Basics:** `client`(client,R), `campaign_name`(text,R),
  `meta_ad_account_id`(text,R), `objective`(dropdown: Traffic/Leads/Sales,R), `auto_oem_brand`.
- **S2 Inventory & Feed:** `auto_catalogue_id`(text,R), `auto_stock_feed_url`(url),
  `feed_partner`(dropdown: Autogate/CarLoop/Dealer DMS/Meta-direct/Other),
  `vehicle_set_filter`(textarea — "e.g. New Mazda under $40k"),
  `auto_vehicle_category`(checkboxgroup: New/Demo/Used).
- **S3 Creative & Copy:** `ad_format`(checkboxgroup: Single image/Carousel/Collection,R),
  `primary_text`(textarea,R), `headline_template`(text — supports `{{make}} {{model}} {{price}}`),
  `description_template`(text), `cta`(dropdown,R), `creative_assets`(files).
- **S4 Targeting & Budget:** `budget_type`(radio: Daily/Lifetime,R), `budget_amount`(currency,R),
  `audience`(textarea — "retargeting / in-market auto"), `locations`(textarea,R),
  `start_date`(date,R), `end_date`(date).
- **S5 Offer & Accountability:** Tier A offer block + `meta_pixel_id`(text),
  `lead_form_name`(text, conditional show when `objective=leads`) + `acct_*` block.

### 5.2 Google Performance Max (`google-pmax`, digital-marketing)
- **S1 Setup:** `client`(R), `campaign_name`(R), `pmax_type`(dropdown: Standard /
  Inventory (Vehicle Ads),R), `conversion_goal`(dropdown: Leads/Sales/Calls/Store visits,R),
  `auto_oem_brand`.
- **S2 Feed** (show when `pmax_type=inventory`): `merchant_centre_id`(text, conditional
  require when inventory), `auto_stock_feed_url`(url), `feed_partner`(dropdown).
- **S3 Asset Group:** `asset_group_name`(text,R), `final_url`(url,R), `business_name`(text,R),
  `headlines`(textarea,R, help "up to 15, ≤30 chars each"),
  `long_headlines`(textarea, help "≤90 chars"), `descriptions`(textarea,R, help "≤90 chars"),
  `images`(images), `logos`(files), `video_links`(textarea — YouTube URLs),
  `audience_signals`(textarea,R).
- **S4 Budget & Geo:** `daily_budget`(currency,R), `bidding`(dropdown: Max Conversions/
  Max Value/Target CPA/Target ROAS,R), `target_cpa_roas`(number), `locations`(textarea,R),
  `languages`(multiselect, default English), `start_date`(date,R), `end_date`(date).
- **S5 Offer & Accountability:** Tier A block + `acct_*`.

### 5.3 Newspaper Ad (`newspaper-ad`, print-ooh)
- **S1 Booking:** `client`(R), `ad_title`(text,R), `publication`(text,R — "e.g. Herald Sun"),
  `publication_section`(text — "Motoring / Classifieds / Main"),
  `booking_deadline`(date,R — material deadline), `publish_date`(date,R),
  `frequency`(dropdown: One-off/Weekly/Fortnightly/Repeat booking,R).
- **S2 Spec:** `ad_size`(dropdown: Full page/Half/Quarter/Strip/Custom col×cm/Classified line,R),
  `custom_dimensions`(text, conditional show when `ad_size=custom`),
  `colour_mode`(dropdown: Full colour/Spot/Mono,R), `bleed_required`(radio: Yes/No),
  `supplied_or_design`(radio: Press-ready supplied / ADME to design,R),
  `print_specs`(textarea — "DPI, format, max file size per rate card").
- **S3 Content** (show when `supplied_or_design=design`): `key_message`(textarea,R),
  `headline`(text), `body_copy`(richtext), `cta`(text),
  `contact_details`(textarea — "dealer address / phone / LMCT#"), `brand_assets`(files).
- **S4 Offer & Accountability:** Tier A block (driveaway + disclaimer mandatory for priced
  print) + `acct_*`.

### 5.4 SMS / MMS Campaign (`sms-mms`, email-crm)
- **S1 Setup:** `client`(R), `campaign_name`(R), `message_type`(radio: SMS/MMS,R),
  `objective`(dropdown: Promotion/Service reminder/Event/Re-engagement,R).
- **S2 Audience & Consent:** `list_segment`(text,R — "e.g. Past Toyota service customers"),
  `list_size`(number), `consent_confirmed`(checkbox,R — "Recipients opted in per Spam Act 2003"),
  `data_source`(dropdown: DMS/CRM/Form opt-ins/Purchased — NOT permitted).
- **S3 Message:** `sender_id`(text,R — "alphanumeric sender or number"),
  `message_copy`(textarea,R, help "160 chars/SMS segment; include opt-out"),
  `optout_text`(text,R, default "Reply STOP to opt out"),
  `mms_creative`(files, conditional show when `message_type=MMS`),
  `link_url`(url), `utm_params`(text), `link_shortener`(radio: Yes/No).
- **S4 Schedule, Offer & Accountability:** `send_datetime`(datetime,R) +
  `auto_offer_details` + `auto_offer_disclaimer` + `auto_dealer_locations` + `acct_*`.

---

## 6. Rework intent (per template — Pass 1)

Each rework is a **full field-set rewrite** (DELETE + re-INSERT, zero-brief-safe) plus
template-flag UPDATEs. The complete corrected field set for a template is assembled as:
**current fields** (from the audit batch doc's field table for that template) **− removals
+ additions** (`…-SYNTHESIS.md §4`) **+ applicable canonical blocks** (§4.1–4.2),
re-sequenced into clean steps/sections. Detailed change lists live in `…-SYNTHESIS.md §4`;
the Pass-1 specifics + blocks to apply:

- **facebook-ads → "Meta Ads Campaign"** (rename `name`; keep slug `facebook-ads`): add
  `platform`(checkboxgroup: Facebook/Instagram/Both,R) and `campaign_subtype`(radio:
  Standard/Auto Inventory Ads (AIA)/Lead Gen) → conditional reveal of `auto_catalogue_id`
  (when AIA) + `lead_form_name` (when Lead Gen); `meta_pixel_id`(text); `utm_template`(url);
  drop Hashtags; `Landing Page URL` conditional-required when subtype≠Lead Gen; age min/max
  in one section `width:half`; **Tier A** + **acct_***. **Retire `instagram-ads`** →
  `UPDATE brief_templates SET is_active=false WHERE slug='instagram-ads'`.
- **google-ads (Search trim):** remove PMax/Display/Shopping-specific fields (now in
  `google-pmax`); keep Search (keywords, match types, RSA headlines/descriptions, extensions);
  `conversion_action`(text); `target_cpa_roas` text→number; Target Languages drop required;
  **Tier A** + **acct_***.
- **marketing-campaign:** ensure `client`(client,R) present; add `platforms`(checkboxgroup,R),
  `target_locations`(textarea,R), `success_kpis`(textarea,R); Campaign Type options → Monday
  taxonomy; drop/optionalise Psychographics; **Tier A** + **acct_***.
- **ad-creative:** Campaign Objective richtext→dropdown; `platforms`(checkboxgroup);
  `dealer_vs_oem_brand`(radio: Dealer dominant/OEM dominant/Co-branded); make Mandatory
  Elements required; remove duplicate Age Range; `confirmed_budget`(currency); **Tier A** + **acct_***.
- **landing-page:** `auto_offer_details`(R); `utm_params`(text,R); make Tracking Requirements
  required; `campaign_ad_account`(text); Form Fields add Vehicle of Interest/Trade-In/Preferred
  Contact; **Tier A** + **Tier B** + **acct_***; `default_priority=high`.
- **email-campaign:** `list_segment`(text,R); `list_size`(number); `send_datetime`(datetime,R,
  replaces date-only); make Email Platform + CTA Landing Page required; `from_name`/`from_email`;
  `preview_text`(text); `spam_compliance`(checkbox,R — Spam Act: unsub + physical address);
  partial Tier A (offer/disclaimer) + **acct_***.
- **social-content:** **delete duplicate `Content Brief Title`**; Content Type options add
  Vehicle Showcase/Inventory Post/OEM Content/GBP Post/ReelMotion; `num_posts`(number);
  make Posting Frequency + Content Period required; **Tier A** + **Tier B** (`auto_stock_feed_url`)
  + **acct_***.
- **website-dev:** `vdp_required`(radio); Website Type add "Automotive Dealership" (first);
  `analytics_gtm_setup`(checkbox); make Current Website URL required; partial Tier A
  (`auto_oem_brand`+`auto_dealer_locations`) + **Tier B** + **acct_***.
- **seo-audit → "SEO Retainer Brief"** (rename name + description; keep slug): Scope add GBP
  Management; `num_locations`(number,R); `auto_dealer_locations`(R); `monthly_reporting_format`
  (dropdown); `access_checklist`(checkboxgroup: GSC/GA/Google Ads/GBP); make Target Geographic
  Locations required; **Tier C** + **acct_***.
- **billboard-ooh:** Key Visual textarea→files; Print/Digital specs textareas→structured
  dropdowns; Campaign Objective options add New Model Launch/Clearance; make Production Budget
  required; `booking_reference`(text); **Tier A** + **acct_***.
- **signage-wraps:** split Dimensions/Vehicle Details textarea → `vehicle_make`/`vehicle_model`/
  `vehicle_year`(text) + `vehicle_vin_stock`(text); `wrap_coverage`(dropdown, conditional on
  wrap); `print_install_scope`(radio: Design only/+print/+print+install,R); Quantity text→number;
  **Tier A** + **acct_***.

**Template-flag UPDATEs (all 11):** `require_client_link=true`. Plus `landing-page`
`default_priority='high'`; `name`/`description` rename on `facebook-ads` + `seo-audit`.

---

## 7. Build mechanics

Two migrations in `server/database/migrations/` (underscore convention, matching 185–190):

**`191_brief_templates_pass1_new.sql`** — the 4 new templates. Pattern (from `054`):
```sql
INSERT INTO brief_templates (category_id, slug, name, description, icon,
  requires_approval, is_multi_step, default_priority, require_client_link, sort_order)
SELECT c.id, 'meta-aia', 'Meta Automotive Inventory Ads', '…', 'i-lucide-car',
  true, true, 'high', true, 10
FROM brief_categories c WHERE c.slug='digital-marketing'
ON CONFLICT (category_id, slug) DO NOTHING;

DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='meta-aia';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  INSERT INTO brief_template_fields (template_id, field_key, field_label, field_type,
    placeholder, help_text, is_required, options, conditional_logic, step_number, step_title,
    section, width, sort_order) VALUES
    (tmpl_id, 'client', 'Client', 'client', NULL, NULL, true, '[]', NULL, 1, 'Campaign Setup', 'Basics', 'full', 1),
    … 
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;
```
`options` = JSON array `[{"label":"…","value":"…"}]` (or `'[]'`). `conditional_logic` = JSON
object `'{"fieldKey":"…","operator":"…","value":"…","action":"…"}'::jsonb` (or NULL).

**`192_brief_templates_pass1_rework.sql`** — the 11 reworks. Per template:
```sql
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='facebook-ads';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id=tmpl_id;   -- zero-brief-safe
  INSERT INTO brief_template_fields (…) VALUES … ;               -- full corrected set
END $$;
UPDATE brief_templates SET name='Meta Ads Campaign', require_client_link=true,
  description='…' WHERE slug='facebook-ads';
UPDATE brief_templates SET is_active=false WHERE slug='instagram-ads';   -- retire IG
```
Idempotency: new-template migration uses `ON CONFLICT DO NOTHING`; rework migration is a
deterministic DELETE+INSERT (re-runnable while briefs=0). **Guard:** before running 192,
re-assert `SELECT COUNT(*) FROM brief_field_values = 0` — if a real brief ever exists, switch
that template to additive `INSERT … ON CONFLICT DO NOTHING` + surgical `UPDATE` instead.

**Run:** `export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-)` then
`psql "$DATABASE_URL" -f server/database/migrations/191_…` then `192_…` (CLAUDE.md: run
migrations as part of the workflow).

---

## 8. Verification & acceptance

1. Both migrations run clean (no SQL errors).
2. Inventory re-query: `meta-aia`/`google-pmax`/`newspaper-ad`/`sms-mms` exist & active with
   expected field counts; `instagram-ads` `is_active=false`; the 11 reworks have new counts
   and `require_client_link=true`; `facebook-ads`.name='Meta Ads Campaign'; `seo-audit`.name
   updated.
3. JSON validity: `SELECT count(*) FROM brief_template_fields WHERE options IS NOT NULL` parses
   (jsonb guarantees), and spot-check conditional_logic objects have all of
   `fieldKey/operator/action`.
4. `field_key` uniqueness per template holds (UNIQUE constraint enforces).
5. Browser eyeball: load `/agency/briefs/templates`, open `meta-aia` + the merged Meta Ads
   Campaign, confirm steps/sections render and conditional fields hide/show.
6. Acceptance: every Pass-1 template has the `acct_*` block; every offer-bearing template has
   Tier A; required-flags reviewed as the gatekeeper completeness contract.

---

## 9. Out of scope this pass / sequenced follow-ups

**Next: Support Slice** (dedicated, after Pass 1 — decided 2026-06-23). Support/IT/change/bug
triage is the prime "copilots taking over" target, so it gets its own grounded design rather
than a generic deferral. Steps:
1. **R&D — mine the live Monday support boards** (authoritative taxonomy, via Monday API like
   the job-types R&D): **Support**, **Tickets** (uses Issue / Question / Request types per
   job-types doc), **Bugs Queue**, **Work Requests**, **Sales Support** (Status/Who/Client/
   Due/Priority), **Operations**, **ADME Creative Request**. Capture status flows, request
   types, priority/SLA, requester, routing columns.
2. **Rework the 4 support templates** (it-support, support-ticket, bug-report, change-request)
   with the Automation + Accountability lens: structured `request_type` (Issue/Question/
   Request), `affected_system`, `urgency_impact`, requester/`acct_accountable_owner`, SLA/
   priority, change `acct_approval_required` sign-off — so the gatekeeper can auto-route by
   type/system and a copilot can auto-acknowledge/triage. Document a template ↔ board mapping
   (Support Ticket↔Support/Tickets, Bug Report↔Bugs Queue, Change Request↔Work Requests).
3. **Intake-first** (decided): redesign the structured intake + routing/triage flow now in
   this slice. **Then a subsequent follow-up:** ingest the existing open tickets from the
   Monday support boards into the dashboard via the existing monday-migration system
   (`monday_migration_sessions`/`monday_item_mappings`) — only after the intake+routing flow
   is proven.

**Pass 2** (after the Support Slice): the 12 creative/media MINOR-retype templates (§3).

**Other follow-ups:**
- **Marketing sync (CLAUDE.md):** the 4 new templates + automotive enrichment are a genuine
  capability → add to `features/index.vue` + a `[slug].vue` entry. **Confirm before doing.**
- **`requires_quote` column** + a functional **department** taxonomy for gatekeeper
  auto-routing — future enhancements, not these passes.
- **No app-code change** in Pass 1 — purely template/field data.
