<script setup lang="ts">
interface HealthAssessment {
  status: 'healthy' | 'concerning' | 'critical'
  summary: string
  score: number
}

interface PriorityAction {
  title: string
  description: string
  impact: 'high' | 'medium' | 'low'
  timeframe: 'immediate' | 'short-term' | 'long-term'
  category: 'collections' | 'expenses' | 'funding' | 'operations'
}

interface Risk {
  risk: string
  probability: 'high' | 'medium' | 'low'
  impact: 'high' | 'medium' | 'low'
  mitigation: string
}

interface Opportunity {
  opportunity: string
  benefit: string
  effort: 'high' | 'medium' | 'low'
}

interface AIInsights {
  healthAssessment: HealthAssessment
  priorityActions: PriorityAction[]
  risks: Risk[]
  opportunities: Opportunity[]
  metadata: {
    generatedAt: string
    model: string
    note?: string
  }
}

const props = defineProps<{
  cashflowData: any
  invoiceData: any
  scenarioData?: any
  loading?: boolean
}>()

// Use reactive data instead of useLazyFetch to avoid SSR issues
const insights = ref<AIInsights | null>(null)
const pending = ref(false)
const error = ref<any>(null)

async function execute() {
  if (!props.cashflowData || !props.invoiceData) return
  
  pending.value = true
  error.value = null
  
  try {
    const outstanding = props.invoiceData.outstanding || []
    const overdue = props.invoiceData.overdue || []
    
    const requestBody = {
      currentCash: props.cashflowData.currentCash || 0,
      projectedEndBalance: props.cashflowData.projectedEndBalance || 0,
      minProjectedBalance: props.cashflowData.minProjectedBalance || 0,
      maxProjectedBalance: props.cashflowData.maxProjectedBalance || 0,
      burnRate: props.cashflowData.dailyBurnRate || 0,
      runway: props.cashflowData.dailyBurnRate > 0 ? (props.cashflowData.currentCash / props.cashflowData.dailyBurnRate) : 365,
      shortfallCount: props.cashflowData.shortfallDates?.length || 0,
      outstandingReceivables: outstanding.reduce((sum: number, inv: any) => sum + (inv.amountDue || 0), 0),
      overdueReceivables: overdue.reduce((sum: number, inv: any) => sum + (inv.amountDue || 0), 0),
      outstandingCount: outstanding.length,
      overdueCount: overdue.length,
      forecastPeriod: props.cashflowData.forecastPeriod || 90,
      scenarios: props.scenarioData?.summaries
    }
    
    const result = await $fetch<AIInsights>('/api/ai/cashflow-insights', {
      method: 'POST',
      body: requestBody
    })
    
    insights.value = result
  } catch (err: any) {
    error.value = err
    console.error('AI Insights Error:', err)
  } finally {
    pending.value = false
  }
}

// Execute when data is available
watch(() => props.cashflowData, (newData) => {
  if (newData && props.invoiceData && !pending.value) {
    execute()
  }
}, { immediate: true })

// Status configuration
const statusConfig = {
  healthy: { color: 'emerald', icon: 'i-lucide-check-circle', bgColor: 'bg-emerald-50 dark:bg-emerald-950/20' },
  concerning: { color: 'amber', icon: 'i-lucide-alert-triangle', bgColor: 'bg-amber-50 dark:bg-amber-950/20' },
  critical: { color: 'red', icon: 'i-lucide-alert-octagon', bgColor: 'bg-red-50 dark:bg-red-950/20' }
}

// Impact and priority configurations
const impactConfig = {
  high: { color: 'red', label: 'High Impact' },
  medium: { color: 'amber', label: 'Medium Impact' },
  low: { color: 'gray', label: 'Low Impact' }
}

const timeframeConfig = {
  immediate: { color: 'red', label: 'Immediate', icon: 'i-lucide-zap' },
  'short-term': { color: 'amber', label: 'Short-term', icon: 'i-lucide-clock' },
  'long-term': { color: 'blue', label: 'Long-term', icon: 'i-lucide-calendar' }
}

const categoryIcons = {
  collections: 'i-lucide-receipt',
  expenses: 'i-lucide-trending-down',
  funding: 'i-lucide-piggy-bank',
  operations: 'i-lucide-settings'
}

const probabilityConfig = {
  high: { color: 'red', label: 'High' },
  medium: { color: 'amber', label: 'Medium' },
  low: { color: 'green', label: 'Low' }
}

const effortConfig = {
  high: { color: 'red', label: 'High Effort' },
  medium: { color: 'amber', label: 'Medium Effort' },
  low: { color: 'green', label: 'Low Effort' }
}
</script>

<template>
  <UCard class="h-full overflow-hidden border-none shadow-none ring-1 ring-black/5 dark:ring-white/5">
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-brain" class="h-5 w-5 text-primary" />
          <h3 class="text-lg font-semibold">AI-Powered Insights</h3>
        </div>
        <UButton
          v-if="!pending"
          icon="i-lucide-refresh-cw"
          size="sm"
          color="neutral"
          variant="ghost"
          @click="execute()"
        />
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="loading || pending" class="space-y-4">
      <USkeleton class="h-20 w-full" />
      <USkeleton class="h-32 w-full" />
      <USkeleton class="h-24 w-full" />
    </div>

    <!-- Error State -->
    <UAlert
      v-else-if="error"
      icon="i-lucide-alert-circle"
      color="red"
      variant="subtle"
      title="Unable to generate insights"
      description="AI analysis is temporarily unavailable. Please try again later."
    />

    <!-- Insights Content -->
    <div v-else-if="insights" class="space-y-6">
      <!-- Health Assessment -->
      <div :class="statusConfig[insights.healthAssessment.status].bgColor" class="p-4 rounded-lg">
        <div class="flex items-center gap-3 mb-2">
          <UIcon 
            :name="statusConfig[insights.healthAssessment.status].icon" 
            :class="`text-${statusConfig[insights.healthAssessment.status].color}-600`"
            class="h-6 w-6"
          />
          <div class="flex-1">
            <h4 class="font-semibold" :class="`text-${statusConfig[insights.healthAssessment.status].color}-800 dark:text-${statusConfig[insights.healthAssessment.status].color}-200`">
              Financial Health: {{ insights.healthAssessment.status.charAt(0).toUpperCase() + insights.healthAssessment.status.slice(1) }}
            </h4>
            <div class="flex items-center gap-2 mt-1">
              <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  :class="`bg-${statusConfig[insights.healthAssessment.status].color}-500`"
                  class="h-2 rounded-full transition-all duration-300"
                  :style="{ width: `${insights.healthAssessment.score}%` }"
                ></div>
              </div>
              <span class="text-sm font-medium" :class="`text-${statusConfig[insights.healthAssessment.status].color}-600`">
                {{ insights.healthAssessment.score }}/100
              </span>
            </div>
          </div>
        </div>
        <p class="text-sm" :class="`text-${statusConfig[insights.healthAssessment.status].color}-700 dark:text-${statusConfig[insights.healthAssessment.status].color}-300`">
          {{ insights.healthAssessment.summary }}
        </p>
      </div>

      <!-- Priority Actions -->
      <div v-if="insights.priorityActions.length > 0">
        <h4 class="font-semibold mb-3 flex items-center gap-2">
          <UIcon name="i-lucide-target" class="h-4 w-4" />
          Priority Actions
        </h4>
        <div class="space-y-3">
          <div 
            v-for="(action, index) in insights.priorityActions" 
            :key="index"
            class="p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            <div class="flex items-start gap-3">
              <UIcon 
                :name="categoryIcons[action.category]" 
                class="h-5 w-5 text-primary mt-0.5" 
              />
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <h5 class="font-medium">{{ action.title }}</h5>
                  <UBadge 
                    :color="impactConfig[action.impact].color" 
                    variant="subtle" 
                    size="xs"
                  >
                    {{ impactConfig[action.impact].label }}
                  </UBadge>
                  <UBadge 
                    :color="timeframeConfig[action.timeframe].color" 
                    variant="outline" 
                    size="xs"
                  >
                    <UIcon :name="timeframeConfig[action.timeframe].icon" class="h-3 w-3 mr-1" />
                    {{ timeframeConfig[action.timeframe].label }}
                  </UBadge>
                </div>
                <p class="text-sm text-muted">{{ action.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Risks -->
      <div v-if="insights.risks.length > 0">
        <h4 class="font-semibold mb-3 flex items-center gap-2">
          <UIcon name="i-lucide-shield-alert" class="h-4 w-4" />
          Risk Assessment
        </h4>
        <div class="space-y-3">
          <div 
            v-for="(risk, index) in insights.risks" 
            :key="index"
            class="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg"
          >
            <div class="flex items-start gap-3">
              <UIcon name="i-lucide-alert-triangle" class="h-5 w-5 text-red-600 mt-0.5" />
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <h5 class="font-medium text-red-800 dark:text-red-200">{{ risk.risk }}</h5>
                  <UBadge :color="probabilityConfig[risk.probability].color" variant="subtle" size="xs">
                    {{ probabilityConfig[risk.probability].label }} Probability
                  </UBadge>
                  <UBadge :color="impactConfig[risk.impact].color" variant="subtle" size="xs">
                    {{ impactConfig[risk.impact].label }}
                  </UBadge>
                </div>
                <p class="text-sm text-red-700 dark:text-red-300">
                  <strong>Mitigation:</strong> {{ risk.mitigation }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Opportunities -->
      <div v-if="insights.opportunities.length > 0">
        <h4 class="font-semibold mb-3 flex items-center gap-2">
          <UIcon name="i-lucide-lightbulb" class="h-4 w-4" />
          Opportunities
        </h4>
        <div class="space-y-3">
          <div 
            v-for="(opportunity, index) in insights.opportunities" 
            :key="index"
            class="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg"
          >
            <div class="flex items-start gap-3">
              <UIcon name="i-lucide-trending-up" class="h-5 w-5 text-emerald-600 mt-0.5" />
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <h5 class="font-medium text-emerald-800 dark:text-emerald-200">{{ opportunity.opportunity }}</h5>
                  <UBadge :color="effortConfig[opportunity.effort].color" variant="subtle" size="xs">
                    {{ effortConfig[opportunity.effort].label }}
                  </UBadge>
                </div>
                <p class="text-sm text-emerald-700 dark:text-emerald-300">{{ opportunity.benefit }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Metadata -->
      <div class="pt-3 border-t border-gray-200 dark:border-gray-800">
        <div class="flex items-center justify-between text-xs text-muted">
          <span>
            Generated by {{ insights.metadata.model }} 
            {{ insights.metadata.note ? `(${insights.metadata.note})` : '' }}
          </span>
          <span>{{ new Date(insights.metadata.generatedAt).toLocaleString() }}</span>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex items-center justify-center h-48">
      <div class="text-center">
        <UIcon name="i-lucide-brain" class="h-12 w-12 text-muted/50 mx-auto mb-4" />
        <p class="text-muted">No data available for AI analysis</p>
        <p class="text-sm text-muted/70">Connect to Xero and refresh to get insights</p>
      </div>
    </div>
  </UCard>
</template>
