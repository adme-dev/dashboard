<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'

const props = defineProps<{
  layer: Layer
  isActive: boolean
}>()

const { updateLayer } = useBannerStudio()
const { getFeedOverride } = useBannerFeeds()

const displayText = computed(() => getFeedOverride(props.layer.id, 'text') ?? props.layer.text ?? '')
const displayColor = computed(() => getFeedOverride(props.layer.id, 'color') ?? props.layer.color ?? '#fff')

const isEditing = ref(false)
const textEl = ref<HTMLDivElement | null>(null)

function onDoubleClick() {
  if (!props.isActive || props.layer.locked) return
  isEditing.value = true
  nextTick(() => {
    textEl.value?.focus()
    // Select all text
    const selection = window.getSelection()
    const range = document.createRange()
    if (textEl.value && selection) {
      range.selectNodeContents(textEl.value)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  })
}

function onBlur() {
  if (!isEditing.value) return
  isEditing.value = false
  const newText = textEl.value?.innerText || ''
  if (newText !== props.layer.text) {
    updateLayer(props.layer.id, { text: newText })
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    isEditing.value = false
    textEl.value?.blur()
  }
  // Prevent layer deletion keys while editing
  e.stopPropagation()
}
</script>

<template>
  <div
    class="w-full h-full select-none"
    :style="{
      opacity: layer.opacity,
      backgroundColor: layer.bgColor || 'transparent',
      padding: layer.bgColor ? `${layer.paddingV || 4}px ${layer.paddingH || 10}px` : undefined,
    }"
    @dblclick="onDoubleClick"
  >
    <div
      ref="textEl"
      :contenteditable="isEditing"
      :class="{ 'pointer-events-none': !isEditing }"
      :style="{
        fontSize: `${layer.fontSize || 16}px`,
        fontWeight: layer.fontWeight || 400,
        fontFamily: layer.fontFamily || 'Barlow Condensed',
        color: (layer.gradientColors?.length ?? 0) >= 2 ? undefined : displayColor,
        fontStyle: layer.fontStyle || 'normal',
        textShadow: layer.textShadow || 'none',
        WebkitTextStroke: layer.textStroke || 'unset',
        textTransform: (layer.textTransform as any) || 'none',
        letterSpacing: layer.letterSpacing || 'normal',
        lineHeight: layer.lineHeight || 1.2,
        textAlign: (layer.textAlign as any) || 'left',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        outline: 'none',
        cursor: isEditing ? 'text' : 'inherit',
        width: '100%',
        height: '100%',
        // Gradient text fill
        ...((layer.gradientColors?.length ?? 0) >= 2 ? {
          background: `linear-gradient(to right, ${layer.gradientColors!.join(', ')})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        } : {}),
      }"
      @blur="onBlur"
      @keydown="onKeydown"
    >{{ isEditing ? (layer.text || '') : displayText }}</div>
  </div>
</template>
