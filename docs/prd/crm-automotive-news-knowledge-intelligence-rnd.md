# Automotive News, Knowledge Graph, and Marketing Intelligence R&D

## Status

Proposed architecture and incremental rollout.

## Interpretation

This document treats "Gravata" as GraphRAG: retrieval over an evidence-backed automotive knowledge graph. If a different product or service was intended, its adapter can be assessed separately without changing the core boundaries below.

## Objective

Use the existing automotive-market MCP news feed as one source for shared industry intelligence. Convert aggregated news into traceable automotive events, claims, themes, and trend signals that can assist research, content, campaigns, inventory decisions, CRM, and receptionist knowledge without allowing untrusted news or an LLM to publish, target, or spend autonomously.

This is a shared market-knowledge pool, not a shared customer or Persona pool.

## Existing foundation

The dashboard already provides a useful V1 flow:

1. A configured MCP source is refreshed into `social_news_items`.
2. Items receive a stable external identity and are deduplicated per source.
3. Deterministic client relevance uses industry, make, content pillar, and include/exclude keywords.
4. News content is explicitly treated as untrusted prompt input.
5. AI returns recommendations only.
6. A user must select, edit, approve, schedule, and publish content.
7. Existing AI tools retain client access checks and commercial-package context.

These controls should remain. The intelligence layer extends this path rather than replacing it.

## Current gaps

The existing inbox is designed for social publishing, not market intelligence. It does not yet provide:

- Canonical URL and content-hash deduplication across publishers and syndication.
- Article versioning, corrections, retractions, and a durable retrieval timestamp.
- Source ownership, jurisdiction, reputation, licensing, or permitted-use metadata.
- Structured automotive entities, events, claims, and evidence spans.
- Distinction between reporting, opinion, prediction, rumour, sponsored content, and confirmed announcements.
- Corroboration across independent sources.
- Temporal relationships and confidence decay.
- Trend-cluster velocity, novelty, geographical relevance, or source diversity.
- A release gate between an extracted claim and a client-facing insight.
- Citation-complete retrieval for AI, content, and campaign recommendations.

The migration comment describes source records as immutable, but the current upsert updates source fields and raw JSON. Market intelligence requires append-only document versions or a revision ledger so later edits and corrections do not erase what the system previously observed.

## Target pipeline

```text
MCP source
  -> source policy and fetch audit
  -> normalized document version
  -> canonical URL/content fingerprint
  -> duplicate and syndicated-story cluster
  -> language, geography, taxonomy, and media classification
  -> entities, events, claims, and evidence spans
  -> source independence and corroboration
  -> temporal automotive knowledge graph
  -> released trend observations
  -> shared industry indices and crossover opportunities
  -> client relevance and inventory/market validation
  -> draft insight, brief, content, or campaign proposal
  -> human and policy approval
  -> activation and measured outcome
```

Raw news must never move directly from MCP content to an advertising write action.

## Source and document contract

Every source should have:

- Stable source ID and MCP server identity.
- Publisher and ultimate content owner.
- Endpoint, tool name, transport, and authentication method.
- Jurisdiction, language, geography, and automotive coverage.
- Terms, licence, retention, quotation, summarisation, embedding, and commercial-use permissions.
- Source category such as OEM, regulator, government, trade press, dealer, marketplace, analyst, or general media.
- Trust tier and independence group.
- Refresh cadence, rate limit, cost, health, and last successful fetch.
- Known syndication relationships and conflicts of interest.

Every retrieved document version should preserve:

- Source item ID, canonical URL, publisher URL, and content hash.
- Title, byline, published, modified, retrieved, and superseded timestamps.
- Raw provider payload and normalized permitted text.
- Rights and permitted-use state.
- Correction, retraction, duplicate, and canonical-cluster relationships.
- Language, geography, topic, and automotive taxonomy.
- Prompt-injection and unsafe-content scan results.
- Parser and extraction methodology versions.

Do not store or reproduce full copyrighted article text unless the source terms permit it. Store licensed content, provider payloads, short evidence spans where lawful, hashes, structured facts, and source links according to source policy.

## Automotive knowledge model

### Entity types

- OEM and parent group.
- Make, model, variant, generation, powertrain, and platform.
- Dealer, dealer group, marketplace, supplier, and technology company.
- Government, regulator, standards body, and industry association.
- Geography, market, factory, port, and distribution region.
- Feature, technology, charging system, battery chemistry, and safety system.
- Campaign theme, customer need, audience cohort, and product category.

### Event types

- Product reveal, launch, facelift, availability, allocation, and discontinuation.
- Price increase, reduction, incentive, finance offer, and specification change.
- Recall, stop-sale, safety notice, compliance action, and software update.
- Registration, sales, supply, shipment, production, and inventory change.
- Factory opening or closure, investment, partnership, acquisition, and supplier issue.
- Regulation, tax, subsidy, emissions, licensing, and infrastructure change.
- Review, award, sentiment shift, social controversy, and competitor campaign.

### Claim model

A claim is not a fact merely because it appeared in an article. Store:

- Claim text or normalized proposition.
- Subject, predicate, object/value, geography, and effective time.
- Reporting source and original source if different.
- Evidence span and document version.
- Claim class: confirmed, attributed, forecast, opinion, rumour, sponsored, or disputed.
- Corroborating and contradicting evidence.
- Source independence count.
- Extraction confidence, evidence confidence, release status, and expiry.

Generated summaries, community reports, and AI explanations are derivative artefacts. They must link to claims and evidence and must not be promoted to canonical facts.

## GraphRAG design

GraphRAG is useful because automotive news questions often require both whole-market theme detection and precise entity history.

- Global retrieval answers questions such as emerging powertrain, pricing, supply, policy, or consumer themes across the corpus.
- Local retrieval answers questions about a make, model, competitor, regulation, geography, or event and its relationships.
- Drift retrieval compares graph communities, claims, and event velocity across time windows.
- Crossover retrieval connects a market event to inventory, search interest, marketplace behavior, client campaigns, CRM outcomes, and approved content pillars.

The production graph should be temporal and evidence backed. Every edge needs source claims, effective dates, confidence, and tenant/release classification. Vector similarity can find candidate context, but graph constraints and structured filters should enforce date, geography, taxonomy, rights, source diversity, and release status.

Microsoft GraphRAG is a reference pattern, not automatically the production dependency. Its standard extraction is high fidelity but expensive; its faster method is cheaper and noisier. Begin with deterministic parsing and constrained entity/event extraction, then test graph methods on a bounded automotive corpus before committing to a large indexing cost.

The existing project Graphify output remains useful for code and architecture R&D. Do not automatically mix repository graphs with production client or market intelligence data.

## Corroboration and trend formation

A single story can create an observation but should rarely create a material trend or paid-media recommendation.

Recommended release dimensions:

- Number of independent primary and secondary sources.
- Publisher and ultimate-source diversity.
- Recency, persistence, acceleration, and geographical relevance.
- Novelty compared with prior graph history.
- Confirmed versus predicted or disputed status.
- Alignment with Google Trends, government data, registrations, marketplace demand, inventory, website behavior, campaign outcomes, and CRM sales.
- Cohort size and confidence.
- Rights and allowed-use status.

Suggested news-derived signals:

- Topic Momentum Index.
- Product Launch Attention Index.
- Policy Impact Index.
- Supply Disruption Index.
- Price and Incentive Pressure Index.
- Recall and Reputation Risk Index.
- Competitor Activity Index.
- Technology Adoption Index.
- Local Market Relevance Index.

Scores must expose their components and cannot substitute for source evidence.

## Marketing and advertising applications

### Research and strategy

- Weekly market and competitor briefings with citations.
- Emerging make, model, powertrain, feature, pricing, and policy themes.
- Market-event timelines and competitor share of attention.
- Crossover discovery across search, marketplace, inventory, campaign, and CRM outcomes.

### Organic content

- Evidence-backed draft social posts, articles, email themes, and sales talking points.
- Client relevance based on approved brands, locations, content pillars, audience, and tone.
- Original commentary and source attribution rather than article reproduction.
- Human editorial review remains mandatory.

### Paid media

- Draft campaign hypotheses, audiences, keyword themes, creative angles, and landing-page briefs.
- Paid activation requires an additional product, inventory, offer, price, geography, landing-page, and legal validation gate.
- News about a model launch or incentive does not prove that the client has stock or may advertise the offer.
- Recall, safety, political, financial, or disputed stories require elevated risk review.
- Ads must not use misleading claims, unavailable offers, fabricated endorsements, sensationalism, or unsupported urgency.
- AI may propose a budget experiment, but spend and targeting changes remain approval gated and measured incrementally.

### CRM and receptionist

- Surface current market context and approved talking points to staff and AI assistants.
- News cannot override canonical stock, pricing, offer, finance, recall, policy, or operating-hours systems.
- Customer outreach requires the client's own consent, purpose, suppression, and channel rules.
- Shared news trends may select a strategy; they must not supply cross-client recipient identities.

## Security and MCP controls

Treat every MCP server, tool description, resource, item, link, and article as untrusted input.

- Allowlist MCP servers, tools, schemas, redirects, and outbound hosts.
- Authenticate the source and record the server/tool identity for every fetch.
- Apply strict response size, type, item count, timeout, and rate limits.
- Validate and normalize into a narrow schema before storage.
- Never execute instructions found in article content or metadata.
- Do not pass source credentials, internal prompts, tenant data, or tool tokens to the news MCP.
- Separate read-only ingestion credentials from all campaign, publishing, CRM, and advertising credentials.
- Scan links and media before rendering or downloading.
- Use idempotency, replay protection, fetch audits, and source health monitoring.
- Require server-side authorization and explicit approval for every downstream mutating action.

MCP tool annotations and model interpretation are not security controls.

## Privacy and tenancy

- Public market news belongs to a shared market corpus only when licence and source policy allow it.
- Client research notes, campaign outcomes, inventory, CRM records, and Personas remain tenant scoped.
- Portfolio corroboration uses only opted-in, thresholded aggregates.
- Direct marketing uses only the client's own eligible Personas with purpose-specific consent and suppression enforcement.
- Do not place personal or sensitive client/customer information into public AI tools.
- Record why an insight was shown to a client and which evidence and tenant-safe signals contributed.

## Proposed data model

- `market_news_sources`
- `market_news_fetch_runs`
- `market_news_documents`
- `market_news_document_versions`
- `market_news_rights`
- `market_news_story_clusters`
- `market_news_entities`
- `market_news_entity_aliases`
- `market_news_events`
- `market_news_claims`
- `market_news_claim_evidence`
- `market_news_claim_relations`
- `market_news_graph_edges`
- `market_news_community_snapshots`
- `market_news_trend_features`
- `market_news_released_signals`
- `market_news_client_relevance`
- `market_news_marketing_proposals`
- `market_news_activation_outcomes`

The social inbox can reference released market-news records. It should not be the system of record for the knowledge graph.

## Release and approval policy

Suggested evidence tiers:

- `T0 observed`: ingested but unverified.
- `T1 attributed`: clearly attributed to a source or named speaker.
- `T2 corroborated`: supported by independent evidence.
- `T3 primary-confirmed`: confirmed by an authoritative primary source.
- `T4 canonical`: approved for operational knowledge within its effective period.

Allowed use should be policy mapped:

- Research may use `T0` with a visible warning.
- Organic draft content should normally require `T1` or above.
- Client-facing factual claims should require `T2` or primary confirmation.
- Paid-media claims, prices, availability, offers, recalls, and compliance statements require domain validation and normally `T3/T4` evidence.
- Canonical operational data must still come from inventory, product, offer, DMS, CRM, legal, or regulator systems as appropriate.

## Phased rollout

### Phase 0: governance

Define source policies, rights, evidence tiers, automotive taxonomy, release rules, risk classes, and retention.

### Phase 1: hardened ingestion

Add source identity, fetch audits, canonical URL/content hashes, document versions, rights, corrections, and cross-source story clustering.

### Phase 2: entities, events, and claims

Extract constrained automotive structures with evidence spans, temporal fields, source independence, and review tooling.

### Phase 3: knowledge retrieval

Pilot local, global, temporal, and crossover GraphRAG queries on a bounded corpus. Measure citation completeness, precision, latency, and cost.

### Phase 4: shared trend signals

Release explainable, corroborated news-derived signals into the Industry Intelligence plane and combine them with Google Trends, marketplace, registrations, inventory, campaigns, and CRM outcomes.

### Phase 5: client recommendations

Provide cited briefings, content proposals, competitor timelines, inventory opportunities, and landing-page briefs with client relevance and commercial-package controls.

### Phase 6: approved activation

Create draft organic and paid-media workflows with offer/inventory/policy checks, human approval, controlled experiments, and outcome feedback.

## Success measures

- Duplicate and syndicated-story consolidation rate.
- Percentage of claims with evidence spans and source provenance.
- Percentage of client-facing insights supported by independent evidence.
- Correction and retraction propagation time.
- Citation precision and completeness.
- Human acceptance, edit, rejection, and policy-block rates.
- Time from meaningful market event to approved client insight.
- Incremental content, qualified-lead, appointment, and sale outcomes.
- Source, extraction, retrieval, and generation cost per accepted recommendation.
- Zero autonomous publication, spend, targeting, or cross-tenant identity leakage.

## R&D sources

- Model Context Protocol security best practices: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
- Microsoft GraphRAG overview: https://microsoft.github.io/graphrag/index/overview/
- Microsoft GraphRAG indexing methods: https://microsoft.github.io/graphrag/index/methods/
- Microsoft GraphRAG global search: https://microsoft.github.io/graphrag/query/global_search/
- Google Ads misrepresentation policy: https://support.google.com/adspolicy/answer/6020955
- OAIC direct marketing guidance: https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/direct-marketing
- OAIC guidance on commercially available AI products: https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/guidance-on-privacy-and-the-use-of-commercially-available-ai-products

## ADME Studio universal evidence integration

ADME Studio is the first concrete automotive newsroom provider for this architecture. Its existing social-publishing integration must be normalized once into the shared evidence plane, then projected into authorized tenants for social, campaign, website, funnel, CRM, inventory, and reporting use cases. The detailed provider contract, benefits, controls, and delivery sequence are defined in `docs/prd/crm-adme-studio-automotive-campaign-intelligence-rnd.md` and its companion task list.
