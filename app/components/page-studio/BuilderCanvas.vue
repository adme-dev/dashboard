<script setup lang="ts">
import type { PageStudioBlock, PageStudioPage, PageStudioShell } from '~~/shared/pageStudio/document'

const props = defineProps<{
  device: 'desktop' | 'tablet' | 'mobile'
  page: PageStudioPage
  shell?: PageStudioShell
  preview: boolean
  selectedBlockId: string | null
}>()

const emit = defineEmits<{
  select: [blockId: string]
}>()

const canvasWidth = computed(() => ({ desktop: 'max-w-6xl', tablet: 'max-w-3xl', mobile: 'max-w-sm' })[props.device])

function backgroundClass(block: PageStudioBlock) {
  return {
    canvas: 'bg-default text-highlighted',
    muted: 'bg-elevated text-highlighted',
    brand: 'bg-primary text-inverted',
    dark: 'bg-neutral-950 text-white'
  }[block.background]
}

function bodyClass(block: PageStudioBlock) {
  return block.background === 'canvas' || block.background === 'muted' ? 'text-muted' : 'text-current/75'
}

function isCollectionBlock(block: PageStudioBlock) {
  return ['features', 'stats', 'testimonials', 'logo-cloud', 'blog-grid'].includes(block.type)
}
</script>

<template>
  <div class="min-h-full overflow-auto bg-muted/20 p-3 sm:p-6">
    <div :class="canvasWidth" class="mx-auto min-h-[44rem] overflow-hidden border border-default bg-default shadow-sm transition-[max-width] duration-300">
      <PageStudioBuilderSiteHeader v-if="shell && page.headerMode !== 'hidden'" :shell="shell" :device="device" />
      <div v-if="page.blocks.length === 0" class="flex min-h-[34rem] flex-col items-center justify-center px-6 text-center">
        <span class="flex size-12 items-center justify-center rounded-xl bg-elevated">
          <UIcon name="i-lucide-layout-template" class="size-6 text-muted" />
        </span>
        <h2 class="mt-4 text-lg font-semibold text-highlighted">
          Start with a section
        </h2>
        <p class="mt-2 max-w-sm text-sm text-muted">
          Use Add section in the toolbar to create the first part of this page.
        </p>
      </div>

      <div
        v-for="block in page.blocks"
        :key="block.id"
        role="button"
        :tabindex="preview ? -1 : 0"
        :aria-label="`Edit ${block.type} section`"
        :class="[
          backgroundClass(block),
          !preview && selectedBlockId === block.id ? 'relative z-10 ring-2 ring-inset ring-primary' : '',
          !preview ? 'cursor-pointer hover:ring-2 hover:ring-inset hover:ring-primary/40' : ''
        ]"
        @click="!preview && emit('select', block.id)"
        @keydown.enter="!preview && emit('select', block.id)"
      >
        <section v-if="block.type === 'hero'" class="px-6 py-16 sm:px-10 sm:py-24">
          <div :class="block.alignment === 'center' ? 'mx-auto text-center' : ''" class="max-w-3xl">
            <p v-if="block.eyebrow" class="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">
              {{ block.eyebrow }}
            </p>
            <h1 class="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
              {{ block.heading || 'Hero heading' }}
            </h1>
            <p :class="bodyClass(block)" class="mt-5 whitespace-pre-line text-base leading-7 sm:text-lg">
              {{ block.body || 'Add a clear introduction for this page.' }}
            </p>
            <UButton
              v-if="block.buttonLabel"
              class="mt-7"
              :label="block.buttonLabel"
              size="lg"
              @click.prevent
            />
          </div>
        </section>

        <section v-else-if="block.type === 'text'" class="px-6 py-12 sm:px-10 sm:py-16">
          <div :class="block.alignment === 'center' ? 'mx-auto text-center' : ''" class="max-w-3xl">
            <p v-if="block.eyebrow" class="text-xs font-semibold uppercase tracking-[0.18em] opacity-65">
              {{ block.eyebrow }}
            </p>
            <h2 class="mt-2 text-2xl font-semibold sm:text-3xl">
              {{ block.heading || 'Section heading' }}
            </h2>
            <p :class="bodyClass(block)" class="mt-4 whitespace-pre-line text-base leading-7">
              {{ block.body || 'Add the section content here.' }}
            </p>
          </div>
        </section>

        <section v-else-if="block.type === 'image'" class="px-6 py-10 sm:px-10 sm:py-14">
          <div class="mx-auto max-w-5xl">
            <img
              v-if="block.imageUrl"
              :src="block.imageUrl"
              :alt="block.imageAlt"
              class="aspect-[16/9] w-full rounded-lg object-cover"
              loading="lazy"
            >
            <div v-else class="flex aspect-[16/9] w-full items-center justify-center rounded-lg border border-dashed border-current/25 bg-elevated/30">
              <div class="text-center opacity-60">
                <UIcon name="i-lucide-image" class="mx-auto size-8" /><p class="mt-2 text-sm">
                  Add an image URL
                </p>
              </div>
            </div>
            <h2 v-if="block.heading" class="mt-5 text-xl font-semibold">
              {{ block.heading }}
            </h2>
            <p v-if="block.body" :class="bodyClass(block)" class="mt-2 text-sm leading-6">
              {{ block.body }}
            </p>
          </div>
        </section>

        <PageStudioBuilderCollectionSection v-else-if="isCollectionBlock(block)" :block="block" />

        <PageStudioBuilderFaqSection v-else-if="block.type === 'faq'" :block="block" />

        <PageStudioBuilderContactSection v-else-if="block.type === 'contact'" :block="block" />

        <section v-else class="px-6 py-12 sm:px-10 sm:py-16">
          <div :class="block.alignment === 'center' ? 'text-center' : ''" class="mx-auto max-w-4xl">
            <h2 class="text-2xl font-semibold sm:text-3xl">
              {{ block.heading || 'Ready to get started?' }}
            </h2>
            <p :class="bodyClass(block)" class="mt-3 whitespace-pre-line text-base leading-7">
              {{ block.body || 'Give visitors one clear next step.' }}
            </p>
            <UButton
              v-if="block.buttonLabel"
              class="mt-6"
              :label="block.buttonLabel"
              size="lg"
              @click.prevent
            />
          </div>
        </section>
      </div>
      <PageStudioBuilderSiteFooter v-if="shell && page.footerMode !== 'hidden'" :shell="shell" />
    </div>
  </div>
</template>
