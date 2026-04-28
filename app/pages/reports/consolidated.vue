<script setup lang="ts">
import { CalendarDate, today, getLocalTimeZone } from '@internationalized/date'

definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

// ── Types ──
type TenantPnL = {
  tenantId: string
  tenantName: string
  revenueTotal: number
  expensesTotal: number
  netProfit: number
  profitMargin: number
}

type ConsolidatedResponse = {
  fromDate: string
  toDate: string
  tenants: TenantPnL[]
  totals: {
    revenueTotal: number
    expensesTotal: number
    netProfit: number
    profitMargin: number
  }
  warnings?: string[]
}

// ── Period selector ──
const route = useRoute()
const router = useRouter()
const tz = getLocalTimeZone()
const nowCal = today(tz)
const now = new Date()
const defaultMonth = now.getMonth() + 1
const defaultYear = now.getFullYear()

const qMonth = Number(route.query.month)
const qYear = Number(route.query.year)
const selectedMonth = ref(qMonth >= 1 && qMonth <= 12 ? qMonth : defaultMonth)
const selectedYear = ref(qYear >= 2000 && qYear <= 2100 ? qYear : defaultYear)
const popoverOpen = ref(false)

watch([selectedMonth, selectedYear], () => {
  const query: Record<string, string> = {}
  const isDefault = selectedMonth.value === defaultMonth && selectedYear.value === defaultYear
  if (!isDefault) {
    query.month = String(selectedMonth.value)
    query.year = String(selectedYear.value)
  }
  router.replace({ query })
}, { flush: 'post' })

const fromDate = computed(() => {
  const d = new Date(selectedYear.value, selectedMonth.value - 1, 1)
  return d.toISOString().slice(0, 10)
})

const toDate = computed(() => {
  const d = new Date(selectedYear.value, selectedMonth.value, 0)
  return d.toISOString().slice(0, 10)
})

function monthName(m: number, y: number) {
  return new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

const displayLabel = computed(() => monthName(selectedMonth.value, selectedYear.value))

const calendarValue = computed({
  get: () => new CalendarDate(selectedYear.value, selectedMonth.value, 1),
  set: (val: CalendarDate) => {
    selectedMonth.value = val.month
    selectedYear.value = val.year
    popoverOpen.value = false
  }
})

const shortcuts = computed(() => {
  const m = nowCal.month
  const y = nowCal.year
  const prev = m === 1 ? { month: 12, year: y - 1 } : { month: m - 1, year: y }
  const prev2 = prev.month === 1 ? { month: 12, year: prev.year - 1 } : { month: prev.month - 1, year: prev.year }
  return [
    { label: 'This Month', month: m, year: y },
    { label: 'Last Month', month: prev.month, year: prev.year },
    { label: monthName(prev2.month, prev2.year), month: prev2.month, year: prev2.year },
  ]
})

function selectShortcut(s: { month: number; year: number }) {
  selectedMonth.value = s.month
  selectedYear.value = s.year
  popoverOpen.value = false
}

function isActiveShortcut(s: { month: number; year: number }) {
  return s.month === selectedMonth.value && s.year === selectedYear.value
}

function prevMonth() {
  if (selectedMonth.value === 1) { selectedMonth.value = 12; selectedYear.value-- }
  else { selectedMonth.value-- }
}

function nextMonth() {
  if (selectedMonth.value === 12) { selectedMonth.value = 1; selectedYear.value++ }
  else { selectedMonth.value++ }
}

const isCurrentMonth = computed(() =>
  selectedMonth.value === nowCal.month && selectedYear.value === nowCal.year
)

// ── Data fetch ──
const { data, pending, error, refresh } = await useFetch<ConsolidatedResponse>(
  '/api/xero/reports/pnl-consolidated',
  { query: computed(() => ({ fromDate: fromDate.value, toDate: toDate.value })) }
)

// ── Formatters ──
function fmt(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

function fmtPct(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return `${(value * 100).toFixed(1)}%`
}

// ── Computed ──
const totals = computed(() => data.value?.totals ?? null)
const tenants = computed(() => data.value?.tenants ?? [])
const tenantCount = computed(() => tenants.value.length)

// Sorted by revenue
const sortedTenants = computed(() =>
  [...tenants.value].sort((a, b) => b.revenueTotal - a.revenueTotal)
)

// Best/worst performers
const bestPerformer = computed(() => {
  if (!tenants.value.length) return null
  return [...tenants.value].sort((a, b) => b.profitMargin - a.profitMargin)[0]
})

const worstPerformer = computed(() => {
  if (tenants.value.length < 2) return null
  return [...tenants.value].sort((a, b) => a.profitMargin - b.profitMargin)[0]
})

// Revenue concentration
const revenueConcentration = computed(() => {
  const total = totals.value?.revenueTotal ?? 0
  if (total <= 0 || !sortedTenants.value.length) return null
  const top = sortedTenants.value[0]
  const topShare = top.revenueTotal / total
  return {
    topOrg: top.tenantName,
    topShare,
    level: topShare > 0.7 ? 'high' as const : topShare > 0.5 ? 'moderate' as const : 'diversified' as const
  }
})

// Consolidated margin benchmark
type BenchmarkLevel = 'green' | 'yellow' | 'red'
const marginBenchmark = computed<{ level: BenchmarkLevel; label: string }>(() => {
  const margin = totals.value?.profitMargin ?? 0
  const pct = margin * 100
  if (pct >= 15) return { level: 'green', label: 'Healthy' }
  if (pct >= 5) return { level: 'yellow', label: 'Tight' }
  return { level: 'red', label: 'Unprofitable' }
})

const benchmarkDotColor: Record<BenchmarkLevel, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500'
}

// Per-org table
const orgColumns = [
  { accessorKey: 'tenantName', header: 'Organization', id: 'org-name' },
  { accessorKey: 'revenueTotal', header: 'Revenue', id: 'org-rev', class: 'text-right' },
  { accessorKey: 'expensesTotal', header: 'Expenses', id: 'org-exp', class: 'text-right' },
  { accessorKey: 'netProfit', header: 'Net Profit', id: 'org-net', class: 'text-right' },
  { accessorKey: 'profitMargin', header: 'Margin', id: 'org-margin', class: 'text-right' },
  { accessorKey: 'contribution', header: 'Revenue Share', id: 'org-contrib', class: 'text-right' }
]

const orgRows = computed(() =>
  sortedTenants.value.map(t => {
    const total = totals.value?.revenueTotal ?? 0
    return {
      _raw: t,
      tenantName: t.tenantName,
      revenueTotal: fmt(t.revenueTotal),
      expensesTotal: fmt(t.expensesTotal),
      netProfit: fmt(t.netProfit),
      profitMargin: fmtPct(t.profitMargin),
      contribution: total > 0 ? `${((t.revenueTotal / total) * 100).toFixed(1)}%` : '-'
    }
  })
)

// AI-generated insights from data
const insights = computed(() => {
  const items: string[] = []
  const t = totals.value
  const orgs = sortedTenants.value

  if (!t || !orgs.length) return items

  // Overall performance
  if (t.profitMargin >= 0.15) {
    items.push(`Strong consolidated margin of ${fmtPct(t.profitMargin)} — the group is performing above agency benchmarks (15%+).`)
  } else if (t.profitMargin >= 0.05) {
    items.push(`Consolidated margin of ${fmtPct(t.profitMargin)} is within acceptable range but below the 15% agency benchmark target.`)
  } else if (t.profitMargin >= 0) {
    items.push(`Consolidated margin of ${fmtPct(t.profitMargin)} is thin — consider reviewing cost structures across entities.`)
  } else {
    items.push(`The group is operating at a loss with ${fmtPct(t.profitMargin)} consolidated margin. Immediate action required.`)
  }

  // Concentration
  if (revenueConcentration.value) {
    const rc = revenueConcentration.value
    if (rc.level === 'high') {
      items.push(`Revenue concentration risk: ${rc.topOrg} accounts for ${fmtPct(rc.topShare)} of total revenue. Consider diversifying across entities.`)
    }
  }

  // Best performer
  if (bestPerformer.value && orgs.length > 1) {
    items.push(`${bestPerformer.value.tenantName} leads with ${fmtPct(bestPerformer.value.profitMargin)} margin — investigate what practices can be replicated across other entities.`)
  }

  // Margin gap
  if (bestPerformer.value && worstPerformer.value && orgs.length > 1) {
    const gap = bestPerformer.value.profitMargin - worstPerformer.value.profitMargin
    if (gap > 0.1) {
      items.push(`${fmtPct(gap)} margin gap between best and worst performing entities — standardizing operations could narrow this.`)
    }
  }

  // Loss-making entities
  const lossOrgs = orgs.filter(o => o.netProfit < 0)
  if (lossOrgs.length > 0) {
    items.push(`${lossOrgs.length} entit${lossOrgs.length === 1 ? 'y is' : 'ies are'} loss-making this period: ${lossOrgs.map(o => o.tenantName).join(', ')}.`)
  }

  // Scale observation
  if (orgs.length >= 3) {
    const avgRevenue = t.revenueTotal / orgs.length
    const smallOrgs = orgs.filter(o => o.revenueTotal < avgRevenue * 0.3)
    if (smallOrgs.length > 0) {
      items.push(`${smallOrgs.length} entit${smallOrgs.length === 1 ? 'y generates' : 'ies generate'} less than 30% of average revenue — assess whether consolidation would improve efficiency.`)
    }
  }

  return items
})

const breadcrumbs = computed(() => ([
  { label: 'XeroFlow', to: '/xeroflow' },
  { label: 'Financial Reports', to: '/reports' },
  { label: 'Consolidated P&L', to: '/reports/consolidated' }
]))
</script>

<template>
  <UDashboardPanel id="consolidated-pnl">
    <template #header>
      <UDashboardNavbar title="Consolidated P&L" :description="`Multi-entity performance — ${displayLabel}`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            label="Refresh"
            color="neutral"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :links="breadcrumbs" />

          <!-- Month picker -->
          <div class="flex items-center gap-1 ml-4">
            <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="xs" @click="prevMonth" />

            <UPopover v-model:open="popoverOpen" :content="{ align: 'start' }">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-calendar"
                class="data-[state=open]:bg-elevated group min-w-[170px] justify-between"
              >
                <span class="font-medium text-sm">{{ displayLabel }}</span>
                <template #trailing>
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="shrink-0 text-dimmed size-4 group-data-[state=open]:rotate-180 transition-transform duration-200"
                  />
                </template>
              </UButton>

              <template #content>
                <div class="flex items-stretch sm:divide-x divide-default">
                  <div class="flex flex-col py-1">
                    <div class="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">Quick Select</div>
                    <UButton
                      v-for="s in shortcuts"
                      :key="s.label"
                      :label="s.label"
                      color="neutral"
                      variant="ghost"
                      class="rounded-none px-4 text-sm"
                      :class="[isActiveShortcut(s) ? 'bg-elevated font-medium' : 'hover:bg-elevated/50']"
                      @click="selectShortcut(s)"
                    />
                  </div>
                  <div class="p-2">
                    <UCalendar v-model="calendarValue" class="rounded-lg" />
                  </div>
                </div>
              </template>
            </UPopover>

            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="isCurrentMonth"
              @click="nextMonth"
            />
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="pending" class="space-y-6">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <USkeleton v-for="n in 4" :key="`sk-${n}`" class="h-28" />
        </div>
        <USkeleton class="h-64" />
        <USkeleton class="h-80" />
      </div>

      <UAlert
        v-else-if="error"
        icon="i-lucide-alert-octagon"
        color="error"
        variant="subtle"
        title="Unable to load consolidated data"
        :description="(error as any)?.statusMessage || 'Please ensure multiple Xero organizations are connected.'"
      />

      <div v-else-if="tenantCount === 0" class="text-center py-20 space-y-4">
        <UIcon name="i-lucide-building-2" class="size-12 text-muted mx-auto" />
        <h3 class="text-lg font-semibold">No Organizations Found</h3>
        <p class="text-sm text-muted max-w-md mx-auto">
          Connect multiple Xero organizations to see consolidated financial performance across your group entities.
        </p>
        <UButton label="Connect Xero" color="primary" to="/api/xero/login" />
      </div>

      <div v-else class="space-y-6">
        <!-- Warnings (partial tenant failures) -->
        <UAlert
          v-if="data?.warnings?.length"
          icon="i-lucide-alert-triangle"
          color="warning"
          variant="subtle"
          title="Some entities could not be loaded"
          :description="data.warnings.join(' ')"
        />

        <!-- ═══ Consolidated Summary Cards ═══ -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">Entities</p>
              <UIcon name="i-lucide-building-2" class="size-5 text-blue-500" />
            </div>
            <p class="text-2xl font-bold">{{ tenantCount }}</p>
            <p class="text-[11px] text-muted mt-1">Connected organizations</p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">Total Revenue</p>
              <UIcon name="i-lucide-trending-up" class="size-5 text-emerald-500" />
            </div>
            <p class="text-2xl font-bold">{{ fmt(totals?.revenueTotal) }}</p>
            <p class="text-[11px] text-muted mt-1">Consolidated for {{ displayLabel }}</p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">Total Expenses</p>
              <UIcon name="i-lucide-trending-down" class="size-5 text-amber-500" />
            </div>
            <p class="text-2xl font-bold">{{ fmt(totals?.expensesTotal) }}</p>
            <p class="text-[11px] text-muted mt-1">All entities combined</p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">Net Profit</p>
              <UIcon
                name="i-lucide-target"
                :class="['size-5', (totals?.netProfit ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500']"
              />
            </div>
            <p class="text-2xl font-bold" :class="(totals?.netProfit ?? 0) < 0 ? 'text-red-500' : ''">
              {{ fmt(totals?.netProfit) }}
            </p>
            <p class="text-[11px] text-muted mt-1">Group result</p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">Net Margin</p>
              <UIcon name="i-lucide-percent" class="size-5 text-violet-500" />
            </div>
            <div class="flex items-baseline gap-2">
              <p class="text-2xl font-bold">{{ fmtPct(totals?.profitMargin) }}</p>
              <span class="flex items-center gap-1">
                <span :class="['inline-block size-2 rounded-full', benchmarkDotColor[marginBenchmark.level]]" />
                <span class="text-[10px] text-muted">{{ marginBenchmark.label }}</span>
              </span>
            </div>
            <p class="text-[11px] text-muted mt-1">Agency benchmark: 15%+</p>
          </UCard>
        </div>

        <!-- ═══ Entity Performance Comparison ═══ -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <!-- Revenue Contribution -->
          <UCard :ui="{ body: '!p-6 space-y-4' }">
            <header>
              <p class="text-xs uppercase text-muted">Revenue Contribution</p>
              <h3 class="text-lg font-semibold">By Organization</h3>
            </header>

            <div class="space-y-3">
              <div v-for="t in sortedTenants" :key="t.tenantId" class="space-y-1">
                <div class="flex items-center justify-between text-sm">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-medium truncate max-w-[200px]">{{ t.tenantName }}</span>
                    <UBadge
                      v-if="bestPerformer && t.tenantId === bestPerformer.tenantId && tenantCount > 1"
                      color="success"
                      variant="subtle"
                      size="xs"
                    >
                      Top margin
                    </UBadge>
                    <UBadge
                      v-if="t.netProfit < 0"
                      color="error"
                      variant="subtle"
                      size="xs"
                    >
                      Loss
                    </UBadge>
                  </div>
                  <div class="flex items-center gap-2 text-xs text-muted shrink-0">
                    <span class="font-medium">{{ fmt(t.revenueTotal) }}</span>
                    <span>{{ (totals?.revenueTotal ?? 0) > 0 ? `${((t.revenueTotal / (totals?.revenueTotal ?? 1)) * 100).toFixed(1)}%` : '-' }}</span>
                  </div>
                </div>
                <div class="h-2.5 bg-muted/10 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-primary rounded-full transition-all duration-500"
                    :style="{ width: (totals?.revenueTotal ?? 0) > 0 ? `${Math.max(2, (t.revenueTotal / (totals?.revenueTotal ?? 1)) * 100)}%` : '0%' }"
                  />
                </div>
              </div>
            </div>

            <div v-if="revenueConcentration" class="pt-3 border-t border-default flex items-center gap-2">
              <UBadge
                :color="revenueConcentration.level === 'high' ? 'error' : revenueConcentration.level === 'moderate' ? 'warning' : 'success'"
                variant="subtle"
                size="xs"
              >
                {{ revenueConcentration.level === 'high' ? 'High Concentration' : revenueConcentration.level === 'moderate' ? 'Moderate' : 'Diversified' }}
              </UBadge>
              <span class="text-xs text-muted">
                {{ revenueConcentration.topOrg }} is {{ fmtPct(revenueConcentration.topShare) }} of total
              </span>
            </div>
          </UCard>

          <!-- Margin Comparison -->
          <UCard :ui="{ body: '!p-6 space-y-4' }">
            <header>
              <p class="text-xs uppercase text-muted">Profit Margin Comparison</p>
              <h3 class="text-lg font-semibold">By Organization</h3>
            </header>

            <div class="space-y-4">
              <div v-for="t in sortedTenants" :key="t.tenantId">
                <div class="flex items-center justify-between text-sm mb-1">
                  <span class="font-medium truncate max-w-[200px]">{{ t.tenantName }}</span>
                  <div class="flex items-center gap-2">
                    <span class="font-semibold">{{ fmtPct(t.profitMargin) }}</span>
                    <span
                      :class="[
                        'inline-block size-2 rounded-full',
                        t.profitMargin >= 0.15 ? 'bg-green-500' : t.profitMargin >= 0.05 ? 'bg-yellow-500' : 'bg-red-500'
                      ]"
                    />
                  </div>
                </div>
                <div class="h-3 bg-muted/10 rounded-full overflow-hidden relative">
                  <!-- 15% benchmark line (scale: margin*200, so 15%→30% position) -->
                  <div class="absolute top-0 bottom-0 w-px bg-green-500/40" style="left: 30%" />
                  <!-- Margin bar (capped at 100% visually for display, handle negative) -->
                  <div
                    :class="[
                      'h-full rounded-full transition-all duration-500',
                      t.profitMargin >= 0.15 ? 'bg-green-500' : t.profitMargin >= 0.05 ? 'bg-yellow-500' : t.profitMargin >= 0 ? 'bg-orange-500' : 'bg-red-500'
                    ]"
                    :style="{ width: t.profitMargin > 0 ? `${Math.min(100, Math.max(2, t.profitMargin * 100 * 2))}%` : '2%' }"
                  />
                </div>
                <div class="flex items-center justify-between text-[10px] text-muted mt-0.5">
                  <span>{{ fmt(t.netProfit) }} net</span>
                  <span>on {{ fmt(t.revenueTotal) }} revenue</span>
                </div>
              </div>
            </div>

            <div class="pt-3 border-t border-default text-xs text-muted flex items-center gap-2">
              <span class="inline-block w-px h-3 bg-green-500/60" />
              <span>15% net margin benchmark (agency target)</span>
            </div>
          </UCard>
        </div>

        <!-- ═══ Detailed Organization Table ═══ -->
        <UCard :ui="{ body: '!p-0' }">
          <template #header>
            <div class="flex items-center justify-between px-6">
              <div>
                <p class="text-xs uppercase text-muted">Detailed Comparison</p>
                <h3 class="text-base font-semibold">All {{ tenantCount }} Organizations</h3>
              </div>
              <div class="text-xs text-muted">
                {{ data?.fromDate }} to {{ data?.toDate }}
              </div>
            </div>
          </template>

          <UTable :columns="orgColumns" :data="orgRows" class="w-full">
            <template #tenantName-cell="{ row }">
              <div class="flex items-center gap-2">
                <UAvatar :label="row.original.tenantName.charAt(0)" size="xs" />
                <span class="font-medium text-sm">{{ row.original.tenantName }}</span>
              </div>
            </template>

            <template #netProfit-cell="{ row }">
              <span
                class="text-sm font-medium text-right block"
                :class="(row.original._raw as TenantPnL).netProfit < 0 ? 'text-red-500' : ''"
              >
                {{ row.original.netProfit }}
              </span>
            </template>

            <template #profitMargin-cell="{ row }">
              <div class="flex items-center justify-end gap-1.5">
                <span class="text-sm font-medium">{{ row.original.profitMargin }}</span>
                <span
                  :class="[
                    'inline-block size-2 rounded-full',
                    (row.original._raw as TenantPnL).profitMargin >= 0.15 ? 'bg-green-500' :
                    (row.original._raw as TenantPnL).profitMargin >= 0.05 ? 'bg-yellow-500' : 'bg-red-500'
                  ]"
                />
              </div>
            </template>
          </UTable>

          <!-- Totals row -->
          <div class="px-6 py-3 border-t border-default bg-elevated/30 flex items-center justify-between text-sm">
            <span class="font-semibold">Consolidated Total</span>
            <div class="flex items-center gap-6">
              <span class="font-semibold">{{ fmt(totals?.revenueTotal) }}</span>
              <span class="font-semibold">{{ fmt(totals?.expensesTotal) }}</span>
              <span class="font-semibold" :class="(totals?.netProfit ?? 0) < 0 ? 'text-red-500' : ''">
                {{ fmt(totals?.netProfit) }}
              </span>
              <div class="flex items-center gap-1.5">
                <span class="font-semibold">{{ fmtPct(totals?.profitMargin) }}</span>
                <span :class="['inline-block size-2 rounded-full', benchmarkDotColor[marginBenchmark.level]]" />
              </div>
            </div>
          </div>
        </UCard>

        <!-- ═══ Entity Performance Cards ═══ -->
        <div v-if="tenantCount > 1" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <UCard v-for="t in sortedTenants" :key="t.tenantId" :ui="{ body: '!p-5 space-y-4' }">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <UAvatar :label="t.tenantName.charAt(0)" size="sm" />
                <div>
                  <p class="font-semibold text-sm">{{ t.tenantName }}</p>
                  <p class="text-xs text-muted">{{ displayLabel }}</p>
                </div>
              </div>
              <UBadge
                :color="t.profitMargin >= 0.15 ? 'success' : t.profitMargin >= 0.05 ? 'warning' : 'error'"
                variant="subtle"
                size="xs"
              >
                {{ t.profitMargin >= 0.15 ? 'Healthy' : t.profitMargin >= 0.05 ? 'Tight' : t.profitMargin < 0 ? 'Loss' : 'Low' }}
              </UBadge>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <p class="text-[10px] text-muted uppercase">Revenue</p>
                <p class="text-sm font-semibold">{{ fmt(t.revenueTotal) }}</p>
              </div>
              <div>
                <p class="text-[10px] text-muted uppercase">Expenses</p>
                <p class="text-sm font-semibold">{{ fmt(t.expensesTotal) }}</p>
              </div>
              <div>
                <p class="text-[10px] text-muted uppercase">Net Profit</p>
                <p class="text-sm font-semibold" :class="t.netProfit < 0 ? 'text-red-500' : ''">{{ fmt(t.netProfit) }}</p>
              </div>
              <div>
                <p class="text-[10px] text-muted uppercase">Margin</p>
                <div class="flex items-center gap-1.5">
                  <p class="text-sm font-semibold">{{ fmtPct(t.profitMargin) }}</p>
                  <span
                    :class="[
                      'inline-block size-2 rounded-full',
                      t.profitMargin >= 0.15 ? 'bg-green-500' : t.profitMargin >= 0.05 ? 'bg-yellow-500' : 'bg-red-500'
                    ]"
                  />
                </div>
              </div>
            </div>

            <!-- Revenue share bar -->
            <div>
              <div class="flex items-center justify-between text-[10px] text-muted mb-1">
                <span>Group revenue share</span>
                <span>{{ (totals?.revenueTotal ?? 0) > 0 ? `${((t.revenueTotal / (totals?.revenueTotal ?? 1)) * 100).toFixed(1)}%` : '-' }}</span>
              </div>
              <div class="h-1.5 bg-muted/10 rounded-full overflow-hidden">
                <div
                  class="h-full bg-primary/60 rounded-full transition-all duration-500"
                  :style="{ width: (totals?.revenueTotal ?? 0) > 0 ? `${Math.max(2, (t.revenueTotal / (totals?.revenueTotal ?? 1)) * 100)}%` : '0%' }"
                />
              </div>
            </div>
          </UCard>
        </div>

        <!-- ═══ AI Insights ═══ -->
        <UCard v-if="insights.length" :ui="{ body: '!p-6 space-y-3' }">
          <header>
            <p class="text-xs uppercase text-muted">Consolidated Insights</p>
            <h3 class="text-lg font-semibold">Group Analysis</h3>
          </header>

          <div v-for="(insight, i) in insights" :key="i" class="flex gap-3 items-start">
            <UIcon name="i-lucide-sparkles" class="size-4 text-primary mt-0.5 shrink-0" />
            <span class="text-sm text-muted leading-relaxed">{{ insight }}</span>
          </div>
        </UCard>

        <!-- ═══ Navigation ═══ -->
        <div class="flex items-center gap-3">
          <UButton label="Detailed P&L" variant="ghost" color="primary" icon="i-lucide-pie-chart" to="/profit-loss" />
          <UButton label="Cash Flow" variant="ghost" color="primary" icon="i-lucide-trending-up" to="/cashflow" />
          <UButton label="All Reports" variant="ghost" color="neutral" icon="i-lucide-arrow-left" to="/reports" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
