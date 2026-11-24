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
  // False when no provider can run the tool yet. It stays listed, clearly marked, and cannot be run.
  available?: boolean
  unavailableReason?: string | null
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
  uploading?: boolean
  recentJobs: ActivityJob[]
}>()

const emit = defineEmits<{
  (event: 'update:selectedItemId' | 'update:selectedAction' | 'update:toolPrompt', value: string): void
  (event: 'update:brushSize', value: number): void
  (event: 'run' | 'clear-mask' | 'undo-mask' | 'refresh' | 'preview-image-error' | 'preview-video-error'): void
  (event: 'frame-size', value: { width: number, height: number }): void
  (event: 'mask-canvas-ready', value: HTMLCanvasElement | null): void
  // The video shown under the mask, when the asset has no still. Null when a still is shown.
  (event: 'preview-video-ready', value: HTMLVideoElement | null): void
  (event: 'start-mask-stroke' | 'move-mask-stroke' | 'end-mask-stroke', value: PointerEvent): void
  // A picture or video picked from disk, to become a library asset.
  (event: 'upload-file', value: File): void
  (event: 'add-derivative-to-timeline' | 'add-derivative-to-bucket' | 'animate-layers', value: AssetDerivative): void
}>()

const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime'
const fileInput = ref<HTMLInputElement | null>(null)
function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset so picking the same file again still fires.
  input.value = ''
  if (file) emit('upload-file', file)
}

const maskCanvas = ref<HTMLCanvasElement | null>(null)
const previewVideo = ref<HTMLVideoElement | null>(null)
const root = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const toolbar = ref<HTMLElement | null>(null)
const { width: rootWidth, height: rootHeight } = useElementSize(root)
const { width: stageWidth, height: stageHeight } = useElementSize(stage)
const { height: toolbarHeight } = useElementSize(toolbar)
// Matches the @4xl/prepare breakpoint below: three columns from 896px of workspace width.
// Every column class names that container. The picture column is a container too (for the
// toolbar above the picture), so an unnamed @4xl inside it measured the column, not the
// workspace, and the stage lost its height on screens narrower than about 1650px.
const stacked = computed(() => rootWidth.value > 0 && rootWidth.value < 896)

// Fit the picture inside the stage at its own shape, so a stroke lands where it is drawn.
const frameStyle = computed(() => {
  const ratio = props.frameWidth / Math.max(1, props.frameHeight)
  // Stacked (phones, narrow panes): the picture sets the height. It is capped so the picture
  // and the toolbar above it fit in the pane together: the whole picture can be painted, and
  // Undo and Run stay in view. The pane is short on a laptop because the timeline stays docked.
  if (stacked.value) {
    // 32px: the column's padding and the gap under the toolbar.
    const room = rootHeight.value - toolbarHeight.value - 32
    const visible = rootHeight.value > 0 ? `${Math.max(180, Math.floor(room))}px` : '60svh'
    return { aspectRatio: `${props.frameWidth} / ${props.frameHeight}`, width: `min(100%, calc(min(${visible}, 60svh) * ${ratio.toFixed(4)}))` }
  }
  const availableWidth = Math.max(0, stageWidth.value)
  const availableHeight = Math.max(0, stageHeight.value)
  if (!availableWidth || !availableHeight) return { aspectRatio: `${props.frameWidth} / ${props.frameHeight}`, width: '100%' }
  const width = Math.min(availableWidth, availableHeight * ratio)
  return { width: `${Math.floor(width)}px`, height: `${Math.floor(width / ratio)}px` }
})

const selectedTool = computed(() => props.toolOptions.find(tool => tool.value === props.selectedAction) ?? null)
const runLabel = computed(() => selectedTool.value ? `Run ${selectedTool.value.label.toLowerCase()}` : 'Run')
// Why Run is off, in the user's terms. Null when it can run.
const runBlockedReason = computed(() => {
  const tool = selectedTool.value
  if (tool && tool.available === false) return tool.unavailableReason || `${tool.label} is not available yet.`
  // An item kept before results became library assets has nothing the tools can open.
  if (props.selectedItemId && !props.selectedItemAssetId) return 'This item is not a library asset yet. Find it under Results for the asset it came from and press "Keep in assets" again, or upload the picture here.'
  if (!props.selectedItemAssetId) return 'Choose an asset first, or upload a picture or video.'
  if (props.selectedAction === 'erase-fill' && !props.hasMaskStroke) return 'Paint over what to erase first.'
  if (props.selectedAction === 'mask-lift' && !props.hasMaskStroke) return 'Paint over what to lift first.'
  return null
})
const hasPreview = computed(() => Boolean(props.previewImageUrl || props.previewVideoUrl))
// One line of guidance beside the paint controls: what is missing, or what happens next.
const stageHint = computed(() => {
  if (runBlockedReason.value) return runBlockedReason.value
  if (!props.maskToolEnabled) return 'This tool works on the whole picture. No painting needed.'
  return 'Paint more to add to the selection, or run it.'
})
// A video is shown only when the asset has no still. Erase then works on the painted frame.
const eraseOnVideo = computed(() => props.selectedAction === 'erase-fill' && !props.previewImageUrl && Boolean(props.previewVideoUrl))

function jobStatusColor(status: SelectedJob['status']) {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'blocked') return 'error'
  if (status === 'running') return 'primary'
  return 'neutral'
}

function derivativeNote(derivative: AssetDerivative) {
  const note = derivative.metadata?.note
  return typeof note === 'string' && note.trim() ? note.trim() : null
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
watch(previewVideo, video => emit('preview-video-ready', video), { flush: 'post' })
onMounted(() => {
  emit('mask-canvas-ready', maskCanvas.value)
  emit('preview-video-ready', previewVideo.value)
})
onBeforeUnmount(() => {
  emit('mask-canvas-ready', null)
  emit('preview-video-ready', null)
})
</script>

<template>
  <section ref="root" class="@container/prepare flex h-full min-h-0 flex-col" aria-label="Prepare asset">
    <!-- Stacked, the grid keeps its natural height and the pane scrolls. In three columns it fills the pane and each column scrolls. -->
    <div class="grid shrink-0 grid-cols-1 @4xl/prepare:min-h-0 @4xl/prepare:flex-1 @4xl/prepare:shrink @4xl/prepare:grid-cols-[232px_minmax(0,1fr)_264px] @4xl/prepare:grid-rows-[minmax(0,1fr)]">
      <!-- What to work on, and what to do to it. -->
      <div class="min-w-0 space-y-4 border-b border-default p-3 @4xl/prepare:overflow-y-auto @4xl/prepare:border-b-0 @4xl/prepare:border-r">
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
        <div>
          <UButton
            data-upload-asset
            icon="i-lucide-upload"
            size="sm"
            variant="outline"
            color="neutral"
            block
            :label="props.uploading ? 'Uploading…' : 'Upload a picture or video'"
            :loading="props.uploading"
            @click="fileInput?.click()"
          />
          <!-- Hidden file picker behind the button above, as in the Footage uploader. -->
          <input
            ref="fileInput"
            data-upload-input
            type="file"
            class="hidden"
            :accept="UPLOAD_ACCEPT"
            @change="onFilePicked"
          >
          <p class="mt-1.5 text-xs leading-snug text-muted">
            {{ !props.loading && !props.assetOptions.length
              ? 'No project assets yet. Upload a picture or video to prepare it, or generate a clip.'
              : 'JPEG, PNG or WebP up to 50MB, or MP4, WebM or MOV up to 500MB.' }}
          </p>
        </div>

        <div role="radiogroup" aria-label="Prepare tool" class="grid gap-1.5 @md/prepare:grid-cols-2 @4xl/prepare:grid-cols-1">
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
              <span class="flex flex-wrap items-center gap-1.5">
                <span class="text-sm font-medium text-highlighted">{{ tool.label }}</span>
                <UBadge
                  v-if="tool.available === false"
                  label="Not available yet"
                  size="xs"
                  variant="subtle"
                  color="neutral"
                />
              </span>
              <span v-if="tool.description" class="mt-0.5 block whitespace-normal text-xs font-normal leading-snug text-muted">{{ tool.description }}</span>
            </span>
          </UButton>
        </div>
      </div>

      <!-- The picture. Controls take one row above it and one below, so the picture gets the height. -->
      <div class="@container/stage flex min-w-0 flex-col gap-2 p-3 @4xl/prepare:min-h-0 @4xl/prepare:overflow-y-auto">
        <div ref="toolbar" data-prepare-toolbar class="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
          <template v-if="props.maskToolEnabled">
            <UFormField
              :label="`Brush ${props.brushSize}`"
              orientation="horizontal"
              class="shrink-0 items-center gap-2"
              :ui="{ label: 'text-xs font-normal text-muted tabular-nums', container: 'mt-0' }"
            >
              <USlider
                :model-value="props.brushSize"
                :min="8"
                :max="72"
                :step="2"
                size="sm"
                class="w-24"
                aria-label="Brush size"
                @update:model-value="value => emit('update:brushSize', Number(value))"
              />
            </UFormField>
            <UButton
              icon="i-lucide-undo-2"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Undo"
              title="Undo the last stroke"
              :disabled="!props.canUndoMask"
              @click="emit('undo-mask')"
            >
              <span class="hidden @2xl/stage:inline">Undo</span>
            </UButton>
            <UButton
              icon="i-lucide-eraser"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Clear"
              title="Clear everything painted"
              :disabled="!props.hasMaskStroke"
              @click="emit('clear-mask')"
            >
              <span class="hidden @2xl/stage:inline">Clear</span>
            </UButton>
          </template>
          <p
            :data-run-blocked="runBlockedReason ? '' : undefined"
            class="order-last w-full min-w-0 text-xs leading-snug text-muted @2xl/stage:order-none @2xl/stage:w-auto @2xl/stage:flex-1"
          >
            {{ stageHint }}
          </p>
          <UButton
            icon="i-lucide-wand-sparkles"
            color="primary"
            size="sm"
            :label="runLabel"
            :loading="props.running"
            :disabled="Boolean(runBlockedReason)"
            class="ml-auto shrink-0 justify-center"
            @click="emit('run')"
          />
        </div>

        <div
          ref="stage"
          data-prepare-stage
          class="flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-black @4xl/prepare:min-h-40 @4xl/prepare:flex-1 @4xl/prepare:shrink"
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
              ref="previewVideo"
              :src="props.previewVideoUrl"
              class="absolute inset-0 size-full object-fill"
              preload="auto"
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

        <UFormField
          label="Instruction"
          orientation="horizontal"
          class="shrink-0 items-start gap-3"
          :ui="{ label: 'pt-1.5 text-xs font-normal text-muted', container: 'mt-0 min-w-0 flex-1' }"
        >
          <UTextarea
            :model-value="props.toolPrompt"
            :rows="1"
            autoresize
            :maxrows="4"
            size="sm"
            placeholder="Optional. Say what to lift, erase or keep if the result misses it"
            class="w-full"
            @update:model-value="value => emit('update:toolPrompt', String(value))"
          />
        </UFormField>
        <p v-if="eraseOnVideo" class="shrink-0 text-xs leading-snug text-muted">
          This asset has no still, so erase uses the video frame you paint on and gives you a still. The video itself is not changed.
        </p>
      </div>

      <!-- What came back. -->
      <div class="min-w-0 space-y-4 border-t border-default p-3 @4xl/prepare:overflow-y-auto @4xl/prepare:border-l @4xl/prepare:border-t-0">
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
              <p v-if="derivativeNote(derivative)" class="mt-1 text-xs leading-snug text-muted">
                {{ derivativeNote(derivative) }}
              </p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <!-- A layer package is a set, not a picture: it goes to the timeline as animated layers. -->
                <UButton
                  v-if="derivative.kind === 'layer-package'"
                  data-animate-layers
                  icon="i-lucide-layers"
                  size="xs"
                  variant="soft"
                  color="primary"
                  label="Animate layers"
                  @click="emit('animate-layers', derivative)"
                />
                <UButton
                  v-else
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
