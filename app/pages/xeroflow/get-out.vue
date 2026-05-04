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
  period: { year: number; month: number; daysInMonth: number; dayOfMonth: number; workingDaysSoFar: number; workingDaysRemaining: number }
  target: number
  dailyPaceTarget: number
  currentTotal: number
  priorTotal: number
  requiredFromHere: number
  requiredPerWorkingDay: number
  projectedAtCurrentPace: number | null
  projectedShortfall: number | null
  invoicingNotYetStarted: boolean
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
  scenarios: { worst: number; realistic: number; best: number; worstGap: number; bestGap: number }
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

// ── Phase 3a: cash + AR aging + AP due ──
const { data: cash } = await useFetch<{
  cashOnHand: number; daysOfCash: number | null; monthsRunway: number | null
  band: 'critical'|'tight'|'healthy'|'strong'|'unknown'; avgMonthlyOutflow: number
  overdrawn: boolean
}>('/api/xero/get-out/cash-position', { lazy: true, server: false })

const { data: aging } = await useFetch<{
  totalOutstanding: number; totalInvoices: number; averageDaysPastDue: number
  agingSummary: Array<{ bucket: string; amount: number; count: number; percentage: number }>
}>('/api/xero/reports/aging', { lazy: true, server: false })

const { data: apDue } = await useFetch<{
  totalDueThisMonth: number; totalDueThisWeek: number; totalOverdue: number
  billCount: number; urgentCount: number
}>('/api/xero/get-out/ap-due', { lazy: true, server: false })

// ── Phase 3b: margin + recurring mix ──
const { data: margin } = await useFetch<{
  revenue: number; passthrough: number; agi: number; deliveryCosts: number
  deliveryMargin: number | null
  deliveryMarginBand: 'strong'|'healthy'|'concerning'|'red'|'unknown'
}>('/api/xero/get-out/margin', { lazy: true, server: false })

const { data: recurringMix } = await useFetch<{
  totalRevenue: number; recurringRevenue: number; recurringPct: number
  recurringClientCount: number; band: 'low'|'mixed'|'healthy'|'high'
}>('/api/xero/get-out/recurring-mix', { lazy: true, server: false })

// ── Phase 4: smart actions, recurring calendar, AR collection forecast, tax provision ──
const { data: opsActions } = await useFetch<{
  generatedAt: string
  period: { monthStart: string; monthEnd: string; dayOfMonth: number; daysInMonth: number; workingDaysRemaining: number }
  target: number; invoiced: number; shortfall: number
  actions: Array<{ id: string; severity: 'critical'|'high'|'medium'|'low'; title: string; detail: string; value: string; linkTo?: string }>
}>('/api/xero/get-out/operational-actions', { lazy: true, server: false })

const { data: recurringCal } = await useFetch<{
  period: { year: number; month: number; daysInMonth: number; dayOfMonth: number }
  totals: { missing: number; pending: number; fired: number }
  counts: { missing: number; pending: number; fired: number }
  entries: Array<{ contactId: string; name: string | null; amount: number; expectedDay: number | null; status: 'fired'|'pending'|'missing'; source: 'xero_repeating'|'inferred' }>
}>('/api/xero/get-out/recurring-calendar', { lazy: true, server: false })

const { data: arForecast } = await useFetch<{
  totals: { thisMonth: number; nextMonth: number; later: number; total: number }
  counts: { thisMonth: number; nextMonth: number; total: number }
  thisMonthInvoices: Array<{ invoiceId: string; invoiceNumber: string | null; contactName: string | null; amount: number; dueDate: string | null; expectedDate: string; dsoDays: number }>
}>('/api/xero/get-out/ar-collection-forecast', { lazy: true, server: false })

const { data: taxProvision } = await useFetch<{
  currentQuarter: { label: string; fromDate: string; toDate: string; monthsElapsed: number }
  bas: { dueDate: string; daysUntil: number }
  gst: { collected: number; paid: number; netOwed: number; arInclGst: number; apInclGst: number }
  payg: { estimated: number; basedOnWagesQuarter: number; ratePct: number }
  superGuarantee: { estimated: number; ratePct: number }
  totalSetAside: number
}>('/api/xero/get-out/tax-provision', { lazy: true, server: false })

function severityIconOps(s: string) {
  if (s === 'critical') return 'i-lucide-alert-octagon'
  if (s === 'high') return 'i-lucide-alert-triangle'
  if (s === 'medium') return 'i-lucide-info'
  return 'i-lucide-circle'
}
function statusColor(s: string) {
  if (s === 'missing') return 'error'
  if (s === 'pending') return 'warning'
  return 'success'
}

function cashBandColor(b: string): string {
  if (b === 'critical') return 'error'
  if (b === 'tight') return 'warning'
  if (b === 'strong' || b === 'healthy') return 'success'
  return 'neutral'
}
function marginBandColor(b: string): string {
  if (b === 'red') return 'error'
  if (b === 'concerning') return 'warning'
  if (b === 'strong' || b === 'healthy') return 'success'
  return 'neutral'
}
function mixBandColor(b: string): string {
  if (b === 'low') return 'warning'
  if (b === 'mixed') return 'info'
  return 'success'
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
      <UDashboardNavbar
        title="Get Out — Cashflow Target"
        :description="data ? `${data.period.monthName} ${data.period.year} · day ${data.period.dayOfMonth} of ${data.period.daysInMonth}` : undefined"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-3">
            <div v-if="isLive" class="flex items-center gap-1.5 text-sm text-emerald-500">
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

      <div v-else-if="data" class="space-y-6">
        <!-- ═══ Smart action list — what to do this month ═══ -->
        <UCard v-if="opsActions?.actions?.length" :ui="{ body: '!p-0' }">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-semibold flex items-center gap-2">
                  <UIcon name="i-lucide-list-checks" class="text-primary" />
                  Action list
                </h3>
                <p class="text-sm text-muted">
                  {{ opsActions.actions.length }} ranked action{{ opsActions.actions.length === 1 ? '' : 's' }}
                  · {{ opsActions.period.workingDaysRemaining }} working days left
                </p>
              </div>
            </div>
          </template>
          <ul class="divide-y divide-default">
            <li v-for="a in opsActions.actions" :key="a.id" class="flex items-start gap-3 px-6 py-3">
              <UIcon
                :name="severityIconOps(a.severity)"
                class="mt-0.5 shrink-0"
                :class="{
                  'text-red-500':    a.severity === 'critical',
                  'text-amber-500':  a.severity === 'high',
                  'text-blue-500':   a.severity === 'medium',
                  'text-muted':      a.severity === 'low',
                }"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline justify-between gap-3 flex-wrap">
                  <p class="font-medium text-sm">{{ a.title }}</p>
                  <span class="text-sm tabular-nums font-medium"
                    :class="{
                      'text-red-500':   a.severity === 'critical',
                      'text-amber-500': a.severity === 'high',
                      'text-muted':     a.severity === 'medium' || a.severity === 'low',
                    }">{{ a.value }}</span>
                </div>
                <p class="text-sm text-muted mt-0.5">{{ a.detail }}</p>
              </div>
            </li>
          </ul>
        </UCard>

        <!-- ═══ KPI strip — 4 cards across the top ═══ -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-sm text-muted uppercase tracking-wide">Monthly target</p>
              <UIcon name="i-lucide-target" class="size-5 text-blue-500" />
            </div>
            <p class="text-2xl font-bold tabular-nums">{{ formatCurrency(data.getOutTarget) }}</p>
            <p class="text-xs text-muted mt-1">Wages + expenses + extras</p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-sm text-muted uppercase tracking-wide">Invoiced so far</p>
              <UIcon name="i-lucide-receipt" class="size-5 text-emerald-500" />
            </div>
            <p class="text-2xl font-bold tabular-nums">{{ formatCurrency(data.currentMonth.invoicedTotal) }}</p>
            <p class="text-xs text-muted mt-1">{{ data.currentMonth.invoicedCount }} invoices</p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }" :class="differenceBg">
            <div class="flex items-start justify-between mb-2">
              <p class="text-sm text-muted uppercase tracking-wide">{{ isPositive ? 'Surplus' : 'Shortfall' }}</p>
              <UIcon
                :name="isPositive ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
                class="size-5"
                :class="differenceColor"
              />
            </div>
            <p class="text-2xl font-bold tabular-nums" :class="differenceColor">
              {{ isPositive ? '+' : '' }}{{ formatCurrency(data.difference) }}
            </p>
            <p class="text-xs text-muted mt-1">{{ isPositive ? 'Ahead of target' : 'Behind target' }}</p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-sm text-muted uppercase tracking-wide">Pace required</p>
              <UIcon name="i-lucide-gauge" class="size-5 text-violet-500" />
            </div>
            <p class="text-2xl font-bold tabular-nums">
              {{ pacing && pacing.requiredPerWorkingDay > 0
                ? formatCurrency(pacing.requiredPerWorkingDay) + '/day'
                : pacing && pacing.requiredFromHere === 0 ? 'On target ✓' : '—' }}
            </p>
            <p class="text-sm text-muted mt-1">
              <span v-if="pacing && pacing.invoicingNotYetStarted">
                {{ pacing.period.workingDaysRemaining }} working days left · invoicing not yet started
              </span>
              <span v-else-if="pacing && pacing.projectedAtCurrentPace != null">
                {{ pacing.period.workingDaysRemaining }} working days left · projecting {{ formatCurrency(pacing.projectedAtCurrentPace) }}
              </span>
              <span v-else-if="pacing">{{ pacing.period.workingDaysRemaining }} working days left</span>
              <span v-else>Day {{ data.period.dayOfMonth }} of {{ data.period.daysInMonth }}</span>
            </p>
          </UCard>
        </div>

        <!-- ═══ Phase 3a + 3b: Cash reality + profit reality strip ═══ -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <!-- Cash on hand -->
          <UCard :ui="{ body: '!p-4' }" :class="cash?.overdrawn ? 'bg-red-50/60 dark:bg-red-500/5' : ''">
            <div class="flex items-start justify-between mb-2">
              <p class="text-sm text-muted uppercase tracking-wide">Cash on hand</p>
              <UIcon name="i-lucide-banknote" class="size-5" :class="cash?.overdrawn ? 'text-red-500' : 'text-emerald-500'" />
            </div>
            <p class="text-xl font-bold tabular-nums" :class="cash?.overdrawn ? 'text-red-500' : ''">
              {{ cash ? formatCurrency(cash.cashOnHand) : '—' }}
            </p>
            <div class="flex items-center gap-1.5 mt-1">
              <UBadge v-if="cash?.overdrawn" color="error" variant="subtle" size="sm">
                Overdrawn
              </UBadge>
              <template v-else>
                <UBadge v-if="cash?.daysOfCash != null" :color="cashBandColor(cash.band) as any" variant="subtle" size="sm">
                  {{ cash.daysOfCash }}d runway
                </UBadge>
                <span v-if="cash?.monthsRunway != null" class="text-sm text-muted">~{{ cash.monthsRunway }}mo</span>
              </template>
            </div>
          </UCard>

          <!-- AR aging snapshot -->
          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-sm text-muted uppercase tracking-wide">AR outstanding</p>
              <UIcon name="i-lucide-receipt" class="size-5 text-blue-500" />
            </div>
            <p class="text-xl font-bold tabular-nums">{{ aging ? formatCurrency(aging.totalOutstanding) : '—' }}</p>
            <p class="text-xs text-muted mt-1">
              Avg {{ aging ? Math.round(aging.averageDaysPastDue) : 0 }}d past due
              <span v-if="aging?.totalInvoices">· {{ aging.totalInvoices }} inv</span>
            </p>
          </UCard>

          <!-- AP due this month -->
          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-sm text-muted uppercase tracking-wide">AP due this mo</p>
              <UIcon name="i-lucide-credit-card" class="size-5 text-amber-500" />
            </div>
            <p class="text-xl font-bold tabular-nums">{{ apDue ? formatCurrency(apDue.totalDueThisMonth) : '—' }}</p>
            <p class="text-xs mt-1" :class="(apDue?.totalOverdue ?? 0) > 0 ? 'text-red-500 font-medium' : 'text-muted'">
              <span v-if="(apDue?.totalOverdue ?? 0) > 0">{{ formatCurrency(apDue?.totalOverdue) }} overdue · </span>
              {{ apDue?.billCount ?? 0 }} bills
            </p>
          </UCard>

          <!-- Delivery margin -->
          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-sm text-muted uppercase tracking-wide">Delivery margin</p>
              <UIcon name="i-lucide-percent" class="size-5 text-violet-500" />
            </div>
            <p class="text-xl font-bold tabular-nums">
              {{ margin?.deliveryMargin != null ? `${margin.deliveryMargin}%` : '—' }}
            </p>
            <div class="flex items-center gap-1.5 mt-1">
              <UBadge :color="marginBandColor(margin?.deliveryMarginBand ?? 'unknown') as any" variant="subtle" size="sm">
                AGI {{ margin ? formatCurrency(margin.agi) : '—' }}
              </UBadge>
            </div>
          </UCard>

          <!-- Recurring mix -->
          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-sm text-muted uppercase tracking-wide">Recurring mix</p>
              <UIcon name="i-lucide-repeat" class="size-5 text-violet-500" />
            </div>
            <p class="text-xl font-bold tabular-nums">{{ recurringMix?.recurringPct ?? 0 }}%</p>
            <div class="flex items-center gap-1.5 mt-1">
              <UBadge :color="mixBandColor(recurringMix?.band ?? 'low') as any" variant="subtle" size="sm">
                {{ recurringMix?.recurringClientCount ?? 0 }} retainers
              </UBadge>
            </div>
          </UCard>
        </div>

        <!-- ═══ Forecast band — full width headline ═══ -->
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

          <!-- Worst / realistic / best scenario envelope -->
          <div v-if="forecast.scenarios" class="mt-4 pt-4 border-t border-default">
            <p class="text-sm text-muted uppercase tracking-wide mb-3">Scenario envelope</p>
            <div class="grid grid-cols-3 gap-3">
              <div class="p-3 rounded border border-default bg-red-50/40 dark:bg-red-500/5">
                <div class="flex items-center gap-1.5 mb-1">
                  <UIcon name="i-lucide-trending-down" class="size-3.5 text-red-500" />
                  <p class="text-sm text-muted uppercase">Worst case</p>
                </div>
                <p class="text-lg font-bold tabular-nums">{{ formatCurrency(forecast.scenarios.worst) }}</p>
                <p class="text-xs" :class="forecast.scenarios.worstGap > 0 ? 'text-red-500' : 'text-emerald-500'">
                  {{ forecast.scenarios.worstGap > 0 ? `${formatCurrency(forecast.scenarios.worstGap)} short` : 'Still hits target' }}
                </p>
              </div>
              <div class="p-3 rounded border border-primary/40 bg-primary/5">
                <div class="flex items-center gap-1.5 mb-1">
                  <UIcon name="i-lucide-target" class="size-3.5 text-primary" />
                  <p class="text-sm text-muted uppercase">Realistic</p>
                </div>
                <p class="text-lg font-bold tabular-nums">{{ formatCurrency(forecast.scenarios.realistic) }}</p>
                <p class="text-xs" :class="forecast.gap > 0 ? 'text-amber-500' : 'text-emerald-500'">
                  {{ forecast.gap > 0 ? `${formatCurrency(forecast.gap)} short` : `${formatCurrency(forecast.surplus)} surplus` }}
                </p>
              </div>
              <div class="p-3 rounded border border-default bg-emerald-50/40 dark:bg-emerald-500/5">
                <div class="flex items-center gap-1.5 mb-1">
                  <UIcon name="i-lucide-trending-up" class="size-3.5 text-emerald-500" />
                  <p class="text-sm text-muted uppercase">Best case</p>
                </div>
                <p class="text-lg font-bold tabular-nums">{{ formatCurrency(forecast.scenarios.best) }}</p>
                <p class="text-xs" :class="forecast.scenarios.bestGap > 0 ? 'text-amber-500' : 'text-emerald-500'">
                  {{ forecast.scenarios.bestGap > 0 ? `${formatCurrency(forecast.scenarios.bestGap)} short` : 'Above target' }}
                </p>
              </div>
            </div>
            <p class="text-xs text-muted italic mt-2">
              Worst = AR × 60% + recurring × 85% + quotes weighted lower (5/20/60%).
              Best = full AR + full recurring + quotes weighted upper (40/70/95%).
            </p>
          </div>
        </UCard>

        <!-- ═══ Row: Pacing chart (2/3) + Quote pipeline (1/3) ═══ -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <UCard v-if="pacing && pacing.points.length" class="xl:col-span-2">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Pacing</h3>
                <p class="text-sm text-muted">
                  {{ formatCurrency(pacing.currentTotal) }} of {{ formatCurrency(pacing.target) }}
                  <span v-if="pacing.priorTotal > 0" class="ml-1">
                    · last month {{ formatCurrency(pacing.priorTotal) }}
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

          <!-- Quote pipeline (right column on xl) -->
          <UCard v-if="forecast && (forecast.quotes.byStatus.draft.count + forecast.quotes.byStatus.sent.count + forecast.quotes.byStatus.accepted.count) > 0">
            <template #header>
              <div>
                <h3 class="font-semibold">Open quotes</h3>
                <p class="text-sm text-muted">
                  {{ formatCurrency(forecast.layers.quotesProbable) }} probability-weighted
                </p>
              </div>
            </template>
            <div class="space-y-3">
              <div
                v-for="status in ['accepted', 'sent', 'draft'] as const"
                :key="status"
                class="flex items-center justify-between p-3 rounded-lg border border-default"
              >
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <UBadge :color="quoteStatusColor(status) as any" variant="subtle" size="sm" class="capitalize">
                      {{ status }}
                    </UBadge>
                    <span class="text-xs text-muted">
                      ×{{ status === 'draft' ? '20%' : status === 'sent' ? '40%' : '80%' }}
                    </span>
                  </div>
                  <p class="text-xs text-muted mt-0.5">
                    {{ forecast.quotes.byStatus[status].count }} quote{{ forecast.quotes.byStatus[status].count === 1 ? '' : 's' }}
                  </p>
                </div>
                <p class="text-base font-semibold tabular-nums">
                  {{ formatCurrency(forecast.quotes.byStatus[status].total) }}
                </p>
              </div>
            </div>
            <p v-if="forecast.recurringSchedulesRemaining > 0" class="text-sm text-muted mt-3">
              + {{ forecast.recurringSchedulesRemaining }} recurring schedule{{ forecast.recurringSchedulesRemaining === 1 ? '' : 's' }} firing later this month
              ({{ formatCurrency(forecast.layers.recurring) }})
            </p>
          </UCard>
        </div>

        <!-- ═══ Row: Recurring calendar + AR collection forecast + Tax provision ═══ -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <!-- Recurring schedule calendar -->
          <UCard v-if="recurringCal" :ui="{ body: '!p-0' }">
            <template #header>
              <div class="px-6">
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">Retainer calendar</h3>
                  <UBadge
                    v-if="recurringCal.counts.missing > 0"
                    color="error" variant="subtle" size="sm"
                  >
                    {{ recurringCal.counts.missing }} missing
                  </UBadge>
                  <UBadge v-else-if="recurringCal.counts.fired > 0" color="success" variant="subtle" size="sm">
                    All clear
                  </UBadge>
                </div>
                <p class="text-sm text-muted">
                  {{ recurringCal.counts.fired }} fired · {{ recurringCal.counts.pending }} pending · {{ recurringCal.counts.missing }} missing
                </p>
              </div>
            </template>
            <ul class="divide-y divide-default max-h-80 overflow-y-auto">
              <li v-for="e in recurringCal.entries.slice(0, 12)" :key="e.contactId + (e.expectedDay ?? '')" class="px-6 py-2">
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <UBadge :color="statusColor(e.status) as any" variant="subtle" size="sm" class="capitalize">
                        {{ e.status }}
                      </UBadge>
                      <p class="text-sm font-medium truncate">{{ e.name }}</p>
                    </div>
                    <p class="text-xs text-muted">
                      {{ e.expectedDay ? `Typical day ${e.expectedDay}` : 'No history' }}
                      · {{ e.source === 'xero_repeating' ? 'Xero schedule' : 'inferred pattern' }}
                    </p>
                  </div>
                  <p class="text-sm tabular-nums font-medium">{{ formatCurrency(e.amount) }}</p>
                </div>
              </li>
              <li v-if="!recurringCal.entries.length" class="px-6 py-6 text-center text-muted text-sm">
                No retainer activity this month.
              </li>
            </ul>
          </UCard>

          <!-- AR collection forecast -->
          <UCard v-if="arForecast" :ui="{ body: '!p-0' }">
            <template #header>
              <div class="px-6">
                <h3 class="font-semibold">AR collection forecast</h3>
                <p class="text-sm text-muted">
                  Of {{ formatCurrency(arForecast.totals.total) }} outstanding · DSO-weighted
                </p>
              </div>
            </template>
            <div class="px-6 py-3 grid grid-cols-3 gap-2">
              <div>
                <p class="text-xs uppercase text-muted">This month</p>
                <p class="text-base font-bold tabular-nums text-emerald-500">{{ formatCurrency(arForecast.totals.thisMonth) }}</p>
              </div>
              <div>
                <p class="text-xs uppercase text-muted">Next month</p>
                <p class="text-base font-bold tabular-nums text-amber-500">{{ formatCurrency(arForecast.totals.nextMonth) }}</p>
              </div>
              <div>
                <p class="text-xs uppercase text-muted">Later</p>
                <p class="text-base font-bold tabular-nums text-red-500">{{ formatCurrency(arForecast.totals.later) }}</p>
              </div>
            </div>
            <div class="border-t border-default">
              <p class="px-6 pt-3 text-xs uppercase text-muted">Landing this month</p>
              <ul class="divide-y divide-default max-h-60 overflow-y-auto">
                <li v-for="inv in arForecast.thisMonthInvoices" :key="inv.invoiceId" class="px-6 py-2 text-sm">
                  <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <p class="font-medium truncate">{{ inv.contactName ?? '—' }}</p>
                      <p class="text-xs text-muted">
                        {{ inv.invoiceNumber || '—' }} · expected ~{{ new Date(inv.expectedDate).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }) }}
                      </p>
                    </div>
                    <p class="text-sm tabular-nums font-medium">{{ formatCurrency(inv.amount) }}</p>
                  </div>
                </li>
                <li v-if="!arForecast.thisMonthInvoices.length" class="px-6 py-6 text-center text-muted text-sm">
                  No AR landing this month.
                </li>
              </ul>
            </div>
          </UCard>

          <!-- Tax provision tracker -->
          <UCard v-if="taxProvision">
            <template #header>
              <div>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">Tax provision</h3>
                  <UBadge :color="(taxProvision.bas.daysUntil < 30 ? 'warning' : 'info') as any" variant="subtle" size="sm">
                    BAS in {{ taxProvision.bas.daysUntil }}d
                  </UBadge>
                </div>
                <p class="text-sm text-muted">{{ taxProvision.currentQuarter.label }} · BAS due {{ taxProvision.bas.dueDate }}</p>
              </div>
            </template>
            <div class="space-y-3 text-sm">
              <div>
                <p class="text-xs uppercase text-muted">Set aside</p>
                <p class="text-2xl font-bold tabular-nums">{{ formatCurrency(taxProvision.totalSetAside) }}</p>
              </div>
              <div class="space-y-2 pt-2 border-t border-default">
                <div class="flex items-center justify-between">
                  <span>GST net owed</span>
                  <span class="tabular-nums font-medium">{{ formatCurrency(taxProvision.gst.netOwed) }}</span>
                </div>
                <div class="flex items-center justify-between text-sm text-muted pl-3">
                  <span>collected ÷ paid</span>
                  <span class="tabular-nums">
                    {{ formatCurrency(taxProvision.gst.collected) }} / {{ formatCurrency(taxProvision.gst.paid) }}
                  </span>
                </div>
                <div class="flex items-center justify-between">
                  <span>PAYG (~{{ taxProvision.payg.ratePct }}%)</span>
                  <span class="tabular-nums font-medium">{{ formatCurrency(taxProvision.payg.estimated) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span>Super ({{ taxProvision.superGuarantee.ratePct }}%)</span>
                  <span class="tabular-nums font-medium">{{ formatCurrency(taxProvision.superGuarantee.estimated) }}</span>
                </div>
              </div>
              <p class="text-xs text-muted italic pt-2 border-t border-default">
                Rough estimate. Sanity-check with your accountant before lodgement.
              </p>
            </div>
          </UCard>
        </div>

        <!-- ═══ Row: Top contributors (2/3) + Target breakdown (1/3) ═══ -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <UCard v-if="topClients && topClients.clients.length" class="xl:col-span-2" :ui="{ body: '!p-0' }">
            <template #header>
              <div class="flex items-center justify-between px-6">
                <div>
                  <h3 class="font-semibold">Top contributors this month</h3>
                  <p class="text-sm text-muted">
                    {{ topClients.contributorCount }} clients · {{ formatCurrency(topClients.totalThisMonth) }} total
                  </p>
                </div>
              </div>
            </template>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-elevated/50 text-sm uppercase text-muted">
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
                    <td class="px-4 py-2 max-w-xs">
                      <p class="font-medium truncate">{{ c.name }}</p>
                      <p class="text-sm text-muted truncate">{{ c.email || '—' }}</p>
                    </td>
                    <td class="px-4 py-2 text-right tabular-nums font-medium">
                      {{ formatCurrency(c.thisMonth) }}
                      <p class="text-xs text-muted font-normal">{{ c.thisMonthCount }} inv</p>
                    </td>
                    <td class="px-4 py-2 text-right tabular-nums">{{ c.sharePct }}%</td>
                    <td class="px-4 py-2 text-right tabular-nums">
                      <span
                        v-if="c.vsPriorPct != null"
                        :class="c.vsPriorPct >= 0 ? 'text-emerald-500' : 'text-red-500'"
                      >
                        {{ c.vsPriorPct >= 0 ? '+' : '' }}{{ c.vsPriorPct }}%
                      </span>
                      <span v-else class="text-muted text-sm">new</span>
                    </td>
                    <td class="px-4 py-2 text-right tabular-nums">
                      <span :class="c.overdue > 0 ? 'text-red-500 font-medium' : c.outstanding > 0 ? 'font-medium' : 'text-muted'">
                        {{ c.outstanding > 0 ? formatCurrency(c.outstanding) : '—' }}
                      </span>
                    </td>
                    <td class="px-4 py-2">
                      <UBadge :color="riskBadgeColor(c.churnRiskBand) as any" variant="subtle" size="sm" class="capitalize">
                        {{ c.churnRiskBand }}
                      </UBadge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>

          <!-- Target breakdown — replaces the 3 standalone wages/expenses/extras cards -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Target breakdown</h3>
                <UButton
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-pencil"
                  @click="showConfigModal = true"
                />
              </div>
            </template>
            <div class="space-y-4">
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-users" class="size-4 text-blue-500" />
                    <span class="text-sm">Wages</span>
                  </div>
                  <span class="font-medium tabular-nums">{{ formatCurrency(data.wages) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-wallet" class="size-4 text-amber-500" />
                    <span class="text-sm">Operating expenses</span>
                  </div>
                  <span class="font-medium tabular-nums">{{ formatCurrency(data.expenses.estimated) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-alert-circle" class="size-4 text-violet-500" />
                    <span class="text-sm">Extras (loans, ATO)</span>
                  </div>
                  <span class="font-medium tabular-nums">{{ formatCurrency(data.expenses.extras.total) }}</span>
                </div>
              </div>
              <div class="pt-3 border-t border-default flex items-center justify-between">
                <span class="text-sm font-semibold">Total target</span>
                <span class="text-lg font-bold tabular-nums">{{ formatCurrency(data.getOutTarget) }}</span>
              </div>
              <details v-if="data.config?.lines?.length" class="text-sm text-muted">
                <summary class="cursor-pointer hover:text-default select-none">
                  Show {{ data.config.lines.length }} line item{{ data.config.lines.length === 1 ? '' : 's' }}
                </summary>
                <div class="mt-2 space-y-1">
                  <div
                    v-for="line in data.config.lines"
                    :key="line.id"
                    class="flex items-center justify-between py-0.5"
                  >
                    <span class="truncate">{{ line.label }}</span>
                    <span class="tabular-nums">{{ formatCurrency(line.amountCents / 100) }}</span>
                  </div>
                </div>
              </details>
            </div>
          </UCard>
        </div>

        <!-- ═══ Row: Category breakdown (1/2) + 12-month history (1/2) ═══ -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <!-- Category Breakdown -->
          <UCard v-if="data.categoryBreakdown?.length">
            <template #header>
              <h3 class="font-semibold">This month by category</h3>
            </template>
            <div class="space-y-2">
              <div
                v-for="cat in data.categoryBreakdown"
                :key="cat.code"
                class="flex items-center justify-between py-2 border-b border-default/50 last:border-0"
              >
                <div class="flex items-center gap-2">
                  <UBadge size="sm" variant="subtle">{{ cat.code }}</UBadge>
                  <span class="text-sm">{{ cat.name }}</span>
                </div>
                <div class="text-right">
                  <span class="font-medium tabular-nums">{{ formatCurrency(cat.total) }}</span>
                  <span class="text-sm text-muted ml-2">({{ cat.count }} lines)</span>
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
                  <p class="text-sm text-muted">
                    {{ history.summary.hitCount }}/{{ history.summary.monthsTracked }} hit
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
                    <div class="absolute left-0 right-0 border-t border-default" style="top: 0%" />
                  </div>
                  <span class="text-xs text-muted truncate w-full text-center">{{ m.monthLabel }}</span>
                </div>
              </UTooltip>
            </div>
            <p class="text-xs text-muted mt-3 italic">
              Bars compare each month's invoicing to today's Get Out target.
            </p>
          </UCard>
        </div>
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
