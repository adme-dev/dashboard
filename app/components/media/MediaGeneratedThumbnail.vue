<script setup lang="ts">
// MediaGeneratedThumbnail.vue — poster tile for a generated clip, taken from the
// actual output asset. Seeks past fade-in frames (see generatedThumbnail.ts),
// and when the browser cannot decode the clip it says so instead of showing an
// empty black square.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useElementVisibility } from '@vueuse/core'
import { safeMediaUrl } from '~/utils/safe-url'
import { averageLuma, isDarkFrame, pickThumbnailFrame, thumbnailCandidateTimes, type ThumbnailFrameSample } from '~~/app/utils/video/generatedThumbnail'

const props = withDefaults(defineProps<{
  assetId?: string
  sourceUrl?: string
  lazy?: boolean
  durationSec?: number | null
  alt?: string
  /** ms before an unresponsive decode is reported as unavailable */
  timeoutMs?: number
}>(), {
  durationSec: null,
  alt: 'Generated clip preview',
  timeoutMs: 15000
})

type State = 'loading' | 'ready' | 'dark' | 'unavailable'
const state = ref<State>('loading')
const root = ref<HTMLElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const poster = ref<string>()
const hasBeenVisible = ref(false)
const isVisible = useElementVisibility(root)
const shouldLoad = computed(() => !props.lazy || hasBeenVisible.value)
const src = computed(() => props.sourceUrl
  ? safeMediaUrl(props.sourceUrl)
  : props.assetId ? `/api/agency/video/assets/${encodeURIComponent(props.assetId)}/stream` : undefined)
watch(isVisible, (visible) => {
  if (visible) hasBeenVisible.value = true
})
let run = 0
let timer: ReturnType<typeof setTimeout> | null = null
let decode: AbortController | undefined

function clearTimer() {
  if (timer) clearTimeout(timer)
  timer = null
}

function once(video: HTMLVideoElement, event: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup()
      resolve()
    }
    const failed = () => {
      cleanup()
      reject(new Error('decode failed'))
    }
    const cleanup = () => {
      video.removeEventListener(event, done)
      video.removeEventListener('error', failed)
      signal.removeEventListener('abort', failed)
    }
    video.addEventListener(event, done, { once: true })
    video.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', failed, { once: true })
  })
}

async function seek(video: HTMLVideoElement, timeSec: number, signal: AbortSignal) {
  if (Math.abs(video.currentTime - timeSec) < 0.01 && video.readyState >= 2) return
  const seeked = once(video, 'seeked', signal)
  video.currentTime = timeSec
  await seeked
}

/** null when the canvas is tainted (cross-origin storage) or unavailable. */
function readLuma(video: HTMLVideoElement): number | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 18
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return averageLuma(ctx.getImageData(0, 0, canvas.width, canvas.height).data, 1)
  } catch {
    return null
  }
}

function posterImage(video: HTMLVideoElement): string | undefined {
  if (!video.videoWidth || !video.videoHeight) return
  try {
    const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    // A paused frame still shows when the remote video disallows canvas reads.
  }
}

async function choosePoster(video: HTMLVideoElement, token: number, signal: AbortSignal) {
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : props.durationSec
  const candidates = thumbnailCandidateTimes(duration)
  const samples: ThumbnailFrameSample[] = []
  for (const timeSec of candidates) {
    await seek(video, timeSec, signal)
    if (token !== run) return
    const luma = readLuma(video)
    samples.push({ timeSec, luma })
    // Unreadable pixels won't become readable at another timestamp; bright is good enough.
    if (luma === null || !isDarkFrame(luma)) break
  }
  const choice = pickThumbnailFrame(samples)
  if (!choice) throw new Error('no frame')
  await seek(video, choice.timeSec, signal)
  if (token !== run) return
  clearTimer()
  if (props.sourceUrl) {
    poster.value = posterImage(video)
    if (poster.value) {
      video.removeAttribute('src')
      video.load()
    }
  }
  state.value = choice.dark ? 'dark' : 'ready'
}

function fail(token: number) {
  if (token !== run) return
  clearTimer()
  decode?.abort()
  state.value = 'unavailable'
}

function start() {
  const video = videoRef.value
  if (!video) return
  const token = ++run
  decode?.abort()
  const controller = new AbortController()
  decode = controller
  state.value = 'loading'
  clearTimer()
  timer = setTimeout(() => fail(token), props.timeoutMs)
  const metadata = video.readyState >= 1 ? Promise.resolve() : once(video, 'loadedmetadata', controller.signal)
  metadata
    .then(() => { if (token === run && !controller.signal.aborted) return choosePoster(video, token, controller.signal) })
    .catch(() => fail(token))
}

onMounted(start)
watch([src, shouldLoad], () => {
  run++
  clearTimer()
  decode?.abort()
  poster.value = undefined
  state.value = 'loading'
  void nextTick(start)
})
onBeforeUnmount(() => {
  run++
  clearTimer()
  decode?.abort()
})
</script>

<template>
  <div
    ref="root"
    class="relative flex size-full items-center justify-center overflow-hidden bg-elevated"
    :data-thumbnail-state="state"
    role="img"
    :aria-label="state === 'unavailable' ? `${props.alt} unavailable` : props.alt"
  >
    <img
      v-if="poster"
      :src="poster"
      alt=""
      draggable="false"
      class="size-full object-contain"
    >
    <video
      v-else-if="shouldLoad && src && state !== 'unavailable'"
      :key="src"
      ref="videoRef"
      :src="src"
      muted
      playsinline
      preload="metadata"
      aria-hidden="true"
      tabindex="-1"
      class="size-full transition-opacity"
      :class="[sourceUrl ? 'object-contain' : 'object-cover', state === 'ready' || state === 'dark' ? 'opacity-100' : 'opacity-0']"
      @error="fail(run)"
    />
    <USkeleton v-if="shouldLoad && state === 'loading'" class="absolute inset-0 rounded-none" />
    <div
      v-else-if="state === 'unavailable'"
      class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-1 text-center"
      title="This browser could not decode a frame from the clip. The clip itself can still be added and played."
    >
      <UIcon name="i-lucide-film" class="size-4 text-muted" />
      <span class="text-[9px] leading-tight text-muted">No preview</span>
    </div>
    <span
      v-else-if="state === 'dark'"
      class="absolute inset-x-0 bottom-0 bg-default/80 py-px text-center text-[9px] leading-tight text-muted"
      title="Every sampled frame was very dark."
    >Dark clip</span>
  </div>
</template>
