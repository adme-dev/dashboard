# Search Authority Phase 0–1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Knox-ready Search Console evidence loop: gated client
readiness, least-privilege OAuth, property mapping, reliable daily ingestion,
bounded URL Inspection, explainable opportunities, manual task handoff, and
agency/client reporting.

**Architecture:** Add a client-scoped Search Authority domain inside the Nuxt
control plane. Store provider credentials in the existing encrypted Google
credential-profile system, but isolate the Search Console OAuth purpose and
scope from Google Ads and GA4. Fetch provider data through focused server
utilities, replace each date/projection atomically in Neon, and expose
human-reviewed opportunities through agency and portal APIs.

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, Nitro, Neon Postgres,
`@neondatabase/serverless`, `ofetch`, Zod, Vitest, Cloudflare Pages/Cron Worker,
Google Search Console API.

## Global Constraints

- Run project commands with Node `24.18.0`:
  `PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH`.
- Use only `https://www.googleapis.com/auth/webmasters.readonly` plus
  `openid email` for the Search Console OAuth connection.
- Do not reuse Google Ads or GA4 refresh tokens for Search Console.
- Never return access tokens, refresh tokens, ciphertext, IVs, or credentials
  to the browser.
- All agency reads and mutations must be role-gated and client-scoped.
- All portal reads must use the authenticated portal client; never accept a
  portal `clientId`.
- Gate the product globally with `SEARCH_AUTHORITY_ENABLED=false` by default
  and per client with the `search_authority.core` entitlement.
- Search Console data is provider-limited. Missing rows must never be presented
  as zero demand or complete coverage.
- Store Search Console dates as provider-local `DATE` values and label the
  provider timezone as `America/Los_Angeles`.
- Initial ingestion covers the previous 90 days and refreshes the trailing
  three days with provisional metadata where Google supplies it.
- A query/page projection must not be used to derive property totals because
  anonymised queries make those sums incomplete.
- Opportunity scoring is deterministic and versioned. AI cannot change scores,
  provider metrics, lifecycle state, approval, or task creation.
- No opportunity creates a task without an explicit user action.
- No Dealer Studio, CMS, DNS, GTM, GBP, public publisher, or campaign mutation
  is part of this Phase 0–1 plan.
- Forms must use Nuxt UI v4 and the repository's `frontend-design` skill before
  form fields are implemented.
- Server imports use `~~/server/utils/`.
- Every migration is additive, uses `IF NOT EXISTS` where valid, and is applied
  automatically to the configured database after its focused tests pass.
- Update the public feature index, feature detail and marketing mega menu when
  the agency/portal feature becomes visible.
- Baseline on 2026-07-31: `pnpm test:run` reports 1,296 passing files,
  19 failing files, 39 failed tests, 7,768 passed tests, 10 skipped tests and
  three unrelated unhandled errors. Focused Search Authority tests must pass;
  the full-suite failure count must not increase.

---

## File and Interface Map

### Database and feature gating

- `server/database/migrations/329_search_authority_phase_1.sql` — all Phase 0–1
  tables, constraints, indexes, OAuth-purpose hardening, and Knox-neutral
  entitlement support.
- `server/utils/searchAuthority/feature.ts` — entitlement and global-flag
  checks.
- `server/utils/searchAuthority/access.ts` — reusable agency client-scoping and
  portal access gates.

### Google connection and provider client

- `server/utils/searchAuthority/googleClient.ts` — OAuth URL, site discovery,
  Search Analytics requests and URL Inspection.
- `server/utils/searchAuthority/credentials.ts` — encrypted Search Console
  profile persistence and refresh.
- `server/utils/googleCredentialProfiles.ts` — purpose-bound OAuth attempts.
- `server/utils/googleOAuthRuntimeConfig.ts` — Search Console callback config.
- `server/api/agency/search-authority/google/*` — connect, callback, discovered
  properties, mapping and connection health.

### Ingestion and opportunities

- `server/utils/searchAuthority/dates.ts` — provider-date and sync-window
  functions.
- `server/utils/searchAuthority/repository.ts` — atomic fact replacement,
  sync-run state and read projections.
- `server/utils/searchAuthority/sync.ts` — bounded initial/daily/manual sync.
- `server/utils/searchAuthority/inspection.ts` — quota-aware priority URL
  inspection.
- `server/utils/searchAuthority/opportunities.ts` — deterministic candidate
  scoring and deduplication.
- `server/api/cron/search-console-sync.post.ts` — scheduled sync entry point.

### Product surfaces

- `app/pages/agency/search-authority/index.vue` — overview, opportunities and
  data health.
- `app/pages/agency/search-authority/connections.vue` — readiness, OAuth and
  client/property mapping.
- `app/components/search-authority/*` — focused cards and tables.
- `app/pages/portal/search-authority.vue` — client-owned summary.
- `server/api/agency/search-authority/*` and
  `server/api/portal/search-authority/*` — typed product APIs.

---

### Task 1: Add the client-scoped Phase 0–1 schema

**Files:**

- Create: `server/database/migrations/329_search_authority_phase_1.sql`
- Create: `test/config/searchAuthorityMigration.test.ts`

**Interfaces:**

- Produces:
  `search_authority_sites`, `search_console_connections`,
  `search_console_property_maps`, `gsc_sync_runs`,
  `gsc_daily_query_page`, `gsc_daily_page`, `gsc_daily_property`,
  `gsc_url_inspections`, `search_authority_opportunities`,
  `search_authority_opportunity_evidence`.
- Extends: `google_oauth_attempts.purpose TEXT NOT NULL DEFAULT 'google_ads'`.

- [ ] **Step 1: Write the migration contract test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL(
    '../../server/database/migrations/329_search_authority_phase_1.sql',
    import.meta.url
  ),
  'utf8'
)

describe('Search Authority migration 329', () => {
  it('creates client-scoped Search Console and opportunity tables', () => {
    for (const table of [
      'search_authority_sites',
      'search_console_connections',
      'search_console_property_maps',
      'gsc_sync_runs',
      'gsc_daily_query_page',
      'gsc_daily_page',
      'gsc_daily_property',
      'gsc_url_inspections',
      'search_authority_opportunities',
      'search_authority_opportunity_evidence'
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
  })

  it('keeps credentials encrypted and OAuth attempts purpose-bound', () => {
    expect(sql).toContain('google_credential_profile_id UUID NOT NULL')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS purpose TEXT')
    expect(sql).not.toMatch(/search_console_connections[\\s\\S]*access_token\\s+TEXT/i)
    expect(sql).not.toMatch(/search_console_connections[\\s\\S]*refresh_token\\s+TEXT/i)
  })

  it('enforces client identity and deterministic deduplication', () => {
    expect(sql).toContain('UNIQUE (client_id, id)')
    expect(sql).toContain('UNIQUE (client_id, property_uri)')
    expect(sql).toContain('UNIQUE (site_id, fingerprint)')
    expect(sql).toContain('REFERENCES agency_clients(id) ON DELETE CASCADE')
  })

  it('supports atomic daily replacement and provisional metadata', () => {
    expect(sql).toContain('PRIMARY KEY (property_map_id, metric_date, search_type, query_text, page_url)')
    expect(sql).toContain('provisional BOOLEAN NOT NULL DEFAULT FALSE')
    expect(sql).toContain('first_incomplete_date DATE')
  })
})
```

- [ ] **Step 2: Run the test and verify the missing migration fails**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
  pnpm vitest run test/config/searchAuthorityMigration.test.ts
```

Expected: FAIL because migration 329 does not exist.

- [ ] **Step 3: Create the additive migration**

The migration must:

1. Add `google_oauth_attempts.purpose` and an index on
   `(initiated_by, purpose, expires_at)` for unconsumed attempts.
2. Create `search_authority_sites` with:
   `id`, `client_id`, `canonical_hostname`, `content_hostname`, `status`,
   `settings`, `created_by`, timestamps, `UNIQUE(client_id)` and
   `UNIQUE(client_id,id)`.
3. Create `search_console_connections` pointing only to
   `google_credential_profiles`, with Google subject/email, status and
   connection-health fields.
4. Create `search_console_property_maps` with composite client/site integrity,
   provider property URI, permission level, property type, status,
   `data_through_date`, `provisional_from_date`, and last-sync state.
5. Create sync/fact tables with composite primary keys and cascade deletes.
6. Create URL-inspection history keyed by property map, inspected URL and
   inspection time.
7. Create opportunities with a deterministic `fingerprint`, score range
   `0..100`, lifecycle check, reason JSON, optional `task_id`, and immutable
   evidence snapshots.
8. Add indexes for client/status/date reads and pending sync work.
9. Add comments explaining provider limitations and rollback guidance.

- [ ] **Step 4: Run the migration contract test**

Expected: PASS.

- [ ] **Step 5: Check migration-number availability against current main**

Run:

```bash
git fetch origin main
git ls-tree -r --name-only origin/main server/database/migrations \
  | rg '/329[_-]'
```

Expected: no output. If main now owns 329, rename this migration and its
contract to the next unused integer before applying it.

- [ ] **Step 6: Apply the migration automatically**

Run:

```bash
set -a
source /Users/paulgiurin/Documents/Projects/dashboard/.env
set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f server/database/migrations/329_search_authority_phase_1.sql
```

Expected: all additive statements complete without error.

- [ ] **Step 7: Commit**

```bash
git add server/database/migrations/329_search_authority_phase_1.sql \
  test/config/searchAuthorityMigration.test.ts
git commit -m "feat(search-authority): add phase one data model"
```

---

### Task 2: Add feature entitlement and access gates

**Files:**

- Create: `server/utils/searchAuthority/feature.ts`
- Create: `server/utils/searchAuthority/access.ts`
- Create: `test/server/utils/searchAuthorityFeature.test.ts`
- Modify: `nuxt.config.ts`
- Modify: `.env.example`

**Interfaces:**

- Produces:
  `SEARCH_AUTHORITY_FEATURE`,
  `isSearchAuthorityEnabled(clientId, db?)`,
  `listSearchAuthorityClientIds()`,
  `requireAgencySearchAuthorityAccess(event, clientId, options?)`,
  `requirePortalSearchAuthorityAccess(event)`.

- [ ] **Step 1: Write failing entitlement and access tests**

Test active/trial access, expired/suspended denial, global kill-switch denial,
management all-client access, account-manager assignment checks, malformed UUID
rejection and portal client ownership.

- [ ] **Step 2: Run focused tests**

Expected: FAIL because the utilities do not exist.

- [ ] **Step 3: Implement entitlement checks**

Use:

```ts
export const SEARCH_AUTHORITY_FEATURE = 'search_authority.core'

export async function isSearchAuthorityEnabled(clientId: string): Promise<boolean> {
  const config = useRuntimeConfig()
  if (!config.searchAuthorityEnabled) return false
  const row = await queryOne<{ enabled: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM client_feature_entitlements
       WHERE client_id = $1
         AND feature_key = $2
         AND status IN ('active', 'trial')
         AND starts_at <= NOW()
         AND (expires_at IS NULL OR expires_at > NOW())
     ) AS enabled`,
    [clientId, SEARCH_AUTHORITY_FEATURE]
  )
  return Boolean(row?.enabled)
}
```

Agency access must reuse the role and assignment semantics in
`server/utils/tracking/analytics-access.ts`. Portal access must derive the
client from `requireClientAuth(event)` and require `canViewAnalytics`.

- [ ] **Step 4: Add the global flag**

Add private runtime config:

```ts
searchAuthorityEnabled: process.env.SEARCH_AUTHORITY_ENABLED === 'true'
```

Document `SEARCH_AUTHORITY_ENABLED=false` in `.env.example`.

- [ ] **Step 5: Run focused tests and commit**

```bash
git add nuxt.config.ts .env.example server/utils/searchAuthority \
  test/server/utils/searchAuthorityFeature.test.ts
git commit -m "feat(search-authority): gate client access"
```

---

### Task 3: Build the least-privilege Google provider layer

**Files:**

- Create: `server/utils/searchAuthority/googleClient.ts`
- Create: `server/utils/searchAuthority/credentials.ts`
- Create: `test/server/utils/searchAuthorityGoogleClient.test.ts`
- Create: `test/server/utils/searchAuthorityCredentials.test.ts`
- Modify: `server/utils/googleCredentialProfiles.ts`
- Modify: `server/utils/googleOAuthRuntimeConfig.ts`
- Modify: `nuxt.config.ts`
- Modify: `.env.example`

**Interfaces:**

- Produces:
  `SEARCH_CONSOLE_SCOPES`,
  `getSearchConsoleAuthUrl(clientId, redirectUri, state)`,
  `listSearchConsoleProperties(accessToken)`,
  `querySearchAnalytics(accessToken, propertyUri, request)`,
  `inspectSearchConsoleUrl(accessToken, propertyUri, url)`,
  `storeSearchConsoleCredentialProfile(input)`,
  `resolveSearchConsoleCredential(connectionId)`,
  `refreshSearchConsoleCredential(connectionId)`.
- Changes OAuth attempt signatures to accept purpose:
  `createGoogleOAuthAttempt(userId, { purpose, ...deps })` and
  `consumeGoogleOAuthAttempt(state, userId, { purpose, ...deps })`.

- [ ] **Step 1: Write provider parsing/request tests**

Cover URL-prefix and `sc-domain:` properties, permission levels, 25,000-row
pagination, `dataState`, `first_incomplete_date`, response aggregation type,
encoded property URIs, request timeout, provider errors and indexed-version URL
Inspection fields.

- [ ] **Step 2: Write credential tests**

Assert:

- Search Console uses a separate encrypted profile labelled
  `Search Console · <email>`.
- metadata contains `{ purpose: 'search_console', googleSub, email }`.
- plaintext tokens never enter `search_console_connections`.
- an Ads OAuth attempt cannot be consumed by the Search Console callback.
- refresh persists to the encrypted profile via
  `persistGoogleCredentialRefresh`.

- [ ] **Step 3: Run focused tests**

Expected: FAIL because provider utilities and purpose signatures are absent.

- [ ] **Step 4: Implement the provider client**

Use these endpoints:

- OAuth: `https://accounts.google.com/o/oauth2/v2/auth`
- Sites: `GET https://www.googleapis.com/webmasters/v3/sites`
- Search Analytics:
  `POST https://www.googleapis.com/webmasters/v3/sites/{encodedSiteUrl}/searchAnalytics/query`
- URL Inspection:
  `POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`

Set a 20-second timeout and return typed provider metadata without silently
coercing missing rows to complete data.

- [ ] **Step 5: Implement encrypted credential persistence**

Reuse `encryptToken`, `decryptToken`, `google_credential_profiles`,
`resolveGoogleCredential`, `persistGoogleCredentialRefresh` and
`refreshGoogleToken`. Do not add provider tokens to `social_connections`.

- [ ] **Step 6: Add runtime callback configuration**

Add:

```ts
export const SEARCH_CONSOLE_CALLBACK_PATH =
  '/api/agency/search-authority/google/callback'
```

and `SEARCH_CONSOLE_REDIRECT_URI` with that fallback.

- [ ] **Step 7: Run focused tests and commit**

```bash
git add server/utils/googleCredentialProfiles.ts \
  server/utils/googleOAuthRuntimeConfig.ts \
  server/utils/searchAuthority/googleClient.ts \
  server/utils/searchAuthority/credentials.ts \
  test/server/utils/searchAuthorityGoogleClient.test.ts \
  test/server/utils/searchAuthorityCredentials.test.ts \
  nuxt.config.ts .env.example
git commit -m "feat(search-authority): add Search Console provider"
```

---

### Task 4: Add setup, OAuth and property-mapping APIs

**Files:**

- Create: `server/api/agency/search-authority/sites/index.post.ts`
- Create: `server/api/agency/search-authority/sites/index.get.ts`
- Create: `server/api/agency/search-authority/google/connect.get.ts`
- Create: `server/api/agency/search-authority/google/callback.get.ts`
- Create: `server/api/agency/search-authority/google/properties.get.ts`
- Create: `server/api/agency/search-authority/google/map.post.ts`
- Create: `server/api/agency/search-authority/google/disconnect.delete.ts`
- Create: `test/server/api/searchAuthoritySetup.test.ts`
- Create: `test/server/api/searchAuthorityGoogleOAuth.test.ts`
- Create: `test/server/api/searchAuthorityPropertyMapping.test.ts`

**Interfaces:**

- `POST /api/agency/search-authority/sites` accepts:
  `{ clientId, canonicalHostname, contentHostname? }`.
- `GET /api/agency/search-authority/google/properties?clientId=...` returns
  credential-safe connection health, discovered properties and current map.
- `POST /api/agency/search-authority/google/map` accepts:
  `{ clientId, connectionId, propertyUri, permissionLevel }`.

- [ ] **Step 1: Write endpoint tests**

Test Zod validation, admin/media role gates, client assignments, feature flag,
hostname normalisation, entitlement upsert, purpose-bound state, denied OAuth,
replayed state, encrypted callback storage, unverified properties, cross-client
connection rejection and absence of credential fields in responses.

- [ ] **Step 2: Run tests and verify failure**

- [ ] **Step 3: Implement site readiness upsert**

Use one transaction to insert/update `search_authority_sites` and upsert
`client_feature_entitlements` with `feature_key='search_authority.core'`,
`status='trial'`, and `source='search_authority_pilot'`.

- [ ] **Step 4: Implement OAuth routes**

Create and consume `purpose='search_console'` attempts. Every callback branch
redirects to:

`/auth/oauth-callback?platform=search-console&success=<true|false>`

- [ ] **Step 5: Implement property discovery and mapping**

Reject `siteUnverifiedUser`. Preserve `siteRestrictedUser` in the response and
let the operator see it, but require a verified permission level to create an
active map. Determine `property_type` from `sc-domain:` versus URL prefix.

- [ ] **Step 6: Run focused tests and commit**

```bash
git add server/api/agency/search-authority test/server/api/searchAuthority*.test.ts
git commit -m "feat(search-authority): add Search Console onboarding"
```

---

### Task 5: Build the onboarding and connection UI

**Files:**

- Create: `app/pages/agency/search-authority/connections.vue`
- Create: `app/components/search-authority/SiteReadinessCard.vue`
- Create: `app/components/search-authority/SearchConsoleConnectCard.vue`
- Create: `test/app/searchAuthorityConnections.test.ts`
- Modify: `app/layouts/agency.vue`

**Interfaces:**

- Consumes Task 4 APIs.
- Produces a route at `/agency/search-authority/connections`.

- [ ] **Step 1: Invoke the required form-design guidance**

Read and apply:

`~/.Codex/plugins/marketplaces/Codex-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`

- [ ] **Step 2: Write failing component/route contract tests**

Assert Nuxt UI controls, `UFormField` labels, full-width fields, non-empty
`USelectMenu` values, connection health, provisional/provider caveats, no
credential rendering, and the agency navigation entry.

- [ ] **Step 3: Implement the readiness form**

Use `UFormField`, `USelectMenu`, `UInput`, `UButton`, `UAlert` and `useToast`.
No native inputs, selects, alerts, confirms or prompts.

- [ ] **Step 4: Implement the Search Console connection card**

The button opens the OAuth popup, refreshes after the popup closes, groups
properties by connection, displays permission level, and maps exactly one
property to one configured Search Authority site.

- [ ] **Step 5: Run tests and commit**

```bash
git add app/pages/agency/search-authority/connections.vue \
  app/components/search-authority app/layouts/agency.vue \
  test/app/searchAuthorityConnections.test.ts
git commit -m "feat(search-authority): add onboarding workspace"
```

---

### Task 6: Implement reliable Search Analytics ingestion

**Files:**

- Create: `server/utils/searchAuthority/dates.ts`
- Create: `server/utils/searchAuthority/repository.ts`
- Create: `server/utils/searchAuthority/sync.ts`
- Create: `server/api/agency/search-authority/sync.post.ts`
- Create: `test/server/utils/searchAuthorityDates.test.ts`
- Create: `test/server/utils/searchAuthorityRepository.test.ts`
- Create: `test/server/utils/searchAuthoritySync.test.ts`
- Create: `test/server/api/searchAuthoritySyncEndpoint.test.ts`

**Interfaces:**

- Produces:
  `searchConsoleSyncWindow`,
  `replaceQueryPageDate`,
  `replacePageDate`,
  `replacePropertyDate`,
  `syncSearchConsoleProperty`,
  `syncSearchConsoleClient`.

- [ ] **Step 1: Write date and provider-window tests**

Test Pacific-date boundaries, leap days, 90-day initial window, trailing
three-day refresh, explicit manual range validation and maximum 90-day manual
window.

- [ ] **Step 2: Write atomic-replacement repository tests**

Each projection/date transaction must delete the old day and insert the new
provider rows. An empty provider result must replace the day with zero rows and
record the successful checked state; it must not be interpreted as complete
demand.

- [ ] **Step 3: Write orchestration tests**

Assert:

- three independent projections per date: property, page, query+page;
- `rowLimit=25000`, `startRow` pagination and a 50,000-row per-day/projection
  safety cap;
- provisional dates come from provider metadata;
- token refresh occurs once per connection;
- partial property failures do not erase successful dates;
- sync runs expose queued/running/succeeded/partial/failed state;
- retryable provider failures back off with bounded attempts;
- repeated windows are idempotent.

- [ ] **Step 4: Implement sync utilities**

Query every date independently. Never derive page/property totals from the
query+page table. Use bounded concurrency for provider calls and sequential
database transactions for the shared Neon/Hyperdrive client.

- [ ] **Step 5: Implement manual sync endpoint**

Return a queued/background result immediately using the existing
`runSpendSyncInBackground` pattern. Require explicit client access.

- [ ] **Step 6: Run focused tests and commit**

```bash
git add server/utils/searchAuthority server/api/agency/search-authority/sync.post.ts \
  test/server/utils/searchAuthority*.test.ts \
  test/server/api/searchAuthoritySyncEndpoint.test.ts
git commit -m "feat(search-authority): ingest Search Console evidence"
```

---

### Task 7: Add URL Inspection and scheduled refresh

**Files:**

- Create: `server/utils/searchAuthority/inspection.ts`
- Create: `server/api/cron/search-console-sync.post.ts`
- Create: `test/server/utils/searchAuthorityInspection.test.ts`
- Create: `test/server/api/searchConsoleCron.test.ts`
- Create: `test/config/searchAuthorityCronWorker.test.ts`
- Modify: `workers/pages-cron/src/index.ts`
- Modify: `workers/pages-cron/wrangler.toml`
- Modify: `wrangler.toml`

**Interfaces:**

- Produces:
  `selectInspectionCandidates(clientId, limit)`,
  `inspectPriorityUrls(clientId, limit)`.

- [ ] **Step 1: Write inspection priority tests**

Order: newly published/changed pages, pages with material findings, homepage and
priority pages, then rotating VDPs. Deduplicate URL/property pairs and cap each
client run at 50 inspections.

- [ ] **Step 2: Write cron contract tests**

Assert the cron route requires `x-cron-secret`, processes only entitled active
clients, runs daily and appears in both the Pages Cron worker route map and
trigger list.

- [ ] **Step 3: Implement indexed-version persistence**

Store verdict, coverage state, robots/indexing/fetch state, last crawl,
Google/user canonical, sitemap references and inspection timestamp. Label the
result `indexed_version`; never expose it as a live test.

- [ ] **Step 4: Add the daily schedule**

Use `15 2 * * *` and route `/api/cron/search-console-sync`. Keep this separate
from the hourly GA4 jobs.

- [ ] **Step 5: Run focused tests and commit**

```bash
git add server/utils/searchAuthority/inspection.ts \
  server/api/cron/search-console-sync.post.ts \
  workers/pages-cron wrangler.toml \
  test/server/utils/searchAuthorityInspection.test.ts \
  test/server/api/searchConsoleCron.test.ts \
  test/config/searchAuthorityCronWorker.test.ts
git commit -m "feat(search-authority): schedule evidence refresh"
```

---

### Task 8: Generate explainable opportunities

**Files:**

- Create: `server/utils/searchAuthority/opportunities.ts`
- Create: `server/api/agency/search-authority/opportunities/index.get.ts`
- Create: `server/api/agency/search-authority/opportunities/[id].patch.ts`
- Create: `test/server/utils/searchAuthorityOpportunities.test.ts`
- Create: `test/server/api/searchAuthorityOpportunities.test.ts`

**Interfaces:**

- Produces:
  `generateSearchAuthorityOpportunities(clientId, window)`,
  `scoreSearchAuthorityCandidate(candidate, config)`.
- Lifecycle:
  `new -> under_review -> accepted -> task_created -> in_progress -> published -> measuring -> closed`
  with terminal `dismissed`, `duplicate`, `expired`, `not_actionable`.

- [ ] **Step 1: Write scoring fixtures**

Cover:

- high impressions with CTR below a versioned client/position-band baseline;
- positions 4–15 with material impressions;
- 28-day click/impression decline versus the preceding 28 days;
- material growth worth protecting;
- missing or provisional data reducing confidence;
- identical query/page/type producing one fingerprint;
- a recurring issue updating `last_detected_at` rather than duplicating.

- [ ] **Step 2: Run focused tests and verify failure**

- [ ] **Step 3: Implement deterministic scoring**

Return:

```ts
interface OpportunityScore {
  score: number
  scoringVersion: 'gsc-v1'
  reasonCodes: Array<{
    code: string
    observed: number | string | null
    expected: number | string | null
    contribution: number
  }>
}
```

No AI calls are allowed in the scoring module.

- [ ] **Step 4: Implement lifecycle APIs**

Use Zod and an explicit transition map. Reject invalid transitions with 409.
List responses include provider window, provisional state, score reasons and
linked task ID.

- [ ] **Step 5: Run tests and commit**

```bash
git add server/utils/searchAuthority/opportunities.ts \
  server/api/agency/search-authority/opportunities \
  test/server/utils/searchAuthorityOpportunities.test.ts \
  test/server/api/searchAuthorityOpportunities.test.ts
git commit -m "feat(search-authority): surface organic opportunities"
```

---

### Task 9: Build the agency workspace and manual task handoff

**Files:**

- Create: `app/pages/agency/search-authority/index.vue`
- Create: `app/components/search-authority/OpportunityTable.vue`
- Create: `app/components/search-authority/DataHealthCard.vue`
- Create: `app/components/search-authority/OverviewMetrics.vue`
- Create: `server/api/agency/search-authority/overview.get.ts`
- Create: `server/api/agency/search-authority/opportunities/[id]/task-link.post.ts`
- Create: `test/app/searchAuthorityWorkspace.test.ts`
- Create: `test/server/api/searchAuthorityTaskLink.test.ts`
- Modify: `app/components/workflow/TaskCreateDialog.vue`
- Modify: `app/types/index.ts`

**Interfaces:**

- Add TaskCreateDialog props:
  `initialTitle?: string`, `initialDescription?: string`.
- Change created emit to:
  `'created': [task: { id: string, title: string }]`.
- `POST .../task-link` accepts `{ taskId }` and atomically links only an
  accepted opportunity without an existing task.

- [ ] **Step 1: Invoke the required form-design guidance**

Read and apply the project `frontend-design` skill before changing
`TaskCreateDialog.vue`.

- [ ] **Step 2: Write task-dialog and workspace tests**

Assert initial evidence text is editable, no task exists before submit, one
normal task POST occurs, the returned task ID is linked, duplicate linking is
409, and the opportunity remains recoverable if task linking fails.

- [ ] **Step 3: Implement overview API**

Return client-scoped facts: connection/data-through health, clicks,
impressions, CTR, average position, material changes, opportunity counts and
provider caveats. Do not invent an AI visibility metric.

- [ ] **Step 4: Implement the agency page**

Use Nuxt UI cards, badges, tables, tabs, skeletons and alerts. Provide client,
date and lifecycle filters. Connection failures must display stale last-known
data with a warning.

- [ ] **Step 5: Implement task handoff**

Open the existing `WorkflowTaskCreateDialog` with evidence-prefilled title and
description. After successful task creation, link the returned task ID and move
the opportunity to `task_created`.

- [ ] **Step 6: Run focused tests and commit**

```bash
git add app/pages/agency/search-authority app/components/search-authority \
  app/components/workflow/TaskCreateDialog.vue app/types/index.ts \
  server/api/agency/search-authority/overview.get.ts \
  server/api/agency/search-authority/opportunities \
  test/app/searchAuthorityWorkspace.test.ts \
  test/server/api/searchAuthorityTaskLink.test.ts
git commit -m "feat(search-authority): add evidence workspace"
```

---

### Task 10: Add the portal summary, marketing surface and release checks

**Files:**

- Create: `app/pages/portal/search-authority.vue`
- Create: `server/api/portal/search-authority/overview.get.ts`
- Create: `test/app/portalSearchAuthority.test.ts`
- Create: `test/server/api/portalSearchAuthority.test.ts`
- Create: `docs/runbooks/search-authority-phase-1.md`
- Modify: `app/layouts/portal.vue`
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/components/MarketingNav.vue`
- Modify: `docs/prd/search-authority-ai-trust-platform.md`

**Interfaces:**

- Portal endpoint derives the client from `requireClientAuth`.
- Portal response contains no raw query text flagged as private, connection IDs,
  credential metadata, internal scoring weights or cross-client benchmarks.

- [ ] **Step 1: Write portal access and copy tests**

Test analytics permission, entitlement, own-client isolation, measured-fact
language, unavailable/provisional states and no internal metadata leakage.

- [ ] **Step 2: Implement the portal summary**

Show material visibility changes, approved actions, data freshness and next
steps. Keep the agency opportunity scoring and raw technical evidence private.

- [ ] **Step 3: Update public marketing pages**

Add `Search Authority & AI Trust` under Analytics & Reporting with a feature
detail containing four sections: Search evidence, technical trust, governed
content workflow and transparent measurement. Update the mega menu entry.

- [ ] **Step 4: Write the operational runbook**

Include Node version, global flag, Google OAuth configuration, entitlement
activation, Knox property mapping, initial 90-day sync, health verification,
kill switch, rollback, cron activation and known provider limitations.

- [ ] **Step 5: Update PRD implementation status**

Mark only Phase 0–1 items actually delivered. Do not mark technical crawling,
edge publishing, Menu Agent or GBP complete.

- [ ] **Step 6: Run focused and regression tests**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
  pnpm vitest run \
  test/config/searchAuthorityMigration.test.ts \
  test/config/searchAuthorityCronWorker.test.ts \
  test/server/utils/searchAuthority*.test.ts \
  test/server/api/searchAuthority*.test.ts \
  test/server/api/searchConsoleCron.test.ts \
  test/app/searchAuthority*.test.ts \
  test/app/portalSearchAuthority.test.ts
```

Expected: all Search Authority tests PASS.

- [ ] **Step 7: Run full-suite comparison**

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm test:run
```

Expected: no Search Authority failures and no increase beyond the recorded
39 unrelated baseline failures.

- [ ] **Step 8: Run the repository battle test**

Re-read every modified file, check Nitro aliases, UUID/client gates,
credential response shapes, SSRF exposure, reactivity, Nuxt UI form rules,
dark-mode variants, migration application, cron target safety and exact PR
diff.

- [ ] **Step 9: Commit**

```bash
git add app/pages/portal/search-authority.vue app/layouts/portal.vue \
  server/api/portal/search-authority test/app/portalSearchAuthority.test.ts \
  test/server/api/portalSearchAuthority.test.ts \
  app/pages/features/index.vue 'app/pages/features/[slug].vue' \
  app/components/MarketingNav.vue docs/runbooks/search-authority-phase-1.md \
  docs/prd/search-authority-ai-trust-platform.md
git commit -m "docs(search-authority): complete phase one rollout"
```

---

## Plan Self-Review

- **Spec coverage:** Phase 0 readiness, GSC connection, 90-day ingestion,
  trailing refresh, provider metadata, URL Inspection, opportunity evidence,
  manual task creation, agency overview and client summary are mapped to Tasks
  1–10.
- **Explicitly deferred:** technical crawler, public edge publisher, content
  workflow, Menu Agent and GBP remain later PRD phases.
- **Credential consistency:** all Search Console credentials resolve through
  `google_credential_profiles`; no task introduces plaintext provider-token
  columns.
- **Tenant consistency:** all operational rows are client-scoped and all access
  paths gate the owning client.
- **Provider honesty:** projections are queried independently, provisional
  metadata is retained, URL Inspection is labelled indexed-version, and missing
  data is not relabelled as zero.
- **Execution strategy:** inline execution is required in this session because
  parallel sub-agent delegation is not authorized.
