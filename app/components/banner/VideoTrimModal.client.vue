<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'
import { validVideoTrim, videoTrimRange } from '~/utils/banner-video-edit'
import { safeMediaUrl } from '~/utils/safe-url'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ layer: Layer }>()
const emit = defineEmits<{
  apply: [range: { mediaStart: number, mediaEnd: number }]
}>()
const video = ref<HTMLVideoElement>()
const duration = ref(0)
const range = ref<number[]>([0, 0])
const failed = ref(false)
const playing = ref(false)
const valid = computed(
  () =>
    !failed.value
    && validVideoTrim(range.value[0]!, range.value[1]!, duration.value)
)

watch(
  open,
  (value) => {
    video.value?.pause()
    playing.value = false
    if (value) {
      duration.value = 0
      range.value = [0, 0]
      failed.value = false
    }
  },
  { immediate: true }
)
function loaded(event: Event) {
  const media = event.target as HTMLVideoElement
  duration.value = media.duration
  range.value = videoTrimRange(props.layer, media.duration)
  if (!valid.value) failed.value = true
  else media.currentTime = range.value[0]!
}
function changeRange(value: number[]) {
  range.value = value
  video.value?.pause()
  playing.value = false
  if (video.value && valid.value) video.value.currentTime = value[0]!
}
async function preview() {
  if (!video.value || !valid.value) return
  if (playing.value) {
    video.value.pause()
    playing.value = false
    return
  }
  video.value.currentTime = range.value[0]!
  try {
    await video.value.play()
    playing.value = true
  } catch {
    playing.value = false
  }
}
function timeChanged() {
  if (
    video.value
    && playing.value
    && video.value.currentTime >= range.value[1]!
  ) {
    video.value.pause()
    video.value.currentTime = range.value[1]!
    playing.value = false
  }
}
function apply() {
  if (!valid.value) return
  video.value?.pause()
  emit('apply', { mediaStart: range.value[0]!, mediaEnd: range.value[1]! })
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Trim video"
    description="Choose the part of the source video to play in this layout. The layer’s position, animation and timeline duration stay in place."
    :ui="{ content: 'sm:max-w-2xl', body: 'max-h-[75vh] overflow-y-auto' }"
  >
    <template #body>
      <div class="@container space-y-4">
        <video
          v-if="open"
          ref="video"
          :src="safeMediaUrl(layer.src)"
          muted
          playsinline
          preload="auto"
          class="aspect-video max-h-72 w-full rounded-md bg-black object-contain"
          @loadedmetadata="loaded"
          @timeupdate="timeChanged"
          @ended="playing = false"
          @error="failed = true"
        />
        <UAlert
          v-if="failed"
          color="error"
          title="Could not load this video"
          description="Close trim and try again, or replace the video."
        />
        <template v-else-if="duration > 0">
          <div class="h-12">
            <BannerVideoFilmstrip
              :src="layer.src!"
              :clock="{}"
              :span="duration"
            />
          </div>
          <UFormField
            label="Selected clip"
            :help="
              valid
                ? `${(range[1]! - range[0]!).toFixed(2)} seconds selected from ${duration.toFixed(2)} seconds`
                : 'End must be after start and within the source video.'
            "
            :error="!valid"
          >
            <USlider
              :model-value="valid ? range : [0, duration]"
              :min="0"
              :max="duration"
              :step="0.01"
              :min-steps-between-thumbs="1"
              class="w-full"
              tooltip
              @update:model-value="changeRange"
            />
          </UFormField>
          <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="Start (seconds)">
              <UInput
                type="number"
                :model-value="range[0]"
                :min="0"
                :max="duration"
                :step="0.01"
                class="w-full"
                @update:model-value="
                  (value) =>
                    changeRange([value === '' ? NaN : Number(value), range[1]!])
                "
              />
            </UFormField>
            <UFormField label="End (seconds)">
              <UInput
                type="number"
                :model-value="range[1]"
                :min="0"
                :max="duration"
                :step="0.01"
                class="w-full"
                @update:model-value="
                  (value) =>
                    changeRange([range[0]!, value === '' ? NaN : Number(value)])
                "
              />
            </UFormField>
          </div>
          <div class="flex items-center justify-between gap-3">
            <UButton
              :label="playing ? 'Pause preview' : 'Preview clip'"
              :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'"
              color="neutral"
              variant="outline"
              :disabled="!valid"
              @click="preview"
            />
            <UButton
              label="Use full video"
              color="neutral"
              variant="ghost"
              @click="changeRange([0, duration])"
            />
          </div>
          <p class="text-xs text-muted">
            {{
              layer.mediaLoop
                ? "The selected clip repeats while the layer is on screen."
                : "If the layer lasts longer than this clip, the last frame is held."
            }}
          </p>
        </template>
        <p v-else role="status" class="text-sm text-muted">
          Loading video…
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          @click="open = false"
        />
        <UButton label="Apply trim" :disabled="!valid" @click="apply" />
      </div>
    </template>
  </UModal>
</template>
