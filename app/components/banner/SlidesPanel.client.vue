<script setup lang="ts">
import { useBannerSlideDrag } from '~/composables/useBannerSlideDrag'
import { slidePoster } from '~/utils/banner-slides'

const { pauseTimeline } = useBannerTimeline()
const { state, slides, currentSlide, selectSlide, apply, addSlide, duplicateSlide, moveSlide } = useBannerSlides()
const selectedIndex = computed(() => slides.value.findIndex(slide => slide.id === currentSlide.value?.id))
const board = computed(() => state.sets[state.activeKey])
const posters = computed(() => Object.fromEntries(slides.value.map(slide => [slide.id, { [state.activeKey]: slidePoster(board.value, slide.id) }])))
const name = ref('')
const duration = ref(3)
const pendingDelete = ref<number | null>(null)
const slideDrag = useBannerSlideDrag('panel', moveSlide)
function resetFields() {
  name.value = currentSlide.value?.name || ''
  duration.value = currentSlide.value?.duration || 3
}
watch(currentSlide, resetFields, { immediate: true })
function saveName() {
  apply({ type: 'rename', index: selectedIndex.value, name: name.value })
  resetFields()
}
function saveDuration() {
  apply({ type: 'duration', index: selectedIndex.value, duration: Number(duration.value) }, selectedIndex.value)
  resetFields()
}
const loopItems = computed(() => [...new Set([1, 0, 2, 3, 5, 10, board.value?.playback?.loopCount ?? 1])].map(count => ({ label: count === 0 ? 'Forever' : count === 1 ? 'Once' : `${count} times`, value: String(count) })))
function menu(index: number) {
  return [[
    { label: 'Duplicate slide', icon: 'i-lucide-copy', onSelect: () => duplicateSlide(index) },
    { label: 'Move earlier', icon: 'i-lucide-arrow-up', disabled: index === 0, onSelect: () => moveSlide(index, index - 1) },
    { label: 'Move later', icon: 'i-lucide-arrow-down', disabled: index === slides.value.length - 1, onSelect: () => moveSlide(index, index + 1) }
  ], [{ label: 'Delete slide', icon: 'i-lucide-trash-2', color: 'error' as const, disabled: slides.value.length === 1, onSelect: () => { pendingDelete.value = index } }]]
}
</script>

<template>
  <div class="space-y-4 p-3" aria-label="Slides panel">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold">
        Slides
      </h2>
      <span class="text-xs tabular-nums text-muted">{{ slides.at(-1)?.end.toFixed(1) || '0.0' }}s total</span>
    </div>
    <UFormField label="Loop">
      <USelect
        :model-value="String(board?.playback?.loopCount ?? 1)"
        :items="loopItems"
        class="w-full"
        @update:model-value="apply({ type: 'loop', loopCount: Number($event) })"
      />
    </UFormField>
    <p class="text-xs text-muted">
      {{ state.layoutView === 'all' ? 'Slide changes apply to all layouts.' : 'Slide changes apply to this layout.' }}
    </p>
    <div v-for="(slide, index) in slides" :key="slide.id" class="space-y-2">
      <div
        class="overflow-hidden rounded-lg border bg-default"
        :class="currentSlide?.id === slide.id ? 'border-primary ring-1 ring-primary' : 'border-default'"
      >
        <UButton
          :aria-label="`Select ${slide.name}`"
          :aria-pressed="currentSlide?.id === slide.id"
          color="neutral"
          variant="ghost"
          class="flex w-full flex-col items-stretch gap-2 rounded-none p-2"
          data-slide-surface="panel"
          :data-slide-index="index"
          :aria-grabbed="slideDrag.dragged.value === index"
          :draggable="false"
          @pointerdown="slideDrag.start($event, index)"
          @click.capture="slideDrag.preventClick"
          @click="selectSlide(index)"
        >
          <div class="h-28 w-full overflow-hidden rounded bg-muted">
            <BannerThumbnail v-if="board" :client-id="state.project?.clientId" :canvas-data="posters[slide.id]" />
          </div>
          <span class="flex w-full items-center gap-2 text-left">
            <span class="text-xs tabular-nums text-muted">{{ index + 1 }}</span>
            <span class="min-w-0 flex-1 truncate text-xs font-medium">{{ slide.name }}</span>
            <span class="shrink-0 text-xs tabular-nums text-muted">{{ slide.duration }}s</span>
          </span>
        </UButton>
        <div class="flex items-center justify-between border-t border-default px-2 py-1">
          <span class="text-xs tabular-nums text-muted">{{ slide.start }}–{{ slide.end }}s</span>
          <UDropdownMenu :items="menu(index)">
            <UButton
              :aria-label="`Actions for ${slide.name}`"
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="xs"
            />
          </UDropdownMenu>
        </div>
      </div>
      <div v-if="index < slides.length - 1" class="flex justify-center py-1">
        <BannerSlideTransition :slide="slide" :index="index" />
      </div>
    </div>
    <UButton
      label="New slide"
      icon="i-lucide-plus"
      variant="outline"
      class="w-full justify-center"
      :disabled="slides.length >= 50"
      @click="() => { addSlide(Math.max(0, selectedIndex)) }"
    />
    <div v-if="currentSlide" class="@container space-y-3 border-t border-default pt-4">
      <h3 class="text-sm font-semibold">
        Slide settings
      </h3>
      <UFormField label="Name">
        <UInput
          v-model="name"
          class="w-full"
          :maxlength="100"
          @focus="pauseTimeline"
          @change="saveName"
        />
      </UFormField>
      <UFormField label="Duration (seconds)" help="Retimes this slide’s animations and moves later slides together.">
        <UInput
          v-model="duration"
          type="number"
          :min="0.1"
          :max="300"
          :step="0.1"
          class="w-full"
          @focus="pauseTimeline"
          @change="saveDuration"
        />
      </UFormField>
    </div>
    <UModal
      :open="pendingDelete !== null"
      :title="`Delete ${slides[pendingDelete ?? -1]?.name || 'slide'}?`"
      :description="`This removes the slide and its artwork from ${state.layoutView === 'all' ? 'all layouts' : 'this layout'}. You can undo this change.`"
      @update:open="!$event && (pendingDelete = null)"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="pendingDelete = null"
          />
          <UButton label="Delete slide" color="error" @click="() => { if (pendingDelete !== null && apply({ type: 'delete', index: pendingDelete }, Math.max(0, pendingDelete - 1))) pendingDelete = null }" />
        </div>
      </template>
    </UModal>
  </div>
</template>
