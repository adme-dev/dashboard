# Brief-Template Audit — SYNTHESIS & Build Spec (2026-06-23)

Consolidates the 3 batch audits (`…-batch-{1,2,3}.md`) against the rubric into one
prioritized change list + the cross-cutting automotive enrichment set + the 4 new gap
templates. **Corrected against the real DB schema** (the batch audits guessed some
column/flag names that don't exist).

Context: ADME = digital marketing agency for **car dealerships**. Inputs: the 3 batch
docs, the rubric, `monday-job-types.md`, and live-DB recon.

---

## 0. Ground truth (recon — corrects the audit's assumptions)

**Tables** (`server/database/schema-briefs.sql`):
- `brief_templates`: `id, category_id, department_id, name, slug, description, icon,
  requires_approval, auto_assign_to, auto_assign_department, default_priority,
  is_multi_step, show_progress, allow_drafts, allow_attachments, max_attachments,
  is_public, require_client_link, is_active, sort_order, created_by, …`
  **UNIQUE = (category_id, slug).**
- `brief_template_fields`: `id, template_id, field_key, field_label, field_type,
  placeholder, help_text, default_value(jsonb), is_required, validation_rules(jsonb),
  options(jsonb), conditional_logic(jsonb), step_number, step_title, section,
  width('full'|'half'|'third'), sort_order, show_in_preview, show_in_list`.
  **UNIQUE = (template_id, field_key).**

**Corrections vs. the batch audits:**
- ❌ **`requires_quote` does NOT exist.** Every "SET requires_quote: true" rec is N/A.
  Closest existing levers: `requires_approval` (already true on all client-facing
  templates) + the brief's own `budget_min/max/currency`. → DROP these recs (or, as a
  separate future enhancement, add a `requires_quote` column — out of scope here).
- ❌ **`auto_convert_on_approval` / `auto_convert_on_submit` do NOT exist.** Conversion
  is via the brief's `converted_to_task_id`/`converted_to_project_id` at review time.
- ✅ **Richer field types than the audit assumed** (33 total). Notably available:
  `datetime`, `time`, `email`, `phone`, `color`, `slider`, `rating`, `image(s)`,
  plus layout `heading`/`paragraph`/`divider`. So:
  - Email Campaign "Send Date & Time" → **`datetime`** (not text).
  - Phone/email capture → proper `phone`/`email` types.
- ✅ **`options`** = `[{"label":"…","value":"…","color?":"…"}]` (jsonb array).
- ✅ **`conditional_logic`** = a **single** object `{fieldKey, operator, value?, action}`.
  - `operator` ∈ `equals | not_equals | contains | not_contains | is_empty | is_not_empty`
  - `action` ∈ `show | hide | require | unrequire`
  - Evaluated in `app/components/briefs/BriefFormRenderer.vue`.
- ✅ **`validation_rules`** = `{min,max,minLength,maxLength,pattern,patternMessage,accept,maxFileSize}`.

**Seed source of truth:** all 28 live templates ARE in committed migrations —
9 in `schema-briefs.sql` + `schema-briefs-fields.sql`, the other 19 in
`054-brief-templates-expansion.sql`. New work = a fresh numbered migration (next: **191**).

**🔑 Data-safety: the DB has ZERO briefs and ZERO field values.** Rewriting/replacing
fields carries **no data-loss risk**. This means we can freely `DELETE`+re-`INSERT` a
template's whole field set (the same thing the admin `PUT /[id]/fields` endpoint does)
rather than surgical per-field UPDATEs — much cleaner and easier to verify.

**13 categories** (slug): marketing, creative-design, print-ooh, broadcast-audio,
social-media, content-seo, email-crm, strategy-research, advertising, digital-marketing,
website, it-request, support.

---

## 1. Verdict tally (28 templates)

| # | Template | slug | category | verdict |
|---|---|---|---|---|
| 1 | Facebook Ads Campaign | facebook-ads | digital-marketing | **REWORK** |
| 2 | Instagram Ads Campaign | instagram-ads | digital-marketing | **REWORK** (merge?) |
| 3 | Google Ads Campaign | google-ads | digital-marketing | **REWORK** |
| 4 | TikTok Ads Campaign | tiktok-ads | digital-marketing | minor |
| 5 | Display Banner Campaign | display-banner | advertising | minor |
| 6 | Marketing Campaign Brief | marketing-campaign | marketing | **REWORK** |
| 7 | Strategy & Media Plan | media-plan | strategy-research | minor |
| 8 | Advertising Creative Brief | ad-creative | advertising | **REWORK** |
| 9 | Influencer Campaign | influencer-campaign | social-media | minor |
| 10 | Graphic Design Request | graphic-design | creative-design | **REWORK** |
| 11 | Logo & Brand Identity | brand-identity | creative-design | minor |
| 12 | Print Collateral | print-collateral | print-ooh | **REWORK** |
| 13 | Signage & Vehicle Wraps | signage-wraps | print-ooh | **REWORK** |
| 14 | Billboard / OOH Campaign | billboard-ooh | print-ooh | **REWORK** |
| 15 | TV Commercial | tv-commercial | broadcast-audio | minor |
| 16 | Video Production | video-production | broadcast-audio | minor |
| 17 | Radio Ad | radio-ad | broadcast-audio | minor |
| 18 | Podcast / Audio Content | podcast-audio | broadcast-audio | **REWORK** |
| 19 | Social Media Content | social-content | social-media | **REWORK** + dup-field bug |
| 20 | Website Development Brief | website-dev | website | **REWORK** |
| 21 | Landing Page | landing-page | website | **REWORK** |
| 22 | Email Campaign | email-campaign | email-crm | **REWORK** |
| 23 | Blog / Article Content | blog-content | content-seo | minor |
| 24 | SEO Audit & Optimisation | seo-audit | content-seo | **REWORK** + rename |
| 25 | IT Support Request | it-support | it-request | minor |
| 26 | Support Ticket | support-ticket | support | minor |
| 27 | Bug Report | bug-report | support | keep-as-is |
| 28 | Change Request | change-request | support | minor |

Tally: **11 REWORK · 15 minor · 1 keep-as-is · 1 (Bug Report) effectively keep.**
The 5 internal templates (IT Support, Support Ticket, Bug Report, Change Request — and
Logo's internal-ness aside) have **no automotive relevance**; their fixes are small UX retypes.

---

## 2. The cross-cutting AUTOMOTIVE ENRICHMENT SET (the reusable block)

The single recurring finding across ALL client-facing templates: **no structured place
to capture the dealer offer, its legal disclaimer, OEM co-op status, dealer locations,
or the inventory feed.** Define a canonical set of fields (consistent `field_key`s so
data is queryable across templates) and apply the relevant tier to each template as a
dedicated **"Automotive & Offer"** section/step.

### Tier A — Offer block (every offer-bearing creative & paid-media template)
| field_key | label | type | req | notes |
|---|---|---|---|---|
| `auto_oem_brand` | OEM / Manufacturer Brand | dropdown | N | Toyota, Mazda, Ford, Kia, Hyundai, Mitsubishi, Nissan, Hyundai, MG, GWM, Subaru, VW, Honda, Isuzu, …, "Multi-franchise", "Independent / Used", "N/A" |
| `auto_vehicle_focus` | Vehicle(s) Featured | text | N | Make / Model / Year being promoted |
| `auto_vehicle_category` | Vehicle Category | dropdown | N | New / Demo / Used / Fleet / Finance / Service / Parts |
| `auto_offer_details` | Offer / Key Deal | textarea | N* | *required when the ad carries a price/offer. The heart of every dealer campaign. |
| `auto_driveaway_price` | Drive-Away / EGC Price | text | N | text not currency — values are ranges/wording ("Drive Away from $29,990") |
| `auto_offer_disclaimer` | Offer Disclaimer / Legal Fine Print | textarea | N* | help_text: "VFACTS, drive-away terms, comparison-rate wording as applicable." `conditional_logic: {fieldKey:'auto_driveaway_price', operator:'is_not_empty', action:'require'}` |
| `auto_oem_coop` | OEM Co-op Campaign? | radio | N | Yes / No — gates OEM approval + brand-compliance sign-off |
| `auto_oem_assets` | OEM Brand Guidelines / Assets | files | N | `conditional_logic: {fieldKey:'auto_oem_coop', operator:'equals', value:'yes', action:'show'}` |
| `auto_dealer_locations` | Dealer Location(s) | textarea | N | which rooftop(s) / suburbs this is for |

### Tier B — Inventory/feed extension (dynamic-inventory campaigns & sites)
Add on top of Tier A for: Meta AIA, Google PMax (Inventory/Vehicle Ads), Website (VDP),
Social inventory posts.
| field_key | label | type | req | notes |
|---|---|---|---|---|
| `auto_stock_feed_url` | Stock / Inventory Feed URL | url | N | Autogate / dealer DMS export / CarLoop / Merchant Centre feed |
| `auto_catalogue_id` | Product Catalogue / Feed ID | text | N | Meta catalogue ID / GMC feed ID |

### Tier C — Strategy/context (planning & SEO templates, not creative)
For Strategy & Media Plan, SEO. Uses the same keys where they fit (`auto_oem_brand`,
`auto_vehicle_category` as **checkboxgroup** "segments to focus on", `auto_dealer_locations`)
plus context-only fields:
| field_key | label | type | notes |
|---|---|---|---|
| `auto_oem_incentive_period` | OEM Incentive / Co-op Period | text | EOFY, plate-clearance, OEM bonus periods shape the plan |
| `auto_inventory_context` | Inventory Context | textarea | "overstocked on SUVs → push SUVs" |

**Application matrix** (which tier per template):
- **Tier A**: facebook-ads, instagram-ads, tiktok-ads, google-ads, display-banner,
  ad-creative, marketing-campaign, print-collateral, signage-wraps, billboard-ooh,
  tv-commercial, radio-ad, video-production, social-content, landing-page,
  email-campaign, graphic-design + the new **newspaper-ad**.
- **Tier A + B**: the new **meta-aia**, the new **google-pmax**, website-dev (VDP),
  social-content (inventory posts), facebook-ads/google-ads (when AIA/PMax sub-type).
- **Tier C**: media-plan, seo-audit.
- **None**: it-support, support-ticket, bug-report, change-request, brand-identity*,
  podcast-audio*, blog-content (gets only `auto_vehicle_focus`).
  (*Logo & Podcast get only `auto_oem_brand` as a compliance flag, optional.)

---

## 2b. The cross-cutting ACCOUNTABILITY & COMPLIANCE block (`acct_*`)

**Objective tie-in — Automation + Accountability.** These templates are not just
human forms; they are the structured input the **C5 brief-gatekeeper** triages and the
**AI copilots** read to act. So every client-facing template carries one canonical
accountability block (consistent `field_key`s → a machine contract copilots bind to once):

| field_key | label | type | req | notes |
|---|---|---|---|---|
| `acct_accountable_owner` | Accountable Owner | user | N | the named human responsible for delivery, captured at submit (gives the gatekeeper/copilot someone to route to & notify from t=0). |
| `acct_compliance_ack` | Compliance Confirmed | checkbox | N* | submitter attests offer claims + disclaimer are ACCC/ASIC compliant. **Conditionally required** when a price/offer is present: `conditional_logic: {fieldKey:'auto_driveaway_price', operator:'is_not_empty', action:'require'}`. The legal accountability gate. |
| `acct_approval_required` | Sign-off Required Before Go-Live | dropdown | N | None / Client / OEM / Client + OEM. The gate a copilot reads to know it **cannot** auto-proceed (no spend/deploy) until human sign-off. Defaults to OEM when `auto_oem_coop=yes`. |

Chain produced on every brief: **named owner → compliance attestation → approval gate** —
so any automated or copilot action is attributable and gated. Applied to the 11 reworks +
4 new (client-facing). The 4 internal templates (it/support/bug/change) get none.

---

## 2c. Automation & copilot-readiness principles (apply to every field)

1. **`is_required` per field = the C5 gatekeeper's completeness contract.** The gatekeeper
   decides `needs_info` (comment listing the missing fields + notify) vs `complete`
   (auto-assign + notify) by checking required fields. Designing required-flags per template
   **is** programming the gatekeeper — it is a deliberate output of this work, not incidental.
   `conditional_logic` `require`/`unrequire` actions extend the contract dynamically (e.g.
   disclaimer becomes required once a price is entered).
2. **Structure-over-freetext for anything a machine branches on.** Every field the gatekeeper
   or a copilot must read to decide/route/act uses a structured type (dropdown / radio /
   checkboxgroup / number / currency / date / url). Reserve `textarea`/`richtext` for
   genuinely open creative direction. This sharpens — not replaces — the audit's retypes.
3. **Stable `field_key` namespaces = the machine contract.** `auto_*` (offer/automotive) and
   `acct_*` (accountability) keys are identical across every template, so a copilot/automation
   binds to `auto_catalogue_id`, `auto_offer_disclaimer`, `acct_approval_required` once and it
   works everywhere. Per-template fields keep their own descriptive keys.
4. **`help_text` doubles as AI context.** Written for both the human and the copilot reading
   the field.
5. **Guardrail (unchanged): dashboard = System of Record; copilots PROPOSE, humans APPROVE
   spend/deploy.** `acct_approval_required` + the disclaimer/compliance fields are what let a
   copilot stop at "proposed" until sign-off.

> Note (recon): the `departments` table is the Monday board/client import (not a functional-team
> taxonomy), so `auto_assign_department` is NOT a usable auto-routing hook today.
> `acct_accountable_owner` is the named-owner mechanism instead.

---

## 3. Cross-cutting NON-automotive fixes (apply broadly)

1. **`require_client_link = true`** on every client-facing template (currently **false on
   all 28** — confirmed in DB). Exempt the 4 internal ones (it-support, support-ticket,
   bug-report, change-request) and keep `graphic-design` true too.
2. **`Campaign Objective` typed `richtext` → `dropdown`** in tv-commercial, radio-ad,
   video-production, ad-creative (free-form objective is unreportable). Consistent
   automotive-aware options: Brand Awareness, New Model Launch, Clearance / End-of-Run,
   Finance Offer, Seasonal Campaign, Event Promotion, Dealer Awareness, Lead Generation.
3. **Free-form spec textareas → structured.** `Size / Dimensions` (graphic-design,
   print-collateral), `Dimensions / Vehicle Details` (signage), `Target Radio Stations`
   (radio), `Target Networks` (tv), `Print/Digital Specs` (billboard) → dropdown /
   checkboxgroup with a conditional "Custom" textarea.
4. **Number fields stored as text → retype `number`**: Print Quantity, Pages/Sides
   (print-collateral), Quantity (signage), TargetCPA/ROAS (google-ads).
5. **Bug fix: Social Media Content has a duplicate `Content Brief Title`** — delete one.
6. **Age min/max pair UX** (FB/IG/TikTok): keep two `number`s but group in one
   `section` with `width:'half'` so they render side-by-side (no schema change needed).
7. **Disclaimer-copy capture where a "Legal disclaimer" checkbox exists but no text
   field** (TVC `Mandatory Inclusions`): add conditional `auto_offer_disclaimer`.

---

## 4. Per-template consolidated change list (prioritized)

> Notation: **+**=add, **−**=remove, **~**=retype/relabel, **R**=required change,
> **C**=conditional_logic, **§**=section/step, **⚑**=template flag. "[A]"/"[B]"/"[C]"
> = apply that automotive tier as a new "Automotive & Offer" section.

### HIGH priority (REWORK + high volume)

**1. facebook-ads** — `+`[A]+[B-when-AIA]; `+ auto_campaign_subtype` (radio: Standard /
Auto Inventory Ads (AIA) / Lead Gen) with C to reveal `auto_catalogue_id` + `lead_form_name`;
`+ meta_pixel_id` (text); `+ utm_template` (url); `~` Landing Page URL C-required when
subtype≠Lead Gen; `⚑ require_client_link=true`. (Note FB/IG merge decision — see §6.)

**2. instagram-ads** — Either **MERGE → "Meta Ads Campaign"** with a `platform`
checkboxgroup (FB/IG/Both) [recommended], or mirror facebook-ads changes; `−` Hashtags
(no paid value); `+ meta_pixel_id`; `+`[A].

**3. google-ads** — `+ auto` section [A]+[B]; `+ google_vehicle_ads` option to Campaign
Type; `+ merchant_centre_id`/`auto_stock_feed_url` (C: when type = PMax-Inventory/Vehicle);
`+ conversion_action` (text); `~ target_cpa_roas` text→`number`; **C** hide
Keywords/MatchTypes/Headlines/Descriptions when Campaign Type ≠ Search; `~` Target
Languages drop required (default English); `⚑ require_client_link`. (Consider also the
standalone **google-pmax** new template — §5.)

**6. marketing-campaign** — `+ Client` (client, R) — **verify it exists** (audit flagged
possibly missing); `+ platforms` (checkboxgroup Meta/Google/TikTok/Display/Other, R);
`+ target_locations` (textarea, R); `+ success_kpis` (textarea, R, split from objectives);
`+`[A]; `~` Campaign Type options → Monday taxonomy; `−`/optionalize Psychographics;
`⚑ require_client_link`.

**8. ad-creative** — `+`[A] (vehicle/offer/driveaway/disclaimer — the #1 gap for a
creative brief); `+ platforms` (checkboxgroup); `+ dealer_vs_oem_brand` (radio: Dealer
dominant / OEM dominant / Co-branded); `~ Campaign Objective` richtext→dropdown; `R`
Mandatory Elements; `−` Age Range (dup of Target Audience); `+ confirmed_budget` (currency).

**12. print-collateral** — `+`[A]; `~ Size/Dimensions` text→dropdown(+Custom C);
`~ Print Quantity`, `Pages/Sides` text→`number`; `+ colour_mode` (dropdown CMYK/RGB/
Pantone, R); `+ print_supplier` (text); `R` Print-Ready Deadline; `+` automotive
collateral types (Mirror Hangers, Showroom Signage, Finance/Rate-Card Insert, Service Menu).

**13. signage-wraps** — split `Dimensions / Vehicle Details` textarea → structured
`vehicle_make`/`vehicle_model`/`vehicle_year` + `+ vehicle_vin_stock` (text);
`+ wrap_coverage` (dropdown Full/¾/Half/Bonnet/Rear/Doors/Custom, C on Signage Type=wrap);
`+ print_install_scope` (radio Design only / +print / +print+install, R); `~ Quantity`
→`number`; `+`[A]; `+ oem_compliance` flag.

**14. billboard-ooh** — `~ Key Visual / Hero Image` textarea→`files` (or richtext);
`~ Print/Digital Specs` textareas→structured dropdowns; `+`[A] (driveaway/disclaimer
mandatory for priced OOH); `+` Campaign Objective options New Model Launch / Clearance;
`R` Production Budget; `+ booking_reference` (text).

**18. podcast-audio** — heavy **C** by Content Type: `+ num_episodes`/`episode_frequency`
(C=podcast), `+ voiceover_pref`/`music_required` (C=audio_ad/jingle), `+ recording_location`,
`+ script_required`; `R` Tone & Style; `R` Budget. Automotive only if Content Type=Audio
Ad → minimal [A]. Lowest automotive relevance.

**19. social-content** — **`−` duplicate `Content Brief Title`** (bug); `+` Content Type
options Vehicle Showcase / Inventory Post / OEM Content / GBP Post / ReelMotion;
`+ auto_stock_feed_url` [B]; `+`[A] offer block; `R` Posting Frequency + Content Period
(retainer); `+ num_posts` (number).

**20. website-dev** — `+ auto_oem_brand`; `+ auto_dealer_locations`; `+ auto_stock_feed_url`
[B]; `+ vdp_required` (radio Y/N); `+ Automotive Dealership` Website Type option (first);
`+ analytics_gtm_setup` (checkbox standalone); `R` Current Website URL; `+ finance_disclaimer_flag`;
`⚑ require_client_link` (already true).

**21. landing-page** — `+ auto_offer_details` (R — #1 gap); `+ utm_params` (text, R);
`+ auto_offer_disclaimer` (C-required when finance); `+ auto_stock_feed_url` [B];
`R` Tracking Requirements; `+ campaign_ad_account` (text); `~ Form Fields` add Vehicle of
Interest / Trade-In / Preferred Contact; `+ auto_oem_brand`; `⚑ default_priority=high`.

**22. email-campaign** — `+ list_segment` (text/dropdown, R); `+ list_size` (number);
`+ send_datetime` (**datetime**, R — replaces date-only); `+ auto_offer_details` (R);
`+ auto_offer_disclaimer`; `+ spam_compliance` (checkbox — Spam Act 2003: unsub +
physical address, R); `R` Email Platform; `R` CTA Landing Page (url); `+ from_name`/
`from_email`; `+ preview_text` (text).

**24. seo-audit** — **rename → "SEO Retainer Brief"** (label/description only; keep slug);
`+ gbp_management` Scope option; `+ num_locations` (number, R); `+ auto_dealer_locations`
(R); `+ monthly_reporting_format` (dropdown); `+ access_checklist` (checkboxgroup GSC/GA/
GAds/GBP); `R` Target Geographic Locations; `+ auto_oem_brand` [C].

**10. graphic-design** — `+` Design Type automotive options (Vehicle Wrap, Carsales
Banner/Card, OOH/Billboard, Pull-up Banner, Mirror Hangers, Newspaper Ad, Email Signature,
Business Card); `~ Size/Dimensions` text→dropdown(+Custom); `+ output_format`
(checkboxgroup Print-PDF/Digital/Source/Both); `+ num_sizes` (number, R); `+`[A] minimal
(offer/disclaimer/oem_coop); `⚑ require_client_link` (already true), keep approval.

### MEDIUM priority (minor + automotive add)

**4. tiktok-ads** — `+`[A] (vehicle/offer/disclaimer/oem); `+ tiktok_pixel_id`;
`+ lead_form_name` (C=Lead Gen); `+ spark_ads_post_id` (C=Ad Format∋Spark); `~` Interest
Categories add Automotive; `⚑ require_client_link`.

**5. display-banner** — `+`[A] (vehicle/driveaway/disclaimer); `+` Carsales banner sizes
+ Carsales ad-network option; `+ auto_oem_coop`+`auto_oem_assets`; `−` Language Versions
(EU langs irrelevant); `~ Key Message/Headline` textarea→text; merge Background+Notes;
C Custom Sizes.

**7. media-plan** — `+`[C] (segments checkboxgroup, OEM incentive period, inventory
context); `+ vfacts_market_context` (textarea); `+ seasonality` (textarea); `+ creative_lead_time`
(dropdown); `+ confirmed_budget` (currency).

**9. influencer-campaign** — `+ geographic_requirement` (text, R); `+ auto_vehicle_focus`;
`+ dealer_location_feature` (text); `+ exclusivity_restriction` (textarea); `R` Content
Usage Rights; `+ accc_disclosure_ack` (checkbox, R); `+ influencer_niche` (checkboxgroup
incl Automotive); `+ num_influencers` add "4".

**15. tv-commercial** — `~ Campaign Objective` richtext→dropdown; `~ Target Networks`
textarea→checkboxgroup (Seven/Nine/Ten/Foxtel/YouTube/ABC/SBS/SVOD); `R` On-Air Date;
`+ script_storyboard_status` (dropdown); `+`[A] (vehicle/driveaway/disclaimer) +
conditional `auto_offer_disclaimer` when "Legal disclaimer" inclusion checked.

**16. video-production** — `~ Preferred Shoot Dates` textarea→daterange; `+ talent_vo`
(dropdown); `+` Video Type options (Dealership Walkthrough / Vehicle Showcase);
`+ music_required` (dropdown); `R` Target Platforms; `+ num_videos` (number); `+`[A] minimal;
`+ shoot_location` (dropdown Dealership/External/Studio/Multiple).

**17. radio-ad** — `~ Campaign Objective` richtext→dropdown; `~ Target Radio Stations`
textarea→checkboxgroup; `+ script_author` (dropdown Agency/Client-draft/Client, R);
`R` Production Budget; `+ auto_offer_disclaimer` (C: when objective=Finance/Clearance/
Promotion — ASIC wording) + make Offer Details conditionally R.

### LOW priority (minor / internal)

**11. brand-identity** — `+ revision_rounds` (dropdown); `R` Number of Concepts;
`+ current_brand_audit` (dropdown); `+ franchise_type` (dropdown New/Used/Multi/
Independent); `+ auto_oem_brand` (optional compliance flag); fix sort order (Project Type up).

**23. blog-content** — `R` Target SEO Keywords; `+ target_url_slug` (text); `+ internal_links`
(textarea); `+ auto_vehicle_focus` (text); `R` Target Word Count; `+ publish_date` (date).

**25. it-support** — `~ Device Type`/`Operating System` text→dropdown; `+ affected_system`
(dropdown); `+ urgency_impact` (dropdown). No automotive.

**26. support-ticket** — `+ affected_client` (client); `+ url_location` (url); clarify
vs Bug Report in help_text. No automotive.

**27. bug-report** — keep. `R` URL (C: when System=Dashboard); `~ Browser/Device`
text→two dropdowns; `+ user_role` (dropdown). No automotive.

**28. change-request** — `R` Current State; `+ estimated_effort` (dropdown); `+ affected_client`
(client); `+ signoff_required` (radio). No automotive.

---

## 5. New gap templates (design)

All 4 follow the 054 migration pattern. Multi-step, `require_client_link=true`,
`requires_approval=true`.

### 5.1 Meta AIA — Automotive Inventory Ads  (slug `meta-aia`, cat `digital-marketing`)
The single biggest dealer campaign type. = Tier A + Tier B + AIA specifics.
- **Step 1 Campaign Setup**: client (R); campaign_name (text R); `meta_ad_account_id`
  (text R); objective (dropdown: Traffic / Leads / Sales — R); `auto_oem_brand`.
- **Step 2 Inventory & Feed**: `auto_catalogue_id` (text R — Meta vehicle catalogue);
  `auto_stock_feed_url` (url); `feed_partner` (dropdown: Autogate / CarLoop / dealer DMS /
  Meta-direct / Other); `vehicle_set_filter` (textarea — "New Mazda only / under $40k");
  `auto_vehicle_category` (checkboxgroup New/Demo/Used).
- **Step 3 Creative & Copy**: ad_format (checkboxgroup: Single / Carousel / Collection);
  primary_text (textarea R); headline_template (text — supports `{{make}} {{model}} {{price}}`);
  description_template (text); cta (dropdown); creative_assets (files).
- **Step 4 Targeting & Budget**: budget_type (radio) + budget_amount (currency R);
  audience (textarea — retargeting/in-market-auto); locations (textarea R);
  start_date (date R) / end_date (date).
- **Step 5 Offer & Compliance**: `auto_offer_details`; `auto_driveaway_price`;
  `auto_offer_disclaimer`; `auto_oem_coop`→`auto_oem_assets` (C); `auto_dealer_locations`;
  meta_pixel_id (text); lead_form_name (text, C objective=Leads).

### 5.2 Google Performance Max  (slug `google-pmax`, cat `digital-marketing`)
PMax (incl Vehicle Ads / Inventory) — distinct field set from Search.
- **Step 1 Setup**: client (R); campaign_name (R); `pmax_type` (dropdown: Standard /
  Inventory (Vehicle Ads) — R); objective/conversion goal (dropdown R); `auto_oem_brand`.
- **Step 2 Feed (C: pmax_type=Inventory)**: `merchant_centre_id` (text R-when-inventory);
  `auto_stock_feed_url` (url); `vehicle_feed_partner` (dropdown).
- **Step 3 Asset Group**: asset_group_name (text R); final_url (url R); business_name
  (text R); headlines (textarea R — "up to 15, ≤30 chars"); long_headlines (textarea);
  descriptions (textarea R — "≤90 chars"); images (images/files); logos (files);
  videos (textarea — YouTube links); `audience_signals` (textarea R).
- **Step 4 Budget & Geo**: daily_budget (currency R); bidding (dropdown: Max Conv /
  Max Value / +tCPA / +tROAS); target_cpa_roas (number); locations (textarea R);
  languages (multiselect — default English); start/end dates.
- **Step 5 Offer & Compliance**: Tier A offer block.

### 5.3 Newspaper Ad  (slug `newspaper-ad`, cat `print-ooh`)
High-volume dealer deliverable (Monday Newspaper Ads board, 170+ weekly).
- **Step 1 Booking**: client (R); ad_title (text R); `publication` (text R — e.g.
  Herald Sun, local paper); `publication_section` (text — Motoring / Classifieds / Main);
  `booking_deadline` (date R — material deadline); `publish_date` (date R); `frequency`
  (dropdown: One-off / Weekly / Fortnightly / Repeat-booking).
- **Step 2 Spec**: `ad_size` (dropdown: Full page / Half / Quarter / Strip / col×cm
  custom / Classified line); `custom_dimensions` (text, C ad_size=custom — "columns × cm");
  `colour_mode` (dropdown: Full colour / Spot / Mono); `bleed_required` (radio);
  `supplied_or_design` (radio: Press-ready supplied / ADME to design — R);
  `print_specs` (textarea — DPI, format, max file size from rate card).
- **Step 3 Content** (C: supplied_or_design=design): key_message (textarea R);
  headline (text); body_copy (richtext); cta (text); contact_details (textarea — dealer
  address/phone/LMCT#); brand_assets (files).
- **Step 4 Offer & Compliance**: Tier A offer block (driveaway + VFACTS/comparison-rate
  disclaimer mandatory for priced print); `auto_oem_coop`.

### 5.4 SMS / MMS Campaign  (slug `sms-mms`, cat `email-crm`)
Direct-response channel; compliance-heavy.
- **Step 1 Setup**: client (R); campaign_name (R); `message_type` (radio: SMS / MMS — R);
  objective (dropdown: Promotion / Service reminder / Event / Re-engagement).
- **Step 2 Audience & List**: `list_segment` (text R — "Past Toyota service customers");
  `list_size` (number); `consent_confirmed` (checkbox R — "Recipients have opted in per
  Spam Act 2003"); `data_source` (dropdown: DMS / CRM / Form opt-ins / Purchased-NO).
- **Step 3 Message**: `sender_id` (text R — alphanumeric sender / number);
  `message_copy` (textarea R — help_text "160 chars/SMS segment; include opt-out");
  `optout_text` (text R, default "Reply STOP to opt out"); `mms_creative` (files, C
  message_type=MMS); `link_url` (url) + `utm_params` (text); `link_shortener` (radio).
- **Step 4 Schedule & Offer**: `send_datetime` (datetime R); `auto_offer_details`;
  `auto_offer_disclaimer` (finance/driveaway wording); `auto_dealer_locations`.

---

## 6. Build strategy & open decisions

**Approach (recommended):** one new migration **`191-brief-templates-automotive-enrich.sql`**
(or split into 2: `191-…-new-templates` + `192-…-field-rework`). Because the DB has zero
briefs:
- New templates → `INSERT … ON CONFLICT DO NOTHING` (054 pattern), idempotent.
- Edited templates → for REWORK ones, **`DELETE FROM brief_template_fields WHERE
  template_id=(…) ; INSERT … (full corrected set)`** inside the `DO $$` block (clean rewrite,
  zero-brief-safe). For minor ones, targeted `UPDATE`/additive `INSERT … ON CONFLICT DO
  NOTHING`. Template-flag changes → `UPDATE brief_templates SET require_client_link=true, …`.
- Run via `psql "$DATABASE_URL" -f …` per CLAUDE.md (auto-run migrations).
- Verify in `/agency/briefs/templates` admin UI + re-query field counts.

**Sequencing:** new templates first (pure adds, low risk) → HIGH rework → MEDIUM → LOW.
Or ship in waves so each is verifiable.

**Marketing sync (CLAUDE.md):** the 4 new templates + automotive enrichment are a
genuine product capability → add to `features/index.vue` + a `[slug].vue` entry +
MarketingNav if briefs has a nav slot. (Confirm scope.)

**DECISIONS (LOCKED 2026-06-23):**
1. **FB + IG → MERGE** into one "Meta Ads Campaign" (platform checkboxgroup). `instagram-ads`
   retired via `is_active=false` (zero briefs → safe). ✅
2. **Scope = PHASED.** Pass 1 = 4 new + 11 HIGH reworks (below). MEDIUM/LOW → Pass 2. ✅
3. **`requires_quote`** — DROP the recs (column doesn't exist; not adding it this pass). ✅
4. **Automotive/accountability fields = per-template rows** with consistent `field_key`s
   (no shared field-library refactor — YAGNI). ✅
5. **Google → SPLIT.** `google-ads` trimmed to Search; new `google-pmax` template. ✅
6. **Accountability block = Standard (3 fields)** `acct_*` (§2b) on all client-facing. ✅
7. **`require_client_link=true`** on all client-facing templates. ✅

**Pass-1 set (15 templates):** new = `meta-aia`, `google-pmax`, `newspaper-ad`, `sms-mms`;
reworks = `facebook-ads`→Meta Ads Campaign (+retire `instagram-ads`), `google-ads`→Search,
`marketing-campaign`, `ad-creative`, `landing-page`, `email-campaign`, `social-content`,
`website-dev`, `seo-audit`→SEO Retainer Brief, `billboard-ooh`, `signage-wraps`.
**Pass-2 deferred (16):** tiktok-ads, display-banner, media-plan, influencer-campaign,
graphic-design, brand-identity, print-collateral, tv-commercial, video-production, radio-ad,
podcast-audio, blog-content, it-support, support-ticket, bug-report, change-request.

**Migrations:** `191_brief_templates_pass1_new.sql` (4 new) + `192_brief_templates_pass1_rework.sql`
(11 reworks: full field-set rewrite via DELETE+INSERT — zero-brief-safe — + flag UPDATEs +
retire IG). Run via `psql "$DATABASE_URL" -f …`. Branch: `feat/brief-templates-automotive-pass1`
off `main`.
