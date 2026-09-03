<script setup lang="ts">
import type { PageStudioBlock } from '~~/shared/pageStudio/document'

const props = defineProps<{ block: PageStudioBlock }>()
const items = computed(() => (props.block.items || []).map(item => ({ label: item.title, content: item.body })))
</script>

<template>
  <section class="px-6 py-12 sm:px-10 sm:py-16">
    <div class="mx-auto max-w-4xl">
      <p v-if="block.eyebrow" class="text-xs font-semibold uppercase tracking-[0.18em] opacity-65">
        {{ block.eyebrow }}
      </p>
      <h2 class="mt-2 text-2xl font-semibold sm:text-3xl">
        {{ block.heading }}
      </h2>
      <UAccordion :items="items" class="mt-7" />
    </div>
  </section>
</template>
