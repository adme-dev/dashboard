# Automotive Marketplace Data Integration R&D

## Reference application

- Repository: `/Users/paulgiurin/Documents/GitHub/vehicle-marketplace`
- Review date: 2026-07-24
- Purpose: identify automotive data, intelligence, ingestion, identity, location, pricing, and customer-experience capabilities that should enrich the CRM, AI receptionist, analytics, mobile, automation, and MCP platform.

The marketplace is a separate bounded context. Its internal tables and implementation details must not become the CRM data model. Integration should occur through versioned product-data contracts, immutable snapshots, signed events, and independently reconcilable projections.

## Executive recommendation

Use the marketplace as the automotive product and market-intelligence authority. Use the CRM as the customer and commercial-workflow authority.

The marketplace should provide:

- Vehicle and listing identity.
- Dealer, seller, location, and market associations.
- Vehicle taxonomy, specifications, options, media, and enrichment.
- Inventory availability, status, and freshness.
- Price history, comparables, valuation, and market-position signals.
- Similar-vehicle and buyer-match results with explanations.
- Feed ingestion health, data-quality results, provenance, and reconciliation.
- Anonymous marketplace behavioral and audience signals where consent permits.

The CRM should retain ownership of:

- People, organizations, channel identities, and consent.
- Leads, enquiries, opportunities, activities, tasks, ownership, and SLA.
- Conversations, calls, messages, appointments, and AI handoffs.
- First-touch, last-touch, campaign, provider, and revenue attribution.
- Customer lifecycle outcomes and communication preferences.
- Client entitlements, usage, billing, and provider costs.

## Marketplace capabilities worth bringing across

### 1. Multi-source feed ingestion

The marketplace supports JSON, XML, CSV, authenticated feeds, field mapping, conditional HTTP requests, content hashes, source identifiers, VIN fallback, scheduled polling, review, and sync history. Its newer URL-first ingestion work adds structured-feed discovery, browser continuation, controlled LLM fallback, artifacts, adapter promotion, drift diagnosis, battle testing, and operational readiness.

CRM use cases:

- Onboard a dealer's vehicle feed once and consume the resulting canonical inventory.
- Attach the correct vehicle to website, Meta, Google, phone, email, and walk-in leads.
- Detect withdrawn, sold, repriced, relocated, or newly available stock.
- Trigger follow-up when a customer's vehicle changes status or a suitable alternative arrives.
- Surface feed failures before receptionists or sales staff provide stale information.

Do not duplicate feed scraping or normalization in the CRM. Expose feed health and canonical results from the marketplace.

Reference patterns:

- `docs/PRD_FEED_INGESTION_SYSTEM.md`
- `frontend/shared/types/inventory-ingestion.ts`
- `frontend/server/services/inventory-ingestion/contracts.ts`
- `frontend/server/services/inventory-ingestion/inventory-sync.ts`
- `frontend/server/services/inventory-ingestion/record-diff.ts`
- `frontend/server/services/inventory-ingestion/structured-feed-retrieval.ts`

### 2. Stable vehicle and listing identity

The integration must distinguish the physical vehicle, a seller's listing, a feed record, and a CRM product-interest snapshot.

Recommended identifiers:

- `marketplaceVehicleId`: canonical marketplace vehicle or listing identifier exposed externally.
- `sourceSystem`: DMS, feed provider, dealer website, manual, auction, or marketplace seller.
- `sourceListingId`: provider-stable listing identifier.
- `sellerId`: marketplace seller identity.
- `dealerExternalRef`: CRM-to-marketplace dealer mapping.
- `locationExternalRef`: CRM-to-marketplace location mapping.
- `stockNumber`: seller-scoped operational identifier.
- `vin`: restricted vehicle identity where collection, licensing, and disclosure permit.
- `registration`: restricted and market-specific; never a global primary key.
- `canonicalUrl`: canonical listing URL.
- `identityVersion`: identity resolution version.

Identity precedence should normally be:

1. Marketplace canonical ID.
2. Source-system plus source-listing ID.
3. Seller-scoped stock number.
4. VIN within an authorized market and seller context.
5. Canonical listing URL.
6. Controlled composite matching with confidence and review.

Identity merges and splits must emit events. Historical CRM snapshots must not be silently rewritten when marketplace identity changes.

### 3. Immutable enquiry-time vehicle snapshots

Every CRM product interest should contain both a live marketplace reference and an immutable snapshot captured when the customer interacted or enquired.

Minimum snapshot:

- Vehicle, listing, seller, dealer, location, stock, VIN token, and source identifiers.
- Make, model, variant, series, year, body, fuel, transmission, drivetrain, and condition.
- Odometer, price, previous price, currency, status, availability, and listing URL.
- Primary image and approved media references.
- Captured time, marketplace update time, source update time, and feed last-success time.
- Data-quality score, match confidence, provenance, and schema version.
- Campaign, landing page, creative, and browser-event linkage where applicable.

This preserves what was advertised even if the live listing is later repriced, corrected, withdrawn, merged, or removed.

### 4. Taxonomy and specifications service

The marketplace contains VIN lookup, VIN-to-spec mapping, grouped specifications, enrichment, vehicle summaries, categories, facets, comparisons, and similar-vehicle services.

Expose a versioned automotive taxonomy service rather than copying fields into each industry module:

- Canonical make, model, generation, series, variant, derivative, and model-year identifiers.
- Market-specific names and aliases.
- Body, fuel, transmission, drivetrain, usage, and condition vocabularies.
- Normalized options, safety, dimensions, performance, towing, efficiency, warranty, and charging data.
- Raw source values, normalized values, confidence, provenance, and effective dates.

CRM forms should store canonical IDs plus user-entered raw values. That supports correction, reprocessing, and international markets without losing original customer intent.

Reference patterns:

- `frontend/server/services/vin-lookup.ts`
- `frontend/server/services/vin-to-spec-mapper.ts`
- `frontend/server/services/spec-groups.ts`
- `frontend/server/services/vehicle-specs-aggregator.ts`
- `frontend/server/services/enrichment/vin-merger.ts`

### 5. Pricing and market intelligence

The marketplace has price analysis, history, auction price guides, engagement statistics, valuation research, and market intelligence. These can materially improve sales and receptionist workflows when accompanied by confidence and provenance.

Recommended `MarketSignal` contract:

- `signalType`
- `vehicleId` or taxonomy cohort
- `market` and geographic scope
- `asOf`
- `currency`
- `askingPrice`
- `estimatedValueLow`
- `estimatedValueMid`
- `estimatedValueHigh`
- `marketPercentile`
- `comparableCount`
- `daysSupply` or inventory pressure where available
- `priceTrend`
- `confidence`
- `methodologyVersion`
- `sourceSummary`
- `expiresAt`

The receptionist may communicate an advertised price from a fresh authoritative listing. It must not present inferred valuation, negotiation advice, finance outcomes, or predicted availability as guaranteed fact. Sales users can see richer internal market signals with provenance and disclaimers.

Reference patterns:

- `frontend/server/services/price-intelligence.ts`
- `frontend/server/api/vehicles/[id]/price/analysis.get.ts`
- `frontend/server/api/vehicles/[id]/price/history.get.ts`
- `frontend/server/api/auction/market-data/price-guide.get.ts`

### 6. Explainable matching and alternatives

Vehicle matching should return more than a score. The marketplace's matching, buyer-copilot, recommendations, watches, and similar-vehicle capabilities should produce an explainable result usable by salespeople, customers, AI, and automation.

Recommended `VehicleMatchResult`:

- Requested criteria and their source.
- Candidate vehicle snapshot.
- Overall score and confidence.
- Hard constraints passed or failed.
- Weighted factor scores.
- Exact matches, acceptable deviations, and conflicts.
- Price and location distance.
- Freshness and availability status.
- Explanation safe for customer display.
- Internal diagnostic explanation.
- Matching model or rules version.

CRM applications:

- Suggest available alternatives when enquired stock is sold.
- Prioritize leads against current inventory.
- Build saved searches and customer watches.
- Generate salesperson follow-up suggestions.
- Power receptionist answers such as "similar vehicles at another location".
- Explain why a recommendation was made rather than presenting opaque AI output.

Reference patterns:

- `frontend/server/services/vehicle-match-scoring.ts`
- `frontend/server/services/vehicle-match-decisions.ts`
- `frontend/server/services/buyer-copilot/recommendations.ts`
- `frontend/server/api/vehicles/[id]/similar.get.ts`
- `frontend/server/api/customer/watches/**`

### 7. Location and market context

The marketplace explicitly models location-aware inventory and multi-country behavior. CRM automotive configuration should use the same conceptual separation:

- Country and market.
- Legal entity and dealer group.
- Dealership and physical location.
- Seller and feed source.
- Inventory location and customer search location.
- Distance, service radius, timezone, currency, language, units, tax, and disclosure policy.

Location is not a free-text label. It affects availability, routing, price interpretation, receptionist hours, appointments, advertising, regulatory language, and reporting.

Reference patterns:

- `docs/PRD-LOCATION-SYSTEM.md`
- `docs/MULTI_COUNTRY_PRD.md`
- `frontend/server/api/dealers/[id]/location.get.ts`
- `frontend/app/config/markets.ts`
- `frontend/server/utils/geo.ts`

### 8. Customer intent and preference signals

The marketplace builds explicit and inferred vehicle preferences with source events, confidence, timestamps, vehicle and enquiry linkage, and provenance. This is useful, but CRM must own the canonical customer profile.

Recommended signal flow:

1. Marketplace emits consent-permitted behavioral or declared-preference events.
2. CRM resolves the event to an anonymous profile, person, lead, or opportunity.
3. CRM stores each signal with source, purpose, confidence, consent, and expiry.
4. CRM derives a customer summary without overwriting explicit facts with weaker inferred data.
5. Sales and AI experiences display provenance and permit correction.

Useful signals include viewed vehicles, saved vehicles, comparison sets, preferred make/model/body/fuel, price range, location radius, finance interest, trade-in intent, urgency, and buying stage.

Do not use inferred sensitive traits, undisclosed cross-site tracking, or advertising consent for CRM communication purposes.

Reference pattern: `frontend/server/services/customer-profile-signals.ts`.

### 9. Event transport governance

The marketplace event transport work demonstrates strict policy artifacts, environment-specific authorities, queue and DLQ evidence, retry budgets, freshness thresholds, reconciliation, trust records, and activation gates.

Bring across the principles, not the entire implementation complexity:

- Default production integrations to inert until an approved adapter is installed.
- Pin versioned transport and policy artifacts.
- Separate live authorities from pure evaluation code.
- Define retry, timeout, cleanup, lock, queue, and DLQ limits.
- Reconcile queue observations against database delivery truth.
- Require explicit owners, runbooks, approval, expiry, and alert routes.
- Hash approved policy artifacts and reject malformed or duplicate-key documents.

Reference patterns:

- `frontend/server/services/ads/marketplace-event-transport-live-authorities.ts`
- `frontend/server/services/ads/marketplace-event-transport-policy-provenance.ts`
- `frontend/server/services/ads/marketplace-event-transport-reconciliation.ts`

### 10. Audience and advertising intelligence

The marketplace's media network can supply vehicle-interest cohorts, inventory cohorts, geographic demand, engagement, and marketplace conversion signals. These can improve agency reporting and campaign activation if purpose and consent boundaries are enforced.

Recommended uses:

- Inventory-aware campaign audiences.
- Suppression of sold or unavailable vehicles.
- Aged-stock and high-supply campaign opportunities.
- Demand-versus-stock reporting by location and category.
- Closed-loop campaign reporting from impression through enquiry and sale.
- Creative and landing-page performance by vehicle cohort.

The CRM should provide lifecycle outcomes back through purpose-limited conversion events. It should not expose the full customer record to the marketplace advertising system.

## Proposed integration contracts

### Product Data API

- `GET /v1/automotive/vehicles/{marketplaceVehicleId}`
- `GET /v1/automotive/vehicles:resolve`
- `POST /v1/automotive/vehicles:search`
- `GET /v1/automotive/vehicles/{id}/snapshot`
- `GET /v1/automotive/vehicles/{id}/similar`
- `GET /v1/automotive/vehicles/{id}/market-signals`
- `GET /v1/automotive/vehicles/{id}/price-history`
- `GET /v1/automotive/taxonomy/**`
- `GET /v1/automotive/dealers/{externalRef}/feed-health`

### Events published by marketplace

- `automotive.vehicle.created`
- `automotive.vehicle.updated`
- `automotive.vehicle.repriced`
- `automotive.vehicle.availability_changed`
- `automotive.vehicle.withdrawn`
- `automotive.vehicle.identity_merged`
- `automotive.vehicle.identity_split`
- `automotive.vehicle.enrichment_updated`
- `automotive.feed.sync_completed`
- `automotive.feed.degraded`
- `automotive.feed.recovered`
- `automotive.market_signal.updated`

### Events published by CRM

- `crm.product_interest.created`
- `crm.lead.confirmed`
- `crm.opportunity.stage_changed`
- `crm.appointment.created`
- `crm.vehicle.sale_attributed`
- `crm.product_match.feedback_recorded`

All contracts require tenant mapping, location scope, schema version, idempotency, HMAC signatures or equivalent service authentication, replay protection, correlation, causation, provenance, and retention classification.

## Data freshness and degraded behavior

Each response should report:

- `observedAt`
- `sourceUpdatedAt`
- `ingestedAt`
- `enrichedAt`
- `lastFeedSuccessAt`
- `freshnessStatus`
- `provenance`
- `qualityScore`
- `warnings`

Recommended behavior:

- Use ETag and conditional requests for vehicle records.
- Cache stable taxonomy longer than inventory availability.
- Use stale-while-revalidate for non-transactional read views.
- Do not create bookings, promises, valuations, or availability claims from stale data.
- Show the last known snapshot with a stale indicator when marketplace reads fail.
- Queue and reconcile CRM projections rather than blocking lead capture.
- Alert on feed lag, count divergence, identity conflicts, unusual price changes, and enrichment regressions.

## Security, privacy, and licensing requirements

- Keep marketplace and CRM databases independently owned; no cross-application table writes.
- Minimize VIN, registration, seller credentials, and customer PII in events.
- Tokenize or mask restricted identifiers where full values are unnecessary.
- Enforce source licensing and permitted-use metadata for specifications, valuations, images, and market data.
- Record whether each field may be shown publicly, internally, to AI, to MCP clients, or in advertising.
- Apply purpose-specific consent to behavioral and audience signals.
- Prevent prompt or retrieved web content from altering source, market, seller, or tenant scope.
- Sign webhooks and support key rotation, timestamp validation, replay windows, and idempotent processing.
- Apply export, deletion, correction, and retention policy independently to CRM and marketplace records.

## Patterns not to copy directly

### Shared database access

Do not let CRM query marketplace Neon, Hyperdrive, Qdrant, or internal ingestion tables. That creates schema coupling, bypasses authorization, and makes marketplace migrations CRM incidents.

### Marketplace customer identity as CRM identity

Marketplace accounts and anonymous behavior are evidence sources, not the canonical CRM person. Resolve them through governed identity links with confidence, consent, and merge history.

### Email-only profile aggregation

Email is useful but not a sufficient global identity key. Use verified channel identities and explicit identity-link records.

### AI-generated or scraped facts without provenance

URL ingestion and LLM fallback can propose records. Only reviewed or policy-promoted canonical records should power receptionist claims or customer-facing CRM automation.

### VIN-only deduplication

VIN is strong where present and licensed, but availability, privacy, malformed values, reused identifiers, and listing-versus-vehicle distinctions require source and seller context.

### Marketplace billing as CRM entitlement

Marketplace subscriptions, advertising budgets, CRM plans, telephony usage, and AI usage have different products and ledgers. They can share a billing platform but must retain separate entitlements and metering dimensions.

### Opaque recommendation scores

Do not copy a score without criteria, confidence, freshness, explanation, model version, and feedback capture.

### Cross-purpose audience activation

A marketplace interaction cannot automatically authorize CRM outreach or advertising activation. Purpose, consent, market, retention, and suppression policy must be evaluated independently.

## Recommended implementation sequence

### Phase 1: Ownership and contracts

- Approve the marketplace-versus-CRM system-of-record matrix.
- Define dealer and location mapping.
- Define vehicle identity, snapshot, taxonomy, market-signal, match-result, feed-health, and event schemas.
- Define field-level provenance, freshness, quality, visibility, licensing, and retention metadata.

### Phase 2: Read-only CRM enrichment

- Connect vehicle resolution and snapshot APIs.
- Add product-interest cards to leads and opportunities.
- Add live status, price, location, freshness, and feed-health indicators.
- Add receptionist read-only inventory search with safe stale-data behavior.

### Phase 3: Event synchronization

- Subscribe to vehicle availability, price, identity, enrichment, and feed-health events.
- Store a CRM projection and durable delivery evidence.
- Trigger assigned-user alerts without modifying CRM lifecycle automatically.

### Phase 4: Matching and market intelligence

- Add explainable alternatives, price analysis, customer watches, and salesperson recommendations.
- Capture accept, reject, contacted, appointment, qualified, won, and lost feedback.
- Evaluate recommendation quality and bias by market and cohort.

### Phase 5: Closed-loop automation

- Add policy-controlled follow-up for price drops, replacement inventory, feed recovery, and unavailable stock.
- Return qualified lead, appointment, and sale outcomes as purpose-limited marketplace conversion events.
- Add inventory-aware campaign and attribution reporting.

### Phase 6: Mobile, AI, and MCP exposure

- Expose product context and safe search through mobile APIs.
- Permit AI receptionist and CRM copilots to use read-only marketplace tools through trusted execution context.
- Expose carefully scoped automotive product and market tools through the CRM MCP server, with client approval and audit.

## Highest-value initial CRM views

- Lead vehicle card with enquiry-time snapshot and current status.
- Vehicle availability and price-change timeline.
- Alternative inventory with match explanations.
- Customer vehicle-interest and comparison history.
- Feed health and inventory freshness warning.
- Demand-versus-stock dashboard by dealership, location, make, model, body, fuel, and price band.
- Campaign spend, leads, appointments, sales, and revenue by vehicle and inventory cohort.
- AI receptionist inventory answer audit showing sources and freshness.

## Definition of successful integration

The integration succeeds when:

- CRM can resolve and snapshot a vehicle without marketplace database access.
- Leads remain capturable when marketplace services are unavailable.
- Product truth, provenance, freshness, and quality are visible.
- Vehicle changes are delivered idempotently and reconciled.
- Customer identity and consent remain CRM-owned.
- AI cannot escape tenant, seller, location, market, or tool policy scope.
- Market intelligence is explainable and never represented as guaranteed fact.
- CRM outcomes improve marketplace reporting without leaking unrestricted customer records.

## Vehicle sale lifecycle and days on market

The marketplace is a source of both active supply and observed sales. The CRM platform should ingest listing episodes and preserve the transition from first seen through active, reserved, sold, withdrawn, expired, transferred, or relisted states.

A missing listing is not sufficient proof of sale. Prefer explicit marketplace, dealer feed, DMS, CRM, or transaction confirmation. Where the application infers a sale, store the evidence, confidence, and methodology separately from confirmed outcomes.

The canonical vehicle projection should support:

- Current inventory status and freshness.
- First advertised and first observed timestamps.
- Dealer days in stock and cumulative marketplace exposure.
- Confirmed or inferred sold timestamp.
- Initial and last advertised price plus price-change history.
- Listing episodes across relists, dealer transfers, and stock-ID changes.
- Tenant-safe joins from vehicle to website interaction, inquiry, lead, opportunity, appointment, and sale.

This enables time-to-sale, active inventory aging, sell-through, price elasticity, inquiry velocity, campaign-to-sale attribution, and local supply-demand benchmarks. Active inventory must remain in time-to-event calculations as right-censored observations rather than being excluded as if only sold vehicles existed.

VIN and dealer stock ID are matching evidence, not globally exposed Persona identifiers. Raw vehicle and dealer data remains source and tenant governed; shared industry outputs use thresholded product, geography, and time cohorts.
