<script setup lang="ts">
// MediaVideoLibrary.vue — USlideover listing saved video assets for reuse. Mirrors
// MediaOverlayPicker's structure. Emits publish({ sourceJobId, format }) to re-draft a
// social post from a saved asset's source render. Each asset previews via the authed
// per-asset stream redirect.
import { ref, computed, watch } from 'vue'
import { videoLibraryTimelinePayload } from '~~/app/utils/video/videoLibraryTimeline'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'publish', payload: { sourceJobId: string | null; format: string }): void
  (e: 'add-to-timeline', payload: { r2Key: string; durationSec: number; streamUrl: string }): void
}>()

interface VideoAsset {
  id: string; clientId: string | null; createdBy: string; title: string | null
  sourceProjectId: string | null; sourceJobId: string | null
  r2Key: string; format: string; width: number | null; height: number | null
  durationSec: number | null; generationPrompt: string | null; generationModelId: string | null
  createdAt: string; updatedAt: string
}

const { data, pending, refresh } = useFetch('/api/agency/video/assets', { lazy: true, immediate: false })
const assets = computed((): VideoAsset[] => (data.value as any)?.assets ?? [])

// Fetch on open (immediate:false above defers the initial run until the slideover shows).
watch(() => props.open, (isOpen) => { if (isOpen) void refresh() })

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return iso }
}

function onPublish(a: VideoAsset) {
  emit('publish', { sourceJobId: a.sourceJobId, format: a.format })
}

function onAddToTimeline(a: VideoAsset) {
  emit('add-to-timeline', videoLibraryTimelinePayload(a))
}
</script>

<template>
  <USlideover :open="open" title="Video library" description="Reuse a saved video — publish it to social again." @update:open="emit('update:open', $event)">
    <template #body>
      <div class="flex flex-col gap-4 h-full min-h-0">
        <div class="flex justify-end">
          <UButton icon="i-lucide-refresh-cw" variant="ghost" color="neutral" size="sm" :loading="pending" aria-label="Refresh" @click="refresh()" />
        </div>

        <div class="flex-1 overflow-y-auto space-y-3 pr-0.5">
          <div v-if="pending && !assets.length" class="space-y-3">
            <USkeleton v-for="n in 3" :key="n" class="h-48 w-full rounded-lg" />
          </div>
          <UAlert v-else-if="!assets.length" color="neutral" variant="subtle" icon="i-lucide-inbox" title="No saved videos yet" description="Save a rendered variant to the library from a render job." />

          <div v-for="a in assets" :key="a.id" class="rounded-lg border border-default bg-elevated p-3 space-y-3">
            <video
              :src="`/api/agency/video/assets/${a.id}/stream`"
              controls
              preload="metadata"
              class="w-full rounded-md bg-black"
            />
            <div class="flex items-start gap-2">
              <div class="flex-1 min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">{{ a.title ?? 'Untitled' }}</p>
                <p class="text-xs text-muted">{{ fmtDate(a.createdAt) }}</p>
                <p v-if="a.generationModelId" class="mt-1 truncate text-xs text-muted">Model: {{ a.generationModelId }}</p>
                <p v-if="a.generationPrompt" class="mt-1 line-clamp-2 text-xs text-muted">{{ a.generationPrompt }}</p>
              </div>
              <UBadge :label="a.format" size="xs" variant="subtle" color="neutral" />
            </div>
            <div class="flex justify-end gap-2">
              <UButton
                icon="i-lucide-plus-circle"
                size="xs"
                color="neutral"
                variant="soft"
                label="Add to timeline"
                @click="onAddToTimeline(a)"
              />
              <UTooltip :text="a.sourceJobId ? '' : 'Source render unavailable'" :disabled="!!a.sourceJobId">
                <UButton
                  icon="i-lucide-share-2"
                  size="xs"
                  color="primary"
                  variant="soft"
                  label="Publish to social"
                  :disabled="!a.sourceJobId"
                  @click="onPublish(a)"
                />
              </UTooltip>
            </div>
          </div>
        </div>

        <div class="flex justify-end border-t border-default pt-3">
          <UButton variant="ghost" color="neutral" label="Close" @click="emit('update:open', false)" />
        </div>
      </div>
    </template>
  </USlideover>
</template>
