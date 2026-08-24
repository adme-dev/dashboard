<script setup lang="ts">
/**
 * Creative slot for ad-preview mockups.
 *
 * Renders, in priority order:
 *  1. `html`  — the real composed banner (buildBannerHTML output) in a
 *               sandboxed srcdoc iframe, scaled to fit the slot (contain).
 *  2. `image` — a plain creative image (upload / bg photo).
 *  3. A correctly-encoded SVG placeholder tile.
 *
 * The parent element defines the slot's size/aspect; this component fills it.
 */
import { svgPlaceholder } from '~/utils/adPreviewPlaceholder'

const props = withDefaults(defineProps<{
  html?: string
  htmlWidth?: number
  htmlHeight?: number
  image?: string
  label?: string
  placeholderBg?: string
  placeholderFg?: string
  fit?: 'cover' | 'contain'
}>(), {
  label: 'Ad Creative',
  placeholderBg: '#333333',
  placeholderFg: '#8a8a8a',
  fit: 'cover',
})

const box = ref<HTMLElement | null>(null)
const size = ref({ w: 0, h: 0 })
let ro: ResizeObserver | null = null

onMounted(() => {
  if (!box.value) return
  ro = new ResizeObserver(([entry]) => {
    size.value = { w: entry.contentRect.width, h: entry.contentRect.height }
  })
  ro.observe(box.value)
})
onBeforeUnmount(() => { ro?.disconnect() })

const hasBanner = computed(() => !!props.html && !!props.htmlWidth && !!props.htmlHeight)

const iframeStyle = computed(() => {
  const w = props.htmlWidth || 1
  const h = props.htmlHeight || 1
  const scale = size.value.w && size.value.h ? Math.min(size.value.w / w, size.value.h / h) : 0
  return {
    width: `${w}px`,
    height: `${h}px`,
    transform: `translate(-50%, -50%) scale(${scale || 1})`,
    visibility: scale ? 'visible' as const : 'hidden' as const,
  }
})

const placeholder = computed(() =>
  svgPlaceholder({ width: 600, height: 600, bg: props.placeholderBg, fg: props.placeholderFg, label: props.label }))
</script>

<template>
  <div ref="box" class="absolute inset-0 overflow-hidden">
    <iframe
      v-if="hasBanner"
      :srcdoc="html"
      sandbox="allow-scripts"
      scrolling="no"
      title="Banner preview"
      class="absolute top-1/2 left-1/2 origin-center border-0 pointer-events-none"
      :style="iframeStyle"
    />
    <img
      v-else
      :src="image || placeholder"
      alt="Ad creative"
      class="w-full h-full"
      :class="fit === 'contain' ? 'object-contain' : 'object-cover'"
    >
  </div>
</template>
