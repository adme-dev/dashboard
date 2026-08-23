<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { VideoStudioClipInspectorSummary } from '~~/app/utils/video/clipInspector'
import type { CaptionStylePreset } from '~~/app/utils/audio/timelineEdit'
import { OVERLAY_ANCHORS, normalizeOverlayPlacement, type OverlayAnchor, type OverlayPlacement } from '~~/shared/utils/overlayPlacement'

const props = withDefaults(defineProps<{
  clip: VideoStudioClipInspectorSummary
  canSplit?: boolean
}>(), {
  canSplit: true,
})

const emit = defineEmits<{
  (event: 'split'): void
  (event: 'delete'): void
  (event: 'set-caption-style', style: CaptionStylePreset): void
  /** Numeric timing edit — exactly one field per emit, in timeline seconds. */
  (event: 'set-timing', payload: { field: 'start' | 'duration' | 'end'; seconds: number }): void
  (event: 'set-placement', placement: OverlayPlacement): void
}>()

// ─── Overlay placement (anchor grid + scale + margin) ────────────────────────
const placement = computed(() => normalizeOverlayPlacement(props.clip.placement ?? null))
const ANCHOR_LABEL: Record<OverlayAnchor, string> = {
  'top-left': 'Top left', 'top-center': 'Top', 'top-right': 'Top right',
  'center-left': 'Left', 'center': 'Centre', 'center-right': 'Right',
  'bottom-left': 'Bottom left', 'bottom-center': 'Bottom', 'bottom-right': 'Bottom right',
}
function setAnchor(anchor: OverlayAnchor) { emit('set-placement', { ...placement.value, anchor }) }
function setScale(value: number | number[]) { emit('set-placement', { ...placement.value, scale: Array.isArray(value) ? value[0]! : value }) }
function setMargin(value: number | number[]) { emit('set-placement', { ...placement.value, margin_pct: Array.isArray(value) ? value[0]! : value }) }

// ─── Numeric timing (precise placement without pixel-dragging) ───────────────
const TIMING_FIELDS = ['start', 'duration', 'end'] as const
type TimingField = typeof TIMING_FIELDS[number]
const timingDraft = ref<Record<TimingField, string>>({ start: '', duration: '', end: '' })

function fmtSeconds(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '' : String(Math.round(value * 100) / 100)
}
function syncTimingDraft() {
  timingDraft.value = {
    start: fmtSeconds(props.clip.startSec),
    duration: fmtSeconds(props.clip.durationSec),
    end: fmtSeconds(props.clip.endSec),
  }
}
watch(() => [props.clip.clipId, props.clip.startSec, props.clip.durationSec, props.clip.endSec], syncTimingDraft, { immediate: true })

function commitTiming(field: TimingField) {
  const parsed = Number.parseFloat(timingDraft.value[field])
  const current = field === 'start' ? props.clip.startSec : field === 'duration' ? props.clip.durationSec : props.clip.endSec
  if (!Number.isFinite(parsed) || parsed < 0 || (current != null && Math.abs(parsed - current) < 0.005)) {
    syncTimingDraft()
    return
  }
  emit('set-timing', { field, seconds: Math.round(parsed * 100) / 100 })
}

const timingLabels: Record<TimingField, string> = { start: 'Start', duration: 'Duration', end: 'End' }
const canEditTiming = computed(() => props.clip.durationSec != null)
// Timing now has its own editable row; keep the remaining facts as read-only tiles.
const staticDetails = computed(() => props.clip.details.filter(detail => !/^(start|duration|end)$/i.test(detail.label)))

const captionStyleOptions: Array<{ id: CaptionStylePreset; label: string; hint: string }> = [
  { id: 'platform_default', label: 'Platform', hint: 'Balanced lower-third captions for most social formats.' },
  { id: 'bold_social', label: 'Bold social', hint: 'Larger, punchier captions for short-form hooks.' },
  { id: 'subtitle_safe', label: 'Subtitle-safe', hint: 'Smaller text with a larger bottom safe area.' },
]

const kindIcon = computed(() => {
  switch (props.clip.kind) {
    case 'video': return 'i-lucide-film'
    case 'overlay': return 'i-lucide-shapes'
    case 'caption': return 'i-lucide-subtitles'
    default: return 'i-lucide-audio-lines'
  }
})
</script>

<template>
  <section class="rounded-lg border border-default bg-elevated p-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex items-start gap-2">
        <UIcon :name="kindIcon" class="mt-0.5 size-4 shrink-0 text-primary" />
        <div class="min-w-0">
          <p class="text-xs font-medium uppercase text-muted">Selected clip</p>
          <h3 class="truncate text-sm font-semibold text-highlighted">{{ props.clip.label }}</h3>
          <p class="mt-0.5 truncate text-xs text-muted">{{ props.clip.trackName }} · {{ props.clip.sourceLabel }}</p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <UButton icon="i-lucide-scissors" size="xs" variant="soft" color="neutral" label="Split" :disabled="!props.canSplit" @click="emit('split')" />
        <UButton icon="i-lucide-trash-2" size="xs" variant="soft" color="error" label="Delete" @click="emit('delete')" />
      </div>
    </div>

    <div class="mt-3 grid grid-cols-3 gap-2">
      <UFormField
        v-for="field in TIMING_FIELDS"
        :key="field"
        :label="timingLabels[field]"
        size="xs"
        :ui="{ label: 'text-[10px] uppercase text-muted' }"
      >
        <UInput
          v-model="timingDraft[field]"
          type="number"
          inputmode="decimal"
          step="0.1"
          min="0"
          size="xs"
          class="w-full"
          :disabled="!canEditTiming"
          :aria-label="`${timingLabels[field]} (seconds)`"
          @keydown.enter.prevent="commitTiming(field)"
          @blur="commitTiming(field)"
        >
          <template #trailing><span class="text-[10px] text-muted">s</span></template>
        </UInput>
      </UFormField>
    </div>

    <dl class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div
        v-for="detail in staticDetails"
        :key="`${detail.label}:${detail.value}`"
        class="min-w-0 rounded-md border border-default bg-default/30 px-2 py-1.5"
      >
        <dt class="truncate text-[10px] uppercase text-muted">{{ detail.label }}</dt>
        <dd class="truncate text-xs font-medium text-highlighted">{{ detail.value }}</dd>
      </div>
    </dl>

    <div v-if="props.clip.kind === 'overlay'" class="mt-3 border-t border-default pt-3">
      <div class="mb-2 flex items-center justify-between gap-3">
        <p class="text-xs font-medium uppercase text-muted">Placement</p>
        <p class="text-[11px] text-muted">{{ ANCHOR_LABEL[placement.anchor] }} · {{ Math.round(placement.scale * 100) }}% · {{ placement.margin_pct }}% inset</p>
      </div>
      <div class="flex items-start gap-3">
        <div class="grid shrink-0 grid-cols-3 gap-1" role="radiogroup" aria-label="Overlay anchor">
          <button
            v-for="anchor in OVERLAY_ANCHORS"
            :key="anchor"
            type="button"
            role="radio"
            :aria-checked="placement.anchor === anchor"
            :aria-label="ANCHOR_LABEL[anchor]"
            :title="ANCHOR_LABEL[anchor]"
            class="size-7 rounded border transition"
            :class="placement.anchor === anchor ? 'border-primary bg-primary/20' : 'border-default bg-default/30 hover:border-primary/40'"
            @click="setAnchor(anchor)"
          >
            <span class="mx-auto block size-2 rounded-sm" :class="placement.anchor === anchor ? 'bg-primary' : 'bg-muted'" />
          </button>
        </div>
        <div class="min-w-0 flex-1 space-y-2">
          <UFormField label="Size" size="xs" :ui="{ label: 'text-[10px] uppercase text-muted' }">
            <USlider :model-value="placement.scale" :min="0.1" :max="3" :step="0.05" size="xs" aria-label="Overlay size" @update:model-value="setScale" />
          </UFormField>
          <UFormField label="Inset" size="xs" :ui="{ label: 'text-[10px] uppercase text-muted' }">
            <USlider :model-value="placement.margin_pct" :min="0" :max="40" :step="1" size="xs" aria-label="Overlay inset" @update:model-value="setMargin" />
          </UFormField>
        </div>
      </div>
    </div>

    <div v-if="props.clip.kind === 'caption'" class="mt-3 border-t border-default pt-3">
      <div class="mb-2 flex items-center justify-between gap-3">
        <p class="text-xs font-medium uppercase text-muted">Caption style</p>
        <p class="truncate text-[11px] text-muted">{{ captionStyleOptions.find(option => option.id === props.clip.captionStyle)?.hint }}</p>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="option in captionStyleOptions"
          :key="option.id"
          type="button"
          role="switch"
          :aria-checked="props.clip.captionStyle === option.id"
          class="min-h-14 rounded-md border px-2 py-1.5 text-left transition"
          :class="props.clip.captionStyle === option.id
            ? 'border-primary bg-primary/10 text-highlighted'
            : 'border-default bg-default/30 text-default hover:border-primary/40 hover:bg-primary/5'"
          :title="option.hint"
          @click="emit('set-caption-style', option.id)"
        >
          <span class="block truncate text-xs font-semibold">{{ option.label }}</span>
          <span class="block truncate text-[10px] text-muted">{{ option.id.replace(/_/g, ' ') }}</span>
        </button>
      </div>
    </div>
  </section>
</template>
