<script setup lang="ts">
const props = defineProps<{
  startDate: string
  endDate: string
  platforms?: string[]
  clientId?: string | null
}>()

const { fmtCurrency, fmtCompact, fmtPercent, getPlatformIcon, getPlatformLabel } = useAnalytics()

const search = ref('')
const sortBy = ref('spend')
const sortDir = ref<'desc' | 'asc'>('desc')
const page = ref(1)
const pageSize = 20

const apiQuery = computed(() => {
  const q: Record<string, string> = {
    startDate: props.startDate,
    endDate: props.endDate,
    sortBy: sortBy.value,
    sortDir: sortDir.value,
    limit: String(pageSize),
    offset: String((page.value - 1) * pageSize),
  }
  if (props.platforms?.length) q.platform = props.platforms.join(',')
  if (props.clientId) q.clientId = props.clientId
  if (search.value.trim()) q.search = search.value.trim()
  return q
})

const { data, status } = useFetch('/api/agency/analytics/campaigns', {
  query: apiQuery,
  watch: [apiQuery],
})

const campaigns = computed(() => (data.value as any)?.campaigns || [])
const total = computed(() => (data.value as any)?.total || 0)
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

const columns = [
  { key: 'campaignName', label: 'Campaign' },
  { key: 'spend', label: 'Spend' },
  { key: 'impressions', label: 'Impr.' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpc', label: 'CPC' },
  { key: 'conversions', label: 'Conv.' },
  { key: 'roas', label: 'ROAS' },
]

// Reset page on search change
watch(search, () => { page.value = 1 })
</script>

<template>
  <div>
    <!-- Header with search -->
    <div class="flex items-center gap-3 mb-3">
      <h3 class="text-sm font-semibold text-default">Top Campaigns</h3>
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
              @click="toggleSort(col.key === 'campaignName' ? 'campaign_name' : col.key)"
            >
              <div class="flex items-center gap-1" :class="col.key !== 'campaignName' ? 'justify-end' : ''">
                {{ col.label }}
                <UIcon
                  v-if="sortBy === (col.key === 'campaignName' ? 'campaign_name' : col.key)"
                  :name="sortDir === 'desc' ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
                  class="w-3 h-3"
                />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in campaigns"
            :key="row.campaignId"
            class="border-b border-default/50 hover:bg-elevated/30 transition-colors"
          >
            <td class="px-3 py-2.5 max-w-[280px]">
              <div class="flex items-center gap-2">
                <UIcon :name="getPlatformIcon(row.platform)" class="w-4 h-4 text-muted shrink-0" />
                <span class="truncate font-medium" :title="row.campaignName">{{ row.campaignName }}</span>
                <UBadge v-if="row.campaignStatus" variant="subtle" color="neutral" size="xs">{{ row.campaignStatus }}</UBadge>
              </div>
              <p class="text-xs text-muted mt-0.5 pl-6">{{ row.clientName }}</p>
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums font-medium">{{ fmtCurrency(row.spend) }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtCompact(row.impressions) }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtCompact(row.clicks) }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtPercent(row.ctr) }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtCurrency(row.cpc, 2) }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtCompact(row.conversions) }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ row.roas != null ? row.roas.toFixed(2) + 'x' : '-' }}</td>
          </tr>
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
      <UPagination v-model="page" :total="total" :items-per-page="pageSize" size="sm" />
    </div>
  </div>
</template>
