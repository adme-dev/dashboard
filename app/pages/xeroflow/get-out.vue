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
      <UDashboardNavbar
        title="Get Out — Cashflow Target"
        :description="data ? `${data.period.monthName} ${data.period.year} · day ${data.period.dayOfMonth} of ${data.period.daysInMonth}` : undefined"
      >
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

      <div v-else-if="data" class="space-y-6">
        <!-- ═══ KPI strip — 4 cards across the top ═══ -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">Monthly target</p>
              <UIcon name="i-lucide-target" class="size-5 text-blue-500" />
            </div>
            <p class="text-2xl font-bold tabular-nums">{{ formatCurrency(data.getOutTarget) }}</p>
            <p class="text-[11px] text-muted mt-1">Wages + expenses + extras</p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">Invoiced so far</p>
              <UIcon name="i-lucide-receipt" class="size-5 text-emerald-500" />
            </div>
            <p class="text-2xl font-bold tabular-nums">{{ formatCurrency(data.currentMonth.invoicedTotal) }}</p>
            <p class="text-[11px] text-muted mt-1">{{ data.currentMonth.invoicedCount }} invoices</p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }" :class="differenceBg">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">{{ isPositive ? 'Surplus' : 'Shortfall' }}</p>
              <UIcon
                :name="isPositive ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
                class="size-5"
                :class="differenceColor"
              />
            </div>
            <p class="text-2xl font-bold tabular-nums" :class="differenceColor">
              {{ isPositive ? '+' : '' }}{{ formatCurrency(data.difference) }}
            </p>
            <p class="text-[11px] text-muted mt-1">{{ isPositive ? 'Ahead of target' : 'Behind target' }}</p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }">
            <div class="flex items-start justify-between mb-2">
              <p class="text-xs text-muted uppercase tracking-wide">Days remaining</p>
              <UIcon name="i-lucide-calendar-clock" class="size-5 text-violet-500" />
            </div>
            <p class="text-2xl font-bold tabular-nums">{{ data.period.daysInMonth - data.period.dayOfMonth }}</p>
            <p class="text-[11px] text-muted mt-1">Day {{ data.period.dayOfMonth }} of {{ data.period.daysInMonth }}</p>
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
        </UCard>

        <!-- ═══ Row: Pacing chart (2/3) + Quote pipeline (1/3) ═══ -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <UCard v-if="pacing && pacing.points.length" class="xl:col-span-2">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Pacing</h3>
                <p class="text-xs text-muted">
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
                <p class="text-xs text-muted">
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
                    <UBadge :color="quoteStatusColor(status) as any" variant="subtle" size="xs" class="capitalize">
                      {{ status }}
                    </UBadge>
                    <span class="text-[11px] text-muted">
                      ×{{ status === 'draft' ? '20%' : status === 'sent' ? '40%' : '80%' }}
                    </span>
                  </div>
                  <p class="text-[11px] text-muted mt-0.5">
                    {{ forecast.quotes.byStatus[status].count }} quote{{ forecast.quotes.byStatus[status].count === 1 ? '' : 's' }}
                  </p>
                </div>
                <p class="text-base font-semibold tabular-nums">
                  {{ formatCurrency(forecast.quotes.byStatus[status].total) }}
                </p>
              </div>
            </div>
            <p v-if="forecast.recurringSchedulesRemaining > 0" class="text-xs text-muted mt-3">
              + {{ forecast.recurringSchedulesRemaining }} recurring schedule{{ forecast.recurringSchedulesRemaining === 1 ? '' : 's' }} firing later this month
              ({{ formatCurrency(forecast.layers.recurring) }})
            </p>
          </UCard>
        </div>

        <!-- ═══ Row: Top contributors (2/3) + Target breakdown (1/3) ═══ -->
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <UCard v-if="topClients && topClients.clients.length" class="xl:col-span-2" :ui="{ body: '!p-0' }">
            <template #header>
              <div class="flex items-center justify-between px-6">
                <div>
                  <h3 class="font-semibold">Top contributors this month</h3>
                  <p class="text-xs text-muted">
                    {{ topClients.contributorCount }} clients · {{ formatCurrency(topClients.totalThisMonth) }} total
                  </p>
                </div>
              </div>
            </template>
            <div class="overflow-x-auto">
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
                    <td class="px-4 py-2 max-w-xs">
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
            </div>
          </UCard>

          <!-- Target breakdown — replaces the 3 standalone wages/expenses/extras cards -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Target breakdown</h3>
                <UButton
                  size="xs"
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
              <details v-if="data.config?.lines?.length" class="text-xs text-muted">
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
                  <UBadge size="xs" variant="subtle">{{ cat.code }}</UBadge>
                  <span class="text-sm">{{ cat.name }}</span>
                </div>
                <div class="text-right">
                  <span class="font-medium tabular-nums">{{ formatCurrency(cat.total) }}</span>
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
                  <span class="text-[10px] text-muted truncate w-full text-center">{{ m.monthLabel }}</span>
                </div>
              </UTooltip>
            </div>
            <p class="text-[11px] text-muted mt-3 italic">
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
