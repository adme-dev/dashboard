<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useElementSize, useFullscreen } from '@vueuse/core'
import type { ArtboardState } from '~/types/banner-studio'
import { preferredBannerPreviewKey } from '~/utils/banner-library'
import { resolveBannerFormat } from '~/utils/banner-constants'
import MetaFeedPreview from '~/components/ad-preview/MetaFeedPreview.vue'
import MetaStoryPreview from '~/components/ad-preview/MetaStoryPreview.vue'

type VideoStatus = { formatKey: string, revision: string, status: string, url: string | null, canRetry: boolean }
const props = defineProps<{ shareToken: string, canvas: Record<string, ArtboardState>, clientName?: string | null, projectName?: string }>()
const selectedKey = ref(preferredBannerPreviewKey(props.canvas) || '')
const layouts = computed(() => Object.entries(props.canvas).flatMap(([key, board]) => {
  const format = resolveBannerFormat(key)
  return format ? [{ key, board, format }] : []
}))
const active = computed(() => layouts.value.find(layout => layout.key === selectedKey.value) || layouts.value[0])
const result = ref<VideoStatus | null>(null)
const error = ref('')
const preparing = ref(false)
const playbackVersion = ref(0)
const mode = ref<'artwork' | 'social'>('artwork')
const zoom = ref<number | null>(null)
const viewport = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)
const video = ref<HTMLVideoElement | null>(null)
const { width, height } = useElementSize(viewport)
const { toggle: toggleFullscreen, isSupported: supportsFullscreen } = useFullscreen(root)
const story = computed(() => (active.value?.format.h || 0) > (active.value?.format.w || 0))
const displayWidth = computed(() => {
  const format = active.value?.format
  if (!format) return 1
  if (mode.value === 'social') return story.value ? 280 : 380
  const fit = Math.min(Math.max(1, width.value - 32) / format.w, Math.max(1, height.value - 32) / format.h, 1)
  return format.w * (zoom.value ?? fit)
})
const creativeSlot = computed(() => mode.value === 'social' ? 'creative' : 'default')
const presentation = computed(() => mode.value === 'social' ? story.value ? MetaStoryPreview : MetaFeedPreview : 'div')
const pageName = computed(() => props.clientName || props.projectName || 'Shared banner')
const endpoint = computed(() => `/api/public/banner-share/${encodeURIComponent(props.shareToken)}/videos`)
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined
let abort: AbortController | undefined
let iteration = 1

function cancel() {
  generation++
  clearTimeout(timer)
  abort?.abort()
}
async function load(retry = false) {
  cancel()
  const request = generation
  const key = active.value?.key
  if (!key) {
    error.value = 'No saved artwork sizes are available.'
    return
  }
  abort = new AbortController()
  const signal = abort.signal
  error.value = ''
  preparing.value = true
  const current = () => request === generation
  try {
    if (retry) await $fetch(endpoint.value, { method: 'POST', body: { formatKey: key, retry: true }, signal })
    const response = await $fetch<{ videos: VideoStatus[] }>(endpoint.value, { signal })
    if (!current()) return
    result.value = response.videos.find(item => item.formatKey === key) || null
    if (!result.value) throw new Error('Artwork size unavailable')
    if (result.value.status === 'missing') {
      await $fetch(endpoint.value, { method: 'POST', body: { formatKey: key }, signal })
      if (!current()) return
      result.value = { ...result.value, status: 'queued' }
    }
    if (['queued', 'rendering'].includes(result.value.status)) timer = setTimeout(() => load(), 3000)
  } catch (cause) {
    const failure = cause as { data?: { statusMessage?: string }, statusCode?: number, status?: number }
    if (!current()) return
    if ([404, 410].includes(failure?.statusCode || failure?.status)) {
      video.value?.pause()
      result.value = null
    }
    error.value = failure?.data?.statusMessage || 'The preview could not be loaded. Please try again.'
  } finally {
    if (current()) preparing.value = false
  }
}
watch(() => [props.shareToken, active.value?.key], () => {
  video.value?.pause()
  result.value = null
  iteration = 1
  zoom.value = null
  void load()
}, { immediate: true })
onBeforeUnmount(cancel)
function reloadPreview() {
  playbackVersion.value++
  void load()
}
async function fullScreen() {
  const media = video.value as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
  if (!supportsFullscreen.value && media?.webkitEnterFullscreen) {
    media.webkitEnterFullscreen()
    return
  }
  try {
    await toggleFullscreen()
  } catch {
    error.value = 'Use the full-screen control on the video to expand playback.'
  }
}
function ended() {
  const loops = active.value?.board.playback?.loopCount ?? 1
  if (++iteration <= loops && video.value) {
    video.value.currentTime = 0
    void video.value.play().catch(() => {
      error.value = 'Tap Play to continue playback.'
    })
  }
}
function replay() {
  if (!video.value) return
  iteration = 1
  video.value.currentTime = 0
  void video.value.play().catch(() => {
    error.value = 'Tap Play on the video to begin.'
  })
}
function mediaError() {
  error.value = 'Video playback could not start. Reload the preview and tap Play again.'
}
</script>

<template>
  <section ref="root" class="flex min-h-0 flex-1 flex-col overflow-hidden bg-default" aria-label="Banner preview">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-default p-3">
      <div class="flex max-w-full gap-2 overflow-x-auto" aria-label="Preview size">
        <UButton
          v-for="layout in layouts"
          :key="layout.key"
          color="neutral"
          :variant="active?.key === layout.key ? 'solid' : 'ghost'"
          :aria-pressed="active?.key === layout.key"
          @click="selectedKey = layout.key"
        >
          {{ layout.format.w }} × {{ layout.format.h }}
        </UButton>
      </div>
      <div class="flex gap-2" aria-label="Preview presentation">
        <UButton
          color="neutral"
          :variant="mode === 'artwork' ? 'soft' : 'ghost'"
          :aria-pressed="mode === 'artwork'"
          @click="mode = 'artwork'"
        >
          Artwork
        </UButton>
        <UButton
          color="neutral"
          :variant="mode === 'social' ? 'soft' : 'ghost'"
          :aria-pressed="mode === 'social'"
          @click="mode = 'social'"
        >
          Social placement
        </UButton>
      </div>
    </div>
    <div ref="viewport" class="min-h-0 flex-1 overflow-auto p-4">
      <div v-if="result?.status === 'done' && result.url" class="flex min-h-full items-center justify-center" :style="{ minWidth: `${Math.max(displayWidth, width - 32)}px` }">
        <component
          :is="presentation"
          :style="{ width: `${displayWidth}px`, flexShrink: 0 }"
          :page-name="pageName"
          :show-placeholders="false"
          :show-default-cta="false"
          :show-label="false"
          :creative-aspect-ratio="active ? active.format.w / active.format.h : 1"
        >
          <template #[creativeSlot]>
            <video
              ref="video"
              :key="`${result.url}:${playbackVersion}`"
              :src="result.url"
              class="block h-full w-full bg-black object-contain"
              :style="{ aspectRatio: active ? `${active.format.w} / ${active.format.h}` : '1' }"
              controls
              playsinline
              preload="metadata"
              :loop="active?.board.playback?.loopCount === 0"
              :aria-label="projectName || 'Banner video preview'"
              @ended="ended"
              @error="mediaError"
            />
          </template>
        </component>
      </div>
      <div
        v-else
        class="flex min-h-full flex-col items-center justify-center gap-4 text-center"
        role="status"
        aria-live="polite"
      >
        <template v-if="result?.status === 'unsupported'">
          <UIcon name="i-lucide-info" class="size-8 text-muted" />
          <p>This size needs a separate preview export. Contact the team for a video.</p>
        </template>
        <template v-else-if="result?.status === 'failed'">
          <p>The video could not be prepared.</p>
        </template>
        <template v-else-if="!error">
          <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-muted" />
          <p class="font-medium">
            Preparing your video preview
          </p>
          <p class="max-w-sm text-sm text-muted">
            The animation and sound are being combined. This page will update when it is ready.
          </p>
        </template>
        <UButton
          v-if="result?.canRetry"
          color="neutral"
          :loading="preparing"
          @click="load(true)"
        >
          Retry preparation
        </UButton>
      </div>
    </div>
    <UAlert
      v-if="error"
      class="mx-4 mb-3 shrink-0"
      color="warning"
      title="Preview unavailable"
      :description="error"
      :actions="[{ label: 'Reload preview', color: 'neutral', onClick: reloadPreview }]"
    />
    <div v-if="result?.status === 'done'" class="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-default p-3">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-rotate-ccw"
        @click="replay"
      >
        Replay
      </UButton>
      <template v-if="mode === 'artwork'">
        <UButton color="neutral" :variant="zoom === null ? 'soft' : 'ghost'" @click="zoom = null">
          Fit
        </UButton>
        <UButton color="neutral" :variant="zoom === 1 ? 'soft' : 'ghost'" @click="zoom = 1">
          100%
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-minus"
          aria-label="Zoom out"
          @click="zoom = Math.max(0.1, (zoom ?? displayWidth / (active?.format.w || 1)) - 0.1)"
        />
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-plus"
          aria-label="Zoom in"
          @click="zoom = Math.min(3, (zoom ?? displayWidth / (active?.format.w || 1)) + 0.1)"
        />
      </template>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-maximize"
        @click="fullScreen"
      >
        Full screen
      </UButton>
    </div>
    <p v-if="mode === 'social'" class="px-4 pb-2 text-center text-xs text-muted">
      Placement mockup. Platform controls are illustrative.
    </p>
  </section>
</template>
