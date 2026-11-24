<script setup lang="ts">
// Inspector panel for an animated-layers overlay clip: change a layer's move, or
// (opt-in, paid) replace one layer with a generated clip. Shows nothing for any
// other overlay.
import { computed, ref, watch } from 'vue'
import type { Layer } from '~~/app/types/banner-studio'
import { apiErrorDescription } from '~~/app/utils/apiError'
import { isLayerComposition, useLayerAnimation, type LayerCompositionProject } from '~~/app/composables/useLayerAnimation'
import {
  LAYER_MOTION_PRESETS,
  hasGeneratedLayerMotion,
  layerMotionCostCents,
  layerMotionPresetOf,
  layerMotionPrompt,
  layerMotionRegion,
  type FrameSize,
  type LayerMotionPresetId
} from '~~/app/utils/video/layerAnimation'

const props = defineProps<{
  videoProjectId: string
  bannerProjectId: string
  formatKey: string | null
  frame: FrameSize
  /** The generated-motion model, when this project may use it. Null hides the option. */
  motionModel: { label: string, centsPerSecond: number, durationsSeconds: number[] } | null
  motionUnavailableReason?: string | null
}>()

const emit = defineEmits<{
  /** The composition was saved; the preview should reload it. */
  (event: 'changed', bannerProjectId: string): void
  (event: 'generated'): void
}>()

const toast = useToast()
const layerAnimation = useLayerAnimation()
const project = ref<LayerCompositionProject | null>(null)
const savingLayerId = ref<number | null>(null)

const CUSTOM = 'custom'
const presetItems = LAYER_MOTION_PRESETS.map(preset => ({ label: preset.label, value: preset.id }))

watch(() => props.bannerProjectId, async (id) => {
  project.value = null
  if (!id) return
  try {
    const loaded = await layerAnimation.loadComposition(id)
    if (props.bannerProjectId === id) project.value = isLayerComposition(loaded) ? loaded : null
  } catch {
    // Not readable: the clip inspector above already covers an ordinary overlay.
  }
}, { immediate: true })

const formatKey = computed(() => props.formatKey || Object.keys(project.value?.canvasData ?? {})[0] || null)
const artboard = computed(() => (formatKey.value ? project.value?.canvasData[formatKey.value] : null) ?? null)
// Top layer first, the way a layer stack reads.
const layers = computed(() => [...(artboard.value?.layers ?? [])].filter(layer => layer.type !== 'audio').sort((a, b) => b.zIndex - a.zIndex))
const lowestZ = computed(() => Math.min(...layers.value.map(layer => layer.zIndex)))

function presetValue(layer: Layer): string {
  return layerMotionPresetOf(layer) ?? CUSTOM
}
function itemsFor(layer: Layer) {
  return presetValue(layer) === CUSTOM ? [{ label: 'Edited by hand', value: CUSTOM }, ...presetItems] : presetItems
}

async function setPreset(layer: Layer, value: string) {
  if (!project.value || !formatKey.value || value === CUSTOM || value === presetValue(layer)) return
  savingLayerId.value = layer.id
  try {
    project.value = await layerAnimation.setLayerPreset(project.value, formatKey.value, layer.id, value as LayerMotionPresetId, props.frame)
    emit('changed', project.value.id)
  } catch (error) {
    toast.add({ title: 'Could not change the motion', description: apiErrorDescription(error), color: 'error' })
  } finally {
    savingLayerId.value = null
  }
}

// ─── Generated motion (opt-in, paid) ─────────────────────────────────────────
const motionOn = ref(false)
const confirmOpen = ref(false)
const motionLayer = ref<Layer | null>(null)
const motionPrompt = ref('')
const motionSeconds = ref(5)
const motionStatus = ref('')
const generating = ref(false)

const motionCost = computed(() => props.motionModel ? `US$${(layerMotionCostCents(motionSeconds.value, props.motionModel.centsPerSecond) / 100).toFixed(2)}` : '')
const motionLengthItems = computed(() => (props.motionModel?.durationsSeconds ?? []).map(seconds => ({ label: `${seconds} seconds`, value: seconds })))
const motionRegion = computed(() => motionLayer.value
  ? layerMotionRegion({ x: motionLayer.value.x, y: motionLayer.value.y, w: motionLayer.value.w, h: motionLayer.value.h }, props.frame)
  : null)

function canGenerate(layer: Layer): boolean {
  return layer.type === 'image' && layer.zIndex > lowestZ.value
}

function askToGenerate(layer: Layer) {
  motionLayer.value = layer
  motionPrompt.value = layerMotionPrompt(layer.name)
  motionSeconds.value = props.motionModel?.durationsSeconds[0] ?? 5
  confirmOpen.value = true
}

async function generate() {
  const layer = motionLayer.value
  if (!layer || !project.value || !formatKey.value || !props.motionModel || generating.value) return
  generating.value = true
  motionStatus.value = 'Preparing the picture…'
  confirmOpen.value = false
  try {
    const result = await layerAnimation.generateLayerMotion({
      videoProjectId: props.videoProjectId,
      bannerProjectId: project.value.id,
      formatKey: formatKey.value,
      layerId: layer.id,
      frame: props.frame,
      prompt: motionPrompt.value.trim() || layerMotionPrompt(layer.name),
      durationSeconds: motionSeconds.value,
      onStatus: (status) => { motionStatus.value = status }
    }, project.value)
    project.value = result.project
    emit('changed', result.project.id)
    emit('generated')
    toast.add({ title: 'Generated motion placed', description: `${layer.name} now plays as a clip over the background.`, color: 'success' })
  } catch (error) {
    toast.add({ title: 'Generated motion was not placed', description: apiErrorDescription(error, (error as Error)?.message), color: 'error' })
  } finally {
    generating.value = false
    motionStatus.value = ''
  }
}
</script>

<template>
  <div v-if="project && artboard" class="mt-3 rounded-md border border-default bg-elevated p-3" data-layer-motion-panel>
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-medium text-highlighted">
          Layer motion
        </p>
        <p class="mt-0.5 text-xs leading-snug text-muted">
          Change how each layer moves. For keyframes, timing and position, open the layers in Banner Studio.
        </p>
      </div>
      <UButton
        :to="`/agency/banner-studio/${project.id}`"
        target="_blank"
        icon="i-lucide-square-arrow-out-up-right"
        size="xs"
        variant="ghost"
        color="neutral"
        label="Edit keyframes"
      />
    </div>

    <ul class="mt-3 space-y-2">
      <li v-for="layer in layers" :key="layer.id" class="grid grid-cols-[minmax(0,1fr)_9.5rem] items-center gap-2">
        <div class="min-w-0">
          <p class="truncate text-xs text-default">
            {{ layer.name }}
          </p>
          <UButton
            v-if="motionOn && props.motionModel && canGenerate(layer)"
            class="-ml-1.5 mt-0.5"
            icon="i-lucide-clapperboard"
            size="xs"
            variant="ghost"
            color="primary"
            label="Generate motion"
            :disabled="generating"
            @click="askToGenerate(layer)"
          />
        </div>
        <p v-if="hasGeneratedLayerMotion(layer)" class="text-right text-xs text-muted">
          Generated clip
        </p>
        <USelect
          v-else
          :model-value="presetValue(layer)"
          :items="itemsFor(layer)"
          value-key="value"
          size="xs"
          class="w-full"
          :loading="savingLayerId === layer.id"
          :disabled="savingLayerId !== null || generating"
          :aria-label="`Motion for ${layer.name}`"
          @update:model-value="value => setPreset(layer, String(value))"
        />
      </li>
    </ul>

    <div class="mt-3 border-t border-default pt-3">
      <USwitch
        v-model="motionOn"
        size="sm"
        label="Generated motion on one layer"
        :description="props.motionModel
          ? `Off by default. Makes a short clip from one layer with ${props.motionModel.label} and puts it back over the background. It is a paid step; you see the cost before anything runs.`
          : (props.motionUnavailableReason || 'Not available for this project.')"
        :disabled="!props.motionModel || generating"
      />
      <p v-if="generating" class="mt-2 flex items-center gap-1.5 text-xs text-muted" data-layer-motion-status>
        <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
        {{ motionStatus }}
      </p>
    </div>

    <UModal
      v-model:open="confirmOpen"
      :title="`Generate motion for ${motionLayer?.name ?? 'this layer'}`"
      description="One short clip is made from this layer and the background behind it, then placed back on the same spot."
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="What should move" help="Keep the camera still: the clip has to line up with the picture around it.">
            <UTextarea
              v-model="motionPrompt"
              :rows="5"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Clip length" help="A clip shorter than the composition repeats.">
            <USelect
              v-model="motionSeconds"
              :items="motionLengthItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UAlert
            color="warning"
            variant="subtle"
            icon="i-lucide-wallet"
            :title="`This costs about ${motionCost}`"
            :description="`${props.motionModel?.label ?? 'The model'} is billed per second${motionRegion ? `, at ${motionRegion.aspectRatio}` : ''}. The charge applies even if you do not keep the result, and counts against the project's generation budget.`"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="confirmOpen = false"
          />
          <UButton
            :label="`Generate for ${motionCost}`"
            icon="i-lucide-clapperboard"
            color="primary"
            data-confirm-layer-motion
            @click="generate"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
