<template>
  <section class="py-24 px-6 bg-white">
    <div class="max-w-6xl mx-auto">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          <h2 class="text-5xl font-normal text-black">{{ title }}</h2>
        </div>
        <div class="space-y-4">
          <div 
            v-for="(item, index) in items" 
            :key="item.question"
            class="border border-black rounded overflow-hidden"
            :style="isOpen(index) ? `background: ${activeBackground};` : 'background: white;'"
          >
            <details 
              :open="isOpen(index)"
              class="group"
              @toggle="(e: Event) => handleToggle(index, e)"
            >
              <summary class="flex items-center justify-between p-6 cursor-pointer list-none">
                <span class="font-medium text-black text-lg">{{ item.question }}</span>
                <div 
                  class="w-10 h-10 border border-black rounded flex items-center justify-center"
                  :class="isOpen(index) ? 'bg-[#7DD3A8]' : 'bg-white'"
                >
                  <UIcon 
                    name="i-lucide-plus" 
                    class="w-5 h-5 text-black"
                    :class="isOpen(index) ? 'hidden' : 'block'"
                  />
                  <UIcon 
                    name="i-lucide-minus" 
                    class="w-5 h-5 text-black"
                    :class="isOpen(index) ? 'block' : 'hidden'"
                  />
                </div>
              </summary>
              <div class="px-6 pb-6 text-black/80 leading-relaxed">
                {{ item.answer }}
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface FaqItem {
  question: string
  answer: string
}

const props = withDefaults(defineProps<{
  title?: string
  activeBackground?: string
  items: FaqItem[]
  defaultOpenIndex?: number
}>(), {
  title: 'FAQs',
  activeBackground: '#E8F5E9',
  defaultOpenIndex: 0
})

const openIndex = ref<number>(props.defaultOpenIndex)

const isOpen = (index: number) => openIndex.value === index

const handleToggle = (index: number, e: Event) => {
  const details = e.target as HTMLDetailsElement
  if (details.open) {
    openIndex.value = index
  } else if (openIndex.value === index) {
    openIndex.value = -1
  }
}
</script>
