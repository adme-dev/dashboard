<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'
import { validVideoTrim, videoTrimRange } from '~/utils/banner-video-edit'
import { safeMediaUrl } from '~/utils/safe-url'
import { bannerAudioState } from '~~/shared/bannerAudioClock'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ layer: Layer }>()
const emit = defineEmits<{ apply: [value: { mediaStart: number, mediaEnd: number }] }>()
const audio = ref<HTMLAudioElement>()
const duration = ref(0)
const range = ref<number[]>([0, 0])
const failed = ref(false)
const playing = ref(false)
const valid = computed(() => !failed.value && validVideoTrim(range.value[0]!, range.value[1]!, duration.value))
let frame: number | undefined
let generation = 0
function stop() {
  generation++
  audio.value?.pause()
  playing.value = false
  if (frame !== undefined) cancelAnimationFrame(frame)
  frame = undefined
}
watch(() => [open.value, props.layer.id, props.layer.src], () => {
  stop()
  duration.value = 0
  range.value = [0, 0]
  failed.value = false
}, { immediate: true })
onBeforeUnmount(stop)
function loaded(event: Event) {
  const media = event.target as HTMLAudioElement
  duration.value = media.duration
  range.value = videoTrimRange(props.layer, media.duration)
  if (valid.value) media.currentTime = range.value[0]!
  else failed.value = true
}
function change(value: number[] | number | undefined) {
  if (!Array.isArray(value)) return
  stop()
  range.value = value
  if (audio.value && valid.value) audio.value.currentTime = value[0]!
}
function tick() {
  if (!audio.value || !playing.value) return
  const elapsed = audio.value.currentTime - range.value[0]!
  const sample = bannerAudioState(elapsed, range.value[1]! - range.value[0]!, { ...props.layer, mediaStart: range.value[0], mediaEnd: range.value[1], loopAudio: false }, duration.value)
  audio.value.volume = sample.volume
  if (!sample.active) {
    stop()
    if (audio.value) audio.value.currentTime = range.value[1]!
  } else frame = requestAnimationFrame(tick)
}
async function preview() {
  if (!audio.value || !valid.value) return
  if (playing.value) return stop()
  const media = audio.value
  media.currentTime = range.value[0]!
  media.volume = bannerAudioState(0, range.value[1]! - range.value[0]!, props.layer, duration.value).volume
  const current = ++generation
  try {
    await media.play()
    if (!open.value || current !== generation) {
      media.pause()
      return
    }
    playing.value = true
    tick()
  } catch { playing.value = false }
}
function apply() {
  if (!valid.value) return
  stop()
  emit('apply', { mediaStart: range.value[0]!, mediaEnd: range.value[1]! })
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Trim audio"
    description="Drag the ends to choose a clip, or move the selection along the waveform. Preview it before applying."
    :ui="{ content: 'sm:max-w-4xl', body: 'max-h-[75vh] overflow-y-auto' }"
  >
    <template #body>
      <div class="@container space-y-5">
        <audio
          v-if="open"
          ref="audio"
          :src="safeMediaUrl(layer.src)"
          preload="auto"
          @loadedmetadata="loaded"
          @ended="stop"
          @error="failed = true; stop()"
        />
        <UAlert
          v-if="failed"
          color="error"
          title="Could not load this audio"
          description="Close trim and try again, or replace the audio."
        />
        <template v-else-if="duration > 0">
          <div class="flex flex-wrap items-center gap-3">
            <UButton
              :label="playing ? 'Pause preview' : 'Play selection'"
              :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'"
              color="neutral"
              variant="outline"
              :disabled="!valid"
              @click="preview"
            />
            <span class="text-sm tabular-nums text-muted">{{ valid ? (range[1]! - range[0]!).toFixed(2) : '0.00' }}s selected of {{ duration.toFixed(2) }}s</span>
          </div>
          <BannerAudioTrimRange
            :src="layer.src!"
            :duration="duration"
            :range="range"
            @update:range="change"
          />
          <UFormField label="Selected audio clip" :error="!valid ? 'End must be after start and within the source audio.' : undefined">
            <USlider
              :model-value="valid ? range : [0, duration]"
              :min="0"
              :max="duration"
              :step="0.01"
              :min-steps-between-thumbs="1"
              class="w-full"
              aria-label="Audio trim range"
              tooltip
              @update:model-value="change"
            />
          </UFormField>
          <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="Start (seconds)">
              <UInput
                :model-value="range[0]"
                type="number"
                :min="0"
                :max="duration"
                :step="0.01"
                class="w-full"
                @update:model-value="value => change([value === '' ? NaN : Number(value), range[1]!])"
              />
            </UFormField>
            <UFormField label="End (seconds)">
              <UInput
                :model-value="range[1]"
                type="number"
                :min="0"
                :max="duration"
                :step="0.01"
                class="w-full"
                @update:model-value="value => change([range[0]!, value === '' ? NaN : Number(value)])"
              />
            </UFormField>
          </div>
          <UButton
            label="Use full audio"
            color="neutral"
            variant="ghost"
            @click="change([0, duration])"
          />
          <p class="text-xs text-muted">
            The clip keeps its position on the banner timeline. {{ layer.loopAudio ? 'The selected audio repeats within that time.' : 'Playback stops when the selected audio ends.' }}
          </p>
        </template>
        <p v-else role="status" class="text-sm text-muted">
          Loading audio…
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />
        <UButton
          label="Apply trim"
          icon="i-lucide-scissors"
          :disabled="!valid"
          @click="apply"
        />
      </div>
    </template>
  </UModal>
</template>
