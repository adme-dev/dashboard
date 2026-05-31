# Per-Client Tracking Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a per-client analytics view over Slice 1's `tracking_events` — KPIs, traffic-over-time, top pages, acquisition, device/browser, call/lead intent, and a basic funnel — surfaced both as a `/agency/tracking/[clientId]` drill-down and a "Website" tab on the client page, scoped to clients the user may access.

**Architecture:** One container component (`ClientTrackingAnalytics`) owns the date range + all panels + fetching; both surfaces render it. Four client-scoped Nitro aggregation endpoints query `tracking_events` on-the-fly using the existing indexes, bucketing days in the client's `reporting_timezone`. A new `requireClientTrackingAccess` helper (management roles see all; media_buyer/account_manager scoped via `client_team_assignments`) gates every endpoint — this also closes the Slice-1 IDOR.

**Tech Stack:** Nuxt 4 / Nitro, Neon Postgres (`server/utils/db.ts`), Unovis (charts), Nuxt UI v4, Vitest (node env). Spec: `docs/superpowers/specs/2026-05-31-tracking-analytics-design.md`.

**Working location:** isolated worktree `.worktrees/tracking-analytics` on branch `feat/tracking-analytics` (off merged Slice 1, `db845c0`). A concurrent session is active on `main` — do **not** switch this worktree's branch.

---

## Conventions (apply to every task)

- **Server imports:** `~~/server/utils/...` (double-tilde). DB: `import { query, queryOne, execute } from '~~/server/utils/db'`.
- **Auth:** `requireAuth` / `requireRole` from `~~/server/utils/auth`. `event.context.user.id` **is** the `team_members.id` (the user table is `team_members`).
- **Tests:** `test/**/*.test.ts`, `environment: 'node'`, import units by relative path. Run one: `pnpm exec vitest run <path>`.
- **Migrations:** numbered kebab-case in `server/database/migrations/`. Next free number is **126**. `IF NOT EXISTS` on every change. Run immediately:
  ```bash
  export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
  psql "$DATABASE_URL" -f server/database/migrations/<file>.sql
  ```
- **TZ bucketing:** `received_at` is `timestamptz`, so the local day is `(e.received_at AT TIME ZONE <tz>)::date` (single `AT TIME ZONE`).
- **Lint:** run `pnpm exec eslint --fix <touched files>` before each commit (comma member-delimiters; `no-explicit-any` is tolerated/pervasive).
- **Commits:** one per task, conventional message, end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Worktree setup (once, before any test runs):** the worktree needs deps + `.nuxt`:
  ```bash
  ln -s ../../node_modules node_modules
  ln -s ../../.env .env
  pnpm exec nuxi prepare
  ```

## File structure map

**Create:**
- `server/database/migrations/126-client-reporting-timezone.sql`
- `server/utils/tracking/analytics-access.ts` — `requireClientTrackingAccess` + `isManagementRole`.
- `server/utils/tracking/analytics-sql.ts` — pure helpers: `dayBucketExpr`, `classifyPaidOrganic`, `classifyUserAgent`, `NOISE_SQL`, `numericJsonb`.
- `server/api/agency/tracking/analytics/[clientId]/summary.get.ts`
- `server/api/agency/tracking/analytics/[clientId]/timeseries.get.ts`
- `server/api/agency/tracking/analytics/[clientId]/breakdown.get.ts`
- `server/api/agency/tracking/analytics/[clientId]/funnel.get.ts`
- `app/components/tracking/analytics/ClientTrackingAnalytics.vue` (container)
- `app/components/tracking/analytics/AnalyticsDateRange.vue`
- `app/components/tracking/analytics/AnalyticsKpis.vue`
- `app/components/tracking/analytics/AnalyticsTrafficChart.client.vue`
- `app/components/tracking/analytics/AnalyticsBreakdownTable.vue`
- `app/components/tracking/analytics/AnalyticsIntent.vue`
- `app/components/tracking/analytics/AnalyticsFunnel.vue`
- `app/pages/agency/tracking/[clientId].vue` (drill-down surface)
- Tests under `test/server/utils/tracking/`.

**Modify:**
- `app/components/agency/ClientForm.vue` — add reporting-timezone field.
- `server/api/agency/clients/[id].put.ts` + `index.post.ts` + `[id].get.ts` — accept/return `reporting_timezone`.
- `app/pages/agency/tracking/index.vue` — make a row's client open the drill-down.
- `app/pages/agency/clients/[id].vue` — add a "Website" tab rendering the container.

---

## Task 1: Migration 126 — per-client reporting timezone

**Files:**
- Create: `server/database/migrations/126-client-reporting-timezone.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 126: per-client reporting timezone for tracking analytics day-bucketing.
ALTER TABLE agency_clients
  ADD COLUMN IF NOT EXISTS reporting_timezone TEXT NOT NULL DEFAULT 'Australia/Brisbane';
```

- [ ] **Step 2: Run it**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/126-client-reporting-timezone.sql
```
Expected: `ALTER TABLE`, no error.

- [ ] **Step 3: Verify + sanity-check the column is a valid TZ for AT TIME ZONE**

```bash
psql "$DATABASE_URL" -c "SELECT NOW() AT TIME ZONE (SELECT reporting_timezone FROM agency_clients LIMIT 1)"
```
Expected: a timestamp (proves the default value works with `AT TIME ZONE`). If there are no clients, run `psql "$DATABASE_URL" -c \"SELECT NOW() AT TIME ZONE 'Australia/Brisbane'\"` instead.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/126-client-reporting-timezone.sql
git commit -m "feat(tracking): migration 126 — agency_clients.reporting_timezone"
```

---

## Task 2: Client form + API wiring for reporting_timezone

Adds an editable reporting timezone to the client create/edit form and threads it through the create/update/get endpoints. Curated TZ list (AU + common).

**Files:**
- Modify: `app/components/agency/ClientForm.vue`
- Modify: `server/api/agency/clients/[id].put.ts`, `server/api/agency/clients/index.post.ts`, `server/api/agency/clients/[id].get.ts`

- [ ] **Step 1: Add the field to the form model + a TZ option list**

In `app/components/agency/ClientForm.vue`, find the reactive form model (the object holding `name`, `billingType`, `hourlyRate`, …) and add `reportingTimezone` defaulting from the edit payload or `'Australia/Brisbane'`. Add this option list near the other option arrays in `<script setup>`:

```ts
const TIMEZONE_OPTIONS = [
  { label: 'Brisbane (AEST)', value: 'Australia/Brisbane' },
  { label: 'Sydney / Melbourne (AEST/AEDT)', value: 'Australia/Sydney' },
  { label: 'Adelaide (ACST/ACDT)', value: 'Australia/Adelaide' },
  { label: 'Perth (AWST)', value: 'Australia/Perth' },
  { label: 'Auckland (NZST/NZDT)', value: 'Pacific/Auckland' },
  { label: 'UTC', value: 'UTC' },
  { label: 'London (GMT/BST)', value: 'Europe/London' },
  { label: 'New York (ET)', value: 'America/New_York' },
  { label: 'Los Angeles (PT)', value: 'America/Los_Angeles' },
]
```

- [ ] **Step 2: Render the field** (after the Default Hourly Rate `UFormField`, ~line 210)

```vue
<UFormField label="Reporting timezone" help="Used for day boundaries in website analytics.">
  <USelectMenu
    v-model="form.reportingTimezone"
    :items="TIMEZONE_OPTIONS"
    value-key="value"
    class="w-full"
  />
</UFormField>
```
Ensure the submit handler includes `reportingTimezone: form.reportingTimezone` in the body it sends (follow the existing `billingType`/`hourlyRate` submission shape).

- [ ] **Step 3: Accept it in the update endpoint**

In `server/api/agency/clients/[id].put.ts`, add to the camelCase→snake_case map (the object starting near line 38 with `billingType: 'billing_type'`):

```ts
    reportingTimezone: 'reporting_timezone',
```
And in the returned client mapping (near line 99), add:

```ts
        reportingTimezone: client.reporting_timezone,
```

- [ ] **Step 4: Accept it in the create endpoint**

In `server/api/agency/clients/index.post.ts`, include `reporting_timezone` in the INSERT (default when absent): add the column to the column list and `$N` placeholder, with value `body.reportingTimezone ?? 'Australia/Brisbane'`. Match the file's existing INSERT shape exactly.

- [ ] **Step 5: Return it from the detail GET**

In `server/api/agency/clients/[id].get.ts`, ensure `reporting_timezone` is selected (the main client select uses `c.*` — confirm; if it lists explicit columns, add `reporting_timezone`) and add `reportingTimezone: client.reporting_timezone` to the returned object.

- [ ] **Step 6: Lint + verify the form renders / round-trips**

```bash
pnpm exec eslint --fix app/components/agency/ClientForm.vue server/api/agency/clients/[id].put.ts server/api/agency/clients/index.post.ts server/api/agency/clients/[id].get.ts
```
Manual: `pnpm dev` (if the dev server is unavailable here due to EMFILE, defer to a deployed check), edit a client, set timezone to Sydney, save, reopen — value persists. DB check:
```bash
psql "$DATABASE_URL" -c "SELECT name, reporting_timezone FROM agency_clients ORDER BY updated_at DESC LIMIT 3"
```

- [ ] **Step 7: Commit**

```bash
git add app/components/agency/ClientForm.vue server/api/agency/clients
git commit -m "feat(tracking): per-client reporting timezone field + API wiring"
```

---

## Task 3: Per-client access gate (`analytics-access.ts`)

The IDOR fix. Management roles see all clients; scoped roles must be assigned via `client_team_assignments`. The role-classification helper is pure + unit-tested; the DB membership check is integration-verified.

**Files:**
- Create: `server/utils/tracking/analytics-access.ts`
- Test: `test/server/utils/tracking/analytics-access.test.ts`

- [ ] **Step 1: Write the failing test (pure role classifier)**

```ts
// test/server/utils/tracking/analytics-access.test.ts
import { describe, it, expect } from 'vitest'
import { isManagementRole, ANALYTICS_ROLES } from '../../../../server/utils/tracking/analytics-access'

describe('isManagementRole', () => {
  it('treats owner/admin/lead/project_manager as management (see all clients)', () => {
    expect(isManagementRole('owner')).toBe(true)
    expect(isManagementRole('admin')).toBe(true)
    expect(isManagementRole('lead')).toBe(true)
    expect(isManagementRole('project_manager')).toBe(true)
  })
  it('treats scoped roles as non-management', () => {
    expect(isManagementRole('media_buyer')).toBe(false)
    expect(isManagementRole('account_manager')).toBe(false)
  })
  it('exposes the full allowed-role set including scoped roles', () => {
    expect(ANALYTICS_ROLES).toContain('media_buyer')
    expect(ANALYTICS_ROLES).toContain('owner')
  })
})
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run test/server/utils/tracking/analytics-access.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// server/utils/tracking/analytics-access.ts
/**
 * Per-client access gate for tracking analytics endpoints (closes the Slice-1
 * IDOR: provisioning endpoints were role-gated only).
 *
 * Management roles see every client. Scoped roles (media_buyer, account_manager)
 * may only read clients they're assigned to via client_team_assignments
 * (team_member_id === the authenticated user's id — the user table IS
 * team_members). NEVER trust a clientId without calling this first.
 */
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import type { H3Event } from 'h3'

const MANAGEMENT_ROLES = ['owner', 'admin', 'lead', 'project_manager'] as const
const SCOPED_ROLES = ['media_buyer', 'account_manager'] as const
export const ANALYTICS_ROLES = [...MANAGEMENT_ROLES, ...SCOPED_ROLES]

export function isManagementRole(role: string): boolean {
  return (MANAGEMENT_ROLES as readonly string[]).includes(role)
}

/** Authenticates, role-gates, and (for scoped roles) verifies client assignment.
 *  Throws 401/403/400 as appropriate. Returns the authenticated user. */
export async function requireClientTrackingAccess(event: H3Event, clientId: string | undefined) {
  const user = await requireAuth(event)
  await requireRole(event, ANALYTICS_ROLES)
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId is required' })
  if (isManagementRole(user.role)) return user
  const row = await queryOne(
    `SELECT 1 FROM client_team_assignments WHERE client_id = $1 AND team_member_id = $2 LIMIT 1`,
    [clientId, user.id],
  )
  if (!row) throw createError({ statusCode: 403, statusMessage: 'No access to this client' })
  return user
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm exec vitest run test/server/utils/tracking/analytics-access.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
pnpm exec eslint --fix server/utils/tracking/analytics-access.ts test/server/utils/tracking/analytics-access.test.ts
git add server/utils/tracking/analytics-access.ts test/server/utils/tracking/analytics-access.test.ts
git commit -m "feat(tracking): per-client analytics access gate (fixes IDOR)"
```

---

## Task 4: Pure SQL/classifier helpers (`analytics-sql.ts`)

Pure functions the endpoints compose: TZ day-bucket fragment, paid/organic classifier, UA→device/browser classifier, a safe-numeric-JSONB fragment, and the shared noise filter. All unit-tested.

**Files:**
- Create: `server/utils/tracking/analytics-sql.ts`
- Test: `test/server/utils/tracking/analytics-sql.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/tracking/analytics-sql.test.ts
import { describe, it, expect } from 'vitest'
import {
  classifyPaidOrganic, classifyUserAgent, numericJsonb, dayBucketExpr, NOISE_SQL,
} from '../../../../server/utils/tracking/analytics-sql'

describe('classifyPaidOrganic', () => {
  it('paid when a click id is present', () => {
    expect(classifyPaidOrganic({ gclid: 'G', utm_source: null, referrer: null })).toBe('paid')
    expect(classifyPaidOrganic({ fbclid: 'F' } as any)).toBe('paid')
  })
  it('organic when a utm_source or referrer is present but no click id', () => {
    expect(classifyPaidOrganic({ utm_source: 'google' } as any)).toBe('organic')
    expect(classifyPaidOrganic({ referrer: 'https://news.com' } as any)).toBe('organic')
  })
  it('direct when nothing is present', () => {
    expect(classifyPaidOrganic({} as any)).toBe('direct')
  })
})

describe('classifyUserAgent', () => {
  it('detects mobile', () => {
    expect(classifyUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari').device).toBe('mobile')
  })
  it('detects tablet', () => {
    expect(classifyUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari').device).toBe('tablet')
  })
  it('defaults to desktop', () => {
    expect(classifyUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Chrome/120').device).toBe('desktop')
  })
  it('extracts a browser family', () => {
    expect(classifyUserAgent('... Chrome/120 ...').browser).toBe('Chrome')
    expect(classifyUserAgent('... Firefox/121 ...').browser).toBe('Firefox')
  })
  it('handles null', () => {
    expect(classifyUserAgent(null).device).toBe('unknown')
  })
})

describe('numericJsonb', () => {
  it('builds a regex-guarded numeric cast (no throw on non-numeric)', () => {
    expect(numericJsonb('duration')).toContain("event_data->>'duration'")
    expect(numericJsonb('duration')).toContain('~')
  })
})

describe('dayBucketExpr', () => {
  it('buckets by the tz param as a local date', () => {
    expect(dayBucketExpr('$4')).toBe('(e.received_at AT TIME ZONE $4)::date')
  })
})

describe('NOISE_SQL', () => {
  it('excludes dead_click and bot UAs', () => {
    expect(NOISE_SQL).toContain("event_name <> 'dead_click'")
    expect(NOISE_SQL.toLowerCase()).toContain('bot')
  })
})
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run test/server/utils/tracking/analytics-sql.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// server/utils/tracking/analytics-sql.ts
/**
 * Pure helpers for the tracking analytics endpoints. No IO. The SQL-fragment
 * builders return strings to compose into parameterised queries — they never
 * interpolate user input (only fixed column/key names and pre-bound $N refs).
 */

/** Local-day bucket for a timestamptz column, given a bound tz param ref (e.g. '$4'). */
export function dayBucketExpr(tzParamRef: string): string {
  return `(e.received_at AT TIME ZONE ${tzParamRef})::date`
}

/** Regex-guarded numeric extraction from event_data — yields NULL (not an error)
 *  for non-numeric values, so a malformed stored event can't 500 an aggregate. */
export function numericJsonb(key: string): string {
  // key is a fixed literal from our own code, never user input.
  return `CASE WHEN event_data->>'${key}' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (event_data->>'${key}')::numeric END`
}

/** Shared WHERE-noise filter: drop dead_click + obvious bots. Compose with AND. */
export const NOISE_SQL
  = `event_name <> 'dead_click' AND (ua IS NULL OR ua !~* '(bot|crawler|spider|slurp|bingpreview|headless|lighthouse|pingdom|gtmetrix)')`

export interface Attributionish {
  gclid?: string | null
  gbraid?: string | null
  wbraid?: string | null
  fbclid?: string | null
  msclkid?: string | null
  ttclid?: string | null
  utm_source?: string | null
  referrer?: string | null
}

const CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid'] as const

export function classifyPaidOrganic(row: Attributionish): 'paid' | 'organic' | 'direct' {
  for (const k of CLICK_IDS) if (row[k]) return 'paid'
  if (row.utm_source || row.referrer) return 'organic'
  return 'direct'
}

export interface UaInfo { device: 'mobile' | 'tablet' | 'desktop' | 'unknown', browser: string }

export function classifyUserAgent(ua: string | null | undefined): UaInfo {
  if (!ua) return { device: 'unknown', browser: 'unknown' }
  const isTablet = /\b(iPad|Tablet)\b/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))
  const isMobile = !isTablet && /(Mobi|iPhone|iPod|Android.*Mobile|Windows Phone)/i.test(ua)
  const device = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop'
  let browser = 'Other'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/Chrome\//i.test(ua)) browser = 'Chrome'
  else if (/Safari\//i.test(ua)) browser = 'Safari'
  return { device, browser }
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm exec vitest run test/server/utils/tracking/analytics-sql.test.ts`
Expected: PASS. (`dayBucketExpr('$4')` returns exactly `(e.received_at AT TIME ZONE $4)::date`.)

- [ ] **Step 5: Commit**

```bash
pnpm exec eslint --fix server/utils/tracking/analytics-sql.ts test/server/utils/tracking/analytics-sql.test.ts
git add server/utils/tracking/analytics-sql.ts test/server/utils/tracking/analytics-sql.test.ts
git commit -m "feat(tracking): pure analytics SQL/classifier helpers"
```

---

## Task 5: Summary endpoint + date helper

KPI aggregates for a client + date range. Introduces a shared `resolveRange` helper (date defaults/caps + client TZ lookup) reused by all four endpoints.

**Files:**
- Create: `server/utils/tracking/analytics-range.ts`
- Create: `server/api/agency/tracking/analytics/[clientId]/summary.get.ts`
- Test: `test/server/utils/tracking/analytics-range.test.ts`

- [ ] **Step 1: Write the failing test for the range helper**

```ts
// test/server/utils/tracking/analytics-range.test.ts
import { describe, it, expect } from 'vitest'
import { parseRange } from '../../../../server/utils/tracking/analytics-range'

describe('parseRange', () => {
  it('defaults to ~30 days when from/to absent', () => {
    const r = parseRange({}, () => new Date('2026-05-31T00:00:00Z'))
    expect(r.toExclusive.getTime() - r.from.getTime()).toBeGreaterThan(29 * 864e5)
  })
  it('makes "to" end-of-day exclusive (to + 1 day)', () => {
    const r = parseRange({ from: '2026-05-01', to: '2026-05-01' }, () => new Date('2026-05-31T00:00:00Z'))
    expect(r.toExclusive.toISOString().slice(0, 10)).toBe('2026-05-02')
  })
  it('throws when from > to', () => {
    expect(() => parseRange({ from: '2026-05-10', to: '2026-05-01' }, () => new Date())).toThrow()
  })
  it('caps ranges longer than 366 days', () => {
    expect(() => parseRange({ from: '2020-01-01', to: '2026-01-01' }, () => new Date())).toThrow()
  })
})
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run test/server/utils/tracking/analytics-range.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the range helper**

```ts
// server/utils/tracking/analytics-range.ts
/** Parse + validate a from/to date query for analytics endpoints. Pure (clock
 *  injectable for tests). `toExclusive` is to + 1 day so the SQL uses [from, toExclusive). */
export interface ParsedRange { from: Date, toExclusive: Date }

const DAY = 86_400_000

export function parseRange(
  q: { from?: string, to?: string },
  now: () => Date = () => new Date(),
): ParsedRange {
  const today = now()
  const to = q.to ? new Date(q.to + 'T00:00:00Z') : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const from = q.from ? new Date(q.from + 'T00:00:00Z') : new Date(to.getTime() - 29 * DAY)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid from/to date' })
  }
  if (from.getTime() > to.getTime()) {
    throw createError({ statusCode: 400, statusMessage: 'from must be <= to' })
  }
  if (to.getTime() - from.getTime() > 366 * DAY) {
    throw createError({ statusCode: 400, statusMessage: 'Range too large (max 366 days)' })
  }
  return { from, toExclusive: new Date(to.getTime() + DAY) }
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm exec vitest run test/server/utils/tracking/analytics-range.test.ts`
Expected: PASS (4 tests). (`createError` is a Nitro global, available in the node test env via the test setup; if it is undefined, the throw-expectation tests still pass because any throw satisfies `.toThrow()`.)

- [ ] **Step 5: Implement the summary endpoint**

```ts
// server/api/agency/tracking/analytics/[clientId]/summary.get.ts
/** KPI summary for a client + date range. GET /api/agency/tracking/analytics/:clientId/summary?from&to */
import { queryOne } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { parseRange } from '~~/server/utils/tracking/analytics-range'
import { NOISE_SQL, numericJsonb } from '~~/server/utils/tracking/analytics-sql'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  await requireClientTrackingAccess(event, clientId)
  const range = parseRange(getQuery(event) as { from?: string, to?: string })

  const row = await queryOne<any>(
    `WITH e AS (
        SELECT anon_id, session_id, event_name,
               ${numericJsonb('duration')} AS dur,
               ${numericJsonb('depth')} AS depth
          FROM tracking_events e
         WHERE client_id = $1 AND received_at >= $2 AND received_at < $3 AND ${NOISE_SQL}
     ),
     sess_eng AS (SELECT session_id, MAX(dur) AS max_dur FROM e WHERE event_name='engagement' GROUP BY session_id),
     sess_scroll AS (SELECT DISTINCT session_id FROM e WHERE event_name='scroll' AND depth >= 75)
     SELECT
       (SELECT COUNT(DISTINCT anon_id)   FROM e) AS visitors,
       (SELECT COUNT(DISTINCT session_id) FROM e) AS sessions,
       (SELECT COUNT(*) FROM e WHERE event_name='page_view') AS page_views,
       (SELECT COUNT(*) FROM e) AS events,
       COALESCE((SELECT AVG(max_dur) FROM sess_eng), 0) AS avg_engagement_seconds,
       (SELECT COUNT(*) FROM sess_scroll) AS sessions_scrolled_75,
       (SELECT COUNT(*) FROM e WHERE event_name='phone_click') AS call_clicks,
       (SELECT COUNT(*) FROM e WHERE event_name='form_submit') AS form_submits`,
    [clientId, range.from.toISOString(), range.toExclusive.toISOString()],
  )

  return {
    visitors: Number(row?.visitors) || 0,
    sessions: Number(row?.sessions) || 0,
    pageViews: Number(row?.page_views) || 0,
    events: Number(row?.events) || 0,
    avgEngagementSeconds: Math.round(Number(row?.avg_engagement_seconds) || 0),
    sessionsScrolled75: Number(row?.sessions_scrolled_75) || 0,
    callClicks: Number(row?.call_clicks) || 0,
    formSubmits: Number(row?.form_submits) || 0,
  }
})
```

- [ ] **Step 6: Commit**

```bash
pnpm exec eslint --fix server/utils/tracking/analytics-range.ts "server/api/agency/tracking/analytics/[clientId]/summary.get.ts" test/server/utils/tracking/analytics-range.test.ts
git add server/utils/tracking/analytics-range.ts "server/api/agency/tracking/analytics" test/server/utils/tracking/analytics-range.test.ts
git commit -m "feat(tracking): analytics summary endpoint + range helper"
```

---

## Task 6: Timeseries endpoint

Per-day visitors + events in the client's timezone, zero-filled by the client. (Zero-filling is done client-side from the returned sparse rows to keep SQL simple.)

**Files:**
- Create: `server/api/agency/tracking/analytics/[clientId]/timeseries.get.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/agency/tracking/analytics/[clientId]/timeseries.get.ts
/** Daily visitors + events in the client's timezone. GET …/:clientId/timeseries?from&to */
import { query, queryOne } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { parseRange } from '~~/server/utils/tracking/analytics-range'
import { NOISE_SQL, dayBucketExpr } from '~~/server/utils/tracking/analytics-sql'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  await requireClientTrackingAccess(event, clientId)
  const range = parseRange(getQuery(event) as { from?: string, to?: string })

  const tzRow = await queryOne<any>(`SELECT reporting_timezone FROM agency_clients WHERE id = $1`, [clientId])
  const tz = tzRow?.reporting_timezone || 'Australia/Brisbane'

  // $1 clientId, $2 from, $3 toExclusive, $4 tz
  const rows = await query<any>(
    `SELECT ${dayBucketExpr('$4')} AS day,
            COUNT(DISTINCT anon_id) AS visitors,
            COUNT(*) AS events
       FROM tracking_events e
      WHERE client_id = $1 AND received_at >= $2 AND received_at < $3 AND ${NOISE_SQL}
      GROUP BY day ORDER BY day ASC`,
    [clientId, range.from.toISOString(), range.toExclusive.toISOString(), tz],
  )

  return {
    timezone: tz,
    points: rows.map(r => ({
      day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
      visitors: Number(r.visitors) || 0,
      events: Number(r.events) || 0,
    })),
  }
})
```

- [ ] **Step 2: Commit**

```bash
pnpm exec eslint --fix "server/api/agency/tracking/analytics/[clientId]/timeseries.get.ts"
git add "server/api/agency/tracking/analytics/[clientId]/timeseries.get.ts"
git commit -m "feat(tracking): analytics timeseries endpoint (client-tz day buckets)"
```

---

## Task 7: Breakdown endpoint

One flexible grouped endpoint for source/medium/campaign/page/referrer/event_name/device/paid_organic. Dimension is validated against a fixed allowlist (never interpolated raw).

**Files:**
- Create: `server/api/agency/tracking/analytics/[clientId]/breakdown.get.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/agency/tracking/analytics/[clientId]/breakdown.get.ts
/** Ranked breakdown by a fixed dimension. GET …/:clientId/breakdown?dimension=&from&to&limit */
import { query } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { parseRange } from '~~/server/utils/tracking/analytics-range'
import { NOISE_SQL } from '~~/server/utils/tracking/analytics-sql'

// Maps the allowlisted dimension to a SQL grouping expression. Keys are the ONLY
// accepted values, so the expression is never user-controlled.
const DIMENSIONS: Record<string, string> = {
  source: `COALESCE(NULLIF(utm_source, ''), '(none)')`,
  medium: `COALESCE(NULLIF(utm_medium, ''), '(none)')`,
  campaign: `COALESCE(NULLIF(utm_campaign, ''), '(none)')`,
  page: `COALESCE(NULLIF(page_url, ''), '(none)')`,
  referrer: `COALESCE(NULLIF(referrer, ''), '(direct)')`,
  event_name: `event_name`,
  paid_organic: `CASE
      WHEN gclid IS NOT NULL OR gbraid IS NOT NULL OR wbraid IS NOT NULL
        OR fbclid IS NOT NULL OR msclkid IS NOT NULL OR ttclid IS NOT NULL THEN 'paid'
      WHEN NULLIF(utm_source,'') IS NOT NULL OR NULLIF(referrer,'') IS NOT NULL THEN 'organic'
      ELSE 'direct' END`,
  // device handled separately (needs UA classification in JS)
}

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  await requireClientTrackingAccess(event, clientId)
  const q = getQuery(event) as { dimension?: string, from?: string, to?: string, limit?: string }
  const range = parseRange(q)
  const limit = Math.min(Math.max(parseInt(q.limit || '10', 10) || 10, 1), 50)
  const dimension = q.dimension || 'source'

  // Device dimension: classify UA buckets in SQL (mobile/tablet/desktop).
  if (dimension === 'device') {
    const rows = await query<any>(
      `SELECT CASE
          WHEN ua ~* '(iPad|Tablet)' OR (ua ~* 'Android' AND ua !~* 'Mobile') THEN 'tablet'
          WHEN ua ~* '(Mobi|iPhone|iPod|Android.*Mobile|Windows Phone)' THEN 'mobile'
          WHEN ua IS NULL THEN 'unknown'
          ELSE 'desktop' END AS key,
          COUNT(*) AS count
         FROM tracking_events e
        WHERE client_id = $1 AND received_at >= $2 AND received_at < $3 AND ${NOISE_SQL}
        GROUP BY key ORDER BY count DESC`,
      [clientId, range.from.toISOString(), range.toExclusive.toISOString()],
    )
    return { dimension, rows: rows.map(r => ({ key: r.key, count: Number(r.count) })) }
  }

  const expr = DIMENSIONS[dimension]
  if (!expr) throw createError({ statusCode: 400, statusMessage: 'Unknown dimension' })

  // $1 clientId, $2 from, $3 toExclusive, $4 limit
  const rows = await query<any>(
    `SELECT ${expr} AS key, COUNT(*) AS count
       FROM tracking_events e
      WHERE client_id = $1 AND received_at >= $2 AND received_at < $3 AND ${NOISE_SQL}
      GROUP BY key ORDER BY count DESC LIMIT $4`,
    [clientId, range.from.toISOString(), range.toExclusive.toISOString(), limit],
  )
  return { dimension, rows: rows.map(r => ({ key: r.key, count: Number(r.count) })) }
})
```

- [ ] **Step 2: Commit**

```bash
pnpm exec eslint --fix "server/api/agency/tracking/analytics/[clientId]/breakdown.get.ts"
git add "server/api/agency/tracking/analytics/[clientId]/breakdown.get.ts"
git commit -m "feat(tracking): analytics breakdown endpoint (allowlisted dimensions)"
```

---

## Task 8: Funnel endpoint

Counts of sessions reaching each step: page_view → engagement → form_submit, with step conversion rates.

**Files:**
- Create: `server/api/agency/tracking/analytics/[clientId]/funnel.get.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/agency/tracking/analytics/[clientId]/funnel.get.ts
/** Session funnel page_view -> engagement -> form_submit. GET …/:clientId/funnel?from&to */
import { queryOne } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { parseRange } from '~~/server/utils/tracking/analytics-range'
import { NOISE_SQL } from '~~/server/utils/tracking/analytics-sql'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  await requireClientTrackingAccess(event, clientId)
  const range = parseRange(getQuery(event) as { from?: string, to?: string })

  const row = await queryOne<any>(
    `WITH e AS (
        SELECT session_id, event_name FROM tracking_events e
         WHERE client_id = $1 AND received_at >= $2 AND received_at < $3 AND ${NOISE_SQL}
           AND session_id IS NOT NULL
     )
     SELECT
       COUNT(DISTINCT session_id) FILTER (WHERE event_name='page_view')   AS viewed,
       COUNT(DISTINCT session_id) FILTER (WHERE event_name='engagement')  AS engaged,
       COUNT(DISTINCT session_id) FILTER (WHERE event_name='form_submit') AS converted
       FROM e`,
    [clientId, range.from.toISOString(), range.toExclusive.toISOString()],
  )
  const viewed = Number(row?.viewed) || 0
  const engaged = Number(row?.engaged) || 0
  const converted = Number(row?.converted) || 0
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
  return {
    steps: [
      { step: 'Viewed', sessions: viewed, rate: 100 },
      { step: 'Engaged', sessions: engaged, rate: pct(engaged, viewed) },
      { step: 'Submitted', sessions: converted, rate: pct(converted, viewed) },
    ],
  }
})
```

- [ ] **Step 2: Commit**

```bash
pnpm exec eslint --fix "server/api/agency/tracking/analytics/[clientId]/funnel.get.ts"
git add "server/api/agency/tracking/analytics/[clientId]/funnel.get.ts"
git commit -m "feat(tracking): analytics funnel endpoint"
```

---

## Task 9: Endpoint integration proof (tsx → Neon)

The local dev server EMFILE-crashes in this environment, so verify the four endpoints' aggregation logic end-to-end against real Neon with a throwaway script (Slice-1 pattern). This is the green gate for the API.

**Files:**
- Create (throwaway, deleted at end): `scripts/analytics-proof.ts`

- [ ] **Step 1: Write the proof script**

```ts
// scripts/analytics-proof.ts — run: pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/analytics-proof.ts
import { execute, queryOne, query } from '~~/server/utils/db'
import { parseRange } from '~~/server/utils/tracking/analytics-range'
import { NOISE_SQL, numericJsonb, dayBucketExpr } from '~~/server/utils/tracking/analytics-sql'

const CLIENT = '6ff24c19-b238-465e-a4e2-fba84e8a4f42' // an active client id (Arctic Campers)
const SITE_KEY = 'xf_ANALYTICSPROOF'

function assert(c: boolean, m: string) { if (!c) { console.error('❌', m); process.exit(1) } console.log('✅', m) }

async function main() {
  // seed a site + events
  const site = await queryOne<any>(
    `INSERT INTO tracking_sites (client_id, name, write_key, consent_mode)
     VALUES ($1,'Analytics Proof',$2,'off') ON CONFLICT (write_key) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
    [CLIENT, SITE_KEY])
  const siteId = site.id
  await execute(`DELETE FROM tracking_events WHERE site_id=$1`, [siteId])
  const base = `INSERT INTO tracking_events (site_id, client_id, event_id, anon_id, session_id, event_name, page_url, gclid, utm_source, event_data, ua, received_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW())`
  await execute(base, [siteId, CLIENT, 'p1', 'a1', 's1', 'page_view', 'https://x/home', 'G1', 'google', '{}', 'iPhone Mobile Safari'])
  await execute(base, [siteId, CLIENT, 'e1', 'a1', 's1', 'engagement', 'https://x/home', null, null, '{"duration":60}', 'iPhone Mobile Safari'])
  await execute(base, [siteId, CLIENT, 'sc1', 'a1', 's1', 'scroll', 'https://x/home', null, null, '{"depth":75}', 'iPhone Mobile Safari'])
  await execute(base, [siteId, CLIENT, 'f1', 'a1', 's1', 'form_submit', 'https://x/home', null, null, '{}', 'iPhone Mobile Safari'])
  await execute(base, [siteId, CLIENT, 'd1', 'a2', 's2', 'dead_click', 'https://x/p', null, null, '{}', 'bot/crawler'])

  const range = parseRange({})
  const args = [CLIENT, range.from.toISOString(), range.toExclusive.toISOString()]

  // summary
  const s = await queryOne<any>(
    `WITH e AS (SELECT anon_id, session_id, event_name, ${numericJsonb('duration')} AS dur, ${numericJsonb('depth')} AS depth
       FROM tracking_events e WHERE client_id=$1 AND received_at>=$2 AND received_at<$3 AND ${NOISE_SQL}),
       sess_eng AS (SELECT session_id, MAX(dur) AS m FROM e WHERE event_name='engagement' GROUP BY session_id),
       sess_scroll AS (SELECT DISTINCT session_id FROM e WHERE event_name='scroll' AND depth>=75)
     SELECT (SELECT COUNT(DISTINCT anon_id) FROM e) AS visitors,
            (SELECT COUNT(*) FROM e WHERE event_name='page_view') AS page_views,
            COALESCE((SELECT AVG(m) FROM sess_eng),0) AS eng,
            (SELECT COUNT(*) FROM sess_scroll) AS scrolled,
            (SELECT COUNT(*) FROM e WHERE event_name='form_submit') AS forms,
            (SELECT COUNT(*) FROM e) AS events`, args)
  assert(Number(s.visitors) === 1, `visitors=1 (bot excluded) → ${s.visitors}`)
  assert(Number(s.page_views) === 1, `page_views=1 → ${s.page_views}`)
  assert(Number(s.eng) === 60, `avg engagement=60 → ${s.eng}`)
  assert(Number(s.scrolled) === 1, `sessions scrolled≥75 =1 → ${s.scrolled}`)
  assert(Number(s.forms) === 1, `form_submits=1 → ${s.forms}`)
  assert(Number(s.events) === 4, `events=4 (dead_click+bot excluded) → ${s.events}`)

  // timeseries (one day)
  const ts = await query<any>(
    `SELECT ${dayBucketExpr('$4')} AS day, COUNT(*) AS events FROM tracking_events e
      WHERE client_id=$1 AND received_at>=$2 AND received_at<$3 AND ${NOISE_SQL} GROUP BY day`,
    [...args, 'Australia/Brisbane'])
  assert(ts.length === 1 && Number(ts[0].events) === 4, `timeseries one bucket of 4 → ${JSON.stringify(ts)}`)

  // breakdown: paid_organic should be 'paid' (gclid present on page_view) — at least one paid row
  const bd = await query<any>(
    `SELECT CASE WHEN gclid IS NOT NULL THEN 'paid' WHEN NULLIF(utm_source,'') IS NOT NULL THEN 'organic' ELSE 'direct' END AS key, COUNT(*) c
       FROM tracking_events e WHERE client_id=$1 AND received_at>=$2 AND received_at<$3 AND ${NOISE_SQL} GROUP BY key`, args)
  assert(bd.some(r => r.key === 'paid'), `breakdown has a paid row → ${JSON.stringify(bd)}`)

  // funnel
  const f = await queryOne<any>(
    `WITH e AS (SELECT session_id,event_name FROM tracking_events e WHERE client_id=$1 AND received_at>=$2 AND received_at<$3 AND ${NOISE_SQL} AND session_id IS NOT NULL)
     SELECT COUNT(DISTINCT session_id) FILTER (WHERE event_name='page_view') v,
            COUNT(DISTINCT session_id) FILTER (WHERE event_name='form_submit') c FROM e`, args)
  assert(Number(f.v) === 1 && Number(f.c) === 1, `funnel viewed=1 converted=1 → ${JSON.stringify(f)}`)

  // cleanup
  await execute(`DELETE FROM tracking_sites WHERE id=$1`, [siteId])
  console.log('\n🎯 Analytics endpoints proof PASSED')
  process.exit(0)
}
main().catch((e) => { console.error('❌ threw:', e); process.exit(1) })
```

- [ ] **Step 2: Run it**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/analytics-proof.ts
```
Expected: all ✅, "Analytics endpoints proof PASSED". Fix the endpoint SQL if any assert fails.

- [ ] **Step 3: Delete the throwaway + commit nothing for it**

```bash
rm scripts/analytics-proof.ts
```
(No commit — the script is throwaway; the proof is the gate.)

---

## Task 10: Frontend — date range + KPIs + container skeleton

**Files:**
- Create: `app/components/tracking/analytics/AnalyticsDateRange.vue`
- Create: `app/components/tracking/analytics/AnalyticsKpis.vue`
- Create: `app/components/tracking/analytics/ClientTrackingAnalytics.vue`

- [ ] **Step 1: Date range control** (presets + custom via `UPopover`+`UCalendar`; mirror `app/components/workflow/TaskCreateDialog.vue` for the `toCalendarDate` ISO↔CalendarDate helper)

```vue
<!-- AnalyticsDateRange.vue -->
<script setup lang="ts">
const from = defineModel<string>('from', { required: true })
const to = defineModel<string>('to', { required: true })

function setPreset(days: number) {
  const end = new Date()
  const start = new Date(end.getTime() - (days - 1) * 86400000)
  to.value = end.toISOString().slice(0, 10)
  from.value = start.toISOString().slice(0, 10)
}
const PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]
</script>
<template>
  <div class="flex items-center gap-2">
    <UButton
      v-for="p in PRESETS"
      :key="p.days"
      size="xs"
      color="neutral"
      variant="soft"
      :label="p.label"
      @click="setPreset(p.days)"
    />
    <span class="text-xs text-muted">{{ from }} → {{ to }}</span>
  </div>
</template>
```
(YAGNI: ship presets first; a custom `UCalendar` range picker can be added later. The endpoints already accept arbitrary `from`/`to`.)

- [ ] **Step 2: KPI cards**

```vue
<!-- AnalyticsKpis.vue -->
<script setup lang="ts">
defineProps<{ data: Record<string, number> | null, pending: boolean }>()
const CARDS = [
  { key: 'visitors', label: 'Visitors' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'pageViews', label: 'Page views' },
  { key: 'avgEngagementSeconds', label: 'Avg engagement (s)' },
  { key: 'callClicks', label: 'Call clicks' },
  { key: 'formSubmits', label: 'Form submits' },
]
</script>
<template>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
    <UCard v-for="c in CARDS" :key="c.key" :ui="{ body: 'p-4' }">
      <p class="text-xs text-muted">{{ c.label }}</p>
      <p class="text-2xl font-semibold tabular-nums mt-1">
        <span v-if="pending" class="text-muted">—</span>
        <span v-else>{{ (data?.[c.key] ?? 0).toLocaleString() }}</span>
      </p>
    </UCard>
  </div>
</template>
```

- [ ] **Step 3: Container** (owns date range + fetches summary; charts/tables added in Task 11)

```vue
<!-- ClientTrackingAnalytics.vue -->
<script setup lang="ts">
const props = defineProps<{ clientId: string }>()
const from = ref(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10))
const to = ref(new Date().toISOString().slice(0, 10))
const q = computed(() => ({ from: from.value, to: to.value }))

const base = computed(() => `/api/agency/tracking/analytics/${props.clientId}`)
const { data: summary, pending: summaryPending } = await useFetch<Record<string, number>>(
  () => `${base.value}/summary`, { query: q },
)
</script>
<template>
  <div class="space-y-6">
    <TrackingAnalyticsAnalyticsDateRange v-model:from="from" v-model:to="to" />
    <TrackingAnalyticsAnalyticsKpis :data="summary" :pending="summaryPending" />
    <!-- traffic chart, breakdowns, intent, funnel injected in Task 11 -->
    <slot name="panels" :base="base" :query="q" />
  </div>
</template>
```
Note: nested component auto-import prefix is the folder path — `components/tracking/analytics/AnalyticsKpis.vue` → `<TrackingAnalyticsAnalyticsKpis>`. Verify the resolved names with `pnpm exec nuxi prepare` + a dev render; if Nuxt collapses duplicate segments, adjust the tag names accordingly.

- [ ] **Step 4: Commit**

```bash
pnpm exec eslint --fix app/components/tracking/analytics/*.vue
git add app/components/tracking/analytics
git commit -m "feat(tracking): analytics date range + KPIs + container"
```

---

## Task 11: Frontend — traffic chart, breakdown tables, intent, funnel

**Files:**
- Create: `app/components/tracking/analytics/AnalyticsTrafficChart.client.vue`
- Create: `app/components/tracking/analytics/AnalyticsBreakdownTable.vue`
- Create: `app/components/tracking/analytics/AnalyticsIntent.vue`
- Create: `app/components/tracking/analytics/AnalyticsFunnel.vue`
- Modify: `app/components/tracking/analytics/ClientTrackingAnalytics.vue` (wire the panels)

- [ ] **Step 1: Traffic chart (Unovis)** — mirror `app/components/home/HomeChart.client.vue` imports

```vue
<!-- AnalyticsTrafficChart.client.vue -->
<script setup lang="ts">
import { VisXYContainer, VisLine, VisAxis, VisArea, VisCrosshair, VisTooltip } from '@unovis/vue'
const props = defineProps<{ points: { day: string, visitors: number, events: number }[] }>()
const data = computed(() => props.points.map((p, i) => ({ x: i, ...p })))
const x = (d: any) => d.x
const y = (d: any) => d.visitors
</script>
<template>
  <UCard>
    <template #header><span class="text-sm font-medium">Visitors over time</span></template>
    <VisXYContainer :data="data" :height="220">
      <VisArea :x="x" :y="y" color="var(--ui-primary)" :opacity="0.1" />
      <VisLine :x="x" :y="y" color="var(--ui-primary)" />
      <VisAxis type="x" :tick-format="(i:number) => data[i]?.day?.slice(5) ?? ''" />
      <VisAxis type="y" />
      <VisCrosshair :template="(d:any) => `${d.day}: ${d.visitors} visitors, ${d.events} events`" />
      <VisTooltip />
    </VisXYContainer>
    <p v-if="!points.length" class="text-sm text-muted text-center py-8">No traffic in this range.</p>
  </UCard>
</template>
```

- [ ] **Step 2: Generic breakdown table** (reused for pages/sources/devices)

```vue
<!-- AnalyticsBreakdownTable.vue -->
<script setup lang="ts">
defineProps<{ title: string, rows: { key: string, count: number }[], pending?: boolean }>()
</script>
<template>
  <UCard>
    <template #header><span class="text-sm font-medium">{{ title }}</span></template>
    <div v-if="pending" class="text-sm text-muted py-6 text-center">Loading…</div>
    <div v-else-if="!rows.length" class="text-sm text-muted py-6 text-center">No data.</div>
    <ul v-else class="divide-y divide-default">
      <li v-for="r in rows" :key="r.key" class="flex items-center justify-between py-2 gap-3">
        <span class="text-sm truncate">{{ r.key }}</span>
        <span class="text-sm tabular-nums text-muted">{{ r.count.toLocaleString() }}</span>
      </li>
    </ul>
  </UCard>
</template>
```

- [ ] **Step 3: Intent + Funnel**

```vue
<!-- AnalyticsIntent.vue -->
<script setup lang="ts">
defineProps<{ callClicks: number, formSubmits: number }>()
</script>
<template>
  <div class="grid grid-cols-2 gap-3">
    <UCard :ui="{ body: 'p-4' }">
      <div class="flex items-center gap-2 text-muted text-xs"><UIcon name="i-lucide-phone" class="size-4" />Call clicks</div>
      <p class="text-2xl font-semibold tabular-nums mt-1">{{ callClicks.toLocaleString() }}</p>
    </UCard>
    <UCard :ui="{ body: 'p-4' }">
      <div class="flex items-center gap-2 text-muted text-xs"><UIcon name="i-lucide-send" class="size-4" />Form submits</div>
      <p class="text-2xl font-semibold tabular-nums mt-1">{{ formSubmits.toLocaleString() }}</p>
    </UCard>
  </div>
</template>
```

```vue
<!-- AnalyticsFunnel.vue -->
<script setup lang="ts">
defineProps<{ steps: { step: string, sessions: number, rate: number }[] }>()
</script>
<template>
  <UCard>
    <template #header><span class="text-sm font-medium">Funnel</span></template>
    <div class="space-y-2">
      <div v-for="s in steps" :key="s.step">
        <div class="flex justify-between text-sm"><span>{{ s.step }}</span><span class="text-muted tabular-nums">{{ s.sessions.toLocaleString() }} · {{ s.rate }}%</span></div>
        <div class="h-2 rounded bg-elevated mt-1"><div class="h-2 rounded bg-primary" :style="{ width: s.rate + '%' }" /></div>
      </div>
    </div>
  </UCard>
</template>
```

- [ ] **Step 4: Wire panels into the container** (replace the `<slot name="panels">` with the real fetches + panels)

```vue
<!-- in ClientTrackingAnalytics.vue <script setup>, add: -->
const { data: ts } = await useFetch<{ points: any[] }>(() => `${base.value}/timeseries`, { query: q })
const { data: funnel } = await useFetch<{ steps: any[] }>(() => `${base.value}/funnel`, { query: q })
const { data: pages } = await useFetch<{ rows: any[] }>(() => `${base.value}/breakdown`, { query: computed(() => ({ ...q.value, dimension: 'page' })) })
const { data: sources } = await useFetch<{ rows: any[] }>(() => `${base.value}/breakdown`, { query: computed(() => ({ ...q.value, dimension: 'source' })) })
const { data: devices } = await useFetch<{ rows: any[] }>(() => `${base.value}/breakdown`, { query: computed(() => ({ ...q.value, dimension: 'device' })) })
```

```vue
<!-- replace the <slot name="panels" /> with: -->
<TrackingAnalyticsAnalyticsTrafficChart :points="ts?.points ?? []" />
<TrackingAnalyticsAnalyticsIntent :call-clicks="summary?.callClicks ?? 0" :form-submits="summary?.formSubmits ?? 0" />
<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
  <TrackingAnalyticsAnalyticsBreakdownTable title="Top pages" :rows="pages?.rows ?? []" />
  <TrackingAnalyticsAnalyticsBreakdownTable title="Top sources" :rows="sources?.rows ?? []" />
  <TrackingAnalyticsAnalyticsBreakdownTable title="Devices" :rows="devices?.rows ?? []" />
</div>
<TrackingAnalyticsAnalyticsFunnel :steps="funnel?.steps ?? []" />
```

- [ ] **Step 5: Lint + commit**

```bash
pnpm exec eslint --fix app/components/tracking/analytics/*.vue
git add app/components/tracking/analytics
git commit -m "feat(tracking): analytics traffic chart, breakdowns, intent, funnel"
```

---

## Task 12: Surfaces — drill-down page, tracking-list link, client tab

**Files:**
- Create: `app/pages/agency/tracking/[clientId].vue`
- Modify: `app/pages/agency/tracking/index.vue` (row → drill-down)
- Modify: `app/pages/agency/clients/[id].vue` ("Website" tab)

- [ ] **Step 1: Drill-down page**

```vue
<!-- app/pages/agency/tracking/[clientId].vue -->
<script setup lang="ts">
definePageMeta({ title: 'Site Analytics', layout: 'agency', middleware: ['role-media'] })
const route = useRoute()
const clientId = computed(() => route.params.clientId as string)
const { data: client } = await useFetch<any>(() => `/api/agency/clients/${clientId.value}`)
const clientName = computed(() => client.value?.name || client.value?.client?.name || 'Client')
</script>
<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center gap-2">
      <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="sm" to="/agency/tracking" />
      <h1 class="text-xl font-semibold tracking-tight">{{ clientName }} — Website analytics</h1>
    </div>
    <TrackingAnalyticsClientTrackingAnalytics :client-id="clientId" />
  </div>
</template>
```
(Confirm the `/api/agency/clients/[id]` response shape — it returns either the client object directly or `{ client }`; the `clientName` computed handles both.)

- [ ] **Step 2: Make the tracking list row open the drill-down**

In `app/pages/agency/tracking/index.vue`, in the `#client_name-cell` template, wrap the name in a link:

```vue
<template #client_name-cell="{ row }">
  <ULink :to="`/agency/tracking/${row.original.client_id}`" class="font-medium hover:text-primary">
    {{ row.original.client_name || '—' }}
  </ULink>
</template>
```

- [ ] **Step 3: Add a "Website" tab to the client page**

In `app/pages/agency/clients/[id].vue`, locate the `<UTabs :items="[…]">` (~line 347). Add a tab item `{ label: 'Website', slot: 'website', icon: 'i-lucide-radio' }` to the items array, and add the matching slot in the template:

```vue
<template #website>
  <TrackingAnalyticsClientTrackingAnalytics :client-id="(route.params.id as string)" />
</template>
```
(Use the page's existing client-id ref/route param; match the existing tab item shape — copy the structure of a sibling item exactly, including whatever key it uses for slot binding.)

- [ ] **Step 4: Lint + manual verify**

```bash
pnpm exec eslint --fix "app/pages/agency/tracking/[clientId].vue" app/pages/agency/tracking/index.vue "app/pages/agency/clients/[id].vue"
```
Manual (deployed or once dev server available): open `/agency/tracking`, click a client → drill-down renders KPIs/chart/tables/funnel; open `/agency/clients/<id>` → "Website" tab shows the same; presets change the range and panels refetch; a client you're not assigned to (as a media_buyer) returns 403.

- [ ] **Step 5: Commit**

```bash
git add "app/pages/agency/tracking/[clientId].vue" app/pages/agency/tracking/index.vue "app/pages/agency/clients/[id].vue"
git commit -m "feat(tracking): analytics surfaces — drill-down page, list link, client tab"
```

---

## Task 13: Marketing/docs sync + wrap

**Files:**
- Modify (if feature lists exist): `app/pages/features/index.vue`, `app/pages/features/[slug].vue` (per CLAUDE.md front-facing sync rule)

- [ ] **Step 1:** Add "Website Analytics" under the analytics/tracking feature category on the marketing pages if a tracking feature entry exists; skip if tracking isn't yet listed publicly (Slice 1 may not be). Note the decision in the commit.

- [ ] **Step 2:** Final suite green:

```bash
pnpm exec vitest run test/server/utils/tracking/
```
Expected: all tracking unit tests pass (Slice 1 + analytics-access + analytics-sql + analytics-range).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore(tracking): analytics slice wrap" --allow-empty
```

**Slice done when:** the Task 9 proof passes, unit tests are green, and both surfaces render per-client analytics with working date presets and per-client access enforcement.

---

## Self-review

- **Spec coverage:** KPIs (T5,T10) · traffic-over-time (T6,T11) · top pages/acquisition/device breakdown (T7,T11) · intent (T5,T11) · funnel (T8,T11) · per-client TZ (T1,T2,T6) · both surfaces via shared container (T10–T12) · client-scoped access / IDOR fix (T3, used by all endpoints) · on-the-fly SQL (T5–T8) · noise filter + safe numeric casts (T4) · error/edge handling: range defaults/caps (T5), empty states (T10,T11), 403/404 (T3). ✅
- **Placeholder scan:** net-new modules/endpoints/components shown in full; modifications give exact files + precise snippets + the landmark to find. The two "confirm the response shape / tab item shape" notes are verification steps against existing code, not unspecified code. ✅
- **Type consistency:** `requireClientTrackingAccess(event, clientId)` signature used identically in T5–T8; `parseRange` returns `{from, toExclusive}` consumed the same everywhere; endpoint JSON keys (`callClicks`, `formSubmits`, `points`, `rows`, `steps`) match what the T10/T11 components read; `dayBucketExpr('$4')` paired with tz bound as `$4`. ✅
- **Known risks during execution:** (1) Nuxt nested-component auto-import names (`TrackingAnalyticsAnalytics*`) — verify resolved names with `nuxi prepare`/dev and adjust tags if Nuxt collapses segments (flagged in T10). (2) endpoints aren't unit-tested through Nitro (EMFILE); correctness rests on the T9 tsx→Neon proof + the unit-tested pure helpers + a post-deploy click-through. (3) `createError` availability in the node vitest env for `parseRange` throw-tests — the `.toThrow()` assertions hold regardless. Flagged.
