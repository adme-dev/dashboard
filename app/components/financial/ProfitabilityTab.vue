<script setup lang="ts">
// Period filter
const now = new Date()
const selectedMonth = ref(now.getMonth() + 1)
const selectedYear = ref(now.getFullYear())

const monthOptions = [
  { label: 'January', value: 1 }, { label: 'February', value: 2 },
  { label: 'March', value: 3 }, { label: 'April', value: 4 },
  { label: 'May', value: 5 }, { label: 'June', value: 6 },
  { label: 'July', value: 7 }, { label: 'August', value: 8 },
  { label: 'September', value: 9 }, { label: 'October', value: 10 },
  { label: 'November', value: 11 }, { label: 'December', value: 12 }
]

const yearOptions = Array.from({ length: 3 }, (_, i) => {
  const y = now.getFullYear() - i
  return { label: String(y), value: y }
})

// Fetch profitability data
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>
const profitQuery = computed(() => ({ month: selectedMonth.value, year: selectedYear.value }))
const profitData = ref<any | null>(null)
const pending = ref(false)

async function refreshProfitability() {
  pending.value = true
  try {
    profitData.value = await apiFetch('/api/agency/projects/profitability', {
      query: profitQuery.value,
    })
  } finally {
    pending.value = false
  }
}

await refreshProfitability()
watch(profitQuery, () => { refreshProfitability() })

const summary = computed(() => profitData.value?.summary || {
  clientCount: 0, totalBudget: 0, totalSpend: 0, totalCommission: 0,
  avgCommissionRate: 0, campaignCount: 0, avgMargin: 0
})

const clients = computed(() => (profitData.value?.clients || []) as any[])
const commissionDistribution = computed(() => (profitData.value?.commissionDistribution || []) as any[])

// Format helpers
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value)

const formatPercent = (value: number) => `${value.toFixed(1)}%`

// Sort
const sortBy = ref<'commission' | 'spend' | 'margin'>('commission')
const sortOrder = ref<'asc' | 'desc'>('desc')

const sortedClients = computed(() => {
  const sorted = [...clients.value]
  sorted.sort((a, b) => {
    const aVal = a[sortBy.value] || 0
    const bVal = b[sortBy.value] || 0
    return sortOrder.value === 'desc' ? bVal - aVal : aVal - bVal
  })
  return sorted
})

// Top/Bottom performers
const topPerformers = computed(() =>
  [...clients.value].sort((a, b) => (b.commission || 0) - (a.commission || 0)).slice(0, 5)
)
const bottomPerformers = computed(() =>
  [...clients.value].filter(c => c.spend > 0).sort((a, b) => (a.margin || 0) - (b.margin || 0)).slice(0, 5)
)

// Helpers
const getMarginColor = (margin: number): string => {
  if (margin <= 0) return 'text-red-500'
  if (margin < 5) return 'text-amber-500'
  if (margin < 10) return 'text-yellow-500'
  if (margin < 15) return 'text-emerald-500'
  return 'text-green-500'
}

const getMarginBadgeColor = (margin: number): 'error' | 'warning' | 'success' | 'neutral' => {
  if (margin <= 0) return 'error'
  if (margin < 5) return 'warning'
  if (margin < 10) return 'neutral'
  return 'success'
}

const getDistributionColor = (range: string): string => {
  switch (range) {
    case 'none': return 'bg-muted'
    case 'low': return 'bg-amber-500'
    case 'standard': return 'bg-yellow-500'
    case 'premium': return 'bg-emerald-500'
    case 'high': return 'bg-green-500'
    default: return 'bg-muted'
  }
}

const getDistributionLabel = (range: string): string => {
  switch (range) {
    case 'none': return '0%'
    case 'low': return '1-5%'
    case 'standard': return '5-10%'
    case 'premium': return '10-15%'
    case 'high': return '> 15%'
    default: return range
  }
}

const platformLabel = (p: string) => {
  if (p === 'meta') return 'Meta'
  if (p === 'google_ads') return 'Google Ads'
  return p
}

const clientColumns = [
  { accessorKey: 'name', header: 'Client' },
  { accessorKey: 'spend', header: 'Media Spend' },
  { accessorKey: 'budget', header: 'Budget' },
  { accessorKey: 'commission', header: 'Commission' },
  { accessorKey: 'commissionRate', header: 'Rate' },
  { accessorKey: 'margin', header: 'Margin' },
  { accessorKey: 'campaignCount', header: 'Campaigns' },
  { accessorKey: 'platforms', header: 'Platforms' }
]
</script>

<template>
  <div class="space-y-6">
    <!-- Period Filter -->
    <div class="flex flex-wrap items-center gap-3">
      <USelectMenu
        v-model="selectedMonth"
        :items="monthOptions"
        value-key="value"
        class="w-36"
      />
      <USelectMenu
        v-model="selectedYear"
        :items="yearOptions"
        value-key="value"
        class="w-28"
      />
    </div>

    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-12">
      <XfLoader />
    </div>

    <template v-else>
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <UCard>
          <div class="text-center">
            <p class="text-sm text-muted mb-1">Media Managed</p>
            <p class="text-2xl font-bold text-blue-500">{{ formatCurrency(summary.totalSpend) }}</p>
            <p class="text-xs text-muted">{{ summary.campaignCount }} campaigns</p>
          </div>
        </UCard>

        <UCard>
          <div class="text-center">
            <p class="text-sm text-muted mb-1">Total Budget</p>
            <p class="text-2xl font-bold">{{ formatCurrency(summary.totalBudget) }}</p>
            <p class="text-xs text-muted">{{ summary.clientCount }} clients</p>
          </div>
        </UCard>

        <UCard>
          <div class="text-center">
            <p class="text-sm text-muted mb-1">Commission Earned</p>
            <p class="text-2xl font-bold text-emerald-500">{{ formatCurrency(summary.totalCommission) }}</p>
          </div>
        </UCard>

        <UCard>
          <div class="text-center">
            <p class="text-sm text-muted mb-1">Avg Commission Rate</p>
            <p class="text-2xl font-bold text-violet-500">{{ formatPercent(summary.avgCommissionRate) }}</p>
          </div>
        </UCard>

        <UCard>
          <div class="text-center">
            <p class="text-sm text-muted mb-1">Avg Margin</p>
            <p class="text-2xl font-bold" :class="getMarginColor(summary.avgMargin)">
              {{ formatPercent(summary.avgMargin) }}
            </p>
          </div>
        </UCard>
      </div>

      <!-- Distribution & Top/Bottom Performers -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Commission Distribution -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Commission Rate Distribution</h3>
          </template>
          <div class="space-y-3">
            <div
              v-for="item in commissionDistribution"
              :key="item.range"
              class="flex items-center gap-3"
            >
              <div :class="[getDistributionColor(item.range), 'w-3 h-3 rounded-full']" />
              <span class="text-sm flex-1">{{ getDistributionLabel(item.range) }}</span>
              <span class="font-semibold">{{ item.count }}</span>
            </div>
            <div v-if="commissionDistribution.length === 0" class="text-center text-muted py-4">
              No data available
            </div>
          </div>
        </UCard>

        <!-- Top Commission Earners -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-trending-up" class="w-5 h-5 text-emerald-500" />
              <h3 class="font-semibold">Top Commission Earners</h3>
            </div>
          </template>
          <div class="space-y-3">
            <div
              v-for="(client, idx) in topPerformers"
              :key="client.id"
              class="flex items-center justify-between p-2 rounded-lg bg-elevated"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-muted">#{{ idx + 1 }}</span>
                <div>
                  <p class="text-sm font-medium truncate max-w-[150px]">{{ client.name }}</p>
                  <p class="text-xs text-muted">{{ client.campaignCount }} campaigns</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-sm font-bold text-emerald-500">{{ formatCurrency(client.commission) }}</p>
                <p class="text-xs text-muted">{{ formatPercent(client.commissionRate) }} rate</p>
              </div>
            </div>
            <div v-if="topPerformers.length === 0" class="text-center text-muted py-4">
              No clients found
            </div>
          </div>
        </UCard>

        <!-- Lowest Margin Clients -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-trending-down" class="w-5 h-5 text-red-500" />
              <h3 class="font-semibold">Lowest Margin</h3>
            </div>
          </template>
          <div class="space-y-3">
            <div
              v-for="(client, idx) in bottomPerformers"
              :key="client.id"
              class="flex items-center justify-between p-2 rounded-lg bg-elevated"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-muted">#{{ idx + 1 }}</span>
                <div>
                  <p class="text-sm font-medium truncate max-w-[150px]">{{ client.name }}</p>
                  <p class="text-xs text-muted">{{ formatCurrency(client.spend) }} managed</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-sm font-bold" :class="getMarginColor(client.margin)">
                  {{ formatPercent(client.margin) }}
                </p>
                <p class="text-xs text-muted">{{ formatCurrency(client.commission) }}</p>
              </div>
            </div>
            <div v-if="bottomPerformers.length === 0" class="text-center text-muted py-4">
              No clients found
            </div>
          </div>
        </UCard>
      </div>

      <!-- Client Profitability Table -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">Client Profitability</h3>
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted">Sort by:</span>
              <USelectMenu
                v-model="sortBy"
                :items="[
                  { label: 'Commission', value: 'commission' },
                  { label: 'Spend', value: 'spend' },
                  { label: 'Margin', value: 'margin' }
                ]"
                value-key="value"
                class="w-32"
              />
              <UButton
                variant="ghost"
                :icon="sortOrder === 'desc' ? 'i-lucide-arrow-down' : 'i-lucide-arrow-up'"
                @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'"
              />
            </div>
          </div>
        </template>

        <UTable :data="sortedClients" :columns="clientColumns">
          <template #name-cell="{ row }">
            <span class="font-medium">{{ (row.original as any).name }}</span>
          </template>

          <template #spend-cell="{ row }">
            {{ formatCurrency((row.original as any).spend) }}
          </template>

          <template #budget-cell="{ row }">
            {{ (row.original as any).budget > 0 ? formatCurrency((row.original as any).budget) : '-' }}
          </template>

          <template #commission-cell="{ row }">
            <span class="text-emerald-500 font-medium">
              {{ formatCurrency((row.original as any).commission) }}
            </span>
          </template>

          <template #commissionRate-cell="{ row }">
            {{ formatPercent((row.original as any).commissionRate) }}
          </template>

          <template #margin-cell="{ row }">
            <UBadge :color="getMarginBadgeColor((row.original as any).margin)" variant="subtle">
              {{ formatPercent((row.original as any).margin) }}
            </UBadge>
          </template>

          <template #campaignCount-cell="{ row }">
            {{ (row.original as any).campaignCount }}
          </template>

          <template #platforms-cell="{ row }">
            <div class="flex items-center gap-1">
              <UBadge
                v-for="p in (row.original as any).platforms"
                :key="p"
                variant="subtle"
                color="neutral"
                size="xs"
              >
                {{ platformLabel(p) }}
              </UBadge>
            </div>
          </template>
        </UTable>

        <div v-if="sortedClients.length === 0" class="text-center text-muted py-8">
          No client data available for this period
        </div>
      </UCard>
    </template>
  </div>
</template>
