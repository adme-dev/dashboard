<script setup lang="ts">
import { format } from 'date-fns'

interface PortalLead {
  id: string
  source: string
  form_name: string | null
  submitted_at: string
  field_data: Record<string, unknown>
  attribution?: Record<string, unknown> | null
  status: string
  contacted_at: string | null
  campaign_name: string | null
  ad_name: string | null
  score?: number | null
  score_reasons?: unknown
}

interface LeadsResponse {
  items: PortalLead[]
  total: number
  stats: Array<{ status: string, count: string }>
  sourceStats: Array<{ source: string, count: string }>
  responseSummary: {
    total: string
    contacted: string
    qualified: string
    won: string
    avg_response_minutes: string | null
  } | null
}

const status = ref<string>('all')
const source = ref<string>('all')
const search = ref('')
const campaign = ref('')
const campaignId = ref('')
const from = ref('')
const to = ref('')
const page = ref(1)
const selectedLeadId = ref<string | null>(null)
const PAGE_SIZE = 50
const route = useRoute()
const router = useRouter()

if (typeof route.query.status === 'string') status.value = route.query.status
if (typeof route.query.source === 'string') source.value = route.query.source
if (typeof route.query.search === 'string') search.value = route.query.search
if (typeof route.query.leadId === 'string') selectedLeadId.value = route.query.leadId
if (typeof route.query.campaign === 'string') campaign.value = route.query.campaign
if (typeof route.query.campaignId === 'string') campaignId.value = route.query.campaignId
else if (typeof route.query.campaign_id === 'string') campaignId.value = route.query.campaign_id
if (typeof route.query.from === 'string') from.value = route.query.from
if (typeof route.query.to === 'string') to.value = route.query.to
if (typeof route.query.page === 'string') page.value = Math.max(1, Number.parseInt(route.query.page, 10) || 1)

const params = computed(() => {
  const p: Record<string, string> = { page: String(page.value), page_size: String(PAGE_SIZE) }
  if (status.value !== 'all') p.status = status.value
  if (source.value !== 'all') p.source = source.value
  if (search.value.trim()) p.search = search.value.trim()
  if (campaign.value.trim()) p.campaign = campaign.value.trim()
  if (campaignId.value.trim()) p.campaignId = campaignId.value.trim()
  if (from.value) p.from = from.value
  if (to.value) p.to = to.value
  return p
})

const exportParams = computed(() => {
  const p = { ...params.value }
  delete p.page
  delete p.page_size
  return p
})

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown, query?: Record<string, unknown> }
) => Promise<T>
const data = ref<LeadsResponse>({ items: [], total: 0, stats: [], sourceStats: [], responseSummary: null })
const pending = ref(false)

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<LeadsResponse>('/api/client-portal/leads/list', { query: params.value })
  } catch {
    // Keep the current list visible during transient refresh failures.
  } finally {
    pending.value = false
  }
}

const selectedUrl = computed(() => selectedLeadId.value ? `/api/client-portal/leads/${selectedLeadId.value}` : null)
const selectedData = ref<{ lead: PortalLead } | null>(null)
const selectedPending = ref(false)

async function refreshSelected() {
  if (!selectedUrl.value) {
    selectedData.value = null
    return
  }
  selectedPending.value = true
  try {
    selectedData.value = await apiFetch<{ lead: PortalLead }>(selectedUrl.value)
  } catch {
    selectedData.value = null
  } finally {
    selectedPending.value = false
  }
}

await refresh()

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' }
]
const SOURCE_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'google', label: 'Google' },
  { value: 'meta', label: 'Meta' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'csv', label: 'CSV' }
]
const toast = useToast()

const columns = [
  { accessorKey: 'submitted_at', header: 'When' },
  { accessorKey: 'source', header: 'Source' },
  { accessorKey: 'form_name', header: 'Form' },
  { accessorKey: 'summary', header: 'Lead' },
  { accessorKey: 'campaign_name', header: 'Campaign' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'actions', header: '' }
]

function summarize(l: PortalLead): string {
  const f = l.field_data ?? {}
  return [
    f.full_name,
    f.name,
    f.email,
    f.phone_number ?? f.phone
  ].filter(Boolean).slice(0, 2).map(String).join(' · ')
}

async function markContacted(l: PortalLead) {
  await apiFetch(`/api/client-portal/leads/${l.id}/contacted`, { method: 'POST' })
  toast.add({ title: 'Marked contacted', color: 'success' })
  await refresh()
  if (selectedLeadId.value === l.id) await refreshSelected()
}

function sourceIcon(s: string) {
  if (s === 'google') return 'i-lucide-chrome'
  if (s === 'meta') return 'i-lucide-badge'
  if (s === 'webhook') return 'i-lucide-webhook'
  if (s === 'csv') return 'i-lucide-file-spreadsheet'
  return 'i-lucide-inbox'
}

function statusColor(s: string) {
  if (s === 'new') return 'info'
  if (s === 'contacted') return 'primary'
  if (s === 'qualified') return 'warning'
  if (s === 'won') return 'success'
  if (s === 'lost') return 'neutral'
  return 'error'
}

function openLead(l: PortalLead) {
  selectedLeadId.value = l.id
}

function formatFieldLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatFieldValue(value: unknown) {
  if (value == null || value === '') return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function downloadCsv() {
  const query = new URLSearchParams(exportParams.value)
  window.open(`/api/client-portal/leads/export?${query.toString()}`, '_blank')
}

function clearCampaignFilter() {
  campaign.value = ''
  campaignId.value = ''
  from.value = ''
  to.value = ''
}

function syncRouteQuery() {
  const query: Record<string, string> = {}
  if (status.value !== 'all') query.status = status.value
  if (source.value !== 'all') query.source = source.value
  if (search.value.trim()) query.search = search.value.trim()
  if (campaign.value.trim()) query.campaign = campaign.value.trim()
  if (campaignId.value.trim()) query.campaignId = campaignId.value.trim()
  if (from.value) query.from = from.value
  if (to.value) query.to = to.value
  if (page.value > 1) query.page = String(page.value)
  if (selectedLeadId.value) query.leadId = selectedLeadId.value

  const current = new URLSearchParams(route.query as Record<string, string>).toString()
  const next = new URLSearchParams(query).toString()
  if (current !== next) {
    router.replace({ query })
  }
}

const selectedLead = computed(() => selectedData.value?.lead ?? null)
const statsByStatus = computed(() => Object.fromEntries((data.value?.stats ?? []).map(s => [s.status, Number(s.count)])))
const sourceBreakdown = computed(() => (data.value?.sourceStats ?? []).map(item => ({
  source: item.source,
  count: Number(item.count || 0)
})))
const responseSummary = computed(() => {
  const summary = data.value?.responseSummary
  const total = Number(summary?.total || 0)
  const contacted = Number(summary?.contacted || 0)
  return {
    total,
    contacted,
    qualified: Number(summary?.qualified || 0),
    won: Number(summary?.won || 0),
    contactedRate: total > 0 ? Math.round((contacted / total) * 100) : 0,
    avgResponseMinutes: summary?.avg_response_minutes == null
      ? null
      : Math.round(Number(summary.avg_response_minutes))
  }
})
const visibleRange = computed(() => {
  const total = data.value?.total ?? 0
  if (!total) return '0'
  const start = (page.value - 1) * PAGE_SIZE + 1
  const end = Math.min(page.value * PAGE_SIZE, total)
  return `${start}-${end}`
})

watch([status, source, search, campaign, campaignId, from, to], () => {
  page.value = 1
})
watch(params, () => {
  void refresh()
})
watch(selectedLeadId, async (id) => {
  if (id) await refreshSelected()
  else selectedData.value = null
}, { immediate: true })
watch([status, source, search, campaign, campaignId, from, to, page, selectedLeadId], syncRouteQuery)
watch(
  () => route.query,
  (query) => {
    status.value = typeof query.status === 'string' ? query.status : 'all'
    source.value = typeof query.source === 'string' ? query.source : 'all'
    search.value = typeof query.search === 'string' ? query.search : ''
    campaign.value = typeof query.campaign === 'string' ? query.campaign : ''
    campaignId.value = typeof query.campaignId === 'string'
      ? query.campaignId
      : typeof query.campaign_id === 'string' ? query.campaign_id : ''
    from.value = typeof query.from === 'string' ? query.from : ''
    to.value = typeof query.to === 'string' ? query.to : ''
    page.value = typeof query.page === 'string' ? Math.max(1, Number.parseInt(query.page, 10) || 1) : 1
    selectedLeadId.value = typeof query.leadId === 'string' ? query.leadId : null
  }
)
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 py-3 border-b border-default bg-muted/20">
      <div class="rounded-lg border border-default bg-default p-3">
        <p class="text-xs text-muted">
          Visible leads
        </p>
        <p class="text-2xl font-semibold">
          {{ data?.total ?? 0 }}
        </p>
      </div>
      <div class="rounded-lg border border-default bg-default p-3">
        <p class="text-xs text-muted">
          New
        </p>
        <p class="text-2xl font-semibold">
          {{ statsByStatus.new ?? 0 }}
        </p>
      </div>
      <div class="rounded-lg border border-default bg-default p-3">
        <p class="text-xs text-muted">
          Contacted
        </p>
        <p class="text-2xl font-semibold">
          {{ responseSummary.contactedRate }}%
        </p>
      </div>
      <div class="rounded-lg border border-default bg-default p-3">
        <p class="text-xs text-muted">
          Won
        </p>
        <p class="text-2xl font-semibold">
          {{ statsByStatus.won ?? 0 }}
        </p>
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 py-3 border-b border-default bg-default">
      <div class="rounded-lg border border-default bg-default p-3">
        <p class="text-xs text-muted">
          Contacted leads
        </p>
        <p class="text-lg font-semibold">
          {{ responseSummary.contacted }}
        </p>
      </div>
      <div class="rounded-lg border border-default bg-default p-3">
        <p class="text-xs text-muted">
          Qualified
        </p>
        <p class="text-lg font-semibold">
          {{ responseSummary.qualified }}
        </p>
      </div>
      <div class="rounded-lg border border-default bg-default p-3">
        <p class="text-xs text-muted">
          Avg response
        </p>
        <p class="text-lg font-semibold">
          {{ responseSummary.avgResponseMinutes == null ? '-' : `${responseSummary.avgResponseMinutes}m` }}
        </p>
      </div>
      <div class="rounded-lg border border-default bg-default p-3">
        <p class="text-xs text-muted">
          Won rate
        </p>
        <p class="text-lg font-semibold">
          {{ responseSummary.total > 0 ? `${Math.round((responseSummary.won / responseSummary.total) * 100)}%` : '0%' }}
        </p>
      </div>
    </div>

    <div class="flex flex-col gap-3 px-4 py-3 border-b border-default lg:flex-row lg:items-center lg:justify-between">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search name, email, phone, campaign"
          class="w-full sm:w-80"
        />
        <USelectMenu
          v-model="status"
          :items="STATUS_OPTIONS"
          value-key="value"
          class="w-full sm:w-36"
        />
        <USelectMenu
          v-model="source"
          :items="SOURCE_OPTIONS"
          value-key="value"
          class="w-full sm:w-40"
        />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted">{{ visibleRange }} of {{ data?.total ?? 0 }}</span>
        <UButton
          size="sm"
          variant="ghost"
          icon="i-lucide-download"
          @click="downloadCsv"
        >
          CSV
        </UButton>
        <UButton
          size="sm"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          @click="refresh()"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <div v-if="campaign || from || to" class="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-default bg-elevated/20">
      <span v-if="campaign" class="inline-flex items-center gap-1.5 rounded-md border border-default bg-default px-2 py-1 text-xs">
        <UIcon name="i-lucide-megaphone" class="size-3.5 text-muted" />
        {{ campaign }}
      </span>
      <span v-if="from || to" class="inline-flex items-center gap-1.5 rounded-md border border-default bg-default px-2 py-1 text-xs">
        <UIcon name="i-lucide-calendar" class="size-3.5 text-muted" />
        {{ from || 'Start' }} to {{ to || 'Today' }}
      </span>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-x"
        @click="clearCampaignFilter"
      >
        Clear campaign filter
      </UButton>
    </div>

    <div v-if="sourceBreakdown.length" class="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-default bg-default">
      <span class="text-xs font-medium text-muted">Source mix</span>
      <button
        v-for="item in sourceBreakdown"
        :key="item.source"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-default px-2 py-1 text-xs transition-colors hover:bg-elevated"
        :class="source === item.source ? 'bg-elevated text-primary' : 'bg-default'"
        @click="source = item.source"
      >
        <UIcon :name="sourceIcon(item.source)" class="size-3.5 text-muted" />
        <span class="capitalize">{{ item.source }}</span>
        <span class="font-semibold">{{ item.count }}</span>
      </button>
      <UButton
        v-if="source !== 'all'"
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-x"
        @click="source = 'all'"
      >
        All sources
      </UButton>
    </div>

    <div class="flex-1 overflow-auto">
      <UTable :data="data?.items ?? []" :columns="columns" :loading="pending">
        <template #submitted_at-cell="{ row }">
          <span class="text-sm whitespace-nowrap">{{ format(new Date(row.original.submitted_at), 'MMM d, HH:mm') }}</span>
        </template>
        <template #source-cell="{ row }">
          <span class="inline-flex items-center gap-1.5 text-sm capitalize">
            <UIcon :name="sourceIcon(row.original.source)" class="size-4 text-muted" />
            {{ row.original.source }}
          </span>
        </template>
        <template #form_name-cell="{ row }">
          <span class="text-sm">{{ row.original.form_name || '-' }}</span>
        </template>
        <template #summary-cell="{ row }">
          <button
            type="button"
            class="text-sm text-left hover:text-primary"
            @click="openLead(row.original)"
          >
            {{ summarize(row.original) || 'Open lead' }}
          </button>
        </template>
        <template #campaign_name-cell="{ row }">
          <div class="max-w-56">
            <p class="text-sm truncate">
              {{ row.original.campaign_name || '-' }}
            </p>
            <p v-if="row.original.ad_name" class="text-xs text-muted truncate">
              {{ row.original.ad_name }}
            </p>
          </div>
        </template>
        <template #status-cell="{ row }">
          <UBadge variant="soft" size="sm" :color="statusColor(row.original.status)">
            {{ row.original.status }}
          </UBadge>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-eye"
              aria-label="View lead"
              @click="openLead(row.original)"
            />
            <UButton
              v-if="row.original.status === 'new'"
              size="xs"
              variant="ghost"
              icon="i-lucide-check"
              @click="markContacted(row.original)"
            >
              Contacted
            </UButton>
          </div>
        </template>
        <template #empty>
          <div class="py-14 text-center">
            <UIcon name="i-lucide-inbox" class="mx-auto size-8 text-muted" />
            <p class="mt-3 text-sm font-medium">
              No shared leads yet
            </p>
            <p class="mt-1 text-sm text-muted">
              Leads appear here once your agency routes a connected form to your portal.
            </p>
          </div>
        </template>
      </UTable>
    </div>

    <div class="border-t border-default p-3 flex items-center justify-end">
      <UPagination
        v-model:page="page"
        :total="data?.total ?? 0"
        :items-per-page="PAGE_SIZE"
        :sibling-count="1"
      />
    </div>

    <USlideover
      :open="Boolean(selectedLeadId)"
      title="Lead details"
      description="Client-visible inquiry record"
      @update:open="value => { if (!value) selectedLeadId = null }"
    >
      <template #body>
        <div v-if="selectedPending" class="py-12 text-center text-sm text-muted">
          Loading lead...
        </div>
        <div v-else-if="selectedLead" class="space-y-6">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm text-muted">
                {{ format(new Date(selectedLead.submitted_at), 'MMM d, yyyy h:mm a') }}
              </p>
              <h2 class="mt-1 text-lg font-semibold">
                {{ summarize(selectedLead) || selectedLead.form_name || 'Lead' }}
              </h2>
            </div>
            <UBadge variant="soft" :color="statusColor(selectedLead.status)">
              {{ selectedLead.status }}
            </UBadge>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">
                Source
              </p>
              <p class="mt-1 text-sm font-medium capitalize">
                {{ selectedLead.source }}
              </p>
            </div>
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">
                Form
              </p>
              <p class="mt-1 text-sm font-medium">
                {{ selectedLead.form_name || '-' }}
              </p>
            </div>
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">
                Campaign
              </p>
              <p class="mt-1 text-sm font-medium">
                {{ selectedLead.campaign_name || '-' }}
              </p>
            </div>
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">
                Ad
              </p>
              <p class="mt-1 text-sm font-medium">
                {{ selectedLead.ad_name || '-' }}
              </p>
            </div>
          </div>

          <div>
            <h3 class="text-sm font-semibold">
              Contact fields
            </h3>
            <dl class="mt-2 divide-y divide-default rounded-lg border border-default">
              <div
                v-for="[key, value] in Object.entries(selectedLead.field_data ?? {})"
                :key="key"
                class="grid grid-cols-3 gap-3 p-3"
              >
                <dt class="text-xs text-muted">
                  {{ formatFieldLabel(key) }}
                </dt>
                <dd class="col-span-2 text-sm break-words">
                  {{ formatFieldValue(value) }}
                </dd>
              </div>
            </dl>
          </div>

          <div v-if="selectedLead.status === 'new'" class="pt-2">
            <UButton icon="i-lucide-check" block @click="markContacted(selectedLead)">
              Mark contacted
            </UButton>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
