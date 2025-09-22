<script setup lang="ts">
interface AIInsight {
  insights: string[]
  trends: string[]
  alerts: string[]
  summary: string
}

interface Anomaly {
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  amount: number
  suggestion: string
}

interface Recommendation {
  category: string
  type: 'cost_reduction' | 'process_improvement' | 'policy_change' | 'vendor_negotiation'
  impact: 'low' | 'medium' | 'high'
  savings_potential: number
  description: string
  action_steps: string[]
}

interface AIData {
  period: {
    current: {
      start: string
      end: string
      total: number
      transactionCount: number
    }
    previous: {
      start: string
      end: string
      total: number
      transactionCount: number
    }
    change: {
      amount: number
      percentage: number
    }
  }
  insights: AIInsight
  anomalies: {
    anomalies: Anomaly[]
    summary: string
  }
  optimization: {
    recommendations: Recommendation[]
    summary: string
  }
  generatedAt: string
  model: string
}

// Manual loading state
const isLoading = ref(false)
const hasLoaded = ref(false)
const aiData = ref<{ success: boolean; data: AIData } | null>(null)
const error = ref<any>(null)

// Manual load function
async function loadAIInsights() {
  if (isLoading.value) return
  
  // Reset state for refresh
  if (hasLoaded.value) {
    hasLoaded.value = false
    aiData.value = null
  }
  
  isLoading.value = true
  error.value = null
  
  try {
    const response = await $fetch<{ success: boolean; data: AIData }>('/api/ai/expense-insights')
    aiData.value = response
    hasLoaded.value = true
  } catch (err) {
    error.value = err
    console.error('Failed to load AI insights:', err)
  } finally {
    isLoading.value = false
  }
}

const formatCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical': return 'red'
    case 'high': return 'orange'
    case 'medium': return 'yellow'
    case 'low': return 'blue'
    default: return 'gray'
  }
}

const getImpactColor = (impact: string) => {
  switch (impact) {
    case 'high': return 'green'
    case 'medium': return 'yellow'
    case 'low': return 'blue'
    default: return 'gray'
  }
}

const getRecommendationIcon = (type: string) => {
  switch (type) {
    case 'cost_reduction': return 'i-lucide-trending-down'
    case 'process_improvement': return 'i-lucide-settings'
    case 'policy_change': return 'i-lucide-file-text'
    case 'vendor_negotiation': return 'i-lucide-handshake'
    default: return 'i-lucide-lightbulb'
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- AI Insights Header -->
    <UCard class="shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
              <UIcon name="i-lucide-brain" class="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 class="text-lg font-semibold">AI-Powered Insights</h3>
              <p class="text-sm text-muted">Intelligent analysis powered by Groq</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UBadge v-if="aiData?.data?.model" color="purple" variant="subtle">
              {{ aiData.data.model }}
            </UBadge>
            <UButton 
              v-if="hasLoaded"
              icon="i-lucide-refresh-cw" 
              size="sm" 
              color="gray" 
              variant="ghost"
              :loading="isLoading"
              @click="loadAIInsights"
            />
          </div>
        </div>
      </template>

      <!-- Initial state - show button to load insights -->
      <div v-if="!hasLoaded && !isLoading && !error" class="p-8 text-center">
        <div class="p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-2xl mb-6 max-w-md mx-auto">
          <div class="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-4 w-fit mx-auto">
            <UIcon name="i-lucide-brain" class="h-8 w-8 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">AI-Powered Financial Analysis</h3>
          <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
            Get intelligent insights, anomaly detection, and optimization recommendations powered by advanced AI
          </p>
        </div>
        
        <UButton 
          size="lg"
          color="purple"
          @click="loadAIInsights"
          class="shadow-lg"
        >
          <UIcon name="i-lucide-sparkles" class="h-5 w-5 mr-2" />
          Generate AI Insights
        </UButton>
        
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-4">
          Powered by Groq Llama 3.3 70B • Secure & Private Analysis
        </p>
      </div>

      <!-- Loading state -->
      <div v-else-if="isLoading" class="p-8">
        <div class="text-center">
          <div class="p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-2xl mb-6 max-w-md mx-auto">
            <div class="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-4 w-fit mx-auto animate-pulse">
              <UIcon name="i-lucide-brain" class="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Analyzing Your Financial Data</h3>
            <p class="text-gray-600 dark:text-gray-400 text-sm">
              Our AI is processing your expense data to generate intelligent insights...
            </p>
          </div>
          
          <div class="flex items-center justify-center gap-2">
            <div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
            <div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
            <div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
          </div>
          
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-4">
            This may take a few moments...
          </p>
        </div>
      </div>

      <div v-else-if="error" class="p-6">
        <!-- Xero Connection Required -->
        <div class="text-center">
          <div class="p-4 bg-blue-100 dark:bg-blue-900/50 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
            <UIcon name="i-lucide-brain" class="h-10 w-10 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">AI Analysis Requires Xero Connection</h3>
          <p class="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Connect your Xero account to unlock AI-powered expense insights, anomaly detection, and optimization recommendations.
          </p>
          <div class="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <UButton 
              color="blue" 
              size="lg"
              @click="navigateTo('/api/xero/login')"
            >
              <UIcon name="i-lucide-link" class="h-5 w-5 mr-2" />
              Connect to Xero
            </UButton>
            <UButton 
              color="gray" 
              variant="ghost"
              size="lg"
              @click="navigateTo('/settings')"
            >
              <UIcon name="i-lucide-settings" class="h-5 w-5 mr-2" />
              Settings
            </UButton>
          </div>
        </div>
      </div>

      <div v-else-if="aiData?.data" class="space-y-6">
        <!-- Period Summary -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-lucide-calendar" class="h-4 w-4 text-blue-600" />
              <span class="text-sm font-medium text-muted">Current Period</span>
            </div>
            <p class="text-xl font-bold">{{ formatCurrency(aiData.data.period.current.total) }}</p>
            <p class="text-xs text-muted">{{ aiData.data.period.current.transactionCount }} transactions</p>
          </div>

          <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-lucide-trending-up" class="h-4 w-4 text-green-600" />
              <span class="text-sm font-medium text-muted">Period Change</span>
            </div>
            <p class="text-xl font-bold" :class="aiData.data.period.change.amount >= 0 ? 'text-red-600' : 'text-green-600'">
              {{ aiData.data.period.change.amount >= 0 ? '+' : '' }}{{ aiData.data.period.change.percentage.toFixed(1) }}%
            </p>
            <p class="text-xs text-muted">{{ formatCurrency(Math.abs(aiData.data.period.change.amount)) }} change</p>
          </div>

          <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-lucide-clock" class="h-4 w-4 text-purple-600" />
              <span class="text-sm font-medium text-muted">Last Updated</span>
            </div>
            <p class="text-sm font-medium">{{ new Date(aiData.data.generatedAt).toLocaleTimeString() }}</p>
            <p class="text-xs text-muted">{{ new Date(aiData.data.generatedAt).toLocaleDateString() }}</p>
          </div>
        </div>

        <!-- Executive Summary -->
        <div v-if="aiData.data.insights.summary" class="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4">
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-lightbulb" class="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 class="font-semibold text-blue-900 dark:text-blue-100 mb-2">Executive Summary</h4>
              <p class="text-blue-800 dark:text-blue-200 leading-relaxed">{{ aiData.data.insights.summary }}</p>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Anomalies & Alerts -->
    <UCard v-if="aiData?.data?.anomalies?.anomalies?.length">
      <template #header>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
            <UIcon name="i-lucide-alert-triangle" class="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 class="text-lg font-semibold">Anomalies Detected</h3>
            <p class="text-sm text-muted">{{ aiData.data.anomalies.anomalies.length }} issues found</p>
          </div>
        </div>
      </template>

      <div class="space-y-3">
        <div
          v-for="(anomaly, index) in aiData.data.anomalies.anomalies"
          :key="index"
          class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
        >
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center gap-2">
              <UBadge :color="getSeverityColor(anomaly.severity)" variant="subtle">
                {{ anomaly.severity.toUpperCase() }}
              </UBadge>
              <span class="font-medium">{{ anomaly.type }}</span>
            </div>
            <span class="text-sm font-semibold">{{ formatCurrency(anomaly.amount) }}</span>
          </div>
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-2">{{ anomaly.description }}</p>
          <div class="bg-green-50 dark:bg-green-950/20 rounded p-3">
            <div class="flex items-start gap-2">
              <UIcon name="i-lucide-lightbulb" class="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <p class="text-sm text-green-800 dark:text-green-200">{{ anomaly.suggestion }}</p>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Optimization Recommendations -->
    <UCard v-if="aiData?.data?.optimization?.recommendations?.length">
      <template #header>
        <div class="flex items-center gap-3">
          <div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
            <UIcon name="i-lucide-target" class="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 class="text-lg font-semibold">Optimization Opportunities</h3>
            <p class="text-sm text-muted">{{ aiData.data.optimization.recommendations.length }} recommendations</p>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div
          v-for="(rec, index) in aiData.data.optimization.recommendations"
          :key="index"
          class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
        >
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-3">
              <UIcon :name="getRecommendationIcon(rec.type)" class="h-5 w-5 text-gray-600" />
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-medium">{{ rec.category }}</span>
                  <UBadge :color="getImpactColor(rec.impact)" variant="subtle">
                    {{ rec.impact.toUpperCase() }} IMPACT
                  </UBadge>
                </div>
                <p class="text-sm text-muted capitalize">{{ rec.type.replace('_', ' ') }}</p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-lg font-bold text-green-600">{{ formatCurrency(rec.savings_potential) }}</p>
              <p class="text-xs text-muted">Potential Savings</p>
            </div>
          </div>

          <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">{{ rec.description }}</p>

          <div class="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
            <h5 class="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">Action Steps:</h5>
            <ul class="space-y-1">
              <li
                v-for="(step, stepIndex) in rec.action_steps"
                :key="stepIndex"
                class="flex items-start gap-2 text-sm text-blue-800 dark:text-blue-200"
              >
                <span class="text-blue-600 font-medium">{{ stepIndex + 1 }}.</span>
                <span>{{ step }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Key Insights -->
    <div v-if="aiData?.data?.insights" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Trends -->
      <UCard v-if="aiData.data.insights.trends?.length">
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-trending-up" class="h-5 w-5 text-blue-600" />
            <h3 class="font-semibold">Spending Trends</h3>
          </div>
        </template>
        <ul class="space-y-3">
          <li
            v-for="(trend, index) in aiData.data.insights.trends"
            :key="index"
            class="flex items-start gap-3"
          >
            <div class="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
            <p class="text-sm">{{ trend }}</p>
          </li>
        </ul>
      </UCard>

      <!-- Insights -->
      <UCard v-if="aiData.data.insights.insights?.length">
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-eye" class="h-5 w-5 text-purple-600" />
            <h3 class="font-semibold">Key Insights</h3>
          </div>
        </template>
        <ul class="space-y-3">
          <li
            v-for="(insight, index) in aiData.data.insights.insights"
            :key="index"
            class="flex items-start gap-3"
          >
            <div class="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
            <p class="text-sm">{{ insight }}</p>
          </li>
        </ul>
      </UCard>
    </div>
  </div>
</template>
