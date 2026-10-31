<script setup lang="ts">
import { useBannerSlideDrag } from '~/composables/useBannerSlideDrag'
import { slidePoster } from '~/utils/banner-slides'

const { state, slides, currentSlide, selectSlide, addSlide, moveSlide } = useBannerSlides()
const board = computed(() => state.sets[state.activeKey])
const posters = computed(() => Object.fromEntries(slides.value.map(slide => [slide.id, { [state.activeKey]: slidePoster(board.value, slide.id) }])))
const slideDrag = useBannerSlideDrag('strip', moveSlide)
</script>

<template>
  <div aria-label="Timeline slides" class="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-default bg-default px-3 py-2">
    <span class="shrink-0 text-xs font-medium text-muted">Slides</span>
    <template v-for="(slide, index) in slides" :key="slide.id">
      <UButton
        :aria-label="`Timeline slide ${index + 1}: ${slide.name}, ${slide.duration} seconds`"
        :aria-pressed="currentSlide?.id === slide.id"
        :variant="currentSlide?.id === slide.id ? 'soft' : 'outline'"
        :color="currentSlide?.id === slide.id ? 'primary' : 'neutral'"
        size="xs"
        class="shrink-0 gap-2"
        data-slide-surface="strip"
        :data-slide-index="index"
        :aria-grabbed="slideDrag.dragged.value === index"
        :draggable="false"
        @pointerdown="slideDrag.start($event, index)"
        @click.capture="slideDrag.preventClick"
        @click="selectSlide(index)"
      >
        <span class="h-9 w-12 overflow-hidden rounded bg-muted">
          <BannerThumbnail v-if="board" :client-id="state.project?.clientId" :canvas-data="posters[slide.id]" />
        </span>
        <span class="max-w-28 truncate">{{ index + 1 }} · {{ slide.name }}</span>
        <span class="tabular-nums text-muted">{{ slide.duration }}s</span>
      </UButton>
      <BannerSlideTransition v-if="index < slides.length - 1" :slide="slide" :index="index" />
    </template>
    <UButton
      aria-label="Add slide"
      icon="i-lucide-plus"
      variant="ghost"
      size="xs"
      class="shrink-0"
      :disabled="slides.length >= 50"
      @click="() => { addSlide(Math.max(0, slides.findIndex(slide => slide.id === currentSlide?.id))) }"
    />
  </div>
</template>
