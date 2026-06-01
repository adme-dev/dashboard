<script setup lang="ts">
import type { AudioAsset } from '~/types'

defineProps<{ assets: AudioAsset[]; loading?: boolean }>()
</script>

<template>
  <div class="space-y-3">
    <div v-if="loading" class="text-sm text-muted py-8 text-center">Loading…</div>

    <div
      v-else-if="!assets.length"
      class="flex flex-col items-center gap-2 py-12 text-center border border-dashed border-default rounded-lg"
    >
      <UIcon name="i-lucide-audio-lines" class="size-6 text-dimmed" />
      <p class="text-sm text-muted">No voiceovers yet — generate one above.</p>
    </div>

    <UCard v-for="a in assets" :key="a.id">
      <div class="flex items-center gap-4">
        <div class="min-w-0 flex-1">
          <p class="font-medium truncate">{{ a.title || 'Untitled voiceover' }}</p>
          <p v-if="a.prompt" class="text-xs text-muted truncate mt-0.5">{{ a.prompt }}</p>
          <div v-if="a.channels.length" class="flex flex-wrap gap-1 mt-1.5">
            <UBadge v-for="c in a.channels" :key="c" size="xs" variant="subtle" color="neutral">{{ c }}</UBadge>
          </div>
        </div>
        <audio v-if="a.streamUrl" :src="a.streamUrl" controls preload="none" class="h-9 shrink-0" />
        <UBadge v-else size="xs" variant="subtle" color="error" class="shrink-0">unavailable</UBadge>
      </div>
    </UCard>
  </div>
</template>
