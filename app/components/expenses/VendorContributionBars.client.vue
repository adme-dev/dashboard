<script setup lang="ts">
type Vendor = {
  name: string
  amount: number
}

const props = defineProps<{
  vendors: Vendor[]
}>()

const colorPalette = [
  { from: '#3b82f6', to: '#1d4ed8', bg: '#3b82f6' }, // blue
  { from: '#10b981', to: '#047857', bg: '#10b981' }, // green
  { from: '#8b5cf6', to: '#5b21b6', bg: '#8b5cf6' }, // purple
  { from: '#f97316', to: '#c2410c', bg: '#f97316' }, // orange
  { from: '#ef4444', to: '#b91c1c', bg: '#ef4444' }, // red
  { from: '#6366f1', to: '#3730a3', bg: '#6366f1' }, // indigo
  { from: '#06b6d4', to: '#0891b2', bg: '#06b6d4' }, // cyan
  { from: '#84cc16', to: '#4d7c0f', bg: '#84cc16' }, // lime
]

const items = computed(() => {
  if (!props.vendors || !Array.isArray(props.vendors)) return []
  
  const sorted = [...props.vendors]
    .filter(vendor => vendor && typeof vendor.amount === 'number' && vendor.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  
  return sorted.slice(0, 8).map((vendor, index) => ({
    ...vendor,
    colors: colorPalette[index % colorPalette.length]
  }))
})

const maxAmount = computed(() => items.value.reduce((max, item) => Math.max(max, item.amount || 0), 0))

const formatCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format
</script>

<template>
  <UCard :ui="{ body: '!p-0' }" class="h-full flex flex-col">
    <template #header>
      <div>
        <p class="text-xs text-muted uppercase mb-1.5">
          Vendor Concentration
        </p>
        <p class="text-muted text-xs">
          Share of spend by top vendors
        </p>
      </div>
    </template>

    <div v-if="!items?.length" class="p-6 text-sm text-muted flex items-center justify-center min-h-[300px]">
      <div class="text-center">
        <UIcon name="i-lucide-building-2" class="h-12 w-12 text-muted/50 mx-auto mb-4" />
        <p>Vendor spend will appear here once we detect expenses in this range.</p>
      </div>
    </div>

    <div v-else class="p-6 pt-0 flex-1">
      <!-- Visual Chart Area -->
      <div class="mb-6">
        <div class="relative h-64 flex items-end justify-center gap-3 px-4">
          <div
            v-for="(vendor, index) in items.slice(0, 6)"
            :key="vendor.name"
            class="relative flex flex-col items-center group cursor-pointer"
            :title="`${vendor?.name || 'Unknown'}: ${formatCurrency(vendor?.amount || 0)}`"
          >
            <!-- Bar -->
            <div
              class="w-8 rounded-t-lg transition-all duration-500 hover:scale-105 hover:shadow-lg"
              :style="{ 
                background: `linear-gradient(to top, ${vendor?.colors?.from || '#3b82f6'}, ${vendor?.colors?.to || '#1d4ed8'})`,
                height: `${maxAmount === 0 ? 0 : ((vendor?.amount || 0) / maxAmount) * 200}px`,
                minHeight: '12px'
              }"
            />
            
            <!-- Value Label -->
            <div class="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
              {{ formatCurrency(vendor?.amount || 0) }}
            </div>
            
            <!-- Vendor Name -->
            <div class="mt-2 text-xs text-center max-w-16 truncate" :title="vendor?.name || 'Unknown'">
              {{ (vendor?.name || 'Unknown').split(' ')[0] }}
            </div>
          </div>
        </div>
      </div>

      <!-- Detailed List -->
      <div class="border-t border-gray-100 dark:border-gray-800 pt-4">
        <h4 class="text-sm font-semibold mb-3 text-muted">Top Vendors</h4>
        <div class="space-y-2 max-h-32 overflow-y-auto scrollbar-thin">
          <div
            v-for="(vendor, index) in items"
            :key="vendor.name"
            class="flex items-center justify-between text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 px-2 py-1 rounded transition-colors"
          >
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <div 
                class="w-3 h-3 rounded-full flex-shrink-0"
                :style="{ backgroundColor: vendor?.colors?.bg || '#3b82f6' }"
              />
              <span class="truncate" :title="vendor?.name || 'Unknown'">{{ vendor?.name || 'Unknown' }}</span>
            </div>
            <span class="font-medium text-green-600 ml-3">{{ formatCurrency(vendor?.amount || 0) }}</span>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>
