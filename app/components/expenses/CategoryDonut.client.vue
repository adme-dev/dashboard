<script setup lang="ts">
type Category = {
  name: string
  amount: number
}

const props = defineProps<{
  categories: Category[]
}>()

const palette = [
  '#2563eb',
  '#14b8a6',
  '#f97316',
  '#a855f7',
  '#22c55e',
  '#eab308',
  '#6366f1',
  '#ef4444'
]

const data = computed(() => {
  if (!props.categories || !Array.isArray(props.categories)) {
    return []
  }
  return props.categories
    .filter(category => category && typeof category.amount === 'number' && category.amount > 0)
    .map((category, index) => ({
      ...category,
      index
    }))
})

const total = computed(() => data.value.reduce((sum, item) => sum + (item.amount || 0), 0))

const colorAccessor = (d: any) => {
  const index = typeof d?.index === 'number' ? d.index : 0
  return palette[index % palette.length]
}

const formatCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format

const percentLabel = computed(() => {
  const largest = data.value[0]
  if (!largest || total.value === 0) return '0%'
  return `${((largest.amount / total.value) * 100).toFixed(1)}%`
})

// Create donut chart data for CSS visualization
const chartData = computed(() => {
  if (!data.value.length || total.value === 0) return []
  
  let cumulativePercent = 0
  const result = data.value.map((item) => {
    const percent = (item.amount / total.value) * 100
    const startPercent = cumulativePercent
    cumulativePercent += percent
    
    return {
      ...item,
      percent,
      startPercent,
      endPercent: cumulativePercent,
      color: colorAccessor(item)
    }
  })
  
  // Debug logging
  console.log('Chart data generated:', result.length, 'segments')
  return result
})

// Generate SVG path for donut segments
const createArcPath = (startPercent: number, endPercent: number, innerRadius = 80, outerRadius = 120) => {
  // Convert percentages to radians
  const startAngle = (startPercent / 100) * 2 * Math.PI
  const endAngle = (endPercent / 100) * 2 * Math.PI
  
  // Calculate coordinates for the arc
  const centerX = 150
  const centerY = 150
  
  const x1 = centerX + outerRadius * Math.cos(startAngle)
  const y1 = centerY + outerRadius * Math.sin(startAngle)
  const x2 = centerX + outerRadius * Math.cos(endAngle)
  const y2 = centerY + outerRadius * Math.sin(endAngle)
  
  const x3 = centerX + innerRadius * Math.cos(endAngle)
  const y3 = centerY + innerRadius * Math.sin(endAngle)
  const x4 = centerX + innerRadius * Math.cos(startAngle)
  const y4 = centerY + innerRadius * Math.sin(startAngle)
  
  // Large arc flag - 1 if the arc spans more than 180 degrees
  const largeArcFlag = (endPercent - startPercent) > 50 ? 1 : 0
  
  // Create the path string
  return [
    `M ${x1} ${y1}`, // Move to start of outer arc
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}`, // Outer arc
    `L ${x3} ${y3}`, // Line to start of inner arc
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}`, // Inner arc (reverse direction)
    'Z' // Close path
  ].join(' ')
}

// For now, always use the fallback SVG chart to ensure reliability
const useUnovis = ref(false)
const chartError = ref(false)

// Try to load Unovis (disabled for now to ensure chart always works)
let VisDonut: any = null
let VisTooltip: any = null

// onMounted(async () => {
//   try {
//     const unovis = await import('@unovis/vue')
//     VisDonut = unovis.VisDonut
//     VisTooltip = unovis.VisTooltip
//     useUnovis.value = true
//   } catch (error) {
//     console.warn('Unovis not available, using fallback chart:', error)
//     useUnovis.value = false
//   }
// })

const handleChartError = (error: any) => {
  console.warn('Chart rendering error:', error)
  chartError.value = true
  useUnovis.value = false
}

// Unovis specific functions (only used when Unovis is available)
const valueAccessor = (d: any) => {
  return typeof d?.amount === 'number' ? d.amount : 0
}

const tooltipTemplate = (d: any) => {
  if (!d || typeof d.amount !== 'number') return ''
  const percent = total.value === 0 ? 0 : (d.amount / total.value) * 100
  return `${d.name || 'Unknown'}: ${formatCurrency(d.amount)} (${percent.toFixed(1)}%)`
}
</script>

<template>
  <UCard :ui="{ body: '!p-0', root: 'overflow-visible' }" class="h-[430px] flex flex-col">
    <template #header>
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <UIcon name="i-lucide-pie-chart" class="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <h3 class="text-lg font-semibold">Category Distribution</h3>
            <p class="text-sm text-muted">Share of spend by expense category</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {{ formatCurrency(total || 0) }}
          </p>
          <p class="text-xs text-muted">
            {{ data?.length || 0 }} categories
          </p>
        </div>
      </div>
    </template>

    <div v-if="data.length" class="p-6 pt-0 flex flex-col lg:flex-row lg:items-start flex-1 min-h-0">
      <div class="flex-shrink-0 flex justify-center">
        <!-- Unovis Chart (when available and working) -->
        <ClientOnly v-if="useUnovis && !chartError">
          <div class="relative" @error="handleChartError">
            <component
              :is="VisDonut"
              v-if="VisDonut"
              :data="data"
              :value="valueAccessor"
              :color="colorAccessor"
              :central-label="percentLabel"
              central-sub-label="Top category share"
              :central-sub-label-wrap="true"
              :height="250"
              :width="250"
            />
            <component
              :is="VisTooltip"
              v-if="VisTooltip"
              :template="tooltipTemplate"
            />
          </div>
          <template #fallback>
            <div class="flex items-center justify-center h-[250px] w-[250px]">
              <USkeleton class="h-[250px] w-[250px] rounded-full" />
            </div>
          </template>
        </ClientOnly>
        
        <!-- Custom SVG Donut Chart -->
        <div v-else class="relative flex items-center justify-center">
          <div v-if="chartData.length > 0" class="relative">
            <svg width="250" height="250" viewBox="0 0 300 300" class="drop-shadow-sm">
              <!-- Background circle for better visual separation -->
              <circle
                cx="150"
                cy="150"
                r="120"
                fill="none"
                stroke="rgb(243 244 246)"
                stroke-width="40"
                class="dark:stroke-gray-800"
              />
              
              <!-- Data segments -->
              <g class="transform -rotate-90 origin-center">
                <path
                  v-for="segment in chartData"
                  :key="segment.name"
                  :d="createArcPath(segment.startPercent, segment.endPercent)"
                  :fill="segment.color"
                  class="hover:opacity-90 transition-all duration-200 cursor-pointer hover:drop-shadow-md"
                  :title="`${segment.name}: ${formatCurrency(segment.amount)} (${segment.percent.toFixed(1)}%)`"
                  stroke="white"
                  stroke-width="1"
                />
              </g>
            </svg>
            
            <!-- Center Content -->
            <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div class="text-3xl font-bold text-primary mb-1">{{ percentLabel }}</div>
              <div class="text-sm text-muted font-medium">Top Category</div>
              <div class="text-xs text-muted mt-1 max-w-[120px] truncate" :title="data[0]?.name">
                {{ data[0]?.name || 'No data' }}
              </div>
            </div>
          </div>
          
          <!-- Simple CSS Fallback Chart -->
          <div v-else-if="data.length > 0" class="w-[250px] h-[250px] relative">
            <!-- Circular Progress Rings -->
            <div class="absolute inset-0 flex items-center justify-center">
              <div
                v-for="(item, index) in data.slice(0, 5)"
                :key="item.name"
                class="absolute rounded-full border-8 animate-pulse"
                :style="{
                  width: `${280 - index * 30}px`,
                  height: `${280 - index * 30}px`,
                  borderColor: colorAccessor(item),
                  opacity: 0.8 - index * 0.15
                }"
              />
            </div>
            
            <!-- Center Content -->
            <div class="absolute inset-0 flex flex-col items-center justify-center text-center bg-white dark:bg-gray-900 rounded-full w-32 h-32 m-auto border-4 border-gray-100 dark:border-gray-800">
              <div class="text-xl font-bold text-primary">{{ percentLabel }}</div>
              <div class="text-xs text-muted">Top Category</div>
            </div>
          </div>
          
          <!-- No Data State -->
          <div v-else class="w-[250px] h-[250px] flex items-center justify-center">
            <div class="text-center">
              <div class="w-24 h-24 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <UIcon name="i-lucide-pie-chart" class="h-12 w-12 text-gray-400" />
              </div>
              <p class="text-sm text-muted">No expense data available</p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex-1 lg:pl-8 mt-6 lg:mt-0 min-h-0">
        <ul class="space-y-3 overflow-y-auto max-h-80 p-3 pr-5 scrollbar-thin rounded-lg bg-gray-50/50 dark:bg-gray-800/20">
        <li
          v-for="item in data"
          :key="item.name"
          class="flex items-center justify-between gap-3"
        >
          <div class="flex items-center gap-2">
            <span class="legend-swatch" :style="{ background: colorAccessor(item) }" />
            <span class="text-sm text-highlighted">{{ item.name }}</span>
          </div>
          <div class="text-right">
            <div class="text-sm font-medium">
              {{ formatCurrency(item.amount) }}
            </div>
            <div class="text-xs text-muted">
              {{ total === 0 ? '0.0%' : ((item.amount / total) * 100).toFixed(1) + '%' }}
            </div>
          </div>
        </li>
        </ul>
      </div>
    </div>

    <div v-else class="p-6 text-sm text-muted flex items-center justify-center min-h-[200px]">
      <div class="text-center">
        <UIcon name="i-lucide-pie-chart" class="h-12 w-12 text-muted/50 mx-auto mb-4" />
        <p>Expense categories will appear when we detect transactions in this range.</p>
      </div>
    </div>
  </UCard>
</template>

<style scoped>
.legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 4px;
}
</style>
