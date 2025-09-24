<script setup lang="ts">
type AnomalySeverity = 'critical' | 'warning' | 'info'
type AnomalyType = 'profitability' | 'revenue' | 'expenses'

type MetricFormat = 'currency' | 'percent' | 'number'

type AnomalyMetric = {
  label: string
  value: number
  format: MetricFormat
}

type Anomaly = {
  id: string
  type: AnomalyType
  severity: AnomalySeverity
  title: string
  description: string
  metric?: AnomalyMetric
  comparison?: (AnomalyMetric & { trend?: 'up' | 'down' }) | null
  context?: {
    period?: string | null
    range?: { from?: string | null, to?: string | null } | null
    category?: string | null
    vendor?: string | null
  } | null
  recommendation?: string | null
  tags?: string[] | null
  dataSources: string[]
  detectedAt: string
}

type AnomalySummary = {
  total: number
  bySeverity: Record<AnomalySeverity, number>
  generatedAt: string
}

const { data, pending, error, refresh } = await useFetch<{ summary: AnomalySummary, anomalies: Anomaly[] }>('/api/ai/anomalies', {
  lazy: true
})

const anomalies = computed(() => data.value?.anomalies ?? [])
const summary = computed(() => data.value?.summary ?? null)

const severityMeta: Record<AnomalySeverity, { label: string, color: string, icon: string }> = {
  critical: { label: 'Critical', color: 'red', icon: 'i-lucide-alert-octagon' },
  warning: { label: 'Warning', color: 'orange', icon: 'i-lucide-alert-triangle' },
  info: { label: 'Watch', color: 'blue', icon: 'i-lucide-info' }
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
    description: 'Spend concentration and vendor exposure.',
    icon: 'i-lucide-credit-card'
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
  { value: 'expenses', label: typeMeta.expenses.label }
] as const

type SeverityFilterValue = typeof severityFilterOptions[number]['value']
type TypeFilterValue = typeof typeFilterOptions[number]['value']

const activeSeverity = ref<SeverityFilterValue>('all')
const activeType = ref<TypeFilterValue>('all')

const filteredAnomalies = computed(() => {
  return anomalies.value.filter((anomaly) => {
    const matchesSeverity = activeSeverity.value === 'all' || anomaly.severity === activeSeverity.value
    const matchesType = activeType.value === 'all' || anomaly.type === activeType.value
    return matchesSeverity && matchesType
  })
})

const groupedAnomalies = computed(() => {
  const groups: Record<AnomalyType, Anomaly[]> = {
    profitability: [],
    revenue: [],
    expenses: []
  }

  for (const anomaly of filteredAnomalies.value) {
    groups[anomaly.type].push(anomaly)
  }

  return (Object.keys(groups) as AnomalyType[])
    .filter(type => groups[type].length > 0)
    .map(type => ({ type, items: groups[type] }))
})

const hasAnomalies = computed(() => anomalies.value.length > 0)

const lastGeneratedAt = computed(() => summary.value?.generatedAt ?? null)

const breadcrumbs = computed(() => ([
  { label: 'Reports', to: '/reports' },
  { label: 'Anomaly Detection', to: '/anomalies' }
]))

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
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(value) < 1 ? 2 : 0
  })
}

function formatPercent(value: number) {
  return Number(value).toLocaleString('en-US', {
    style: 'percent',
    maximumFractionDigits: 1
  })
}

function formatNumber(value: number) {
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: 1
  })
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
</script>

<template>
  <UDashboardPanel id="anomalies">
    <template #header>
      <UDashboardNavbar
        title="Anomaly Detection"
        description="Automated monitoring for revenue, expense, and profitability outliers"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            label="Refresh"
            color="neutral"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            @click="refresh"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UDashboardBreadcrumb :items="breadcrumbs" />
        </template>

        <template #right>
          <div class="flex flex-wrap items-center gap-3">
            <USelect
              v-model="activeType"
              :options="typeFilterOptions"
              option-attribute="label"
              value-attribute="value"
              size="sm"
            />

            <USelect
              v-model="activeSeverity"
              :options="severityFilterOptions"
              option-attribute="label"
              value-attribute="value"
              size="sm"
            />
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <USkeleton v-for="n in 4" :key="n" class="h-28" />
        </div>
        <USkeleton class="h-72" />
      </div>

      <div v-else-if="error" class="space-y-6">
        <UAlert
          color="red"
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
            All clear for now
          </p>
          <p class="mt-2 max-w-md text-sm text-muted">
            We did not detect any anomalies in the latest Profit &amp; Loss and expense data. We will alert you as soon as new signals appear.
          </p>
          <UButton
            class="mt-6"
            label="Run another scan"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="subtle"
            @click="refresh"
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
              <UButton
                v-if="section.type === 'profitability'"
                label="View Xero reference"
                icon="i-lucide-external-link"
                color="neutral"
                variant="ghost"
                size="xs"
                to="https://xeroapi.github.io/xero-node/accounting/index.html"
                target="_blank"
              />
            </div>

            <div class="space-y-4">
              <UCard
                v-for="anomaly in section.items"
                :key="anomaly.id"
                :ui="{ body: 'space-y-4' }"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div class="flex items-center gap-2">
                      <UBadge
                        :color="severityMeta[anomaly.severity].color"
                        variant="solid"
                        size="sm"
                      >
                        <div class="flex items-center gap-1">
                          <UIcon :name="severityMeta[anomaly.severity].icon" class="size-4" />
                          <span>
                            {{ severityMeta[anomaly.severity].label }}
                          </span>
                        </div>
                      </UBadge>
                      <span class="text-xs text-muted">
                        Detected {{ formatDate(anomaly.detectedAt) || 'recently' }}
                      </span>
                    </div>
                    <h3 class="mt-2 text-xl font-semibold">
                      {{ anomaly.title }}
                    </h3>
                    <p class="mt-1 text-sm text-muted">
                      {{ anomaly.description }}
                    </p>
                  </div>

                  <div v-if="anomaly.dataSources?.length" class="flex flex-wrap gap-2">
                    <UBadge
                      v-for="source in anomaly.dataSources"
                      :key="source"
                      color="neutral"
                      variant="subtle"
                    >
                      {{ source }}
                    </UBadge>
                  </div>
                </div>

                <div
                  v-if="anomaly.metric || anomaly.comparison"
                  class="grid grid-cols-1 gap-4 sm:grid-cols-2"
                >
                  <div v-if="anomaly.metric" class="rounded-lg border border-muted/40 p-4">
                    <p class="text-xs text-muted uppercase tracking-wide">
                      {{ anomaly.metric.label }}
                    </p>
                    <p class="mt-1 text-lg font-semibold">
                      {{ formatMetric(anomaly.metric) }}
                    </p>
                  </div>
                  <div v-if="anomaly.comparison" class="rounded-lg border border-muted/40 p-4">
                    <p class="text-xs text-muted uppercase tracking-wide">
                      {{ anomaly.comparison.label }}
                    </p>
                    <div class="mt-1 flex items-center gap-2">
                      <p class="text-lg font-semibold">
                        {{ formatMetric(anomaly.comparison) }}
                      </p>
                      <UIcon
                        v-if="anomaly.comparison.trend"
                        :name="anomaly.comparison.trend === 'down' ? 'i-lucide-arrow-down-right' : 'i-lucide-arrow-up-right'"
                        :class="[
                          anomaly.comparison.trend === 'down' ? 'text-red-500' : 'text-emerald-500',
                          'size-4'
                        ]"
                      />
                    </div>
                  </div>
                </div>

                <div v-if="anomaly.context?.period || anomaly.context?.range || anomaly.context?.category || anomaly.context?.vendor" class="grid grid-cols-1 gap-3 text-sm text-muted sm:grid-cols-2">
                  <div v-if="anomaly.context?.period">
                    <span class="font-medium text-foreground">Reporting period:</span>
                    <span class="ml-2">
                      {{ anomaly.context.period }}
                    </span>
                  </div>
                  <div v-if="anomaly.context?.range">
                    <span class="font-medium text-foreground">Data range:</span>
                    <span class="ml-2">
                      {{ formatRange(anomaly.context.range) }}
                    </span>
                  </div>
                  <div v-if="anomaly.context?.category">
                    <span class="font-medium text-foreground">Category:</span>
                    <span class="ml-2">
                      {{ anomaly.context.category }}
                    </span>
                  </div>
                  <div v-if="anomaly.context?.vendor">
                    <span class="font-medium text-foreground">Vendor:</span>
                    <span class="ml-2">
                      {{ anomaly.context.vendor }}
                    </span>
                  </div>
                </div>

                <div v-if="anomaly.recommendation" class="rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/30 dark:bg-amber-500/10">
                  <p class="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Recommended next step
                  </p>
                  <p class="mt-1 text-sm text-amber-700 dark:text-amber-100/80">
                    {{ anomaly.recommendation }}
                  </p>
                </div>

                <div v-if="anomaly.tags?.length" class="flex flex-wrap gap-2">
                  <UTooltip
                    v-for="tag in anomaly.tags"
                    :key="tag"
                    :text="`Tag: ${tag}`"
                  >
                    <UBadge color="primary" variant="soft">
                      {{ tag }}
                    </UBadge>
                  </UTooltip>
                </div>
              </UCard>
            </div>
          </section>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
