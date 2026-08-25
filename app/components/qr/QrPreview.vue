<script setup lang="ts">
import { renderQrSvg } from '~~/shared/qr/render-svg'
import { QrStyleSchema, type QrStyle } from '~~/shared/qr/style'

/**
 * `size` is the render size in px. With `fluid`, the tile fills its container width
 * (capped at `size`) and keeps a 1:1 aspect — use it wherever the column can be narrower
 * than the nominal size (editor slideover, detail sidebar on small screens).
 */
const props = withDefaults(defineProps<{ text: string, style?: Partial<QrStyle>, size?: number, fluid?: boolean }>(), { size: 240, fluid: false })
const svg = computed(() => {
  try {
    return renderQrSvg({ text: props.text, style: QrStyleSchema.parse(props.style ?? {}), size: props.size })
  } catch {
    return ''
  }
})
const box = computed(() => props.fluid
  ? { width: '100%', maxWidth: `${props.size}px`, aspectRatio: '1 / 1' }
  : { width: `${props.size}px`, height: `${props.size}px` })
</script>

<template>
  <!-- Renderer output is generated from validated style + our own markup; logo is a data URI validated server-side. -->
  <div class="qr-preview inline-block rounded-xl overflow-hidden ring-1 ring-default bg-white" :style="box" v-html="svg" />
</template>

<style scoped>
.qr-preview :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
