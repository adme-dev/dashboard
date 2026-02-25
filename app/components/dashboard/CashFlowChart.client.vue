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


const marginLeft = 60
const marginTop = 15
const marginRight = 15
const marginBottom = 25
const chartWidth = 800
const chartHeight = 220
const viewBoxWidth = marginLeft + chartWidth + marginRight
const viewBoxHeight = marginTop + chartHeight + marginBottom

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
  return chartHeight - ((value - min) / range) * chartHeight
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
  <UCard>
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
              'text-red-600 dark:text-red-400': data.projectedEndBalance < 0,
              'text-amber-600 dark:text-amber-400': data.projectedEndBalance > 0 && data.projectedEndBalance < 10000,
              'text-emerald-600 dark:text-emerald-400': data.projectedEndBalance >= 10000
            }"
            class="text-xl font-semibold"
          >
            {{ formatCurrency(data.projectedEndBalance) }}
          </span>
        </div>
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="loading">
      <USkeleton class="w-full aspect-[5/2] rounded-xl mb-4" />
      <USkeleton class="h-4 w-48 mx-auto" />
    </div>

    <!-- Chart -->
    <div v-else-if="chartData.length > 0" class="space-y-6">
      <!-- Insights -->
      <div v-if="insights.length > 0" class="grid gap-3 sm:grid-cols-2">
        <UAlert
          v-for="insight in insights"
          :key="insight.message"
          :icon="insight.icon"
          :color="insight.type === 'critical' ? 'error' : 'warning'"
          variant="subtle"
          :description="insight.message"
          class="text-sm"
        />
      </div>

      <!-- Chart Container -->
      <div class="w-full max-h-[360px]">
        <ClientOnly>
          <svg
            class="w-full max-h-[360px] border border-[var(--ui-border)] rounded-xl bg-[var(--ui-bg-elevated)]/60"
            :viewBox="`0 0 ${viewBoxWidth} ${viewBoxHeight}`"
            preserveAspectRatio="xMidYMid meet"
          >
            <!-- Grid lines -->
            <defs>
              <pattern id="cashflow-grid" width="80" height="32" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 32" fill="none" stroke="currentColor" opacity="0.08" />
              </pattern>
            </defs>
            <rect :width="viewBoxWidth" :height="viewBoxHeight" fill="url(#cashflow-grid)" />

            <!-- Data visualization -->
            <g v-if="chartData.length > 0" :transform="`translate(${marginLeft}, ${marginTop})`">
              <!-- Area fill -->
              <path
                :d="areaPath"
                :fill="chartData.some(d => d.balance < 0) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'"
              />

              <!-- Main balance line -->
              <polyline
                :points="chartData.map((d, i) => `${(i / maxIndex) * chartWidth},${yScale(d.balance)}`).join(' ')"
                fill="none"
                :stroke="chartData.some(d => d.balance < 0) ? '#ef4444' : '#3b82f6'"
                stroke-width="2.5"
                stroke-linejoin="round"
              />

              <!-- Zero line -->
              <line x1="0" :y1="zeroLineY" :x2="chartWidth" :y2="zeroLineY" stroke="#6b7280" stroke-width="1" stroke-dasharray="4,4" opacity="0.5" />

              <!-- Data points -->
              <circle
                v-for="(point, index) in chartData"
                :key="index"
                :cx="(index / maxIndex) * chartWidth"
                :cy="yScale(point.balance)"
                r="3.5"
                :fill="point.balance < 0 ? '#ef4444' : point.balance < 10000 ? '#f59e0b' : '#3b82f6'"
                stroke="white"
                stroke-width="1.5"
                class="cursor-pointer"
              >
                <title>{{ point.dateFormatted }}: {{ formatCurrency(point.balance) }}</title>
              </circle>
            </g>

            <!-- Y-axis labels -->
            <g class="text-[11px] fill-gray-500 dark:fill-gray-400">
              <text :x="marginLeft - 8" :y="marginTop + 4" text-anchor="end">{{ formatCurrency(yLabels.top) }}</text>
              <text :x="marginLeft - 8" :y="marginTop + chartHeight / 2 + 4" text-anchor="end">{{ formatCurrency(yLabels.mid) }}</text>
              <text :x="marginLeft - 8" :y="marginTop + chartHeight + 4" text-anchor="end">{{ formatCurrency(yLabels.bottom) }}</text>
            </g>

            <!-- X-axis labels -->
            <g v-if="chartData.length > 0" class="text-[11px] fill-gray-500 dark:fill-gray-400">
              <text :x="marginLeft" :y="viewBoxHeight - 4" text-anchor="start">{{ chartData[0]?.dateFormatted }}</text>
              <text v-if="chartData.length > 2" :x="marginLeft + chartWidth / 2" :y="viewBoxHeight - 4" text-anchor="middle">{{ chartData[Math.floor(chartData.length / 2)]?.dateFormatted }}</text>
              <text :x="marginLeft + chartWidth" :y="viewBoxHeight - 4" text-anchor="end">{{ chartData[chartData.length - 1]?.dateFormatted }}</text>
            </g>
          </svg>

          <template #fallback>
            <USkeleton class="w-full aspect-[5/2] rounded-xl" />
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
    <div v-else class="flex items-center justify-center aspect-[5/2]">
      <div class="text-center">
        <UIcon name="i-lucide-trending-up" class="h-12 w-12 text-muted/50 mx-auto mb-4" />
        <p class="text-muted">No cash flow data available</p>
        <p class="text-sm text-muted/70">Connect to Xero to see your cash flow forecast</p>
      </div>
    </div>
  </UCard>
</template>

