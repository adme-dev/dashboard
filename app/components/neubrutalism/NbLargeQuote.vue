<template>
  <section class="py-16 px-6" :style="`background: ${backgroundColor};`">
    <div class="max-w-5xl mx-auto">
      <!-- Quote Box -->
      <div class="border border-black bg-white p-12 md:p-16">
        <blockquote class="text-3xl md:text-4xl font-normal text-black leading-snug">
          "{{ quote }}"
        </blockquote>
      </div>
      <!-- Attribution -->
      <div class="flex justify-end -mt-px">
        <div class="border border-black bg-white px-8 py-4 flex items-center gap-2">
          <span class="text-black font-medium">{{ company }}</span>
          <UIcon v-if="icon" :name="icon" class="w-4 h-4 text-black/60" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  quote?: string
  company?: string
  icon?: string
  backgroundColor?: string
}>(), {
  quote: "XeroFlow cut our client onboarding time from 3 weeks to 3 days. The automation handles all the repetitive data entry while we focus on delivering value to our clients.",
  company: 'Morrison & Associates',
  icon: 'i-lucide-building-2',
  backgroundColor: '#F0FAFE'
})
</script>
