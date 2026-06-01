<script setup lang="ts">
import type { BannerAsset } from '~/types/banner-studio'
import type { AudioAsset } from '~/types'

const { addLayer, nextId, activeLayers } = useBannerStudio()
const { decomposingAssetId, decomposeFromUrl } = useDecompose()
const { openGenerate } = useAiImageGenerate()
const toast = useToast()

const searchQuery = ref('')
const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

// AI Image Suggestions
const aiSuggestions = ref<{ keyword: string, description: string, style: string }[]>([])
const aiLoading = ref(false)
const showAiSuggestions = ref(false)

const STYLE_COLORS: Record<string, string> = {
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
    const result = await $fetch<{ suggestions: typeof aiSuggestions.value }>('/api/agency/banner-studio/ai/image-suggest', {
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

const { data: assetsData, refresh: refreshAssets } = useFetch<{ assets: BannerAsset[] }>('/api/agency/banner-studio/assets', {
  default: () => ({ assets: [] }),
  onResponseError() {
    // API may not exist yet
  }
})

const assets = computed(() => {
  const list = assetsData.value?.assets || []
  if (!searchQuery.value) return list
  const q = searchQuery.value.toLowerCase()
  return list.filter(a => a.name.toLowerCase().includes(q))
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function handleAssetClick(asset: BannerAsset) {
  const isAudio = asset.mimeType?.startsWith('audio')
  addLayer({
    id: nextId(),
    type: isAudio ? 'audio' : 'image',
    src: asset.url,
    name: asset.name,
    x: isAudio ? 0 : 10,
    y: isAudio ? 0 : 10,
    w: isAudio ? 0 : 200,
    h: isAudio ? 0 : 150,
    fit: isAudio ? undefined : 'cover',
    volume: isAudio ? 1 : undefined,
    animIn: isAudio ? 'none' : 'fadeIn'
  })
  toast.add({ title: 'Asset added', description: `"${asset.name}" added`, color: 'success' })
}

// Audio Studio voiceovers — owned, generated audio assets reusable as a layer.
const { data: voiceoverData } = useFetch<{ assets: AudioAsset[] }>('/api/agency/audio/assets', {
  query: { kind: 'voiceover' },
  default: () => ({ assets: [] }),
  onResponseError() {
    // Audio Studio API may be unavailable — degrade silently.
  }
})

function addVoiceoverLayer(a: AudioAsset) {
  if (!a.streamUrl) {
    toast.add({ title: 'Audio unavailable', description: 'This voiceover has no playable source', color: 'warning' })
    return
  }
  addLayer({
    id: nextId(),
    type: 'audio',
    src: a.streamUrl,
    name: a.title || 'Voiceover',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    fit: undefined,
    volume: 1,
    animIn: 'none'
  })
  toast.add({ title: 'Voiceover added', description: `"${a.title || 'Voiceover'}" added`, color: 'success' })
}

async function uploadFiles(files: FileList | File[]) {
  for (const file of files) {
    const formData = new FormData()
    formData.append('file', file)
    try {
      await $fetch('/api/agency/banner-studio/assets/upload', {
        method: 'POST',
        body: formData
      })
      toast.add({ title: 'Uploaded', description: `${file.name} uploaded`, color: 'success' })
    } catch {
      toast.add({ title: 'Upload failed', description: `Failed to upload ${file.name}`, color: 'error' })
    }
  }
  await refreshAssets()
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) uploadFiles(input.files)
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files)
}

async function deleteAsset(asset: BannerAsset) {
  try {
    await $fetch(`/api/agency/banner-studio/assets/${asset.id}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', description: `${asset.name} removed`, color: 'success' })
    await refreshAssets()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete asset', color: 'error' })
  }
}
</script>

<template>
  <div class="p-3 space-y-3">
    <!-- Search -->
    <UInput
      v-model="searchQuery"
      icon="i-lucide-search"
      placeholder="Search assets..."
      size="xs"
    />

    <!-- Upload Zone -->
    <div
      class="border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer"
      :class="isDragging ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border) hover:border-(--ui-primary)/40'"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <UIcon name="i-lucide-upload-cloud" class="w-6 h-6 text-(--ui-text-muted) mx-auto mb-1" />
      <p class="text-xs text-(--ui-text-muted)">
        Drop files or click to upload
      </p>
      <input
        ref="fileInput"
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        class="hidden"
        @change="onFileSelect"
      >
    </div>

    <!-- AI Actions -->
    <div class="flex gap-1.5">
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

    <!-- Audio Studio voiceovers -->
    <div v-if="voiceoverData?.assets?.length" class="space-y-1.5">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-(--ui-text-muted)">
        Audio Studio
      </p>
      <button
        v-for="a in voiceoverData.assets"
        :key="a.id"
        type="button"
        class="w-full flex items-center gap-2 text-left text-[11px] px-2 py-1.5 rounded bg-(--ui-bg) border border-(--ui-border) hover:bg-(--ui-bg-elevated) transition-colors truncate"
        @click="addVoiceoverLayer(a)"
      >
        <UIcon name="i-lucide-mic" class="w-3.5 h-3.5 shrink-0 text-(--ui-text-muted)" />
        <span class="truncate">{{ a.title || 'Untitled voiceover' }}</span>
      </button>
    </div>

    <!-- AI Image Suggestions -->
    <div>
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
        @click="handleAssetClick(asset)"
      >
        <div class="aspect-square bg-(--ui-bg) flex items-center justify-center">
          <img
            v-if="asset.mimeType?.startsWith('image') && (safeMediaUrl(asset.thumbnailUrl) || safeMediaUrl(asset.url))"
            :src="safeMediaUrl(asset.thumbnailUrl) || safeMediaUrl(asset.url)"
            :alt="asset.name"
            class="w-full h-full object-cover"
          >
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
        <!-- Decompose overlay (image assets only) -->
        <div
          v-if="asset.mimeType?.startsWith('image')"
          class="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <UButton
            :icon="decomposingAssetId === asset.id ? 'i-lucide-loader-2' : 'i-lucide-layers'"
            variant="solid"
            color="neutral"
            size="xs"
            :loading="decomposingAssetId === asset.id"
            :disabled="!!decomposingAssetId"
            @click.stop="decomposeFromUrl(asset.url, asset.name, asset.id, 'asset')"
          />
        </div>
        <!-- Delete overlay -->
        <div class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
      No assets uploaded yet
    </div>
  </div>
</template>
