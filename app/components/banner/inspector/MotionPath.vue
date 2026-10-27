<script setup lang="ts">
import { isCustomEase, cubicEaseString, EASE_PRESET_CURVES } from '~/utils/banner-ease'

const { state, selectedLayer, toggleMotionPath, addPathPoint, updatePathPoint, removePathPoint, updateLayer, getMotionPathTweens, canAnimateLayer, canEditMotionPath, addMotionPathTween, canAddMotionPathTween, updateMotionPathTween, removeMotionPathTween } = useBannerStudio()

const animationActions = useBannerAnimationActions()
const canHavePath = computed(() => canEditMotionPath(selectedLayer.value))

const hasPath = computed(() => (selectedLayer.value?.motionPath?.length ?? 0) >= 2)

const CUSTOM_EASE = '__custom__'
function isTweenSelected(i: number) {
  return state.selectedTween?.layerId === selectedLayer.value?.id && state.selectedTween?.tweenIndex === i
}
function selectTween(i: number) {
  if (!selectedLayer.value) return
  state.selectedTween = { layerId: selectedLayer.value.id, tweenIndex: i }
}
/** Value shown in the ease dropdown — custom curves collapse to the sentinel */
function easeSelectValue(ease?: string) {
  return isCustomEase(ease) ? CUSTOM_EASE : (ease || 'power2.inOut')
}

function onToggle() {
  if (!selectedLayer.value) return
  if (hasPath.value || !canAnimateLayer(selectedLayer.value)) toggleMotionPath(selectedLayer.value.id)
  else onAddTween()
}

function onCurvinessChange(val: number) {
  if (!selectedLayer.value) return
  updateLayer(selectedLayer.value.id, { motionPathCurviness: val })
}

function onAutoRotateChange(v: boolean) {
  if (!selectedLayer.value) return
  updateLayer(selectedLayer.value.id, { motionPathAutoRotate: v })
}

function onPointChange(index: number, axis: 'x' | 'y', val: string | number) {
  if (!selectedLayer.value) return
  const num = Number(val) || 0
  const pt = selectedLayer.value.motionPath![index]
  if (axis === 'x') {
    updatePathPoint(selectedLayer.value.id, index, num, pt.y)
  } else {
    updatePathPoint(selectedLayer.value.id, index, pt.x, num)
  }
}

function onAddPoint() {
  if (!selectedLayer.value?.motionPath) return
  const pts = selectedLayer.value.motionPath
  // Default: midpoint of last two points
  const last = pts[pts.length - 1]
  const prev = pts[pts.length - 2] || last
  addPathPoint(selectedLayer.value.id, Math.round((prev.x + last.x) / 2), Math.round((prev.y + last.y) / 2))
}

function onRemovePoint(index: number) {
  if (!selectedLayer.value) return
  removePathPoint(selectedLayer.value.id, index)
}

const tweens = computed(() => {
  if (!selectedLayer.value) return []
  return getMotionPathTweens(selectedLayer.value)
})

const EASE_OPTIONS = [
  { label: 'Ease In/Out', value: 'power2.inOut' },
  { label: 'Ease Out', value: 'power2.out' },
  { label: 'Ease In', value: 'power2.in' },
  { label: 'Linear', value: 'none' },
  { label: 'Elastic', value: 'elastic.out(1, 0.3)' },
  { label: 'Bounce', value: 'bounce.out' },
  { label: 'Back', value: 'back.inOut(1.7)' },
  { label: 'Slow Mo', value: 'slow(0.7, 0.7, false)' },
  { label: 'Custom curve…', value: '__custom__' }
]

function onTweenFieldChange(index: number, field: 'pathStart' | 'pathEnd', val: string | number) {
  if (!selectedLayer.value) return
  const num = Math.max(0, Math.min(1, Number(val) || 0))
  updateMotionPathTween(selectedLayer.value.id, index, { [field]: num })
}

function onTweenTimeChange(index: number, field: 'startTime' | 'endTime', val: string | number) {
  if (!selectedLayer.value) return
  const num = Math.max(0, Number(val) || 0)
  updateMotionPathTween(selectedLayer.value.id, index, { [field]: num })
}

function onTweenEaseChange(index: number, val: string) {
  if (!selectedLayer.value) return
  if (val === CUSTOM_EASE) {
    // Seed the curve from the current preset so switching to Custom doesn't jump
    const current = getMotionPathTweens(selectedLayer.value)[index]?.ease || 'power2.inOut'
    const seed = EASE_PRESET_CURVES[current] || EASE_PRESET_CURVES['power2.inOut']
    updateMotionPathTween(selectedLayer.value.id, index, { ease: cubicEaseString(seed) })
    return
  }
  updateMotionPathTween(selectedLayer.value.id, index, { ease: val })
}

function onAddTween() {
  if (!selectedLayer.value) return
  if (canAnimateLayer(selectedLayer.value)) animationActions.addTween(animationActions.captureTarget(selectedLayer.value))
  else if (hasPath.value) addMotionPathTween(selectedLayer.value.id)
}

function onRemoveTween(index: number) {
  if (!selectedLayer.value) return
  removeMotionPathTween(selectedLayer.value.id, index)
}
</script>

<template>
  <div v-if="selectedLayer && canHavePath" :data-motion-layer-id="selectedLayer.id">
    <details class="bs-section group" :open="hasPath || undefined">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
        <UIcon name="i-lucide-spline" class="w-3 h-3 text-[#4af0a2]" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Motion Path</span>
      </summary>
      <div class="pt-1.5 space-y-3 @container">
        <UFormField label="Enable motion path" size="xs">
          <UCheckbox :model-value="hasPath" aria-label="Enable motion path" @update:model-value="onToggle" />
        </UFormField>
        <template v-if="hasPath">
          <p v-if="selectedLayer.keyframes?.x?.length || selectedLayer.keyframes?.y?.length" class="text-[10px] leading-snug text-(--ui-text-dimmed)">
            Motion path controls position while enabled. Your X/Y keyframes are retained and resume when you disable the path.
          </p>
          <UFormField label="Curviness" size="xs" :hint="(selectedLayer.motionPathCurviness ?? 1).toFixed(1)">
            <USlider
              :model-value="selectedLayer.motionPathCurviness ?? 1"
              :min="0"
              :max="2"
              :step="0.1"
              aria-label="Curviness"
              @update:model-value="onCurvinessChange"
            />
            <p v-if="(selectedLayer.motionPath?.length ?? 0) < 3" class="text-[10px] leading-snug text-(--ui-text-dimmed) mt-1">
              Two points make a straight line — add a third to bend it.
            </p>
          </UFormField>
          <div class="flex items-center gap-4">
            <UFormField label="Auto-rotate" size="xs">
              <UCheckbox :model-value="!!selectedLayer.motionPathAutoRotate" aria-label="Auto-rotate" @update:model-value="onAutoRotateChange" />
            </UFormField>
            <UFormField label="Solo preview" size="xs" description="Path only">
              <UCheckbox :model-value="state.soloMotionPath" aria-label="Solo preview" @update:model-value="v => state.soloMotionPath = v === true" />
            </UFormField>
          </div>
          <div>
            <p class="text-[10px] font-semibold mb-1">
              Waypoints
            </p>
            <div class="space-y-2 max-h-56 overflow-y-auto">
              <div v-for="(pt, i) in selectedLayer.motionPath" :key="i" class="flex items-end gap-1">
                <div class="flex-1 min-w-0 grid grid-cols-1 @lg:grid-cols-2 gap-2">
                  <UFormField :label="`Waypoint ${i} X`" size="xs">
                    <UInput
                      type="number"
                      :model-value="pt.x"
                      :aria-label="`Waypoint ${i} X`"
                      size="xs"
                      class="w-full"
                      @update:model-value="v => onPointChange(i, 'x', v)"
                    />
                  </UFormField>
                  <UFormField :label="`Waypoint ${i} Y`" size="xs">
                    <UInput
                      type="number"
                      :model-value="pt.y"
                      :aria-label="`Waypoint ${i} Y`"
                      size="xs"
                      class="w-full"
                      @update:model-value="v => onPointChange(i, 'y', v)"
                    />
                  </UFormField>
                </div>
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  size="xs"
                  color="neutral"
                  :aria-label="`Remove waypoint ${i}`"
                  :disabled="selectedLayer.motionPath!.length <= 2"
                  @click="onRemovePoint(i)"
                />
              </div>
            </div>
            <UButton
              label="Add Point"
              icon="i-lucide-plus"
              variant="ghost"
              size="xs"
              class="mt-1"
              @click="onAddPoint"
            />
          </div>
          <div>
            <p class="text-[10px] font-semibold mb-1">
              Tweens
            </p>
            <div class="space-y-2 max-h-80 overflow-y-auto">
              <div
                v-for="(tw, i) in tweens"
                :key="i"
                class="rounded px-2 py-2 transition-colors"
                :data-tween-index="i"
                :data-tween-selected="isTweenSelected(i)"
                :class="isTweenSelected(i) ? 'bg-[#4af0a2]/10 ring-1 ring-[#4af0a2]/60' : 'bg-white/[0.03]'"
                @focusin="selectTween(i)"
                @click="selectTween(i)"
              >
                <div class="flex items-center justify-between mb-1">
                  <UButton
                    :label="`Tween ${i + 1}`"
                    :aria-pressed="isTweenSelected(i)"
                    variant="ghost"
                    size="xs"
                    @click="selectTween(i)"
                  />
                  <UButton
                    icon="i-lucide-x"
                    variant="ghost"
                    size="xs"
                    color="neutral"
                    :aria-label="`Remove tween ${i + 1}`"
                    :disabled="tweens.length <= 1"
                    @click.stop="onRemoveTween(i)"
                  />
                </div>
                <div class="grid grid-cols-1 @lg:grid-cols-2 gap-2">
                  <UFormField label="Path start" size="xs">
                    <UInput
                      type="number"
                      :model-value="tw.pathStart"
                      :aria-label="`Tween ${i + 1} path start`"
                      size="xs"
                      class="w-full"
                      step="0.05"
                      min="0"
                      max="1"
                      @update:model-value="v => onTweenFieldChange(i, 'pathStart', v)"
                    />
                  </UFormField>
                  <UFormField label="Path end" size="xs">
                    <UInput
                      type="number"
                      :model-value="tw.pathEnd"
                      :aria-label="`Tween ${i + 1} path end`"
                      size="xs"
                      class="w-full"
                      step="0.05"
                      min="0"
                      max="1"
                      @update:model-value="v => onTweenFieldChange(i, 'pathEnd', v)"
                    />
                  </UFormField>
                  <UFormField label="Start time (s)" size="xs">
                    <UInput
                      type="number"
                      :model-value="tw.startTime"
                      :aria-label="`Tween ${i + 1} start time`"
                      size="xs"
                      class="w-full"
                      step="0.1"
                      min="0"
                      @update:model-value="v => onTweenTimeChange(i, 'startTime', v)"
                    />
                  </UFormField>
                  <UFormField label="End time (s)" size="xs">
                    <UInput
                      type="number"
                      :model-value="tw.endTime"
                      :aria-label="`Tween ${i + 1} end time`"
                      size="xs"
                      class="w-full"
                      step="0.1"
                      min="0"
                      @update:model-value="v => onTweenTimeChange(i, 'endTime', v)"
                    />
                  </UFormField>
                  <UFormField label="Ease" size="xs" class="@lg:col-span-2">
                    <USelect
                      :model-value="easeSelectValue(tw.ease)"
                      :items="EASE_OPTIONS"
                      :aria-label="`Tween ${i + 1} ease`"
                      value-key="value"
                      size="xs"
                      class="w-full"
                      @update:model-value="v => onTweenEaseChange(i, v)"
                    />
                  </UFormField>
                </div>
                <BannerEasingCurveEditor v-if="isCustomEase(tw.ease)" :model-value="tw.ease" @update:model-value="v => onTweenEaseChange(i, v)" />
              </div>
            </div>
          </div>
        </template>
        <UButton
          label="Add Tween"
          icon="i-lucide-plus"
          variant="ghost"
          size="xs"
          :disabled="!canAddMotionPathTween(selectedLayer)"
          @click="onAddTween"
        />
      </div>
    </details>
  </div>
</template>
