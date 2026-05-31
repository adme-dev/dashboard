<!-- app/components/email/builder/EdmBlockRenderer.vue -->
<!-- Stateless leaf renderer: block type/style/props → editor-preview markup.
     Ported from layers/edm/.../EdmBlockRenderer.vue (shadcn class re-skinned). -->
<template>
  <!-- Heading -->
  <component :is="headingTag" v-if="type === 'Heading'" :style="headingStyle">
    {{ blockProps.text || 'New Heading' }}
  </component>

  <!-- Text -->
  <div
    v-else-if="type === 'Text'"
    :style="textStyle"
    class="revert-browser-styles"
    v-html="blockProps.text || ''"
  />

  <!-- Button -->
  <div v-else-if="type === 'Button'" :style="buttonWrapperStyle">
    <a :href="(blockProps.url as string) || '#'" :style="buttonLinkStyle" target="_blank">
      {{ blockProps.text || 'Click Here' }}
    </a>
  </div>

  <!-- Image -->
  <div v-else-if="type === 'Image'" :style="imageWrapperStyle">
    <a
      v-if="blockProps.linkHref"
      :href="blockProps.linkHref as string"
      target="_blank"
      style="text-decoration: none"
    >
      <img :src="(blockProps.url as string) || ''" :alt="(blockProps.alt as string) || ''" :style="imageStyle">
    </a>
    <img
      v-else
      :src="(blockProps.url as string) || ''"
      :alt="(blockProps.alt as string) || ''"
      :style="imageStyle"
    >
  </div>

  <!-- Avatar -->
  <div v-else-if="type === 'Avatar'" :style="avatarWrapperStyle">
    <img :src="(blockProps.imageUrl as string) || ''" :alt="(blockProps.alt as string) || 'Avatar'" :style="avatarStyle">
  </div>

  <!-- Divider -->
  <div v-else-if="type === 'Divider'" :style="dividerWrapperStyle">
    <hr :style="dividerLineStyle">
  </div>

  <!-- Spacer -->
  <div v-else-if="type === 'Spacer'" :style="{ height: ((blockProps.height as number) || 24) + 'px' }" />

  <!-- Html -->
  <div
    v-else-if="type === 'Html'"
    :style="baseStyle"
    class="revert-browser-styles"
    v-html="blockProps.contents || ''"
  />

  <!-- Unknown -->
  <div
    v-else
    :style="baseStyle"
    class="text-muted text-sm p-4 text-center border border-dashed rounded"
  >
    Unknown block: {{ type }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  type: string
  style?: Record<string, unknown> | null
  props?: Record<string, unknown> | null
}>()

const blockProps = computed(() => (props.props || {}) as Record<string, unknown>)

function getPadding(p: unknown): string | undefined {
  if (!p || typeof p !== 'object') return undefined
  const pad = p as { top?: number, bottom?: number, left?: number, right?: number }
  return `${pad.top ?? 0}px ${pad.right ?? 0}px ${pad.bottom ?? 0}px ${pad.left ?? 0}px`
}

function buildBaseStyle(
  s: Record<string, unknown> | null | undefined
): Record<string, string | undefined> {
  if (!s) return {}
  return {
    color: (s.color as string) || undefined,
    backgroundColor: (s.backgroundColor as string) || undefined,
    fontFamily: (s.fontFamily as string) || undefined,
    fontSize: s.fontSize ? `${s.fontSize}px` : undefined,
    fontWeight: (s.fontWeight as string) || undefined,
    textAlign: (s.textAlign as string) || undefined,
    padding: getPadding(s.padding)
  }
}

const baseStyle = computed(() => buildBaseStyle(props.style))

const headingTag = computed(() => {
  const level = (blockProps.value.level as string) || 'h2'
  return ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(level) ? level : 'h2'
})
const headingStyle = computed(() => ({
  ...buildBaseStyle(props.style),
  fontWeight: (props.style?.fontWeight as string) || 'bold'
}))

const textStyle = computed(() => buildBaseStyle(props.style))

const buttonWrapperStyle = computed(() => ({
  backgroundColor: (props.style?.backgroundColor as string) || undefined,
  textAlign: (props.style?.textAlign as string) || undefined,
  padding: getPadding(props.style?.padding)
}))
const buttonLinkStyle = computed(() => {
  const bgColor = (blockProps.value.buttonBackgroundColor as string) || '#2f4574'
  const textColor = (blockProps.value.buttonTextColor as string) || '#ffffff'
  return {
    display: 'inline-block',
    padding: '12px 20px',
    fontSize: '16px',
    fontWeight: '600',
    textDecoration: 'none',
    backgroundColor: bgColor,
    color: textColor,
    borderRadius: '4px',
    lineHeight: '1'
  }
})

const imageWrapperStyle = computed(() => ({
  padding: getPadding(props.style?.padding),
  backgroundColor: (props.style?.backgroundColor as string) || undefined,
  textAlign: (props.style?.textAlign as string) || undefined
}))
const imageStyle = computed(() => ({
  maxWidth: '100%',
  height: 'auto',
  display: 'block',
  outline: 'none',
  border: 'none',
  ...(blockProps.value.width ? { width: `${blockProps.value.width}px` } : {}),
  ...(blockProps.value.height ? { height: `${blockProps.value.height}px` } : {})
}))

const avatarWrapperStyle = computed(() => ({
  textAlign: (props.style?.textAlign as string) || undefined,
  padding: getPadding(props.style?.padding)
}))
const avatarStyle = computed(() => {
  const size = (blockProps.value.size as number) || 64
  const shape = (blockProps.value.shape as string) || 'circle'
  return {
    width: `${size}px`,
    height: `${size}px`,
    objectFit: 'cover' as const,
    display: 'inline-block',
    verticalAlign: 'middle',
    borderRadius: shape === 'circle' ? '50%' : shape === 'rounded' ? '8px' : '0'
  }
})

const dividerWrapperStyle = computed(() => ({
  padding: getPadding(props.style?.padding),
  backgroundColor: (props.style?.backgroundColor as string) || undefined
}))
const dividerLineStyle = computed(() => ({
  width: '100%',
  border: 'none',
  borderTop: `${(blockProps.value.lineHeight as number) || 1}px solid ${(blockProps.value.lineColor as string) || '#e5e7eb'}`,
  margin: '0'
}))
</script>
