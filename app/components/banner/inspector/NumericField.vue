<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, watch } from 'vue'
import type { Layer } from '~/types/banner-studio'

const props = withDefaults(defineProps<{
  property: 'paddingH' | 'paddingV'
  label: string
  defaultValue?: number
}>(), { defaultValue: 0 })

const { state, selectedLayer, updateLayer } = useBannerStudio()
const realtime = useBannerRealtime()
const value = computed(() => selectedLayer.value?.[props.property] ?? props.defaultValue)
const disabled = computed(() => !selectedLayer.value || selectedLayer.value.locked
  || realtime.isLayerLockedByOther(selectedLayer.value.id))
let gesture: { layer: Layer, key: string, property: 'paddingH' | 'paddingV', before: number | undefined, start: number, x: number, pointerId?: number } | null = null

function begin() {
  if (disabled.value || !selectedLayer.value) return false
  gesture ??= { layer: selectedLayer.value, key: state.activeKey, property: props.property,
    before: selectedLayer.value[props.property], start: value.value, x: 0 }
  window.addEventListener('blur', cancel)
  return true
}
function current() {
  return gesture && !disabled.value && gesture.layer === selectedLayer.value
    && gesture.key === state.activeKey && gesture.property === props.property
}
function preview(next: number | number[] | undefined) {
  if (typeof next !== 'number' || !Number.isFinite(next) || !begin()) return
  if (!current()) {
    finish(false)
    return
  }
  gesture!.layer[gesture!.property] = Math.max(0, Math.round(next))
}
function finish(commit = true) {
  const g = gesture
  const valid = current()
  gesture = null
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', end)
  window.removeEventListener('pointerup', endSlider)
  window.removeEventListener('pointercancel', cancel)
  window.removeEventListener('blur', cancel)
  if (!g) return
  const final = g.layer[g.property]
  // One undo entry for the entire gesture, with the actual original value.
  g.layer[g.property] = g.before
  if (commit && valid && final !== g.before) updateLayer(g.layer.id, { [g.property]: final })
}
async function commitSlider() {
  // Reka emits keyboard valueCommit before update:modelValue.
  await nextTick()
  finish()
}
function startSlider(event: PointerEvent) {
  if (event.button !== 0 || gesture || !begin()) return
  gesture!.pointerId = event.pointerId
  window.addEventListener('pointerup', endSlider)
  window.addEventListener('pointercancel', cancel)
}
function endSlider(event: PointerEvent) {
  if (event.pointerId === gesture?.pointerId) void commitSlider()
}
function start(event: PointerEvent) {
  if (event.button !== 0 || gesture || !begin()) return
  event.preventDefault()
  gesture!.x = event.clientX
  gesture!.pointerId = event.pointerId
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('blur', cancel)
}
function move(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.pointerId) return
  preview(gesture.start + event.clientX - gesture.x)
}
function end(event: PointerEvent) {
  if (event.pointerId === gesture?.pointerId) finish()
}
function cancel() {
  finish(false)
}
function set(next: string | number) {
  if (next === '' || !Number.isFinite(Number(next))) return
  preview(Number(next))
  finish()
}
function onKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  set(value.value + (['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1) * (event.shiftKey ? 10 : 1))
}
watch(() => [selectedLayer.value?.id, state.activeKey, props.property, disabled.value], cancel)
onBeforeUnmount(cancel)
</script>

<template>
  <UFormField :label="label" class="min-w-0" @keydown.stop>
    <UInput
      type="number"
      size="xs"
      class="w-full"
      :min="0"
      :model-value="value"
      :disabled="disabled"
      @update:model-value="set"
    >
      <template #leading>
        <UButton
          icon="i-lucide-move-horizontal"
          variant="ghost"
          color="neutral"
          size="xs"
          class="cursor-ew-resize touch-none select-none"
          :disabled="disabled"
          :aria-label="`Drag to adjust ${label.toLowerCase()}`"
          title="Drag left or right, or use arrow keys"
          @pointerdown="start"
          @keydown="onKey"
        />
      </template>
    </UInput>
    <USlider
      :model-value="value"
      :min="0"
      :max="Math.max(100, value)"
      :step="1"
      :disabled="disabled"
      :aria-label="label"
      size="xs"
      class="mt-3 mb-1"
      :ui="{ thumb: 'cursor-ew-resize' }"
      @pointerdown.capture="startSlider"
      @update:model-value="preview"
      @change="commitSlider"
      @pointercancel="cancel"
    />
  </UFormField>
</template>
