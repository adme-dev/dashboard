# GA4 Auto-Map + Dedicated Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the GA4 connect card onto its own `/agency/social/ga4` page, and add an "Auto-map" button that location-matches GA4 properties to clients and auto-saves the confident ones.

**Architecture:** A pure, unit-tested matching util (`app/utils/ga4PropertyMatch.ts`) maps property names to clients by location-prefix. A bulk upsert endpoint (`map-bulk.post.ts`) writes the confident matches in one request. The existing `Ga4ConnectCard` gains an "Auto-map" button wired to both. The card is relocated from `/agency/social` to a new `/agency/social/ga4` page reached by a header button.

**Tech Stack:** Nuxt 4 (auto-imported `app/utils`), Nuxt UI v4, Nitro/h3, Zod, Neon Postgres (`server/utils/db.ts`), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-ga4-auto-map-properties-design.md`

---

## File structure

- **Create** `app/utils/ga4PropertyMatch.ts` — pure matching logic (auto-imported).
- **Create** `test/app/utils/ga4PropertyMatch.test.ts` — Vitest unit tests.
- **Create** `server/api/agency/social/ga4/map-bulk.post.ts` — bulk upsert endpoint.
- **Create** `app/pages/agency/social/ga4.vue` — dedicated page hosting the card.
- **Modify** `app/pages/agency/social/index.vue` — remove inline card (line ~283), add a "Google Analytics" header button (near line ~231).
- **Modify** `app/components/social/Ga4ConnectCard.vue` — add the "Auto-map" button + handler.

---

## Task 1: Property→client matching util (TDD)

**Files:**
- Create: `app/utils/ga4PropertyMatch.ts`
- Test: `test/app/utils/ga4PropertyMatch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/app/utils/ga4PropertyMatch.test.ts
import { describe, expect, it } from 'vitest'
import { matchPropertiesToClients, locationKey, normalizeProperty } from '~~/app/utils/ga4PropertyMatch'

const CLIENTS = [
  { id: 'c-northern', name: 'Northern Motor Group' },
  { id: 'c-geelong', name: 'Geelong Motor Group' },
  { id: 'c-pak', name: 'Pakenham Isuzu UTE' }
]

describe('locationKey', () => {
  it('strips a trailing " Motor Group"', () => {
    expect(locationKey('Northern Motor Group')).toBe('northern')
  })
  it('keeps the full name when there is no Motor Group suffix', () => {
    expect(locationKey('Pakenham Isuzu UTE')).toBe('pakenham isuzu ute')
  })
})

describe('normalizeProperty', () => {
  it('lowercases and strips a trailing "- GA4"', () => {
    expect(normalizeProperty('Northern KIA - GA4')).toBe('northern kia')
    expect(normalizeProperty('Northern KIA GA4')).toBe('northern kia')
  })
})

describe('matchPropertiesToClients', () => {
  it('confidently matches a brand property to its location group', () => {
    const out = matchPropertiesToClients(
      [{ propertyId: 'p1', propertyDisplayName: 'Northern KIA - GA4' }],
      CLIENTS
    )
    expect(out).toEqual([{ propertyId: 'p1', clientId: 'c-northern' }])
  })

  it("matches the group's own property", () => {
    const out = matchPropertiesToClients(
      [{ propertyId: 'p2', propertyDisplayName: 'Northern Motor Group - GA4' }],
      CLIENTS
    )
    expect(out[0].clientId).toBe('c-northern')
  })

  it('returns null when no client location matches', () => {
    const out = matchPropertiesToClients(
      [{ propertyId: 'p3', propertyDisplayName: 'South Morang Ssangyong' }],
      CLIENTS
    )
    expect(out[0].clientId).toBeNull()
  })

  it('matches an exact full-name client (no Motor Group suffix)', () => {
    const out = matchPropertiesToClients(
      [{ propertyId: 'p4', propertyDisplayName: 'Pakenham Isuzu UTE - GA4' }],
      CLIENTS
    )
    expect(out[0].clientId).toBe('c-pak')
  })

  it('is case-insensitive', () => {
    const out = matchPropertiesToClients(
      [{ propertyId: 'p5', propertyDisplayName: 'GEELONG ram - ga4' }],
      CLIENTS
    )
    expect(out[0].clientId).toBe('c-geelong')
  })

  it('prefers the longest unique key and returns null on a tie', () => {
    const tied = [
      { id: 'a', name: 'North Motor Group' },   // key "north"
      { id: 'b', name: 'North' }                // key "north" (same)
    ]
    const out = matchPropertiesToClients(
      [{ propertyId: 'p6', propertyDisplayName: 'North Shore Hyundai' }],
      tied
    )
    expect(out[0].clientId).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/app/utils/ga4PropertyMatch.test.ts`
Expected: FAIL — cannot resolve `~~/app/utils/ga4PropertyMatch`.

- [ ] **Step 3: Write the implementation**

```ts
// app/utils/ga4PropertyMatch.ts
/**
 * Match GA4 property names to agency clients by location prefix, for the
 * "Auto-map" button on the GA4 connect card. Pure + framework-free so it can be
 * unit-tested. High confidence = exactly one client whose location key is a
 * leading whole-word prefix of the property name (longest unique key wins).
 */

export interface MatchableProperty { propertyId: string; propertyDisplayName: string }
export interface MatchableClient { id: string; name: string }
export interface PropertyMatch { propertyId: string; clientId: string | null }

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Client location key: name minus a trailing " motor group"; else the full name. */
export function locationKey(clientName: string): string {
  const n = normalize(clientName)
  const stripped = n.replace(/\s+motor group$/, '').trim()
  return stripped || n
}

/** Property name normalized: lowercase, drop a trailing "- GA4" / "GA4". */
export function normalizeProperty(name: string): string {
  let n = normalize(name)
  n = n.replace(/[-–]\s*ga4$/, '').trim()
  n = n.replace(/\s+ga4$/, '').trim()
  return n
}

/** True when `key` is a leading whole-word prefix of `name`. */
function isWholeWordPrefix(key: string, name: string): boolean {
  if (!key) return false
  if (name === key) return true
  return name.startsWith(key + ' ')
}

export function matchPropertiesToClients(
  properties: MatchableProperty[],
  clients: MatchableClient[]
): PropertyMatch[] {
  const keyed = clients.map((c) => ({ client: c, key: locationKey(c.name) }))
  return properties.map((p) => {
    const name = normalizeProperty(p.propertyDisplayName)
    const matches = keyed.filter((k) => isWholeWordPrefix(k.key, name))
    if (matches.length === 0) return { propertyId: p.propertyId, clientId: null }
    const maxLen = Math.max(...matches.map((m) => m.key.length))
    const longest = matches.filter((m) => m.key.length === maxLen)
    if (longest.length !== 1) return { propertyId: p.propertyId, clientId: null }
    return { propertyId: p.propertyId, clientId: longest[0].client.id }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/app/utils/ga4PropertyMatch.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add app/utils/ga4PropertyMatch.ts test/app/utils/ga4PropertyMatch.test.ts
git commit -m "feat(ga4): property→client location-match util"
```

---

## Task 2: Bulk map endpoint

**Files:**
- Create: `server/api/agency/social/ga4/map-bulk.post.ts`

Mirror the existing single-map endpoint (`server/api/agency/social/ga4/map.post.ts`), but accept an array.

- [ ] **Step 1: Write the handler**

```ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

const schema = z.object({
  items: z.array(z.object({
    connectionId: z.string().uuid(),
    propertyId: z.string().min(1),
    propertyDisplayName: z.string().optional().default(''),
    clientId: z.string().uuid()
  })).min(1)
})

/**
 * POST /api/agency/social/ga4/map-bulk
 * Upserts many property→client mappings in one request (used by Auto-map).
 * Each row is an independent ON CONFLICT (property_id) upsert.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)
  const body = schema.parse(await readBody(event))

  for (const item of body.items) {
    await execute(
      `INSERT INTO ga4_property_map (connection_id, property_id, property_display_name, client_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (property_id)
       DO UPDATE SET connection_id = EXCLUDED.connection_id,
                     property_display_name = EXCLUDED.property_display_name,
                     client_id = EXCLUDED.client_id,
                     updated_at = NOW()`,
      [item.connectionId, item.propertyId, item.propertyDisplayName, item.clientId]
    )
  }

  return { ok: true, mapped: body.items.length }
})
```

- [ ] **Step 2: Verify it resolves**

Run: `pnpm exec vitest run test/app/utils/ga4PropertyMatch.test.ts` (sanity — imports didn't break)
Also confirm the imported symbols exist: `grep -n "export async function requireAuth" server/utils/auth.ts && grep -n "export async function execute\|export function execute" server/utils/db.ts`
Expected: both grep hits present; tests still green.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/ga4/map-bulk.post.ts
git commit -m "feat(ga4): bulk property→client map endpoint"
```

---

## Task 3: Dedicated GA4 page + move card off the connections grid

**Files:**
- Create: `app/pages/agency/social/ga4.vue`
- Modify: `app/pages/agency/social/index.vue` (remove the inline card at ~line 283; add a header button near ~line 231)

- [ ] **Step 1: Create the page**

```vue
<!-- app/pages/agency/social/ga4.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto space-y-6">
    <UButton to="/agency/social" variant="ghost" icon="i-lucide-arrow-left" size="sm" class="-ml-2">
      Back to connections
    </UButton>
    <div>
      <h1 class="text-xl font-semibold">Google Analytics</h1>
      <p class="text-sm text-muted">
        Connect GA4 and map each property to a client to power the funnel report.
      </p>
    </div>
    <SocialGa4ConnectCard />
  </div>
</template>
```

- [ ] **Step 2: Remove the inline card from the connections page**

In `app/pages/agency/social/index.vue`, delete the line (currently ~283):

```vue
        <SocialGa4ConnectCard class="mb-6" />
```

(Search for `SocialGa4ConnectCard` to find it; remove only that line.)

- [ ] **Step 3: Add the header button on the connections page**

In `app/pages/agency/social/index.vue`, next to the existing `View Spend Dashboard` button (around line 231), add a sibling button. The existing block looks like:

```vue
        <UButton to="/agency/social/spend" variant="soft" icon="i-lucide-bar-chart-3">
          View Spend Dashboard
        </UButton>
```

Add immediately before or after it (keep them in the same flex container):

```vue
        <UButton to="/agency/social/ga4" variant="soft" icon="i-lucide-line-chart">
          Google Analytics
        </UButton>
```

- [ ] **Step 4: Verify**

Run: `grep -n "SocialGa4ConnectCard" app/pages/agency/social/index.vue` → Expected: **no output** (card removed from index).
Run: `grep -rn "to=\"/agency/social/ga4\"" app/pages/agency/social/index.vue` → Expected: the new button line.
Run: `grep -n "SocialGa4ConnectCard" app/pages/agency/social/ga4.vue` → Expected: the card is on the new page.

- [ ] **Step 5: Commit**

```bash
git add app/pages/agency/social/ga4.vue app/pages/agency/social/index.vue
git commit -m "feat(ga4): dedicated /agency/social/ga4 page; move card off connections grid"
```

---

## Task 4: "Auto-map" button on the connect card

**Files:**
- Modify: `app/components/social/Ga4ConnectCard.vue`

The component currently has `connections`, `maps`, `clientOptions`, `selectedClient`, `loadProperties()`, `loadClients()`, `mapProperty()`, `syncNow()`. `matchPropertiesToClients` is auto-imported from `app/utils`.

- [ ] **Step 1: Add the auto-map state + handler to `<script setup>`**

Add an `autoMapping` ref next to the existing `loading` ref:

```ts
const autoMapping = ref(false)
```

Add this function (place it after `mapProperty`):

```ts
async function autoMap() {
  // Flatten all properties with their owning connection.
  const allProps: Array<{ connectionId: string; prop: Ga4Property }> = []
  for (const conn of connections.value) {
    for (const prop of conn.properties) allProps.push({ connectionId: conn.connectionId, prop })
  }

  const alreadyMapped = new Set(maps.value.map((m) => m.property_id))
  const clientList = clientOptions.value.map((c) => ({ id: c.value, name: c.label }))
  const results = matchPropertiesToClients(
    allProps.map((a) => ({ propertyId: a.prop.propertyId, propertyDisplayName: a.prop.propertyDisplayName })),
    clientList
  )
  const matchById = new Map(results.map((r) => [r.propertyId, r.clientId]))

  const items = allProps
    .filter((a) => !alreadyMapped.has(a.prop.propertyId) && matchById.get(a.prop.propertyId))
    .map((a) => ({
      connectionId: a.connectionId,
      propertyId: a.prop.propertyId,
      propertyDisplayName: a.prop.propertyDisplayName,
      clientId: matchById.get(a.prop.propertyId) as string
    }))

  const manualCount = allProps.length - alreadyMapped.size - items.length

  if (items.length === 0) {
    toast.add({ title: 'No confident matches', description: 'Map the remaining properties manually.', color: 'warning' })
    return
  }

  autoMapping.value = true
  try {
    const res = await $fetch<{ ok: boolean; mapped: number }>('/api/agency/social/ga4/map-bulk', {
      method: 'POST',
      body: { items }
    })
    toast.add({
      title: 'Auto-mapped',
      description: `${res.mapped} mapped, ${manualCount} need manual review.`,
      color: 'success'
    })
    await loadProperties()
  } catch (err: any) {
    toast.add({ title: 'Auto-map failed', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    autoMapping.value = false
  }
}
```

- [ ] **Step 2: Add the button to the header**

In the header's button group (the `<div class="flex gap-2">` containing Connect / Sync now), add the Auto-map button as the first button:

```vue
          <UButton size="sm" variant="soft" icon="i-lucide-wand-2" :loading="autoMapping" :disabled="!connections.length" @click="autoMap">
            Auto-map
          </UButton>
```

So the group becomes Auto-map · Connect Google Analytics · Sync now.

- [ ] **Step 3: Verify**

Run: `grep -n "autoMap\|map-bulk\|matchPropertiesToClients\|i-lucide-wand-2" app/components/social/Ga4ConnectCard.vue`
Expected: the handler, the `$fetch` to `map-bulk`, the `matchPropertiesToClients` call, and the button icon all present.
Run: `pnpm exec vitest run test/app/utils/ga4PropertyMatch.test.ts` → Expected: still green (no util regressions).

- [ ] **Step 4: Commit**

```bash
git add app/components/social/Ga4ConnectCard.vue
git commit -m "feat(ga4): Auto-map button — location-match + bulk-save confident properties"
```

---

## Task 5: Full verification

- [ ] **Step 1: Run the util test suite**

Run: `pnpm exec vitest run test/app/utils/ga4PropertyMatch.test.ts`
Expected: all PASS.

- [ ] **Step 2: Sanity-grep the integration points**

```bash
grep -n "SocialGa4ConnectCard" app/pages/agency/social/index.vue   # expect: empty (moved out)
grep -n "SocialGa4ConnectCard" app/pages/agency/social/ga4.vue     # expect: present
grep -n "map-bulk" app/components/social/Ga4ConnectCard.vue        # expect: present
ls server/api/agency/social/ga4/map-bulk.post.ts                   # expect: exists
```

- [ ] **Step 3: Commit any fixups (if needed)**

```bash
git add -A && git commit -m "chore(ga4): auto-map verification fixups" || echo "nothing to commit"
```

---

## Self-review notes (addressed during authoring)

- **Spec coverage:** dedicated page + header button + card removal (Task 3) ✓; matching rule with location key / whole-word prefix / longest-unique (Task 1) ✓; auto-save confident only, leave ambiguous blank (Task 4 filters `matchById.get(...)` truthy and not-already-mapped) ✓; bulk endpoint (Task 2) ✓; client-side matching, no suggestions endpoint ✓; tests for confident/no-match/group-own/exact-name/case/longest-tie (Task 1) ✓.
- **Type consistency:** `MatchableProperty`/`MatchableClient`/`PropertyMatch` defined in Task 1 and consumed in Task 4 via the same field names (`propertyId`, `propertyDisplayName`, `id`, `name`, `clientId`). The bulk endpoint's Zod `items` shape matches the `items` array built in Task 4 (`connectionId`, `propertyId`, `propertyDisplayName`, `clientId`).
- **Behavioural note:** `manualCount = allProps.length − alreadyMapped.size − items.length` counts properties neither already-mapped nor newly auto-mapped — the "need manual review" figure shown in the toast.
