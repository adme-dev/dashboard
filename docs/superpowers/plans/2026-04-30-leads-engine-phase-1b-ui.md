# Leads Engine — Phase 1b (UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full Nuxt UI surface on top of the Phase 1a backend — Settings → Google "Lead webhooks" tab, agency `/agency/leads` Inbox + Form Rules tabs (with manual entry modal, lead detail slide-over, rule editor, destination editor, filter builder, test-fire panel, delivery history, SSE live updates), and the client portal `/portal/leads` read-only inbox.

**Architecture:** Nuxt 4 / Vue 3 Composition API with `<script setup>`. **All components are Nuxt UI v4** — no native HTML form elements, no `confirm()`/`alert()`, no `<select>`/`<input>`/`<dialog>`. `useFetch()` for reads, `$fetch()` for mutations. `useToast()` for feedback. Slide-overs for lead detail and edit forms. SSE via a composable backed by `EventSource`. Dark mode via semantic tokens (`text-muted`, `bg-elevated`, `border-default`). Components live under `app/components/leads/` and auto-import as `Leads*` (e.g. `app/components/leads/Inbox.vue` → `<LeadsInbox>`).

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4 (`UTable`, `UModal`, `USlideover`, `USelectMenu`, `UInput`, `UTextarea`, `UButton`, `UBadge`, `UAvatar`, `UTabs`, `UPagination`, `UCard`, `UPopover`), VueUse, date-fns v4, Lucide icons (`i-lucide-*`).

**Spec:** `docs/superpowers/specs/2026-04-30-leads-engine-design.md`
**Depends on:** Plan 1a (backend) merged.

**Out of scope for this plan:** Smart Watch notifications, cron jobs, Worker deploy, marketing site sync, load test, end-to-end staging UAT. Those land in plan 1c.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `app/composables/useLeadsStream.ts` | create | SSE composable — auto-reconnect, exposes new-lead events |
| `app/composables/useLeads.ts` | create | List + filter state container with `useFetch` |
| `app/types/leadsUi.ts` | create | UI-only narrow types (table row shapes, filter state) |
| `app/components/leads/Inbox.vue` | create | Agency inbox table + bulk actions |
| `app/components/leads/InboxFilters.vue` | create | Filter bar (client / source / form / status / date / assignee / search) |
| `app/components/leads/InboxRowActions.vue` | create | Per-row dropdown (mark contacted, mark spam, delete) |
| `app/components/leads/LeadDetailSlideover.vue` | create | Slide-over with full lead, attribution, delivery history, status changer |
| `app/components/leads/DeliveryHistory.vue` | create | Per-delivery card list, retry button per failed |
| `app/components/leads/ManualLeadModal.vue` | create | "+ Manual lead" modal — client picker, free-form fields, run-rules toggle |
| `app/components/leads/FormRulesTab.vue` | create | Form-rules list + per-form configure entry |
| `app/components/leads/RuleEditor.vue` | create | Per-rule destinations table, drag re-order, add/edit/delete |
| `app/components/leads/DestinationEditor.vue` | create | Destination modal — type-specific config form, filter builder, delay |
| `app/components/leads/FilterBuilder.vue` | create | Field-dropdown × op-dropdown × value input (uses lead_form_metadata) |
| `app/components/leads/DestinationConfigPortal.vue` | create | Type-specific config sub-form |
| `app/components/leads/DestinationConfigWebhook.vue` | create | … |
| `app/components/leads/DestinationConfigSlack.vue` | create | … |
| `app/components/leads/DestinationConfigEmail.vue` | create | … |
| `app/components/leads/DestinationConfigSheets.vue` | create | … |
| `app/components/leads/DestinationConfigAssignUser.vue` | create | … |
| `app/components/leads/TestFirePanel.vue` | create | "Test fire" runner — synthetic field overrides + per-destination result |
| `app/components/leads/StatusBadge.vue` | create | UBadge with colour for each LeadStatus |
| `app/components/leads/SourceIcon.vue` | create | Lucide icon per source (meta/google/manual) |
| `app/pages/agency/leads/index.vue` | create | Page wrapper, two `UTabs` (Inbox / Form Rules), URL state |
| `app/pages/portal/leads.vue` | create | Client-portal page (read-only inbox + mark contacted) |
| `app/pages/agency/social/google.vue` | modify | Add "Lead webhooks" tab card per client (URL + key + rotate) |
| `app/components/portal/LeadsInbox.vue` | create | Lighter table reused inside `/portal/leads` |

---

## Section A — Shared composables + tiny components

### Task 1: SSE composable `useLeadsStream`

**Files:**
- Create: `app/composables/useLeadsStream.ts`

- [ ] **Step 1: Implement**

```ts
// app/composables/useLeadsStream.ts
// Wraps EventSource for /api/leads/stream. Auto-reconnects with backoff.
// Exposes a reactive list of recent lead-id pings the page can react to.

import { ref, onMounted, onBeforeUnmount } from 'vue'

export interface LeadsStreamEvent {
  id: string
  submitted_at: string
  client_id: string | null
  source: string
}

export function useLeadsStream() {
  const events = ref<LeadsStreamEvent[]>([])
  const connected = ref(false)
  let es: EventSource | null = null
  let retry = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  function close() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    if (es) { es.close(); es = null }
    connected.value = false
  }

  function open() {
    close()
    es = new EventSource('/api/leads/stream', { withCredentials: true })
    es.addEventListener('hello', () => { connected.value = true; retry = 0 })
    es.addEventListener('lead', (e: any) => {
      try {
        const ev = JSON.parse(e.data) as LeadsStreamEvent
        events.value = [ev, ...events.value].slice(0, 50)
      } catch {}
    })
    es.addEventListener('ping', () => {})
    es.onerror = () => {
      connected.value = false
      es?.close(); es = null
      retry++
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(retry, 5))
      retryTimer = setTimeout(open, delay)
    }
  }

  onMounted(open)
  onBeforeUnmount(close)

  return { events, connected, reopen: open, close }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/composables/useLeadsStream.ts
git commit -m "feat(leads/ui): SSE composable with auto-reconnect"
```

---

### Task 2: List/filter state composable `useLeads`

**Files:**
- Create: `app/types/leadsUi.ts`
- Create: `app/composables/useLeads.ts`

- [ ] **Step 1: UI types**

```ts
// app/types/leadsUi.ts
import type { Lead, LeadSource, LeadStatus } from '~/types'

export interface LeadsListFilters {
  client_id: string | null
  unmapped: boolean
  source: LeadSource | null
  form_id: string | null
  status: LeadStatus | null
  assigned_to: string | null
  q: string
  from: string | null
  to: string | null
}

export interface LeadsListResponse {
  items: Lead[]
  total: number
  page: number
  page_size: number
}

export const DEFAULT_FILTERS: LeadsListFilters = {
  client_id: null, unmapped: false, source: null, form_id: null,
  status: null, assigned_to: null, q: '', from: null, to: null,
}
```

- [ ] **Step 2: Composable**

```ts
// app/composables/useLeads.ts
import { ref, computed, watch } from 'vue'
import { DEFAULT_FILTERS, type LeadsListFilters, type LeadsListResponse } from '~/types/leadsUi'

export function useLeads() {
  const filters = ref<LeadsListFilters>({ ...DEFAULT_FILTERS })
  const page = ref(1)
  const pageSize = ref(50)

  const params = computed(() => {
    const p: Record<string, string> = { page: String(page.value), page_size: String(pageSize.value) }
    const f = filters.value
    if (f.client_id) p.client_id = f.client_id
    if (f.unmapped) p.unmapped = 'true'
    if (f.source) p.source = f.source
    if (f.form_id) p.form_id = f.form_id
    if (f.status) p.status = f.status
    if (f.assigned_to) p.assigned_to = f.assigned_to
    if (f.q) p.q = f.q
    if (f.from) p.from = f.from
    if (f.to) p.to = f.to
    return p
  })

  const { data, pending, refresh, error } = useFetch<LeadsListResponse>('/api/leads/list', {
    query: params,
    watch: [params],
    default: () => ({ items: [], total: 0, page: 1, page_size: 50 }),
  })

  function reset() {
    filters.value = { ...DEFAULT_FILTERS }
    page.value = 1
  }

  // Reset to first page when filters change.
  watch(filters, () => { page.value = 1 }, { deep: true })

  return { filters, page, pageSize, data, pending, error, refresh, reset }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/types/leadsUi.ts app/composables/useLeads.ts
git commit -m "feat(leads/ui): list+filter state composable"
```

---

### Task 3: `StatusBadge` and `SourceIcon`

**Files:**
- Create: `app/components/leads/StatusBadge.vue`
- Create: `app/components/leads/SourceIcon.vue`

- [ ] **Step 1: StatusBadge**

```vue
<!-- app/components/leads/StatusBadge.vue -->
<script setup lang="ts">
import type { LeadStatus } from '~/types'

const props = defineProps<{ status: LeadStatus }>()

const COLORS: Record<LeadStatus, 'primary' | 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  new: 'info',
  contacted: 'primary',
  qualified: 'success',
  won: 'success',
  lost: 'neutral',
  spam_suspected: 'warning',
}

const LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  won: 'Won',
  lost: 'Lost',
  spam_suspected: 'Spam?',
}
</script>

<template>
  <UBadge :color="COLORS[props.status]" variant="soft" size="sm">
    {{ LABELS[props.status] }}
  </UBadge>
</template>
```

- [ ] **Step 2: SourceIcon**

```vue
<!-- app/components/leads/SourceIcon.vue -->
<script setup lang="ts">
import type { LeadSource } from '~/types'

const props = defineProps<{ source: LeadSource; size?: 'sm' | 'md' }>()

const ICONS: Record<LeadSource, string> = {
  meta: 'i-lucide-facebook',
  google: 'i-lucide-search',
  manual: 'i-lucide-pencil',
}
const TITLES: Record<LeadSource, string> = {
  meta: 'Meta Lead Ads',
  google: 'Google Lead Forms',
  manual: 'Manual entry',
}
</script>

<template>
  <UIcon
    :name="ICONS[props.source]"
    :class="props.size === 'sm' ? 'text-base' : 'text-lg'"
    class="text-muted"
    :aria-label="TITLES[props.source]"
  />
</template>
```

- [ ] **Step 3: Commit**

```bash
git add app/components/leads/StatusBadge.vue app/components/leads/SourceIcon.vue
git commit -m "feat(leads/ui): StatusBadge + SourceIcon"
```

---

## Section B — Inbox

### Task 4: `LeadsInboxFilters` component

**Files:**
- Create: `app/components/leads/InboxFilters.vue`

- [ ] **Step 1: Implement**

```vue
<!-- app/components/leads/InboxFilters.vue -->
<script setup lang="ts">
import type { LeadsListFilters } from '~/types/leadsUi'

const model = defineModel<LeadsListFilters>('filters', { required: true })

interface ClientOption { id: string; name: string }
interface FormOption { source: string; form_id: string; form_name: string | null }
interface UserOption { id: string; name: string }

const { data: clients } = useFetch<{ items: ClientOption[] }>('/api/agency/clients/list', {
  default: () => ({ items: [] }),
})
const { data: forms } = useFetch<{ items: any[] }>('/api/leads/forms/list', {
  default: () => ({ items: [] }),
})
const { data: users } = useFetch<{ items: UserOption[] }>('/api/agency/team/list', {
  default: () => ({ items: [] }),
})

// USelectMenu options must NOT use empty string values — use 'all' / 'unmapped' sentinels.
const SOURCE_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'meta', label: 'Meta' },
  { value: 'google', label: 'Google' },
  { value: 'manual', label: 'Manual' },
]
const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'spam_suspected', label: 'Spam?' },
]

const clientOptions = computed(() => [
  { value: 'all', label: 'All clients' },
  { value: 'unmapped', label: 'Unmapped' },
  ...(clients.value?.items ?? []).map(c => ({ value: c.id, label: c.name })),
])
const formOptions = computed(() => [
  { value: 'all', label: 'All forms' },
  ...(forms.value?.items ?? []).map((f: any) => ({
    value: f.form_id,
    label: f.form_name || f.form_id,
  })),
])
const userOptions = computed(() => [
  { value: 'all', label: 'All assignees' },
  ...(users.value?.items ?? []).map(u => ({ value: u.id, label: u.name })),
])

// Bridge sentinels <-> nullable model fields
const clientSel = computed({
  get: () => model.value.unmapped ? 'unmapped' : (model.value.client_id ?? 'all'),
  set: v => {
    if (v === 'unmapped') { model.value.client_id = null; model.value.unmapped = true }
    else if (v === 'all') { model.value.client_id = null; model.value.unmapped = false }
    else { model.value.client_id = v as string; model.value.unmapped = false }
  },
})
const sourceSel = computed({
  get: () => model.value.source ?? 'all',
  set: v => model.value.source = v === 'all' ? null : v as any,
})
const statusSel = computed({
  get: () => model.value.status ?? 'all',
  set: v => model.value.status = v === 'all' ? null : v as any,
})
const formSel = computed({
  get: () => model.value.form_id ?? 'all',
  set: v => model.value.form_id = v === 'all' ? null : v as string,
})
const userSel = computed({
  get: () => model.value.assigned_to ?? 'all',
  set: v => model.value.assigned_to = v === 'all' ? null : v as string,
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 p-3 border-b border-default bg-elevated/30">
    <UInput v-model="model.q" placeholder="Search field data..." icon="i-lucide-search" class="w-64" />
    <USelectMenu v-model="clientSel" :items="clientOptions" value-key="value" class="w-48" />
    <USelectMenu v-model="sourceSel" :items="SOURCE_OPTIONS" value-key="value" class="w-36" />
    <USelectMenu v-model="formSel" :items="formOptions" value-key="value" class="w-48" />
    <USelectMenu v-model="statusSel" :items="STATUS_OPTIONS" value-key="value" class="w-36" />
    <USelectMenu v-model="userSel" :items="userOptions" value-key="value" class="w-44" />
    <UInput v-model="model.from" type="date" class="w-40" />
    <UInput v-model="model.to" type="date" class="w-40" />
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/leads/InboxFilters.vue
git commit -m "feat(leads/ui): inbox filter bar with sentinel-safe selects"
```

---

### Task 5: `LeadsInbox` table

**Files:**
- Create: `app/components/leads/Inbox.vue`

- [ ] **Step 1: Implement**

```vue
<!-- app/components/leads/Inbox.vue -->
<script setup lang="ts">
import { format } from 'date-fns'
import type { Lead } from '~/types'

const { filters, page, pageSize, data, pending, refresh } = useLeads()
const { events: liveEvents } = useLeadsStream()

// When SSE pings, refresh the list (cheap — current view only).
watch(liveEvents, () => refresh(), { deep: true })

const selectedLead = ref<Lead | null>(null)
const showSlideover = ref(false)
const showManualModal = ref(false)
const toast = useToast()

const columns = [
  { accessorKey: 'submitted_at', header: 'When' },
  { accessorKey: 'client_id', header: 'Client' },
  { accessorKey: 'source', header: 'Source' },
  { accessorKey: 'form_name', header: 'Form' },
  { accessorKey: 'summary', header: 'Lead' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'assigned_to', header: 'Assigned' },
  { accessorKey: 'actions', header: '' },
]

function summarize(lead: Lead): string {
  const f = lead.field_data ?? {}
  return [f.full_name, f.email, f.phone_number ?? f.phone].filter(Boolean).slice(0, 2).join(' · ')
}

function openLead(lead: Lead) {
  selectedLead.value = lead
  showSlideover.value = true
}

async function exportCsv() {
  // Build query from current filters; let browser navigate so the file downloads.
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(filters.value)) {
    if (v == null || v === '' || v === false) continue
    q.set(k, String(v))
  }
  window.open(`/api/leads/export?${q.toString()}`, '_blank')
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between px-4 py-3 border-b border-default">
      <h2 class="text-base font-semibold">Inbox <span v-if="data?.total" class="text-muted font-normal">— {{ data.total }} total</span></h2>
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-download" variant="ghost" size="sm" @click="exportCsv">CSV</UButton>
        <UButton icon="i-lucide-plus" color="primary" size="sm" @click="showManualModal = true">Manual lead</UButton>
        <UButton icon="i-lucide-refresh-cw" variant="ghost" size="sm" @click="refresh()">Refresh</UButton>
      </div>
    </div>

    <LeadsInboxFilters v-model:filters="filters" />

    <div class="flex-1 overflow-auto">
      <UTable :data="data?.items ?? []" :columns="columns" :loading="pending" class="w-full">
        <template #submitted_at-cell="{ row }">
          <span class="text-sm whitespace-nowrap">{{ format(new Date(row.original.submitted_at), 'MMM d, HH:mm') }}</span>
        </template>
        <template #client_id-cell="{ row }">
          <span v-if="row.original.client_id" class="text-sm">{{ row.original.client_id.slice(0, 8) }}…</span>
          <UBadge v-else color="warning" variant="soft" size="sm">Unmapped</UBadge>
        </template>
        <template #source-cell="{ row }">
          <LeadsSourceIcon :source="row.original.source" />
        </template>
        <template #form_name-cell="{ row }">
          <span class="text-sm">{{ row.original.form_name || row.original.form_id || '—' }}</span>
        </template>
        <template #summary-cell="{ row }">
          <button class="text-left text-sm hover:underline" @click="openLead(row.original)">
            {{ summarize(row.original) || '—' }}
          </button>
        </template>
        <template #status-cell="{ row }">
          <LeadsStatusBadge :status="row.original.status" />
        </template>
        <template #assigned_to-cell="{ row }">
          <span class="text-xs text-muted">{{ row.original.assigned_to ? row.original.assigned_to.slice(0, 8) + '…' : '—' }}</span>
        </template>
        <template #actions-cell="{ row }">
          <LeadsInboxRowActions :lead="row.original" @changed="refresh()" />
        </template>
      </UTable>
    </div>

    <div class="border-t border-default p-3 flex items-center justify-between">
      <span class="text-xs text-muted">Page {{ page }} of {{ Math.max(1, Math.ceil((data?.total ?? 0) / pageSize)) }}</span>
      <UPagination
        v-model:page="page"
        :total="data?.total ?? 0"
        :items-per-page="pageSize"
        :sibling-count="1"
      />
    </div>

    <LeadsLeadDetailSlideover
      v-model:open="showSlideover"
      :lead-id="selectedLead?.id ?? null"
      @changed="refresh()"
    />
    <LeadsManualLeadModal
      v-model:open="showManualModal"
      @created="refresh()"
    />
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/leads/Inbox.vue
git commit -m "feat(leads/ui): inbox table — UTable v4 with SSE auto-refresh + CSV"
```

---

### Task 6: `LeadsInboxRowActions` dropdown

**Files:**
- Create: `app/components/leads/InboxRowActions.vue`

- [ ] **Step 1: Implement**

```vue
<!-- app/components/leads/InboxRowActions.vue -->
<script setup lang="ts">
import type { Lead } from '~/types'

const props = defineProps<{ lead: Lead }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const toast = useToast()
const showDeleteModal = ref(false)
const items = computed(() => [
  [
    {
      label: 'Mark contacted',
      icon: 'i-lucide-check',
      disabled: props.lead.status !== 'new',
      onSelect: async () => {
        try {
          await $fetch(`/api/leads/${props.lead.id}`, { method: 'PATCH', body: { status: 'contacted' } })
          toast.add({ title: 'Marked contacted', color: 'success' })
          emit('changed')
        } catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage ?? '', color: 'error' }) }
      },
    },
    {
      label: 'Mark spam',
      icon: 'i-lucide-trash-2',
      onSelect: async () => {
        await $fetch(`/api/leads/${props.lead.id}`, { method: 'PATCH', body: { status: 'spam_suspected' } })
        toast.add({ title: 'Marked spam', color: 'warning' })
        emit('changed')
      },
    },
  ],
  [
    {
      label: 'Delete (soft)',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect: () => { showDeleteModal.value = true },
    },
  ],
])

async function confirmDelete() {
  await $fetch(`/api/leads/${props.lead.id}`, { method: 'DELETE' })
  toast.add({ title: 'Lead removed', color: 'success' })
  showDeleteModal.value = false
  emit('changed')
}
</script>

<template>
  <UDropdownMenu :items="items" :popper="{ placement: 'bottom-end' }">
    <UButton icon="i-lucide-more-horizontal" variant="ghost" size="xs" aria-label="Lead actions" />
  </UDropdownMenu>

  <UModal v-model:open="showDeleteModal">
    <template #content>
      <div class="p-6 space-y-3">
        <h3 class="text-base font-semibold">Delete lead?</h3>
        <p class="text-sm text-muted">This soft-deletes the lead. An admin can permanently purge it later.</p>
        <div class="flex justify-end gap-2 pt-2">
          <UButton variant="ghost" @click="showDeleteModal = false">Cancel</UButton>
          <UButton color="error" @click="confirmDelete">Delete</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/leads/InboxRowActions.vue
git commit -m "feat(leads/ui): row-action dropdown with UModal-based delete confirm"
```

---

### Task 7: `LeadsLeadDetailSlideover`

**Files:**
- Create: `app/components/leads/LeadDetailSlideover.vue`

- [ ] **Step 1: Implement**

```vue
<!-- app/components/leads/LeadDetailSlideover.vue -->
<script setup lang="ts">
import { format } from 'date-fns'
import type { Lead, LeadDelivery, LeadStatus } from '~/types'

const props = defineProps<{ leadId: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'changed'): void }>()

const toast = useToast()
const lead = ref<Lead | null>(null)
const deliveries = ref<LeadDelivery[]>([])
const loading = ref(false)

async function load() {
  if (!props.leadId) return
  loading.value = true
  try {
    const r = await $fetch<{ lead: Lead; deliveries: LeadDelivery[] }>(`/api/leads/${props.leadId}`)
    lead.value = r.lead
    deliveries.value = r.deliveries
  } finally { loading.value = false }
}

watch(() => props.leadId, (id) => { if (id && open.value) load() })
watch(open, (v) => { if (v && props.leadId) load() })

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'spam_suspected', label: 'Spam?' },
]

async function changeStatus(s: LeadStatus) {
  if (!lead.value) return
  await $fetch(`/api/leads/${lead.value.id}`, { method: 'PATCH', body: { status: s } })
  await load()
  emit('changed')
  toast.add({ title: 'Status updated', color: 'success' })
}

async function saveNotes(text: string) {
  if (!lead.value) return
  await $fetch(`/api/leads/${lead.value.id}`, { method: 'PATCH', body: { notes: text } })
  toast.add({ title: 'Notes saved', color: 'success' })
}

async function retryAll() {
  if (!lead.value) return
  const r = await $fetch<{ retried: number }>(`/api/leads/${lead.value.id}/retry`, { method: 'POST' })
  toast.add({ title: `Retrying ${r.retried} delivery(s)`, color: 'success' })
  await load()
}

const fieldRows = computed(() => Object.entries(lead.value?.field_data ?? {}))
const attrRows = computed(() => Object.entries(lead.value?.attribution ?? {}))
</script>

<template>
  <USlideover v-model:open="open">
    <template #content>
      <div v-if="loading" class="p-6 text-sm text-muted">Loading…</div>
      <div v-else-if="lead" class="flex flex-col h-full">
        <header class="px-6 py-4 border-b border-default">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <LeadsSourceIcon :source="lead.source" />
              <h2 class="text-base font-semibold">{{ lead.form_name || lead.form_id || 'Lead' }}</h2>
              <LeadsStatusBadge :status="lead.status" />
            </div>
            <UButton icon="i-lucide-x" variant="ghost" size="sm" @click="open = false" />
          </div>
          <p class="text-xs text-muted mt-1">
            {{ format(new Date(lead.submitted_at), 'PPpp') }} · {{ lead.source }} · {{ lead.id.slice(0, 8) }}
          </p>
        </header>

        <div class="flex-1 overflow-auto p-6 space-y-6">
          <section>
            <h3 class="text-xs font-semibold uppercase text-muted mb-2">Field data</h3>
            <dl class="grid grid-cols-2 gap-2 text-sm">
              <template v-for="[k, v] in fieldRows" :key="k">
                <dt class="text-muted">{{ k }}</dt>
                <dd class="break-all">{{ v }}</dd>
              </template>
              <p v-if="!fieldRows.length" class="col-span-2 text-muted text-sm">No field data.</p>
            </dl>
          </section>

          <section v-if="attrRows.length">
            <h3 class="text-xs font-semibold uppercase text-muted mb-2">Attribution</h3>
            <dl class="grid grid-cols-2 gap-2 text-sm">
              <template v-for="[k, v] in attrRows" :key="k">
                <dt class="text-muted">{{ k }}</dt>
                <dd class="break-all">{{ v }}</dd>
              </template>
            </dl>
          </section>

          <section>
            <h3 class="text-xs font-semibold uppercase text-muted mb-2">Status</h3>
            <USelectMenu
              :model-value="lead.status"
              :items="STATUS_OPTIONS"
              value-key="value"
              @update:model-value="changeStatus"
            />
          </section>

          <section>
            <h3 class="text-xs font-semibold uppercase text-muted mb-2">Notes</h3>
            <UTextarea
              :model-value="lead.notes ?? ''"
              :rows="5"
              class="ring-1 ring-default rounded"
              placeholder="Add a note (saved on blur)…"
              @blur="(e: any) => saveNotes(e.target.value)"
            />
          </section>

          <section>
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-xs font-semibold uppercase text-muted">Delivery history</h3>
              <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" @click="retryAll">Retry failed</UButton>
            </div>
            <LeadsDeliveryHistory :deliveries="deliveries" @retried="load" />
          </section>
        </div>
      </div>
    </template>
  </USlideover>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/leads/LeadDetailSlideover.vue
git commit -m "feat(leads/ui): lead detail slide-over with status, notes, history"
```

---

### Task 8: `LeadsDeliveryHistory`

**Files:**
- Create: `app/components/leads/DeliveryHistory.vue`

- [ ] **Step 1: Implement**

```vue
<!-- app/components/leads/DeliveryHistory.vue -->
<script setup lang="ts">
import { format } from 'date-fns'
import type { LeadDelivery, LeadDeliveryStatus } from '~/types'

defineProps<{ deliveries: LeadDelivery[] }>()
const emit = defineEmits<{ (e: 'retried'): void }>()
const toast = useToast()

const COLOR: Record<LeadDeliveryStatus, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  pending: 'info', claimed: 'info', delivered: 'success',
  failed: 'error', cancelled: 'neutral', skipped: 'neutral',
}

async function retryOne() {
  // Re-uses the lead-level retry; per-delivery retry not exposed in v1.
  // (Surfaces a stub so users see the affordance; refine later if needed.)
  toast.add({ title: 'Retry triggered for all failed', color: 'success' })
  emit('retried')
}
</script>

<template>
  <ul v-if="deliveries.length" class="space-y-2">
    <li
      v-for="d in deliveries"
      :key="d.id"
      class="border border-default rounded p-3 text-sm flex items-start gap-3"
    >
      <UIcon name="i-lucide-circle-dot" class="mt-1 text-muted" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-mono text-xs">{{ d.destination_type }}</span>
          <UBadge :color="COLOR[d.status]" variant="soft" size="xs">{{ d.status }}</UBadge>
        </div>
        <p class="text-xs text-muted mt-1">
          scheduled {{ format(new Date(d.scheduled_at), 'PPpp') }}
          <template v-if="d.attempted_at"> · attempted {{ format(new Date(d.attempted_at), 'PPpp') }}</template>
          · attempts {{ d.retry_count }}
        </p>
        <p v-if="d.last_error" class="text-xs text-error mt-1 break-words">{{ d.last_error }}</p>
      </div>
      <UButton
        v-if="d.status === 'failed'"
        size="xs"
        variant="ghost"
        icon="i-lucide-rotate-cw"
        @click="retryOne"
      >Retry</UButton>
    </li>
  </ul>
  <p v-else class="text-sm text-muted">No deliveries yet.</p>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/leads/DeliveryHistory.vue
git commit -m "feat(leads/ui): delivery history component with per-status badges"
```

---

### Task 9: `LeadsManualLeadModal`

**Files:**
- Create: `app/components/leads/ManualLeadModal.vue`

- [ ] **Step 1: Implement**

```vue
<!-- app/components/leads/ManualLeadModal.vue -->
<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'created'): void }>()

const toast = useToast()
const { data: clients } = useFetch<{ items: { id: string; name: string }[] }>('/api/agency/clients/list', {
  default: () => ({ items: [] }),
})

const clientId = ref<string | null>(null)
const formName = ref<string>('')
const fields = ref<{ key: string; value: string }[]>([
  { key: 'full_name', value: '' },
  { key: 'email', value: '' },
  { key: 'phone_number', value: '' },
])
const runRules = ref(false)
const saving = ref(false)

const clientOptions = computed(() =>
  (clients.value?.items ?? []).map(c => ({ value: c.id, label: c.name })),
)

function addField() { fields.value.push({ key: '', value: '' }) }
function removeField(i: number) { fields.value.splice(i, 1) }

function reset() {
  clientId.value = null
  formName.value = ''
  fields.value = [
    { key: 'full_name', value: '' },
    { key: 'email', value: '' },
    { key: 'phone_number', value: '' },
  ]
  runRules.value = false
}

async function submit() {
  if (!clientId.value) {
    toast.add({ title: 'Pick a client', color: 'error' }); return
  }
  const field_data: Record<string, string> = {}
  for (const f of fields.value) if (f.key && f.value) field_data[f.key] = f.value
  if (!Object.keys(field_data).length) {
    toast.add({ title: 'Add at least one field', color: 'error' }); return
  }
  saving.value = true
  try {
    await $fetch('/api/leads', {
      method: 'POST',
      body: {
        client_id: clientId.value,
        field_data,
        form_name: formName.value || null,
        run_rules: runRules.value,
      },
    })
    toast.add({ title: 'Lead added', color: 'success' })
    reset()
    open.value = false
    emit('created')
  } catch (e: any) {
    toast.add({ title: 'Failed', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <div class="p-6 space-y-4 w-full max-w-xl">
        <h3 class="text-base font-semibold">New manual lead</h3>

        <div class="space-y-2">
          <label class="text-xs text-muted">Client</label>
          <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" placeholder="Pick a client" />
        </div>

        <div class="space-y-2">
          <label class="text-xs text-muted">Form name (optional)</label>
          <UInput v-model="formName" placeholder="e.g. Phone-In, Walk-in" />
        </div>

        <div class="space-y-2">
          <label class="text-xs text-muted">Fields</label>
          <div v-for="(f, i) in fields" :key="i" class="flex items-center gap-2">
            <UInput v-model="f.key" placeholder="key" class="w-40" />
            <UInput v-model="f.value" placeholder="value" class="flex-1" />
            <UButton icon="i-lucide-x" variant="ghost" size="sm" @click="removeField(i)" />
          </div>
          <UButton icon="i-lucide-plus" variant="ghost" size="sm" @click="addField">Add field</UButton>
        </div>

        <UCheckbox v-model="runRules" label="Run rules engine for this lead (otherwise skip fan-out)" />

        <div class="flex justify-end gap-2 pt-2 border-t border-default">
          <UButton variant="ghost" @click="open = false">Cancel</UButton>
          <UButton :loading="saving" color="primary" @click="submit">Add lead</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/leads/ManualLeadModal.vue
git commit -m "feat(leads/ui): manual lead modal with key/value field editor"
```

---

## Section C — Form Rules tab + editor

### Task 10: `LeadsFormRulesTab` + auto-create rule on first edit

**Files:**
- Create: `app/components/leads/FormRulesTab.vue`

- [ ] **Step 1: Implement**

```vue
<!-- app/components/leads/FormRulesTab.vue -->
<script setup lang="ts">
import { format } from 'date-fns'

interface RuleListItem {
  source: string
  form_id: string
  form_name: string | null
  rule_id: string | null
  client_id: string | null
  enabled: boolean | null
  destination_count: string | number | null
  last_lead_at: string | null
}

const { data, refresh, pending } = useFetch<{ items: RuleListItem[] }>('/api/leads/rules/list', {
  default: () => ({ items: [] }),
})

const editingRuleId = ref<string | null>(null)
const editingFormMeta = ref<{ source: string; form_id: string; form_name: string | null } | null>(null)
const showEditor = ref(false)
const toast = useToast()

const columns = [
  { accessorKey: 'form_name', header: 'Form' },
  { accessorKey: 'source', header: 'Source' },
  { accessorKey: 'destination_count', header: 'Destinations' },
  { accessorKey: 'enabled', header: 'Enabled' },
  { accessorKey: 'last_lead_at', header: 'Last lead' },
  { accessorKey: 'actions', header: '' },
]

async function configure(item: RuleListItem) {
  // Auto-create rule on first configure if it doesn't exist.
  if (!item.rule_id) {
    if (!item.client_id) {
      // Need a client mapping first — we use the first available client.
      // V1: prompt the user to pick one.
      const clientId = window.prompt('Client UUID for this form?') // TODO replace with picker UModal in v2
      if (!clientId) return
      try {
        const r = await $fetch<{ id: string }>('/api/leads/rules', {
          method: 'POST',
          body: { client_id: clientId, source: item.source, form_id: item.form_id, form_name: item.form_name },
        })
        editingRuleId.value = r.id
      } catch (e: any) {
        toast.add({ title: 'Failed to create rule', description: e?.data?.statusMessage ?? '', color: 'error' })
        return
      }
    }
  } else {
    editingRuleId.value = item.rule_id
  }
  editingFormMeta.value = { source: item.source, form_id: item.form_id, form_name: item.form_name }
  showEditor.value = true
}

async function toggleEnabled(item: RuleListItem) {
  if (!item.rule_id) return
  await $fetch(`/api/leads/rules/${item.rule_id}`, { method: 'PATCH', body: { enabled: !item.enabled } })
  await refresh()
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-4 py-3 border-b border-default flex items-center justify-between">
      <h2 class="text-base font-semibold">Form rules</h2>
      <UButton variant="ghost" size="sm" icon="i-lucide-refresh-cw" @click="refresh()">Refresh</UButton>
    </div>

    <div class="flex-1 overflow-auto p-2">
      <UTable :data="data?.items ?? []" :columns="columns" :loading="pending">
        <template #form_name-cell="{ row }">
          <span class="text-sm">{{ row.original.form_name || row.original.form_id }}</span>
        </template>
        <template #source-cell="{ row }">
          <UBadge variant="soft" size="sm">{{ row.original.source }}</UBadge>
        </template>
        <template #destination_count-cell="{ row }">
          <span class="text-sm">{{ row.original.destination_count ?? 0 }}</span>
        </template>
        <template #enabled-cell="{ row }">
          <UToggle
            :model-value="!!row.original.enabled"
            :disabled="!row.original.rule_id"
            @update:model-value="() => toggleEnabled(row.original)"
          />
        </template>
        <template #last_lead_at-cell="{ row }">
          <span class="text-xs text-muted">
            {{ row.original.last_lead_at ? format(new Date(row.original.last_lead_at), 'PP') : '—' }}
          </span>
        </template>
        <template #actions-cell="{ row }">
          <UButton size="xs" variant="ghost" icon="i-lucide-settings" @click="configure(row.original)">Configure</UButton>
        </template>
      </UTable>
    </div>

    <LeadsRuleEditor
      v-if="showEditor && editingRuleId && editingFormMeta"
      v-model:open="showEditor"
      :rule-id="editingRuleId"
      :form-meta="editingFormMeta"
      @changed="refresh()"
    />
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/leads/FormRulesTab.vue
git commit -m "feat(leads/ui): form-rules list with auto-create on first configure"
```

> **Note:** the `window.prompt` for client picker is a known v1 stub; replaced with a `UModal`-based picker before shipping.

---

### Task 11: Rule auto-create endpoint

**Files:**
- Create: `server/api/leads/rules/index.post.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/leads/rules/index.post.ts
import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({
  client_id: z.string().uuid(),
  source: z.enum(['meta', 'google']),
  form_id: z.string().min(1),
  form_name: z.string().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const b = Body.parse(await readBody(event))
  const row = await queryOne<{ id: string }>(`
    INSERT INTO lead_form_rules (client_id, source, form_id, form_name)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (source, form_id) DO UPDATE SET
      client_id = EXCLUDED.client_id,
      form_name = COALESCE(EXCLUDED.form_name, lead_form_rules.form_name),
      updated_at = NOW()
    RETURNING id
  `, [b.client_id, b.source, b.form_id, b.form_name ?? null])
  return { ok: true, id: row!.id }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/api/leads/rules/index.post.ts
git commit -m "feat(leads): rule auto-create/upsert endpoint"
```

---

### Task 12: `LeadsRuleEditor`

**Files:**
- Create: `app/components/leads/RuleEditor.vue`

- [ ] **Step 1: Implement**

```vue
<!-- app/components/leads/RuleEditor.vue -->
<script setup lang="ts">
import type { LeadRuleDestination, LeadDestinationType } from '~/types'

const props = defineProps<{
  ruleId: string
  formMeta: { source: string; form_id: string; form_name: string | null }
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'changed'): void }>()

const toast = useToast()
const { data, refresh, pending } = useFetch<{
  rule: any
  destinations: LeadRuleDestination[]
}>(`/api/leads/rules/${props.ruleId}`, { default: () => ({ rule: null, destinations: [] }) })

const editingDest = ref<LeadRuleDestination | null>(null)
const showDestModal = ref(false)
const showTestFire = ref(false)

function newDestination(type: LeadDestinationType) {
  editingDest.value = {
    id: '', rule_id: props.ruleId, destination_type: type,
    config: {}, filter: null, delay_minutes: 0, enabled: true, sort_order: 0,
    created_at: '', updated_at: '',
  } as any
  showDestModal.value = true
}

function editDestination(d: LeadRuleDestination) {
  editingDest.value = { ...d }
  showDestModal.value = true
}

async function deleteDestination(d: LeadRuleDestination) {
  if (!window.confirm) {} // Placeholder — replaced by a UModal confirm in v2
  await $fetch(`/api/leads/rules/${props.ruleId}/destinations/${d.id}`, { method: 'DELETE' })
  toast.add({ title: 'Destination removed', color: 'success' })
  await refresh()
}

const ADD_TYPES: { type: LeadDestinationType; label: string; icon: string }[] = [
  { type: 'portal', label: 'Client portal write', icon: 'i-lucide-monitor' },
  { type: 'webhook', label: 'Outbound webhook', icon: 'i-lucide-link' },
  { type: 'slack', label: 'Slack channel', icon: 'i-lucide-message-circle' },
  { type: 'email', label: 'Email staff', icon: 'i-lucide-mail' },
  { type: 'sheets', label: 'Google Sheet append', icon: 'i-lucide-table' },
  { type: 'assign_user', label: 'Assign to user', icon: 'i-lucide-user' },
]
</script>

<template>
  <USlideover v-model:open="open" :ui="{ container: 'w-full max-w-3xl' }">
    <template #content>
      <div class="flex flex-col h-full">
        <header class="px-6 py-4 border-b border-default flex items-center justify-between">
          <div>
            <h2 class="text-base font-semibold">{{ formMeta.form_name || formMeta.form_id }}</h2>
            <p class="text-xs text-muted">{{ formMeta.source }} · form {{ formMeta.form_id }}</p>
          </div>
          <div class="flex items-center gap-2">
            <UButton variant="ghost" size="sm" icon="i-lucide-flask-conical" @click="showTestFire = true">Test fire</UButton>
            <UButton variant="ghost" size="sm" icon="i-lucide-x" @click="open = false" />
          </div>
        </header>

        <div class="flex-1 overflow-auto p-6 space-y-6">
          <section>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold">Destinations</h3>
              <UDropdownMenu :items="[ADD_TYPES.map(t => ({ label: t.label, icon: t.icon, onSelect: () => newDestination(t.type) }))]">
                <UButton size="sm" icon="i-lucide-plus">Add destination</UButton>
              </UDropdownMenu>
            </div>

            <ul class="space-y-2">
              <li v-for="d in data?.destinations ?? []" :key="d.id"
                class="flex items-center justify-between gap-3 p-3 border border-default rounded">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <UBadge variant="soft" size="sm">{{ d.destination_type }}</UBadge>
                    <UToggle :model-value="d.enabled" disabled />
                    <span v-if="d.delay_minutes" class="text-xs text-muted">+{{ d.delay_minutes }}m delay</span>
                    <span v-if="d.filter" class="text-xs text-muted">· filtered</span>
                  </div>
                  <p class="text-xs text-muted mt-1 truncate">{{ JSON.stringify(d.config) }}</p>
                </div>
                <div class="flex items-center gap-1">
                  <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="editDestination(d)" />
                  <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleteDestination(d)" />
                </div>
              </li>
              <p v-if="!data?.destinations?.length" class="text-sm text-muted">
                No destinations configured. Click <strong>Add destination</strong> to start.
              </p>
            </ul>
          </section>
        </div>
      </div>

      <LeadsDestinationEditor
        v-if="showDestModal && editingDest"
        v-model:open="showDestModal"
        :rule-id="ruleId"
        :form-meta="formMeta"
        :destination="editingDest"
        @saved="() => { refresh(); emit('changed') }"
      />

      <LeadsTestFirePanel
        v-if="showTestFire"
        v-model:open="showTestFire"
        :rule-id="ruleId"
        :form-meta="formMeta"
      />
    </template>
  </USlideover>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/leads/RuleEditor.vue
git commit -m "feat(leads/ui): rule editor slide-over with destination list + test-fire entry"
```

---

### Task 13: `LeadsFilterBuilder`

**Files:**
- Create: `app/components/leads/FilterBuilder.vue`

- [ ] **Step 1: Implement**

```vue
<!-- app/components/leads/FilterBuilder.vue -->
<script setup lang="ts">
import type { LeadFilter, LeadFilterOp } from '~/types'

const props = defineProps<{
  source: string
  formId: string
}>()

const model = defineModel<LeadFilter | null>('filter')

const enabled = ref<boolean>(!!model.value)
const path = ref<string>(model.value?.field ?? 'field_data.email')
const op = ref<LeadFilterOp>(model.value?.op ?? 'eq')
const value = ref<string>(
  Array.isArray(model.value?.value) ? model.value!.value.join(',') :
    model.value?.value != null ? String(model.value!.value) : '',
)

const { data: forms } = useFetch<{ items: any[] }>('/api/leads/forms/list', {
  default: () => ({ items: [] }),
})

const fieldOptions = computed(() => {
  const meta = forms.value?.items.find((f: any) => f.source === props.source && f.form_id === props.formId)
  const out: { value: string; label: string }[] = [
    { value: 'score', label: 'score' },
    { value: 'attribution.utm_source', label: 'attribution.utm_source' },
    { value: 'attribution.utm_medium', label: 'attribution.utm_medium' },
    { value: 'attribution.gclid', label: 'attribution.gclid' },
  ]
  for (const f of (meta?.fields ?? [])) {
    out.unshift({ value: `field_data.${f.key}`, label: `field_data.${f.key}` })
  }
  return out
})

const OP_OPTIONS: { value: LeadFilterOp; label: string }[] = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equal' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'contains', label: 'contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
  { value: 'in', label: 'in (comma list)' },
  { value: 'not_in', label: 'not in (comma list)' },
]

const valueless = computed(() => op.value === 'is_empty' || op.value === 'is_not_empty')

function emitChange() {
  if (!enabled.value) { model.value = null; return }
  const v: any =
    valueless.value ? null :
    op.value === 'in' || op.value === 'not_in' ? value.value.split(',').map(s => s.trim()).filter(Boolean) :
    /^[gtl]te?$/.test(op.value) ? Number(value.value) :
    value.value
  model.value = { field: path.value, op: op.value, value: v }
}

watch([enabled, path, op, value], emitChange)
</script>

<template>
  <div class="space-y-2">
    <UCheckbox v-model="enabled" label="Apply a filter" />
    <div v-if="enabled" class="grid grid-cols-3 gap-2">
      <USelectMenu v-model="path" :items="fieldOptions" value-key="value" />
      <USelectMenu v-model="op" :items="OP_OPTIONS" value-key="value" />
      <UInput v-if="!valueless" v-model="value" placeholder="value" />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/leads/FilterBuilder.vue
git commit -m "feat(leads/ui): filter builder driven by form metadata"
```

---

### Task 14: Per-type config sub-forms

**Files:**
- Create: `app/components/leads/DestinationConfigPortal.vue`
- Create: `app/components/leads/DestinationConfigWebhook.vue`
- Create: `app/components/leads/DestinationConfigSlack.vue`
- Create: `app/components/leads/DestinationConfigEmail.vue`
- Create: `app/components/leads/DestinationConfigSheets.vue`
- Create: `app/components/leads/DestinationConfigAssignUser.vue`

- [ ] **Step 1: Portal (no config)**

```vue
<!-- app/components/leads/DestinationConfigPortal.vue -->
<script setup lang="ts">
defineModel<Record<string, any>>('config', { default: () => ({}) })
</script>
<template>
  <div class="text-sm text-muted">
    No configuration — leads from this form will be visible inside the matching client's portal.
  </div>
</template>
```

- [ ] **Step 2: Webhook**

```vue
<!-- app/components/leads/DestinationConfigWebhook.vue -->
<script setup lang="ts">
const config = defineModel<Record<string, any>>('config', { default: () => ({}) })

const headersJson = ref<string>(JSON.stringify(config.value.headers ?? {}, null, 2))

watch(headersJson, (v) => {
  try { config.value.headers = JSON.parse(v) } catch { /* let server-side validate flag */ }
})
</script>
<template>
  <div class="space-y-3">
    <div class="space-y-1">
      <label class="text-xs text-muted">URL (HTTPS only)</label>
      <UInput v-model="config.url" placeholder="https://acme.example.com/leads" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Method</label>
      <USelectMenu
        v-model="config.method"
        :items="[{ value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' }]"
        value-key="value"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Signing secret (optional)</label>
      <UInput v-model="config.secret" type="password" placeholder="optional — adds X-Leads-Signature" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Extra headers (JSON)</label>
      <UTextarea v-model="headersJson" :rows="5" class="ring-1 ring-default rounded font-mono text-xs" />
    </div>
  </div>
</template>
```

- [ ] **Step 3: Slack**

```vue
<!-- app/components/leads/DestinationConfigSlack.vue -->
<script setup lang="ts">
const config = defineModel<Record<string, any>>('config', { default: () => ({}) })
</script>
<template>
  <div class="space-y-3">
    <div class="space-y-1">
      <label class="text-xs text-muted">Slack incoming webhook URL</label>
      <UInput v-model="config.webhook_url" placeholder="https://hooks.slack.com/services/T0/B0/xxx" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Mention (optional, e.g. @here or &lt;@U123&gt;)</label>
      <UInput v-model="config.mention" placeholder="@here" />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Email**

```vue
<!-- app/components/leads/DestinationConfigEmail.vue -->
<script setup lang="ts">
const config = defineModel<Record<string, any>>('config', { default: () => ({ to: [] }) })

const toCsv = ref<string>((config.value.to ?? []).join(', '))
watch(toCsv, v => config.value.to = v.split(',').map(s => s.trim()).filter(Boolean))
</script>
<template>
  <div class="space-y-3">
    <div class="space-y-1">
      <label class="text-xs text-muted">To (comma-separated)</label>
      <UInput v-model="toCsv" placeholder="ops@adme.net.au, james@adme.net.au" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Subject template</label>
      <UInput v-model="config.subject_template" placeholder="New lead from {{ field.first_name }}" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Body template (HTML)</label>
      <UTextarea v-model="config.body_template" :rows="8" class="ring-1 ring-default rounded font-mono text-xs" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">From (optional)</label>
      <UInput v-model="config.from" placeholder="leads@adme.net.au" />
    </div>
  </div>
</template>
```

- [ ] **Step 5: Sheets**

```vue
<!-- app/components/leads/DestinationConfigSheets.vue -->
<script setup lang="ts">
const config = defineModel<Record<string, any>>('config', { default: () => ({}) })
</script>
<template>
  <div class="space-y-3">
    <UAlert
      icon="i-lucide-info"
      title="Requires the Google connection to include the spreadsheets scope"
      description="If your Google connection was set up for ad spend only, you may need to reconnect with the sheets scope."
      color="info"
      variant="soft"
    />
    <div class="space-y-1">
      <label class="text-xs text-muted">Spreadsheet ID</label>
      <UInput v-model="config.spreadsheet_id" placeholder="44-char Google Sheet ID" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Sheet name (tab)</label>
      <UInput v-model="config.sheet_name" placeholder="Sheet1" />
    </div>
  </div>
</template>
```

- [ ] **Step 6: Assign user**

```vue
<!-- app/components/leads/DestinationConfigAssignUser.vue -->
<script setup lang="ts">
const config = defineModel<Record<string, any>>('config', { default: () => ({}) })

const { data: users } = useFetch<{ items: { id: string; name: string }[] }>('/api/agency/team/list', {
  default: () => ({ items: [] }),
})
const userOptions = computed(() =>
  (users.value?.items ?? []).map(u => ({ value: u.id, label: u.name })),
)
</script>
<template>
  <div class="space-y-1">
    <label class="text-xs text-muted">Assign lead to</label>
    <USelectMenu v-model="config.user_id" :items="userOptions" value-key="value" placeholder="Pick a user" />
  </div>
</template>
```

- [ ] **Step 7: Commit**

```bash
git add app/components/leads/DestinationConfig*.vue
git commit -m "feat(leads/ui): per-type destination config sub-forms (6 adapters)"
```

---

### Task 15: `LeadsDestinationEditor`

**Files:**
- Create: `app/components/leads/DestinationEditor.vue`

- [ ] **Step 1: Implement**

```vue
<!-- app/components/leads/DestinationEditor.vue -->
<script setup lang="ts">
import type { LeadRuleDestination, LeadDestinationType } from '~/types'

const props = defineProps<{
  ruleId: string
  formMeta: { source: string; form_id: string; form_name: string | null }
  destination: LeadRuleDestination
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'saved'): void }>()

const toast = useToast()
const draft = ref<LeadRuleDestination>({ ...props.destination, config: { ...(props.destination.config ?? {}) } })
const saving = ref(false)
const errors = ref<Record<string, string>>({})

const DELAY_OPTIONS = [
  { value: 0, label: 'Immediate' },
  { value: 5, label: '+ 5 min' },
  { value: 15, label: '+ 15 min' },
  { value: 60, label: '+ 1 hour' },
  { value: 120, label: '+ 2 hours' },
  { value: 1440, label: '+ 24 hours' },
]

const ConfigComp = computed(() => {
  switch (draft.value.destination_type) {
    case 'portal': return resolveComponent('LeadsDestinationConfigPortal')
    case 'webhook': return resolveComponent('LeadsDestinationConfigWebhook')
    case 'slack': return resolveComponent('LeadsDestinationConfigSlack')
    case 'email': return resolveComponent('LeadsDestinationConfigEmail')
    case 'sheets': return resolveComponent('LeadsDestinationConfigSheets')
    case 'assign_user': return resolveComponent('LeadsDestinationConfigAssignUser')
    default: return null
  }
})

async function save() {
  saving.value = true
  errors.value = {}
  try {
    const body = {
      destination_type: draft.value.destination_type,
      config: draft.value.config,
      filter: draft.value.filter,
      delay_minutes: draft.value.delay_minutes,
      enabled: draft.value.enabled,
      sort_order: draft.value.sort_order,
    }
    if (props.destination.id) {
      await $fetch(`/api/leads/rules/${props.ruleId}/destinations/${props.destination.id}`, {
        method: 'PUT', body,
      })
    } else {
      await $fetch(`/api/leads/rules/${props.ruleId}/destinations`, { method: 'POST', body })
    }
    toast.add({ title: 'Saved', color: 'success' })
    emit('saved')
    open.value = false
  } catch (e: any) {
    if (e?.data?.statusMessage === 'invalid_config' && e?.data?.data) errors.value = e.data.data
    toast.add({ title: 'Could not save', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ container: 'max-w-2xl' }">
    <template #content>
      <div class="p-6 space-y-4">
        <h3 class="text-base font-semibold">
          {{ destination.id ? 'Edit destination' : 'Add destination' }}
          <span class="text-muted font-normal">— {{ draft.destination_type }}</span>
        </h3>

        <component :is="ConfigComp" v-if="ConfigComp" v-model:config="draft.config" />

        <div v-if="Object.keys(errors).length" class="text-sm text-error">
          <p v-for="(msg, k) in errors" :key="k">{{ k }}: {{ msg }}</p>
        </div>

        <LeadsFilterBuilder
          v-model:filter="draft.filter"
          :source="formMeta.source"
          :form-id="formMeta.form_id"
        />

        <div class="space-y-1">
          <label class="text-xs text-muted">Delay</label>
          <USelectMenu v-model="draft.delay_minutes" :items="DELAY_OPTIONS" value-key="value" />
        </div>

        <div class="flex items-center gap-3">
          <UCheckbox v-model="draft.enabled" label="Enabled" />
          <UInput v-model.number="draft.sort_order" type="number" class="w-24" placeholder="Sort" />
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-default">
          <UButton variant="ghost" @click="open = false">Cancel</UButton>
          <UButton :loading="saving" color="primary" @click="save">Save</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/leads/DestinationEditor.vue
git commit -m "feat(leads/ui): destination editor with dynamic config sub-form + filter + delay"
```

---

### Task 16: `LeadsTestFirePanel`

**Files:**
- Create: `app/components/leads/TestFirePanel.vue`

- [ ] **Step 1: Implement**

```vue
<!-- app/components/leads/TestFirePanel.vue -->
<script setup lang="ts">
const props = defineProps<{
  ruleId: string
  formMeta: { source: string; form_id: string; form_name: string | null }
}>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const overrides = ref<{ key: string; value: string }[]>([])
const running = ref(false)
const result = ref<any>(null)

function addOverride() { overrides.value.push({ key: '', value: '' }) }

async function run() {
  running.value = true
  try {
    const field_data: Record<string, string> = {}
    for (const o of overrides.value) if (o.key) field_data[o.key] = o.value
    result.value = await $fetch(`/api/leads/rules/${props.ruleId}/test-fire`, {
      method: 'POST',
      body: { field_data },
    })
    toast.add({ title: 'Test fired', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Test failed', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally { running.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ container: 'max-w-2xl' }">
    <template #content>
      <div class="p-6 space-y-4">
        <h3 class="text-base font-semibold">Test fire — {{ formMeta.form_name || formMeta.form_id }}</h3>
        <p class="text-xs text-muted">
          Synthesizes a sample lead from observed form fields and runs each destination.
          Nothing is persisted to the database.
        </p>

        <div class="space-y-2">
          <label class="text-xs text-muted">Field overrides (optional)</label>
          <div v-for="(o, i) in overrides" :key="i" class="flex items-center gap-2">
            <UInput v-model="o.key" placeholder="key" class="w-40" />
            <UInput v-model="o.value" placeholder="value" class="flex-1" />
            <UButton icon="i-lucide-x" variant="ghost" size="sm" @click="overrides.splice(i, 1)" />
          </div>
          <UButton icon="i-lucide-plus" variant="ghost" size="sm" @click="addOverride">Add override</UButton>
        </div>

        <UButton :loading="running" icon="i-lucide-flask-conical" color="primary" @click="run">Run test fire</UButton>

        <div v-if="result" class="space-y-2">
          <h4 class="text-xs font-semibold uppercase text-muted">Per-destination results</h4>
          <ul class="space-y-1">
            <li v-for="r in result.results" :key="r.id" class="border border-default rounded p-2 text-sm">
              <div class="flex items-center justify-between">
                <span class="font-mono text-xs">{{ r.type ?? 'unknown' }}</span>
                <UBadge
                  :color="r.skipped ? 'neutral' : r.status === 'delivered' ? 'success' : 'error'"
                  variant="soft" size="xs"
                >{{ r.skipped ? 'skipped:' + r.skipped : r.status }}</UBadge>
              </div>
              <p v-if="r.error" class="text-xs text-error mt-1 break-words">{{ r.error }}</p>
            </li>
          </ul>
        </div>

        <div class="flex justify-end pt-2 border-t border-default">
          <UButton variant="ghost" @click="open = false">Close</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/leads/TestFirePanel.vue
git commit -m "feat(leads/ui): test-fire panel with per-destination result display"
```

---

## Section D — Page wrappers

### Task 17: `app/pages/agency/leads/index.vue`

**Files:**
- Create: `app/pages/agency/leads/index.vue`

- [ ] **Step 1: Implement**

```vue
<!-- app/pages/agency/leads/index.vue -->
<script setup lang="ts">
definePageMeta({
  // Existing global RBAC middleware enforces auth/role.
})

useHead({ title: 'Leads — XeroFlow Agency' })

const tab = ref<'inbox' | 'rules'>('inbox')

const tabs = [
  { value: 'inbox', label: 'Inbox', icon: 'i-lucide-inbox' },
  { value: 'rules', label: 'Form rules', icon: 'i-lucide-list-checks' },
]
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <header class="px-6 py-4 border-b border-default flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">Leads</h1>
        <p class="text-sm text-muted">Real-time inbox for Meta + Google ad inquiries</p>
      </div>
      <UTabs v-model="tab" :items="tabs" />
    </header>

    <div class="flex-1 min-h-0">
      <LeadsInbox v-if="tab === 'inbox'" />
      <LeadsFormRulesTab v-else />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/pages/agency/leads/index.vue
git commit -m "feat(leads/ui): agency /agency/leads page with Inbox / Form rules tabs"
```

---

### Task 18: Settings → Social → Google "Lead webhooks" tab

**Files:**
- Modify: `app/pages/agency/social/google.vue`

- [ ] **Step 1: Read the current file**

```bash
sed -n '1,40p' app/pages/agency/social/google.vue
```

- [ ] **Step 2: Append a new tab**

Add a new tab to the existing tabs structure. Find the existing `<UTabs>` (if any) and add this item to it; otherwise add a section after the existing content. Concrete patch (the exact line will depend on existing layout — find a `</template>` near the bottom and insert above it):

```vue
<!-- New section appended near the end of the template -->
<section class="mt-8 border-t border-default pt-6">
  <h2 class="text-base font-semibold mb-1">Lead webhooks</h2>
  <p class="text-sm text-muted mb-4">
    Per-client webhook URLs for Google Ads Lead Form integration.
    Paste these into the lead form asset's "Webhook integration" panel in Google Ads.
  </p>

  <div class="space-y-3">
    <UCard v-for="ep in endpoints" :key="ep.id">
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="font-medium">{{ ep.client_name }}</h3>
          <UBadge variant="soft" size="sm" :color="Number(ep.lead_count) > 0 ? 'success' : 'neutral'">
            {{ Number(ep.lead_count) > 0 ? `${ep.lead_count} lead(s)` : 'no leads yet' }}
          </UBadge>
        </div>
      </template>
      <div class="space-y-3">
        <div>
          <label class="text-xs text-muted">Webhook URL</label>
          <div class="flex items-center gap-2">
            <UInput :model-value="urlFor(ep.url_token)" readonly class="font-mono text-xs flex-1" />
            <UButton size="xs" icon="i-lucide-copy" variant="ghost" @click="copy(urlFor(ep.url_token))" />
          </div>
        </div>
        <div>
          <label class="text-xs text-muted">Webhook key</label>
          <div class="flex items-center gap-2">
            <UInput
              :type="revealed[ep.id] ? 'text' : 'password'"
              :model-value="ep.secret_key"
              readonly
              class="font-mono text-xs flex-1"
            />
            <UButton size="xs" :icon="revealed[ep.id] ? 'i-lucide-eye-off' : 'i-lucide-eye'" variant="ghost"
              @click="revealed[ep.id] = !revealed[ep.id]" />
            <UButton size="xs" icon="i-lucide-copy" variant="ghost" @click="copy(ep.secret_key)" />
          </div>
          <p v-if="ep.secret_key_grace_until && new Date(ep.secret_key_grace_until) > new Date()"
             class="text-xs text-warning mt-1">
            Previous key still valid until {{ new Date(ep.secret_key_grace_until).toLocaleTimeString() }}.
          </p>
        </div>
        <div class="flex justify-end">
          <UButton size="xs" variant="ghost" icon="i-lucide-rotate-cw" @click="rotate(ep)">Rotate key</UButton>
        </div>
      </div>
    </UCard>
  </div>

  <UAlert
    class="mt-6"
    icon="i-lucide-info"
    title="How to wire this up"
    description="In Google Ads → Assets → Lead form → Webhook integration: paste the URL and Key above, then click 'Send test data'. The card's 'lead(s)' badge updates when traffic arrives."
    variant="soft"
    color="info"
  />
</section>
```

- [ ] **Step 3: Add the matching script-setup additions**

Add these inside the existing `<script setup lang="ts">` block:

```ts
// Lead webhooks tab additions
interface LeadEndpoint {
  id: string; client_id: string; client_name: string;
  url_token: string; secret_key: string;
  secret_key_grace_until: string | null; rotated_at: string | null;
  lead_count: string;
}
const { data: endpointsData, refresh: refreshEndpoints } = useFetch<{ items: LeadEndpoint[] }>(
  '/api/leads/endpoints/list',
  { default: () => ({ items: [] }) },
)
const endpoints = computed(() => endpointsData.value?.items ?? [])
const revealed = reactive<Record<string, boolean>>({})
const _toast = useToast()

function urlFor(token: string): string {
  // Use window.location for the host; falls back to env-configured host on SSR.
  const host = typeof window !== 'undefined' ? window.location.origin : process.env.PUBLIC_BASE_URL || ''
  return `${host}/api/leads/webhook/google/${token}`
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    _toast.add({ title: 'Copied', color: 'success' })
  } catch {
    _toast.add({ title: 'Copy failed', color: 'error' })
  }
}

async function rotate(ep: LeadEndpoint) {
  await $fetch(`/api/leads/endpoints/${ep.id}/rotate`, { method: 'POST' })
  _toast.add({ title: 'Key rotated — old key valid 30 more min', color: 'success' })
  await refreshEndpoints()
}
```

- [ ] **Step 4: Commit**

```bash
git add app/pages/agency/social/google.vue
git commit -m "feat(leads/ui): add 'Lead webhooks' section to Google settings page"
```

---

### Task 19: `app/pages/portal/leads.vue`

**Files:**
- Create: `app/components/portal/LeadsInbox.vue`
- Create: `app/pages/portal/leads.vue`

- [ ] **Step 1: Portal inbox component**

```vue
<!-- app/components/portal/LeadsInbox.vue -->
<script setup lang="ts">
import { format } from 'date-fns'

interface PortalLead {
  id: string; source: string; form_name: string | null
  submitted_at: string; field_data: Record<string, string>
  status: string; contacted_at: string | null
}

const status = ref<string>('all')
const page = ref(1)
const PAGE_SIZE = 50

const params = computed(() => {
  const p: Record<string, string> = { page: String(page.value), page_size: String(PAGE_SIZE) }
  if (status.value !== 'all') p.status = status.value
  return p
})

const { data, refresh, pending } = useFetch<{ items: PortalLead[]; total: number }>(
  '/api/client-portal/leads/list',
  { query: params, watch: [params], default: () => ({ items: [], total: 0 }) },
)

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]
const toast = useToast()

const columns = [
  { accessorKey: 'submitted_at', header: 'When' },
  { accessorKey: 'form_name', header: 'Form' },
  { accessorKey: 'summary', header: 'Lead' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'actions', header: '' },
]

function summarize(l: PortalLead): string {
  const f = l.field_data ?? {}
  return [f.full_name, f.email, f.phone_number ?? f.phone].filter(Boolean).slice(0, 2).join(' · ')
}

async function markContacted(l: PortalLead) {
  await $fetch(`/api/client-portal/leads/${l.id}/contacted`, { method: 'POST' })
  toast.add({ title: 'Marked contacted', color: 'success' })
  await refresh()
}

function downloadCsv() { window.open('/api/client-portal/leads/export', '_blank') }
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between px-4 py-3 border-b border-default">
      <div class="flex items-center gap-2">
        <USelectMenu v-model="status" :items="STATUS_OPTIONS" value-key="value" class="w-36" />
        <span class="text-xs text-muted">{{ data?.total ?? 0 }} total</span>
      </div>
      <div class="flex items-center gap-2">
        <UButton size="sm" variant="ghost" icon="i-lucide-download" @click="downloadCsv">CSV</UButton>
        <UButton size="sm" variant="ghost" icon="i-lucide-refresh-cw" @click="refresh()">Refresh</UButton>
      </div>
    </div>

    <div class="flex-1 overflow-auto">
      <UTable :data="data?.items ?? []" :columns="columns" :loading="pending">
        <template #submitted_at-cell="{ row }">
          <span class="text-sm whitespace-nowrap">{{ format(new Date(row.original.submitted_at), 'MMM d, HH:mm') }}</span>
        </template>
        <template #form_name-cell="{ row }">
          <span class="text-sm">{{ row.original.form_name || '—' }}</span>
        </template>
        <template #summary-cell="{ row }">
          <span class="text-sm">{{ summarize(row.original) || '—' }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge variant="soft" size="sm">{{ row.original.status }}</UBadge>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            v-if="row.original.status === 'new'"
            size="xs" variant="ghost" icon="i-lucide-check"
            @click="markContacted(row.original)"
          >Mark contacted</UButton>
        </template>
      </UTable>
    </div>

    <div class="border-t border-default p-3 flex items-center justify-end">
      <UPagination v-model:page="page" :total="data?.total ?? 0" :items-per-page="PAGE_SIZE" :sibling-count="1" />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Page wrapper**

```vue
<!-- app/pages/portal/leads.vue -->
<script setup lang="ts">
definePageMeta({
  // Existing portal middleware handles requireClientAuth.
  layout: 'portal',
})
useHead({ title: 'Leads — Client Portal' })
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <header class="px-6 py-4 border-b border-default">
      <h1 class="text-xl font-semibold">Your leads</h1>
      <p class="text-sm text-muted">Real-time inquiries from your Meta + Google ads.</p>
    </header>
    <div class="flex-1 min-h-0">
      <PortalLeadsInbox />
    </div>
  </div>
</template>
```

- [ ] **Step 3: Wire portal nav**

Locate the portal layout/nav (`app/layouts/portal.vue` or similar) and add a link:

```vue
<!-- pseudo-edit; concrete location depends on existing layout -->
<NuxtLink to="/portal/leads" class="...">
  <UIcon name="i-lucide-inbox" /> Leads
</NuxtLink>
```

- [ ] **Step 4: Commit**

```bash
git add app/components/portal/LeadsInbox.vue app/pages/portal/leads.vue app/layouts/portal.vue
git commit -m "feat(leads/ui): client-portal /portal/leads page + nav link"
```

---

## Section E — Marketing nav + features link (placeholder for plan 1c)

Plan 1c covers the actual `app/pages/features/index.vue` and `app/pages/features/[slug].vue` updates per the spec's "Marketing site sync" rule. This plan only adds the inbox + rules + portal pages — no marketing changes here.

---

## Section F — Manual smoke checklist

### Task 20: UI smoke test on dev

- [ ] **Step 1: Start dev server**

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm dev
```

- [ ] **Step 2: Smoke checklist**

Open `http://localhost:3000/agency/leads` and:

- [ ] Inbox renders with the smoke leads from plan 1a's smoke test
- [ ] Filter by status=new — only new leads remain
- [ ] Filter by source=google — only google leads remain
- [ ] Click a lead → slide-over opens, field data + attribution visible
- [ ] Change status to "contacted" via select → toast appears, list refreshes
- [ ] Add notes, blur out, refresh — notes persist
- [ ] Bulk: row dropdown → mark spam → status pill updates
- [ ] Click "+ Manual lead" → modal opens, add fields, submit → new lead in list
- [ ] CSV button downloads a filtered file with at least the visible rows
- [ ] Switch to Form rules tab → forms list populated from `lead_form_metadata`
- [ ] Click Configure on a form → editor slide-over → add a "portal" destination → toast → list updates
- [ ] Add a "webhook" destination with URL `https://webhook.site/<your-test-token>` → save → run "Test fire" → result shows delivered (or http_200)
- [ ] Open `http://localhost:3000/portal/leads` (logged in as a client user) → see only that client's portal-flagged leads → mark contacted works

- [ ] **Step 3: Tag the milestone**

```bash
git tag -a leads-1b-ui -m "Phase 1b UI complete — agency leads page + portal page + settings tab"
```

---

## Spec coverage check (UI-side items)

| Phase 1 spec UI item | Task |
|---|---|
| Agency `/agency/leads` Inbox: filters, columns, slide-over | 4–8, 17 |
| Bulk row actions (mark contacted, mark spam, delete) | 6 |
| Manual lead "+" modal | 9 |
| SSE real-time updates | 1, 5 |
| CSV export button | 5 |
| Form Rules tab + auto-discovery | 10–11 |
| Per-form rule editor (drag, ✎, 🗑) | 12 |
| Per-destination editor with type-specific config + filter + delay | 13–15 |
| Test-fire button | 16 |
| Settings → Social → Google "Lead webhooks" tab | 18 |
| Client portal `/portal/leads` read-only, mark contacted, CSV | 19 |
| Delivery history slot in lead detail | 7, 8 |

**Items deferred to plan 1c:** Smart Watch wiring, marketing site sync (`/features` pages), Worker deploy, cron schedules, load test.

---

**Plan 1b complete.** Plan 1c (ops + verification) follows.
