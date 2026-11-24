<script setup lang="ts">
const props = defineProps<{ src: string, duration: number, range: number[] }>()
const emit = defineEmits<{ 'update:range': [value: number[]] }>()
const host = ref<HTMLElement>()
const waveformState = ref<'loading' | 'ready' | 'error'>('loading')
watch(() => props.src, () => {
  waveformState.value = 'loading'
})
const valid = computed(() => props.range.length === 2 && props.range.every(Number.isFinite) && props.range[1]! > props.range[0]!)
const left = computed(() => valid.value ? props.range[0]! / props.duration * 100 : 0)
const width = computed(() => valid.value ? (props.range[1]! - props.range[0]!) / props.duration * 100 : 100)
let gesture: { mode: 'start' | 'end' | 'move', x: number, width: number, range: number[], id: number } | undefined
function detach() {
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', finish)
  window.removeEventListener('pointercancel', cancel)
  window.removeEventListener('blur', cancel)
  gesture = undefined
}
onBeforeUnmount(detach)
watch(() => [props.src, props.duration], detach)
function adjusted(mode: 'start' | 'end' | 'move', range: number[], delta: number) {
  const [start, end] = range as [number, number]
  const round = (n: number) => Math.round(n * 100) / 100
  if (mode === 'start') return [round(Math.max(0, Math.min(end - 0.01, start + delta))), end]
  if (mode === 'end') return [start, Math.min(props.duration, round(Math.max(start + 0.01, end + delta)))]
  const next = Math.max(0, Math.min(props.duration - (end - start), round(start + delta)))
  return [next, next + end - start]
}
function begin(event: PointerEvent, mode: 'start' | 'end' | 'move') {
  if (event.button !== 0 || !valid.value || !host.value) return
  event.preventDefault()
  detach()
  gesture = { mode, x: event.clientX, width: host.value.getBoundingClientRect().width, range: [...props.range], id: event.pointerId }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('blur', cancel)
}
function move(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.id || !gesture.width) return
  emit('update:range', adjusted(gesture.mode, gesture.range, (event.clientX - gesture.x) / gesture.width * props.duration))
}
function finish(event: PointerEvent) {
  if (event.pointerId !== gesture?.id) return
  move(event)
  detach()
}
function cancel() {
  if (gesture) emit('update:range', gesture.range)
  detach()
}
function nudge(event: KeyboardEvent, mode: 'start' | 'end' | 'move') {
  if (!valid.value || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  emit('update:range', adjusted(mode, props.range, (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : 0.1)))
}
</script>

<template>
  <div ref="host" aria-label="Audio waveform selection" class="relative h-28 rounded-lg border border-default bg-elevated">
    <BannerAudioWaveform
      :src="src"
      :span="duration"
      color="currentColor"
      class="pointer-events-none text-muted"
      @loaded="waveformState = 'ready'"
      @error="waveformState = 'error'"
    />
    <p v-if="waveformState !== 'ready'" role="status" class="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-muted">
      {{ waveformState === 'loading' ? 'Loading waveform…' : 'Waveform unavailable. Use the start and end controls to trim.' }}
    </p>
    <div class="absolute inset-y-2 min-w-1" :style="{ left: `${left}%`, width: `${width}%` }">
      <UButton
        aria-label="Move selected audio clip"
        color="primary"
        variant="soft"
        class="absolute inset-0 size-full cursor-grab touch-none rounded border-2 border-primary p-0 active:cursor-grabbing"
        @pointerdown="begin($event, 'move')"
        @keydown="nudge($event, 'move')"
      />
      <UButton
        aria-label="Trim audio start"
        icon="i-lucide-grip-vertical"
        color="primary"
        class="absolute -left-2 inset-y-0 w-4 cursor-ew-resize touch-none justify-center rounded-sm p-0"
        @pointerdown="begin($event, 'start')"
        @keydown="nudge($event, 'start')"
      />
      <UButton
        aria-label="Trim audio end"
        icon="i-lucide-grip-vertical"
        color="primary"
        class="absolute -right-2 inset-y-0 w-4 cursor-ew-resize touch-none justify-center rounded-sm p-0"
        @pointerdown="begin($event, 'end')"
        @keydown="nudge($event, 'end')"
      />
    </div>
  </div>
</template>
