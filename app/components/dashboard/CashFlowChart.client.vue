<script setup lang="ts">


interface ForecastPoint {
  date: string
  balance: number
  inflows: number
  outflows: number
  netChange: number
}

interface CashFlowData {
  currentCash: number
  forecastPeriod: number
  projectedEndBalance: number
  minProjectedBalance: number
  shortfallDates: string[]
  forecast?: ForecastPoint[]
  dailyForecast?: ForecastPoint[]
}

const props = defineProps<{
  data: CashFlowData | null
  loading: boolean
}>()

const chartData = computed(() => {
  const source = props.data?.forecast?.length
    ? props.data.forecast
    : props.data?.dailyForecast?.length
      ? props.data.dailyForecast
      : []

  if (!source.length) return []

  return source.map((item, index) => ({
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

const chartWidth = 680
const chartHeight = 280
const innerHeight = 240

const maxIndex = computed(() => Math.max(1, chartData.value.length - 1))

const chartBounds = computed(() => {
  if (!chartData.value.length) return { min: 0, max: 1 }

  const balances = chartData.value.map(point => point.balance)
  const max = Math.max(...balances, 0)
  const min = Math.min(...balances, 0)

  if (max === min) {
    const padding = max === 0 ? 1 : Math.abs(max) * 0.1 || 1
    return { min: min - padding, max: max + padding }
  }

  return { min, max }
})

const yScale = (value: number) => {
  const { min, max } = chartBounds.value
  const range = max - min || 1
  return chartHeight - ((value - min) / range) * innerHeight
}

const zeroLineY = computed(() => yScale(0))

const areaPath = computed(() => {
  if (chartData.value.length === 0) return ''

  const baseY = yScale(Math.min(chartBounds.value.min, 0))
  const segments = chartData.value.map((d, i) => `L${(i / maxIndex.value) * chartWidth},${yScale(d.balance)}`)
  return `M0,${baseY} ${segments.join(' ')} L${chartWidth},${baseY} Z`
})

const yLabels = computed(() => {
  const { min, max } = chartBounds.value
  return {
    top: max,
    mid: max - (max - min) / 2,
    bottom: min
  }
})

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
  if (!props.data || !chartData.value.length) return []
  
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
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="text-lg font-semibold">Cash Flow Forecast</h3>
          <p class="text-sm text-muted">
            {{ data ? `${data.forecastPeriod}-day projection` : 'Loading forecast...' }}
          </p>
        </div>

        <div v-if="!loading && data" class="flex flex-col items-start sm:items-end gap-0.5">
          <span class="text-xs uppercase tracking-wide text-muted">Projected End Balance</span>
          <span
            :class="{
              'text-red-600': data.projectedEndBalance < 0,
              'text-amber-600': data.projectedEndBalance > 0 && data.projectedEndBalance < 10000,
              'text-emerald-600': data.projectedEndBalance >= 10000
            }"
            class="text-xl font-semibold"
          >
            {{ formatCurrency(data.projectedEndBalance) }}
          </span>
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
    <div v-else-if="chartData.length > 0" class="space-y-6">
      <!-- Insights -->
      <div v-if="insights.length > 0" class="grid gap-3 sm:grid-cols-2">
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
          <div class="w-full h-80 flex items-center justify-center">
            <!-- Simple Line Chart using SVG -->
            <svg width="100%" height="100%" viewBox="0 0 800 320" class="border border-gray-200 dark:border-gray-700 rounded-xl bg-white/60 dark:bg-gray-900/40">
              <!-- Grid lines -->
              <defs>
                <pattern id="cashflow-grid" width="80" height="32" patternUnits="userSpaceOnUse">
                  <path d="M 80 0 L 0 0 0 32" fill="none" stroke="#e5e7eb" stroke-width="1" opacity="0.3"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#cashflow-grid)" />
              
              <!-- Data visualization -->
              <g v-if="chartData.length > 0" transform="translate(60, 20)">
                <!-- Area fill -->
                <path
                  :d="areaPath"
                  :fill="chartData.some(d => d.balance < 0) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'"
                  class="transition-all duration-300"
                />
                
                <!-- Main balance line -->
                <polyline
                  :points="chartData.map((d, i) => `${(i / maxIndex) * chartWidth},${yScale(d.balance)}`).join(' ')"
                  fill="none"
                  :stroke="chartData.some(d => d.balance < 0) ? '#ef4444' : '#3b82f6'"
                  stroke-width="3"
                  class="transition-all duration-300"
                />
                
                <!-- Zero line -->
                <line x1="0" :y1="zeroLineY" :x2="chartWidth" :y2="zeroLineY" stroke="#6b7280" stroke-width="1" stroke-dasharray="4,4" opacity="0.5" />
                
                <!-- Data points with hover effects -->
                <g>
                  <circle
                    v-for="(point, index) in chartData"
                    :key="index"
                    :cx="(index / maxIndex) * chartWidth"
                    :cy="yScale(point.balance)"
                    r="4"
                    :fill="point.balance < 0 ? '#ef4444' : point.balance < 10000 ? '#f59e0b' : '#3b82f6'"
                    stroke="white"
                    stroke-width="2"
                    class="cursor-pointer hover:r-6 transition-all"
                    :title="`${point.dateFormatted}: ${formatCurrency(point.balance)}`"
                  />
                </g>
              </g>
              
              <!-- Y-axis labels -->
              <g class="text-[11px] fill-gray-500 dark:fill-gray-400">
                <text x="50" y="25" text-anchor="end">{{ formatCurrency(yLabels.top) }}</text>
                <text x="50" y="165" text-anchor="end">{{ formatCurrency(yLabels.mid) }}</text>
                <text x="50" y="305" text-anchor="end">{{ formatCurrency(yLabels.bottom) }}</text>
              </g>
              
              <!-- X-axis labels -->
              <g class="text-[11px] fill-gray-500 dark:fill-gray-400">
                <text v-if="chartData.length > 0" x="80" y="315" text-anchor="start">{{ chartData[0]?.dateFormatted }}</text>
                <text v-if="chartData.length > 1" x="720" y="315" text-anchor="end">{{ chartData[chartData.length - 1]?.dateFormatted }}</text>
              </g>
            </svg>
          </div>

          <template #fallback>
            <div class="flex items-center justify-center h-80">
              <USkeleton class="h-full w-full" />
            </div>
          </template>
        </ClientOnly>
      </div>

      <!-- Legend -->
      <div class="flex flex-wrap items-center gap-4 text-xs text-muted">
        <div class="flex items-center gap-2">
          <span class="block h-2 w-2 rounded-full bg-blue-500"></span>
          <span>Healthy Balance</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="block h-2 w-2 rounded-full bg-amber-500"></span>
          <span>Low Balance</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="block h-2 w-2 rounded-full bg-red-500"></span>
          <span>Critical/Negative</span>
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
