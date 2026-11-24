<script setup lang="ts">
// Animate layers: choose a starting move for each layer of a Separate layers
// result, then place the lot on the overlay lane. Presentational; the editor
// owns the calls.
import { computed, ref, watch } from 'vue'
import {
  DEFAULT_LAYER_MOTION_TIMING,
  LAYER_MOTION_PRESETS,
  autoMotionPresetFor,
  defaultLayerFit,
  layerMotionPreset,
  type FrameSize,
  type LayerFit,
  type LayerMotionPresetId,
  type LayerPackage
} from '~~/app/utils/video/layerAnimation'

const props = defineProps<{
  pkg: LayerPackage | null
  frame: FrameSize
  busy?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  (event: 'animate', payload: { fit: LayerFit, durationSec: number, presets: Record<string, LayerMotionPresetId | 'auto'> }): void
}>()

const AUTO = 'auto'
const LENGTH_ITEMS = [4, 6, 8, 10].map(seconds => ({ label: `${seconds} seconds`, value: seconds }))
const FIT_ITEMS: Array<{ label: string, value: LayerFit }> = [
  { label: 'Fill the frame', value: 'cover' },
  { label: 'Show the whole picture', value: 'contain' }
]

const durationSec = ref(DEFAULT_LAYER_MOTION_TIMING.durationSec)
const fit = ref<LayerFit>('cover')
const presets = ref<Record<string, LayerMotionPresetId | 'auto'>>({})

interface Row { key: string, name: string, detail: string, auto: LayerMotionPresetId }

// Listed the way a layer stack reads: the top layer first, the background last.
const rows = computed<Row[]>(() => {
  const pkg = props.pkg
  if (!pkg) return []
  const layers = [...pkg.layers].reverse().map(layer => ({
    key: layer.derivativeId, name: layer.name, detail: layer.kind, auto: autoMotionPresetFor(layer.kind, 'layer')
  }))
  return pkg.base
    ? [...layers, { key: 'base', name: 'Background', detail: 'the picture without the layers', auto: autoMotionPresetFor(null, 'base') }]
    : layers
})

function itemsFor(row: Row) {
  return [
    { label: `Auto (${layerMotionPreset(row.auto)!.label.toLowerCase()})`, value: AUTO },
    ...LAYER_MOTION_PRESETS.map(preset => ({ label: preset.label, value: preset.id }))
  ]
}

const sameShape = computed(() => props.pkg ? defaultLayerFit(props.pkg, props.frame) === 'cover' : true)
const fitHelp = computed(() => {
  if (!props.pkg) return ''
  if (fit.value === 'cover') return sameShape.value ? 'The picture covers the frame.' : 'The picture is cropped to cover the frame. Layers near the edge may be cut off.'
  return sameShape.value ? 'The picture sits inside the frame.' : 'The whole picture is kept, with empty bands where the shapes differ.'
})

watch([open, () => props.pkg?.id], ([isOpen]) => {
  if (!isOpen || !props.pkg) return
  durationSec.value = DEFAULT_LAYER_MOTION_TIMING.durationSec
  fit.value = defaultLayerFit(props.pkg, props.frame)
  presets.value = Object.fromEntries(rows.value.map(row => [row.key, AUTO]))
}, { immediate: true })

function submit() {
  if (!props.pkg || props.busy) return
  emit('animate', { fit: fit.value, durationSec: durationSec.value, presets: { ...presets.value } })
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Animate layers"
    description="Puts the background and each layer on the overlay lane where it sat in the picture, back to front, each with a starting move. Everything can be changed afterwards."
    :dismissible="!props.busy"
  >
    <template #body>
      <div v-if="props.pkg" class="space-y-5">
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Length">
            <USelect
              v-model="durationSec"
              :items="LENGTH_ITEMS"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Fit to the video frame" :help="fitHelp">
            <USelect
              v-model="fit"
              :items="FIT_ITEMS"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>

        <div>
          <p class="text-sm font-medium text-highlighted">
            Motion
          </p>
          <p class="mt-0.5 text-xs leading-snug text-muted">
            Auto picks by what each layer is. Text and prices come in one after another.
          </p>
          <ul class="mt-3 divide-y divide-default rounded-md border border-default">
            <li v-for="row in rows" :key="row.key" class="grid grid-cols-[minmax(0,1fr)_11rem] items-center gap-3 px-3 py-2">
              <div class="min-w-0">
                <p class="truncate text-sm text-default">
                  {{ row.name }}
                </p>
                <p class="truncate text-xs text-muted">
                  {{ row.detail }}
                </p>
              </div>
              <USelect
                v-model="presets[row.key]"
                :items="itemsFor(row)"
                value-key="value"
                size="sm"
                class="w-full"
                :aria-label="`Motion for ${row.name}`"
              />
            </li>
          </ul>
          <p v-if="props.pkg.partial" class="mt-2 text-xs leading-snug text-muted">
            Some parts of this picture did not separate, so they are not in the list.
          </p>
          <p v-if="!props.pkg.base" class="mt-2 text-xs leading-snug text-muted">
            This result has no background, so the layers sit over whatever is on the video lane.
          </p>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="props.busy"
          @click="() => { open = false }"
        />
        <UButton
          label="Animate layers"
          icon="i-lucide-layers"
          color="primary"
          :loading="props.busy"
          :disabled="!props.pkg"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
