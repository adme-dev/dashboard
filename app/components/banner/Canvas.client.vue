<script setup lang="ts">
import { FORMATS, PLATFORM_META } from '~/utils/banner-constants'

const props = defineProps<{ projectId?: string }>()

const { state, setActiveArtboard, selectLayer } = useBannerStudio()
const { sendCursorMove } = useBannerRealtime()
const commentMode = inject<Ref<boolean>>('commentMode', ref(false))

const artboardRefs = ref<Record<string, any>>({})
const canvasEl = ref<HTMLElement | null>(null)
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0, scrollX: 0, scrollY: 0 })

function setArtboardRef(key: string, el: any) {
  if (el) artboardRefs.value[key] = el
  else delete artboardRefs.value[key]
}

function getActiveArtboardEl(): HTMLElement | null {
  const comp = artboardRefs.value[state.activeKey]
  return comp?.artboardEl || null
}

defineExpose({ getActiveArtboardEl, artboardRefs })

function onCanvasClick() {
  if (state.activeTool === 'hand') return
  selectLayer(null)
}

function onCanvasMouseDown(e: MouseEvent) {
  if (state.activeTool !== 'hand') return
  isPanning.value = true
  panStart.value = {
    x: e.clientX,
    y: e.clientY,
    scrollX: canvasEl.value?.scrollLeft || 0,
    scrollY: canvasEl.value?.scrollTop || 0,
  }
  e.preventDefault()
}

function onCanvasMouseMove(e: MouseEvent) {
  if (!isPanning.value || !canvasEl.value) return
  canvasEl.value.scrollLeft = panStart.value.scrollX - (e.clientX - panStart.value.x)
  canvasEl.value.scrollTop = panStart.value.scrollY - (e.clientY - panStart.value.y)
}

function onCanvasMouseUp() {
  isPanning.value = false
}

// Collaboration: track cursor position over active artboard
function onCanvasCursorMove(e: MouseEvent) {
  if (isPanning.value || state.activeTool === 'hand') return
  // Find the active artboard element to compute relative coords
  const comp = artboardRefs.value[state.activeKey]
  const artboardEl = comp?.artboardEl as HTMLElement | null
  if (!artboardEl) return
  const rect = artboardEl.getBoundingClientRect()
  // Convert screen coords to artboard coords (accounting for scale)
  const x = (e.clientX - rect.left) / state.wsScale
  const y = (e.clientY - rect.top) / state.wsScale
  // Only send if within artboard bounds
  if (x >= 0 && y >= 0) {
    sendCursorMove(x, y, state.activeKey)
  }
}
</script>

<template>
  <div
    ref="canvasEl"
    class="w-full h-full overflow-auto p-8 bg-[#1a1a1e]"
    :class="{
      'cursor-grab': state.activeTool === 'hand' && !isPanning,
      'cursor-grabbing': isPanning,
      'cursor-crosshair': state.activeTool === 'comment',
    }"
    @click.self="onCanvasClick"
    @mousedown="onCanvasMouseDown"
    @mousemove="onCanvasMouseMove($event); onCanvasCursorMove($event)"
    @mouseup="onCanvasMouseUp"
    @mouseleave="onCanvasMouseUp"
  >
    <div class="flex flex-wrap gap-8 items-start justify-center" @click.self="onCanvasClick">
      <div
        v-for="key in state.setKeys"
        :key="key"
        class="flex flex-col items-center gap-2 shrink-0"
        @click.self="onCanvasClick"
      >
        <!-- Artboard label -->
        <div class="flex items-center gap-2 mb-1">
          <span
            class="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center shrink-0"
            :style="{
              backgroundColor: PLATFORM_META[FORMATS[key]?.platform]?.bg || 'rgba(255,255,255,0.08)',
              color: PLATFORM_META[FORMATS[key]?.platform]?.color || '#888',
            }"
          >{{ FORMATS[key]?.icon || '?' }}</span>
          <span class="text-xs font-medium text-(--ui-text-muted)">
            {{ FORMATS[key]?.name || key }}
          </span>
          <span class="text-[10px] font-mono text-(--ui-text-dimmed)">
            {{ FORMATS[key]?.w }}x{{ FORMATS[key]?.h }}
          </span>
          <UBadge
            v-if="state.activeKey === key"
            color="primary"
            variant="subtle"
            size="xs"
          >
            Editing
          </UBadge>
        </div>

        <!-- Artboard wrapper with scale -->
        <div
          class="relative cursor-pointer rounded transition-shadow"
          :class="state.activeKey === key
            ? 'ring-2 ring-[#4a8fe8] shadow-[0_0_24px_rgba(74,143,232,0.12)]'
            : 'ring-1 ring-white/8 hover:ring-white/15'"
          :style="{
            width: `${(FORMATS[key]?.w || 300) * state.wsScale}px`,
            height: `${(FORMATS[key]?.h || 250) * state.wsScale}px`,
          }"
          @click.stop="state.activeKey !== key ? setActiveArtboard(key) : undefined"
        >
          <!-- Inner at full resolution, scaled down -->
          <div
            :style="{
              transformOrigin: 'top left',
              transform: `scale(${state.wsScale})`,
              width: `${FORMATS[key]?.w || 300}px`,
              height: `${FORMATS[key]?.h || 250}px`,
            }"
          >
            <BannerArtboard
              :ref="(el: any) => setArtboardRef(key, el)"
              :format-key="key"
              :is-active="state.activeKey === key"
            />
          </div>

          <!-- Collaboration cursors overlay -->
          <BannerCollaborationCursors
            :scale="state.wsScale"
            :active-format-key="key"
          />

          <!-- Comment overlay (on top of artboard) -->
          <BannerCommentOverlay
            v-if="props.projectId && props.projectId !== 'new'"
            :format-key="key"
            :project-id="props.projectId"
            :scale="state.wsScale"
          />
        </div>
      </div>
    </div>
  </div>
</template>
