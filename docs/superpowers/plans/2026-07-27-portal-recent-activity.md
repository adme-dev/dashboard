# Portal Recent Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move customer portal Recent Activity from the dashboard to a dedicated full-width sidebar destination.

**Architecture:** Add one tenant-scoped activity endpoint backed by a composite Postgres index, then render that response on `/portal/activity`. Remove the old dashboard query and card so the move also reduces dashboard database work.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Nitro, Neon Postgres, Vitest.

## Global Constraints

- Use Nuxt UI v4 components for all UI.
- Server imports use the `~~/server/` alias.
- Personalized portal responses remain `private, no-store`.
- Never accept a client ID from the activity request.
- The page root must be full width and must not use a `max-w-*` cap.
- Database migrations are applied automatically from `.env`.

---

### Task 1: Tenant-scoped activity API and database index

**Files:**
- Create: `server/api/portal/activity/index.get.ts`
- Create: `server/database/migrations/314_client_activity_tenant_created_index.sql`
- Modify: `server/database/schema-client-portal.sql`
- Create: `test/server/api/portalActivity.test.ts`

**Interfaces:**
- Consumes: `requireClientAuth(event)` and `queryRows(sql, params)`.
- Produces: `GET /api/portal/activity?limit=50` returning
  `{ activity: PortalActivity[] }`.

- [ ] **Step 1: Write the failing endpoint tests**

  Cover the authenticated user's `clientId` as the only tenant parameter,
  default limit 50, maximum limit 100, no IP/user-agent fields in the mapped
  response, and a normalized 500 error for database failures.

- [ ] **Step 2: Run the endpoint test and verify it fails**

  Run:
  `pnpm exec vitest run test/server/api/portalActivity.test.ts`

  Expected: FAIL because `server/api/portal/activity/index.get.ts` does not
  exist.

- [ ] **Step 3: Implement the minimal endpoint**

  Query `client_activity_log` joined to `client_users`, filter with
  `WHERE cal.client_id = $1`, sort by `cal.created_at DESC`, and bind a clamped
  limit as `$2`. Map only `id`, `action`, `entityType`, `entityId`, `details`,
  `createdAt`, and `userName`.

- [ ] **Step 4: Add the composite index**

  Add:

  ```sql
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_activity_client_created
    ON client_activity_log (client_id, created_at DESC);
  ```

  Mirror the index in `server/database/schema-client-portal.sql`.

- [ ] **Step 5: Apply the migration**

  Run:

  ```bash
  export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -f server/database/migrations/314_client_activity_tenant_created_index.sql
  ```

  Expected: `CREATE INDEX` or an existing-index notice.

- [ ] **Step 6: Run the endpoint test**

  Run:
  `pnpm exec vitest run test/server/api/portalActivity.test.ts`

  Expected: PASS.

- [ ] **Step 7: Commit**

  Commit message:
  `feat(portal): add tenant-scoped activity feed API`

### Task 2: Dedicated full-width activity page and sidebar destination

**Files:**
- Create: `app/utils/portalActivity.ts`
- Create: `app/pages/portal/activity.vue`
- Modify: `app/layouts/portal.vue`
- Modify: `test/app/portalContentWidth.test.ts`
- Create: `test/app/portalActivityNavigation.test.ts`

**Interfaces:**
- Consumes: `GET /api/portal/activity`.
- Produces: `/portal/activity`, `PortalActivity`, `portalActivityIcon()`,
  `portalActivityLabel()`, and a `Recent Activity` sidebar item.

- [ ] **Step 1: Write failing UI contract tests**

  Assert that the sidebar contains `Recent Activity` with
  `to: '/portal/activity'`, the new page uses portal auth metadata, the page
  root contains `w-full` without `max-w-*`, and the page fetches
  `/api/portal/activity`.

- [ ] **Step 2: Run the UI contract tests and verify they fail**

  Run:
  `pnpm exec vitest run test/app/portalActivityNavigation.test.ts test/app/portalContentWidth.test.ts`

  Expected: FAIL because the page and navigation item do not exist.

- [ ] **Step 3: Create shared activity presentation helpers**

  Define the exact `PortalActivity` response type plus safe detail parsing,
  action icon selection, and the existing human-readable action labels in
  `app/utils/portalActivity.ts`.

- [ ] **Step 4: Build the page**

  Use `useFetch('/api/portal/activity', { query: { limit: 50 } })`. Render a
  full-width header and a `UCard` feed with `UIcon`, actor name, action label,
  and relative timestamp. Use `USkeleton` while pending, `UAlert` plus a
  `UButton` retry on error, and a centered empty state when no rows exist.

- [ ] **Step 5: Add the sidebar item**

  Place `Recent Activity` directly after `Dashboard`, use
  `i-lucide-history`, route to `/portal/activity`, and reuse `close`.

- [ ] **Step 6: Run the UI tests**

  Run:
  `pnpm exec vitest run test/app/portalActivityNavigation.test.ts test/app/portalContentWidth.test.ts`

  Expected: PASS.

- [ ] **Step 7: Commit**

  Commit message:
  `feat(portal): add recent activity sidebar page`

### Task 3: Remove dashboard activity work and verify the move

**Files:**
- Modify: `server/api/portal/dashboard.get.ts`
- Modify: `app/pages/portal/index.vue`
- Modify: `test/server/api/portalDashboardEnterprise.test.ts`
- Modify: `test/app/portalActivityNavigation.test.ts`

**Interfaces:**
- Consumes: the dedicated page from Task 2.
- Produces: an operations dashboard with one fewer query and no activity
  response/card.

- [ ] **Step 1: Extend failing removal tests**

  Assert the dashboard source no longer contains the `Recent Activity` card or
  activity helpers, dashboard API SQL no longer reads
  `client_activity_log`, and operations use no more than six SQL calls.

- [ ] **Step 2: Run the removal tests and verify they fail**

  Run:
  `pnpm exec vitest run test/app/portalActivityNavigation.test.ts test/server/api/portalDashboardEnterprise.test.ts`

  Expected: FAIL against the existing dashboard implementation.

- [ ] **Step 3: Remove server dashboard activity**

  Delete the operations activity query, response mapping, and local value from
  `server/api/portal/dashboard.get.ts`.

- [ ] **Step 4: Remove client dashboard activity**

  Delete `recentActivity` from `PortalDashboard`, the operations merge,
  activity-only helper functions, and the Recent Activity `UCard` from
  `app/pages/portal/index.vue`.

- [ ] **Step 5: Run focused tests**

  Run:
  `pnpm exec vitest run test/server/api/portalActivity.test.ts test/app/portalActivityNavigation.test.ts test/app/portalContentWidth.test.ts test/server/api/portalDashboardEnterprise.test.ts`

  Expected: PASS.

- [ ] **Step 6: Run verification**

  Run the portal-focused Vitest set, `git diff --check`, the complete Vitest
  suite, and `pnpm run build`. Confirm the worker-size guard remains below
  24.50 MiB and record unrelated baseline failures separately.

- [ ] **Step 7: Commit**

  Commit message:
  `perf(portal): remove dashboard activity query`

