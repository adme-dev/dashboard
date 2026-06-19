<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface ActionOption {
  label: string
  value: string
}

interface ActionModel {
  id: string
  displayName: string
  defaultEnabled: boolean
}

interface SelectedJob {
  id: string
  action: string
  modelId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked'
}

interface AssetDerivative {
  id: string
  kind: string
  r2Key: string
  metadata: Record<string, unknown>
}

const props = defineProps<{
  selectedItemTitle: string
  selectedItemAssetId?: string | null
  actionOptions: ActionOption[]
  selectedAction: string
  toolPrompt: string
  runningExtraction?: boolean
  maskToolEnabled?: boolean
  selectedAssetThumbnailUrl?: string | null
  hasMaskStroke?: boolean
  brushMaskKey?: string
  uploadingMask?: boolean
  brushSize: number
  maskPreviewUrl?: string | null
  selectedActionModels: ActionModel[]
  selectedAssetActivityVisible?: boolean
  selectedDirectivePrompt?: string | null
  selectedItemJobs: SelectedJob[]
  selectedDerivatives: AssetDerivative[]
  loadingDerivatives?: boolean
  addingDerivativeId?: string | null
}>()

const emit = defineEmits<{
  (event: 'update:selectedAction', value: string): void
  (event: 'update:toolPrompt', value: string): void
  (event: 'update:brushMaskKey', value: string): void
  (event: 'update:brushSize', value: number): void
  (event: 'run'): void
  (event: 'clear-mask'): void
  (event: 'upload-mask'): void
  (event: 'mask-canvas-ready', value: HTMLCanvasElement | null): void
  (event: 'mask-preview-error'): void
  (event: 'start-mask-stroke', value: PointerEvent): void
  (event: 'move-mask-stroke', value: PointerEvent): void
  (event: 'end-mask-stroke', value: PointerEvent): void
  (event: 'add-derivative-to-timeline', value: AssetDerivative): void
  (event: 'add-derivative-to-bucket', value: AssetDerivative): void
}>()

const maskCanvas = ref<HTMLCanvasElement | null>(null)

function jobStatusColor(status: SelectedJob['status']) {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'blocked') return 'error'
  if (status === 'running') return 'primary'
  return 'neutral'
}

function derivativeLabel(derivative: AssetDerivative) {
  const title = derivative.metadata?.title
  return typeof title === 'string' && title.trim() ? title.trim() : derivative.r2Key
}

watch(maskCanvas, canvas => emit('mask-canvas-ready', canvas), { flush: 'post' })
onMounted(() => emit('mask-canvas-ready', maskCanvas.value))
onBeforeUnmount(() => emit('mask-canvas-ready', null))
</script>

<template>
  <section>
    <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="text-xs font-medium uppercase text-muted">Prepare asset</p>
        <p class="truncate text-sm font-medium text-highlighted">{{ props.selectedItemTitle }}</p>
      </div>
      <UButton
        icon="i-lucide-highlighter"
        size="xs"
        color="primary"
        variant="soft"
        label="Run"
        :loading="props.runningExtraction"
        :disabled="!props.selectedItemAssetId"
        @click="emit('run')"
      />
    </div>

    <div class="space-y-3">
      <div class="grid gap-2 xl:grid-cols-[220px_minmax(0,1fr)]">
        <UFormField label="Tool">
          <USelect
            :model-value="props.selectedAction"
            :items="props.actionOptions"
            value-key="value"
            size="sm"
            class="w-full"
            @update:model-value="value => emit('update:selectedAction', String(value))"
          />
        </UFormField>
        <UFormField label="Instruction">
          <UTextarea
            :model-value="props.toolPrompt"
            :rows="3"
            autoresize
            placeholder="Describe what to lift, erase, or preserve..."
            class="w-full"
            @update:model-value="value => emit('update:toolPrompt', String(value))"
          />
        </UFormField>
      </div>

      <div v-if="props.maskToolEnabled" class="rounded-md border border-default bg-elevated p-2">
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="text-xs font-medium text-muted">Highlighter mask</p>
          <div class="flex items-center gap-1">
            <UButton
              icon="i-lucide-eraser"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Clear mask"
              :disabled="!props.hasMaskStroke && !props.brushMaskKey"
              @click="emit('clear-mask')"
            />
            <UButton
              icon="i-lucide-upload-cloud"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Save mask"
              :loading="props.uploadingMask"
              :disabled="!props.hasMaskStroke || !props.selectedItemAssetId"
              @click="emit('upload-mask')"
            />
          </div>
        </div>
        <div class="relative mx-auto aspect-[9/16] h-[min(64vh,620px)] min-h-[360px] overflow-hidden rounded-md border border-default bg-black">
          <img
            v-if="props.selectedAssetThumbnailUrl"
            :src="props.selectedAssetThumbnailUrl"
            alt=""
            class="absolute inset-0 size-full object-cover opacity-80"
            @error="emit('mask-preview-error')"
          >
          <p
            v-if="!props.selectedAssetThumbnailUrl && !props.hasMaskStroke"
            class="absolute inset-0 flex items-center justify-center px-4 text-center text-[11px] text-white/50"
          >
            No preview for this asset - draw over the frame to mark the area
          </p>
          <canvas
            ref="maskCanvas"
            width="540"
            height="960"
            class="absolute inset-0 size-full touch-none cursor-crosshair"
            @pointerdown="event => emit('start-mask-stroke', event)"
            @pointermove="event => emit('move-mask-stroke', event)"
            @pointerup="event => emit('end-mask-stroke', event)"
            @pointercancel="event => emit('end-mask-stroke', event)"
            @pointerleave="event => emit('end-mask-stroke', event)"
          />
        </div>
        <div class="mt-2 flex items-center gap-2">
          <UIcon name="i-lucide-highlighter" class="size-4 text-muted" />
          <USlider
            :model-value="props.brushSize"
            :min="8"
            :max="72"
            :step="2"
            class="flex-1"
            @update:model-value="value => emit('update:brushSize', Number(value))"
          />
          <span class="w-8 text-right text-xs tabular-nums text-muted">{{ props.brushSize }}</span>
        </div>
        <p v-if="props.brushMaskKey" class="mt-2 truncate text-[11px] text-muted">{{ props.brushMaskKey }}</p>
        <img v-if="props.maskPreviewUrl" :src="props.maskPreviewUrl" alt="" class="mt-2 h-10 rounded border border-default bg-black object-contain">
      </div>

      <UFormField v-else label="Brush mask key">
        <UInput
          :model-value="props.brushMaskKey"
          placeholder="Optional R2 mask key"
          size="sm"
          class="w-full"
          @update:model-value="value => emit('update:brushMaskKey', String(value))"
        />
      </UFormField>

      <div class="rounded-md border border-default bg-elevated p-2">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs font-medium text-muted">Available models</p>
          <UBadge :label="`${props.selectedActionModels.length}`" size="xs" variant="subtle" color="neutral" />
        </div>
        <div class="mt-1 flex flex-wrap gap-1">
          <UBadge
            v-for="model in props.selectedActionModels"
            :key="model.id"
            :label="model.displayName"
            size="xs"
            :color="model.defaultEnabled ? 'primary' : 'neutral'"
            variant="subtle"
          />
        </div>
        <p v-if="!props.selectedActionModels.length" class="mt-1 text-[11px] text-muted">
          No gateway model is mapped to this action yet.
        </p>
      </div>

      <div v-if="props.selectedAssetActivityVisible" class="rounded-md border border-default bg-elevated p-2">
        <p class="text-xs font-medium text-muted">Selected asset activity</p>
        <p v-if="props.selectedDirectivePrompt" class="mt-1 line-clamp-2 text-xs text-default">{{ props.selectedDirectivePrompt }}</p>
        <div v-if="props.selectedItemJobs.length" class="mt-2 space-y-1">
          <div v-for="job in props.selectedItemJobs" :key="job.id" class="flex items-center gap-2 text-xs">
            <UBadge :label="job.status" size="xs" :color="jobStatusColor(job.status)" variant="subtle" />
            <span class="min-w-0 flex-1 truncate text-muted">{{ job.action }} · {{ job.modelId }}</span>
          </div>
        </div>
        <div v-if="props.loadingDerivatives" class="mt-2 space-y-1">
          <USkeleton v-for="n in 2" :key="n" class="h-7 w-full rounded-md" />
        </div>
        <div v-else-if="props.selectedDerivatives.length" class="mt-2 space-y-1">
          <div
            v-for="derivative in props.selectedDerivatives"
            :key="derivative.id"
            class="flex items-center gap-2 rounded-md border border-default bg-default/40 px-2 py-1"
          >
            <UBadge :label="derivative.kind" size="xs" variant="subtle" color="neutral" />
            <span class="min-w-0 flex-1 truncate text-xs text-muted">{{ derivativeLabel(derivative) }}</span>
            <UTooltip text="Add derivative to timeline">
              <UButton
                icon="i-lucide-list-plus"
                size="xs"
                variant="ghost"
                color="primary"
                aria-label="Add derivative to timeline"
                @click="emit('add-derivative-to-timeline', derivative)"
              />
            </UTooltip>
            <UTooltip text="Reuse derivative in generated bucket">
              <UButton
                icon="i-lucide-folder-plus"
                size="xs"
                variant="ghost"
                color="neutral"
                :loading="props.addingDerivativeId === derivative.id"
                aria-label="Reuse derivative in generated bucket"
                @click="emit('add-derivative-to-bucket', derivative)"
              />
            </UTooltip>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
