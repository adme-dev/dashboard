<script setup lang="ts">
interface AnomalyData {
  summary: {
    totalTransactions: number
    anomaliesDetected: number
    highSeverityAnomalies: number
    anomalyRate: number
  }
  anomalies: Array<{
    type: string
    severity: 'high' | 'medium' | 'low'
    amount: number
    message: string
    category?: string
    vendor?: string
    date?: string
    transaction?: {
      id: string
      number: string
      vendor: string
      date: string
    }
  }>
  insights: string[]
}

const props = defineProps<{
  data: AnomalyData | null
  loading: boolean
}>()

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'high': return 'red'
    case 'medium': return 'amber'
    case 'low': return 'blue'
    default: return 'neutral'
  }
}

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'high': return 'i-lucide-alert-triangle'
    case 'medium': return 'i-lucide-alert-circle'
    case 'low': return 'i-lucide-info'
    default: return 'i-lucide-help-circle'
  }
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'daily_spending': return 'i-lucide-calendar'
    case 'category_spending': return 'i-lucide-tag'
    case 'vendor_spending': return 'i-lucide-building-2'
    case 'timing_anomaly': return 'i-lucide-clock'
    default: return 'i-lucide-search'
  }
}

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'daily_spending': return 'Daily Spending'
    case 'category_spending': return 'Category Spending'
    case 'vendor_spending': return 'Vendor Spending'
    case 'timing_anomaly': return 'Timing Anomaly'
    default: return 'Unknown'
  }
}

// Show top 5 anomalies
const topAnomalies = computed(() => {
  if (!props.data?.anomalies) return []
  return props.data.anomalies.slice(0, 5)
})

// Summary stats
const summaryStats = computed(() => {
  if (!props.data?.summary) return null
  
  const { totalTransactions, anomaliesDetected, highSeverityAnomalies, anomalyRate } = props.data.summary
  
  return {
    totalTransactions,
    anomaliesDetected,
    highSeverityAnomalies,
    anomalyRate,
    riskLevel: highSeverityAnomalies > 5 ? 'high' : highSeverityAnomalies > 2 ? 'medium' : 'low'
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
            {{ summaryStats.anomaliesDetected }}
          </div>
          <div class="text-xs text-muted">Anomalies Detected</div>
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
            {{ summaryStats.highSeverityAnomalies }}
          </div>
          <div class="text-xs text-muted">High Severity</div>
        </div>
      </div>

      <!-- Anomaly Rate -->
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted">Anomaly Rate</span>
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ summaryStats.anomalyRate.toFixed(1) }}%</span>
          <UProgress
            :value="summaryStats.anomalyRate"
            :max="10"
            :color="summaryStats.anomalyRate > 5 ? 'red' : summaryStats.anomalyRate > 2 ? 'amber' : 'emerald'"
            class="w-16"
          />
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
          <div
            v-for="anomaly in topAnomalies"
            :key="`${anomaly.type}-${anomaly.amount}`"
            class="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
          >
            <!-- Severity Icon -->
            <div 
              class="flex-shrink-0 p-1.5 rounded-full"
              :class="{
                'bg-red-100 dark:bg-red-900/20': anomaly.severity === 'high',
                'bg-amber-100 dark:bg-amber-900/20': anomaly.severity === 'medium',
                'bg-blue-100 dark:bg-blue-900/20': anomaly.severity === 'low'
              }"
            >
              <UIcon 
                :name="getSeverityIcon(anomaly.severity)"
                :class="{
                  'text-red-600 dark:text-red-400': anomaly.severity === 'high',
                  'text-amber-600 dark:text-amber-400': anomaly.severity === 'medium',
                  'text-blue-600 dark:text-blue-400': anomaly.severity === 'low'
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
              
              <p class="text-xs text-muted mb-1">{{ anomaly.message }}</p>
              
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-highlighted">
                  {{ formatCurrency(anomaly.amount) }}
                </span>
                
                <div v-if="anomaly.transaction" class="text-xs text-muted">
                  {{ anomaly.transaction.date }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Insights -->
      <div v-if="data?.insights && data.insights.length > 0" class="pt-4 border-t border-border">
        <h4 class="text-sm font-medium text-highlighted mb-2">AI Insights</h4>
        <div class="space-y-1">
          <p
            v-for="insight in data.insights"
            :key="insight"
            class="text-xs text-muted flex items-start gap-2"
          >
            <UIcon name="i-lucide-lightbulb" class="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
            {{ insight }}
          </p>
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
