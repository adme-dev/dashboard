<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import {
  filterVideoStudioAssets,
  videoStudioAssetImageSource,
  type VideoStudioAsset,
  type VideoStudioAssetFilters,
  type VideoStudioAssetSource,
  type VideoStudioAssetStatus,
} from '~~/app/utils/video/videoStudioAssets'
import { videoStudioAssetGovernanceBadges } from '~~/app/utils/video/videoStudioAssetGovernance'

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
  (event: 'generate-from-asset', asset: VideoStudioAsset): void
  (event: 'inspect-asset', asset: VideoStudioAsset): void
  (event: 'publish-asset', asset: VideoStudioAsset): void
  (event: 'refresh'): void
}>()

type CategoryFilter = 'all' | 'footage' | 'still' | 'generated' | 'derivative' | 'voiceover' | 'music' | 'overlay' | 'caption'
type SourceFilter = 'all' | 'upload' | 'generation' | 'render' | 'audio' | 'banner' | 'derivative'
type StatusFilter = 'all' | 'ready' | 'running' | 'failed' | 'blocked' | 'unknown'
type SortFilter = 'newest' | 'oldest' | 'duration' | 'status'

const search = ref('')
const category = useLocalStorage<CategoryFilter>('video-studio-library-category', 'all')
const source = useLocalStorage<SourceFilter>('video-studio-library-source', 'all')
const statusBucket = useLocalStorage<StatusFilter>('video-studio-library-status', 'all')
const model = ref<string | 'all'>('all')
const aspect = ref<string | 'all'>('all')
const bucketId = ref<string | 'all'>('all')
const sort = useLocalStorage<SortFilter>('video-studio-library-sort', 'newest')

const CATEGORY_FILTERS = [
  { label: 'All', value: 'all', icon: 'i-lucide-library' },
  { label: 'Footage', value: 'footage', icon: 'i-lucide-film' },
  { label: 'Stills', value: 'still', icon: 'i-lucide-image' },
  { label: 'Generated', value: 'generated', icon: 'i-lucide-sparkles' },
  { label: 'Derivatives', value: 'derivative', icon: 'i-lucide-layers' },
  { label: 'Voiceover', value: 'voiceover', icon: 'i-lucide-mic' },
  { label: 'Music', value: 'music', icon: 'i-lucide-music' },
  { label: 'Overlays', value: 'overlay', icon: 'i-lucide-shapes' },
  { label: 'Captions', value: 'caption', icon: 'i-lucide-subtitles' },
]

const SOURCE_FILTERS = [
  { label: 'All sources', value: 'all' },
  { label: 'Uploads', value: 'upload' },
  { label: 'AI', value: 'generation' },
  { label: 'Renders', value: 'render' },
  { label: 'Audio Studio', value: 'audio' },
  { label: 'Banner Studio', value: 'banner' },
  { label: 'Derivatives', value: 'derivative' },
]

const STATUS_FILTERS = [
  { label: 'All status', value: 'all' },
  { label: 'Ready', value: 'ready' },
  { label: 'Running', value: 'running' },
  { label: 'Failed', value: 'failed' },
  { label: 'Blocked', value: 'blocked' },
  { label: 'Unknown', value: 'unknown' },
]

const SORT_OPTIONS = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Duration', value: 'duration' },
  { label: 'Status', value: 'status' },
]

const modelOptions = computed(() => {
  const models = Array.from(new Set(props.assets.map(asset => asset.modelId).filter(Boolean) as string[])).sort()
  return [{ label: 'All models', value: 'all' }, ...models.map(value => ({ label: value, value }))]
})

const bucketOptions = computed(() => {
  const buckets = Array.from(new Set(props.assets.map(asset => asset.bucketId).filter(Boolean) as string[])).sort()
  return [{ label: 'All buckets', value: 'all' }, ...buckets.map(value => ({ label: value, value }))]
})

const aspectOptions = computed(() => {
  const aspects = Array.from(new Set(props.assets.map(asset => asset.format).filter(Boolean) as string[])).sort()
  return [{ label: 'All aspect ratios', value: 'all' }, ...aspects.map(value => ({ label: value, value }))]
})

const filters = computed<VideoStudioAssetFilters>(() => ({
  search: search.value,
  source: source.value === 'upload' ? 'all' : source.value,
  model: model.value,
  bucketId: bucketId.value,
}))

const filteredAssets = computed(() => {
  const base = filterVideoStudioAssets(props.assets, filters.value)
    .filter(asset => matchesCategory(asset))
    .filter(asset => matchesSource(asset))
    .filter(asset => matchesStatusBucket(asset))
    .filter(asset => aspect.value === 'all' || asset.format === aspect.value)

  return [...base].sort((a, b) => {
    if (sort.value === 'oldest') return timeValue(a) - timeValue(b)
    if (sort.value === 'duration') return (b.durationSec ?? 0) - (a.durationSec ?? 0)
    if (sort.value === 'status') return a.status.localeCompare(b.status)
    return timeValue(b) - timeValue(a)
  })
})

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

function imageR2Key(r2Key: string | null): boolean {
  return Boolean(r2Key && /\.(png|jpe?g|webp)$/i.test(r2Key.split('?')[0] ?? ''))
}

function matchesCategory(asset: VideoStudioAsset) {
  if (category.value === 'all') return true
  if (category.value === 'footage') return asset.type === 'video' && asset.source !== 'generation'
  if (category.value === 'still') return imageR2Key(asset.r2Key) || (asset.type === 'bucket' && Boolean(asset.thumbnailUrl))
  if (category.value === 'generated') return asset.source === 'generation' || asset.type === 'job'
  if (category.value === 'derivative') return asset.type === 'derivative'
  if (category.value === 'voiceover') return asset.type === 'audio' && asset.role === 'voiceover'
  if (category.value === 'music') return asset.type === 'audio' && asset.role === 'music'
  if (category.value === 'overlay') return asset.type === 'overlay'
  if (category.value === 'caption') return Boolean(asset.captionVttUrl)
  return true
}

function matchesSource(asset: VideoStudioAsset) {
  if (source.value === 'all') return true
  if (source.value === 'upload') return asset.source === 'library' || asset.source === 'bucket'
  return asset.source === source.value
}

function matchesStatusBucket(asset: VideoStudioAsset) {
  if (statusBucket.value === 'all') return true
  if (statusBucket.value === 'ready') return asset.status === 'ready' || asset.status === 'done' || asset.status === 'succeeded'
  if (statusBucket.value === 'running') return asset.status === 'queued' || asset.status === 'processing' || asset.status === 'rendering' || asset.status === 'running'
  return asset.status === statusBucket.value
}

function timeValue(asset: VideoStudioAsset) {
  const parsed = asset.createdAt ? Date.parse(asset.createdAt) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function previewKind(asset: VideoStudioAsset): 'image' | 'video' | 'icon' {
  if (asset.thumbnailUrl || imageR2Key(asset.r2Key)) return 'image'
  if ((asset.type === 'video' || asset.type === 'job') && asset.previewUrl) return 'video'
  return 'icon'
}

function canGenerateFromAsset(asset: VideoStudioAsset) {
  return Boolean(videoStudioAssetImageSource(asset))
}

function canPublishAsset(asset: VideoStudioAsset) {
  return Boolean(asset.libraryAssetId && (asset.type === 'video' || asset.type === 'job'))
}

function typeLabel(asset: VideoStudioAsset) {
  if (asset.type === 'audio') return asset.role === 'music' ? 'music' : 'voice'
  if (asset.type === 'job') return 'AI job'
  return asset.type
}

function sourceChipLabel(value: VideoStudioAssetSource) {
  const labels: Record<VideoStudioAssetSource, string> = {
    audio: 'Audio',
    banner: 'Banner',
    bucket: 'Bucket',
    derivative: 'Derivative',
    generation: 'AI',
    library: 'Upload',
    render: 'Render',
  }
  return labels[value]
}

function readinessLabel(asset: VideoStudioAsset) {
  if (asset.timelineReady) return 'Timeline ready'
  if (asset.status === 'failed') return 'Failed'
  if (asset.status === 'blocked') return 'Blocked'
  if (asset.status === 'queued' || asset.status === 'processing' || asset.status === 'rendering' || asset.status === 'running') return 'Processing'
  return 'Not ready'
}

function readinessColor(asset: VideoStudioAsset): 'primary' | 'success' | 'error' | 'warning' | 'neutral' {
  if (asset.timelineReady) return 'success'
  if (asset.status === 'failed') return 'error'
  if (asset.status === 'blocked') return 'warning'
  if (asset.status === 'queued' || asset.status === 'processing' || asset.status === 'rendering' || asset.status === 'running') return 'primary'
  return 'neutral'
}

function metadataLine(asset: VideoStudioAsset) {
  return [
    asset.subtitle,
    durationLabel(asset.durationSec),
    asset.modelId,
  ].filter(Boolean).join(' · ')
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
    render: 'Rendered exports',
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

    <div class="space-y-2">
      <div class="grid grid-cols-5 gap-1.5 2xl:grid-cols-6">
        <button
          v-for="option in CATEGORY_FILTERS"
          :key="option.value"
          type="button"
          class="flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border px-1 text-center transition"
          :class="category === option.value
            ? 'border-primary bg-primary text-inverted'
            : 'border-default bg-default/40 text-muted hover:border-primary/50 hover:bg-elevated hover:text-highlighted'"
          @click="category = option.value"
        >
          <UIcon :name="option.icon" class="size-4 shrink-0" />
          <span class="max-w-full truncate text-[9px] font-medium leading-none">{{ option.label }}</span>
        </button>
      </div>

      <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        <UButton
          v-for="option in SOURCE_FILTERS"
          :key="option.value"
          :label="option.label"
          size="xs"
          :variant="source === option.value ? 'solid' : 'ghost'"
          :color="source === option.value ? 'primary' : 'neutral'"
          class="min-w-0 justify-start"
          @click="source = option.value"
        />
      </div>

      <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        <UButton
          v-for="option in STATUS_FILTERS"
          :key="option.value"
          :label="option.label"
          size="xs"
          :variant="statusBucket === option.value ? 'solid' : 'ghost'"
          :color="statusBucket === option.value ? 'primary' : 'neutral'"
          class="min-w-0 justify-start"
          @click="statusBucket = option.value"
        />
      </div>
    </div>

    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <USelect v-model="model" :items="modelOptions" value-key="value" size="xs" aria-label="Filter model" />
      <USelect v-model="aspect" :items="aspectOptions" value-key="value" size="xs" aria-label="Filter aspect ratio" />
      <USelect v-if="bucketOptions.length > 1" v-model="bucketId" :items="bucketOptions" value-key="value" size="xs" aria-label="Filter bucket" />
      <USelect v-model="sort" :items="SORT_OPTIONS" value-key="value" size="xs" aria-label="Sort assets" />
    </div>

    <div class="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
      <div v-if="props.loading && !props.assets.length" class="space-y-2">
        <USkeleton v-for="n in 5" :key="n" class="h-20 w-full rounded-md" />
      </div>

      <div v-else-if="!props.assets.length" class="rounded-md border border-dashed border-default px-3 py-5 text-center">
        <UIcon name="i-lucide-film" class="mx-auto size-5 text-muted" />
        <p class="mt-2 text-xs font-medium text-highlighted">No media in this project yet</p>
        <p class="mx-auto mt-1 max-w-52 text-[11px] text-muted">Add footage or stills, generate an AI clip, create a voiceover, or attach an overlay to start the edit.</p>
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
          class="grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-2 rounded-md border px-2 py-1.5 text-left transition"
          :class="props.selectedId === asset.id ? 'border-primary bg-primary/10' : 'border-default bg-elevated hover:border-primary/50'"
        >
          <div class="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-default bg-default/40">
            <img
              v-if="previewKind(asset) === 'image' && asset.thumbnailUrl"
              :src="asset.thumbnailUrl"
              :alt="asset.title"
              loading="lazy"
              class="size-full object-cover"
            >
            <video
              v-else-if="previewKind(asset) === 'video' && asset.previewUrl"
              :src="asset.previewUrl"
              muted
              playsinline
              preload="metadata"
              class="size-full object-cover"
            />
            <UIcon v-else :name="iconFor(asset)" class="size-4 text-primary" />
          </div>

          <div class="min-w-0">
            <div class="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                class="min-w-0 flex-1 truncate text-left text-xs font-medium leading-5 text-highlighted hover:text-primary"
                @click="emit('update:selected-id', asset.id)"
              >
                {{ asset.title }}
              </button>
              <UBadge :label="asset.status" size="xs" :color="statusColor(asset.status)" variant="subtle" />
            </div>

            <div class="mt-0.5 flex min-w-0 flex-wrap items-center gap-1">
              <UBadge :label="sourceChipLabel(asset.source)" size="xs" variant="subtle" color="neutral" />
              <UBadge :label="typeLabel(asset)" size="xs" variant="subtle" color="neutral" />
              <UBadge :label="readinessLabel(asset)" size="xs" :color="readinessColor(asset)" variant="subtle" />
              <UBadge
                v-for="badge in videoStudioAssetGovernanceBadges(asset)"
                :key="badge.label"
                :label="badge.label"
                size="xs"
                variant="subtle"
                :color="badge.color"
              />
              <UBadge v-if="asset.format" :label="asset.format" size="xs" variant="subtle" color="neutral" />
              <UBadge v-if="asset.captionVttUrl" label="Captions" size="xs" variant="subtle" color="primary" />
            </div>

            <p v-if="metadataLine(asset)" class="mt-0.5 truncate text-[11px] text-muted">
              {{ metadataLine(asset) }}
            </p>
            <p v-if="asset.prompt" class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{{ asset.prompt }}</p>
            <div v-if="asset.captionVttUrl || (asset.type === 'audio' && asset.previewUrl)" class="mt-1 flex min-w-0 items-center gap-2">
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
              <audio
                v-if="asset.type === 'audio' && asset.previewUrl"
                :src="asset.previewUrl"
                controls
                preload="none"
                class="h-7 min-w-0 flex-1"
              />
            </div>
          </div>

          <div class="flex w-8 shrink-0 flex-col items-center gap-0.5">
            <UButton
              icon="i-lucide-eye"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Preview asset"
              @click.stop="emit('update:selected-id', asset.id)"
            />
            <UButton
              icon="i-lucide-sparkles"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Generate from asset"
              :disabled="!canGenerateFromAsset(asset)"
              @click.stop="emit('generate-from-asset', asset)"
            />
            <UButton
              icon="i-lucide-info"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Inspect asset"
              @click.stop="emit('inspect-asset', asset)"
            />
            <UButton
              icon="i-lucide-share-2"
              size="xs"
              variant="ghost"
              color="neutral"
              aria-label="Publish asset"
              :disabled="!canPublishAsset(asset)"
              @click.stop="emit('publish-asset', asset)"
            />
            <UButton
              icon="i-lucide-list-plus"
              size="xs"
              variant="ghost"
              color="primary"
              :aria-label="addLabel(asset)"
              :title="addLabel(asset)"
              :disabled="!asset.timelineReady"
              @click.stop="emit('add-asset', asset)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
