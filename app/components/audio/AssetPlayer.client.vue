<script setup lang="ts">
import { audioProgressPercent, audioTimeFromProgress, formatAudioTime, mediaElementDuration, resolveAudioDuration } from '~/utils/audio/playback'

const props = defineProps<{
  src: string
  durationSec?: number | null
  title?: string | null
}>()

const audioEl = ref<HTMLAudioElement | null>(null)
const currentTime = ref(0)
const nativeDuration = ref(0)
const playing = ref(false)
const loading = ref(false)
const errored = ref(false)

let rafId = 0

const duration = computed(() => resolveAudioDuration(nativeDuration.value, props.durationSec ?? null))
const progress = computed(() => audioProgressPercent(currentTime.value, duration.value))
const currentLabel = computed(() => formatAudioTime(currentTime.value))
const durationLabel = computed(() => formatAudioTime(duration.value))
const playLabel = computed(() => playing.value ? 'Pause' : 'Play')

function stopClock() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

function syncFromAudio() {
  const el = audioEl.value
  if (!el) return
  currentTime.value = Number.isFinite(el.currentTime) ? el.currentTime : 0
  nativeDuration.value = mediaElementDuration(el, null)
}

function startClock() {
  stopClock()
  const tick = () => {
    syncFromAudio()
    if (playing.value) rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

async function togglePlayback() {
  const el = audioEl.value
  if (!el) return

  errored.value = false
  if (playing.value) {
    el.pause()
    return
  }

  loading.value = true
  try {
    await el.play()
    playing.value = true
    startClock()
  } catch {
    errored.value = true
  } finally {
    loading.value = false
  }
}

function seekToProgress(value: number | number[] | undefined) {
  const el = audioEl.value
  const first = Array.isArray(value) ? value[0] : value
  const next = audioTimeFromProgress(first ?? 0, duration.value)
  currentTime.value = next
  if (el && duration.value > 0) el.currentTime = next
}

function onLoaded() {
  errored.value = false
  syncFromAudio()
}

function onPlaying() {
  loading.value = false
  playing.value = true
  startClock()
}

function onPaused() {
  playing.value = false
  stopClock()
  syncFromAudio()
}

function onEnded() {
  playing.value = false
  stopClock()
  syncFromAudio()
}

function onError() {
  loading.value = false
  playing.value = false
  errored.value = true
  stopClock()
}

watch(() => props.src, () => {
  const el = audioEl.value
  stopClock()
  currentTime.value = 0
  nativeDuration.value = 0
  playing.value = false
  errored.value = false
  if (el) el.load()
})

onBeforeUnmount(() => {
  stopClock()
  audioEl.value?.pause()
})
</script>

<template>
  <div class="flex h-10 w-full items-center gap-2 rounded-md bg-elevated px-2 sm:w-72">
    <audio
      ref="audioEl"
      :src="src"
      preload="metadata"
      class="sr-only"
      @loadedmetadata="onLoaded"
      @durationchange="onLoaded"
      @timeupdate="syncFromAudio"
      @playing="onPlaying"
      @pause="onPaused"
      @ended="onEnded"
      @error="onError"
    />

    <UTooltip :text="playLabel">
      <UButton
        :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'"
        :loading="loading"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="`${playLabel}${title ? ` ${title}` : ''}`"
        @click="togglePlayback"
      />
    </UTooltip>

    <span class="w-10 text-xs tabular-nums text-highlighted">{{ currentLabel }}</span>
    <USlider
      :model-value="progress"
      :min="0"
      :max="100"
      :step="0.1"
      :disabled="duration <= 0 || errored"
      size="xs"
      class="min-w-24 flex-1"
      :aria-label="title ? `Playback position for ${title}` : 'Playback position'"
      @update:model-value="seekToProgress"
    />
    <span class="w-10 text-right text-xs tabular-nums text-highlighted">{{ durationLabel }}</span>

    <UTooltip v-if="errored" text="Playback error">
      <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0 text-error" />
    </UTooltip>
  </div>
</template>
