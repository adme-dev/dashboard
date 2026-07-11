<script setup lang="ts">
import type { Layer, DissectorManifest } from '~/types/banner-studio'
import { FORMATS, migrateLayer } from '~/utils/banner-constants'

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const { state, nextId } = useBannerStudio()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

// Step state
type Step = 'upload' | 'analyzing' | 'results' | 'import'
const step = ref<Step>('upload')

// Upload state
const dragOver = ref(false)
const selectedFile = ref<File | null>(null)
const previewUrl = ref<string | null>(null)
const brandName = ref('')

// Analysis state
const jobId = ref('')
const manifest = ref<DissectorManifest | null>(null)
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)
const statusText = ref('Analyzing layers...')
const isUploading = ref(false)

// Token editing state
const editedTokens = ref<Record<string, string>>({})

// Layer type override state
const layerTypeOverrides = ref<Record<string, string>>({})
const editorTypeOptions = [
  { label: 'Text', value: 'text' },
  { label: 'Image', value: 'image' },
  { label: 'Button', value: 'button' },
  { label: 'Rect', value: 'rect' },
  { label: 'Background', value: 'bg' },
]

// Import state
const selectedFormat = ref('')
const isImporting = ref(false)

// Reset on open
watch(open, (val) => {
  if (val) {
    step.value = 'upload'
    selectedFile.value = null
    previewUrl.value = null
    brandName.value = ''
    jobId.value = ''
    manifest.value = null
    editedTokens.value = {}
    layerTypeOverrides.value = {}
    selectedFormat.value = state.activeKey || 'mrec'
    isUploading.value = false
    isImporting.value = false
    stopPolling()
  } else {
    stopPolling()
  }
})

// Auto-initialize layer type overrides when manifest loads
watch(manifest, (m) => {
  if (!m) return
  const defaults: Record<string, string> = {}
  for (const layer of m.layers) {
    switch (layer.type) {
      case 'background': defaults[layer.id] = 'bg'; break
      case 'live_text': defaults[layer.id] = 'text'; break
      case 'graphic_text': defaults[layer.id] = 'text'; break
      case 'vehicle':
      case 'logo':
      default:
        defaults[layer.id] = 'image'; break
    }
  }
  layerTypeOverrides.value = defaults

  // Auto-detect closest format from source banner_size
  if (m.banner_size) {
    const [sw, sh] = m.banner_size.split('x').map(Number)
    if (sw && sh) {
      // Find exact or closest format match
      let bestKey = ''
      let bestDelta = Infinity
      for (const f of Object.values(FORMATS)) {
        if (f.w === sw && f.h === sh) {
          bestKey = f.key
          bestDelta = 0
          break
        }
        const delta = Math.abs(f.w - sw) + Math.abs(f.h - sh)
        if (delta < bestDelta) {
          bestDelta = delta
          bestKey = f.key
        }
      }
      if (bestKey) {
        selectedFormat.value = bestKey
      }
    }
  }
})

// Available formats
const formatOptions = computed(() =>
  Object.values(FORMATS).map(f => ({
    label: `${f.name} (${f.w}x${f.h})`,
    value: f.key,
  }))
)

// Layer type colors for bounding box overlay
const typeColors: Record<string, string> = {
  background: '#6b7280',
  vehicle: '#3b82f6',
  graphic_text: '#f59e0b',
  live_text: '#10b981',
  logo: '#8b5cf6',
}

// ── File handling ──

function handleFileDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files[0]
  if (file) selectFile(file)
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) selectFile(file)
}

function selectFile(file: File) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) {
    toast.add({ title: 'Invalid file', description: 'Only JPEG, PNG, and WebP images are accepted', color: 'error' })
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    toast.add({ title: 'File too large', description: 'Maximum file size is 10MB', color: 'error' })
    return
  }
  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

// ── Upload & analyze ──

async function handleAnalyze() {
  if (!selectedFile.value) return
  isUploading.value = true

  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    if (brandName.value.trim()) {
      formData.append('brand', brandName.value.trim())
    }

    const result = await apiFetch<{ jobId: string; status: string }>(
      '/api/agency/banner-studio/dissect/upload',
      { method: 'POST', body: formData }
    )

    jobId.value = result.jobId
    step.value = 'analyzing'
    statusText.value = 'Analyzing layers...'
    startPolling()
  } catch (e: any) {
    toast.add({ title: 'Upload failed', description: e.data?.statusMessage || 'Could not upload image', color: 'error' })
  } finally {
    isUploading.value = false
  }
}

// ── Polling ──

function startPolling() {
  pollTimer.value = setInterval(async () => {
    try {
      const result = await apiFetch<any>(`/api/agency/banner-studio/dissect/${jobId.value}`)

      if (result.status === 'segmenting') {
        statusText.value = 'Segmenting layers...'
      } else if (result.status === 'failed') {
        stopPolling()
        toast.add({ title: 'Analysis failed', description: result.error || 'Unknown error', color: 'error' })
        step.value = 'upload'
      } else if (result.version === '2.0' || result.status === 'complete') {
        // Got the full manifest
        stopPolling()
        manifest.value = result as DissectorManifest
        // Initialize token editors
        if (manifest.value?.tokens) {
          for (const [key, token] of Object.entries(manifest.value.tokens)) {
            editedTokens.value[key] = token.value
          }
        }
        step.value = 'results'
      }
    } catch {
      // Polling error — keep trying
    }
  }, 2000)
}

function stopPolling() {
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }
}

// ── Import ──

async function handleImportToEditor() {
  if (!manifest.value) return
  isImporting.value = true

  try {
    // Apply edited token values back to manifest
    if (manifest.value.tokens) {
      for (const [key, val] of Object.entries(editedTokens.value)) {
        if (manifest.value.tokens[key]) {
          manifest.value.tokens[key].value = val
        }
      }
    }

    const result = await apiFetch<{ projectId: string; layers: Layer[] }>(
      `/api/agency/banner-studio/dissect/${jobId.value}/import`,
      {
        method: 'POST',
        body: {
          projectId: state.project?.id,
          formatKey: selectedFormat.value,
          layerTypeOverrides: layerTypeOverrides.value,
        },
      }
    )

    // Load layers into current artboard
    const targetKey = selectedFormat.value
    const fmt = FORMATS[targetKey]
    if (fmt && result.layers) {
      const migrated = result.layers.map((l: any) =>
        migrateLayer({ ...l, id: nextId() })
      )

      // Add format if not in current set
      if (!state.setKeys.includes(targetKey)) {
        state.setKeys.push(targetKey)
      }
      state.sets[targetKey] = { layers: migrated }
      state.activeKey = targetKey
      state.selectedLayerId = null
      state.isDirty = true

      toast.add({
        title: 'Imported',
        description: `${migrated.length} layers imported from dissected banner`,
        color: 'success',
      })
    }

    open.value = false
  } catch (e: any) {
    toast.add({ title: 'Import failed', description: e.data?.statusMessage || 'Could not import layers', color: 'error' })
  } finally {
    isImporting.value = false
  }
}

async function handleCreateProject() {
  if (!manifest.value) return
  isImporting.value = true

  try {
    const result = await apiFetch<{ projectId: string }>(
      `/api/agency/banner-studio/dissect/${jobId.value}/import`,
      {
        method: 'POST',
        body: {
          formatKey: selectedFormat.value,
          layerTypeOverrides: layerTypeOverrides.value,
        },
      }
    )

    toast.add({
      title: 'Project created',
      description: 'Navigating to new project...',
      color: 'success',
    })
    open.value = false
    await navigateTo(`/agency/banner-studio/${result.projectId}`)
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.data?.statusMessage || 'Could not create project', color: 'error' })
  } finally {
    isImporting.value = false
  }
}

// Layer type icons
function layerIcon(type: string): string {
  switch (type) {
    case 'background': return 'i-lucide-image'
    case 'vehicle': return 'i-lucide-car'
    case 'logo': return 'i-lucide-badge'
    case 'graphic_text': return 'i-lucide-type'
    case 'live_text': return 'i-lucide-text-cursor'
    default: return 'i-lucide-layers'
  }
}

// Cleanup
onUnmounted(() => {
  stopPolling()
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <div class="p-5 space-y-4 max-h-[80vh] overflow-y-auto min-w-[500px]">
        <div class="flex items-center gap-2 mb-2">
          <UIcon name="i-lucide-scan-line" class="text-(--ui-primary) w-5 h-5" />
          <h3 class="text-base font-bold">Banner Dissector</h3>
          <UBadge variant="subtle" size="xs" color="info">AI</UBadge>
        </div>

        <!-- Step 1: Upload -->
        <template v-if="step === 'upload'">
          <p class="text-xs text-(--ui-text-muted)">
            Upload a banner image to analyze its layers, extract editable tokens, and import into your project.
          </p>

          <!-- Drop zone -->
          <div
            class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
            :class="dragOver ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border) hover:border-(--ui-text-muted)'"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="handleFileDrop"
            @click="fileInput?.click()"
          >
            <input
              ref="fileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="hidden"
              @change="handleFileInput"
            />

            <template v-if="selectedFile && previewUrl">
              <img :src="previewUrl" class="max-h-40 mx-auto rounded mb-2 border border-(--ui-border)" />
              <div class="text-sm font-medium">{{ selectedFile.name }}</div>
              <div class="text-xs text-(--ui-text-muted)">{{ (selectedFile.size / 1024).toFixed(0) }}KB</div>
            </template>
            <template v-else>
              <UIcon name="i-lucide-upload" class="w-8 h-8 mx-auto text-(--ui-text-muted) mb-2" />
              <div class="text-sm text-(--ui-text-muted)">Drop a banner image or click to browse</div>
              <div class="text-xs text-(--ui-text-dimmed) mt-1">JPEG, PNG, WebP &middot; Max 10MB</div>
            </template>
          </div>

          <!-- Brand name -->
          <div>
            <label class="text-xs text-(--ui-text-muted) mb-1 block">Brand name (optional)</label>
            <UInput v-model="brandName" size="sm" placeholder="e.g. Toyota, Nike" />
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-2 pt-2">
            <UButton label="Cancel" variant="ghost" size="sm" @click="open = false" />
            <UButton
              label="Analyze"
              icon="i-lucide-scan-line"
              size="sm"
              :loading="isUploading"
              :disabled="!selectedFile"
              @click="handleAnalyze"
            />
          </div>
        </template>

        <!-- Step 2: Analyzing (polling) -->
        <template v-if="step === 'analyzing'">
          <div class="py-8 text-center space-y-4">
            <div class="w-12 h-12 mx-auto rounded-full bg-(--ui-primary)/10 flex items-center justify-center">
              <UIcon name="i-lucide-loader-2" class="w-6 h-6 text-(--ui-primary) animate-spin" />
            </div>
            <div class="text-sm font-medium">{{ statusText }}</div>
            <div class="text-xs text-(--ui-text-muted)">
              This may take 10-30 seconds depending on banner complexity.
            </div>

            <!-- Preview of uploaded image -->
            <div v-if="previewUrl" class="mt-4">
              <img :src="previewUrl" class="max-h-32 mx-auto rounded border border-(--ui-border) opacity-60" />
            </div>
          </div>
        </template>

        <!-- Step 3: Results -->
        <template v-if="step === 'results' && manifest">
          <div class="grid grid-cols-2 gap-4">
            <!-- Left: Original with overlaid regions -->
            <div>
              <div class="text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted) mb-2">Detected Layers</div>
              <div class="relative border border-(--ui-border) rounded overflow-hidden bg-black/10">
                <img v-if="previewUrl" :src="previewUrl" class="w-full" />
                <!-- Bounding box overlays -->
                <div
                  v-for="layer in manifest.layers"
                  :key="layer.id"
                  class="absolute border-2 pointer-events-none"
                  :style="{
                    left: `${layer.region.x * 100}%`,
                    top: `${layer.region.y * 100}%`,
                    width: `${layer.region.width * 100}%`,
                    height: `${layer.region.height * 100}%`,
                    borderColor: typeColors[layer.type] || '#9ca3af',
                  }"
                >
                  <span
                    class="absolute -top-4 left-0 text-[9px] px-1 rounded-t font-medium text-white"
                    :style="{ backgroundColor: typeColors[layer.type] || '#9ca3af' }"
                  >
                    {{ layer.type }}
                  </span>
                </div>
              </div>

              <!-- Meta info -->
              <div class="mt-2 flex gap-2 flex-wrap">
                <UBadge variant="subtle" size="xs">{{ manifest.brand }}</UBadge>
                <UBadge variant="subtle" size="xs" color="neutral">{{ manifest.campaign_type }}</UBadge>
                <UBadge variant="subtle" size="xs" color="neutral">{{ manifest.banner_size }}</UBadge>
              </div>
            </div>

            <!-- Right: Layer list + tokens -->
            <div class="space-y-3 max-h-[400px] overflow-y-auto">
              <!-- Layer list -->
              <div>
                <div class="text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted) mb-1">Layers ({{ manifest.layers.length }})</div>
                <div class="space-y-1">
                  <div
                    v-for="layer in manifest.layers"
                    :key="layer.id"
                    class="flex items-center gap-2 p-1.5 rounded border border-(--ui-border) text-xs"
                  >
                    <!-- Type indicator -->
                    <span
                      class="w-2 h-2 rounded-full flex-shrink-0"
                      :style="{ backgroundColor: typeColors[layer.type] || '#9ca3af' }"
                    />
                    <!-- Thumbnail or icon -->
                    <div class="w-8 h-8 flex-shrink-0 rounded bg-(--ui-bg-elevated) flex items-center justify-center overflow-hidden">
                      <img v-if="layer.r2_url" :src="layer.r2_url" class="w-full h-full object-contain" />
                      <UIcon v-else :name="layerIcon(layer.type)" class="w-4 h-4 text-(--ui-text-muted)" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="truncate font-medium">{{ layer.description }}</div>
                      <div class="flex items-center gap-1 mt-0.5">
                        <UBadge variant="subtle" size="xs" :color="layer.editable ? 'success' : 'neutral'">
                          {{ layer.type }}
                        </UBadge>
                        <UIcon name="i-lucide-arrow-right" class="w-3 h-3 text-(--ui-text-dimmed) flex-shrink-0" />
                        <USelectMenu
                          v-model="layerTypeOverrides[layer.id]"
                          :items="editorTypeOptions"
                          size="xs"
                          value-key="value"
                          class="w-20"
                        />
                        <UBadge v-if="layer.export_as_png && layer.r2_url" variant="subtle" size="xs" color="info">PNG</UBadge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Token editor -->
              <div v-if="Object.keys(manifest.tokens).length > 0">
                <div class="text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted) mb-1">Editable Tokens</div>
                <div class="space-y-2">
                  <div v-for="(token, key) in manifest.tokens" :key="key">
                    <label class="text-xs text-(--ui-text-muted)">{{ token.label }}</label>
                    <UInput
                      v-model="editedTokens[key]"
                      size="sm"
                      :placeholder="token.label"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Import options -->
          <div class="border-t border-(--ui-border) pt-3 mt-3">
            <div class="flex items-end gap-3">
              <div class="flex-1">
                <label class="text-xs text-(--ui-text-muted) mb-1 block">Import as format</label>
                <USelectMenu
                  v-model="selectedFormat"
                  :items="formatOptions"
                  size="sm"
                  value-key="value"
                />
              </div>
              <div class="flex gap-2">
                <UButton
                  label="New Project"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-plus"
                  :loading="isImporting"
                  @click="handleCreateProject"
                />
                <UButton
                  label="Import to Editor"
                  size="sm"
                  icon="i-lucide-download"
                  :loading="isImporting"
                  @click="handleImportToEditor"
                />
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>
