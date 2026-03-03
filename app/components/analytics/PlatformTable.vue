<script setup lang="ts">
const props = defineProps<{
  platforms: Array<{
    platform: string
    displayName: string
    color: string
    spend: number
    budget?: number
    rollingCount?: number
    impressions: number
    clicks: number
    conversions: number
    revenue: number
    cpc: number | null
    cpm: number | null
    ctr: number | null
    roas: number | null
    campaignCount: number
    pctOfTotal: number
  }>
  loading?: boolean
}>()

const { fmtCurrency, fmtCompact, fmtPercent, getPlatformIcon } = useAnalytics()

const sortKey = ref('spend')
const sortDir = ref<'desc' | 'asc'>('desc')

const sorted = computed(() => {
  if (!props.platforms) return []
  return [...props.platforms].sort((a: any, b: any) => {
    const av = a[sortKey.value] ?? 0
    const bv = b[sortKey.value] ?? 0
    return sortDir.value === 'desc' ? bv - av : av - bv
  })
})

function toggleSort(key: string) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}

const columns = [
  { key: 'platform', label: 'Platform' },
  { key: 'spend', label: 'Spend' },
  { key: 'budget', label: 'Budget' },
  { key: 'variance', label: 'Variance' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpc', label: 'CPC' },
  { key: 'conversions', label: 'Conv.' },
  { key: 'pctOfTotal', label: '% of Total' },
]
</script>

<template>
  <div class="border border-default rounded-lg overflow-hidden">
    <div v-if="loading" class="p-4 space-y-3">
      <USkeleton v-for="i in 4" :key="i" class="h-10 w-full rounded" />
    </div>
    <table v-else class="w-full text-sm">
      <thead>
        <tr class="border-b border-default bg-elevated/30">
          <th
            v-for="col in columns"
            :key="col.key"
            class="px-3 py-2.5 text-left text-xs font-medium text-muted cursor-pointer hover:text-default transition-colors"
            :class="col.key !== 'platform' ? 'text-right' : ''"
            @click="toggleSort(col.key)"
          >
            <div class="flex items-center gap-1" :class="col.key !== 'platform' ? 'justify-end' : ''">
              {{ col.label }}
              <UIcon
                v-if="sortKey === col.key"
                :name="sortDir === 'desc' ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
                class="w-3 h-3"
              />
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in sorted"
          :key="row.platform"
          class="border-b border-default/50 hover:bg-elevated/30 transition-colors"
        >
          <td class="px-3 py-2.5">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: row.color }" />
              <UIcon :name="getPlatformIcon(row.platform)" class="w-4 h-4 text-muted shrink-0" />
              <span class="font-medium">{{ row.displayName }}</span>
              <UBadge variant="subtle" color="neutral" size="xs">{{ row.campaignCount }}</UBadge>
            </div>
          </td>
          <td class="px-3 py-2.5 text-right tabular-nums font-medium">{{ fmtCurrency(row.spend) }}</td>
          <td class="px-3 py-2.5 text-right tabular-nums text-muted">
            <div class="flex items-center gap-1 justify-end">
              <UIcon v-if="(row.rollingCount ?? 0) > 0" name="i-lucide-repeat" class="w-3 h-3 text-primary shrink-0" :title="`${row.rollingCount} rolling`" />
              {{ (row.budget ?? 0) > 0 ? fmtCurrency(row.budget!) : '-' }}
            </div>
          </td>
          <td class="px-3 py-2.5 text-right tabular-nums">
            <template v-if="(row.budget ?? 0) > 0">
              <span :class="(row.budget! - row.spend) >= 0 ? 'text-green-500' : 'text-red-500'">
                {{ fmtCurrency(row.budget! - row.spend) }}
              </span>
            </template>
            <span v-else class="text-muted">-</span>
          </td>
          <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtCompact(row.impressions) }}</td>
          <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtCompact(row.clicks) }}</td>
          <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtPercent(row.ctr) }}</td>
          <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtCurrency(row.cpc, 2) }}</td>
          <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtCompact(row.conversions) }}</td>
          <td class="px-3 py-2.5 text-right">
            <div class="flex items-center gap-2 justify-end">
              <div class="w-16 h-1.5 bg-default rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full"
                  :style="{ width: `${Math.min(100, row.pctOfTotal)}%`, backgroundColor: row.color }"
                />
              </div>
              <span class="text-xs tabular-nums text-muted w-10 text-right">{{ row.pctOfTotal.toFixed(1) }}%</span>
            </div>
          </td>
        </tr>
        <tr v-if="!sorted.length">
          <td :colspan="columns.length" class="px-3 py-8 text-center text-muted">
            No platform data for selected period
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
