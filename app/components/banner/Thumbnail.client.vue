<script setup lang="ts">
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { FORMATS } from '~/utils/banner-constants'
import type { ArtboardState } from '~/types/banner-studio'

const props = defineProps<{
  canvasData: Record<string, ArtboardState>
}>()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

/** Pick the best artboard for thumbnail: prefer mrec (300x250) or first available */
const preview = computed(() => {
  const data = props.canvasData
  if (!data || typeof data !== 'object') return null

  const keys = Object.keys(data)
  if (!keys.length) return null

  // Prefer square-ish formats for thumbnails
  const preferred = ['mrec', 'fb_sq', 'ig_sq', 'leader', 'fb_feed']
  const fmtKey = preferred.find(k => keys.includes(k) && data[k]?.layers?.length) || keys.find(k => data[k]?.layers?.length) || keys[0]

  const artboard = data[fmtKey]
  if (!artboard?.layers?.length) return null

  const fmt = FORMATS[fmtKey]
  if (!fmt) return null

  const html = buildBannerHTML(fmtKey, artboard.layers, {
    includeAnimations: false,
    bgColor: artboard.bgColor || '#0a0a10',
  })

  return { html, width: fmt.w, height: fmt.h }
})

const scale = ref(1)

function updateScale() {
  if (!containerRef.value || !preview.value) return
  const containerW = containerRef.value.clientWidth
  const containerH = containerRef.value.clientHeight
  if (!containerW || !containerH) return

  const scaleX = containerW / preview.value.width
  const scaleY = containerH / preview.value.height
  scale.value = Math.min(scaleX, scaleY)
}

onMounted(() => {
  updateScale()
  // Observe container resize
  if (containerRef.value) {
    const ro = new ResizeObserver(updateScale)
    ro.observe(containerRef.value)
    onBeforeUnmount(() => ro.disconnect())
  }
})
</script>

<template>
  <div ref="containerRef" class="w-full h-full overflow-hidden relative">
    <template v-if="preview">
      <iframe
        ref="iframeRef"
        :srcdoc="preview.html"
        :width="preview.width"
        :height="preview.height"
        sandbox=""
        loading="lazy"
        class="absolute origin-top-left pointer-events-none border-0"
        :style="{
          transform: `scale(${scale})`,
          width: `${preview.width}px`,
          height: `${preview.height}px`,
        }"
      />
    </template>
    <div v-else class="w-full h-full flex items-center justify-center">
      <UIcon name="i-lucide-image" class="w-8 h-8 text-muted opacity-30" />
    </div>
  </div>
</template>
