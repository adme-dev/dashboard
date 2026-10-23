<script setup lang="ts">
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { resolveBannerFormat } from '~/utils/banner-constants'
import type { ArtboardState } from '~/types/banner-studio'

const props = defineProps<{
  canvasData: Record<string, ArtboardState>
}>()

const { fetchCustomFonts, getExportCustomFonts } = useBannerFonts()
const containerRef = ref<HTMLDivElement | null>(null)
const fontsReady = ref(false)

/** Pick the best artboard for thumbnail: prefer mrec (300x250) or first available */
const preview = computed(() => {
  if (!fontsReady.value) return null
  const data = props.canvasData
  if (!data || typeof data !== 'object') return null

  const keys = Object.keys(data)
  if (!keys.length) return null

  // Prefer square-ish formats for thumbnails
  const preferred = ['mrec', 'fb_sq', 'ig_sq', 'leader', 'fb_feed']
  const fmtKey = preferred.find(k => keys.includes(k) && data[k]?.layers?.length) || keys.find(k => data[k]?.layers?.length) || keys[0]

  const artboard = data[fmtKey]
  if (!artboard?.layers?.length) return null

  const fmt = resolveBannerFormat(fmtKey)
  if (!fmt) return null

  const html = buildBannerHTML(fmtKey, artboard.layers, {
    includeAnimations: false,
    bgColor: artboard.bgColor || '#0a0a10',
    customFonts: getExportCustomFonts(artboard.layers)
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

let resizeObserver: ResizeObserver | undefined
watch(preview, updateScale, { flush: 'post' })

onMounted(() => {
  void fetchCustomFonts().then(() => {
    fontsReady.value = true
  })
  updateScale()
  // Observe container resize
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(updateScale)
    resizeObserver.observe(containerRef.value)
  }
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div ref="containerRef" class="w-full h-full overflow-hidden relative">
    <template v-if="preview">
      <iframe
        :srcdoc="preview.html"
        :width="preview.width"
        :height="preview.height"
        sandbox=""
        loading="lazy"
        class="absolute left-1/2 top-1/2 origin-center pointer-events-none border-0"
        :style="{
          transform: `translate(-50%, -50%) scale(${scale})`,
          width: `${preview.width}px`,
          height: `${preview.height}px`
        }"
      />
    </template>
    <div v-else class="w-full h-full flex items-center justify-center">
      <UIcon name="i-lucide-image" class="w-8 h-8 text-muted opacity-30" />
    </div>
  </div>
</template>
