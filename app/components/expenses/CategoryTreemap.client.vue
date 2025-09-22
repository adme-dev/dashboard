<script setup lang="ts">
type Category = {
  name: string
  amount: number
}

const props = defineProps<{
  categories: Category[]
}>()

const palette = [
  '#2563eb', '#14b8a6', '#f97316', '#a855f7', '#22c55e', '#eab308', 
  '#6366f1', '#ef4444', '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981'
]

const data = computed(() => {
  if (!props.categories || !Array.isArray(props.categories)) {
    return []
  }
  return props.categories
    .filter(category => category && typeof category.amount === 'number' && category.amount > 0)
    .sort((a, b) => b.amount - a.amount) // Sort by amount descending
    .map((category, index) => ({
      ...category,
      index,
      color: palette[index % palette.length]
    }))
})

const total = computed(() => data.value.reduce((sum, item) => sum + (item.amount || 0), 0))

const formatCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format

// Calculate relative sizes for treemap-style visualization
const processedData = computed(() => {
  if (!data.value?.length || !total.value || total.value === 0) return []
  
  return data.value.map((item, index) => {
    if (!item || typeof item.amount !== 'number') return null
    
    const percentage = (item.amount / total.value) * 100
    
    // Calculate size based on percentage (minimum size for readability)
    let size = Math.max(percentage * 4, 20)
    
    // Create different sizes for visual hierarchy
    if (index === 0) size = Math.max(size, 120) // Largest
    else if (index < 3) size = Math.max(size, 80) // Medium
    else if (index < 6) size = Math.max(size, 60) // Small
    else size = Math.max(size, 40) // Smallest
    
    return {
      ...item,
      percentage: percentage || 0,
      size,
      // Calculate grid position
      gridRow: Math.floor(index / 4) + 1,
      gridCol: (index % 4) + 1
    }
  }).filter(Boolean) // Remove null items
})
</script>

<template>
  <UCard :ui="{ body: '!p-0' }" class="h-[600px] flex flex-col">
    <template #header>
      <div>
        <p class="text-xs text-muted uppercase mb-1.5">
          Category Breakdown
        </p>
        <p class="text-3xl text-highlighted font-semibold">
          {{ formatCurrency(total || 0) }}
        </p>
        <p class="text-muted text-xs">
          {{ data?.length || 0 }} categories • Expense distribution
        </p>
      </div>
    </template>

    <div v-if="!data?.length" class="p-6 text-sm text-muted flex items-center justify-center min-h-[300px]">
      <div class="text-center">
        <UIcon name="i-lucide-layers" class="h-12 w-12 text-muted/50 mx-auto mb-4" />
        <p>Category breakdown will appear when we detect expenses in this range.</p>
      </div>
    </div>

    <div v-else class="flex-1 flex flex-col min-h-0">
      <!-- Top 3 Categories - Visual Cards -->
      <div class="p-4 pb-0 flex-shrink-0">
        <div class="grid grid-cols-3 gap-3 mb-4">
          <div
            v-for="(item, index) in (processedData || []).slice(0, 3)"
            :key="item?.name || index"
            class="relative rounded-lg p-3 cursor-pointer group transition-all duration-300 hover:scale-105 hover:shadow-lg"
            :style="{ backgroundColor: (item?.color || '#gray') + '15', borderColor: (item?.color || '#gray') + '40' }"
            style="border-width: 1px;"
            :title="`${item?.name || 'Unknown'}: ${formatCurrency(item?.amount || 0)} (${(item?.percentage || 0).toFixed(1)}%)`"
          >
            <div class="flex items-center justify-between mb-2">
              <div 
                class="w-3 h-3 rounded-full flex-shrink-0"
                :style="{ backgroundColor: item?.color || '#gray' }"
              />
              <div class="text-xs font-bold opacity-70">
                {{ (item?.percentage || 0).toFixed(1) }}%
              </div>
            </div>
            
            <div class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate mb-1" :title="item?.name || 'Unknown'">
              {{ (item?.name || 'Unknown').length > 15 ? (item?.name || 'Unknown').substring(0, 15) + '...' : (item?.name || 'Unknown') }}
            </div>
            <div class="text-sm font-bold" :style="{ color: item?.color || '#gray' }">
              {{ formatCurrency(item?.amount || 0) }}
            </div>
          </div>
        </div>
      </div>

      <!-- All Categories List - Scrollable -->
      <div class="flex-1 px-4 pb-4 min-h-0">
        <div class="border-t border-gray-100 dark:border-gray-800 pt-3">
          <h4 class="text-sm font-semibold mb-3 text-muted flex items-center justify-between">
            <span>All Categories</span>
            <span class="text-xs opacity-60">{{ data?.length || 0 }} items</span>
          </h4>
          
          <!-- Scrollable List -->
          <div class="overflow-y-auto max-h-60 space-y-2 pr-2 scrollbar-thin">
            <div
              v-for="(item, index) in data || []"
              :key="item?.name || index"
              class="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors group cursor-pointer"
              :title="`${item?.name || 'Unknown'}: ${formatCurrency(item?.amount || 0)} (${(item?.percentage || 0).toFixed(1)}%)`"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <div 
                    class="w-3 h-3 rounded-full flex-shrink-0"
                    :style="{ backgroundColor: item?.color || '#gray' }"
                  />
                  <span class="text-xs font-medium text-gray-500 dark:text-gray-400 min-w-[2rem]">
                    #{{ index + 1 }}
                  </span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium truncate" :title="item?.name || 'Unknown'">
                    {{ item?.name || 'Unknown Category' }}
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    {{ (item?.percentage || 0).toFixed(1) }}% of total expenses
                  </div>
                </div>
              </div>
              
              <div class="text-right ml-3">
                <div class="text-sm font-semibold" :style="{ color: item?.color || '#gray' }">
                  {{ formatCurrency(item?.amount || 0) }}
                </div>
                <div class="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-1">
                  <div 
                    class="h-1.5 rounded-full transition-all duration-500"
                    :style="{ 
                      backgroundColor: item?.color || '#gray', 
                      width: `${Math.max(item?.percentage || 0, 2)}%` 
                    }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Summary Stats Footer -->
      <div class="px-4 pb-4 flex-shrink-0 mt-auto">
        <div class="border-t border-gray-100 dark:border-gray-800 pt-3">
          <div class="grid grid-cols-3 gap-4 text-center">
            <div>
              <div class="text-lg font-bold text-blue-600">{{ data?.length || 0 }}</div>
              <div class="text-xs text-muted">Categories</div>
            </div>
            <div>
              <div class="text-lg font-bold text-green-600">
                {{ data?.[0] && total ? ((data[0].amount / total) * 100).toFixed(1) : 0 }}%
              </div>
              <div class="text-xs text-muted">Top Category</div>
            </div>
            <div>
              <div class="text-lg font-bold text-purple-600">
                {{ data?.length && total && data.slice(0, 3).reduce((sum, item) => sum + (item?.amount || 0), 0) > 0 
                  ? ((data.slice(0, 3).reduce((sum, item) => sum + (item?.amount || 0), 0) / total) * 100).toFixed(1) 
                  : 0 }}%
              </div>
              <div class="text-xs text-muted">Top 3 Share</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>
