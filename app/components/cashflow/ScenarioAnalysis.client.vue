<script setup lang="ts">

interface ScenarioData {
  date: string
  bestCase: number
  likelyCase: number
  worstCase: number
}

const props = defineProps<{
  data: {
    currentCash: number
    scenarios: {
      best: Array<ScenarioData & { balance?: number }>
      likely: Array<ScenarioData & { balance?: number }>
      worst: Array<ScenarioData & { balance?: number }>
      combined?: ScenarioData[]
    }
  } | null
  loading: boolean
}>()

const selectedScenario = ref<'all' | 'best' | 'likely' | 'worst'>('all')

const toNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const chartData = computed(() => {
  if (!props.data?.scenarios) return []

  const combined = props.data.scenarios.combined || []
  if (combined.length) {
    return combined.map((item, index) => ({
      date: item.date,
      index,
      dateFormatted: new Date(item.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      }),
      bestCase: toNumber((item as any).bestCase ?? (item as any).balance ?? 0),
      likelyCase: toNumber((item as any).likelyCase ?? (item as any).balance ?? 0),
      worstCase: toNumber((item as any).worstCase ?? (item as any).balance ?? 0)
    }))
  }

  const likely = props.data.scenarios.likely || []
  return likely.map((item, index) => {
    const best = props.data?.scenarios.best?.[index]
    const worst = props.data?.scenarios.worst?.[index]
    return {
      date: item.date,
      index,
      dateFormatted: new Date(item.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      }),
      bestCase: toNumber((best as any)?.bestCase ?? best?.balance ?? item.likelyCase ?? item.balance ?? 0),
      likelyCase: toNumber((item as any)?.likelyCase ?? item.balance ?? 0),
      worstCase: toNumber((worst as any)?.worstCase ?? worst?.balance ?? item.likelyCase ?? item.balance ?? 0)
    }
  })
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
const bestCaseAccessor = (d: any) => d.bestCase
const likelyCaseAccessor = (d: any) => d.likelyCase
const worstCaseAccessor = (d: any) => d.worstCase

// Color configuration
const bestCaseColor = '#10b981'  // emerald-500
const likelyCaseColor = '#3b82f6' // blue-500
const worstCaseColor = '#ef4444'  // red-500

// Scenario configurations
const scenarios = [
  { key: 'all', label: 'All Scenarios', color: 'gray', icon: 'i-lucide-layers' },
  { key: 'best', label: 'Best Case', color: 'emerald', icon: 'i-lucide-trending-up' },
  { key: 'likely', label: 'Most Likely', color: 'blue', icon: 'i-lucide-target' },
  { key: 'worst', label: 'Worst Case', color: 'red', icon: 'i-lucide-trending-down' }
]

// Calculate key metrics for each scenario
const scenarioMetrics = computed(() => {
  if (!props.data) return null

  const valueFromScenario = (key: 'best' | 'likely' | 'worst') => {
    if (chartData.value.length) {
      const accessor = key === 'best' ? 'bestCase' : key === 'likely' ? 'likelyCase' : 'worstCase'
      return chartData.value.map(item => item[accessor])
    }

    const series = props.data.scenarios[key] || []
    return series.map(entry => toNumber((entry as any)[`${key}Case`] ?? entry.balance ?? 0))
  }

  const currentCash = toNumber(props.data.currentCash, 0)

  const calculateMetrics = (values: number[]) => {
    if (!values.length) {
      return {
        endBalance: 0,
        minBalance: 0,
        maxBalance: 0,
        shortfallDays: 0,
        changePercent: 0
      }
    }

    const endBalance = values[values.length - 1]
    const minBalance = Math.min(...values)
    const maxBalance = Math.max(...values)
    const shortfallDays = values.filter(v => v < 0).length
    const base = currentCash !== 0 ? ((endBalance - currentCash) / Math.abs(currentCash)) * 100 : 0

    return {
      endBalance,
      minBalance,
      maxBalance,
      shortfallDays,
      changePercent: base
    }
  }

  return {
    best: calculateMetrics(valueFromScenario('best')),
    likely: calculateMetrics(valueFromScenario('likely')),
    worst: calculateMetrics(valueFromScenario('worst'))
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
          <span class="text-emerald-600">Best Case:</span>
          <span class="font-medium">${formatCurrency(data.bestCase)}</span>
        </div>
        <div class="flex justify-between gap-4">
          <span class="text-blue-600">Most Likely:</span>
          <span class="font-medium">${formatCurrency(data.likelyCase)}</span>
        </div>
        <div class="flex justify-between gap-4">
          <span class="text-red-600">Worst Case:</span>
          <span class="font-medium">${formatCurrency(data.worstCase)}</span>
        </div>
      </div>
    </div>
  `
}
const chartWidth = 760
const chartHeight = 280

const maxIndex = computed(() => Math.max(1, chartData.value.length - 1))

const chartBounds = computed(() => {
  if (!chartData.value.length) {
    return { min: 0, max: 1 }
  }

  const values = chartData.value.flatMap(item => [item.bestCase, item.likelyCase, item.worstCase])
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)

  if (max === min) {
    const padding = max === 0 ? 1 : Math.abs(max) * 0.1 || 1
    return { min: min - padding, max: max + padding }
  }

  return { min, max }
})

const yLabels = computed(() => {
  const { min, max } = chartBounds.value
  return {
    top: max,
    mid: max - (max - min) / 2,
    bottom: min
  }
})

const yPosition = (value: number) => {
  const { min, max } = chartBounds.value
  const range = max - min || 1
  return chartHeight - ((value - min) / range) * chartHeight
}
</script>

<template>
  <UCard class="h-full">
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold">Scenario Analysis</h3>
          <p class="text-sm text-muted">
            Best case, most likely, and worst case projections
          </p>
        </div>
        
        <!-- Scenario Selector -->
        <div class="flex gap-1">
          <UButton
            v-for="scenario in scenarios"
            :key="scenario.key"
            :label="scenario.label"
            :icon="scenario.icon"
            :color="selectedScenario === scenario.key ? scenario.color : 'gray'"
            :variant="selectedScenario === scenario.key ? 'solid' : 'ghost'"
            size="sm"
            @click="selectedScenario = scenario.key as any"
          />
        </div>
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center h-96">
      <div class="text-center">
        <USkeleton class="h-80 w-full mb-4" />
        <USkeleton class="h-4 w-48 mx-auto" />
      </div>
    </div>

    <!-- Chart -->
    <div v-else-if="chartData.length > 0" class="space-y-6">
      <!-- Scenario Metrics -->
      <div v-if="scenarioMetrics" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Best Case -->
        <div class="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg">
          <div class="flex items-center gap-2 mb-2">
            <UIcon name="i-lucide-trending-up" class="h-4 w-4 text-emerald-600" />
            <h4 class="font-medium text-emerald-800 dark:text-emerald-200">Best Case</h4>
          </div>
          <p class="text-lg font-bold text-emerald-800 dark:text-emerald-200">
            {{ formatCurrency(scenarioMetrics.best.endBalance) }}
          </p>
          <p class="text-xs text-emerald-600 dark:text-emerald-400">
            {{ scenarioMetrics.best.changePercent > 0 ? '+' : '' }}{{ scenarioMetrics.best.changePercent.toFixed(1) }}% change
          </p>
        </div>

        <!-- Most Likely -->
        <div class="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
          <div class="flex items-center gap-2 mb-2">
            <UIcon name="i-lucide-target" class="h-4 w-4 text-blue-600" />
            <h4 class="font-medium text-blue-800 dark:text-blue-200">Most Likely</h4>
          </div>
          <p class="text-lg font-bold text-blue-800 dark:text-blue-200">
            {{ formatCurrency(scenarioMetrics.likely.endBalance) }}
          </p>
          <p class="text-xs text-blue-600 dark:text-blue-400">
            {{ scenarioMetrics.likely.changePercent > 0 ? '+' : '' }}{{ scenarioMetrics.likely.changePercent.toFixed(1) }}% change
          </p>
        </div>

        <!-- Worst Case -->
        <div class="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
          <div class="flex items-center gap-2 mb-2">
            <UIcon name="i-lucide-trending-down" class="h-4 w-4 text-red-600" />
            <h4 class="font-medium text-red-800 dark:text-red-200">Worst Case</h4>
          </div>
          <p class="text-lg font-bold text-red-800 dark:text-red-200">
            {{ formatCurrency(scenarioMetrics.worst.endBalance) }}
          </p>
          <p class="text-xs text-red-600 dark:text-red-400">
            {{ scenarioMetrics.worst.changePercent > 0 ? '+' : '' }}{{ scenarioMetrics.worst.changePercent.toFixed(1) }}% change
          </p>
        </div>
      </div>

      <!-- Chart Container -->
      <div class="h-80 w-full">
        <ClientOnly>
          <div class="w-full h-80 flex items-center justify-center">
            <!-- Simple Line Chart using SVG -->
            <svg width="100%" height="100%" viewBox="0 0 880 320" preserveAspectRatio="xMidYMid meet" class="border border-gray-200 dark:border-gray-700 rounded">
              <!-- Grid lines -->
              <defs>
                <pattern id="grid" width="92" height="32" patternUnits="userSpaceOnUse">
                  <path d="M 92 0 L 0 0 0 32" fill="none" stroke="#e5e7eb" stroke-width="1" opacity="0.3"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              
              <!-- Data visualization -->
              <g v-if="chartData.length > 0" transform="translate(50, 20)">
                <!-- Best Case Line -->
                <polyline
                  v-if="selectedScenario === 'all' || selectedScenario === 'best'"
                  :points="chartData.map((d, i) => `${(i / maxIndex) * chartWidth},${yPosition(d.bestCase)}`).join(' ')"
                  fill="none"
                  :stroke="bestCaseColor"
                  stroke-width="2"
                  :stroke-dasharray="selectedScenario === 'best' ? 'none' : '5,5'"
                  class="transition-all duration-300"
                />
                
                <!-- Most Likely Line -->
                <polyline
                  v-if="selectedScenario === 'all' || selectedScenario === 'likely'"
                  :points="chartData.map((d, i) => `${(i / maxIndex) * chartWidth},${yPosition(d.likelyCase)}`).join(' ')"
                  fill="none"
                  :stroke="likelyCaseColor"
                  stroke-width="3"
                  class="transition-all duration-300"
                />
                
                <!-- Worst Case Line -->
                <polyline
                  v-if="selectedScenario === 'all' || selectedScenario === 'worst'"
                  :points="chartData.map((d, i) => `${(i / maxIndex) * chartWidth},${yPosition(d.worstCase)}`).join(' ')"
                  fill="none"
                  :stroke="worstCaseColor"
                  stroke-width="2"
                  :stroke-dasharray="selectedScenario === 'worst' ? 'none' : '5,5'"
                  class="transition-all duration-300"
                />
                
                <!-- Zero line -->
                <line x1="0" :y1="yPosition(0)" :x2="chartWidth" :y2="yPosition(0)" stroke="#6b7280" stroke-width="1" stroke-dasharray="4,4" opacity="0.5" />
                
                <!-- Data points -->
                <g v-if="selectedScenario !== 'all'">
                  <circle
                    v-for="(point, index) in chartData"
                    :key="index"
                    :cx="(index / maxIndex) * chartWidth"
                    :cy="yPosition(point[selectedScenario === 'best' ? 'bestCase' : selectedScenario === 'likely' ? 'likelyCase' : 'worstCase'])"
                    r="3"
                    :fill="selectedScenario === 'best' ? bestCaseColor : selectedScenario === 'likely' ? likelyCaseColor : worstCaseColor"
                    class="cursor-pointer hover:r-4 transition-all"
                    :title="`${point.dateFormatted}: ${formatCurrency(point[selectedScenario === 'best' ? 'bestCase' : selectedScenario === 'likely' ? 'likelyCase' : 'worstCase'])}`"
                  />
                </g>
              </g>
              
              <!-- Axis labels -->
              <g class="text-xs fill-gray-600">
                <text x="35" y="15" text-anchor="end">{{ formatCurrency(yLabels.top) }}</text>
                <text x="35" y="180" text-anchor="end">{{ formatCurrency(yLabels.mid) }}</text>
                <text x="35" y="315" text-anchor="end">{{ formatCurrency(yLabels.bottom) }}</text>
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
      <div class="flex items-center justify-center gap-6 text-sm">
        <div v-if="selectedScenario === 'all' || selectedScenario === 'best'" class="flex items-center gap-2">
          <div class="w-3 h-3 bg-emerald-500 rounded-full"></div>
          <span class="text-muted">Best Case</span>
        </div>
        <div v-if="selectedScenario === 'all' || selectedScenario === 'likely'" class="flex items-center gap-2">
          <div class="w-3 h-3 bg-blue-500 rounded-full"></div>
          <span class="text-muted">Most Likely</span>
        </div>
        <div v-if="selectedScenario === 'all' || selectedScenario === 'worst'" class="flex items-center gap-2">
          <div class="w-3 h-3 bg-red-500 rounded-full"></div>
          <span class="text-muted">Worst Case</span>
        </div>
      </div>

      <!-- Risk Analysis -->
      <div v-if="scenarioMetrics" class="pt-4 border-t border-gray-200 dark:border-gray-800">
        <h4 class="font-medium text-sm mb-3">Risk Analysis</h4>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span class="text-muted">Probability of Shortfall:</span>
            <div class="mt-1">
              <span class="font-medium" :class="{
                'text-red-600': scenarioMetrics.worst.shortfallDays > 0,
                'text-amber-600': scenarioMetrics.likely.shortfallDays > 0,
                'text-emerald-600': scenarioMetrics.worst.shortfallDays === 0
              }">
                {{ scenarioMetrics.worst.shortfallDays > 0 ? 'High' : scenarioMetrics.likely.shortfallDays > 0 ? 'Medium' : 'Low' }}
              </span>
            </div>
          </div>
          <div>
            <span class="text-muted">Upside Potential:</span>
            <div class="mt-1">
              <span class="font-medium text-emerald-600">
                {{ formatCurrency(scenarioMetrics.best.endBalance - scenarioMetrics.likely.endBalance) }}
              </span>
            </div>
          </div>
          <div>
            <span class="text-muted">Downside Risk:</span>
            <div class="mt-1">
              <span class="font-medium text-red-600">
                {{ formatCurrency(scenarioMetrics.likely.endBalance - scenarioMetrics.worst.endBalance) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex items-center justify-center h-96">
      <div class="text-center">
        <UIcon name="i-lucide-git-branch" class="h-12 w-12 text-muted/50 mx-auto mb-4" />
        <p class="text-muted">No scenario data available</p>
        <p class="text-sm text-muted/70">Connect to Xero to see scenario analysis</p>
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
