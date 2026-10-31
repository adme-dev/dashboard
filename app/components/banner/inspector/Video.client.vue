<script setup lang="ts">
import type { BannerAsset, Layer } from '~/types/banner-studio'
import { validVideoTrim, videoTrimRange } from '~/utils/banner-video-edit'
import { safeMediaUrl } from '~/utils/safe-url'

const { state, selectedLayer, updateLayer, activeFormat } = useBannerStudio()
const { pauseTimeline } = useBannerTimeline()
const realtime = useBannerRealtime()
const toast = useToast()
const replaceOpen = ref(false)
const trimOpen = ref(false)
const duration = ref(0)
const loadError = ref(false)
const preview = ref<HTMLVideoElement>()
const disabled = computed(
  () =>
    !selectedLayer.value
    || selectedLayer.value.locked
    || realtime.isLayerLockedByOther(selectedLayer.value.id)
)
const replaceDisabled = computed(() => disabled.value || (state.layoutView === 'all' && !!selectedLayer.value?.linkId
  && Object.values(state.sets).some(board => board.layers.some(layer => layer.type === 'video'
    && layer.linkId === selectedLayer.value?.linkId
    && (layer.locked || realtime.isLayerLockedByOther(layer.id))))))
const identity = computed(() =>
  JSON.stringify([
    state.project?.id,
    state.activeKey,
    selectedLayer.value?.id,
    selectedLayer.value?.src,
    selectedLayer.value?.mediaStart,
    selectedLayer.value?.mediaEnd,
    selectedLayer.value?.mediaLoop,
    state.layoutView
  ])
)
const range = computed(() =>
  videoTrimRange(selectedLayer.value || {}, duration.value)
)
let editingIdentity = ''
watch(identity, () => {
  replaceOpen.value = false
  trimOpen.value = false
})
watch(
  () => selectedLayer.value?.src,
  () => {
    duration.value = 0
    loadError.value = false
  }
)
watch(range, (value) => {
  if (preview.value && duration.value > 0) preview.value.currentTime = value[0]
})

function loaded(event: Event) {
  const video = event.target as HTMLVideoElement
  duration.value = video.duration
  if (Number.isFinite(video.duration)) video.currentTime = range.value[0]
}
function begin(kind: 'replace' | 'trim') {
  if (disabled.value || (kind === 'replace' && replaceDisabled.value)) return
  pauseTimeline()
  editingIdentity = identity.value
  if (kind === 'replace') replaceOpen.value = true
  else trimOpen.value = true
}
function current() {
  if (!disabled.value && editingIdentity === identity.value) return true
  toast.add({
    title: 'Video changed',
    description: 'Select the video and try again.',
    color: 'warning'
  })
  return false
}
function replace(asset: BannerAsset) {
  if (
    !current()
    || replaceDisabled.value
    || !asset.mimeType.startsWith('video/')
    || !safeMediaUrl(asset.url)
  )
    return
  updateLayer(selectedLayer.value!.id, {
    src: asset.url,
    mediaStart: 0,
    mediaEnd: undefined
  })
  replaceOpen.value = false
  toast.add({
    title: 'Video replaced',
    description: asset.name,
    color: 'success'
  })
}
function applyTrim(value: { mediaStart: number, mediaEnd: number }) {
  if (
    current()
    && validVideoTrim(value.mediaStart, value.mediaEnd, duration.value)
  )
    updateLayer(selectedLayer.value!.id, value)
}
function set(value: Partial<Layer>) {
  if (!disabled.value) updateLayer(selectedLayer.value!.id, value)
}
function fillCanvas() {
  if (!disabled.value && activeFormat.value)
    set({
      x: 0,
      y: 0,
      w: activeFormat.value.w,
      h: activeFormat.value.h,
      zIndex: 1,
      fit: 'cover'
    })
}
</script>

<template>
  <section v-if="selectedLayer" aria-label="Video properties" class="space-y-3">
    <h3 class="text-xs font-semibold">
      Video
    </h3>
    <div
      class="relative h-28 overflow-hidden rounded-md border border-default bg-elevated"
    >
      <video
        v-if="selectedLayer.src"
        :key="selectedLayer.src"
        ref="preview"
        :src="safeMediaUrl(selectedLayer.src)"
        muted
        playsinline
        preload="auto"
        class="size-full object-contain"
        @loadedmetadata="loaded"
        @error="loadError = true"
      />
    </div>
    <p v-if="loadError" class="text-xs text-error">
      Preview unavailable. Replace the video or try again.
    </p>
    <p
      v-else-if="Number.isFinite(duration) && duration > 0"
      class="text-xs tabular-nums text-muted"
    >
      {{ range[0].toFixed(2) }}–{{ range[1].toFixed(2) }}s of
      {{ duration.toFixed(2) }}s
    </p>
    <UButton
      label="Replace video"
      icon="i-lucide-video"
      variant="outline"
      color="neutral"
      size="sm"
      class="w-full justify-center"
      :disabled="replaceDisabled"
      @click="begin('replace')"
    />
    <UButton
      label="Trim video"
      icon="i-lucide-scissors"
      variant="soft"
      color="neutral"
      size="sm"
      class="w-full justify-center"
      :disabled="
        disabled
          || !selectedLayer.src
          || loadError
          || !Number.isFinite(duration)
          || duration <= 0
      "
      @click="begin('trim')"
    />
    <UFormField
      label="Clip playback"
      help="Video plays silently with the banner timeline. Trim and loop settings apply to this layout."
    >
      <UCheckbox
        label="Loop selected clip"
        :model-value="selectedLayer.mediaLoop ?? false"
        :disabled="disabled"
        @update:model-value="(value) => set({ mediaLoop: value === true })"
      />
    </UFormField>
    <UFormField label="Video fit">
      <USelect
        :model-value="selectedLayer.fit ?? 'cover'"
        :items="[
          { label: 'Fill frame', value: 'cover' },
          { label: 'Show full video', value: 'contain' },
          { label: 'Stretch', value: 'fill' }
        ]"
        class="w-full"
        size="sm"
        :disabled="disabled"
        @update:model-value="(value) => set({ fit: value })"
      />
    </UFormField>
    <UFormField label="Corner radius">
      <UInput
        type="number"
        :min="0"
        :model-value="selectedLayer.borderRadius ?? 0"
        class="w-full"
        size="sm"
        :disabled="disabled"
        @update:model-value="
          (value) => set({ borderRadius: Math.max(0, Number(value) || 0) })
        "
      />
    </UFormField>
    <UButton
      label="Fill canvas"
      icon="i-lucide-maximize"
      variant="ghost"
      color="neutral"
      size="sm"
      class="w-full justify-center"
      :disabled="disabled"
      @click="fillCanvas"
    />
    <UModal
      v-model:open="replaceOpen"
      title="Replace video"
      description="Choose a video or upload one. Replacement follows All layouts or Single edit, keeps the layer’s position and animation, and resets its trim."
      :ui="{ content: 'sm:max-w-2xl', body: 'max-h-[70vh] overflow-y-auto' }"
    >
      <template #body>
        <BannerAssetsPanel
          media-type="video"
          selection-only
          @select="replace"
        />
      </template>
    </UModal>
    <BannerVideoTrimModal
      v-model:open="trimOpen"
      :layer="selectedLayer"
      @apply="applyTrim"
    />
  </section>
</template>
