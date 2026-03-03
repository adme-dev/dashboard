<script setup lang="ts">
const props = defineProps<{
  clients: Array<{
    clientId: string
    clientName: string
    spend: number
    budget?: number
    rollingCount?: number
    platforms: string[]
    campaignCount: number
    cpc: number | null
    ctr: number | null
  }>
  loading?: boolean
  startDate?: string
  endDate?: string
}>()

const { fmtCurrency, fmtPercent, fmtCompact, getPlatformIcon, getPlatformColor, getPlatformLabel } = useAnalytics()

const expandedId = ref<string | null>(null)
const expandedData = ref<any>(null)
const expandedLoading = ref(false)

async function toggle(id: string) {
  if (expandedId.value === id) {
    expandedId.value = null
    expandedData.value = null
    return
  }

  expandedId.value = id
  expandedData.value = null

  if (!props.startDate || !props.endDate) return

  expandedLoading.value = true
  try {
    const data = await $fetch('/api/agency/analytics/overview', {
      query: { startDate: props.startDate, endDate: props.endDate, clientId: id },
    })
    expandedData.value = data
  } catch {
    expandedData.value = null
  } finally {
    expandedLoading.value = false
  }
}

const expandedPlatforms = computed(() => expandedData.value?.byPlatform || [])

const sortKey = ref('spend')
const sortDir = ref<'desc' | 'asc'>('desc')

const sorted = computed(() => {
  if (!props.clients) return []
  return [...props.clients].sort((a: any, b: any) => {
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

const totalSpend = computed(() => (props.clients || []).reduce((s, c) => s + c.spend, 0))
</script>

<template>
  <div class="border border-default rounded-lg overflow-hidden">
    <div v-if="loading" class="p-4 space-y-3">
      <USkeleton v-for="i in 4" :key="i" class="h-12 w-full rounded" />
    </div>
    <table v-else class="w-full text-sm">
      <thead>
        <tr class="border-b border-default bg-elevated/30">
          <th class="px-3 py-2.5 text-left text-xs font-medium text-muted cursor-pointer hover:text-default" @click="toggleSort('clientName')">
            <div class="flex items-center gap-1">
              Client
              <UIcon v-if="sortKey === 'clientName'" :name="sortDir === 'desc' ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="w-3 h-3" />
            </div>
          </th>
          <th class="px-3 py-2.5 text-right text-xs font-medium text-muted cursor-pointer hover:text-default" @click="toggleSort('spend')">
            <div class="flex items-center gap-1 justify-end">
              Spend
              <UIcon v-if="sortKey === 'spend'" :name="sortDir === 'desc' ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="w-3 h-3" />
            </div>
          </th>
          <th class="px-3 py-2.5 text-right text-xs font-medium text-muted cursor-pointer hover:text-default" @click="toggleSort('budget')">
            <div class="flex items-center gap-1 justify-end">
              Budget
              <UIcon v-if="sortKey === 'budget'" :name="sortDir === 'desc' ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="w-3 h-3" />
            </div>
          </th>
          <th class="px-3 py-2.5 text-right text-xs font-medium text-muted">Variance</th>
          <th class="px-3 py-2.5 text-center text-xs font-medium text-muted">Platforms</th>
          <th class="px-3 py-2.5 text-right text-xs font-medium text-muted">CTR</th>
          <th class="px-3 py-2.5 text-right text-xs font-medium text-muted">CPC</th>
          <th class="px-3 py-2.5 text-right text-xs font-medium text-muted">% of Total</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="row in sorted" :key="row.clientId">
          <tr
            class="border-b border-default/50 hover:bg-elevated/30 transition-colors cursor-pointer"
            @click="toggle(row.clientId)"
          >
            <td class="px-3 py-2.5">
              <div class="flex items-center gap-2">
                <UIcon
                  :name="expandedId === row.clientId ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  class="w-3.5 h-3.5 text-muted shrink-0"
                />
                <NuxtLink
                  v-if="row.clientId"
                  :to="`/agency/analytics/client/${row.clientId}`"
                  class="font-medium hover:text-primary transition-colors"
                  @click.stop
                >
                  {{ row.clientName }}
                </NuxtLink>
                <span v-else class="font-medium">{{ row.clientName }}</span>
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
            <td class="px-3 py-2.5">
              <div class="flex items-center justify-center gap-1">
                <UIcon
                  v-for="p in row.platforms"
                  :key="p"
                  :name="getPlatformIcon(p)"
                  class="w-3.5 h-3.5"
                  :style="{ color: getPlatformColor(p) }"
                  :title="getPlatformLabel(p)"
                />
              </div>
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtPercent(row.ctr) }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ fmtCurrency(row.cpc, 2) }}</td>
            <td class="px-3 py-2.5 text-right">
              <div class="flex items-center gap-2 justify-end">
                <div class="w-12 h-1.5 bg-default rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full bg-primary"
                    :style="{ width: `${totalSpend > 0 ? Math.min(100, (row.spend / totalSpend) * 100) : 0}%` }"
                  />
                </div>
                <span class="text-xs tabular-nums text-muted w-10 text-right">
                  {{ totalSpend > 0 ? ((row.spend / totalSpend) * 100).toFixed(1) : '0.0' }}%
                </span>
              </div>
            </td>
          </tr>

          <!-- Expanded: per-platform breakdown -->
          <tr v-if="expandedId === row.clientId" class="bg-elevated/20">
            <td :colspan="8" class="px-6 py-4">
              <div v-if="expandedLoading" class="space-y-2">
                <USkeleton v-for="i in 3" :key="i" class="h-8 w-full rounded" />
              </div>

              <div v-else-if="expandedPlatforms.length" class="space-y-3">
                <div
                  v-for="p in expandedPlatforms"
                  :key="p.platform"
                  class="flex items-center gap-3 py-2 px-3 rounded-md bg-elevated/30 border border-default/30"
                >
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: p.color }" />
                  <UIcon :name="getPlatformIcon(p.platform)" class="w-4 h-4 text-muted shrink-0" />
                  <span class="text-sm font-medium w-28 shrink-0">{{ p.displayName }}</span>

                  <div class="flex-1 flex items-center gap-4 text-xs tabular-nums text-muted">
                    <span><span class="font-medium text-default">{{ fmtCurrency(p.spend) }}</span> spend</span>
                    <span>{{ fmtCompact(p.impressions) }} impr.</span>
                    <span>{{ fmtCompact(p.clicks) }} clicks</span>
                    <span>{{ fmtPercent(p.ctr) }} CTR</span>
                    <span>{{ fmtCurrency(p.cpc, 2) }} CPC</span>
                    <span v-if="p.cpm != null">{{ fmtCurrency(p.cpm, 2) }} CPM</span>
                    <span v-if="p.conversions > 0">{{ fmtCompact(p.conversions) }} conv.</span>
                    <span v-if="p.costPerConversion != null">{{ fmtCurrency(p.costPerConversion, 2) }}/conv.</span>
                  </div>

                  <!-- Platform spend bar -->
                  <div class="w-16 h-1.5 bg-default rounded-full overflow-hidden shrink-0">
                    <div class="h-full rounded-full" :style="{ width: `${Math.min(100, p.pctOfTotal)}%`, backgroundColor: p.color }" />
                  </div>
                  <span class="text-xs tabular-nums text-muted w-10 text-right shrink-0">{{ p.pctOfTotal.toFixed(1) }}%</span>
                </div>
              </div>

              <div v-else class="text-xs text-muted py-2">No platform breakdown available</div>

              <div v-if="row.clientId" class="mt-3 pt-3 border-t border-default/50">
                <NuxtLink
                  :to="`/agency/analytics/client/${row.clientId}`"
                  class="text-xs text-primary hover:underline"
                >
                  View full client analytics &rarr;
                </NuxtLink>
              </div>
            </td>
          </tr>
        </template>
        <tr v-if="!sorted.length">
          <td colspan="8" class="px-3 py-8 text-center text-muted">
            No client data for selected period
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
