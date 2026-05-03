<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

const { data, pending, error, lastUpdated, isLive, refresh } = useGetOutRealtime()

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(val)

const isPositive = computed(() => (data.value?.difference ?? 0) >= 0)
const differenceColor = computed(() =>
  isPositive.value ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
)
const differenceBg = computed(() =>
  isPositive.value ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'
)

const breadcrumbs = computed(() => [
  { label: 'Home', to: '/' },
  { label: 'XeroFlow', to: '/xeroflow' },
  { label: 'Get Out', to: '/xeroflow/get-out' },
])

// ── Pacing curve (cumulative this month vs prior vs target line) ──
interface PacingResponse {
  period: { year: number; month: number; daysInMonth: number; dayOfMonth: number }
  target: number
  dailyPaceTarget: number
  currentTotal: number
  priorTotal: number
  points: Array<{ day: number; currentCumulative: number | null; priorCumulative: number | null; targetLine: number }>
}
const { data: pacing } = await useFetch<PacingResponse>('/api/xero/get-out/pacing', {
  lazy: true, server: false,
})

// ── Last 12 months target vs invoiced ──
interface HistoryResponse {
  months: Array<{ monthStart: string; monthLabel: string; invoiced: number; target: number; hit: boolean; pctOfTarget: number; invoiceCount: number }>
  summary: { monthsTracked: number; hitCount: number; missCount: number; hitRate: number; avgPctOfTarget: number; currentTarget: number }
}
const { data: history } = await useFetch<HistoryResponse>('/api/xero/get-out/history', {
  lazy: true, server: false,
})

// ── Forecast band (Phase 2) — committed + AR + recurring + probable quotes ──
interface ForecastResponse {
  target: number
  layers: { invoiced: number; arCollectible: number; recurring: number; quotesProbable: number }
  leakage: { total: number; creditNotes: number; creditNotesCount: number; voidedInvoices: number }
  committed: number
  committedPlusRecurring: number
  totalProjected: number
  gap: number
  surplus: number
  onTrack: boolean
  quotes: { byStatus: { draft: { count: number; total: number }; sent: { count: number; total: number }; accepted: { count: number; total: number } } }
  recurringSchedulesRemaining: number
  computedAt: string
}
const { data: forecast } = await useFetch<ForecastResponse>('/api/xero/get-out/forecast', {
  lazy: true, server: false,
})

// ── Top contributors this month ──
interface TopClient {
  id: string
  name: string
  email: string | null
  currency: string
  thisMonth: number
  thisMonthCount: number
  priorMonth: number
  vsPriorPct: number | null
  outstanding: number
  overdue: number
  churnRiskScore: number
  churnRiskBand: 'low' | 'moderate' | 'high' | 'critical'
  sharePct: number
}
interface ClientsResponse {
  clients: TopClient[]
  totalThisMonth: number
  contributorCount: number
}
const { data: topClients } = await useFetch<ClientsResponse>('/api/xero/get-out/clients?limit=10', {
  lazy: true, server: false,
})

function riskBadgeColor(band: 'low' | 'moderate' | 'high' | 'critical'): string {
  if (band === 'critical' || band === 'high') return 'error'
  if (band === 'moderate') return 'warning'
  return 'success'
}

function quoteStatusColor(status: 'draft' | 'sent' | 'accepted'): string {
  if (status === 'accepted') return 'success'
  if (status === 'sent') return 'info'
  return 'neutral'
}

// ── Settings modal — gear button in the header opens it ──
const showConfigModal = ref(false)
async function onConfigSaved() {
  // Bust both the page payload and the pacing/history charts since target changes everywhere
  await Promise.all([refresh?.(), refreshNuxtData()])
}
</script>

<template>
  <UDashboardPanel id="get-out">
    <template #header>
      <UDashboardNavbar title="Get Out — Cashflow Target">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-3">
            <div v-if="isLive" class="flex items-center gap-1.5 text-xs text-emerald-500">
              <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Live
            </div>
            <UButton
              icon="i-lucide-settings"
              color="neutral"
              variant="ghost"
              size="sm"
              label="Configure"
              @click="showConfigModal = true"
            />
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="pending"
              @click="refresh()"
            />
          </div>
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :links="breadcrumbs" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-4">
        <USkeleton class="h-32" />
        <USkeleton class="h-64" />
      </div>

      <UAlert
        v-else-if="error"
        icon="i-lucide-alert-octagon"
        color="error"
        variant="subtle"
        title="Unable to load Get Out data"
        :description="(error as any)?.statusMessage || 'Please try refreshing.'"
      />

      <div v-else-if="data" class="space-y-6 max-w-3xl mx-auto">
        <!-- Period Header -->
        <div class="text-center">
          <h2 class="text-2xl font-bold">{{ data.period.monthName }} {{ data.period.year }}</h2>
          <p class="text-sm text-muted">Day {{ data.period.dayOfMonth }} of {{ data.period.daysInMonth }}</p>
        </div>

        <!-- Calculation Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Wages -->
          <UCard>
            <div class="flex items-center gap-3 mb-2">
              <div class="shrink-0 w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-users" class="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p class="text-sm text-muted">Est. Monthly Wages</p>
                <p class="text-xl font-bold">{{ formatCurrency(data.wages) }}</p>
              </div>
            </div>
            <p class="text-xs text-muted">Based on 4 weeks payroll</p>
          </UCard>

          <!-- Expenses -->
          <UCard>
            <div class="flex items-center gap-3 mb-2">
              <div class="shrink-0 w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-wallet" class="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p class="text-sm text-muted">Expenses (est.)</p>
                <p class="text-xl font-bold">{{ formatCurrency(data.expenses.estimated) }}</p>
              </div>
            </div>
            <p class="text-xs text-muted">Fixed operating costs</p>
          </UCard>
        </div>

        <!-- Extras Breakdown -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-alert-circle" class="h-4 w-4 text-muted" />
              <h3 class="font-semibold">Extras</h3>
            </div>
          </template>
          <div class="space-y-2">
            <div class="flex items-center justify-between py-2 border-b border-default/50">
              <span class="text-sm text-muted">ATO Repayment</span>
              <span class="font-medium">{{ formatCurrency(data.expenses.extras.detail.atoRepayment) }}</span>
            </div>
            <div class="flex items-center justify-between py-2 border-b border-default/50">
              <span class="text-sm text-muted">Loan 1</span>
              <span class="font-medium">{{ formatCurrency(data.expenses.extras.detail.loan1) }}</span>
            </div>
            <div class="flex items-center justify-between py-2 border-b border-default/50">
              <span class="text-sm text-muted">Loan 2</span>
              <span class="font-medium">{{ formatCurrency(data.expenses.extras.detail.loan2) }}</span>
            </div>
            <div class="flex items-center justify-between py-2 border-b border-default/50">
              <span class="text-sm text-muted">Loan Interest</span>
              <span class="font-medium">{{ formatCurrency(data.expenses.extras.detail.loanInterest) }}</span>
            </div>
            <div class="flex items-center justify-between py-2">
              <span class="text-sm font-semibold">Extras Total</span>
              <span class="font-bold">{{ formatCurrency(data.expenses.extras.total) }}</span>
            </div>
          </div>
        </UCard>

        <!-- GET OUT Target -->
        <UCard :class="differenceBg">
          <div class="text-center py-4">
            <p class="text-sm text-muted mb-1">Updated Monthly GET OUT Target</p>
            <p class="text-4xl font-bold" :class="differenceColor">
              {{ formatCurrency(data.getOutTarget) }}
            </p>
            <p class="text-xs text-muted mt-2">
              Wages {{ formatCurrency(data.wages) }} + Expenses {{ formatCurrency(data.expenses.totalIncExtras) }}
            </p>
          </div>
        </UCard>

        <!-- Forecast band — Phase 2 -->
        <UCard v-if="forecast">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Forecast for this month</h3>
              <UTooltip text="Invoiced + AR likely to land + recurring schedules + open quotes weighted by status">
                <UIcon name="i-lucide-info" class="size-4 text-muted" />
              </UTooltip>
            </div>
          </template>
          <XeroflowGetOutForecastBand
            :layers="forecast.layers"
            :leakage="forecast.leakage"
            :target="forecast.target"
            :total-projected="forecast.totalProjected"
            :gap="forecast.gap"
            :surplus="forecast.surplus"
            :on-track="forecast.onTrack"
          />
        </UCard>

        <!-- Pacing curve — cumulative this month vs last month vs daily-pace target -->
        <UCard v-if="pacing && pacing.points.length">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Pacing</h3>
              <p class="text-xs text-muted">
                Day {{ pacing.period.dayOfMonth }}/{{ pacing.period.daysInMonth }} ·
                {{ formatCurrency(pacing.currentTotal) }} of {{ formatCurrency(pacing.target) }}
                <span v-if="pacing.priorTotal > 0" class="ml-1">
                  · last month finished {{ formatCurrency(pacing.priorTotal) }}
                </span>
              </p>
            </div>
          </template>
          <XeroflowGetOutPacingChart
            :points="pacing.points"
            :target="pacing.target"
            :days-in-month="pacing.period.daysInMonth"
            :day-of-month="pacing.period.dayOfMonth"
          />
        </UCard>

        <!-- (Was: Invoiced/Pace/Difference cards — replaced by the
             forecast band above which surfaces the same information with
             AR collectibility + recurring + quote pipeline layered in.) -->

        <!-- Top contributors this month -->
        <UCard v-if="topClients && topClients.clients.length" :ui="{ body: '!p-0' }">
          <template #header>
            <div class="flex items-center justify-between px-6">
              <div>
                <h3 class="font-semibold">Top contributors this month</h3>
                <p class="text-xs text-muted">
                  {{ topClients.contributorCount }} clients invoiced
                  · {{ formatCurrency(topClients.totalThisMonth) }} total
                </p>
              </div>
            </div>
          </template>
          <table class="w-full text-sm">
            <thead class="bg-elevated/50 text-xs uppercase text-muted">
              <tr>
                <th class="text-left font-medium px-4 py-2">Client</th>
                <th class="text-right font-medium px-4 py-2">This month</th>
                <th class="text-right font-medium px-4 py-2">Share</th>
                <th class="text-right font-medium px-4 py-2">vs last mo</th>
                <th class="text-right font-medium px-4 py-2">Outstanding</th>
                <th class="text-left font-medium px-4 py-2 pl-3">Risk</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr
                v-for="c in topClients.clients"
                :key="c.id"
                class="hover:bg-elevated/40 cursor-pointer"
                @click="navigateTo(`/customers/${c.id}`)"
              >
                <td class="px-4 py-2">
                  <p class="font-medium truncate">{{ c.name }}</p>
                  <p class="text-xs text-muted truncate">{{ c.email || '—' }}</p>
                </td>
                <td class="px-4 py-2 text-right tabular-nums font-medium">
                  {{ formatCurrency(c.thisMonth) }}
                  <p class="text-[11px] text-muted font-normal">{{ c.thisMonthCount }} inv</p>
                </td>
                <td class="px-4 py-2 text-right tabular-nums">{{ c.sharePct }}%</td>
                <td class="px-4 py-2 text-right tabular-nums">
                  <span
                    v-if="c.vsPriorPct != null"
                    :class="c.vsPriorPct >= 0 ? 'text-emerald-500' : 'text-red-500'"
                  >
                    {{ c.vsPriorPct >= 0 ? '+' : '' }}{{ c.vsPriorPct }}%
                  </span>
                  <span v-else class="text-muted text-xs">new</span>
                </td>
                <td class="px-4 py-2 text-right tabular-nums">
                  <span :class="c.overdue > 0 ? 'text-red-500 font-medium' : c.outstanding > 0 ? 'font-medium' : 'text-muted'">
                    {{ c.outstanding > 0 ? formatCurrency(c.outstanding) : '—' }}
                  </span>
                </td>
                <td class="px-4 py-2">
                  <UBadge :color="riskBadgeColor(c.churnRiskBand) as any" variant="subtle" size="xs" class="capitalize">
                    {{ c.churnRiskBand }}
                  </UBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </UCard>

        <!-- Pipeline — open quotes that could close this month -->
        <UCard v-if="forecast && (forecast.quotes.byStatus.draft.count + forecast.quotes.byStatus.sent.count + forecast.quotes.byStatus.accepted.count) > 0">
          <template #header>
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 class="font-semibold">Open quote pipeline</h3>
                <p class="text-xs text-muted">
                  {{ formatCurrency(forecast.quotes.byStatus.draft.total + forecast.quotes.byStatus.sent.total + forecast.quotes.byStatus.accepted.total) }} face value
                  · {{ formatCurrency(forecast.layers.quotesProbable) }} probability-weighted
                </p>
              </div>
              <UButton
                label="View invoices →"
                size="xs"
                variant="ghost"
                color="neutral"
                to="/invoices"
              />
            </div>
          </template>
          <div class="grid grid-cols-3 gap-3">
            <div
              v-for="status in ['draft', 'sent', 'accepted'] as const"
              :key="status"
              class="p-4 rounded-lg border border-default"
            >
              <div class="flex items-center justify-between mb-1">
                <UBadge :color="quoteStatusColor(status) as any" variant="subtle" size="xs" class="capitalize">
                  {{ status }}
                </UBadge>
                <span class="text-[11px] text-muted">
                  ×{{ status === 'draft' ? '20%' : status === 'sent' ? '40%' : '80%' }}
                </span>
              </div>
              <p class="text-2xl font-bold tabular-nums mt-1">
                {{ formatCurrency(forecast.quotes.byStatus[status].total) }}
              </p>
              <p class="text-xs text-muted">
                {{ forecast.quotes.byStatus[status].count }} quote{{ forecast.quotes.byStatus[status].count === 1 ? '' : 's' }}
              </p>
            </div>
          </div>
          <p v-if="forecast.recurringSchedulesRemaining > 0" class="text-xs text-muted mt-3 italic">
            Plus {{ forecast.recurringSchedulesRemaining }} recurring schedule{{ forecast.recurringSchedulesRemaining === 1 ? '' : 's' }} firing later this month
            ({{ formatCurrency(forecast.layers.recurring) }}).
          </p>
        </UCard>

        <!-- Category Breakdown -->
        <UCard v-if="data.categoryBreakdown?.length">
          <template #header>
            <h3 class="font-semibold">This Month by Category</h3>
          </template>
          <div class="space-y-2">
            <div
              v-for="cat in data.categoryBreakdown"
              :key="cat.code"
              class="flex items-center justify-between py-2 border-b border-default/50 last:border-0"
            >
              <div class="flex items-center gap-2">
                <UBadge size="xs" variant="subtle">{{ cat.code }}</UBadge>
                <span class="text-sm">{{ cat.name }}</span>
              </div>
              <div class="text-right">
                <span class="font-medium">{{ formatCurrency(cat.total) }}</span>
                <span class="text-xs text-muted ml-2">({{ cat.count }} lines)</span>
              </div>
            </div>
          </div>
        </UCard>

        <!-- 12-month history strip -->
        <UCard v-if="history && history.months.length">
          <template #header>
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 class="font-semibold">12-month performance</h3>
                <p class="text-xs text-muted">
                  Hit target {{ history.summary.hitCount }} of {{ history.summary.monthsTracked }} months
                  · avg {{ history.summary.avgPctOfTarget }}% of target
                </p>
              </div>
              <UBadge
                :color="history.summary.hitRate >= 75 ? 'success' : history.summary.hitRate >= 50 ? 'warning' : 'error'"
                variant="subtle"
                size="sm"
              >
                {{ history.summary.hitRate }}% hit rate
              </UBadge>
            </div>
          </template>
          <div class="grid grid-cols-6 sm:grid-cols-12 gap-2">
            <UTooltip
              v-for="m in history.months"
              :key="m.monthStart"
              :text="`${m.monthLabel}: ${formatCurrency(m.invoiced)} of ${formatCurrency(m.target)} (${m.pctOfTarget}%)`"
            >
              <div class="flex flex-col items-center gap-1">
                <div class="relative w-full h-16 bg-muted/10 rounded overflow-hidden">
                  <div
                    class="absolute bottom-0 left-0 right-0 transition-all"
                    :class="m.hit ? 'bg-emerald-500/70 dark:bg-emerald-400/70' : 'bg-amber-500/70 dark:bg-amber-400/70'"
                    :style="{ height: `${Math.min(100, m.pctOfTarget)}%` }"
                  />
                  <!-- 100% target line -->
                  <div class="absolute left-0 right-0 border-t border-default" style="top: 0%" />
                </div>
                <span class="text-[10px] text-muted truncate w-full text-center">{{ m.monthLabel }}</span>
              </div>
            </UTooltip>
          </div>
          <p class="text-[11px] text-muted mt-3 italic">
            Bars compare each month's invoicing to today's Get Out target.
            Note: target reflects current config — historical config snapshots aren't tracked.
          </p>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Settings modal — gear button in header opens it -->
  <XeroflowGetOutConfigModal
    v-if="data"
    v-model:open="showConfigModal"
    :initial-lines="data.config?.lines ?? []"
    @saved="onConfigSaved"
  />
</template>
