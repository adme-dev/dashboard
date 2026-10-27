<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'
import { FORMATS, migrateLayer } from '~/utils/banner-constants'
import { useBannerDissectionJob, dissectionFailureMessage as failureMessage } from '~/composables/useBannerDissectionJob'
import { canImportDissection } from '../../../shared/bannerDissectionReadiness'

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const { state, nextId, getCanvasData, applyAssistantCanvas, withCanvasUndo } = useBannerStudio()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>

const jobs = useBannerDissectionJob(apiFetch)
const { current, history, busy, error: jobError, loadingHistory, manifest, importReady, resultId, canCancel, canRetry, cancellationRequested } = jobs
const jobId = computed(() => current.value?.jobId || '')
const step = computed(() => !current.value ? 'upload' : manifest.value ? 'results' : 'analyzing')
const selectedFile = ref<File | null>(null)
const previewUrl = ref<string | null>(null)
const brandName = ref('')
const isUploading = computed(() => busy.value === 'upload')
const needsReconstruction = computed(() => !!manifest.value && !canImportDissection(manifest.value))
const hasResultIdentity = computed(() => /^[a-f0-9]{64}$/i.test(resultId.value))
const statusText = computed(() => ({
  queued: 'Waiting to analyze', analyzing: 'Analyzing layers', segmenting: 'Extracting layers',
  failed: 'Analysis failed', cancelled: 'Job cancelled', review_ready: 'Ready for review',
  complete: 'Extraction complete', imported: 'Artwork imported'
}[current.value?.status || 'queued']))
const progressText = computed(() => {
  const progress = current.value?.progress
  return progress && typeof progress.completed === 'number' && typeof progress.total === 'number'
    ? `${progress.completed} of ${progress.total}`
    : ''
})
const savedJobOptions = computed(() => history.value.map(job => ({
  label: `${job.brand || 'Banner'} — ${job.status}${job.createdAt ? ` (${new Date(job.createdAt).toLocaleDateString()})` : ''}`,
  value: job.jobId
})))

// Layer type override state
const layerTypeOverrides = ref<Record<string, string>>({})
const editorTypeOptions = [
  { label: 'Text', value: 'text' },
  { label: 'Image', value: 'image' },
  { label: 'Button', value: 'button' },
  { label: 'Background', value: 'bg' }
]

// Import state
const selectedFormat = ref('')
const isImporting = ref(false)

// An open session captures the reviewed saved editor context, independently of job polls.
let openEpoch = 0
let reviewedProject: typeof state.project = null
let reviewedRevision: string | undefined
let reviewedCanvas = ''
let reviewedKey = ''
const appliedReceipts = new Set<string>()
watch(open, (value) => {
  openEpoch++
  isImporting.value = false
  if (value) {
    reviewedProject = state.project
    reviewedRevision = state.project?.updatedAt
    reviewedCanvas = JSON.stringify(getCanvasData())
    reviewedKey = state.activeKey
    selectedFormat.value ||= state.activeKey || 'mrec'
    void jobs.resume()
  } else jobs.suspend()
}, { immediate: true, flush: 'sync' })

function editorContextMatches() {
  return !!reviewedProject?.id && !!reviewedRevision && state.project === reviewedProject
    && state.project?.updatedAt === reviewedRevision && !state.isDirty && !state.isSaving
    && state.activeKey === reviewedKey && JSON.stringify(getCanvasData()) === reviewedCanvas
}
const editorImportReady = computed(() => importReady.value && !isImporting.value && editorContextMatches())
function chooseSavedJob(id: string) {
  if (isImporting.value || busy.value) return
  clearPreview()
  void jobs.select(id)
}
function clearPreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
  selectedFile.value = null
}
function startAnother() {
  if (isImporting.value || busy.value) return
  clearPreview()
  jobs.newUpload()
}

// Auto-initialize layer type overrides when manifest loads
let lastReviewedResult = ''
watch(manifest, (m) => {
  if (!m) return
  const identity = `${m.jobId}:${resultId.value || m.status}`
  if (identity === lastReviewedResult) return
  lastReviewedResult = identity
  const defaults: Record<string, string> = {}
  for (const layer of m.layers) {
    switch (layer.type) {
      case 'background':
        defaults[layer.id] = 'bg'
        break
      case 'live_text':
        defaults[layer.id] = 'text'
        break
      case 'graphic_text':
        defaults[layer.id] = 'image'
        break
      case 'vehicle':
      case 'logo':
      default:
        defaults[layer.id] = 'image'
        break
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
    value: f.key
  }))
)

// Layer type colors for bounding box overlay
const typeColors: Record<string, string> = {
  background: '#6b7280',
  vehicle: '#3b82f6',
  graphic_text: '#f59e0b',
  live_text: '#10b981',
  logo: '#8b5cf6'
}

// ── File handling ──

function selectFile(file: File | null) {
  if (busy.value) return
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
  selectedFile.value = null
  if (!file) return
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
  if (!selectedFile.value || busy.value || isImporting.value) return
  const formData = new FormData()
  formData.append('file', selectedFile.value)
  if (brandName.value.trim()) formData.append('brand', brandName.value.trim())
  await jobs.upload(formData)
}

// The backend persists once; the local editor receives at most one atomic apply per receipt.
async function importJob(createProject: boolean) {
  if (!importReady.value || isImporting.value || !FORMATS[selectedFormat.value]) return
  if (!createProject && !editorContextMatches()) {
    toast.add({ title: 'Save and reopen before importing', description: 'Review the current saved artwork before replacing a format.', color: 'warning' })
    return
  }
  const epoch = openEpoch
  const id = jobId.value
  const job = current.value
  const project = state.project
  const revision = project?.updatedAt
  const canvas = JSON.stringify(getCanvasData())
  const key = state.activeKey
  const targetKey = selectedFormat.value
  const overrides = { ...layerTypeOverrides.value }
  const expectedResultId = resultId.value
  isImporting.value = true
  const contextMatches = () => open.value && epoch === openEpoch && jobId.value === id
    && current.value === job && importReady.value && state.project === project
    && state.project?.updatedAt === revision && JSON.stringify(getCanvasData()) === canvas
    && state.activeKey === key && (!createProject ? !state.isDirty && !state.isSaving : true)
  try {
    const result = await apiFetch<{ projectId: string, formatKey: string, layers: Layer[], revision: string, receiptId: string }>(
      `/api/agency/banner-studio/dissect/${encodeURIComponent(id)}/import`, {
        method: 'POST', body: {
          ...(!createProject ? { projectId: project!.id, expectedRevision: revision } : {}),
          formatKey: targetKey, layerTypeOverrides: overrides, expectedResultId
        }
      }
    )
    if (!contextMatches()) {
      toast.add({ title: 'Import saved', description: 'The editor context changed. Reopen the saved project to review the imported artwork.', color: 'warning' })
      return
    }
    if (!result.receiptId || !result.revision || result.formatKey !== targetKey || !result.projectId
      || (!createProject && (result.projectId !== project!.id || !Array.isArray(result.layers)))) {
      throw new Error('Incomplete import receipt')
    }
    if (appliedReceipts.has(result.receiptId)) return
    if (createProject) {
      appliedReceipts.add(result.receiptId)
      open.value = false
      await navigateTo(`/agency/banner-studio/${result.projectId}`)
    } else {
      const canvasData = getCanvasData()
      canvasData[targetKey] = { layers: result.layers.map(layer => migrateLayer({ ...layer, id: nextId() })) }
      withCanvasUndo(() => {
        applyAssistantCanvas(canvasData)
        state.activeKey = targetKey
        state.selectedLayerId = null
      })
      state.project!.updatedAt = result.revision
      appliedReceipts.add(result.receiptId)
      toast.add({ title: 'Imported', description: `${result.layers.length} layers imported. Undo restores the previous artwork.`, color: 'success' })
      open.value = false
    }
  } catch (cause) {
    if (epoch === openEpoch) toast.add({ title: 'Import failed', description: failureMessage(cause, 'Could not import artwork. Reopen the saved project if the request was interrupted.'), color: 'error' })
  } finally { if (epoch === openEpoch) isImporting.value = false }
}
function handleImportToEditor() {
  return importJob(false)
}
function handleCreateProject() {
  return importJob(true)
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
  openEpoch++
  jobs.suspend()
  clearPreview()
})
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <div class="p-5 space-y-4 max-h-[80vh] overflow-y-auto @container">
        <div class="flex items-center gap-2 mb-2">
          <UIcon name="i-lucide-scan-line" class="text-(--ui-primary) w-5 h-5" />
          <h3 class="text-base font-bold">
            Banner Dissector
          </h3>
          <UBadge variant="subtle" size="xs" color="info">
            AI
          </UBadge>
          <UButton
            label="Close"
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="sm"
            class="ml-auto"
            @click="open = false"
          />
        </div>

        <UFormField v-if="savedJobOptions.length" label="Saved analyses">
          <USelectMenu
            :model-value="jobId || undefined"
            :items="savedJobOptions"
            value-key="value"
            :disabled="!!busy || isImporting"
            class="w-full"
            placeholder="Resume an analysis"
            @update:model-value="chooseSavedJob"
          />
        </UFormField>
        <p v-if="loadingHistory" class="text-sm text-muted" role="status">
          Loading saved analyses…
        </p>
        <UAlert
          v-if="jobError"
          color="error"
          title="Job update failed"
          :description="jobError"
        />
        <UAlert
          v-if="busy === 'retry'"
          color="info"
          title="Submitting retry"
          description="Waiting for the job to be accepted. Progress and cancellation will appear here when it is queued."
        />
        <div v-if="current" class="space-y-3" aria-live="polite">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-medium">
              {{ statusText }}
            </p>
            <UBadge variant="subtle" color="neutral">
              {{ current.status }}
            </UBadge>
          </div>
          <p v-if="current.execution?.attempt" class="text-sm text-muted">
            Attempt {{ current.execution.attempt }} of {{ current.execution.maxAttempts || 3 }}
          </p>
          <p v-if="progressText" class="text-sm text-muted">
            {{ progressText }}
          </p>
          <UAlert
            v-if="current.error"
            color="error"
            title="Analysis details"
            :description="current.error"
          />
          <UAlert
            v-if="cancellationRequested && current.status !== 'cancelled'"
            color="warning"
            title="Cancellation requested"
            description="Import is blocked while cancellation is being confirmed."
          />
          <ul v-if="!manifest && current.warnings?.length" class="list-disc pl-5 text-sm text-muted">
            <li v-for="warning in current.warnings" :key="warning">
              {{ warning }}
            </li>
          </ul>
          <div class="flex gap-2 flex-wrap">
            <UButton
              v-if="canCancel"
              label="Cancel job"
              color="neutral"
              variant="outline"
              size="sm"
              :loading="busy === 'cancel'"
              :disabled="!!busy || isImporting"
              @click="jobs.cancel"
            />
            <UButton
              v-if="canRetry"
              label="Retry analysis"
              variant="outline"
              size="sm"
              :loading="busy === 'retry'"
              :disabled="!!busy || isImporting"
              @click="jobs.retry"
            />
            <UButton
              label="Analyze another image"
              variant="ghost"
              size="sm"
              :disabled="!!busy || isImporting"
              @click="startAnother"
            />
          </div>
        </div>

        <!-- Step 1: Upload -->
        <template v-if="step === 'upload'">
          <p class="text-xs text-(--ui-text-muted)">
            Analyze the visible copy and image regions. A clean background and complete extraction are required before import; some artwork needs manual reconstruction.
          </p>

          <UFormField label="Banner image">
            <UFileUpload
              :model-value="selectedFile"
              :disabled="!!busy"
              accept="image/jpeg,image/png,image/webp"
              label="Drop a banner image or click to browse"
              description="JPEG, PNG, WebP · Maximum 10 MB"
              class="w-full"
              @update:model-value="selectFile"
            />
          </UFormField>

          <!-- Brand name -->
          <UFormField label="Brand name (optional)">
            <UInput
              v-model="brandName"
              :disabled="!!busy"
              size="sm"
              placeholder="e.g. Toyota, Nike"
              class="w-full"
            />
          </UFormField>

          <!-- Actions -->
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              label="Cancel"
              variant="ghost"
              size="sm"
              @click="open = false"
            />
            <UButton
              label="Analyze"
              icon="i-lucide-scan-line"
              size="sm"
              :loading="isUploading"
              :disabled="!selectedFile || !!busy || loadingHistory"
              @click="handleAnalyze"
            />
          </div>
        </template>

        <!-- Step 2: Analyzing (polling) -->
        <template v-if="step === 'analyzing' && ['queued', 'analyzing', 'segmenting'].includes(current?.status || '')">
          <div class="py-8 text-center space-y-4">
            <div class="w-12 h-12 mx-auto rounded-full bg-(--ui-primary)/10 flex items-center justify-center">
              <UIcon name="i-lucide-loader-2" class="w-6 h-6 text-(--ui-primary) animate-spin" />
            </div>
            <div class="text-sm font-medium">
              {{ statusText }}
            </div>
            <div class="text-xs text-(--ui-text-muted)">
              Analysis and extraction can take several minutes. Provider failures will be shown here.
            </div>

            <!-- Preview of uploaded image -->
            <div v-if="previewUrl" class="mt-4">
              <img :src="previewUrl" class="max-h-32 mx-auto rounded border border-(--ui-border) opacity-60">
            </div>
          </div>
        </template>

        <!-- Step 3: Results -->
        <template v-if="step === 'results' && manifest">
          <UAlert
            v-if="needsReconstruction"
            color="warning"
            variant="subtle"
            title="Needs reconstruction before import"
            description="The detected regions are a starting point. Missing extractions or the original lettering must be resolved before these layers can replace your artwork."
          />
          <UAlert
            v-if="!needsReconstruction && !hasResultIdentity"
            color="warning"
            title="Refresh this analysis before importing"
            description="Reopen the saved analysis to load its result identity. Your current artwork is unchanged."
          />
          <ul v-if="manifest.warnings?.length" class="list-disc pl-5 space-y-1 text-sm text-muted">
            <li v-for="warning in manifest.warnings" :key="warning">
              {{ warning }}
            </li>
          </ul>
          <div class="grid grid-cols-1 @lg:grid-cols-2 gap-4">
            <!-- Left: Original with overlaid regions -->
            <div>
              <div class="text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted) mb-2">
                Detected Layers
              </div>
              <div v-if="previewUrl" class="relative border border-(--ui-border) rounded overflow-hidden bg-black/10">
                <img :src="previewUrl" class="w-full" alt="Original banner with detected regions">
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
                    borderColor: typeColors[layer.type] || '#9ca3af'
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
                <UBadge variant="subtle" size="xs">
                  {{ manifest.brand }}
                </UBadge>
                <UBadge variant="subtle" size="xs" color="neutral">
                  {{ manifest.campaign_type }}
                </UBadge>
                <UBadge variant="subtle" size="xs" color="neutral">
                  {{ manifest.banner_size }}
                </UBadge>
              </div>
            </div>

            <!-- Right: Layer list + tokens -->
            <div class="space-y-3 max-h-[400px] overflow-y-auto">
              <!-- Layer list -->
              <div>
                <div class="text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted) mb-1">
                  Layers ({{ manifest.layers.length }})
                </div>
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
                      <img v-if="layer.r2_url" :src="layer.r2_url" class="w-full h-full object-contain">
                      <UIcon v-else :name="layerIcon(layer.type)" class="w-4 h-4 text-(--ui-text-muted)" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="truncate font-medium">
                        {{ layer.description }}
                      </div>
                      <p v-if="layer.extraction_warning" class="text-warning mt-1">
                        {{ layer.extraction_warning }}
                      </p>
                      <div class="flex items-center gap-1 mt-0.5">
                        <UBadge variant="subtle" size="xs" :color="layer.editable ? 'success' : 'neutral'">
                          {{ layer.type }}
                        </UBadge>
                        <UIcon name="i-lucide-arrow-right" class="w-3 h-3 text-(--ui-text-dimmed) flex-shrink-0" />
                        <UFormField label="Layer type">
                          <USelectMenu
                            v-model="layerTypeOverrides[layer.id]"
                            :disabled="!importReady || isImporting"
                            :items="editorTypeOptions"
                            size="xs"
                            value-key="value"
                            class="w-full"
                          />
                        </UFormField>
                        <UBadge
                          v-if="layer.export_as_png && layer.r2_url"
                          variant="subtle"
                          size="xs"
                          color="info"
                        >
                          PNG
                        </UBadge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Token editor -->
              <div v-if="Object.keys(manifest.tokens).length > 0">
                <div class="text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted) mb-1">
                  Detected copy
                </div>
                <div class="space-y-2">
                  <UFormField v-for="(token, key) in manifest.tokens" :key="key" :label="token.label">
                    <UTextarea
                      :model-value="token.value"
                      readonly
                      size="sm"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </div>
            </div>
          </div>

          <UAlert
            v-if="importReady && !editorImportReady && !isImporting"
            color="info"
            title="Save and reopen before importing to the editor"
            description="Import replaces one format of the reviewed saved project. You can also create a new project."
          />
          <!-- Import options -->
          <div class="border-t border-(--ui-border) pt-3 mt-3">
            <div class="flex flex-col @lg:flex-row @lg:items-end gap-3">
              <UFormField label="Import as format" class="w-full @lg:flex-1">
                <USelectMenu
                  v-model="selectedFormat"
                  :disabled="!importReady || isImporting"
                  class="w-full"
                  :items="formatOptions"
                  size="sm"
                  value-key="value"
                />
              </UFormField>
              <div class="flex gap-2">
                <UButton
                  label="New Project"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-plus"
                  :loading="isImporting"
                  :disabled="!importReady || isImporting"
                  @click="handleCreateProject"
                />
                <UButton
                  label="Import to Editor"
                  size="sm"
                  icon="i-lucide-download"
                  :loading="isImporting"
                  :disabled="!editorImportReady"
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
