<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const toast = useToast()
const { fetchSpendSummary, syncSpend } = useSocialConnections()

const now = new Date()
const selectedMonth = ref(now.getMonth()) // 0-indexed for display, +1 for API
const selectedYear = ref(now.getFullYear())
const selectedPlatform = ref('all')
const loading = ref(false)
const syncing = ref(false)

const spendData = ref<any>(null)

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const platformOptions = [
  { label: 'All Platforms', value: 'all' },
  { label: 'Meta Ads', value: 'meta' },
  { label: 'Google Ads', value: 'google' },
]

async function loadSpend() {
  loading.value = true
  try {
    spendData.value = await fetchSpendSummary(selectedMonth.value + 1, selectedYear.value, selectedPlatform.value)
  } catch (e: any) {
    toast.add({ title: 'Error loading spend', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function handleSyncAll() {
  syncing.value = true
  try {
    await Promise.allSettled([
      syncSpend('meta', selectedMonth.value + 1, selectedYear.value),
      syncSpend('google', selectedMonth.value + 1, selectedYear.value),
    ])
    toast.add({ title: 'Sync complete', description: 'Spend data updated', color: 'success' })
    await loadSpend()
  } catch (e: any) {
    toast.add({ title: 'Sync error', description: e.message, color: 'error' })
  } finally {
    syncing.value = false
  }
}

function exportCSV() {
  if (!spendData.value?.items?.length) return
  const headers = ['Client', 'Platform', 'Budget', 'Spend', 'Commission', 'Variance', 'Variance %']
  const rows = spendData.value.items.map((i: any) => [
    i.clientName, i.platform, i.budget, i.spend, i.commission, i.variance, `${i.variancePercent}%`
  ])
  const csv = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `spend-${selectedYear.value}-${String(selectedMonth.value + 1).padStart(2, '0')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Watch for filter changes
watch([selectedMonth, selectedYear, selectedPlatform], () => loadSpend())
onMounted(() => loadSpend())

const flaggedItems = computed(() => {
  if (!spendData.value?.items) return []
  return spendData.value.items.filter((i: any) => Math.abs(i.variancePercent) > 10)
})
</script>

<template>
  <div class="p-6 max-w-6xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Ad Spend</h1>
        <p class="text-muted text-sm mt-1">Monthly spend across all platforms</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton variant="soft" icon="i-lucide-refresh-cw" :loading="syncing" @click="handleSyncAll">
          Sync All
        </UButton>
        <UButton variant="soft" icon="i-lucide-download" @click="exportCSV">
          Export CSV
        </UButton>
        <UButton to="/agency/social" variant="ghost" icon="i-lucide-plug">
          Connections
        </UButton>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <select v-model="selectedMonth" class="border border-default rounded-md px-3 py-1.5 text-sm bg-default">
          <option v-for="(m, i) in months" :key="i" :value="i">{{ m }}</option>
        </select>
        <select v-model="selectedYear" class="border border-default rounded-md px-3 py-1.5 text-sm bg-default">
          <option v-for="y in [2024, 2025, 2026]" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>
      <div class="flex gap-1">
        <UButton
          v-for="opt in platformOptions"
          :key="opt.value"
          size="xs"
          :variant="selectedPlatform === opt.value ? 'solid' : 'ghost'"
          @click="selectedPlatform = opt.value"
        >
          {{ opt.label }}
        </UButton>
      </div>
    </div>

    <!-- Summary Cards -->
    <div v-if="spendData" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="border border-default rounded-lg p-4">
        <p class="text-xs text-muted">Total Spend</p>
        <p class="text-xl font-bold mt-1">{{ new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(spendData.totals.spend) }}</p>
      </div>
      <div class="border border-default rounded-lg p-4">
        <p class="text-xs text-muted">Total Budget</p>
        <p class="text-xl font-bold mt-1">{{ new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(spendData.totals.budget) }}</p>
      </div>
      <div class="border border-default rounded-lg p-4">
        <p class="text-xs text-muted">Commission</p>
        <p class="text-xl font-bold mt-1">{{ new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(spendData.totals.commission) }}</p>
      </div>
      <div class="border border-default rounded-lg p-4">
        <p class="text-xs text-muted">Flagged (>10%)</p>
        <p class="text-xl font-bold mt-1" :class="flaggedItems.length > 0 ? 'text-error' : ''">{{ flaggedItems.length }}</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin" />
    </div>

    <!-- Spend Table -->
    <SocialSpendVarianceTable
      v-else-if="spendData?.items?.length"
      :items="spendData.items"
      :totals="spendData.totals"
    />

    <div v-else-if="spendData && !spendData.items?.length" class="text-center py-12 text-muted">
      No spend data for this period. Try syncing your accounts.
    </div>
  </div>
</template>
