<script setup lang="ts">
import type { PageStudioBlock } from '~~/shared/pageStudio/document'

const props = defineProps<{ block: PageStudioBlock }>()
const columns = computed(() => props.block.type === 'logo-cloud' ? 'sm:grid-cols-4' : props.block.type === 'testimonials' ? 'sm:grid-cols-2' : 'sm:grid-cols-3')
</script>

<template>
  <section class="px-6 py-12 sm:px-10 sm:py-16">
    <div class="mx-auto max-w-5xl" :class="block.alignment === 'center' ? 'text-center' : ''">
      <p v-if="block.eyebrow" class="text-xs font-semibold uppercase tracking-[0.18em] opacity-65">
        {{ block.eyebrow }}
      </p>
      <h2 class="mt-2 text-2xl font-semibold sm:text-3xl">
        {{ block.heading }}
      </h2>
      <p v-if="block.body" class="mt-4 max-w-3xl text-base leading-7 opacity-75" :class="block.alignment === 'center' ? 'mx-auto' : ''">
        {{ block.body }}
      </p>
      <div class="mt-8 grid grid-cols-1 gap-4" :class="columns">
        <article v-for="item in block.items || []" :key="item.id" class="border border-current/15 p-5 text-left">
          <template v-if="block.type === 'stats'">
            <p class="text-3xl font-semibold tracking-tight">
              {{ item.value }}
            </p>
            <h3 class="mt-2 font-medium">
              {{ item.label }}
            </h3>
          </template>
          <template v-else-if="block.type === 'testimonials'">
            <blockquote class="text-base leading-7">
              “{{ item.body }}”
            </blockquote>
            <p class="mt-5 font-medium">
              {{ item.title }}
            </p>
            <p class="text-sm opacity-65">
              {{ item.label }}
            </p>
          </template>
          <template v-else-if="block.type === 'logo-cloud'">
            <img
              v-if="item.imageUrl"
              :src="item.imageUrl"
              :alt="item.imageAlt"
              class="h-10 w-full object-contain"
              loading="lazy"
            >
            <p v-else class="text-center font-semibold opacity-70">
              {{ item.title }}
            </p>
          </template>
          <template v-else>
            <p v-if="item.label" class="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">
              {{ item.label }}
            </p>
            <h3 class="mt-2 text-lg font-semibold">
              {{ item.title }}
            </h3>
            <p class="mt-2 text-sm leading-6 opacity-70">
              {{ item.body }}
            </p>
            <a
              v-if="item.href"
              :href="item.href"
              class="mt-4 inline-flex text-sm font-medium underline underline-offset-4"
              @click.prevent
            >Read more</a>
          </template>
          <p v-if="block.type === 'stats' && item.body" class="mt-2 text-sm leading-6 opacity-65">
            {{ item.body }}
          </p>
        </article>
      </div>
    </div>
  </section>
</template>
