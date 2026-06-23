# Brief Template Audit — Batch 3: WEB / CONTENT / SEO + SUPPORT
**Date**: 2026-06-23
**Templates**: Website Development Brief, Landing Page, Email Campaign, Blog / Article Content, SEO Audit & Optimisation, IT Support Request, Support Ticket, Bug Report, Change Request

---

## 1. Website Development Brief

**Fields** (sort order):
| Field | Type | Required | Section |
|---|---|---|---|
| Project Name | text | ✓ | Basic Info |
| Website Type | multiselect | ✓ | Site Type |
| Design Style | multiselect | ✓ | Design |
| CMS Preference | dropdown | — | Technical |
| Hosting | dropdown | — | Technical |
| Required Pages | checkboxgroup | ✓ | Pages |
| Design References | richtext | — | Design |
| Project Type | dropdown | ✓ | Basic Info |
| Brand Assets | files | — | Assets |
| Current Website URL | url | — | Basic Info |
| Target Launch Date | date | ✓ | Timeline |
| Features Needed | checkboxgroup | — | Functionality |
| Project Goals | richtext | ✓ | Goals |
| Third-party Integrations | checkboxgroup | — | Integrations |
| Budget Range | dropdown | ✓ | Budget |
| Content Status | dropdown | ✓ | Content |
| Additional Notes | richtext | — | Other |
| Target Audience | richtext | ✓ | Goals |

**Verdict:** SIGNIFICANT-REWORK

**Top changes (prioritized):**
1. **Add** `Dealer Location(s)` — text or multiselect; for ADME a website build is always for a single or multi-site dealership; knowing which locations (suburbs, states) drives Google Business Profile linking and local SEO strategy.
2. **Add** `OEM / Brand` — dropdown (Toyota, Mazda, Ford, Kia, etc.); OEM brand compliance requirements gate design choices, colour palette, logo usage, and co-op eligibility.
3. **Add** `Inventory / Stock Feed URL` — url; dealership sites almost always need a vehicle listing page wired to a stock feed (Autogate, CarLoop, dealer DMS export).
4. **Add** `VDP (Vehicle Detail Page) Required` — radio yes/no; flags need for vehicle detail page template, stock-feed integration, and drive-away vs EGC pricing display.
5. **Retype** `Website Type` — current options (Corporate/Business, E-commerce, etc.) are generic; add `Automotive Dealership` option and surface it first.
6. **Add** `Google Analytics / GTM Setup Required` — checkbox; currently buried in Features Needed. Make it a standalone boolean so it triggers the tracking brief automatically.
7. **Remove** `Hosting` as required for dealership context — ADME typically hosts on a known platform stack; move to "Technical" section as optional.
8. **Require** `Current Website URL` — nearly every brief is a redesign/migration; optional is wrong.
9. **Add** `Finance / Comparison Rate Disclaimer Required` — checkbox; regulatory requirement if site will quote finance rates.
10. **Set** `requires_quote: true`, `require_client_link: true` at template level.

**Automotive gaps:**
- No OEM brand / co-op field
- No dealer location field
- No stock feed / VDP integration flag
- No drive-away vs EGC pricing mention
- No finance disclaimer flag

---

## 2. Landing Page

**Fields** (sort order):
| Field | Type | Required | Section |
|---|---|---|---|
| CMS / Platform | dropdown | — | Platform |
| Headline / Value Proposition | textarea | ✓ | Content |
| Page Name | text | ✓ | Basic Information |
| Tracking Requirements | checkboxgroup | — | Tracking |
| Client | client | ✓ | Basic Information |
| Page Content / Copy | richtext | ✓ | Content |
| Page Purpose | dropdown | ✓ | Purpose |
| Primary Call-to-Action | text | ✓ | CTA |
| Launch Date | date | ✓ | Timeline |
| Form Fields Required | checkboxgroup | — | Form |
| Desired URL | text | — | Technical |
| Budget | dropdown | — | Budget |
| Design Approach | dropdown | ✓ | Design |
| Traffic Sources | checkboxgroup | ✓ | Traffic |
| Additional Notes | richtext | — | Other |
| Reference / Inspiration | richtext | — | References |
| Assets | files | — | Assets |

**Verdict:** SIGNIFICANT-REWORK

**Top changes (prioritized):**
1. **Add** `Offer / Promotion` — textarea, required; for automotive every landing page is built around a specific offer (e.g. "$500 cashback on all new Mazda CX-5", "Drive Away No More to Pay from $29,990"). This is the #1 missing field.
2. **Add** `UTM Parameters` — text (or structured: utm_source / utm_medium / utm_campaign), required; UTM tracking is mandatory for paid traffic landing pages; Tracking Requirements only has a checkbox, not the actual param values.
3. **Add** `Offer Disclaimer / Legal Copy` — textarea; ACCC-required fine-print for drive-away pricing, cashback offers, comparison rates. Flag as required when offer type = finance.
4. **Add** `Stock / VDP Feed Link` — url, optional; for inventory-specific pages (e.g. "All in-stock Mazda CX-5") the landing page must link to or embed the stock feed.
5. **Require** `Tracking Requirements` — currently optional; tracking is non-negotiable for all paid campaigns.
6. **Add** `Campaign / Ad Account` — text or dropdown link to ad platform; which Meta / Google campaign is this page supporting? Drives attribution setup.
7. **Retype** `Form Fields Required` — currently checkboxgroup (Name, Email, Phone, etc.); add `Vehicle of Interest`, `Preferred Contact Method`, `Trade-In` options; automotive lead forms differ from generic.
8. **Add** `OEM / Brand` — dropdown; OEM co-op pages must follow brand guidelines.
9. **Set** `requires_quote: false`, `require_client_link: true`, `default_priority: high` at template level.

**Automotive gaps:**
- No offer/promotion field
- No UTM parameter capture
- No offer disclaimer / legal copy field
- No stock feed / VDP link
- No OEM brand field

---

## 3. Email Campaign

**Fields** (sort order):
| Field | Type | Required | Section |
|---|---|---|---|
| Campaign Name | text | ✓ | Basic Information |
| Campaign Goal | dropdown | ✓ | Goals |
| Subject Line Ideas | textarea | — | Content |
| Client | client | ✓ | Basic Information |
| Email Content / Copy | richtext | ✓ | Content |
| Email Type | dropdown | ✓ | Type |
| Call-to-Action | text | ✓ | Content |
| Email Platform | dropdown | — | Platform |
| Target Audience / Segment | textarea | ✓ | Audience |
| CTA Landing Page | url | — | Content |
| Design Requirements | dropdown | ✓ | Design |
| Target Send Date | date | ✓ | Timeline |
| Assets / Images | files | — | Assets |
| Additional Notes | richtext | — | Other |

**Verdict:** SIGNIFICANT-REWORK

**Top changes (prioritized):**
1. **Add** `List / Segment` — dropdown or text, required; which database list? (e.g. "All Mazda leads", "Past Toyota service customers", "Conquest list Q2"). Audience/Segment is a textarea but needs to capture the actual list name/ID for the ESP.
2. **Add** `Estimated List Size` — number, optional; list size affects send scheduling, deliverability planning.
3. **Add** `Send Date & Time` — datetime, required; Target Send Date is date-only; automotive EDMs are often time-sensitive (end-of-month, weekend promos) and need a send time.
4. **Add** `Offer / Promotion` — textarea, required; same as Landing Page — the promotional hook drives all content.
5. **Add** `Offer Disclaimer / Legal Copy` — textarea; ACCC / Australian finance regs require fine-print in EDMs quoting prices or rates.
6. **Add** `Unsubscribe / Compliance` — checkbox (Spam Act compliant? Physical address included?); required for Australian CAN-SPAM / Spam Act 2003 compliance.
7. **Require** `Email Platform` — currently optional; must know the platform (Mailchimp, Klaviyo, ActiveCampaign, etc.) to build the template correctly.
8. **Require** `CTA Landing Page` — url, required; every email CTA needs a verified destination URL before build starts.
9. **Add** `From Name / From Email` — text, optional; especially for white-labelled dealer sends.
10. **Add** `Preview Text` — text, optional; the snippet shown in inbox preview alongside subject line; often overlooked and left to the developer.

**Automotive gaps:**
- No offer/promotion field
- No offer disclaimer / legal copy
- Audience/Segment is freetext not structured
- No compliance check field

---

## 4. Blog / Article Content

**Fields** (sort order):
| Field | Type | Required | Section |
|---|---|---|---|
| Article Title / Topic | text | ✓ | Basic Information |
| Client | client | ✓ | Basic Information |
| Content Type | dropdown | ✓ | Type |
| Target Word Count | dropdown | — | Specs |
| Topic Brief / Outline | richtext | ✓ | Content |
| Target SEO Keywords | textarea | — | SEO |
| Target Audience | textarea | ✓ | Audience |
| Tone of Voice | dropdown | ✓ | Tone |
| Reference / Inspiration | richtext | — | References |
| Due Date | date | ✓ | Timeline |
| Additional Notes | richtext | — | Other |

**Verdict:** MINOR-TWEAKS

**Top changes (prioritized):**
1. **Require** `Target SEO Keywords` — currently optional; for an agency doing SEO content, the target keywords are the entire point; should be required or at minimum strongly flagged.
2. **Add** `Target URL / Page Slug` — text, optional; where will this article live? For SEO work the URL structure matters.
3. **Add** `Internal Links Required` — textarea, optional; which pages on the dealer's site should this article link to (model pages, contact, stock search)?
4. **Add** `Vehicle / Model Focus` — text or multiselect, optional; ADME content often targets a specific model (e.g. "Toyota RAV4 vs Mazda CX-5 comparison article").
5. **Retype** `Target Word Count` — dropdown (Under 500, 500-800, 800-1200, 1200-2000, 2000+) is fine; make required.
6. **Add** `Publish Date` — date, optional (separate from due date); the due date is when content is needed, publish date is when it goes live.

**Automotive gaps:**
- No vehicle/model focus field
- No internal linking targets (model pages, stock search)

---

## 5. SEO Audit & Optimisation

**Fields** (sort order):
| Field | Type | Required | Section |
|---|---|---|---|
| SEO Goals | richtext | ✓ | Goals |
| Project Name | text | ✓ | Basic Information |
| Delivery Date | date | ✓ | Timeline |
| Client | client | ✓ | Basic Information |
| Website URL | url | ✓ | Basic Information |
| Budget | dropdown | — | Budget |
| Additional Notes | richtext | — | Other |
| Scope of Work | checkboxgroup | ✓ | Scope |
| Target Keywords (if known) | textarea | — | Keywords |
| Target Geographic Locations | textarea | — | Keywords |
| Key Competitors | textarea | — | Competitors |
| Current SEO Tools | checkboxgroup | — | Tools |

Scope options: Full Technical SEO Audit, On-Page Optimisation, Keyword Research, Content Strategy, Local SEO, Link Building Strategy, Competitor Analysis, Monthly SEO Retainer.

**Verdict:** SIGNIFICANT-REWORK

**Top changes (prioritized):**
1. **Add** `GBP (Google Business Profile) Management` — checkboxgroup option in Scope of Work; GBP management is a core monthly SEO deliverable for dealerships (post updates, Q&A, photo uploads, review responses) and is not listed in Scope.
2. **Add** `Number of Locations` — number, required; multi-location dealerships (e.g. 3 Toyota stores) require separate GBP management and local landing pages per location; single vs multi changes scope significantly.
3. **Add** `Dealer Locations` — textarea or structured multiselect, required; list each suburb/city; directly drives Local SEO scope.
4. **Rename** template to `SEO Brief` or `SEO Retainer Brief` — "Audit & Optimisation" implies a one-off audit; the template covers retainer work. Misleading name creates wrong client expectations.
5. **Add** `Monthly Reporting Format` — dropdown (Dashboard access, Monthly PDF report, Quarterly review call); required for retainer scope.
6. **Add** `Reporting Start Date` — date, optional; distinct from delivery date for ongoing retainers.
7. **Add** `OEM / Brand` — dropdown; some OEMs (Toyota, Kia) have SEO guidelines or preferred keyword frameworks that must be followed.
8. **Add** `Access Required` — checkboxgroup (Google Search Console, Google Analytics, Google Ads, GBP Manager); need to know what access the AM has secured before work starts.
9. **Require** `Target Geographic Locations` — mandatory for automotive local SEO (suburb + state targeting).
10. **Set** `requires_quote: true`, `require_client_link: true` at template level.

**Automotive gaps:**
- No GBP management scope option
- No dealer locations field
- No multi-location handling
- No OEM keyword/compliance consideration
- No access checklist (GSC, GA, GBP)

---

## 6. IT Support Request

**Fields** (sort order):
| Field | Type | Required | Section |
|---|---|---|---|
| Subject | text | ✓ | Request Details |
| Request Type | dropdown | ✓ | Request Details |
| Priority | radio | ✓ | Request Details |
| Description | richtext | ✓ | Details |
| Device Type | text | — | Environment |
| Operating System | text | — | Environment |
| Screenshots/Attachments | files | — | Attachments |
| Preferred Contact Time | text | — | Contact |

**Verdict:** MINOR-TWEAKS

**Top changes (prioritized):**
1. **Retype** `Device Type` and `Operating System` — currently plain text; change to dropdowns with common values (Mac/Windows/iPhone/Android for device; macOS/Windows 11/iOS for OS). Reduces freetext noise.
2. **Add** `Affected System / Application` — dropdown (e.g. XeroFlow Dashboard, Xero, Monday.com, Google Workspace, Meta Business Suite, Slack, Printer/Hardware, Other); gives IT triage signal without reading Description.
3. **Add** `Urgency Impact` — dropdown (Blocking all work / Blocking me only / Workaround available / Low impact); separates priority selection (1-4) from business impact description.

**Automotive gaps:** None — internal template, automotive context not relevant.

---

## 7. Support Ticket

**Fields** (sort order):
| Field | Type | Required | Section |
|---|---|---|---|
| Subject | text | ✓ | Ticket Details |
| Category | dropdown | ✓ | Ticket Details |
| Priority | radio | ✓ | Ticket Details |
| Description | richtext | ✓ | Details |
| Steps to Reproduce | textarea | — | Details |
| Attachments | files | — | Attachments |

**Verdict:** MINOR-TWEAKS

**Top changes (prioritized):**
1. **Add** `Affected Client / Account` — client field, optional; when a support ticket is about a client deliverable or platform issue on behalf of a client, knowing which client is critical for triage and SLA.
2. **Add** `URL / Location` — url, optional; mirrors Bug Report; many support tickets reference a broken page or platform URL.
3. **Merge** with Bug Report via conditional logic or clarify split — the two templates overlap heavily. Consider: Bug Report = technical defects in the dashboard/platform; Support Ticket = external/client-facing support requests or general operational issues. Document the distinction in help_text.

**Automotive gaps:** None — internal template.

---

## 8. Bug Report

**Fields** (sort order):
| Field | Type | Required | Section |
|---|---|---|---|
| Bug Summary | text | ✓ | Issue |
| Severity | dropdown | ✓ | Issue |
| System / Tool Affected | dropdown | ✓ | Issue |
| URL / Location of Issue | url | — | Issue |
| Steps to Reproduce | richtext | ✓ | Details |
| Expected Behaviour | textarea | ✓ | Details |
| Actual Behaviour | textarea | ✓ | Details |
| Browser / Device | text | — | Environment |
| Screenshots / Screen Recording | files | — | Evidence |
| Additional Notes | richtext | — | Other |

**Verdict:** KEEP-AS-IS

**Top changes (prioritized):**
1. **Require** `URL / Location of Issue` — currently optional; for web-based bugs this is essential for reproduction; make required when System = XeroFlow Dashboard.
2. **Retype** `Browser / Device` — plain text; convert to two separate dropdowns: `Browser` (Chrome/Safari/Firefox/Edge) and `Device Type` (Desktop/Mobile/Tablet) to enable pattern analysis across reports.
3. **Add** `User Role at Time of Bug` — dropdown (Owner/Admin/Staff/Viewer/Client); some bugs are role-specific and this context speeds diagnosis.

**Automotive gaps:** None — internal template.

---

## 9. Change Request

**Fields** (sort order):
| Field | Type | Required | Section |
|---|---|---|---|
| Change Request Title | text | ✓ | Request |
| Type of Change | dropdown | ✓ | Request |
| Description of Change | richtext | ✓ | Details |
| Current State | richtext | — | Details |
| Desired State | richtext | ✓ | Details |
| URL / Location | url | — | Location |
| Priority | dropdown | ✓ | Priority |
| Supporting Files | files | — | Files |
| Additional Notes | richtext | — | Other |

**Verdict:** MINOR-TWEAKS

**Top changes (prioritized):**
1. **Require** `Current State` — currently optional; a change request without documenting the current state forces the implementer to reverse-engineer it; make required.
2. **Add** `Estimated Effort` — dropdown (< 1 hour / 1–4 hours / 1 day / 2–5 days / > 1 week), optional; helps triage and capacity planning.
3. **Add** `Affected Client / Account` — client field, optional; change requests that affect a specific client's deliverable or integration need client context for sign-off tracking.
4. **Add** `Sign-off Required` — radio (yes/no); flags whether change needs client or stakeholder approval before proceeding.

**Automotive gaps:** None — internal template.

---

## Summary Table

| Template | Verdict | Key Gap |
|---|---|---|
| Website Development Brief | SIGNIFICANT-REWORK | No OEM brand, dealer location, stock feed/VDP fields |
| Landing Page | SIGNIFICANT-REWORK | No offer/promotion, UTMs, offer disclaimer, stock feed link |
| Email Campaign | SIGNIFICANT-REWORK | No list/segment ID, send time, offer, disclaimer, compliance check |
| Blog / Article Content | MINOR-TWEAKS | Keywords not required; no vehicle/model focus or URL field |
| SEO Audit & Optimisation | SIGNIFICANT-REWORK | No GBP scope option, no dealer locations, misleading template name |
| IT Support Request | MINOR-TWEAKS | Freetext env fields; no affected system dropdown |
| Support Ticket | MINOR-TWEAKS | No client link; overlap with Bug Report needs clarification |
| Bug Report | KEEP-AS-IS | Minor: URL should be required; browser/device as dropdowns |
| Change Request | MINOR-TWEAKS | Current State should be required; no effort estimate |
