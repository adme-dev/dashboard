<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { FORMATS } from '~/utils/banner-constants'
import { BRAND_BUTTON_DRAG_TYPE, brandButtonDropPoint, parseBrandButtonDragData } from '~/utils/banner-brand-buttons'
import { BANNER_MEDIA_DRAG_TYPE, takeBannerMediaDrag } from '~/utils/banner-media-drag'
import { apiErrorDescription } from '~/utils/apiError'
import type { BannerAsset } from '~/types/banner-studio'

import { layoutName, layoutRows, fitLayoutRows, WORKSPACE_GAP, WORKSPACE_FOOTER } from '~/utils/banner-workspace'

const props = defineProps<{ projectId?: string }>()

const { state, currentSlide, setActiveArtboard, selectLayer, zoomToFitFormat, setLayoutView, addBrandGuideButton, addMediaToLayouts } = useBannerStudio()
const { kit } = useBannerProjectBrand()
const toast = useToast()
const { sendCursorMove } = useBannerRealtime()

const artboardRefs = ref<Record<string, any>>({})
const canvasEl = ref<HTMLElement | null>(null)
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0, scrollX: 0, scrollY: 0 })
const dropTargetKey = ref<string | null>(null)
const importingMedia = ref(false)
let disposed = false
onBeforeUnmount(() => { disposed = true })

const rows = computed(() => layoutRows(state.setKeys.map(key => FORMATS[key]).filter(Boolean)))
const isOverview = computed(() => state.layoutView === 'all')

// Selection in the overview must not reflow or zoom the other artboards.
watch([() => state.project?.id, () => state.setKeys.join('|'), () => state.layoutView, canvasEl], () => {
  fitWorkspace()
}, { flush: 'post', immediate: true })
watch(() => state.activeKey, () => {
  if (!isOverview.value) fitWorkspace()
}, { flush: 'post' })

function fitWorkspace(allRows = false) {
  const el = canvasEl.value
  if (!el) return
  if (isOverview.value) state.wsScale = fitLayoutRows(allRows ? rows.value : rows.value.slice(0, 1), el.clientWidth, el.clientHeight)
  else zoomToFitFormat(state.activeKey, { width: el.clientWidth, height: el.clientHeight })
  el.scrollTo({ top: 0, left: 0 })
}

async function fitAllArtboards() {
  setLayoutView('all')
  await nextTick()
  fitWorkspace(true)
}

function editSize(key: string) {
  setLayoutView('single', key)
}

function setArtboardRef(key: string, el: any) {
  if (el) artboardRefs.value[key] = el
  else delete artboardRefs.value[key]
}

function getActiveArtboardEl(): HTMLElement | null {
  const comp = artboardRefs.value[state.activeKey]
  return comp?.artboardEl || null
}

defineExpose({ getActiveArtboardEl, fitAllArtboards, fitWorkspace, artboardRefs })

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

function isBrandButtonDrag(event: DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes(BRAND_BUTTON_DRAG_TYPE)
}

function onCanvasDragOver(event: DragEvent, key: string) {
  const isMedia = Array.from(event.dataTransfer?.types || []).includes(BANNER_MEDIA_DRAG_TYPE)
  if (importingMedia.value || (!isMedia && (!kit.value || !isBrandButtonDrag(event)))) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  dropTargetKey.value = key
}

function onCanvasDragLeave(event: DragEvent, key: string) {
  const target = event.currentTarget as HTMLElement
  if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return
  if (dropTargetKey.value === key) dropTargetKey.value = null
}

async function onCanvasDrop(event: DragEvent, key: string) {
  if (Array.from(event.dataTransfer?.types || []).includes(BANNER_MEDIA_DRAG_TYPE)) {
    event.preventDefault()
    event.stopPropagation()
    dropTargetKey.value = null
    const source = takeBannerMediaDrag(event.dataTransfer?.getData(BANNER_MEDIA_DRAG_TYPE) || '', state.project?.id)
    if (!source || importingMedia.value) return
    const point = brandButtonDropPoint(event.clientX, event.clientY, (event.currentTarget as HTMLElement).getBoundingClientRect(), state.wsScale)
    const project = state.project
    const slideId = currentSlide.value?.id
    const activeKey = state.activeKey
    const view = state.layoutView
    importingMedia.value = true
    try {
      const asset = source.kind === 'library' ? source.asset : (await $fetch<{ asset: BannerAsset }>('/api/agency/banner-studio/motorstack/media', {
        method: 'POST', body: { brandId: source.brandId, assetId: source.assetId, ...(source.model ? { model: source.model } : {}), ...(source.colour ? { colour: source.colour } : {}) }
      })).asset
      if (disposed) return
      if (state.project !== project || currentSlide.value?.id !== slideId || state.activeKey !== activeKey || state.layoutView !== view) {
        toast.add({ title: 'Design selection changed', description: 'The image is saved in Assets. Drag it onto the canvas again.', color: 'warning' })
        return
      }
      if (!asset?.url || !asset.mimeType) throw new Error('The media could not be verified. Try again.')
      const count = addMediaToLayouts(asset, key, point, view === 'all')
      toast.add({ title: 'Media added', description: `${asset.name} · ${count} ${count === 1 ? 'layout' : 'layouts'}`, color: 'success' })
    } catch (error) {
      toast.add({ title: 'Could not add media', description: apiErrorDescription(error, 'Drag the image onto the canvas again.'), color: 'error' })
    } finally {
      importingMedia.value = false
    }
    return
  }
  if (!isBrandButtonDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  dropTargetKey.value = null
  const data = parseBrandButtonDragData(event.dataTransfer?.getData(BRAND_BUTTON_DRAG_TYPE) || '')
  if (!data || !kit.value || data.kitId !== kit.value.id) {
    toast.add({ title: 'Brand kit changed', description: 'Choose the button again from the current kit.', color: 'warning' })
    return
  }
  const point = brandButtonDropPoint(event.clientX, event.clientY, (event.currentTarget as HTMLElement).getBoundingClientRect(), state.wsScale)
  if (!addBrandGuideButton(kit.value, data.variant, key, point)) return
  toast.add({ title: 'Brand button added', description: 'Edit its label in the inspector.', color: 'success' })
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
    aria-label="Design layouts canvas"
    class="banner-workspace w-full h-full overflow-auto p-8 bg-muted text-default"
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
    <p v-if="importingMedia" role="status" class="sticky top-0 z-20 mx-auto w-fit rounded-lg bg-elevated px-3 py-2 text-sm shadow">Adding media…</p>
    <div class="flex min-w-fit flex-col" :style="{ gap: `${WORKSPACE_GAP}px` }" @click.self="onCanvasClick">
      <div v-for="(row, rowIndex) in rows" :key="rowIndex"
        v-show="isOverview || row.some(format => format.key === state.activeKey)"
        class="flex min-w-fit items-center justify-center"
        :style="{ gap: `${WORKSPACE_GAP}px` }">
      <div
        v-for="format in row"
        :key="format.key"
        v-show="isOverview || format.key === state.activeKey"
        class="group flex shrink-0 flex-col items-center"
        :data-layout-key="format.key"
        @click.self="onCanvasClick"
      >
        <!-- Artboard wrapper with scale -->
        <div
          class="relative cursor-pointer rounded transition-shadow"
          :class="[
            state.activeKey === format.key ? 'ring-2 ring-primary' : 'ring-1 ring-default hover:ring-primary/50',
            dropTargetKey === format.key ? 'outline outline-2 outline-primary outline-offset-2' : ''
          ]"
          :style="{
            width: `${(format.w || 300) * state.wsScale}px`,
            height: `${(format.h || 250) * state.wsScale}px`,
          }"
          @click.stop="state.activeKey !== format.key ? setActiveArtboard(format.key) : undefined"
          @dragover="onCanvasDragOver($event, format.key)"
          @dragleave="onCanvasDragLeave($event, format.key)"
          @drop="onCanvasDrop($event, format.key)"
        >
          <!-- Inner at full resolution, scaled down -->
          <div
            :style="{
              transformOrigin: 'top left',
              transform: `scale(${state.wsScale})`,
              width: `${format.w || 300}px`,
              height: `${format.h || 250}px`,
            }"
          >
            <BannerArtboard
              :ref="(el: any) => setArtboardRef(format.key, el)"
              :format-key="format.key"
              :is-active="state.activeKey === format.key"
            />
          </div>

          <!-- Collaboration cursors overlay -->
          <BannerCollaborationCursors
            :scale="state.wsScale"
            :active-format-key="format.key"
          />

          <!-- Comment overlay (on top of artboard) -->
          <BannerCommentOverlay
            v-if="props.projectId && props.projectId !== 'new'"
            :format-key="format.key"
            :project-id="props.projectId"
            :scale="state.wsScale"
          />
        </div>
        <div class="flex flex-col items-center justify-center gap-1.5" :style="{ height: `${WORKSPACE_FOOTER}px`, width: `${Math.max(144, format.w * state.wsScale)}px` }">
          <UButton v-if="isOverview" :aria-label="`Edit size: ${layoutName(format)} ${format.w} × ${format.h}`"
            label="Edit size" icon="i-lucide-pencil" size="xs" color="neutral" variant="soft"
            class="w-full justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            @click.stop="editSize(format.key)" />
          <span class="max-w-full truncate rounded-full bg-elevated px-3 py-1 text-xs font-medium text-default"
            :title="`${layoutName(format)} · ${format.w} × ${format.h} px`">
            {{ layoutName(format) }} · {{ format.w }} × {{ format.h }} px
          </span>
        </div>
      </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.banner-workspace {
  background-image: radial-gradient(var(--ui-border-accented) 1px, transparent 1px);
  background-size: 24px 24px;
}
</style>
