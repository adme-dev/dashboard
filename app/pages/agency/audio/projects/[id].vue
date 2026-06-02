<script setup lang="ts">
// SP2b read-only timeline editor/preview. Loads an SP0 project + presigned clip URLs,
// drives the real SP2a engine for transport, renders MediaTimeline with a playhead
// slaved to engine.currentTime(). No editing/autosave/waveforms/collab (SP2c/SP2d).
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMediaProjectEditor } from '~~/app/composables/useMediaProjectEditor'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const route = useRoute()
const projectId = computed(() => String(route.params.id))
const editor = useMediaProjectEditor(projectId.value)

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto">
    <div class="max-w-5xl mx-auto p-6 space-y-6">
      <header class="flex items-center gap-2">
        <UButton icon="i-lucide-arrow-left" variant="ghost" color="neutral" to="/agency/audio" aria-label="Back to Audio Studio" />
        <div class="space-y-0.5">
          <h1 class="text-2xl font-semibold tracking-tight">Timeline preview</h1>
          <p class="text-sm text-muted">Play back the timeline mix in the browser — fades and ducking, synced to the engine clock.</p>
        </div>
      </header>

      <USkeleton v-if="editor.status.value === 'loading'" class="h-48 w-full" />

      <UAlert
        v-else-if="editor.status.value === 'error'"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Couldn't load this project"
        :description="editor.error.value ?? 'Unknown error'"
      />

      <template v-else-if="editor.status.value === 'ready' && editor.timeline.value">
        <MediaTimeline
          :timeline="editor.timeline.value"
          :clips="editor.clips.value"
          :tracks="editor.tracks.value"
          :current-time="editor.currentTime.value"
          :duration="editor.duration.value"
        />

        <!-- transport bar -->
        <div class="flex items-center gap-4 rounded-lg border border-default bg-elevated p-3">
          <UButton
            :icon="editor.isPlaying.value ? 'i-lucide-pause' : 'i-lucide-play'"
            color="primary"
            :aria-label="editor.isPlaying.value ? 'Pause' : 'Play'"
            @click="editor.isPlaying.value ? editor.pause() : editor.play()"
          />
          <span class="w-20 shrink-0 tabular-nums text-sm text-muted">
            {{ fmt(editor.currentTime.value) }} / {{ fmt(editor.duration.value) }}
          </span>
          <USlider
            class="flex-1"
            :min="0"
            :max="Math.max(editor.duration.value, 0.001)"
            :step="0.01"
            :model-value="editor.currentTime.value"
            @update:model-value="(v: number | number[]) => editor.seek(Array.isArray(v) ? v[0]! : v)"
          />
        </div>
      </template>
    </div>
  </div>
</template>
