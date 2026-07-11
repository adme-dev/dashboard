<script setup lang="ts">
const { state, selectedLayer, toggleMotionPath, addPathPoint, updatePathPoint, removePathPoint, updateLayer, getMotionPathTweens, addMotionPathTween, updateMotionPathTween, removeMotionPathTween } = useBannerStudio()

const PATHABLE_TYPES = new Set(['text', 'image', 'video', 'button', 'rect'])

const canHavePath = computed(() => {
  return selectedLayer.value ? PATHABLE_TYPES.has(selectedLayer.value.type) : false
})

const hasPath = computed(() => (selectedLayer.value?.motionPath?.length ?? 0) >= 2)

function onToggle() {
  if (!selectedLayer.value) return
  toggleMotionPath(selectedLayer.value.id)
}

function onCurvinessChange(e: Event) {
  if (!selectedLayer.value) return
  const val = parseFloat((e.target as HTMLInputElement).value)
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
]

function onTweenFieldChange(index: number, field: 'pathStart' | 'pathEnd', val: string | number) {
  if (!selectedLayer.value) return
  const num = Math.max(0, Math.min(1, Number(val) || 0))
  updateMotionPathTween(selectedLayer.value.id, index, { [field]: num })
}

function onTweenEaseChange(index: number, val: string) {
  if (!selectedLayer.value) return
  updateMotionPathTween(selectedLayer.value.id, index, { ease: val })
}

function onAddTween() {
  if (!selectedLayer.value) return
  addMotionPathTween(selectedLayer.value.id)
}

function onRemoveTween(index: number) {
  if (!selectedLayer.value) return
  removeMotionPathTween(selectedLayer.value.id, index)
}
</script>

<template>
  <div v-if="selectedLayer && canHavePath">
    <details class="bs-section group" :open="hasPath || undefined">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
        <UIcon name="i-lucide-spline" class="w-3 h-3 text-[#4af0a2]" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Motion Path</span>
      </summary>
      <div class="pt-1.5 space-y-3">
        <!-- Enable toggle -->
        <div class="flex items-center gap-2">
          <UCheckbox
            :model-value="hasPath"
            @update:model-value="onToggle"
          />
          <label class="text-[11px] text-(--ui-text-muted)">Enable Motion Path</label>
        </div>

        <template v-if="hasPath">
          <!-- Curviness slider -->
          <div>
            <label class="text-[10px] text-(--ui-text-muted) block mb-1">
              Curviness
              <span class="ml-1 font-mono text-[9px]">{{ (selectedLayer.motionPathCurviness ?? 1).toFixed(1) }}</span>
            </label>
            <input
              type="range"
              min="0" max="2" step="0.1"
              :value="selectedLayer.motionPathCurviness ?? 1"
              class="w-full"
              @input="onCurvinessChange"
            >
          </div>

          <!-- Auto-rotate toggle -->
          <div class="flex items-center gap-2">
            <UCheckbox
              :model-value="!!selectedLayer.motionPathAutoRotate"
              @update:model-value="onAutoRotateChange"
            />
            <label class="text-[11px] text-(--ui-text-muted)">Auto-Rotate</label>
          </div>

          <!-- Solo preview toggle -->
          <div class="flex items-center gap-2">
            <UCheckbox
              :model-value="state.soloMotionPath"
              @update:model-value="v => state.soloMotionPath = v === true"
            />
            <label class="text-[11px] text-(--ui-text-muted)">Solo Preview</label>
            <span class="text-[9px] text-(--ui-text-dimmed)">(path only, no entrance/exit)</span>
          </div>

          <!-- Waypoints list -->
          <div>
            <label class="text-[10px] text-(--ui-text-muted) block mb-1">Waypoints</label>
            <div class="space-y-1 max-h-48 overflow-y-auto">
              <div
                v-for="(pt, i) in selectedLayer.motionPath"
                :key="i"
                class="flex items-center gap-1"
              >
                <span
                  class="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold"
                  :class="i === 0 ? 'bg-[#4af0a2] text-black' : (i === selectedLayer.motionPath!.length - 1 ? 'bg-[#f04a4a] text-white' : 'bg-white/20 text-white')"
                >{{ i }}</span>
                <UInput
                  type="number"
                  :model-value="pt.x"
                  size="xs"
                  class="w-16"
                  @update:model-value="v => onPointChange(i, 'x', v)"
                />
                <UInput
                  type="number"
                  :model-value="pt.y"
                  size="xs"
                  class="w-16"
                  @update:model-value="v => onPointChange(i, 'y', v)"
                />
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  size="xs"
                  color="neutral"
                  :disabled="selectedLayer.motionPath!.length <= 2"
                  @click="onRemovePoint(i)"
                />
              </div>
            </div>
            <UButton
              icon="i-lucide-plus"
              variant="ghost"
              size="xs"
              class="mt-1"
              @click="onAddPoint"
            >
              Add Point
            </UButton>
          </div>

          <!-- Tweens list -->
          <div>
            <label class="text-[10px] text-(--ui-text-muted) block mb-1">Tweens</label>
            <div class="space-y-1.5 max-h-48 overflow-y-auto">
              <div
                v-for="(tw, i) in tweens"
                :key="i"
                class="flex items-center gap-1 bg-white/[0.03] rounded px-1.5 py-1"
              >
                <span class="text-[8px] text-[#4af0a2] font-mono shrink-0 w-3">{{ i + 1 }}</span>
                <div class="flex-1 space-y-1">
                  <div class="flex items-center gap-1">
                    <span class="text-[8px] text-(--ui-text-dimmed) w-8">Path</span>
                    <UInput
                      type="number"
                      :model-value="tw.pathStart"
                      size="xs"
                      class="w-14"
                      step="0.05"
                      min="0" max="1"
                      @update:model-value="v => onTweenFieldChange(i, 'pathStart', v)"
                    />
                    <span class="text-[8px] text-(--ui-text-dimmed)">→</span>
                    <UInput
                      type="number"
                      :model-value="tw.pathEnd"
                      size="xs"
                      class="w-14"
                      step="0.05"
                      min="0" max="1"
                      @update:model-value="v => onTweenFieldChange(i, 'pathEnd', v)"
                    />
                  </div>
                  <div class="flex items-center gap-1">
                    <span class="text-[8px] text-(--ui-text-dimmed) w-8">Ease</span>
                    <USelect
                      :model-value="tw.ease || 'power2.inOut'"
                      :items="EASE_OPTIONS"
                      value-key="value"
                      size="xs"
                      class="flex-1"
                      @update:model-value="v => onTweenEaseChange(i, v)"
                    />
                  </div>
                </div>
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  size="xs"
                  color="neutral"
                  :disabled="tweens.length <= 1"
                  @click="onRemoveTween(i)"
                />
              </div>
            </div>
            <UButton
              icon="i-lucide-plus"
              variant="ghost"
              size="xs"
              class="mt-1"
              @click="onAddTween"
            >
              Add Tween
            </UButton>
          </div>
        </template>
      </div>
    </details>
  </div>
</template>
