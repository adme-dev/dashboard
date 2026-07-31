# XeroFlow Search Authority and AI Trust Platform PRD

Status: Ready for stakeholder review — no implementation authorized

Owner: XeroFlow Product and Engineering

Pilot client: Knox GWM Haval, Burwood Highway

Agency partner: ADME Advertising

Target market: Melbourne Outer East PMA

Last updated: 2026-07-31

## 1. Executive summary

XeroFlow will turn ADME's Search Authority and AI Trust service from a monthly
SEO checklist into a repeatable, multi-tenant product.

The Knox GWM pilot will combine five capabilities:

1. Native Google Search Console ingestion and opportunity detection.
2. A bounded technical trust monitor for dealership and vehicle pages.
3. A governed content workflow based on original sales-team knowledge.
4. XeroFlow-owned edge publishing at `learn.knoxgwmhaval.com.au`.
5. Human-approved Google Business Profile publishing and performance reporting.

The pilot deliberately avoids Dealer Studio or dealership CMS integration.
XeroFlow will own the content workflow, publishing runtime, page templates,
structured metadata, sitemap, monitoring and reporting. The existing Google Tag
Manager container will only bootstrap a versioned XeroFlow Menu Agent that adds
a link to the published content hub using a lifecycle that remains safe across
the existing Next.js hydration and rerendering behavior.

The first release is advisory and approval-gated. Deterministic rules identify
opportunities and health problems. AI may explain evidence, transcribe or
summarise an approved interview, and draft content, but it must not invent
metrics, approve claims, create work automatically, publish autonomously or
change Google Ads campaigns.

## 2. Product decision

### 2.1 Approved pilot architecture

Use a XeroFlow-managed custom subdomain:

`learn.knoxgwmhaval.com.au`

The hostname will be connected to a dedicated XeroFlow edge publisher through
Cloudflare for SaaS. Knox or its domain administrator performs one bounded DNS
change: create a CNAME record for `learn`. The existing `www` site remains on
Vercel and does not move behind another reverse proxy.

The existing GTM container loads a small XeroFlow Menu Agent. The agent inserts
an accessible `Buying Guides` link into both desktop and mobile navigation
without assuming a private Next.js hydration event. It is idempotent across
initial load, hydration and later rerenders. It never creates content pages,
changes canonical metadata or rewrites vehicle data.

### 2.2 Why the pilot will not publish under `www/...`

DNS cannot route by URL path. Publishing
`www.knoxgwmhaval.com.au/guides/...` requires one of:

- a rewrite or route inside the existing Vercel project;
- cooperation from the existing website platform;
- or a reverse proxy in front of all `www` traffic.

The first two options violate the no-Dealer-Studio/no-CMS-access constraint.
The third is technically achievable with Cloudflare Workers, Cloudflare
Snippets, Fastly Compute or Akamai EdgeWorkers, but is rejected for the pilot:

- Vercel advises against stacking another reverse proxy in front of Vercel
  because it reduces traffic visibility, can complicate security and caching,
  and adds another network hop;
- the current site is a prerendered Next.js application, so rewriting markup
  inside React-managed navigation before hydration risks a hydration mismatch;
- a defect in a whole-site proxy would increase the blast radius beyond the new
  Search Authority product.

Same-host path publishing remains a possible future migration if XeroFlow is
granted explicit Vercel routing access.

### 2.3 Technology decisions

- Use ordinary HTML5, not XHTML.
- Do not use a service worker to create virtual pages.
- Do not use query-string or hash-fragment pages as indexable content.
- Do not use GTM to manufacture page bodies or canonical metadata.
- Do not use GTM for fast-changing vehicle price, availability or mileage
  structured data. Google can process JavaScript-generated JSON-LD, but warns
  that dynamically generated Product markup can make Shopping crawls less
  frequent and less reliable.
- Do not add htmx solely for menu injection.
- Web Components may be used later for isolated interactive tools, but are not
  required for first-release content pages.
- Do not use Cloudflare Zaraz as a routing or page-publishing layer. It is
  designed to load and control third-party tools and still requires a
  Cloudflare-proxied hostname.
- Do not use Cloudflare Snippets for the publishing control plane. Although
  Snippets support `HTMLRewriter`, their lightweight execution, memory,
  package-size and subrequest limits plus the absence of version management
  make Workers the safer product runtime.
- Use one multi-tenant edge publisher initially. Workers for Platforms is not
  required unless XeroFlow later runs customer-supplied code or requires
  per-tenant isolate deployment.

## 3. Problem statement

ADME already manages PMax, Merchant Center, GA4 and portal reporting for
automotive clients. Search and AI discovery work is currently fragmented:

- Search Console evidence is reviewed manually outside XeroFlow.
- Organic queries do not feed a governed opportunity workflow.
- Website crawl, metadata, structured-data and performance problems are not
  monitored as a durable product.
- Original dealership knowledge is difficult to capture, approve and publish
  without CMS cooperation.
- GBP publishing exists in XeroFlow but remains dormant pending Google access,
  credentials and account reconnection.
- Organic visibility, content publication, paid media and lead outcomes are not
  connected through one auditable product surface.

Knox GWM's live site also demonstrates why monitoring must be factual rather
than checklist-based. Vehicle markup exists, but sampled pages have shown
visible price or mileage values that can diverge from structured data. The
product must detect such inconsistency rather than reporting that schema merely
exists.

## 4. Product vision

Give ADME a repeatable Search Authority workspace that answers:

- What are prospective buyers searching for?
- Which queries and pages represent the strongest current opportunities?
- What technical issues reduce crawlability or trust?
- What original dealership knowledge should be published next?
- Is published content healthy, discoverable and accurately represented?
- How is GBP contributing to discovery and action?
- Which organic and local-search journeys lead to enquiries and sales?
- Which insights should inform paid campaign briefs without automatically
  changing live campaigns?

The product should make the monthly retainer operationally visible and
measurable while preserving human accountability for claims and publication.

## 5. Current XeroFlow foundations

The product must extend existing capabilities instead of creating parallel
systems.

### 5.1 Existing foundations to reuse

- GA4 OAuth, property mapping, daily sync, dimensional sync and funnel data:
  `server/utils/ga4Client.ts`,
  `server/utils/ga4Sync.ts`,
  `server/utils/ga4DimensionSync.ts`,
  `server/utils/ga4Funnel.ts`.
- Google Ads and PMax orchestration foundations:
  `server/utils/googleAdsClient.ts`,
  `server/utils/googleCredentialProfiles.ts`,
  `server/utils/googleRecommendations.ts`,
  `server/utils/googlePmaxLaunchConfig.ts`.
- Merchant Center and automotive inventory-feed auditing:
  `server/utils/inventoryFeedAudit.ts`.
- Canonical website measurement, lead capture and lifecycle outcomes:
  `server/utils/measurement/`,
  `server/utils/tracking/`,
  `server/utils/leads/`.
- Agency and client analytics surfaces:
  `app/pages/agency/analytics/`,
  `app/pages/portal/analytics/`.
- Client portal authentication and authorization.
- Work management, tasks, approvals and audit history.
- Social publishing provider framework and Google Business implementation:
  `server/utils/social-providers/google-business.ts`,
  `server/utils/socialOAuth/googleBusiness.ts`.
- GBP publishing feature flag:
  `GOOGLE_BUSINESS_PUBLISHING_ENABLED`.
- Cloudflare Pages, Workers, R2, KV, Queues and Browser Rendering availability.
- Neon Postgres as the operational source of truth.

### 5.2 Genuine product gaps

- No Search Console OAuth connection, property mapping or scheduled ingestion.
- No durable Search Console query/page warehouse.
- No deterministic organic opportunity lifecycle.
- No technical trust crawler or structured-data parity monitor.
- No GBP Performance API ingestion.
- No XeroFlow-owned public content publisher or custom-hostname onboarding.
- No durable menu-injection configuration or health monitoring.
- No unified organic-to-lead and content-to-outcome reporting.

## 6. Goals

### 6.1 Primary goals

- Connect a client Search Console property with least-privilege OAuth.
- Maintain reliable query and page performance history.
- Rank explainable opportunities without inventing data.
- Let an operator convert a reviewed opportunity into a XeroFlow task.
- Detect crawl, metadata, schema-parity, image and mobile-performance problems.
- Capture one original sales-team-sourced content asset per month.
- Publish approved pages without Dealer Studio or CMS access.
- Add a stable navigation path from the existing dealership site.
- Ingest GBP discovery and action metrics where Google exposes them.
- Support human-approved GBP posts linked to approved content.
- Connect published content to GA4, XeroFlow measurement, leads and outcomes.
- Productise the workflow so it can be onboarded for other automotive clients.

### 6.2 Success outcomes

- Knox Search Console data refreshes without manual spreadsheet work.
- Every opportunity shows evidence, scoring reasons and lifecycle status.
- Priority vehicle and guide pages are monitored for factual and technical drift.
- Approved content can be published and rolled back entirely from XeroFlow.
- The main website continues operating if XeroFlow publishing or menu services
  are unavailable.
- Monthly reporting distinguishes measured facts, hypotheses, actions and
  outcomes.
- ADME can onboard a second dealer without redesigning the architecture.

## 7. Non-goals and prohibited claims

### 7.1 First-release non-goals

- Dealer Studio or other dealer-CMS integration.
- Moving the existing `www` site behind Cloudflare.
- Publishing under a `www/...` path without explicit origin cooperation.
- Automatically changing website vehicle listings.
- Repairing Dealer Studio templates, main-site vehicle schema, canonical tags or
  main-site sitemaps without explicit origin access.
- Automatically changing Google Ads campaigns, budgets or asset groups.
- Automatically creating tasks from every detected opportunity.
- Autonomous content or GBP publishing.
- Generic high-volume AI blog generation.
- A full internet-scale crawler.
- Automated review-request campaigns.
- Monitoring ChatGPT citations as a guaranteed or complete metric.
- Treating `llms.txt` or another special AI file as a Google Search ranking
  requirement.
- Replacing specialist SEO suites for unrelated enterprise use cases.

### 7.2 Claims XeroFlow must not make

- That PMax has or will improve a conventional keyword Quality Score.
- That schema guarantees Vehicle Carousels, rich results or any search feature.
- That a page will appear in AI Overviews, AI Mode or ChatGPT.
- That sitemap submission guarantees crawling or indexing.
- That structured data is a special requirement for generative AI search.
- That missing API rows mean zero demand.
- That correlation between publication and lead movement proves causation.

The product may show eligibility, observed changes and evidence-backed
associations. It must not present forecasts or eligibility as guaranteed
outcomes.

## 8. Users and permissions

### 8.1 Agency owner or administrator

- Enables the product for a client.
- Manages Google, Cloudflare, DNS and GTM readiness.
- Approves production hostname activation.
- Controls feature flags, retention and tenant configuration.
- Can roll back an edge publication or disable the Menu Agent.

### 8.2 SEO/Search Authority operator

- Reviews Search Console opportunities and health findings.
- Creates tasks from reviewed opportunities.
- Prepares interview questions and content briefs.
- Reviews technical evidence and assigns remediation.
- Cannot publish without the configured approval permission.

### 8.3 Account manager

- Coordinates the monthly dealership interview.
- Reviews brand, offer, locality and client context.
- Creates or links work-management tasks.
- Presents the client-facing monthly summary.

### 8.4 Content editor

- Converts approved source material into a draft.
- Adds citations, source dates, claims and expiry metadata.
- Responds to review feedback.
- Cannot approve their own content unless explicitly permitted by policy.

### 8.5 Approver

- Confirms factual accuracy, brand suitability and required disclaimers.
- Approves an immutable publication version.
- Separately approves a GBP post derived from that content.

### 8.6 Client portal user

- Views a simplified performance and publication summary.
- Reviews content when invited.
- Sees plain-language health status and agreed next actions.
- Does not see raw credentials, internal scoring weights or cross-client data.

### 8.7 System and AI actors

- The system performs scheduled sync, deterministic scoring and health checks.
- AI may explain, summarise and draft from supplied evidence.
- Every AI derivative must retain source references and model/audit metadata.
- AI actors cannot approve, publish, activate or mutate paid campaigns.

## 9. Product surfaces

### 9.1 Agency Search Authority workspace

Proposed route: `/agency/search-authority`

The workspace contains:

1. **Overview** — visibility, clicks, leads, technical health, publishing status
   and material changes.
2. **Opportunities** — ranked, explainable candidates with review and task
   actions.
3. **Queries and pages** — Search Console exploration and comparisons.
4. **Workflow** — tasks, content interviews, reviews, approvals and publication
   lifecycle.
5. **Publishing** — content library, custom hostname, sitemap, menu and GBP
   status.
6. **Connections** — Search Console, GA4, Ads, Merchant Center, GBP, GTM and
   public-hostname readiness.

### 9.2 Client portal

Proposed route: `/portal/search-authority`

The portal shows:

- what buyers searched for;
- pages gaining or losing visibility;
- approved and published content;
- high-level technical health;
- leads and meaningful actions influenced by content;
- current work and next recommended action;
- clear caveats for incomplete or unavailable provider data.

### 9.3 Public content hub

The public hub provides:

- a dealership-branded index;
- individual server-rendered content pages;
- breadcrumb and related-content navigation;
- approved calls to action back to vehicle, finance, service and contact pages;
- canonical metadata, social metadata and accurate JSON-LD;
- XML and image sitemap support;
- accessible, mobile-first layouts;
- a real 404 response for unknown content;
- no dependency on client-side JavaScript for primary content.

## 10. System architecture

### 10.1 Control plane

The existing XeroFlow Nuxt application remains the authenticated control plane.
It owns:

- tenant and client configuration;
- connections and encrypted credential references;
- Search Console sync state;
- opportunities and work-management links;
- source interviews and content versions;
- approvals and publication commands;
- health findings and reporting;
- custom-hostname and Menu Agent configuration.

### 10.2 Public edge publisher

A dedicated Cloudflare Worker acts as the public publishing data plane. It must
be independently deployable from the Agency Dashboard Pages project and must
have an immutable deployment target guard.

The publisher:

- resolves tenant and site by request hostname;
- serves only approved immutable publication snapshots;
- generates or serves HTML, metadata, JSON-LD, sitemap and robots responses;
- serves or proxies approved image assets;
- caches public responses at the edge;
- records bounded operational telemetry without storing public visitor PII in
  logs;
- returns a correct 404 for unknown or unpublished slugs;
- never exposes dashboard APIs, database credentials or unpublished content.

Approved publication snapshots should be stored independently of the mutable
editor record. R2 is the preferred snapshot and asset store; Neon remains the
workflow source of truth. KV may hold small hostname and publication lookup
projections, but must not become the only durable record.

### 10.3 Custom-hostname layer

Cloudflare for SaaS provides custom hostname and certificate management.

As of this PRD's research date, Cloudflare includes 100 custom hostnames on
Free, Pro and Business plans, supports up to 50,000 on pay-as-you-go plans and
lists additional hostnames at US$0.10 each. These are planning inputs rather
than customer pricing guarantees; XeroFlow must keep provider cost assumptions
configurable and revalidate them before packaging.

For Knox, the DNS administrator creates a CNAME from
`learn.knoxgwmhaval.com.au` to the environment-specific SaaS target issued by
XeroFlow during hostname onboarding. The exact target is configuration and must
be displayed and verified by the readiness workflow before cutover.

Production readiness requires all three conditions:

- Cloudflare custom hostname status is active;
- certificate status is active;
- DNS resolves to the configured XeroFlow SaaS target.

Pre-validation should be used where practical to avoid a certificate activation
window during DNS cutover.

### 10.4 Queue and scheduled work

Use scheduled jobs and queues for:

- Search Console backfill and daily refresh;
- GBP performance sync;
- technical health crawling;
- publication rendering and cache invalidation;
- menu and hostname health checks;
- retryable provider work.

Interactive requests must not wait for long-running crawl or sync operations.

## 11. Search Console connection and ingestion

### 11.1 Connection model

Search Console uses a separate, least-privilege Google connection even if the
same operator also connects GA4, Ads or GBP.

Required scope:

`https://www.googleapis.com/auth/webmasters.readonly`

The operator:

1. Connects Google.
2. Selects an accessible property.
3. Maps it to exactly one XeroFlow client/site context.
4. Confirms the expected canonical hostname and optional content hostname.
5. Starts a bounded backfill.

Tokens must use the existing encrypted credential-profile pattern. Permission
loss, token expiry and revoked access must be visible as connection health, not
silently interpreted as zero traffic.

### 11.2 Initial sync policy

- Backfill the previous 90 complete days in bounded chunks.
- Refresh the trailing three days because recent data may be incomplete.
- Sync complete days daily.
- Retain provider metadata identifying incomplete data.
- Paginate up to the API's current row limits without claiming the API returns
  every query.
- Store the provider property, date window, dimensions, aggregation mode and
  sync run for auditability.

### 11.3 Initial warehouse projections

The first release requires:

- daily query + page;
- daily page;
- daily property totals;
- optional device and country breakdowns where useful and within quota;
- clicks;
- impressions;
- CTR;
- average position;
- completeness/provisional state.

Suggested logical tables:

- `gsc_property_maps`;
- `gsc_sync_runs`;
- `gsc_daily_query_page`;
- `gsc_daily_page`;
- `gsc_daily_property`;
- `gsc_url_inspections`;
- `gsc_sync_status`.

Exact physical schemas belong in the implementation plan. Raw access tokens
must never be stored in these tables.

### 11.4 Bounded URL Inspection

Search Analytics measures visibility but does not prove that a priority URL is
currently indexed. For a small, tenant-configured set of important pages,
XeroFlow uses the Search Console URL Inspection API with the same read-only
scope.

The initial inspection set includes:

- newly published XeroFlow guides;
- the homepage and priority inventory/search pages;
- a rotating sample of vehicle detail pages;
- pages with material crawl, canonical or visibility findings.

The result may store Google's indexed verdict, coverage state, robots state,
indexing state, fetch state, last crawl time, selected and declared canonicals,
and known sitemap references. It represents the version in Google's index; it
is not a live indexability test and must be labelled accordingly.

Inspections are scheduled and deduplicated, not run for every URL on every
sync. The scheduler respects provider per-site and per-project quotas,
prioritises new or changed pages, and backs off on quota errors.

### 11.5 Search and AI reporting honesty

Google may expose new search-appearance filters or generative-AI reporting over
time. XeroFlow may ingest a provider field only when the API returns it with a
documented meaning.

If AI Overview or AI Mode-specific data is unavailable through the selected API
or property, the product must display `Not available from Google` rather than
estimating or relabelling ordinary impressions.

Search queries can contain personal data. Before query text is sent to an AI
provider, XeroFlow must apply the platform's privacy, redaction and tenant
access controls.

## 12. Opportunity engine

### 12.1 Deterministic opportunity types

The initial engine may create candidates for:

- high impressions with below-baseline CTR;
- pages or queries in a configurable striking-distance position band;
- sustained click or impression decline;
- material growth that merits expansion or protection;
- queries with no suitable approved content destination;
- local-intent queries not addressed by current dealership content;
- priority model, used-car, finance, towing, hybrid, EV or ownership topics;
- organic queries that could improve a reviewed PMax asset brief;
- published pages with visibility but weak engaged-session or lead behavior.

### 12.2 Explainable score

Scoring is deterministic and versioned. Inputs can include:

- impressions and clicks;
- current position band;
- CTR relative to a defensible baseline;
- trend magnitude and duration;
- client priority make/model/service;
- PMA/local intent;
- content coverage;
- lead or engaged-session evidence;
- recency;
- data completeness;
- duplicate or disqualifying conditions.

Every score must expose its contributing reasons. An AI explanation may make
those reasons easier to read but cannot change the score or underlying metrics.

### 12.3 Opportunity lifecycle

Suggested states:

`new -> under_review -> accepted -> task_created -> in_progress -> published -> measuring -> closed`

Alternative terminal states:

`dismissed`, `duplicate`, `expired`, `not_actionable`

Candidates must deduplicate by tenant, opportunity type, canonical query/page
identity and measurement window. A recurring condition should update or reopen
the existing opportunity according to policy instead of creating monthly
duplicates.

### 12.4 Work-management boundary

Opportunities do not create tasks automatically.

An authorized operator selects `Create task`, reviews the proposed title,
description, evidence, owner and due date, and then creates a normal XeroFlow
task linked back to the opportunity.

## 13. Technical trust monitor

### 13.1 Monitoring scope

The first crawler is bounded, tenant-configured and automotive-aware. It checks:

- public status code and redirect chain;
- robots.txt access;
- meta robots and `X-Robots-Tag`;
- canonical presence and target;
- title, description and primary heading;
- sitemap inclusion;
- soft-404 heuristics;
- structured-data parse errors;
- required and recommended fields for configured schema types;
- visible-content parity for price, mileage, availability and vehicle identity;
- broken internal links on monitored pages;
- image URL accessibility, dimensions, alt text and naming;
- image sitemap coverage where configured, while distinguishing the XeroFlow
  content-host sitemap from an origin-controlled main-site sitemap;
- mobile PageSpeed/Lighthouse results;
- Core Web Vitals from CrUX APIs when sufficient field data exists;
- content-hostname, certificate, menu and publication health.

### 13.2 Page selection

For Knox, monitor:

- the homepage;
- new, demo and used inventory search pages;
- a rotating sample of active vehicle detail pages;
- priority Haval H6 Hybrid, GWM Jolion and Cannon Alpha pages;
- finance, contact and service conversion pages;
- every published XeroFlow content page;
- sitemap and robots endpoints.

The VDP sample must rotate so the system can detect systemic feed/template
problems without crawling every listing on every run.

### 13.3 Field and lab data

Field Core Web Vitals and lab Lighthouse data are different evidence. The UI
must label them separately.

Use the CrUX API or CrUX History API for field data when available. PageSpeed
Insights/Lighthouse may provide lab diagnostics. Insufficient field data is
`Insufficient data`, not a pass.

### 13.4 Findings

Each finding stores:

- tenant and page;
- rule and rule version;
- severity;
- observed and expected value;
- evidence timestamp;
- first seen, last seen and occurrence count;
- status and resolution reason;
- linked task or opportunity;
- whether the condition is provider-, origin-, publication- or configuration-
  controlled.

Repeated identical findings must update the current issue rather than create
notification noise.

### 13.5 Two-stage crawl strategy

Use a normal bounded HTTP fetch first. It is faster, cheaper and shows what a
crawler receives before browser execution.

Escalate to Cloudflare Browser Rendering only when:

- a configured rule requires rendered DOM evidence;
- the raw response indicates client-side rendering;
- visible-content parity cannot be established from the initial HTML;
- or the scheduled Menu Agent check must confirm post-hydration behavior.

Browser checks must have separate quotas, concurrency limits and cache policy.
The finding must identify whether its evidence came from the raw response or
the rendered DOM.

### 13.6 Remediation ownership

Every finding is classified by the system that can resolve it:

- `xeroflow_publisher` — XeroFlow can correct and republish after approval;
- `xeroflow_configuration` — an authorized XeroFlow operator can correct it;
- `gtm_menu_agent` — XeroFlow can release or disable its own script;
- `dealer_origin` — Dealer Studio, the website owner or another origin operator
  must make the change;
- `external_provider` — Google, DNS or another provider controls the condition.

For `dealer_origin` findings, XeroFlow supplies evidence, recommended
remediation and a task/export workflow. It does not inject a replacement
canonical, schema block, image sitemap or vehicle value through GTM and does
not mark the issue resolved until a subsequent check verifies the origin
change.

## 14. Content workflow and governance

### 14.1 Monthly source workflow

The core recurring deliverable is one original content asset per month.

1. Search Console and sales context propose a topic.
2. An operator prepares a short interview brief.
3. A Sales Manager contributes dealership-specific knowledge in approximately
   ten minutes.
4. XeroFlow stores source notes, attribution, date and consent state.
5. AI may produce a clearly labelled draft from the supplied evidence.
6. An editor verifies claims, links and local context.
7. An approver accepts a specific immutable version.
8. XeroFlow publishes that version.
9. The system monitors indexability, engagement and lead outcomes.

### 14.2 Required content evidence

Each publishable asset records:

- topic and target user need;
- source people and source date;
- supporting OEM, government or other authoritative references where needed;
- make, model, variant and geography;
- claim register;
- price, offer and availability status;
- required disclaimer and expiry;
- editor and approver;
- approved version hash;
- publication and supersession state.

Vehicle specifications, towing values, finance statements, warranty terms,
offers and availability must not be inferred from a language model.

### 14.3 Content lifecycle

Suggested states:

`idea -> source_scheduled -> sourced -> drafting -> review -> changes_requested -> approved -> publishing -> published -> superseded -> archived`

Publishing must be idempotent. Repeating a successful publication command must
return the existing result rather than generate another URL or duplicate
version.

### 14.4 Structured data policy

Use only structured data that accurately describes visible page content.

Initial content pages may use:

- `WebPage`;
- `Article` where appropriate;
- `BreadcrumbList`;
- references to the dealership `Organization` or `LocalBusiness`.

Do not use `QAPage` for an editorial page with one dealership-authored answer
and no user-submitted alternative answers. Do not rely on `FAQPage` rich
results; Google stopped showing FAQ rich results in 2026 and is deprecating
that Search Console appearance.

There is no special AI schema. Structured data supports accurate
classification and eligible Search features, not guaranteed AI visibility.

## 15. XeroFlow Edge Publishing

### 15.1 Publication output

Every approved page must produce an immutable snapshot containing:

- complete server-rendered HTML;
- title and meta description;
- canonical URL;
- robots directive;
- Open Graph and social metadata;
- approved JSON-LD;
- breadcrumb and related-content links;
- accessible primary content;
- approved CTA destinations and measurement attributes;
- image references and alt text;
- publication ID, version and timestamps.

The public response must not fetch the primary article body from the dashboard
at browser runtime.

### 15.2 URLs

Initial Knox examples:

- `https://learn.knoxgwmhaval.com.au/`
- `https://learn.knoxgwmhaval.com.au/guides/cannon-alpha-towing-capacity`
- `https://learn.knoxgwmhaval.com.au/guides/haval-h6-hybrid-ownership-questions`

Slugs are stable after publication. A changed title does not silently change
the canonical URL. A deliberate move requires a recorded redirect.

### 15.3 Sitemap and discovery

The publisher supplies:

- `/sitemap.xml`;
- optional image sitemap entries;
- `/robots.txt`;
- hub and related-content links.

The sitemap is submitted through Search Console after the hostname is active.
Sitemap submission improves discovery but is never presented as an indexing
guarantee.

### 15.4 Rollback and removal

- Rollback reactivates a previously approved immutable version.
- Unpublishing requires an explicit reason and correct HTTP/canonical behavior.
- A permanently removed page returns `410 Gone` or redirects only when a
  relevant replacement exists.
- Legal or factual emergency removal is owner/admin only and audited.
- Publication rollback does not alter source evidence or approval history.

## 16. XeroFlow Menu Agent

### 16.1 Bootstrap

GTM contains a minimal Custom HTML tag that loads a versioned XeroFlow script.
The script and its configuration remain XeroFlow-owned.

The tag must:

- use a pinned versioned URL;
- load asynchronously without blocking the dealership page;
- run only on configured production hostnames;
- fail silently and leave the existing site untouched;
- avoid embedding credentials or unpublished content.

### 16.2 Runtime behavior

The Menu Agent:

- starts after the configured page-load condition and rechecks idempotently
  through hydration and supported rerenders;
- resolves an approved hostname configuration;
- finds configured desktop and mobile navigation anchors;
- inserts one accessible `<a href>` link using a normal crawlable URL;
- avoids duplicate insertion;
- observes bounded DOM changes so the link survives SPA navigation or menu
  rerendering;
- records health and click telemetry without collecting unnecessary personal
  data;
- removes or disables only its own marked elements.

The current Knox markup contains usable navigation classes, but generated CSS
module names can change after a website deployment. Configuration should prefer
stable structural selectors and anchor relationships, with multiple reviewed
fallback selectors.

### 16.3 Safety

- No `innerHTML` assignment using untrusted configuration.
- Menu label and URL are validated against a bounded schema.
- Allowed destinations are restricted to the configured client hostname.
- Mutation observation is scoped and rate-limited.
- Failure to find a selector is a health finding, not a reason to modify an
  arbitrary page element.
- A global kill switch and client-specific kill switch are required.

Google can discover a JavaScript-inserted link when it appears in rendered HTML,
but the public hub must not depend only on that link. Its sitemap, hub navigation
and approved external/GBP links provide additional discovery paths.

## 17. Google Business Profile

### 17.1 Activation status

XeroFlow already contains a GBP connection and publishing provider, but the
production feature remains dormant behind
`GOOGLE_BUSINESS_PUBLISHING_ENABLED=false`.

Activation is a parallel operational track, not an assumed completed
dependency. It requires:

- Google Business Profile API approval and usable quota;
- production OAuth credentials;
- the `business.manage` scope;
- authorized account/location mapping;
- account reconnection after approval;
- read-only and low-risk publishing smoke tests;
- explicit production feature-flag activation.

### 17.2 GBP performance ingestion

Add the Business Profile Performance API as a read-only source for:

- supported daily location metrics;
- supported monthly search-keyword impressions;
- provider thresholds or suppressed counts;
- sync and permission health.

The UI must preserve Google's granularity. A monthly keyword metric must not be
displayed as a daily value. Thresholded results must not be converted into an
invented exact count.

### 17.3 Publishing workflow

An approved content page may produce a proposed GBP post containing:

- approved copy;
- approved image;
- CTA type;
- destination URL with measurement parameters;
- target location;
- proposed publication time;
- source publication version.

GBP publication requires a separate human approval. Editing the source content
after approval invalidates an unpublished derivative until it is reviewed
again.

## 18. Organic, paid and lead alignment

### 18.1 Measurement chain

Track:

`query/page evidence -> opportunity -> task/content -> publication -> session -> CTA -> confirmed lead -> qualified/won/lost outcome`

Required identifiers should link:

- Search Console page URL;
- content publication and version;
- GA4 landing page/session evidence;
- XeroFlow first-party page and CTA events;
- GBP post or action where available;
- canonical lead and opportunity;
- paid campaign/asset recommendation where an operator creates one.

### 18.2 Cross-subdomain measurement

Before production:

- verify GA4 and XeroFlow tracking on the content hostname;
- preserve relevant campaign parameters when moving between `learn` and `www`;
- ensure subdomain navigation does not create false self-referrals or split
  sessions;
- test consent behavior on both hosts;
- test confirmed-lead attribution, not only button clicks.

### 18.3 Paid-media boundary

Search Console queries may be proposed as evidence for:

- PMax asset-group copy;
- landing-page alignment;
- creative briefs;
- negative or exclusion research;
- content-to-campaign hypotheses.

An operator must review and explicitly create the relevant brief or task.
Search Authority never mutates a live campaign directly.

## 19. Data model boundaries

The implementation plan should refine the following logical domains:

### 19.1 Connections and sync

- GSC connection/profile reference.
- Client-to-property mapping.
- Sync run, cursor, window and completeness.
- GBP location mapping and performance sync.

### 19.2 Evidence and opportunities

- Normalised daily query/page facts.
- Page facts.
- Opportunity and score version.
- Opportunity evidence snapshots.
- Lifecycle events and task links.

### 19.3 Content and publishing

- Content item.
- Source evidence and claim register.
- Draft/version.
- Approval.
- Publication command and immutable snapshot.
- Hostname mapping.
- Menu configuration.
- Redirect and rollback history.

### 19.4 Trust health

- Monitored target.
- Check definition and version.
- Check run.
- Finding and evidence.
- Resolution, suppression and linked task.

All tenant-owned rows require tenant/client isolation consistent with existing
XeroFlow authorization. Public hostname resolution exposes only published
projections.

## 20. Error handling and operational behavior

### 20.1 Provider sync

- Exponential backoff with bounded retries for retryable failures.
- Explicit permanent states for revoked permission or missing property.
- Idempotent windows and upserts.
- Last success, last attempt, data-through date and provisional window shown in
  the UI.
- Stale data remains visible with a warning rather than disappearing.

### 20.2 Publishing

- Validate approval version before publication.
- Render before activating the public version.
- Verify the public URL after activation.
- Retain the prior active snapshot until verification succeeds.
- Roll back automatically only to the previously verified snapshot when the
  new snapshot cannot be served.
- Never roll back editorial state or approval history automatically.

### 20.3 Public runtime

- Unknown tenant or hostname: safe 404.
- Known hostname but missing publication: branded 404.
- KV projection unavailable: use a bounded durable fallback or fail closed.
- Dashboard unavailable: continue serving the last approved cached snapshot.
- Menu configuration unavailable: do nothing to the dealership site.

### 20.4 Monitoring noise

- Coalesce identical findings.
- Use severity and client-specific thresholds.
- Notify only on state transition or material worsening.
- Apply quiet hours and existing notification preferences where appropriate.

## 21. Security, privacy and tenancy

- Use least-privilege provider scopes.
- Encrypt OAuth refresh tokens through existing credential profiles.
- Never send provider credentials to the browser.
- Block SSRF in all configurable URL fetches, including redirects and DNS
  rebinding protections.
- Restrict crawl targets to verified client-owned hosts and approved paths.
- Apply response-size, content-type and timeout limits.
- Treat fetched page content and search queries as untrusted input.
- Sanitize public HTML and disallow arbitrary editor scripts.
- Use a strict Content Security Policy on XeroFlow-published pages.
- Keep public publishing endpoints separate from authenticated dashboard APIs.
- Preserve an immutable audit trail for approval, publish, rollback and GBP
  actions.
- Redact personal data before AI processing.
- Do not expose another tenant's queries, content, benchmarks or outcomes.
- Rate-limit public and administrative endpoints independently.

## 22. Reporting

### 22.1 Agency reporting

Show:

- GSC data freshness and coverage;
- clicks, impressions, CTR and position trends;
- material query and page movers;
- opportunity funnel and task status;
- trust findings by severity and owner;
- publication history and health;
- GBP performance and publishing status;
- content engagement and confirmed lead outcomes;
- paid/organic evidence links;
- data caveats and provider limitations.

### 22.2 Client reporting

Use plain language:

- `More people found...`
- `Visibility declined for...`
- `We published...`
- `The following technical issue is being worked on...`
- `This content contributed to...`

Avoid vanity dashboards that present every fluctuating query or health rule.
The client view prioritises material changes and agreed actions.

### 22.3 AI and generative-search reporting

Only display a dedicated AI-search metric when a named provider supplies a
documented field. Otherwise report:

- crawl/index eligibility;
- ordinary search visibility;
- content and entity consistency;
- observed referral traffic where identifiable;
- citations or mentions only when collected through a defensible, reproducible
  method.

## 23. Delivery sequence

This PRD defines product sequence, not the file-by-file implementation plan.

### Implementation status — 31 July 2026

Phase 0–1 is implemented behind global and client entitlement gates:

- site readiness, Search Console OAuth and verified-property mapping;
- encrypted, purpose-bound credential reuse;
- initial 90-day and trailing scheduled ingestion with provider completeness;
- bounded indexed-version URL Inspection;
- deterministic, explainable opportunity scoring and lifecycle;
- explicit manual task creation and atomic task linking;
- agency evidence workspace and privacy-reduced client portal summary.

Still deferred and not represented as complete:

- the Phase 2 technical crawler and browser-rendered trust monitor;
- edge content publishing, custom hostnames, sitemap submission and rollback;
- the GTM Menu Agent or any dealer-menu modification;
- Google Business Profile performance ingestion or publishing;
- autonomous content creation, task creation, website changes or publishing.

### Phase 0 — Pilot readiness

- Confirm Knox client and site mapping.
- Confirm Search Console access and property type.
- Confirm GA4 and Google Ads mappings.
- Confirm GTM publish access.
- Confirm DNS administrator and ability to create `learn` CNAME/TXT records.
- Check existing CAA records and certificate-validation compatibility before
  custom-hostname activation.
- Confirm GBP API approval/quota status.
- Record live baseline and current known inconsistencies.
- Create tenant feature flags and kill switches.

### Phase 1 — Search Console evidence loop

- Add least-privilege GSC connection and property selection.
- Build 90-day backfill and scheduled refresh.
- Add bounded URL Inspection for priority, newly published and changed pages.
- Add query/page warehouse and data-health UI.
- Implement deterministic opportunity candidates.
- Add review, dedupe, lifecycle and manual `Create task`.
- Add agency overview and first client summary.

### Phase 2 — Technical trust monitor

- Add verified-target inventory.
- Implement bounded page fetch and SSRF protection.
- Add crawl, canonical, schema, visible-parity, image and soft-404 checks.
- Add mobile lab testing and correctly labelled field data.
- Add finding lifecycle, task creation and monitoring health.
- Establish Knox priority and rotating VDP sample.

### Phase 3 — Content and edge publishing

- Add source interview, claim and approval workflow.
- Add immutable publication rendering and rollback.
- Deploy the dedicated public edge publisher.
- Configure Cloudflare for SaaS.
- Activate and verify `learn.knoxgwmhaval.com.au`.
- Publish hub, sitemap, robots and first approved guide.
- Add measurement and lead attribution.

### Phase 4 — Menu and GBP

- Deploy the versioned GTM Menu Agent.
- Verify desktop, mobile and SPA navigation behavior.
- Add menu health and kill switches.
- Ingest GBP performance data.
- Complete GBP activation prerequisites.
- Enable separately approved GBP content promotion.

### Phase 5 — Productisation

- Package client onboarding and readiness.
- Add reusable automotive templates and monitoring profiles.
- Add portfolio-level agency health.
- Validate a second automotive client.
- Define support, retention, pricing and service-level policies.

## 24. Knox pilot acceptance criteria

### 24.1 Connection and data

- An authorized user can connect and map the correct Search Console property.
- A 90-day backfill completes or exposes a precise partial/failure state.
- Daily refresh is idempotent.
- The UI displays data-through and provisional dates.
- Revoked access is not shown as zero traffic.
- Priority URL inspections expose the indexed-version timestamp and verdict
  without presenting them as a live indexability test.

### 24.2 Opportunities

- At least the defined deterministic opportunity types are generated from test
  fixtures and Knox data where applicable.
- Every candidate shows evidence and score reasons.
- Duplicate syncs do not create duplicate opportunities.
- No task is created without an explicit operator action.
- A created task links back to its evidence.

### 24.3 Technical trust

- The monitor correctly identifies status, robots, canonical, sitemap, schema
  and visible-parity fixtures.
- It distinguishes lab performance from field Core Web Vitals.
- It reports insufficient field data honestly.
- Repeated unchanged failures update one finding.
- The current Knox schema/value mismatch class is detectable.
- Findings identify whether XeroFlow, the dealer origin or an external provider
  owns the remediation.

### 24.4 Publishing

- The custom hostname and certificate are active before public launch.
- Primary page content is present in the initial HTML response.
- Unknown slugs return a real 404.
- Canonical, title, description, Open Graph and JSON-LD match the approved
  version.
- Sitemap contains the published URL.
- A publication can be rolled back to the previous verified version.
- Dashboard downtime does not remove the last published page.

### 24.5 Menu

- The main site is unchanged when the Menu Agent is disabled or unavailable.
- Exactly one menu link appears on configured desktop and mobile navigation.
- The link remains after a supported client-side navigation/rerender.
- Selector failure produces a health finding without arbitrary DOM mutation.
- The link is a normal accessible `<a href>` to the approved content hostname.

### 24.6 Measurement and reporting

- A guide visit and CTA action appear in the agreed GA4/XeroFlow reporting.
- Navigation between `learn` and `www` does not create a false self-referral in
  the tested flow.
- A confirmed test lead retains the publication/landing-page attribution.
- Client reporting distinguishes facts, recommendations and unavailable data.

### 24.7 Governance

- No content or GBP post publishes without a human-approved immutable version.
- Editing approved source content invalidates a not-yet-published derivative.
- Every publish, rollback and GBP action has actor, time, source version and
  result.
- AI-generated copy is traceable to its sources and cannot invent provider
  metrics.

## 25. Pilot measures

Measure, but do not guarantee:

- connection and sync reliability;
- indexed/crawlable published pages;
- technical finding resolution time;
- opportunity-to-task and task-to-publication cycle time;
- Search Console visibility and click changes;
- content engagement;
- CTA and confirmed lead contribution;
- GBP discovery and action changes where available;
- paid brief recommendations informed by organic evidence;
- account-team time saved;
- successful onboarding effort for the second dealer.

The first 90 days establish a baseline. Ranking or lead improvement is not an
acceptance dependency because both are influenced by external systems and
market conditions.

## 26. Dependencies

- Google Search Console API project, OAuth consent and credentials.
- Search Console property access.
- Knox/ADME authorization for GA4, Ads and site reporting.
- GTM container publish access.
- DNS access for the custom hostname and validation records, including any CAA
  compatibility change required by the selected certificate authority.
- Cloudflare for SaaS configuration under a XeroFlow-controlled zone.
- GBP API approval and non-zero quota before GBP activation.
- Sales Manager availability and permission to use supplied knowledge.
- Approved brand, disclaimer and claims policy.
- A dedicated edge publishing deployment target and operational runbook.

## 27. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Next.js deployment changes menu selectors | Stable structural selectors, fallback selector sets, bounded observer, health check and kill switch |
| GSC rows are sampled, limited or withheld | Preserve provider limitations, page correctly, show completeness and never interpret missing as zero |
| Search queries contain personal data | Tenant permissions, redaction and no uncontrolled AI forwarding |
| Content contains stale specifications or offers | Claim register, source dates, expiry, human approval and supersession workflow |
| Subdomain lacks discovery | Hub links, XML sitemap, rendered menu link, GBP links and Search Console submission |
| Public publisher outage | Edge cache and last approved snapshot; no dependency on dashboard runtime |
| Wrong tenant content served | Hostname allowlist, tenant-scoped lookup projection and integration tests |
| DNS/certificate cutover causes downtime | Pre-validation and readiness gate before activation |
| GBP access remains blocked | Treat as parallel dependency; ship GSC, trust and content work independently |
| PageSpeed/CrUX quota or insufficient data | Bounded schedule, caching and explicit unavailable/insufficient states |
| Reporting overstates AI visibility | Provider-named metrics only; no synthetic AI impression count |
| Reverse-proxy idea reappears during delivery | This PRD rejects whole-site proxying for the pilot; architecture change requires a new reviewed decision |

## 28. Future extensions

- Same-host `www/...` publishing after explicit Vercel route cooperation.
- Interactive finance, towing or ownership tools using Web Components.
- Automated content refresh proposals when source facts expire.
- Broader GBP review and local-search workflows.
- More technical crawler rules and browser-rendered visual checks.
- Entity-consistency comparisons across site, GBP, Merchant Center and ads.
- Portfolio benchmarks using privacy-safe aggregated data.
- Reproducible monitoring of named AI referral/citation sources when provider
  methods are sufficiently stable.
- Approved campaign-brief creation from organic opportunities.

## 29. Research record

The architectural decision is based on current primary documentation reviewed
on 2026-07-31:

- [Cloudflare for SaaS plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/)
- [Cloudflare for SaaS custom-hostname setup](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/)
- [Cloudflare Workers routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/)
- [Cloudflare Snippets](https://developers.cloudflare.com/rules/snippets/)
- [Vercel guidance on Cloudflare in front of Vercel](https://vercel.com/kb/guide/cloudflare-with-vercel)
- [Vercel external rewrites](https://vercel.com/docs/routing/rewrites)
- [React hydration requirements](https://react.dev/reference/react-dom/client/hydrateRoot)
- [Next.js hydration mismatch guidance](https://nextjs.org/docs/messages/react-hydration-error)
- [Google JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google crawlable-link guidance](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
- [Google Search Console Search Analytics API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
- [Google Search Console URL Inspection API](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect)
- [Google Search Console API usage limits](https://developers.google.com/webmaster-tools/limits)
- [Google Business Profile Performance API](https://developers.google.com/my-business/reference/performance/rest)
- [Google structured-data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google generative-AI search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Google PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started)
- [Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle)
- [MDN Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)
- [MDN XHTML](https://developer.mozilla.org/en-US/docs/Glossary/XHTML)
- [htmx documentation](https://htmx.org/docs/)

## 30. Written-spec review gate

This PRD is the proposed umbrella product design expressed as a written
implementation contract. This pull request is the stakeholder review gate.
Detailed file-level tasks, migrations, tests and rollout commands must not be
planned until the PRD is approved.

The product is intentionally decomposed. It must not become one monolithic
implementation plan. After approval, the next artifacts are:

1. a concise cross-phase implementation roadmap;
2. a detailed, executable plan for Phase 0 and Phase 1;
3. separate implementation plans for later phases after the preceding phase is
   verified and any new provider evidence is incorporated.

Each detailed implementation plan:

- decomposes the phases into independently verifiable vertical slices;
- identifies exact files, migrations, APIs, tests and feature flags;
- preserves the current dirty worktree and unrelated user changes;
- includes database migration execution;
- includes public feature-page updates;
- includes browser, integration, security and deployment verification;
- follows the repository's guarded Cloudflare deployment process.
