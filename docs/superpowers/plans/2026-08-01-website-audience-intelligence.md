# Website Audience Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only, agency-wide Website Audiences analytics surface that reports tracking health, audience quality, lead outcomes, client comparisons, and grounded AI analysis from XeroFlow first-party data.

**Architecture:** Add four tenant-scoped Nitro endpoints backed by shared tracking aggregation utilities and the existing Neon tracking/lead tables. A route-backed Nuxt page fetches those resources independently, renders a signal-led dashboard, and sends only compact redacted aggregates to the existing Groq routing layer for on-demand analysis.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Unovis, `@internationalized/date`, Nitro/H3, Neon Postgres, Groq model routing, Vitest, happy-dom.

## Global Constraints

- Canonical route: `/agency/analytics/audiences`.
- Agency-wide ranges default to 30 days and are capped at 90 inclusive calendar days.
- The comparison period is the immediately preceding equal-length window.
- No database migration, raw visitor browser, audience export, provider activation, campaign mutation, or production deployment is part of this plan.
- Every response and AI prompt must exclude anonymous IDs, session IDs, click IDs, fingerprints, contact fields, and raw event payloads.
- Resolve accessible client scope before querying; never fetch all clients and filter in the browser.
- Use Nuxt UI v4 for every control and display component.
- Date controls use `UPopover` plus `UCalendar`; never add a native date input.
- Every field is wrapped in `UFormField`, controls are full-width inside responsive grids, and no `USelectMenu` option has an empty-string value.
- Use semantic colours, responsive layouts, visible keyboard focus, reduced-motion-safe behaviour, and light/dark mode support.
- Preserve all pre-existing worktree changes. `app/pages/agency/analytics/index.vue` already contains unrelated edits; stage only the new navigation hunk with `git add -p`.
- Server imports use `~~/server/utils/`; shared UI/API types live in `app/types/audience-analytics.ts` and are imported server-side through `~~/app/types/audience-analytics`.
- Follow TDD: write a focused failing test, observe the expected failure, add the minimum implementation, rerun, and commit the independently testable slice.

## Visual Design Direction

**Subject and job:** A live signal desk for agency marketers. Its single job is to turn website telemetry into a defensible next action.

**Palette:** Map signal blue `#2F7CF6`, receiving green `#10B981`, stale amber `#F59E0B`, failed red `#EF4444`, ink `#111827`, and fog `#F3F4F6` to existing Nuxt UI semantic tokens rather than hardcoding them in templates. Dark mode uses the existing token variants.

**Type roles:** Keep the application's established interface typeface for product consistency; use semibold compact headings, regular body copy, and tabular numerals as the distinct data/utility role. Do not introduce a new font dependency into the internal dashboard.

**Layout:** Use a quiet evidence ledger rather than a generic gradient hero.

```text
┌ Analytics section nav ───────────────────────────────────────────┐
│ Website Audiences                         [date] [client scope]   │
├ Signal ribbon: ● live ● live ◐ stale ○ never … ─────────────────┤
│ AI briefing + cited evidence                    Ask analyst       │
├ KPIs ────────────────────────────────────────────────────────────┤
│ Audience/current-vs-prior trend                                 │
├ Opportunities ────────────────┬ Acquisition / behaviour ─────────┤
│ explanatory evidence cards    │ ranked quality panels            │
├ Client comparison table ─────────────────────────────────────────┤
```

**Signature:** The tracking coverage section is a horizontal “signal ribbon” whose marks correspond to real endpoint states and open the diagnostic row. This is the one expressive device; charts, cards, and typography remain restrained.

**Self-critique:** A large gradient KPI hero, decorative sparkles, and interchangeable card grids would make this look like a generic AI dashboard. The revised direction makes provenance, freshness, and evidence the visual hierarchy, while AI stays subordinate to verified numbers.

## File Structure

### Shared contracts and pure logic

- Create `app/types/audience-analytics.ts` — browser/server response contracts and allowlisted metric/dimension types.
- Create `server/utils/tracking/audience-analytics.ts` — range, rate, health, zero-fill, opportunity, and AI-grounding pure functions.
- Create `test/server/utils/tracking/audience-analytics.test.ts` — deterministic unit coverage.

### Access and data aggregation

- Modify `server/utils/tracking/analytics-access.ts` — resolve agency-wide or requested-client scope once.
- Create `test/server/utils/tracking/audience-access.test.ts` — management/scoped access tests.
- Create `server/utils/tracking/audience-repository.ts` — all Neon aggregation queries and row mapping.
- Create `test/server/utils/tracking/audience-repository.test.ts` — scoped SQL and response mapping tests.

### Nitro endpoints and AI

- Create `server/api/agency/tracking/audiences/overview.get.ts`.
- Create `server/api/agency/tracking/audiences/timeseries.get.ts`.
- Create `server/api/agency/tracking/audiences/breakdowns.get.ts`.
- Create `server/api/agency/tracking/audiences/ask.post.ts`.
- Modify `server/utils/ai/modelAssignments.ts` and `server/utils/ai/modelRegistry.ts` — register `agency_audience_analytics_ask`.
- Create `test/server/api/trackingAudienceAnalytics.test.ts`.
- Create `test/server/api/trackingAudienceAi.test.ts`.

### Frontend state and navigation

- Create `app/composables/useAudienceAnalytics.ts` — route-synchronised filters and independent resource states.
- Create `app/components/analytics/AnalyticsSectionNav.vue` — route-backed campaign/audience navigation.
- Create `app/components/analytics/audiences/FilterBar.vue` — calendar presets and client selector.
- Modify `app/pages/agency/analytics/index.vue` — render the shared section nav; preserve and do not stage unrelated campaign-diagnostic edits.
- Create `test/app/audienceAnalyticsNavigation.test.ts`.

### Audience page and panels

- Create `app/pages/agency/analytics/audiences.vue` — page composition and metadata.
- Create `app/components/analytics/audiences/SignalRibbon.vue`.
- Create `app/components/analytics/audiences/KpiGrid.vue`.
- Create `app/components/analytics/audiences/TrendChart.client.vue`.
- Create `app/components/analytics/audiences/OpportunityGrid.vue`.
- Create `app/components/analytics/audiences/BreakdownPanel.vue`.
- Create `app/components/analytics/audiences/ClientTable.vue`.
- Create `app/components/analytics/audiences/Analyst.client.vue`.
- Create `app/utils/audienceAnalytics.ts` — UI formatting and state-to-copy helpers.
- Create `test/app/utils/audienceAnalytics.test.ts`.
- Create `test/app/audienceAnalyticsPage.test.ts`.
- Create `test/app/audienceAnalyst.test.ts`.

### Public feature sync

- Modify `app/pages/features/index.vue`.
- Modify `app/pages/features/[slug].vue`.
- Inspect `app/components/MarketingNav.vue`; modify only if the current Analytics & Reporting mega-menu enumerates individual feature entries.
- Create `test/app/websiteAudienceFeaturePage.test.ts`.

---

### Task 1: Lock contracts, ranges, health, and deterministic opportunity rules

**Files:**
- Create: `app/types/audience-analytics.ts`
- Create: `server/utils/tracking/audience-analytics.ts`
- Create: `test/server/utils/tracking/audience-analytics.test.ts`

**Interfaces:**
- Produces: `AudienceRange`, `AudienceKpis`, `AudienceSiteRow`, `AudienceOpportunity`, `AudienceOverviewResponse`, `AudienceTimeseriesResponse`, `AudienceBreakdownsResponse`, and `AudienceAskResponse`.
- Produces: `parseAudienceRange(query, now?)`, `deriveAudienceSiteStatus(active, latestEventAt, now?)`, `safeRate(numerator, denominator)`, `periodDelta(current, previous)`, `zeroFillAudienceSeries(rows, range)`, `deriveAudienceOpportunities(input)`, and `buildAudienceGrounding(input)`.

- [ ] **Step 1: Define the failing unit expectations**

Create tests that assert exact behaviour:

```ts
expect(parseAudienceRange({}, fixedNow)).toEqual({
  fromDate: '2026-07-03',
  toDate: '2026-08-01',
  previousFromDate: '2026-06-03',
  previousToDate: '2026-07-02',
  days: 30
})
expect(() => parseAudienceRange({ from: '2026-04-01', to: '2026-08-01' }, fixedNow))
  .toThrowError('Range too large (max 90 days)')
expect(deriveAudienceSiteStatus(true, '2026-08-01T01:00:00Z', fixedNow)).toBe('receiving')
expect(deriveAudienceSiteStatus(true, '2026-07-30T00:00:00Z', fixedNow)).toBe('stale')
expect(deriveAudienceSiteStatus(true, null, fixedNow)).toBe('never_received')
expect(deriveAudienceSiteStatus(false, '2026-08-01T01:00:00Z', fixedNow)).toBe('inactive')
expect(safeRate(3, 0)).toBe(0)
```

Add rule tests for high-intent non-converters, repeat non-converters, multi-interest visitors, weak paid engagement, strong organic pages, intent/outcome divergence, and `insufficient_data` below each rule's declared sample threshold. Assert that `buildAudienceGrounding` has no keys matching `/anon|session|click|fingerprint|email|phone/i`.

- [ ] **Step 2: Run the unit test and observe missing-module failure**

Run: `pnpm vitest run test/server/utils/tracking/audience-analytics.test.ts`

Expected: FAIL because the contracts and pure module do not exist.

- [ ] **Step 3: Add exact shared contracts**

Define literal unions:

```ts
export type AudienceSiteStatus = 'receiving' | 'stale' | 'no_recent_data' | 'never_received' | 'inactive'
export type AudienceMetric = 'visitors' | 'sessions' | 'engagedSessions' | 'leadActions' | 'confirmedLeads'
export type AudienceBreakdownDimension = 'source' | 'campaign' | 'page' | 'paid_organic' | 'device' | 'interest'
export type AudienceOpportunityStatus = 'opportunity' | 'insufficient_data'
```

Define the public contracts with these exact shapes (the concrete metric fields are
reused by the overview, series, client, and AI grounding contracts):

```ts
export interface AudienceRange {
  fromDate: string
  toDate: string
  previousFromDate: string
  previousToDate: string
  days: number
}

export interface AudienceKpis {
  visitors: number
  sessions: number
  pageViews: number
  engagedSessions: number
  engagementRate: number
  repeatVisitors: number
  leadActions: number
  confirmedLeads: number
  visitorToLeadRate: number
  attributionCoverage: number
}

export interface AudienceSiteRow {
  id: string
  clientId: string
  clientName: string
  name: string
  origin: string | null
  isActive: boolean
  status: AudienceSiteStatus
  lastEventAt: string | null
  eventsInWindow: number
}

export interface AudienceOpportunity {
  code: 'high_intent_non_converters' | 'repeat_non_converters' | 'multi_interest'
    | 'weak_paid_engagement' | 'strong_organic_pages' | 'intent_outcome_divergence'
  title: string
  description: string
  status: AudienceOpportunityStatus
  count: number
  thresholds: Record<string, number>
  evidence: Record<string, number | string>
  clientId?: string
}

export interface AudienceClientRow {
  clientId: string
  clientName: string
  siteCount: number
  status: AudienceSiteStatus
  visitors: number
  engagementRate: number
  leadActions: number
  confirmedLeads: number
  visitorToLeadRate: number
  attributionCoverage: number
  visitorsDeltaPercent: number | null
  lastEventAt: string | null
}

export interface AudienceOverviewResponse {
  generatedAt: string
  window: AudienceRange
  coverage: {
    total: number
    receiving: number
    stale: number
    noRecentData: number
    neverReceived: number
    inactive: number
    sites: AudienceSiteRow[]
  }
  kpis: AudienceKpis
  previousKpis: AudienceKpis
  opportunities: AudienceOpportunity[]
  clients: AudienceClientRow[]
  availableClients: Array<{ id: string, name: string }>
}

export interface AudienceSeriesPoint extends Pick<AudienceKpis,
  'visitors' | 'sessions' | 'engagedSessions' | 'leadActions' | 'confirmedLeads'> {
  day: string
  dayIndex: number
}

export interface AudienceTimeseriesResponse {
  generatedAt: string
  window: AudienceRange
  metric: AudienceMetric
  current: AudienceSeriesPoint[]
  previous: AudienceSeriesPoint[]
}

export interface AudienceBreakdownRow {
  key: string
  visitors: number
  sessions: number
  engagementRate: number
  leadActions: number
  confirmedLeads: number
  confirmedLeadRate: number
}

export interface AudienceBreakdownsResponse {
  generatedAt: string
  window: AudienceRange
  dimension: AudienceBreakdownDimension
  rows: AudienceBreakdownRow[]
}

export interface AudienceAskResponse {
  answer: string
  generatedAt: string
  grounding: {
    window: AudienceRange
    scope: 'agency' | 'client'
    kpis: AudienceKpis
    previousKpis: AudienceKpis
    opportunities: AudienceOpportunity[]
    breakdowns: Partial<Record<AudienceBreakdownDimension, AudienceBreakdownRow[]>>
  }
}
```

- [ ] **Step 4: Implement pure calculations with explicit thresholds**

Use inclusive calendar-day arithmetic in UTC for validation. Set the initial deterministic rule thresholds in exported `AUDIENCE_OPPORTUNITY_THRESHOLDS`:

```ts
export const AUDIENCE_OPPORTUNITY_THRESHOLDS = {
  minimumSessions: 20,
  strongEngagementSeconds: 45,
  deepScrollPercent: 75,
  multiInterestCount: 2,
  weakPaidEngagementGapPoints: 15,
  strongOrganicLiftPoints: 10,
  divergenceMinimumLeadActions: 5
} as const
```

Keep SQL-derived counts as inputs to `deriveAudienceOpportunities`; the pure function decides status, explanatory copy, and evidence. `buildAudienceGrounding` explicitly constructs an allowlisted object rather than deleting unsafe keys from a broad input.

- [ ] **Step 5: Run the unit test to green**

Run: `pnpm vitest run test/server/utils/tracking/audience-analytics.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the contract slice**

```bash
git add app/types/audience-analytics.ts server/utils/tracking/audience-analytics.ts test/server/utils/tracking/audience-analytics.test.ts
git commit -m "feat: define website audience analytics contracts"
```

### Task 2: Resolve tenant-safe agency audience scope

**Files:**
- Modify: `server/utils/tracking/analytics-access.ts`
- Create: `test/server/utils/tracking/audience-access.test.ts`

**Interfaces:**
- Consumes: existing `ANALYTICS_ROLES`, `accessibleClientIds`, `isUuid`, `requireAuth`, and `requireRole`.
- Produces: `requireTrackingAudienceScope(event, requestedClientId?) -> Promise<{ user, accessibleClientIds: string[] | null, clientIds: string[] | null }>` where `accessibleClientIds` is the caller's complete option scope and `clientIds` is the optional requested filter; `null` means all clients only for a management role.

- [ ] **Step 1: Write failing access tests**

Mock auth and database boundaries before importing the module. Assert:

```ts
expect(await requireTrackingAudienceScope(event, undefined)).toEqual({
  user: managementUser,
  accessibleClientIds: null,
  clientIds: null
})
expect(await requireTrackingAudienceScope(event, CLIENT_A)).toEqual({
  user: scopedUser,
  accessibleClientIds: [CLIENT_A, CLIENT_C],
  clientIds: [CLIENT_A]
})
await expect(requireTrackingAudienceScope(event, CLIENT_B)).rejects.toMatchObject({ statusCode: 403 })
await expect(requireTrackingAudienceScope(event, 'not-a-uuid')).rejects.toMatchObject({ statusCode: 400 })
```

Also assert that a scoped user with no assignments receives both
`accessibleClientIds: []` and `clientIds: []`, never `null`.

- [ ] **Step 2: Run the access test and observe export failure**

Run: `pnpm vitest run test/server/utils/tracking/audience-access.test.ts`

Expected: FAIL because `requireTrackingAudienceScope` is not exported.

- [ ] **Step 3: Implement one-pass scope resolution**

Authenticate and role-gate first. Validate a requested ID before any query. Resolve assignments with `accessibleClientIds(user)`. Preserve that full result as `accessibleClientIds`. For requested client scope, reject when a non-management user's assignment list does not contain it; otherwise set `clientIds` to `[requestedClientId]`. For agency scope, set `clientIds` to the assignment list or management `null`.

- [ ] **Step 4: Run access tests and the existing access regression suite**

Run: `pnpm vitest run test/server/utils/tracking/audience-access.test.ts test/server/utils/tracking/analytics-access.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the scope slice**

```bash
git add server/utils/tracking/analytics-access.ts test/server/utils/tracking/audience-access.test.ts
git commit -m "feat: scope agency audience analytics"
```

### Task 3: Aggregate coverage, KPIs, opportunities, and client comparison

**Files:**
- Create: `server/utils/tracking/audience-repository.ts`
- Create: `test/server/utils/tracking/audience-repository.test.ts`

**Interfaces:**
- Consumes: `AudienceRange`, `AudienceOverviewResponse`, pure mappings from Task 1, `NOISE_SQL`, `queryOne`, and `queryRows`.
- Produces: `getAudienceOverview({ range, clientIds, accessibleClientIds }): Promise<AudienceOverviewResponse>`.

- [ ] **Step 1: Write failing repository tests around the database boundary**

Mock `queryRows`/`queryOne` with representative string-valued Postgres rows. Assert that:

- `clientIds: []` returns a zero overview without running an unscoped query;
- `clientIds: [CLIENT_A]` passes a UUID array and maps only that client;
- `clientIds: null` uses the management scope branch;
- `availableClients` is resolved from `accessibleClientIds`, not the narrower requested-client filter;
- coverage maps latest event time to the five exact statuses;
- numeric strings map to numbers;
- current and previous KPIs remain distinct;
- confirmed leads and attribution coverage are mapped from reconciled lead rows; and
- the returned payload has no visitor/session identifiers.

Also fake `Date.now()` around a database promise and assert a query taking more
than 1,500 ms emits one redacted warning containing only operation name and
duration—not SQL parameters or client identifiers.

- [ ] **Step 2: Run the repository test and observe missing-module failure**

Run: `pnpm vitest run test/server/utils/tracking/audience-repository.test.ts`

Expected: FAIL because `audience-repository.ts` does not exist.

- [ ] **Step 3: Implement the scoped SQL primitives**

Use a reusable fixed SQL predicate with a UUID-array parameter:

```sql
($scope::uuid[] IS NULL OR entity.client_id = ANY($scope::uuid[]))
```

Build separate bounded queries for:

1. provisioned sites plus latest qualifying event and selected-window volume;
2. current/previous event and session KPIs grouped by period;
3. repeat/high-intent/multi-interest aggregate inputs grouped by client;
4. reconciled confirmed leads and attribution counts grouped by period/client; and
5. client comparison rows.

For event windows, join `agency_clients` and interpret `$from::date`/`$to::date` using `COALESCE(reporting_timezone, 'Australia/Brisbane')`. Use fixed event allowlists:

```ts
const LEAD_ACTION_EVENTS = ['form_submit', 'phone_click', 'generate_lead', 'test_drive_booking'] as const
const INTEREST_EVENTS = ['vehicle_view', 'vehicle_list_view', 'return_to_vehicle'] as const
```

Do not select `anon_id` or `session_id` out of SQL; use them only inside aggregate CTEs.

Wrap each repository operation in `withAudienceQueryTiming(operation, run)`. When
duration exceeds 1,500 ms it calls
`console.warn('[audiences] slow query', { operation, durationMs })`; the operation
is an internal literal name and the log never includes SQL, scope arrays, or rows.

- [ ] **Step 4: Map rows into the public overview contract**

Compute safe rates through Task 1 helpers, merge current/prior outcome rows by client ID, derive the worst site status with an explicit severity map, and call `deriveAudienceOpportunities` with only aggregate inputs. Return ISO timestamps and zero values for absent data.

- [ ] **Step 5: Run repository and pure tests**

Run: `pnpm vitest run test/server/utils/tracking/audience-repository.test.ts test/server/utils/tracking/audience-analytics.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the overview repository**

```bash
git add server/utils/tracking/audience-repository.ts test/server/utils/tracking/audience-repository.test.ts
git commit -m "feat: aggregate agency website audiences"
```

### Task 4: Add trend, breakdown, and deterministic API boundaries

**Files:**
- Modify: `server/utils/tracking/audience-repository.ts`
- Create: `server/api/agency/tracking/audiences/overview.get.ts`
- Create: `server/api/agency/tracking/audiences/timeseries.get.ts`
- Create: `server/api/agency/tracking/audiences/breakdowns.get.ts`
- Create: `test/server/api/trackingAudienceAnalytics.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `getAudienceTimeseries({ range, clientIds, metric? })`, `getAudienceBreakdowns({ range, clientIds, dimension })`, and three authenticated GET handlers.

- [ ] **Step 1: Write failing route tests**

Install test globals for `defineEventHandler`, `getQuery`, and `createError`, then mock scope and repository functions. Assert exact route calls:

```ts
expect(mockGetOverview).toHaveBeenCalledWith({ range: parsedRange, clientIds: [CLIENT_A] })
expect(mockGetTimeseries).toHaveBeenCalledWith({ range: parsedRange, clientIds: null, metric: 'visitors' })
expect(mockGetBreakdowns).toHaveBeenCalledWith({ range: parsedRange, clientIds: [CLIENT_A], dimension: 'source' })
```

Assert invalid metric/dimension values return `400`, ranges over 90 days return `400`, and empty scoped assignments return successful empty contracts.

- [ ] **Step 2: Run the API test and observe missing handlers**

Run: `pnpm vitest run test/server/api/trackingAudienceAnalytics.test.ts`

Expected: FAIL because the handlers do not exist.

- [ ] **Step 3: Add repository trend aggregation**

Aggregate daily current and previous values for the five allowlisted metrics. Return database day keys and use `zeroFillAudienceSeries` to emit every day. Align the prior series by `dayIndex` so the frontend can compare equal-length periods without timezone arithmetic.

- [ ] **Step 4: Add repository breakdown aggregation**

Map allowlisted dimensions to fixed SQL expressions. Return at most 20 rows with `key`, `visitors`, `sessions`, `engagementRate`, `leadActions`, `confirmedLeads`, and `confirmedLeadRate`. For `interest`, group an allowlisted vehicle/product reference extracted from known event-data keys and fall back to `(unspecified)`; never return the complete `event_data` object.

- [ ] **Step 5: Implement thin authenticated handlers**

Each handler performs this order:

```ts
const query = getQuery(event)
const range = parseAudienceRange({ from: stringValue(query.from), to: stringValue(query.to) })
const { clientIds, accessibleClientIds } = await requireTrackingAudienceScope(event, stringValue(query.clientId))
return getAudienceOverview({ range, clientIds, accessibleClientIds })
```

Timeseries and breakdown handlers validate their literal-union selector before repository access. No route contains SQL.

- [ ] **Step 6: Run API, repository, and range tests**

Run: `pnpm vitest run test/server/api/trackingAudienceAnalytics.test.ts test/server/utils/tracking/audience-repository.test.ts test/server/utils/tracking/audience-analytics.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit deterministic endpoints**

```bash
git add server/utils/tracking/audience-repository.ts server/api/agency/tracking/audiences test/server/api/trackingAudienceAnalytics.test.ts
git commit -m "feat: expose website audience analytics APIs"
```

### Task 5: Add the grounded AI Audience Analyst boundary

**Files:**
- Create: `server/api/agency/tracking/audiences/ask.post.ts`
- Modify: `server/utils/ai/modelAssignments.ts`
- Modify: `server/utils/ai/modelRegistry.ts`
- Create: `test/server/api/trackingAudienceAi.test.ts`
- Modify: `test/server/utils/aiModelRegistry.test.ts`

**Interfaces:**
- Consumes: `requireTrackingAudienceScope`, `parseAudienceRange`, `getAudienceOverview`, `getAudienceBreakdowns`, `buildAudienceGrounding`, and `generateModelRoutedGroqInsight`.
- Produces: `POST /api/agency/tracking/audiences/ask` returning `AudienceAskResponse`.

- [ ] **Step 1: Write failing AI safety and routing tests**

Mock scope, repository, and model generation. Assert:

- empty/whitespace question returns `400`;
- the endpoint uses caller-scoped repository inputs;
- the prompt contains visible KPI/opportunity facts and the requested date window;
- the prompt does not contain seeded `anon_id`, `session_id`, `gclid`, email, phone, or raw event data;
- Model Ops metadata uses feature key `agency_audience_analytics_ask`, route, scope, dates, question length, and grounding counts;
- model failure returns controlled `502 Insight generation unavailable`; and
- response grounding is the same allowlisted object supplied to the model.

- [ ] **Step 2: Run AI tests and observe missing handler/registry entry**

Run: `pnpm vitest run test/server/api/trackingAudienceAi.test.ts test/server/utils/aiModelRegistry.test.ts`

Expected: FAIL.

- [ ] **Step 3: Register the feature**

Add `agency_audience_analytics_ask: ['groq']` to assignments and a registry entry using the same Groq family and operational policy as `agency_analytics_ask`, with source file `server/api/agency/tracking/audiences/ask.post.ts`.

- [ ] **Step 4: Implement the grounded ask handler**

Limit questions to 500 characters. Fetch overview plus the three most useful breakdown dimensions (`source`, `campaign`, `page`) for the authorised scope. Build the allowlisted grounding object and call the routed Groq helper with temperature `0.1`, maximum 650 tokens, and this system contract:

```text
Answer only from the supplied Website Audience facts. Cite concrete values and the
reporting window. Distinguish tracking observations from marketing recommendations.
If the facts do not answer the question, say so. Never claim an audience was
activated or a campaign was changed. Keep the answer to 2–5 concise paragraphs.
```

Support the UI preset question “Brief the marketing team on this audience window.” through the same endpoint; do not auto-call the model on page load.

- [ ] **Step 5: Run the AI and model-registry suites**

Run: `pnpm vitest run test/server/api/trackingAudienceAi.test.ts test/server/utils/aiModelRegistry.test.ts test/server/api/agencyAnalyticsAi.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the AI boundary**

```bash
git add server/api/agency/tracking/audiences/ask.post.ts server/utils/ai/modelAssignments.ts server/utils/ai/modelRegistry.ts test/server/api/trackingAudienceAi.test.ts test/server/utils/aiModelRegistry.test.ts
git commit -m "feat: add grounded website audience analyst"
```

### Task 6: Build route state, calendar filters, and route-backed analytics navigation

**Files:**
- Create: `app/composables/useAudienceAnalytics.ts`
- Create: `app/components/analytics/AnalyticsSectionNav.vue`
- Create: `app/components/analytics/audiences/FilterBar.vue`
- Modify: `app/pages/agency/analytics/index.vue`
- Create: `test/app/audienceAnalyticsNavigation.test.ts`

**Interfaces:**
- Consumes: API response contracts from Task 1.
- Produces: `useAudienceAnalytics()` with `filters`, `query`, `setPreset`, `updateFilters`, `overview`, `timeseries`, `breakdowns`, per-resource status/error, and `refreshAll()`.

- [ ] **Step 1: Re-open the frontend-design guidance before editing controls**

Read `/Users/paulgiurin/.Codex/.tmp/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md` completely. Apply the approved signal-desk visual direction and project form conventions.

- [ ] **Step 2: Write failing navigation/filter contract tests**

Use source-level assertions for Nuxt auto-imported components and pure tests for composable helpers. Assert:

- section nav links exactly to `/agency/analytics` and `/agency/analytics/audiences`;
- the audience filter contains `UPopover`, `UCalendar`, `UFormField`, and `USelectMenu`;
- it does not contain `type="date"`, raw `<input>`, raw `<select>`, or an empty option value;
- presets produce inclusive 7/30/90-day windows; and
- URL query uses `from`, `to`, and optional `clientId` while discarding unrelated campaign-platform filters.

- [ ] **Step 3: Run the UI contract test and observe missing files**

Run: `pnpm vitest run test/app/audienceAnalyticsNavigation.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement route-synchronised state and independent fetches**

Initialise from validated query values or the last 30 inclusive days. Fetch overview, timeseries, and breakdowns independently with `Promise.allSettled` semantics so one error does not clear successful panels. Abort stale requests when filters change. Expose explicit `idle | pending | success | error` status for each resource. Populate the client selector only from `overview.availableClients`; never call the existing unscoped `/api/agency/clients` list for this control.

- [ ] **Step 5: Implement the section nav and audience filter**

Use `UButton` route links in a labelled tablist. The filter uses two calendar popovers, 7/30/90 preset buttons, and an accessible-client `USelectMenu` with sentinel `all`. Wrap both calendar triggers and the client selector in `UFormField`. Use `@container` and `@lg:grid-cols-3` so it remains single-column in narrow surfaces.

- [ ] **Step 6: Integrate navigation without staging existing user edits**

Insert `<AnalyticsSectionNav />` in `app/pages/agency/analytics/index.vue` between the page header and current campaign filter bar. Review `git diff -- app/pages/agency/analytics/index.vue`, then use `git add -p app/pages/agency/analytics/index.vue` and stage only the section-nav hunk. Leave the pre-existing router/campaign-health changes unstaged.

- [ ] **Step 7: Run the navigation/filter test**

Run: `pnpm vitest run test/app/audienceAnalyticsNavigation.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit navigation and state**

```bash
git add app/composables/useAudienceAnalytics.ts app/components/analytics/AnalyticsSectionNav.vue app/components/analytics/audiences/FilterBar.vue test/app/audienceAnalyticsNavigation.test.ts
git commit -m "feat: add website audience analytics navigation"
```

Confirm with `git show --stat --oneline HEAD` that no pre-existing analytics-page edits entered the commit.

### Task 7: Build the signal-led dashboard and deterministic panels

**Files:**
- Create: `app/pages/agency/analytics/audiences.vue`
- Create: `app/components/analytics/audiences/SignalRibbon.vue`
- Create: `app/components/analytics/audiences/KpiGrid.vue`
- Create: `app/components/analytics/audiences/TrendChart.client.vue`
- Create: `app/components/analytics/audiences/OpportunityGrid.vue`
- Create: `app/components/analytics/audiences/BreakdownPanel.vue`
- Create: `app/components/analytics/audiences/ClientTable.vue`
- Create: `app/utils/audienceAnalytics.ts`
- Create: `test/app/utils/audienceAnalytics.test.ts`
- Create: `test/app/audienceAnalyticsPage.test.ts`

**Interfaces:**
- Consumes: `useAudienceAnalytics` and Task 1 response types.
- Produces: a complete deterministic page that remains useful without AI.

- [ ] **Step 1: Write failing UI helper and page contract tests**

Test exact copy/state mapping:

```ts
expect(siteStatusMeta('receiving')).toMatchObject({ label: 'Receiving data', color: 'success' })
expect(siteStatusMeta('never_received')).toMatchObject({ label: 'Never received', color: 'neutral' })
expect(formatAudienceDelta(0, 0)).toBe('No change')
expect(formatAudienceDelta(120, 100)).toBe('20% increase')
```

Source/mount tests assert the page uses all seven deterministic components, provides independent error alerts, links client rows to `/agency/tracking/:clientId`, and does not render visitor identifiers.

- [ ] **Step 2: Run tests and observe missing files**

Run: `pnpm vitest run test/app/utils/audienceAnalytics.test.ts test/app/audienceAnalyticsPage.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement UI formatting helpers**

Add `siteStatusMeta`, `formatAudienceDelta`, `formatAudienceMetric`, `formatFreshness`, and `opportunityTone`. Return semantic Nuxt UI colour names and plain-language copy; never emit HTML.

- [ ] **Step 4: Implement coverage and KPI panels**

`SignalRibbon.vue` renders one labelled status mark per site plus summary counts. Clicking or keyboard-activating a mark reveals the matching row details and install/diagnostic link. `KpiGrid.vue` renders current value, prior value, and change with tabular numerals and no decorative gradient.

- [ ] **Step 5: Implement the comparison trend chart**

Use Unovis line/area primitives. The current period is the strong semantic primary line; the prior period is a quieter dashed/low-opacity line. Provide a `USelectMenu` metric selector with the five allowlisted metrics, accessible tooltip content, zero-data copy, and a textual current/prior summary below the chart for non-visual interpretation.

- [ ] **Step 6: Implement opportunity, breakdown, and client panels**

Opportunity cards show status, count, deterministic reason, thresholds, and evidence. `insufficient_data` uses neutral styling and explanatory copy. Breakdown panels use `UTable` and quality columns, not volume alone. The client table supports local sorting by health, visitors, engagement, lead actions, confirmed leads, conversion rate, attribution coverage, change, and freshness.

- [ ] **Step 7: Compose the route**

Set agency layout and `role-media` middleware. Render the section nav, title/copy, filter bar, signal ribbon, KPI grid, trend, opportunities, three breakdown panels, and client table. Each resource reads its own status/error and renders `USkeleton`, `UAlert`, or a directed empty state without hiding successful siblings.

- [ ] **Step 8: Run deterministic UI tests**

Run: `pnpm vitest run test/app/utils/audienceAnalytics.test.ts test/app/audienceAnalyticsPage.test.ts test/app/audienceAnalyticsNavigation.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the deterministic dashboard**

```bash
git add app/pages/agency/analytics/audiences.vue app/components/analytics/audiences app/utils/audienceAnalytics.ts test/app/utils/audienceAnalytics.test.ts test/app/audienceAnalyticsPage.test.ts
git commit -m "feat: build website audience intelligence dashboard"
```

### Task 8: Add the on-demand AI briefing and evidence disclosure

**Files:**
- Create: `app/components/analytics/audiences/Analyst.client.vue`
- Modify: `app/pages/agency/analytics/audiences.vue`
- Create: `test/app/audienceAnalyst.test.ts`

**Interfaces:**
- Consumes: `AudienceAskResponse`, active range, and optional client ID.
- Produces: briefing preset, free-text question flow, and visible grounding disclosure.

- [ ] **Step 1: Write failing happy-dom component tests**

Mount with Nuxt UI stubs and mocked `$fetch`. Assert:

- no request occurs on mount;
- “Generate audience briefing” sends the approved preset question and active scope;
- a 501-character question is blocked before fetch;
- successful narrative renders with window/scope and a “Show supporting evidence” disclosure;
- grounding renders aggregate KPI/opportunity/breakdown rows only; and
- a `502` response leaves deterministic fallback copy and permits retry.

- [ ] **Step 2: Run the component test and observe missing component failure**

Run: `pnpm vitest run test/app/audienceAnalyst.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement the analyst interaction**

Use a `UCard` headed by “Audience analyst”, a restrained `i-lucide-sparkles` icon, a `UTextarea` inside `UFormField`, and `UButton` actions. Provide three example prompts. Render server narrative as plain text with whitespace preservation; do not use raw HTML or Markdown execution. Use `UTable`/definition rows for supporting numbers.

- [ ] **Step 4: Add the analyst below filters and above the signal ribbon**

Pass active `from`, `to`, and `clientId`. Keep component error state local so it cannot affect deterministic resource state.

- [ ] **Step 5: Run AI UI and API suites**

Run: `pnpm vitest run test/app/audienceAnalyst.test.ts test/server/api/trackingAudienceAi.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the analyst UI**

```bash
git add app/components/analytics/audiences/Analyst.client.vue app/pages/agency/analytics/audiences.vue test/app/audienceAnalyst.test.ts
git commit -m "feat: surface grounded audience analysis"
```

### Task 9: Synchronise public feature copy

**Files:**
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Inspect/modify: `app/components/MarketingNav.vue`
- Create: `test/app/websiteAudienceFeaturePage.test.ts`

**Interfaces:**
- Produces: public slug `website-audience-intelligence` with truthful MVP copy.

- [ ] **Step 1: Write the failing feature contract test**

Read source files and assert:

- Analytics & Reporting includes title `Website Audience Intelligence` and slug `website-audience-intelligence`;
- the detail map includes 3–4 sections covering tracking health, audience quality, client comparison, and grounded AI;
- copy states insights are aggregate/read-only; and
- copy does not claim Meta/Google audience activation, automatic campaign changes, or visitor identities.

- [ ] **Step 2: Run the contract test and observe missing feature failure**

Run: `pnpm vitest run test/app/websiteAudienceFeaturePage.test.ts`

Expected: FAIL.

- [ ] **Step 3: Add the feature index and detailed entry**

Use icon `i-lucide-radio-tower`. Write concrete, plain-language copy for agency marketers. Add four detail sections: “Know every tag is talking”, “Read audience quality”, “Compare clients on one ledger”, and “Ask with the evidence attached”. Explicitly describe read-only aggregate intelligence.

- [ ] **Step 4: Inspect MarketingNav before editing**

If the Analytics & Reporting mega-menu lists individual feature links, add the new slug beside the analytics entries. If it links only to the category landing page, leave it unchanged and record that evidence in the final handoff.

- [ ] **Step 5: Run feature tests**

Run: `pnpm vitest run test/app/websiteAudienceFeaturePage.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit public copy**

```bash
git add app/pages/features/index.vue 'app/pages/features/[slug].vue' test/app/websiteAudienceFeaturePage.test.ts
git add app/components/MarketingNav.vue  # only when Step 4 required a real edit
git commit -m "docs: publish website audience intelligence feature"
```

### Task 10: Battle-test integration and perform visual review

**Files:**
- Review every file changed by Tasks 1–9.
- Modify only files requiring a verified correction.

**Interfaces:**
- Produces: verified local MVP and an evidence-backed handoff; no deployment.

- [ ] **Step 1: Run the complete focused test set**

Run:

```bash
pnpm vitest run \
  test/server/utils/tracking/audience-analytics.test.ts \
  test/server/utils/tracking/audience-access.test.ts \
  test/server/utils/tracking/audience-repository.test.ts \
  test/server/api/trackingAudienceAnalytics.test.ts \
  test/server/api/trackingAudienceAi.test.ts \
  test/app/utils/audienceAnalytics.test.ts \
  test/app/audienceAnalyticsNavigation.test.ts \
  test/app/audienceAnalyticsPage.test.ts \
  test/app/audienceAnalyst.test.ts \
  test/app/websiteAudienceFeaturePage.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run adjacent regressions**

Run:

```bash
pnpm vitest run \
  test/server/utils/tracking/analytics-sql.test.ts \
  test/server/utils/tracking/analytics-range.test.ts \
  test/server/utils/tracking/analytics-access.test.ts \
  test/server/api/agencyAnalyticsAi.test.ts \
  test/server/utils/aiModelRegistry.test.ts \
  test/public/track-tag.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run static verification**

Run: `pnpm run typecheck`

Expected: no new errors in files changed by this plan. Record pre-existing repository errors separately rather than masking them.

- [ ] **Step 4: Run the production build**

Run: `pnpm run build`

Expected: Nuxt/Nitro build completes with the repository's configured 16 GB heap ceiling.

- [ ] **Step 5: Re-read every modified file and run pre-commit checks**

Verify server aliases, client scoping, fixed SQL allowlists, no sensitive response fields, no empty select values, calendar reactivity, no duplicate UI, semantic dark-mode colours, no raw HTML, and no server-side URL fetch. Run `git diff --check` and inspect `git diff --stat` plus `git status --short`.

- [ ] **Step 6: Start the local app and perform browser review**

Run: `pnpm dev -- --host 127.0.0.1 --port 3001`

Inspect `/agency/analytics/audiences` at desktop and mobile widths in light and dark mode. Verify keyboard operation, signal-ribbon disclosure, filters, independent failure states, chart tooltips, table overflow, client drill-down, AI retry, and that no unexpected horizontal page scrolling exists. Stop the server cleanly after review.

- [ ] **Step 7: Apply only evidence-backed visual corrections and rerun affected tests**

Use `apply_patch` for corrections. Re-run the focused test file for every edited component and capture a final screenshot only if the browser environment supports it.

- [ ] **Step 8: Commit verified corrections if any**

```bash
git add app/pages/agency/analytics/audiences.vue app/components/analytics/audiences app/components/analytics/AnalyticsSectionNav.vue app/composables/useAudienceAnalytics.ts app/utils/audienceAnalytics.ts server/api/agency/tracking/audiences server/utils/tracking/audience-analytics.ts server/utils/tracking/audience-repository.ts
git commit -m "fix: polish website audience intelligence"
```

If Step 7 required no correction, do not create an empty commit.

- [ ] **Step 9: Confirm deployment remains untouched**

Run: `git status --short` and report the feature commits, tests, build result, known pre-existing errors, remaining unrelated worktree changes, and that no `pnpm deploy:*` command was run.
