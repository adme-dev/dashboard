<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useElementSize, useFullscreen } from '@vueuse/core'
import type { ArtboardState } from '~/types/banner-studio'
import { buildBannerHTML, type ExportCustomFont } from '~/utils/banner-html-builder'
import { preferredBannerPreviewKey } from '~/utils/banner-library'
import { resolveBannerFormat } from '~/utils/banner-constants'
import { createBannerPreviewAudioController } from '~/utils/banner-preview-audio'
import { withBannerPreviewPlayback, readBannerPreviewPlayback, type BannerPreviewPlayback } from '~/utils/banner-preview-playback'

const props = defineProps<{
  canvas: Record<string, ArtboardState>
  fonts?: ExportCustomFont[]
  clientName?: string | null
  projectName?: string
}>()

const pageName = computed(() => props.clientName?.trim() || props.projectName?.trim() || 'Shared banner')

const root = ref<HTMLElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const surface = ref<HTMLElement | null>(null)
const viewportSize = useElementSize(viewport)
const surfaceSize = useElementSize(surface)
const { isFullscreen, isSupported: supportsFullscreen, toggle: toggleFullscreen } = useFullscreen(root)
const expanded = ref(false)
const fullScreenView = computed(() => isFullscreen.value || expanded.value)
async function toggleScreen() {
  if (expanded.value) {
    expanded.value = false
    return
  }
  if (supportsFullscreen.value) {
    try {
      await toggleFullscreen()
      return
    } catch { /* Browsers can deny native fullscreen; expand within the window instead. */ }
  }
  expanded.value = true
}
const selectedKey = ref('')
const muted = ref(false)
const audioError = ref('')
const audioRoot = ref<HTMLElement | null>(null)
const playback = ref<BannerPreviewPlayback>({ state: 'loading', current: 0, duration: 0, iteration: 1, repeat: 0 })
const playing = computed(() => playback.value.state === 'playing')
const canControl = computed(() => playback.value.duration > 0 && !['loading', 'unavailable'].includes(playback.value.state))
let commandSequence = 0
const playbackLabel = computed(() => ({ loading: 'Loading', playing: 'Playing', paused: playback.value.current > 0 ? 'Paused' : 'Ready', ended: 'Finished', static: 'Still artwork', unavailable: 'Playback unavailable' })[playback.value.state])
const playbackTime = computed(() => `${playback.value.current.toFixed(1)} / ${playback.value.duration.toFixed(1)} s`)
const playbackLoop = computed(() => playback.value.repeat === -1
  ? `Loop ${playback.value.iteration} · ∞`
  : playback.value.repeat > 0 ? `Loop ${playback.value.iteration} / ${playback.value.repeat + 1}` : '')
const audioLayers = computed(() => active.value?.board.layers.filter(layer => layer.type === 'audio' && layer.src && !layer.hidden && !layer.muted && (layer.volume ?? 1) > 0) || [])
const hostAudio = createBannerPreviewAudioController(
  () => audioLayers.value.flatMap((layer, index) => {
    const media = audioRoot.value?.querySelectorAll('audio')[index]
    return media ? [{ layer, media }] : []
  }),
  (message) => { audioError.value = message }
)
function receivePlaybackStatus(event: MessageEvent) {
  const frame = root.value?.querySelector('iframe')
  if (!frame || event.source !== frame.contentWindow) return
  const next = readBannerPreviewPlayback(event.data, previewDocument.value.frameId)
  if (next && (event.data.commandId ?? 0) === commandSequence) {
    playback.value = next
    if (next.state === 'playing') hostAudio.sync(next.current, next.iteration)
    if (next.state !== 'playing') hostAudio.pause()
  }
}
function toggleSound() {
  muted.value = !muted.value
  audioError.value = ''
  hostAudio.setMuted(muted.value)
}
function audioMetadata(event: Event) {
  if (event.target instanceof HTMLAudioElement) hostAudio.loaded(event.target)
}
onMounted(() => window.addEventListener('message', receivePlaybackStatus))
onBeforeUnmount(() => {
  window.removeEventListener('message', receivePlaybackStatus)
  hostAudio.pause()
})
const mode = ref<'artwork' | 'social'>('artwork')
const zoom = ref<number | null>(null)
const layouts = computed(() => Object.entries(props.canvas).flatMap(([key, board]) => {
  const format = resolveBannerFormat(key)
  return format && Array.isArray(board?.layers) ? [{ key, board, format }] : []
}))
function formatLabel(format: { w: number, h: number }) {
  return format.w === format.h ? 'Square' : format.h > format.w ? 'Portrait' : 'Landscape'
}
function formatIcon(format: { w: number, h: number }) {
  return format.w === format.h ? 'i-lucide-square' : format.h > format.w ? 'i-lucide-rectangle-vertical' : 'i-lucide-rectangle-horizontal'
}
const active = computed(() => layouts.value.find(layout => layout.key === selectedKey.value) || layouts.value.find(layout => layout.key === preferredBannerPreviewKey(props.canvas)) || layouts.value[0])
const hasAudio = computed(() => active.value?.board.layers.some(layer => layer.type === 'audio' && layer.src && !layer.hidden && !layer.muted && (layer.volume ?? 1) > 0))
const story = computed(() => !!active.value && active.value.format.h > active.value.format.w)
const surfaceWidth = computed(() => mode.value === 'artwork' ? active.value?.format.w || 1 : story.value ? 280 : 380)
const surfaceHeight = computed(() => mode.value === 'artwork' ? active.value?.format.h || 1 : surfaceSize.height.value || 560)
const fitScale = computed(() => Math.min(
  Math.max(1, viewportSize.width.value - 32) / surfaceWidth.value,
  Math.max(1, viewportSize.height.value - 32) / surfaceHeight.value,
  3
))
const scale = computed(() => zoom.value ?? fitScale.value)
const percent = computed(() => Math.round(scale.value * 100))
let frameSequence = 0
const previewDocument = computed(() => {
  // A presentation switch mounts a new iframe; invalidate its previous messages too.
  void mode.value
  const frameId = ++frameSequence
  const source = active.value
    ? buildBannerHTML(active.value.key, active.value.board.layers, {
        // A stopped preview still needs the timeline to evaluate keyframes and scene visibility.
        pausedAt: 0,
        playback: active.value.board.playback,
        bgColor: active.value.board.bgColor || '#0a0a10',
        customFonts: props.fonts || [],
        externalAudio: true
      })
    : ''
  return { frameId, html: withBannerPreviewPlayback(source, frameId) }
})
const html = computed(() => previewDocument.value.html)
watch(html, () => {
  hostAudio.pause()
  commandSequence = 0
  playback.value = { state: 'loading', current: 0, duration: 0, iteration: 1, repeat: 0 }
}, { flush: 'sync' })

function sendPlaybackCommand(action: 'seek' | 'play' | 'pause' | 'replay', time?: number) {
  if (!canControl.value) return
  audioError.value = ''
  if (action === 'pause') hostAudio.pause()
  if (action === 'seek') hostAudio.seek(time ?? 0)
  if (action === 'play' || action === 'replay') hostAudio.start(action === 'replay' || playback.value.state === 'ended' ? 0 : playback.value.current, action === 'replay' ? 1 : playback.value.iteration)
  root.value?.querySelector('iframe')?.contentWindow?.postMessage({
    type: 'banner-preview-control', frameId: previewDocument.value.frameId,
    commandId: ++commandSequence, action, time
  }, '*')
}
function seekPlayback(value: number | number[] | undefined) {
  const time = Array.isArray(value) ? value[0] : value
  if (typeof time !== 'number' || !Number.isFinite(time) || !canControl.value) return
  const current = Math.max(0, Math.min(playback.value.duration, time))
  sendPlaybackCommand('seek', current)
  playback.value = { ...playback.value, current, state: 'paused', iteration: 1 }
}
function togglePlayback() {
  sendPlaybackCommand(playback.value.state === 'ended' ? 'replay' : playing.value ? 'pause' : 'play')
}

function resetView() {
  audioError.value = ''
  zoom.value = null
  viewport.value?.scrollTo({ top: 0, left: 0 })
}
watch(() => active.value?.key, resetView)
watch(mode, resetView)
function changeZoom(direction: number) {
  zoom.value = Math.min(3, Math.max(0.05, Math.round((scale.value + direction * 0.1) * 100) / 100))
}
</script>

<template>
  <section
    ref="root"
    class="flex min-h-0 flex-1 flex-col overflow-hidden bg-default"
    :class="{ 'fixed inset-0 z-50 h-dvh': expanded }"
    aria-label="Banner preview"
    @keydown.esc="expanded = false"
  >
    <div ref="audioRoot" class="sr-only" aria-hidden="true">
      <audio
        v-for="layer in audioLayers"
        :key="`${active?.key}:${layer.id}`"
        :src="layer.src"
        :loop="!!layer.loopAudio"
        preload="metadata"
        @loadedmetadata="audioMetadata"
        @error="audioError = 'An audio track could not load. Try replaying the preview.'"
      />
    </div>
    <div v-if="active" class="flex min-h-0 flex-1 flex-col">
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-default bg-default px-4 py-3 sm:px-6">
        <div class="flex max-w-full min-w-0 items-center gap-2 overflow-x-auto" aria-label="Preview size">
          <UButton
            v-for="layout in layouts"
            :key="layout.key"
            :aria-label="`${layout.format.w} × ${layout.format.h}`"
            :aria-pressed="active.key === layout.key"
            :variant="active.key === layout.key ? 'soft' : 'ghost'"
            color="neutral"
            class="shrink-0 gap-2.5 rounded-xl px-3 py-2 text-left sm:px-4"
            @click="selectedKey = layout.key"
          >
            <UIcon :name="formatIcon(layout.format)" class="hidden size-5 shrink-0 text-muted sm:block" />
            <span class="flex flex-col gap-0.5">
              <span class="text-xs font-semibold sm:text-sm">{{ formatLabel(layout.format) }}</span>
              <span class="text-[10px] font-normal tabular-nums text-muted sm:text-xs">{{ layout.format.w }} × {{ layout.format.h }}</span>
            </span>
          </UButton>
        </div>
        <div class="flex items-center gap-1 rounded-full bg-elevated/70 p-1" aria-label="Preview presentation">
          <UButton
            label="Artwork"
            icon="i-lucide-image"
            :aria-pressed="mode === 'artwork'"
            :variant="mode === 'artwork' ? 'solid' : 'ghost'"
            color="neutral"
            size="sm"
            class="rounded-full px-4"
            @click="mode = 'artwork'"
          />
          <UButton
            label="Social preview"
            icon="i-lucide-smartphone"
            :aria-pressed="mode === 'social'"
            :variant="mode === 'social' ? 'solid' : 'ghost'"
            color="neutral"
            size="sm"
            class="rounded-full px-4"
            @click="mode = 'social'"
          />
        </div>
      </div>
      <div
        ref="viewport"
        class="min-h-0 flex-1 overflow-auto overscroll-contain bg-elevated/40"
        tabindex="0"
        aria-label="Scrollable artwork preview"
      >
        <div class="grid min-h-full min-w-full w-max place-items-center p-4">
          <div :style="{ width: `${surfaceWidth * scale}px`, height: `${surfaceHeight * scale}px` }" class="relative shrink-0" :class="{ 'shadow-2xl ring-1 ring-default/50': mode === 'artwork' }">
            <div ref="surface" class="absolute left-0 top-0 origin-top-left" :style="{ width: `${surfaceWidth}px`, transform: `scale(${scale})` }">
              <BannerSavedViewerFrame
                v-if="mode === 'artwork'"
                :key="`${active.key}`"
                :html="html"
                :width="active.format.w"
                :height="active.format.h"
                :title="`${active.format.w} × ${active.format.h} preview`"
              />
              <AdPreviewMetaStoryPreview
                v-else-if="story"
                :key="`story:${active.key}`"
                :html="html"
                :html-width="active.format.w"
                :html-height="active.format.h"
                :page-name="pageName"
                :show-default-cta="false"
                :show-label="false"
              />
              <AdPreviewMetaFeedPreview
                v-else
                :key="`feed:${active.key}`"
                :html="html"
                :html-width="active.format.w"
                :html-height="active.format.h"
                :page-name="pageName"
                :show-placeholders="false"
                :creative-aspect-ratio="active.format.w / active.format.h"
              />
            </div>
          </div>
        </div>
      </div>
      <div class="shrink-0 border-t border-default bg-default px-4 pt-3 sm:px-6" aria-label="Playback timeline">
        <div class="mx-auto flex max-w-5xl items-center gap-3">
          <span class="flex min-w-16 items-center gap-1.5 text-[11px] font-medium" role="status">
            <span class="size-1.5 shrink-0 rounded-full" :class="playback.state === 'playing' ? 'animate-pulse bg-primary' : 'bg-muted'" aria-hidden="true" />
            {{ playbackLabel }}
          </span>
          <UFormField label="Playback position" class="min-w-12 flex-1" :ui="{ label: 'sr-only', container: 'mt-0' }">
            <USlider
              :model-value="playback.current"
              :max="playback.duration || 1"
              :step="0.1"
              :disabled="!canControl"
              :tooltip="{ text: playbackTime }"
              aria-label="Playback position"
              class="w-full cursor-pointer py-2"
              size="sm"
              @update:model-value="seekPlayback"
            />
          </UFormField>
          <span class="shrink-0 text-xs tabular-nums text-muted" data-testid="playback-time">{{ playbackTime }}</span>
          <span v-if="playbackLoop" class="hidden shrink-0 text-[11px] text-muted sm:block">{{ playbackLoop }}</span>
        </div>
        <p class="mt-1 text-center text-[11px] text-muted">
          Drag to seek. Play resumes from here.
        </p>
      </div>
      <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 bg-default px-4 py-3 sm:px-6">
        <div class="flex items-center gap-1">
          <UButton
            :label="playback.state === 'ended' ? 'Replay' : playing ? 'Pause' : 'Play'"
            :icon="playback.state === 'ended' ? 'i-lucide-rotate-ccw' : playing ? 'i-lucide-pause' : 'i-lucide-play'"
            color="neutral"
            variant="solid"
            size="md"
            class="min-w-24 justify-center rounded-full"
            :disabled="!canControl"
            @click="togglePlayback"
          />
          <UButton
            icon="i-lucide-rotate-ccw"
            aria-label="Replay animation"
            color="neutral"
            variant="ghost"
            size="md"
            :disabled="!canControl"
            @click="sendPlaybackCommand('replay')"
          />
        </div>
        <UButton
          v-if="hasAudio"
          :icon="muted ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
          :label="muted ? 'Sound off' : 'Sound on'"
          :aria-label="muted ? 'Unmute audio' : 'Mute audio'"
          :aria-pressed="!muted"
          color="neutral"
          variant="ghost"
          size="md"
          @click="toggleSound()"
        />
        <div class="flex items-center gap-1 border-l border-default pl-4" aria-label="Preview zoom">
          <UButton
            icon="i-lucide-minus"
            aria-label="Zoom out"
            :disabled="scale <= 0.05"
            color="neutral"
            variant="ghost"
            size="md"
            @click="changeZoom(-1)"
          />
          <span class="w-12 text-center text-xs tabular-nums" aria-live="polite">{{ percent }}%</span>
          <UButton
            icon="i-lucide-plus"
            aria-label="Zoom in"
            :disabled="scale >= 3"
            color="neutral"
            variant="ghost"
            size="md"
            @click="changeZoom(1)"
          />
          <UButton
            label="Fit"
            :aria-pressed="zoom === null"
            color="neutral"
            :variant="zoom === null ? 'soft' : 'ghost'"
            size="md"
            @click="zoom = null"
          />
          <UButton
            label="100%"
            :aria-pressed="zoom === 1"
            color="neutral"
            variant="ghost"
            size="md"
            @click="zoom = 1"
          />
          <UButton
            :icon="fullScreenView ? 'i-lucide-minimize' : 'i-lucide-maximize'"
            :aria-label="fullScreenView ? 'Exit full screen' : 'Full screen'"
            color="neutral"
            variant="ghost"
            size="md"
            @click="toggleScreen()"
          />
        </div>
      </div>
      <p v-if="audioError" role="status" class="shrink-0 px-4 pb-2 text-center text-xs text-warning">
        {{ audioError }}
      </p>
      <p v-if="mode === 'social'" class="shrink-0 px-4 pb-2 text-center text-[11px] text-muted">
        {{ story ? 'Story / Reel mockup · Full creative shown with phone controls outside the artwork.' : 'Facebook Feed mockup.' }} Platform account details, ad copy and final platform cropping are not included.
      </p>
    </div>
    <UAlert
      v-else
      class="m-6"
      color="warning"
      title="No preview sizes"
      description="The saved banner has no renderable sizes yet."
    />
  </section>
</template>
