<script setup lang="ts">
import type { BannerAsset, Layer } from '~/types/banner-studio'
import { validVideoTrim, videoTrimRange } from '~/utils/banner-video-edit'
import { safeMediaUrl } from '~/utils/safe-url'

const { state, selectedLayer, updateLayer } = useBannerStudio()
const { pauseTimeline } = useBannerTimeline()
const realtime = useBannerRealtime()
const toast = useToast()
const trimOpen = ref(false)
const replaceOpen = ref(false)
const duration = ref(0)
const failed = ref(false)
const disabled = computed(() => !selectedLayer.value || selectedLayer.value.locked || realtime.isLayerLockedByOther(selectedLayer.value.id))
const sharedDisabled = computed(() => disabled.value || (state.layoutView === 'all' && !!selectedLayer.value?.linkId
  && Object.values(state.sets).some(board => board.layers.some(layer => layer.type === 'audio'
    && layer.linkId === selectedLayer.value?.linkId && (layer.locked || realtime.isLayerLockedByOther(layer.id))))))
const range = computed(() => videoTrimRange(selectedLayer.value || {}, duration.value))
const volume = computed(() => Math.round((selectedLayer.value?.volume ?? 1) * 100))
const identity = computed(() => JSON.stringify([state.project?.id, state.activeKey, selectedLayer.value?.id, selectedLayer.value?.src, state.layoutView]))
let editingIdentity = ''
watch(identity, () => {
  trimOpen.value = false
  replaceOpen.value = false
  duration.value = 0
  failed.value = false
})
function set(value: Partial<Layer>, shared = true) {
  if (!(shared ? sharedDisabled.value : disabled.value) && selectedLayer.value) updateLayer(selectedLayer.value.id, value)
}
function setVolume(value: number | number[] | string | undefined) {
  const next = Array.isArray(value) ? value[0] : value
  if (next === '' || next === undefined || !Number.isFinite(Number(next))) return
  set({ volume: Math.max(0, Math.min(100, Number(next))) / 100 })
}
function loaded(event: Event) {
  const media = event.target as HTMLAudioElement
  duration.value = Number.isFinite(media.duration) ? media.duration : 0
}
function trim(start: number, end: number) {
  if (validVideoTrim(start, end, duration.value)) set({ mediaStart: start, mediaEnd: end }, false)
}
function begin(kind: 'trim' | 'replace') {
  if (disabled.value || (kind === 'replace' && sharedDisabled.value)) return
  pauseTimeline()
  editingIdentity = identity.value
  if (kind === 'trim') trimOpen.value = true
  else replaceOpen.value = true
}
function replace(asset: BannerAsset) {
  if (editingIdentity !== identity.value || sharedDisabled.value || !asset.mimeType.startsWith('audio/') || !safeMediaUrl(asset.url)) return
  set({ src: asset.url, mediaStart: 0, mediaEnd: undefined })
  replaceOpen.value = false
  toast.add({ title: 'Audio replaced', description: asset.name, color: 'success' })
}
</script>

<template>
  <section v-if="selectedLayer" aria-label="Audio properties" class="@container space-y-4">
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-music-2" class="size-4 text-primary" />
      <h3 class="min-w-0 truncate text-sm font-semibold">
        {{ selectedLayer.name }}
      </h3>
    </div>
    <audio
      v-if="selectedLayer.src"
      :key="identity"
      :src="safeMediaUrl(selectedLayer.src)"
      preload="metadata"
      @loadedmetadata="loaded"
      @error="failed = true"
    />
    <UFormField label="Volume" :help="selectedLayer.muted ? 'Muted. Unmute to hear this level.' : undefined">
      <div class="flex items-center gap-3">
        <USlider
          :model-value="volume"
          :min="0"
          :max="100"
          :step="1"
          :disabled="sharedDisabled"
          class="min-w-0 flex-1"
          aria-label="Audio volume"
          @update:model-value="setVolume"
        />
        <UInput
          :id="`audio-volume-${selectedLayer.id}`"
          :model-value="volume"
          type="number"
          :min="0"
          :max="100"
          :step="1"
          :disabled="sharedDisabled"
          aria-label="Volume (%)"
          class="w-20 shrink-0"
          @update:model-value="setVolume"
        >
          <template #trailing>
            <span class="text-xs text-muted">%</span>
          </template>
        </UInput>
      </div>
    </UFormField>
    <UCheckbox
      :model-value="selectedLayer.muted ?? false"
      label="Mute audio"
      :disabled="sharedDisabled"
      @update:model-value="set({ muted: $event === true })"
    />
    <UCheckbox
      :model-value="selectedLayer.loopAudio ?? false"
      label="Loop selected clip"
      :disabled="sharedDisabled"
      @update:model-value="set({ loopAudio: $event === true })"
    />
    <div class="space-y-3 border-y border-default py-4">
      <h4 class="text-xs font-semibold">
        Fades
      </h4>
      <template v-for="fade in ([{ key: 'audioFadeIn', label: 'Fade in' }, { key: 'audioFadeOut', label: 'Fade out' }] as const)" :key="fade.key">
        <UCheckbox
          :model-value="(selectedLayer[fade.key] ?? 0) > 0"
          :label="fade.label"
          :disabled="sharedDisabled"
          @update:model-value="set({ [fade.key]: $event === true ? 0.5 : 0 })"
        />
        <UFormField v-if="(selectedLayer[fade.key] ?? 0) > 0" :label="`${fade.label} duration (seconds)`">
          <UInput
            :model-value="selectedLayer[fade.key]"
            type="number"
            :min="0.01"
            :max="300"
            :step="0.1"
            :disabled="sharedDisabled"
            class="w-full"
            @update:model-value="value => { if (value !== '' && Number.isFinite(Number(value))) set({ [fade.key]: Math.max(0.01, Math.min(300, Number(value))) }) }"
          />
        </UFormField>
      </template>
    </div>
    <div class="space-y-3">
      <h4 class="text-xs font-semibold">
        Trim source audio
      </h4>
      <UAlert
        v-if="failed"
        color="warning"
        title="Audio preview unavailable"
        description="Replace the audio or try again."
      />
      <UButton
        label="Trim audio"
        icon="i-lucide-scissors"
        color="neutral"
        variant="soft"
        class="w-full justify-center"
        :disabled="disabled || failed || !duration"
        @click="begin('trim')"
      />
      <div v-if="duration > 0" class="grid grid-cols-1 gap-3 @lg:grid-cols-2">
        <UFormField label="Source start (seconds)">
          <UInput
            :model-value="range[0]"
            type="number"
            :min="0"
            :max="range[1] - 0.01"
            :step="0.01"
            :disabled="disabled"
            class="w-full"
            @update:model-value="value => { if (value !== '') trim(Number(value), range[1]) }"
          />
        </UFormField>
        <UFormField label="Source end (seconds)">
          <UInput
            :model-value="range[1]"
            type="number"
            :min="range[0] + 0.01"
            :max="duration"
            :step="0.01"
            :disabled="disabled"
            class="w-full"
            @update:model-value="value => { if (value !== '') trim(range[0], Number(value)) }"
          />
        </UFormField>
      </div>
      <p v-if="duration > 0" class="text-xs text-muted">
        {{ (range[1] - range[0]).toFixed(2) }}s selected from {{ duration.toFixed(2) }}s. Trim applies to this layout.
      </p>
    </div>
    <BannerInspectorPresence />
    <UButton
      label="Replace audio"
      icon="i-lucide-replace"
      color="neutral"
      variant="outline"
      class="w-full justify-center"
      :disabled="sharedDisabled"
      @click="begin('replace')"
    />
    <UModal
      v-model:open="replaceOpen"
      title="Replace audio"
      description="Choose audio from the library or upload a new file. Replacement follows your layout editing scope and resets the source trim."
      :ui="{ content: 'sm:max-w-2xl', body: 'max-h-[70vh] overflow-y-auto' }"
    >
      <template #body>
        <BannerAssetsPanel media-type="audio" selection-only @select="replace" />
      </template>
    </UModal>
    <BannerAudioTrimModal v-model:open="trimOpen" :layer="selectedLayer" @apply="value => { if (editingIdentity === identity) trim(value.mediaStart, value.mediaEnd) }" />
  </section>
</template>
