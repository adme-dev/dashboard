<script setup lang="ts">
// Read-only multitrack lane view: one row per track, clips as time-positioned blocks,
// a single playhead line driven by the parent's currentTime (slaved to engine.currentTime()).
// Display-only in SP2b — no drag/trim/seek-on-click (that's SP2c). Pure geometry from
// timelineGeometry.ts; semantic Nuxt UI colors (dark-mode safe).
import { computed } from 'vue'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import type { ScheduledClip, TrackBus } from '~~/app/utils/audio/audioSchedulePlanner'
import { clipRect, playheadX } from '~~/app/utils/audio/timelineGeometry'

const props = withDefaults(defineProps<{
  timeline: TimelineState
  clips: ScheduledClip[]
  tracks: TrackBus[]
  currentTime: number
  duration: number
  pxPerSec?: number
}>(), { pxPerSec: 60 })

const LANE_HEIGHT = 56
const LABEL_WIDTH = 120

// One lane per timeline track, in order; carry name + muted from the raw timeline.
const lanes = computed(() => props.timeline.tracks.map((t) => ({
  id: t.id,
  name: t.name,
  muted: t.muted,
  clips: props.clips.filter((c) => c.trackId === t.id)
})))

const trackWidthPx = computed(() => Math.max(props.duration, 1) * props.pxPerSec)
const playheadLeft = computed(() => LABEL_WIDTH + playheadX(props.currentTime, props.pxPerSec))

function rect(clip: ScheduledClip) {
  // null-duration clips: fall back to (total duration − start) so the block has a width
  const fallback = Math.max(0, props.duration - clip.timelineStartSec)
  return clipRect(clip, props.pxPerSec, fallback)
}
function fmtDur(clip: ScheduledClip) {
  const fallback = Math.max(0, props.duration - clip.timelineStartSec)
  const d = clip.durationSec ?? fallback
  return `${d.toFixed(1)}s`
}
</script>

<template>
  <div class="relative overflow-x-auto rounded-lg border border-default bg-elevated">
    <div class="relative" :style="{ width: `${LABEL_WIDTH + trackWidthPx}px`, minWidth: '100%' }">
      <!-- lanes -->
      <div
        v-for="lane in lanes"
        :key="lane.id"
        class="relative border-b border-default last:border-b-0"
        :style="{ height: `${LANE_HEIGHT}px` }"
      >
        <!-- sticky track label -->
        <div
          class="absolute left-0 top-0 z-10 flex h-full items-center gap-2 border-r border-default bg-elevated px-3"
          :style="{ width: `${LABEL_WIDTH}px` }"
        >
          <UIcon v-if="lane.muted" name="i-lucide-volume-x" class="size-4 text-muted" />
          <span class="truncate text-sm font-medium" :class="lane.muted ? 'text-muted' : 'text-highlighted'">{{ lane.name }}</span>
        </div>
        <!-- clips -->
        <div
          v-for="clip in lane.clips"
          :key="clip.clipId"
          class="absolute top-2 flex items-center rounded-md px-2 text-xs font-medium text-inverted"
          :class="lane.muted ? 'bg-muted' : 'bg-primary'"
          :style="{
            left: `${LABEL_WIDTH + rect(clip).x}px`,
            width: `${rect(clip).width}px`,
            height: `${LANE_HEIGHT - 16}px`
          }"
        >
          <span class="truncate">{{ clip.clipId }} · {{ fmtDur(clip) }}</span>
        </div>
      </div>

      <!-- playhead -->
      <div
        class="pointer-events-none absolute top-0 z-20 w-px bg-primary"
        :style="{ left: `${playheadLeft}px`, height: '100%' }"
      >
        <div class="absolute -left-1 -top-1 size-2 rounded-full bg-primary" />
      </div>
    </div>
  </div>
</template>
