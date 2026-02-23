<template>
  <section class="py-24 px-6 bg-[#F5F5F5]">
    <div class="max-w-6xl mx-auto">
      <h2 class="text-4xl md:text-5xl font-normal text-black mb-12">{{ title }}</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div v-for="card in cards" :key="card.company" class="border border-black rounded overflow-hidden bg-white">
          <div class="h-16 flex items-center justify-center gap-2" :style="`background: ${card.headerColor};`">
            <UIcon v-if="card.icon" :name="card.icon" class="w-5 h-5" :class="card.iconColor || 'text-white'" />
            <div v-if="card.logo" class="w-6 h-6 bg-white rounded flex items-center justify-center">
              <span class="font-bold text-sm" :style="`color: ${card.headerColor};`">{{ card.logo }}</span>
            </div>
            <span class="font-semibold text-white text-lg">{{ card.company }}</span>
            <UIcon v-if="card.trailingIcon" :name="card.trailingIcon" class="w-5 h-5 text-white" />
          </div>
          <div class="p-6">
            <p class="text-black leading-relaxed">"{{ card.quote }}"</p>
          </div>
          <div class="px-6 py-4 border-t border-black/20">
            <button class="text-sm text-black flex items-center gap-2 hover:underline">
              {{ ctaText }} <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
interface TestimonialCard {
  company: string
  quote: string
  headerColor: string
  icon?: string
  iconColor?: string
  logo?: string
  trailingIcon?: string
}

withDefaults(defineProps<{
  title?: string
  ctaText?: string
  cards: TestimonialCard[]
}>(), {
  title: 'Trusted by Accounting Firms',
  ctaText: 'Read Case Study'
})
</script>
