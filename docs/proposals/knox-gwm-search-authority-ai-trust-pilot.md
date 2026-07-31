# Knox GWM Search Authority & AI Trust Pilot

**Prepared for:** Knox GWM Haval, Burwood Highway

**Client website:** <https://www.knoxgwmhaval.com.au>

**Prepared by:** [CEO name], CEO, XeroFlow

**Agency partner:** ADME Advertising

**Target market:** Melbourne Outer East PMA

**Proposal date:** [Insert date]

**Decision requested by:** [Insert date]

## Proposal in one sentence

Use Knox GWM as the design client for a XeroFlow-managed Search Authority and AI
Trust pilot that turns existing search, advertising and dealership knowledge
into a measurable, repeatable operating system—without requiring Dealer Studio
or dealership CMS access.

## Why this matters now

Vehicle research increasingly begins before a buyer visits a dealership
website. Prospective customers use Google Search, AI Overviews, AI Mode and
assistants such as ChatGPT to compare models, ownership questions, finance,
towing capability and local dealers.

ADME already manages important parts of this journey through Google Ads,
Performance Max, Merchant Center and GA4. The missing layer is a governed way
to:

- understand the organic questions local buyers are actually asking;
- detect technical issues that make pages harder to crawl, interpret or trust;
- capture original dealership knowledge and turn it into useful approved
  content;
- publish that content without depending on Dealer Studio;
- connect organic visibility, paid-media recommendations and lead outcomes in
  one XeroFlow workflow.

This pilot is designed to close that gap.

## What we propose

### 1. Search Console intelligence

Connect Knox GWM's Google Search Console property to XeroFlow using read-only
access. XeroFlow will import a 90-day baseline, refresh recent data and surface
evidence-backed opportunities such as:

- high-impression searches with weak click-through;
- model and ownership questions with no strong content destination;
- local-intent searches relevant to the Outer East PMA;
- growing or declining pages that warrant action;
- organic evidence that can inform a reviewed PMax asset brief.

Priority URLs will also receive bounded Google URL Inspection checks so the
team can see Google's indexed-version status, last crawl information and
canonical selection. These checks do not guarantee indexing.

### 2. Technical trust monitoring

XeroFlow will monitor a controlled set of dealership, inventory, vehicle and
published guide pages for:

- crawl and status-code problems;
- robots, canonical, sitemap and soft-404 issues;
- structured-data errors and vehicle-value mismatches;
- image accessibility, alt text and naming fundamentals;
- mobile lab performance and field Core Web Vitals where enough data exists;
- the health of the XeroFlow content hostname and menu link.

The monitor will identify who can fix each issue. XeroFlow can repair its own
publisher and configuration. Dealer Studio or origin-controlled issues will be
documented with evidence and a recommended action; XeroFlow will not disguise
or overwrite them through GTM.

### 3. Original monthly content

Each month, ADME will run a short Sales Manager interview focused on a real
customer question—for example:

- Cannon Alpha towing capability;
- Haval H6 Hybrid ownership questions;
- GWM Jolion comparisons;
- new-car finance in Knox;
- buying and servicing a used vehicle in Melbourne's Outer East.

XeroFlow will retain the source, claims, approvals and publication history.
AI may help transcribe and prepare a draft, but it cannot invent specifications,
approve claims or publish by itself.

### 4. XeroFlow-owned publishing

Approved guides will be published at:

`https://learn.knoxgwmhaval.com.au`

The content hub will be operated by XeroFlow on Cloudflare infrastructure. It
will provide server-rendered HTML, metadata, structured data, a sitemap,
monitoring, version history and rollback.

Knox's domain administrator will make one bounded DNS change for the `learn`
subdomain. The existing website remains on its present platform. We will not
put a proxy in front of the whole Knox site and will not require Dealer Studio
access.

### 5. A safe main-menu link

The existing Google Tag Manager container will load a small, versioned XeroFlow
Menu Agent. Its only job is to add one accessible `Buying Guides` link to the
approved desktop and mobile navigation.

The agent is designed to survive normal Next.js page hydration and rerenders,
avoid duplicate links and fail safely. If it is unavailable or disabled, the
main dealership website continues to operate normally.

### 6. Google Business Profile

Where Google's production access and quota are available, XeroFlow will ingest
supported Google Business Profile performance data. A separately approved GBP
post may promote an approved guide.

GBP activation is a gated track. No post will publish autonomously, and the
pilot can proceed with Search Console, monitoring and content publishing if GBP
access remains pending.

## What stakeholders will see

The pilot will provide:

- an agency Search Authority workspace in XeroFlow;
- a simplified client-facing performance summary;
- Search Console connection and data-health status;
- explainable opportunities with evidence and lifecycle;
- technical findings with ownership and recommended remediation;
- governed content drafts, approvals, publication and rollback;
- organic-to-engagement and lead attribution where consent and evidence permit;
- a monthly summary that separates measured facts, recommendations,
  unavailable data and next actions.

## What success looks like

The pilot is successful when:

- Search Console data refreshes reliably without spreadsheet handling;
- the team can move an evidence-backed opportunity into a normal XeroFlow task;
- priority pages are monitored and technical findings do not create duplicate
  noise;
- the first Sales Manager-sourced guide is approved and published on the Knox
  content hostname;
- the Buying Guides link works on supported desktop and mobile navigation;
- a guide visit, call-to-action and test lead can be traced through the agreed
  reporting;
- no content or GBP action publishes without human approval;
- XeroFlow can onboard a second automotive client without redesigning the
  platform.

The first 90 days establish the baseline. Rankings, AI citations, rich results,
lead volumes and lower media costs are influenced by external systems and are
measured outcomes—not guarantees.

## Delivery approach

### Stage 0 — Readiness

Confirm Knox mappings and access for Search Console, GA4, Ads, GTM and DNS;
record the current baseline; and establish feature flags and kill switches.

### Stage 1 — Search evidence

Deliver Search Console ingestion, data health, priority URL inspection,
explainable opportunities and manual task creation.

### Stage 2 — Technical trust

Deliver bounded monitoring across priority pages, rotating vehicle samples and
the future content hostname.

### Stage 3 — Content and publishing

Deliver the interview-to-approval workflow, activate
`learn.knoxgwmhaval.com.au`, and publish the first approved guide.

### Stage 4 — Menu and GBP

Activate the menu link, complete measurement verification and enable GBP
reporting or separately approved publishing when Google's prerequisites are
met.

### Stage 5 — Productisation

Turn the validated Knox workflow into reusable onboarding, templates,
monitoring profiles and reporting for other ADME automotive clients.

Detailed timing will be set in the implementation roadmap after stakeholder
approval and completion of the readiness checks.

## Responsibilities

**XeroFlow**

- Build and operate the product workflow, publisher and monitor.
- Protect tenant data and provider credentials.
- Maintain versioning, approvals, audit history and rollback.
- Report platform health and evidence honestly.

**ADME Advertising**

- Own the client relationship and monthly operating cadence.
- Interpret opportunities and decide which become work.
- Conduct the Sales Manager interview and coordinate approvals.
- Review organic evidence before using it in paid-media briefs.

**Knox GWM**

- Authorize the required read-only data access.
- Provide a Sales Manager for the short monthly source interview.
- Approve dealership claims, brand treatment and required disclaimers.
- Arrange the bounded DNS and GTM changes through an authorized administrator.
- Coordinate any Dealer Studio/origin remediation outside XeroFlow's control.

## Commercial position for CEO confirmation

The current service summary states **$750 + GST per month with no lock-in**.
Before this proposal is issued, the CEO should select and document one of these
positions:

1. **Design-client investment:** retain the $750 + GST monthly fee while
   XeroFlow funds the initial product build in exchange for active pilot
   participation, timely access and structured feedback.
2. **Setup plus retainer:** add a one-off implementation fee for connection,
   hostname and pilot configuration, followed by the $750 + GST monthly
   operating retainer.
3. **Revised pilot fee:** replace the original commercial terms with a
   time-bounded pilot price that explicitly includes build, operation and
   evaluation.

**Selected commercial position:** [CEO to complete]

**One-off setup fee, if any:** [CEO to complete]

**Monthly fee:** [CEO to complete]

**Initial evaluation period:** [CEO to complete]

**Cancellation and transition terms:** [CEO to complete]

No implementation cost, third-party fee or operational commitment should be
presented as included until this section is completed and approved.

## Decisions requested

Stakeholders are asked to approve:

- Knox GWM as the design client;
- the `learn.knoxgwmhaval.com.au` publishing model;
- read-only Search Console connection and agreed GA4/Ads measurement mapping;
- a bounded GTM Menu Agent deployment;
- the monthly Sales Manager sourcing and human-approval workflow;
- the stated division between XeroFlow-controlled and Dealer
  Studio/origin-controlled remediation;
- the selected commercial position;
- detailed planning for Readiness and Stage 1.

## Important boundaries

- No Dealer Studio or dealer-CMS integration is required for the pilot.
- GTM adds the menu link; it does not manufacture indexable pages or inject
  vehicle schema.
- Schema, sitemaps and submitted URLs improve machine readability and
  discovery but do not guarantee crawling, indexing or a search feature.
- Google does not require special “AI schema” for AI Overviews or AI Mode.
- XeroFlow will not report synthetic AI impression counts when Google does not
  provide a documented metric.
- AI assists with evidence-bound drafting; people approve every publication.
- Paid-media changes remain reviewed actions, not automatic consequences of an
  organic signal.

## Recommended CEO message

> We are proposing Knox GWM as the design client for a practical Search
> Authority and AI Trust capability inside XeroFlow. The pilot uses the data and
> workflows ADME already manages, adds Search Console intelligence and
> technical trust monitoring, and gives us a controlled way to publish
> dealership-sourced buying guides without relying on Dealer Studio. It is
> deliberately approval-led: AI can assist with analysis and drafting, but
> people remain responsible for claims, publishing and campaign decisions. The
> goal is to prove a measurable operating model at Knox, then package it for
> other automotive clients.

## Approval

**CEO approval:** [Name / date]

**ADME stakeholder approval:** [Name / date]

**Knox GWM approval:** [Name / date]

**Notes or amendments:** [Insert]
