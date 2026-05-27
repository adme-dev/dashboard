<script setup lang="ts">
const props = withDefaults(defineProps<{
  startDate: string
  endDate: string
  platforms?: string[]
  clientId?: string | null
  apiBase?: string
  hideColumns?: string[]
  showLeadColumns?: boolean
  leadLinkBase?: string
}>(), {
  apiBase: '/api/agency/analytics',
  hideColumns: () => [],
  showLeadColumns: false,
  leadLinkBase: ''
})

const { fmtCurrency, fmtCompact, fmtPercent, getPlatformIcon, getPlatformLabel } = useAnalytics()

const search = ref('')
const sortBy = ref('spend')
const sortDir = ref<'desc' | 'asc'>('desc')
const page = ref(1)
const pageSize = 20
const expandedId = ref<string | null>(null)

interface CampaignRow {
  campaignId: string
  campaignName: string
  platform: string
  campaignStatus?: string | null
  [key: string]: unknown
}

interface CampaignsResponse {
  campaigns: CampaignRow[]
  total: number
}

// Client-side cache to avoid re-fetching on collapse/re-expand
const cache = reactive<Map<string, {
  breakdowns?: Record<string, unknown[]>
  creatives?: unknown[]
  aiSummary?: string | null
  extraMetrics?: Record<string, unknown> | null
}>>(new Map())

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function getCacheEntry(mediaSpendId: string) {
  return cache.get(mediaSpendId)
}

function onBreakdownsLoaded(mediaSpendId: string, payload: { breakdowns: Record<string, unknown[]>, extraMetrics: Record<string, unknown> | null }) {
  // Spread into new object so reactive Map detects the change
  cache.set(mediaSpendId, { ...(cache.get(mediaSpendId) || {}), breakdowns: payload.breakdowns, extraMetrics: payload.extraMetrics })
}

function onCreativesLoaded(mediaSpendId: string, creatives: unknown[]) {
  cache.set(mediaSpendId, { ...(cache.get(mediaSpendId) || {}), creatives })
}

function onAiSummaryLoaded(mediaSpendId: string, summary: string | null) {
  cache.set(mediaSpendId, { ...(cache.get(mediaSpendId) || {}), aiSummary: summary })
}

function statusColor(status: string | null): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (!status) return 'neutral'
  const s = status.toUpperCase()
  if (s === 'ACTIVE' || s === 'ENABLED' || s === 'DELIVERING') return 'success'
  if (s === 'PAUSED' || s === 'LIMITED') return 'warning'
  if (s === 'DRAFT' || s === 'NOT_DELIVERING' || s === 'PENDING_REVIEW' || s === 'IN_PROCESS' || s === 'WITH_ISSUES') return 'info'
  if (s === 'DELETED' || s === 'ARCHIVED' || s === 'REMOVED' || s === 'DISAPPROVED') return 'error'
  return 'neutral'
}

const apiQuery = computed(() => {
  const q: Record<string, string> = {
    startDate: props.startDate,
    endDate: props.endDate,
    sortBy: sortBy.value,
    sortDir: sortDir.value,
    limit: String(pageSize),
    offset: String((page.value - 1) * pageSize)
  }
  if (props.platforms?.length) q.platform = props.platforms.join(',')
  if (props.clientId) q.clientId = props.clientId
  if (search.value.trim()) q.search = search.value.trim()
  return q
})

const { data, status } = useFetch<CampaignsResponse>(() => `${props.apiBase}/campaigns`, {
  query: apiQuery,
  watch: [apiQuery]
})

const campaigns = computed(() => data.value?.campaigns || [])
const total = computed(() => data.value?.total || 0)
const totalPages = computed(() => Math.ceil(total.value / pageSize))

function toggleSort(key: string) {
  if (sortBy.value === key) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortBy.value = key
    sortDir.value = 'desc'
  }
  page.value = 1
}

function sortKeyForColumn(key: string): string {
  if (key === 'campaignName') return 'campaign_name'
  if (key === 'leadCount') return 'lead_count'
  if (key === 'costPerLead') return 'cost_per_lead'
  return key
}

const allColumns = [
  { key: 'campaignName', label: 'Campaign' },
  { key: 'spend', label: 'Spend' },
  { key: 'budget', label: 'Budget' },
  { key: 'variance', label: 'Variance' },
  { key: 'impressions', label: 'Impr.' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpc', label: 'CPC' },
  { key: 'conversions', label: 'Conv.' },
  { key: 'leadCount', label: 'Leads' },
  { key: 'costPerLead', label: 'Cost / Lead' }
]

const columns = computed(() =>
  allColumns.filter((c) => {
    if (!props.showLeadColumns && ['leadCount', 'costPerLead'].includes(c.key)) return false
    return !props.hideColumns.includes(c.key)
  })
)

function showColumn(key: string): boolean {
  return !props.hideColumns.includes(key)
}

function leadSourceForPlatform(platform: string): string | null {
  if (platform === 'google_ads') return 'google'
  if (platform === 'meta') return 'meta'
  return null
}

function leadLinkForCampaign(row: CampaignRow): string {
  if (!props.leadLinkBase) return ''
  const params = new URLSearchParams({
    from: props.startDate,
    to: props.endDate,
    campaign: String(row.campaignName || '')
  })
  if (row.campaignId) params.set('campaignId', String(row.campaignId))
  const clientId = props.clientId || row.clientId
  if (clientId) params.set('client_id', String(clientId))
  const source = leadSourceForPlatform(row.platform)
  if (source) params.set('source', source)
  return `${props.leadLinkBase}?${params.toString()}`
}

function hasLeads(row: CampaignRow): boolean {
  return Number(row.leadCount || 0) > 0
}

// Reset page on search change
watch(search, () => {
  page.value = 1
})
</script>

<template>
  <div>
    <!-- Header with search -->
    <div class="flex items-center gap-3 mb-3">
      <h3 class="text-sm font-semibold text-default">
        Top Campaigns
      </h3>
      <span class="text-xs text-muted">{{ total }} total</span>
      <div class="ml-auto w-56">
        <UInput
          v-model="search"
          placeholder="Search campaigns..."
          icon="i-lucide-search"
          size="sm"
        />
      </div>
    </div>

    <!-- Table -->
    <div class="border border-default rounded-lg overflow-hidden">
      <div v-if="status === 'pending'" class="p-4 space-y-3">
        <USkeleton v-for="i in 5" :key="i" class="h-10 w-full rounded" />
      </div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-default bg-elevated/30">
            <th
              v-for="col in columns"
              :key="col.key"
              class="px-3 py-2.5 text-left text-xs font-medium text-muted cursor-pointer hover:text-default transition-colors"
              :class="col.key !== 'campaignName' ? 'text-right' : ''"
              @click="toggleSort(sortKeyForColumn(col.key))"
            >
              <div class="flex items-center gap-1" :class="col.key !== 'campaignName' ? 'justify-end' : ''">
                {{ col.label }}
                <UIcon
                  v-if="sortBy === sortKeyForColumn(col.key)"
                  :name="sortDir === 'desc' ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
                  class="w-3 h-3"
                />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in campaigns" :key="row.campaignId">
            <tr
              class="border-b border-default/50 hover:bg-elevated/30 transition-colors cursor-pointer"
              @click="toggleExpand(row.campaignId)"
            >
              <td class="px-3 py-2.5 max-w-[280px]">
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="expandedId === row.campaignId ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                    class="w-3.5 h-3.5 text-muted shrink-0"
                  />
                  <UIcon :name="getPlatformIcon(row.platform)" class="w-4 h-4 text-muted shrink-0" />
                  <span class="truncate font-medium" :title="row.campaignName">{{ row.campaignName }}</span>
                  <UBadge
                    v-if="row.campaignStatus && row.campaignStatus !== 'UNKNOWN'"
                    variant="subtle"
                    :color="statusColor(row.campaignStatus)"
                    size="xs"
                  >
                    {{ row.campaignStatus }}
                  </UBadge>
                </div>
                <p v-if="row.clientName" class="text-xs text-muted mt-0.5 pl-[3.25rem]">
                  {{ row.clientName }}
                </p>
              </td>
              <td class="px-3 py-2.5 text-right tabular-nums font-medium">
                {{ fmtCurrency(row.spend) }}
              </td>
              <td v-if="showColumn('budget')" class="px-3 py-2.5 text-right tabular-nums text-muted">
                <div class="flex items-center gap-1 justify-end">
                  <UIcon
                    v-if="row.budgetRolling"
                    name="i-lucide-repeat"
                    class="w-3 h-3 text-primary shrink-0"
                    title="Rolling budget"
                  />
                  {{ (row.budget ?? 0) > 0 ? fmtCurrency(row.budget) : '-' }}
                </div>
              </td>
              <td v-if="showColumn('variance')" class="px-3 py-2.5 text-right tabular-nums">
                <template v-if="(row.budget ?? 0) > 0">
                  <span :class="(row.budget - row.spend) >= 0 ? 'text-green-500' : 'text-red-500'">
                    {{ fmtCurrency(row.budget - row.spend) }}
                  </span>
                </template>
                <span v-else class="text-muted">-</span>
              </td>
              <td class="px-3 py-2.5 text-right tabular-nums">
                {{ fmtCompact(row.impressions) }}
              </td>
              <td class="px-3 py-2.5 text-right tabular-nums">
                {{ fmtCompact(row.clicks) }}
              </td>
              <td class="px-3 py-2.5 text-right tabular-nums">
                {{ fmtPercent(row.ctr) }}
              </td>
              <td class="px-3 py-2.5 text-right tabular-nums">
                {{ fmtCurrency(row.cpc, 2) }}
              </td>
              <td class="px-3 py-2.5 text-right tabular-nums">
                {{ fmtCompact(row.conversions) }}
              </td>
              <td v-if="showColumn('leadCount') && showLeadColumns" class="px-3 py-2.5 text-right tabular-nums">
                {{ fmtCompact(row.leadCount || 0) }}
              </td>
              <td v-if="showColumn('costPerLead') && showLeadColumns" class="px-3 py-2.5 text-right tabular-nums">
                {{ row.costPerLead != null ? fmtCurrency(row.costPerLead, 2) : '-' }}
              </td>
            </tr>

            <!-- Expanded detail row (full-width) -->
            <tr v-if="expandedId === row.campaignId" class="bg-elevated/20">
              <td :colspan="columns.length" class="px-6 py-4">
                <!-- Header with campaign name + deep link -->
                <div class="flex items-center gap-3 mb-4">
                  <UIcon :name="getPlatformIcon(row.platform)" class="w-5 h-5 text-muted shrink-0" />
                  <h3 class="text-sm font-semibold text-default truncate">
                    {{ row.campaignName }}
                  </h3>
                  <div v-if="safePublicUrl(row.deepLinkUrl)" class="shrink-0 ml-auto flex items-center gap-2">
                    <span v-if="row.campaignStatus && ['DRAFT', 'PENDING_REVIEW', 'IN_PROCESS'].includes(row.campaignStatus.toUpperCase())" class="text-[10px] text-warning flex items-center gap-1">
                      <UIcon name="i-lucide-triangle-alert" class="w-3 h-3" />
                      Campaign pending setup
                    </span>
                    <a
                      :href="safePublicUrl(row.deepLinkUrl)"
                      target="_blank"
                      rel="noopener"
                      @click.stop
                    >
                      <UButton
                        size="xs"
                        variant="outline"
                        icon="i-lucide-external-link"
                        :label="`Open in ${getPlatformLabel(row.platform)}`"
                      />
                    </a>
                  </div>
                  <UButton
                    v-if="showLeadColumns && leadLinkBase && hasLeads(row)"
                    :to="leadLinkForCampaign(row)"
                    size="xs"
                    variant="outline"
                    icon="i-lucide-inbox"
                    label="View leads"
                    class="shrink-0"
                    @click.stop
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-x"
                    class="shrink-0"
                    :class="{ 'ml-auto': !row.deepLinkUrl && !(showLeadColumns && leadLinkBase && hasLeads(row)) }"
                    @click.stop="expandedId = null"
                  />
                </div>

                <!-- KPI row -->
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
                  <div
                    v-for="metric in [
                      { label: 'CPM', value: row.cpm != null ? fmtCurrency(row.cpm, 2) : '-', icon: 'i-lucide-eye' },
                      { label: 'Cost / Conv.', value: row.costPerConversion != null ? fmtCurrency(row.costPerConversion, 2) : '-', icon: 'i-lucide-receipt' },
                      { label: 'Conv. Rate', value: row.conversionRate != null ? fmtPercent(row.conversionRate) : '-', icon: 'i-lucide-funnel' },
                      { label: 'ROAS', value: row.roas != null ? row.roas.toFixed(2) + 'x' : '-', icon: 'i-lucide-trending-up' },
                      { label: 'Revenue', value: row.revenue > 0 ? fmtCurrency(row.revenue) : '-', icon: 'i-lucide-dollar-sign' },
                      ...(showLeadColumns ? [
                        { label: 'Leads', value: fmtCompact(row.leadCount || 0), icon: 'i-lucide-inbox' },
                        { label: 'Cost / Lead', value: row.costPerLead != null ? fmtCurrency(row.costPerLead, 2) : '-', icon: 'i-lucide-user-round-check' }
                      ] : [])
                    ]"
                    :key="metric.label"
                    class="flex items-center gap-2"
                  >
                    <div class="w-6 h-6 rounded bg-elevated flex items-center justify-center shrink-0">
                      <UIcon :name="metric.icon" class="w-3 h-3 text-muted" />
                    </div>
                    <div>
                      <p class="text-[10px] text-muted font-medium leading-none mb-0.5">
                        {{ metric.label }}
                      </p>
                      <p class="text-sm font-bold tabular-nums text-default leading-none">
                        {{ metric.value }}
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Extra Metrics Row -->
                <AnalyticsExtraMetricsRow
                  v-if="getCacheEntry(row.mediaSpendId)?.extraMetrics"
                  :metrics="getCacheEntry(row.mediaSpendId)!.extraMetrics!"
                  :platform="row.platform"
                  :clicks="row.clicks"
                  class="mb-4"
                />

                <!-- Breakdowns section -->
                <div v-if="row.mediaSpendId" class="mb-4">
                  <AnalyticsBreakdownSection
                    :media-spend-id="row.mediaSpendId"
                    :platform="row.platform"
                    :api-base="apiBase"
                    :initial-data="getCacheEntry(row.mediaSpendId)?.breakdowns"
                    :initial-extra-metrics="getCacheEntry(row.mediaSpendId)?.extraMetrics"
                    @loaded="(p: { breakdowns: Record<string, unknown[]>; extraMetrics: Record<string, unknown> | null }) => onBreakdownsLoaded(row.mediaSpendId, p)"
                  />
                </div>

                <!-- Ad Creatives -->
                <div v-if="row.mediaSpendId" class="mb-4">
                  <AnalyticsCampaignCreatives
                    :media-spend-id="row.mediaSpendId"
                    :platform="row.platform"
                    :api-base="apiBase"
                    :initial-data="getCacheEntry(row.mediaSpendId)?.creatives"
                    @loaded="(c: unknown[]) => onCreativesLoaded(row.mediaSpendId, c)"
                  />
                </div>

                <!-- AI Summary -->
                <div v-if="row.mediaSpendId">
                  <AnalyticsAiSummaryCard
                    :media-spend-id="row.mediaSpendId"
                    :campaign-name="row.campaignName"
                    :platform="getPlatformLabel(row.platform)"
                    :breakdowns="getCacheEntry(row.mediaSpendId)?.breakdowns"
                    :api-base="apiBase"
                    :initial-summary="getCacheEntry(row.mediaSpendId)?.aiSummary"
                    @loaded="(s: string | null) => onAiSummaryLoaded(row.mediaSpendId, s)"
                  />
                </div>

                <!-- Campaign meta -->
                <div class="flex items-center gap-4 mt-4 pt-3 border-t border-default/50 text-xs text-muted">
                  <span class="flex items-center gap-1">
                    <UIcon :name="getPlatformIcon(row.platform)" class="w-3.5 h-3.5" />
                    {{ getPlatformLabel(row.platform) }}
                  </span>
                  <span v-if="row.campaignType">Type: {{ row.campaignType }}</span>
                  <span v-if="row.campaignStatus && row.campaignStatus !== 'UNKNOWN'">Status: {{ row.campaignStatus }}</span>
                  <span v-if="row.clientName">Client: {{ row.clientName }}</span>
                </div>
              </td>
            </tr>
          </template>
          <tr v-if="!campaigns.length">
            <td :colspan="columns.length" class="px-3 py-8 text-center text-muted">
              {{ search ? 'No campaigns matching search' : 'No campaign data for selected period' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between mt-3">
      <p class="text-xs text-muted">
        Showing {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }} of {{ total }}
      </p>
      <UPagination
        v-model:page="page"
        :total="total"
        :items-per-page="pageSize"
        size="sm"
      />
    </div>
  </div>
</template>
