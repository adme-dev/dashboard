<script setup lang="ts">
import { computed } from 'vue'
import {
  videoStudioAssetImageSource,
  type VideoStudioAsset,
  type VideoStudioAssetStatus,
} from '~~/app/utils/video/videoStudioAssets'

const props = defineProps<{
  asset: VideoStudioAsset | null
}>()

const emit = defineEmits<{
  (event: 'add-to-timeline', asset: VideoStudioAsset): void
  (event: 'generate-from-asset', asset: VideoStudioAsset): void
}>()

const canGenerate = computed(() => Boolean(videoStudioAssetImageSource(props.asset)))

function previewKind(asset: VideoStudioAsset): 'image' | 'video' | 'audio' | 'empty' {
  if (asset.thumbnailUrl) return 'image'
  if (asset.type === 'audio' && asset.previewUrl) return 'audio'
  if ((asset.type === 'video' || asset.type === 'job' || asset.type === 'derivative') && asset.previewUrl) return 'video'
  return 'empty'
}

function durationLabel(seconds: number | null) {
  if (!seconds) return null
  const rounded = Number.isInteger(seconds) ? seconds : Number(seconds.toFixed(1))
  return `${rounded}s`
}

function statusColor(status: VideoStudioAssetStatus): 'primary' | 'success' | 'error' | 'warning' | 'neutral' {
  if (status === 'ready' || status === 'done' || status === 'succeeded') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'blocked') return 'warning'
  if (status === 'queued' || status === 'processing' || status === 'rendering' || status === 'running') return 'primary'
  return 'neutral'
}

function statusMessage(status: VideoStudioAssetStatus) {
  if (status === 'failed') return 'This asset failed upstream. Retry generation or inspect the source job before using it.'
  if (status === 'blocked') return 'This asset is blocked by policy or missing source data. Inspect it before adding it to the edit.'
  return null
}
</script>

<template>
  <section class="rounded-md border border-default bg-elevated">
    <div class="flex flex-wrap items-start gap-3 border-b border-default px-3 py-2">
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium uppercase text-muted">Selected asset</p>
        <h3 class="truncate text-sm font-semibold text-highlighted">
          {{ props.asset?.title ?? 'No asset selected' }}
        </h3>
      </div>
      <div v-if="props.asset" class="flex shrink-0 flex-wrap items-center gap-1.5">
        <UButton
          icon="i-lucide-list-plus"
          size="xs"
          variant="soft"
          color="primary"
          label="Add to timeline"
          :disabled="!props.asset.timelineReady"
          @click="emit('add-to-timeline', props.asset)"
        />
        <UButton
          icon="i-lucide-sparkles"
          size="xs"
          variant="ghost"
          color="neutral"
          label="Generate from asset"
          :disabled="!canGenerate"
          @click="emit('generate-from-asset', props.asset)"
        />
      </div>
    </div>

    <div v-if="!props.asset" class="px-3 py-8 text-center">
      <UIcon name="i-lucide-mouse-pointer-square" class="mx-auto size-5 text-muted" />
      <p class="mt-2 text-xs font-medium text-highlighted">Pick an asset from the library</p>
      <p class="mx-auto mt-1 max-w-64 text-[11px] text-muted">Preview source media, inspect metadata, then add or generate from it without leaving the editor.</p>
    </div>

    <div v-else class="grid gap-3 p-3 xl:grid-cols-[minmax(15rem,22rem)_minmax(0,1fr)]">
      <div class="overflow-hidden rounded-md border border-default bg-default/40">
        <img
          v-if="previewKind(props.asset) === 'image'"
          :src="props.asset.thumbnailUrl!"
          :alt="props.asset.title"
          class="aspect-video w-full object-cover"
        >
        <video
          v-else-if="previewKind(props.asset) === 'video'"
          :src="props.asset.previewUrl!"
          controls
          playsinline
          preload="metadata"
          class="aspect-video w-full bg-black object-contain"
        />
        <div v-else-if="previewKind(props.asset) === 'audio'" class="flex min-h-36 items-center justify-center p-4">
          <audio :src="props.asset.previewUrl!" controls preload="none" class="w-full" />
        </div>
        <div v-else class="flex aspect-video items-center justify-center p-4 text-center">
          <div>
            <UIcon name="i-lucide-eye-off" class="mx-auto size-5 text-muted" />
            <p class="mt-2 text-[11px] text-muted">No preview available for this asset.</p>
          </div>
        </div>
      </div>

      <div class="min-w-0 space-y-3">
        <UAlert
          v-if="statusMessage(props.asset.status)"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="props.asset.status === 'failed' ? 'Asset failed' : 'Asset blocked'"
          :description="statusMessage(props.asset.status)"
        />

        <dl class="grid grid-cols-2 gap-2 text-[11px]">
          <div class="rounded-md bg-default/40 px-2 py-1.5">
            <dt class="text-muted">Source</dt>
            <dd class="truncate font-medium text-highlighted">{{ props.asset.source }}</dd>
          </div>
          <div class="rounded-md bg-default/40 px-2 py-1.5">
            <dt class="text-muted">Status</dt>
            <dd><UBadge :label="props.asset.status" size="xs" :color="statusColor(props.asset.status)" variant="subtle" /></dd>
          </div>
          <div class="rounded-md bg-default/40 px-2 py-1.5">
            <dt class="text-muted">Model</dt>
            <dd class="truncate font-medium text-highlighted">{{ props.asset.modelId ?? 'None' }}</dd>
          </div>
          <div class="rounded-md bg-default/40 px-2 py-1.5">
            <dt class="text-muted">Duration</dt>
            <dd class="font-medium text-highlighted">{{ durationLabel(props.asset.durationSec) ?? 'Unknown' }}</dd>
          </div>
          <div class="rounded-md bg-default/40 px-2 py-1.5">
            <dt class="text-muted">Aspect</dt>
            <dd class="truncate font-medium text-highlighted">{{ props.asset.format ?? 'Unknown' }}</dd>
          </div>
          <div class="rounded-md bg-default/40 px-2 py-1.5">
            <dt class="text-muted">Bucket</dt>
            <dd class="truncate font-medium text-highlighted">{{ props.asset.bucketId ?? 'None' }}</dd>
          </div>
        </dl>

        <div v-if="props.asset.prompt" class="rounded-md bg-default/40 px-2 py-1.5">
          <p class="text-[11px] text-muted">Prompt</p>
          <p class="mt-1 line-clamp-3 text-xs leading-snug text-highlighted">{{ props.asset.prompt }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
