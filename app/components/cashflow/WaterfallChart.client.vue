<script setup lang="ts">

interface WaterfallData {
  category: string
  value: number
  cumulative: number
  type: 'start' | 'increase' | 'decrease' | 'end'
  color?: string
}

const props = defineProps<{
  data: {
    startingBalance: number
    endingBalance: number
    inflows: { category: string; amount: number }[]
    outflows: { category: string; amount: number }[]
  } | null
  loading: boolean
}>()

const chartData = computed(() => {
  if (!props.data) return []

  const data: WaterfallData[] = []
  let cumulative = 0

  // Starting balance
  data.push({
    category: 'Starting Cash',
    value: props.data.startingBalance,
    cumulative: props.data.startingBalance,
    type: 'start',
    color: '#6b7280'
  })
  cumulative = props.data.startingBalance

  // Inflows (positive)
  props.data.inflows.forEach((inflow) => {
    data.push({
      category: inflow.category,
      value: inflow.amount,
      cumulative: cumulative + inflow.amount,
      type: 'increase',
      color: '#10b981'
    })
    cumulative += inflow.amount
  })

  // Outflows (negative)
  props.data.outflows.forEach((outflow) => {
    data.push({
      category: outflow.category,
      value: -outflow.amount,
      cumulative: cumulative - outflow.amount,
      type: 'decrease',
      color: '#ef4444'
    })
    cumulative -= outflow.amount
  })

  // Ending balance
  data.push({
    category: 'Ending Cash',
    value: props.data.endingBalance,
    cumulative: props.data.endingBalance,
    type: 'end',
    color: cumulative > props.data.startingBalance ? '#10b981' : cumulative < props.data.startingBalance ? '#ef4444' : '#6b7280'
  })

  return data
})

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Math.abs(value))
}

// SVG chart dimensions
const marginLeft = 70
const marginTop = 15
const marginRight = 15
const marginBottom = 50
const barAreaHeight = 260
const viewBoxHeight = marginTop + barAreaHeight + marginBottom

const barSpacing = computed(() => {
  const count = chartData.value.length || 1
  // Scale bar spacing so bars fill ~900px wide area regardless of count
  return Math.max(50, Math.min(90, 900 / count))
})
const viewBoxWidth = computed(() => {
  const count = chartData.value.length || 1
  return marginLeft + count * barSpacing.value + marginRight
})

const maxAbsValue = computed(() => {
  if (!chartData.value.length) return 1
  return Math.max(...chartData.value.map(d => Math.abs(d.type === 'start' || d.type === 'end' ? d.cumulative : d.value)), 1)
})

const barHeight = (item: WaterfallData) => {
  const val = item.type === 'start' || item.type === 'end' ? item.cumulative : Math.abs(item.value)
  return Math.max(4, (val / maxAbsValue.value) * barAreaHeight)
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold">Cash Flow Waterfall</h3>
          <p class="text-sm text-muted">
            Visual breakdown of cash flow components
          </p>
        </div>
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="loading">
      <USkeleton class="w-full aspect-[5/2] rounded-xl mb-4" />
      <USkeleton class="h-4 w-48 mx-auto" />
    </div>

    <!-- Chart -->
    <div v-else-if="chartData.length > 0" class="space-y-4">
      <!-- Chart Container -->
      <div class="w-full overflow-x-auto">
        <ClientOnly>
          <svg
            class="w-full h-auto border border-gray-200 dark:border-gray-700 rounded-xl bg-white/60 dark:bg-gray-900/40"
            :viewBox="`0 0 ${viewBoxWidth} ${viewBoxHeight}`"
            preserveAspectRatio="xMidYMid meet"
          >
            <!-- Bars -->
            <g :transform="`translate(${marginLeft}, ${marginTop})`">
              <g
                v-for="(item, index) in chartData"
                :key="index"
                :transform="`translate(${index * barSpacing}, 0)`"
              >
                <!-- Bar -->
                <rect
                  :x="barSpacing * 0.12"
                  :y="barAreaHeight - barHeight(item)"
                  :width="barSpacing * 0.76"
                  :height="barHeight(item)"
                  :rx="3"
                  :fill="item.type === 'increase' ? '#10b981' : item.type === 'decrease' ? '#ef4444' : '#6b7280'"
                  class="cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <title>{{ item.category }}: {{ item.type === 'increase' ? '+' : item.type === 'decrease' ? '-' : '' }}{{ formatCurrency(item.value) }}</title>
                </rect>
                <!-- Value label -->
                <text
                  :x="barSpacing / 2"
                  :y="barAreaHeight - barHeight(item) - 6"
                  text-anchor="middle"
                  class="text-[10px] fill-gray-600 dark:fill-gray-400 font-medium"
                >
                  {{ formatCurrency(item.value) }}
                </text>
                <!-- Category label -->
                <text
                  :x="barSpacing / 2"
                  :y="barAreaHeight + 16"
                  text-anchor="middle"
                  class="text-[10px] fill-gray-500 dark:fill-gray-400"
                >
                  {{ item.category.length > 12 ? item.category.substring(0, 11) + '…' : item.category }}
                </text>
              </g>

              <!-- Baseline -->
              <line x1="0" :y1="barAreaHeight" :x2="chartData.length * barSpacing" :y2="barAreaHeight" stroke="currentColor" stroke-width="1" opacity="0.15" />
            </g>
          </svg>

          <template #fallback>
            <USkeleton class="w-full aspect-[5/2] rounded-xl" />
          </template>
        </ClientOnly>
      </div>

      <!-- Legend -->
      <div class="flex items-center justify-center gap-6 text-sm">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 bg-emerald-500 rounded-full"></div>
          <span class="text-muted">Inflows</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 bg-red-500 rounded-full"></div>
          <span class="text-muted">Outflows</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 bg-gray-500 rounded-full"></div>
          <span class="text-muted">Balance</span>
        </div>
      </div>

      <!-- Summary -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-800">
        <div class="text-center">
          <p class="text-sm text-muted">Total Inflows</p>
          <p class="text-lg font-semibold text-emerald-600">
            {{ formatCurrency(data?.inflows.reduce((sum, item) => sum + item.amount, 0) || 0) }}
          </p>
        </div>
        <div class="text-center">
          <p class="text-sm text-muted">Total Outflows</p>
          <p class="text-lg font-semibold text-red-600">
            {{ formatCurrency(data?.outflows.reduce((sum, item) => sum + item.amount, 0) || 0) }}
          </p>
        </div>
        <div class="text-center">
          <p class="text-sm text-muted">Net Change</p>
          <p class="text-lg font-semibold" :class="{
            'text-emerald-600': (data?.endingBalance || 0) > (data?.startingBalance || 0),
            'text-red-600': (data?.endingBalance || 0) < (data?.startingBalance || 0),
            'text-gray-600': (data?.endingBalance || 0) === (data?.startingBalance || 0)
          }">
            {{ formatCurrency(((data?.endingBalance || 0) - (data?.startingBalance || 0))) }}
          </p>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex items-center justify-center aspect-[5/2]">
      <div class="text-center">
        <UIcon name="i-lucide-bar-chart-3" class="h-12 w-12 text-muted/50 mx-auto mb-4" />
        <p class="text-muted">No cash flow data available</p>
        <p class="text-sm text-muted/70">Connect to Xero to see your cash flow breakdown</p>
      </div>
    </div>
  </UCard>
</template>
