<script setup lang="ts">
import { renderQrSvg } from '~~/shared/qr/render-svg'
import { QrStyleSchema, type QrStyle } from '~~/shared/qr/style'

const props = withDefaults(defineProps<{ text: string, style?: Partial<QrStyle>, size?: number }>(), { size: 240 })
const svg = computed(() => {
  try {
    return renderQrSvg({ text: props.text, style: QrStyleSchema.parse(props.style ?? {}), size: props.size })
  } catch {
    return ''
  }
})
</script>

<template>
  <!-- Renderer output is generated from validated style + our own markup; logo is a data URI validated server-side. -->
  <div class="inline-block rounded-xl overflow-hidden ring-1 ring-default bg-white" :style="{ width: `${size}px`, height: `${size}px` }" v-html="svg" />
</template>
