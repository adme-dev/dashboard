<script setup lang="ts">
import { ANIM_IN, ANIM_OUT, EASES, EASE_GROUPS, easeSvgPath } from '~/utils/banner-constants'
import { parseCubicEase } from '~/utils/banner-ease'
import type { AnimInType, AnimOutType, KeyframeProperty } from '~/types/banner-studio'
import { hasKeyframes, presetToKeyframes } from '~/composables/useBannerTimeline'

const { state, selectedLayer, updateLayer, copyAnimation, pasteAnimation, animClipboard } = useBannerStudio()
const { seekTo, playTimeline, pauseTimeline } = useBannerTimeline()

function set(key: string, val: any) {
  if (!selectedLayer.value) return
  updateLayer(selectedLayer.value.id, { [key]: val })
}

function setNum(key: string, val: string | number) {
  set(key, Number(val))
}

const CATEGORY_LABEL: Record<string, string> = { out: 'Ease out', in: 'Ease in', inOut: 'Ease in/out', special: '' }
const POWER_LABEL: Record<string, string> = { P1: 'Power 1', P2: 'Power 2', P3: 'Power 3' }
/** Readable name for the trigger button — the grid tiles use short labels like "P1" */
function easeDisplayName(id: string | undefined) {
  if (!id) return 'Default'
  if (/^cubic(?:-bezier)?\(/.test(id)) return 'Custom curve'
  const e = findEase(id)
  if (!e) return id
  const base = POWER_LABEL[e.label] || e.label
  const cat = CATEGORY_LABEL[e.category]
  return cat ? `${base} · ${cat}` : base
}

/** Control points for the trigger's mini curve — presets or a custom cubic */
function easeCp(id: string | undefined, fallback: [number, number, number, number]) {
  return parseCubicEase(id) || findEase(id || '')?.cp || fallback
}

// Find ease entry by id
function findEase(id: string) {
  return EASES.find(e => e.id === id)
}

// Easing popover states
const easeInOpen = ref(false)
const easeOutOpen = ref(false)
const easeKfOpen = ref(false)

function selectEaseIn(id: string) {
  set('ease', id)
  easeInOpen.value = false
}

function selectEaseOut(id: string) {
  set('animOutEase', id)
  easeOutOpen.value = false
}

// Preview the layer's animation
function previewLayer() {
  if (!selectedLayer.value) return
  pauseTimeline()
  const startAt = Math.max(0, (selectedLayer.value.startTime || 0) - 0.1)
  seekTo(startAt)
  nextTick(() => playTimeline())
}

// ═══ KEYFRAME MODE ═══
const KF_PROP_LABELS: Record<KeyframeProperty, string> = {
  opacity: 'Opacity',
  x: 'X',
  y: 'Y',
  scaleX: 'Scale X',
  scaleY: 'Scale Y',
  rotation: 'Rotation',
}

const isKeyframeMode = computed(() => selectedLayer.value && hasKeyframes(selectedLayer.value))

const selectedKf = computed(() => {
  const s = state.selectedKeyframe
  if (!s || !selectedLayer.value || s.layerId !== selectedLayer.value.id) return null
  const prop = s.property as KeyframeProperty
  const kfs = selectedLayer.value.keyframes?.[prop]
  if (!kfs || !kfs[s.index]) return null
  return { ...kfs[s.index], prop, index: s.index }
})

function kfCount(prop: KeyframeProperty): number {
  return selectedLayer.value?.keyframes?.[prop]?.length || 0
}

function convertToKeyframes() {
  if (!selectedLayer.value) return
  const kfs = presetToKeyframes(selectedLayer.value)
  updateLayer(selectedLayer.value.id, { keyframes: kfs })
  state.expandedKeyframeLayers.add(selectedLayer.value.id)
}

function clearKeyframes() {
  if (!selectedLayer.value) return
  updateLayer(selectedLayer.value.id, { keyframes: undefined })
  state.selectedKeyframe = null
  state.expandedKeyframeLayers.delete(selectedLayer.value.id)
}

function updateKfValue(val: string | number) {
  const s = state.selectedKeyframe
  if (!s || !selectedLayer.value) return
  const prop = s.property as KeyframeProperty
  const kfs = selectedLayer.value.keyframes?.[prop]
  if (!kfs) return
  const updated = [...kfs]
  updated[s.index] = { ...updated[s.index], value: Number(val) }
  updateLayer(selectedLayer.value.id, {
    keyframes: { ...selectedLayer.value.keyframes, [prop]: updated },
  })
}

function updateKfTime(val: string | number) {
  const s = state.selectedKeyframe
  if (!s || !selectedLayer.value) return
  const prop = s.property as KeyframeProperty
  const kfs = selectedLayer.value.keyframes?.[prop]
  if (!kfs) return
  const updated = [...kfs]
  updated[s.index] = { ...updated[s.index], time: Math.max(0, Number(val)) }
  updated.sort((a, b) => a.time - b.time)
  updateLayer(selectedLayer.value.id, {
    keyframes: { ...selectedLayer.value.keyframes, [prop]: updated },
  })
  const newTime = Math.max(0, Number(val))
  const newIdx = updated.findIndex(kf => kf.time === newTime)
  state.selectedKeyframe = { ...s, index: newIdx >= 0 ? newIdx : s.index }
}

function updateKfEasing(val: string) {
  const s = state.selectedKeyframe
  if (!s || !selectedLayer.value) return
  const prop = s.property as KeyframeProperty
  const kfs = selectedLayer.value.keyframes?.[prop]
  if (!kfs) return
  const updated = [...kfs]
  updated[s.index] = { ...updated[s.index], easing: val }
  updateLayer(selectedLayer.value.id, {
    keyframes: { ...selectedLayer.value.keyframes, [prop]: updated },
  })
}

function selectKfEasing(val: string) {
  updateKfEasing(val)
  easeKfOpen.value = false
}

function deleteSelectedKeyframe() {
  const s = state.selectedKeyframe
  if (!s || !selectedLayer.value) return
  const prop = s.property as KeyframeProperty
  const kfs = selectedLayer.value.keyframes?.[prop]
  if (!kfs || kfs.length <= 2) return
  const updated = [...kfs]
  updated.splice(s.index, 1)
  updateLayer(selectedLayer.value.id, {
    keyframes: { ...selectedLayer.value.keyframes, [prop]: updated },
  })
  state.selectedKeyframe = null
}
</script>

<template>
  <div v-if="selectedLayer" class="space-y-4">
    <!-- Top actions -->
    <div class="flex gap-1.5">
      <UButton size="xs" variant="soft" icon="i-lucide-copy" @click="copyAnimation">Copy</UButton>
      <UButton size="xs" variant="soft" icon="i-lucide-clipboard-paste" :disabled="!animClipboard" @click="pasteAnimation">Paste</UButton>
      <div class="flex-1" />
      <UButton size="xs" variant="soft" icon="i-lucide-play" @click="previewLayer">Preview</UButton>
    </div>

    <!-- Keyframe Mode Toggle -->
    <div class="flex gap-1.5">
      <UButton
        v-if="!isKeyframeMode"
        size="xs" variant="soft" color="primary" icon="i-lucide-diamond"
        @click="convertToKeyframes"
      >Convert to Keyframes</UButton>
      <UButton
        v-else
        size="xs" variant="soft" color="warning" icon="i-lucide-undo-2"
        @click="clearKeyframes"
      >Clear Keyframes</UButton>
    </div>

    <!-- ═══ KEYFRAME MODE ═══ -->
    <template v-if="isKeyframeMode">
      <!-- Keyframe Tracks -->
      <details open class="bs-section group">
        <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
          <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
          <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Keyframe Tracks</span>
        </summary>
        <div class="pt-1.5 space-y-1">
          <div
            v-for="(label, prop) in KF_PROP_LABELS"
            :key="prop"
            class="flex items-center justify-between px-2 py-0.5 rounded text-[10px]"
            :class="kfCount(prop) >= 2 ? 'text-(--ui-text)' : 'text-(--ui-text-dimmed)'"
          >
            <span>{{ label }}</span>
            <span class="font-mono">{{ kfCount(prop) }} kf</span>
          </div>
          <p class="text-[9px] text-(--ui-text-dimmed) mt-1">Double-click track in timeline to add keyframes</p>
        </div>
      </details>

      <!-- Selected Keyframe Editor -->
      <details v-if="selectedKf" open class="bs-section group">
        <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
          <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
          <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Selected Keyframe · {{ KF_PROP_LABELS[selectedKf.prop] }}</span>
        </summary>
        <div class="pt-1.5 space-y-2">
          <div class="grid grid-cols-2 gap-1.5">
            <div>
              <label class="text-[10px] text-(--ui-text-muted)">Time (s)</label>
              <UInput type="number" size="xs" step="0.05" :model-value="selectedKf.time" @update:model-value="v => updateKfTime(v)" />
            </div>
            <div>
              <label class="text-[10px] text-(--ui-text-muted)">Value</label>
              <UInput type="number" size="xs" step="0.01" :model-value="selectedKf.value" @update:model-value="v => updateKfValue(v)" />
            </div>
          </div>

          <div>
            <label class="text-[10px] text-(--ui-text-muted)">Easing (to next)</label>
            <div class="flex gap-1">
              <!-- Visual easing picker -->
              <UPopover v-model:open="easeKfOpen" class="flex-1 min-w-0">
                <button class="w-full flex items-center gap-1.5 px-2 py-1 rounded border border-[#3a3a3f] hover:border-[#555] bg-[#1e1e22] transition-colors text-left min-w-0">
                  <svg viewBox="-1 -2 34 24" class="w-6 h-4 shrink-0">
                    <path
                      :d="easeSvgPath(easeCp(selectedKf.easing ?? 'power2.out', [0, 0, 0.58, 1]))"
                      fill="none" stroke="#4a8fe8" stroke-width="1.5" stroke-linecap="round"
                    />
                  </svg>
                  <span class="text-[10px] text-[#ccc] truncate">{{ easeDisplayName(selectedKf.easing ?? 'power2.out') }}</span>
                  <UIcon name="i-lucide-chevron-down" class="w-3 h-3 text-[#555] shrink-0 ml-auto" />
                </button>
                <template #content>
                  <div class="p-2 w-[260px] max-h-[320px] overflow-y-auto space-y-2">
                    <template v-for="group in EASE_GROUPS" :key="group.label">
                      <div class="text-[9px] text-[#555] uppercase tracking-wider font-semibold">{{ group.label }}</div>
                      <div class="grid grid-cols-4 gap-1">
                        <button
                          v-for="ease in group.items" :key="ease.id"
                          class="flex flex-col items-center gap-0.5 p-1 rounded border transition-all"
                          :class="(selectedKf.easing ?? 'power2.out') === ease.id
                            ? 'border-[#4a8fe8] bg-[#4a8fe8]/10'
                            : 'border-transparent hover:bg-white/5'"
                          @click="selectKfEasing(ease.id)"
                        >
                          <svg viewBox="-1 -4 34 28" class="w-7 h-4">
                            <path :d="easeSvgPath(ease.cp)" fill="none"
                              :stroke="(selectedKf.easing ?? 'power2.out') === ease.id ? '#4a8fe8' : '#666'"
                              stroke-width="1.5" stroke-linecap="round" />
                          </svg>
                          <span class="text-[8px] font-medium truncate w-full text-center"
                            :class="(selectedKf.easing ?? 'power2.out') === ease.id ? 'text-[#4a8fe8]' : 'text-[#777]'"
                          >{{ ease.label }}</span>
                        </button>
                      </div>
                    </template>
                  </div>
                </template>
              </UPopover>
              <!-- Fine-tune curve editor -->
              <UPopover>
                <UButton size="xs" variant="ghost" icon="i-lucide-spline" />
                <template #content>
                  <div class="p-3 w-[220px]">
                    <BannerEasingCurveEditor
                      :model-value="selectedKf.easing ?? 'power2.out'"
                      @update:model-value="v => updateKfEasing(v)"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </div>

          <UButton
            size="xs" variant="soft" color="error" icon="i-lucide-trash-2"
            :disabled="kfCount(selectedKf.prop) <= 2"
            @click="deleteSelectedKeyframe"
          >Delete Keyframe</UButton>
        </div>
      </details>

      <!-- Timing -->
      <details open class="bs-section group">
        <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
          <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
          <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Timing</span>
        </summary>
        <div class="pt-1.5 space-y-2">
          <div class="grid grid-cols-2 gap-1.5">
            <div>
              <label class="text-[10px] text-(--ui-text-muted)">Start Time</label>
              <UInput type="number" size="xs" step="0.1" :model-value="selectedLayer.startTime" @update:model-value="v => setNum('startTime', v)" />
            </div>
            <div>
              <label class="text-[10px] text-(--ui-text-muted)">End Time</label>
              <UInput type="number" size="xs" step="0.1" :model-value="selectedLayer.endTime" @update:model-value="v => setNum('endTime', v)" />
            </div>
          </div>
        </div>
      </details>
    </template>

    <!-- ═══ PRESET MODE ═══ -->
    <template v-else>
      <!-- Animation In -->
      <details open class="bs-section group">
        <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
          <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
          <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Animation In</span>
        </summary>
        <div class="pt-1.5 space-y-2">
          <!-- Type badge grid -->
          <div>
            <label class="text-[10px] text-(--ui-text-muted) mb-1 block">Type</label>
            <div class="grid grid-cols-4 gap-1">
              <button
                v-for="anim in ANIM_IN" :key="anim.id"
                class="flex flex-col items-center gap-0.5 py-1.5 px-0.5 rounded border transition-all"
                :class="selectedLayer.animIn === anim.id
                  ? 'border-[#4a8fe8] bg-[#4a8fe8]/10 text-[#4a8fe8]'
                  : 'border-transparent hover:bg-white/5 text-[#888]'"
                @click="set('animIn', anim.id as AnimInType)"
              >
                <span class="text-sm leading-none">{{ anim.icon }}</span>
                <span class="text-[8px] font-medium leading-tight truncate w-full text-center">{{ anim.label }}</span>
              </button>
            </div>
          </div>

          <!-- Duration + Start Time -->
          <div class="grid grid-cols-2 gap-1.5">
            <div>
              <label class="text-[10px] text-(--ui-text-muted)">Duration</label>
              <UInput type="number" size="xs" step="0.05" :model-value="selectedLayer.animInDur" @update:model-value="v => setNum('animInDur', v)" />
            </div>
            <div>
              <label class="text-[10px] text-(--ui-text-muted)">Start Time</label>
              <UInput type="number" size="xs" step="0.1" :model-value="selectedLayer.startTime" @update:model-value="v => setNum('startTime', v)" />
            </div>
          </div>

          <!-- Ease popover picker -->
          <div>
            <label class="text-[10px] text-(--ui-text-muted) mb-1 block">Ease</label>
            <div class="flex gap-1">
              <UPopover v-model:open="easeInOpen" class="flex-1 min-w-0">
                <button class="w-full flex items-center gap-1.5 px-2 py-1 rounded border border-[#3a3a3f] hover:border-[#555] bg-[#1e1e22] transition-colors text-left min-w-0">
                  <svg viewBox="-1 -2 34 24" class="w-6 h-4 shrink-0">
                    <path
                      :d="easeSvgPath(easeCp(selectedLayer.ease ?? 'power2.out', [0, 0, 0.58, 1]))"
                      fill="none" stroke="#4a8fe8" stroke-width="1.5" stroke-linecap="round"
                    />
                  </svg>
                  <span class="text-[10px] text-[#ccc] truncate">{{ easeDisplayName(selectedLayer.ease ?? 'power2.out') }}</span>
                  <UIcon name="i-lucide-chevron-down" class="w-3 h-3 text-[#555] shrink-0 ml-auto" />
                </button>
                <template #content>
                  <div class="p-2 w-[260px] max-h-[320px] overflow-y-auto space-y-2">
                    <template v-for="group in EASE_GROUPS" :key="group.label">
                      <div class="text-[9px] text-[#555] uppercase tracking-wider font-semibold">{{ group.label }}</div>
                      <div class="grid grid-cols-4 gap-1">
                        <button
                          v-for="ease in group.items" :key="ease.id"
                          class="flex flex-col items-center gap-0.5 p-1 rounded border transition-all"
                          :class="(selectedLayer.ease ?? 'power2.out') === ease.id
                            ? 'border-[#4a8fe8] bg-[#4a8fe8]/10'
                            : 'border-transparent hover:bg-white/5'"
                          @click="selectEaseIn(ease.id)"
                        >
                          <svg viewBox="-1 -4 34 28" class="w-7 h-4">
                            <path :d="easeSvgPath(ease.cp)" fill="none"
                              :stroke="(selectedLayer.ease ?? 'power2.out') === ease.id ? '#4a8fe8' : '#666'"
                              stroke-width="1.5" stroke-linecap="round" />
                          </svg>
                          <span class="text-[8px] font-medium truncate w-full text-center"
                            :class="(selectedLayer.ease ?? 'power2.out') === ease.id ? 'text-[#4a8fe8]' : 'text-[#777]'"
                          >{{ ease.label }}</span>
                        </button>
                      </div>
                    </template>
                  </div>
                </template>
              </UPopover>
              <!-- Fine-tune curve editor -->
              <UPopover>
                <UButton size="xs" variant="ghost" icon="i-lucide-spline" />
                <template #content>
                  <div class="p-3 w-[220px]">
                    <BannerEasingCurveEditor
                      :model-value="selectedLayer.ease ?? 'power2.out'"
                      @update:model-value="v => set('ease', v)"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </div>
      </details>

      <!-- Animation Out -->
      <details open class="bs-section group">
        <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
          <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
          <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Animation Out</span>
        </summary>
        <div class="pt-1.5 space-y-2">
          <!-- Type badge grid -->
          <div>
            <label class="text-[10px] text-(--ui-text-muted) mb-1 block">Type</label>
            <div class="grid grid-cols-4 gap-1">
              <button
                v-for="anim in ANIM_OUT" :key="anim.id"
                class="flex flex-col items-center gap-0.5 py-1.5 px-0.5 rounded border transition-all"
                :class="(selectedLayer.animOut ?? 'fadeOut') === anim.id
                  ? 'border-[#4a8fe8] bg-[#4a8fe8]/10 text-[#4a8fe8]'
                  : 'border-transparent hover:bg-white/5 text-[#888]'"
                @click="set('animOut', anim.id as AnimOutType)"
              >
                <span class="text-sm leading-none">{{ anim.icon }}</span>
                <span class="text-[8px] font-medium leading-tight truncate w-full text-center">{{ anim.label }}</span>
              </button>
            </div>
          </div>

          <!-- End Time + Out Duration -->
          <div class="grid grid-cols-2 gap-1.5">
            <div>
              <label class="text-[10px] text-(--ui-text-muted)">End Time</label>
              <UInput type="number" size="xs" step="0.1" :model-value="selectedLayer.endTime" @update:model-value="v => setNum('endTime', v)" />
            </div>
            <div>
              <label class="text-[10px] text-(--ui-text-muted)">Out Duration</label>
              <UInput type="number" size="xs" step="0.05" :model-value="selectedLayer.outDur ?? 0.3" @update:model-value="v => setNum('outDur', v)" />
            </div>
          </div>

          <!-- Ease Out popover picker -->
          <div>
            <label class="text-[10px] text-(--ui-text-muted) mb-1 block">Ease Out</label>
            <div class="flex gap-1">
              <UPopover v-model:open="easeOutOpen" class="flex-1 min-w-0">
                <button class="w-full flex items-center gap-1.5 px-2 py-1 rounded border border-[#3a3a3f] hover:border-[#555] bg-[#1e1e22] transition-colors text-left min-w-0">
                  <svg viewBox="-1 -2 34 24" class="w-6 h-4 shrink-0">
                    <path
                      :d="easeSvgPath(easeCp(selectedLayer.animOutEase ?? 'power1.in', [0.42, 0, 1, 1]))"
                      fill="none" stroke="#4a8fe8" stroke-width="1.5" stroke-linecap="round"
                    />
                  </svg>
                  <span class="text-[10px] text-[#ccc] truncate">{{ easeDisplayName(selectedLayer.animOutEase ?? 'power1.in') }}</span>
                  <UIcon name="i-lucide-chevron-down" class="w-3 h-3 text-[#555] shrink-0 ml-auto" />
                </button>
                <template #content>
                  <div class="p-2 w-[260px] max-h-[320px] overflow-y-auto space-y-2">
                    <template v-for="group in EASE_GROUPS" :key="group.label">
                      <div class="text-[9px] text-[#555] uppercase tracking-wider font-semibold">{{ group.label }}</div>
                      <div class="grid grid-cols-4 gap-1">
                        <button
                          v-for="ease in group.items" :key="ease.id"
                          class="flex flex-col items-center gap-0.5 p-1 rounded border transition-all"
                          :class="(selectedLayer.animOutEase ?? 'power1.in') === ease.id
                            ? 'border-[#4a8fe8] bg-[#4a8fe8]/10'
                            : 'border-transparent hover:bg-white/5'"
                          @click="selectEaseOut(ease.id)"
                        >
                          <svg viewBox="-1 -4 34 28" class="w-7 h-4">
                            <path :d="easeSvgPath(ease.cp)" fill="none"
                              :stroke="(selectedLayer.animOutEase ?? 'power1.in') === ease.id ? '#4a8fe8' : '#666'"
                              stroke-width="1.5" stroke-linecap="round" />
                          </svg>
                          <span class="text-[8px] font-medium truncate w-full text-center"
                            :class="(selectedLayer.animOutEase ?? 'power1.in') === ease.id ? 'text-[#4a8fe8]' : 'text-[#777]'"
                          >{{ ease.label }}</span>
                        </button>
                      </div>
                    </template>
                  </div>
                </template>
              </UPopover>
              <!-- Fine-tune curve editor -->
              <UPopover>
                <UButton size="xs" variant="ghost" icon="i-lucide-spline" />
                <template #content>
                  <div class="p-3 w-[220px]">
                    <BannerEasingCurveEditor
                      :model-value="selectedLayer.animOutEase ?? 'power1.in'"
                      @update:model-value="v => set('animOutEase', v)"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </div>
      </details>
    </template>
  </div>
</template>
