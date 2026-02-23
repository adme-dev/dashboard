<template>
  <section class="py-24 px-6" :style="`background: ${backgroundColor};`">
    <div class="max-w-6xl mx-auto">
      <h2 class="text-4xl font-normal text-black mb-12">{{ title }}</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div 
          v-for="card in cards" 
          :key="card.title" 
          class="border border-black/20 bg-white"
        >
          <!-- Diagonal textured header -->
          <div 
            class="h-6" 
            style="background-color: #2A2A2A; background-image: repeating-linear-gradient(45deg, transparent, transparent 1px, rgba(255,255,255,0.05) 1px, rgba(255,255,255,0.05) 2px);"
          ></div>
          <div class="p-6 relative">
            <!-- Icon box -->
            <div 
              class="absolute top-0 right-0 w-10 h-10 flex items-center justify-center"
              :style="`background: ${card.iconBg}; transform: translateY(-50%);`"
            >
              <UIcon :name="card.icon" class="w-5 h-5" :class="card.iconColor || 'text-white'" />
            </div>
            <h3 class="text-base font-semibold text-black mb-2 pr-8">{{ card.title }}</h3>
            <p class="text-sm text-black/60">{{ card.description }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
interface WhyCard {
  title: string
  description: string
  icon: string
  iconBg: string
  iconColor?: string
}

withDefaults(defineProps<{
  title?: string
  backgroundColor?: string
  cards: WhyCard[]
}>(), {
  title: 'Why XeroFlow',
  backgroundColor: '#F0FAFE'
})
</script>
