# Brief Template Audit — Batch 1: PAID MEDIA + STRATEGY
**Date**: 2026-06-23
**Auditor**: Claude (automated)
**Batch**: Facebook Ads Campaign, Instagram Ads Campaign, TikTok Ads Campaign, Google Ads Campaign, Display Banner Campaign, Marketing Campaign Brief, Strategy & Media Plan, Advertising Creative Brief, Influencer Campaign

Context: ADME = digital marketing agency for **car dealerships**. All paid media templates must be assessed for automotive gaps (stock/inventory feed, VFACTS/offer disclaimer, drive-away pricing, OEM co-op, dealer location(s), finance/comparison-rate disclaimer).

---

## 1. Facebook Ads Campaign

### Fields (sorted by section)
| Label | Type | Req? | Section |
|---|---|---|---|
| Client | client | Y | Basic Info |
| Campaign Name | text | Y | Basic Info |
| Campaign Objective | dropdown | Y | Objectives |
| Campaign Description | richtext | Y | Objectives |
| Ad Format | checkboxgroup | Y | Formats |
| Budget Type | radio | Y | Budget |
| Budget Amount ($) | currency | Y | Budget |
| Bid Strategy | dropdown | N | Budget |
| Ad Scheduling | dropdown | N | Schedule |
| Start Date | date | Y | Schedule |
| End Date | date | N | Schedule |
| Define Your Target Audience | heading | N | — |
| Minimum Age | number | Y | Demographics |
| Maximum Age | number | Y | Demographics |
| Gender | dropdown | Y | Demographics |
| Target Locations | textarea | Y | Geography |
| Interests & Behaviors | textarea | N | Interests |
| Custom Audiences | checkboxgroup | N | Custom Audiences |
| Excluded Audiences | textarea | N | Exclusions |
| Primary Text | textarea | Y | Copy |
| Headline | text | Y | Copy |
| Description | text | N | Copy |
| Call to Action Button | dropdown | Y | Copy |
| Landing Page URL | url | N | Destination |
| Creative Assets | files | N | Assets |
| Creative Direction Notes | richtext | N | Notes |
| Success Metrics/KPIs | textarea | Y | Goals |
| Additional Notes | richtext | N | Other |

**Field count**: 28

### Assessment

**Verdict**: SIGNIFICANT-REWORK

**1. Coverage — Missing fields**
- No `Campaign Sub-type` / objective variant (AIA, Traffic Inventory, Lead Gen form vs landing page — all distinct workflows for dealer campaigns)
- No `Facebook Pixel ID` / `Dataset ID` (required for Conversions objective; dealer lead tracking)
- No `Lead Form Name` (when objective = Lead Generation — critical for dealers)
- No UTM parameters / tracking template
- No `Offer/Promotion Details` field (dealers always have a specific offer: driveaway price, finance rate, model)

**2. Bloat / redundancy**
- `Minimum Age` + `Maximum Age` as separate number fields: awkward — should be a single `Age Range` text or two number fields shown together. Functional but clunky.
- `Interests & Behaviors` is one textarea — better split (already a freetext blob that's hard to parse).

**3. Field-type fit**
- `Target Locations` → textarea is acceptable for free-entry but a `multiselect` with suburb/state options or at minimum `checkboxgroup` for states would be better for AU dealer context.
- `Landing Page URL` is not required — should be required for Traffic/Conversions objectives (conditional_logic opportunity).

**4. Required-flag sanity**
- `Landing Page URL` not required: should be conditionally required (when objective ≠ Lead Generation/Messages).
- `Minimum Age` / `Maximum Age` required: over-required — targeting can be left broad.
- `Creative Assets` not required: acceptable (creative may come from production team).

**5. Automotive gaps**
- NO `Inventory/Stock Feed URL` or `AIA toggle` (Meta AIA = biggest dealer campaign type)
- NO `Vehicle Category` / `Make / Model / Year` being promoted
- NO `Offer / Drive-Away Price` structured field
- NO `Disclaimer Text` (VFACTS, comparison rate, drive-away fine print — legally required on AU dealer ads)
- NO `OEM Co-op Campaign` flag (yes/no — determines asset restrictions and brand compliance sign-off)
- NO `Dealer Location(s)` being advertised (multi-rooftop dealers need to specify)
- NO `Finance/Comparison Rate Disclaimer` field

**6. UX structure**
- `heading` field "Define Your Target Audience" exists but is orphaned (doesn't group its section fields logically in current sort order — audience fields are scattered across Demographics, Geography, Interests, Custom Audiences sections).
- Opportunity: `is_multi_step` with steps: Campaign Setup → Audience → Creative & Copy → Budget & Schedule.
- Conditional: show `Lead Form Name` only when objective = Lead Generation; show `Landing Page URL` only when objective ≠ Lead Generation/Messages.

**7. Template-level flags**
- `require_client_link`: should be `true`
- `requires_quote`: `false` (production team does this separately)
- `default_priority`: `normal`

**Top changes (prioritised)**
1. ADD `Vehicle / Offer Details` section: `Vehicle Make/Model` (text, required), `Offer / Promotion` (textarea, required), `Drive-Away Price` (currency, optional)
2. ADD `Disclaimer Text` (textarea, required) — offer/finance/VFACTS legal copy
3. ADD `Facebook Pixel ID` (text, optional) + `Lead Form Name` (text, conditional on objective=Lead Gen)
4. ADD `AIA / Inventory Campaign` toggle (radio: Standard / Auto Inventory Ads) — if AIA, show `Product Catalogue / Feed ID` (text)
5. ADD `Dealer Location(s)` (textarea or multiselect, optional)
6. ADD `OEM Co-op Campaign` (radio: Yes/No) — if Yes, show `OEM Brand Guidelines` (files)
7. ADD `UTM / Tracking Template` (url, optional)
8. FIX: make `Landing Page URL` conditionally required
9. FIX: `Age Range` — merge min/max into a single paired display (UX)
10. SET `require_client_link: true`

**Automotive gaps**: AIA feed, vehicle/offer details, disclaimer, OEM co-op, dealer locations — all missing.

---

## 2. Instagram Ads Campaign

### Fields (sorted by section)
| Label | Type | Req? | Section |
|---|---|---|---|
| Client | client | Y | Basic Info |
| Campaign Name | text | Y | Basic Info |
| Instagram Handle | text | Y | Account |
| Campaign Objective | dropdown | Y | Objectives |
| Campaign Description | richtext | Y | Objectives |
| Ad Format | checkboxgroup | Y | Formats |
| Budget Type | radio | Y | Budget |
| Budget Amount ($) | currency | Y | Budget |
| Optimization Goal | dropdown | N | Budget |
| Ad Scheduling | dropdown | N | Schedule |
| Start Date | date | Y | Schedule |
| End Date | date | N | Schedule |
| Minimum Age | number | Y | Demographics |
| Maximum Age | number | Y | Demographics |
| Gender | dropdown | Y | Demographics |
| Target Locations | textarea | Y | Geography |
| Interests | textarea | N | Interests |
| Behaviors | textarea | N | Behaviors |
| Custom Audiences | checkboxgroup | N | Custom Audiences |
| Primary Text/Caption | textarea | Y | Copy |
| Headline (for Feed) | text | N | Copy |
| Call to Action | dropdown | Y | Copy |
| Hashtags | textarea | N | Discovery |
| Landing Page URL | url | N | Destination |
| Creative Assets | files | N | Assets |
| Visual Style & Direction | richtext | N | Direction |
| Reference Accounts/Posts | richtext | N | Direction |
| Success Metrics/KPIs | textarea | Y | Goals |
| Additional Notes | richtext | N | Other |

**Field count**: 29

### Assessment

**Verdict**: SIGNIFICANT-REWORK

**1. Coverage — Missing fields**
- Same core gaps as Facebook: no AIA/inventory toggle, no offer/vehicle fields, no disclaimer, no OEM co-op
- No `Instagram Shopping Catalogue` field (relevant for dealers with vehicle inventory feeds)
- No `Lead Form Name` (when objective = Lead Generation)
- No `Facebook Pixel / Meta Pixel ID` (IG ads still use Meta pixel for conversion tracking)
- `Instagram Handle` is required but the template has no validation — should be `@handle` format hint

**2. Bloat / redundancy**
- Near-identical to Facebook Ads Campaign template (~90% field overlap). These two could be merged into a single **Meta Ads Campaign** template with a platform checkboxgroup (Facebook / Instagram / Both) — consistent with how Meta Ads Manager actually works (single campaign, placement-level targeting). Maintaining two templates means double the maintenance burden for identical gaps.
- `Hashtags` field: useful for organic social, minimal value for paid IG ads (hashtags don't improve paid ad reach).
- `Behaviors` and `Interests` as separate textareas (Facebook has them merged) — minor inconsistency.

**3. Field-type fit**
- `Target Locations` → textarea (same issue as Facebook; freetext for AU locations)
- `Reference Accounts/Posts` → richtext: fine for creative direction

**4. Required-flag sanity**
- `Minimum Age` / `Maximum Age` required: same over-requirement as Facebook template.
- `Instagram Handle` required: correct — needed to configure the ad account connection.

**5. Automotive gaps**
- Same as Facebook Ads Campaign: NO AIA/inventory, NO vehicle/offer, NO disclaimer, NO OEM co-op, NO dealer locations.
- Additionally: `Instagram Shopping` catalogue not referenced (Meta's equivalent of vehicle inventory ads on IG).

**6. UX structure**
- Should consolidate with Facebook into **Meta Ads Campaign** (single template, `Platform` checkboxgroup: Facebook / Instagram / Both, with platform-specific fields shown conditionally).
- If kept separate: add `is_multi_step` same as Facebook recommendation.
- `Visual Style & Direction` + `Reference Accounts/Posts` are good IG-specific additions — keep.

**7. Template-level flags**
- `require_client_link: true`

**Top changes (prioritised)**
1. MERGE with Facebook Ads Campaign → single **Meta Ads Campaign** template (biggest efficiency win)
2. If kept separate: add same automotive block (Vehicle/Offer/Disclaimer/AIA/OEM/Dealer Location) as Facebook
3. REMOVE `Hashtags` (not meaningful for paid ads)
4. ADD `Meta Pixel ID` (text, optional)
5. ADD `Lead Form Name` (text, conditional)
6. FIX: Age Range UX (same as Facebook)

**Automotive gaps**: Identical to Facebook template — all missing.

---

## 3. TikTok Ads Campaign

### Fields (sorted by section)
| Label | Type | Req? | Section |
|---|---|---|---|
| Client | client | Y | Basic Info |
| Campaign Name | text | Y | Basic Info |
| Advertising Objective | dropdown | Y | Objectives |
| Campaign Description | richtext | Y | Objectives |
| Ad Format | checkboxgroup | Y | Formats |
| Video Orientation | radio | Y | Specs |
| Budget Type | radio | Y | Budget |
| Budget Amount ($) | currency | Y | Budget |
| Bid Strategy | dropdown | N | Budget |
| Start Date | date | Y | Schedule |
| End Date | date | N | Schedule |
| Minimum Age | number | Y | Demographics |
| Maximum Age | number | Y | Demographics |
| Gender | dropdown | Y | Demographics |
| Target Locations | textarea | Y | Geography |
| Interest Categories | checkboxgroup | N | Interests |
| Behavior Targeting | checkboxgroup | N | Behaviors |
| Custom Audiences | checkboxgroup | N | Custom Audiences |
| Video Concept | richtext | Y | Content |
| Ad Text/Caption | textarea | Y | Copy |
| Call to Action | dropdown | Y | Copy |
| Suggested Hashtags | textarea | N | Discovery |
| Music/Sound | dropdown | Y | Audio |
| Landing Page URL | url | N | Destination |
| Video Assets | files | N | Assets |
| Creative Direction Notes | richtext | N | Notes |
| Success Metrics/KPIs | textarea | Y | Goals |
| Additional Notes | richtext | N | Other |

**Field count**: 28

### Assessment

**Verdict**: MINOR-TWEAKS (with automotive additions)

**1. Coverage — Missing fields**
- No `TikTok Pixel ID` (needed for website conversion tracking)
- No `Lead Generation Form` name/ID (TikTok has native lead gen forms)
- No offer/vehicle details section (automotive-specific — see below)
- No `TikTok Shop` / product catalogue link (less critical for dealers but emerging)
- `Interest Categories` options are generic consumer categories (apparel, food, games) — missing `Automotive` category which TikTok does have

**2. Bloat / redundancy**
- `Suggested Hashtags` — same concern as Instagram: minimal paid reach impact. Keep as optional, it's already optional.
- No significant redundancy issues.

**3. Field-type fit**
- `Interest Categories` checkboxgroup options need updating: replace generic list with automotive-relevant options (Automotive, Financial Services, Home & Garden, Lifestyle — plus keep generic fallback)
- `Video Orientation` radio with 3 options is good
- `Music/Sound` dropdown is a TikTok-specific nicety — good field, keep required

**4. Required-flag sanity**
- `Minimum Age` / `Maximum Age` required: same over-requirement
- `Video Concept` required (richtext): correct — TikTok needs creative direction before production
- `Music/Sound` required: correct for TikTok

**5. Automotive gaps**
- NO vehicle/offer details field
- NO disclaimer (TikTok dealer ads in AU require same drive-away/finance disclaimers)
- NO OEM co-op flag
- NO dealer location(s)
- NO TikTok-specific automotive interest category in the `Interest Categories` options
- Boosted organic (Spark Ads) is included in Ad Format — good. But no `Organic Post ID` field shown conditionally when Spark Ads selected.

**6. UX structure**
- `is_multi_step` opportunity: Campaign Setup → Audience → Creative & Content → Budget & Schedule
- Conditional: show `Organic Post ID` (text) when Ad Format includes Spark Ads
- Conditional: show `Lead Form Name` when objective = Lead Generation

**7. Template-level flags**
- `require_client_link: true`

**Top changes (prioritised)**
1. ADD automotive section: `Vehicle/Model Being Promoted` (text), `Offer Details` (textarea), `Disclaimer Text` (textarea, required)
2. ADD `Dealer Location(s)` (textarea, optional)
3. UPDATE `Interest Categories` options to include `Automotive`, `Cars & Vehicles`
4. ADD `Spark Ads — Organic Post ID` (text, conditional on Ad Format = Spark Ads)
5. ADD `TikTok Pixel ID` (text, optional)
6. ADD `Lead Form Name` (text, conditional on objective = Lead Generation)
7. ADD `OEM Co-op` radio (Yes/No)
8. FIX: Age Range UX

**Automotive gaps**: Vehicle/offer, disclaimer, OEM co-op, dealer locations missing. Interest targeting options need automotive category.

---

## 4. Google Ads Campaign

### Fields (sorted by section)
| Label | Type | Req? | Section |
|---|---|---|---|
| Client | client | Y | Basic Info |
| Campaign Name | text | Y | Basic Info |
| Campaign Type | dropdown | Y | Campaign Type |
| Campaign Goal | dropdown | Y | Objectives |
| Campaign Description | richtext | Y | Objectives |
| Daily Budget ($) | currency | Y | Budget |
| Monthly Budget Cap ($) | currency | N | Budget |
| Bidding Strategy | dropdown | Y | Bidding |
| Target CPA/ROAS Value | text | N | Bidding |
| Target Keywords | textarea | Y | Keywords |
| Negative Keywords | textarea | N | Keywords |
| Keyword Match Types | checkboxgroup | Y | Keywords |
| Headlines | textarea | Y | Search Ads |
| Descriptions | textarea | Y | Search Ads |
| Display URL Path | text | N | Search Ads |
| Ad Extensions | checkboxgroup | N | Extensions |
| Sitelinks Details | textarea | N | Extensions |
| Target Locations | textarea | Y | Geography |
| Target Languages | multiselect | Y | Geography |
| Audience Targeting | checkboxgroup | N | Audiences |
| Landing Page URL | url | Y | Destination |
| Display/Video Assets | files | N | Assets |
| Start Date | date | Y | Schedule |
| End Date | date | N | Schedule |
| Device Targeting | checkboxgroup | N | Devices |
| Success Metrics/KPIs | textarea | Y | Goals |
| Creative Direction Notes | richtext | N | Notes |
| Additional Notes | richtext | N | Other |

**Field count**: 28

### Assessment

**Verdict**: SIGNIFICANT-REWORK

**1. Coverage — Missing fields**
- `Campaign Type` dropdown includes Performance Max, Shopping, Video etc. but there are NO separate fields for PMax-specific inputs: `Asset Group Name`, `Final URL`, `Business Name`, `Audience Signals` — PMax needs distinct fields from Search
- No `Google Merchant Centre ID` / `Vehicle Feed ID` (critical for PMax Inventory and Google Vehicle Ads)
- No `Conversion Action` name (what conversion to optimise toward)
- No `Google Tag / Conversion ID` field
- No `Ad Schedule` / day-parting field
- No offer/vehicle section (automotive — see below)
- `Target CPA/ROAS Value` is a text field (should be currency/number)
- `Headlines` and `Descriptions` as textarea blobs: RSA ads have specific character limits (30 chars / 90 chars) — structured fields per headline would be better UX but may be too granular; at minimum add character count help_text

**2. Bloat / redundancy**
- `Target Languages` as a multiselect with 9 global languages: for AU car dealers this is almost always English only. Simplify or default to English. This field rarely needs to be changed.
- The template tries to cover Search, Display, Shopping, Video, PMax, App, Smart in a single Campaign Type dropdown — these are very different campaign types needing different fields. Consider splitting into Search-specific and PMax-specific templates (matching the Monday taxonomy: `G_Search`, `G_PMaxStandard`, `G_PMaxInventory`).

**3. Field-type fit**
- `Target CPA/ROAS Value` → text: should be `number` or `currency`
- `Headlines` / `Descriptions` → textarea: acceptable given the multi-value nature of RSA headlines (up to 15 headlines); add character limit help_text
- `Target Languages` → multiselect is correct type; options are over-broad for AU context

**4. Required-flag sanity**
- `Target Keywords` required: correct for Search, but meaningless for PMax/Display — needs conditional logic based on Campaign Type
- `Keyword Match Types` required: same concern — only relevant for Search
- `Landing Page URL` required: correct
- `Target Languages` required: over-required for AU dealers

**5. Automotive gaps**
- NO `Vehicle Feed / Merchant Centre ID` (Google Vehicle Ads, PMax Inventory — key campaign types per Monday taxonomy)
- NO `Google Vehicle Ads` type explicitly in Campaign Type dropdown (has "Shopping" which is adjacent but not the same)
- NO vehicle/offer details (make, model, offer, drive-away price)
- NO `Disclaimer Text` (required for AU dealer search ads with pricing claims)
- NO `OEM Co-op` flag
- NO `Dealer Location(s)` (Location Extensions exist in Ad Extensions but no structured dealer field)
- NO `Finance/Comparison Rate Disclaimer`

**6. UX structure**
- Major opportunity: conditional_logic based on `Campaign Type`:
  - If Search: show Keywords, Headlines, Descriptions, Match Types, Extensions
  - If PMax: show Asset Group, Audience Signals, Vehicle Feed fields
  - If Display/Video: show creative assets, audience targeting
- `is_multi_step` strongly recommended for this complex template
- Consider splitting into two templates: **Google Search Campaign** and **Google Performance Max Campaign** (matches Monday `G_Search` and `G_PMaxStandard`/`G_PMaxInventory`)

**7. Template-level flags**
- `require_client_link: true`
- `requires_quote: false`

**Top changes (prioritised)**
1. SPLIT into Google Search + Google PMax templates (or use heavy conditional_logic)
2. ADD automotive section: `Vehicle Make/Model` (text), `Offer Details` (textarea), `Drive-Away Price` (currency), `Disclaimer Text` (textarea, required)
3. ADD `Google Merchant Centre / Vehicle Feed ID` (text, conditional on Campaign Type = PMax Inventory / Vehicle Ads)
4. ADD `Google Vehicle Ads` option to Campaign Type dropdown
5. ADD `Conversion Action Name` (text, optional)
6. FIX `Target CPA/ROAS Value` → `number` type
7. ADD conditional_logic: hide Keywords/Match Types/Headlines/Descriptions when Campaign Type ≠ Search
8. ADD `OEM Co-op` flag (radio)
9. ADD `Dealer Location(s)` (textarea, optional)
10. REMOVE `Target Languages` required flag (default English for AU)

**Automotive gaps**: Vehicle feed/PMax inventory, Google Vehicle Ads type, offer/disclaimer, OEM co-op, dealer locations — all missing.

---

## 5. Display Banner Campaign

### Fields (sorted by section)
| Label | Type | Req? | Section |
|---|---|---|---|
| Client | client | Y | Basic Information |
| Campaign Name | text | Y | Basic Information |
| Campaign Objective | dropdown | Y | Basic Information |
| Landing Page URL | url | Y | Basic Information |
| Required Banner Sizes | checkboxgroup | Y | Banner Sizes |
| Custom Sizes | textarea | N | Banner Sizes |
| Banner Format | checkboxgroup | Y | Format |
| Key Message / Headline | textarea | Y | Messaging |
| Call-to-Action Text | text | Y | Messaging |
| Offer/Promotion Details | textarea | N | Messaging |
| Required Delivery Date | date | Y | Timeline |
| Campaign Go-Live Date | date | N | Timeline |
| Number of Creative Versions | dropdown | N | Versions |
| Language Versions Required | checkboxgroup | N | Versions |
| Target Ad Network | checkboxgroup | N | Distribution |
| Brand Guidelines / Assets | files | N | Assets |
| Colour Requirements | textarea | N | Assets |
| Max File Size | dropdown | N | Constraints |
| Animation Duration | dropdown | N | Constraints |
| Reference / Inspiration | richtext | N | Assets |
| Campaign Background | richtext | N | Context |
| Additional Notes | richtext | N | Other |

**Field count**: 22

### Assessment

**Verdict**: MINOR-TWEAKS (with automotive additions)

**1. Coverage — Missing fields**
- No `Client Brand Colours` / hex codes field (currently `Colour Requirements` is a freetext textarea — adequate but loose)
- No `Campaign Dates` (daterange) — `Required Delivery Date` and `Campaign Go-Live Date` exist but not a campaign run-period field
- No `Carsales Banner Sizes` option in Required Banner Sizes (Carsales has proprietary ad sizes for AU automotive marketplace)
- No `Vehicle / Make / Model` field (banners for dealers almost always feature a specific vehicle)
- `Target Ad Network` doesn't include Carsales, CarExpert or other AU automotive portals

**2. Bloat / redundancy**
- `Language Versions Required` checkboxgroup with Spanish, French, German, Chinese: entirely irrelevant for AU car dealership display ads. Should be removed or replaced with `Accessibility / Screen Reader Alt Text Required` (yes/no).
- `Campaign Background` (richtext) + `Additional Notes` (richtext) overlap — could merge.

**3. Field-type fit**
- `Key Message / Headline` → textarea: the label says "headline" but textarea allows multiple lines — for a banner this should be `text` (single line, with character limit help_text e.g. "max 30 chars")
- `Colour Requirements` → textarea: acceptable; `text` might be better with hex code placeholder
- `Offer/Promotion Details` → textarea: good, optional
- `Max File Size` + `Animation Duration` dropdowns: good technical spec fields

**4. Required-flag sanity**
- `Offer/Promotion Details` not required: correct (not all banners have a promotion)
- `Target Ad Network` not required: correct
- `Required Delivery Date` required: correct

**5. Automotive gaps**
- NO `Vehicle Make / Model / Year` being featured (dealers always feature a specific car)
- NO `Drive-Away / EGC Price` field (banners routinely display pricing)
- NO `Disclaimer Text` / offer fine print (legally required when showing price in AU)
- NO `Carsales Banner Sizes` in the size checkboxgroup (Carsales is a primary AU automotive marketplace)
- NO `OEM Co-op` flag (determines asset usage restrictions)
- NO dealer location in banner copy guidance

**6. UX structure**
- Group `Colour Requirements` + `Brand Guidelines / Assets` + `Reference / Inspiration` into a single `Brand & Assets` section (currently split across Assets and Constraints)
- `is_multi_step`: not necessary for this shorter form; sections are adequate
- Conditional: show `Custom Sizes` textarea only when `Required Banner Sizes` includes "Custom Size"

**7. Template-level flags**
- `require_client_link: true`
- `requires_quote: false` (production work, not a quoted job typically)

**Top changes (prioritised)**
1. ADD automotive section: `Vehicle Make/Model/Year` (text, optional), `Drive-Away / EGC Price` (currency, optional), `Disclaimer / Fine Print` (textarea, required when pricing shown)
2. ADD `Carsales Banner Sizes` options to `Required Banner Sizes`: `300x600 (Carsales Leaderboard)`, `970x250 (Carsales Billboard)` etc.
3. ADD `Carsales` to `Target Ad Network` checkboxgroup
4. ADD `OEM Co-op` radio (Yes/No) + conditional `OEM Asset Link` (url)
5. REMOVE `Language Versions Required` (Spanish/French/German/Chinese — irrelevant for AU dealers)
6. FIX `Key Message / Headline` → `text` type (single line)
7. MERGE `Campaign Background` + `Additional Notes` → single `Context / Notes` richtext
8. FIX: Conditional show `Custom Sizes` textarea

**Automotive gaps**: Vehicle/offer/pricing, disclaimer, Carsales sizes/network, OEM co-op missing.

---

## 6. Marketing Campaign Brief

### Fields (sorted by section)
| Label | Type | Req? | Section |
|---|---|---|---|
| Client | — | — | — |
| Project Name | text | Y | Basic Information |
| Campaign Type | dropdown | Y | Basic Information |
| Campaign Objectives | richtext | Y | Goals |
| Background/Context | richtext | N | Goals |
| Key Messages | richtext | Y | Messaging |
| Tone of Voice | multiselect | Y | Messaging |
| Demographics | textarea | Y | Audience Profile |
| Psychographics | textarea | N | Audience Profile |
| Define Your Target Audience | heading | N | — |
| Required Deliverables | checkboxgroup | Y | Deliverables |
| Campaign Start Date | date | Y | Timeline |
| Campaign End Date | date | N | Timeline |
| Key Milestones | textarea | N | Timeline |
| Budget Range | dropdown | Y | Budget |
| Pain Points & Needs | richtext | N | Audience Insights |
| Brand Guidelines | files | N | Assets |
| Reference/Inspiration | richtext | N | Assets |
| Additional Notes | richtext | N | Other |

**Field count**: 19

### Assessment

**Verdict**: SIGNIFICANT-REWORK

**1. Coverage — Missing fields**
- No `Client` field (the rubric query shows no client-type field for this template — critical omission)
- No `Platforms` field (which channels this campaign runs on — Meta, Google, TikTok, etc.)
- No `Budget Amount` as a currency field — `Budget Range` is a dropdown with broad bands ($5k–$15k etc.) which is acceptable for an initial brief but a currency field for actual budget is better
- No `Success Metrics / KPIs` structured field (campaign objectives is richtext but KPIs are distinct)
- No `Campaign Name` — `Project Name` is the label; fine if treated as campaign name but ambiguous
- No `Target Locations` / `Geographic Market` field (a universal gap for a "universal master" brief)

**2. Bloat / redundancy**
- `Campaign Type` options (Brand Awareness, Lead Generation, Product Launch, Event Promotion, Content Marketing, Email Campaign, Social Media Campaign, Other) are generic marketing types — for a dealer agency the relevant types are more specific (Meta Traffic, Google PMax, TikTok Awareness etc.). This dropdown doesn't align with the Monday Campaign Type taxonomy.
- `Psychographics` textarea: adds low value for dealer campaigns (audience is "in-market car buyers" — demographics + location + in-market signals matter more).
- `Define Your Target Audience` heading: orphaned with no logical grouping in the section order.

**3. Field-type fit**
- `Budget Range` → dropdown with ranges: acceptable for intake but a `currency` field for actual spend would be more useful operationally.
- `Demographics` → textarea: acceptable, but for dealers this should be structured (age range, income, in-market flag).
- `Tone of Voice` → multiselect: good field type.
- `Campaign Objectives` → richtext: good for a master brief; but downstream templates (per-platform) should inherit this.

**4. Required-flag sanity**
- `Key Messages` required: correct
- `Tone of Voice` required: possibly over-required for a campaign brief (AM may not know yet)
- `Psychographics` not required: correct
- Missing `Client` (not found in field list): if absent from DB it's a critical bug — client link must be required

**5. Automotive gaps**
- NO `Vehicle Category` (New Cars / Used Cars / Demonstrators / Fleet / Finance)
- NO `Make(s) / Model(s)` being promoted
- NO `Offer / Key Deal` (this is the heart of every dealer campaign: a specific offer)
- NO `OEM Campaign / Co-op` flag
- NO `VFACTS Class` / market segment
- NO `Dealer Location(s)` / target rooftop(s)
- NO `Compliance / Disclaimer Requirements` flag

**6. UX structure**
- `is_multi_step` strongly recommended: Step 1 Campaign Overview → Step 2 Audience → Step 3 Messaging → Step 4 Deliverables & Budget
- Conditional: show `Lead Form` fields if Campaign Type = Lead Generation
- The `heading` field "Define Your Target Audience" should gate the audience section fields properly

**7. Template-level flags**
- `require_client_link: true` (currently possibly missing the `client` field entirely)
- `requires_quote: false`
- `default_priority: normal`

**Top changes (prioritised)**
1. ADD `Client` field (client type, required) — appears missing from DB
2. ADD automotive section: `Vehicle Category` (dropdown: New/Used/Demo/Fleet/Finance), `Make(s)/Model(s)` (text), `Key Offer / Deal` (textarea, required), `Drive-Away Price` (currency, optional)
3. ADD `Platforms` (checkboxgroup: Meta / Google / TikTok / Display / Other, required)
4. ADD `Target Locations / Geographic Market` (textarea, required)
5. ADD `Success Metrics / KPIs` (textarea, required) — separate from objectives
6. ADD `Disclaimer / Compliance Requirements` (textarea, optional)
7. ADD `OEM Co-op Campaign` (radio: Yes/No)
8. UPDATE `Campaign Type` dropdown options to align with Monday taxonomy (Meta Traffic, Google PMax, TikTok, etc.)
9. IMPLEMENT `is_multi_step` (4 steps)
10. REMOVE `Psychographics` or make it an optional help-text guided field

**Automotive gaps**: Vehicle category, offer/deal, make/model, OEM co-op, VFACTS class, dealer locations, disclaimers — all missing. Client field may be absent entirely.

---

## 7. Strategy & Media Plan

### Fields (sorted by section)
| Label | Type | Req? | Section |
|---|---|---|---|
| Client | client | Y | Basic Information |
| Campaign / Plan Name | text | Y | Basic Information |
| Plan Type | dropdown | Y | Type |
| Business Objective | richtext | Y | Objectives |
| Key Performance Indicators | textarea | Y | Objectives |
| Total Media Budget | dropdown | Y | Budget |
| Campaign Dates | daterange | Y | Timeline |
| Plan Due Date | date | Y | Timeline |
| Geographic Market | textarea | Y | Market |
| Target Audience | richtext | Y | Audience |
| Channels to Consider | checkboxgroup | N | Channels |
| Required Deliverables | checkboxgroup | Y | Deliverables |
| Key Competitors | textarea | N | Competitive |
| Current / Previous Activity | richtext | N | History |
| Additional Notes | richtext | N | Other |

**Field count**: 15

### Assessment

**Verdict**: MINOR-TWEAKS (with automotive additions)

**1. Coverage — Missing fields**
- No `Seasonality / Campaign Timing Context` field (for dealers: EOFY, plate clearance, OEM incentive periods are critical context)
- No `Agency Recommendation Required` toggle (does AM want a full channel recommendation or implementing a known plan?)
- No actual `Budget` currency field — `Total Media Budget` is a dropdown with ranges; a `currency` field for the actual confirmed budget would be more useful when known
- No `Existing Campaign Data / Performance Context` structured field (current MER, ROAS targets)
- No `Creative Lead Time` field — media plans need to flag creative production timelines

**2. Bloat / redundancy**
- `Total Media Budget` as dropdown (ranges) vs actual currency: the range approach is fine at strategy stage. No bloat issues otherwise.
- Template is lean at 15 fields — not over-engineered.

**3. Field-type fit**
- `Total Media Budget` → dropdown with ranges: acceptable at planning stage. Consider adding a `currency` option below for when budget is confirmed.
- `Campaign Dates` → daterange: correct and good.
- `Channels to Consider` → checkboxgroup: good. Options cover major channels well including TV, radio, OOH, print — good for dealer full-funnel plans.
- `Key Performance Indicators` → textarea: could be `checkboxgroup` with standard KPIs (CPL, ROAS, CPC, Reach, Impressions) + freetext for custom. Currently acceptable.

**4. Required-flag sanity**
- All required fields are appropriate for a strategy brief.
- `Channels to Consider` not required: correct (AM may want agency recommendation).
- `Key Competitors` not required: correct.

**5. Automotive gaps**
- NO `Vehicle Segment` / VFACTS class context (New / Used / Demonstrators / Service / Parts / Finance)
- NO `OEM Campaign Period` (OEM incentive periods significantly shape dealer media plans)
- NO `Dealer Group Size` / number of rooftops (affects budget allocation across locations)
- NO `Current Market Share / VFACTS Position` (essential context for strategy)
- NO `Inventory Position` context (e.g., overstocked SUVs → push SUVs in media mix)
- NO `Lead Source Performance History` (Meta vs Google lead quality context)

**6. UX structure**
- Structure is clean at 15 fields.
- `is_multi_step` optional: Step 1 Brief Overview → Step 2 Market & Audience → Step 3 Budget & Channels → Step 4 Deliverables
- Sections are well-organised; no major UX issues.

**7. Template-level flags**
- `require_client_link: true` (already has client field)
- `requires_quote: true` (strategy/media planning is a quoted service at agency)
- `auto_assign_to`: strategy/planning lead

**Top changes (prioritised)**
1. ADD automotive context section: `Vehicle Segments to Focus On` (checkboxgroup: New Cars/Used/Demo/Fleet/Finance/Service), `OEM Incentive Period / Co-op Campaign` (text, optional), `Inventory Context` (textarea, optional — e.g., "overstocked on SUVs")
2. ADD `Current VFACTS Position / Market Context` (textarea, optional)
3. ADD `Seasonality / Key Dates` (textarea, optional — EOFY, plate clearance, etc.)
4. ADD `Creative Production Lead Time Required` (dropdown: 1 week / 2 weeks / 3 weeks / 4 weeks)
5. ADD `Confirmed Budget` (currency, optional) alongside budget range dropdown
6. SET `requires_quote: true`

**Automotive gaps**: Vehicle segment focus, OEM incentive periods, inventory context, VFACTS/market share — all missing.

---

## 8. Advertising Creative Brief

### Fields (sorted by section)
| Label | Type | Req? | Section |
|---|---|---|---|
| Client | client | Y | Basic Info |
| Campaign Name | text | Y | Basic Info |
| Ad Type | multiselect | Y | Campaign Type |
| Campaign Objective | richtext | Y | Objectives |
| Success Metrics/KPIs | textarea | Y | Objectives |
| Creative Budget | dropdown | Y | Budget |
| Target Audience | richtext | Y | Demographics |
| Age Range | text | N | Demographics |
| Geographic Location | text | N | Demographics |
| Key Message | richtext | Y | Messaging |
| Call to Action | text | Y | Messaging |
| Tone & Style | multiselect | Y | Style |
| Required Sizes/Formats | checkboxgroup | Y | Deliverables |
| Custom Sizes (if any) | textarea | N | Deliverables |
| Creative Deadline | date | Y | Timeline |
| Campaign Launch Date | date | N | Timeline |
| Mandatory Elements | textarea | N | Requirements |
| Things to Avoid | textarea | N | Requirements |
| Customer Insights | richtext | N | Insights |
| Brand Assets | files | N | Assets |
| Creative References | richtext | N | Assets |
| Additional Notes | richtext | N | Other |

**Field count**: 22

### Assessment

**Verdict**: SIGNIFICANT-REWORK

**1. Coverage — Missing fields**
- No `Platform(s)` field — `Ad Type` covers the format but not which platform(s) it runs on
- No `Vehicle / Product Being Advertised` field — for dealer creative briefs this is the most critical field
- No `Offer / Promotion` field (the creative needs to feature a specific deal)
- No `Copy / Headline Options` field (separate from Key Message — provides actual draft copy for designers)
- No `Creative Approval Process` field (who signs off: AM / Client / OEM?)
- No `Disclaimer Text` field (AU dealer ads require legal fine print on creative)

**2. Bloat / redundancy**
- `Ad Type` multiselect covers Display Ads, Social Media Ads, Video, Search, Native, Print, Outdoor/OOH, Radio/Audio, TV/Broadcast — this is extremely broad for a creative brief. A simpler `Primary Medium` dropdown with the top options would be cleaner.
- `Age Range` as a text field (while Target Audience is richtext below it) creates duplication — age should be inside Target Audience description or be a proper `number` pair.
- `Creative Budget` as a dropdown (under $2k, $2k–$5k etc.) — ranges are fine for scoping, but the actual production budget should be a `currency` field.

**3. Field-type fit**
- `Campaign Objective` → richtext: for a creative brief this should be a `dropdown` or `text` (not richtext) — creative teams need a single clear objective, not a paragraph
- `Age Range` → text: should be paired `number` fields or removed (duplicate of Target Audience)
- `Call to Action` → text: correct — a single CTA string
- `Creative Budget` → dropdown: acceptable for scoping; add actual `currency` field for confirmed budget
- `Required Sizes/Formats` → checkboxgroup: includes both banner pixel sizes (300x250) and social formats (1080x1080) and video (1920x1080) — correct field type

**4. Required-flag sanity**
- `Campaign Objective` required: correct
- `Age Range` not required: correct (it's inside Target Audience already)
- `Creative Budget` required: slightly aggressive for a creative brief where budget may not be known; make optional
- `Tone & Style` required: over-required for a creative brief when Key Message and references are provided

**5. Automotive gaps**
- NO `Vehicle Make / Model / Year` (the most critical field for a dealer creative brief)
- NO `Offer / Drive-Away Price / Finance Rate` (must appear on the creative)
- NO `Disclaimer / Legal Fine Print` (required on any AU dealer ad showing price)
- NO `OEM Co-op` flag (determines asset usage rights and brand guidelines to apply)
- NO `Carsales / Autogate` creative specifications
- NO `Dealer Brand vs OEM Brand` distinction (who is the dominant visual brand on the creative?)

**6. UX structure**
- `is_multi_step` recommended: Step 1 Campaign Context → Step 2 Audience & Message → Step 3 Creative Specs → Step 4 Timeline & Assets
- Conditional: show vehicle/pricing fields when `Ad Type` includes dealer-relevant formats
- `Things to Avoid` (textarea) is a valuable field — keep
- `Mandatory Elements` (textarea) should be required — this often contains the legal/disclaimer obligation

**7. Template-level flags**
- `require_client_link: true`
- `requires_quote: false` (creative briefing, production is quoted separately)

**Top changes (prioritised)**
1. ADD automotive section: `Vehicle Make / Model / Year` (text, required), `Offer / Deal` (textarea, required), `Drive-Away / EGC Price` (currency, optional), `Finance Rate` (text, optional)
2. ADD `Disclaimer / Legal Fine Print` (textarea, required — help_text: "Include VFACTS, comparison rate, drive-away terms as applicable")
3. ADD `Platform(s)` (checkboxgroup: Meta / Google / TikTok / Display / Carsales / Print / OOH)
4. ADD `OEM Co-op Campaign` (radio: Yes/No) + conditional `OEM Brand Guidelines` (files)
5. ADD `Dealer Brand vs OEM Brand` (radio: Dealer brand dominant / OEM brand dominant / Co-branded)
6. FIX `Campaign Objective` → `dropdown` type (not richtext)
7. MAKE `Mandatory Elements` required (not optional)
8. REMOVE `Age Range` text field (redundant with Target Audience richtext)
9. FIX `Creative Budget` → add `currency` field for confirmed budget
10. SIMPLIFY `Ad Type` → `Primary Medium` dropdown

**Automotive gaps**: Vehicle/model, offer/pricing, disclaimer, OEM co-op, dealer/OEM brand distinction — all missing.

---

## 9. Influencer Campaign

### Fields (sorted by section)
| Label | Type | Req? | Section |
|---|---|---|---|
| Client | client | Y | Basic Information |
| Campaign Name | text | Y | Basic Information |
| Campaign Objective | dropdown | Y | Objective |
| Target Platforms | checkboxgroup | Y | Platforms |
| Influencer Tier | checkboxgroup | Y | Size |
| Number of Influencers | dropdown | Y | Size |
| Compensation Model | checkboxgroup | Y | Budget |
| Total Campaign Budget | dropdown | Y | Budget |
| Campaign Dates | daterange | Y | Timeline |
| Content Deliverables Per Influencer | checkboxgroup | Y | Deliverables |
| Key Messages / Talking Points | richtext | Y | Messaging |
| Product / Service Details | richtext | Y | Product |
| Target Audience | richtext | Y | Audience |
| Content Usage Rights | dropdown | N | Rights |
| Content Restrictions | textarea | N | Restrictions |
| Additional Notes | richtext | N | Other |

**Field count**: 16

### Assessment

**Verdict**: MINOR-TWEAKS (with automotive additions)

**1. Coverage — Missing fields**
- No `Influencer Niche / Category` (automotive, lifestyle, family, finance — critical for dealer influencer selection)
- No `Geographic Requirement` for influencer (must be local to dealership area — non-negotiable for a car dealer)
- No `Disclosure / Ad Labelling Requirements` field (ACCC influencer disclosure is legally required in AU)
- No `Approval Workflow` field (does client approve content before posting?)
- No `Campaign Hashtag / @mention requirements` structured field (distinct from Key Messages)
- No `Minimum Engagement Rate` expectation
- No `Exclusivity / Competitor Restrictions` field (prevent influencer from promoting competing dealers)

**2. Bloat / redundancy**
- `Total Campaign Budget` as dropdown with ranges: fine at intake stage. No significant bloat.
- Template is lean at 16 fields — well structured.
- `Number of Influencers` has no option for "4" (jumps from 1-3 to 5-10) — minor gap.

**3. Field-type fit**
- `Total Campaign Budget` → dropdown ranges: acceptable; add currency field for confirmed budget
- `Campaign Dates` → daterange: correct
- `Content Usage Rights` → dropdown: correct; good options (organic / paid amplification / full rights / perpetual)
- `Influencer Tier` → checkboxgroup: correct (multiple tiers possible)
- `Number of Influencers` → dropdown: correct

**4. Required-flag sanity**
- `Content Usage Rights` not required: should be required — this governs whether ADME can boost the content as paid ads (significant financial and legal implication)
- `Content Restrictions` not required: correct
- `Compensation Model` required: correct
- All other required fields are appropriate.

**5. Automotive gaps**
- NO `Geographic Requirement` (influencer must be in the dealer's market — often a specific suburb/city)
- NO `Automotive / Dealer Niche Preference` (car influencers, family car content, finance content)
- NO `Exclusivity / Competitor Restriction` (cannot be promoting competing dealers)
- NO `Dealer Location to Feature` (test drive location, showroom visit — core dealer influencer content)
- NO `Vehicle to Feature` (make/model for test drive, lifestyle shoot)
- NO `ACCC Disclosure Requirement` reminder / confirmation checkbox
- NO `Offer / Drive-Away Price to Promote` (dealers often pair influencer campaigns with a current offer)

**6. UX structure**
- Structure is clean and logical.
- `is_multi_step` would help: Step 1 Campaign Overview → Step 2 Influencer Spec → Step 3 Content & Messaging → Step 4 Rights & Restrictions
- Conditional: show `Dealer Location to Feature` and `Vehicle to Feature` when Product/Service = automotive

**7. Template-level flags**
- `require_client_link: true`
- `requires_quote: true` (influencer campaigns are quoted engagements)
- `default_priority: normal`

**Top changes (prioritised)**
1. ADD `Geographic Requirement` (text, required — e.g., "Must be based in Melbourne / willing to travel to Frankston")
2. ADD `Vehicle / Model to Feature` (text, optional)
3. ADD `Dealer Location to Feature` (text, optional — showroom/test drive address)
4. ADD `Exclusivity / Competitor Restriction` (textarea, optional — "Cannot promote other [brand] dealers for 60 days")
5. MAKE `Content Usage Rights` required (not optional)
6. ADD `ACCC Disclosure Acknowledgment` (checkbox, required — "Client confirms influencer must disclose paid partnership per ACCC guidelines")
7. ADD `Influencer Niche / Category` (checkboxgroup: Automotive / Family / Lifestyle / Finance / Local / Other)
8. ADD `Minimum Engagement Rate Expectation` (text or number, optional)
9. ADD `Offer / Promotion to Feature` (textarea, optional)
10. SET `requires_quote: true`
11. FIX `Number of Influencers` dropdown — add "4" option (gap between 3 and 5)

**Automotive gaps**: Geographic requirement, vehicle to feature, dealer location, exclusivity, ACCC disclosure, automotive niche — all missing.

---

## Cross-Template Summary

| Template | Verdict | Automotive Gaps | Priority |
|---|---|---|---|
| Facebook Ads Campaign | SIGNIFICANT-REWORK | AIA/feed, vehicle/offer, disclaimer, OEM co-op, dealer locations | HIGH |
| Instagram Ads Campaign | SIGNIFICANT-REWORK (or MERGE with FB) | Same as Facebook | HIGH |
| TikTok Ads Campaign | MINOR-TWEAKS | Vehicle/offer, disclaimer, OEM, dealer locations | MEDIUM |
| Google Ads Campaign | SIGNIFICANT-REWORK | Vehicle feed/PMax inventory, Google Vehicle Ads, offer, disclaimer, OEM | HIGH |
| Display Banner Campaign | MINOR-TWEAKS | Vehicle/offer, Carsales sizes, disclaimer, OEM co-op | MEDIUM |
| Marketing Campaign Brief | SIGNIFICANT-REWORK | Vehicle category, offer/deal, OEM co-op, VFACTS context, disclaimers | HIGH |
| Strategy & Media Plan | MINOR-TWEAKS | Vehicle segments, OEM incentive, inventory context, VFACTS | LOW |
| Advertising Creative Brief | SIGNIFICANT-REWORK | Vehicle/model, offer/pricing, disclaimer, OEM co-op, dealer brand | HIGH |
| Influencer Campaign | MINOR-TWEAKS | Geographic req, vehicle, dealer location, exclusivity, ACCC | MEDIUM |

### Universal automotive fields missing from EVERY template
These should be added as a **standard automotive section** that is included in all paid media and creative templates:
- `Vehicle Make / Model / Year` (text, optional — required when template is vehicle-specific)
- `Offer / Key Deal` (textarea, optional — required for any ad featuring pricing)
- `Drive-Away / EGC Price` (currency, optional)
- `Disclaimer / Legal Fine Print` (textarea, optional — required when pricing or claims shown)
- `OEM Co-op Campaign` (radio Yes/No)
- `Dealer Location(s)` (textarea, optional)

### Merge recommendation
**Facebook Ads Campaign + Instagram Ads Campaign** → single **Meta Ads Campaign** template. These are ~90% identical, share the same Ads Manager interface, and maintaining two copies doubles maintenance overhead for identical gap fixes.
