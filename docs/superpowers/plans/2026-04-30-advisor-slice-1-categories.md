# Advisor Slice 1: Categories + Drawer Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed-enum `category` field to recommendations (with 8 sibling schema columns from migration 085), wire it through the Groq LLM prompt, list endpoint, drawer, and table — and extract `AdvisorDrawer.vue` + `AdvisorFilters.vue` from `app/pages/advisor/index.vue` so subsequent slices have clean component boundaries.

**Architecture:** Single migration (085) lands all the schema needed for slices 1–3 (category, effort, snoozed_until, source, created_by). Backend: Groq Zod schema gains `category.optional()`; existing AI rec persistence path passes the value through; index endpoint accepts `?category=<value>|none`; patch endpoint accepts category. Frontend: extract drawer/filters from the 735-line `index.vue` into `app/components/advisor/`, add `AdvisorCategoryBadge.vue`, render badge in table + chip strip in filters + select in drawer.

**Tech Stack:** Nuxt 4, Nitro, Neon Postgres (`pg` driver via `~~/server/utils/db`), Nuxt UI v4, Zod, Vitest, pnpm. Migration runs via `psql "$DATABASE_URL"`.

**Spec:** `docs/superpowers/specs/2026-04-30-advisor-triage-authoring-design.md` §3 (data model), §4 (API), §5 (frontend), §8 (slice ordering).

---

## File Structure

**Create:**
- `server/database/migrations/085-advisor-triage-authoring.sql` — schema additions
- `server/utils/advisorCategories.ts` — `CATEGORIES` constant + type
- `app/components/advisor/AdvisorCategoryBadge.vue` — chip component
- `app/components/advisor/AdvisorDrawer.vue` — extracted drawer content
- `app/components/advisor/AdvisorFilters.vue` — extracted filter row + new chip strip
- `test/server/api/advisor/categoryFilter.test.ts` — Vitest unit test

**Modify:**
- `server/api/advisor/recommendations/index.get.ts` — accept `category`, return new fields
- `server/api/advisor/recommendations/[id].patch.ts` — accept `category`, `effort`, `snoozed_until`
- `server/api/ai/financial-advisor.get.ts` — Zod schema + prompt update + persist category
- `app/types/index.ts` — extend `Recommendation` type
- `app/pages/advisor/index.vue` — replace inline drawer/filters with extracted components, wire category filter

**Run (no edit):**
- `psql "$DATABASE_URL" -f server/database/migrations/085-advisor-triage-authoring.sql`

---

## Task 1.1: Write migration 085

**Files:**
- Create: `server/database/migrations/085-advisor-triage-authoring.sql`

- [ ] **Step 1: Write the migration**

Create `server/database/migrations/085-advisor-triage-authoring.sql`:

```sql
-- 085: Advisor Triage + Authoring
-- Adds category, effort, snooze, source, and created_by to recommendations.
-- Schema for slices 1, 2, and 3 of the advisor triage phase. Comments
-- table is added separately in migration 086 (slice 4).

ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (category IN (
      'cashflow','collections','pricing','margin',
      'cost-control','growth','staffing','tax-compliance','risk'
    )),
  ADD COLUMN IF NOT EXISTS effort TEXT
    CHECK (effort IN ('xs','s','m','l','xl')),
  ADD COLUMN IF NOT EXISTS snoozed_until DATE,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ai'
    CHECK (source IN ('ai','manual'));

CREATE INDEX IF NOT EXISTS idx_reco_category
  ON recommendations(tenant_id, category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reco_snoozed
  ON recommendations(tenant_id, snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reco_source
  ON recommendations(tenant_id, source);
```

- [ ] **Step 2: Apply the migration**

Run from project root:

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/085-advisor-triage-authoring.sql
```

Expected output: `ALTER TABLE` followed by 3 `CREATE INDEX` lines, no errors.

- [ ] **Step 3: Verify schema**

Run:

```bash
psql "$DATABASE_URL" -c "\d recommendations" | grep -E "category|effort|snoozed_until|source|created_by"
```

Expected: 5 lines, one per new column.

---

## Task 1.2: Define CATEGORIES constant

**Files:**
- Create: `server/utils/advisorCategories.ts`

- [ ] **Step 1: Create the constant module**

Create `server/utils/advisorCategories.ts`:

```ts
/**
 * Fixed taxonomy of advisor recommendation categories.
 *
 * The LLM prompt instructs Groq to emit one of these values per
 * recommendation when confident; manual recs set their own. NULL
 * is rendered as "Uncategorized" in the UI.
 *
 * Treat this list as append-only — removing a value would orphan
 * existing rows and require a migration.
 */
export const CATEGORIES = [
  'cashflow',
  'collections',
  'pricing',
  'margin',
  'cost-control',
  'growth',
  'staffing',
  'tax-compliance',
  'risk',
] as const

export type Category = typeof CATEGORIES[number]

export const CATEGORY_LABELS: Record<Category, string> = {
  cashflow: 'Cashflow',
  collections: 'Collections',
  pricing: 'Pricing',
  margin: 'Margin',
  'cost-control': 'Cost control',
  growth: 'Growth',
  staffing: 'Staffing',
  'tax-compliance': 'Tax & compliance',
  risk: 'Risk',
}

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
}
```

---

## Task 1.3: Write Vitest test for category filter

**Files:**
- Create: `test/server/api/advisor/categoryFilter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/server/api/advisor/categoryFilter.test.ts`:

```ts
/**
 * Unit tests for the category filter logic on the recommendations
 * index endpoint. Mocks the db layer; verifies the SQL fragment and
 * params we'd pass to queryRows for each filter shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQueryRows = vi.fn()

vi.mock('../../../../server/utils/db', () => ({
  queryRows: (...args: any[]) => mockQueryRows(...args),
}))

vi.mock('../../../../server/utils/session', () => ({
  getSelectedTenant: vi.fn(async () => 'tenant-123'),
}))

vi.mock('../../../../server/utils/auth', () => ({
  requireAuth: vi.fn(async () => ({ id: 'user-1', tenantId: 'tenant-123' })),
}))

;(globalThis as any).getQuery = (event: any) => event?.query ?? {}
;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).createError = (opts: any) => {
  const e = new Error(opts.statusMessage) as any
  e.statusCode = opts.statusCode
  return e
}

const handlerModule = await import('../../../../server/api/advisor/recommendations/index.get')
const handler = handlerModule.default

describe('GET /api/advisor/recommendations — category filter', () => {
  beforeEach(() => {
    mockQueryRows.mockReset()
    mockQueryRows.mockResolvedValue([])
  })

  it('passes a literal category value through to the WHERE clause', async () => {
    await handler({ query: { category: 'cashflow' } } as any)
    const [sql, params] = mockQueryRows.mock.calls[0]
    expect(sql).toMatch(/r\.category = \$\d+/)
    expect(params).toContain('cashflow')
  })

  it('translates ?category=none into IS NULL', async () => {
    await handler({ query: { category: 'none' } } as any)
    const [sql, params] = mockQueryRows.mock.calls[0]
    expect(sql).toMatch(/r\.category IS NULL/)
    expect(params).not.toContain('none')
  })

  it('rejects an unknown category value with 400', async () => {
    await expect(
      handler({ query: { category: 'bogus' } } as any)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('omits the category clause entirely when no filter passed', async () => {
    await handler({ query: {} } as any)
    const [sql] = mockQueryRows.mock.calls[0]
    expect(sql).not.toMatch(/r\.category/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run test/server/api/advisor/categoryFilter.test.ts
```

Expected: 4 failing tests (the endpoint doesn't filter by category yet).

---

## Task 1.4: Update index.get.ts to filter by category and return new fields

**Files:**
- Modify: `server/api/advisor/recommendations/index.get.ts`

- [ ] **Step 1: Read the current file**

Run:

```bash
wc -l server/api/advisor/recommendations/index.get.ts
```

Read the full file before editing.

- [ ] **Step 2: Add category filter and select new columns**

Apply these edits to `server/api/advisor/recommendations/index.get.ts`:

**(a)** Add import at the top (after existing imports):

```ts
import { CATEGORIES } from '~~/server/utils/advisorCategories'
```

**(b)** After the existing `ALLOWED_PRIORITY` constant near the top, add:

```ts
const ALLOWED_CATEGORY = new Set<string>(CATEGORIES as readonly string[])
```

**(c)** Inside the handler, after the existing `assignedTo` extraction, add:

```ts
const categoryParam = typeof q.category === 'string' ? q.category : null
```

**(d)** After the existing `if (assignedTo === 'unassigned') { ... }` block, add:

```ts
if (categoryParam === 'none') {
  where.push(`r.category IS NULL`)
} else if (categoryParam) {
  if (!ALLOWED_CATEGORY.has(categoryParam)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid category filter' })
  }
  where.push(`r.category = $${idx}`)
  params.push(categoryParam)
  idx++
}
```

**(e)** Update the SELECT clause to include the new columns. Find the current SQL (likely `SELECT r.*, ...` or a column list) and ensure it returns:
- `r.category`
- `r.effort`
- `r.snoozed_until`
- `r.source`
- `r.created_by`
- `creator.name AS created_by_name`
- `creator.avatar_url AS created_by_avatar_url`

Add a `LEFT JOIN team_members creator ON creator.id = r.created_by` if not already joining for the creator's profile.

If the existing query already does `r.*`, just add the two creator columns and a `LEFT JOIN team_members creator ON creator.id = r.created_by`.

- [ ] **Step 3: Run the test**

Run:

```bash
pnpm test:run test/server/api/advisor/categoryFilter.test.ts
```

Expected: 4 passing tests.

---

## Task 1.5: Update [id].patch.ts to accept category, effort, snoozed_until

**Files:**
- Modify: `server/api/advisor/recommendations/[id].patch.ts`

- [ ] **Step 1: Read the current patch endpoint**

Read the full file before editing — it has a Zod schema for the patch body and a SQL UPDATE that we need to extend.

- [ ] **Step 2: Add new fields to the Zod schema**

In the existing patch-body Zod object, add these three fields:

```ts
category: z.enum([
  'cashflow','collections','pricing','margin','cost-control',
  'growth','staffing','tax-compliance','risk',
]).nullable().optional(),
effort: z.enum(['xs','s','m','l','xl']).nullable().optional(),
snoozed_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
```

- [ ] **Step 3: Extend the dynamic UPDATE SQL**

The existing handler builds an UPDATE statement from the parsed patch body. Add the three new fields to whatever loop or array drives the SET clause so they propagate. Match the pattern already used for `priority` / `status`. The `recommendation_events` audit row should automatically include them via the existing diff logic — verify by reading the events insertion code.

- [ ] **Step 4: Smoke test by hand**

Start the dev server (`pnpm dev`) and hit the endpoint with `curl` (or browser devtools) to verify a `PATCH` with `{"category": "cashflow"}` succeeds and returns the updated row with `category: "cashflow"`. Skip if the endpoint requires auth that's awkward to set up — Vitest in Task 1.3 covers the read path; this PATCH is pattern-matched to existing field handling.

---

## Task 1.6: Update financial-advisor.get.ts (Zod + prompt + persist category)

**Files:**
- Modify: `server/api/ai/financial-advisor.get.ts`

- [ ] **Step 1: Add category to the Zod schema**

In `AdvisorLLMSchema` (currently at line ~77), inside the `recommendations` array's object shape (line ~88), add a new field after `target_direction`:

```ts
category: z.enum([
  'cashflow','collections','pricing','margin','cost-control',
  'growth','staffing','tax-compliance','risk',
]).nullable().optional(),
```

- [ ] **Step 2: Update the SYSTEM_PROMPT**

Find the `SYSTEM_PROMPT` constant (currently below the schema). In the JSON shape description, add a `category` line for each recommendation. Then add a paragraph at the end explaining the taxonomy:

```
"category": optional. One of: "cashflow", "collections", "pricing",
"margin", "cost-control", "growth", "staffing", "tax-compliance",
"risk". Pick the dominant theme. Omit if genuinely unclear; do not
guess — null is acceptable.
```

- [ ] **Step 3: Persist category when inserting recommendations**

Find the SQL `INSERT INTO recommendations (...)` block in this file (downstream of the LLM call). Add `category` to the column list and the value array. Use `parsed.recommendations[i].category ?? null`.

- [ ] **Step 4: Verify by running the dev server and triggering a fresh report**

```bash
pnpm dev
```

In the browser, navigate to `/reports`, generate a fresh advisor report, and inspect one of the resulting `recommendations` rows in the DB:

```bash
psql "$DATABASE_URL" -c \
  "SELECT id, title, category FROM recommendations ORDER BY created_at DESC LIMIT 5"
```

Expected: at least some rows have a non-null category.

---

## Task 1.7: Extend Recommendation type

**Files:**
- Modify: `app/types/index.ts`

- [ ] **Step 1: Find the existing Recommendation type**

Run:

```bash
grep -n "Recommendation" app/types/index.ts
```

Read the file around the matches to locate the type definition.

- [ ] **Step 2: Add the new fields**

Add these fields to the `Recommendation` type (or whichever interface represents the row):

```ts
category: string | null
effort: 'xs' | 's' | 'm' | 'l' | 'xl' | null
snoozed_until: string | null
source: 'ai' | 'manual'
created_by: string | null
created_by_name: string | null
created_by_avatar_url: string | null
```

If the type is named something other than `Recommendation` (e.g. it's only inline on the page), skip and let Task 1.9's drawer extraction normalise it.

---

## Task 1.8: Create AdvisorCategoryBadge component

**Files:**
- Create: `app/components/advisor/AdvisorCategoryBadge.vue`

- [ ] **Step 1: Write the component**

Create `app/components/advisor/AdvisorCategoryBadge.vue`:

```vue
<script setup lang="ts">
import { CATEGORY_LABELS, type Category } from '~~/server/utils/advisorCategories'

const props = defineProps<{
  category: Category | null
  size?: 'xs' | 'sm' | 'md'
}>()

const COLOR_MAP: Record<Category, string> = {
  cashflow: 'primary',
  collections: 'warning',
  pricing: 'info',
  margin: 'success',
  'cost-control': 'neutral',
  growth: 'success',
  staffing: 'info',
  'tax-compliance': 'warning',
  risk: 'error',
}

const color = computed(() => (props.category ? COLOR_MAP[props.category] : 'neutral'))
const label = computed(() =>
  props.category ? CATEGORY_LABELS[props.category] : 'Uncategorized'
)
</script>

<template>
  <UBadge :color="color" variant="subtle" :size="size ?? 'xs'">
    {{ label }}
  </UBadge>
</template>
```

Note: Importing from `~~/server/utils/...` in client code works because the constants module has no Node-specific imports — it's pure data.

---

## Task 1.9: Extract AdvisorDrawer.vue from index.vue

**Files:**
- Create: `app/components/advisor/AdvisorDrawer.vue`
- Modify: `app/pages/advisor/index.vue` (remove drawer block)

- [ ] **Step 1: Read the current drawer block**

Open `app/pages/advisor/index.vue`. The drawer is the `<USlideover>` block starting around line 530 and running to the end of the `<template>`. Read it end-to-end before extracting.

- [ ] **Step 2: Create the component shell**

Create `app/components/advisor/AdvisorDrawer.vue` with:

```vue
<script setup lang="ts">
// Props mirror what index.vue currently keeps as local refs around the drawer.
// All state lives in the parent; this component is presentational + emits events.

const props = defineProps<{
  open: boolean
  loading: boolean
  rec: any | null
  events: any[]
  outcomes: any[]
  similar: any[]
  graph: any | null
  teamMembers: Array<{ id: string; name: string; avatar_url?: string | null }>
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'patch', patch: Record<string, any>): void
  (e: 'open-similar', rec: any): void
  (e: 'graph-select', node: any): void
}>()

// Re-implement the drawer-local helpers (formatDate, statusColor, statusLabel,
// priorityColor, METRIC_META, formatMetric, formatDelta, deltaDirection,
// prettyEvent, outcomeNotesDraft watcher, statusOptions, priorityOptions,
// UNASSIGNED constant, assigneeDrawerOptions, scopeLabel-equivalent if needed).
//
// Copy them verbatim from index.vue. Adjust where they referenced the parent's
// `recommendations` list or `clientsData` — those are not props in this
// extraction, but the existing drawer block doesn't need them; only `events`
// for activity, `similar` for related, `graph` for relationships.
</script>

<template>
  <!-- Paste the existing <USlideover>...</USlideover> block here, with these
       wiring adjustments:
         drawerOpen          → props.open / emit('update:open', ...)
         drawerLoading       → props.loading
         drawerRec           → props.rec
         drawerEvents        → props.events
         drawerOutcomes      → props.outcomes
         drawerSimilar       → props.similar
         drawerGraph         → props.graph
         openDrawer(m)       → emit('open-similar', m)
         onGraphNodeSelect   → emit('graph-select', node)
         patchRec(patch)     → emit('patch', patch)
         teamData            → props.teamMembers (used for assigneeDrawerOptions)
  -->
</template>
```

- [ ] **Step 3: Replace the drawer block in index.vue**

In `app/pages/advisor/index.vue`:

1. Delete the entire `<USlideover>` block at the bottom of the template.
2. Delete the helper functions that have moved into the drawer (`prettyEvent`, `formatMetric`, `formatDelta`, `deltaDirection`, `formatDate`, etc.). Keep them only if used elsewhere on the page.
3. Replace the deleted block with:

```vue
<AdvisorDrawer
  v-model:open="drawerOpen"
  :loading="drawerLoading"
  :rec="drawerRec"
  :events="drawerEvents"
  :outcomes="drawerOutcomes"
  :similar="drawerSimilar"
  :graph="drawerGraph"
  :team-members="teamData?.members ?? []"
  @patch="patchRec"
  @open-similar="openDrawer"
  @graph-select="onGraphNodeSelect"
/>
```

- [ ] **Step 4: Browser-verify the extraction**

Run:

```bash
pnpm dev
```

Open the page, click a recommendation. The drawer must open with identical content and behaviour to before. Run through:
- Status select still updates and persists
- Outcome notes save button still works
- Activity log renders
- Similar advice list still clickable
- Close button works

If anything regresses, fix it before moving on. The extraction is a no-op refactor; nothing should change visually.

---

## Task 1.10: Extract AdvisorFilters.vue from index.vue

**Files:**
- Create: `app/components/advisor/AdvisorFilters.vue`
- Modify: `app/pages/advisor/index.vue`

- [ ] **Step 1: Identify the filter block**

In `app/pages/advisor/index.vue`, the filter block is the `<UCard>` containing the status `UButtonGroup` and the four `USelectMenu`s (priority, client, period, assignee). It's roughly lines 411–462 in the current file.

- [ ] **Step 2: Create the component**

Create `app/components/advisor/AdvisorFilters.vue`:

```vue
<script setup lang="ts">
type StatusFilter = 'active' | 'all' | 'open' | 'in_progress' | 'done' | 'dismissed'
type PriorityFilter = 'all' | 'low' | 'medium' | 'high'

const props = defineProps<{
  status: StatusFilter
  priority: PriorityFilter
  client: string
  period: string
  assignee: string
  category: string
  clientOptions: Array<{ label: string; value: string }>
  periodOptions: Array<{ label: string; value: string }>
  assigneeOptions: Array<{ label: string; value: string }>
}>()

const emit = defineEmits<{
  (e: 'update:status', v: StatusFilter): void
  (e: 'update:priority', v: PriorityFilter): void
  (e: 'update:client', v: string): void
  (e: 'update:period', v: string): void
  (e: 'update:assignee', v: string): void
  (e: 'update:category', v: string): void
}>()

// Status button-group items (preserve existing labels)
const STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Open', value: 'open' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Done', value: 'done' },
  { label: 'Dismissed', value: 'dismissed' },
  { label: 'All', value: 'all' },
] as const

const PRIORITY_OPTIONS = [
  { label: 'All priorities', value: 'all' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
] as const
</script>

<template>
  <UCard>
    <div class="flex flex-wrap gap-2 items-center">
      <UButtonGroup>
        <UButton
          v-for="o in STATUS_OPTIONS"
          :key="o.value"
          :color="status === o.value ? 'primary' : 'neutral'"
          :variant="status === o.value ? 'solid' : 'outline'"
          size="sm"
          @click="emit('update:status', o.value)"
        >{{ o.label }}</UButton>
      </UButtonGroup>

      <div class="grow" />

      <USelectMenu
        :model-value="priority"
        :items="PRIORITY_OPTIONS"
        value-key="value"
        size="sm"
        class="w-40"
        @update:model-value="(v: any) => emit('update:priority', v)"
      />
      <USelectMenu
        :model-value="client"
        :items="clientOptions"
        value-key="value"
        size="sm"
        class="w-52"
        @update:model-value="(v: any) => emit('update:client', v)"
      />
      <USelectMenu
        :model-value="period"
        :items="periodOptions"
        value-key="value"
        size="sm"
        class="w-44"
        @update:model-value="(v: any) => emit('update:period', v)"
      />
      <USelectMenu
        :model-value="assignee"
        :items="assigneeOptions"
        value-key="value"
        size="sm"
        class="w-48"
        @update:model-value="(v: any) => emit('update:assignee', v)"
      />
    </div>

    <!-- Slot reserved for the category chip strip added in Task 1.11 -->
    <slot name="category-chips" />
  </UCard>
</template>
```

- [ ] **Step 3: Wire it into index.vue**

Replace the existing filter `<UCard>` block in `app/pages/advisor/index.vue` with:

```vue
<AdvisorFilters
  v-model:status="statusFilter"
  v-model:priority="priorityFilter"
  v-model:client="clientFilter"
  v-model:period="periodFilter"
  v-model:assignee="assigneeFilter"
  v-model:category="categoryFilter"
  :client-options="clientOptions"
  :period-options="periodOptions"
  :assignee-options="assigneeOptions"
>
  <template #category-chips>
    <!-- Filled in Task 1.11 -->
  </template>
</AdvisorFilters>
```

You must add `categoryFilter` as a new ref in the page script:

```ts
const categoryFilter = ref<string>('all')
```

And include it in the `query` computed:

```ts
if (categoryFilter.value !== 'all') q.category = categoryFilter.value
```

- [ ] **Step 4: Browser-verify**

Reload the page. All existing filters must still work as before — same behaviour, just rendered through the new component.

---

## Task 1.11: Add category chip strip

**Files:**
- Modify: `app/components/advisor/AdvisorFilters.vue`
- Modify: `app/pages/advisor/index.vue`

- [ ] **Step 1: Add chip strip markup inside the slot**

In `app/components/advisor/AdvisorFilters.vue`, add a `<script setup>` import and constant:

```ts
import { CATEGORIES, CATEGORY_LABELS } from '~~/server/utils/advisorCategories'

const CHIP_OPTIONS = [
  { value: 'all', label: 'All' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
  { value: 'none', label: 'Uncategorized' },
] as const
```

Then add the chip strip inside the existing template, before the `<slot />` line (replacing the current slot):

```vue
<div class="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-default">
  <UBadge
    v-for="opt in CHIP_OPTIONS"
    :key="opt.value"
    :color="category === opt.value ? 'primary' : 'neutral'"
    :variant="category === opt.value ? 'solid' : 'subtle'"
    size="xs"
    class="cursor-pointer select-none"
    @click="emit('update:category', opt.value)"
  >
    {{ opt.label }}
  </UBadge>
</div>
```

- [ ] **Step 2: Remove the now-unused slot in index.vue**

Drop the `<template #category-chips>` block in `app/pages/advisor/index.vue` — it was only there as a placeholder; the chips are now rendered inside `AdvisorFilters` directly.

- [ ] **Step 3: Browser-verify the chips**

Reload `/advisor`. Click `Cashflow` chip — table should refresh and only show cashflow recs. Click `All` to clear. Click `Uncategorized` — should show recs with `category IS NULL` (existing AI recs from before slice 1).

---

## Task 1.12: Add category column to table

**Files:**
- Modify: `app/pages/advisor/index.vue`

- [ ] **Step 1: Add column definition**

Find the `columns` array (currently around line 126):

```ts
const columns = [
  { accessorKey: 'priority', header: 'Priority' },
  { accessorKey: 'title', header: 'Recommendation' },
  ...
]
```

Add `category` between `priority` and `title`:

```ts
{ accessorKey: 'category', header: 'Category' },
```

- [ ] **Step 2: Add the cell template**

Inside the `<UTable>` block in the template, add a new cell template after `#priority-cell`:

```vue
<template #category-cell="{ row }">
  <AdvisorCategoryBadge :category="row.original.category" />
</template>
```

- [ ] **Step 3: Browser-verify**

Reload `/advisor`. Confirm the new "Category" column appears between Priority and Recommendation. Existing AI recs render as "Uncategorized" (neutral chip). New AI recs (after running a fresh report in Task 1.6 verification) should show their category chip.

---

## Task 1.13: Add category select to drawer

**Files:**
- Modify: `app/components/advisor/AdvisorDrawer.vue`

- [ ] **Step 1: Add CATEGORIES options inside script setup**

Add to the existing `<script setup>` block:

```ts
import { CATEGORIES, CATEGORY_LABELS } from '~~/server/utils/advisorCategories'

const CATEGORY_OPTIONS = [
  { label: 'Uncategorized', value: '__none__' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
]
```

- [ ] **Step 2: Render the select inside the controls grid**

Find the existing `grid grid-cols-2 gap-3` block in the drawer template (the one containing Status / Priority / Assignee / Due date selects). Add a new cell at the end:

```vue
<div>
  <p class="text-xs text-muted mb-1">Category</p>
  <USelectMenu
    :model-value="rec?.category ?? '__none__'"
    :items="CATEGORY_OPTIONS"
    value-key="value"
    size="sm"
    @update:model-value="(v: string) => emit('patch', { category: v === '__none__' ? null : v })"
  />
</div>
```

The `__none__` sentinel is required because `USelectMenu` cannot have an empty-string value (project lessons-learned memory).

- [ ] **Step 3: Add the badge to the drawer header**

In the drawer header (where the priority + status badges already render at the top), add:

```vue
<AdvisorCategoryBadge :category="rec.category" size="xs" />
```

next to the existing badges, before the period text.

- [ ] **Step 4: Browser-verify**

Reload `/advisor`, open a recommendation drawer. Confirm:
1. The category badge renders in the header.
2. Changing the category select fires a PATCH and the table column updates after refresh.
3. Selecting "Uncategorized" clears the category (DB row becomes NULL).

---

## Task 1.14: Battle test pre-commit

- [ ] **Step 1: Re-read every modified file**

```bash
git diff --stat HEAD
```

Open each modified file and re-read end-to-end. Look for:

- Server imports use `~~/server/utils/...` not `~/server/utils/...`
- USelectMenu values never empty string (`''`)
- No duplicate UI sections from accidental paste
- Computed reactivity wired correctly (filter changes → URL/query update)
- No `localhost` / private-IP fetches added
- No `.client.vue`-only imports leaking into server code

- [ ] **Step 2: Run all tests**

```bash
pnpm test:run
```

Expected: all tests pass. New `categoryFilter.test.ts` is green; no existing tests regress.

- [ ] **Step 3: Browser smoke test the full slice**

```bash
pnpm dev
```

Walk the whole flow once:
1. Navigate to `/advisor`.
2. Filter chips: click each chip, verify table reflects the filter.
3. Open a rec drawer, change category, save, close drawer, verify table updates.
4. Generate a new advisor report on `/reports`, return to `/advisor`, verify the new recs have categories assigned by the LLM.
5. Confirm dark mode renders chips correctly (test the "Uncategorized" chip visibility).

If any step fails, fix before commit.

---

## Task 1.15: Commit slice 1

- [ ] **Step 1: Stage all changes**

```bash
git add \
  server/database/migrations/085-advisor-triage-authoring.sql \
  server/utils/advisorCategories.ts \
  server/api/advisor/recommendations/index.get.ts \
  server/api/advisor/recommendations/[id].patch.ts \
  server/api/ai/financial-advisor.get.ts \
  app/types/index.ts \
  app/components/advisor/AdvisorCategoryBadge.vue \
  app/components/advisor/AdvisorDrawer.vue \
  app/components/advisor/AdvisorFilters.vue \
  app/pages/advisor/index.vue \
  test/server/api/advisor/categoryFilter.test.ts
```

- [ ] **Step 2: Verify nothing extra is staged**

```bash
git status --short
```

Expected: only the files listed above appear under `A` / `M`. No `.env`, no lockfile changes, no unrelated edits.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(advisor): categories taxonomy + drawer/filters extraction

Migration 085 adds category, effort, snoozed_until, source, created_by
to recommendations (effort/snooze/source unused this slice — used in
slices 2-3). Adds 9-value fixed category enum surfaced via:

- LLM prompt + Zod schema (Groq emits one of the 9, NULL when unsure)
- index.get filter (?category=cashflow|...|none)
- Patch endpoint accepts category/effort/snoozed_until
- Filter chip strip on /advisor
- Category column in table
- Category select in drawer
- Header badge in drawer

Also extracts the 530-line drawer + filter block out of advisor/index.vue
into app/components/advisor/AdvisorDrawer.vue and AdvisorFilters.vue so
slices 2-6 have clean component boundaries to add into.

Spec: docs/superpowers/specs/2026-04-30-advisor-triage-authoring-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify commit**

```bash
git log -1 --stat
```

Expected: one commit with ~10 files changed; no untracked files left in `git status`.

---

## Self-review checklist (run after writing this plan)

- [x] **Spec coverage:** Every section of slice 1 in the spec's §3 + §4 + §5 + §8 maps to a task above.
- [x] **No placeholders:** Every step has actual code or actual commands.
- [x] **Type consistency:** `Category` type, `CATEGORIES` constant, `CATEGORY_LABELS` are referenced consistently across server util, badge component, drawer, filters.
- [x] **Component boundaries:** drawer + filters extraction happens once (Tasks 1.9–1.10), then later tasks add into the new components without touching `index.vue` for those concerns.
- [x] **Migration safety:** uses `IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` so re-running is idempotent.

## After this plan

Once slice 1 ships, the next plan (`2026-04-30-advisor-slice-2-snooze.md`) will cover snooze + source filter + "Show snoozed" toggle. Schema is already in place from migration 085, so slice 2 is endpoint-and-UI only.
