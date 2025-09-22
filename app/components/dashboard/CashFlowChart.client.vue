<script setup lang="ts">
import { VisArea, VisLine, VisAxis, VisTooltip } from '@unovis/vue'

interface CashFlowData {
  currentCash: number
  forecastPeriod: number
  projectedEndBalance: number
  minProjectedBalance: number
  shortfallDates: string[]
  forecast: Array<{
    date: string
    balance: number
    inflows: number
    outflows: number
    netChange: number
  }>
}

const props = defineProps<{
  data: CashFlowData | null
  loading: boolean
}>()

const chartData = computed(() => {
  if (!props.data?.forecast) return []
  
  return props.data.forecast.map((item, index) => ({
    ...item,
    index,
    dateFormatted: new Date(item.date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    }),
    isShortfall: item.balance < 0,
    isWarning: item.balance < 10000 && item.balance > 0
  }))
})

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)
}

// Chart configuration
const xAccessor = (d: any) => d.index
const yAccessor = (d: any) => d.balance
const inflowsAccessor = (d: any) => d.inflows
const outflowsAccessor = (d: any) => -d.outflows // Negative for visual distinction

// Color configuration
const balanceColor = '#3b82f6' // blue-500
const inflowColor = '#10b981'  // emerald-500
const outflowColor = '#ef4444' // red-500
const warningColor = '#f59e0b' // amber-500
const criticalColor = '#dc2626' // red-600

const lineColor = (d: any) => {
  if (d.balance < 0) return criticalColor
  if (d.balance < 10000) return warningColor
  return balanceColor
}

const areaColor = (d: any) => {
  if (d.balance < 0) return `${criticalColor}20`
  if (d.balance < 10000) return `${warningColor}20`
  return `${balanceColor}20`
}

// Tooltip configuration
const tooltipTemplate = (d: any) => {
  const data = d.data || d
  return `
    <div class="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg border">
      <div class="font-semibold text-sm mb-2">${data.dateFormatted}</div>
      <div class="space-y-1 text-xs">
        <div class="flex justify-between gap-4">
          <span class="text-gray-600 dark:text-gray-400">Balance:</span>
          <span class="font-medium ${data.balance < 0 ? 'text-red-600' : data.balance < 10000 ? 'text-amber-600' : 'text-blue-600'}">${formatCurrency(data.balance)}</span>
        </div>
        <div class="flex justify-between gap-4">
          <span class="text-gray-600 dark:text-gray-400">Inflows:</span>
          <span class="font-medium text-emerald-600">+${formatCurrency(data.inflows)}</span>
        </div>
        <div class="flex justify-between gap-4">
          <span class="text-gray-600 dark:text-gray-400">Outflows:</span>
          <span class="font-medium text-red-600">-${formatCurrency(data.outflows)}</span>
        </div>
        <div class="flex justify-between gap-4 pt-1 border-t border-gray-200 dark:border-gray-700">
          <span class="text-gray-600 dark:text-gray-400">Net Change:</span>
          <span class="font-medium ${data.netChange >= 0 ? 'text-emerald-600' : 'text-red-600'}">${data.netChange >= 0 ? '+' : ''}${formatCurrency(data.netChange)}</span>
        </div>
      </div>
    </div>
  `
}

// Key insights
const insights = computed(() => {
  if (!props.data) return []
  
  const insights = []
  
  if (props.data.shortfallDates.length > 0) {
    insights.push({
      type: 'critical',
      icon: 'i-lucide-alert-triangle',
      message: `Cash shortfall predicted in ${props.data.shortfallDates.length} period${props.data.shortfallDates.length > 1 ? 's' : ''}`
    })
  }
  
  if (props.data.projectedEndBalance < props.data.currentCash * 0.5) {
    insights.push({
      type: 'warning',
      icon: 'i-lucide-trending-down',
      message: 'Cash position expected to decline significantly'
    })
  }
  
  if (props.data.minProjectedBalance < 5000) {
    insights.push({
      type: 'warning',
      icon: 'i-lucide-alert-circle',
      message: 'Minimum projected balance below safety threshold'
    })
  }
  
  return insights
})
</script>

<template>
  <UCard class="h-full">
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold">Cash Flow Forecast</h3>
          <p class="text-sm text-muted">
            {{ data ? `${data.forecastPeriod}-day projection` : 'Loading forecast...' }}
          </p>
        </div>
        
        <div v-if="!loading && data" class="text-right">
          <div class="text-sm text-muted">Projected End Balance</div>
          <div 
            :class="{
              'text-red-600': data.projectedEndBalance < 0,
              'text-amber-600': data.projectedEndBalance > 0 && data.projectedEndBalance < 10000,
              'text-emerald-600': data.projectedEndBalance >= 10000
            }"
            class="text-lg font-bold"
          >
            {{ formatCurrency(data.projectedEndBalance) }}
          </div>
        </div>
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center h-80">
      <div class="text-center">
        <USkeleton class="h-64 w-full mb-4" />
        <USkeleton class="h-4 w-48 mx-auto" />
      </div>
    </div>

    <!-- Chart -->
    <div v-else-if="chartData.length > 0" class="space-y-4">
      <!-- Insights -->
      <div v-if="insights.length > 0" class="space-y-2">
        <UAlert
          v-for="insight in insights"
          :key="insight.message"
          :icon="insight.icon"
          :color="insight.type === 'critical' ? 'red' : 'amber'"
          variant="subtle"
          :description="insight.message"
          class="text-sm"
        />
      </div>

      <!-- Chart Container -->
      <div class="h-80 w-full">
        <ClientOnly>
          <!-- Balance Area Chart -->
          <VisArea
            :data="chartData"
            :x="xAccessor"
            :y="yAccessor"
            :color="areaColor"
            height="320px"
          />
          
          <!-- Balance Line Chart -->
          <VisLine
            :data="chartData"
            :x="xAccessor"
            :y="yAccessor"
            :color="lineColor"
            stroke-width="2"
          />
          
          <!-- Zero line -->
          <VisLine
            :data="[{ index: 0, balance: 0 }, { index: chartData.length - 1, balance: 0 }]"
            :x="xAccessor"
            :y="yAccessor"
            color="#6b7280"
            stroke-width="1"
            stroke-dasharray="4,4"
            opacity="0.5"
          />

          <!-- Axes -->
          <VisAxis type="x" :tick-format="(i) => chartData[i]?.dateFormatted || ''" />
          <VisAxis type="y" :tick-format="formatCurrency" />

          <!-- Tooltip -->
          <VisTooltip :template="tooltipTemplate" />

          <template #fallback>
            <div class="flex items-center justify-center h-80">
              <USkeleton class="h-full w-full" />
            </div>
          </template>
        </ClientOnly>
      </div>

      <!-- Legend -->
      <div class="flex items-center justify-center gap-6 text-sm">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 bg-blue-500 rounded-full"></div>
          <span class="text-muted">Healthy Balance</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 bg-amber-500 rounded-full"></div>
          <span class="text-muted">Low Balance</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 bg-red-500 rounded-full"></div>
          <span class="text-muted">Critical/Negative</span>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex items-center justify-center h-80">
      <div class="text-center">
        <UIcon name="i-lucide-trending-up" class="h-12 w-12 text-muted/50 mx-auto mb-4" />
        <p class="text-muted">No cash flow data available</p>
        <p class="text-sm text-muted/70">Connect to Xero to see your cash flow forecast</p>
      </div>
    </div>
  </UCard>
</template>

<style scoped>
/* Ensure chart container has proper dimensions */
.vis-chart-container {
  width: 100%;
  height: 100%;
}
</style>
