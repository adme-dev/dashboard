# Brief Template Audit — Batch 2: CREATIVE / PRINT / VIDEO / AUDIO
**Date**: 2026-06-23  
**Templates audited**: Graphic Design Request, Logo & Brand Identity, Print Collateral,
Signage & Vehicle Wraps, Billboard / OOH Campaign, TV Commercial, Video Production,
Radio Ad, Podcast / Audio Content, Social Media Content  
**Rubric**: `docs/superpowers/research/2026-06-23-brief-template-audit-rubric.md`  
**Taxonomy**: `docs/superpowers/research/2026-06-23-monday-job-types.md`

---

## Template-level flags (as-found)

| Template | requires_quote | auto_convert | default_priority | require_client_link | is_multi_step | requires_approval |
|---|---|---|---|---|---|---|
| Graphic Design Request | f | f | medium | f | f | f |
| Logo & Brand Identity | f | f | medium | f | t | t |
| Print Collateral | f | f | medium | f | t | t |
| Signage & Vehicle Wraps | f | f | medium | f | t | t |
| Billboard / OOH Campaign | f | f | **high** | f | t | t |
| TV Commercial | f | f | **high** | f | t | t |
| Video Production | f | f | medium | f | t | t |
| Radio Ad | f | f | medium | f | t | t |
| Podcast / Audio Content | f | f | medium | f | t | t |
| Social Media Content | f | f | medium | f | t | t |

---

## 1. Graphic Design Request

### Fields (10 total)
| Field | Type | Required | Section |
|---|---|---|---|
| Request Title | text | Y | Basic Information |
| Client | client | Y | Basic Information |
| Design Type | dropdown | Y | Type |
| Size / Dimensions | text | Y | Specs |
| Description & Requirements | richtext | Y | Content |
| Copy / Text Content | richtext | N | Content |
| Brand Assets / Reference | files | N | Assets |
| Due Date | date | Y | Timeline |
| Priority | dropdown | Y | Timeline |
| Additional Notes | richtext | N | Other |

### Assessment

**Verdict: SIGNIFICANT-REWORK**

**Top changes (prioritized):**
1. `Design Type` options miss the highest-volume automotive deliverables: add `Vehicle Wrap`, `Carsales Banner / Card`, `OOH / Billboard`, `Pull-up Banner`, `Mirror Hangers`, `Email Signature`, `Business Card`, `Newspaper Ad`. Without these, AMs submit wraps and banners via this catch-all with no job-type signal.
2. `Size / Dimensions` is text (free-form) — retype to `textarea` or add a structured `dropdown` for common sizes (A4, A5, 6-sheet, 48-sheet, 1200×628px, etc.) as a guide; raw text entry is too open-ended and produces inconsistent briefs.
3. Add `Output Format` (checkboxgroup): Print-ready PDF, Digital (PNG/JPG), SVG/AI source, Both print + digital. Currently no field distinguishes print jobs from screen jobs.
4. Add `Number of Sizes / Formats` (number, required): how many resize variants are needed.
5. `requires_approval` is false — this should be true for any design job; flip it.
6. `require_client_link` false — client field is captured via the `client` field type, but `require_client_link` should be true to enforce a project/board linkage for job tracking.
7. `Priority` is required but so is `Due Date`; the two are partially redundant. Keep `Due Date`, consider making `Priority` optional or derive it.

**Automotive gaps:**
- No `OEM / Manufacturer Branding` field — is this an OEM-supplied creative or agency-originated? Critical for compliance.
- No `Offer / Promotion details` — for price-based creative (drive-away, finance rates) there is nowhere to capture the offer for copywriting.
- No `Disclaimer required?` (radio/checkbox) — legal disclaimer inclusion is mandatory for dealer offers.
- No `Dealer location(s)` for multi-location collateral.

---

## 2. Logo & Brand Identity

### Fields (15 total)
| Field | Type | Required | Section |
|---|---|---|---|
| Project Name | text | Y | Basic Information |
| Client | client | Y | Basic Information |
| Project Type | dropdown | Y | Type |
| Brand Values / Personality | multiselect | Y | Personality |
| Required Deliverables | checkboxgroup | Y | Deliverables |
| Style Direction | checkboxgroup | N | Visual |
| Colour Preferences | textarea | N | Visual |
| Number of Initial Concepts | dropdown | N | Concepts |
| Concept Presentation Date | date | Y | Timeline |
| About the Business | richtext | Y | Context |
| Target Audience | richtext | Y | Context |
| Key Competitors | textarea | N | Context |
| Brands You Admire | richtext | N | References |
| Budget | dropdown | Y | Budget |
| Existing Brand Assets | files | N | Assets |
| Additional Notes | richtext | N | Other |

### Assessment

**Verdict: MINOR-TWEAKS**

This is a well-structured template. Fields cover the standard logo/brand brief well.

**Top changes (prioritized):**
1. Add `Revision Rounds Included` (dropdown, optional): 1 round, 2 rounds, 3 rounds, Unlimited — sets expectations upfront.
2. `Budget` uses banded dropdown ($3k / $8k / $20k) — appropriate but should add `requires_quote = true` at the template level for this tier of job; logo projects almost always need a formal quote.
3. `Number of Initial Concepts` is optional — consider making it required; it directly scopes the job.
4. `Existing Brand Assets` as a files field is correct, but add a `Current Brand Audit` (dropdown, optional): No existing brand / Has logo only / Has partial brand / Has full brand guidelines — helps the designer know how much reference exists.
5. Sort order: `Project Type` should come directly after client fields, not after `Brand Values` — move it up.

**Automotive gaps:**
- No `OEM / Manufacturer relationship` — for a dealer, the parent OEM brand often constrains logo placement, colour palette, and type. A note here would flag compliance constraints early.
- No `Franchise type` (dropdown): New car dealer / Used car dealer / Multi-franchise / Independent / OEM direct. This drives whether OEM co-op funds and brand compliance requirements apply.
- Budget bands are generic agency pricing; for an automotive rebrand the $20k+ band is more realistic as a starting point — the bands should skew higher or add an `OEM co-op eligible?` (radio) field.

---

## 3. Print Collateral

### Fields (15 total)
| Field | Type | Required | Section |
|---|---|---|---|
| Project Name | text | Y | Basic Information |
| Client | client | Y | Basic Information |
| Collateral Type | checkboxgroup | Y | Type |
| Size / Dimensions | text | Y | Specs |
| Number of Pages / Sides | text | N | Specs |
| Print Finish | checkboxgroup | N | Specs |
| Print Quantity | text | N | Specs |
| Key Message | textarea | Y | Messaging |
| Copy / Content Status | dropdown | Y | Content |
| Content / Copy | richtext | N | Content |
| Design Proof Due Date | date | Y | Timeline |
| Print-Ready Deadline | date | N | Timeline |
| Design Budget | dropdown | N | Budget |
| Brand Assets | files | N | Assets |
| Reference / Inspiration | richtext | N | Assets |
| Additional Notes | richtext | N | Other |

### Assessment

**Verdict: SIGNIFICANT-REWORK**

Good structural coverage but missing critical automotive-specific print fields and has field-type issues.

**Top changes (prioritized):**
1. `Collateral Type` options missing automotive-specific items: add `Mirror Hangers` (in-vehicle hang tags), `Showroom Display / Signage`, `Test Drive Checklist`, `Finance / Rate Card Insert`, `Service Menu`, `Parts Catalogue`. These are high-volume dealer print deliverables.
2. `Size / Dimensions` is free-form text — add a `Dimensions` dropdown with common sizes (A4, A5, DL, A3, A2, A1, A0, Custom) as the primary pick, with a text "Custom dimensions" field that shows conditionally. Freetext here is a recurring data quality problem.
3. `Print Quantity` and `Number of Pages / Sides` are both free-form text — retype to `number` for both.
4. `Print-Ready Deadline` is optional but is often the binding constraint (not the proof date) — make it required.
5. Add `Print Supplier` (text, optional): which print vendor is this going to? Needed for spec alignment (bleed, colour profile, file format).
6. Add `Colour Mode` (dropdown, required): CMYK / RGB / Pantone / Other — critical for print jobs.
7. `Design Budget` is optional — for print this should be `requires_quote = true` at template level given variable cost; or make budget required.

**Automotive gaps:**
- No `Offer / Promotional details` — dealer flyers almost always carry a drive-away price or finance rate; nowhere to capture it.
- No `Drive-away / EGC pricing` (textarea, optional) — mandatory for price-based print ads (ACCC compliance).
- No `Finance / comparison rate disclaimer` — required by ASIC for any print featuring finance rates.
- No `Dealer location(s)` — multi-location dealer groups need to specify which locations' addresses appear.
- No `OEM co-op eligible?` (radio) — affects artwork approval workflow (OEM must sign off).
- No `Vehicle make / model / year` for vehicle-specific collateral (specials flyers, new model launch brochures).

---

## 4. Signage & Vehicle Wraps

### Fields (13 total)
| Field | Type | Required | Section |
|---|---|---|---|
| Project Name | text | Y | Basic Information |
| Client | client | Y | Basic Information |
| Signage Type | checkboxgroup | Y | Type |
| Dimensions / Vehicle Details | textarea | Y | Specs |
| Quantity | text | N | Specs |
| Key Message | textarea | Y | Messaging |
| Contact Info to Include | textarea | N | Content |
| Design Proof Due Date | date | Y | Timeline |
| Installation Date | date | N | Timeline |
| Production Vendor | text | N | Vendor |
| Budget | dropdown | N | Budget |
| Brand Assets | files | N | Assets |
| Reference / Inspiration | richtext | N | References |
| Project Description | richtext | Y | Context |
| Additional Notes | richtext | N | Other |

### Assessment

**Verdict: SIGNIFICANT-REWORK**

This template handles general signage well but is under-specced for the vehicle wrap use case, which is the primary automotive deliverable here.

**Top changes (prioritized):**
1. `Dimensions / Vehicle Details` is a textarea — for vehicle wraps this needs to be split into structured sub-fields: `Vehicle Make` (text), `Vehicle Model` (text), `Vehicle Year` (text or number), `Registration / ID` (text). These are needed for accurate wrap templates; a free-form textarea produces inconsistent data.
2. Add `Vehicle VIN / Stock Number` (text, optional) — links the wrap brief to inventory for fleet/dealer wraps.
3. Add `Wrap Coverage` (dropdown, required when Signage Type includes vehicle wrap): Full wrap / 3/4 wrap / Half wrap / Bonnet only / Rear only / Doors only / Custom.
4. Add `Print & Install Included?` (radio, required): Design only / Design + print / Design + print + install. Currently no way to know whether the vendor manages end-to-end.
5. `Quantity` is text — retype to `number`.
6. Add `Colour Specification` (textarea, optional): Pantone / RAL references if colour matching is required.
7. `Budget` is optional — for production jobs this should be required or `requires_quote` set to true.
8. Add `Artwork Format Required` (checkboxgroup): PDF / AI / EPS / PNG — vendor-facing spec.

**Automotive gaps:**
- No `Vehicle registration / fleet number` — critical for fleet dealer wraps (multiple vehicles).
- No `OEM compliance required?` — manufacturer brand guidelines restrict wrap colours and logo placement on branded vehicles.
- No `Offer / Promotion details` — showroom floor graphics and pull-up banners frequently carry campaign pricing.
- No `Drive-away / EGC pricing disclaimer` for promotional signage that features prices.
- No `Dealer location address` — building fascia and A-frame signage must display the correct dealership address.

---

## 5. Billboard / OOH Campaign

### Fields (18 total)
| Field | Type | Required | Section |
|---|---|---|---|
| Campaign Name | text | Y | Basic Information |
| Client | client | Y | Basic Information |
| Campaign Objective | dropdown | Y | Basic Information |
| OOH Format | checkboxgroup | Y | Format |
| Key Message / Headline | textarea | Y | Messaging |
| Supporting Text | text | N | Messaging |
| Key Visual / Hero Image | textarea | Y | Visual |
| Campaign Display Dates | daterange | Y | Timeline |
| Artwork Deadline | date | Y | Timeline |
| Illumination | dropdown | N | Technical |
| Print Specifications | textarea | N | Technical |
| Digital Billboard Specs | textarea | N | Technical |
| Number of Creative Versions | dropdown | N | Versions |
| Target Locations / Markets | textarea | Y | Context |
| Campaign Context | richtext | Y | Context |
| OOH Vendor / Media Owner | text | N | Vendor |
| Vendor Spec Sheet | files | N | Vendor |
| Production Budget | dropdown | N | Budget |
| Brand Assets & Guidelines | files | N | Assets |
| Reference / Inspiration | richtext | N | Assets |
| Additional Notes | richtext | N | Other |

### Assessment

**Verdict: SIGNIFICANT-REWORK**

The template is the strongest in this batch for a non-automotive agency, but has significant automotive gaps and several field-type issues.

**Top changes (prioritized):**
1. `Key Visual / Hero Image` is a textarea (free-form description of the visual) — should be `files` for uploading existing imagery OR `richtext` with explicit instructions; as `textarea` it doesn't accept file uploads.
2. `Print Specifications` and `Digital Billboard Specs` are both free-form textareas — these should use `dropdown` + conditional structured fields (pixel dimensions, file format, max file size). Free-form specs are error-prone.
3. `Target Locations / Markets` is a textarea — for automotive this often means specific dealer locations or suburbs. Add a structured `Dealer Location(s)` (multiselect from client locations) or at minimum a `number` field for `Number of sites`.
4. `Campaign Objective` options don't include `New Model Launch` or `Clearance / End-of-Run` — the two most common automotive OOH objectives.
5. `Production Budget` should be required for OOH given the high cost; currently optional.
6. Add `Media Schedule / Booking Reference` (text, optional): the media buy reference from the OOH provider.
7. `Illumination` conditional on OOH Format — should only show for physical formats, not digital.

**Automotive gaps:**
- No `Drive-away / EGC pricing` (textarea, optional) — OOH ads for dealer offers must carry drive-away pricing per ACCC; no field to enter it.
- No `Finance / comparison rate disclaimer` — required for any OOH featuring finance offers.
- No `VFACTS vehicle class / offer type` — needed for campaign context (e.g., SUV, ute, passenger — affects creative briefing).
- No `OEM co-op / brand compliance` (radio) — whether the campaign requires OEM artwork approval before production.
- No `Dealer name / location to feature` explicitly — `Target Locations` is too vague for creative production.

---

## 6. TV Commercial

### Fields (23 total)
| Field | Type | Required | Section |
|---|---|---|---|
| Campaign / TVC Name | text | Y | Basic Information |
| Client | client | Y | Basic Information |
| TVC Type | dropdown | Y | Basic Information |
| Campaign Objective | richtext | Y | Objective |
| Target Audience | richtext | Y | Audience |
| Key Message / Proposition | textarea | Y | Messaging |
| Supporting Messages | richtext | N | Messaging |
| Tone & Mood | multiselect | Y | Tone |
| TVC Duration | checkboxgroup | Y | Duration |
| Production Approach | dropdown | Y | Approach |
| Talent / Casting | textarea | N | Talent |
| Music / Audio | dropdown | N | Audio |
| Production Budget | dropdown | Y | Budget |
| Budget Should Cover | checkboxgroup | N | Budget |
| Shoot Locations | textarea | N | Logistics |
| Target Networks / Channels | textarea | N | Distribution |
| Online Cutdowns Required? | checkboxgroup | N | Distribution |
| Mandatory Inclusions | checkboxgroup | N | Requirements |
| Concept Presentation Date | date | Y | Key Dates |
| Final Delivery Date | date | Y | Key Dates |
| On-Air Date | date | N | Key Dates |
| Reference TVCs / Inspiration | richtext | N | References |
| Existing Assets Available | files | N | Assets |
| Additional Notes | richtext | N | Other |

### Assessment

**Verdict: MINOR-TWEAKS**

The most comprehensive template in this batch. Good coverage of TVC production workflow. The `Mandatory Inclusions` checkboxgroup is a standout feature. Main gaps are automotive-specific.

**Top changes (prioritized):**
1. `Campaign Objective` is richtext (free-form) — should be `dropdown` with options: Brand Awareness, New Model Launch, Clearance / End-of-Run, Seasonal Campaign, Finance Offer, Event Promotion, Dealer Awareness. Free-form objective text is hard to filter/report on.
2. `Target Networks / Channels` is a free-form textarea — retype to `checkboxgroup`: Seven, Nine, Ten, Foxtel/BINGE, YouTube, ABC, SBS, Streaming (SVOD), Radio (if audio cut) — far easier to process than freetext.
3. `On-Air Date` is optional — should be required; it drives the backward schedule from concept to delivery.
4. Add `Script / Storyboard Status` (dropdown, required): Script TBD / Draft script / Approved script / Storyboard only. Equivalent field exists in Video Production but absent here.
5. `Shoot Locations` is textarea — add a `Location Scout Required?` (radio) as a flag for production planning.
6. Consider making `requires_quote = true` at template level — TVC production always needs a formal quote.

**Automotive gaps:**
- No `Vehicle / Model Featured` (text or multiselect) — which car(s) appear in the TVC; drives prop/vehicle booking.
- No `Drive-away pricing / offer` (textarea) — ACCC requires drive-away or EGC pricing in automotive TVCs carrying a price.
- No `Finance / comparison rate disclaimer` field — mandatory for TVCs featuring finance rates.
- `Mandatory Inclusions` has `Legal disclaimer` as a checkbox but no text field to capture the actual disclaimer copy — add a conditional `Disclaimer Copy` (textarea) that shows when `Legal disclaimer` is checked.
- No `OEM brand compliance / co-op` flag — manufacturer-funded TVCs require OEM approval before air.
- No `VFACTS vehicle class` — helps production context.

---

## 7. Video Production

### Fields (14 total)
| Field | Type | Required | Section |
|---|---|---|---|
| Project Name | text | Y | Basic Information |
| Client | client | Y | Basic Information |
| Video Type | dropdown | Y | Basic Information |
| Project Objective | richtext | Y | Context |
| Target Audience | textarea | Y | Audience |
| Key Messages | richtext | Y | Messaging |
| Tone & Mood | multiselect | Y | Tone |
| Script / Storyboard Status | dropdown | Y | Script |
| Target Video Length | dropdown | Y | Format |
| Delivery Formats | checkboxgroup | Y | Format |
| Subtitles / Captions | dropdown | N | Delivery |
| Target Platforms | checkboxgroup | N | Distribution |
| Preferred Shoot Dates | textarea | N | Timeline |
| Final Delivery Date | date | Y | Timeline |
| Budget | dropdown | Y | Budget |
| Brand Assets | files | N | Assets |
| Reference Videos | richtext | N | References |
| Additional Notes | richtext | N | Other |

### Assessment

**Verdict: MINOR-TWEAKS**

Solid template. Good coverage of video production workflow. `Script / Storyboard Status` is the right call. Main weaknesses are missing automotive fields and some UX improvements.

**Top changes (prioritized):**
1. `Preferred Shoot Dates` is a free-form textarea — retype to `daterange` or two `date` fields (Earliest / Latest).
2. Add `Talent / Voiceover Required` (dropdown, optional): No talent / On-camera talent / Voiceover only / Both — feeds production resourcing.
3. `Video Type` options don't include `Automotive / Dealership Walkthrough` or `Vehicle Showcase / Review` — the two most common automotive video types at a dealership.
4. Add `Music Required` (dropdown, optional): No music / Stock music / Licensed track / Original composition. Exists in TVC and Radio templates but absent here.
5. `Target Platforms` is optional — for video production this should be required; aspect ratio and length depend on platform.
6. Add `Number of Videos` (number, optional) — for batches (e.g., 10 vehicle walkthroughs).

**Automotive gaps:**
- No `Vehicle(s) to feature` (textarea or multiselect, optional).
- No `Drive-away pricing / offer featured?` (radio) — if yes, triggers disclaimer requirement.
- No `Finance / comparison rate disclaimer` field (conditional).
- No `OEM / Brand compliance required?` (radio) — manufacturer-funded content needs OEM approval.
- No `Shoot location` (dropdown): Dealership / External location / Studio / Multiple — for automotive, the dealership forecourt is the typical shoot location and should be pre-populated.

---

## 8. Radio Ad

### Fields (16 total)
| Field | Type | Required | Section |
|---|---|---|---|
| Campaign Name | text | Y | Basic Information |
| Client | client | Y | Basic Information |
| Campaign Objective | richtext | Y | Objective |
| Target Audience | textarea | Y | Audience |
| Key Message | textarea | Y | Messaging |
| Offer / Promotion Details | textarea | N | Messaging |
| Call-to-Action | text | Y | Messaging |
| Tone & Style | multiselect | Y | Tone |
| Ad Duration | checkboxgroup | Y | Format |
| Number of Scripts | dropdown | Y | Format |
| Delivery Format | checkboxgroup | N | Format |
| Campaign Dates | daterange | Y | Timeline |
| Script Approval Deadline | date | Y | Timeline |
| Final Audio Delivery Date | date | Y | Timeline |
| Voiceover Preference | dropdown | N | Production |
| Music & Sound Effects | dropdown | N | Production |
| Target Radio Stations | textarea | N | Distribution |
| Production Budget | dropdown | N | Budget |
| Reference Audio / Inspiration | richtext | N | References |
| Additional Notes | richtext | N | Other |

### Assessment

**Verdict: MINOR-TWEAKS**

Good structural coverage. The timeline fields (3 date fields) are well thought out. The `Offer / Promotion Details` field exists (optional) which is a good start. Main gap is automotive compliance fields.

**Top changes (prioritized):**
1. `Campaign Objective` is richtext — retype to `dropdown`: Brand Awareness, Finance Offer, New Model Launch, Clearance / End-of-Run, Event / Promotion, Seasonal Campaign, Dealer Awareness.
2. `Target Radio Stations` is free-form textarea — retype to `checkboxgroup` (or `multiselect`) with known metro stations: Nova, kiis, GOLD, Triple M, 2GB, SEN, ABC, etc. Free-form text is hard to route to media buyers.
3. `Offer / Promotion Details` is optional — for dealer radio this should be required or at least have a conditional trigger: if `Campaign Objective` is Finance Offer / Clearance / Promotion, show as required.
4. Add `Script to be written by` (dropdown, required): Agency writes / Client supplies draft / Client writes — determines copywriting scope.
5. `Production Budget` should be required; all radio production has a cost.

**Automotive gaps:**
- No `Drive-away / EGC pricing` — ACCC requires drive-away or EGC pricing to be stated in audio ads for new vehicles. There is no field to capture the exact pricing wording for the scriptwriter.
- No `Finance / comparison rate disclaimer` (textarea, conditional) — mandatory in any radio ad featuring finance rates. The scriptwriter needs the exact ASIC-required wording.
- `Offer / Promotion Details` exists but is too loose — add a structured `Disclaimer Required?` (radio: Yes / No) with a conditional `Disclaimer Copy` (textarea) to capture verbatim the approved legal wording.
- No `Compliance sign-off required?` (radio) — for ACCC/ASIC compliance, who has approved the offer claims.
- No `OEM script approval required?` — OEM-funded radio often requires manufacturer sign-off before production.

---

## 9. Podcast / Audio Content

### Fields (12 total)
| Field | Type | Required | Section |
|---|---|---|---|
| Project Name | text | Y | Basic Information |
| Client | client | Y | Basic Information |
| Content Type | dropdown | Y | Type |
| Project Description | richtext | Y | Context |
| Target Audience | textarea | Y | Audience |
| Key Messages / Topics | richtext | Y | Content |
| Target Duration | dropdown | Y | Format |
| Tone & Style | multiselect | N | Tone |
| Distribution Platforms | checkboxgroup | N | Distribution |
| Delivery Date | date | Y | Timeline |
| Budget | dropdown | N | Budget |
| Existing Assets | files | N | Assets |
| Reference Audio | richtext | N | References |
| Additional Notes | richtext | N | Other |

### Assessment

**Verdict: SIGNIFICANT-REWORK**

The template is generic — it tries to cover everything from a podcast series to a jingle to a voiceover recording. These use cases have very different production requirements and should either be separate templates or use conditional_logic heavily. As-is, the form is under-specced for every sub-type.

**Top changes (prioritized):**
1. `Content Type` options (podcast, podcast_series, audio_ad, jingle, voiceover, music) span wildly different productions — add conditional_logic so fields like `Number of Episodes`, `Episode Frequency`, `Hosts / Guests` only show for podcast types; `Voiceover Preference` and `Music Required` show for audio_ad/jingle.
2. Add `Number of Episodes` (number, conditional on podcast / podcast_series).
3. Add `Episode Frequency` (dropdown, conditional on podcast_series): Weekly / Bi-weekly / Monthly / Ad-hoc.
4. Add `Voiceover Preference` (dropdown, optional): Male / Female / Duo / Client spokesperson — exists in Radio Ad but absent here for audio_ad and voiceover types.
5. `Tone & Style` is optional — should be required for audio production (tone drives production decisions).
6. `Budget` is optional — should be required or set `requires_quote = true`.
7. Add `Recording Location` (dropdown): Remote (send-in) / Studio booking / Client premises — impacts logistics.
8. Add `Script Required?` (radio, optional): Yes — agency writes / Yes — client supplies / No (interview style).

**Automotive gaps:**
- This template is unlikely to be used for automotive-specific podcasts, but if `Content Type = Audio Ad`: same as Radio Ad — `Drive-away pricing`, `Finance disclaimer`, and `Offer details` fields are absent.
- No automotive-specific content: dealer "Meet the Team" podcast series, manufacturer content partnerships. If ADME does this work, add `OEM / Manufacturer involvement?` flag.

---

## 10. Social Media Content

### Fields (15 total)
| Field | Type | Required | Section |
|---|---|---|---|
| Content Brief Title | text | Y | Basic Information |
| Client | client | Y | Basic Information |
| Platforms | checkboxgroup | Y | Platforms |
| Content Type | checkboxgroup | Y | Type |
| Content Goals | checkboxgroup | Y | Goals |
| What Do You Need From Us? | checkboxgroup | Y | Scope |
| Target Audience | textarea | Y | Audience |
| Tone of Voice | multiselect | Y | Tone |
| Content Brief Title | text | Y | Basic Information |
| Content Due Date | date | Y | Timeline |
| Posting Frequency | dropdown | N | Schedule |
| Content Period | daterange | N | Schedule |
| Monthly Budget | dropdown | N | Budget |
| Content Pillars / Themes | richtext | N | Themes |
| Hashtag Strategy | textarea | N | Strategy |
| Brand Assets / Guidelines | files | N | Assets |
| Reference Accounts / Inspiration | richtext | N | References |
| Additional Notes | richtext | N | Other |

### Assessment

**Verdict: SIGNIFICANT-REWORK**

`Content Brief Title` appears twice (both Y/required) — a duplicate field that needs to be removed. Beyond that bug, the template is generic social media management scope — it misses automotive inventory-specific social, which is a core deliverable at ADME.

**Top changes (prioritized):**
1. **Remove duplicate `Content Brief Title` field** — appears twice in the field list; one must be deleted.
2. `Content Type` options don't include `Vehicle Showcase / Inventory Post` or `OEM / Manufacturer Content` or `Google Business Profile Post` — add these.
3. Add `Campaign / Offer to Feature` (textarea, optional) — for social tiles tied to a dealership promotion; drives copy direction.
4. `Posting Frequency` is optional but for ongoing retainer briefs should be required.
5. `Content Period` (daterange) is optional — for retainer social management this should be required.
6. Add `Number of Posts` (number, optional) — for one-off content runs.
7. `Monthly Budget` is optional — for retainer contracts this should be required.
8. Add `Stock / Inventory Feed link` (url, optional) — for dealerships using dynamic inventory posts, the feed URL is needed for creative references.

**Automotive gaps:**
- No `Vehicle make / model` — for vehicle showcase posts, no field to specify which cars to feature.
- No `OEM content guidelines` — OEM-supplied creative must follow manufacturer brand standards; a `OEM compliance required?` flag is missing.
- No `Drive-away pricing / offer` (textarea, optional) — social posts for dealer promotions carry offer pricing.
- No `Finance / comparison rate disclaimer` — mandatory for social posts featuring finance rates (ASIC requirement).
- No `ReelMotion / short video` distinction in Content Type — ReelMotion is a named production workflow at ADME (has its own Monday.com board group) and should be a selectable type.
- No `Carsales / AutoGate` as a platform option in `Platforms` — automotive inventory platforms aren't standard social channels but ADME does post to them.

---

## Cross-Cutting Findings

### Consistent gaps across this batch

1. **`require_client_link = false` on all templates** — every job in this batch requires a client link for billing and project association. Should be true across all 10.

2. **`requires_quote = false` on all templates** — Logo & Brand Identity, TV Commercial, Video Production, Print Collateral (when quantity/finish is involved), Signage & Vehicle Wraps, and Podcast / Audio Content all warrant `requires_quote = true`. Only Graphic Design Request and Social Media Content are plausibly quote-exempt for small runs.

3. **No automotive offer/disclaimer pattern** — across the entire CREATIVE / PRINT / VIDEO / AUDIO batch, none of the templates has a structured field for:
   - Drive-away pricing or EGC (Excl. Govt. Charges) — required by ACCC for vehicle price advertising
   - Finance / comparison rate disclaimer — required by ASIC for any ad featuring a finance rate
   - A `Disclaimer Copy` textarea for the scriptwriter / designer to receive verbatim approved legal wording
   
   These three fields should be a reusable block applied to every template where an offer might appear.

4. **`Campaign Objective` typed as `richtext` in TVC, Radio Ad, Video Production** — three templates use free-form richtext for objective; all should be a `dropdown` with consistent automotive-aware options.

5. **Free-form textarea for specs** — `Size / Dimensions` (Graphic Design, Print Collateral), `Dimensions / Vehicle Details` (Signage), `Target Radio Stations`, `Print Specifications` — these fields generate inconsistent data. Where enumerable options exist, use dropdown/checkboxgroup; reserve textarea for genuinely open-ended inputs.
