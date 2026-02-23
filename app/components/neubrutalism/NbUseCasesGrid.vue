<template>
  <section class="py-16 px-6 bg-white border-b border-black/10">
    <div class="max-w-6xl mx-auto">
      <!-- Feature Grid -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-16">
        <div v-for="item in items" :key="item.title">
          <div class="flex items-start gap-3 mb-4">
            <div class="w-2 h-2 rounded-sm mt-2.5 shrink-0" :style="`background: ${item.color};`"></div>
            <h3 class="text-lg font-bold text-black leading-tight">{{ item.title }}</h3>
          </div>
          <p class="text-sm text-black/70 leading-relaxed">
            {{ item.description }}
          </p>
        </div>
      </div>
      
      <!-- Stats Row -->
      <div v-if="stats.length > 0" class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          v-for="stat in stats" 
          :key="stat.label" 
          class="border border-black/20 rounded-lg overflow-hidden bg-white"
        >
          <div class="h-2" :style="`background: ${stat.borderColor};`"></div>
          <div class="p-6">
            <div class="text-5xl font-normal text-black mb-2">
              {{ stat.value }}<span class="text-3xl">{{ stat.unit }}</span>
            </div>
            <p class="text-sm text-black/70">{{ stat.label }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
interface UseCaseItem {
  title: string
  description: string
  color: string
}

interface StatItem {
  value: string
  unit: string
  label: string
  borderColor: string
}

withDefaults(defineProps<{
  items: UseCaseItem[]
  stats?: StatItem[]
}>(), {
  stats: () => []
})
</script>
