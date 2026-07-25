# 360 Intelligence Push-Pull Analytics Architecture

## Status

Approved direction. Phase 1 behavioral read model started.

## Objective

Turn portal analytics into an interactive intelligence surface connected to the 360 lakehouse. The dashboard should explain what audiences do, where they do it, which market ideas and trends are associated with outcomes, and how behavior progresses into confirmed leads, CRM stages, appointments, sales, and revenue.

The page must not synchronously query Google, Meta, GA4, news providers, marketplace systems, or other external platforms. It pulls tenant-safe projections produced by the platform.

## Architectural principle

The platform operates as a controlled feedback loop:

```text
Sources push observations
  -> identity, consent, taxonomy, and evidence processing
  -> operational and analytical projections
  -> portal, agency, AI, and MCP consumers pull projections
  -> approved actions are activated
  -> outcomes push back into the lake
```

The 360 lake is not one undifferentiated pool. It has governed planes with different authority and access rules.

## Data planes

### Tenant identity and journey plane

- Client-scoped anonymous, session, browser-event, lead, CRM, and Persona identities.
- Consent, purpose, suppression, merge, split, and provenance records.
- First-touch, last-touch, campaign, page, product, and interaction history.
- Never shared as identifiable records across clients.

### Behavioral event plane

- First-party page, engagement, scroll, click, form, product, vehicle, and conversion events.
- GA4 sessions and dimensions as a reconciled external view.
- Device, page, source, campaign, geography, product, and event-sequence features.

### Commercial outcome plane

- Provider-confirmed leads.
- CRM contact, qualification, appointment, opportunity, won, lost, value, and response-time events.
- Inventory, product, offer, and sale outcomes.
- Canonical lead and sale counts come from confirmed operational systems, not inferred browser events.

### Shared industry intelligence plane

- Google Trends and public market datasets.
- Automotive news MCP claims, events, and knowledge graph.
- Marketplace demand, inventory, pricing, and time-to-sale aggregates.
- Social momentum and privacy-safe portfolio benchmarks.
- Released aggregate signals only; no cross-client Persona identities.

### Feature and projection plane

- Materialized page-behavior summaries.
- Device and source outcome summaries.
- Journey and funnel path summaries.
- Product and vehicle interest summaries.
- Persona and cohort feature snapshots.
- Trend-to-outcome associations.
- Benchmark and crossover opportunity projections.

## Data authority

The same metric must not have competing meanings:

- First-party tracking is authoritative for detailed on-site behavior captured by the XeroFlow script.
- GA4 is a reconciled source for broader traffic, acquisition, and platform comparison.
- Provider-confirmed lead ingestion is authoritative for accepted leads.
- CRM lifecycle is authoritative for contacted, qualified, appointment, won, lost, and value outcomes.
- Product feeds, DMS, and marketplace records are authoritative for stock and listing state according to their source policy.
- News and trends are contextual evidence, not operational truth.

Every read model should expose source authority, freshness, coverage, and known exclusions.

## Push paths

### Hot path

Target latency: seconds to five minutes.

- First-party events.
- Consent changes.
- Submission intents.
- Confirmed lead webhooks.
- CRM lifecycle events.
- Product availability changes when operationally required.

### Warm path

Target latency: 15 to 60 minutes.

- Google and Meta campaign metrics.
- GA4 reconciliation.
- Marketplace demand aggregates.
- Inventory and listing lifecycle projections.
- Social engagement.

### Cold path

Target latency: daily or scheduled.

- Portfolio benchmarks.
- News knowledge graph indexing.
- Google Trends and public datasets.
- Composite indices, crossovers, forecasts, and model backtests.

Freshness must be visible. A cold signal cannot be presented as live.

## Pull paths

Portal, agency, AI, mobile, and MCP consumers query stable read APIs. They do not scan raw events or invoke external providers during a user request.

Recommended projections:

- `page_behavior_daily`
- `device_behavior_daily`
- `source_behavior_daily`
- `journey_path_daily`
- `funnel_transition_daily`
- `product_interest_daily`
- `vehicle_interest_daily`
- `persona_journey_features`
- `lead_outcome_daily`
- `trend_outcome_associations`
- `client_peer_benchmarks`
- `crossover_opportunities`

Phase 1 can query tenant-scoped operational tables directly. High-volume production use should move to incrementally refreshed projections without changing the portal API contract.

## Portal behavior explorer

### Top pages

Selecting a page should show:

- Visitors, sessions, page views, and engagement.
- Scroll depth and average engagement time.
- Devices, sources, campaigns, and landing paths.
- Product or vehicle views.
- Calls, form starts, submissions, and confirmed leads.
- Qualified, appointment, won, and lost outcomes.
- Entry, next-page, exit, and common sequence patterns.
- Associated released market topics and trends.

### Devices

Selecting mobile, desktop, or tablet should show:

- Pages and products viewed.
- Source and campaign mix.
- Engagement and scroll quality.
- Calls, submissions, confirmed leads, and stage outcomes.
- Conversion latency and abandonment points.
- Technical or UX anomalies where evidence supports them.

### Sources

Selecting a source should show:

- Landing pages and subsequent paths.
- Device and geography mix.
- Campaign and creative attribution.
- Engagement, intent, confirmed leads, quality, sales, and value.
- First-touch, last-touch, and assisted contribution.

### Funnel

Selecting a stage should show:

- Previous and next events.
- Time between stages.
- Page, device, source, campaign, product, and cohort contribution.
- Abandonment and reconciliation gaps.
- Confirmed operational outcomes separately from browser intent.

## Knowledge associations

Knowledge intelligence attaches to dashboard outcomes through released taxonomy and time-window associations, not by embedding news text directly into event rows.

Example:

```text
Observed behavior:
  EV model-page engagement increased on mobile in Melbourne.

Released context:
  Search interest increased.
  Marketplace saves increased.
  Multiple independent sources reported a model launch.
  Local inventory became available.

Permitted recommendation:
  Draft an EV mobile landing-page and campaign experiment for review.
```

Associations must expose evidence, confidence, freshness, geography, taxonomy, methodology version, and whether they are observed, computed, or forecast.

## GA4 reconciliation

GA4 and first-party tracking should be married through a reconciliation layer:

- Normalize page, source, medium, campaign, device, and date taxonomy.
- Compare sessions, users, engagement, and conversions within documented tolerances.
- Explain consent, blocker, timezone, attribution, and event-definition differences.
- Retain provider-native dimensions that first-party tracking does not capture.
- Do not add GA4 leads to first-party or provider-confirmed leads.
- Publish discrepancy and coverage metrics instead of silently blending totals.

## Privacy and tenancy

- Raw journeys and Persona features remain client scoped.
- Shared trends use thresholded, opted-in aggregates.
- Sensitive and direct-marketing attributes require purpose-specific policy.
- Dashboard queries inherit portal client scope.
- Provider-native leads without a website journey are excluded from page/device behavior rather than guessed.
- Small cohorts and cross-client outliers must be suppressed.
- AI and MCP retrieve only authorized projections and released evidence.

## Activation loop

Insights may create:

- Draft research findings.
- Draft briefs and content.
- Draft audience or campaign experiments.
- Draft CRM workflows.
- Receptionist knowledge updates.

Budget changes, audience activation, publishing, outbound contact, and operational knowledge changes remain approval gated. Results push back as experiment, campaign, lead, appointment, sale, and revenue outcomes.

## Phase 1 implementation

- Add a tenant-scoped behavioral outcomes endpoint for page, device, and source.
- Join form intent to confirmed leads through `lead_submission_intents.browser_event_id`.
- Keep provider-native leads separate when no website journey exists.
- Add an interactive portal behavior explorer.
- Preserve existing headline cards and funnel.
- Do not introduce live provider calls.

## Later phases

### Phase 2

- Add cross-dimension filtering and journey sequences.
- Add form starts, exits, next pages, product/SKU, vehicle, campaign, geography, and latency.
- Move high-volume queries to incremental daily/hourly projections.

### Phase 3

- Add GA4 reconciliation and discrepancy reporting.
- Add campaign and creative joins.
- Add lead quality, appointment, sale, and revenue outcomes.

### Phase 4

- Attach released news, search, marketplace, inventory, benchmark, and crossover signals.
- Add cited evidence drawers and confidence labels.

### Phase 5

- Add AI explanations, draft experiments, mobile views, and authorized MCP resources.
- Close the loop with measured activation outcomes.

## Success measures

- Behavioral rows with reliable confirmed-outcome linkage.
- Browser-to-confirmed-lead coverage.
- GA4 reconciliation coverage and explained discrepancy.
- Query latency and projection freshness.
- Percentage of insights with cited released evidence.
- User drill-down and recommendation acceptance.
- Incremental qualified lead, appointment, sale, and revenue outcomes.
- Zero cross-client identity leakage or synchronous external-provider dependency.

## ADME Studio push-pull integration

The platform pulls ADME public evidence through the existing server-side MCP connector, stores an immutable provider payload, and creates canonical topic, entity, claim, and trend derivatives. Authorized tenants receive a projection based on their profile, inventory, audiences, website behavior, campaigns, and CRM outcomes. Only minimum-cohort, privacy-safe effectiveness learning may be pushed back into shared intelligence. Raw tenant campaigns, leads, revenue, persona IDs, and customer identities never enter the shared pool. See `docs/prd/crm-adme-studio-automotive-campaign-intelligence-rnd.md`.
