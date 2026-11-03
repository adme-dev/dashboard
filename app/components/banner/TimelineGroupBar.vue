<script setup lang="ts">
import { Button } from '~/components/ui/button'
import type { Layer } from '~/types/banner-studio'

const props = defineProps<{ id: string, name: string, layers: Layer[], start: number, end: number, scale: number }>()
const { moveGroup, canEditGroup } = useBannerTimelineGroups()
const { state } = useBannerStudio()
const { pauseTimeline } = useBannerTimeline()
const delta = ref(0)
let origin: number | null = null
function finish(event: MouseEvent) {
  if (origin === null) return
  const seconds = Math.round((event.clientX - origin) / props.scale * 20) / 20
  cancel()
  if (seconds) moveGroup(props.id, seconds)
}
function move(event: MouseEvent) {
  if (origin !== null) delta.value = event.clientX - origin
}
function cancel() {
  origin = null
  delta.value = 0
  window.removeEventListener('mousemove', move)
  window.removeEventListener('mouseup', finish)
  window.removeEventListener('blur', cancel)
  window.removeEventListener('keydown', escape)
}
function escape(event: KeyboardEvent) {
  if (event.key === 'Escape') cancel()
}
function begin(event: MouseEvent) {
  if (event.button !== 0 || !canEditGroup(props.layers)) return
  event.preventDefault()
  pauseTimeline()
  origin = event.clientX
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', finish)
  window.addEventListener('blur', cancel)
  window.addEventListener('keydown', escape)
}
function nudge(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  pauseTimeline()
  moveGroup(props.id, (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 0.5 : 0.05))
}
watch(() => [props.id, state.activeKey, state.project?.id], cancel)
onBeforeUnmount(cancel)
</script>

<template>
  <div class="relative h-9 border-b border-default bg-elevated/50">
    <Button
      variant="secondary"
      size="xs"
      class="absolute top-1 h-7 cursor-grab overflow-hidden border border-default bg-accented text-muted active:cursor-grabbing"
      :style="{ left: `${start * scale}px`, width: `${Math.max(24, (end - start) * scale)}px`, transform: `translateX(${delta}px)` }"
      :aria-label="`Move ${name} on timeline`"
      :title="`${name} · Drag to move all members together`"
      :disabled="!canEditGroup(layers)"
      @mousedown="begin"
      @keydown="nudge"
    >
      <UIcon name="i-lucide-group" class="size-3 shrink-0" /><span class="truncate">{{ name }}</span>
    </Button>
  </div>
</template>
