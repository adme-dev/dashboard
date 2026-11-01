<script setup lang="ts">
import TextGlyphs from './TextGlyphs.client.vue'
import type { Layer } from '~/types/banner-studio'
import { effectStyleFromLayer, bannerTextBackdropShadow, safeBannerTextTexture } from '~~/shared/bannerEffects'
import { useBannerFonts } from '~/composables/useBannerFonts'
import { bannerFontFamily } from '~/utils/banner-font-family'

const props = defineProps<{
  layer: Layer
  isActive: boolean
  clientId?: string | null
}>()

const { updateLayer } = useBannerStudio()
const { getFeedOverride } = useBannerFeeds()

const { getCustomFont } = useBannerFonts(() => props.clientId ?? null)
const resolvedFontId = computed(() => props.layer.fontAssetId || getCustomFont(props.layer.fontFamily || 'Barlow Condensed', props.layer.fontWeight || 400)?.id)

const displayText = computed(() => getFeedOverride(props.layer.id, 'text') ?? props.layer.text ?? '')
const displayColor = computed(() => getFeedOverride(props.layer.id, 'color') ?? props.layer.color ?? '#fff')

const effects = computed(() => effectStyleFromLayer(props.layer as unknown as Record<string, unknown>))
const displayRuns = computed(() => props.layer.textRuns?.map(run => run.text).join('') === displayText.value ? props.layer.textRuns : undefined)
const texture = computed(() => safeBannerTextTexture(props.layer.textTexture))
const depthShadow = computed(() => bannerTextBackdropShadow(props.layer as unknown as Record<string, unknown>))
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
    // Preserve supported inline typography when users edit within an imported run.
    const textRuns: NonNullable<Layer['textRuns']> = []
    if (props.layer.textRuns && textEl.value) {
      const collect = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const span = node.parentElement
          const fontSize = Number.parseFloat(span?.style.fontSize || '')
          const top = Number.parseFloat(span?.style.top || '')
          textRuns.push({ text: node.textContent || '', ...(span !== textEl.value && Number.isFinite(fontSize) ? { fontSize } : {}), ...(Number.isFinite(top) ? { top } : {}) })
        } else for (const child of node.childNodes) collect(child)
      }
      for (const child of textEl.value.childNodes) collect(child)
    }
    updateLayer(props.layer.id, { text: newText, ...(props.layer.textRuns ? { textRuns: textRuns.map(run => run.text).join('') === newText ? textRuns : undefined } : {}) })
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
      padding: layer.bgColor ? `${layer.paddingV ?? 4}px ${layer.paddingH ?? 10}px` : undefined
    }"
    @dblclick="onDoubleClick"
  >
    <div class="relative w-full h-full">
      <div
        v-if="depthShadow"
        aria-hidden="true"
        class="absolute inset-0 pointer-events-none"
        :style="{ fontSize: `${layer.fontSize || 16}px`, fontWeight: layer.fontWeight || 400, fontFamily: bannerFontFamily(layer.fontFamily, resolvedFontId), fontStyle: layer.fontStyle || 'normal', textTransform: (layer.textTransform as any) || 'none', letterSpacing: layer.letterSpacing || 'normal', lineHeight: layer.lineHeight || 1.2, textAlign: (layer.textAlign as any) || 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: effects.textDepth?.color || displayColor, textShadow: depthShadow }"
      >
        <TextGlyphs
          :text="displayText"
          :runs="displayRuns"
          :line-box-font-size="layer.lineBoxFontSize"
          :font-size="layer.fontSize"
        />
      </div>
      <div
        ref="textEl"
        :contenteditable="isEditing"
        :class="{ 'pointer-events-none': !isEditing }"
        :style="{
          position: 'relative',
          fontSize: `${layer.fontSize || 16}px`,
          fontWeight: layer.fontWeight || 400,
          fontFamily: bannerFontFamily(layer.fontFamily, resolvedFontId),
          WebkitFontSmoothing: layer.textAntialias ? 'antialiased' : undefined,
          textRendering: layer.textAntialias ? 'optimizeLegibility' : undefined,
          color: texture || (effects.gradientColors?.length ?? 0) >= 2 ? 'transparent' : displayColor,
          fontStyle: layer.fontStyle || 'normal',
          filter: effects.visualFilter,
          textShadow: texture ? 'none' : effects.textShadow || 'none',
          WebkitTextStroke: effects.textStroke || 'unset',
          paintOrder: effects.textStroke ? (layer.textPaintOrder === 'fill' ? 'fill' : 'stroke') : undefined,
          textTransform: (layer.textTransform as any) || 'none',
          letterSpacing: layer.letterSpacing || 'normal',
          lineHeight: layer.lineHeight || 1.2,
          textAlign: (layer.textAlign as any) || 'left',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          outline: 'none',
          cursor: isEditing ? 'text' : 'inherit',
          width: '100%',
          // Gradient text fill
          ...(texture || (effects.gradientColors?.length ?? 0) >= 2 ? {
            backgroundImage: texture ? `url('${texture}')` : `linear-gradient(to right,${effects.gradientColors!.join(',')})`,
            backgroundSize: texture ? 'cover' : undefined,
            backgroundColor: texture ? displayColor : undefined,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          } : {})
        }"
        @blur="onBlur"
        @keydown="onKeydown"
      >
        <TextGlyphs
          :text="isEditing ? (layer.text || '') : displayText"
          :runs="displayRuns"
          :word-pop="!!layer.wordPop && !isEditing"
          :line-box-font-size="!isEditing ? layer.lineBoxFontSize : undefined"
          :font-size="layer.fontSize"
        />
      </div>
    </div>
  </div>
</template>
