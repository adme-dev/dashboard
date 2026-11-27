<script setup lang="ts">
import type { BannerAsset } from '~/types/banner-studio'
import type { AudioAsset } from '~/types'
import { createBannerUploadSession } from '~/utils/bannerUpload'
import { refDebounced } from '@vueuse/core'
import { apiErrorDescription } from '~/utils/apiError'
import { bannerAssetLayer, type BannerMediaType } from '~/utils/banner-media'
import { startBannerMediaDrag, endBannerMediaDrag } from '~/utils/banner-media-drag'
import { safeMediaUrl } from '~/utils/safe-url'
import MediaGeneratedThumbnail from '~/components/media/MediaGeneratedThumbnail.vue'
import { bannerMusicGenres, bannerMusicMoods, type BannerMusicGenre, type BannerMusicMood, type BannerMusicVocals } from '~~/shared/bannerAudioFilters'
import { motorstackBrandId as kitMotorStackBrand } from '~~/shared/bannerBrandGuides'
import { LAYER_IMPORT_MIME_TYPES } from '~~/shared/bannerLayerImport'

const props = withDefaults(defineProps<{
  mediaType?: BannerMediaType
  selectionOnly?: boolean
  motorstackBrandId?: string
  inlineMotorstack?: boolean
  visible?: boolean
}>(), { mediaType: 'all', selectionOnly: false, visible: true })
const emit = defineEmits<{ select: [asset: BannerAsset], browseMotorstack: [] }>()
const { addLayer, addMediaToLayouts, activeFormat, activeLayers, currentSlide, state } = useBannerStudio()
const replacementBrand = props.selectionOnly && props.mediaType === 'image' ? useBannerProjectBrand() : undefined
const pickerBrand = computed(() => props.motorstackBrandId || kitMotorStackBrand(replacementBrand?.kit.value?.sourceUrl) || undefined)
const layerImport = useBannerLayerImport()
const { openGenerate } = useAiImageGenerate()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
  headers?: Record<string, string>
  signal?: AbortSignal
}) => Promise<T>

const searchQuery = ref('')
const motorstackOpen = ref(false)
const isDragging = ref(false)
const fileInput = ref<{ inputRef?: HTMLInputElement } | null>(null)
const uploading = ref(false)
const acceptedTypes = computed(() => props.mediaType === 'all' ? 'image/*,video/*,audio/*' : `${props.mediaType}/*`)
function openUpload() {
  if (!uploading.value) fileInput.value?.inputRef?.click()
}
defineExpose({ openUpload, openMotorStack: () => {
  motorstackOpen.value = true
} })
const uploadSession = createBannerUploadSession()

// AI Image Suggestions
const aiSuggestions = ref<{ keyword: string, description: string, style: string }[]>([])
const aiLoading = ref(false)
const showAiSuggestions = ref(false)

type UiColor = 'error' | 'info' | 'success' | 'primary' | 'secondary' | 'warning' | 'neutral'

const STYLE_COLORS: Record<string, UiColor> = {
  photo: 'primary',
  illustration: 'success',
  abstract: 'warning',
  pattern: 'neutral'
}

async function fetchImageSuggestions() {
  const textLayers = activeLayers.value.filter(l => l.type === 'text' || l.type === 'button')
  const texts = textLayers.map(l => l.text).filter((t): t is string => !!t && t.length > 2)

  if (texts.length === 0) {
    toast.add({ title: 'No text found', description: 'Add text layers first for AI suggestions', color: 'warning' })
    return
  }

  aiLoading.value = true
  showAiSuggestions.value = true
  try {
    const result = await apiFetch<{ suggestions: typeof aiSuggestions.value }>('/api/agency/banner-studio/ai/image-suggest', {
      method: 'POST',
      body: { texts }
    })
    aiSuggestions.value = result.suggestions || []
  } catch {
    toast.add({ title: 'Error', description: 'Failed to get image suggestions', color: 'error' })
  } finally {
    aiLoading.value = false
  }
}

function applySuggestionToSearch(keyword: string) {
  searchQuery.value = keyword
}

const pageSize = 12
const page = ref(0)
const studioPage = ref(0)
const search = refDebounced(searchQuery, 250)
const audioMode = computed(() => props.mediaType === 'audio')
const audioCategories = [
  { label: 'All tracks', value: 'all' },
  { label: 'Music', value: 'music' },
  { label: 'Voiceovers', value: 'voiceover' },
  { label: 'Uploads', value: 'uploads' }
] as const
const audioCategory = ref<(typeof audioCategories)[number]['value']>('all')
const genre = ref<BannerMusicGenre | ''>('')
const mood = ref<BannerMusicMood | ''>('')
const vocals = ref<BannerMusicVocals | ''>('')
const maxDuration = ref<number | ''>('')
const addAcrossSlides = ref(false)
const musicMode = computed(() => audioMode.value && audioCategory.value === 'music')
const musicFilters = computed(() => {
  if (!musicMode.value) return {}
  return {
    genre: genre.value || undefined,
    mood: mood.value || undefined,
    vocals: vocals.value || undefined,
    maxDuration: maxDuration.value || undefined
  }
})
const hasMusicFilters = computed(() => musicMode.value && !!(genre.value || mood.value || vocals.value || maxDuration.value))
const showUploads = computed(() => audioMode.value && (audioCategory.value === 'all' || audioCategory.value === 'uploads'))
const showStudioTracks = computed(() => audioMode.value ? audioCategory.value !== 'uploads' : props.mediaType === 'all' && !props.selectionOnly)
watch([search, audioCategory, musicFilters, () => props.mediaType, () => state?.project?.id, () => state?.project?.clientId], () => {
  page.value = 0
  studioPage.value = 0
}, { flush: 'sync' })

function clearMusicFilters() {
  genre.value = ''
  mood.value = ''
  vocals.value = ''
  maxDuration.value = ''
}
const query = computed(() => ({
  mediaType: props.mediaType,
  search: search.value.trim(),
  limit: pageSize + 1,
  offset: page.value * pageSize,
  ...(audioMode.value ? { audioUploadsOnly: 'true' } : {})
}))
const { data: assetsData, error: assetsError, status: assetsStatus, refresh: refreshAssets } = useFetch<{ assets: BannerAsset[] }>('/api/agency/banner-studio/assets', { query, deep: false })
const assets = computed(() => (assetsData.value?.assets || []).slice(0, pageSize))
const hasNext = computed(() => (assetsData.value?.assets.length || 0) > pageSize)
const previewVideoId = ref<string>()
const previewVideo = computed(() => assets.value.find(asset => asset.id === previewVideoId.value))
const failedVideoPosters = reactive(new Set<string>())
watch(previewVideo, (asset) => {
  if (!asset) previewVideoId.value = undefined
})
watch([page, search, () => props.visible, () => props.mediaType, () => state?.project?.id, () => state?.project?.clientId], () => {
  previewVideoId.value = undefined
})

function openVideoPreview(asset: BannerAsset) {
  if (!props.visible || !safeMediaUrl(asset.url)) return
  pauseDesign()
  previewVideoId.value = asset.id
}

function insertPreviewVideo() {
  const asset = previewVideo.value
  previewVideoId.value = undefined
  if (asset) handleAssetClick(asset)
}

function videoPoster(asset: BannerAsset) {
  const poster = safeMediaUrl(asset.thumbnailUrl)
  if (poster && !failedVideoPosters.has(poster)) return poster
}

async function showNewestAssets() {
  if (page.value) page.value = 0
  else await refreshAssets()
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function handleAssetClick(asset: BannerAsset, acrossSlides = audioMode.value && addAcrossSlides.value) {
  if (props.selectionOnly) {
    emit('select', asset)
    return
  }
  if (!activeFormat.value) return
  try {
    if (asset.mimeType?.startsWith('image/')) {
      const count = addMediaToLayouts(asset)
      toast.add({ title: 'Image added', description: `${asset.name} · ${count} ${count === 1 ? 'layout' : 'layouts'}`, color: 'success' })
      return
    }
    const timing = acrossSlides && asset.mimeType?.startsWith('audio/')
      ? { audioAcrossSlides: true }
      : { startTime: 0, endTime: currentSlide.value?.duration || state.duration }
    addLayer({ ...bannerAssetLayer(asset, activeFormat.value), ...timing })
    toast.add({ title: 'Media added', description: asset.name, color: 'success' })
  } catch (error) {
    toast.add({ title: 'Could not add media', description: error instanceof Error ? error.message : 'Choose another file.', color: 'error' })
  }
}

type StudioTrack = Pick<AudioAsset, 'id' | 'kind' | 'title' | 'streamUrl' | 'durationSec' | 'isInstrumental'>
const studioData = shallowRef<StudioTrack[]>([])
const studioLoading = ref(false)
const studioError = ref('')
const studioRefresh = ref(0)
const addingTrack = ref<string | null>(null)
const studioEndpoint = '/api/agency/banner-studio/assets/audio-studio'
const studioQuery = computed(() => {
  if (!showStudioTracks.value || !state?.project?.id) return null
  const kind = audioMode.value && (audioCategory.value === 'music' || audioCategory.value === 'voiceover') ? audioCategory.value : undefined
  return { projectId: state.project.id, kind, search: search.value.trim().slice(0, 255), ...musicFilters.value, limit: pageSize + 1, offset: studioPage.value * pageSize }
})
watch([studioQuery, studioRefresh, () => state?.project?.clientId], async ([nextQuery], _, onCleanup) => {
  studioData.value = []
  studioError.value = ''
  studioLoading.value = !!nextQuery
  if (!nextQuery) return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  try {
    const result = await apiFetch<{ assets: StudioTrack[] }>(studioEndpoint, { query: nextQuery, signal: controller.signal })
    if (!controller.signal.aborted) studioData.value = result.assets
  } catch (error) {
    if (!controller.signal.aborted) studioError.value = apiErrorDescription(error, 'Try loading the audio library again.')
  } finally {
    if (!controller.signal.aborted) studioLoading.value = false
  }
}, { immediate: true })
const hasNextStudio = computed(() => studioData.value.length > pageSize)
const audioTracks = computed(() => {
  const studio = studioData.value.slice(0, pageSize).map((track) => {
    const kind = track.kind === 'music' ? 'Music' as const : 'Voiceover' as const
    return {
      id: `studio:${track.id}`,
      name: track.title?.trim() || kind,
      url: safeMediaUrl(track.streamUrl),
      kind,
      detail: track.kind === 'music' && track.isInstrumental != null ? (track.isInstrumental ? 'Instrumental' : 'Vocals') : undefined,
      durationSec: track.durationSec,
      add: () => addStudioTrack(track.id)
    }
  })
  if (!showUploads.value || assetsError.value || assetsStatus.value === 'pending') return studio
  const uploads = assets.value.map(asset => ({
    id: `upload:${asset.id}`,
    name: asset.name,
    url: safeMediaUrl(asset.url),
    kind: 'Upload' as const,
    detail: formatSize(asset.fileSize),
    add: () => handleAssetClick(asset),
    remove: props.selectionOnly ? undefined : () => deleteAsset(asset)
  }))
  return [...studio, ...uploads]
})

function pauseDesign() {
  useBannerTimeline().pauseTimeline()
}

let mounted = true
onBeforeUnmount(() => {
  mounted = false
})
function placementIdentity() {
  return [state?.project?.id, state?.project?.clientId, state?.activeKey, currentSlide?.value?.id].join(':')
}
async function addStudioTrack(assetId: string) {
  const projectId = state?.project?.id
  if (addingTrack.value || !projectId) return
  const placement = placementIdentity()
  const acrossSlides = audioMode.value && addAcrossSlides.value
  addingTrack.value = `studio:${assetId}`
  try {
    const { asset } = await apiFetch<{ asset: BannerAsset }>(studioEndpoint, { method: 'POST', body: { projectId, assetId } })
    if (!mounted || placement !== placementIdentity()) return
    if (!asset?.mimeType.startsWith('audio/') || !safeMediaUrl(asset.url)) throw new Error('The saved audio could not be verified.')
    handleAssetClick(asset, acrossSlides)
  } catch (error) {
    if (mounted && placement === placementIdentity()) {
      toast.add({ title: 'Could not add audio', description: apiErrorDescription(error, 'Try adding the track again.'), color: 'error' })
    }
  } finally {
    addingTrack.value = null
  }
}

async function uploadFiles(files: FileList | File[]) {
  if (uploading.value) return
  const accepted = [...files].filter(file => props.mediaType === 'all' || file.type.startsWith(`${props.mediaType}/`))
  if (accepted.length !== files.length) toast.add({ title: 'Choose matching media', description: `This picker accepts ${props.mediaType} files.`, color: 'warning' })
  if (!accepted.length) return
  uploading.value = true
  try {
    const outcomes = await uploadSession.attemptFiles(accepted, async (request) => {
      return await apiFetch('/api/agency/banner-studio/assets/upload', {
        method: 'POST',
        ...request
      })
    })
    await showNewestAssets()
    for (const outcome of outcomes) {
      if (!outcome.ok) {
        toast.add({ title: 'Upload failed', description: `${outcome.file.name} · ${apiErrorDescription(outcome.error, 'Try uploading again.')}`, color: 'error' })
        continue
      }
      // A flat JPEG or PNG can be split into editable layers straight after upload.
      const uploaded = outcome.value as Partial<BannerAsset> | undefined
      const splittable = !props.selectionOnly && !!uploaded?.id && !!uploaded.url && LAYER_IMPORT_MIME_TYPES.includes(uploaded.mimeType || '')
      toast.add({
        title: 'Uploaded',
        description: `${outcome.file.name} uploaded`,
        color: 'success',
        ...(splittable
          ? { actions: [{ label: 'Import as layers', icon: 'i-lucide-layers', onClick: () => importAsLayers(uploaded as BannerAsset) }] }
          : {})
      })
    }
  } finally {
    uploading.value = false
  }
}

function canImportAsLayers(asset: BannerAsset) {
  return LAYER_IMPORT_MIME_TYPES.includes(asset.mimeType)
}
function importAsLayers(asset: BannerAsset) {
  layerImport.openFor({ assetId: asset.id, name: asset.name, url: asset.thumbnailUrl || asset.url })
}

async function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  try {
    if (input.files?.length) await uploadFiles(input.files)
  } finally {
    input.value = ''
  }
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files)
}

async function deleteAsset(asset: BannerAsset) {
  try {
    await apiFetch(`/api/agency/banner-studio/assets/${asset.id}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', description: `${asset.name} removed`, color: 'success' })
    await refreshAssets()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete asset', color: 'error' })
  }
}
</script>

<template>
  <div class="@container p-3 space-y-3">
    <UFormField :label="audioMode ? 'Search audio tracks' : 'Search media'">
      <UInput
        v-model="searchQuery"
        icon="i-lucide-search"
        :placeholder="audioMode ? 'Search tracks…' : 'Search media...'"
        size="sm"
        class="w-full"
      />
    </UFormField>
    <div
      v-if="audioMode"
      role="group"
      aria-label="Audio category"
      class="grid grid-cols-2 gap-1 rounded-lg border border-default bg-elevated/50 p-1 @xs:grid-cols-4"
    >
      <UButton
        v-for="category in audioCategories"
        :key="category.value"
        :label="category.label"
        :aria-pressed="audioCategory === category.value"
        :color="audioCategory === category.value ? 'primary' : 'neutral'"
        :variant="audioCategory === category.value ? 'soft' : 'outline'"
        size="xs"
        class="min-w-0 justify-center whitespace-nowrap rounded-md px-1.5"
        @click="() => { audioCategory = category.value }"
      />
    </div>
    <fieldset v-if="musicMode" class="grid grid-cols-2 gap-2 rounded-lg border border-default bg-elevated/30 p-2.5">
      <legend class="px-1 text-xs font-medium text-toned">
        Music filters
      </legend>
      <label class="min-w-0 space-y-1 text-xs text-muted">
        <span>Genre</span>
        <select v-model="genre" class="audio-filter">
          <option value="">Any genre</option>
          <option v-for="option in bannerMusicGenres" :key="option">{{ option }}</option>
        </select>
      </label>
      <label class="min-w-0 space-y-1 text-xs text-muted">
        <span>Mood</span>
        <select v-model="mood" class="audio-filter">
          <option value="">Any mood</option>
          <option v-for="option in bannerMusicMoods" :key="option">{{ option }}</option>
        </select>
      </label>
      <label class="min-w-0 space-y-1 text-xs text-muted">
        <span>Vocals</span>
        <select v-model="vocals" class="audio-filter">
          <option value="">Any vocals</option>
          <option value="instrumental">Instrumental</option>
          <option value="vocals">With vocals</option>
        </select>
      </label>
      <label class="min-w-0 space-y-1 text-xs text-muted">
        <span>Duration</span>
        <select v-model="maxDuration" class="audio-filter">
          <option value="">Any duration</option>
          <option :value="15">Up to 15s</option>
          <option :value="30">Up to 30s</option>
          <option :value="60">Up to 1 min</option>
          <option :value="180">Up to 3 min</option>
        </select>
      </label>
      <UButton
        v-if="hasMusicFilters"
        label="Clear filters"
        color="neutral"
        variant="link"
        size="xs"
        class="col-span-2 justify-self-end"
        @click="clearMusicFilters"
      />
    </fieldset>
    <UAlert
      v-if="assetsError && (!audioMode || showUploads)"
      title="Could not load media"
      color="error"
      :actions="[{ label: 'Retry', onClick: () => refreshAssets() }]"
    />

    <UButton
      v-if="mediaType === 'all' || mediaType === 'image'"
      label="Browse MotorStack"
      icon="i-lucide-images"
      color="neutral"
      variant="outline"
      size="xs"
      class="w-full justify-center"
      @click="() => { if (inlineMotorstack) emit('browseMotorstack'); else motorstackOpen = true }"
    />
    <BannerMotorStackMediaPicker
      :key="pickerBrand || 'unassigned'"
      v-model:open="motorstackOpen"
      :initial-brand-id="pickerBrand"
      :replace-image="!!replacementBrand"
      :project-brand-context="replacementBrand ? [state.project?.name || '', state.project?.clientName || ''] : undefined"
      @imported="asset => { if (replacementBrand) handleAssetClick(asset); showNewestAssets() }"
    />

    <!-- Upload Zone -->
    <div
      :class="[
        isDragging ? 'border-primary bg-primary/5' : 'border-default hover:border-primary/40',
        audioMode ? 'flex flex-wrap items-center gap-1.5 rounded-lg border p-1.5' : 'rounded-lg border-2 border-dashed p-4 text-center'
      ]"
      class="transition-colors"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="onDrop"
    >
      <UIcon v-if="!audioMode" name="i-lucide-upload-cloud" class="w-6 h-6 text-muted mx-auto mb-1" />
      <UButton
        :label="audioMode ? 'Upload audio' : 'Upload media'"
        :icon="audioMode ? 'i-lucide-upload' : undefined"
        variant="ghost"
        color="neutral"
        size="sm"
        :loading="uploading"
        @click="openUpload"
      />
      <UButton
        v-if="audioMode && !selectionOnly"
        label="Generate with AI"
        icon="i-lucide-sparkles"
        variant="ghost"
        size="sm"
        @click="openGenerate()"
      />
      <p v-if="!audioMode" class="text-xs text-muted">
        Drop files here, then choose one below.
      </p>
      <UInput
        ref="fileInput"
        type="file"
        multiple
        :accept="acceptedTypes"
        :disabled="uploading"
        class="hidden"
        @change="onFileSelect"
      />
    </div>

    <!-- AI Actions -->
    <div v-if="!selectionOnly && !audioMode" class="flex gap-1.5">
      <UButton
        label="Generate with AI"
        icon="i-lucide-sparkles"
        variant="soft"
        color="primary"
        size="xs"
        class="flex-1"
        @click="openGenerate()"
      />
    </div>

    <UButton
      v-if="audioMode && !selectionOnly"
      label="Add across slides"
      icon="i-lucide-music-2"
      :aria-pressed="addAcrossSlides"
      :color="addAcrossSlides ? 'primary' : 'neutral'"
      :variant="addAcrossSlides ? 'soft' : 'outline'"
      size="sm"
      class="w-full justify-start"
      @click="() => { addAcrossSlides = !addAcrossSlides }"
    />
    <UAlert
      v-if="showStudioTracks && studioError"
      title="Could not load Audio Studio tracks"
      :description="studioError"
      color="error"
      :actions="[{ label: 'Retry', onClick: () => { studioRefresh++ } }]"
    />
    <div v-if="audioTracks.length || audioMode" class="space-y-1.5">
      <p v-if="!audioMode" class="text-xs font-medium text-muted">
        Audio Studio
      </p>
      <BannerAudioTrackList
        v-if="audioTracks.length"
        :tracks="audioTracks"
        :busy-id="addingTrack"
        :selection-only="selectionOnly"
        :suspended="!visible || !!previewVideo"
        :playing-design="state?.isPlaying"
        @preview="pauseDesign"
      />
      <p
        v-if="studioLoading || (showUploads && assetsStatus === 'pending')"
        role="status"
        class="py-3 text-center text-xs text-muted"
      >
        Loading audio tracks…
      </p>
      <p
        v-else-if="audioMode && !audioTracks.length && !studioError && (!showUploads || !assetsError)"
        class="py-4 text-center text-xs text-muted"
      >
        {{ search || hasMusicFilters ? 'No tracks match your search or filters.' : showStudioTracks && !state?.project?.id ? 'Save this design to browse Audio Studio tracks.' : 'No tracks in this category yet.' }}
      </p>
    </div>
    <nav v-if="showStudioTracks && (studioPage || hasNextStudio)" aria-label="Audio Studio pages" class="flex items-center justify-between gap-2">
      <UButton
        label="Previous"
        size="xs"
        color="neutral"
        variant="outline"
        :disabled="!studioPage || studioLoading"
        @click="() => { studioPage-- }"
      />
      <span class="text-xs text-muted">Audio Studio · {{ studioPage + 1 }}</span>
      <UButton
        label="Next"
        size="xs"
        color="neutral"
        variant="outline"
        :disabled="!hasNextStudio || studioLoading"
        @click="() => { studioPage++ }"
      />
    </nav>

    <!-- AI Image Suggestions -->
    <div v-if="!selectionOnly && (mediaType === 'all' || mediaType === 'image')">
      <button
        class="w-full flex items-center gap-1.5 text-xs text-(--ui-primary) hover:text-(--ui-primary)/80 transition-colors py-1"
        @click="fetchImageSuggestions"
      >
        <UIcon name="i-lucide-sparkles" class="w-3.5 h-3.5" />
        <span>{{ aiLoading ? 'Thinking...' : 'AI Image Ideas' }}</span>
        <UIcon v-if="aiLoading" name="i-lucide-loader-2" class="w-3 h-3 animate-spin ml-auto" />
      </button>

      <div v-if="showAiSuggestions && aiSuggestions.length" class="space-y-1 mt-1">
        <button
          v-for="(s, i) in aiSuggestions"
          :key="i"
          class="w-full text-left rounded-md px-2.5 py-1.5 border border-(--ui-border) hover:border-(--ui-primary)/40 hover:bg-(--ui-bg-elevated) transition-all group"
          @click="applySuggestionToSearch(s.keyword)"
        >
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-medium text-(--ui-text) group-hover:text-(--ui-primary) transition-colors">{{ s.keyword }}</span>
            <UBadge
              :color="STYLE_COLORS[s.style] || 'neutral'"
              variant="subtle"
              size="xs"
              class="ml-auto shrink-0"
            >
              {{ s.style }}
            </UBadge>
          </div>
          <p v-if="s.description" class="text-[10px] text-(--ui-text-muted) mt-0.5">
            {{ s.description }}
          </p>
        </button>
      </div>
    </div>

    <!-- Assets Grid -->
    <div v-if="!audioMode && assets.length" class="grid grid-cols-2 gap-1.5">
      <div
        v-for="asset in assets"
        :key="asset.id"
        class="group relative rounded-md border border-(--ui-border) overflow-hidden cursor-pointer hover:ring-2 hover:ring-(--ui-primary)/30 transition-all"
      >
        <UButton
          :aria-label="`${selectionOnly ? 'Choose' : 'Insert'} ${asset.name}`"
          variant="ghost"
          color="neutral"
          class="w-full block p-0 rounded-none text-left"
          :draggable="!selectionOnly"
          :title="selectionOnly ? undefined : 'Drag onto a canvas or click to insert'"
          @dragstart="startBannerMediaDrag($event, { kind: 'library', asset }, state.project?.id)"
          @dragend="endBannerMediaDrag"
          @click="handleAssetClick(asset)"
        >
          <div class="relative aspect-square bg-(--ui-bg) flex items-center justify-center">
            <img
              v-if="asset.mimeType?.startsWith('image') && (safeMediaUrl(asset.thumbnailUrl) || safeMediaUrl(asset.url))"
              :src="safeMediaUrl(asset.thumbnailUrl) || safeMediaUrl(asset.url)"
              :alt="asset.name"
              loading="lazy"
              decoding="async"
              draggable="false"
              class="w-full h-full object-cover"
            >
            <template v-else-if="asset.mimeType?.startsWith('video/')">
              <img
                v-if="videoPoster(asset)"
                :src="videoPoster(asset)"
                alt=""
                loading="lazy"
                decoding="async"
                draggable="false"
                class="absolute inset-0 h-full w-full object-contain"
                @error="() => { if (asset.thumbnailUrl) failedVideoPosters.add(asset.thumbnailUrl.trim()) }"
              >
              <MediaGeneratedThumbnail
                v-else-if="safeMediaUrl(asset.url)"
                :source-url="asset.url"
                :alt="`Still from ${asset.name}`"
                class="pointer-events-none"
                lazy
              />
              <UIcon v-else name="i-lucide-film" class="size-9 text-muted" />
            </template>
            <UIcon v-else-if="asset.mimeType?.startsWith('audio')" name="i-lucide-music" class="w-8 h-8 text-(--ui-text-muted)" />
            <UIcon v-else name="i-lucide-file" class="w-8 h-8 text-(--ui-text-muted)" />
          </div>
          <div class="px-1.5 py-1 bg-(--ui-bg-elevated)">
            <div class="text-[10px] font-medium truncate text-(--ui-text)">
              {{ asset.name }}
            </div>
            <div class="text-[9px] text-(--ui-text-muted)">
              {{ formatSize(asset.fileSize) }}
            </div>
          </div>
        </UButton>
        <div
          v-if="asset.mimeType?.startsWith('video/') && safeMediaUrl(asset.url)"
          class="pointer-events-none absolute inset-x-0 top-0 flex aspect-square items-center justify-center"
        >
          <UButton
            icon="i-lucide-play"
            :aria-label="`Play preview for ${asset.name}`"
            title="Play preview"
            color="neutral"
            variant="solid"
            size="sm"
            class="pointer-events-auto rounded-full shadow-sm"
            @click.stop="openVideoPreview(asset)"
          />
        </div>
        <!-- Import as layers (flat JPEG and PNG pictures) -->
        <div
          v-if="!selectionOnly && canImportAsLayers(asset)"
          class="absolute top-1 left-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        >
          <UTooltip text="Import as layers">
            <UButton
              icon="i-lucide-layers"
              :aria-label="`Import ${asset.name} as layers`"
              variant="solid"
              color="neutral"
              size="xs"
              @click.stop="importAsLayers(asset)"
            />
          </UTooltip>
        </div>
        <!-- Delete overlay -->
        <div v-if="!selectionOnly && !asset.tags?.includes('audio-studio')" class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <UButton
            icon="i-lucide-trash-2"
            variant="solid"
            color="error"
            size="xs"
            @click.stop="deleteAsset(asset)"
          />
        </div>
      </div>
    </div>

    <div v-else-if="!audioMode" class="text-center py-6 text-xs text-(--ui-text-muted)">
      {{ assetsStatus === 'pending' ? 'Loading media…' : searchQuery ? 'No matching media. Try another search.' : 'No media here yet. Upload a file or browse MotorStack.' }}
    </div>
    <nav v-if="(!audioMode || showUploads) && (page || hasNext)" :aria-label="audioMode ? 'Uploaded audio pages' : 'Media pages'" class="flex items-center justify-between gap-2">
      <UButton
        label="Previous"
        size="xs"
        color="neutral"
        variant="outline"
        :disabled="!page || assetsStatus === 'pending'"
        @click="() => { page-- }"
      />
      <span class="text-xs text-muted">{{ audioMode ? 'Uploads ·' : 'Page' }} {{ page + 1 }}</span>
      <UButton
        label="Next"
        size="xs"
        color="neutral"
        variant="outline"
        :disabled="!hasNext || assetsStatus === 'pending'"
        @click="() => { page++ }"
      />
    </nav>
    <BannerVideoAssetPreview
      v-if="previewVideo"
      :key="previewVideo.id"
      :asset="previewVideo"
      :selection-only="selectionOnly"
      @close="() => { previewVideoId = undefined }"
      @insert="insertPreviewVideo"
    />
  </div>
</template>

<style scoped>
.audio-filter {
  display: block;
  width: 100%;
  min-height: 2rem;
  padding: 0.25rem 0.4rem;
  color: var(--ui-text);
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 0.375rem;
}

.audio-filter:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 1px;
}
</style>
