# Automotive Site Intelligence — Design and PRD

**Date:** 2026-08-01

**Status:** Approved for implementation planning

**Parent capability:** [Website Audience Intelligence](./2026-08-01-website-audience-intelligence-design.md)

**Primary surface:** `/agency/analytics/audiences/intelligence`

## Purpose

Extend XeroFlow's first-party Website Audience Intelligence with a bounded site
indexing service for client-owned and public competitor websites. The service
adds the semantic context needed to explain audience performance: current offers,
vehicle models, pricing, finance language, calls to action, page purpose, content
changes, and observable competitor movements.

The product is not a general-purpose web crawler and does not estimate competitor
traffic. First-party XeroFlow tracking remains the source of truth for client
visitor, session, campaign, and lead outcomes.

## Product decision

Build an automotive-first hybrid intelligence system:

1. XeroFlow measures owned-site behaviour through its existing tracking pixel;
2. XeroFlow indexes authorised owned sites and manually allowlisted public
   competitor domains;
3. deterministic extraction and change detection run before AI;
4. AI interprets only materially changed content and only when the declared
   content-use purpose is permitted;
5. competitor intelligence reports public observable facts, never inferred
   visitor identities, audiences, traffic, conversions, or ad spend; and
6. every recommendation retains an evidence URL, observation time, source lane,
   and confidence.

This combines the direct-measurement and public-extraction portions of platforms
such as Similarweb with the focused change-monitoring model used by competitive
intelligence products. It deliberately excludes clickstream-panel modelling,
which would require licensed third-party data.

## Research conclusions

- Similarweb and Semrush combine public crawling with direct measurement,
  contributed or licensed clickstream data, partnerships, and modelling. A
  crawler alone cannot reproduce credible competitor traffic estimates.
- Pathmatics-style ad intelligence relies on repeatedly observing ads in real or
  simulated browsing environments. Public website indexing is useful supporting
  context, but not proof of reach or spend.
- Crayon and Visualping demonstrate the practical first release: monitor selected
  pages, detect meaningful changes, suppress noise, and generate evidence-backed
  briefings.
- Official Google, Meta, and Microsoft ad-transparency sources are preferred over
  bypassing platform controls. Ad-library ingestion is a later, separately
  approved connector slice because API coverage differs by platform and region.
- Cloudflare Browser Run, Workflows, Queues, R2, Workers AI, AI Gateway,
  Vectorize, and Hyperdrive fit the existing XeroFlow infrastructure and avoid a
  second data platform.

### Primary research sources

- [Similarweb data methodology](https://support.similarweb.com/hc/en-us/articles/360001631538-Similarweb-Data-Methodology)
- [Semrush traffic intelligence methodology](https://www.semrush.com/kb/1211-how-semrush-turns-traffic-data-into-traffic-intelligence)
- [Sensor Tower Pathmatics methodology](https://sensortower.com/blog/how-does-pathmatics-work)
- [Visualping competitive monitoring](https://visualping.io/competitive-monitoring)
- [Google Ads Transparency](https://support.google.com/My-Ad-Center-Help/answer/12155361?hl=en)
- [Meta Ad Library](https://www.facebook.com/help/259468828226154/)
- [Microsoft Advertising Ad Library API](https://learn.microsoft.com/en-us/advertising/guides/ad-library-api?view=bingads-13)
- [Cloudflare Browser Run crawl endpoint](https://developers.cloudflare.com/browser-run/quick-actions/crawl-endpoint/)
- [Cloudflare Workflows](https://developers.cloudflare.com/workflows/)
- [Cloudflare Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
- [Cloudflare R2 lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [Cloudflare Vectorize metadata filtering](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/)
- [OAIC APP 3 collection guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-3-app-3-collection-of-solicited-personal-information)
- [Google personalised advertising policy](https://support.google.com/adspolicy/answer/6242605?hl=en)

## Users and jobs

### Media buyer

- Understand whether a weak campaign is caused by acquisition, landing-page
  relevance, offer competitiveness, or tracking quality.
- See important competitor offer changes without manually checking every site.
- Open the supporting page and convert an insight into a campaign or creative
  task after human review.

### Account manager

- Prepare a client briefing covering owned-site performance and competitor
  movement.
- Maintain the approved competitor set and explain why each domain is monitored.
- Verify that recommendations are supported by current evidence.

### Platform administrator

- Control domains, crawl scope, frequency, retention, AI permission, and spend.
- Diagnose blocked, disallowed, errored, or stale crawls.
- Pause all crawling or AI enrichment without disrupting first-party analytics.

## Scope and lane separation

### Owned lane

The client or agency has authority to monitor the site. The lane may combine:

- indexed page facts and changes;
- XeroFlow visitors, sessions, engagement, campaign attribution, and leads;
- landing-page and campaign-message alignment; and
- approved AI summaries and recommendations.

Owned crawling still respects configured URL scope and retention. Authentication,
cookies, or WAF bypass are out of scope for the first release; only publicly
reachable owned pages are indexed.

### Competitor lane

Only manually allowlisted public pages are monitored. The lane may report:

- offer, price, finance, CTA, vehicle, inventory, and page-content changes;
- first-seen, last-seen, before/after facts, and evidence links;
- differences between the client's current offer/content and public competitor
  observations; and
- AI interpretation only where `ai-input` is explicitly declared and permitted.

It must not report competitor visitors, demographics, audiences, conversions,
campaign performance, reach, frequency, or spend unless a later licensed source
provides that metric and the UI labels the source and estimation method.

## Automotive-first taxonomy

The initial deterministic schema recognises:

- brand, model, variant, body type, fuel/powertrain, and model year;
- new, demonstrator, used, and in-stock availability signals;
- drive-away price, list price, discount, deposit, repayment, comparison rate,
  term, balloon/residual, eligibility, expiry, and disclaimers;
- factory bonus, trade-in bonus, accessories, warranty, servicing, and delivery
  offers;
- test drive, enquiry, call, quote, configure, reserve, and inventory CTAs;
- page types: homepage, model, inventory, offer, finance, service, location,
  campaign landing page, article, and other; and
- structured data from JSON-LD, Open Graph, canonical tags, headings, links, and
  visible page copy.

Unknown or ambiguous values remain null and retain the source excerpt. The system
must not invent a price, finance term, vehicle match, or expiry.

## Crawl governance

Every domain requires a registry record containing:

- client ownership and `owned` or `competitor` lane;
- canonical HTTPS origin and display name;
- business justification and who approved it;
- active/paused state;
- sitemap/links discovery mode;
- include and exclude patterns;
- static, browser, or automatic render mode;
- page limit, depth, and schedule;
- declared crawl purposes;
- whether AI input is allowed;
- snapshot retention; and
- latest run, next run, and operational status.

Defaults:

| Setting | Owned | Competitor |
|---|---:|---:|
| Page limit | 200 | 100 |
| Link depth | 3 | 2 |
| Discovery | sitemap first, then links | sitemap first, then allowlisted links |
| Render | static first, browser fallback | static first, browser fallback |
| Frequency: offer/inventory | daily | daily |
| Frequency: general pages | weekly | weekly |
| Crawl purposes | `search`, optionally `ai-input` | `search`; add `ai-input` only after approval |
| AI training | never | never |
| Raw snapshot retention | 90 days | 30 days |

The service must:

- accept only `http:` or `https:` input and normalise to an HTTPS origin where
  supported;
- block localhost, link-local, private, reserved, credential-bearing, and
  non-public targets before starting a crawl;
- keep external-link following disabled;
- keep subdomain following disabled unless the exact subdomain is approved;
- respect `robots.txt`, crawl delay, Content Signals, WAF, CAPTCHA, and Turnstile;
- never customise the Browser Run crawler user agent to conceal its identity;
- classify disallowed or blocked pages as observed states, not errors to bypass;
- use content hashes, `modifiedSince`, and `maxAge` to avoid redundant work; and
- expose global and per-domain pause controls.

## Cloudflare architecture

```text
Agency UI / scheduled trigger
        │
        ▼
Neon domain registry ──► agency-workflows service binding
                              │
                              ▼
                    Cloudflare Browser Run /crawl
                    start → durable poll → paginate
                              │
                              ▼
                    authenticated Pages callback
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
        Neon current facts   R2 snapshots   JOBS_QUEUE
               │                              │
               ▼                              ▼
        deterministic diff           changed-page enrichment
               │                       Workers AI / AI Gateway
               └──────────────┬───────────────┘
                              ▼
                    Vectorize + insight rows
                              │
                              ▼
              Audience Intelligence APIs and UI
```

### Workflows

Extend the existing `agency-workflows` Worker with a site crawl workflow. A run:

1. validates a narrow payload containing domain and run identifiers;
2. asks an authenticated Pages callback for the immutable crawl configuration;
3. starts Cloudflare Browser Run `/crawl` using a Browser Rendering API token;
4. durably polls with bounded retries and Workflow sleeps;
5. paginates completed, skipped, disallowed, and errored records;
6. posts bounded result batches to authenticated Pages callbacks; and
7. marks the run completed, partial, blocked, failed, or cancelled.

Workflow instance IDs include the crawl run ID, making retries idempotent.

### Neon

Neon is the system of record for domain governance, crawl runs, the current
structured page state, material changes, and generated insights. Hyperdrive remains
the production connection path already used by the Pages application.

### R2

Use a dedicated private bucket binding, `SITE_INTELLIGENCE_BUCKET`, for raw
Markdown/HTML and optional screenshots. Keys use the tenant-safe structure:

`clients/<client-id>/domains/<domain-id>/runs/<run-id>/<page-hash>.md`

R2 objects are never public. Lifecycle rules delete competitor artifacts after 30
days and owned artifacts after 90 days. Neon retains structured facts and hashes
after raw objects expire.

### Queues

Only inserted or materially changed pages enqueue `site-intelligence.enrich` on
the existing `JOBS_QUEUE`. The existing queue consumer forwards the idempotent job
to Pages. Unchanged pages update `last_seen_at` without incurring AI or embedding
cost.

### AI Gateway and Workers AI

Deterministic parsers run first. AI receives an allowlisted, length-bounded payload
containing visible text excerpts, deterministic facts, prior facts, and permitted
client context. It returns schema-validated classifications, summaries, confidence,
and evidence references.

AI is skipped when:

- `ai_input_allowed` is false;
- the declared `ai-input` purpose is not permitted;
- a page is unchanged;
- the page contains no relevant automotive or offer signal; or
- daily domain, client, or agency cost limits are exhausted.

AI output is advisory and cannot create an ad, change a campaign, or activate an
audience. AI Gateway supplies logging, rate limits, retries, and spend limits.

### Vectorize

Use a separate `SITE_INTELLIGENCE_VECTORIZE` index with 768-dimension embeddings.
Create metadata indexes before inserting vectors for `clientId`, `lane`,
`domainId`, and `pageType`. Every query must include a client filter; cross-client
search is prohibited. The result is joined back to authorised Neon rows before it
is returned.

## Data model

### `site_intelligence_domains`

Registry and governance record. Important fields include `client_id`, `lane`,
`origin`, `justification`, `approved_by`, `status`, crawl controls,
`crawl_purposes`, `ai_input_allowed`, retention, schedule, and timestamps. A
client/origin/lane tuple is unique.

### `site_intelligence_crawl_runs`

Immutable run identity plus status, Cloudflare job ID, requested settings,
counts, browser seconds, timestamps, error category, and error summary. Raw tokens,
response bodies, and stack traces are never stored.

### `site_intelligence_ingest_batches`

Operational idempotency ledger keyed by crawl run and bounded batch key. It lets a
Workflow or Queue retry a result page without duplicating page state, changes, or
enrichment work.

### `site_intelligence_pages`

One current row per canonical page: status, content hash, R2 object key, metadata,
deterministic facts, first/last seen, last changed, vector ID, and extraction
version. Unique on domain and canonical URL.

### `site_intelligence_changes`

Append-only material changes containing previous/current hashes, typed fact diff,
short evidence excerpts, source URL, first observed time, confidence, and review
state. Full copyrighted page bodies are not copied into this table.

### `site_intelligence_insights`

Evidence-backed owned, competitor, or cross-lane insights. Each insight stores its
rule/model version, supporting page/change IDs, confidence, status, generated time,
and optional assignee/task link. The MVP remains read-only with respect to ads and
audiences.

### `site_intelligence_audit_events`

Tenant-scoped audit evidence for domain approval/configuration, manual or scheduled
runs, change review, and insight actions. Metadata is bounded and excludes page
bodies, credentials, tokens, and personal information.

## Intelligence rules

Deterministic rules generate candidate insights before AI wording:

1. **Offer introduced or removed** — price, bonus, finance, warranty, or expiry
   changes on a monitored offer/model page.
2. **Offer gap** — a competitor has a current structured offer for a comparable
   model/category and the owned site has no comparable current offer fact.
3. **Landing-message mismatch** — paid campaign/creative language differs from the
   owned landing page's current offer, model, CTA, or expiry.
4. **High-traffic stale content** — an owned page has meaningful tracked traffic
   but an expired offer, unavailable vehicle, or materially stale facts.
5. **Content gap** — competitors publish relevant model/finance/service content
   absent from the owned site.
6. **Conversion-context opportunity** — an owned page has high-intent traffic and
   weak lead conversion while competitor evidence shows clearer CTAs or offers.

Comparability is explicit and conservative: exact model first, then approved
vehicle category or business-defined competitor set. Low-confidence matches are
shown as “review suggested,” not asserted as equivalent.

## API boundaries

### Registry

- `GET /api/agency/site-intelligence/domains`
- `POST /api/agency/site-intelligence/domains`
- `PUT /api/agency/site-intelligence/domains/[id]`
- `POST /api/agency/site-intelligence/domains/[id]/crawl`

### Intelligence

- `GET /api/agency/site-intelligence/overview`
- `GET /api/agency/site-intelligence/changes`
- `GET /api/agency/site-intelligence/gaps`
- `GET /api/agency/site-intelligence/runs/[id]`

All handlers require the existing analytics/media role gate and resolve client
scope before querying. Management roles may manage approved domains; scoped staff
may read only assigned clients. Domain mutations require an administrator or owner
role and are audited.

### Internal workflow callbacks

- `GET /api/internal/workflows/site-intelligence/runs/[id]/config`
- `POST /api/internal/workflows/site-intelligence/runs/[id]/ingest`
- `POST /api/internal/workflows/site-intelligence/runs/[id]/complete`

Callbacks require `x-workflow-secret`, accept only immutable run IDs and bounded
batches, and are idempotent.

## User interface

Add an “Intelligence” route-backed tab within Website Audiences.

The page hierarchy is:

1. date/client controls and data-freshness summary;
2. owned/competitor coverage and latest crawl states;
3. high-priority actionable insights;
4. offer and content gap comparison;
5. material change feed with before/after evidence; and
6. managed-domain table with run history and diagnostics.

Domain creation/editing uses a Nuxt UI `UModal` form and the mandatory project
form conventions. Crawl state copy distinguishes blocked/disallowed, partial,
failed, complete, stale, and never run. The UI never calls a blocked competitor
site “broken” and never offers a bypass action.

## Operational controls and observability

- `SITE_INTELLIGENCE_ENABLED=false` disables new manual and scheduled runs.
- `SITE_INTELLIGENCE_AI_ENABLED=false` keeps deterministic collection/diffs active
  while disabling enrichment.
- Per-domain `paused` state stops scheduling without deleting history.
- Structured logs include run ID, domain ID, client ID, stage, duration, counts,
  retry count, and cost usage; they exclude page bodies and tokens.
- Alerts cover repeated run failures, API authentication failure, queue DLQ growth,
  R2 write failure, and daily cost-cap exhaustion.
- A readiness endpoint checks required bindings and feature flags without exposing
  secrets.

## Privacy, legal, and content safeguards

- Collect public business content, not competitor visitor or employee/customer
  personal information.
- Public availability does not override Australian Privacy Principles; incidental
  personal data is excluded or redacted during extraction.
- Do not send PII, tracking IDs, raw event payloads, click IDs, lead data, or user
  identifiers to the crawler or AI enrichment boundary.
- Do not use one managed client's audience data to construct an audience for an
  unrelated client.
- Do not republish full competitor pages. Retain structured facts, short evidence
  excerpts, hashes, and source links.
- Maintain tenant-scoped deletion that removes Neon rows, R2 objects, and vectors.
- Preserve an audit record of domain approval, configuration changes, manual runs,
  and insight review actions.

## MVP boundaries

The pilot covers five to ten automotive clients, one owned domain and up to three
competitor domains per client, and no more than 200 approved pages per domain.

Included:

- domain registry and approval controls;
- manual and scheduled Browser Run crawls;
- deterministic automotive extraction;
- snapshot storage and material diffs;
- changed-page AI enrichment with permission and cost gates;
- tenant-scoped semantic search;
- owned performance context from existing audience analytics;
- competitor changes, offer/content gaps, diagnostics, and evidence; and
- a read-only intelligence dashboard.

Excluded:

- competitor traffic, conversion, audience, demographic, reach, or spend estimates;
- login-protected, authenticated, CAPTCHA-protected, or access-bypassed crawling;
- broad discovery outside approved domains and patterns;
- visitor-level browsing or cross-client audiences;
- automatic ad, creative, budget, website, or audience mutations;
- AI training on indexed content;
- general-purpose non-automotive taxonomies; and
- Google/Meta/Microsoft ad-library connectors until separately designed and
  approved.

## Success criteria

The pilot succeeds when an authorised media buyer can:

1. see current owned and competitor crawl health for an accessible client;
2. identify a material offer or content change with a working evidence link and
   observation timestamp;
3. compare an owned landing page's actual audience/lead performance with its
   current structured offer and CTA facts;
4. see a conservative offer/content gap without fabricated competitor metrics;
5. distinguish deterministic facts from AI interpretation and understand
   confidence;
6. search only within the selected client's intelligence; and
7. operate the page while crawler, AI, and ad activation remain independently
   fail-closed.
