# Nearby Automotive Market Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give agency staff and permitted client-portal users a governed, map-based view of nearby automotive dealerships, while preserving human approval before any public competitor website enters XeroFlow's bounded site-intelligence crawler.

**Architecture:** Add a server-only Google Places adapter and a client-only Google Maps loader around a small nearby-market service boundary. Neon persists only user-confirmed location text, Google Place IDs, decisions, actors, and links to existing monitored domains; Google-supplied names, addresses, coordinates, types, distances, and website values remain transient. Agency users confirm locations, discover and review candidates, then reuse the existing site-intelligence domain and crawl workflow. Portal users can only view discovery results and nominate a Place ID for agency review.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Nitro/H3, Neon Postgres, Google Maps JavaScript API, Google Places API (New), Zod, Vitest, happy-dom, existing Cloudflare Pages and site-intelligence infrastructure.

## Global Constraints

- Follow the approved design in `docs/superpowers/specs/2026-08-01-nearby-automotive-market-discovery-design.md`.
- Use Google Maps only for map display and Google Places API (New) only for address preview, current location resolution, nearby discovery, and selected-candidate website review.
- Persist Google Place IDs, user-confirmed address text, decisions, actors, and independently validated domains. Do not persist Google-supplied names, formatted addresses, coordinates, distances, types, `websiteUri`, Google Maps URIs, or raw provider bodies.
- Never write raw Google payloads to Neon, R2, Vectorize, queues, logs, analytics events, error responses, or AI inputs.
- Use separate least-privilege browser and server credentials. The browser key is origin-restricted; the server key is restricted to Places API (New). Never expose the server key through runtime public config.
- Use explicit Google field masks. Wildcard field masks are prohibited. `websiteUri` may be requested only for an agency user's explicit single-candidate review.
- Nearby Search returns at most 20 places. Present results as “up to 20 discovery candidates” and never claim the list is exhaustive.
- Treat uncertain dealer categories as `unclassified`. Never infer `independent` merely because a known franchise brand was not detected.
- A client nomination never requests a website, creates a domain, starts a crawl, or accepts crawl settings.
- Every approval, save, dismissal, nomination, and location confirmation writes an append-only audit event. Portal actor identity must remain distinct from agency-team actor identity.
- `Approve & index` defaults to competitor lane, 25 pages, depth 1, automatic rendering, manual frequency, 30-day raw retention, `search` purpose, AI input disabled, exact origin, and no subdomains.
- If first crawl creation fails after approval, retain the approved candidate/domain and expose the existing run diagnostics/retry path. Do not roll back approval or create a duplicate domain on retry.
- Use Nuxt UI v4 for all controls. Before editing any form file in Tasks 7–9, invoke the mandatory `frontend-design` skill and apply `UFormField`, constrained responsive grids, `UInput`/`UTextarea`/`USelectMenu`, `UModal`, and `USlideover` conventions.
- All server imports use `~~/server/utils/`. Shared runtime types belong in `.ts` files, not `.d.ts` files.
- Use `apply_patch` for edits, preserve unrelated worktree changes, and stage only the files owned by the active task.
- Follow TDD: add a focused failing test, run it to prove the intended failure, implement the minimum behavior, rerun to green, review every changed file end-to-end, and commit atomically.
- Apply migration 331 automatically to the configured database before committing Task 1.
- Keep `NEARBY_MARKET_DISCOVERY_ENABLED=false` until Google restrictions, quotas, legal copy, readiness, and the Knox pilot gates all pass.
- Do not start the Lilydale validation or enable client nominations until the existing Knox Browser Rendering crawl has a terminal result with the corrected narrow Cloudflare token.
- Do not deploy during Tasks 1–10. Task 11 prepares the pilot and deployment evidence; production activation still requires explicit approval.

---

## File Structure

### Persistence, contracts, and provider policy

- Create `server/database/migrations/331_nearby_automotive_market_discovery.sql` — market locations, candidate decisions, portal permission, audit actor/entity extensions, constraints, and indexes.
- Modify `app/types/site-intelligence.ts` — public nearby-market literal unions and response contracts.
- Create `server/utils/siteIntelligence/nearbyMarketContracts.ts` — route and provider Zod schemas.
- Create `server/utils/siteIntelligence/nearbyMarketRepository.ts` — scoped market-location/candidate persistence and decision transactions.
- Modify `server/utils/siteIntelligence/audit.ts` — optional client-user actor and new entity types without breaking existing callers.
- Create `server/utils/siteIntelligence/googlePlaces.ts` — minimal-field, redacted, timeout-bounded Places API adapter.
- Create `server/utils/siteIntelligence/nearbyMarket.ts` — location resolution, classification, distance, merging, and review orchestration.
- Modify `server/utils/rateLimit.ts` — opt-in fail-closed behavior for billable provider routes.
- Modify `nuxt.config.ts` and `wrangler.toml` — independent feature flag and environment configuration; no server credential in source.

### Agency API and workflow bridge

- Create `server/api/agency/site-intelligence/market-locations/index.get.ts`.
- Create `server/api/agency/site-intelligence/market-locations/[id].put.ts`.
- Create `server/api/agency/site-intelligence/nearby-market/search.post.ts`.
- Create `server/api/agency/site-intelligence/nearby-market/candidates/[placeId].get.ts`.
- Create `server/api/agency/site-intelligence/nearby-market/candidates/[placeId]/decision.post.ts`.
- Create `server/api/agency/site-intelligence/nearby-market/nominations.get.ts`.
- Reuse `createSiteIntelligenceDomain()` and `startGovernedSiteIntelligenceCrawl()`; do not duplicate crawler creation logic.

### Client-portal API and permission propagation

- Create `server/api/client-portal/site-intelligence/nearby-market.get.ts`.
- Create `server/api/client-portal/site-intelligence/candidates/[placeId]/nominate.post.ts`.
- Modify `server/utils/clientAuth.ts`, `app/types/index.ts`, `app/composables/usePortalAuth.ts`, portal auth responses, and agency client-user administration routes to carry `canNominateCompetitors`.

### Shared and agency UI

- Create `app/composables/useGoogleMaps.ts` — singleton Maps JavaScript loader.
- Create `app/composables/useNearbyMarket.ts` — agency view state and independently retryable resources.
- Create `app/components/site-intelligence/NearbyMarketMap.client.vue` — map, radius circle, markers, and selection events.
- Create `app/components/analytics/audiences/intelligence/NearbyMarketPanel.vue`.
- Create `app/components/analytics/audiences/intelligence/MarketLocationModal.vue`.
- Create `app/components/analytics/audiences/intelligence/CandidateReviewSlideover.vue`.
- Create `app/components/analytics/audiences/intelligence/NominationQueue.vue`.
- Modify `app/pages/agency/analytics/audiences/intelligence.vue`.

### Portal UI, operations, and public product sync

- Create `app/pages/portal/analytics/market.vue`.
- Create `app/components/portal/NearbyMarketPanel.vue`.
- Create `app/components/portal/CompetitorNominationModal.vue`.
- Modify `app/layouts/portal.vue`, `app/pages/portal/features.vue`, and `app/pages/agency/client-portal.vue`.
- Modify `server/api/agency/site-intelligence/readiness.get.ts`.
- Modify `app/pages/privacy.vue`, `app/pages/terms.vue`, `app/pages/features/index.vue`, `app/pages/features/[slug].vue`, and `app/components/MarketingNav.vue` where the existing Website Audience Intelligence entry is surfaced.
- Create `docs/runbooks/nearby-automotive-market.md`.

---

### Task 1: Add the persistence boundary and shared contracts

**Files:**
- Create: `server/database/migrations/331_nearby_automotive_market_discovery.sql`
- Modify: `app/types/site-intelligence.ts`
- Create: `server/utils/siteIntelligence/nearbyMarketContracts.ts`
- Create: `server/utils/siteIntelligence/nearbyMarketRepository.ts`
- Modify: `server/utils/siteIntelligence/audit.ts`
- Create: `test/config/nearbyAutomotiveMarketMigration.test.ts`
- Create: `test/server/utils/siteIntelligence/nearbyMarketContracts.test.ts`
- Create: `test/server/utils/siteIntelligence/audit.test.ts`

**Interfaces:**
- Produces: `NearbyMarketRadius = 10 | 25 | 50`, `DealerCategory`, `CandidateState`, `CandidateSource`, `PortalCandidateState`, `NearbyMarketCandidate`, `NearbyMarketResponse`, and candidate-review contracts.
- Produces: `client_market_locations`, `site_intelligence_candidates`, `client_users.can_nominate_competitors`, and audit support for a nullable `client_actor_id`.
- Consumed later by: every nearby-market route, agency/portal composables, and map/list components.

- [ ] **Step 1: Write failing migration and contract tests**

Assert the SQL contains a partial unique index for one primary location per client, unique candidate tuple, state/source/radius checks, both actor foreign keys, and a constraint preventing simultaneous team/client actors. Assert schemas reject invalid radii, empty nomination reasons, body-supplied portal client IDs, and unsupported decisions.

```ts
expect(nearbySearchSchema.parse({ clientId, radiusKm: 25 })).toEqual({
  clientId,
  radiusKm: 25,
  includeUsedIndependent: false,
})
expect(() => nearbySearchSchema.parse({ clientId, radiusKm: 30 })).toThrow()
expect(() => portalNominationSchema.parse({ reason: '  ' })).toThrow()
expect(() => portalNominationSchema.parse({ clientId, reason: 'Local rival' })).toThrow()
```

- [ ] **Step 2: Run the focused tests and observe the missing-contract failures**

```bash
pnpm vitest run test/config/nearbyAutomotiveMarketMigration.test.ts test/server/utils/siteIntelligence/nearbyMarketContracts.test.ts test/server/utils/siteIntelligence/audit.test.ts
```

Expected: FAIL because migration 331, nearby contracts, and client audit actors do not exist.

- [ ] **Step 3: Define the exact public literal unions**

```ts
export type NearbyMarketRadius = 10 | 25 | 50
export type DealerCategory = 'franchise_new' | 'used' | 'independent' | 'unclassified'
export type SiteIntelligenceCandidateState = 'saved' | 'nominated' | 'approved' | 'dismissed'
export type SiteIntelligenceCandidateSource = 'agency' | 'client_portal'
export type PortalCandidateState = 'suggested' | 'under_review' | 'monitored' | 'not_selected'
```

`NearbyMarketCandidate` may carry transient provider fields in an API response but must not be accepted by repository write methods. Repository inputs take only IDs, state, reasons, radius, and actor IDs.

- [ ] **Step 4: Create additive migration 331**

Add `client_market_locations` and `site_intelligence_candidates` with UUID keys, `TIMESTAMPTZ`, bounded text/reason lengths, `ON DELETE CASCADE` from client/location, `ON DELETE SET NULL` from approved domain and actors, and indexes for client/state/review age. Add:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS client_market_locations_one_primary
  ON client_market_locations (client_id)
  WHERE is_primary = TRUE;

ALTER TABLE client_users
  ADD COLUMN IF NOT EXISTS can_nominate_competitors BOOLEAN NOT NULL DEFAULT FALSE;
```

Add `UNIQUE (client_id, id)` to market locations and use composite foreign keys
from candidates to `(client_id, market_location_id)` and from candidates to the
existing domain `(client_id, approved_domain_id)`. This makes cross-client links
invalid even if an application check regresses. Drop and recreate the existing
`site_intelligence_audit_events_entity_type_check` constraint to add
`market_location` and `candidate`; add `client_actor_id UUID REFERENCES
client_users(id) ON DELETE SET NULL`; and require `NOT (actor_id IS NOT NULL AND
client_actor_id IS NOT NULL)`.

- [ ] **Step 5: Implement repository and backward-compatible audit contracts**

Use:

```ts
export interface SiteIntelligenceAuditActor {
  id: string | null
  clientUserId?: string | null
}
```

Insert both actor columns. Existing `{ id }` callers must behave unchanged. Repository methods must take an explicit `clientId` and include it in every `WHERE`, conflict target, and returned row.

- [ ] **Step 6: Run the focused tests to green**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 7: Apply and verify migration 331 automatically**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/331_nearby_automotive_market_discovery.sql
psql "$DATABASE_URL" -c "SELECT to_regclass('public.client_market_locations'), to_regclass('public.site_intelligence_candidates')"
```

Expected: both relation names returned; `client_users.can_nominate_competitors` exists and defaults false.

- [ ] **Step 8: Review and commit the persistence boundary**

Re-read every changed file; verify no Google display payload column exists, no audit caller broke, and every repository query scopes by client. Then:

```bash
git add server/database/migrations/331_nearby_automotive_market_discovery.sql app/types/site-intelligence.ts server/utils/siteIntelligence/nearbyMarketContracts.ts server/utils/siteIntelligence/nearbyMarketRepository.ts server/utils/siteIntelligence/audit.ts test/config/nearbyAutomotiveMarketMigration.test.ts test/server/utils/siteIntelligence/nearbyMarketContracts.test.ts test/server/utils/siteIntelligence/audit.test.ts
git commit -m "feat: add nearby market persistence contracts"
```

---

### Task 2: Build the fail-closed Google Places and rate-limit boundary

**Files:**
- Create: `server/utils/siteIntelligence/googlePlaces.ts`
- Create: `server/utils/siteIntelligence/nearbyMarket.ts`
- Modify: `server/utils/rateLimit.ts`
- Modify: `nuxt.config.ts`
- Modify: `wrangler.toml`
- Create: `test/server/utils/siteIntelligence/googlePlaces.test.ts`
- Create: `test/server/utils/siteIntelligence/nearbyMarket.test.ts`
- Create: `test/server/utils/rateLimit.test.ts`
- Create: `test/config/nearbyMarketRuntimeConfig.test.ts`

**Interfaces:**
- Produces: `GooglePlacesClient`, `GooglePlacesErrorCode`, `previewAddress()`, `resolvePlaceLocation()`, `searchNearbyDealers()`, `reviewCandidateWebsite()`, `classifyDealer()`, `haversineDistanceKm()`, and fail-closed billable-rate enforcement.
- Consumes: runtime config and the schemas from Task 1.

- [ ] **Step 1: Write failing provider-contract tests**

Inject a fake `fetch` and assert exact URLs, method, request bodies, field-mask headers, 8-second abort behavior, two-attempt maximum for 429/5xx, and no retry for 400/401/403. Assert thrown errors expose only:

```ts
type GooglePlacesErrorCode =
  | 'not_configured'
  | 'auth'
  | 'rate_limited'
  | 'quota'
  | 'invalid_request'
  | 'unavailable'
  | 'malformed_response'
```

Capture `console.error` and prove neither raw bodies nor keys are logged. Assert `checkAndConsume({ failureMode: 'closed' })` throws 503 on DB failure while its default remains fail-open for existing callers.

- [ ] **Step 2: Run the provider tests and observe failures**

```bash
pnpm vitest run test/server/utils/siteIntelligence/googlePlaces.test.ts test/server/utils/siteIntelligence/nearbyMarket.test.ts test/server/utils/rateLimit.test.ts test/config/nearbyMarketRuntimeConfig.test.ts
```

Expected: FAIL because the provider adapter and fail-closed option do not exist.

- [ ] **Step 3: Implement four explicit provider requests**

Use these exact masks and never `*`:

```ts
const ADDRESS_MASK = 'places.id,places.displayName,places.formattedAddress,places.location'
const LOCATION_MASK = 'id,location'
const NEARBY_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.primaryType,places.types,places.googleMapsUri'
const WEBSITE_MASK = 'id,displayName,formattedAddress,googleMapsUri,websiteUri,businessStatus'
```

Address preview posts to `places:searchText` with `pageSize: 5`, `languageCode: 'en'`, and `regionCode: 'AU'`. Location and website review use Place Details. Nearby Search posts `includedTypes: ['car_dealer']`, `maxResultCount: 20`, `rankPreference: 'DISTANCE'`, and a circular restriction using 10/25/50 kilometres converted to metres.

- [ ] **Step 4: Add conservative classification and distance helpers**

Run explicit used-dealer name signals first, known Australian franchise aliases second, and return `unclassified` otherwise. Do not return `independent` from absence of evidence. Calculate server-side haversine distance from transient coordinates and round only for display.

- [ ] **Step 5: Add fail-closed throttling and runtime flags**

Extend `RateLimitOptions`:

```ts
failureMode?: 'open' | 'closed'
```

Keep `open` as the default. Nearby billable routes use `closed`. Add private runtime keys `googlePlacesServerApiKey` and `nearbyMarketDiscoveryEnabled`; public keys `nearbyMarketDiscoveryEnabled`, `googleMapsBrowserApiKey`, and `googleMapsMapId`. Set the nearby flag false in committed config and never commit either API key.

- [ ] **Step 6: Run the provider tests to green**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 7: Review and commit the provider boundary**

Search for wildcard masks, raw response logging, `websiteUri` in discovery, and public server keys. Then:

```bash
git add server/utils/siteIntelligence/googlePlaces.ts server/utils/siteIntelligence/nearbyMarket.ts server/utils/rateLimit.ts nuxt.config.ts wrangler.toml test/server/utils/siteIntelligence/googlePlaces.test.ts test/server/utils/siteIntelligence/nearbyMarket.test.ts test/server/utils/rateLimit.test.ts test/config/nearbyMarketRuntimeConfig.test.ts
git commit -m "feat: add governed Google Places discovery boundary"
```

---

### Task 3: Implement confirmed market locations and agency discovery

**Files:**
- Create: `server/api/agency/site-intelligence/market-locations/index.get.ts`
- Create: `server/api/agency/site-intelligence/market-locations/[id].put.ts`
- Create: `server/api/agency/site-intelligence/nearby-market/search.post.ts`
- Create: `test/server/api/agency/siteIntelligenceMarketLocations.test.ts`
- Create: `test/server/api/agency/siteIntelligenceNearbySearch.test.ts`

**Interfaces:**
- `GET /market-locations?clientId=...` returns the confirmed primary location record.
- `PUT /market-locations/[clientId]` accepts either `{ action: 'preview', addressText }` or `{ action: 'confirm', placeId, label, addressText }`.
- `POST /nearby-market/search` accepts `{ clientId, radiusKm, includeUsedIndependent?, brand?, monitoringStatus? }` and returns transient candidates merged with persisted state.

- [ ] **Step 1: Write failing route tests**

Cover 401, non-admin mutation rejection, client-access rejection, disabled feature, missing config, no confirmed location, address preview without writes, confirm re-fetching current Place Details, 10/25/50 validation, and result merging. Assert search does not call website review and does not persist provider display fields.

- [ ] **Step 2: Run the route tests and observe missing-route failures**

```bash
pnpm vitest run test/server/api/agency/siteIntelligenceMarketLocations.test.ts test/server/api/agency/siteIntelligenceNearbySearch.test.ts
```

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement location preview and confirmation**

Reuse `requireRole(event, ['owner', 'admin'])` for mutation and `requireClientTrackingAccess(event, clientId)` for client scoping. Preview returns up to five transient choices and writes nothing. Confirm re-fetches the selected Place ID's current coordinates server-side, upserts one primary location with the reviewer-entered address text, and audits `market_location.confirmed` with only safe IDs/labels.

- [ ] **Step 4: Implement discovery with layered fail-closed limits**

Before a billed call, enforce:

```ts
{ key: `nearby-market:agency:user:${user.id}`, limit: 30, windowSeconds: 600, failureMode: 'closed' }
{ key: `nearby-market:agency:client:${clientId}`, limit: 60, windowSeconds: 600, failureMode: 'closed' }
{ key: `nearby-market:org:daily`, limit: 500, windowSeconds: 86400, failureMode: 'closed' }
```

Resolve the stored Place ID, search the selected radius, calculate distance, classify conservatively, merge saved/nominated/approved/dismissed decisions and existing domain status, then apply UI filters server-side. Return `limited: candidates.length === 20` and wording that results are not exhaustive.

- [ ] **Step 5: Run route tests to green and commit**

Run Step 2. Re-read the routes to confirm every client ID is access-checked and no raw provider response crosses the boundary. Then:

```bash
git add server/api/agency/site-intelligence/market-locations server/api/agency/site-intelligence/nearby-market/search.post.ts test/server/api/agency/siteIntelligenceMarketLocations.test.ts test/server/api/agency/siteIntelligenceNearbySearch.test.ts
git commit -m "feat: add agency nearby market discovery APIs"
```

---

### Task 4: Implement agency review, decisions, and idempotent approval

**Files:**
- Create: `server/api/agency/site-intelligence/nearby-market/candidates/[placeId].get.ts`
- Create: `server/api/agency/site-intelligence/nearby-market/candidates/[placeId]/decision.post.ts`
- Create: `server/api/agency/site-intelligence/nearby-market/nominations.get.ts`
- Modify: `server/utils/siteIntelligence/nearbyMarketRepository.ts`
- Modify: `server/utils/siteIntelligence/nearbyMarket.ts`
- Modify: `server/utils/siteIntelligence/repository.ts`
- Create: `test/server/api/agency/siteIntelligenceCandidateReview.test.ts`
- Create: `test/server/api/agency/siteIntelligenceCandidateDecision.test.ts`

**Interfaces:**
- Candidate review requires `clientId` and current confirmed location, returns one transient website result plus canonical-origin/duplicate status, and is agency-admin only.
- Decision body is a discriminated union: `save`, `dismiss`, or `approve_and_index`. Dismiss and approval require bounded reviewer reasons; approval accepts either the currently reviewed Google website or a manually entered website and fixed pilot crawl settings.
- Nominations route returns persisted queue metadata; current provider display name is resolved only when a reviewer opens an item.

- [ ] **Step 1: Write failing decision and race tests**

Cover auth, management role, mismatched client/location/Place ID, on-demand website lookup, missing website, invalid/private/manual URL, duplicate existing domain, repeat save/dismiss, two simultaneous approvals, and crawl-start failure after approval. Assert portal users cannot reach either route.

- [ ] **Step 2: Run the tests and observe missing-route failures**

```bash
pnpm vitest run test/server/api/agency/siteIntelligenceCandidateReview.test.ts test/server/api/agency/siteIntelligenceCandidateDecision.test.ts
```

Expected: FAIL because review and decision routes do not exist.

- [ ] **Step 3: Implement on-demand candidate review**

Enforce `20/hour` per agency user and the global daily ceiling with fail-closed limits. Request `WEBSITE_MASK` only here. Pass a returned or manual website through `assertPublicSiteOrigin()`, then look up an existing `(client_id, origin, lane='competitor')` domain. Return no provider response body and no credential details.

- [ ] **Step 4: Implement idempotent candidate decisions**

Use a transaction and row lock on the client/location/Place tuple. Insert the
candidate conflict target before `SELECT ... FOR UPDATE` so the lock also works
for a first-time approval. Refactor `createSiteIntelligenceDomain()` to accept an
optional repository executor while preserving its existing two-argument API;
this lets candidate approval and domain creation share one database transaction
without duplicating the established domain insert/audit logic. Save and dismiss
upsert one candidate row and append audit events. Approval must:

1. re-fetch and revalidate the selected current website or validate manual origin;
2. link an existing competitor domain or call `createSiteIntelligenceDomain()` with the fixed pilot defaults;
3. set candidate state to `approved` and `approved_domain_id` once;
4. append a safe approval audit event; and
5. after the approval transaction commits, call `startGovernedSiteIntelligenceCrawl(event, user, domainId, 'manual')` only if no first run exists.

Use these defaults:

```ts
{
  clientId, lane: 'competitor',
  name: new URL(origin).hostname,
  origin,
  justification: reviewerReason,
  status: 'active', discoveryMode: 'sitemaps',
  includePatterns: [], excludePatterns: [], includeSubdomains: false,
  renderMode: 'auto', pageLimit: 25, depth: 1, frequency: 'manual',
  crawlPurposes: ['search'], aiInputAllowed: false, retentionDays: 30,
}
```

Derive the persisted domain name from the validated canonical hostname, not the
transient Google display name. The reviewer reason becomes the existing domain
justification.

- [ ] **Step 5: Run tests to green and commit**

Run Step 2. Re-read domain/crawl integration; confirm approval survives a crawl-start error, concurrent calls produce one domain and at most one first run, and nominations never trigger website lookup. Then:

```bash
git add server/api/agency/site-intelligence/nearby-market/candidates server/api/agency/site-intelligence/nearby-market/nominations.get.ts server/utils/siteIntelligence/nearbyMarketRepository.ts server/utils/siteIntelligence/nearbyMarket.ts server/utils/siteIntelligence/repository.ts test/server/api/agency/siteIntelligenceCandidateReview.test.ts test/server/api/agency/siteIntelligenceCandidateDecision.test.ts
git commit -m "feat: add governed competitor approval workflow"
```

---

### Task 5: Propagate the portal nomination permission

**Files:**
- Modify: `server/utils/clientAuth.ts`
- Modify: `app/types/index.ts`
- Modify: `app/composables/usePortalAuth.ts`
- Modify: `server/api/agency/client-portal/invite.post.ts`
- Modify: `server/api/agency/client-portal/users/[id].put.ts`
- Modify: `server/api/agency/client-portal/users.get.ts`
- Modify: `server/api/agency/client-portal/auth/login.post.ts`
- Modify: `server/api/agency/client-portal/auth/me.get.ts`
- Modify: `server/api/agency/client-portal/users/[id].get.ts`
- Modify: `server/api/portal/auth/login.post.ts`
- Modify: `server/api/portal/auth/me.get.ts`
- Modify: `server/api/portal/users/index.get.ts`
- Create: `test/server/clientPortalCompetitorPermission.test.ts`

**Interfaces:**
- Adds `ClientPermissions.canNominateCompetitors: boolean` end to end.
- Defaults false for existing and invited client users unless an agency administrator opts in.

- [ ] **Step 1: Write a failing permission propagation test**

Assert the database select, server user mapper, login/me responses, invite insert, update allowlist, users list/detail, browser type, and portal composable all carry `canNominateCompetitors` and default to false.

- [ ] **Step 2: Run the test and observe the missing-property failure**

```bash
pnpm vitest run test/server/clientPortalCompetitorPermission.test.ts
```

- [ ] **Step 3: Add the permission everywhere without widening analytics access**

The portal API checks both `canViewAnalytics` for reading and `canNominateCompetitors` for mutation. Do not infer nomination access from primary-contact, admin, CRM, or analytics permissions.

- [ ] **Step 4: Run to green, review response parity, and commit**

```bash
pnpm vitest run test/server/clientPortalCompetitorPermission.test.ts
git add server/utils/clientAuth.ts app/types/index.ts app/composables/usePortalAuth.ts server/api/agency/client-portal/invite.post.ts server/api/agency/client-portal/users/[id].put.ts server/api/agency/client-portal/users.get.ts server/api/agency/client-portal/auth/login.post.ts server/api/agency/client-portal/auth/me.get.ts server/api/agency/client-portal/users/[id].get.ts server/api/portal/auth/login.post.ts server/api/portal/auth/me.get.ts server/api/portal/users/index.get.ts test/server/clientPortalCompetitorPermission.test.ts
git commit -m "feat: add client competitor nomination permission"
```

---

### Task 6: Add client-scoped discovery and nomination APIs

**Files:**
- Create: `server/api/client-portal/site-intelligence/nearby-market.get.ts`
- Create: `server/api/client-portal/site-intelligence/candidates/[placeId]/nominate.post.ts`
- Modify: `server/utils/siteIntelligence/nearbyMarketRepository.ts`
- Create: `test/server/api/clientPortalNearbyMarket.test.ts`
- Create: `test/server/api/clientPortalCompetitorNomination.test.ts`

**Interfaces:**
- `GET /api/client-portal/site-intelligence/nearby-market?radiusKm=25&...` derives client/user exclusively from `requireClientAuth()` and returns simplified transient candidates and portal state labels.
- `POST /api/client-portal/site-intelligence/candidates/[placeId]/nominate` accepts only `{ marketLocationId, radiusKm, reason }`.

- [ ] **Step 1: Write failing portal boundary tests**

Cover 401, `canViewAnalytics=false`, `canNominateCompetitors=false`, body/query client-ID rejection, missing location, provider errors, default-hidden dismissed results, nomination reason limits, duplicate nominations, two client actors nominating the same Place ID, and audit preservation. Prove neither route calls website review, URL policy, domain creation, crawl start, R2, Vectorize, queue, or AI.

- [ ] **Step 2: Run the tests and observe missing-route failures**

```bash
pnpm vitest run test/server/api/clientPortalNearbyMarket.test.ts test/server/api/clientPortalCompetitorNomination.test.ts
```

- [ ] **Step 3: Implement portal discovery and nomination**

Use fail-closed limits of `10/10 minutes` per portal user, `30/10 minutes` per client, and the same `500/day` organization ceiling. Map states exactly:

```ts
const portalState = {
  nominated: 'under_review', approved: 'monitored', dismissed: 'not_selected', saved: 'suggested'
} as const
```

Nomination upserts the one client/location/Place row to `nominated`, records the latest bounded reason and actor, and appends `candidate.nominated` for every submission so multiple nominators remain auditable.

- [ ] **Step 4: Run tests to green and commit**

```bash
pnpm vitest run test/server/api/clientPortalNearbyMarket.test.ts test/server/api/clientPortalCompetitorNomination.test.ts
git add server/api/client-portal/site-intelligence server/utils/siteIntelligence/nearbyMarketRepository.ts test/server/api/clientPortalNearbyMarket.test.ts test/server/api/clientPortalCompetitorNomination.test.ts
git commit -m "feat: add client competitor nomination APIs"
```

---

### Task 7: Build the shared Google Map and nearby-market composable

**Files:**
- Create: `app/composables/useGoogleMaps.ts`
- Create: `app/composables/useNearbyMarket.ts`
- Create: `app/components/site-intelligence/NearbyMarketMap.client.vue`
- Create: `test/app/composables/useGoogleMaps.test.ts`
- Create: `test/app/composables/useNearbyMarket.test.ts`
- Create: `test/app/components/NearbyMarketMap.contract.test.ts`

**Interfaces:**
- `useGoogleMaps()` returns `{ load, status, error }` and loads Maps once using public runtime config.
- `NearbyMarketMap` props: `center`, `radiusKm`, `candidates`, `selectedPlaceId`; emits `select(placeId)`.
- `useNearbyMarket()` owns radius/filter/selection state and independently retries location, search, candidate review, decisions, and nominations.

- [ ] **Step 1: Invoke the mandatory `frontend-design` skill before touching UI files**

Read the project-specified frontend-design skill completely. Apply its hierarchy, spacing, control, responsive, and non-generic visual principles to Tasks 7–9.

- [ ] **Step 2: Write failing loader, composable, and component contract tests**

Assert a singleton script promise, missing-key error, map-ID use, no SSR access to `window`, radius updates, stale-request cancellation, selected row/marker synchronization, semantic empty/error states, and an equivalent external list requirement.

- [ ] **Step 3: Run the focused tests and observe failures**

```bash
pnpm vitest run test/app/composables/useGoogleMaps.test.ts test/app/composables/useNearbyMarket.test.ts test/app/components/NearbyMarketMap.contract.test.ts
```

- [ ] **Step 4: Implement the dependency-free client loader and map**

Load the official Maps JavaScript URL once, then use `google.maps.importLibrary('maps')` and `google.maps.importLibrary('marker')`. Render `AdvancedMarkerElement` with the configured map ID and a `google.maps.Circle`. Use labelled marker content/status icons; color is supplementary. The map must remain client-only, height-bounded, and fail with an accessible `UAlert` while the ranked list remains usable.

- [ ] **Step 5: Implement view state without coupling provider failures to existing intelligence**

Use abort/request IDs so rapid client/radius changes cannot overwrite new results. Keep filters in refs, default radius to 25, default `includeUsedIndependent=false`, and preserve existing domain registry components if nearby discovery fails.

- [ ] **Step 6: Run tests to green and commit**

```bash
pnpm vitest run test/app/composables/useGoogleMaps.test.ts test/app/composables/useNearbyMarket.test.ts test/app/components/NearbyMarketMap.contract.test.ts
git add app/composables/useGoogleMaps.ts app/composables/useNearbyMarket.ts app/components/site-intelligence/NearbyMarketMap.client.vue test/app/composables/useGoogleMaps.test.ts test/app/composables/useNearbyMarket.test.ts test/app/components/NearbyMarketMap.contract.test.ts
git commit -m "feat: add nearby market map foundation"
```

---

### Task 8: Add the agency nearby-market experience

**Files:**
- Create: `app/components/analytics/audiences/intelligence/NearbyMarketPanel.vue`
- Create: `app/components/analytics/audiences/intelligence/MarketLocationModal.vue`
- Create: `app/components/analytics/audiences/intelligence/CandidateReviewSlideover.vue`
- Create: `app/components/analytics/audiences/intelligence/NominationQueue.vue`
- Modify: `app/pages/agency/analytics/audiences/intelligence.vue`
- Create: `test/app/pages/agency/NearbyMarketPanel.contract.test.ts`
- Create: `test/app/pages/agency/CandidateReviewSlideover.contract.test.ts`

**Interfaces:**
- Adds a self-contained `Nearby market` section without blocking existing Overview, Changes, Gaps, Domains, or Runs data.
- Emits location confirmation, candidate selection, review, save, dismiss, approval, and retry actions through the composable.

- [ ] **Step 1: Write failing source/behavior contracts**

Assert Nuxt UI v4 controls, 10/25/50 radii, UFormField-wrapped location/reviewer/manual-domain fields, list-before-map mobile order, wide split layout, `Up to 20` partial-results warning, used/independent opt-in, status/brand filters, keyboard-selectable rows, three decision actions, fixed crawl preview, provider-specific `UAlert`, and an independent nomination queue.

- [ ] **Step 2: Run the tests and observe missing-component failures**

```bash
pnpm vitest run test/app/pages/agency/NearbyMarketPanel.contract.test.ts test/app/pages/agency/CandidateReviewSlideover.contract.test.ts
```

- [ ] **Step 3: Implement location and discovery UI**

Use `UModal` for address preview/confirmation. Never silently accept a suggested address. Use `USelectMenu` values such as `'all'`, not empty strings. On narrow screens place the ranked list first and the height-bounded map second; on wide screens use a split grid. Marker selection focuses/scrolls the equivalent row and row selection updates the map.

- [ ] **Step 4: Implement review and nomination queue UI**

Use `USlideover` for agency review with one-column constrained form layout. Show canonical origin, validation, duplicate-domain status, 25-page/depth-1/auto/30-day/search/AI-off preview, reviewer reason, and manual website fallback. Disable approval until validation is current. A crawl-start error after approval changes the CTA to the existing retry/view-diagnostics path instead of repeating approval.

- [ ] **Step 5: Run tests, review responsive/dark-mode details, and commit**

```bash
pnpm vitest run test/app/pages/agency/NearbyMarketPanel.contract.test.ts test/app/pages/agency/CandidateReviewSlideover.contract.test.ts
git add app/components/analytics/audiences/intelligence/NearbyMarketPanel.vue app/components/analytics/audiences/intelligence/MarketLocationModal.vue app/components/analytics/audiences/intelligence/CandidateReviewSlideover.vue app/components/analytics/audiences/intelligence/NominationQueue.vue app/pages/agency/analytics/audiences/intelligence.vue test/app/pages/agency/NearbyMarketPanel.contract.test.ts test/app/pages/agency/CandidateReviewSlideover.contract.test.ts
git commit -m "feat: add agency nearby market discovery UI"
```

---

### Task 9: Add the client nomination experience and agency permission controls

**Files:**
- Create: `app/pages/portal/analytics/market.vue`
- Create: `app/components/portal/NearbyMarketPanel.vue`
- Create: `app/components/portal/CompetitorNominationModal.vue`
- Modify: `app/layouts/portal.vue`
- Modify: `app/pages/portal/features.vue`
- Modify: `app/pages/agency/client-portal.vue`
- Create: `test/app/pages/portal/NearbyMarketPortal.contract.test.ts`
- Create: `test/app/pages/agency/ClientPortalPermissions.contract.test.ts`

**Interfaces:**
- Adds `/portal/analytics/market` when `canViewAnalytics` is true.
- Shows the nomination CTA only when `canNominateCompetitors` is true.
- Adds agency invite/edit permission controls defaulting off.

- [ ] **Step 1: Write failing portal and permission UI contracts**

Assert the portal hides website lookup, manual domain, provider diagnostics, crawler settings, approval, save, dismiss, and retry-crawl controls. Assert plain-language `Suggested`, `Under review`, `Monitored`, and `Not selected` labels, a required reason in `UFormField`/`UTextarea`, and confirmation text that nomination does not start indexing.

- [ ] **Step 2: Run tests and observe missing-page failures**

```bash
pnpm vitest run test/app/pages/portal/NearbyMarketPortal.contract.test.ts test/app/pages/agency/ClientPortalPermissions.contract.test.ts
```

- [ ] **Step 3: Implement the simplified portal market**

Reuse the shared map but render a portal-specific ranked list and modal. Derive all client context from portal auth. Keep agency rejection notes and provider errors private. If nomination permission is off, display the market read-only with a clear “Contact your agency” message.

- [ ] **Step 4: Add the opt-in agency permission control**

Add `canNominateCompetitors` to invite/access forms, permission summaries, and preset objects using `UCheckbox` inside the existing governed form sections. Keep every preset false unless the administrator explicitly enables it. Verify the form remains responsive and no duplicate permission section is introduced.

- [ ] **Step 5: Run tests, verify route guard behavior, and commit**

```bash
pnpm vitest run test/app/pages/portal/NearbyMarketPortal.contract.test.ts test/app/pages/agency/ClientPortalPermissions.contract.test.ts
git add app/pages/portal/analytics/market.vue app/components/portal/NearbyMarketPanel.vue app/components/portal/CompetitorNominationModal.vue app/layouts/portal.vue app/pages/portal/features.vue app/pages/agency/client-portal.vue test/app/pages/portal/NearbyMarketPortal.contract.test.ts test/app/pages/agency/ClientPortalPermissions.contract.test.ts
git commit -m "feat: add client competitor nomination experience"
```

---

### Task 10: Add readiness, legal disclosure, marketing sync, and the pilot runbook

**Files:**
- Modify: `server/api/agency/site-intelligence/readiness.get.ts`
- Modify: `app/pages/privacy.vue`
- Modify: `app/pages/terms.vue`
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/components/MarketingNav.vue`
- Create: `docs/runbooks/nearby-automotive-market.md`
- Create: `test/server/api/siteIntelligenceNearbyReadiness.test.ts`
- Create: `test/config/nearbyMarketPublicCopy.test.ts`

**Interfaces:**
- Readiness exposes a separate nearby-market section and does not mark the existing crawler unready while the nearby flag is off.
- Public copy truthfully describes nearby dealership discovery and governed nominations without claiming competitor traffic or audience measurement.

- [ ] **Step 1: Write failing readiness and public-copy tests**

Cover flag off, missing browser key/map ID/server key, configured state, safe boolean output with no key material, and presence of Google Maps terms/privacy disclosures. Assert marketing copy includes human approval and excludes claims such as competitor traffic, conversions, audiences, spend, or exhaustive market coverage.

- [ ] **Step 2: Run tests and observe failures**

```bash
pnpm vitest run test/server/api/siteIntelligenceNearbyReadiness.test.ts test/config/nearbyMarketPublicCopy.test.ts
```

- [ ] **Step 3: Extend readiness independently**

Return booleans/categories only:

```ts
nearbyMarket: {
  enabled: boolean,
  browserKeyConfigured: boolean,
  mapIdConfigured: boolean,
  serverKeyConfigured: boolean,
  placesReady: boolean,
}
```

When the flag is false, existing site-intelligence readiness remains unchanged.

- [ ] **Step 4: Update legal and public product surfaces**

Privacy explains current Google Maps/Places processing, the Place-ID persistence boundary, and Google privacy linkage. Terms reference applicable Google Maps Platform terms and prohibit misuse. Update Website Audience Intelligence feature catalogue/detail/nav copy plus portal feature discovery. Retain dark-mode variants for public hardcoded colors.

- [ ] **Step 5: Write the exact operations runbook**

Document separate key creation/restrictions, allowed production/preview origins, Maps JavaScript and Places API (New) restrictions, quotas/budgets/alerts, env names, feature kill switch, readiness check, Knox-first sequence, Lilydale already-monitored check, portal permission enablement, cost/error monitoring, and three-layer rollback. Include the prerequisite to fix the narrow Cloudflare Browser Rendering token and observe a terminal Knox crawl before this pilot.

- [ ] **Step 6: Run tests, review claims, and commit**

```bash
pnpm vitest run test/server/api/siteIntelligenceNearbyReadiness.test.ts test/config/nearbyMarketPublicCopy.test.ts
git add server/api/agency/site-intelligence/readiness.get.ts app/pages/privacy.vue app/pages/terms.vue app/pages/features/index.vue app/pages/features/[slug].vue app/components/MarketingNav.vue docs/runbooks/nearby-automotive-market.md test/server/api/siteIntelligenceNearbyReadiness.test.ts test/config/nearbyMarketPublicCopy.test.ts
git commit -m "docs: add nearby market readiness and public disclosures"
```

---

### Task 11: Battle-test, pilot, and prepare production activation

**Files:**
- Review: every file changed by Tasks 1–10
- Update only if findings require fixes: the owning source/test files
- Record verification evidence in: `docs/runbooks/nearby-automotive-market.md`

**Interfaces:**
- Produces a green, deployment-ready branch and an explicit go/no-go pilot checklist.
- Does not enable production or deploy without a separate explicit approval.

- [ ] **Step 1: Re-read every changed/new file end-to-end**

Check server `~~/` aliases; complete client scoping; no raw Places persistence/logging; no wildcard field masks; no `websiteUri` during discovery/portal calls; no empty `USelectMenu` values; correct computed/ref reactivity; no duplicate UI sections; valid dark-mode colors; and no new SSRF surface around manual websites.

- [ ] **Step 2: Run the complete focused suite**

```bash
pnpm vitest run \
  test/config/nearbyAutomotiveMarketMigration.test.ts \
  test/server/utils/siteIntelligence/nearbyMarketContracts.test.ts \
  test/server/utils/siteIntelligence/googlePlaces.test.ts \
  test/server/utils/siteIntelligence/nearbyMarket.test.ts \
  test/server/utils/rateLimit.test.ts \
  test/server/api/agency/siteIntelligenceMarketLocations.test.ts \
  test/server/api/agency/siteIntelligenceNearbySearch.test.ts \
  test/server/api/agency/siteIntelligenceCandidateReview.test.ts \
  test/server/api/agency/siteIntelligenceCandidateDecision.test.ts \
  test/server/api/clientPortalNearbyMarket.test.ts \
  test/server/api/clientPortalCompetitorNomination.test.ts \
  test/app/composables/useGoogleMaps.test.ts \
  test/app/composables/useNearbyMarket.test.ts \
  test/app/pages/agency/NearbyMarketPanel.contract.test.ts \
  test/app/pages/portal/NearbyMarketPortal.contract.test.ts \
  test/server/api/siteIntelligenceNearbyReadiness.test.ts \
  test/config/nearbyMarketPublicCopy.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run repository quality gates**

```bash
pnpm exec eslint app/composables/useGoogleMaps.ts app/composables/useNearbyMarket.ts app/components/site-intelligence app/components/analytics/audiences/intelligence app/components/portal/NearbyMarketPanel.vue app/components/portal/CompetitorNominationModal.vue app/pages/portal/analytics/market.vue server/utils/siteIntelligence server/api/agency/site-intelligence server/api/client-portal/site-intelligence
pnpm run typecheck
pnpm run build
pnpm deploy:check
git diff --check
```

Record pre-existing type failures separately; no new error may be attributed to this feature. Build and deployment-target guard must pass.

- [ ] **Step 4: Verify config and provider policy statically**

```bash
rg -n "X-Goog-FieldMask|websiteUri|GOOGLE_PLACES_SERVER_API_KEY|NUXT_PUBLIC_GOOGLE_MAPS" server app nuxt.config.ts wrangler.toml
rg -n "\*" server/utils/siteIntelligence/googlePlaces.ts
rg -n "places|googleMapsUri|formattedAddress|latitude|longitude|websiteUri" server/database/migrations/331_nearby_automotive_market_discovery.sql server/utils/siteIntelligence/nearbyMarketRepository.ts
```

Expected: explicit masks only; server key only in private runtime config; public browser key/map ID only in client loader; no Google display payload columns/repository writes.

- [ ] **Step 5: Run browser acceptance on an approved preview**

Using the browser-testing skill, verify desktop and narrow viewport order, scrolling, keyboard list operation, marker/list synchronization, dark mode, address confirmation, 10/25/50 radii, partial-results warning, provider retry, candidate review, approval preview, portal nomination, and permission-off behavior. Capture network evidence that portal discovery never calls candidate website review and nomination never creates a crawl.

- [ ] **Step 6: Execute the Knox-first pilot gates**

1. Confirm restricted Google keys, quotas, budget alerts, and legal pages.
2. Fix/verify the narrow Browser Rendering token and observe the existing Knox crawl reach a terminal state.
3. Confirm Knox GWM Haval's trading address explicitly.
4. Search at 25 km and verify the response is labelled non-exhaustive when capped.
5. Verify Lilydale GWM Haval appears and links to its existing monitored domain.
6. Review one unmonitored candidate; confirm that this single action is the first `websiteUri` call.
7. Approve one candidate and verify exactly one domain and first crawl with 25/depth-1/AI-off settings.
8. Enable `canNominateCompetitors` for one Knox portal user and verify exactly one agency queue item without website lookup/crawl.
9. Complete agency review and verify portal state becomes `Monitored`.
10. Disable the nearby flag and confirm existing domains/intelligence remain usable.

- [ ] **Step 7: Commit any battle-test corrections atomically**

If fixes were required, rerun the owning focused tests before each commit. If none were required, do not create an empty commit.

- [ ] **Step 8: Hand off the production decision**

Report tests, build, readiness, provider cost evidence, pilot observations, outstanding risks, commits, and exact rollback commands. Request explicit approval before merging, pushing, setting production variables, enabling the feature flag, or running `pnpm deploy:production`.

---

## Definition of Done

- Agency staff can explicitly confirm a client location and see a distance-ranked, map-synchronized dealership discovery set at 10, 25, or 50 kilometres.
- Results visibly state that Google returns up to 20 candidates and may not represent the full market.
- Used/independent categories are opt-in; uncertain candidates remain visible as unclassified.
- `websiteUri` is requested only when an authorised agency user reviews one candidate.
- Agency save, dismiss, and approve transitions are client-scoped, audited, race-safe, and idempotent.
- Approval creates or links exactly one competitor domain and starts at most one first bounded crawl.
- Portal users can view only their authenticated client's market and can nominate only when both analytics and nomination permissions allow it.
- Portal calls cannot retrieve websites, enter manual domains, mutate domains, configure crawling, or start crawling.
- Google-supplied display payloads are transient and absent from durable storage, queues, logs, analytics, R2, Vectorize, and AI.
- Existing site-intelligence registry, diagnostics, and intelligence remain available when Google is disabled or unavailable.
- Public terms, privacy, feature catalogue, feature detail, and navigation describe the capability accurately.
- Migration 331 is applied, focused tests pass, no new type/lint failures are introduced, production build passes, and `pnpm deploy:check` confirms `agency-dashboard`.
