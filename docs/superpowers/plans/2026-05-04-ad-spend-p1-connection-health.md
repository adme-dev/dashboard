# Ad Spend P1 — Connection Health Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface ad-platform connection health on `/agency/social/spend` and `/agency/social` so broken connections (expired tokens, stale syncs) are visible at a glance and reconnectable in ≤2 clicks; fix the misleading "Connect Xero" copy on the Bank Charged card.

**Architecture:** A pure-function classifier (`server/utils/connectionHealth.ts`) determines health from `social_connections.token_expires_at`, `refresh_token`, `status`, and the latest `media_spend.synced_at`. The existing `connections.get.ts` endpoint exposes per-row health; a new `health-summary.get.ts` endpoint returns per-platform aggregates (cached 60 s in KV). Two new Vue components (`ConnectionHealthBadge`, `ConnectionHealthStrip`) render the strip on the spend page and reuse the badge primitive on the connections page. Single-tenant — no `org_id` plumbing.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, Nuxt UI v4 (`UBadge`, `UButton`, `UTooltip`), Nitro (h3), Neon Postgres via `~~/server/utils/db`, Cloudflare KV via `~~/server/utils/kv`, vitest + happy-dom for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-04-ad-spend-p1-connection-health.md`

---

## File structure

**Create:**
- `server/utils/connectionHealth.ts` — pure classifier function `classifyConnectionHealth({ status, tokenExpiresAt, refreshToken, lastSyncedAt }) → { health, daysUntilExpiry }`
- `test/server/utils/connectionHealth.test.ts` — vitest unit tests covering all health states
- `server/api/agency/social/connections/health-summary.get.ts` — aggregate endpoint, KV-cached
- `app/components/social/ConnectionHealthBadge.vue` — single-pill primitive
- `app/components/social/ConnectionHealthStrip.vue` — horizontal pills bar, fetches summary on mount

**Modify:**
- `server/api/agency/social/connections.get.ts` — add `refresh_token` to SELECT; add `health` and `daysUntilExpiry` per row using classifier
- `server/api/agency/social/spend/summary.get.ts` — expose existing `last_synced_at` SELECT in the response shape
- `app/pages/agency/social/spend.vue` — mount `ConnectionHealthStrip`; rewrite Bank Charged card states
- `app/pages/agency/social/index.vue` — add last-sync timestamp, expiry badge, and "Reconnect" CTA to each connection card
- `app/components/social/SpendVarianceTable.vue` — add stale-data badge in the client-name cell driven by per-item `lastSyncedAt`
- `app/components/social/SocialPlatformCard.vue` — accept new `worstHealth` + `daysUntilExpiry` props; render `ConnectionHealthBadge` and swap Sync→Reconnect when broken
- `app/types/index.ts` — extend `SocialConnection` type with `health` + `daysUntilExpiry`; extend spend item type with `lastSyncedAt`

---

## Task 1: Health classifier utility (TDD)

**Files:**
- Create: `server/utils/connectionHealth.ts`
- Create: `test/server/utils/connectionHealth.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `test/server/utils/connectionHealth.test.ts`:

```ts
/**
 * Tests for the connection health classifier — pure function, no I/O.
 *
 * Health rules (single source of truth in connectionHealth.ts):
 *   - error            → status != 'active'
 *   - expired          → token_expires_at < NOW
 *   - expiring_soon    → token_expires_at within 7 days AND no refresh_token
 *   - never_synced     → last_synced_at IS NULL
 *   - stale_sync       → last_synced_at older than 24h
 *   - healthy          → otherwise
 */
import { describe, it, expect } from 'vitest'
import { classifyConnectionHealth } from '../../../server/utils/connectionHealth'

const NOW = new Date('2026-05-04T12:00:00Z')
const HOUR = 3_600_000
const DAY = 24 * HOUR

describe('classifyConnectionHealth', () => {
  it('returns "error" when status is not active', () => {
    const r = classifyConnectionHealth({
      status: 'revoked',
      tokenExpiresAt: new Date(NOW.getTime() + 30 * DAY),
      refreshToken: 'rt',
      lastSyncedAt: new Date(NOW.getTime() - HOUR),
      now: NOW,
    })
    expect(r.health).toBe('error')
  })

  it('returns "expired" when token_expires_at is in the past', () => {
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() - 9 * DAY),
      refreshToken: null,
      lastSyncedAt: new Date(NOW.getTime() - HOUR),
      now: NOW,
    })
    expect(r.health).toBe('expired')
    expect(r.daysUntilExpiry).toBe(-9)
  })

  it('returns "expiring_soon" within 7 days AND no refresh_token (Meta case)', () => {
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() + 3 * DAY),
      refreshToken: null,
      lastSyncedAt: new Date(NOW.getTime() - HOUR),
      now: NOW,
    })
    expect(r.health).toBe('expiring_soon')
    expect(r.daysUntilExpiry).toBe(3)
  })

  it('skips "expiring_soon" when refresh_token present (Google case)', () => {
    // Google access tokens expire hourly but auto-refresh — must not warn.
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() + 30 * 60 * 1000), // 30 min
      refreshToken: 'rt',
      lastSyncedAt: new Date(NOW.getTime() - HOUR),
      now: NOW,
    })
    expect(r.health).toBe('healthy')
  })

  it('returns "never_synced" when last_synced_at is null', () => {
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() + 30 * DAY),
      refreshToken: 'rt',
      lastSyncedAt: null,
      now: NOW,
    })
    expect(r.health).toBe('never_synced')
  })

  it('returns "stale_sync" when last_synced_at is older than 24h', () => {
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() + 30 * DAY),
      refreshToken: 'rt',
      lastSyncedAt: new Date(NOW.getTime() - 25 * HOUR),
      now: NOW,
    })
    expect(r.health).toBe('stale_sync')
  })

  it('returns "healthy" for fresh active connection with recent sync', () => {
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() + 30 * DAY),
      refreshToken: 'rt',
      lastSyncedAt: new Date(NOW.getTime() - 2 * HOUR),
      now: NOW,
    })
    expect(r.health).toBe('healthy')
    expect(r.daysUntilExpiry).toBe(30)
  })

  it('error wins over expired when both apply', () => {
    const r = classifyConnectionHealth({
      status: 'revoked',
      tokenExpiresAt: new Date(NOW.getTime() - 9 * DAY),
      refreshToken: null,
      lastSyncedAt: null,
      now: NOW,
    })
    expect(r.health).toBe('error')
  })

  it('expired wins over stale_sync when both apply', () => {
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() - 9 * DAY),
      refreshToken: null,
      lastSyncedAt: new Date(NOW.getTime() - 30 * DAY),
      now: NOW,
    })
    expect(r.health).toBe('expired')
  })

  it('handles null tokenExpiresAt as healthy when other signals are good', () => {
    // Some connections have no token expiry (e.g. API-key based platforms).
    const r = classifyConnectionHealth({
      status: 'active',
      tokenExpiresAt: null,
      refreshToken: null,
      lastSyncedAt: new Date(NOW.getTime() - HOUR),
      now: NOW,
    })
    expect(r.health).toBe('healthy')
    expect(r.daysUntilExpiry).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm exec vitest run test/server/utils/connectionHealth.test.ts
```

Expected: All 10 tests fail with import error: cannot find `../../../server/utils/connectionHealth`.

- [ ] **Step 3: Implement the classifier**

Create `server/utils/connectionHealth.ts`:

```ts
/**
 * Pure connection-health classifier.
 *
 * Used by /api/agency/social/connections (per-row) and the new
 * /api/agency/social/connections/health-summary (aggregate).
 *
 * Health rules (priority order — first match wins):
 *   1. error          — status != 'active'
 *   2. expired        — tokenExpiresAt is in the past
 *   3. expiring_soon  — tokenExpiresAt within 7 days AND no refreshToken
 *                       (Google's tokens auto-refresh — skip the warning)
 *   4. never_synced   — lastSyncedAt is null
 *   5. stale_sync     — lastSyncedAt older than 24h
 *   6. healthy        — otherwise
 */
export type ConnectionHealth =
  | 'healthy'
  | 'expiring_soon'
  | 'expired'
  | 'stale_sync'
  | 'never_synced'
  | 'error'

export interface ClassifyInput {
  status: string
  tokenExpiresAt: Date | string | null | undefined
  refreshToken: string | null | undefined
  lastSyncedAt: Date | string | null | undefined
  now?: Date  // override for tests
}

export interface ClassifyResult {
  health: ConnectionHealth
  daysUntilExpiry: number | null
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  return v instanceof Date ? v : new Date(v)
}

export function classifyConnectionHealth(input: ClassifyInput): ClassifyResult {
  const now = input.now ?? new Date()
  const tokenExpiresAt = toDate(input.tokenExpiresAt)
  const lastSyncedAt = toDate(input.lastSyncedAt)
  const daysUntilExpiry = tokenExpiresAt
    ? Math.floor((tokenExpiresAt.getTime() - now.getTime()) / ONE_DAY_MS)
    : null

  if (input.status !== 'active') {
    return { health: 'error', daysUntilExpiry }
  }
  if (tokenExpiresAt && tokenExpiresAt.getTime() < now.getTime()) {
    return { health: 'expired', daysUntilExpiry }
  }
  if (
    tokenExpiresAt
    && tokenExpiresAt.getTime() - now.getTime() < SEVEN_DAYS_MS
    && !input.refreshToken
  ) {
    return { health: 'expiring_soon', daysUntilExpiry }
  }
  if (!lastSyncedAt) {
    return { health: 'never_synced', daysUntilExpiry }
  }
  if (now.getTime() - lastSyncedAt.getTime() > ONE_DAY_MS) {
    return { health: 'stale_sync', daysUntilExpiry }
  }
  return { health: 'healthy', daysUntilExpiry }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm exec vitest run test/server/utils/connectionHealth.test.ts
```

Expected: All 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/utils/connectionHealth.ts test/server/utils/connectionHealth.test.ts
git commit -m "feat(social): pure connection-health classifier + unit tests"
```

---

## Task 2: Extend `connections.get.ts` with health + daysUntilExpiry

**Files:**
- Modify: `server/api/agency/social/connections.get.ts`
- Modify: `app/types/index.ts` (add fields to `SocialConnection`)

- [ ] **Step 1: Read current state**

Run:

```bash
sed -n '1,42p' server/api/agency/social/connections.get.ts
```

Confirm the SELECT does NOT include `refresh_token` and the response map does NOT include `health`.

- [ ] **Step 2: Add `refresh_token` to the SELECT and `health`/`daysUntilExpiry` to the mapped response**

Replace the entire body of `server/api/agency/social/connections.get.ts` with:

```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { classifyConnectionHealth } from '~~/server/utils/connectionHealth'

export default eventHandler(async (event) => {
  await requireAuth(event)

  try {
    const rows = await queryRows<any>(
      `SELECT sc.id, sc.platform, sc.account_id, sc.account_name, sc.status,
              sc.token_expires_at, sc.refresh_token, sc.scopes, sc.metadata,
              sc.connected_by, sc.created_at, sc.updated_at,
              tm.name as connected_by_name,
              (SELECT MAX(ms.synced_at) FROM media_spend ms WHERE ms.connection_id = sc.id) as last_synced_at
       FROM social_connections sc
       LEFT JOIN team_members tm ON sc.connected_by::uuid = tm.id
       ORDER BY sc.platform, sc.created_at DESC`
    )

    return rows.map((r: any) => {
      const { health, daysUntilExpiry } = classifyConnectionHealth({
        status: r.status,
        tokenExpiresAt: r.token_expires_at,
        refreshToken: r.refresh_token,
        lastSyncedAt: r.last_synced_at,
      })
      return {
        id: r.id,
        platform: r.platform,
        accountId: r.account_id,
        accountName: r.account_name,
        status: r.status,
        tokenExpiresAt: r.token_expires_at,
        scopes: r.scopes ? (typeof r.scopes === 'string' ? JSON.parse(r.scopes) : r.scopes) : [],
        metadata: r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null,
        connectedBy: r.connected_by,
        connectedByName: r.connected_by_name || null,
        lastSyncedAt: r.last_synced_at || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        health,
        daysUntilExpiry,
      }
    })
  } catch (err: any) {
    if (err.message?.includes('does not exist') || err.code === '42P01') {
      return []
    }
    throw err
  }
})
```

Note: `refresh_token` is read into the row but NOT spread into the response — it stays on the server.

- [ ] **Step 3: Extend the `SocialConnection` type**

Open `app/types/index.ts`, find the `SocialConnection` interface (search for `interface SocialConnection`), and add at the end of the interface body:

```ts
  health?: 'healthy' | 'expiring_soon' | 'expired' | 'stale_sync' | 'never_synced' | 'error'
  daysUntilExpiry?: number | null
```

Make `health` optional with `?` so older code paths that construct partial objects don't break.

- [ ] **Step 4: Run typecheck**

```bash
pnpm exec vue-tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add server/api/agency/social/connections.get.ts app/types/index.ts
git commit -m "feat(social): expose connection health + daysUntilExpiry per row"
```

---

## Task 3: New `health-summary` aggregate endpoint

**Files:**
- Create: `server/api/agency/social/connections/health-summary.get.ts`

- [ ] **Step 1: Create the endpoint**

Create `server/api/agency/social/connections/health-summary.get.ts`:

```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { cachedFetch } from '~~/server/utils/kv'
import { classifyConnectionHealth, type ConnectionHealth } from '~~/server/utils/connectionHealth'

/**
 * GET /api/agency/social/connections/health-summary
 *
 * Per-platform aggregate of connection health for the Connection Health
 * Strip on /agency/social/spend. Cached 60s in KV — same data is also
 * available row-by-row via /api/agency/social/connections.
 */
const SEVERITY_ORDER: ConnectionHealth[] = [
  'error',
  'expired',
  'expiring_soon',
  'never_synced',
  'stale_sync',
  'healthy',
]

interface PlatformSummary {
  total: number
  healthy: number
  expiring_soon: number
  expired: number
  stale_sync: number
  never_synced: number
  error: number
  worst_status: ConnectionHealth
}

export default eventHandler(async (event) => {
  await requireAuth(event)

  return cachedFetch(event, 'spend:health-summary', 60, async () => {
    const rows = await queryRows<{
      platform: string
      status: string
      token_expires_at: string | null
      refresh_token: string | null
      last_synced_at: string | null
    }>(
      `SELECT sc.platform, sc.status, sc.token_expires_at, sc.refresh_token,
              (SELECT MAX(ms.synced_at) FROM media_spend ms WHERE ms.connection_id = sc.id) as last_synced_at
       FROM social_connections sc`
    )

    const out: Record<string, PlatformSummary> = {}

    for (const row of rows) {
      const platform = row.platform
      if (!out[platform]) {
        out[platform] = {
          total: 0, healthy: 0, expiring_soon: 0, expired: 0,
          stale_sync: 0, never_synced: 0, error: 0,
          worst_status: 'healthy',
        }
      }
      const summary = out[platform]
      const { health } = classifyConnectionHealth({
        status: row.status,
        tokenExpiresAt: row.token_expires_at,
        refreshToken: row.refresh_token,
        lastSyncedAt: row.last_synced_at,
      })
      summary.total += 1
      summary[health] += 1

      // worst_status = whichever has lower (worse) index in SEVERITY_ORDER
      if (SEVERITY_ORDER.indexOf(health) < SEVERITY_ORDER.indexOf(summary.worst_status)) {
        summary.worst_status = health
      }
    }

    return out
  })
})
```

- [ ] **Step 2: Verify the file compiles**

```bash
pnpm exec vue-tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/connections/health-summary.get.ts
git commit -m "feat(social): /connections/health-summary aggregate endpoint, KV-cached 60s"
```

---

## Task 4: `ConnectionHealthBadge` component primitive

**Files:**
- Create: `app/components/social/ConnectionHealthBadge.vue`

- [ ] **Step 1: Create the badge component**

Create `app/components/social/ConnectionHealthBadge.vue`:

```vue
<script setup lang="ts">
import type { ConnectionHealth } from '~~/server/utils/connectionHealth'

const props = defineProps<{
  status: ConnectionHealth
  count?: number  // optional count (e.g. "113 expired")
  label?: string  // optional override for the text (e.g. "Meta")
}>()

interface Variant {
  color: 'success' | 'warning' | 'error' | 'info' | 'neutral'
  icon: string
  text: string
}

const VARIANTS: Record<ConnectionHealth, Variant> = {
  healthy:        { color: 'success', icon: 'i-lucide-check-circle-2', text: 'healthy' },
  expiring_soon:  { color: 'warning', icon: 'i-lucide-clock',          text: 'expiring soon' },
  expired:        { color: 'error',   icon: 'i-lucide-alert-triangle', text: 'expired' },
  stale_sync:     { color: 'warning', icon: 'i-lucide-refresh-cw-off', text: 'stale sync' },
  never_synced:   { color: 'neutral', icon: 'i-lucide-pause',          text: 'never synced' },
  error:          { color: 'error',   icon: 'i-lucide-x-circle',       text: 'error' },
}

const variant = computed(() => VARIANTS[props.status])
const display = computed(() => {
  const base = props.label ? `${props.label}: ` : ''
  if (props.count != null && props.count > 0 && props.status !== 'healthy') {
    return `${base}${props.count} ${variant.value.text}`
  }
  return `${base}${variant.value.text}`
})
</script>

<template>
  <UBadge :color="variant.color" variant="soft" :icon="variant.icon" size="sm">
    {{ display }}
  </UBadge>
</template>
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm exec vue-tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/components/social/ConnectionHealthBadge.vue
git commit -m "feat(social): ConnectionHealthBadge primitive"
```

---

## Task 5: `ConnectionHealthStrip` component

**Files:**
- Create: `app/components/social/ConnectionHealthStrip.vue`

- [ ] **Step 1: Create the strip component**

Create `app/components/social/ConnectionHealthStrip.vue`:

```vue
<script setup lang="ts">
import type { ConnectionHealth } from '~~/server/utils/connectionHealth'

interface PlatformSummary {
  total: number
  healthy: number
  expiring_soon: number
  expired: number
  stale_sync: number
  never_synced: number
  error: number
  worst_status: ConnectionHealth
}

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta',
  google: 'Google',
  google_ads: 'Google',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  snapchat: 'Snapchat',
  twitter: 'X',
  microsoft_ads: 'Microsoft',
}

// Cap fetch timeout — health-summary is KV-cached so it's fast in normal cases.
const { data } = await useFetch<Record<string, PlatformSummary>>(
  '/api/agency/social/connections/health-summary',
  { default: () => ({}), timeout: 8_000, lazy: true },
)

// Worst-status counts for the badge label (e.g. "113 expired")
function worstCount(summary: PlatformSummary): number {
  return summary[summary.worst_status] ?? 0
}

const platforms = computed(() =>
  Object.entries(data.value || {})
    .map(([platform, summary]) => ({
      platform,
      label: PLATFORM_LABELS[platform] ?? platform,
      summary,
    }))
    .sort((a, b) => a.label.localeCompare(b.label)),
)
</script>

<template>
  <div v-if="platforms.length" class="flex flex-wrap items-center gap-2 px-1">
    <span class="text-xs font-medium text-muted uppercase tracking-wide mr-1">Connections</span>
    <NuxtLink
      v-for="p in platforms"
      :key="p.platform"
      :to="`/agency/social#${p.platform}`"
      class="no-underline"
    >
      <ConnectionHealthBadge
        :status="p.summary.worst_status"
        :label="p.label"
        :count="worstCount(p.summary)"
      />
    </NuxtLink>
  </div>
</template>
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm exec vue-tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/components/social/ConnectionHealthStrip.vue
git commit -m "feat(social): ConnectionHealthStrip — per-platform health pills, deeplinked"
```

---

## Task 6: Mount the strip on `spend.vue`

**Files:**
- Modify: `app/pages/agency/social/spend.vue`

- [ ] **Step 1: Find the insertion point**

Open `app/pages/agency/social/spend.vue` and find the `<SocialSpendPeriodPicker ... />` component in the template (around line 229–239). The strip mounts immediately AFTER it, BEFORE the `<!-- Summary Cards -->` block.

- [ ] **Step 2: Insert the component**

Find this block:

```vue
      <!-- Period Picker -->
      <SocialSpendPeriodPicker
        ...
        @sync="handleSyncAll"
      />

      <!-- Summary Cards -->
```

Replace with:

```vue
      <!-- Period Picker -->
      <SocialSpendPeriodPicker
        ...
        @sync="handleSyncAll"
      />

      <!-- Connection Health Strip -->
      <ConnectionHealthStrip />

      <!-- Summary Cards -->
```

(Keep the `...` shorthand only mentally — leave the existing `SocialSpendPeriodPicker` props intact.)

- [ ] **Step 3: Verify typecheck**

```bash
pnpm exec vue-tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/pages/agency/social/spend.vue
git commit -m "feat(social/spend): mount ConnectionHealthStrip above summary cards"
```

---

## Task 7: Bank Charged card 4-state copy fix

**Files:**
- Modify: `app/pages/agency/social/spend.vue`

- [ ] **Step 1: Locate the Bank Charged card template**

Open `app/pages/agency/social/spend.vue` and find the Bank Charged card — search for `Bank Charged` in the template. It currently has three branches: `hasBankData`, `bankLoading`, and the else (which always says "Connect Xero...").

The current `else` branch (lines around 279–282 in the file):

```vue
          <template v-else>
            <p class="text-2xl font-bold tracking-tight text-muted">-</p>
            <p class="text-[10px] text-muted">Connect Xero to see bank charges</p>
          </template>
```

- [ ] **Step 2: Replace the else branch with 4 distinct states**

Replace the `<template v-else>` block above with:

```vue
          <template v-else-if="bankCharges?.connected">
            <p class="text-2xl font-bold tracking-tight">{{ formatCurrency(0) }}</p>
            <p class="text-[10px] text-muted">No bank charges matched this period</p>
          </template>
          <template v-else>
            <p class="text-2xl font-bold tracking-tight text-muted">-</p>
            <p class="text-[10px] text-muted">Connect Xero to see bank charges</p>
          </template>
```

Reading order is now: `hasBankData` → `bankLoading` → connected-but-empty → not-connected.

- [ ] **Step 3: Verify typecheck**

```bash
pnpm exec vue-tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/pages/agency/social/spend.vue
git commit -m "fix(social/spend): Bank Charged card distinguishes connected-no-data from not-connected"
```

---

## Task 8: Expose `lastSyncedAt` on spend summary items

**Files:**
- Modify: `server/api/agency/social/spend/summary.get.ts`

- [ ] **Step 1: Locate the summary item mapping**

Open `server/api/agency/social/spend/summary.get.ts`. The SQL already SELECTs `MAX(ms.synced_at) as last_synced_at` (line ~33). The mapping function (around line 52–75) does NOT include it in the returned object.

- [ ] **Step 2: Add `lastSyncedAt` to the mapped object**

Find the `return { ... }` inside the `summary = rows.map(...)` block. Add this line at the end of the object literal, before the closing `}`:

```ts
        lastSyncedAt: r.last_synced_at || null,
```

The block becomes (existing fields collapsed for brevity):

```ts
      return {
        platform: r.platform,
        clientName: r.client_name,
        // ...all existing fields...
        commissionRate: parseFloat(r.commission_rate) || 0,
        lastSyncedAt: r.last_synced_at || null,
      }
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm exec vue-tsc --noEmit
```

Expected: exit 0. (The Spend item type in `app/types/index.ts` will accept the new field as `unknown` — strict typing of this shape is out of scope.)

- [ ] **Step 4: Commit**

```bash
git add server/api/agency/social/spend/summary.get.ts
git commit -m "feat(social/spend): expose lastSyncedAt per summary item"
```

---

## Task 9: Stale-data badge on table rows

**Files:**
- Modify: `app/components/social/SpendVarianceTable.vue`

(Note: file is `SpendVarianceTable.vue`, not `SocialSpendVarianceTable.vue` — Nuxt's auto-import prefixes "Social" when used in templates because the file lives in `components/social/`.)

- [ ] **Step 1: Add stale helpers to `<script setup>`**

Open `app/components/social/SpendVarianceTable.vue`. In the `<script setup>` block (near the top, after the existing imports/props), add:

```ts
const STALE_MS = 24 * 60 * 60 * 1000

function isStale(lastSyncedAt: string | null | undefined): boolean {
  if (!lastSyncedAt) return false  // null is rendered as "Never synced" elsewhere; only flag rows with a real-but-old timestamp
  return Date.now() - new Date(lastSyncedAt).getTime() > STALE_MS
}

function staleTooltip(lastSyncedAt: string | null | undefined): string {
  if (!lastSyncedAt) return 'Never synced'
  return `Last synced ${new Date(lastSyncedAt).toLocaleString()}`
}
```

- [ ] **Step 2: Render the badge inline next to the client name**

Find this line in the template (around line 289):

```vue
          <td class="py-2 px-3 font-medium">{{ item.clientName }}</td>
```

Replace with:

```vue
          <td class="py-2 px-3 font-medium">
            <span>{{ item.clientName }}</span>
            <UTooltip v-if="isStale(item.lastSyncedAt)" :text="staleTooltip(item.lastSyncedAt)">
              <UBadge color="warning" variant="subtle" size="xs" icon="i-lucide-clock" class="ml-2 align-middle">
                stale
              </UBadge>
            </UTooltip>
          </td>
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm exec vue-tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/components/social/SpendVarianceTable.vue
git commit -m "feat(social/spend): stale-data badge on rows with lastSyncedAt > 24h"
```

---

## Task 10: Health badge + Reconnect CTA on platform cards (`/agency/social`)

**Files:**
- Modify: `app/components/social/SocialPlatformCard.vue`
- Modify: `app/pages/agency/social/index.vue`

The connections page renders one `<SocialPlatformCard>` per platform from a `platforms` array, fed by a `platformSummaries` computed that aggregates `social_connections` rows. The card already shows last-synced text. We extend the parent to compute aggregate health, pass it down, and have the card render a health badge + swap Sync→Reconnect when broken. The card's root also gains an `id` so the strip's `#meta` deeplink scrolls to it.

- [ ] **Step 1: Extend `platformSummaries` in `index.vue` to include `worstHealth` + `daysUntilExpiry`**

Open `app/pages/agency/social/index.vue` and find the `platformSummaries` computed (around line 31–47). Replace it with:

```ts
import type { ConnectionHealth } from '~~/server/utils/connectionHealth'

const SEVERITY_ORDER: ConnectionHealth[] = [
  'error', 'expired', 'expiring_soon', 'never_synced', 'stale_sync', 'healthy',
]

const platformSummaries = computed(() => {
  const map: Record<string, {
    connected: boolean
    accountCount: number
    lastSyncedAt: string | null
    worstHealth: ConnectionHealth | null
    daysUntilExpiry: number | null
  }> = {}
  for (const p of platforms) {
    const conns = connections.value.filter((c: any) => c.platform === p.key && c.status === 'active')
    const lastSync = conns
      .map((c: any) => c.lastSyncedAt)
      .filter(Boolean)
      .sort()
      .pop() || null

    let worstHealth: ConnectionHealth | null = null
    let worstDays: number | null = null
    for (const c of conns) {
      if (!c.health) continue
      if (
        worstHealth === null
        || SEVERITY_ORDER.indexOf(c.health) < SEVERITY_ORDER.indexOf(worstHealth)
      ) {
        worstHealth = c.health
        worstDays = c.daysUntilExpiry ?? null
      }
    }

    map[p.key] = {
      connected: conns.length > 0,
      accountCount: conns.length,
      lastSyncedAt: lastSync,
      worstHealth,
      daysUntilExpiry: worstDays,
    }
  }
  return map
})
```

- [ ] **Step 2: Pass new props to `SocialPlatformCard`**

Find the `<SocialPlatformCard ...>` invocation (around line 256–276) and add two new props inside the existing prop list, just below `:last-synced-at`:

```vue
            :last-synced-at="platformSummaries[p.key]?.lastSyncedAt || null"
            :worst-health="platformSummaries[p.key]?.worstHealth || null"
            :days-until-expiry="platformSummaries[p.key]?.daysUntilExpiry ?? null"
```

Also add an emit handler for the new `reconnect` event right after the existing `@sync` handler:

```vue
            @sync="handleSync"
            @reconnect="handleConnect"
```

(`handleConnect` already exists in `index.vue` and does what we want — kicks off the OAuth popup.)

- [ ] **Step 3: Extend `SocialPlatformCard.vue` props/emits**

Open `app/components/social/SocialPlatformCard.vue`. Replace the entire `<script setup>` block (lines 1–34) with:

```vue
<script setup lang="ts">
import type { ConnectionHealth } from '~~/server/utils/connectionHealth'

const props = defineProps<{
  platform: string
  displayName: string
  icon: string
  bgColor: string
  iconColor: string
  description: string
  connected: boolean
  accountCount: number
  lastSyncedAt: string | null
  worstHealth?: ConnectionHealth | null
  daysUntilExpiry?: number | null
  syncing?: boolean
  connecting?: boolean
  comingSoon?: boolean
}>()

const emit = defineEmits<{
  connect: [platform: string]
  reconnect: [platform: string]
  disconnect: [platform: string]
  sync: [platform: string]
  'view-accounts': [platform: string]
  'paste-token': [platform: string]
}>()

const lastSyncedText = computed(() => {
  if (!props.lastSyncedAt) return 'Never synced'
  const d = new Date(props.lastSyncedAt)
  const diff = Date.now() - d.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'Synced just now'
  if (hours < 24) return `Synced ${hours}h ago`
  return `Synced ${Math.floor(hours / 24)}d ago`
})

const isBroken = computed(() =>
  props.worstHealth === 'expired'
  || props.worstHealth === 'error'
  || props.worstHealth === 'never_synced',
)

const expiryLabel = computed(() => {
  const d = props.daysUntilExpiry
  if (d == null) return null
  if (d < 0) return `Expired ${Math.abs(d)}d ago`
  if (d > 30) return null  // far-future expiries are noise
  if (d === 0) return 'Expires today'
  return `Expires in ${d}d`
})
</script>
```

- [ ] **Step 4: Add `id` to the active-card root for hash navigation**

Find this line (around line 53):

```vue
  <div v-else class="border border-default rounded-xl bg-elevated/50 overflow-hidden">
```

Replace with:

```vue
  <div
    v-else
    :id="platform"
    class="border border-default rounded-xl bg-elevated/50 overflow-hidden scroll-mt-24"
  >
```

(`scroll-mt-24` adds anchor offset so hash deeplinks don't slide content under the sticky agency header.)

- [ ] **Step 5: Render the health badge + expiry inside the card body**

Find the connected-state grid (around line 73–82):

```vue
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="bg-default/50 rounded-lg px-3 py-2">
            <p class="text-xs text-muted mb-0.5">Ad Accounts</p>
            <p class="text-sm font-medium">{{ accountCount }} account{{ accountCount !== 1 ? 's' : '' }}</p>
          </div>
          <div class="bg-default/50 rounded-lg px-3 py-2">
            <p class="text-xs text-muted mb-0.5">Last Sync</p>
            <p class="text-sm font-medium">{{ lastSyncedText }}</p>
          </div>
        </div>
```

Add a new health row immediately AFTER that grid and BEFORE the action-button row:

```vue
        <div
          v-if="worstHealth && worstHealth !== 'healthy'"
          class="flex items-center gap-2 mb-4 flex-wrap"
        >
          <ConnectionHealthBadge :status="worstHealth" :count="accountCount" />
          <span v-if="expiryLabel" class="text-xs text-amber-500">{{ expiryLabel }}</span>
        </div>
```

- [ ] **Step 6: Replace the Sync button with a conditional Reconnect/Sync**

Find the existing Sync button (around line 88–90):

```vue
          <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-refresh-cw" :loading="syncing" @click="emit('sync', platform)">
            Sync
          </UButton>
```

Replace with:

```vue
          <UButton
            v-if="isBroken"
            size="xs"
            variant="solid"
            color="warning"
            icon="i-lucide-plug"
            :loading="connecting"
            @click="emit('reconnect', platform)"
          >
            Reconnect
          </UButton>
          <UButton
            v-else
            size="xs"
            variant="soft"
            color="neutral"
            icon="i-lucide-refresh-cw"
            :loading="syncing"
            @click="emit('sync', platform)"
          >
            Sync
          </UButton>
```

- [ ] **Step 7: Verify typecheck**

```bash
pnpm exec vue-tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add app/components/social/SocialPlatformCard.vue app/pages/agency/social/index.vue
git commit -m "feat(social/connections): per-card health badge + Reconnect CTA + hash anchors"
```

---

## Task 11: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Build locally and start dev server**

```bash
pnpm dev
```

Wait for "Listening on http://localhost:3000".

- [ ] **Step 2: Visit `/agency/social/spend`**

Open `http://localhost:3000/agency/social/spend` in a browser. Verify in the DOM:

- A "Connection Health" strip is rendered between the period picker and the summary cards.
- Given today's data, the Meta pill reads `Meta: 113 expired` (or similar — the count comes from the live DB).
- The Google pill reads `Google: healthy` (or similar healthy state).
- Bank Charged card shows one of the 4 states correctly (most likely "Connect Xero..." or the new "No bank charges matched this period").

- [ ] **Step 3: Click the Meta pill**

Verify it navigates to `/agency/social#meta` and the Meta connections section is in view.

- [ ] **Step 4: Inspect a broken connection card**

For an expired Meta connection, verify the card shows:
- A relative last-sync line (e.g. "Synced 60 d ago" or "Never synced")
- An `expired` health badge
- "Expired N d ago" amber line
- A red/warning "Reconnect" button (NOT "Sync now")

For a healthy Google connection, verify the card shows:
- A relative last-sync line
- NO health badge (healthy is implicit)
- NO expiry label (Google's expiry is far-future-or-near with refresh — both filtered out)
- A "Sync now" button

- [ ] **Step 5: Verify the spend table stale badge**

Back on `/agency/social/spend`, verify any client row whose underlying connection hasn't synced in >24h shows a yellow "stale" badge next to the client name. Hover should show the exact last-sync timestamp.

- [ ] **Step 6: Run the full vitest suite**

```bash
pnpm exec vitest run
```

Expected: all tests pass (10 new + existing).

- [ ] **Step 7: Final typecheck**

```bash
pnpm exec vue-tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 8: Deploy to production**

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm deploy:production
```

Wait for "Deployment complete!" message; capture the URL printed.

- [ ] **Step 9: Verify on production**

Visit `https://agency-dashboard-6cm.pages.dev/agency/social/spend` (logged in). Repeat the checks from steps 2–5 against live data.

---

## Self-review notes

- **Spec coverage:**
  - AC1 (compact strip) — Tasks 4, 5, 6
  - AC2 (per-pill health label) — Task 5 (worst_status + count)
  - AC3 (clickable deeplinks) — Task 5 (NuxtLink to `#platform`) + Task 10 step 4 (`:id="platform"` on card root)
  - AC4 (timestamp + expiry countdown + Reconnect CTA on connection cards) — Task 10
  - AC5 (Bank Charged 4 states) — Task 7
  - AC6 (stale-data badge) — Tasks 8, 9
- **Placeholder scan:** No "TBD" / "TODO" / "fill in details" / vague handwaves remain. All code blocks contain runnable code.
- **Type consistency:** `ConnectionHealth` exported from `server/utils/connectionHealth.ts` is the single source of truth, imported by `connections.get.ts`, `health-summary.get.ts`, `ConnectionHealthBadge.vue`, `ConnectionHealthStrip.vue`. Field names `health` and `daysUntilExpiry` consistent across endpoint, type definition, and UI.
- **Out-of-scope acknowledged:** No automatic Meta token refresh (Meta long-lived tokens have no refresh grant). No email/Slack alerts (P3). No cron-based health monitoring. All matches the PRD.
