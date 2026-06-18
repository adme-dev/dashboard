<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  filterVideoStudioAssets,
  type VideoStudioAsset,
  type VideoStudioAssetFilters,
  type VideoStudioAssetSource,
  type VideoStudioAssetStatus,
  type VideoStudioAssetType,
} from '~~/app/utils/video/videoStudioAssets'

const props = withDefaults(defineProps<{
  assets: VideoStudioAsset[]
  selectedId?: string | null
  loading?: boolean
}>(), {
  selectedId: null,
  loading: false,
})

const emit = defineEmits<{
  (event: 'update:selected-id', value: string | null): void
  (event: 'add-asset', asset: VideoStudioAsset): void
  (event: 'refresh'): void
}>()

const search = ref('')
const type = ref<VideoStudioAssetType | 'all'>('all')
const source = ref<VideoStudioAssetSource | 'all'>('all')
const status = ref<VideoStudioAssetStatus | 'all'>('all')
const model = ref<string | 'all'>('all')
const captions = ref<'all' | 'with' | 'without'>('all')
const bucketId = ref<string | 'all'>('all')

const TYPE_OPTIONS = [
  { label: 'All types', value: 'all' },
  { label: 'Video', value: 'video' },
  { label: 'Audio', value: 'audio' },
  { label: 'Overlay', value: 'overlay' },
  { label: 'AI job', value: 'job' },
  { label: 'Bucket', value: 'bucket' },
  { label: 'Derivative', value: 'derivative' },
]

const SOURCE_OPTIONS = [
  { label: 'All sources', value: 'all' },
  { label: 'Library', value: 'library' },
  { label: 'Generation', value: 'generation' },
  { label: 'Audio', value: 'audio' },
  { label: 'Banner', value: 'banner' },
  { label: 'Bucket', value: 'bucket' },
  { label: 'Derivative', value: 'derivative' },
]

const STATUS_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Ready', value: 'ready' },
  { label: 'Done', value: 'done' },
  { label: 'Succeeded', value: 'succeeded' },
  { label: 'Queued', value: 'queued' },
  { label: 'Processing', value: 'processing' },
  { label: 'Rendering', value: 'rendering' },
  { label: 'Running', value: 'running' },
  { label: 'Blocked', value: 'blocked' },
  { label: 'Failed', value: 'failed' },
  { label: 'Unknown', value: 'unknown' },
]

const CAPTION_OPTIONS = [
  { label: 'All captions', value: 'all' },
  { label: 'With captions', value: 'with' },
  { label: 'No captions', value: 'without' },
]

const modelOptions = computed(() => {
  const models = Array.from(new Set(props.assets.map(asset => asset.modelId).filter(Boolean) as string[])).sort()
  return [{ label: 'All models', value: 'all' }, ...models.map(value => ({ label: value, value }))]
})

const bucketOptions = computed(() => {
  const buckets = Array.from(new Set(props.assets.map(asset => asset.bucketId).filter(Boolean) as string[])).sort()
  return [{ label: 'All buckets', value: 'all' }, ...buckets.map(value => ({ label: value, value }))]
})

const filters = computed<VideoStudioAssetFilters>(() => ({
  search: search.value,
  type: type.value,
  source: source.value,
  status: status.value,
  model: model.value,
  bucketId: bucketId.value,
  captions: captions.value,
}))

const filteredAssets = computed(() => filterVideoStudioAssets(props.assets, filters.value))
const groupedAssets = computed(() => {
  if (bucketOptions.value.length <= 1) return [{ key: 'all', label: null as string | null, assets: filteredAssets.value }]

  const groups = new Map<string, VideoStudioAsset[]>()
  const order: string[] = []
  for (const asset of filteredAssets.value) {
    const key = asset.bucketId ? `bucket:${asset.bucketId}` : `source:${asset.source}`
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(asset)
  }

  return order.map((key) => {
    const assets = groups.get(key) ?? []
    const first = assets[0]
    return {
      key,
      label: first?.bucketId ? `Bucket ${first.bucketId}` : sourceLabel(first?.source ?? 'library'),
      assets,
    }
  })
})

function iconFor(asset: VideoStudioAsset) {
  if (asset.type === 'audio') return asset.role === 'music' ? 'i-lucide-music' : 'i-lucide-mic'
  if (asset.type === 'overlay') return 'i-lucide-shapes'
  if (asset.type === 'job') return 'i-lucide-sparkles'
  if (asset.type === 'bucket') return 'i-lucide-folder'
  if (asset.type === 'derivative') return 'i-lucide-layers'
  return 'i-lucide-film'
}

function statusColor(status: VideoStudioAssetStatus): 'primary' | 'success' | 'error' | 'warning' | 'neutral' {
  if (status === 'ready' || status === 'done' || status === 'succeeded') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'blocked') return 'warning'
  if (status === 'queued' || status === 'processing' || status === 'rendering' || status === 'running') return 'primary'
  return 'neutral'
}

function durationLabel(seconds: number | null) {
  if (!seconds) return null
  const rounded = Number.isInteger(seconds) ? seconds : Number(seconds.toFixed(1))
  return `${rounded}s`
}

function addLabel(asset: VideoStudioAsset) {
  if (asset.timelineReady) return 'Add'
  if (asset.type === 'audio' && (asset.status === 'queued' || asset.status === 'processing' || asset.status === 'rendering')) return 'Generating'
  if (asset.status === 'failed') return 'Failed'
  return 'Unavailable'
}

function sourceLabel(value: VideoStudioAssetSource) {
  const labels: Record<VideoStudioAssetSource, string> = {
    audio: 'Audio assets',
    banner: 'Banner overlays',
    bucket: 'Buckets',
    derivative: 'Derivatives',
    generation: 'Generated media',
    library: 'Library media',
  }
  return labels[value]
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        size="xs"
        placeholder="Search assets"
        class="min-w-0 flex-1"
      />
      <UButton
        icon="i-lucide-refresh-cw"
        size="xs"
        variant="ghost"
        color="neutral"
        :loading="props.loading"
        aria-label="Refresh library assets"
        @click="emit('refresh')"
      />
    </div>

    <div class="grid grid-cols-2 gap-2">
      <USelect v-model="type" :items="TYPE_OPTIONS" value-key="value" size="xs" aria-label="Filter asset type" />
      <USelect v-model="source" :items="SOURCE_OPTIONS" value-key="value" size="xs" aria-label="Filter asset source" />
      <USelect v-model="status" :items="STATUS_OPTIONS" value-key="value" size="xs" aria-label="Filter asset status" />
      <USelect v-model="model" :items="modelOptions" value-key="value" size="xs" aria-label="Filter model" />
      <USelect v-model="captions" :items="CAPTION_OPTIONS" value-key="value" size="xs" aria-label="Filter captions" />
      <USelect v-if="bucketOptions.length > 1" v-model="bucketId" :items="bucketOptions" value-key="value" size="xs" aria-label="Filter bucket" />
    </div>

    <div class="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
      <div v-if="props.loading && !props.assets.length" class="space-y-2">
        <USkeleton v-for="n in 5" :key="n" class="h-20 w-full rounded-md" />
      </div>

      <div v-else-if="!filteredAssets.length" class="rounded-md border border-dashed border-default px-3 py-5 text-center">
        <UIcon name="i-lucide-inbox" class="mx-auto size-5 text-muted" />
        <p class="mt-2 text-xs font-medium text-highlighted">No assets match</p>
        <p class="mt-1 text-[11px] text-muted">Adjust filters or generate/upload source media.</p>
      </div>

      <div v-for="group in groupedAssets" :key="group.key" class="space-y-2">
        <div v-if="group.label" class="flex items-center gap-2 px-1 text-[11px] font-medium uppercase text-muted">
          <UIcon name="i-lucide-folder-open" class="size-3.5" />
          <span>{{ group.label }}</span>
          <span class="ml-auto tabular-nums">{{ group.assets.length }}</span>
        </div>

        <div
          v-for="asset in group.assets"
          :key="asset.id"
          class="w-full rounded-md border p-2 text-left transition"
          :class="props.selectedId === asset.id ? 'border-primary bg-primary/10' : 'border-default bg-elevated hover:border-primary/50'"
        >
          <div class="flex items-start gap-2">
            <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <UIcon :name="iconFor(asset)" class="size-4 text-primary" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  class="min-w-0 flex-1 truncate text-left text-xs font-medium text-highlighted hover:text-primary"
                  @click="emit('update:selected-id', asset.id)"
                >
                  {{ asset.title }}
                </button>
                <UBadge :label="asset.status" size="xs" :color="statusColor(asset.status)" variant="subtle" />
              </div>
              <p class="mt-0.5 truncate text-[11px] text-muted">
                {{ asset.source }}<span v-if="asset.subtitle"> · {{ asset.subtitle }}</span><span v-if="durationLabel(asset.durationSec)"> · {{ durationLabel(asset.durationSec) }}</span>
              </p>
              <p v-if="asset.prompt" class="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">{{ asset.prompt }}</p>
              <p v-else-if="asset.modelId" class="mt-1 truncate text-[11px] text-muted">{{ asset.modelId }}</p>
              <audio
                v-if="asset.type === 'audio' && asset.previewUrl"
                :src="asset.previewUrl"
                controls
                preload="none"
                class="mt-2 h-8 w-full"
              />
            </div>
          </div>
          <div class="mt-2 flex items-center justify-between gap-2">
            <div class="flex min-w-0 flex-wrap items-center gap-1">
              <UBadge :label="asset.type" size="xs" variant="subtle" color="neutral" />
              <UBadge v-if="asset.captionVttUrl" label="Captions" size="xs" variant="subtle" color="primary" />
              <a
                v-if="asset.captionVttUrl"
                :href="asset.captionVttUrl"
                target="_blank"
                rel="noopener"
                class="text-[11px] font-medium text-primary hover:underline"
                @click.stop
              >
                Open VTT
              </a>
            </div>
            <UButton
              icon="i-lucide-list-plus"
              size="xs"
              variant="ghost"
              color="primary"
              :label="addLabel(asset)"
              :disabled="!asset.timelineReady"
              @click.stop="emit('add-asset', asset)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
