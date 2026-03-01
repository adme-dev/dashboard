<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'
import { FORMATS } from '~/utils/banner-constants'
import { computeClipPath } from '~/utils/banner-mask'
import { catmullRomToSvgPath, motionPathToAbsolute } from '~/utils/banner-motion-path'

const props = defineProps<{
  formatKey: string
  isActive: boolean
}>()

const { state, selectLayer, activeLayers, updatePathPoint, addPathPoint } = useBannerStudio()
const artboardEl = ref<HTMLElement | null>(null)
const { dragState, guides, onLayerMouseDown, onResizeHandleMouseDown } = useBannerDrag(artboardEl)

const format = computed(() => FORMATS[props.formatKey])

const layers = computed(() => {
  const artboard = state.sets[props.formatKey]
  if (!artboard) return []
  return [...artboard.layers].sort((a, b) => a.zIndex - b.zIndex)
})

// Compute clip-path for masked layers based on mask positions
const maskClipPaths = computed(() => {
  const map = new Map<number, string>()
  for (const mask of layers.value) {
    if (!mask.isMask || !mask.maskTargetIds?.length) continue
    for (const targetId of mask.maskTargetIds) {
      const target = layers.value.find(l => l.id === targetId)
      if (!target) continue
      map.set(targetId, computeClipPath(mask, target, mask.maskShape || 'rect', mask.maskInvert || false))
    }
  }
  return map
})

function onLayerClick(e: MouseEvent, layer: Layer) {
  if (!props.isActive) return
  if (layer.locked || layer.type === 'bg') return
  e.stopPropagation()
  selectLayer(layer.id)
}

function onBackgroundClick(e: MouseEvent) {
  if (!props.isActive) return
  // Double-click to add waypoint when motion path is active
  if (e.detail === 2 && selectedLayerObj.value?.motionPath?.length) {
    const rect = artboardEl.value?.getBoundingClientRect()
    if (!rect) return
    const scale = state.wsScale
    const artboardX = (e.clientX - rect.left) / scale
    const artboardY = (e.clientY - rect.top) / scale
    const layer = selectedLayerObj.value
    const offsetX = Math.round(artboardX - layer.x)
    const offsetY = Math.round(artboardY - layer.y)
    addPathPoint(layer.id, offsetX, offsetY)
    return
  }
  selectLayer(null)
}

const selectedLayerObj = computed(() => {
  if (!state.selectedLayerId) return null
  return layers.value.find(l => l.id === state.selectedLayerId) || null
})

// Motion path SVG overlay
const motionPathSvg = computed(() => {
  if (!selectedLayerObj.value?.motionPath?.length) return null
  const layer = selectedLayerObj.value
  const absPoints = motionPathToAbsolute(layer.motionPath!, layer.x, layer.y)
  const d = catmullRomToSvgPath(absPoints, layer.motionPathCurviness ?? 1)
  return { d, points: absPoints }
})

// Path point drag state
const pathPointDrag = ref<{
  pointIndex: number
  startX: number
  startY: number
  origX: number
  origY: number
} | null>(null)

function onPathPointDragStart(e: MouseEvent, pointIndex: number) {
  e.stopPropagation()
  e.preventDefault()
  const layer = selectedLayerObj.value
  if (!layer?.motionPath?.[pointIndex]) return
  const pt = layer.motionPath[pointIndex]
  pathPointDrag.value = {
    pointIndex,
    startX: e.clientX,
    startY: e.clientY,
    origX: pt.x,
    origY: pt.y,
  }
  window.addEventListener('mousemove', onPathPointDragMove)
  window.addEventListener('mouseup', onPathPointDragEnd)
}

function onPathPointDragMove(e: MouseEvent) {
  const d = pathPointDrag.value
  if (!d || !selectedLayerObj.value) return
  const scale = state.wsScale
  const dx = (e.clientX - d.startX) / scale
  const dy = (e.clientY - d.startY) / scale
  updatePathPoint(selectedLayerObj.value.id, d.pointIndex, Math.round(d.origX + dx), Math.round(d.origY + dy))
}

function onPathPointDragEnd() {
  pathPointDrag.value = null
  window.removeEventListener('mousemove', onPathPointDragMove)
  window.removeEventListener('mouseup', onPathPointDragEnd)
}

function isSelected(layer: Layer): boolean {
  return props.isActive && state.selectedLayerId === layer.id
}

const RESIZE_HANDLES = ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'] as const

function handleStyle(handle: string) {
  const base: Record<string, string> = {
    position: 'absolute',
    width: '6px',
    height: '6px',
    backgroundColor: '#fff',
    border: '1px solid #4a8fe8',
    borderRadius: '50%',
    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
    zIndex: '9999',
  }
  // Position
  if (handle.includes('t')) base.top = '-3px'
  if (handle.includes('b')) base.bottom = '-3px'
  if (handle.includes('l')) base.left = '-3px'
  if (handle.includes('r')) base.right = '-3px'
  if (handle === 'tc' || handle === 'bc') { base.left = '50%'; base.marginLeft = '-3px' }
  if (handle === 'ml' || handle === 'mr') { base.top = '50%'; base.marginTop = '-3px' }
  // Cursor
  const cursorMap: Record<string, string> = {
    tl: 'nw-resize', tr: 'ne-resize', bl: 'sw-resize', br: 'se-resize',
    tc: 'n-resize', bc: 's-resize', ml: 'w-resize', mr: 'e-resize',
  }
  base.cursor = cursorMap[handle] || 'pointer'
  return base
}

// Expose artboard element for GSAP
defineExpose({ artboardEl })
</script>

<template>
  <div
    ref="artboardEl"
    class="relative overflow-hidden"
    :style="{
      width: `${format?.w || 300}px`,
      height: `${format?.h || 250}px`,
      backgroundColor: state.sets[formatKey]?.bgColor || state.bgColor || '#0a0a10',
    }"
    @click="onBackgroundClick"
  >
    <!-- Grid overlay -->
    <svg
      v-if="state.showGrid"
      class="absolute inset-0 pointer-events-none"
      :width="format?.w || 300"
      :height="format?.h || 250"
      style="z-index: 9990; opacity: 0.15;"
    >
      <defs>
        <pattern :id="`grid-${formatKey}`" :width="state.gridSize" :height="state.gridSize" patternUnits="userSpaceOnUse">
          <path :d="`M ${state.gridSize} 0 L 0 0 0 ${state.gridSize}`" fill="none" stroke="currentColor" stroke-width="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" :fill="`url(#grid-${formatKey})`" />
    </svg>

    <!-- Motion path overlay -->
    <svg
      v-if="motionPathSvg && !state.isPlaying"
      class="absolute inset-0 pointer-events-none"
      :width="format?.w || 300"
      :height="format?.h || 250"
      style="z-index: 9991;"
    >
      <path
        :d="motionPathSvg.d"
        fill="none"
        stroke="#4af0a2"
        stroke-width="2"
        stroke-dasharray="6 3"
        opacity="0.8"
      />
      <circle
        v-for="(pt, i) in motionPathSvg.points"
        :key="i"
        :cx="pt.x"
        :cy="pt.y"
        r="5"
        :fill="i === 0 ? '#4af0a2' : (i === motionPathSvg.points.length - 1 ? '#f04a4a' : '#fff')"
        stroke="#4af0a2"
        stroke-width="1.5"
        class="cursor-move pointer-events-auto"
        @mousedown.stop="onPathPointDragStart($event, i)"
      />
      <!-- Start label -->
      <text
        v-if="motionPathSvg.points.length >= 2"
        :x="motionPathSvg.points[0].x"
        :y="motionPathSvg.points[0].y - 9"
        text-anchor="middle"
        fill="#4af0a2"
        font-size="9"
        font-weight="bold"
      >S</text>
      <!-- End label -->
      <text
        v-if="motionPathSvg.points.length >= 2"
        :x="motionPathSvg.points[motionPathSvg.points.length - 1].x"
        :y="motionPathSvg.points[motionPathSvg.points.length - 1].y - 9"
        text-anchor="middle"
        fill="#f04a4a"
        font-size="9"
        font-weight="bold"
      >E</text>
    </svg>

    <!-- Layers -->
    <div
      v-for="layer in layers"
      :id="`lyr-${layer.id}`"
      :key="layer.id"
      class="absolute"
      :style="{
        left: `${layer.x}px`,
        top: `${layer.y}px`,
        width: layer.type === 'audio' ? '0px' : (layer.type === 'bg' ? '100%' : `${layer.w}px`),
        height: layer.type === 'audio' ? '0px' : (layer.type === 'bg' ? '100%' : `${layer.h}px`),
        zIndex: layer.zIndex,
        pointerEvents: isActive && !layer.locked && layer.type !== 'bg' && layer.type !== 'audio' ? 'auto' : 'none',
        visibility: layer.hidden && layer.type !== 'audio' ? 'hidden' : 'visible',
        transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
        cursor: isActive && !layer.locked && layer.type !== 'bg' && layer.type !== 'audio' ? 'move' : 'default',
        clipPath: maskClipPaths.get(layer.id) || undefined,
        outline: layer.isMask ? '2px dashed #e84aff' : undefined,
        outlineOffset: layer.isMask ? '-1px' : undefined,
      }"
      @click="onLayerClick($event, layer)"
      @mousedown="isActive && !layer.locked && layer.type !== 'bg' ? onLayerMouseDown($event, layer.id) : undefined"
    >
      <!-- Layer type renderers -->
      <BannerLayersBg v-if="layer.type === 'bg'" :layer="layer" :is-active="isActive" />
      <BannerLayersText v-else-if="layer.type === 'text'" :layer="layer" :is-active="isActive" />
      <BannerLayersImage v-else-if="layer.type === 'image'" :layer="layer" :is-active="isActive" />
      <BannerLayersVideo v-else-if="layer.type === 'video'" :layer="layer" :is-active="isActive" />
      <BannerLayersButton v-else-if="layer.type === 'button'" :layer="layer" :is-active="isActive" />
      <BannerLayersRect v-else-if="layer.type === 'rect'" :layer="layer" :is-active="isActive" />
      <BannerLayersAudio v-else-if="layer.type === 'audio'" :layer="layer" :is-active="isActive" />

      <!-- Selection handles -->
      <template v-if="isSelected(layer)">
        <div class="absolute inset-0 border border-[#4a8fe8] shadow-[0_0_0_1px_rgba(74,143,232,0.3)] pointer-events-none" style="z-index: 9998" />
        <div
          v-for="handle in RESIZE_HANDLES"
          :key="handle"
          :style="handleStyle(handle)"
          @mousedown="onResizeHandleMouseDown($event, layer.id, handle)"
        />
      </template>
    </div>

    <!-- Smart guide lines -->
    <template v-if="dragState">
      <div
        v-for="(gx, i) in guides.x"
        :key="'gx-' + i"
        class="absolute top-0 pointer-events-none"
        :style="{
          left: `${gx}px`,
          width: '1px',
          height: '100%',
          background: '#e84aff',
          zIndex: 9997,
          opacity: 0.7,
        }"
      />
      <div
        v-for="(gy, i) in guides.y"
        :key="'gy-' + i"
        class="absolute left-0 pointer-events-none"
        :style="{
          top: `${gy}px`,
          height: '1px',
          width: '100%',
          background: '#e84aff',
          zIndex: 9997,
          opacity: 0.7,
        }"
      />
    </template>
  </div>
</template>
