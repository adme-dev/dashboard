<script setup lang="ts">
import type { BannerAsset, AnimInType } from '~/types/banner-studio'
import { ANIM_IN, EASES, EASE_GROUPS, easeSvgPath } from '~/utils/banner-constants'

const { state, activeLayers, updateLayer, addBgLayer, removeLayer } = useBannerStudio()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

const bgPresets = ['#0a0a10', '#08080e', '#0c0810', '#1a1a1a', '#f5f0e8']
const accentPresets = ['#e8c84a', '#4a8fe8', '#e84a4a', '#3ddd7a', '#c04ae8']

const fileInput = ref<HTMLInputElement | null>(null)
const videoFileInput = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)
const showAssetPicker = ref(false)

// Multi-bg support
const bgLayers = computed(() =>
  activeLayers.value
    .filter(l => l.type === 'bg')
    .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
)

const activeBgId = ref<number | null>(null)

const activeBg = computed(() => {
  if (activeBgId.value !== null) {
    const found = bgLayers.value.find(l => l.id === activeBgId.value)
    if (found) return found
  }
  return bgLayers.value[0] ?? null
})

// Keep activeBgId in sync when bg layers change
watch(bgLayers, (bgs) => {
  if (activeBgId.value !== null && !bgs.find(l => l.id === activeBgId.value)) {
    activeBgId.value = bgs[0]?.id ?? null
  }
}, { deep: true })

const fitOptions = [
  { label: 'Cover', value: 'cover' },
  { label: 'Contain', value: 'contain' },
  { label: 'Fill', value: 'fill' },
]

const focalPresets = [
  { x: 0, y: 0, label: 'Top Left' },
  { x: 50, y: 0, label: 'Top Center' },
  { x: 100, y: 0, label: 'Top Right' },
  { x: 0, y: 50, label: 'Center Left' },
  { x: 50, y: 50, label: 'Center' },
  { x: 100, y: 50, label: 'Center Right' },
  { x: 0, y: 100, label: 'Bottom Left' },
  { x: 50, y: 100, label: 'Bottom Center' },
  { x: 100, y: 100, label: 'Bottom Right' },
]

// Background-appropriate animations (no slides — they look wrong on a full-frame bg)
const bgAnimOptions = ANIM_IN
  .filter(a => ['none', 'fadeIn', 'zoomIn', 'zoomOut', 'kenBurns'].includes(a.id))
  .map(a => ({ label: `${a.icon} ${a.label}`, value: a.id }))

const bgEaseOpen = ref(false)

function findEase(id: string) {
  return EASES.find(e => e.id === id)
}

function selectBgEase(id: string) {
  setBgProp('ease', id)
  bgEaseOpen.value = false
}

// Fetch existing assets for the picker
const assetsData = ref<{ assets: BannerAsset[] }>({ assets: [] })

async function refreshAssets() {
  try {
    assetsData.value = await apiFetch<{ assets: BannerAsset[] }>('/api/agency/banner-studio/assets')
  } catch {
    assetsData.value = { assets: [] }
  }
}

onMounted(() => {
  refreshAssets()
})

const imageAssets = computed(() => {
  return (assetsData.value?.assets || []).filter(a => a.mimeType?.startsWith('image'))
})

const videoAssets = computed(() => {
  return (assetsData.value?.assets || []).filter(a => a.mimeType?.startsWith('video'))
})

// Source type for the active bg layer
const bgSourceType = computed(() => activeBg.value?.srcType || 'image')

// Sync state.bgColor → first bg layer's bgColor
watch(() => state.bgColor, (color) => {
  const firstBg = bgLayers.value[0]
  if (firstBg && firstBg.bgColor !== color) {
    updateLayer(firstBg.id, { bgColor: color })
  }
})

function setBgProp(key: string, val: any) {
  if (!activeBg.value) return
  updateLayer(activeBg.value.id, { [key]: val })
}

function onAddBg() {
  const newBg = addBgLayer()
  activeBgId.value = newBg.id
}

function onRemoveBg() {
  if (!activeBg.value || bgLayers.value.length <= 1) return
  const id = activeBg.value.id
  activeBgId.value = null
  removeLayer(id)
}

async function uploadBgImage(files: FileList | File[]) {
  if (!files.length || !activeBg.value) return
  isUploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', files[0])
    const result = await apiFetch<BannerAsset>('/api/agency/banner-studio/assets/upload', {
      method: 'POST',
      body: formData,
    })
    updateLayer(activeBg.value!.id, { src: result.url, srcType: 'image', fit: activeBg.value!.fit || 'cover' })
    toast.add({ title: 'Background set', description: 'Image uploaded and applied', color: 'success' })
  } catch {
    toast.add({ title: 'Upload failed', description: 'Failed to upload image', color: 'error' })
  } finally {
    isUploading.value = false
  }
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) uploadBgImage(input.files)
  input.value = ''
}

async function uploadBgVideo(files: FileList | File[]) {
  if (!files.length || !activeBg.value) return
  isUploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', files[0])
    const result = await apiFetch<BannerAsset>('/api/agency/banner-studio/assets/upload', {
      method: 'POST',
      body: formData,
    })
    updateLayer(activeBg.value!.id, { src: result.url, srcType: 'video', fit: activeBg.value!.fit || 'cover' })
    toast.add({ title: 'Video set', description: 'Video uploaded and applied', color: 'success' })
  } catch {
    toast.add({ title: 'Upload failed', description: 'Failed to upload video', color: 'error' })
  } finally {
    isUploading.value = false
  }
}

function onVideoFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) uploadBgVideo(input.files)
  input.value = ''
}

function pickVideoAsset(asset: BannerAsset) {
  if (!activeBg.value) return
  updateLayer(activeBg.value.id, { src: asset.url, srcType: 'video', fit: activeBg.value.fit || 'cover' })
  showAssetPicker.value = false
}

function pickAsset(asset: BannerAsset) {
  if (!activeBg.value) return
  updateLayer(activeBg.value.id, { src: asset.url, srcType: 'image', fit: activeBg.value.fit || 'cover' })
  showAssetPicker.value = false
}

function removeBgImage() {
  if (!activeBg.value) return
  updateLayer(activeBg.value.id, { src: undefined, srcType: undefined, fit: undefined, focalX: undefined, focalY: undefined })
}
</script>

<template>
  <div class="space-y-4">
    <!-- Background Color (artboard-level) -->
    <details open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Background</span>
      </summary>
    <div class="pt-1.5 space-y-2">
      <div class="flex gap-1.5 flex-wrap">
        <button
          v-for="c in bgPresets"
          :key="c"
          class="w-6 h-6 rounded border cursor-pointer transition-all"
          :class="state.bgColor === c ? 'border-(--ui-primary) ring-1 ring-(--ui-primary)' : 'border-(--ui-border)'"
          :style="{ backgroundColor: c }"
          @click="state.bgColor = c"
        />
      </div>
      <div class="flex items-center gap-1.5">
        <input
          type="color"
          :value="state.bgColor"
          class="w-6 h-6 rounded cursor-pointer border border-(--ui-border)"
          @input="(e: Event) => state.bgColor = (e.target as HTMLInputElement).value"
        />
        <UInput size="xs" class="flex-1" v-model="state.bgColor" />
      </div>
    </div>
    </details>

    <!-- Bg Layer Tabs -->
    <details v-if="bgLayers.length" open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Bg Layers</span>
      </summary>
    <div class="pt-1.5 space-y-2">
      <div class="flex items-center gap-1 flex-wrap">
        <button
          v-for="(bg, idx) in bgLayers"
          :key="bg.id"
          class="px-2 py-0.5 text-[10px] rounded border transition-all"
          :class="activeBg?.id === bg.id
            ? 'bg-(--ui-primary) text-(--ui-bg) border-(--ui-primary)'
            : 'border-(--ui-border) text-(--ui-text-muted) hover:border-(--ui-primary)/50'"
          @click="activeBgId = bg.id"
        >
          Bg {{ idx + 1 }}
        </button>
        <button
          class="px-1.5 py-0.5 text-[10px] rounded border border-dashed border-(--ui-border) text-(--ui-text-muted) hover:border-(--ui-primary)/50 transition-all"
          @click="onAddBg"
        >
          +
        </button>
      </div>
    </div>

    <!-- Active bg controls -->
    <template v-if="activeBg">
      <!-- Bg Color for this layer -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="text-[10px] text-(--ui-text-muted)">Layer Color</label>
          <UButton
            v-if="bgLayers.length > 1"
            icon="i-lucide-trash-2"
            variant="ghost"
            color="error"
            size="xs"
            @click="onRemoveBg"
          />
        </div>
        <div class="flex items-center gap-1.5">
          <input
            type="color"
            :value="activeBg.bgColor || '#000'"
            class="w-6 h-6 rounded cursor-pointer border border-(--ui-border)"
            @input="(e: Event) => setBgProp('bgColor', (e.target as HTMLInputElement).value)"
          />
          <UInput size="xs" class="flex-1" :model-value="activeBg.bgColor || '#000'" @update:model-value="v => setBgProp('bgColor', v)" />
        </div>
      </div>

      <!-- Timing controls -->
      <div class="grid grid-cols-2 gap-1.5">
        <div>
          <label class="text-[10px] text-(--ui-text-muted)">Start Time</label>
          <UInput
            type="number"
            size="xs"
            step="0.1"
            :model-value="activeBg.startTime ?? 0"
            @update:model-value="v => setBgProp('startTime', Number(v))"
          />
        </div>
        <div>
          <label class="text-[10px] text-(--ui-text-muted)">End Time</label>
          <UInput
            type="number"
            size="xs"
            step="0.1"
            :model-value="activeBg.endTime ?? state.duration"
            @update:model-value="v => setBgProp('endTime', Number(v))"
          />
        </div>
      </div>

      <!-- Background Source -->
      <div class="space-y-2">
        <div class="text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted) mb-1">Background Source</div>

        <!-- Image / Video toggle -->
        <div class="flex gap-1 p-0.5 bg-(--ui-bg) rounded-md">
          <button
            class="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
            :class="bgSourceType !== 'video'
              ? 'bg-(--ui-bg-elevated) text-(--ui-text) shadow-sm'
              : 'text-(--ui-text-muted) hover:text-(--ui-text)'"
            @click="activeBg && activeBg.srcType === 'video' ? updateLayer(activeBg.id, { srcType: 'image' }) : null"
          >
            <UIcon name="i-lucide-image" class="w-3 h-3" />
            Image
          </button>
          <button
            class="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
            :class="bgSourceType === 'video'
              ? 'bg-(--ui-bg-elevated) text-(--ui-text) shadow-sm'
              : 'text-(--ui-text-muted) hover:text-(--ui-text)'"
            @click="activeBg && setBgProp('srcType', 'video')"
          >
            <UIcon name="i-lucide-film" class="w-3 h-3" />
            Video
          </button>
        </div>

        <!-- Current source preview -->
        <div v-if="activeBg.src" class="space-y-2">
          <div class="relative rounded-md border border-(--ui-border) overflow-hidden">
            <video
              v-if="bgSourceType === 'video'"
              :src="activeBg.src"
              muted
              class="w-full h-20 object-cover"
            />
            <img
              v-else
              :src="activeBg.src"
              class="w-full h-20 object-cover"
            />
            <UButton
              icon="i-lucide-x"
              variant="solid"
              color="error"
              size="xs"
              class="absolute top-1 right-1"
              @click="removeBgImage"
            />
          </div>

          <!-- Fit selector -->
          <div>
            <label class="text-[10px] text-(--ui-text-muted)">Object Fit</label>
            <USelectMenu
              size="xs"
              :model-value="activeBg.fit ?? 'cover'"
              :items="fitOptions"
              value-key="value"
              @update:model-value="v => setBgProp('fit', v)"
            />
          </div>

          <!-- Focal Point -->
          <div class="space-y-1.5">
            <label class="text-[10px] text-(--ui-text-muted)">Focal Point</label>

            <!-- 9-point grid -->
            <div class="grid grid-cols-3 gap-0.5 w-[72px]">
              <button
                v-for="pt in focalPresets"
                :key="`${pt.x}-${pt.y}`"
                class="w-5 h-5 rounded-sm border transition-all"
                :class="(activeBg.focalX ?? 50) === pt.x && (activeBg.focalY ?? 50) === pt.y
                  ? 'bg-(--ui-primary) border-(--ui-primary)'
                  : 'border-(--ui-border) hover:border-(--ui-primary)/50 bg-(--ui-bg-elevated)'"
                :title="pt.label"
                @click="updateLayer(activeBg!.id, { focalX: pt.x, focalY: pt.y })"
              />
            </div>

            <!-- X slider -->
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] text-(--ui-text-muted) w-3">X</span>
              <input
                type="range"
                min="0"
                max="100"
                :value="activeBg.focalX ?? 50"
                class="flex-1 h-1 accent-(--ui-primary)"
                @input="(e: Event) => setBgProp('focalX', parseInt((e.target as HTMLInputElement).value))"
              />
              <span class="text-[9px] text-(--ui-text-muted) w-6 text-right">{{ activeBg.focalX ?? 50 }}%</span>
            </div>

            <!-- Y slider -->
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] text-(--ui-text-muted) w-3">Y</span>
              <input
                type="range"
                min="0"
                max="100"
                :value="activeBg.focalY ?? 50"
                class="flex-1 h-1 accent-(--ui-primary)"
                @input="(e: Event) => setBgProp('focalY', parseInt((e.target as HTMLInputElement).value))"
              />
              <span class="text-[9px] text-(--ui-text-muted) w-6 text-right">{{ activeBg.focalY ?? 50 }}%</span>
            </div>
          </div>
        </div>

        <!-- Upload / Pick buttons (Image mode) -->
        <div v-if="bgSourceType !== 'video'" class="flex gap-1.5">
          <UButton
            size="xs"
            variant="soft"
            icon="i-lucide-upload"
            :loading="isUploading"
            class="flex-1"
            @click="fileInput?.click()"
          >
            Upload
          </UButton>
          <UButton
            size="xs"
            variant="soft"
            icon="i-lucide-image"
            class="flex-1"
            @click="showAssetPicker = !showAssetPicker"
          >
            Assets
          </UButton>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onFileSelect"
          >
        </div>

        <!-- Upload / Pick buttons (Video mode) -->
        <div v-else class="flex gap-1.5">
          <UButton
            size="xs"
            variant="soft"
            icon="i-lucide-upload"
            :loading="isUploading"
            class="flex-1"
            @click="videoFileInput?.click()"
          >
            Upload Video
          </UButton>
          <UButton
            size="xs"
            variant="soft"
            icon="i-lucide-film"
            class="flex-1"
            @click="showAssetPicker = !showAssetPicker"
          >
            Videos
          </UButton>
          <input
            ref="videoFileInput"
            type="file"
            accept="video/mp4,video/webm"
            class="hidden"
            @change="onVideoFileSelect"
          >
        </div>

        <!-- Asset picker grid (Image) -->
        <div v-if="showAssetPicker && bgSourceType !== 'video'" class="space-y-1.5">
          <div v-if="imageAssets.length" class="grid grid-cols-3 gap-1">
            <div
              v-for="asset in imageAssets"
              :key="asset.id"
              class="aspect-square rounded border border-(--ui-border) overflow-hidden cursor-pointer hover:ring-2 hover:ring-(--ui-primary)/30 transition-all"
              @click="pickAsset(asset)"
            >
              <img
                v-if="safeMediaUrl(asset.thumbnailUrl) || safeMediaUrl(asset.url)"
                :src="safeMediaUrl(asset.thumbnailUrl) || safeMediaUrl(asset.url)"
                :alt="asset.name"
                class="w-full h-full object-cover"
              />
            </div>
          </div>
          <p v-else class="text-[10px] text-(--ui-text-muted) text-center py-2">
            No image assets uploaded yet
          </p>
        </div>

        <!-- Asset picker grid (Video) -->
        <div v-if="showAssetPicker && bgSourceType === 'video'" class="space-y-1.5">
          <div v-if="videoAssets.length" class="grid grid-cols-2 gap-1">
            <div
              v-for="asset in videoAssets"
              :key="asset.id"
              class="rounded border border-(--ui-border) overflow-hidden cursor-pointer hover:ring-2 hover:ring-(--ui-primary)/30 transition-all p-1.5"
              @click="pickVideoAsset(asset)"
            >
              <UIcon name="i-lucide-film" class="w-4 h-4 text-(--ui-text-muted) mb-0.5" />
              <span class="text-[9px] text-(--ui-text-muted) block truncate">{{ asset.name }}</span>
            </div>
          </div>
          <p v-else class="text-[10px] text-(--ui-text-muted) text-center py-2">
            No video assets uploaded yet
          </p>
        </div>

        <!-- Opacity -->
        <div>
          <label class="text-[10px] text-(--ui-text-muted)">Opacity</label>
          <div class="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="activeBg.opacity"
              class="flex-1 h-1 accent-(--ui-primary)"
              @input="(e: Event) => setBgProp('opacity', parseFloat((e.target as HTMLInputElement).value))"
            />
            <span class="text-[10px] text-(--ui-text-muted) w-8 text-right">{{ Math.round((activeBg.opacity ?? 1) * 100) }}%</span>
          </div>
        </div>
      </div>

      <!-- Background Animation -->
      <details open class="bs-section group">
        <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
          <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
          <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Animation</span>
        </summary>
      <div class="pt-1.5 space-y-2">

        <div>
          <label class="text-[10px] text-(--ui-text-muted)">Type</label>
          <USelectMenu
            size="xs"
            :model-value="activeBg.animIn ?? 'none'"
            :items="bgAnimOptions"
            value-key="value"
            @update:model-value="(v: string) => setBgProp('animIn', v as AnimInType)"
          />
        </div>

        <template v-if="activeBg.animIn && activeBg.animIn !== 'none'">
          <div class="grid grid-cols-2 gap-1.5">
            <div>
              <label class="text-[10px] text-(--ui-text-muted)">In Duration</label>
              <UInput
                type="number"
                size="xs"
                step="0.05"
                :model-value="activeBg.animInDur ?? 0.6"
                @update:model-value="v => setBgProp('animInDur', Number(v))"
              />
            </div>
            <div>
              <label class="text-[10px] text-(--ui-text-muted)">Out Duration</label>
              <UInput
                type="number"
                size="xs"
                step="0.05"
                :model-value="activeBg.outDur ?? 0.5"
                @update:model-value="v => setBgProp('outDur', Number(v))"
              />
            </div>
          </div>

          <div>
            <label class="text-[10px] text-(--ui-text-muted) mb-1 block">Ease</label>
            <div class="flex gap-1">
              <UPopover v-model:open="bgEaseOpen">
                <button class="flex-1 flex items-center gap-1.5 px-2 py-1 rounded border border-[#3a3a3f] hover:border-[#555] bg-[#1e1e22] transition-colors text-left min-w-0">
                  <svg viewBox="-1 -2 34 24" class="w-6 h-4 shrink-0">
                    <path
                      :d="easeSvgPath(findEase(activeBg.ease ?? 'power2.out')?.cp || [0, 0, 0.58, 1])"
                      fill="none" stroke="#4a8fe8" stroke-width="1.5" stroke-linecap="round"
                    />
                  </svg>
                  <span class="text-[10px] text-[#ccc] truncate">{{ findEase(activeBg.ease ?? 'power2.out')?.label || activeBg.ease }}</span>
                  <UIcon name="i-lucide-chevron-down" class="w-3 h-3 text-[#555] shrink-0 ml-auto" />
                </button>
                <template #content>
                  <div class="p-2 w-[260px] max-h-[320px] overflow-y-auto space-y-2">
                    <template v-for="group in EASE_GROUPS" :key="group.label">
                      <div class="text-[9px] text-[#555] uppercase tracking-wider font-semibold">{{ group.label }}</div>
                      <div class="grid grid-cols-4 gap-1">
                        <button
                          v-for="ease in group.items" :key="ease.id"
                          class="flex flex-col items-center gap-0.5 p-1 rounded border transition-all"
                          :class="(activeBg.ease ?? 'power2.out') === ease.id
                            ? 'border-[#4a8fe8] bg-[#4a8fe8]/10'
                            : 'border-transparent hover:bg-white/5'"
                          @click="selectBgEase(ease.id)"
                        >
                          <svg viewBox="-1 -4 34 28" class="w-7 h-4">
                            <path :d="easeSvgPath(ease.cp)" fill="none"
                              :stroke="(activeBg.ease ?? 'power2.out') === ease.id ? '#4a8fe8' : '#666'"
                              stroke-width="1.5" stroke-linecap="round" />
                          </svg>
                          <span class="text-[8px] font-medium truncate w-full text-center"
                            :class="(activeBg.ease ?? 'power2.out') === ease.id ? 'text-[#4a8fe8]' : 'text-[#777]'"
                          >{{ ease.label }}</span>
                        </button>
                      </div>
                    </template>
                  </div>
                </template>
              </UPopover>
              <UPopover>
                <UButton size="xs" variant="ghost" icon="i-lucide-spline" />
                <template #content>
                  <div class="p-3 w-[220px]">
                    <BannerEasingCurveEditor
                      :model-value="activeBg.ease ?? 'power2.out'"
                      @update:model-value="v => setBgProp('ease', v)"
                    />
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </template>
      </div>
      </details>
    </template>
    </details>

    <!-- Accent Color -->
    <details open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Accent</span>
      </summary>
    <div class="pt-1.5 space-y-2">
      <div class="flex gap-1.5 flex-wrap">
        <button
          v-for="c in accentPresets"
          :key="c"
          class="w-6 h-6 rounded border cursor-pointer transition-all"
          :class="state.accentColor === c ? 'border-(--ui-primary) ring-1 ring-(--ui-primary)' : 'border-(--ui-border)'"
          :style="{ backgroundColor: c }"
          @click="state.accentColor = c"
        />
      </div>
      <div class="flex items-center gap-1.5">
        <input
          type="color"
          :value="state.accentColor"
          class="w-6 h-6 rounded cursor-pointer border border-(--ui-border)"
          @input="(e: Event) => state.accentColor = (e.target as HTMLInputElement).value"
        />
        <UInput size="xs" class="flex-1" v-model="state.accentColor" />
      </div>
    </div>
    </details>
  </div>
</template>
