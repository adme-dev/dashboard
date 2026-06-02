<script setup lang="ts">
import type { AudioAsset } from '~/types'

const props = defineProps<{ assets: AudioAsset[], loading?: boolean, kind?: 'voiceover' | 'music' }>()

const emptyText = computed(() =>
  props.kind === 'music'
    ? 'No music yet — generate a track above.'
    : props.kind === 'voiceover'
      ? 'No voiceovers yet — generate one above.'
      : 'Nothing here yet — generate something above.'
)

function titleFor(a: AudioAsset): string {
  return a.title || (a.kind === 'music' ? 'Untitled track' : 'Untitled voiceover')
}

// Right-side state when there's no playable master yet.
function statusBadge(a: AudioAsset): { label: string, color: 'neutral' | 'info' | 'error', spin: boolean } {
  switch (a.status) {
    case 'queued': return { label: 'queued', color: 'neutral', spin: true }
    case 'processing': return { label: 'generating', color: 'info', spin: true }
    case 'rendering': return { label: 'rendering', color: 'info', spin: true }
    case 'failed': return { label: 'failed', color: 'error', spin: false }
    default: return { label: 'unavailable', color: 'error', spin: false }
  }
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="loading" class="text-sm text-muted py-8 text-center">
      Loading…
    </div>

    <div
      v-else-if="!assets.length"
      class="flex flex-col items-center gap-2 py-12 text-center border border-dashed border-default rounded-lg"
    >
      <UIcon name="i-lucide-audio-lines" class="size-6 text-dimmed" />
      <p class="text-sm text-muted">
        {{ emptyText }}
      </p>
    </div>

    <UCard v-for="a in assets" :key="a.id">
      <div class="flex items-center gap-4">
        <div class="min-w-0 flex-1">
          <p class="font-medium truncate">
            {{ titleFor(a) }}
          </p>
          <p v-if="a.prompt" class="text-xs text-muted truncate mt-0.5">
            {{ a.prompt }}
          </p>
          <div v-if="a.channels.length" class="flex flex-wrap gap-1 mt-1.5">
            <UBadge
              v-for="c in a.channels"
              :key="c"
              size="xs"
              variant="subtle"
              color="neutral"
            >
              {{ c }}
            </UBadge>
          </div>
          <div v-if="a.variantUrls && Object.keys(a.variantUrls).length" class="flex flex-wrap items-center gap-3 mt-2">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-dimmed">Variants</span>
            <a
              v-for="(url, ch) in a.variantUrls"
              :key="ch"
              :href="url"
              download
              class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <UIcon name="i-lucide-download" class="size-3" />
              {{ ch }}
            </a>
          </div>
        </div>
        <audio
          v-if="a.streamUrl"
          :key="a.r2KeyMaster || a.id"
          :src="a.streamUrl"
          controls
          preload="metadata"
          class="h-9 shrink-0"
        />
        <UBadge
          v-else
          size="xs"
          variant="subtle"
          :color="statusBadge(a).color"
          class="shrink-0 flex items-center gap-1"
        >
          <UIcon v-if="statusBadge(a).spin" name="i-lucide-loader-circle" class="animate-spin" />
          {{ statusBadge(a).label }}
        </UBadge>
      </div>
    </UCard>
  </div>
</template>
