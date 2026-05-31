<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

type AnomalySeverity = 'critical' | 'warning' | 'info'
type AnomalyType = 'profitability' | 'revenue' | 'expenses' | 'cashflow' | 'receivables' | 'budget' | 'adspend' | 'clients' | 'transactions' | 'ga4'

type MetricFormat = 'currency' | 'percent' | 'number'

type AnomalyMetric = {
  label: string
  value: number
  format: MetricFormat
}

type Anomaly = {
  id: string
  tenant_id: string
  fingerprint: string
  type: AnomalyType
  severity: AnomalySeverity
  status: 'open' | 'acknowledged' | 'snoozed' | 'resolved' | 'dismissed'
  title: string
  description: string
  recommendation: string | null
  tags: string[] | null
  data_sources: string[]
  metric: AnomalyMetric | null
  comparison: (AnomalyMetric & { trend?: 'up' | 'down' }) | null
  context: {
    period?: string
    range?: { from?: string | null, to?: string | null }
    category?: string
    vendor?: string
    client?: string
    account?: string
  } | null
  group_key: string | null
  driver_narrative: string | null
  driver_narrative_at: string | null
  first_detected_at: string
  last_detected_at: string
  resolved_at: string | null
  snoozed_until: string | null
  notification_sent_at: string | null
  acknowledged_by: string | null
  acknowledged_at: string | null
  assignee_id: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string
}

type AnomalySummary = {
  total: number
  bySeverity: Record<AnomalySeverity, number>
  byType?: Record<AnomalyType, number>
  generatedAt: string
}

const severityMeta: Record<AnomalySeverity, { label: string, color: 'error' | 'warning' | 'info', icon: string }> = {
  critical: { label: 'Critical', color: 'error', icon: 'i-lucide-alert-octagon' },
  warning: { label: 'Warning', color: 'warning', icon: 'i-lucide-alert-triangle' },
  info: { label: 'Watch', color: 'info', icon: 'i-lucide-info' }
}

const typeMeta: Record<AnomalyType, { label: string, description: string, icon: string }> = {
  profitability: {
    label: 'Profitability',
    description: 'Margin, cost structure, and net income stability.',
    icon: 'i-lucide-piggy-bank'
  },
  revenue: {
    label: 'Revenue',
    description: 'Sales performance, pipeline, and receivables.',
    icon: 'i-lucide-trending-down'
  },
  expenses: {
    label: 'Expenses',
    description: 'Spend concentration, vendor exposure, and statistical outliers.',
    icon: 'i-lucide-credit-card'
  },
  cashflow: {
    label: 'Cash Flow',
    description: 'Bank balances, burn rate, and cash runway.',
    icon: 'i-lucide-wallet'
  },
  receivables: {
    label: 'Receivables',
    description: 'Aging, overdue invoices, and collection risks.',
    icon: 'i-lucide-receipt'
  },
  budget: {
    label: 'Budget',
    description: 'Budget variance, overruns, and projected spending.',
    icon: 'i-lucide-calculator'
  },
  adspend: {
    label: 'Ad Spend',
    description: 'Per-client and per-platform daily spend spikes vs. rolling baseline.',
    icon: 'i-lucide-megaphone'
  },
  clients: {
    label: 'Clients',
    description: 'Per-client scope creep and revenue concentration risk.',
    icon: 'i-lucide-users'
  },
  transactions: {
    label: 'Transactions',
    description: 'Per-line-item statistical outliers within an account.',
    icon: 'i-lucide-list-checks'
  },
  ga4: {
    label: 'Website (GA4)',
    description: 'Traffic drops, conversion-rate collapse, and channel-mix shifts.',
    icon: 'i-lucide-globe'
  }
}

const severityFilterOptions = [
  { value: 'all', label: 'All Severities' },
  { value: 'critical', label: severityMeta.critical.label },
  { value: 'warning', label: severityMeta.warning.label },
  { value: 'info', label: severityMeta.info.label }
] as const

const typeFilterOptions = [
  { value: 'all', label: 'All Categories' },
  { value: 'profitability', label: typeMeta.profitability.label },
  { value: 'revenue', label: typeMeta.revenue.label },
  { value: 'expenses', label: typeMeta.expenses.label },
  { value: 'cashflow', label: typeMeta.cashflow.label },
  { value: 'receivables', label: typeMeta.receivables.label },
  { value: 'budget', label: typeMeta.budget.label },
  { value: 'adspend', label: typeMeta.adspend.label },
  { value: 'clients', label: typeMeta.clients.label },
  { value: 'transactions', label: typeMeta.transactions.label },
  { value: 'ga4', label: typeMeta.ga4.label }
] as const

type SeverityFilterValue = typeof severityFilterOptions[number]['value']
type TypeFilterValue = typeof typeFilterOptions[number]['value']

const route = useRoute()
const router = useRouter()

const tab = computed<'active' | 'history'>({
  get: () => (route.query.tab === 'history' ? 'history' : 'active'),
  set: (v) => {
    router.replace({ query: { ...route.query, tab: v, status: undefined } })
  }
})

const statusPill = computed<string>({
  get: () => (typeof route.query.status === 'string' ? route.query.status : 'all'),
  set: (v) => {
    router.replace({ query: { ...route.query, status: v === 'all' ? undefined : v } })
  }
})

const activePillOptions = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'snoozed', label: 'Snoozed' }
]
const historyPillOptions = [
  { value: 'all', label: 'All' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' }
]
const pillOptions = computed(() =>
  tab.value === 'history' ? historyPillOptions : activePillOptions
)

const tabItems = [
  { label: 'Active', value: 'active' },
  { label: 'History', value: 'history' }
]

const activeSeverity = computed<SeverityFilterValue>({
  get: () => {
    const q = route.query.severity
    return (q && severityFilterOptions.some(o => o.value === q)) ? q as SeverityFilterValue : 'all'
  },
  set: (v) => {
    router.replace({ query: { ...route.query, severity: v === 'all' ? undefined : v } })
  }
})

const activeType = computed<TypeFilterValue>({
  get: () => {
    const q = route.query.type
    return (q && typeFilterOptions.some(o => o.value === q)) ? q as TypeFilterValue : 'all'
  },
  set: (v) => {
    router.replace({ query: { ...route.query, type: v === 'all' ? undefined : v } })
  }
})

const filterParams = computed(() => {
  const q: Record<string, string> = { tab: tab.value }
  if (statusPill.value !== 'all') q.status = statusPill.value
  if (activeSeverity.value !== 'all') q.severity = activeSeverity.value
  if (activeType.value !== 'all') q.type = activeType.value
  return q
})

const { data, pending, error, refresh } = await useFetch<{
  summary: AnomalySummary
  anomalies: Anomaly[]
}>('/api/ai/anomalies', {
  query: filterParams,
  watch: [tab, statusPill, activeSeverity, activeType],
  lazy: true
})

const anomalies = computed(() => data.value?.anomalies ?? [])
const summary = computed(() => data.value?.summary ?? null)

const toast = useToast()
const scanning = ref(false)

const { refresh: refreshAnomalyCount } = useOpenAnomalyCount()

async function onMutated() {
  await refresh()
  await refreshAnomalyCount()
}

async function runScan() {
  scanning.value = true
  try {
    const result = await $fetch<{ tenantId: string, status: 'completed' | 'in_flight' | 'error', error?: string }>(
      '/api/ai/anomalies/scan',
      { method: 'POST' }
    )
    if (result.status === 'in_flight') {
      toast.add({ title: 'Scan in progress', description: 'Already running. Refreshing once it completes.', color: 'info' })
      // Poll up to 60s.
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const probe = await $fetch<{ status: string }>(
          '/api/ai/anomalies/scan',
          { method: 'POST' }
        )
        if (probe.status === 'completed') {
          await refresh()
          await refreshAnomalyCount()
          toast.add({ title: 'Scan complete', color: 'success' })
          break
        }
      }
    } else if (result.status === 'completed') {
      toast.add({ title: 'Scan complete', color: 'success' })
      await refresh()
      await refreshAnomalyCount()
    } else {
      toast.add({ title: 'Scan failed', description: result.error ?? 'Unknown error', color: 'error' })
    }
  } catch (err: any) {
    toast.add({ title: 'Scan failed', description: err.statusMessage || String(err), color: 'error' })
  } finally {
    scanning.value = false
  }
}

const filteredAnomalies = computed(() => {
  return anomalies.value.filter((anomaly) => {
    const matchesSeverity = activeSeverity.value === 'all' || anomaly.severity === activeSeverity.value
    const matchesType = activeType.value === 'all' || anomaly.type === activeType.value
    return matchesSeverity && matchesType
  })
})

const groupedAnomalies = computed(() => {
  // Order matches typeMeta — sections render in this order.
  const order: AnomalyType[] = [
    'profitability', 'revenue', 'expenses', 'cashflow', 'receivables',
    'budget', 'adspend', 'clients', 'transactions', 'ga4'
  ]
  const groups = Object.fromEntries(order.map(t => [t, [] as Anomaly[]])) as Record<AnomalyType, Anomaly[]>

  for (const anomaly of filteredAnomalies.value) {
    // Defensive: if a future server adds a new type before the page is updated,
    // collect it under the closest match instead of crashing.
    if (groups[anomaly.type]) groups[anomaly.type].push(anomaly)
    else groups.profitability.push(anomaly)
  }

  return order
    .filter(type => groups[type].length > 0)
    .map(type => ({ type, items: groups[type] }))
})

const hasAnomalies = computed(() => anomalies.value.length > 0)

const lastGeneratedAt = computed(() => summary.value?.generatedAt ?? null)

const breadcrumbs = computed(() => ([
  { label: 'Reports', to: '/reports' },
  { label: 'Anomaly Detection', to: '/anomalies' }
]))

const exportHref = computed(() => {
  const params = new URLSearchParams()
  params.set('tab', tab.value)
  if (statusPill.value !== 'all') params.set('status', statusPill.value)
  if (activeSeverity.value !== 'all') params.set('severity', activeSeverity.value)
  if (activeType.value !== 'all') params.set('type', activeType.value)
  return `/api/ai/anomalies/export?${params.toString()}`
})

function formatMetric(metric?: AnomalyMetric | null) {
  if (!metric) return '-'

  if (metric.format === 'currency') {
    return formatCurrency(metric.value)
  }

  if (metric.format === 'percent') {
    return formatPercent(metric.value)
  }

  return formatNumber(metric.value)
}

function formatCurrency(value: number) {
  return Number(value).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: Math.abs(value) < 1 ? 2 : 0
  })
}

function formatPercent(value: number) {
  return Number(value).toLocaleString('en-AU', {
    style: 'percent',
    maximumFractionDigits: 1
  })
}

function formatNumber(value: number) {
  return Number(value).toLocaleString('en-AU', {
    maximumFractionDigits: 1
  })
}

function groupByKey<T extends { group_key: string | null }>(items: T[]) {
  const grouped = new Map<string, T[]>()
  const ungrouped: T[] = []
  for (const item of items) {
    if (item.group_key) {
      if (!grouped.has(item.group_key)) grouped.set(item.group_key, [])
      grouped.get(item.group_key)!.push(item)
    } else {
      ungrouped.push(item)
    }
  }
  return {
    grouped: Array.from(grouped.entries()), // [[groupKey, items[]], ...]
    ungrouped
  }
}

function formatGroupKey(key: string): string {
  // 'incident:profitability:Mar 2026' → 'Profitability incident — Mar 2026'
  const parts = key.split(':')
  if (parts.length < 3) return key
  const [, kind, ...periodParts] = parts
  const period = periodParts.join(':')
  const kindLabel = kind.charAt(0).toUpperCase() + kind.slice(1)
  return `${kindLabel} incident — ${period}`
}

function formatDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function formatRange(range?: { from?: string | null, to?: string | null } | null) {
  if (!range || (!range.from && !range.to)) return null
  const from = range.from ? new Date(range.from) : null
  const to = range.to ? new Date(range.to) : null
  const fromLabel = from && !Number.isNaN(from.valueOf()) ? from.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const toLabel = to && !Number.isNaN(to.valueOf()) ? to.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null

  if (fromLabel && toLabel) {
    return `${fromLabel} → ${toLabel}`
  }
  return fromLabel || toLabel
}

const severitySummary = computed(() => ({
  critical: summary.value?.bySeverity?.critical ?? 0,
  warning: summary.value?.bySeverity?.warning ?? 0,
  info: summary.value?.bySeverity?.info ?? 0
}))

const totalAnomalies = computed(() => summary.value?.total ?? anomalies.value.length)

// ── Action Plan Slideover ──
const actionPlanOpen = ref(false)
const actionPlanItem = ref<{
  type: 'anomaly'
  title: string
  description: string
  severity?: string
  category?: string
  metric?: { label: string, value: string | number }
  recommendation?: string
  tags?: string[]
} | null>(null)

function openActionPlan(anomaly: Anomaly) {
  actionPlanItem.value = {
    type: 'anomaly',
    title: anomaly.title,
    description: anomaly.description,
    severity: anomaly.severity,
    category: typeMeta[anomaly.type]?.label || anomaly.type,
    metric: anomaly.metric ? { label: anomaly.metric.label, value: formatMetric(anomaly.metric) } : undefined,
    recommendation: anomaly.recommendation || undefined,
    tags: anomaly.tags?.filter(Boolean) as string[] | undefined
  }
  actionPlanOpen.value = true
}
</script>

<template>
  <UDashboardPanel id="anomalies">
    <template #header>
      <UDashboardNavbar
        title="Anomaly Detection"
        description="Automated monitoring across profit, revenue, expenses, cash flow, receivables, budget, ad-spend, per-client, and transactions"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            label="Run scan now"
            color="neutral"
            icon="i-lucide-radar"
            :loading="scanning || pending"
            :disabled="scanning"
            @click="runScan"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :items="breadcrumbs" />
        </template>

        <template #right>
          <div class="flex flex-wrap items-center gap-3">
            <USelectMenu
              v-model="activeType"
              :items="typeFilterOptions"
              value-key="value"
              size="sm"
              class="min-w-[180px]"
            />

            <USelectMenu
              v-model="activeSeverity"
              :items="severityFilterOptions"
              value-key="value"
              size="sm"
              class="min-w-[180px]"
            />

            <UButton
              label="Export CSV"
              icon="i-lucide-download"
              color="neutral"
              variant="ghost"
              size="sm"
              :to="exportHref"
              external
            />
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UTabs v-model="tab" :items="tabItems" class="mb-4" />

      <div class="flex flex-wrap items-center gap-2 mb-6">
        <UButton
          v-for="opt in pillOptions"
          :key="opt.value"
          :variant="statusPill === opt.value ? 'solid' : 'subtle'"
          color="neutral"
          size="xs"
          @click="statusPill = opt.value"
        >
          {{ opt.label }}
        </UButton>
      </div>

      <div v-if="pending" class="space-y-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <USkeleton v-for="n in 4" :key="n" class="h-28" />
        </div>
        <USkeleton class="h-72" />
      </div>

      <div v-else-if="error" class="space-y-6">
        <UAlert
          color="error"
          icon="i-lucide-alert-circle"
          title="Failed to load anomalies"
          :description="error.statusMessage || 'We could not retrieve anomaly data. Try refreshing the page.'"
          variant="subtle"
        />
      </div>

      <div v-else class="space-y-8">
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">
                  Total Signals
                </p>
                <p class="text-2xl font-semibold">
                  {{ totalAnomalies }}
                </p>
              </div>
              <UIcon name="i-lucide-radar" class="size-8 text-blue-500" />
            </div>
            <p v-if="lastGeneratedAt" class="mt-2 text-xs text-muted">
              Updated {{ formatDate(lastGeneratedAt) }}
            </p>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">
                  Critical
                </p>
                <p class="text-2xl font-semibold text-red-500">
                  {{ severitySummary.critical }}
                </p>
              </div>
              <UIcon :name="severityMeta.critical.icon" class="size-8 text-red-500" />
            </div>
            <p class="mt-2 text-xs text-muted">
              Immediate attention required
            </p>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">
                  Warnings
                </p>
                <p class="text-2xl font-semibold text-amber-500">
                  {{ severitySummary.warning }}
                </p>
              </div>
              <UIcon :name="severityMeta.warning.icon" class="size-8 text-amber-500" />
            </div>
            <p class="mt-2 text-xs text-muted">
              Monitor and remediate
            </p>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">
                  Watchlist
                </p>
                <p class="text-2xl font-semibold text-blue-500">
                  {{ severitySummary.info }}
                </p>
              </div>
              <UIcon :name="severityMeta.info.icon" class="size-8 text-blue-500" />
            </div>
            <p class="mt-2 text-xs text-muted">
              Keep an eye on emerging trends
            </p>
          </UCard>
        </div>

        <div v-if="!hasAnomalies" class="flex flex-col items-center justify-center rounded-lg border border-dashed border-muted/60 bg-muted/20 py-16 text-center">
          <UIcon name="i-lucide-sparkles" class="size-10 text-emerald-500" />
          <p class="mt-4 text-lg font-semibold">
            {{ tab === 'history' ? 'No history in this view' : 'All clear for now' }}
          </p>
          <p class="mt-2 max-w-md text-sm text-muted">
            {{ tab === 'history'
              ? 'No resolved or dismissed anomalies match the current filters.'
              : 'No anomalies detected across financial, ad-spend, or per-client signals. We will alert you as soon as new signals appear.' }}
          </p>
          <UButton
            class="mt-6"
            label="Run another scan"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="subtle"
            @click="() => refresh()"
          />
        </div>

        <div v-else class="space-y-10">
          <section
            v-for="section in groupedAnomalies"
            :key="section.type"
            class="space-y-4"
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <UIcon :name="typeMeta[section.type].icon" class="size-5 text-primary" />
                  <h2 class="text-lg font-semibold">
                    {{ typeMeta[section.type].label }}
                  </h2>
                  <UBadge color="neutral" variant="subtle">
                    {{ section.items.length }} signals
                  </UBadge>
                </div>
                <p class="mt-1 text-sm text-muted">
                  {{ typeMeta[section.type].description }}
                </p>
              </div>
            </div>

            <div class="space-y-4">
              <template v-for="bucket in groupByKey(section.items).grouped" :key="bucket[0]">
                <div class="rounded-lg border border-default bg-elevated/30 p-4 space-y-3">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-link-2" class="size-4 text-primary" />
                    <h3 class="text-sm font-semibold">
                      {{ formatGroupKey(bucket[0]) }}
                    </h3>
                    <UBadge color="neutral" variant="subtle" size="xs">
                      {{ bucket[1].length }} findings
                    </UBadge>
                  </div>
                  <AnomalyCard
                    v-for="anomaly in bucket[1]"
                    :key="anomaly.id"
                    :anomaly="anomaly"
                    :nested="true"
                    @mutated="onMutated"
                    @open-action-plan="openActionPlan"
                  />
                </div>
              </template>

              <AnomalyCard
                v-for="anomaly in groupByKey(section.items).ungrouped"
                :key="anomaly.id"
                :anomaly="anomaly"
                @mutated="onMutated"
                @open-action-plan="openActionPlan"
              />
            </div>
          </section>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <ActionPlanSlideover
    v-model:open="actionPlanOpen"
    :item="actionPlanItem"
  />
</template>
