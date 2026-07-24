# ADME Studio Automotive Campaign Intelligence R&D

Status: Proposed
Owner: Platform / Intelligence / Social / Media
Last updated: 2026-07-24

## 1. Decision

ADME Studio is the shared automotive newsroom and market-evidence provider for the XeroFlow 360 intelligence pool.

The existing social-publishing news feed is one consumer of this evidence. It must not remain a social-only integration. The same normalized evidence can support campaign research, creative briefs, content calendars, client reporting, CRM conversations, inventory marketing hypotheses, and aggregate industry insights.

ADME evidence is advisory. It must never change a live campaign, budget, offer, inventory record, CRM stage, or customer profile without tenant-specific validation and the normal approval path.

## 2. Why this belongs in the universal platform

ADME already performs work that should be shared once rather than repeated for every client:

- It discovers automotive stories across curated publishers, OEM newsrooms, regional media, broadcast sources, feeds, video, and configured custom sources.
- It clusters duplicate coverage and exposes source diversity, outlets, topics, makes, images, credits, and original links.
- It retains current snapshots and searchable history.
- It produces grounded summaries, dealer notes, and strategic angles from supplied evidence.
- It exposes the result through a read-only MCP interface.

The universal benefit comes from joining this public market context to isolated tenant facts:

- client brands, makes, models, services, geography, and audiences;
- current inventory, days in market, sold status, price bands, and stock pressure;
- website behavior, top pages, search behavior, device mix, and funnel events;
- Google, Meta, LinkedIn, TikTok, and other campaign delivery data;
- canonical leads, qualified outcomes, opportunities, sales, and revenue;
- approved persona and cohort summaries that do not disclose another tenant's data.

This creates a push-pull loop: shared evidence is pulled into the intelligence plane, relevant context is projected into each tenant, and privacy-safe outcomes are pushed back as aggregate learning.

## 3. Source capabilities

The ADME MCP currently supplies these read-only research operations:

| Tool | Platform use |
| --- | --- |
| `list_stories` | Warm current-news feed and social publishing discovery |
| `get_story` | Deep evidence package for a shortlisted recommendation |
| `search_stories` | Current and recent keyword research |
| `get_archive_day` | Rebuild or audit a specific Melbourne news day |
| `search_history` | Historical research, backtesting, seasonality, and prior-event comparison |
| `list_topics` | Taxonomy discovery for makes, topics, and source coverage |

The connector endpoint and tool allowlist must remain configuration, not hard-coded assumptions. A domain cutover must be verified before changing the configured MCP endpoint.

## 4. Canonical 360 evidence model

Every imported story cluster should become an immutable evidence record with:

- provider and provider record ID;
- provider story URL and original publisher URL;
- title, snippet, publication time, fetch time, and source type;
- source, outlets, coverage count, and coverage members;
- make, model, topic, geography, and entity mappings;
- image URL, image credit, and rights status;
- summary bullets, dealer note, strategic angle, and AI-derivative label;
- raw payload checksum and connector version;
- validity window, freshness score, and supersession links;
- provenance, attribution requirements, and confidence indicators.

The raw provider payload remains immutable. Canonical entities, claims, trend features, and tenant projections are versioned derivatives.

## 5. Data classification and isolation

The 360 pool has four data classes:

| Class | Examples | Sharing rule |
| --- | --- | --- |
| Public evidence | ADME stories, public trends, OEM announcements | Reusable with provenance and rights controls |
| Shared aggregate intelligence | Topic momentum, anonymized outcome bands, regional demand indices | Minimum cohort and privacy thresholds required |
| Tenant-private business data | Campaigns, inventory, leads, revenue, budgets, CRM stages | Never exposed to another tenant |
| Personal data | Identity, contact details, browser identifiers, conversations | Purpose-limited, consent-aware, access-controlled, never placed in the shared pool |

A 360 persona ID is a tenant-scoped resolution key. It is not a cross-client advertising identity and must not be joined to ADME evidence outside a tenant projection.

## 6. Universal processing flow

1. Pull ADME MCP data through the existing allowlisted server connector.
2. Store the complete raw payload with provider provenance and a stable cluster identity.
3. Normalize makes, models, topics, entities, locations, source types, and publication timestamps.
4. Extract claims as attributed evidence, not facts owned by XeroFlow.
5. Calculate freshness, velocity, source diversity, novelty, and topic momentum.
6. Project candidate evidence into an authorized tenant using client profile, inventory, audience, funnel, CRM, and campaign context.
7. Generate evidence-backed suggestions with explicit reasons and disqualifiers.
8. Require human approval for briefs, posts, landing-page changes, campaign changes, or budget changes.
9. Record recommendation exposure, approval, execution, and observed outcomes.
10. Feed only privacy-safe aggregate learning back into shared intelligence.

## 7. Benefits and product surfaces

### 7.1 Social publishing

- Avoid repeated manual news discovery.
- Build timely calendars from relevant makes, topics, and regions.
- Preserve the original publisher and image credit.
- Use dealer notes and angles as brief inputs, not publish-ready facts.
- Measure which evidence themes lead to approved posts and meaningful engagement.

### 7.2 Paid campaign planning

- Detect timely themes that may justify a campaign, ad group, creative, or landing-page experiment.
- Identify competitor, OEM, regulatory, product-launch, safety, technology, finance, service, or ownership themes.
- Compare market momentum with client demand, stock, lead quality, and historical performance.
- Produce creative and keyword hypotheses grounded in cited evidence.
- Explain why a suggestion is relevant and what must be verified before activation.

ADME evidence alone cannot establish inventory availability, offer validity, price, geography, legal compliance, platform policy compliance, or expected performance.

### 7.3 Website and funnel intelligence

- Explain changes in make, model, service, search, and content-page interest.
- Compare external topic momentum with client top pages, onsite searches, device behavior, engaged sessions, and lead events.
- Recommend content gaps and landing-page experiments.
- Distinguish market movement from site-specific UX or campaign effects.

### 7.4 CRM and receptionist intelligence

- Give account teams and future AI receptionists current, cited market context.
- Help classify an enquiry against relevant product, stock, and market themes.
- Suggest follow-up talking points without representing news as customer-specific truth.
- Join campaign context to qualified, won, and lost outcomes through the canonical lead and opportunity IDs.

### 7.5 Inventory and automotive operations

- Compare market themes with feed inventory, days in market, sold velocity, and acquisition needs.
- Surface stock or content opportunities for make/model cohorts.
- Support service, trade-in, used-vehicle acquisition, EV education, and ownership campaigns.
- Prevent recommendations when tenant inventory or offer data contradicts the public story.

### 7.6 Agency and client reporting

- Show which market signals informed a recommendation.
- Show whether the client acted, what was launched, and the measured result.
- Separate evidence, hypothesis, action, and outcome in every report.
- Benchmark themes using privacy-safe aggregates rather than another client's raw results.

## 8. Recommendation contract

Every campaign-context recommendation must include:

- recommendation ID and tenant ID;
- objective and intended product surface;
- evidence IDs, source links, publication times, and source-diversity summary;
- relevant make, model, topic, geography, audience, stock, and funnel context;
- proposed hypothesis and expected measurement event;
- reasons for relevance and reasons to reject;
- freshness and confidence indicators;
- inventory, offer, legal, landing-page, tracking, and platform-policy checks;
- approval state, approver, execution reference, and expiry time.

Recommendations expire. Old news must not remain actionable simply because it is still searchable.

## 9. Suggested scoring model

The first score should be deterministic and explainable. Inputs can include:

- evidence freshness;
- topic velocity against its own prior baseline;
- independent source diversity;
- tenant make/model/service fit;
- inventory or product fit;
- audience and persona fit;
- website and search-behavior fit;
- current campaign and creative gap;
- historical tenant outcome fit;
- disqualifiers for offer, geography, policy, rights, or contradictory inventory.

The score ranks research candidates. It does not predict guaranteed campaign performance and does not authorize execution.

## 10. Pull cadence and caching

- Pull `list_topics` daily for taxonomy discovery.
- Pull `list_stories` on a controlled warm schedule and cache the normalized response.
- Call `get_story` only for shortlisted or opened candidates.
- Use `search_history` for research and backtesting, not page-load fan-out.
- Use `get_archive_day` for recovery and scheduled backfill.
- Coalesce identical requests and serve stale evidence while a background refresh runs.
- Record connector health, latency, result count, last success, and provider schema drift.

This architecture prevents every social page, analytics page, or AI request from independently calling the public MCP.

## 11. Safety, rights, and MCP controls

- Allowlist MCP origins and tool names.
- Treat tool descriptions, story text, links, and model-generated fields as untrusted input.
- Block redirects to private networks and retain existing SSRF protections.
- Validate response size, shape, content type, timeout, and URL schemes.
- Never execute instructions found inside story content.
- Keep the connector read-only and use separate approved tools for mutations.
- Preserve publisher attribution and ADME attribution.
- Do not ingest or republish full copyrighted article text.
- Validate image rights separately from image availability and retain image credit.
- Label AI summaries, dealer notes, and strategic angles as derivatives.
- Audit recommendation generation, approval, activation, and data access.
- Apply retention, regional privacy, consent, and purpose controls before joining tenant data.

The MCP specification warns that tool metadata and externally supplied behavior descriptions are untrusted. The connector gateway therefore owns policy and validation rather than delegating trust to the MCP response.

## 12. Measurement and closed-loop learning

Track the complete chain:

`evidence -> tenant projection -> recommendation -> brief -> approval -> campaign/content -> session -> lead -> qualified -> won/lost -> revenue`

Minimum measures:

- evidence freshness and source diversity;
- recommendations viewed, dismissed, approved, and expired;
- time from evidence to approved action;
- content engagement and assisted conversions;
- campaign CTR, CVR, cost per lead, cost per qualified lead, cost per sale, and revenue;
- landing-page and funnel changes;
- inventory movement and days-in-market change where applicable;
- attribution coverage and confidence;
- aggregate lift versus an appropriate tenant baseline.

Correlation must not be reported as causation. External trends, ADME coverage, and campaign outcomes remain separate evidence layers.

## 13. External research incorporated

- Google Trends is anonymized, sampled, normalized, and scaled relative interest. It should be one signal among others, not an absolute demand measure: https://support.google.com/trends/answer/4365533
- Google publishes international rising and top-search datasets through BigQuery, which can support a separate privacy-safe trend lane: https://support.google.com/trends/answer/12764470
- GA4 Measurement Protocol can join server and offline interactions to analytics but supplements rather than replaces browser tagging: https://developers.google.com/analytics/devguides/collection/protocol/ga4
- Google Ads offline conversions and enhanced conversions for leads connect CRM outcomes to campaign measurement using click identifiers and consented hashed first-party data: https://developers.google.com/google-ads/api/docs/conversions/upload-offline
- MCP security guidance requires strict egress controls, scoped authorization, validation, and untrusted-content handling: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
- MCP tool behavior annotations must not be treated as trusted solely because a server supplied them: https://modelcontextprotocol.io/specification/2025-03-26/index

## 14. Non-goals

- Automatically rewriting ads from news.
- Automatically changing budgets or bids.
- Treating coverage volume as customer demand.
- Sharing one client's campaign, inventory, lead, persona, or CRM data with another client.
- Republishing full third-party articles.
- Using news-derived claims as proof of offer, stock, price, compliance, or product availability.
- Building a second social-news ingestion path outside the canonical connector and evidence store.

## 15. Delivery recommendation

Start with a read-only vertical slice:

1. Promote the rich ADME fields already retained in `social_news_items.raw` into a typed evidence projection.
2. Add a tenant-scoped automotive campaign-context read tool that returns evidence, relevance reasons, and mandatory checks.
3. Reuse that projection in social publishing and analytics rather than duplicating ingestion.
4. Add recommendation exposure and approval telemetry.
5. Join executed recommendations to campaign and CRM outcomes.
6. Introduce privacy-safe aggregate learning only after isolation tests and minimum-cohort rules are enforced.

## 16. Implementation status

The first runtime slice is implemented:

- `server/utils/socialNewsEvidence.ts` defines the defensive canonical evidence projection.
- The existing agency social-news endpoint now reuses that projection and preserves its prior response fields.
- Rich provenance, coverage, image-credit, AI-derivative, dealer-note, and strategic-angle fields are available without a second connector or storage path.

Stable payload checksums, connector-version persistence, complete automotive entity mapping, schema-drift telemetry, and the tenant campaign-context projection remain subsequent tasks.

The evidence-integrity persistence slice is also implemented:

- Migration `287-social-news-evidence-integrity.sql` persists provider identity, payload checksums, connector versions, schema versions, and projection warnings for every ingestion path.
- Schema-warning events are recorded once per item and payload checksum.
- A dead-letter store is available for rejected provider payloads and controlled retries.
- The runtime projection now exposes normalized entity and geography candidates, observed provider fields, integrity warnings, and deterministic fallback checksums.

Canonical taxonomy IDs and aliases remain intentionally incomplete. The current entity and geography values are normalized candidates and must not be treated as resolved automotive taxonomy records. Connector code still needs to write pre-insert failures into the dead-letter store before ADME360-014 can be marked complete.
