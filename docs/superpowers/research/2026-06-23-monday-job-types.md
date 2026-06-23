# Monday.com Job Type Research — ADME Advertising
**Date**: 2026-06-23  
**Purpose**: Authoritative job-type taxonomy from Monday.com to inform brief template design  
**Researcher**: Claude (automated API mining)

---

## Methodology

Queried the Monday.com GraphQL API (`/v2`) across all 4 pages of boards (~200 boards total). Identified key intake/production boards. For each, extracted:
- Column types `dropdown` and `status` with their full label sets
- Group titles (used as job categories in some boards)
- Sample item names (50 per board)

**Primary source**: Social Media board (id: `9550690085`) — `Media` dropdown column with 100+ labels. This is the most comprehensive job-type taxonomy in the account. It covers all deliverable types requested by AMs across digital, creative, print, and broadcast.

**Secondary sources**: Marketing board (id: `13392458`) — Campaign Type dropdown, item names including named brief templates. Social Media board Groups and item names. SEO Framework board groups.

**Boards NOT accessible**: Drive Agent (private, minimal content visible). No board named "ADME Creative Request" was found across all pages — it may be archived or embedded under a different name.

---

## Raw Evidence

### Social Media Board — `Media` Column (id: 196 down to 197)
Full ordered label set (newest → oldest by id):
```
Social Assets, Style Guide, Meta Logo, ReelMotion, YouTube Video, Presentation Folder,
GBP Cover Header, GBP Logo, Bing, Website Pop Up, Qwilr, Web Banner, Google Demand,
Autogate Autoresponse, Pitch Deck, Meta Cover Photo, Instagram Logo, FI Pro,
LinkedIn Carousel, Microsoft Inventory Ad, Meta Image, Logo, Carsales Card,
Google Performance Max, Google Display, Stock Feed, Web Copy, Radio, Campaign Review,
Billboard, Vehicle Wrap, Pull Up Banner, Mirror Hangers, Car Sales Auto Response,
PMAX, Video, Powerpoint, Static Image, Website Banner, Presentation, Website,
Creatopy Templates, Social Tile, Web Support, A4 Flyer, Landing Page, Digital Banners,
Email Signature, OEM Creatives, Performance Max, LinkedIn Cover Photo, GIF, MMS,
Cinema, Welcome Email, YouTube, Business Card, Flyer, Meta Carousel, Poster,
Carsales Banners, Website Image Card, Pop Up, Newspaper, Custom, Meta Video,
eNewsletter, All Socials, Webslide, eDM, SEM, OFAIA, Google Local Ads, Script,
SMS, Collateral, Blog, Branding Video, Google Vehicle Ads, AIA, Meeting Summary,
Google Business Profile, Conversions, Documentation, All Jobs, Invoicing Check,
TikTok, Budgets, Meeting Agenda, Proposal, Tag Line, Database, Google, Microsoft,
LinkedIn, Spotify, Brief, TVC, Feeds, Instagram, Meta Inventory Lead, Checklist,
Autogate, Digital Access, claims, Leads, Instagram Inventory Lead, Email, Meta,
Performance Max Inventory, Audit, Case Study, Review, Meta Traffic Inventory, Report,
Zapier, Tracking, Test, Daily Check, RedNote
```

### Marketing Board — `Campaign Type` Column
```
G_Search, G_PMaxStandard, G_PMaxInventory, G_Display, G_YouTube, G_DemandGen,
M_Traffic, M_AIA_Traffic, M_Leads, M_AIA_Leads, M_Awareness, M_Boosted,
T_Boosted, T_Awareness, S_Awareness, Document
```

### Marketing Board — `Platform` Column
```
Meta, Google, Spotify, TikTok
```

### Marketing Board — Named Brief Templates (item names)
```
Meta Boosted Brief
Meta AIA Brief
Google Search SEM Brief
Spotify Brief
Campaign Brief - Universal Master - April 2026
Campaign Brief - Universal Master - April 2026 - With Form
Campaign Brief - Google Brief - April 2026 - With Form
Campaign Brief - Meta Brief - April 2026 - With Form
```

### Social Media Board — Groups (job workflow categories)
```
Emailed Items, Agency Briefs, Items to Action, Matthew, Laura, Crystal,
ReelMotion, GBP Management, Public Holiday Processes, SMS/MMS
```

### Social Media Board — Item Name Samples (brief-related)
```
Social Media Page Setup Brief
Radio Campaign Brief
SMS Brief
Video Brief
Spotify Campaign Brief
YouTube Setup Brief
ReelMotion Brief
SEO GBP Optimisation
ADME Monthly Blog
ADME Monthly eNewsletter
```

### SEO Framework Board — Groups (SEO job breakdown)
```
SEO Setup, Technical Improvements, Keyword and Competitor Research,
Content Audit & Creation, On-page SEO, Link Building, Local SEO,
PMA Targeting, E-E-A-T / Trust Engineering, AI / GEO Capture,
Commercial Accountability
```

### Marketing Board — Groups (workflow buckets, not job types)
```
Daily Budget Updates, Agency Briefs, Emailed Items, Digital Advertising 101 & Essential,
Items to Action, Upcoming / Follow Ups, QA, Roll Next Month,
Meta Completed [month], Google Completed [month], Spotify Completed [month],
TikTok Completed [month], Intern Projects
```

### Newspaper Ads Board — `Brief` Column Labels
```
Requested, Yes, 1/2 Brief, Resize, HOLD, Repeat, Corporate Ad, Working On It, No, URGENT
```

---

## Categorised Job-Type Taxonomy

Filtered to genuine deliverable/service types (excluding workflow states, platform names, internal admin labels).

### DIGITAL ADVERTISING — Paid Media Creative

| Job Type | Monday Source | Notes |
|---|---|---|
| Meta Image (static ad) | Media col: `Meta Image`, `Static Image` | Core paid social deliverable |
| Meta Video Ad | Media col: `Meta Video` | Video creative for Meta |
| Meta Carousel | Media col: `Meta Carousel` | Multi-image carousel format |
| Meta Boosted Post | Campaign Type: `M_Boosted`; item: `Meta Boosted Brief` | Boosting existing organic content |
| Meta AIA (Auto Inventory Ad) | Campaign Type: `M_AIA_Traffic`, `M_AIA_Leads`; Media: `AIA`, `Meta Inventory Lead` | Automotive dynamic inventory ads |
| Meta Traffic Campaign | Campaign Type: `M_Traffic` | Click-to-website |
| Meta Lead Gen Campaign | Campaign Type: `M_Leads` | Lead form campaigns |
| Meta Awareness Campaign | Campaign Type: `M_Awareness` | Brand reach |
| Meta Traffic Inventory | Media col: `Meta Traffic Inventory` | Inventory-feed traffic |
| Google Search / SEM | Campaign Type: `G_Search`; Media: `SEM`; item: `Google Search SEM Brief` | Text ads |
| Google Performance Max (Standard) | Campaign Type: `G_PMaxStandard`; Media: `Google Performance Max`, `PMAX`, `Performance Max` | Automated Google campaign type |
| Google Performance Max (Inventory) | Campaign Type: `G_PMaxInventory`; Media: `Performance Max Inventory` | Automotive inventory feed |
| Google Display | Campaign Type: `G_Display`; Media: `Google Display` | Display network banners |
| Google YouTube Ad | Campaign Type: `G_YouTube`; Media: `YouTube Video` | Pre-roll / in-stream |
| Google Demand Gen | Campaign Type: `G_DemandGen`; Media: `Google Demand` | Discovery-style placements |
| Google Vehicle Ads | Media col: `Google Vehicle Ads` | Automotive-specific product listing |
| Google Local Ads | Media col: `Google Local Ads` | Location-targeted |
| TikTok Boosted | Campaign Type: `T_Boosted` | Boosted TikTok posts |
| TikTok Awareness | Campaign Type: `T_Awareness` | Organic-style awareness |
| Spotify Campaign | Campaign Type: `S_Awareness`; item: `Spotify Brief` | Audio ad campaigns |
| Microsoft/Bing Ads | Media col: `Microsoft Inventory Ad`, `Bing`, `Microsoft` | Bing search + inventory |
| OEM Creatives | Media col: `OEM Creatives` | Manufacturer-supplied creative adaptation |

### CREATIVE — Design Deliverables

| Job Type | Monday Source | Notes |
|---|---|---|
| Social Tile / Social Assets | Media col: `Social Tile`, `Social Assets`, `All Socials` | Organic social post graphics |
| GIF | Media col: `GIF` | Animated social asset |
| Webslide / Website Image Card | Media col: `Webslide`, `Website Image Card` | Website hero/banner images |
| Web Banner / Website Banner / Digital Banners | Media col: `Web Banner`, `Website Banner`, `Digital Banners` | Display & website banners |
| Carsales Banners / Carsales Card | Media col: `Carsales Banners`, `Carsales Card` | Automotive marketplace creatives |
| Newspaper Ad | Board: Newspaper Ads (dedicated board); Media: `Newspaper` | Print press advertising |
| Flyer / A4 Flyer | Media col: `Flyer`, `A4 Flyer` | Print handouts |
| Poster | Media col: `Poster` | Large-format print |
| Billboard | Media col: `Billboard` | OOH static billboard |
| Vehicle Wrap | Media col: `Vehicle Wrap` | Car signage wraps |
| Pull Up Banner | Media col: `Pull Up Banner` | Event/showroom signage |
| Mirror Hangers | Media col: `Mirror Hangers` | In-vehicle hang tags |
| Business Card | Media col: `Business Card` | Stationery |
| Collateral | Media col: `Collateral` | Catch-all print collateral |
| Logo | Media col: `Logo`, `Meta Logo`, `Instagram Logo`, `GBP Logo` | Brand identity assets |
| Style Guide | Media col: `Style Guide` | Brand guidelines doc |
| Email Signature | Media col: `Email Signature` | Staff email signatures |
| LinkedIn Cover Photo | Media col: `LinkedIn Cover Photo` | Platform branding |
| GBP Cover Header | Media col: `GBP Cover Header` | Google Business Profile header |
| Meta Cover Photo | Media col: `Meta Cover Photo` | Facebook page cover |
| Tag Line | Media col: `Tag Line` | Copywriting / brand tagline |

### VIDEO & BROADCAST

| Job Type | Monday Source | Notes |
|---|---|---|
| Video (general) | Media col: `Video`; Social item: `Video Brief` | Catch-all video production |
| Branding Video | Media col: `Branding Video` | Brand/corporate video |
| TVC | Media col: `TVC` | Television commercial |
| YouTube Video | Media col: `YouTube Video`; Social item: `YouTube Setup Brief` | YouTube-specific content |
| ReelMotion | Media col: `ReelMotion`; Social group: `ReelMotion`; item: `ReelMotion Brief` | Short social video (Reels/TikTok) |
| Cinema | Media col: `Cinema` | Cinema pre-roll/screen ad |
| Script | Media col: `Script` | Copywriting for video/radio |
| Radio | Media col: `Radio`; Social item: `Radio Campaign Brief` | Radio ad production |

### DIGITAL — WEB & CONTENT

| Job Type | Monday Source | Notes |
|---|---|---|
| Landing Page | Media col: `Landing Page`; Board: ADME Landing Pages | Conversion-focused page |
| Website | Media col: `Website` | Full website build/update |
| Web Copy | Media col: `Web Copy` | Website copywriting |
| Web Support | Media col: `Web Support` | Website maintenance/fixes |
| Website Pop Up | Media col: `Website Pop Up` | On-site popup design |
| Blog | Media col: `Blog`; Social item: `ADME Monthly Blog` | Editorial content |
| eNewsletter / eDM | Media col: `eNewsletter`, `eDM`; Social item: `ADME Monthly eNewsletter` | Email newsletter |
| Welcome Email | Media col: `Welcome Email` | Onboarding/CRM email |
| Email (general) | Media col: `Email` | Email campaign creative |
| Creatopy Templates | Media col: `Creatopy Templates` | Programmatic display template creation |
| Stock Feed | Media col: `Stock Feed`, `Feeds` | Inventory data feed setup |

### SEO & GBP

| Job Type | Monday Source | Notes |
|---|---|---|
| SEO (general) | Boards: SEO Framework, Frankston Ford - SEO, Astoria GWM - SEO | Organic search optimisation |
| SEO Technical | SEO Framework group: `Technical Improvements` | Site audit & fixes |
| SEO Content | SEO Framework group: `Content Audit & Creation` | Blog/page content |
| Local SEO / GBP Management | SEO group: `Local SEO`; Social group: `GBP Management`; Media: `Google Business Profile` | Google Business Profile |
| GBP Optimisation | Social item: `SEO GBP Optimisation` | Monthly GBP updates |

### MESSAGING — SMS / MMS

| Job Type | Monday Source | Notes |
|---|---|---|
| SMS Campaign | Media col: `SMS`; Social group: `SMS/MMS`; item: `SMS Brief` | Text message marketing |
| MMS Campaign | Media col: `MMS` | Multimedia message with image |

### SOCIAL PLATFORM SETUP & MANAGEMENT

| Job Type | Monday Source | Notes |
|---|---|---|
| Social Media Page Setup | Social item: `Social Media Page Setup Brief` | New social profile setup |
| TikTok Content | Media col: `TikTok` | TikTok organic posts |
| Instagram | Media col: `Instagram` | Instagram organic content |
| LinkedIn Carousel | Media col: `LinkedIn Carousel` | LinkedIn document/carousel posts |
| Spotify | Media col: `Spotify` | Organic/managed Spotify |
| YouTube Setup | Social item: `YouTube Setup Brief` | Channel setup |

### PRINT — EXTERNAL PUBLICATIONS

| Job Type | Monday Source | Notes |
|---|---|---|
| Newspaper Ad | Dedicated board: Newspaper Ads (170+ weekly groups back to 2016); Publications board lists: GoAuto, Herald Sun, Star News, Weekly Times, Jewish News, Korean/Chinese/Vietnamese papers | Press advertising across metro, regional, multicultural |
| Corporate Ad | Newspaper Ads `Brief` col: `Corporate Ad` | Brand/corporate print ad |
| Resize | Newspaper Ads `Brief` col: `Resize` | Adapting existing ad to new size |

### PRESENTATIONS & PROPOSALS

| Job Type | Monday Source | Notes |
|---|---|---|
| Pitch Deck | Media col: `Pitch Deck` | New business presentation |
| Presentation | Media col: `Presentation`, `Powerpoint` | Client/internal slide decks |
| Presentation Folder | Media col: `Presentation Folder` | Printed folder/collateral |
| Proposal / Qwilr | Media col: `Proposal`, `Qwilr` | Client proposals |

### AUTOMOTIVE-SPECIFIC

| Job Type | Monday Source | Notes |
|---|---|---|
| Autogate Autoresponse | Media col: `Autogate Autoresponse`, `Autogate` | Autogate lead response setup |
| Car Sales Auto Response | Media col: `Car Sales Auto Response` | Carsales platform auto-reply |
| FI Pro | Media col: `FI Pro` | Finance & Insurance integration |
| AIA (Auto Inventory Ads) | Media col: `AIA` | Meta/Google dynamic inventory |
| OFAIA | Media col: `OFAIA` | Off-Facebook Auto Inventory Ads |
| OEM Creatives | Media col: `OEM Creatives` | OEM-supplied creative assets |
| Pop Up (showroom) | Media col: `Pop Up` | In-dealership popup material |

---

## Recommended Brief Template Shortlist

### HIGH-PRIORITY — Each warrants a dedicated template

These are the highest-volume, most-requested job types where AMs regularly produce briefs:

1. **Meta Ad Campaign Brief** — covers Meta Traffic / Leads / Awareness / Boosted; most-mentioned brief in the account. Existing: "Campaign Brief - Meta Brief" already in Marketing board.
2. **Meta AIA (Auto Inventory Ad) Brief** — distinct workflow from standard Meta; inventory feed + vehicle data required. Existing: "Meta AIA Brief" item exists.
3. **Google Search / SEM Brief** — unique keyword/targeting fields. Existing: "Google Search SEM Brief" item exists.
4. **Google Performance Max Brief** — Standard and Inventory variants; separate template per variant or a forked field set.
5. **ReelMotion / Short Video Brief** — dedicated board group, dedicated item; video specs + platform targets.
6. **Social Assets Brief** — organic social tile creation; client, platform, copy, brand guide reference.
7. **Newspaper Ad Brief** — dedicated 170+ week board; existing `Brief` workflow column (Requested/Resize/Repeat); print specs + publication deadline.
8. **SEO Brief** — monthly retainer model; covers GBP management, content, technical; SEO Framework board defines the task taxonomy.
9. **SMS / MMS Campaign Brief** — dedicated group + item in Social Media board; short-form with opt-out and compliance fields.
10. **Landing Page Brief** — dedicated board (ADME Landing Pages); requires URL, offer, UTMs, CTA.

### MEDIUM-PRIORITY — Strong candidates for a template

11. **Spotify Campaign Brief** — existing item + Campaign Type label; audio creative + targeting.
12. **TikTok Campaign Brief** — T_Boosted + T_Awareness campaign types; Organic vs paid distinction.
13. **Video / TVC Brief** — catch-all for non-ReelMotion video; script, talent, shoot date, platform.
14. **EDM / eNewsletter Brief** — email broadcast; list, subject, offer, send date.
15. **eDM (custom)** — distinct from newsletter; one-off promotional send.
16. **Website / Web Support Brief** — scope description, pages, CMS, timeline.

### LOW-PRIORITY / NICHE — Generic template covers adequately

The following are real job types but infrequent enough (or simple enough) that a generic "Creative Request" form with a job-type selector covers them:

Billboard, Vehicle Wrap, Pull Up Banner, Mirror Hangers, Flyer, Poster, Business Card, Collateral, Email Signature, Logo, Style Guide, Presentation/Pitch Deck, Proposal/Qwilr, Carsales Banners, Carsales Card, Microsoft/Bing Ads, YouTube Setup, Cinema, Radio, LinkedIn Carousel, GBP Setup, Autogate Autoresponse, FI Pro integration, OEM Creatives (usually supplied), Web Copy, Blog.

---

## Frequency / Prevalence Signals

| Signal | Interpretation |
|---|---|
| Dedicated board | Very high volume: Newspaper Ads, Social Media, Marketing, SEO (×2 client SEO boards visible) |
| Named brief item in Marketing board | Active operational use: Meta Boosted, Meta AIA, Google Search, Spotify |
| Named brief item in Social Media board | Regular AM requests: Video, SMS, Radio, Spotify, YouTube, ReelMotion, Social Page Setup |
| Campaign Type dropdown presence | Platform campaigns are the core business: Meta × 6 types, Google × 6 types, TikTok × 2, Spotify × 1 |
| Media column label (Social Media board) | 100+ labels = every deliverable type ever requested; oldest IDs (low numbers like 2, 3, 4) = longest-running: eDM (id 2), All Socials (3), Webslide (4), eNewsletter (5), Meta Video (6) |
| Dedicated board groups per person | ReelMotion has its own group = high volume recurring deliverable |

**Oldest / most-established job types** (by Media column label ID, lowest = oldest):
eDM → All Socials → Webslide → eNewsletter → Meta Video → Newspaper → Pop Up → Website Image Card → Carsales Banners → Meta Carousel → Poster → Flyer → Business Card → YouTube → Welcome Email → Cinema → GIF → MMS → LinkedIn Cover Photo → Performance Max

---

## Boards Accessed

| Board | ID | Relevant findings |
|---|---|---|
| Social Media | 9550690085 | Primary taxonomy (Media column, 100+ labels) |
| Marketing | 13392458 | Campaign types, brief item names, platform taxonomy |
| Newspaper Ads | 13390840 | Dedicated print board; Brief workflow column |
| SEO Framework | 18399211942 | SEO service breakdown by task type |
| ADME Landing Pages | 18414021016 | Landing page as distinct service line |
| Project Task Manager | 9970935150 | Generic task board, no job types |
| Client Roadmap | 11236776 | Status-only, no job types |
| Publication Specifications | 11217331 | Print publication specs (named publications) |
| OEM Brand Compliance | 15373501 | OEM portals and brand guidelines reference |
| Tickets | 8414310963 | Support workflow; Issue/Question/Request types |
| Individual client boards (×3 sampled) | various | Facebook campaign tracking only |

## Rate Limits / Gaps

- No rate limit errors encountered. Complexity budget was not exhausted.
- "ADME Creative Request" board (mentioned in task brief as ~147 items) was not found across all 4 pages of boards (~200 total). It may be: (a) archived/deleted, (b) a sub-board embedded in a workspace not returned by the default `boards()` query, or (c) known to team under a different name. The Social Media board's "Agency Briefs" and "Emailed Items" groups likely serve this function operationally.
- Drive Agent board (id: 18410362361) is private with minimal content visible via API token.
- ADME Performance Monitor (id: 18406749319) is private — not inspected.
