# Shared Industry Trends and Crossover Intelligence R&D

## Status

Proposed architecture and phased delivery plan.

## Objective

Create a shared Industry Intelligence plane that helps clients understand market demand, benchmark performance, discover adjacent opportunities, and improve campaign decisions without exposing another client's customers, campaigns, or commercially sensitive data.

This plane sits above the 360 Persona lakehouse. It consumes privacy-safe aggregates and external market signals. It must never become a shared cross-client identity pool.

## Core boundaries

- Client-owned events, leads, CRM records, audiences, campaign identifiers, and Persona IDs remain tenant scoped.
- Cross-client insights are released only as sufficiently large, privacy-safe cohorts.
- A crossover opportunity may be discovered from shared trends, but activation can target only the requesting client's eligible, consented first-party audience.
- External benchmarks and internal portfolio benchmarks must be clearly labelled and never blended without disclosure.
- Trend data is evidence for a recommendation, not an autonomous instruction to spend budget or contact a person.

## Signal sources

### External and public signals

- Google Trends topics and search terms by geography, category, and time window.
- Google Trends public BigQuery top and rising queries.
- Government registration, population, economic, licensing, transport, and industry datasets.
- Properly sourced and versioned advertising platform benchmarks.
- Public inventory, pricing, product launch, recall, and market-share data where licensing permits.

### Marketplace signals

- Product searches and result impressions.
- Detail-page views, saves, comparisons, and inquiries.
- Search-to-view, view-to-save, and view-to-inquiry conversion.
- Inventory count, age, price changes, and days on market.
- Product, make, model, category, fuel type, price band, and geography.

### Client portfolio aggregates

- Spend, impressions, clicks, CTR, CPC, CPM, conversions, CPL, CPA, and ROAS.
- Website sessions, engaged sessions, landing-page conversion, and lead source.
- Confirmed leads, qualified leads, appointments, opportunities, sales, and revenue.
- Response speed, lead aging, stage velocity, and outcome rates.
- Aggregation is opt-in, tenant protected, cohort thresholded, and stripped of direct identifiers.

### Social and content signals

- Topic volume, engagement velocity, sentiment, share of voice, and content format.
- Organic and paid engagement by taxonomy, geography, and time window.
- No release of individual social profiles across tenants.

### Product and inventory signals

- Supply, demand, aged stock, price pressure, availability, and product crossover.
- Product API and feed health, SKU coverage, and inquiry-to-product match quality.

## Canonical trend signal contract

Every signal should use a common, versioned contract:

```ts
interface IndustryTrendSignal {
  signalId: string
  source: string
  sourceType: 'external' | 'marketplace' | 'portfolio' | 'social' | 'inventory'
  industry: string
  market: string
  geography: string
  taxonomyId: string
  metric: string
  value: number
  unit: 'count' | 'currency' | 'percentage' | 'index' | 'duration'
  windowStart: string
  windowEnd: string
  valueType: 'observed' | 'computed' | 'forecast'
  sampleSize?: number
  cohortSize?: number
  confidence: number
  methodologyVersion: string
  provenance: Record<string, string>
  refreshedAt: string
  suppressionStatus: 'released' | 'suppressed' | 'insufficient_sample'
  warnings: string[]
}
```

The contract must preserve source, methodology, denominator, freshness, confidence, and suppression state. A value without this metadata is not suitable for client recommendations.

## Composite indices

Composite indices should be derived from versioned, inspectable features rather than opaque AI scores:

- Search Interest Index.
- Marketplace Demand Index.
- Inventory Pressure Index.
- Social Momentum Index.
- Campaign Efficiency Index.
- Lead Quality Index.
- Conversion Velocity Index.
- Crossover Opportunity Score.

Each index must expose its component signals, weights, baseline, date window, confidence, and methodology version.

## Google Trends integration

Google Trends is useful as directional evidence, but it is not absolute search volume and must not be treated as a scientific poll. Web Trends data is sampled, normalized for time and geography, and commonly represented as relative interest from 0 to 100.

Implementation rules:

- Prefer an adapter for the official Google Trends API when alpha access is available.
- Use the public BigQuery top and rising queries dataset for initial discovery where appropriate.
- Treat the existing SerpAPI implementation as a third-party fallback, with licensing, provenance, cost, and availability explicitly recorded.
- Store whether each query used a topic or search term, plus category, geography, property, date range, and comparison set.
- Cache both the raw provider response and normalized observations.
- Never infer absolute demand directly from a Trends index.
- Do not use fixed multipliers such as `rising = 1.2` as production forecasting.
- Calibrate Trends signals against marketplace behavior, inventory, confirmed leads, sales, and seasonality.
- Backtest any forecast before it can influence a recommendation or budget.

## Privacy-safe portfolio benchmarking

Internal benchmarks should provide useful ranges without allowing a client to infer another client's performance.

Required controls:

- Client opt-in for contribution to portfolio benchmarks.
- Minimum client, Persona, event, and conversion cohort thresholds.
- Suppression of small categories, geographies, time windows, and sparse funnels.
- Suppression of minimum, maximum, or ranking views that identify an outlier client.
- Percentile bands and cohort distributions instead of named competitor rankings.
- Winsorization or robust statistics for extreme outliers.
- Separate cohorts by industry, market, geography, channel, objective, and business size only when thresholds remain satisfied.
- Optional differential privacy or controlled noise in a later phase.
- Complete audit records for aggregate calculation and release decisions.

Existing seeded benchmarks described only as broad industry averages should be replaced with sourced, dated, licensed, and methodology-versioned records.

## Crossover intelligence

Crossovers identify adjacent demand without joining identities across clients.

Examples for automotive:

- SUV and utility interest can indicate towing, accessories, servicing, finance, insurance, and trade-in opportunities.
- EV interest can indicate charging, solar, energy plans, home electrical work, and fleet-transition content.
- Aged inventory plus rising local search interest can justify a targeted stock campaign.
- Marketplace comparison behavior can indicate product substitution or a price-band migration.
- Service history and consented first-party ownership data can support replacement-cycle campaigns inside the owning tenant.

Crossover workflow:

1. Detect an aggregate relationship between taxonomy nodes.
2. Require corroboration from at least two independent signal classes for material recommendations.
3. Calculate cohort size, confidence, freshness, commercial relevance, and privacy status.
4. Present the opportunity and evidence to an authorized user.
5. Require approval before campaign or CRM activation.
6. Resolve the opportunity only against the client's own consented Personas.
7. Measure incremental outcome and expire stale recommendations.

Lifecycle:

`observed -> corroborated -> opportunity -> approved -> activated -> measured -> expired`

## Recommended data model

- `external_trend_observations`
- `portfolio_metric_aggregates`
- `marketplace_demand_aggregates`
- `social_trend_aggregates`
- `inventory_supply_aggregates`
- `industry_benchmark_versions`
- `industry_trend_features`
- `industry_composite_indices`
- `crossover_opportunities`
- `trend_recommendation_evidence`
- `trend_release_audits`

Raw observations belong in the analytical lake. Approved, current projections and recommendation state belong in the operational database. The same replaceable `LakeSink` boundary defined for the Persona lakehouse should be used so beta infrastructure is not a hard dependency for CRM, consent, lead capture, or activation.

## Product surfaces

### Client portal

- Market demand overview.
- Client performance versus an anonymous peer range.
- Emerging topics, products, and geographies.
- Inventory and campaign crossover opportunities.
- Clear evidence, confidence, source, freshness, and sample-size labels.
- Recommended actions requiring approval.

### Agency portal

- Portfolio trend explorer.
- Industry, geography, channel, objective, and product taxonomy filters.
- Benchmark methodology and cohort-health controls.
- Opportunity pipeline across clients without exposing one client's records to another.
- Data quality, freshness, suppression, and source-cost monitoring.

### AI and MCP

- AI may summarize released signals and explain recommendation evidence.
- MCP resources must enforce tenant, role, consent, cohort, and field-level policies.
- Tools may query approved aggregate trends and create draft recommendations.
- Tools must not expose raw cross-client Persona, lead, campaign, or customer records.
- Budget changes, audience activation, and outbound contact remain approval-gated actions.

## Data quality and trust

Every dashboard and recommendation should expose:

- Sample and cohort size.
- Source and collection method.
- Last refresh time.
- Seasonal baseline.
- Confidence and known limitations.
- Suppression reason where data is unavailable.
- Observed versus computed versus forecast status.
- Backtest performance for forecasted values.

Alerts should cover stale sources, cohort collapse, abnormal variance, attribution loss, taxonomy mapping failures, and forecast drift.

## Phased delivery

### Phase 0: governance and taxonomy

Define industries, markets, product taxonomy, privacy thresholds, contribution consent, release policy, and methodology versioning.

### Phase 1: external trends

Normalize Google Trends and public datasets into the canonical signal contract. Add caching, provenance, freshness, and source health.

### Phase 2: marketplace demand

Aggregate search, view, save, compare, inquiry, inventory, and pricing behavior by taxonomy and geography.

### Phase 3: portfolio benchmarks

Replace unsourced seeds and release thresholded percentile bands from opted-in client aggregates.

### Phase 4: composite and crossover signals

Create explainable indices and multi-source crossover candidates with confidence and privacy controls.

### Phase 5: recommendations

Add agency and client review surfaces, evidence trails, expiration, and outcome measurement.

### Phase 6: activation

Connect approved opportunities to campaigns, CRM workflows, receptionist knowledge, AI tools, and MCP while preserving tenant-scoped identity and consent.

## Success measures

- Percentage of released signals with valid provenance and methodology versions.
- Percentage of benchmarks meeting cohort and sample thresholds.
- Recommendation acceptance and measured incremental outcome.
- Forecast calibration and error by signal class.
- Reduced campaign research time.
- Increased qualified-lead, appointment, and sale conversion without increased privacy incidents.
- Zero cross-client identity or commercially sensitive data leakage.

## Explicit non-goals

- Creating a cross-client list of identifiable people.
- Ranking named clients or competitors using private portfolio data.
- Treating Google Trends as absolute demand or confirmed customer intent.
- Allowing AI to autonomously move budget or contact customers from a trend alone.
- Making the CRM or lead-capture path depend on an analytical lake or beta data product.

## Vehicle listing lifecycle and time-to-sale intelligence

The vehicle marketplace should contribute lifecycle observations, not only current inventory counts. A listing that disappears is not automatically a sale, so the canonical status model must distinguish:

- `active`
- `reserved`
- `sold_confirmed`
- `sold_inferred`
- `withdrawn`
- `expired`
- `transferred`
- `unknown`

A confirmed sale requires an explicit marketplace, dealer feed, DMS, CRM, or transaction signal. An inferred sale must retain its evidence, confidence, and methodology version. Delisting alone must remain `unknown` until corroborated.

Recommended lifecycle fields include:

- Canonical vehicle, VIN hash, dealer stock ID, listing ID, dealer, and tenant.
- First observed, first advertised, latest observed, reserved, sold, withdrawn, and relisted timestamps.
- Initial advertised price, last advertised price, price-change history, and total advertised reduction.
- Odometer, condition, make, model, variant, model year, fuel type, body type, price band, and geography.
- Sale evidence source, confidence, and confirmation time.
- Inquiry, save, comparison, lead, appointment, and sale outcome counts attached through tenant-safe identifiers.

`last advertised price` must not be labelled as `sale price` unless a transaction source confirms the actual consideration.

### Time-on-market metrics

- Days from first advertised or first observed to confirmed sale.
- Current age for active inventory.
- Median and percentile days-to-sale by market cohort.
- Sell-through rate by 7, 14, 30, 60, and 90-day windows.
- Time to first inquiry, qualified lead, appointment, reservation, and sale.
- Price changes before sale and days between reductions.
- Inquiry-to-sale and view-to-sale conversion.
- Relisting frequency and total cumulative market exposure.

Active listings are right-censored observations, not failed sales. Forecasting should therefore use cohort or survival methods rather than calculating an average from sold vehicles alone. Report medians and percentile bands with sample sizes because a mean can be distorted by a small number of aged listings.

### Market and client use cases

- Identify makes, models, variants, fuel types, and price bands selling faster than local supply is replenished.
- Detect aged-stock pressure and recommend pricing, creative, landing-page, or audience changes.
- Recommend acquisition and trade-in campaigns for fast-selling, supply-constrained products.
- Compare a client's days-to-sale and sell-through against an anonymous local peer range.
- Correlate campaign spend, website behavior, leads, appointments, and vehicle sales.
- Estimate inventory carrying exposure without presenting an unconfirmed accounting cost.
- Improve receptionist and salesperson answers about availability while keeping feed freshness visible.

Relisted vehicles must preserve their prior listing episodes. A configurable business rule may provide both `dealer_days_in_stock` and `marketplace_days_exposed`, but relisting must not silently reset the market history.

## Automotive news and knowledge-graph signals

The automotive-market MCP news feed should contribute to the Industry Intelligence plane through a separate evidence pipeline. The existing social-news inbox remains a selection and publishing surface; it should not become the canonical market-knowledge store.

News should be normalized into versioned documents, cross-source story clusters, entities, time-bound events, claims, and evidence. Only released signals with source provenance, rights, confidence, source independence, freshness, and correction state may contribute to trend indices or crossover opportunities.

GraphRAG-style retrieval can support whole-market theme analysis and precise make/model/event histories. Generated graph summaries remain derivative and must link to underlying claims and source evidence. A news trend can propose research, organic content, or a campaign hypothesis, but paid activation additionally requires current inventory, offer, price, landing-page, geography, policy, and human approval checks.

Detailed design is in `docs/prd/crm-automotive-news-knowledge-intelligence-rnd.md`.

## Delivery into client analytics

Released industry signals should be delivered through the push-pull projection layer. They may be associated with page, device, source, campaign, product, vehicle, funnel, lead-quality, and sales outcomes by taxonomy, geography, and time window. They must not be copied into raw customer event records or used to join Personas between clients.

Client dashboards pull precomputed associations with evidence, confidence, freshness, sample size, and methodology. External trend, news, campaign, and marketplace providers are never called synchronously during dashboard rendering.

See `docs/prd/crm-360-intelligence-push-pull-analytics.md`.

## ADME Studio signal lane

ADME provides a provenance-rich automotive news and OEM evidence lane for the shared trends layer. Coverage volume and AI-derived angles are evidence features, not demand or performance facts. ADME features may be combined with separately attributed Google Trends, marketplace, inventory, website, campaign, and CRM outcome signals only through privacy-safe tenant projections. See `docs/prd/crm-adme-studio-automotive-campaign-intelligence-rnd.md`.
