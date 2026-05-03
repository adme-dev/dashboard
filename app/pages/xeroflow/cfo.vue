<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

const { data: yoy }         = await useFetch<any>('/api/xero/get-out/yoy',                { lazy: true, server: false })
const { data: ytd }         = await useFetch<any>('/api/xero/get-out/ytd',                { lazy: true, server: false })
const { data: cashflow }    = await useFetch<any>('/api/xero/get-out/cashflow-13w',       { lazy: true, server: false })
const { data: coverage }    = await useFetch<any>('/api/xero/get-out/pipeline-coverage',  { lazy: true, server: false })
const { data: utilization } = await useFetch<any>('/api/xero/get-out/utilization',        { lazy: true, server: false })
const { data: wip }         = await useFetch<any>('/api/xero/get-out/unbilled-wip',       { lazy: true, server: false })
const { data: aging }       = await useFetch<any>('/api/xero/get-out/ar-aging',           { lazy: true, server: false })
const { data: topClients }  = await useFetch<any>('/api/xero/get-out/top-clients',        { lazy: true, server: false })
const { data: profit }      = await useFetch<any>('/api/xero/get-out/profitability',      { lazy: true, server: false })
const { data: runway }      = await useFetch<any>('/api/xero/get-out/cash-runway',        { lazy: true, server: false })
const { data: mix }         = await useFetch<any>('/api/xero/get-out/recurring-mix',      { lazy: true, server: false })

function fmt(v?: number | null, currency = 'AUD'): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—'
  return v.toLocaleString('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 })
}
function fmtCompact(v?: number | null, currency = 'AUD'): string {
  if (typeof v !== 'number' || Number.isNaN(v) || v === 0) return '—'
  if (Math.abs(v) >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(1)}m`
  if (Math.abs(v) >= 1_000) return `${currency} ${Math.round(v / 1_000)}k`
  return v.toLocaleString('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 })
}
function fmtPct(v?: number | null): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—'
  return `${v.toFixed(1)}%`
}
function coverageBandColor(b: string) {
  if (b === 'critical') return 'error'
  if (b === 'low') return 'warning'
  if (b === 'strong') return 'success'
  return 'info'
}
function utilBandColor(b: string) {
  if (b === 'low') return 'error'
  if (b === 'mixed') return 'warning'
  if (b === 'high') return 'success'
  return 'info'
}
function runwayBandColor(b: string) {
  if (b === 'critical') return 'error'
  if (b === 'low') return 'warning'
  if (b === 'strong') return 'success'
  return 'info'
}
function profitBandColor(b: string) {
  if (b === 'loss') return 'error'
  if (b === 'thin') return 'warning'
  if (b === 'strong') return 'success'
  return 'success'
}
function agingBandColor(b: string) {
  if (b === 'bad') return 'error'
  if (b === 'concerning') return 'warning'
  if (b === 'watch') return 'info'
  return 'success'
}
function concentrationBandColor(b: string) {
  if (b === 'critical') return 'error'
  if (b === 'risky') return 'warning'
  if (b === 'elevated') return 'info'
  return 'success'
}

// Cashflow chart axis math — uses projected balance so the trajectory bars
// reflect the realistic forecast, not the empty known-AR-only view.
const cfMax = computed(() => {
  if (!cashflow.value?.buckets) return 1
  const balances = cashflow.value.buckets.map((b: any) => b.runningBalanceProjected ?? b.runningBalance)
  return Math.max(1, ...balances, cashflow.value.openingCash)
})
const cfMin = computed(() => {
  if (!cashflow.value?.buckets) return 0
  const balances = cashflow.value.buckets.map((b: any) => b.runningBalanceProjected ?? b.runningBalance)
  return Math.min(0, ...balances, cashflow.value.openingCash)
})

// AR aging total for percentage rendering of each bucket
const agingTotal = computed(() => {
  if (!aging.value?.buckets) return 0
  const b = aging.value.buckets
  return (b.current || 0) + (b['1-30'] || 0) + (b['31-60'] || 0) + (b['61-90'] || 0) + (b['90+'] || 0)
})

const breadcrumbs = computed(() => [
  { label: 'XeroFlow', to: '/xeroflow' },
  { label: 'CFO Dashboard', to: '/xeroflow/cfo' },
])
</script>

<template>
  <UDashboardPanel id="cfo-dashboard">
    <template #header>
      <UDashboardNavbar
        title="CFO Dashboard"
        description="Cash, profit, pipeline, capacity — the four numbers that decide everything"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :items="breadcrumbs" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <!-- ─── Hero KPIs (4 numbers a CFO checks first) ─────────────── -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <UCard :ui="{ body: '!p-4' }" :class="runway?.band === 'critical' ? 'bg-red-50/60 dark:bg-red-500/5' : ''">
            <p class="text-xs text-muted uppercase tracking-wide mb-2">Cash · Runway</p>
            <p class="text-xl font-bold tabular-nums" :class="runway?.currentCash < 0 ? 'text-red-500' : ''">
              {{ fmt(runway?.currentCash) }}
            </p>
            <UBadge v-if="runway?.band" :color="runwayBandColor(runway.band) as any" variant="subtle" size="xs" class="capitalize mt-1">
              {{ runway.runwayMonths >= 99 ? 'Self-funding' : `${runway.runwayMonths}mo runway` }}
            </UBadge>
          </UCard>

          <UCard :ui="{ body: '!p-4' }" :class="ytd?.onPace ? 'bg-emerald-50/50 dark:bg-emerald-500/5' : 'bg-amber-50/50 dark:bg-amber-500/5'">
            <p class="text-xs text-muted uppercase tracking-wide mb-2">YTD revenue</p>
            <p class="text-xl font-bold tabular-nums">{{ fmt(ytd?.ytdInvoiced) }}</p>
            <p class="text-[11px] text-muted mt-1">
              Projecting {{ fmtCompact(ytd?.projectedAnnual) }} · goal {{ fmtCompact(ytd?.annualGoal) }}
            </p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }" :class="profit?.band === 'loss' ? 'bg-red-50/60 dark:bg-red-500/5' : profit?.band === 'thin' ? 'bg-amber-50/50 dark:bg-amber-500/5' : ''">
            <p class="text-xs text-muted uppercase tracking-wide mb-2">YTD net margin</p>
            <p class="text-xl font-bold tabular-nums" :class="profit?.ytd?.netProfit < 0 ? 'text-red-500' : ''">
              {{ profit?.ytd ? `${profit.ytd.margin}%` : '—' }}
            </p>
            <p class="text-[11px] text-muted mt-1">
              Net {{ fmtCompact(profit?.ytd?.netProfit) }} on {{ fmtCompact(profit?.ytd?.revenue) }}
            </p>
          </UCard>

          <UCard :ui="{ body: '!p-4' }">
            <p class="text-xs text-muted uppercase tracking-wide mb-2">Pipeline coverage</p>
            <p class="text-xl font-bold tabular-nums">
              {{ coverage?.coverage?.weighted != null ? `${coverage.coverage.weighted}×` : '—' }}
            </p>
            <UBadge v-if="coverage?.coverage?.band" :color="coverageBandColor(coverage.coverage.band) as any" variant="subtle" size="xs" class="capitalize mt-1">
              {{ coverage.coverage.band }} (need 3×)
            </UBadge>
          </UCard>
        </div>

        <!-- Stale-goal callout -->
        <UAlert
          v-if="ytd?.goalLooksStale"
          color="warning"
          variant="subtle"
          icon="i-lucide-target"
          title="Annual goal looks stale"
          :description="`You're tracking to ${fmt(ytd.projectedAnnual)} against a ${fmt(ytd.annualGoal)} goal — a ${Math.round(ytd.projectedAnnual / ytd.annualGoal * 100)}% pace. Re-baselining will make pace, pipeline coverage and recurring-revenue targets meaningful again.`"
          :actions="[{ label: 'Edit goal', to: '/xeroflow/get-out', variant: 'outline', color: 'warning' }]"
        />

        <!-- ─── Pillar 1: Cash & AR ──────────────────────────────────── -->
        <div class="space-y-4">
          <div class="flex items-baseline gap-3">
            <h2 class="text-base font-semibold">Cash &amp; AR</h2>
            <p class="text-xs text-muted">What's in the bank, what's coming in, what's overdue.</p>
          </div>

          <!-- 13-week cashflow forecast -->
          <UCard v-if="cashflow">
            <template #header>
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 class="font-semibold">13-week cashflow forecast</h3>
                  <p class="text-xs text-muted">
                    Opening {{ fmt(cashflow.openingCash) }}
                    · projected close {{ fmt(cashflow.closingBalanceProjected) }}
                    <span :class="cashflow.netChangeProjected >= 0 ? 'text-emerald-500' : 'text-red-500'">
                      ({{ cashflow.netChangeProjected >= 0 ? '+' : '' }}{{ fmt(cashflow.netChangeProjected) }})
                    </span>
                  </p>
                </div>
                <UTooltip :text="`Lowest projected: ${fmt(cashflow.lowestBalanceProjected)} in ${cashflow.lowestBalanceProjectedWeek}`">
                  <UBadge :color="cashflow.lowestBalanceProjected < 0 ? 'error' : cashflow.lowestBalanceProjected < cashflow.openingCash * 0.3 ? 'warning' : 'success'" variant="subtle">
                    Low: {{ fmtCompact(cashflow.lowestBalanceProjected) }}
                  </UBadge>
                </UTooltip>
              </div>
            </template>

            <p class="text-[11px] text-muted italic mb-2">
              Solid bars = known AR/AP from Xero. Hashed bars = projected (inferred MRR
              high+medium-confidence × 90 days, weekly burn from Get Out config).
              <span v-if="cashflow.projectionInputs">
                Projection: +{{ fmtCompact(cashflow.projectionInputs.monthlyProjectedInflow) }}/mo inflow,
                −{{ fmtCompact(cashflow.projectionInputs.weeklyBurn) }}/wk burn.
              </span>
            </p>

            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead class="bg-elevated/50 text-muted uppercase">
                  <tr>
                    <th class="text-left font-medium px-2 py-2">Week</th>
                    <th class="text-right font-medium px-2 py-2">Inflow</th>
                    <th class="text-right font-medium px-2 py-2 text-emerald-500/70">+ Projected</th>
                    <th class="text-right font-medium px-2 py-2 text-red-500/70">− Burn</th>
                    <th class="text-right font-medium px-2 py-2">Net</th>
                    <th class="text-right font-medium px-2 py-2">Balance</th>
                    <th class="px-2 py-2 w-1/4">Trajectory</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="b in cashflow.buckets" :key="b.weekStart">
                    <td class="px-2 py-1.5 text-muted">{{ b.weekLabel }}</td>
                    <td class="px-2 py-1.5 text-right tabular-nums" :class="b.inflow > 0 ? 'text-emerald-500' : 'text-muted'">
                      {{ b.inflow > 0 ? fmtCompact(b.inflow) : '—' }}
                    </td>
                    <td class="px-2 py-1.5 text-right tabular-nums" :class="b.inflowProjected > 0 ? 'text-emerald-500/60' : 'text-muted'">
                      {{ b.inflowProjected > 0 ? fmtCompact(b.inflowProjected) : '—' }}
                    </td>
                    <td class="px-2 py-1.5 text-right tabular-nums" :class="b.outflowProjected > 0 ? 'text-red-500/70' : 'text-muted'">
                      {{ b.outflowProjected > 0 ? `(${fmtCompact(b.outflowProjected)})` : '—' }}
                    </td>
                    <td class="px-2 py-1.5 text-right tabular-nums font-medium" :class="b.netProjected >= 0 ? 'text-emerald-500' : 'text-red-500'">
                      {{ b.netProjected >= 0 ? '+' : '' }}{{ fmtCompact(b.netProjected) }}
                    </td>
                    <td class="px-2 py-1.5 text-right tabular-nums font-semibold" :class="b.runningBalanceProjected < 0 ? 'text-red-500' : ''">
                      {{ fmtCompact(b.runningBalanceProjected) }}
                    </td>
                    <td class="px-2 py-1.5">
                      <div class="relative h-3 bg-muted/10 rounded">
                        <div
                          class="absolute top-0 bottom-0 rounded"
                          :class="b.runningBalanceProjected < 0 ? 'bg-red-500' : 'bg-emerald-500'"
                          :style="{
                            left: `${((Math.min(b.runningBalanceProjected, 0) - cfMin) / (cfMax - cfMin)) * 100}%`,
                            width: `${(Math.abs(b.runningBalanceProjected) / Math.max(cfMax - cfMin, 1)) * 100}%`,
                            opacity: 0.7,
                          }"
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>

          <!-- AR aging + Top overdue -->
          <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <UCard v-if="aging">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">AR aging</h3>
                  <UBadge :color="agingBandColor(aging.band) as any" variant="subtle" size="xs" class="capitalize">
                    {{ aging.overduePct }}% overdue · {{ aging.band }}
                  </UBadge>
                </div>
              </template>
              <div class="space-y-3">
                <div class="flex items-baseline justify-between">
                  <span class="text-xs text-muted">Outstanding</span>
                  <span class="text-xl font-bold tabular-nums">{{ fmt(aging.totalOutstanding) }}</span>
                </div>
                <div v-if="agingTotal > 0" class="space-y-2">
                  <div class="flex h-3 rounded overflow-hidden">
                    <div class="bg-emerald-500" :style="{ width: `${(aging.buckets.current / agingTotal) * 100}%` }" :title="`Current ${fmt(aging.buckets.current)}`" />
                    <div class="bg-amber-400" :style="{ width: `${(aging.buckets['1-30'] / agingTotal) * 100}%` }" :title="`1-30d ${fmt(aging.buckets['1-30'])}`" />
                    <div class="bg-orange-500" :style="{ width: `${(aging.buckets['31-60'] / agingTotal) * 100}%` }" :title="`31-60d ${fmt(aging.buckets['31-60'])}`" />
                    <div class="bg-red-500" :style="{ width: `${(aging.buckets['61-90'] / agingTotal) * 100}%` }" :title="`61-90d ${fmt(aging.buckets['61-90'])}`" />
                    <div class="bg-red-700" :style="{ width: `${(aging.buckets['90+'] / agingTotal) * 100}%` }" :title="`90+d ${fmt(aging.buckets['90+'])}`" />
                  </div>
                  <div class="grid grid-cols-5 gap-1 text-[10px] text-muted">
                    <div class="text-center"><div class="font-medium tabular-nums">{{ fmtCompact(aging.buckets.current) }}</div><div>Current</div></div>
                    <div class="text-center"><div class="font-medium tabular-nums">{{ fmtCompact(aging.buckets['1-30']) }}</div><div>1-30d</div></div>
                    <div class="text-center"><div class="font-medium tabular-nums">{{ fmtCompact(aging.buckets['31-60']) }}</div><div>31-60d</div></div>
                    <div class="text-center"><div class="font-medium tabular-nums">{{ fmtCompact(aging.buckets['61-90']) }}</div><div>61-90d</div></div>
                    <div class="text-center"><div class="font-medium tabular-nums">{{ fmtCompact(aging.buckets['90+']) }}</div><div>90+d</div></div>
                  </div>
                </div>
                <p v-if="aging.oldestOverdueDays > 0" class="text-xs text-muted">
                  Oldest overdue: <span class="font-medium" :class="aging.oldestOverdueDays > 60 ? 'text-red-500' : 'text-amber-500'">{{ aging.oldestOverdueDays }} days</span>
                </p>
              </div>
            </UCard>

            <UCard v-if="aging?.topOverdue" :ui="{ body: '!p-0' }">
              <template #header>
                <div class="px-6">
                  <h3 class="font-semibold">Top overdue accounts</h3>
                  <p class="text-xs text-muted">{{ fmt(aging.totalOverdue) }} overdue · chase first</p>
                </div>
              </template>
              <table class="w-full text-sm">
                <thead class="bg-elevated/50 text-xs uppercase text-muted">
                  <tr>
                    <th class="text-left font-medium px-4 py-2">Client</th>
                    <th class="text-right font-medium px-4 py-2">Overdue</th>
                    <th class="text-right font-medium px-4 py-2">Oldest</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="c in aging.topOverdue" :key="c.contactId">
                    <td class="px-4 py-2 truncate">{{ c.name }}</td>
                    <td class="px-4 py-2 text-right tabular-nums font-medium">{{ fmt(c.overdue) }}</td>
                    <td class="px-4 py-2 text-right text-xs" :class="c.oldestOverdueDays > 60 ? 'text-red-500 font-medium' : c.oldestOverdueDays > 30 ? 'text-amber-500' : 'text-muted'">
                      {{ c.oldestOverdueDays }}d
                    </td>
                  </tr>
                  <tr v-if="!aging.topOverdue.length">
                    <td colspan="3" class="px-4 py-6 text-center text-muted text-sm">No overdue invoices ✨</td>
                  </tr>
                </tbody>
              </table>
            </UCard>
          </div>
        </div>

        <!-- ─── Pillar 2: Revenue & Pipeline ─────────────────────────── -->
        <div class="space-y-4">
          <div class="flex items-baseline gap-3">
            <h2 class="text-base font-semibold">Revenue &amp; pipeline</h2>
            <p class="text-xs text-muted">Where the money's coming from, and what's coming next.</p>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <!-- Recurring vs project mix -->
            <UCard v-if="mix">
              <template #header>
                <h3 class="font-semibold">Recurring vs project</h3>
              </template>
              <div class="space-y-3">
                <div>
                  <p class="text-xs text-muted">This month invoiced</p>
                  <p class="text-2xl font-bold tabular-nums">{{ fmt(mix.totalRevenue) }}</p>
                </div>
                <div class="flex h-3 rounded overflow-hidden">
                  <div class="bg-blue-500" :style="{ width: `${mix.recurringPct}%` }" />
                  <div class="bg-purple-400" :style="{ width: `${100 - mix.recurringPct}%` }" />
                </div>
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p class="text-xs text-muted">Recurring</p>
                    <p class="font-medium">{{ fmt(mix.recurringRevenue) }} <span class="text-xs text-muted">{{ mix.recurringPct }}%</span></p>
                    <p class="text-[11px] text-muted">
                      {{ mix.xeroScheduleClients }} on schedule · {{ mix.inferredClients }} inferred
                    </p>
                  </div>
                  <div>
                    <p class="text-xs text-muted">Project</p>
                    <p class="font-medium">{{ fmt(mix.projectRevenue) }} <span class="text-xs text-muted">{{ Math.round(100 - mix.recurringPct) }}%</span></p>
                  </div>
                </div>
                <p class="text-[11px] text-muted italic">Healthy ratio: 50-60%+ recurring.</p>
              </div>
            </UCard>

            <!-- Pipeline coverage detail -->
            <UCard v-if="coverage">
              <template #header>
                <h3 class="font-semibold">90-day pipeline</h3>
              </template>
              <div class="space-y-3">
                <div>
                  <p class="text-xs text-muted">Weighted ÷ quarterly target</p>
                  <p class="text-3xl font-bold tabular-nums">{{ coverage.coverage?.weighted ?? 0 }}×</p>
                </div>
                <div class="grid grid-cols-2 gap-3 pt-3 border-t border-default text-sm">
                  <div>
                    <p class="text-xs text-muted">Open quotes (face)</p>
                    <p class="font-medium">{{ fmt(coverage.pipeline.quotesFaceValue) }}</p>
                    <p class="text-[11px] text-muted">{{ coverage.pipeline.quoteCount }} quotes</p>
                  </div>
                  <div>
                    <p class="text-xs text-muted">Recurring (90d)</p>
                    <p class="font-medium">{{ fmt(coverage.pipeline.recurringContribution + coverage.pipeline.inferredContribution) }}</p>
                    <p class="text-[11px] text-muted">
                      {{ coverage.pipeline.recurringScheduleCount }} Xero · {{ coverage.pipeline.inferredScheduleCount }} inferred
                    </p>
                  </div>
                </div>
                <p class="text-[11px] text-muted italic">Target {{ fmt(coverage.quarterlyTarget) }}. Healthy: 3-4×.</p>
              </div>
            </UCard>

            <!-- YoY -->
            <UCard v-if="yoy">
              <template #header>
                <h3 class="font-semibold">Year-over-year</h3>
              </template>
              <div class="space-y-3">
                <div>
                  <p class="text-xs text-muted uppercase">This month so far</p>
                  <p class="text-2xl font-bold tabular-nums">{{ fmt(yoy.thisYear.invoiced) }}</p>
                </div>
                <div v-if="yoy.historicalDataSufficient === false" class="pt-3 border-t border-default">
                  <UAlert
                    color="info"
                    variant="subtle"
                    icon="i-lucide-info"
                    title="Need more history"
                    :description="yoy.dataAvailableSince
                      ? `Xero data only goes back to ${new Date(yoy.dataAvailableSince).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}.`
                      : 'No prior Xero history found for this tenant.'"
                  />
                </div>
                <div v-else class="grid grid-cols-2 gap-3 pt-3 border-t border-default">
                  <div>
                    <p class="text-xs text-muted">Same day last yr</p>
                    <p class="text-base font-medium tabular-nums">{{ fmt(yoy.lastYearSameDay.invoiced) }}</p>
                    <p v-if="yoy.deltaPct?.sameDay != null" class="text-xs font-medium" :class="yoy.deltaPct.sameDay >= 0 ? 'text-emerald-500' : 'text-red-500'">
                      {{ yoy.deltaPct.sameDay >= 0 ? '+' : '' }}{{ yoy.deltaPct.sameDay }}%
                    </p>
                  </div>
                  <div>
                    <p class="text-xs text-muted">Full month last yr</p>
                    <p class="text-base font-medium tabular-nums">{{ fmt(yoy.lastYearFull.invoiced) }}</p>
                    <p v-if="yoy.deltaPct?.fullMonth != null" class="text-xs font-medium" :class="yoy.deltaPct.fullMonth >= 0 ? 'text-emerald-500' : 'text-red-500'">
                      Pace: {{ yoy.deltaPct.fullMonth >= 0 ? '+' : '' }}{{ yoy.deltaPct.fullMonth }}%
                    </p>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Top clients + concentration -->
          <UCard v-if="topClients" :ui="{ body: '!p-0' }">
            <template #header>
              <div class="px-6 flex items-center justify-between">
                <div>
                  <h3 class="font-semibold">Top 10 clients · YTD</h3>
                  <p class="text-xs text-muted">
                    Top 5 = {{ topClients.top5SharePct ?? '—' }}%
                    · top 10 = {{ topClients.top10SharePct ?? '—' }}%
                    · biggest = {{ topClients.top1SharePct }}%
                  </p>
                </div>
                <UBadge :color="concentrationBandColor(topClients.concentrationBand) as any" variant="subtle" size="xs" class="capitalize">
                  Concentration · {{ topClients.concentrationBand }}
                </UBadge>
              </div>
            </template>
            <table class="w-full text-sm">
              <thead class="bg-elevated/50 text-xs uppercase text-muted">
                <tr>
                  <th class="text-left font-medium px-4 py-2">Client</th>
                  <th class="text-left font-medium px-4 py-2">Type</th>
                  <th class="text-right font-medium px-4 py-2">YTD</th>
                  <th class="text-right font-medium px-4 py-2">Inferred MRR</th>
                  <th class="text-right font-medium px-4 py-2">Share</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="c in topClients.clients" :key="c.contactId">
                  <td class="px-4 py-2 truncate font-medium">{{ c.name }}</td>
                  <td class="px-4 py-2">
                    <UBadge v-if="c.recurringBasis === 'xero_repeating'" color="success" variant="subtle" size="xs">Schedule</UBadge>
                    <UBadge v-else-if="c.recurringBasis === 'inferred_high'" color="info" variant="subtle" size="xs">Retainer (high)</UBadge>
                    <UBadge v-else-if="c.recurringBasis === 'inferred_medium'" color="info" variant="subtle" size="xs">Retainer (med)</UBadge>
                    <UBadge v-else-if="c.recurringBasis === 'inferred_low'" color="neutral" variant="subtle" size="xs">Repeat</UBadge>
                    <UBadge v-else color="neutral" variant="subtle" size="xs">Project</UBadge>
                  </td>
                  <td class="px-4 py-2 text-right tabular-nums font-medium">{{ fmt(c.ytdRevenue) }}</td>
                  <td class="px-4 py-2 text-right tabular-nums text-muted">
                    {{ c.inferredMrr > 0 ? fmt(c.inferredMrr) : '—' }}
                  </td>
                  <td class="px-4 py-2 text-right tabular-nums text-xs" :class="c.concentrationPct >= 25 ? 'text-red-500 font-medium' : c.concentrationPct >= 15 ? 'text-amber-500' : 'text-muted'">
                    {{ c.concentrationPct }}%
                  </td>
                </tr>
                <tr v-if="!topClients.clients.length">
                  <td colspan="5" class="px-4 py-6 text-center text-muted text-sm">No client revenue YTD.</td>
                </tr>
              </tbody>
            </table>
          </UCard>
        </div>

        <!-- ─── Pillar 3: Profit & Capacity ──────────────────────────── -->
        <div class="space-y-4">
          <div class="flex items-baseline gap-3">
            <h2 class="text-base font-semibold">Profit &amp; capacity</h2>
            <p class="text-xs text-muted">Are we keeping what we earn — and using the time we're paid for?</p>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <UCard v-if="profit">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">Profitability</h3>
                  <UBadge :color="profitBandColor(profit.band) as any" variant="subtle" size="xs" class="capitalize">{{ profit.band }}</UBadge>
                </div>
              </template>
              <div class="space-y-3 text-sm">
                <div>
                  <p class="text-xs text-muted uppercase">YTD net</p>
                  <p class="text-2xl font-bold tabular-nums" :class="profit.ytd.netProfit < 0 ? 'text-red-500' : ''">
                    {{ fmt(profit.ytd.netProfit) }}
                    <span class="text-sm font-normal text-muted">· {{ profit.ytd.margin }}% margin</span>
                  </p>
                  <p class="text-[11px] text-muted">
                    Revenue {{ fmtCompact(profit.ytd.revenue) }} · Expenses {{ fmtCompact(profit.ytd.expenses) }} · Gross {{ profit.ytd.grossMargin }}%
                  </p>
                </div>
                <div class="pt-3 border-t border-default">
                  <p class="text-xs text-muted uppercase">MTD</p>
                  <p class="font-medium tabular-nums" :class="profit.mtd.netProfit < 0 ? 'text-red-500' : ''">
                    {{ fmt(profit.mtd.netProfit) }} · {{ profit.mtd.margin }}%
                  </p>
                  <p class="text-[11px] text-muted">{{ fmtCompact(profit.mtd.revenue) }} revenue this month</p>
                </div>
              </div>
            </UCard>

            <UCard v-if="utilization" :ui="{ body: '!p-0' }">
              <template #header>
                <div class="px-6">
                  <div class="flex items-center justify-between">
                    <h3 class="font-semibold">Utilization MTD</h3>
                    <UBadge v-if="utilization?.overall?.band" :color="utilBandColor(utilization.overall.band) as any" variant="subtle" size="xs" class="capitalize">
                      {{ utilization.overall.utilizationPct }}% · {{ utilization.overall.band }}
                    </UBadge>
                  </div>
                  <p class="text-xs text-muted">
                    {{ utilization.overall.totalBillable }}h of {{ utilization.overall.totalAvailable }}h
                    available · {{ utilization.overall.billableTeamSize }} team · {{ utilization.period.workingDaysSoFar }} working days
                    <span v-if="utilization.overall.avgBillableRate"> · ABR {{ fmtCompact(utilization.overall.avgBillableRate) }}</span>
                  </p>
                </div>
              </template>
              <table class="w-full text-sm">
                <thead class="bg-elevated/50 text-xs uppercase text-muted">
                  <tr>
                    <th class="text-left font-medium px-4 py-2">User</th>
                    <th class="text-right font-medium px-4 py-2">Billable</th>
                    <th class="text-right font-medium px-4 py-2">Util %</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="m in utilization.members" :key="m.userId">
                    <td class="px-4 py-2 truncate">{{ m.userName }}</td>
                    <td class="px-4 py-2 text-right tabular-nums">{{ m.billableHours }}h</td>
                    <td class="px-4 py-2 text-right tabular-nums font-medium" :class="m.utilizationPct >= 75 ? 'text-emerald-500' : m.utilizationPct >= 60 ? 'text-amber-500' : 'text-red-500'">
                      {{ m.utilizationPct }}%
                    </td>
                  </tr>
                  <tr v-if="!utilization.members.length">
                    <td colspan="3" class="px-4 py-6 text-center text-muted text-sm">No time logged this month.</td>
                  </tr>
                </tbody>
              </table>
            </UCard>

            <UCard v-if="wip" :ui="{ body: '!p-0' }">
              <template #header>
                <div class="px-6">
                  <h3 class="font-semibold">Unbilled WIP</h3>
                  <p class="text-xs text-muted">
                    {{ fmt(wip.summary.totalAmount) }} across {{ wip.summary.projectCount }} projects · {{ wip.summary.totalHours }}h
                  </p>
                </div>
              </template>
              <table class="w-full text-sm">
                <thead class="bg-elevated/50 text-xs uppercase text-muted">
                  <tr>
                    <th class="text-left font-medium px-4 py-2">Project</th>
                    <th class="text-right font-medium px-4 py-2">Amount</th>
                    <th class="text-right font-medium px-4 py-2">Oldest</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="p in wip.projects" :key="p.id">
                    <td class="px-4 py-2 max-w-xs">
                      <p class="font-medium truncate">{{ p.name }}</p>
                      <p class="text-xs text-muted truncate">{{ p.clientName }}</p>
                    </td>
                    <td class="px-4 py-2 text-right tabular-nums font-medium">{{ fmt(p.amount) }}</td>
                    <td class="px-4 py-2 text-right text-xs" :class="p.ageDays > 60 ? 'text-red-500 font-medium' : p.ageDays > 30 ? 'text-amber-500' : 'text-muted'">
                      {{ p.ageDays }}d
                    </td>
                  </tr>
                  <tr v-if="!wip.projects.length">
                    <td colspan="3" class="px-4 py-6 text-center text-muted text-sm">All time is invoiced. ✨</td>
                  </tr>
                </tbody>
              </table>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
