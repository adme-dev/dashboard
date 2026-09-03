<script setup lang="ts">
import type { PageStudioBlock } from '~~/shared/pageStudio/document'

defineProps<{ block: PageStudioBlock }>()
</script>

<template>
  <section class="px-6 py-12 sm:px-10 sm:py-16">
    <div class="mx-auto grid max-w-5xl gap-8 sm:grid-cols-[minmax(0,1.3fr)_minmax(15rem,0.7fr)] sm:items-start">
      <div>
        <p v-if="block.eyebrow" class="text-xs font-semibold uppercase tracking-[0.18em] opacity-65">
          {{ block.eyebrow }}
        </p>
        <h2 class="mt-2 text-2xl font-semibold sm:text-3xl">
          {{ block.heading }}
        </h2>
        <p class="mt-4 text-base leading-7 opacity-75">
          {{ block.body }}
        </p>
        <UButton
          v-if="block.buttonLabel"
          class="mt-6"
          :label="block.buttonLabel"
          size="lg"
          @click.prevent
        />
      </div>
      <dl class="divide-y divide-current/15 border-y border-current/15">
        <div v-for="item in block.items || []" :key="item.id" class="py-4">
          <dt class="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">
            {{ item.label }}
          </dt>
          <dd class="mt-1 font-medium">
            {{ item.value }}
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>
