<script setup lang="ts">
import type { BannerAsset } from '~/types/banner-studio'
import type { AudioAsset } from '~/types'
import { createBannerUploadSession } from '~/utils/bannerUpload'
import { refDebounced } from '@vueuse/core'
import { apiErrorDescription } from '~/utils/apiError'
import { bannerAssetLayer, type BannerMediaType } from '~/utils/banner-media'
import { startBannerMediaDrag, endBannerMediaDrag } from '~/utils/banner-media-drag'
import { motorstackBrandId as kitMotorStackBrand } from '~~/shared/bannerBrandGuides'
import { LAYER_IMPORT_MIME_TYPES } from '~~/shared/bannerLayerImport'

const props = withDefaults(defineProps<{ mediaType?: BannerMediaType, selectionOnly?: boolean, motorstackBrandId?: string, inlineMotorstack?: boolean }>(), { mediaType: 'all', selectionOnly: false })
const emit = defineEmits<{ select: [asset: BannerAsset], browseMotorstack: [] }>()
const { addLayer, activeFormat, activeLayers, currentSlide, state } = useBannerStudio()
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
const search = refDebounced(searchQuery, 250)
watch([search, () => props.mediaType], () => { page.value = 0 }, { flush: 'sync' })
const query = computed(() => ({ mediaType: props.mediaType, search: search.value.trim(), limit: pageSize + 1, offset: page.value * pageSize }))
const { data: assetsData, error: assetsError, status: assetsStatus, refresh: refreshAssets } = useFetch<{ assets: BannerAsset[] }>('/api/agency/banner-studio/assets', { query, deep: false })
const assets = computed(() => (assetsData.value?.assets || []).slice(0, pageSize))
const hasNext = computed(() => (assetsData.value?.assets.length || 0) > pageSize)
async function showNewestAssets() {
  if (page.value) page.value = 0
  else await refreshAssets()
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function handleAssetClick(asset: BannerAsset) {
  if (props.selectionOnly) {
    emit('select', asset)
    return
  }
  if (!activeFormat.value) return
  try {
    addLayer({ ...bannerAssetLayer(asset, activeFormat.value), startTime: 0, endTime: currentSlide.value?.duration || state.duration })
    toast.add({ title: 'Media added', description: asset.name, color: 'success' })
  } catch (error) {
    toast.add({ title: 'Could not add media', description: error instanceof Error ? error.message : 'Choose another file.', color: 'error' })
  }
}

// Audio Studio — owned, generated audio (voiceover + music) reusable as a layer.
const voiceoverData = ref<{ assets: AudioAsset[] }>({ assets: [] })
const musicData = ref<{ assets: AudioAsset[] }>({ assets: [] })

apiFetch<{ assets: AudioAsset[] }>('/api/agency/audio/assets', { query: { kind: 'voiceover' } })
  .then((result) => { voiceoverData.value = result })
  .catch(() => { voiceoverData.value = { assets: [] } })

apiFetch<{ assets: AudioAsset[] }>('/api/agency/audio/assets', { query: { kind: 'music' } })
  .then((result) => { musicData.value = result })
  .catch(() => { musicData.value = { assets: [] } })

// Only playable assets (a master uploaded) belong in the picker — in-progress
// music has no streamUrl yet.
const audioStudioAssets = computed<AudioAsset[]>(() => [
  ...(voiceoverData.value?.assets ?? []),
  ...(musicData.value?.assets ?? [])
].filter(a => !!a.streamUrl))

function audioLayerName(a: AudioAsset): string {
  return a.title || (a.kind === 'music' ? 'Music' : 'Voiceover')
}

function addAudioLayer(a: AudioAsset) {
  if (!a.streamUrl) {
    toast.add({ title: 'Audio unavailable', description: 'This asset has no playable source', color: 'warning' })
    return
  }
  const name = audioLayerName(a)
  addLayer({
    type: 'audio',
    src: a.streamUrl,
    name,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    fit: undefined,
    volume: 1,
    animIn: 'none',
    animOut: 'none',
    startTime: 0,
    endTime: currentSlide.value?.duration || state.duration
  })
  toast.add({ title: 'Audio added', description: `"${name}" added`, color: 'success' })
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
  <div class="p-3 space-y-3">
    <UFormField label="Search media">
      <UInput
        v-model="searchQuery"
        icon="i-lucide-search"
        placeholder="Search media..."
        size="sm"
        class="w-full"
      />
    </UFormField>
    <UAlert
      v-if="assetsError"
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
      class="border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer"
      :class="isDragging ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border) hover:border-(--ui-primary)/40'"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="onDrop"
    >
      <UIcon name="i-lucide-upload-cloud" class="w-6 h-6 text-(--ui-text-muted) mx-auto mb-1" />
      <UButton
        label="Upload media"
        variant="ghost"
        color="neutral"
        size="sm"
        :loading="uploading"
        @click="openUpload"
      />
      <p class="text-xs text-muted">
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
    <div v-if="!selectionOnly" class="flex gap-1.5">
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

    <!-- Audio Studio — owned voiceover + music -->
    <div v-if="!selectionOnly && audioStudioAssets.length && (mediaType === 'all' || mediaType === 'audio')" class="space-y-1.5">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-(--ui-text-muted)">
        Audio Studio
      </p>
      <button
        v-for="a in audioStudioAssets"
        :key="a.id"
        type="button"
        class="w-full flex items-center gap-2 text-left text-[11px] px-2 py-1.5 rounded bg-(--ui-bg) border border-(--ui-border) hover:bg-(--ui-bg-elevated) transition-colors truncate"
        @click="addAudioLayer(a)"
      >
        <UIcon :name="a.kind === 'music' ? 'i-lucide-music' : 'i-lucide-mic'" class="w-3.5 h-3.5 shrink-0 text-(--ui-text-muted)" />
        <span class="truncate">{{ audioLayerName(a) }}</span>
      </button>
    </div>

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
    <div v-if="assets.length" class="grid grid-cols-2 gap-1.5">
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
          <div class="aspect-square bg-(--ui-bg) flex items-center justify-center">
            <img
              v-if="asset.mimeType?.startsWith('image') && (safeMediaUrl(asset.thumbnailUrl) || safeMediaUrl(asset.url))"
              :src="safeMediaUrl(asset.thumbnailUrl) || safeMediaUrl(asset.url)"
              :alt="asset.name"
              loading="lazy"
              decoding="async"
              draggable="false"
              class="w-full h-full object-cover"
            >
            <video
              v-else-if="asset.mimeType?.startsWith('video')"
              :src="safeMediaUrl(asset.url)"
              muted
              playsinline
              preload="none"
              :poster="safeMediaUrl(asset.thumbnailUrl) || undefined"
              class="w-full h-full object-contain pointer-events-none"
            />
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
        <div v-if="!selectionOnly" class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
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

    <div v-else class="text-center py-6 text-xs text-(--ui-text-muted)">
      {{ assetsStatus === 'pending' ? 'Loading media…' : searchQuery ? 'No matching media. Try another search.' : 'No media here yet. Upload a file or browse MotorStack.' }}
    </div>
    <nav v-if="page || hasNext" aria-label="Media pages" class="flex items-center justify-between gap-2">
      <UButton label="Previous" size="xs" color="neutral" variant="outline" :disabled="!page || assetsStatus === 'pending'" @click="page--" />
      <span class="text-xs text-muted">Page {{ page + 1 }}</span>
      <UButton label="Next" size="xs" color="neutral" variant="outline" :disabled="!hasNext || assetsStatus === 'pending'" @click="page++" />
    </nav>
  </div>
</template>
