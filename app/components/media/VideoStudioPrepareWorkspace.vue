<script setup lang="ts">
// The Prepare workspace: the picture takes the stage, tools sit beside it.
// Presentational only. MediaAssetHarness owns the state and the API calls.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import VideoStudioAssetActivityPanel from '~~/app/components/media/VideoStudioAssetActivityPanel.vue'

interface ToolOption {
  label: string
  value: string
  description?: string
}

interface AssetOption {
  label: string
  value: string
}

interface SelectedJob {
  id: string
  action: string
  modelId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked'
  errorMessage?: string | null
}

interface ActivityJob extends SelectedJob {
  assetLabel?: string | null
  createdAt: string
}

interface AssetDerivative {
  id: string
  kind: string
  r2Key: string
  metadata: Record<string, unknown>
}

const props = defineProps<{
  assetOptions: AssetOption[]
  selectedItemId: string | null
  selectedItemAssetId?: string | null
  toolOptions: ToolOption[]
  selectedAction: string
  toolPrompt: string
  brushSize: number
  maskToolEnabled?: boolean
  // Still shown under the mask. The video is the fallback when an asset has no still.
  previewImageUrl?: string | null
  previewVideoUrl?: string | null
  // Pixel size of the mask canvas. It always matches the picture's own shape.
  frameWidth: number
  frameHeight: number
  hasMaskStroke?: boolean
  canUndoMask?: boolean
  running?: boolean
  loading?: boolean
  selectedItemJobs: SelectedJob[]
  selectedDerivatives: AssetDerivative[]
  loadingDerivatives?: boolean
  addingDerivativeId?: string | null
  recentJobs: ActivityJob[]
}>()

const emit = defineEmits<{
  (event: 'update:selectedItemId' | 'update:selectedAction' | 'update:toolPrompt', value: string): void
  (event: 'update:brushSize', value: number): void
  (event: 'run' | 'clear-mask' | 'undo-mask' | 'refresh' | 'preview-image-error' | 'preview-video-error'): void
  (event: 'frame-size', value: { width: number, height: number }): void
  (event: 'mask-canvas-ready', value: HTMLCanvasElement | null): void
  (event: 'start-mask-stroke' | 'move-mask-stroke' | 'end-mask-stroke', value: PointerEvent): void
  (event: 'add-derivative-to-timeline' | 'add-derivative-to-bucket', value: AssetDerivative): void
}>()

const maskCanvas = ref<HTMLCanvasElement | null>(null)
const root = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const { width: rootWidth } = useElementSize(root)
const { width: stageWidth, height: stageHeight } = useElementSize(stage)
// Matches the @4xl container breakpoint below: three columns from 896px.
const stacked = computed(() => rootWidth.value > 0 && rootWidth.value < 896)

// Fit the picture inside the stage at its own shape, so a stroke lands where it is drawn.
const frameStyle = computed(() => {
  const ratio = props.frameWidth / Math.max(1, props.frameHeight)
  // Stacked (phones, narrow panes): the picture sets the height, capped so tools stay reachable.
  if (stacked.value) return { aspectRatio: `${props.frameWidth} / ${props.frameHeight}`, width: `min(100%, calc(60svh * ${ratio.toFixed(4)}))` }
  const availableWidth = Math.max(0, stageWidth.value)
  const availableHeight = Math.max(0, stageHeight.value)
  if (!availableWidth || !availableHeight) return { aspectRatio: `${props.frameWidth} / ${props.frameHeight}`, width: '100%' }
  const width = Math.min(availableWidth, availableHeight * ratio)
  return { width: `${Math.floor(width)}px`, height: `${Math.floor(width / ratio)}px` }
})

const selectedTool = computed(() => props.toolOptions.find(tool => tool.value === props.selectedAction) ?? null)
const runLabel = computed(() => selectedTool.value ? `Run ${selectedTool.value.label.toLowerCase()}` : 'Run')
const hasPreview = computed(() => Boolean(props.previewImageUrl || props.previewVideoUrl))

function jobStatusColor(status: SelectedJob['status']) {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'blocked') return 'error'
  if (status === 'running') return 'primary'
  return 'neutral'
}

function derivativeLabel(derivative: AssetDerivative) {
  const title = derivative.metadata?.title
  return typeof title === 'string' && title.trim() ? title.trim() : `${derivative.kind} result`
}

function onImageLoad(event: Event) {
  const image = event.target as HTMLImageElement
  if (image.naturalWidth && image.naturalHeight) emit('frame-size', { width: image.naturalWidth, height: image.naturalHeight })
}

function onVideoMetadata(event: Event) {
  const video = event.target as HTMLVideoElement
  if (video.videoWidth && video.videoHeight) emit('frame-size', { width: video.videoWidth, height: video.videoHeight })
}

watch(maskCanvas, canvas => emit('mask-canvas-ready', canvas), { flush: 'post' })
onMounted(() => emit('mask-canvas-ready', maskCanvas.value))
onBeforeUnmount(() => emit('mask-canvas-ready', null))
</script>

<template>
  <section ref="root" class="@container flex h-full min-h-0 flex-col" aria-label="Prepare asset">
    <div class="grid min-h-0 flex-1 grid-cols-1 @4xl:grid-cols-[232px_minmax(0,1fr)_264px] @4xl:grid-rows-[minmax(0,1fr)]">
      <!-- What to work on, and what to do to it. -->
      <div class="min-w-0 space-y-4 border-b border-default p-3 @4xl:overflow-y-auto @4xl:border-b-0 @4xl:border-r">
        <UFormField label="Asset">
          <USelectMenu
            :model-value="props.selectedItemId ?? undefined"
            :items="props.assetOptions"
            value-key="value"
            placeholder="Choose an asset"
            :loading="props.loading"
            :disabled="!props.assetOptions.length"
            size="sm"
            class="w-full"
            @update:model-value="value => emit('update:selectedItemId', String(value))"
          />
        </UFormField>
        <p v-if="!props.loading && !props.assetOptions.length" class="text-xs leading-snug text-muted">
          No project assets yet. Add footage or generate a clip, then come back to clean it up.
        </p>

        <div role="radiogroup" aria-label="Prepare tool" class="grid gap-1.5 @md:grid-cols-2 @4xl:grid-cols-1">
          <UButton
            v-for="tool in props.toolOptions"
            :key="tool.value"
            role="radio"
            :aria-checked="props.selectedAction === tool.value"
            :variant="props.selectedAction === tool.value ? 'soft' : 'outline'"
            :color="props.selectedAction === tool.value ? 'primary' : 'neutral'"
            block
            class="h-auto justify-start px-2.5 py-2 text-left"
            @click="emit('update:selectedAction', tool.value)"
          >
            <span class="min-w-0">
              <span class="block text-sm font-medium text-highlighted">{{ tool.label }}</span>
              <span v-if="tool.description" class="mt-0.5 block whitespace-normal text-xs font-normal leading-snug text-muted">{{ tool.description }}</span>
            </span>
          </UButton>
        </div>
      </div>

      <!-- The picture. -->
      <div class="@container/stage flex min-h-0 min-w-0 flex-col gap-2 p-3 @4xl:overflow-y-auto">
        <div v-if="props.maskToolEnabled" class="flex shrink-0 flex-wrap items-center gap-2">
          <p class="mr-auto text-xs text-muted">
            Paint over the part of the picture this tool should act on.
          </p>
          <UButton
            icon="i-lucide-undo-2"
            size="xs"
            variant="ghost"
            color="neutral"
            label="Undo"
            :disabled="!props.canUndoMask"
            @click="emit('undo-mask')"
          />
          <UButton
            icon="i-lucide-eraser"
            size="xs"
            variant="ghost"
            color="neutral"
            label="Clear"
            :disabled="!props.hasMaskStroke"
            @click="emit('clear-mask')"
          />
        </div>
        <p v-else class="shrink-0 text-xs text-muted">
          This tool works on the whole picture. No painting needed.
        </p>

        <div
          ref="stage"
          data-prepare-stage
          class="flex min-h-0 items-center justify-center overflow-hidden rounded-md bg-black @4xl:min-h-40 @4xl:flex-1"
        >
          <div data-prepare-frame class="relative overflow-hidden rounded bg-neutral-900" :style="frameStyle">
            <img
              v-if="props.previewImageUrl"
              :src="props.previewImageUrl"
              alt=""
              class="absolute inset-0 size-full object-fill"
              @load="onImageLoad"
              @error="emit('preview-image-error')"
            >
            <video
              v-else-if="props.previewVideoUrl"
              :src="props.previewVideoUrl"
              class="absolute inset-0 size-full object-fill"
              preload="metadata"
              muted
              playsinline
              @loadedmetadata="onVideoMetadata"
              @error="emit('preview-video-error')"
            />
            <p
              v-if="!hasPreview && !props.hasMaskStroke"
              class="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-white/60"
            >
              {{ props.selectedItemAssetId ? 'This asset has no preview picture yet.' : 'Choose an asset to start.' }}
            </p>
            <canvas
              v-show="props.maskToolEnabled"
              ref="maskCanvas"
              :width="props.frameWidth"
              :height="props.frameHeight"
              class="absolute inset-0 size-full cursor-crosshair touch-none"
              aria-label="Mask painting area"
              @pointerdown="event => emit('start-mask-stroke', event)"
              @pointermove="event => emit('move-mask-stroke', event)"
              @pointerup="event => emit('end-mask-stroke', event)"
              @pointercancel="event => emit('end-mask-stroke', event)"
              @pointerleave="event => emit('end-mask-stroke', event)"
            />
          </div>
        </div>

        <!-- Instruction and Run sit directly under the picture they act on. -->
        <div class="grid shrink-0 gap-3 rounded-md border border-default bg-elevated p-3 @2xl/stage:grid-cols-[minmax(0,1fr)_auto] @2xl/stage:items-end">
          <div class="grid min-w-0 gap-3 @2xl/stage:grid-cols-[150px_minmax(0,1fr)]">
            <UFormField v-if="props.maskToolEnabled" :label="`Brush size ${props.brushSize}`">
              <USlider
                :model-value="props.brushSize"
                :min="8"
                :max="72"
                :step="2"
                class="py-2"
                @update:model-value="value => emit('update:brushSize', Number(value))"
              />
            </UFormField>
            <UFormField label="Instruction" :class="props.maskToolEnabled ? '' : '@2xl/stage:col-span-2'">
              <UTextarea
                :model-value="props.toolPrompt"
                :rows="2"
                autoresize
                placeholder="Describe what to lift, erase or keep"
                class="w-full"
                @update:model-value="value => emit('update:toolPrompt', String(value))"
              />
            </UFormField>
          </div>
          <UButton
            icon="i-lucide-wand-sparkles"
            color="primary"
            :label="runLabel"
            :loading="props.running"
            :disabled="!props.selectedItemAssetId"
            class="justify-center"
            @click="emit('run')"
          />
        </div>
      </div>

      <!-- What came back. -->
      <div class="min-w-0 space-y-4 border-t border-default p-3 @4xl:overflow-y-auto @4xl:border-l @4xl:border-t-0">
        <div>
          <h4 class="text-sm font-medium text-highlighted">
            Results for this asset
          </h4>
          <div v-if="props.loadingDerivatives" class="mt-2 space-y-1">
            <USkeleton v-for="n in 2" :key="n" class="h-9 w-full rounded-md" />
          </div>
          <p v-else-if="!props.selectedDerivatives.length && !props.selectedItemJobs.length" class="mt-1 text-xs leading-snug text-muted">
            Nothing yet. Results appear here when a tool finishes, ready to add to the timeline.
          </p>
          <div v-if="props.selectedDerivatives.length" class="mt-2 space-y-1.5">
            <div
              v-for="derivative in props.selectedDerivatives"
              :key="derivative.id"
              class="rounded-md border border-default bg-elevated p-2"
            >
              <div class="flex items-center gap-2">
                <UBadge
                  :label="derivative.kind"
                  size="xs"
                  variant="subtle"
                  color="neutral"
                />
                <span class="min-w-0 flex-1 truncate text-xs text-default">{{ derivativeLabel(derivative) }}</span>
              </div>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <UButton
                  icon="i-lucide-list-plus"
                  size="xs"
                  variant="soft"
                  color="primary"
                  label="Add to timeline"
                  @click="emit('add-derivative-to-timeline', derivative)"
                />
                <UButton
                  icon="i-lucide-folder-plus"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  label="Keep in assets"
                  :loading="props.addingDerivativeId === derivative.id"
                  @click="emit('add-derivative-to-bucket', derivative)"
                />
              </div>
            </div>
          </div>
          <div v-if="props.selectedItemJobs.length" class="mt-2 space-y-1.5">
            <div v-for="job in props.selectedItemJobs" :key="job.id" class="text-xs">
              <div class="flex items-center gap-2">
                <UBadge
                  :label="job.status"
                  size="xs"
                  :color="jobStatusColor(job.status)"
                  variant="subtle"
                />
                <span class="min-w-0 flex-1 truncate text-muted">{{ job.action }}</span>
              </div>
              <p v-if="job.errorMessage" class="mt-0.5 break-words leading-snug text-muted">
                {{ job.errorMessage }}
              </p>
            </div>
          </div>
        </div>

        <VideoStudioAssetActivityPanel :jobs="props.recentJobs" @refresh="emit('refresh')" />
      </div>
    </div>
  </section>
</template>
