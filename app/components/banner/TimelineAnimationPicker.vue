<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { ANIM_IN, ANIM_OUT, EASES } from '~/utils/banner-constants'
import { hasKeyframes } from '~/composables/useBannerTimeline'
import type { AnimInType, AnimOutType, KeyframeProperty, Layer } from '~/types/banner-studio'

const props = defineProps<{ layer: Layer, direction: 'in' | 'out', compact?: boolean }>()
const { state, selectLayer, updateLayer } = useBannerStudio()
const { inspectorTab } = useBannerInspector()
const { pauseTimeline, seekTo, playTimeline } = useBannerTimeline()
const open = ref(false)
const tab = ref('presets')
const search = ref('')
const pending = ref<string | null>(null)
const property = ref<KeyframeProperty>('opacity')
const frameIndex = ref('0')
const frameError = ref<string>()
const isAudio = computed(() => props.layer.type === 'audio')
const isKeyframe = computed(() => hasKeyframes(props.layer))
const title = computed(() => isAudio.value ? 'Audio' : isKeyframe.value ? 'Animation' : props.direction === 'in' ? 'Build In' : 'Build Out')
const directionLabel = computed(() => props.direction === 'in' ? 'entrance' : 'exit')
const presets = computed(() => (props.direction === 'in' ? ANIM_IN : ANIM_OUT).filter(p => p.label.toLowerCase().includes(search.value.trim().toLowerCase())))
const selectedId = computed(() => props.direction === 'in' && props.layer.wordPop ? 'wordPop' : props.direction === 'in' ? props.layer.animIn : (props.layer.animOut ?? 'fadeOut'))
const selectedLabel = computed(() => isAudio.value ? 'Sound' : isKeyframe.value ? 'Keyframes' : selectedId.value === 'wordPop' ? 'Words Pop' : ([...ANIM_IN, ...ANIM_OUT].find(p => p.id === selectedId.value)?.label ?? 'None'))
const foreground = computed(() => ['text', 'image', 'button', 'audio'].includes(props.layer.type) ? '#111827' : '#ffffff')
const iconFor = (id: string) => ({ none: 'circle-slash', fadeIn: 'blend', fadeOut: 'blend', slideL: 'arrow-left', slideR: 'arrow-right', slideU: 'arrow-up', slideD: 'arrow-down', zoomIn: 'zoom-in', zoomOut: 'zoom-out', spinIn: 'rotate-cw', spinOut: 'rotate-cw', bounceIn: 'corner-right-up', elastic: 'move-horizontal', kenBurns: 'scan', wordPop: 'whole-word' }[id] || 'sparkles')
const propLabels: Record<KeyframeProperty, string> = { opacity: 'Opacity', x: 'Horizontal position', y: 'Vertical position', scaleX: 'Horizontal scale', scaleY: 'Vertical scale', rotation: 'Rotation' }
const tracks = computed(() => (Object.keys(propLabels) as KeyframeProperty[]).filter(p => props.layer.keyframes?.[p]?.length).map(p => ({ label: propLabels[p], value: p })))
const frames = computed(() => props.layer.keyframes?.[property.value] ?? [])
const frame = computed(() => frames.value[Number(frameIndex.value)])
const frameOptions = computed(() => frames.value.map((f, i) => ({ label: `${i + 1} · ${f.time.toFixed(2)}s`, value: String(i) })))
const easeOptions = computed(() => {
  const current = isKeyframe.value ? frame.value?.easing : props.direction === 'in' ? props.layer.wordPop?.ease || props.layer.ease : props.layer.animOutEase
  const options = [{ label: 'Linear', value: 'none' }, ...EASES.map(e => ({ label: `${e.label} · ${e.category}`, value: e.id }))]
  if (current && !options.some(e => e.value === current)) options.unshift({ label: `Custom · ${current}`, value: current })
  return options
})
const canWordPop = computed(() => props.direction === 'in' && props.layer.type === 'text' && !props.layer.textRuns?.length && 'words pop'.includes(search.value.trim().toLowerCase()))
const duration = computed(() => state.sets[state.activeKey]?.playback?.duration ?? Math.max(3, props.layer.endTime ?? 3))
const pendingLabel = computed(() => pending.value === 'wordPop' ? 'Words Pop' : [...ANIM_IN, ...ANIM_OUT].find(p => p.id === pending.value)?.label)

watch(open, (value) => {
  if (!value) {
    pending.value = null
    return
  }
  tab.value = isKeyframe.value || isAudio.value ? 'build' : 'presets'
  search.value = ''
  property.value = tracks.value[0]?.value ?? 'opacity'
  frameIndex.value = '0'
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
  const n = Number(value)
  if (value === '' || !Number.isFinite(n)) return
  updateLayer(props.layer.id, { volume: Math.min(1, Math.max(0, n / 100)) })
}

function focusAnimation() {
  selectLayer(props.layer.id)
  inspectorTab.value = isAudio.value ? 'properties' : 'animation'
}
function applyPreset(id: string) {
  const reset = isKeyframe.value ? { keyframes: undefined, motionPath: undefined, motionPathTweens: undefined, wordPop: undefined, animIn: 'none' as const, animOut: 'none' as const } : {}
  const change = id === 'wordPop'
    ? { animIn: 'none' as const, wordPop: props.layer.wordPop ?? { duration: 0.5, stagger: 0.1, ease: 'cubic-bezier(.21,.79,.09,.97)' } }
    : props.direction === 'in' ? { animIn: id as AnimInType, wordPop: undefined } : { animOut: id as AnimOutType }
  updateLayer(props.layer.id, { ...reset, ...change })
  state.selectedKeyframe = null
  pending.value = null
  focusAnimation()
}
function choosePreset(id: string) {
  if (isKeyframe.value) {
    pending.value = id
    return
  }
  applyPreset(id)
}
function setTiming(value: string | number) {
  const n = Number(value)
  if (value === '' || !Number.isFinite(n)) return
  const bounded = Math.min(Math.max(0.05, n), Math.max(0.05, (props.layer.endTime ?? 3) - (props.layer.startTime ?? 0)))
  updateLayer(props.layer.id, props.direction === 'in' ? props.layer.wordPop ? { wordPop: { ...props.layer.wordPop, duration: bounded } } : { animInDur: bounded } : { outDur: bounded })
}
function setStagger(value: string | number) {
  const n = Number(value)
  if (value === '' || !Number.isFinite(n) || !props.layer.wordPop) return
  updateLayer(props.layer.id, { wordPop: { ...props.layer.wordPop, stagger: Math.min(5, Math.max(0, n)) } })
}
function setFrame(key: 'time' | 'value' | 'easing', value: string | number) {
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
  if (isKeyframe.value) setFrame('easing', value)
  else updateLayer(props.layer.id, props.direction === 'in' ? props.layer.wordPop ? { wordPop: { ...props.layer.wordPop, ease: value } } : { ease: value } : { animOutEase: value })
}
function preview() {
  pauseTimeline()
  seekTo(Math.max(0, (props.layer.startTime ?? 0) - 0.1))
  nextTick(() => playTimeline())
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ side: 'top', align: direction === 'in' ? 'start' : 'end', sideOffset: 8 }">
    <UButton
      :aria-label="isAudio ? `Edit audio for ${layer.name}` : isKeyframe ? `Edit keyframes for ${layer.name}` : `Edit ${directionLabel} animation for ${layer.name}: ${selectedLabel}`"
      :aria-expanded="open"
      color="neutral"
      variant="ghost"
      size="xs"
      class="h-5 w-full min-w-0 justify-start gap-1 overflow-hidden rounded-sm px-1 text-[9px] font-semibold hover:bg-white/20"
      :style="{ color: foreground }"
      @mousedown.stop
      @click.stop="focusAnimation"
    >
      <UIcon :name="`i-lucide-${isAudio ? 'volume-2' : isKeyframe ? 'diamond' : iconFor(selectedId)}`" class="size-3 shrink-0" />
      <span v-if="!compact" class="truncate">{{ selectedLabel }}</span>
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
              {{ title }}
            </p><p class="truncate text-xs text-muted">
              {{ layer.name }} · {{ isAudio && state.layoutView === 'all' && layer.linkId ? 'Linked layouts' : 'Current layout' }}
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            aria-label="Close animation picker"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="open = false"
          />
        </div>
        <div class="min-h-0 overflow-y-auto p-3">
          <UTabs
            v-if="!isAudio"
            v-model="tab"
            :items="[{ label: 'Presets', value: 'presets', icon: 'i-lucide-panels-top-left' }, { label: 'Build', value: 'build', icon: 'i-lucide-sliders-horizontal' }]"
            :content="false"
            size="sm"
            class="mb-3 w-full"
          />
          <template v-if="tab === 'presets' && !isAudio">
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
              v-if="isKeyframe"
              title="Custom keyframe animation"
              description="Selecting a preset asks before replacing this layer’s keyframes and motion path. Build lets you edit the existing motion."
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
                v-if="canWordPop"
                aria-label="Words Pop entrance animation"
                :aria-pressed="!isKeyframe && selectedId === 'wordPop'"
                color="neutral"
                variant="ghost"
                class="flex h-20 flex-col items-center justify-center gap-2 rounded-lg border border-default bg-default px-1 text-center"
                :class="!isKeyframe && selectedId === 'wordPop' ? 'ring-1 ring-primary text-primary' : ''"
                @click="choosePreset('wordPop')"
              >
                <UIcon name="i-lucide-whole-word" class="size-6" /><span class="text-[11px]">Words Pop</span>
              </UButton>
              <UButton
                v-for="preset in presets"
                :key="preset.id"
                :aria-label="`${preset.label} ${directionLabel} animation`"
                :aria-pressed="!isKeyframe && selectedId === preset.id"
                color="neutral"
                variant="ghost"
                class="flex h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-default bg-default px-1 text-center"
                :class="!isKeyframe && selectedId === preset.id ? 'ring-1 ring-primary text-primary' : ''"
                @click="choosePreset(preset.id)"
              >
                <UIcon :name="`i-lucide-${iconFor(preset.id)}`" class="size-6" /><span class="w-full truncate text-[11px]">{{ preset.label }}</span>
              </UButton>
            </div>
            <p v-if="!presets.length && !canWordPop" class="py-5 text-center text-sm text-muted">
              No matching animations. Try another name.
            </p>
          </template>
          <div v-else class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
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
            <template v-else-if="isKeyframe">
              <UFormField label="Animated property">
                <USelect v-model="property" :items="tracks" class="w-full" />
              </UFormField>
              <UFormField label="Keyframe">
                <USelect v-model="frameIndex" :items="frameOptions" class="w-full" />
              </UFormField>
              <template v-if="frame">
                <UFormField label="Time (seconds)" :error="frameError">
                  <UInput
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
              <UFormField :label="layer.wordPop && direction === 'in' ? 'Seconds per word' : 'Duration (seconds)'">
                <UInput
                  :model-value="direction === 'in' ? layer.wordPop?.duration ?? layer.animInDur ?? 0.6 : layer.outDur ?? 0.25"
                  type="number"
                  :min="0.05"
                  :step="0.05"
                  class="w-full"
                  @update:model-value="setTiming"
                />
              </UFormField>
              <UFormField v-if="layer.wordPop && direction === 'in'" label="Word stagger (seconds)">
                <UInput
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
            <UFormField v-if="!isAudio" label="Easing" class="@lg:col-span-2">
              <USelect
                :model-value="isKeyframe ? frame?.easing || 'none' : direction === 'in' ? layer.wordPop?.ease || layer.ease || 'power2.out' : layer.animOutEase || 'power1.in'"
                :items="easeOptions"
                class="w-full"
                @update:model-value="setEase"
              />
            </UFormField>
          </div>
        </div>
        <div class="flex shrink-0 items-center justify-between gap-2 border-t border-default p-3">
          <UButton
            label="Preview"
            icon="i-lucide-play"
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
