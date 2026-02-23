<template>
  <div class="max-w-4xl mx-auto">
    <!-- Title -->
    <h2 class="text-3xl font-normal text-black mb-8">Proof from the field</h2>

    <!-- Quote Card -->
    <div class="border border-black/20 rounded overflow-hidden mb-8">
      <div class="p-8 md:p-10 bg-[#F5F5F5]">
        <p class="text-xl md:text-2xl text-black leading-relaxed">
          "{{ quote }}"
        </p>
      </div>
      <div class="px-8 py-4 border-t border-black/20 bg-white flex items-center gap-2">
        <UIcon :name="companyIcon" class="w-5 h-5 text-black" />
        <span class="font-semibold text-black">{{ company }}</span>
      </div>
    </div>

    <!-- Before/After Labels -->
    <div class="grid grid-cols-2 gap-0 mb-0">
      <div class="px-4 pb-3">
        <span class="inline-block px-4 py-2 bg-[#C4C4C4] text-black text-sm font-medium">Before</span>
      </div>
      <div class="px-4 pb-3">
        <span class="inline-block px-4 py-2 bg-[#C4C4C4] text-black text-sm font-medium">After</span>
      </div>
    </div>

    <!-- Comparison Table -->
    <div class="border border-black/20 rounded overflow-hidden">
      <div 
        v-for="(row, index) in rows" 
        :key="index"
        class="grid grid-cols-2 border-b border-black/20 last:border-b-0"
      >
        <!-- Before Column -->
        <div class="p-6 flex items-start gap-4 bg-white">
          <UIcon :name="row.beforeIcon" class="w-5 h-5 text-black mt-0.5 flex-shrink-0" />
          <span class="text-black">{{ row.before }}</span>
        </div>
        <!-- After Column -->
        <div class="p-6 flex items-start gap-4 bg-[#FAF8F6] border-l border-black/20">
          <UIcon :name="row.afterIcon" class="w-5 h-5 text-black mt-0.5 flex-shrink-0" />
          <span class="text-black">{{ row.after }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ComparisonRow {
  before: string
  beforeIcon: string
  after: string
  afterIcon: string
}

interface Props {
  quote: string
  company: string
  companyIcon?: string
  rows: ComparisonRow[]
}

withDefaults(defineProps<Props>(), {
  companyIcon: 'i-lucide-triangle'
})
</script>
