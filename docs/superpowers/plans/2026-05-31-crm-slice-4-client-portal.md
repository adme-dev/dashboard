# CRM Slice 4 — Client-portal CRM surface Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Stacked on Slice 3 (branch `feat/crm-slice-4` off `feat/crm-slice-3`).

**Goal:** Let a logged-in client manage *their own* CRM (People, Companies, Pipeline, Activities) inside the client portal — turning the agency-only tool into CRM-as-a-service.

**Architecture:** Reuse the agency CRM components unchanged via **`provide/inject`** of an API base. Composables read `inject('crmApiBase', '/api/crm')`; the portal page provides `/api/client-portal/crm`. New portal endpoints mirror the agency ones but use `requireClientAuth` and **derive `client_id` from the session (`client.clientId`), never from the request** — so a client can only ever touch their own data. No new migration (reuses Slices 1–3 tables).

**Tech Stack:** Nuxt 4, Nuxt UI v4, Nitro, Neon, Zod. Portal auth: `requireClientAuth` (`~~/server/utils/clientAuth`, returns `ServerClientUser` w/ `.clientId`); client-side `usePortalAuth().user.value.clientId`. Portal pages: `layout: 'portal'`, `middleware: 'portal-auth'`.

**Security invariant:** every portal endpoint sets `const client = await requireClientAuth(event)` and uses `client.clientId` for ALL scoping; any `client_id` in the query/body is ignored. Writes also confirm the row belongs to the session client (WHERE client_id = session). Custom-field schema is **read-only** in the portal (agency owns it).

---

## Task 1: Composable `apiBase` via inject

**Files:** Modify `app/composables/useCrm{Companies,People,CustomFields,Opportunities,Stages,Pipeline,Activities}.ts` and `app/components/crm/OpportunityForm.vue`.

- [ ] In each composable, add at the top of the function body: `const base = inject<string>('crmApiBase', '/api/crm')` and replace every literal `'/api/crm/...'` URL with a template using `base` (e.g. `` `${base}/people` ``, `` `${base}/people/${id}` ``). Defaults preserve agency behavior.
- [ ] In `OpportunityForm.vue` (which fetches `/api/crm/people` + `/api/crm/companies` directly), add `const base = inject<string>('crmApiBase', '/api/crm')` and use `` `${base}/people` `` / `` `${base}/companies` ``.
- [ ] Verify: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -i crm` → none; `pnpm exec vitest run test/crm/` → 13/13.
- [ ] Commit: `git commit -m "refactor(crm): composables read injected crmApiBase (default /api/crm)"`

## Task 2: Portal endpoints — people + companies

**Files:** Create under `server/api/client-portal/crm/people/` and `.../companies/`: `index.get.ts`, `index.post.ts`, `[id].patch.ts`, `[id].delete.ts` (8 files). (No `[id].get` — the UI edits from the list row.)

Pattern (people index.get shown; mirror agency `server/api/crm/people/*` but session-scoped):

```typescript
// server/api/client-portal/crm/people/index.get.ts
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows, queryCount } from '~~/server/utils/db'
import { buildWhere, type Cond } from '~~/server/utils/crm/queryScope'

const Query = z.object({
  company_id: z.string().uuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  const conds: Cond[] = []
  if (q.company_id) conds.push({ sql: 'company_id = ?', params: [q.company_id] })
  if (q.q) {
    const safe = q.q.replace(/[%_]/g, c => '\\' + c)
    const like = `%${safe}%`
    conds.push({ sql: '(first_name ILIKE ? OR last_name ILIKE ? OR email ILIKE ?)', params: [like, like, like] })
  }
  const { where, params } = buildWhere(client.clientId, conds)
  const offset = (q.page - 1) * q.page_size
  const items = await queryRows(`SELECT * FROM crm_people ${where} ORDER BY last_name NULLS LAST, first_name LIMIT ${q.page_size} OFFSET ${offset}`, params)
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM crm_people ${where}`, params)
  return { items, total, page: q.page, page_size: q.page_size }
})
```

Transformation rule for the other 7 (and all later portal endpoints): copy the agency file, then (a) `requireAuth`→`requireClientAuth` from `~~/server/utils/clientAuth`; (b) drop `client_id` from the Zod schema; (c) replace every `b.client_id`/`q.client_id`/the `client_id` query param with `client.clientId`; (d) keep `requireWriteAccess`? — NO (that's agency RBAC). Portal writes are allowed for any authenticated client user (the cookie itself is the gate). So omit `requireWriteAccess`. (e) custom-field validation: keep (reads defs by `client.clientId`).

- [ ] Verify each via DB rolled-back tx; Commit `feat(crm): portal people + companies endpoints (session-scoped)`

## Task 3: Portal endpoints — opportunities + stages + pipeline

**Files:** Create `server/api/client-portal/crm/opportunities/{index.get,index.post,[id].patch,[id].delete,[id]/move.patch}.ts`, `.../stages/index.get.ts`, `.../pipeline.get.ts` (7 files). Mirror agency, session-scoped per the rule. The opportunities list keeps the `o.`-aliased join; `stages` uses `resolveStages(globals, clientStages-for-client.clientId)`; `move`/`create` validate stage with `(client_id IS NULL OR client_id = $sessionClient)`.

- [ ] Verify + Commit `feat(crm): portal opportunities + stages + pipeline endpoints`

## Task 4: Portal endpoints — activities + custom-fields(read)

**Files:** Create `server/api/client-portal/crm/activities/{index.get,index.post,[id].patch,[id].delete}.ts` and `.../custom-fields/index.get.ts` (5 files). Mirror agency activities; custom-fields is **list only** (read-only schema).

- [ ] Verify + Commit `feat(crm): portal activities + read-only custom-fields endpoints`

## Task 5: Portal page

**Files:** Create `app/pages/portal/crm.vue`

```vue
<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })
useHead({ title: 'CRM — Client Portal' })
// Provide the portal API base so all CRM composables target the session-scoped endpoints.
provide('crmApiBase', '/api/client-portal/crm')
const { user } = usePortalAuth()
const clientId = computed(() => user.value?.clientId ?? null)
const tab = ref<'people' | 'companies' | 'pipeline'>('people')
const tabItems = [
  { label: 'People', value: 'people', icon: 'i-lucide-users' },
  { label: 'Companies', value: 'companies', icon: 'i-lucide-building-2' },
  { label: 'Pipeline', value: 'pipeline', icon: 'i-lucide-trello' },
]
</script>
<template>
  <div class="p-6 space-y-5">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">CRM</h1>
      <p class="text-sm text-muted mt-0.5">Manage your contacts, companies and pipeline.</p>
    </div>
    <UTabs v-model="tab" :items="tabItems" class="w-full" />
    <template v-if="clientId">
      <CrmPeopleTable v-if="tab === 'people'" :client-id="clientId" />
      <CrmCompaniesTable v-else-if="tab === 'companies'" :client-id="clientId" />
      <CrmPipelineBoard v-else :client-id="clientId" />
    </template>
  </div>
</template>
```

> The components still receive `:client-id` (used to build queries) but portal endpoints IGNORE it and use the session — defense in depth. The `provide` must be in a parent of the components; since the components are rendered in this page's template, `provide` here covers them and their children (slide-overs, forms, timeline).

- [ ] Add a CRM link to the portal nav (find it: `grep -rn "portal" app/layouts/portal.vue` for the nav items; add `{ label: 'CRM', icon: 'i-lucide-contact', to: '/portal/crm' }`).
- [ ] Verify (typecheck) + Commit `feat(crm): client-portal CRM page + nav`

## Task 6: Security verification

- [ ] Confirm EVERY file under `server/api/client-portal/crm/**` calls `requireClientAuth` and uses `client.clientId` (grep: no `requireAuth(` without `Client`; no trust of request `client_id`).
- [ ] DB check: as client A, attempt to read/patch a row owned by client B (by id) → 404 (WHERE client_id = session excludes it).
- [ ] Commit any fixes.

---

## Self-Review Notes
- **Reuse:** agency components unchanged; only composables (inject) + portal endpoints + portal page added. Prior PRs untouched.
- **Security:** session-derived `client_id` everywhere; request `client_id` ignored; no `requireWriteAccess` (that's agency RBAC) but the portal cookie is the gate; custom-field schema read-only.
- **Caveats:** (1) `provide`/`inject` key string `'crmApiBase'` must match exactly. (2) portal endpoints duplicate agency SQL (acceptable; keeps shipped code untouched). (3) no portal CSV import / custom-field editing this slice.

## Out of scope (next)
- Portal CSV import; client-managed custom fields; per-client pipeline stages; activity reminders.
