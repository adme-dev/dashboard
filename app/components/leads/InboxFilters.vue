<script setup lang="ts">
import { CalendarDate, DateFormatter, getLocalTimeZone, today } from '@internationalized/date'
import type { LeadsListFilters } from '~/types/leadsUi'

const model = defineModel<LeadsListFilters>('filters', { required: true })

interface ClientOption { id: string, name: string }
interface FormOption { form_id: string, form_name: string | null, source: string }
interface UserOption { id: string, name: string }

const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
const clients = ref<ClientOption[]>([])
const forms = ref<{ items: FormOption[] }>({ items: [] })
const teamData = ref<{ members: UserOption[] }>({ members: [] })

async function refreshLookups() {
  const [clientRows, formRows, teamRows] = await Promise.all([
    apiFetch<ClientOption[]>('/api/agency/clients'),
    apiFetch<{ items: FormOption[] }>('/api/leads/forms/list'),
    apiFetch<{ members: UserOption[] }>('/api/agency/team-members'),
  ])
  clients.value = clientRows
  forms.value = formRows
  teamData.value = teamRows
}

await refreshLookups()

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'meta', label: 'Meta' },
  { value: 'google', label: 'Google' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'email', label: 'Email' },
  { value: 'csv', label: 'CSV import' },
  { value: 'manual', label: 'Manual' }
]
const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'spam_suspected', label: 'Spam?' }
]

const clientOptions = computed(() => [
  { value: 'all', label: 'All clients' },
  { value: 'unmapped', label: 'Unmapped' },
  ...((clients.value ?? []) as ClientOption[]).map(c => ({ value: c.id, label: c.name }))
])
const formOptions = computed(() => [
  { value: 'all', label: 'All forms' },
  ...(forms.value?.items ?? []).map((f: FormOption) => ({
    value: f.form_id,
    label: f.form_name || f.form_id
  }))
])
const userOptions = computed(() => [
  { value: 'all', label: 'All assignees' },
  ...((teamData.value?.members ?? []) as UserOption[]).map(u => ({ value: u.id, label: u.name }))
])

const clientSel = computed({
  get: () => model.value.unmapped ? 'unmapped' : (model.value.client_id ?? 'all'),
  set: (v: string) => {
    if (v === 'unmapped') {
      model.value.client_id = null
      model.value.unmapped = true
    } else if (v === 'all') {
      model.value.client_id = null
      model.value.unmapped = false
    } else {
      model.value.client_id = v
      model.value.unmapped = false
    }
  }
})
const sourceSel = computed({
  get: () => model.value.source ?? 'all',
  set: (v: string) => {
    model.value.source = v === 'all' ? null : v as LeadsListFilters['source']
  }
})
const statusSel = computed({
  get: () => model.value.status ?? 'all',
  set: (v: string) => {
    model.value.status = v === 'all' ? null : v as LeadsListFilters['status']
  }
})
const formSel = computed({
  get: () => model.value.form_id ?? 'all',
  set: (v: string) => { model.value.form_id = v === 'all' ? null : v }
})
const userSel = computed({
  get: () => model.value.assigned_to ?? 'all',
  set: (v: string) => { model.value.assigned_to = v === 'all' ? null : v }
})

// Date range — bridge YYYY-MM-DD string filter model with CalendarDate range
const df = new DateFormatter('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function strToCalendarDate(s: string | null | undefined): CalendarDate | undefined {
  if (!s) return undefined
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new CalendarDate(y, m, d)
}

function calendarDateToStr(cd: CalendarDate | undefined | null): string {
  if (!cd) return ''
  const m = String(cd.month).padStart(2, '0')
  const d = String(cd.day).padStart(2, '0')
  return `${cd.year}-${m}-${d}`
}

const calendarRange = computed({
  get: () => ({
    start: strToCalendarDate(model.value.from),
    end: strToCalendarDate(model.value.to)
  }),
  set: (v: { start: CalendarDate | null, end: CalendarDate | null }) => {
    model.value.from = v.start ? calendarDateToStr(v.start) : ''
    model.value.to = v.end ? calendarDateToStr(v.end) : ''
  }
})

const dateLabel = computed(() => {
  const r = calendarRange.value
  if (!r.start && !r.end) return 'Date range'
  const tz = getLocalTimeZone()
  const startStr = r.start ? df.format(r.start.toDate(tz)) : ''
  const endStr = r.end ? df.format(r.end.toDate(tz)) : ''
  if (r.start && r.end) return `${startStr} – ${endStr}`
  return startStr || endStr
})

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'This month', monthStart: true }
]

function applyPreset(preset: { days?: number, monthStart?: boolean }) {
  const tz = getLocalTimeZone()
  const end = today(tz)
  let start = end.copy()
  if (preset.days) {
    start = start.subtract({ days: preset.days })
  } else if (preset.monthStart) {
    start = new CalendarDate(end.year, end.month, 1)
  }
  calendarRange.value = { start, end }
}

function clearDates() {
  calendarRange.value = { start: null, end: null }
}

// Active-filter detection for the Clear button
const hasActiveFilters = computed(() => {
  const m = model.value
  return Boolean(
    m.q
    || m.client_id
    || m.unmapped
    || m.source
    || m.status
    || m.form_id
    || m.assigned_to
    || m.campaign_id
    || m.campaign_name
    || m.from
    || m.to
    || m.include_test
  )
})

function clearAll() {
  model.value.q = ''
  model.value.client_id = null
  model.value.unmapped = false
  model.value.source = null
  model.value.status = null
  model.value.form_id = null
  model.value.assigned_to = null
  model.value.campaign_id = null
  model.value.campaign_name = null
  model.value.from = ''
  model.value.to = ''
  model.value.include_test = false
}

function clearCampaign() {
  model.value.campaign_name = null
  model.value.campaign_id = null
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 p-3 border-b border-default bg-elevated/30">
    <UInput
      v-model="model.q"
      placeholder="Search field data..."
      icon="i-lucide-search"
      class="w-64"
    />
    <USelectMenu
      v-model="clientSel"
      :items="clientOptions"
      value-key="value"
      class="w-48"
    />
    <USelectMenu
      v-model="sourceSel"
      :items="SOURCE_OPTIONS"
      value-key="value"
      class="w-36"
    />
    <USelectMenu
      v-model="formSel"
      :items="formOptions"
      value-key="value"
      class="w-48"
    />
    <USelectMenu
      v-model="statusSel"
      :items="STATUS_OPTIONS"
      value-key="value"
      class="w-36"
    />
    <USelectMenu
      v-model="userSel"
      :items="userOptions"
      value-key="value"
      class="w-44"
    />

    <UPopover :content="{ align: 'start' }" :modal="true">
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-calendar"
        class="data-[state=open]:bg-elevated group"
      >
        <span class="truncate">{{ dateLabel }}</span>
        <template #trailing>
          <UIcon name="i-lucide-chevron-down" class="shrink-0 text-dimmed size-4 group-data-[state=open]:rotate-180 transition-transform" />
        </template>
      </UButton>
      <template #content>
        <div class="flex items-stretch sm:divide-x divide-default">
          <div class="hidden sm:flex flex-col justify-start py-2">
            <UButton
              v-for="preset in PRESETS"
              :key="preset.label"
              :label="preset.label"
              color="neutral"
              variant="ghost"
              class="rounded-none justify-start px-4"
              @click="applyPreset(preset)"
            />
            <UButton
              label="Clear"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              class="rounded-none justify-start px-4 mt-2"
              @click="clearDates"
            />
          </div>
          <UCalendar
            v-model="calendarRange"
            class="p-2"
            :number-of-months="2"
            range
          />
        </div>
      </template>
    </UPopover>

    <label class="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
      <USwitch v-model="model.include_test" size="xs" />
      Show test leads
    </label>

    <UButton
      v-if="hasActiveFilters"
      icon="i-lucide-x"
      variant="ghost"
      size="sm"
      color="neutral"
      @click="clearAll"
    >
      Clear filters
    </UButton>

    <div v-if="model.campaign_name || model.campaign_id" class="inline-flex items-center gap-1.5 rounded-md border border-default bg-default px-2 py-1 text-xs">
      <UIcon name="i-lucide-megaphone" class="size-3.5 text-muted" />
      <span class="max-w-56 truncate">{{ model.campaign_name || model.campaign_id }}</span>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="link"
        size="xs"
        class="p-0 text-muted hover:text-default"
        aria-label="Clear campaign filter"
        @click="clearCampaign"
      />
    </div>
  </div>
</template>
