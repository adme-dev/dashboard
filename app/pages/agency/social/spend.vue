<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const toast = useToast()
const route = useRoute()
const router = useRouter()
const { fetchSpendSummary, syncSpend } = useSocialConnections()

const now = new Date()
const selectedMonth = ref(parseInt(String(route.query.month || now.getMonth() + 1), 10))
const selectedYear = ref(parseInt(String(route.query.year || now.getFullYear()), 10))
const selectedPlatform = ref(String(route.query.platform || 'all'))
const weekFilter = ref<{ start: string; end: string } | null>(null)
const loading = ref(false)
const syncing = ref(false)
const searchQuery = ref('')

const spendData = ref<any>(null)
const bankCharges = ref<any>(null)
const bankLoading = ref(false)

const platformOptions = [
  { label: 'All', value: 'all' },
  { label: 'Meta', value: 'meta' },
  { label: 'Google', value: 'google' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Pinterest', value: 'pinterest' },
  { label: 'Snapchat', value: 'snapchat' },
  { label: 'X (Twitter)', value: 'twitter' },
  { label: 'Microsoft', value: 'microsoft_ads' },
]

const showImportModal = ref(false)

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(val)
}

async function loadSpend() {
  loading.value = true
  try {
    spendData.value = await fetchSpendSummary(selectedMonth.value, selectedYear.value, selectedPlatform.value)
  } catch (e: any) {
    toast.add({ title: 'Error loading spend', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function loadBankCharges() {
  bankLoading.value = true
  try {
    bankCharges.value = await $fetch('/api/agency/social/spend/bank-charges', {
      query: { month: selectedMonth.value, year: selectedYear.value },
    })
  } catch {
    // Xero not connected or error — silently degrade
    bankCharges.value = null
  } finally {
    bankLoading.value = false
  }
}

const syncablePlatforms = ['meta', 'google', 'tiktok', 'linkedin', 'pinterest', 'snapchat', 'twitter', 'microsoft_ads'] as const

async function handleSyncAll() {
  syncing.value = true
  try {
    await Promise.allSettled(
      syncablePlatforms.map(p => syncSpend(p as any, selectedMonth.value, selectedYear.value))
    )
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
  const hasBankCol = hasBankData.value
  const headers = ['Client', 'Platform', 'Budget', 'Spend', ...(hasBankCol ? ['Bank Charged', 'Source'] : []), 'Commission', 'Variance', 'Variance %']
  const rows = spendData.value.items.map((i: any) => {
    const base = [i.clientName, i.platform, i.budget, i.spend]
    if (hasBankCol) {
      const key = i.platform === 'google' ? 'google_ads' : i.platform
      let platformBankTotal = bankCharges.value?.byPlatform?.[key]?.total || 0
      let source = 'xero'
      // Fallback to Meta billing for meta platform
      if (platformBankTotal <= 0 && key === 'meta' && bankCharges.value?.metaBilling?.total) {
        platformBankTotal = bankCharges.value.metaBilling.total
        source = 'meta_billing'
      }
      const platformTotal = spendData.value.items
        .filter((x: any) => (x.platform === 'google' ? 'google_ads' : x.platform) === key)
        .reduce((s: number, x: any) => s + x.spend, 0)
      const bankAmt = platformTotal > 0 ? Math.round(platformBankTotal * (i.spend / platformTotal) * 100) / 100 : 0
      base.push(bankAmt, bankAmt > 0 ? source : '')
    }
    return [...base, i.commission, i.variance, `${i.variancePercent}%`]
  })
  const csv = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `spend-${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

watch([selectedMonth, selectedYear, selectedPlatform], () => {
  loadSpend()
  loadBankCharges()

  // Sync URL query string so the current view is linkable
  const q: Record<string, string> = {
    month: String(selectedMonth.value),
    year: String(selectedYear.value),
  }
  if (selectedPlatform.value !== 'all') q.platform = selectedPlatform.value
  router.replace({ query: q })
})

onMounted(() => {
  loadSpend()
  loadBankCharges()
})

const lastSyncedAt = computed(() => spendData.value?.lastSyncedAt || null)

const flaggedItems = computed(() => {
  if (!spendData.value?.items) return []
  return spendData.value.items.filter((i: any) => Math.abs(i.variancePercent) > 10)
})

// Pacing: what % of the month has elapsed vs % of budget spent
const monthProgress = computed(() => {
  const today = new Date()
  const m = selectedMonth.value
  const y = selectedYear.value
  // If viewing a past month, it's 100% elapsed
  if (y < today.getFullYear() || (y === today.getFullYear() && m < today.getMonth() + 1)) return 100
  // If viewing a future month, 0%
  if (y > today.getFullYear() || (y === today.getFullYear() && m > today.getMonth() + 1)) return 0
  // Current month
  const daysInMonth = new Date(y, m, 0).getDate()
  return Math.round((today.getDate() / daysInMonth) * 100)
})

const overallPacing = computed(() => {
  if (!spendData.value?.totals) return null
  const { budget, spend } = spendData.value.totals
  if (budget <= 0) return null
  const spentPct = (spend / budget) * 100
  const progress = monthProgress.value
  // Pacing ratio: >1 means overspending, <1 means underspending
  const ratio = progress > 0 ? spentPct / progress : 0
  return { spentPct: Math.round(spentPct), progress, ratio: Math.round(ratio * 100) / 100 }
})

const hasBankData = computed(() => {
  if (!bankCharges.value?.connected) return false
  return bankCharges.value.total > 0 || (bankCharges.value.metaBilling?.total ?? 0) > 0
})

/** Combined: Xero bank/CC + Meta billing (for platforms not matched in Xero) */
const combinedBankTotal = computed(() => {
  if (!bankCharges.value) return 0
  let total = bankCharges.value.total
  const metaXero = bankCharges.value.byPlatform?.['meta']?.total ?? 0
  if (metaXero <= 0 && bankCharges.value.metaBilling?.total) {
    total += bankCharges.value.metaBilling.total
  }
  return Math.round(total * 100) / 100
})

const bankDiscrepancy = computed(() => {
  if (!hasBankData.value || !spendData.value?.totals) return null
  const diff = combinedBankTotal.value - spendData.value.totals.spend
  const pct = spendData.value.totals.spend > 0
    ? Math.round((diff / spendData.value.totals.spend) * 1000) / 10
    : 0
  return { diff: Math.round(diff * 100) / 100, pct }
})
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="p-6 lg:p-8 space-y-6">

      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Ad Spend</h1>
          <p class="text-sm text-muted mt-1">Track monthly spend across all connected ad platforms</p>
        </div>
        <div class="flex items-center gap-2">
          <!-- Platform Segmented Control -->
          <div class="inline-flex items-center p-0.5 rounded-lg bg-elevated/50 border border-default gap-0.5">
            <UButton
              v-for="opt in platformOptions"
              :key="opt.value"
              size="xs"
              :variant="selectedPlatform === opt.value ? 'soft' : 'ghost'"
              :color="selectedPlatform === opt.value ? 'primary' : 'neutral'"
              @click="selectedPlatform = opt.value"
            >
              {{ opt.label }}
            </UButton>
          </div>
          <div class="w-px h-6 bg-default hidden sm:block" />
          <UButton variant="ghost" icon="i-lucide-download" size="sm" @click="exportCSV" :disabled="!spendData?.items?.length">
            Export
          </UButton>
          <UButton variant="ghost" icon="i-lucide-upload" size="sm" @click="showImportModal = true">
            Import
          </UButton>
          <UButton to="/agency/social" variant="ghost" icon="i-lucide-plug" size="sm">
            Connections
          </UButton>
        </div>
      </div>

      <!-- Period Picker -->
      <SocialSpendPeriodPicker
        :month="selectedMonth"
        :year="selectedYear"
        :week-filter="weekFilter"
        :last-synced-at="lastSyncedAt"
        :syncing="syncing"
        @update:month="selectedMonth = $event"
        @update:year="selectedYear = $event"
        @update:week-filter="weekFilter = $event"
        @sync="handleSyncAll"
      />

      <!-- Summary Cards -->
      <div v-if="spendData" class="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <!-- Total Spend -->
        <div class="rounded-xl border border-default p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted uppercase tracking-wide">Total Spend</span>
            <div class="rounded-lg bg-blue-100 dark:bg-blue-950/40 p-1.5">
              <UIcon name="i-lucide-credit-card" class="size-4 text-blue-500" />
            </div>
          </div>
          <p class="text-2xl font-bold tracking-tight">{{ formatCurrency(spendData.totals.spend) }}</p>
        </div>

        <!-- Bank Charged -->
        <div
          class="rounded-xl border border-default p-4 space-y-3"
          :class="bankDiscrepancy && Math.abs(bankDiscrepancy.pct) > 2 ? 'ring-1 ring-amber-500/20' : ''"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted uppercase tracking-wide">Bank Charged</span>
            <div class="rounded-lg p-1.5" :class="hasBankData ? 'bg-orange-100 dark:bg-orange-950/40' : 'bg-elevated'">
              <UIcon name="i-lucide-landmark" class="size-4" :class="hasBankData ? 'text-orange-500' : 'text-muted'" />
            </div>
          </div>
          <template v-if="hasBankData">
            <p class="text-2xl font-bold tracking-tight">{{ formatCurrency(combinedBankTotal) }}</p>
            <div v-if="bankDiscrepancy && Math.abs(bankDiscrepancy.diff) >= 1" class="text-[10px] font-medium" :class="bankDiscrepancy.diff > 0 ? 'text-amber-500' : 'text-emerald-500'">
              {{ bankDiscrepancy.diff > 0 ? '+' : '' }}{{ formatCurrency(bankDiscrepancy.diff) }}
              ({{ bankDiscrepancy.pct > 0 ? '+' : '' }}{{ bankDiscrepancy.pct }}%)
              vs platform
            </div>
          </template>
          <template v-else-if="bankLoading">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-loader-2" class="size-4 animate-spin text-muted" />
              <span class="text-sm text-muted">Loading...</span>
            </div>
          </template>
          <template v-else>
            <p class="text-2xl font-bold tracking-tight text-muted">-</p>
            <p class="text-[10px] text-muted">Connect Xero to see bank charges</p>
          </template>
        </div>

        <!-- Total Budget -->
        <div class="rounded-xl border border-default p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted uppercase tracking-wide">Total Budget</span>
            <div class="rounded-lg bg-violet-100 dark:bg-violet-950/40 p-1.5">
              <UIcon name="i-lucide-target" class="size-4 text-violet-500" />
            </div>
          </div>
          <p class="text-2xl font-bold tracking-tight">{{ formatCurrency(spendData.totals.budget) }}</p>
        </div>

        <!-- Commission -->
        <div class="rounded-xl border border-default p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted uppercase tracking-wide">Commission</span>
            <div class="rounded-lg bg-emerald-100 dark:bg-emerald-950/40 p-1.5">
              <UIcon name="i-lucide-percent" class="size-4 text-emerald-500" />
            </div>
          </div>
          <p class="text-2xl font-bold tracking-tight">{{ formatCurrency(spendData.totals.commission) }}</p>
        </div>

        <!-- Pacing -->
        <div class="rounded-xl border border-default p-4 space-y-3" :class="overallPacing && overallPacing.ratio > 1.15 ? 'ring-1 ring-amber-500/20' : ''">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted uppercase tracking-wide">Pacing</span>
            <div class="rounded-lg p-1.5" :class="overallPacing && overallPacing.ratio > 1.15 ? 'bg-amber-100 dark:bg-amber-950/40' : 'bg-elevated'">
              <UIcon name="i-lucide-gauge" class="size-4" :class="overallPacing && overallPacing.ratio > 1.15 ? 'text-amber-500' : 'text-muted'" />
            </div>
          </div>
          <template v-if="overallPacing">
            <p class="text-2xl font-bold tracking-tight">{{ overallPacing.spentPct }}%</p>
            <div class="space-y-1">
              <div class="flex justify-between text-[10px] text-muted">
                <span>{{ monthProgress }}% through month</span>
                <span :class="overallPacing.ratio > 1.1 ? 'text-amber-500' : overallPacing.ratio < 0.85 ? 'text-blue-500' : 'text-emerald-500'">
                  {{ overallPacing.ratio > 1.05 ? 'Over-pacing' : overallPacing.ratio < 0.9 ? 'Under-pacing' : 'On track' }}
                </span>
              </div>
              <div class="h-1.5 bg-elevated rounded-full overflow-hidden relative">
                <div class="absolute inset-y-0 left-0 bg-muted/30 rounded-full" :style="{ width: `${monthProgress}%` }" />
                <div
                  class="absolute inset-y-0 left-0 rounded-full"
                  :class="overallPacing.ratio > 1.1 ? 'bg-amber-500' : overallPacing.ratio < 0.85 ? 'bg-blue-500' : 'bg-emerald-500'"
                  :style="{ width: `${Math.min(overallPacing.spentPct, 100)}%` }"
                />
              </div>
            </div>
          </template>
          <p v-else class="text-2xl font-bold tracking-tight text-muted">-</p>
        </div>

        <!-- Flagged -->
        <div class="rounded-xl border border-default p-4 space-y-3" :class="flaggedItems.length > 0 ? 'ring-1 ring-red-500/20' : ''">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted uppercase tracking-wide">Flagged (>10%)</span>
            <div class="rounded-lg p-1.5" :class="flaggedItems.length > 0 ? 'bg-red-100 dark:bg-red-950/40' : 'bg-elevated'">
              <UIcon name="i-lucide-alert-triangle" class="size-4" :class="flaggedItems.length > 0 ? 'text-red-500' : 'text-muted'" />
            </div>
          </div>
          <p class="text-2xl font-bold tracking-tight" :class="flaggedItems.length > 0 ? 'text-red-500' : ''">{{ flaggedItems.length }}</p>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-16">
        <div class="flex flex-col items-center gap-3">
          <XfLoader size="sm" />
          <span class="text-sm text-muted">Loading spend data...</span>
        </div>
      </div>

      <!-- Spend Table -->
      <div v-else-if="spendData?.items?.length" class="rounded-xl border border-default overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-default bg-elevated/30 gap-3">
          <div>
            <h2 class="text-sm font-semibold">Spend by Client</h2>
            <p class="text-xs text-muted mt-0.5">{{ spendData.items.length }} {{ spendData.items.length === 1 ? 'client' : 'clients' }} this period</p>
          </div>
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Search clients..."
            size="sm"
            class="w-56"
          />
        </div>
        <SocialSpendVarianceTable
          :items="spendData.items"
          :totals="spendData.totals"
          :search="searchQuery"
          :month-progress="monthProgress"
          :bank-charges="bankCharges"
          @budget-updated="loadSpend"
        />
      </div>

      <!-- Empty State -->
      <div v-else-if="spendData && !spendData.items?.length" class="flex flex-col items-center justify-center py-16 gap-4">
        <div class="rounded-full bg-elevated p-4">
          <UIcon name="i-lucide-bar-chart-3" class="size-8 text-muted" />
        </div>
        <div class="text-center">
          <p class="font-medium">No spend data</p>
          <p class="text-sm text-muted mt-1">No data found for this period. Try syncing your ad accounts.</p>
        </div>
        <UButton variant="soft" icon="i-lucide-refresh-cw" @click="handleSyncAll" :loading="syncing">
          Sync Accounts
        </UButton>
      </div>

    </div>

    <!-- Import Modal -->
    <SocialSpendImportModal v-model:open="showImportModal" @imported="loadSpend" />
  </div>
</template>
