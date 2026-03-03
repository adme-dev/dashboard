<script setup lang="ts">
const props = defineProps<{
  clients: Array<{
    clientId: string
    clientName: string
    spend: number
    platforms: string[]
    campaignCount: number
    cpc: number | null
    ctr: number | null
  }>
  loading?: boolean
}>()

const { fmtCurrency, fmtPercent, getPlatformIcon, getPlatformColor, getPlatformLabel } = useAnalytics()

const expandedId = ref<string | null>(null)

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

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
                  :to="`/agency/analytics/client/${row.clientId}`"
                  class="font-medium hover:text-primary transition-colors"
                  @click.stop
                >
                  {{ row.clientName }}
                </NuxtLink>
                <UBadge variant="subtle" color="neutral" size="xs">{{ row.campaignCount }}</UBadge>
              </div>
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums font-medium">{{ fmtCurrency(row.spend) }}</td>
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
          <!-- Expanded: platform sub-rows -->
          <tr v-if="expandedId === row.clientId" class="bg-elevated/20">
            <td :colspan="6" class="px-6 py-3">
              <div class="flex flex-wrap gap-3">
                <div
                  v-for="p in row.platforms"
                  :key="p"
                  class="flex items-center gap-2 px-3 py-1.5 rounded-md bg-elevated/50 border border-default/50"
                >
                  <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: getPlatformColor(p) }" />
                  <UIcon :name="getPlatformIcon(p)" class="w-3.5 h-3.5 text-muted" />
                  <span class="text-xs font-medium">{{ getPlatformLabel(p) }}</span>
                </div>
              </div>
              <div class="mt-2">
                <NuxtLink
                  :to="`/agency/analytics/client/${row.clientId}`"
                  class="text-xs text-primary hover:underline"
                >
                  View client analytics &rarr;
                </NuxtLink>
              </div>
            </td>
          </tr>
        </template>
        <tr v-if="!sorted.length">
          <td colspan="6" class="px-3 py-8 text-center text-muted">
            No client data for selected period
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
