<script setup lang="ts">
// MediaAvPreview.client.vue — frame-accurate AV preview. Base layer (footage + ken-burns
// stills) is composited onto a <canvas> via drawImage; the GSAP overlay is an <iframe>
// stacked on top, seeked to the same clock. Slaved to the `currentTime` prop (the editor's
// rAF updates it each frame during playback); <video> elements play/pause via `isPlaying`.
// The V1.2 server render remains authoritative for final pixels.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import { buildBannerHTML } from '~~/app/utils/banner-html-builder'
import { fitRect, kenBurnsTransformAt, activeVisualClipAt, extractBannerLayers } from '~~/app/utils/video/composite'

const props = defineProps<{
  timeline: TimelineState
  currentTime: number
  isPlaying: boolean
  /** r2_key → presigned URL (from the editor's sources map) */
  sources: Record<string, string>
}>()

const W = computed(() => props.timeline.width ?? 1080)
const H = computed(() => props.timeline.height ?? 1920)
const aspect = computed(() => `${W.value} / ${H.value}`)

const canvasRef = ref<HTMLCanvasElement | null>(null)

const videoEls = new Map<string, HTMLVideoElement>()
const imgEls = new Map<string, HTMLImageElement>()

const videoClips = computed(() =>
  props.timeline.tracks.filter(t => t.kind === 'video').flatMap(t => t.clips as any[])
)
const overlayClips = computed(() =>
  props.timeline.tracks.filter(t => t.kind === 'overlay').flatMap(t => t.clips as any[])
)

function getVideoEl(clip: any): HTMLVideoElement | null {
  const url = props.sources[clip.r2_key]
  if (!url) return null
  let el = videoEls.get(clip.id)
  if (!el) {
    el = document.createElement('video')
    el.muted = true; el.playsInline = true; el.preload = 'auto'; el.crossOrigin = 'anonymous'
    el.src = url
    videoEls.set(clip.id, el)
  } else if (el.src !== url) {
    el.src = url
  }
  return el
}

function getImgEl(clip: any): HTMLImageElement | null {
  const url = props.sources[clip.r2_key]
  if (!url) return null
  let el = imgEls.get(clip.id)
  if (!el) { el = new Image(); el.crossOrigin = 'anonymous'; el.src = url; imgEls.set(clip.id, el) }
  return el
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W.value, H.value)

  const active = activeVisualClipAt(videoClips.value, props.currentTime)
  if (!active) return
  const local = props.currentTime - active.timeline_start_sec

  if (active.base_source === 'still_kenburns') {
    const img = getImgEl(active)
    if (!img || !img.complete || img.naturalWidth === 0) return
    const kb = active.kenburns ?? { zoom_from: 1, zoom_to: 1.1, pan_from: [0, 0], pan_to: [0, 0] }
    const { zoom, panX, panY } = kenBurnsTransformAt(kb, local, active.duration_sec)
    const base = fitRect(img.naturalWidth, img.naturalHeight, W.value, H.value)
    const dw = base.width * zoom, dh = base.height * zoom
    const dx = base.x - (dw - base.width) / 2 - panX
    const dy = base.y - (dh - base.height) / 2 - panY
    ctx.drawImage(img, dx, dy, dw, dh)
  } else {
    const v = getVideoEl(active)
    if (!v || v.readyState < 2 || v.videoWidth === 0) return
    const r = fitRect(v.videoWidth, v.videoHeight, W.value, H.value)
    ctx.drawImage(v, r.x, r.y, r.width, r.height)
  }
}

watch(() => props.currentTime, () => { draw(); syncVideoSeek(); syncOverlays() })

function syncVideoSeek() {
  const active = activeVisualClipAt(videoClips.value, props.currentTime)
  for (const clip of videoClips.value) {
    const el = videoEls.get(clip.id)
    if (!el) continue
    const isActive = active?.id === clip.id
    if (!isActive) { if (!el.paused) el.pause(); continue }
    if (active.base_source === 'still_kenburns') continue
    const want = (props.currentTime - clip.timeline_start_sec) + (clip.source_in_sec ?? 0)
    if (!props.isPlaying) {
      if (Math.abs(el.currentTime - want) > 0.05) { el.onseeked = () => { draw(); el.onseeked = null }; el.currentTime = Math.max(0, want) }
    } else if (el.paused) {
      if (Math.abs(el.currentTime - want) > 0.25) el.currentTime = Math.max(0, want)
      void el.play().catch(() => {})
    }
  }
}

watch(() => props.isPlaying, (playing) => {
  if (!playing) { for (const el of videoEls.values()) if (!el.paused) el.pause() }
  else syncVideoSeek()
})

const overlayHtml = ref<Record<string, string>>({})
const overlayRefs = ref<Record<string, HTMLIFrameElement | null>>({})

async function buildOverlayHtmlFor(clip: any) {
  if (overlayHtml.value[clip.id]) return
  try {
    const proj = await $fetch<{ canvasData: Record<string, { layers?: unknown[] }> }>(`/api/agency/banner-studio/projects/${clip.gsap_project_id}`)
    const fmtKey = clip.gsap_format_key || Object.keys(proj.canvasData ?? {})[0]
    if (!fmtKey) return
    const layers = extractBannerLayers(proj.canvasData, fmtKey) as any
    overlayHtml.value = { ...overlayHtml.value, [clip.id]: buildBannerHTML(fmtKey, layers, { includeAnimations: true }) }
  } catch { /* overlay just won't preview */ }
}

watch(overlayClips, (clips) => { for (const c of clips) void buildOverlayHtmlFor(c) }, { immediate: true, deep: true })

function gsapTimelineOf(iframe: HTMLIFrameElement | null): any {
  const w = iframe?.contentWindow as any
  try { return w?.gsap?.globalTimeline?.getChildren?.(false)?.[0] ?? null } catch { return null }
}

function syncOverlays() {
  for (const clip of overlayClips.value) {
    const iframe = overlayRefs.value[clip.id]
    const tl = gsapTimelineOf(iframe)
    if (!tl) continue
    const isActive = props.currentTime >= clip.timeline_start_sec && props.currentTime < clip.timeline_start_sec + clip.duration_sec
    if (!isActive) continue
    try { tl.pause(); tl.seek(Math.max(0, props.currentTime - clip.timeline_start_sec)) } catch { /* not ready */ }
  }
}

function overlayActive(clip: any): boolean {
  return props.currentTime >= clip.timeline_start_sec && props.currentTime < clip.timeline_start_sec + clip.duration_sec
}

function onOverlayLoad(clip: any) {
  const tl = gsapTimelineOf(overlayRefs.value[clip.id])
  if (tl) { try { tl.pause(); tl.seek(Math.max(0, props.currentTime - clip.timeline_start_sec)) } catch { /* noop */ } }
}

onMounted(() => { draw() })
onBeforeUnmount(() => {
  for (const el of videoEls.values()) { try { el.pause(); el.removeAttribute('src'); el.load() } catch { /* noop */ } }
  videoEls.clear(); imgEls.clear()
})
</script>

<template>
  <div class="relative mx-auto bg-black rounded-lg overflow-hidden border border-default"
       :style="{ aspectRatio: aspect, maxHeight: '60vh' }">
    <canvas
      ref="canvasRef"
      :width="W"
      :height="H"
      class="absolute inset-0 h-full w-full object-contain"
    />
    <template v-for="clip in overlayClips" :key="clip.id">
      <iframe
        v-if="overlayHtml[clip.id]"
        v-show="overlayActive(clip)"
        :ref="(el) => { overlayRefs[clip.id] = el as HTMLIFrameElement | null }"
        :srcdoc="overlayHtml[clip.id]"
        :style="{ opacity: clip.opacity ?? 1 }"
        class="absolute inset-0 h-full w-full border-0 pointer-events-none"
        sandbox="allow-scripts allow-same-origin"
        @load="onOverlayLoad(clip)"
      />
    </template>
    <div v-if="!videoClips.length && !overlayClips.length"
         class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted">
      <UIcon name="i-lucide-clapperboard" class="size-8" />
      <p class="text-sm">Add footage, a still, or an overlay to preview</p>
    </div>
  </div>
</template>
