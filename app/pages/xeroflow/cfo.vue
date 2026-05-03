<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

const { data: yoy } = await useFetch<any>('/api/xero/get-out/yoy', { lazy: true, server: false })
const { data: ytd } = await useFetch<any>('/api/xero/get-out/ytd', { lazy: true, server: false })
const { data: cashflow } = await useFetch<any>('/api/xero/get-out/cashflow-13w', { lazy: true, server: false })
const { data: coverage } = await useFetch<any>('/api/xero/get-out/pipeline-coverage', { lazy: true, server: false })
const { data: utilization } = await useFetch<any>('/api/xero/get-out/utilization', { lazy: true, server: false })
const { data: wip } = await useFetch<any>('/api/xero/get-out/unbilled-wip', { lazy: true, server: false })

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

// 13-week chart axis math
const cfMax = computed(() => {
  if (!cashflow.value?.buckets) return 1
  const balances = cashflow.value.buckets.map((b: any) => b.runningBalance)
  return Math.max(1, ...balances, cashflow.value.openingCash)
})
const cfMin = computed(() => {
  if (!cashflow.value?.buckets) return 0
  const balances = cashflow.value.buckets.map((b: any) => b.runningBalance)
  return Math.min(0, ...balances, cashflow.value.openingCash)
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
        description="Strategic financial view — YoY, YTD, cashflow forecast, pipeline coverage, utilization"
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
        <!-- KPI strip -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <UCard :ui="{ body: '!p-4' }">
            <p class="text-xs text-muted uppercase tracking-wide mb-2">YTD revenue</p>
            <p class="text-xl font-bold tabular-nums">{{ fmt(ytd?.ytdInvoiced) }}</p>
            <p class="text-[11px] text-muted mt-1">
              {{ ytd?.ytdPctOfGoal ?? 0 }}% of {{ fmtCompact(ytd?.annualGoal) }} goal
            </p>
          </UCard>
          <UCard :ui="{ body: '!p-4' }" :class="ytd?.onPace ? 'bg-emerald-50/50 dark:bg-emerald-500/5' : 'bg-amber-50/50 dark:bg-amber-500/5'">
            <p class="text-xs text-muted uppercase tracking-wide mb-2">YTD pace</p>
            <p class="text-xl font-bold tabular-nums" :class="ytd?.onPace ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'">
              {{ ytd?.onPace ? '+' : '' }}{{ fmt(ytd?.aheadBehind) }}
            </p>
            <p class="text-[11px] text-muted mt-1">
              {{ ytd?.onPace ? 'Ahead of' : 'Behind' }} {{ fmt(ytd?.expectedByNow) }} expected
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
          <UCard :ui="{ body: '!p-4' }">
            <p class="text-xs text-muted uppercase tracking-wide mb-2">Utilization MTD</p>
            <p class="text-xl font-bold tabular-nums">{{ utilization?.overall?.utilizationPct ?? 0 }}%</p>
            <UBadge v-if="utilization?.overall?.band" :color="utilBandColor(utilization.overall.band) as any" variant="subtle" size="xs" class="capitalize mt-1">
              {{ utilization.overall.band }} · ABR {{ fmtCompact(utilization?.overall?.avgBillableRate) }}
            </UBadge>
          </UCard>
        </div>

        <!-- 13-week cashflow forecast -->
        <UCard v-if="cashflow">
          <template #header>
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 class="font-semibold">13-week rolling cashflow forecast</h3>
                <p class="text-xs text-muted">
                  Opening {{ fmt(cashflow.openingCash) }}
                  · closing {{ fmt(cashflow.closingBalance) }}
                  <span :class="cashflow.netChange >= 0 ? 'text-emerald-500' : 'text-red-500'">
                    ({{ cashflow.netChange >= 0 ? '+' : '' }}{{ fmt(cashflow.netChange) }})
                  </span>
                </p>
              </div>
              <UTooltip :text="`Lowest point: ${fmt(cashflow.lowestBalance)} in ${cashflow.lowestBalanceWeek}`">
                <UBadge :color="cashflow.lowestBalance < 0 ? 'error' : cashflow.lowestBalance < cashflow.openingCash * 0.3 ? 'warning' : 'success'" variant="subtle">
                  Low: {{ fmtCompact(cashflow.lowestBalance) }}
                </UBadge>
              </UTooltip>
            </div>
          </template>

          <!-- Inline-SVG running-balance line chart + per-week in/out bars -->
          <p class="text-[11px] text-muted italic mb-2">
            Based on authorised AR/AP in Xero. Future recurring invoices auto-generated by Xero
            on schedule appear here only after they're created.
          </p>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-elevated/50 text-muted uppercase">
                <tr>
                  <th class="text-left font-medium px-2 py-2">Week</th>
                  <th class="text-right font-medium px-2 py-2">Inflow</th>
                  <th class="text-right font-medium px-2 py-2">Outflow</th>
                  <th class="text-right font-medium px-2 py-2">Net</th>
                  <th class="text-right font-medium px-2 py-2">Balance</th>
                  <th class="px-2 py-2 w-1/3">Trajectory</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="b in cashflow.buckets" :key="b.weekStart">
                  <td class="px-2 py-1.5 text-muted">{{ b.weekLabel }}</td>
                  <td class="px-2 py-1.5 text-right tabular-nums" :class="b.inflow > 0 ? 'text-emerald-500' : 'text-muted'">
                    {{ b.inflow > 0 ? fmtCompact(b.inflow) : '—' }}
                  </td>
                  <td class="px-2 py-1.5 text-right tabular-nums" :class="b.outflow > 0 ? 'text-red-500' : 'text-muted'">
                    {{ b.outflow > 0 ? fmtCompact(b.outflow) : '—' }}
                  </td>
                  <td class="px-2 py-1.5 text-right tabular-nums font-medium" :class="b.net >= 0 ? 'text-emerald-500' : 'text-red-500'">
                    {{ b.net >= 0 ? '+' : '' }}{{ fmtCompact(b.net) }}
                  </td>
                  <td class="px-2 py-1.5 text-right tabular-nums font-semibold" :class="b.runningBalance < 0 ? 'text-red-500' : ''">
                    {{ fmtCompact(b.runningBalance) }}
                  </td>
                  <td class="px-2 py-1.5">
                    <div class="relative h-3 bg-muted/10 rounded">
                      <div
                        class="absolute top-0 bottom-0 rounded"
                        :class="b.runningBalance < 0 ? 'bg-red-500' : 'bg-emerald-500'"
                        :style="{
                          left: `${((Math.min(b.runningBalance, 0) - cfMin) / (cfMax - cfMin)) * 100}%`,
                          width: `${(Math.abs(b.runningBalance) / Math.max(cfMax - cfMin, 1)) * 100}%`,
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

        <!-- YoY comparison + Pipeline coverage detail -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
                    ? `Xero data only goes back to ${new Date(yoy.dataAvailableSince).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}. Year-over-year comparisons unlock once we have ${new Date(yoy.lastYearSameDay.monthStart).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })} cached.`
                    : 'No prior Xero history found for this tenant. Year-over-year comparisons will appear once a full year of invoices is cached.'"
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
                    Pace vs full mo: {{ yoy.deltaPct.fullMonth >= 0 ? '+' : '' }}{{ yoy.deltaPct.fullMonth }}%
                  </p>
                </div>
              </div>
            </div>
          </UCard>

          <UCard v-if="coverage">
            <template #header>
              <h3 class="font-semibold">90-day pipeline coverage</h3>
            </template>
            <div class="space-y-3">
              <div>
                <p class="text-xs text-muted">Weighted pipeline ÷ quarterly target</p>
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
                  <p class="font-medium">{{ fmt(coverage.pipeline.recurringContribution) }}</p>
                  <p class="text-[11px] text-muted">{{ coverage.pipeline.recurringScheduleCount }} schedules</p>
                </div>
              </div>
              <p class="text-xs text-muted italic">Healthy ratio: 3-4×. Target {{ fmt(coverage.quarterlyTarget) }}.</p>
            </div>
          </UCard>
        </div>

        <!-- Utilization + Unbilled WIP -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <UCard v-if="utilization" :ui="{ body: '!p-0' }">
            <template #header>
              <div class="px-6">
                <h3 class="font-semibold">Utilization MTD</h3>
                <p class="text-xs text-muted">
                  {{ utilization.overall.totalBillable }}h billable of {{ utilization.overall.totalAvailable }}h
                  available · {{ utilization.period.workingDaysSoFar }} working days so far
                </p>
              </div>
            </template>
            <table class="w-full text-sm">
              <thead class="bg-elevated/50 text-xs uppercase text-muted">
                <tr>
                  <th class="text-left font-medium px-4 py-2">User</th>
                  <th class="text-right font-medium px-4 py-2">Logged</th>
                  <th class="text-right font-medium px-4 py-2">Billable</th>
                  <th class="text-right font-medium px-4 py-2">Util %</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="m in utilization.members" :key="m.userId">
                  <td class="px-4 py-2 truncate">{{ m.userName }}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ m.totalHours }}h</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ m.billableHours }}h</td>
                  <td class="px-4 py-2 text-right tabular-nums font-medium" :class="m.utilizationPct >= 75 ? 'text-emerald-500' : m.utilizationPct >= 60 ? 'text-amber-500' : 'text-red-500'">
                    {{ m.utilizationPct }}%
                  </td>
                </tr>
                <tr v-if="!utilization.members.length">
                  <td colspan="4" class="px-4 py-6 text-center text-muted text-sm">No time logged this month.</td>
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
                  <th class="text-right font-medium px-4 py-2">Hours</th>
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
                  <td class="px-4 py-2 text-right tabular-nums">{{ p.hours }}h</td>
                  <td class="px-4 py-2 text-right tabular-nums font-medium">{{ fmt(p.amount) }}</td>
                  <td class="px-4 py-2 text-right text-xs" :class="p.ageDays > 60 ? 'text-red-500 font-medium' : p.ageDays > 30 ? 'text-amber-500' : 'text-muted'">
                    {{ p.ageDays }}d
                  </td>
                </tr>
                <tr v-if="!wip.projects.length">
                  <td colspan="4" class="px-4 py-6 text-center text-muted text-sm">All time is invoiced. ✨</td>
                </tr>
              </tbody>
            </table>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
