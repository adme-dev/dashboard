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

// Chart configuration
const xAccessor = (d: any) => d.category
const yAccessor = (d: any) => d.type === 'start' || d.type === 'end' ? d.cumulative : d.value
const colorAccessor = (d: any) => d.color

// Tooltip configuration
const tooltipTemplate = (d: any) => {
  const data = d.data || d
  const isNegative = data.value < 0
  const sign = data.type === 'increase' ? '+' : data.type === 'decrease' ? '-' : ''
  
  return `
    <div class="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg border">
      <div class="font-semibold text-sm mb-2">${data.category}</div>
      <div class="space-y-1 text-xs">
        <div class="flex justify-between gap-4">
          <span class="text-gray-600 dark:text-gray-400">Amount:</span>
          <span class="font-medium" style="color: ${data.color}">${sign}${formatCurrency(data.value)}</span>
        </div>
        ${data.type !== 'start' && data.type !== 'end' ? `
        <div class="flex justify-between gap-4">
          <span class="text-gray-600 dark:text-gray-400">Running Total:</span>
          <span class="font-medium">${formatCurrency(data.cumulative)}</span>
        </div>
        ` : ''}
      </div>
    </div>
  `
}

// Chart dimensions and styling
const chartHeight = 400
const margin = { top: 20, right: 20, bottom: 60, left: 60 }
</script>

<template>
  <UCard class="h-full">
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
    <div v-if="loading" class="flex items-center justify-center h-96">
      <div class="text-center">
        <USkeleton class="h-80 w-full mb-4" />
        <USkeleton class="h-4 w-48 mx-auto" />
      </div>
    </div>

    <!-- Chart -->
    <div v-else-if="chartData.length > 0" class="space-y-4">
      <!-- Chart Container -->
      <div class="h-96 w-full">
        <ClientOnly>
          <div class="w-full h-96 flex items-center justify-center">
            <!-- Simple Bar Chart using CSS -->
            <div class="w-full h-80 flex items-end justify-center gap-2 px-4">
              <div 
                v-for="(item, index) in chartData" 
                :key="index"
                class="flex flex-col items-center gap-2"
                :style="{ minWidth: `${Math.max(60, 100 / chartData.length)}px` }"
              >
                <!-- Bar -->
                <div class="relative flex flex-col items-center">
                  <div 
                    class="w-12 rounded-t transition-all duration-300 hover:opacity-80 cursor-pointer"
                    :class="{
                      'bg-emerald-500': item.type === 'increase',
                      'bg-red-500': item.type === 'decrease',
                      'bg-gray-500': item.type === 'start' || item.type === 'end'
                    }"
                    :style="{ 
                      height: `${Math.max(20, Math.abs(item.value) / Math.max(...chartData.map(d => Math.abs(d.value))) * 200)}px` 
                    }"
                    :title="`${item.category}: ${formatCurrency(item.value)}`"
                  ></div>
                  <!-- Value Label -->
                  <div class="text-xs font-medium mt-1 text-center">
                    {{ formatCurrency(item.value) }}
                  </div>
                </div>
                <!-- Category Label -->
                <div class="text-xs text-muted text-center leading-tight max-w-16">
                  {{ item.category.length > 10 ? item.category.substring(0, 10) + '...' : item.category }}
                </div>
              </div>
            </div>
          </div>

          <template #fallback>
            <div class="flex items-center justify-center h-96">
              <USkeleton class="h-full w-full" />
            </div>
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
    <div v-else class="flex items-center justify-center h-96">
      <div class="text-center">
        <UIcon name="i-lucide-bar-chart-3" class="h-12 w-12 text-muted/50 mx-auto mb-4" />
        <p class="text-muted">No cash flow data available</p>
        <p class="text-sm text-muted/70">Connect to Xero to see your cash flow breakdown</p>
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
