# Google Spend Partial-Data Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct false Estimated labels and persist an expandable warning whenever the selected social-spend period contains account-level sync failures.

**Architecture:** Record estimation provenance where fallback daily values are created, expose the latest period-specific sync job through a small authenticated endpoint, and render a focused warning component from a shared normalized status type. The platform page treats sync status as advisory, refreshes it with the selected period, and never lets status lookup failure block spend data.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Nitro/H3, Neon Postgres, Zod 4, Vitest 4, happy-dom.

## Global Constraints

- Use Nuxt UI v4 components and semantic `warning`/`error` colors; do not add native dialogs or form controls.
- Keep existing account-spend and campaign-daily response shapes stable.
- Require authentication and sanitize every stored provider failure before returning it.
- Show only the newest sync job matching the selected platform and `YYYY-MM` period.
- Count unique failed account names and group the expanded list by sanitized reason.
- Do not add a database migration; `spend_sync_jobs` and its period/platform index already exist.
- Do not update marketing pages; this corrects an existing internal reporting feature.
- Follow strict RED → GREEN cycles and commit each task independently.

---

## File Structure

- `server/api/agency/social/campaign-daily-spend.get.ts` — owns daily-series construction and truthful fallback provenance.
- `server/api/agency/social/spend/latest-sync.get.ts` — owns authenticated latest-job lookup and public response normalization.
- `app/types/index.ts` — owns the client-visible `SpendSyncJobStatus` contract.
- `app/utils/spendSyncStatus.ts` — owns pure warning derivation, unique counts, grouping, and copy.
- `app/components/social/SpendPartialDataAlert.vue` — owns the accessible expandable warning presentation.
- `app/composables/useSocialConnections.ts` — owns the typed latest-sync API call.
- `app/pages/agency/social/[platform].vue` — owns period-bound loading and refresh integration.
- `test/server/api/socialCampaignDailySpendEndpoint.test.ts` — exercises real endpoint aggregation behavior with database boundaries mocked.
- `test/server/api/socialSpendLatestSyncEndpoint.test.ts` — exercises validation, ordering, normalization, absence, and sanitization.
- `test/utils/socialSpendStatus.test.ts` — exercises pure warning derivation and grouping.
- `test/components/socialSpendPartialDataAlert.test.ts` — exercises rendered warning and expansion behavior.
- `test/app/socialSpendPartialStatusPage.test.ts` — protects the platform-page integration contract.

---

### Task 1: Make Estimated reflect actual fallback generation

**Files:**
- Create: `test/server/api/socialCampaignDailySpendEndpoint.test.ts`
- Modify: `server/api/agency/social/campaign-daily-spend.get.ts`

**Interfaces:**
- Consumes: existing `GET /api/agency/social/campaign-daily-spend` query contract.
- Produces: unchanged `{ campaigns, totals, estimated }`, where `estimated` is true only when flat fallback rows were created.

- [ ] **Step 1: Write failing endpoint tests for a real Other bucket and a generated fallback**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
let mockQuery: Record<string, unknown> = { platform: 'google', month: 8, year: 2026 }

vi.mock('~~/server/utils/auth', () => ({ requireAuth: (...args: unknown[]) => mockRequireAuth(...args) }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))
vi.mock('~~/server/utils/kv', () => ({ cachedFetch: (_e: unknown, _k: string, _t: number, fetcher: () => Promise<unknown>) => fetcher() }))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).getQuery = () => mockQuery

const campaign = (id: number) => ({
  id: `spend-${id}`, campaign_id: `campaign-${id}`, campaign_name: `Campaign ${id}`,
  campaign_type: 'SEARCH', campaign_status: 'ENABLED', actual_spend: '10',
  budget_allocated: '0', impressions: '100', clicks: '10',
})

describe('GET /api/agency/social/campaign-daily-spend estimation provenance', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
  })

  it('does not mark a real Other bucket as estimated', async () => {
    const top = Array.from({ length: 10 }, (_, index) => campaign(index + 1))
    mockQueryRows
      .mockResolvedValueOnce(top)
      .mockResolvedValueOnce(top.map(row => ({
        media_spend_id: row.id, spend_date: '2026-08-01', spend: '10', impressions: '100', clicks: '10',
      })))
      .mockResolvedValueOnce([{ spend_date: '2026-08-01', total_spend: '5', total_impressions: '50', total_clicks: '5' }])
      .mockResolvedValueOnce([{ spend_date: '2026-08-01', total_spend: '105', total_impressions: '1050', total_clicks: '105', total_conversions: '2', total_revenue: '50' }])
    mockQueryOne
      .mockResolvedValueOnce({ cnt: '11' })
      .mockResolvedValueOnce({ total: '5' })
      .mockResolvedValueOnce({ total_budget: '0' })

    const handler = (await import('~~/server/api/agency/social/campaign-daily-spend.get')).default
    const result = await handler({} as any)

    expect(result.campaigns.at(-1)?.campaignId).toBe('__other__')
    expect(result.estimated).toBe(false)
  })

  it('marks generated flat daily rows as estimated', async () => {
    mockQueryRows
      .mockResolvedValueOnce([campaign(1)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mockQueryOne
      .mockResolvedValueOnce({ cnt: '1' })
      .mockResolvedValueOnce({ total_budget: '0' })

    const handler = (await import('~~/server/api/agency/social/campaign-daily-spend.get')).default
    const result = await handler({} as any)

    expect(result.campaigns[0]?.daily.length).toBeGreaterThan(0)
    expect(result.estimated).toBe(true)
  })
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run test/server/api/socialCampaignDailySpendEndpoint.test.ts
```

Expected: the real `Other` test fails because the current post-hoc inference returns `estimated: true`.

- [ ] **Step 3: Track fallback use at the point where fallback rows are generated**

In `campaign-daily-spend.get.ts`, replace the final campaign re-inference with explicit provenance:

```ts
let usedEstimatedFallback = false

const campaigns = topCampaigns.map((c, i) => {
  let daily = dailyByMediaSpend[c.id] || []

  if (daily.length === 0 && parseFloat(c.actual_spend) > 0) {
    usedEstimatedFallback = true
    const monthlySpend = parseFloat(c.actual_spend)
    const monthlyImpressions = parseInt(c.impressions || '0', 10)
    const monthlyClicks = parseInt(c.clicks || '0', 10)
    const dailySpend = monthlySpend / lastDay
    const dailyImpressions = Math.round(monthlyImpressions / lastDay)
    const dailyClicks = Math.round(monthlyClicks / lastDay)
    daily = allDates.map(date => ({
      date,
      spend: Math.round(dailySpend * 100) / 100,
      impressions: dailyImpressions,
      clicks: dailyClicks,
    }))
  }

  return {
    campaignId: c.campaign_id || c.id,
    campaignName: c.campaign_name || 'Unnamed Campaign',
    campaignType: c.campaign_type,
    status: c.campaign_status,
    monthlySpend: parseFloat(c.actual_spend),
    monthlyBudget: parseFloat(c.budget_allocated),
    color: PALETTE[i] || PALETTE[i % PALETTE.length],
    daily,
  }
})

return { campaigns, totals, estimated: usedEstimatedFallback }
```

Delete the current `campaigns.some(...)` inference. Do not let creation of the real `Other` SQL aggregation change `usedEstimatedFallback`.

- [ ] **Step 4: Run focused tests and the existing social spend endpoint suite**

Run:

```bash
pnpm exec vitest run test/server/api/socialCampaignDailySpendEndpoint.test.ts test/server/api/socialAccountSpendEndpoint.test.ts test/server/api/socialSpendSummaryEndpoint.test.ts
```

Expected: all tests pass with zero failures.

- [ ] **Step 5: Review and commit estimation provenance**

```bash
git diff --check
git add server/api/agency/social/campaign-daily-spend.get.ts test/server/api/socialCampaignDailySpendEndpoint.test.ts
git commit -m "fix: report genuine spend estimates"
```

---

### Task 2: Expose the latest period-specific sync job safely

**Files:**
- Create: `server/api/agency/social/spend/latest-sync.get.ts`
- Create: `test/server/api/socialSpendLatestSyncEndpoint.test.ts`
- Modify: `app/types/index.ts`

**Interfaces:**
- Consumes: `platform: SocialPlatform` and `period: YYYY-MM` query parameters.
- Produces: `SpendSyncJobStatus | null` with `jobId`, `platform`, `period`, `status`, counts, sanitized failures, sanitized error, and timestamps.

- [ ] **Step 1: Write failing endpoint tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
let mockQuery: Record<string, unknown> = { platform: 'google', period: '2026-08' }

vi.mock('~~/server/utils/auth', () => ({ requireAuth: (...args: unknown[]) => mockRequireAuth(...args) }))
vi.mock('~~/server/utils/db', () => ({ queryOne: (...args: unknown[]) => mockQueryOne(...args) }))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).getQuery = () => mockQuery
;(globalThis as any).createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

describe('GET /api/agency/social/spend/latest-sync', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockQuery = { platform: 'google', period: '2026-08' }
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
  })

  it('returns the newest matching job with sanitized failures', async () => {
    mockQueryOne.mockResolvedValue({
      id: 'job-1', platform: 'google', period: '2026-08', status: 'completed',
      synced_count: 30, total_spend: '231.73',
      failures: [{ account: 'Account A', reason: 'access_token=provider-secret 403' }],
      error: null, started_at: '2026-08-01T03:19:22.000Z', finished_at: '2026-08-01T03:21:24.000Z',
      total_accounts: 108, processed_accounts: 108,
    })

    const handler = (await import('~~/server/api/agency/social/spend/latest-sync.get')).default
    const result = await handler({} as any)

    expect(mockQueryOne.mock.calls[0][0]).toContain('ORDER BY started_at DESC')
    expect(mockQueryOne.mock.calls[0][1]).toEqual(['google', '2026-08'])
    expect(result).toMatchObject({ jobId: 'job-1', syncedCount: 30, totalSpend: 231.73, totalAccounts: 108 })
    expect(JSON.stringify(result)).not.toContain('provider-secret')
  })

  it('returns null when the period has no sync job', async () => {
    mockQueryOne.mockResolvedValue(null)
    const handler = (await import('~~/server/api/agency/social/spend/latest-sync.get')).default
    await expect(handler({} as any)).resolves.toBeNull()
  })

  it.each([
    [{ platform: 'unknown', period: '2026-08' }],
    [{ platform: 'google', period: '2026-13' }],
    [{ platform: 'google', period: 'August' }],
  ])('rejects invalid query input %#', async (query) => {
    mockQuery = query
    const handler = (await import('~~/server/api/agency/social/spend/latest-sync.get')).default
    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the endpoint tests and verify RED**

Run:

```bash
pnpm exec vitest run test/server/api/socialSpendLatestSyncEndpoint.test.ts
```

Expected: FAIL because `latest-sync.get.ts` does not exist.

- [ ] **Step 3: Add the shared response type and implement the authenticated endpoint**

Add beside the social spend types in `app/types/index.ts`:

```ts
export interface SpendSyncFailure {
  account: string
  reason: string
}

export interface SpendSyncJobStatus {
  jobId: string
  platform: SocialPlatform
  period: string
  status: 'running' | 'completed' | 'failed'
  syncedCount: number
  totalSpend: number
  failures: SpendSyncFailure[]
  error: string | null
  startedAt: string
  finishedAt: string | null
  totalAccounts: number | null
  processedAccounts: number
}
```

Create `latest-sync.get.ts`:

```ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { sanitizeSpendSyncFailureReason, sanitizeSpendSyncFailures } from '~~/server/utils/spendSyncFailureSanitizer'

const QuerySchema = z.object({
  platform: z.enum(['meta', 'google', 'linkedin', 'tiktok', 'pinterest', 'snapchat', 'twitter', 'microsoft_ads']),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
})

export default eventHandler(async (event) => {
  await requireAuth(event)
  const parsed = QuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid platform or period' })
  }

  interface SpendSyncJobRow {
    id: string
    platform: 'meta' | 'google' | 'linkedin' | 'tiktok' | 'pinterest' | 'snapchat' | 'twitter' | 'microsoft_ads'
    period: string
    status: 'running' | 'completed' | 'failed'
    synced_count: number
    total_spend: string
    failures: unknown
    error: string | null
    started_at: string
    finished_at: string | null
    total_accounts: number | null
    processed_accounts: number
  }

  const row = await queryOne<SpendSyncJobRow>(
    `SELECT id, platform, period, status, synced_count, total_spend, failures, error,
            started_at, finished_at, total_accounts, processed_accounts
       FROM spend_sync_jobs
      WHERE platform = $1 AND period = $2
      ORDER BY started_at DESC
      LIMIT 1`,
    [parsed.data.platform, parsed.data.period],
  )
  if (!row) return null

  return {
    jobId: row.id,
    platform: row.platform,
    period: row.period,
    status: row.status,
    syncedCount: Number(row.synced_count) || 0,
    totalSpend: Number(row.total_spend) || 0,
    failures: sanitizeSpendSyncFailures(row.failures),
    error: row.error ? sanitizeSpendSyncFailureReason(row.error) : null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    totalAccounts: row.total_accounts == null ? null : Number(row.total_accounts),
    processedAccounts: Number(row.processed_accounts) || 0,
  }
})
```

- [ ] **Step 4: Run endpoint and sanitizer tests**

Run:

```bash
pnpm exec vitest run test/server/api/socialSpendLatestSyncEndpoint.test.ts test/server/utils/spendSyncFailureSanitizer.test.ts
```

Expected: all tests pass with zero failures.

- [ ] **Step 5: Review and commit the latest-sync contract**

```bash
git diff --check
git add app/types/index.ts server/api/agency/social/spend/latest-sync.get.ts test/server/api/socialSpendLatestSyncEndpoint.test.ts
git commit -m "feat: expose latest spend sync status"
```

---

### Task 3: Build the expandable partial-data warning

**Files:**
- Create: `app/utils/spendSyncStatus.ts`
- Create: `app/components/social/SpendPartialDataAlert.vue`
- Create: `test/utils/socialSpendStatus.test.ts`
- Create: `test/components/socialSpendPartialDataAlert.test.ts`

**Interfaces:**
- Consumes: `SpendSyncJobStatus | null` and a display name such as `Google Ads`.
- Produces: `buildSpendSyncWarning(job, platformName): SpendSyncWarning | null` and `SocialSpendPartialDataAlert` presentation.

- [ ] **Step 1: Write failing pure warning-model tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildSpendSyncWarning } from '../../app/utils/spendSyncStatus'
import type { SpendSyncJobStatus } from '../../app/types'

const job = (overrides: Partial<SpendSyncJobStatus> = {}): SpendSyncJobStatus => ({
  jobId: 'job-1', platform: 'google', period: '2026-08', status: 'completed',
  syncedCount: 30, totalSpend: 231.73,
  failures: [
    { account: 'Zulu Motors', reason: 'Access denied (403)' },
    { account: 'Alpha Motors', reason: 'Access denied (403)' },
    { account: 'Alpha Motors', reason: 'Access denied (403)' },
  ],
  error: null, startedAt: '2026-08-01T03:19:22.000Z', finishedAt: '2026-08-01T03:21:24.000Z',
  totalAccounts: 108, processedAccounts: 108,
  ...overrides,
})

describe('buildSpendSyncWarning', () => {
  it('counts unique failed accounts and groups them alphabetically by reason', () => {
    const warning = buildSpendSyncWarning(job(), 'Google Ads')
    expect(warning).toMatchObject({ title: 'Partial Google Ads data', failedAccounts: 2, completedAccounts: 106, totalAccounts: 108 })
    expect(warning?.summary).toContain('106 of 108 accounts synced')
    expect(warning?.summary).toContain('incomplete or stale for 2 accounts')
    expect(warning?.groups).toEqual([{ reason: 'Access denied (403)', accounts: ['Alpha Motors', 'Zulu Motors'] }])
  })

  it('returns null for a newer clean completed job or a running job', () => {
    expect(buildSpendSyncWarning(job({ failures: [] }), 'Google Ads')).toBeNull()
    expect(buildSpendSyncWarning(job({ status: 'running' }), 'Google Ads')).toBeNull()
  })

  it('surfaces a terminal job failure without account details', () => {
    const warning = buildSpendSyncWarning(job({ status: 'failed', failures: [], error: 'Queue unavailable' }), 'Google Ads')
    expect(warning).toMatchObject({ title: 'Google Ads sync failed', summary: 'Queue unavailable' })
  })
})
```

- [ ] **Step 2: Run the utility test and verify RED**

Run:

```bash
pnpm exec vitest run test/utils/socialSpendStatus.test.ts
```

Expected: FAIL because `app/utils/spendSyncStatus.ts` does not exist.

- [ ] **Step 3: Implement the pure warning model**

```ts
import type { SpendSyncJobStatus } from '~/types'

export interface SpendSyncFailureGroup {
  reason: string
  accounts: string[]
}

export interface SpendSyncWarning {
  title: string
  summary: string
  completedAccounts: number
  failedAccounts: number
  totalAccounts: number
  finishedAt: string | null
  groups: SpendSyncFailureGroup[]
}

export function buildSpendSyncWarning(job: SpendSyncJobStatus | null, platformName: string): SpendSyncWarning | null {
  if (!job || job.status === 'running') return null

  const groups = new Map<string, Set<string>>()
  const failedAccounts = new Set<string>()
  for (const failure of job.failures || []) {
    const account = failure.account || 'Unknown account'
    const reason = failure.reason || 'Unknown provider error'
    failedAccounts.add(account)
    if (!groups.has(reason)) groups.set(reason, new Set())
    groups.get(reason)!.add(account)
  }

  if (failedAccounts.size === 0 && job.status !== 'failed') return null
  const totalAccounts = Math.max(0, Number(job.totalAccounts ?? job.processedAccounts ?? 0))
  const processedAccounts = Math.max(0, Number(job.processedAccounts || totalAccounts))
  const completedAccounts = Math.max(0, processedAccounts - failedAccounts.size)
  const grouped = [...groups.entries()]
    .map(([reason, accounts]) => ({ reason, accounts: [...accounts].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.reason.localeCompare(b.reason))

  const failed = failedAccounts.size
  return {
    title: job.status === 'failed' ? `${platformName} sync failed` : `Partial ${platformName} data`,
    summary: job.status === 'failed' && failed === 0
      ? (job.error || 'The latest sync failed before account results were available.')
      : `${completedAccounts} of ${totalAccounts} accounts synced. Figures may be incomplete or stale for ${failed} account${failed === 1 ? '' : 's'}.`,
    completedAccounts,
    failedAccounts: failed,
    totalAccounts,
    finishedAt: job.finishedAt,
    groups: grouped,
  }
}
```

- [ ] **Step 4: Run the utility tests and verify GREEN**

Run:

```bash
pnpm exec vitest run test/utils/socialSpendStatus.test.ts
```

Expected: all utility tests pass.

- [ ] **Step 5: Write the failing component test**

Create a happy-dom test that mounts the real Vue component with Nuxt UI stubs:

```ts
// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import SpendPartialDataAlert from '~~/app/components/social/SpendPartialDataAlert.vue'

const stubs = {
  UAlert: { name: 'UAlert', props: ['title'], template: '<section role="alert"><h3>{{ title }}</h3><slot name="description" /></section>' },
  UButton: { name: 'UButton', props: ['label'], emits: ['click'], template: '<button @click="$emit(\'click\', $event)">{{ label }}<slot /></button>' },
  UIcon: { name: 'UIcon', template: '<i />' },
}

it('renders a persistent warning and expands grouped affected accounts', async () => {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(SpendPartialDataAlert, {
    platformName: 'Google Ads',
    job: {
      jobId: 'job-1', platform: 'google', period: '2026-08', status: 'completed',
      syncedCount: 30, totalSpend: 231.73,
      failures: [
        { account: 'Zulu Motors', reason: 'Access denied (403)' },
        { account: 'Alpha Motors', reason: 'Access denied (403)' },
      ],
      error: null, startedAt: '2026-08-01T03:19:22.000Z', finishedAt: '2026-08-01T03:21:24.000Z',
      totalAccounts: 108, processedAccounts: 108,
    },
  }) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)

  expect(host.textContent).toContain('Partial Google Ads data')
  expect(host.textContent).toContain('106 of 108 accounts synced')
  expect(host.textContent).not.toContain('Alpha Motors')

  const button = host.querySelector('button') as HTMLButtonElement
  expect(button.getAttribute('aria-expanded')).toBe('false')
  button.click()
  await nextTick()

  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(host.textContent).toContain('Access denied (403)')
  expect(host.textContent).toContain('Alpha Motors')
  expect(host.textContent).toContain('Zulu Motors')
  app.unmount()
})
```

Add a second render test asserting no alert is produced for a clean completed job.

- [ ] **Step 6: Run the component test and verify RED**

Run:

```bash
pnpm exec vitest run test/components/socialSpendPartialDataAlert.test.ts
```

Expected: FAIL because `SpendPartialDataAlert.vue` does not exist.

- [ ] **Step 7: Implement the Nuxt UI warning component**

```vue
<script setup lang="ts">
import type { SpendSyncJobStatus } from '~/types'
import { buildSpendSyncWarning } from '~/utils/spendSyncStatus'

const props = defineProps<{ job: SpendSyncJobStatus | null; platformName: string }>()
const expanded = ref(false)
const warning = computed(() => buildSpendSyncWarning(props.job, props.platformName))
watch(() => props.job?.jobId, () => { expanded.value = false })

const completedLabel = computed(() => {
  if (!warning.value?.finishedAt) return null
  return new Date(warning.value.finishedAt).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
})
</script>

<template>
  <div v-if="warning" class="space-y-3">
    <UAlert
      icon="i-lucide-triangle-alert"
      color="warning"
      variant="subtle"
      :title="warning.title"
    >
      <template #description>
        <div class="space-y-2">
          <p>{{ warning.summary }}</p>
          <p v-if="completedLabel" class="text-xs text-muted">Latest attempt completed {{ completedLabel }}</p>
          <UButton
            v-if="warning.groups.length"
            color="warning"
            variant="link"
            size="xs"
            class="px-0"
            :label="expanded ? 'Hide affected accounts' : `View ${warning.failedAccounts} affected account${warning.failedAccounts === 1 ? '' : 's'}`"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
          />
        </div>
      </template>
    </UAlert>

    <div v-if="expanded" class="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-4">
      <section v-for="group in warning.groups" :key="group.reason" class="space-y-2">
        <h3 class="text-sm font-medium">{{ group.reason }} · {{ group.accounts.length }}</h3>
        <ul class="grid grid-cols-1 gap-1 text-sm text-muted sm:grid-cols-2 xl:grid-cols-3">
          <li v-for="account in group.accounts" :key="account">{{ account }}</li>
        </ul>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 8: Run warning-model and component tests**

Run:

```bash
pnpm exec vitest run test/utils/socialSpendStatus.test.ts test/components/socialSpendPartialDataAlert.test.ts
```

Expected: all tests pass; expansion is keyboard-native through `UButton`, uses text plus icon, and account names are sorted.

- [ ] **Step 9: Review and commit the warning component**

```bash
git diff --check
git add app/utils/spendSyncStatus.ts app/components/social/SpendPartialDataAlert.vue test/utils/socialSpendStatus.test.ts test/components/socialSpendPartialDataAlert.test.ts
git commit -m "feat: surface partial spend data"
```

---

### Task 4: Integrate durable status into the platform page

**Files:**
- Modify: `app/composables/useSocialConnections.ts`
- Modify: `app/pages/agency/social/[platform].vue`
- Create: `test/app/socialSpendPartialStatusPage.test.ts`

**Interfaces:**
- Consumes: `GET /api/agency/social/spend/latest-sync` and `SpendSyncJobStatus` from Task 2.
- Produces: period-bound `latestSyncJob` state passed to `SocialSpendPartialDataAlert` and refreshed after synchronization.

- [ ] **Step 1: Write the failing page-integration contract test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../app/pages/agency/social/[platform].vue', import.meta.url), 'utf8')
const composable = readFileSync(new URL('../../app/composables/useSocialConnections.ts', import.meta.url), 'utf8')

describe('social platform partial spend status integration', () => {
  it('loads latest status for the selected platform and period', () => {
    expect(composable).toContain("'/api/agency/social/spend/latest-sync'")
    expect(composable).toContain('async function fetchLatestSpendSync')
    expect(page).toContain('const latestSyncJob = ref<SpendSyncJobStatus | null>(null)')
    expect(page).toContain('fetchLatestSpendSync(platform.value as SocialPlatform, selectedMonth.value, selectedYear.value)')
  })

  it('refreshes status after sync and when the period changes', () => {
    expect(page).toContain('await Promise.all([loadSpendData(true), loadBankCharges({ refresh: true }), loadLatestSyncJob()])')
    expect(page).toMatch(/watch\(\[selectedMonth, selectedYear\][\s\S]*loadLatestSyncJob\(\)/)
  })

  it('renders the durable warning above the chart content', () => {
    expect(page).toContain('<SocialSpendPartialDataAlert')
    expect(page).toContain(':job="latestSyncJob"')
    expect(page.indexOf('<SocialSpendPartialDataAlert')).toBeLessThan(page.indexOf('<!-- Spend charts:'))
  })
})
```

- [ ] **Step 2: Run the integration test and verify RED**

Run:

```bash
pnpm exec vitest run test/app/socialSpendPartialStatusPage.test.ts
```

Expected: FAIL because the composable and page do not load latest status or render the alert.

- [ ] **Step 3: Add the typed composable fetch**

Update the import and return surface in `useSocialConnections.ts`:

```ts
import type {
  SocialConnection, MetaSpendRecord, CampaignDailySpendResponse, SocialPlatform, SpendSyncJobStatus,
} from '~/types'

async function fetchLatestSpendSync(platform: SocialPlatform, month: number, year: number) {
  const period = `${year}-${String(month).padStart(2, '0')}`
  return await apiFetch<SpendSyncJobStatus | null>('/api/agency/social/spend/latest-sync', {
    params: { platform, period },
  })
}
```

Add `fetchLatestSpendSync,` to the composable's existing return object immediately after `fetchCampaignDailySpend,`.

- [ ] **Step 4: Load status independently and refresh it at every period boundary**

In `[platform].vue`:

```ts
import type { SocialPlatform, SpendSyncJobStatus } from '~/types'

const {
  loading, fetchConnections, disconnectConnection,
  syncSpend, fetchAccountSpend, fetchAccountCampaigns,
  updateCampaignBudget, fetchCampaignDailySpend,
  fetchLatestSpendSync,
} = useSocialConnections()

const latestSyncJob = ref<SpendSyncJobStatus | null>(null)

async function loadLatestSyncJob() {
  try {
    latestSyncJob.value = await fetchLatestSpendSync(
      platform.value as SocialPlatform,
      selectedMonth.value,
      selectedYear.value,
    )
  } catch (error) {
    console.error('[SpendSyncStatus] fetch failed:', error)
    latestSyncJob.value = null
  }
}
```

Call `loadLatestSyncJob()` from `onMounted`, the month/year watcher, and the `refreshContent()` `Promise.all`. Do not add it to `loadSpendData`; status failure must remain independent from primary spend loading.

- [ ] **Step 5: Render the warning above charts**

Directly after the page header and before the section navigation/chart content, render the component without an outer wrapper. Its root `v-if` then prevents empty spacing for clean or running jobs:

```vue
<SocialSpendPartialDataAlert
  class="mx-4 mt-5 sm:mx-6"
  :job="latestSyncJob"
  :platform-name="platformConfig.displayName"
/>
```

- [ ] **Step 6: Run the integration and focused social spend tests**

Run:

```bash
pnpm exec vitest run \
  test/app/socialSpendPartialStatusPage.test.ts \
  test/components/socialSpendPartialDataAlert.test.ts \
  test/utils/socialSpendStatus.test.ts \
  test/server/api/socialSpendLatestSyncEndpoint.test.ts \
  test/server/api/socialCampaignDailySpendEndpoint.test.ts \
  test/server/api/googleSpendSyncEndpoint.test.ts \
  test/server/api/socialSpendSummaryEndpoint.test.ts
```

Expected: all focused tests pass with zero failures.

- [ ] **Step 7: Review and commit page integration**

Re-read every modified file end to end, confirm `~~/server` aliases remain server-only, verify no empty `USelectMenu` values or raw form controls were introduced, and run:

```bash
git diff --check
git add app/composables/useSocialConnections.ts 'app/pages/agency/social/[platform].vue' test/app/socialSpendPartialStatusPage.test.ts
git commit -m "feat: persist partial spend warnings"
```

---

### Task 5: Battle-test the complete change

**Files:**
- Verify all files changed by Tasks 1–4.
- Modify only if verification exposes a defect; add a regression test before each correction.

**Interfaces:**
- Consumes: all prior task deliverables.
- Produces: review-ready branch with evidence for tests, lint, type boundaries, build, and browser behavior.

- [ ] **Step 1: Re-read every modified file and compare against the approved design**

Confirm all of the following:

- real `Other` daily data does not set Estimated;
- genuine fallback creation does set Estimated;
- latest status is period/platform scoped and sanitized;
- a newer clean or running job suppresses older failure state;
- the warning is persistent, non-dismissible, expandable, grouped, sorted, responsive, and accessible;
- status lookup failure cannot blank spend data;
- no migration or marketing-page edits were introduced.

- [ ] **Step 2: Run formatting and scoped lint checks**

```bash
git diff --check
pnpm exec eslint \
  app/types/index.ts \
  app/utils/spendSyncStatus.ts \
  app/components/social/SpendPartialDataAlert.vue \
  app/composables/useSocialConnections.ts \
  'app/pages/agency/social/[platform].vue' \
  server/api/agency/social/campaign-daily-spend.get.ts \
  server/api/agency/social/spend/latest-sync.get.ts \
  test/server/api/socialCampaignDailySpendEndpoint.test.ts \
  test/server/api/socialSpendLatestSyncEndpoint.test.ts \
  test/utils/socialSpendStatus.test.ts \
  test/components/socialSpendPartialDataAlert.test.ts \
  test/app/socialSpendPartialStatusPage.test.ts
```

Expected: exit code 0 and no lint errors.

- [ ] **Step 3: Run the complete test suite**

```bash
pnpm test:run
```

Expected: exit code 0 with zero failing test files and zero failing tests.

- [ ] **Step 4: Run typecheck and distinguish pre-existing errors from new errors**

```bash
pnpm run typecheck
```

Expected: no errors in any file changed by this plan. The repository may still report documented pre-existing type errors from legacy declarations; capture and report them rather than claiming a clean global typecheck if they remain.

- [ ] **Step 5: Run the production build**

```bash
pnpm run build
```

Expected: Nuxt/Nitro build exits 0, prerender completes, and the worker-size guard passes.

- [ ] **Step 6: Verify the live behavior in an authenticated browser after deployment is authorized**

On `/agency/social/google`:

1. Confirm August shows `Partial Google Ads data` with the latest unique failure count.
2. Expand the warning and confirm failures are grouped by reason with alphabetized account names.
3. Confirm the warning survives a full reload.
4. Select a clean historical period and confirm no warning spacing remains.
5. Open Performance and confirm Estimated is absent when all daily rows are real, but still appears for a fixture/period that requires fallback.
6. Test the expansion control by keyboard and at approximately 320 px and 1440 px widths.

- [ ] **Step 7: Record final branch evidence**

```bash
git status --short --branch
git log --oneline --decorate -6
```

Expected: clean worktree, four implementation commits after the design/plan commits, and no unrelated files.
