<script setup lang="ts">
const props = defineProps<{ title: string, description?: string, step?: number, steps?: number, homeTo?: string }>()
const heading = ref<HTMLElement | null>(null)
watch(() => props.title, async () => {
  await nextTick()
  heading.value?.focus({ preventScroll: true })
})
</script>

<template>
  <div class="studio-entry min-h-dvh bg-default text-default lg:pr-[26%]">
    <header class="flex min-h-24 flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-10">
      <StudioBrand :to="homeTo ?? '/studio/signup'" />
      <div class="flex shrink-0 items-center gap-2 text-sm">
        <StudioThemeToggle />
        <slot name="header">
          <UButton
            to="/support"
            label="Get help"
            color="neutral"
            variant="link"
          />
        </slot>
      </div>
    </header>

    <main class="grid gap-10 px-6 pb-12 pt-10 sm:px-10 sm:pt-16 xl:grid-cols-[minmax(200px,0.8fr)_minmax(300px,1.2fr)] xl:gap-12 xl:pt-20">
      <div>
        <h1 ref="heading" tabindex="-1" class="max-w-sm text-[28px] leading-[1.2] font-medium tracking-[-0.035em] text-highlighted outline-none">
          {{ title }}
        </h1>
        <p v-if="description" class="mt-3 max-w-xs text-[15px] leading-6 text-muted">
          {{ description }}
        </p>
        <div
          v-if="step && steps"
          class="mt-8 sm:mt-10"
          role="progressbar"
          :aria-valuenow="step"
          :aria-valuemin="1"
          :aria-valuemax="steps"
          aria-label="Setup progress"
        >
          <span class="sr-only">Step {{ step }} of {{ steps }}</span>
          <div class="flex w-24 gap-1" aria-hidden="true">
            <span
              v-for="part in steps"
              :key="part"
              class="h-0.5 flex-1"
              :class="part <= step ? 'bg-inverted' : 'bg-accented'"
            />
          </div>
        </div>
      </div>
      <div class="w-full min-w-0 max-w-lg xl:min-h-0">
        <slot />
      </div>
    </main>

    <footer v-if="$slots.footer" class="sticky bottom-0 z-20 mt-auto flex min-h-24 flex-wrap items-center justify-between gap-3 border-t border-default bg-default px-6 py-4 sm:px-10">
      <slot name="footer" />
    </footer>

    <StudioArtPanel class="fixed inset-y-2 right-2 hidden w-[calc(26%-8px)] lg:block" />
  </div>
</template>

<style scoped>
.studio-entry {
  display: flex;
  flex-direction: column;
}
.studio-entry main {
  flex: 1;
  align-content: start;
}
@media (min-width: 1280px) {
  .studio-entry {
    height: 100dvh;
  }
  .studio-entry main {
    min-height: 0;
    overflow-y: auto;
    align-content: stretch;
  }
}
.studio-entry :deep(input:not([type='checkbox'])),
.studio-entry :deep([role='combobox']) {
  min-height: 3.5rem;
  border-radius: 0;
}
</style>
