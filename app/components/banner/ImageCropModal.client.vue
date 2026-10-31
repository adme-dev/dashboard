<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'
import { bannerImageCropCss, type BannerImageCrop } from '~~/shared/bannerImageCrop'
import { coverImageCrop, moveImageCrop, resizeImageCrop, type CropCorner } from '~/utils/banner-crop'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ layer: Layer }>()
const emit = defineEmits<{ apply: [crop: BannerImageCrop] }>()
const stage = ref<HTMLElement>()
const dimensions = ref({ w: 0, h: 0 })
const crop = ref<BannerImageCrop>({ x: 0, y: 0, w: 1, h: 1 })
const loadError = ref(false)
const ready = computed(() => dimensions.value.w > 0 && dimensions.value.h > 0 && !loadError.value)
const corners: CropCorner[] = ['nw', 'ne', 'sw', 'se']
let gesture: { crop: BannerImageCrop, x: number, y: number, w: number, h: number, kind: 'move' | CropCorner, id: number } | null = null

watch(open, (value) => {
  gesture = null
  if (value) {
    dimensions.value = { w: 0, h: 0 }
    loadError.value = false
  }
}, { immediate: true })

function imageLoaded(event: Event) {
  const image = event.target as HTMLImageElement
  dimensions.value = { w: image.naturalWidth, h: image.naturalHeight }
  crop.value = props.layer.imageCrop && bannerImageCropCss(props.layer.imageCrop)
    ? { ...props.layer.imageCrop }
    : coverImageCrop(dimensions.value, props.layer)
}
function start(event: PointerEvent, kind: 'move' | CropCorner) {
  if (event.button !== 0 || !ready.value || !stage.value) return
  const rect = stage.value.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  event.preventDefault()
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  gesture = { crop: { ...crop.value }, x: event.clientX, y: event.clientY, w: rect.width, h: rect.height, kind, id: event.pointerId }
}
function move(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return
  const dx = (event.clientX - gesture.x) / gesture.w, dy = (event.clientY - gesture.y) / gesture.h
  crop.value = gesture.kind === 'move' ? moveImageCrop(gesture.crop, dx, dy) : resizeImageCrop(gesture.crop, gesture.kind, dx, dy)
}
function end(event: PointerEvent) {
  if (gesture?.id === event.pointerId) gesture = null
}
function cancel() {
  if (gesture) crop.value = gesture.crop
  gesture = null
}
function keyMove(event: KeyboardEvent, kind: 'move' | CropCorner) {
  const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const direction = directions[event.key]
  if (!direction || !ready.value) return
  event.preventDefault()
  const step = event.shiftKey ? 0.05 : 0.005
  crop.value = kind === 'move' ? moveImageCrop(crop.value, direction[0] * step, direction[1] * step) : resizeImageCrop(crop.value, kind, direction[0] * step, direction[1] * step)
}
function apply() {
  if (!ready.value) return
  emit('apply', { ...crop.value })
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Crop & fill"
    description="Drag the crop frame or resize it with a corner handle. Use arrow keys for fine adjustments; Shift moves further."
    :ui="{ content: 'sm:max-w-3xl', body: 'min-h-0 overflow-y-auto' }"
  >
    <template #body>
      <UAlert
        v-if="loadError"
        title="Could not load this image"
        description="Close crop and try again, or replace the image."
        color="error"
      />
      <div class="overflow-hidden rounded-lg bg-muted p-4">
        <div
          ref="stage"
          class="relative mx-auto max-w-full select-none touch-none"
          :style="{ width: ready ? `${Math.min(680, 420 * dimensions.w / dimensions.h)}px` : '100%', aspectRatio: ready ? `${dimensions.w}/${dimensions.h}` : '16/9' }"
          @pointermove="move"
          @pointerup="end"
          @pointercancel="cancel"
          @lostpointercapture="end"
        >
          <img
            v-if="open"
            :src="safeMediaUrl(layer.src)"
            :alt="layer.name"
            draggable="false"
            class="absolute inset-0 size-full object-contain pointer-events-none"
            @load="imageLoaded"
            @error="loadError = true"
          >
          <div v-if="ready" class="absolute border-2 border-primary" :style="{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%`, boxShadow: '0 0 0 9999px rgb(0 0 0 / 45%)' }">
            <UButton
              aria-label="Move crop frame"
              variant="ghost"
              color="neutral"
              class="absolute inset-0 size-full cursor-move rounded-none hover:bg-transparent focus-visible:ring-inset"
              @pointerdown="start($event, 'move')"
              @keydown="keyMove($event, 'move')"
            />
            <UButton
              v-for="corner in corners"
              :key="corner"
              :aria-label="`Resize crop ${corner}`"
              color="neutral"
              variant="solid"
              class="absolute size-3 min-w-0 p-0 rounded-full border border-primary"
              :class="[corner.includes('n') ? '-top-1.5' : '-bottom-1.5', corner.includes('w') ? '-left-1.5' : '-right-1.5', corner === 'nw' || corner === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize']"
              @pointerdown.stop="start($event, corner)"
              @keydown="keyMove($event, corner)"
            />
          </div>
        </div>
      </div>
      <p class="mt-3 text-xs text-muted">
        Crop applies to this layout. The image frame and its animation stay in place.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full items-center gap-2">
        <UButton
          label="Reset crop"
          color="neutral"
          variant="ghost"
          :disabled="!ready"
          @click="() => { crop = coverImageCrop(dimensions, layer) }"
        />
        <div class="flex-1" />
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          @click="() => { open = false }"
        />
        <UButton label="Apply crop" :disabled="!ready" @click="apply" />
      </div>
    </template>
  </UModal>
</template>
