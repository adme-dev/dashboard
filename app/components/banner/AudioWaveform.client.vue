<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { audioWaveform, waveformBars, type AudioWaveform } from '~/utils/banner-audio-waveform'
import { safeMediaUrl } from '~/utils/safe-url'

const props = defineProps<{ src: string, span: number, loop?: boolean }>()
const canvas = ref<HTMLCanvasElement>()
const waveform = ref<AudioWaveform>()
const width = ref(0)
const height = ref(0)
const bars = computed(() => waveform.value
  ? waveformBars(waveform.value, props.span, Math.max(1, Math.floor(width.value / 5)), props.loop)
  : [])
let observer: ResizeObserver | undefined

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (!entry) return
    width.value = entry.contentRect.width
    height.value = entry.contentRect.height
  })
  if (canvas.value) observer.observe(canvas.value)
})
onUnmounted(() => observer?.disconnect())

watch(() => props.src, async (value, _, cleanup) => {
  let current = true
  cleanup(() => {
    current = false
  })
  waveform.value = undefined
  const src = safeMediaUrl(value)
  if (!src) return
  try {
    const result = await audioWaveform(src)
    if (current) waveform.value = result
  } catch { /* Keep the audio controls usable when a preview cannot be decoded. */ }
}, { immediate: true })

watch([bars, height, canvas], () => {
  const el = canvas.value
  if (!el) return
  const ratio = window.devicePixelRatio || 1
  el.width = Math.round(width.value * ratio)
  el.height = Math.round(height.value * ratio)
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.scale(ratio, ratio)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
  const step = width.value / bars.value.length
  for (let i = 0; i < bars.value.length; i++) {
    if (!bars.value[i]) continue
    const barHeight = Math.max(1, bars.value[i]! * height.value * 0.8)
    ctx.fillRect(i * step, (height.value - barHeight) / 2, Math.max(1, step - 2), barHeight)
  }
}, { flush: 'post' })
</script>

<template>
  <canvas ref="canvas" aria-hidden="true" class="size-full rounded-lg" />
</template>
