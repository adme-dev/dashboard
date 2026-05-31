# CRM Slice 2 — Opportunities + Pipeline (agency-side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or executing-plans). Steps use `- [ ]` checkboxes. Stacked on Slice 1 (branch `feat/crm-slice-2` off `feat/crm-slice-1`).

**Goal:** Add Opportunities (deals) + a drag-and-drop Pipeline kanban to the CRM, client-scoped, with stage management and a forecasting summary.

**Architecture:** Port `deals`/`deal_stages` from `crm-dashboard-main` → `crm_opportunities`/`crm_stages`, stripping all automotive columns (`vehicle_id`, `test_drive_id`, `appraisal_id`, `trade_in_value`, `vehicle_condition`, `dealership_id`→`client_id`). Stages are seeded as **global defaults** (`client_id NULL`); resolution prefers client-specific rows if any exist (per-client customization is a later seam). Opportunities link to `crm_people`/`crm_companies`. Reuses Slice 1 patterns (`buildWhere`, `validateCustomFields`, endpoint/composable/Nuxt-UI conventions). Kanban via `vue-draggable-plus` (added dep); forecasting via simple aggregation + cards.

**Tech Stack:** Nuxt 4, Nuxt UI v4, Nitro, Neon (`db.ts`), Zod, `vue-draggable-plus`, Vitest.

**Reference spec:** `docs/superpowers/specs/2026-05-31-native-crm-twenty-blueprint-design.md` (Slice 2).

---

## Conventions
Same as Slice 1: `~~/server/utils/...` imports; parameterized SQL via `buildWhere`/explicit `$n`; every read/write filters by `client_id` server-side; `USelectMenu` non-empty sentinels; `UFormField` forms; run the migration against the DB. Next migration number: **135**.

---

### Task 1: Migration — opportunities + stages

**Files:** Create `server/database/migrations/135-crm-opportunities.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 135: CRM opportunities + pipeline stages (Slice 2). Stacked on 134.
-- Ported from crm-dashboard deals/deal_stages; automotive columns stripped.
-- Stages: global defaults (client_id NULL); per-client rows override later.

CREATE TABLE IF NOT EXISTS crm_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID REFERENCES agency_clients(id) ON DELETE CASCADE,  -- NULL = global default
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  probability INTEGER NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  is_won      BOOLEAN NOT NULL DEFAULT false,
  is_lost     BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One code per scope (global, or per client).
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_stages_scope_code
  ON crm_stages (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

INSERT INTO crm_stages (client_id, code, name, probability, sort_order, color, is_won, is_lost)
VALUES
  (NULL, 'new',         'New',         10,  1, '#94a3b8', false, false),
  (NULL, 'qualified',   'Qualified',   25,  2, '#3b82f6', false, false),
  (NULL, 'proposal',    'Proposal',    50,  3, '#8b5cf6', false, false),
  (NULL, 'negotiation', 'Negotiation', 75,  4, '#f59e0b', false, false),
  (NULL, 'won',         'Won',         100, 5, '#22c55e', true,  false),
  (NULL, 'lost',        'Lost',        0,   6, '#ef4444', false, true)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS crm_opportunities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  person_id           UUID REFERENCES crm_people(id) ON DELETE SET NULL,
  company_id          UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  stage_id            UUID NOT NULL REFERENCES crm_stages(id),
  owner_id            UUID,
  amount              NUMERIC(14,2) NOT NULL DEFAULT 0,
  probability         INTEGER NOT NULL DEFAULT 10 CHECK (probability BETWEEN 0 AND 100),
  weighted_value      NUMERIC(14,2) GENERATED ALWAYS AS (amount * probability / 100) STORED,
  expected_close_date DATE,
  actual_close_date   DATE,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  source              TEXT,
  competitor          TEXT,
  lost_reason         TEXT,
  notes               TEXT,
  next_action         TEXT,
  next_action_date    TIMESTAMPTZ,
  stage_changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stage_history       JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_fields       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_opps_client ON crm_opportunities(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_opps_stage ON crm_opportunities(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_person ON crm_opportunities(person_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_company ON crm_opportunities(company_id);
```

- [ ] **Step 2: Run it**
`export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-) && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/135-crm-opportunities.sql`
Expected: CREATE/INSERT lines, no error.

- [ ] **Step 3: Verify** `psql "$DATABASE_URL" -c "SELECT code,probability,is_won,is_lost FROM crm_stages WHERE client_id IS NULL ORDER BY sort_order"` → 6 rows.

- [ ] **Step 4: Commit** `git add server/database/migrations/135-crm-opportunities.sql && git commit -m "feat(crm): opportunities + pipeline stages schema (Slice 2)"`

---

### Task 2: Stage resolution helper (TDD)

**Files:** Create `server/utils/crm/stages.ts`; Test `test/crm/stages.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { resolveStages } from '~~/server/utils/crm/stages'

const globals = [
  { id: 'g1', client_id: null, code: 'new', sort_order: 1 },
  { id: 'g2', client_id: null, code: 'won', sort_order: 5 },
]
describe('resolveStages', () => {
  it('returns globals sorted when client has no custom stages', () => {
    expect(resolveStages(globals, []).map(s => s.code)).toEqual(['new', 'won'])
  })
  it('prefers client stages entirely when any exist', () => {
    const client = [{ id: 'c1', client_id: 'X', code: 'lead', sort_order: 1 }]
    expect(resolveStages(globals, client).map(s => s.code)).toEqual(['lead'])
  })
})
```

- [ ] **Step 2: Run → fail.** `pnpm exec vitest run test/crm/stages.test.ts`

- [ ] **Step 3: Implement**

```typescript
// server/utils/crm/stages.ts
export interface StageRow { id: string, client_id: string | null, code: string, sort_order: number, [k: string]: unknown }

// If the client has ANY custom stages, use those exclusively; otherwise fall back to globals.
export function resolveStages(globals: StageRow[], clientStages: StageRow[]): StageRow[] {
  const chosen = clientStages.length ? clientStages : globals
  return [...chosen].sort((a, b) => a.sort_order - b.sort_order)
}
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** `git add server/utils/crm/stages.ts test/crm/stages.test.ts && git commit -m "feat(crm): stage resolution helper with tests"`

---

### Task 3: Stages + opportunities list/create endpoints

**Files:** Create `server/api/crm/stages/index.get.ts`; `server/api/crm/opportunities/index.get.ts`, `index.post.ts`

- [ ] **Step 1: stages list**

```typescript
// server/api/crm/stages/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { resolveStages, type StageRow } from '~~/server/utils/crm/stages'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { client_id } = Query.parse(getQuery(event))
  const globals = await queryRows<StageRow>(`SELECT * FROM crm_stages WHERE client_id IS NULL AND is_active = true`)
  const client = await queryRows<StageRow>(`SELECT * FROM crm_stages WHERE client_id = $1 AND is_active = true`, [client_id])
  return { items: resolveStages(globals, client) }
})
```

- [ ] **Step 2: opportunities list** (client-scoped; optional stage filter; joins names)

```typescript
// server/api/crm/opportunities/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryCount } from '~~/server/utils/db'
import { buildWhere, type Cond } from '~~/server/utils/crm/queryScope'

const Query = z.object({
  client_id: z.string().uuid(),
  stage_id: z.string().uuid().optional(),
  status: z.enum(['open', 'won', 'lost']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(500).default(200),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const conds: Cond[] = []
  if (q.stage_id) conds.push({ sql: 'o.stage_id = ?', params: [q.stage_id] })
  if (q.status) conds.push({ sql: 'o.status = ?', params: [q.status] })
  if (q.q) {
    const safe = q.q.replace(/[%_]/g, c => '\\' + c)
    conds.push({ sql: 'o.name ILIKE ?', params: [`%${safe}%`] })
  }
  // buildWhere emits bare column names; alias them to o.* for the join query.
  const { where, params } = buildWhere(q.client_id, conds)
  const aliased = where
    .replace('deleted_at IS NULL', 'o.deleted_at IS NULL')
    .replace('client_id = $1', 'o.client_id = $1')
  const offset = (q.page - 1) * q.page_size
  const items = await queryRows(
    `SELECT o.*,
            (p.first_name || ' ' || COALESCE(p.last_name,'')) AS person_name,
            c.name AS company_name
       FROM crm_opportunities o
       LEFT JOIN crm_people p ON p.id = o.person_id
       LEFT JOIN crm_companies c ON c.id = o.company_id
       ${aliased}
       ORDER BY o.created_at DESC
       LIMIT ${q.page_size} OFFSET ${offset}`,
    params,
  )
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM crm_opportunities o ${aliased}`, params)
  return { items, total, page: q.page, page_size: q.page_size }
})
```

- [ ] **Step 3: opportunities create** (probability defaults from the chosen stage if not given)

```typescript
// server/api/crm/opportunities/index.post.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1),
  stage_id: z.string().uuid(),
  person_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().optional().default(0),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expected_close_date: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  // stage must belong to this client's resolvable set (global or own); also derive defaults.
  const stage = await queryOne<{ id: string, probability: number, is_won: boolean, is_lost: boolean }>(
    `SELECT id, probability, is_won, is_lost FROM crm_stages WHERE id = $1 AND (client_id IS NULL OR client_id = $2)`,
    [b.stage_id, b.client_id],
  )
  if (!stage) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
  const status = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open'
  const prob = b.probability ?? stage.probability
  const row = await queryOne(
    `INSERT INTO crm_opportunities
       (client_id, name, person_id, company_id, stage_id, owner_id, amount, probability, expected_close_date, status, source, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [b.client_id, b.name, b.person_id ?? null, b.company_id ?? null, b.stage_id, b.owner_id ?? null,
      b.amount ?? 0, prob, b.expected_close_date ?? null, status, b.source ?? null, b.notes ?? null, user.id],
  )
  return { item: row }
})
```

- [ ] **Step 4: Verify** via dev server (create a stage-valid opportunity; list returns it with person/company names).
- [ ] **Step 5: Commit** `git add server/api/crm/stages server/api/crm/opportunities/index.get.ts server/api/crm/opportunities/index.post.ts && git commit -m "feat(crm): stages list + opportunities list/create endpoints"`

---

### Task 4: Opportunity get / patch / delete / move-stage

**Files:** Create `server/api/crm/opportunities/[id].get.ts`, `[id].patch.ts`, `[id].delete.ts`, `[id]/move.patch.ts`

- [ ] **Step 1: get**

```typescript
// server/api/crm/opportunities/[id].get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
const Query = z.object({ client_id: z.string().uuid() })
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const row = await queryOne(
    `SELECT * FROM crm_opportunities WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`, [id, client_id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
  return { item: row }
})
```

- [ ] **Step 2: patch** (generic field updates; recompute status if stage changes)

```typescript
// server/api/crm/opportunities/[id].patch.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
const Body = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1).optional(),
  person_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expected_close_date: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  competitor: z.string().nullable().optional(),
  lost_reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  next_action: z.string().nullable().optional(),
  next_action_date: z.string().nullable().optional(),
})
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const sets: string[] = []
  const params: unknown[] = []
  const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
  for (const col of ['name','person_id','company_id','owner_id','amount','probability','expected_close_date','source','competitor','lost_reason','notes','next_action','next_action_date'] as const) {
    if (b[col] !== undefined) set(col, b[col])
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')
  params.push(id); const idIdx = params.length
  params.push(b.client_id); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_opportunities SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`, params)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
  return { item: row }
})
```

- [ ] **Step 3: delete (soft)**

```typescript
// server/api/crm/opportunities/[id].delete.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'
const Query = z.object({ client_id: z.string().uuid() })
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const n = await execute(`UPDATE crm_opportunities SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`, [id, client_id])
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
  return { ok: true }
})
```

- [ ] **Step 4: move-stage** (the kanban drop target — updates stage, status, probability, stage_changed_at, appends history)

```typescript
// server/api/crm/opportunities/[id]/move.patch.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
const Body = z.object({ client_id: z.string().uuid(), stage_id: z.string().uuid() })
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const stage = await queryOne<{ id: string, probability: number, is_won: boolean, is_lost: boolean }>(
    `SELECT id, probability, is_won, is_lost FROM crm_stages WHERE id = $1 AND (client_id IS NULL OR client_id = $2)`,
    [b.stage_id, b.client_id])
  if (!stage) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
  const status = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open'
  const closeSet = (stage.is_won || stage.is_lost) ? ', actual_close_date = CURRENT_DATE' : ''
  const row = await queryOne(
    `UPDATE crm_opportunities
       SET stage_id = $1, status = $2, probability = $3, stage_changed_at = NOW(), updated_at = NOW(),
           stage_history = stage_history || jsonb_build_object('stage_id', $1::text, 'at', NOW()::text, 'by', $4::text)
           ${closeSet}
     WHERE id = $5 AND client_id = $6 AND deleted_at IS NULL
     RETURNING *`,
    [b.stage_id, status, stage.probability, user.id, id, b.client_id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
  return { item: row }
})
```

- [ ] **Step 5: Verify + Commit** (`git add server/api/crm/opportunities && git commit -m "feat(crm): opportunity get/patch/delete + move-stage endpoints"`)

---

### Task 5: Pipeline aggregation endpoint

**Files:** Create `server/api/crm/pipeline.get.ts`

- [ ] **Step 1: Implement** (per-stage counts + sum amount + sum weighted, open deals only)

```typescript
// server/api/crm/pipeline.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
const Query = z.object({ client_id: z.string().uuid() })
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { client_id } = Query.parse(getQuery(event))
  const rows = await queryRows<{ stage_id: string, count: string, total: string, weighted: string }>(
    `SELECT stage_id,
            COUNT(*)::text AS count,
            COALESCE(SUM(amount),0)::text AS total,
            COALESCE(SUM(weighted_value),0)::text AS weighted
       FROM crm_opportunities
      WHERE client_id = $1 AND deleted_at IS NULL AND status = 'open'
      GROUP BY stage_id`, [client_id])
  const byStage = Object.fromEntries(rows.map(r => [r.stage_id, {
    count: Number(r.count), total: Number(r.total), weighted: Number(r.weighted),
  }]))
  const openTotal = rows.reduce((s, r) => s + Number(r.total), 0)
  const weightedTotal = rows.reduce((s, r) => s + Number(r.weighted), 0)
  return { byStage, openTotal, weightedTotal }
})
```

- [ ] **Step 2: Verify + Commit** (`git add server/api/crm/pipeline.get.ts && git commit -m "feat(crm): pipeline aggregation endpoint"`)

---

### Task 6: Add vue-draggable-plus dependency

**Files:** Modify `package.json`

- [ ] **Step 1:** `pnpm add vue-draggable-plus` (adds to dependencies; reuses symlinked node_modules — run from worktree).
- [ ] **Step 2:** Verify import resolves: `pnpm exec nuxt prepare` then check `node_modules/vue-draggable-plus` exists.
- [ ] **Step 3: Commit** `git add package.json pnpm-lock.yaml && git commit -m "chore(crm): add vue-draggable-plus for pipeline kanban"`

---

### Task 7: Frontend types + composables

**Files:** Modify `app/types/crm.ts` (append); Create `app/composables/useCrmOpportunities.ts`, `useCrmStages.ts`, `useCrmPipeline.ts`

- [ ] **Step 1: Append types**

```typescript
// append to app/types/crm.ts
export interface CrmStage {
  id: string; client_id: string | null; code: string; name: string; probability: number
  sort_order: number; color: string; is_won: boolean; is_lost: boolean; is_active: boolean
}
export interface CrmOpportunity {
  id: string; client_id: string; name: string; person_id: string | null; company_id: string | null
  stage_id: string; owner_id: string | null; amount: number; probability: number; weighted_value: number
  expected_close_date: string | null; actual_close_date: string | null; status: 'open' | 'won' | 'lost'
  source: string | null; competitor: string | null; lost_reason: string | null; notes: string | null
  next_action: string | null; next_action_date: string | null; stage_changed_at: string
  custom_fields: Record<string, unknown>; created_at: string; updated_at: string
  person_name?: string | null; company_name?: string | null
}
export interface CrmPipelineSummary {
  byStage: Record<string, { count: number, total: number, weighted: number }>
  openTotal: number; weightedTotal: number
}
```

- [ ] **Step 2: useCrmStages**

```typescript
// app/composables/useCrmStages.ts
import type { CrmStage } from '~/types/crm'
export function useCrmStages(clientId: Ref<string | null>) {
  const query = computed(() => ({ client_id: clientId.value ?? '' }))
  const { data, refresh } = useFetch<{ items: CrmStage[] }>('/api/crm/stages', {
    query, watch: [query], immediate: false, default: () => ({ items: [] }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })
  return { stages: computed(() => data.value?.items ?? []), refresh }
}
```

- [ ] **Step 3: useCrmOpportunities**

```typescript
// app/composables/useCrmOpportunities.ts
import type { CrmOpportunity, CrmListResponse } from '~/types/crm'
export function useCrmOpportunities(clientId: Ref<string | null>) {
  const query = computed(() => {
    const p: Record<string, string> = { page: '1', page_size: '500' }
    if (clientId.value) p.client_id = clientId.value
    return p
  })
  const { data, pending, refresh } = useFetch<CrmListResponse<CrmOpportunity>>('/api/crm/opportunities', {
    query, watch: [query], immediate: false, default: () => ({ items: [], total: 0, page: 1, page_size: 500 }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })
  async function create(body: Partial<CrmOpportunity>) {
    const r = await $fetch<{ item: CrmOpportunity }>('/api/crm/opportunities', { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh(); return r.item
  }
  async function update(id: string, body: Partial<CrmOpportunity>) {
    const r = await $fetch<{ item: CrmOpportunity }>(`/api/crm/opportunities/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh(); return r.item
  }
  async function move(id: string, stageId: string) {
    const r = await $fetch<{ item: CrmOpportunity }>(`/api/crm/opportunities/${id}/move`, { method: 'PATCH', body: { client_id: clientId.value, stage_id: stageId } })
    return r.item
  }
  async function remove(id: string) {
    await $fetch(`/api/crm/opportunities/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { data, pending, refresh, create, update, move, remove }
}
```

- [ ] **Step 4: useCrmPipeline**

```typescript
// app/composables/useCrmPipeline.ts
import type { CrmPipelineSummary } from '~/types/crm'
export function useCrmPipeline(clientId: Ref<string | null>) {
  const query = computed(() => ({ client_id: clientId.value ?? '' }))
  const { data, refresh } = useFetch<CrmPipelineSummary>('/api/crm/pipeline', {
    query, watch: [query], immediate: false, default: () => ({ byStage: {}, openTotal: 0, weightedTotal: 0 }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })
  return { summary: data, refresh }
}
```

- [ ] **Step 5: Commit** `git add app/types/crm.ts app/composables/useCrmOpportunities.ts app/composables/useCrmStages.ts app/composables/useCrmPipeline.ts && git commit -m "feat(crm): opportunities/stages/pipeline types + composables"`

---

### Task 8: Pipeline kanban UI + opportunity form; add Pipeline tab

**Files:** Create `app/components/crm/PipelineBoard.vue`, `OpportunityForm.vue`, `OpportunitySlideover.vue`; Modify `app/pages/agency/crm/index.vue` (add Pipeline tab)

> Invoke the frontend-design skill principles (consistency with the dashboard system) before authoring the form.

- [ ] **Step 1: PipelineBoard.vue** — columns per stage, `VueDraggable` cards, optimistic move + summary header

```vue
<!-- app/components/crm/PipelineBoard.vue -->
<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import type { CrmOpportunity, CrmStage } from '~/types/crm'
const props = defineProps<{ clientId: string }>()
const clientId = toRef(props, 'clientId')
const toast = useToast()
const { stages } = useCrmStages(clientId)
const { data, pending, refresh, move, create, update } = useCrmOpportunities(clientId)
const { summary, refresh: refreshSummary } = useCrmPipeline(clientId)

// Local per-stage buckets the draggable mutates.
const buckets = ref<Record<string, CrmOpportunity[]>>({})
watchEffect(() => {
  const map: Record<string, CrmOpportunity[]> = {}
  for (const s of stages.value) map[s.id] = []
  for (const o of data.value?.items ?? []) (map[o.stage_id] ??= []).push(o)
  buckets.value = map
})

const slideoverOpen = ref(false)
const editing = ref<CrmOpportunity | null>(null)
function openNew() { editing.value = null; slideoverOpen.value = true }
function openEdit(o: CrmOpportunity) { editing.value = o; slideoverOpen.value = true }

async function onDrop(stage: CrmStage, evt: any) {
  const el = evt?.added?.element as CrmOpportunity | undefined
  if (!el || el.stage_id === stage.id) return
  try {
    await move(el.id, stage.id)
    await refreshSummary()
  } catch (e: any) {
    toast.add({ title: 'Move failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
    await refresh() // revert optimistic move
  }
}
async function onSave(body: Record<string, unknown>) {
  try {
    if (editing.value) await update(editing.value.id, body)
    else await create(body)
    slideoverOpen.value = false
    await refreshSummary()
    toast.add({ title: editing.value ? 'Opportunity updated' : 'Opportunity created', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}
function money(n: number) { return n.toLocaleString(undefined, { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }) }
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex gap-6 text-sm">
        <div><span class="text-muted">Open value</span> <span class="font-semibold">{{ money(summary?.openTotal ?? 0) }}</span></div>
        <div><span class="text-muted">Weighted</span> <span class="font-semibold">{{ money(summary?.weightedTotal ?? 0) }}</span></div>
      </div>
      <UButton icon="i-lucide-plus" @click="openNew">Add opportunity</UButton>
    </div>

    <div v-if="pending" class="text-sm text-muted py-8 text-center">Loading pipeline…</div>
    <div v-else class="flex gap-3 overflow-x-auto pb-2">
      <div v-for="stage in stages" :key="stage.id" class="flex flex-col w-72 shrink-0">
        <div class="flex items-center gap-2 px-1 pb-2">
          <span class="size-2.5 rounded-full" :style="{ backgroundColor: stage.color }" />
          <span class="font-medium text-sm">{{ stage.name }}</span>
          <UBadge variant="soft" color="neutral" size="xs">{{ (buckets[stage.id] ?? []).length }}</UBadge>
          <span class="ml-auto text-xs text-muted">{{ money(summary?.byStage?.[stage.id]?.total ?? 0) }}</span>
        </div>
        <VueDraggable
          v-model="buckets[stage.id]"
          group="crm-pipeline"
          :animation="200"
          class="flex flex-col gap-2 min-h-[160px] rounded-lg border border-dashed border-default p-2 bg-elevated/30"
          @add="(e:any) => onDrop(stage, { added: { element: e?.data } })"
          @change="(e:any) => onDrop(stage, e)"
        >
          <div
            v-for="o in buckets[stage.id]"
            :key="o.id"
            class="rounded-md border border-default bg-default p-2.5 cursor-grab hover:border-primary/50 transition-colors"
            @click="openEdit(o)"
          >
            <p class="font-medium text-sm truncate">{{ o.name }}</p>
            <p class="text-xs text-muted truncate">{{ o.company_name || o.person_name || '—' }}</p>
            <p class="text-xs font-medium mt-1">{{ money(o.amount) }}</p>
          </div>
        </VueDraggable>
      </div>
    </div>

    <CrmOpportunitySlideover
      v-model:open="slideoverOpen"
      :client-id="clientId"
      :record="editing"
      :stages="stages"
      @save="onSave"
    />
  </div>
</template>
```

- [ ] **Step 2: OpportunitySlideover.vue**

```vue
<!-- app/components/crm/OpportunitySlideover.vue -->
<script setup lang="ts">
import type { CrmOpportunity, CrmStage } from '~/types/crm'
const props = defineProps<{ open: boolean, clientId: string, record: CrmOpportunity | null, stages: CrmStage[] }>()
const emit = defineEmits<{ 'update:open': [boolean], 'save': [Record<string, unknown>] }>()
const title = computed(() => props.record ? 'Edit opportunity' : 'New opportunity')
</script>
<template>
  <USlideover :open="open" :title="title" @update:open="emit('update:open', $event)">
    <template #body>
      <CrmOpportunityForm
        :client-id="clientId" :record="record" :stages="stages"
        @submit="(b) => emit('save', b)" @cancel="emit('update:open', false)"
      />
    </template>
  </USlideover>
</template>
```

- [ ] **Step 3: OpportunityForm.vue** (name, stage, amount, person, company, close date, notes)

```vue
<!-- app/components/crm/OpportunityForm.vue -->
<!-- frontend-design principles applied: consistent UFormField rhythm, 2-col grid, semantic tokens. -->
<script setup lang="ts">
import type { CrmOpportunity, CrmStage, CrmPerson, CrmCompany } from '~/types/crm'
const props = defineProps<{ clientId: string, record: CrmOpportunity | null, stages: CrmStage[] }>()
const emit = defineEmits<{ submit: [Record<string, unknown>], cancel: [] }>()
const clientId = toRef(props, 'clientId')

const { data: peopleData } = useFetch<{ items: CrmPerson[] }>('/api/crm/people', { query: { client_id: clientId, page_size: '200' } })
const { data: companiesData } = useFetch<{ items: CrmCompany[] }>('/api/crm/companies', { query: { client_id: clientId, page_size: '200' } })
const personItems = computed(() => (peopleData.value?.items ?? []).map(p => ({ label: [p.first_name, p.last_name].filter(Boolean).join(' '), value: p.id })))
const companyItems = computed(() => (companiesData.value?.items ?? []).map(c => ({ label: c.name, value: c.id })))
const stageItems = computed(() => props.stages.map(s => ({ label: s.name, value: s.id })))

const form = reactive({
  name: props.record?.name ?? '',
  stage_id: props.record?.stage_id ?? (props.stages[0]?.id ?? ''),
  amount: props.record?.amount ?? 0,
  person_id: props.record?.person_id ?? null,
  company_id: props.record?.company_id ?? null,
  expected_close_date: props.record?.expected_close_date ?? null,
  notes: props.record?.notes ?? '',
})
const errors = ref<Record<string, string>>({})
const loading = ref(false)
function submit() {
  errors.value = {}
  if (!form.name.trim()) errors.value.name = 'Name is required'
  if (!form.stage_id) errors.value.stage_id = 'Stage is required'
  if (Object.keys(errors.value).length) return
  loading.value = true
  try { emit('submit', { ...form }) } finally { loading.value = false }
}
</script>
<template>
  <form class="space-y-4" @submit.prevent="submit">
    <UFormField label="Name" :error="errors.name" required>
      <UInput v-model="form.name" placeholder="Acme renewal" />
    </UFormField>
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Stage" :error="errors.stage_id" required>
        <USelectMenu v-model="form.stage_id" :items="stageItems" value-key="value" />
      </UFormField>
      <UFormField label="Amount">
        <UInput v-model.number="form.amount" type="number" min="0">
          <template #leading><span class="text-muted">$</span></template>
        </UInput>
      </UFormField>
      <UFormField label="Company">
        <USelectMenu v-model="form.company_id" :items="companyItems" value-key="value" placeholder="—" />
      </UFormField>
      <UFormField label="Contact">
        <USelectMenu v-model="form.person_id" :items="personItems" value-key="value" placeholder="—" />
      </UFormField>
    </div>
    <UFormField label="Notes">
      <UTextarea v-model="form.notes" :rows="4" class="w-full" />
    </UFormField>
    <div class="flex justify-end gap-2 pt-2">
      <UButton type="button" variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton type="submit" :loading="loading">{{ record ? 'Save' : 'Create' }}</UButton>
    </div>
  </form>
</template>
```

> Note: `expected_close_date` uses a plain placeholder here; if a date picker is wanted, use the `UPopover`+`UCalendar` pattern (deferred — not required for Slice 2 acceptance). For now omit the date field from the form UI (kept in the API for later) to honor the "no `<input type=date>`" rule without building the calendar yet.

- [ ] **Step 4: Add Pipeline tab to the CRM page**

In `app/pages/agency/crm/index.vue`: extend `tab` type to `'people' | 'companies' | 'pipeline'`, add `{ label: 'Pipeline', value: 'pipeline', icon: 'i-lucide-trello' }` to `tabItems`, and add `<CrmPipelineBoard v-else-if="tab === 'pipeline'" :client-id="clientId" />` in the template.

- [ ] **Step 5: Manual verify** (dev server): Pipeline tab shows stage columns; add an opportunity; drag a card between columns → persists (reload keeps it); moving to Won/Lost updates status; summary totals update.

- [ ] **Step 6: Typecheck (large heap) + commit**
`NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -E "crm" ` (expect none)
`git add app/components/crm app/pages/agency/crm && git commit -m "feat(crm): pipeline kanban + opportunity form + Pipeline tab"`

---

## Self-Review Notes
- **Spec coverage (Slice 2):** stages + opportunities schema (T1), stage resolution (T2), CRUD + move (T3-T4), pipeline aggregation (T5), kanban DnD (T6,T8), forecasting summary (T5,T8). Activities timeline is Slice 3 (out of scope).
- **Type consistency:** `CrmOpportunity`/`CrmStage`/`CrmPipelineSummary` shared between server returns and `app/types/crm.ts`; move endpoint path `/opportunities/[id]/move` matches composable `move()`.
- **Caveats for execution:** (1) verify `vue-draggable-plus` `@add`/`@change` event payload shape against its installed version — adjust `onDrop` element extraction if needed (the source repo used `evt.added.element`). (2) `buildWhere` emits bare `client_id`/`deleted_at`; the opportunities list aliases them to `o.*` via string replace — confirm the replace matches exactly (`client_id = $1`, `deleted_at IS NULL`). (3) global stages are shared across clients this slice; per-client stage editing is a later seam.

## Out of scope (next)
- Slice 3: Activities + Notes timeline (`crm_activities`), reusing `deal_activities` types.
- Per-client stage customization UI; date picker on opportunity close date; client-portal pipeline view.
