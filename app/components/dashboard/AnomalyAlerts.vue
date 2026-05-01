<script setup lang="ts">
interface AnomalyMetric {
  label: string
  value: number
  format: 'currency' | 'percent' | 'number'
}

interface NewAnomaly {
  id: string
  type: string
  severity: 'critical' | 'warning' | 'info'
  status: string
  title: string
  description: string
  recommendation: string | null
  metric: AnomalyMetric | null
  context: { category?: string; vendor?: string; client?: string } | null
  first_detected_at: string
}

interface NewAnomalyData {
  anomalies: NewAnomaly[]
  summary: {
    total: number
    bySeverity: { critical: number; warning: number; info: number }
    generatedAt: string
  }
}

const props = defineProps<{
  data: NewAnomalyData | null
  loading: boolean
}>()

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)
}

const formatMetric = (metric: AnomalyMetric) => {
  if (metric.format === 'currency') return formatCurrency(metric.value)
  if (metric.format === 'percent') return `${metric.value.toFixed(1)}%`
  return metric.value.toLocaleString()
}

const getSeverityColor = (severity: string): 'error' | 'warning' | 'info' | 'neutral' => {
  switch (severity) {
    case 'critical': return 'error'
    case 'warning': return 'warning'
    case 'info': return 'info'
    default: return 'neutral'
  }
}

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'critical': return 'i-lucide-alert-octagon'
    case 'warning': return 'i-lucide-alert-triangle'
    case 'info': return 'i-lucide-info'
    default: return 'i-lucide-help-circle'
  }
}

const TYPE_MAP: Record<string, { icon: string; label: string }> = {
  profitability: { icon: 'i-lucide-piggy-bank', label: 'Profitability' },
  revenue:       { icon: 'i-lucide-trending-down', label: 'Revenue' },
  expenses:      { icon: 'i-lucide-credit-card', label: 'Expenses' },
  cashflow:      { icon: 'i-lucide-wallet', label: 'Cash Flow' },
  receivables:   { icon: 'i-lucide-receipt', label: 'Receivables' },
  budget:        { icon: 'i-lucide-calculator', label: 'Budget' },
  adspend:       { icon: 'i-lucide-megaphone', label: 'Ad Spend' },
  clients:       { icon: 'i-lucide-users', label: 'Clients' },
  transactions:  { icon: 'i-lucide-list-checks', label: 'Transactions' },
}

const getTypeIcon = (type: string) => TYPE_MAP[type]?.icon ?? 'i-lucide-search'
const getTypeLabel = (type: string) => TYPE_MAP[type]?.label ?? 'Unknown'

// Show top 5 anomalies (already sorted server-side: critical first, then by first_detected_at desc)
const topAnomalies = computed(() => {
  if (!props.data?.anomalies) return []
  return props.data.anomalies.slice(0, 5)
})

// Summary stats
const summaryStats = computed(() => {
  if (!props.data?.summary) return null

  const { total, bySeverity } = props.data.summary

  return {
    total,
    bySeverity,
    riskLevel: bySeverity.critical > 5 ? 'high' : bySeverity.critical > 2 ? 'medium' : 'low'
  }
})
</script>

<template>
  <UCard class="h-full">
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold">Anomaly Detection</h3>
          <p class="text-sm text-muted">AI-powered expense analysis</p>
        </div>

        <UButton
          icon="i-lucide-external-link"
          color="neutral"
          variant="ghost"
          size="sm"
          to="/anomalies"
        />
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="space-y-4">
      <div class="flex items-center justify-between">
        <USkeleton class="h-4 w-24" />
        <USkeleton class="h-6 w-16" />
      </div>
      <div class="space-y-3">
        <USkeleton class="h-16 w-full" v-for="i in 3" :key="i" />
      </div>
    </div>

    <!-- Content -->
    <div v-else-if="summaryStats" class="space-y-4">
      <!-- Summary Stats -->
      <div class="grid grid-cols-2 gap-4 pb-4 border-b border-border">
        <div>
          <div class="text-2xl font-bold text-highlighted">
            {{ summaryStats.total }}
          </div>
          <div class="text-xs text-muted">Total Active Anomalies</div>
        </div>
        <div>
          <div
            class="text-2xl font-bold"
            :class="{
              'text-red-500': summaryStats.riskLevel === 'high',
              'text-amber-500': summaryStats.riskLevel === 'medium',
              'text-emerald-500': summaryStats.riskLevel === 'low'
            }"
          >
            {{ summaryStats.bySeverity.critical }}
          </div>
          <div class="text-xs text-muted">Critical</div>
        </div>
      </div>

      <!-- Severity breakdown -->
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted">Severity breakdown</span>
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1">
            <UBadge color="error" variant="subtle" size="xs">{{ summaryStats.bySeverity.critical }}</UBadge>
            <span class="text-xs text-muted">Critical</span>
          </span>
          <span class="flex items-center gap-1">
            <UBadge color="warning" variant="subtle" size="xs">{{ summaryStats.bySeverity.warning }}</UBadge>
            <span class="text-xs text-muted">Warning</span>
          </span>
          <span class="flex items-center gap-1">
            <UBadge color="info" variant="subtle" size="xs">{{ summaryStats.bySeverity.info }}</UBadge>
            <span class="text-xs text-muted">Info</span>
          </span>
        </div>
      </div>

      <!-- Top Anomalies -->
      <div class="space-y-3">
        <h4 class="text-sm font-medium text-highlighted">Recent Anomalies</h4>

        <div v-if="topAnomalies.length === 0" class="text-center py-8">
          <UIcon name="i-lucide-shield-check" class="h-12 w-12 text-emerald-500 mx-auto mb-2" />
          <p class="text-sm text-muted">No anomalies detected</p>
          <p class="text-xs text-muted/70">Your expenses are within normal patterns</p>
        </div>

        <div v-else class="space-y-2 max-h-64 overflow-y-auto">
          <NuxtLink
            v-for="anomaly in topAnomalies"
            :key="anomaly.id"
            :to="`/anomalies?focus=${anomaly.id}`"
            class="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors block"
          >
            <!-- Severity Icon -->
            <div
              class="flex-shrink-0 p-1.5 rounded-full"
              :class="{
                'bg-red-100 dark:bg-red-900/20': anomaly.severity === 'critical',
                'bg-amber-100 dark:bg-amber-900/20': anomaly.severity === 'warning',
                'bg-blue-100 dark:bg-blue-900/20': anomaly.severity === 'info'
              }"
            >
              <UIcon
                :name="getSeverityIcon(anomaly.severity)"
                :class="{
                  'text-red-600 dark:text-red-400': anomaly.severity === 'critical',
                  'text-amber-600 dark:text-amber-400': anomaly.severity === 'warning',
                  'text-blue-600 dark:text-blue-400': anomaly.severity === 'info'
                }"
                class="h-3 w-3"
              />
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <UIcon :name="getTypeIcon(anomaly.type)" class="h-3 w-3 text-muted" />
                <span class="text-xs font-medium text-highlighted">
                  {{ getTypeLabel(anomaly.type) }}
                </span>
                <UBadge
                  :color="getSeverityColor(anomaly.severity)"
                  variant="subtle"
                  size="xs"
                >
                  {{ anomaly.severity }}
                </UBadge>
              </div>

              <p class="text-xs text-muted mb-1">{{ anomaly.description }}</p>

              <div class="flex items-center justify-between">
                <span v-if="anomaly.metric" class="text-xs font-medium text-highlighted">
                  {{ formatMetric(anomaly.metric) }}
                </span>
                <span v-else class="text-xs text-muted/50" />

                <div class="text-xs text-muted">
                  {{ new Date(anomaly.first_detected_at).toLocaleDateString() }}
                </div>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- View All Button -->
      <div v-if="topAnomalies.length > 0" class="pt-3 border-t border-border">
        <UButton
          to="/anomalies"
          color="neutral"
          variant="subtle"
          size="sm"
          block
        >
          View All Anomalies
          <template #trailing>
            <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
          </template>
        </UButton>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex items-center justify-center py-12">
      <div class="text-center">
        <UIcon name="i-lucide-search" class="h-12 w-12 text-muted/50 mx-auto mb-4" />
        <p class="text-muted">No anomaly data available</p>
        <p class="text-sm text-muted/70">Connect to Xero to enable AI-powered anomaly detection</p>
      </div>
    </div>
  </UCard>
</template>

<style scoped>
/* Custom scrollbar for anomaly list */
.max-h-64::-webkit-scrollbar {
  width: 4px;
}

.max-h-64::-webkit-scrollbar-track {
  background: transparent;
}

.max-h-64::-webkit-scrollbar-thumb {
  background: rgba(156, 163, 175, 0.5);
  border-radius: 2px;
}

.max-h-64::-webkit-scrollbar-thumb:hover {
  background: rgba(156, 163, 175, 0.7);
}
</style>
