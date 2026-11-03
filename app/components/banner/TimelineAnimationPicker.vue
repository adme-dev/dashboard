<script setup lang="ts">
import { Button as ShadcnButton } from '~/components/ui/button'
import { Tabs as ShadcnTabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs'
import { canRemoveTimelineAnimation, removalSampleTime, removeTimelineAnimation } from '~/utils/banner-timeline-remove'
import { applyTimelineEntrance } from '~/utils/banner-timeline-presets'
import { computed, ref, watch, nextTick } from 'vue'
import { ANIM_IN, ANIM_OUT, EASES } from '~/utils/banner-constants'
import { hasKeyframes, presetToKeyframes } from '~/composables/useBannerTimeline'
import type { AnimInType, AnimOutType, KeyframeProperty, Layer } from '~/types/banner-studio'
import { addEndAnimation, insertTimelineKeyframe, keyframeDefault, MIDDLE_ANIMATIONS, addMiddleAnimation } from '~/utils/banner-timeline-edit'
import { describeKeyframeMotion, timelinePhases, type TimelinePhase } from '~/utils/banner-timeline-phases'

const emit = defineEmits<{ dragStart: [event: MouseEvent], moveKey: [event: KeyboardEvent] }>()
const props = defineProps<{ layer: Layer, direction: 'in' | 'out', compact?: boolean, phase?: TimelinePhase, addAtEnd?: boolean, triggerLabel?: string }>()
const { state, selectLayer, updateLayer } = useBannerStudio()
const { inspectorTab } = useBannerInspector()
const { pauseTimeline, seekTo, currentLayerValue, previewAnimation, stopAnimationPreview, animationPreview } = useBannerTimeline()
const isPreviewing = computed(() => animationPreview?.value?.layerId === props.layer.id)
const open = ref(false)
const tab = ref('presets')
const search = ref('')
const pending = ref<string | null>(null)
const property = ref<KeyframeProperty>('opacity')
const frameIndex = ref('0')
const frameError = ref<string>()
const { isLayerLockedByOther } = useBannerRealtime()
const editable = computed(() => !props.layer.locked && !isLayerLockedByOther(props.layer.id))
const placement = ref<'in' | 'middle' | 'out' | null>(null)
const phasePlacement = computed(() => props.phase?.label.startsWith('Exit ·') ? 'out' : props.phase?.label.startsWith('Entry ·') ? 'in' : props.phase?.kind === 'hold' || props.phase?.kind === 'motion' ? 'middle' : props.direction)
const selectedDirection = computed(() => placement.value === 'out' ? 'out' : placement.value === 'in' ? 'in' : phasePlacement.value === 'out' ? 'out' : 'in')
const targetPhase = computed(() => {
  if (!placement.value) return props.phase
  const phases = timelinePhases(props.layer)
  if (placement.value === 'middle' && phasePlacement.value === 'middle' && props.phase) return props.phase
  if (placement.value === 'middle') return phases.filter(phase => phase.kind === 'hold').sort((a, b) => Math.abs(a.start - state.currentTime) - Math.abs(b.start - state.currentTime))[0]
  return phases.find(phase => phase.kind === (placement.value === 'in' ? 'entry' : 'exit') || phase.label.startsWith(placement.value === 'in' ? 'Entry ·' : 'Exit ·'))
})
const removablePhase = computed(() => targetPhase.value ?? (!isMiddle.value ? timelinePhases(props.layer).find(phase => phase.kind === (selectedDirection.value === 'in' ? 'entry' : 'exit')) : undefined))
const canRemove = computed(() => editable.value && canRemoveTimelineAnimation(props.layer, removablePhase.value))
const isMiddle = computed(() => placement.value ? placement.value === 'middle' : phasePlacement.value === 'middle')
const selectedPlacement = computed(() => isMiddle.value ? 'middle' : selectedDirection.value)
function setPlacement(value: 'in' | 'middle' | 'out') {
  placement.value = value
  tab.value = 'presets'
  search.value = ''
  pending.value = null
}
const keyframeTime = computed(() => Math.max(props.layer.startTime ?? 0, Math.min(props.layer.endTime ?? state.duration, state.currentTime)))
const isAudio = computed(() => props.layer.type === 'audio')
const isKeyframe = computed(() => hasKeyframes(props.layer))
const title = computed(() => isAudio.value ? 'Audio' : isMiddle.value ? 'Middle' : props.addAtEnd ? 'Build Out' : isKeyframe.value ? 'Animation' : selectedDirection.value === 'in' ? 'Build In' : 'Build Out')
const directionLabel = computed(() => isMiddle.value ? 'middle' : selectedDirection.value === 'in' ? 'entrance' : 'exit')
const presets = computed(() => (isMiddle.value ? MIDDLE_ANIMATIONS.filter(preset => !props.layer.motionPath?.length || !preset.properties.some(property => property === 'x' || property === 'y')) : selectedDirection.value === 'in' ? ANIM_IN : ANIM_OUT).filter(p => !(selectedDirection.value === 'out' && (props.addAtEnd || isKeyframe.value || placement.value === 'out') && p.id === 'none')).filter(p => p.label.toLowerCase().includes(search.value.trim().toLowerCase())))
const selectedId = computed(() => selectedDirection.value === 'in' && props.layer.wordPop ? 'wordPop' : selectedDirection.value === 'in' ? props.layer.animIn : (props.layer.animOut ?? 'fadeOut'))
const selectedLabel = computed(() => isAudio.value ? 'Sound' : isKeyframe.value ? describeKeyframeMotion(props.layer) : selectedId.value === 'wordPop' ? 'Words Pop' : ([...ANIM_IN, ...ANIM_OUT].find(p => p.id === selectedId.value)?.label ?? 'None'))
const blockLabel = computed(() => props.phase?.label ?? selectedLabel.value)
const blockDescription = computed(() => props.phase ? `${blockLabel.value} · ${props.phase.start.toFixed(2)}–${props.phase.end.toFixed(2)}s` : blockLabel.value)
const foreground = computed(() => props.phase?.kind === 'hold' ? 'var(--ui-text)' : '#ffffff')
const iconFor = (id: string) => ({ none: 'circle-slash', fadeIn: 'blend', fadeOut: 'blend', slideL: 'arrow-left', slideR: 'arrow-right', slideU: 'arrow-up', slideD: 'arrow-down', zoomIn: 'zoom-in', zoomOut: 'zoom-out', spinIn: 'rotate-cw', spinOut: 'rotate-cw', bounceIn: 'corner-right-up', elastic: 'move-horizontal', kenBurns: 'scan', wordPop: 'whole-word' }[id] || 'sparkles')
const propLabels: Record<KeyframeProperty, string> = { opacity: 'Opacity', x: 'Horizontal position', y: 'Vertical position', scaleX: 'Horizontal scale', scaleY: 'Vertical scale', rotation: 'Rotation' }
const tracks = computed(() => (Object.keys(propLabels) as KeyframeProperty[]).filter(p => !(props.layer.motionPath?.length && ['x', 'y'].includes(p))).map(p => ({ label: propLabels[p], value: p })))
const frames = computed(() => props.layer.keyframes?.[property.value] ?? [])
const frame = computed(() => frames.value[Number(frameIndex.value)])
const frameOptions = computed(() => frames.value.map((f, i) => ({ label: `${i + 1} · ${f.time.toFixed(2)}s`, value: String(i) })))
const easeOptions = computed(() => {
  const current = isKeyframe.value ? frame.value?.easing : selectedDirection.value === 'in' ? props.layer.wordPop?.ease || props.layer.ease : props.layer.animOutEase
  const options = [{ label: 'Linear', value: 'none' }, ...EASES.map(e => ({ label: `${e.label} · ${e.category}`, value: e.id }))]
  if (current && !options.some(e => e.value === current)) options.unshift({ label: `Custom · ${current}`, value: current })
  return options
})
const canWordPop = computed(() => !isMiddle.value && selectedDirection.value === 'in' && props.layer.type === 'text' && !props.layer.textRuns?.length && 'words pop'.includes(search.value.trim().toLowerCase()))
const duration = computed(() => state.sets[state.activeKey]?.playback?.duration ?? Math.max(3, props.layer.endTime ?? 3))
const pendingLabel = computed(() => pending.value === 'wordPop' ? 'Words Pop' : [...ANIM_IN, ...ANIM_OUT].find(p => p.id === pending.value)?.label)

watch(open, async (value) => {
  if (!value) {
    pending.value = null
    if (isPreviewing.value) stopAnimationPreview()
    return
  }
  placement.value = null
  tab.value = isAudio.value || (!props.triggerLabel && !props.addAtEnd && isKeyframe.value && !isMiddle.value) ? 'build' : 'presets'
  search.value = ''
  property.value = tracks.value.find(track => props.layer.keyframes?.[track.value]?.length)?.value ?? tracks.value[0]?.value ?? 'opacity'
  frameIndex.value = '0'
  if (props.phase && isKeyframe.value) {
    const phase = props.phase
    property.value = tracks.value.find(track => props.layer.keyframes?.[track.value]?.some((f, i, all) => i > 0 && f.value !== all[i - 1]!.value && f.time > phase.start && all[i - 1]!.time < phase.end))?.value ?? property.value
    await nextTick()
    if (open.value) frameIndex.value = String(Math.max(0, frames.value.findIndex(f => f.time >= phase.start)))
  }
})
watch(property, () => {
  frameError.value = undefined
  frameIndex.value = '0'
})
watch(tracks, (value) => {
  if (!value.some(p => p.value === property.value)) property.value = value[0]?.value ?? 'opacity'
})
watch(frames, (value) => {
  if (Number(frameIndex.value) >= value.length) frameIndex.value = '0'
})
defineExpose({ openPicker: () => {
  focusAnimation()
  open.value = true
} })
function setVolume(value: string | number) {
  if (!editable.value) return
  const n = Number(value)
  if (value === '' || !Number.isFinite(n)) return
  updateLayer(props.layer.id, { volume: Math.min(1, Math.max(0, n / 100)) })
}

function focusAnimation() {
  selectLayer(props.layer.id)
  inspectorTab.value = isAudio.value ? 'properties' : 'animation'
}
function applyPreset(id: string) {
  if (!editable.value) return
  const reset = isKeyframe.value ? { keyframes: undefined, motionPath: undefined, motionPathTweens: undefined, wordPop: undefined, animIn: 'none' as const, animOut: 'none' as const } : {}
  const change = id === 'wordPop'
    ? { animIn: 'none' as const, wordPop: props.layer.wordPop ?? { duration: 0.5, stagger: 0.1, ease: 'cubic-bezier(.21,.79,.09,.97)' } }
    : selectedDirection.value === 'in' ? { animIn: id as AnimInType, wordPop: undefined, ease: ANIM_IN.find(preset => preset.id === id)?.ease || 'power2.out' } : { animOut: id as AnimOutType }
  updateLayer(props.layer.id, { ...reset, ...change, animationClips: undefined })
  state.selectedKeyframe = null
  pending.value = null
  focusAnimation()
}
function choosePreset(id: string) {
  if (!editable.value) return
  if (!isMiddle.value && selectedDirection.value === 'out' && (props.addAtEnd || placement.value === 'out' || isKeyframe.value)) {
    const start = targetPhase.value?.start ?? Math.max(props.layer.startTime ?? 0, (props.layer.endTime ?? state.duration) - 0.5)
    pauseTimeline()
    seekTo(start)
    updateLayer(props.layer.id, addEndAnimation(props.layer, id as AnimOutType, property => currentLayerValue(props.layer, property), targetPhase.value && (targetPhase.value.kind === 'exit' || targetPhase.value.label.startsWith('Exit ·')) ? targetPhase.value : undefined))
    state.selectedKeyframe = null
    focusAnimation()
    open.value = false
    return
  }
  if (isMiddle.value && targetPhase.value) {
    const phase = targetPhase.value
    const at = phase.kind === 'motion' ? phase.start : Math.max(phase.start, Math.min(phase.end - Math.min(1.2, phase.end - phase.start), keyframeTime.value))
    pauseTimeline()
    seekTo(at)
    const source = hasKeyframes(props.layer) ? props.layer.keyframes! : presetToKeyframes(props.layer)
    updateLayer(props.layer.id, addMiddleAnimation(props.layer, phase, id, at, source, property => currentLayerValue?.(props.layer, property) ?? keyframeDefault(props.layer, property)))
    state.expandedKeyframeLayers.add(props.layer.id)
    state.selectedKeyframe = null
    open.value = false
    return
  }
  if (isMiddle.value) return
  if (isKeyframe.value && selectedDirection.value === 'in' && id !== 'none' && id !== 'wordPop' && !ANIM_IN.find(preset => preset.id === id)?.special) {
    const phase = targetPhase.value && (targetPhase.value.kind === 'entry' || targetPhase.value.label.startsWith('Entry ·')) ? targetPhase.value : undefined
    const end = phase?.end ?? Math.min(props.layer.endTime, props.layer.startTime + (props.layer.animInDur || 0.6))
    pauseTimeline()
    seekTo(end)
    updateLayer(props.layer.id, applyTimelineEntrance(props.layer, id as AnimInType, property => currentLayerValue(props.layer, property), phase))
    pending.value = null
    return
  }
  if (isKeyframe.value) {
    pending.value = id
    return
  }
  applyPreset(id)
}
function setTiming(value: string | number) {
  if (!editable.value) return
  const n = Number(value)
  if (value === '' || !Number.isFinite(n)) return
  const bounded = Math.min(Math.max(0.05, n), Math.max(0.05, (props.layer.endTime ?? 3) - (props.layer.startTime ?? 0)))
  updateLayer(props.layer.id, selectedDirection.value === 'in' ? props.layer.wordPop ? { wordPop: { ...props.layer.wordPop, duration: bounded } } : { animInDur: bounded } : { outDur: bounded })
}
function setStagger(value: string | number) {
  if (!editable.value) return
  const n = Number(value)
  if (value === '' || !Number.isFinite(n) || !props.layer.wordPop) return
  updateLayer(props.layer.id, { wordPop: { ...props.layer.wordPop, stagger: Math.min(5, Math.max(0, n)) } })
}
function setFrame(key: 'time' | 'value' | 'easing', value: string | number) {
  if (!editable.value) return
  if (!frame.value || value === '') return
  const number = Number(value)
  if (key !== 'easing' && !Number.isFinite(number)) return
  const bounded = key === 'time' ? Math.min(duration.value, Math.max(0, number)) : property.value === 'opacity' ? Math.min(1, Math.max(0, number)) : number
  if (key === 'time' && frames.value.some((f, i) => i !== Number(frameIndex.value) && f.time === bounded)) {
    frameError.value = 'Another keyframe already uses this time.'
    return
  }
  frameError.value = undefined
  const updated = { ...frame.value, [key]: key === 'easing' ? value : bounded }
  const next = frames.value.map((f, i) => i === Number(frameIndex.value) ? updated : { ...f }).sort((a, b) => a.time - b.time)
  updateLayer(props.layer.id, { keyframes: { ...props.layer.keyframes, [property.value]: next } })
  frameIndex.value = String(next.indexOf(updated))
  state.selectedKeyframe = { layerId: props.layer.id, property: property.value, index: Number(frameIndex.value) }
}
function setEase(value: string) {
  if (!editable.value) return
  if (isKeyframe.value) setFrame('easing', value)
  else updateLayer(props.layer.id, selectedDirection.value === 'in' ? props.layer.wordPop ? { wordPop: { ...props.layer.wordPop, ease: value } } : { ease: value } : { animOutEase: value })
}
function addKeyframe() {
  if (!editable.value || isAudio.value) return
  pauseTimeline()
  const at = Math.round(keyframeTime.value * 100) / 100
  seekTo(at)
  const value = currentLayerValue?.(props.layer, property.value) ?? keyframeDefault(props.layer, property.value)
  const source = hasKeyframes(props.layer) ? props.layer.keyframes : presetToKeyframes(props.layer)
  const next = insertTimelineKeyframe(props.layer, property.value, at, value, source)
  if (next.changed || !hasKeyframes(props.layer)) updateLayer(props.layer.id, { keyframes: next.keyframes })
  frameIndex.value = String(next.index)
  state.expandedKeyframeLayers.add(props.layer.id)
  state.selectedKeyframe = { layerId: props.layer.id, property: property.value, index: next.index }
}
function removeAnimation() {
  const phase = removablePhase.value
  if (!phase || !canRemove.value) return
  if (isPreviewing.value) stopAnimationPreview()
  pauseTimeline()
  seekTo(removalSampleTime(phase))
  updateLayer(props.layer.id, removeTimelineAnimation(props.layer, phase, property => currentLayerValue(props.layer, property)))
  state.selectedKeyframe = null
  open.value = false
}
function preview() {
  if (isPreviewing.value) stopAnimationPreview()
  else previewAnimation(props.layer.id, targetPhase.value ? { start: targetPhase.value.start, end: targetPhase.value.end } : selectedDirection.value === 'out' ? { start: Math.max(props.layer.startTime ?? 0, (props.layer.endTime ?? state.duration) - 0.5), end: props.layer.endTime ?? state.duration } : undefined)
}
onBeforeUnmount(() => {
  if (isPreviewing.value) stopAnimationPreview()
})
</script>

<template>
  <UPopover v-model:open="open" :content="{ side: 'top', align: selectedDirection === 'in' ? 'start' : 'end', sideOffset: 8 }">
    <UButton
      :aria-label="triggerLabel ? `${triggerLabel} for ${layer.name}` : phase ? `Edit ${blockDescription} for ${layer.name}` : isAudio ? `Edit audio for ${layer.name}` : isKeyframe ? `Edit ${selectedLabel} for ${layer.name}` : `Edit ${directionLabel} animation for ${layer.name}: ${selectedLabel}`"
      :title="triggerLabel || (phase && phase.kind !== 'hold' && phase.kind !== 'audio' ? `${blockDescription} · Drag left or right to move; click to edit` : blockDescription)"
      :aria-expanded="open"
      color="neutral"
      :variant="triggerLabel ? 'outline' : 'ghost'"
      size="xs"
      :disabled="!!triggerLabel && !editable"
      class="h-full min-h-0 w-full min-w-0 justify-start gap-1 overflow-hidden rounded-lg text-[11px] font-medium hover:bg-white/20 cursor-grab active:cursor-grabbing"
      :style="{ color: triggerLabel ? 'var(--ui-text)' : foreground }"
      :class="[compact ? 'px-0' : 'px-3', triggerLabel ? 'w-auto cursor-pointer py-1' : phase?.kind === 'hold' && phase.label === 'Hold' ? 'opacity-0 hover:opacity-100 focus:opacity-100' : '']"
      @mousedown.stop="emit('dragStart', $event)"
      @keydown="emit('moveKey', $event)"
      @click.stop="focusAnimation"
    >
      <UIcon :name="`i-lucide-${isAudio ? 'volume-2' : isKeyframe ? 'diamond' : iconFor(selectedId)}`" class="size-3 shrink-0" />
      <span v-if="!compact" class="truncate">{{ triggerLabel || blockLabel.replace(/^(Entry|Exit|Motion) · /, '') }}</span>
    </UButton>
    <template #content>
      <section
        :aria-label="`${title} for ${layer.name}`"
        class="@container flex max-h-[min(560px,calc(100dvh-2rem))] w-[380px] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-default bg-elevated shadow-xl"
        @click.stop
        @mousedown.stop
      >
        <div class="flex shrink-0 items-start justify-between gap-2 border-b border-default p-3">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-highlighted">
              {{ selectedPlacement === 'in' ? 'Entrance animation' : selectedPlacement === 'out' ? 'Exit animation' : title }}
            </p><p class="truncate text-xs text-muted">
              {{ layer.name }} · {{ isAudio && state.layoutView === 'all' && layer.linkId ? 'Linked layouts' : 'Current layout' }}
            </p>
            <p v-if="phase" class="mt-1 text-xs text-muted">
              {{ blockDescription }}
            </p>
            <p v-if="isMiddle" class="mt-1 text-xs text-muted">
              Hold keeps the layer visible between animations. Use Add exit at the end of its timeline to animate it out.
            </p>
            <p v-else-if="addAtEnd" class="mt-1 text-xs text-muted">
              Choose an exit effect, then drag its timeline block to adjust the timing.
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            aria-label="Close animation picker"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="() => { open = false }"
          />
        </div>
        <div
          v-if="!isAudio"
          class="flex gap-1 border-b border-default px-3 py-2"
          role="group"
          aria-label="Animation position"
        >
          <ShadcnButton
            v-for="position in ([{ value: 'in', label: 'Entrance' }, { value: 'middle', label: 'Middle' }, { value: 'out', label: 'Exit' }] as const)"
            :key="position.value"
            size="xs"
            :variant="selectedPlacement === position.value ? 'secondary' : 'ghost'"
            :aria-pressed="selectedPlacement === position.value"
            :class="selectedPlacement === position.value ? 'bg-primary/10 text-primary ring-1 ring-primary/30' : ''"
            class="flex-1"
            @click="setPlacement(position.value)"
          >
            {{ position.label }}
          </ShadcnButton>
        </div>
        <ShadcnTabs v-model="tab" class="min-h-0 overflow-y-auto p-3">
          <TabsList v-if="!isAudio" class="mb-2 w-full">
            <TabsTrigger value="presets">
              Presets
            </TabsTrigger><TabsTrigger value="build">
              Build
            </TabsTrigger>
          </TabsList>
          <TabsContent v-if="!isAudio" value="presets">
            <UFormField label="Search animations" class="mb-3">
              <UInput
                v-model="search"
                icon="i-lucide-search"
                placeholder="Find an animation"
                class="w-full"
                size="sm"
              />
            </UFormField>
            <UAlert
              v-if="isKeyframe && !isMiddle && !addAtEnd"
              title="Custom keyframe animation"
              description="Presets update this part of the timeline. Later keyframes stay in place. Full-layer effects ask before replacing custom motion."
              color="neutral"
              variant="soft"
              class="mb-3"
            />
            <div v-if="pending" class="mb-3 space-y-2 rounded-lg border border-warning p-3" role="alert">
              <p class="text-sm font-medium">
                Replace custom motion with {{ pendingLabel }}?
              </p><p class="text-xs text-muted">
                The existing entrance, exit and keyframes will be replaced on this layout. Undo restores them.
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  :label="`Replace with ${pendingLabel}`"
                  size="xs"
                  color="warning"
                  @click="applyPreset(pending)"
                /><UButton
                  label="Keep current motion"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="pending = null"
                />
              </div>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <UButton
                v-if="canWordPop && !isMiddle"
                aria-label="Words Pop entrance animation"
                :disabled="!editable"
                :aria-pressed="!isKeyframe && selectedId === 'wordPop'"
                color="neutral"
                variant="ghost"
                class="flex h-20 flex-col items-center justify-center gap-2 rounded-lg border border-default bg-default px-1 text-center"
                :class="!isKeyframe && selectedId === 'wordPop' ? 'ring-1 ring-primary text-primary' : ''"
                @click="choosePreset('wordPop')"
              >
                <UIcon name="i-lucide-whole-word" class="size-6" /><span class="text-[11px]">Words Pop</span>
              </UButton>
              <ShadcnButton
                v-for="preset in presets"
                :key="preset.id"
                :aria-label="`${preset.label} ${directionLabel} animation`"
                :disabled="!editable || (isMiddle && !targetPhase)"
                :aria-pressed="!isKeyframe && selectedId === preset.id"
                color="neutral"
                variant="ghost"
                class="flex h-16 min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-default bg-default px-1 text-center"
                :class="!isKeyframe && selectedId === preset.id ? 'ring-1 ring-primary text-primary' : ''"
                @click="choosePreset(preset.id)"
              >
                <UIcon :name="'icon' in preset && String(preset.icon).startsWith('i-lucide-') ? preset.icon : `i-lucide-${iconFor(preset.id)}`" class="size-6" /><span class="w-full truncate text-[11px]">{{ preset.label }}</span>
              </ShadcnButton>
            </div>
            <p v-if="isMiddle && !targetPhase" class="py-2 text-xs text-muted">
              Make room between existing animations before adding a middle effect.
            </p>
            <p v-if="!presets.length && !canWordPop" class="py-5 text-center text-sm text-muted">
              No matching animations. Try another name.
            </p>
          </TabsContent>
          <TabsContent value="build" class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <template v-if="isAudio">
              <UFormField label="Volume (%)">
                <UInput
                  :model-value="Math.round((layer.volume ?? 1) * 100)"
                  type="number"
                  :min="0"
                  :max="100"
                  :step="5"
                  class="w-full"
                  @update:model-value="setVolume"
                />
              </UFormField>
              <UFormField label="Mute audio">
                <UCheckbox :model-value="!!layer.muted" @update:model-value="updateLayer(layer.id, { muted: !!$event })" />
              </UFormField>
              <UFormField label="Loop within this clip">
                <UCheckbox :model-value="!!layer.loopAudio" @update:model-value="updateLayer(layer.id, { loopAudio: !!$event })" />
              </UFormField>
            </template>
            <template v-else-if="isKeyframe || isMiddle">
              <UFormField label="Animated property">
                <USelect v-model="property" :items="tracks" class="w-full" />
              </UFormField>
              <UFormField v-if="frameOptions.length" label="Keyframe">
                <USelect v-model="frameIndex" :items="frameOptions" class="w-full" />
              </UFormField>
              <template v-if="frame">
                <UFormField label="Time (seconds)" :error="frameError">
                  <UInput
                    :disabled="!editable"
                    :model-value="frame.time"
                    type="number"
                    :min="0"
                    :max="duration"
                    :step="0.05"
                    class="w-full"
                    @update:model-value="setFrame('time', $event)"
                  />
                </UFormField>
                <UFormField :label="`${propLabels[property]} value`">
                  <UInput
                    :disabled="!editable"
                    :model-value="frame.value"
                    type="number"
                    :step="0.01"
                    class="w-full"
                    @update:model-value="setFrame('value', $event)"
                  />
                </UFormField>
              </template>
            </template>
            <template v-else>
              <UFormField :label="layer.wordPop && selectedDirection === 'in' ? 'Seconds per word' : 'Duration (seconds)'">
                <UInput
                  :disabled="!editable"
                  :model-value="selectedDirection === 'in' ? layer.wordPop?.duration ?? layer.animInDur ?? 0.6 : layer.outDur ?? 0.25"
                  type="number"
                  :min="0.05"
                  :step="0.05"
                  class="w-full"
                  @update:model-value="setTiming"
                />
              </UFormField>
              <UFormField v-if="layer.wordPop && selectedDirection === 'in'" label="Word stagger (seconds)">
                <UInput
                  :disabled="!editable"
                  :model-value="layer.wordPop.stagger"
                  type="number"
                  :min="0"
                  :max="5"
                  :step="0.05"
                  class="w-full"
                  @update:model-value="setStagger"
                />
              </UFormField>
            </template>
            <UFormField v-if="!isAudio && (!isMiddle || frame)" label="Easing" class="@lg:col-span-2">
              <USelect
                :model-value="isKeyframe ? frame?.easing || 'none' : selectedDirection === 'in' ? layer.wordPop?.ease || layer.ease || 'power2.out' : layer.animOutEase || 'power1.in'"
                :items="easeOptions"
                class="w-full"
                @update:model-value="setEase"
              />
            </UFormField>
          </TabsContent>
        </ShadcnTabs>
        <div v-if="!isAudio && tab === 'build'" class="space-y-2 border-t border-default p-3">
          <UFormField v-if="!isKeyframe && !isMiddle" label="Animated property">
            <USelect v-model="property" :items="tracks" class="w-full" />
          </UFormField>
          <UButton
            :label="`Add keyframe at ${keyframeTime.toFixed(2)}s`"
            icon="i-lucide-diamond-plus"
            size="sm"
            color="neutral"
            variant="outline"
            class="w-full justify-center"
            :disabled="!editable"
            @click="addKeyframe"
          />
          <p class="text-xs text-muted">
            Captures this property’s current value. Drag diamonds on the expanded track to change their time.
          </p>
        </div>
        <div v-if="canRemove" class="border-t border-default px-3 py-2">
          <ShadcnButton
            variant="ghost"
            size="sm"
            class="w-full text-error hover:text-error"
            @click="removeAnimation"
          >
            <UIcon name="i-lucide-trash-2" class="size-4" />Remove animation
          </ShadcnButton>
          <p class="text-center text-xs text-muted">
            Keeps the layer and other animation blocks. Undo restores this effect.
          </p>
        </div>
        <div class="flex shrink-0 items-center justify-between gap-2 border-t border-default p-3">
          <UButton
            :label="isPreviewing ? 'Stop preview' : 'Preview'"
            :icon="isPreviewing ? 'i-lucide-square' : 'i-lucide-play'"
            title="Preview only this animation"
            color="neutral"
            variant="soft"
            size="xs"
            @click="preview"
          />
          <UButton
            label="Open details"
            icon="i-lucide-panel-right-open"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="focusAnimation(); open = false"
          />
        </div>
      </section>
    </template>
  </UPopover>
</template>
