# CRM Slice 3 — Activities + Notes timeline (agency-side) Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Stacked on Slice 2 (branch `feat/crm-slice-3` off `feat/crm-slice-2`).

**Goal:** A polymorphic activity/notes timeline (notes, calls, emails, meetings, tasks) attached to any CRM record (person, company, opportunity), shown inside the record slide-overs.

**Architecture:** Port `deal_activities` → `crm_activities`, generalised to a **polymorphic target** (`target_type` + `target_id`) so one table serves people, companies, and opportunities. Client-scoped. Reuses Slice 1/2 endpoint + composable + Nuxt UI patterns. Timeline component embeds in `RecordSlideover` (person/company) and `OpportunitySlideover` for existing records.

**Tech Stack:** Nuxt 4, Nuxt UI v4, Nitro, Neon, Zod, Vitest, `date-fns` (already a dep) for relative time.

**Reference spec:** `docs/superpowers/specs/2026-05-31-native-crm-twenty-blueprint-design.md` (Slice 3). Migration number: **137** (134/135 = CRM; 136 = email-marketing on another branch).

---

## Conventions
Same as Slices 1-2: `~~/server/utils/...`; parameterized SQL; every read/write filters by `client_id`; run the migration against the DB.

---

### Task 1: Migration — crm_activities

**Files:** Create `server/database/migrations/137-crm-activities.sql`

- [ ] **Step 1: Write**

```sql
-- 137: CRM activities/notes timeline (Slice 3). Stacked on 134/135.
-- Polymorphic: target_type + target_id reference person|company|opportunity.
CREATE TABLE IF NOT EXISTS crm_activities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('person','company','opportunity')),
  target_id    UUID NOT NULL,
  type         TEXT NOT NULL DEFAULT 'note'
               CHECK (type IN ('note','call','email','meeting','task','stage_change','system')),
  title        TEXT NOT NULL,
  body         TEXT,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_target
  ON crm_activities (client_id, target_type, target_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_activities_open_tasks
  ON crm_activities (client_id, is_completed) WHERE type = 'task' AND deleted_at IS NULL;
```

- [ ] **Step 2: Run** `export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-) && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/137-crm-activities.sql`
- [ ] **Step 3: Verify** `psql "$DATABASE_URL" -c "\d crm_activities"` shows the table.
- [ ] **Step 4: Commit** `git add server/database/migrations/137-crm-activities.sql && git commit -m "feat(crm): activities timeline schema (Slice 3)"`

---

### Task 2: Activity endpoints

**Files:** Create `server/api/crm/activities/index.get.ts`, `index.post.ts`, `[id].patch.ts`, `[id].delete.ts`

- [ ] **Step 1: list** (by target, client-scoped, newest first)

```typescript
// server/api/crm/activities/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
const Query = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['person', 'company', 'opportunity']),
  target_id: z.string().uuid(),
})
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const items = await queryRows(
    `SELECT * FROM crm_activities
      WHERE client_id = $1 AND target_type = $2 AND target_id = $3 AND deleted_at IS NULL
      ORDER BY COALESCE(scheduled_at, created_at) DESC, created_at DESC`,
    [q.client_id, q.target_type, q.target_id],
  )
  return { items }
})
```

- [ ] **Step 2: create**

```typescript
// server/api/crm/activities/index.post.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
const Body = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['person', 'company', 'opportunity']),
  target_id: z.string().uuid(),
  type: z.enum(['note', 'call', 'email', 'meeting', 'task', 'stage_change', 'system']).default('note'),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
  scheduled_at: z.string().nullable().optional(),
})
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const row = await queryOne(
    `INSERT INTO crm_activities (client_id, target_type, target_id, type, title, body, scheduled_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.client_id, b.target_type, b.target_id, b.type, b.title, b.body ?? null, b.scheduled_at ?? null, user.id],
  )
  return { item: row }
})
```

- [ ] **Step 3: patch** (edit title/body, toggle task complete)

```typescript
// server/api/crm/activities/[id].patch.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
const Body = z.object({
  client_id: z.string().uuid(),
  title: z.string().min(1).optional(),
  body: z.string().nullable().optional(),
  is_completed: z.boolean().optional(),
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
  if (b.title !== undefined) set('title', b.title)
  if (b.body !== undefined) set('body', b.body)
  if (b.is_completed !== undefined) {
    set('is_completed', b.is_completed)
    sets.push(`completed_at = ${b.is_completed ? 'NOW()' : 'NULL'}`)
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')
  params.push(id); const idIdx = params.length
  params.push(b.client_id); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_activities SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`, params)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
  return { item: row }
})
```

- [ ] **Step 4: delete (soft)**

```typescript
// server/api/crm/activities/[id].delete.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'
const Query = z.object({ client_id: z.string().uuid() })
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const n = await execute(`UPDATE crm_activities SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`, [id, client_id])
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
  return { ok: true }
})
```

- [ ] **Step 5: Verify (DB rolled-back tx) + Commit** `git add server/api/crm/activities && git commit -m "feat(crm): activity timeline endpoints (list/create/patch/delete)"`

---

### Task 3: Types + composable

**Files:** Append to `app/types/crm.ts`; Create `app/composables/useCrmActivities.ts`

- [ ] **Step 1: Append type**

```typescript
// append to app/types/crm.ts
export interface CrmActivity {
  id: string; client_id: string; target_type: 'person' | 'company' | 'opportunity'; target_id: string
  type: 'note' | 'call' | 'email' | 'meeting' | 'task' | 'stage_change' | 'system'
  title: string; body: string | null; scheduled_at: string | null; completed_at: string | null
  is_completed: boolean; metadata: Record<string, unknown>; created_by: string | null
  created_at: string; updated_at: string
}
```

- [ ] **Step 2: composable**

```typescript
// app/composables/useCrmActivities.ts
import type { CrmActivity } from '~/types/crm'
export function useCrmActivities(clientId: Ref<string | null>, targetType: 'person' | 'company' | 'opportunity', targetId: Ref<string | null>) {
  const query = computed(() => ({ client_id: clientId.value ?? '', target_type: targetType, target_id: targetId.value ?? '' }))
  const enabled = computed(() => !!clientId.value && !!targetId.value)
  const { data, pending, refresh } = useFetch<{ items: CrmActivity[] }>('/api/crm/activities', {
    query, watch: [query], immediate: false, default: () => ({ items: [] }),
  })
  watch(enabled, (v) => { if (v) refresh() }, { immediate: true })
  async function create(body: Partial<CrmActivity>) {
    await $fetch('/api/crm/activities', { method: 'POST', body: { ...body, client_id: clientId.value, target_type: targetType, target_id: targetId.value } })
    await refresh()
  }
  async function toggle(id: string, is_completed: boolean) {
    await $fetch(`/api/crm/activities/${id}`, { method: 'PATCH', body: { client_id: clientId.value, is_completed } })
    await refresh()
  }
  async function remove(id: string) {
    await $fetch(`/api/crm/activities/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { activities: computed(() => data.value?.items ?? []), pending, refresh, create, toggle, remove }
}
```

- [ ] **Step 3: Commit** `git add app/types/crm.ts app/composables/useCrmActivities.ts && git commit -m "feat(crm): activity type + composable"`

---

### Task 4: ActivityTimeline component + wire into slide-overs

**Files:** Create `app/components/crm/ActivityTimeline.vue`; Modify `app/components/crm/RecordSlideover.vue` and `OpportunitySlideover.vue`

> Invoke frontend-design principles (consistency with the dashboard system) for the inline add form.

- [ ] **Step 1: ActivityTimeline.vue**

```vue
<!-- app/components/crm/ActivityTimeline.vue -->
<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { CrmActivity } from '~/types/crm'
const props = defineProps<{ clientId: string, targetType: 'person' | 'company' | 'opportunity', targetId: string }>()
const clientId = toRef(props, 'clientId')
const targetId = toRef(props, 'targetId')
const { activities, pending, create, toggle, remove } = useCrmActivities(clientId, props.targetType, targetId)
const toast = useToast()

const TYPES = [
  { value: 'note', label: 'Note', icon: 'i-lucide-sticky-note' },
  { value: 'call', label: 'Call', icon: 'i-lucide-phone' },
  { value: 'email', label: 'Email', icon: 'i-lucide-mail' },
  { value: 'meeting', label: 'Meeting', icon: 'i-lucide-users' },
  { value: 'task', label: 'Task', icon: 'i-lucide-check-square' },
]
function iconFor(t: string) { return TYPES.find(x => x.value === t)?.icon ?? 'i-lucide-circle' }
function rel(a: CrmActivity) {
  const d = a.scheduled_at || a.created_at
  try { return formatDistanceToNow(new Date(d), { addSuffix: true }) } catch { return '' }
}

const draft = reactive({ type: 'note', title: '' })
const saving = ref(false)
async function add() {
  if (!draft.title.trim()) return
  saving.value = true
  try {
    await create({ type: draft.type as CrmActivity['type'], title: draft.title })
    draft.title = ''
  } catch (e: any) {
    toast.add({ title: 'Could not add activity', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <USelectMenu v-model="draft.type" :items="TYPES" value-key="value" class="w-32" />
      <UInput v-model="draft.title" placeholder="Log a note, call, task…" class="flex-1" @keyup.enter="add" />
      <UButton :loading="saving" :disabled="!draft.title.trim()" icon="i-lucide-plus" @click="add" />
    </div>

    <div v-if="pending" class="text-xs text-muted">Loading…</div>
    <ul v-else-if="activities.length" class="space-y-2">
      <li v-for="a in activities" :key="a.id" class="flex items-start gap-2.5 group">
        <UIcon :name="iconFor(a.type)" class="size-4 mt-0.5 text-muted shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="text-sm" :class="{ 'line-through text-muted': a.is_completed }">{{ a.title }}</p>
          <p v-if="a.body" class="text-xs text-muted">{{ a.body }}</p>
          <p class="text-xs text-muted/70">{{ rel(a) }}</p>
        </div>
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <UButton
            v-if="a.type === 'task'"
            :icon="a.is_completed ? 'i-lucide-rotate-ccw' : 'i-lucide-check'"
            size="xs" variant="ghost" color="neutral"
            @click="toggle(a.id, !a.is_completed)"
          />
          <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="remove(a.id)" />
        </div>
      </li>
    </ul>
    <p v-else class="text-xs text-muted">No activity yet.</p>
  </div>
</template>
```

- [ ] **Step 2: RecordSlideover** — add timeline below the form for existing records

In `app/components/crm/RecordSlideover.vue` `#body`, after `<CrmRecordForm .../>`, add:
```vue
      <template v-if="record?.id">
        <USeparator class="my-4" />
        <h3 class="text-sm font-medium text-muted mb-3">Activity</h3>
        <CrmActivityTimeline :client-id="clientId" :target-type="objectType" :target-id="record.id" />
      </template>
```

- [ ] **Step 3: OpportunitySlideover** — same, with `target-type="opportunity"`

In `app/components/crm/OpportunitySlideover.vue` `#body`, after `<CrmOpportunityForm .../>`, add:
```vue
      <template v-if="record?.id">
        <USeparator class="my-4" />
        <h3 class="text-sm font-medium text-muted mb-3">Activity</h3>
        <CrmActivityTimeline :client-id="clientId" target-type="opportunity" :target-id="record.id" />
      </template>
```

- [ ] **Step 4: Typecheck (large heap) + manual verify + Commit**
`NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -i crm` (expect none)
Manual: open a person/company/opportunity → Activity section logs notes/tasks; task complete toggles; delete works.
`git add app/components/crm && git commit -m "feat(crm): activity timeline component wired into record slide-overs"`

---

## Self-Review Notes
- **Spec coverage (Slice 3):** polymorphic activities schema (T1), CRUD (T2), composable (T3), timeline UI in all three record types (T4).
- **Type consistency:** `CrmActivity` shared; composable params (`targetType`, `targetId`) match component props; endpoints scope by `client_id`.
- **Caveats:** (1) `target_id` has no cross-table FK (polymorphic) — integrity is app-enforced; acceptable. (2) timeline only shows for existing records (needs an id). (3) auto-import name `CrmActivityTimeline`.

## Out of scope (next)
- Activity reminders via the existing notifications system; @mentions; attachments. Client-portal timeline. Per-client stage UI.
