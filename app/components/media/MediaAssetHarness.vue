<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { assemblyPlanToTimelinePayloads, type AiAssemblyTimelinePayload } from '~~/app/utils/video/aiAssemblyTimeline'
import { derivativeTimelinePayload } from '~~/app/utils/video/assetDerivativeTimeline'

const props = withDefaults(defineProps<{
  projectId: string
  embedded?: boolean
}>(), {
  embedded: false,
})
const emit = defineEmits<{
  (event: 'add-to-timeline', payload: AiAssemblyTimelinePayload): void
  (event: 'add-derivative-to-timeline', payload: ReturnType<typeof derivativeTimelinePayload>): void
}>()

interface Bucket {
  id: string
  kind: string
  name: string
  sortOrder: number
}

interface BucketItem {
  id: string
  bucketId: string
  assetId: string | null
  r2Key: string | null
  title: string | null
  role: string | null
  directive: Record<string, unknown>
  status: string
}

interface HarnessAction {
  id: string
  label: string
  description: string
  outputKinds: string[]
}

interface HarnessModel {
  id: string
  displayName: string
  actions: string[]
  defaultEnabled: boolean
  notes: string
}

interface IntelligenceJob {
  id: string
  sourceAssetId: string | null
  bucketItemId: string | null
  action: string
  modelId: string
  provider: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked'
  prompt: string | null
  brushMaskKey: string | null
  errorMessage: string | null
  createdAt: string
}

interface AssetDerivative {
  id: string
  sourceAssetId: string
  projectId: string | null
  kind: string
  r2Key: string
  width: number | null
  height: number | null
  metadata: Record<string, unknown>
  createdAt: string
  durationSec?: number | null
}

const toast = useToast()
const loading = ref(false)
const buckets = ref<Bucket[]>([])
const items = ref<BucketItem[]>([])
const actions = ref<HarnessAction[]>([])
const models = ref<HarnessModel[]>([])
const intelligenceJobs = ref<IntelligenceJob[]>([])
const selectedDerivatives = ref<AssetDerivative[]>([])
const loadingDerivatives = ref(false)
const addingDerivativeId = ref<string | null>(null)
const selectedItemId = ref<string | null>(null)
const selectedAction = ref('mask-lift')
const toolPrompt = ref('Lift the highlighted embedded graphic into a transparent layer.')
const brushMaskKey = ref('')
const brief = ref('Create a punchy vertical social edit using the strongest project assets.')
const targetFormat = ref('reels_9x16')
const runningExtraction = ref(false)
const assembling = ref(false)
const assemblyPlan = ref<any | null>(null)
const maskCanvasRef = ref<HTMLCanvasElement | null>(null)
const maskPreviewUrl = ref<string | null>(null)
const brushSize = ref(24)
const isDrawingMask = ref(false)
const hasMaskStroke = ref(false)
const uploadingMask = ref(false)
const maskPreviewFailed = ref(false)
let activityRefreshTimer: ReturnType<typeof setTimeout> | null = null

// Open by default in the AV editor. This is a core production workspace, not a
// secondary drawer, while the user's collapsed choice still persists.
const harnessOpen = useLocalStorage('media-asset-harness-open', true)
const contentOpen = computed(() => props.embedded || harnessOpen.value)

// Quick-create bar (shown while collapsed): typing a request expands the
// harness, sets it as the assembly brief, and builds a draft plan in one step.
const quickBrief = ref('')

async function submitQuickBrief() {
  const text = quickBrief.value.trim()
  if (!text || assembling.value) return
  brief.value = text
  harnessOpen.value = true
  quickBrief.value = ''
  await assemblePlan()
}

const selectedItem = computed(() => items.value.find(item => item.id === selectedItemId.value) ?? null)
const selectedItemTitle = computed(() => selectedItem.value?.title || selectedItem.value?.r2Key || 'No asset selected')
const actionOptions = computed(() => actions.value
  .filter(action => ['mask-lift', 'erase-fill', 'mask-only', 'layer-decomposition', 'background-removal'].includes(action.id))
  .map(action => ({ label: action.label, value: action.id })))
const selectedActionModels = computed(() => models.value.filter(model => model.actions.includes(selectedAction.value)))
const readyModelCount = computed(() => models.value.filter(model => model.defaultEnabled).length)
const activeJobCount = computed(() => intelligenceJobs.value.filter(job => job.status === 'queued' || job.status === 'running').length)
const completedJobCount = computed(() => intelligenceJobs.value.filter(job => job.status === 'succeeded').length)
const selectedItemJobs = computed(() => {
  const item = selectedItem.value
  if (!item) return []
  return intelligenceJobs.value.filter(job => job.bucketItemId === item.id || (item.assetId && job.sourceAssetId === item.assetId)).slice(0, 5)
})
const selectedDirectivePrompt = computed(() => {
  const prompt = selectedItem.value?.directive?.prompt
  return typeof prompt === 'string' ? prompt : null
})
const selectedAssetActivityVisible = computed(() =>
  Boolean(selectedDirectivePrompt.value || selectedItemJobs.value.length || selectedDerivatives.value.length || loadingDerivatives.value)
)
const selectedAssetThumbnailUrl = computed(() => selectedItem.value?.assetId && !maskPreviewFailed.value
  ? `/api/agency/video/assets/${encodeURIComponent(selectedItem.value.assetId)}/thumbnail`
  : null)
const maskToolEnabled = computed(() => ['mask-lift', 'erase-fill', 'mask-only'].includes(selectedAction.value))
const itemsByBucket = computed(() => {
  const grouped: Record<string, BucketItem[]> = {}
  for (const item of items.value) {
    grouped[item.bucketId] ||= []
    grouped[item.bucketId]!.push(item)
  }
  return grouped
})
// Only buckets with assets get a row — nine empty folders are noise, not signal.
const visibleBuckets = computed(() => buckets.value.filter(bucket => (itemsByBucket.value[bucket.id] || []).length > 0))
const emptyBucketCount = computed(() => buckets.value.length - visibleBuckets.value.length)
const contentGridClass = computed(() => props.embedded
  ? 'grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)]'
  : 'grid gap-3 p-3 xl:grid-cols-[320px_minmax(0,1fr)_360px]')

function maskCanvasPoint(event: PointerEvent) {
  const canvas = maskCanvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  }
}

function drawMaskPoint(event: PointerEvent) {
  const canvas = maskCanvasRef.value
  const point = maskCanvasPoint(event)
  if (!canvas || !point) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.lineWidth = brushSize.value
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(0, 255, 150, 0.92)'
  ctx.lineTo(point.x, point.y)
  ctx.stroke()
  hasMaskStroke.value = true
}

function startMaskStroke(event: PointerEvent) {
  if (!maskToolEnabled.value) return
  const canvas = maskCanvasRef.value
  const point = maskCanvasPoint(event)
  if (!canvas || !point) return
  canvas.setPointerCapture?.(event.pointerId)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.beginPath()
  ctx.moveTo(point.x, point.y)
  isDrawingMask.value = true
  drawMaskPoint(event)
}

function moveMaskStroke(event: PointerEvent) {
  if (!isDrawingMask.value) return
  drawMaskPoint(event)
}

function endMaskStroke(event: PointerEvent) {
  if (!isDrawingMask.value) return
  maskCanvasRef.value?.releasePointerCapture?.(event.pointerId)
  isDrawingMask.value = false
  const canvas = maskCanvasRef.value
  if (canvas) maskPreviewUrl.value = canvas.toDataURL('image/png')
}

function clearMask() {
  const canvas = maskCanvasRef.value
  const ctx = canvas?.getContext('2d')
  if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  hasMaskStroke.value = false
  brushMaskKey.value = ''
  maskPreviewUrl.value = null
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create mask PNG')), 'image/png')
  })
}

async function uploadMask(): Promise<string | null> {
  const item = selectedItem.value
  const canvas = maskCanvasRef.value
  if (!item?.assetId || !canvas || !hasMaskStroke.value) return brushMaskKey.value || null
  uploadingMask.value = true
  try {
    const blob = await canvasToBlob(canvas)
    const form = new FormData()
    form.append('projectId', props.projectId)
    form.append('file', blob, 'brush-mask.png')
    const res = await $fetch<{ maskKey: string; url: string; size: number }>(`/api/agency/video/assets/${item.assetId}/masks`, {
      method: 'POST',
      body: form,
    })
    brushMaskKey.value = res.maskKey
    toast.add({ title: 'Mask saved', color: 'success' })
    return res.maskKey
  } catch (e: any) {
    toast.add({ title: 'Could not save mask', description: e?.data?.statusMessage ?? e?.message ?? '', color: 'error' })
    return null
  } finally {
    uploadingMask.value = false
  }
}

async function loadHarness() {
  if (!props.projectId) return
  loading.value = true
  const previousSelectedItemId = selectedItemId.value
  try {
    const [bucketRes, modelRes, jobsRes] = await Promise.all([
      $fetch<{ buckets: Bucket[]; items: BucketItem[] }>(`/api/agency/video/projects/${props.projectId}/buckets`),
      $fetch<{ actions: HarnessAction[]; models: HarnessModel[] }>('/api/agency/video/asset-intelligence/models'),
      $fetch<{ jobs: IntelligenceJob[] }>(`/api/agency/video/projects/${props.projectId}/intelligence-jobs`, { query: { limit: 30 } }),
    ])
    buckets.value = bucketRes.buckets
    items.value = bucketRes.items
    actions.value = modelRes.actions
    models.value = modelRes.models
    intelligenceJobs.value = jobsRes.jobs
    if (!selectedItemId.value || !items.value.some(item => item.id === selectedItemId.value)) {
      selectedItemId.value = items.value[0]?.id ?? null
    }
    if (selectedItemId.value === previousSelectedItemId) await loadSelectedDerivatives()
  } catch (e: any) {
    toast.add({ title: 'Could not load AI Producer', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function loadJobs() {
  if (!props.projectId) return
  try {
    const res = await $fetch<{ jobs: IntelligenceJob[] }>(`/api/agency/video/projects/${props.projectId}/intelligence-jobs`, { query: { limit: 30 } })
    intelligenceJobs.value = res.jobs
  } catch {
    intelligenceJobs.value = []
  }
}

async function loadSelectedDerivatives() {
  const assetId = selectedItem.value?.assetId
  if (!assetId) {
    selectedDerivatives.value = []
    loadingDerivatives.value = false
    return
  }
  loadingDerivatives.value = true
  try {
    const res = await $fetch<{ derivatives: AssetDerivative[] }>(`/api/agency/video/assets/${encodeURIComponent(assetId)}/derivatives`)
    if (selectedItem.value?.assetId === assetId) selectedDerivatives.value = res.derivatives
  } catch {
    if (selectedItem.value?.assetId === assetId) selectedDerivatives.value = []
  } finally {
    if (selectedItem.value?.assetId === assetId) loadingDerivatives.value = false
  }
}

async function refreshActivity() {
  await Promise.all([loadJobs(), loadSelectedDerivatives()])
}

function clearActivityRefreshTimer() {
  if (!activityRefreshTimer) return
  clearTimeout(activityRefreshTimer)
  activityRefreshTimer = null
}

function scheduleActivityRefresh() {
  clearActivityRefreshTimer()
  if (!activeJobCount.value) return
  activityRefreshTimer = setTimeout(async () => {
    await refreshActivity()
    scheduleActivityRefresh()
  }, 3000)
}

async function saveDirective(item: BucketItem) {
  try {
    const directive = {
      ...(item.directive ?? {}),
      action: selectedAction.value,
      prompt: toolPrompt.value,
      brushMaskKey: brushMaskKey.value || null,
    }
    const res = await $fetch<{ item: BucketItem }>(`/api/agency/video/bucket-items/${item.id}/directive`, {
      method: 'POST',
      body: { role: item.role ?? 'editor-selected', directive },
    })
    const index = items.value.findIndex(candidate => candidate.id === item.id)
    if (index >= 0) items.value[index] = res.item
    toast.add({ title: 'Directive saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not save directive', description: e?.data?.statusMessage ?? '', color: 'error' })
  }
}

async function runExtraction() {
  const item = selectedItem.value
  if (!item?.assetId) {
    toast.add({ title: 'Select a library asset first', description: 'Generated/library assets can be lifted, erased, or masked.', color: 'warning' })
    return
  }
  runningExtraction.value = true
  try {
    const uploadedMaskKey = maskToolEnabled.value && hasMaskStroke.value ? await uploadMask() : (brushMaskKey.value || null)
    if (maskToolEnabled.value && hasMaskStroke.value && !uploadedMaskKey) return
    const res = await $fetch<{ job: { id: string; status: string; errorMessage?: string | null } }>(`/api/agency/video/assets/${item.assetId}/extract`, {
      method: 'POST',
      body: {
        projectId: props.projectId,
        bucketItemId: item.id,
        action: selectedAction.value,
        prompt: toolPrompt.value,
        brushMaskKey: uploadedMaskKey,
      },
    })
    await saveDirective(item)
    await refreshActivity()
    toast.add({
      title: res.job.status === 'blocked' ? 'Extraction tool queued as blocked' : 'Extraction queued',
      description: res.job.status === 'blocked' ? 'Configure the selected provider route to execute this model.' : undefined,
      color: res.job.status === 'blocked' ? 'warning' : 'success',
    })
  } catch (e: any) {
    toast.add({ title: 'Could not start extraction', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally {
    runningExtraction.value = false
  }
}

async function assemblePlan() {
  assembling.value = true
  try {
    const res = await $fetch<{ plan: any }>(`/api/agency/video/projects/${props.projectId}/assemble`, {
      method: 'POST',
      body: { brief: brief.value, targetFormat: targetFormat.value },
    })
    assemblyPlan.value = res.plan
    toast.add({ title: 'Draft plan prepared', description: `${res.plan.steps?.length ?? 0} timeline steps ready for review.`, color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not assemble plan', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally {
    assembling.value = false
  }
}

function addDerivativeToTimeline(derivative: AssetDerivative) {
  emit('add-derivative-to-timeline', derivativeTimelinePayload(derivative))
}

async function addDerivativeToBucket(derivative: AssetDerivative) {
  addingDerivativeId.value = derivative.id
  try {
    await $fetch(`/api/agency/video/derivatives/${encodeURIComponent(derivative.id)}/add-to-bucket`, {
      method: 'POST',
      body: {
        bucketKind: 'generated',
        role: `derivative-${derivative.kind}`,
        title: `${derivative.kind} derivative`,
        directive: { addedFrom: 'harness' },
      },
    })
    await loadHarness()
    toast.add({ title: 'Derivative added to bucket', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not add derivative to bucket', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally {
    addingDerivativeId.value = null
  }
}

function applyAssemblyPlan() {
  const payloads = assemblyPlanToTimelinePayloads(assemblyPlan.value)
  if (!payloads.length) {
    toast.add({ title: 'No timeline-ready assets', color: 'warning' })
    return
  }
  for (const payload of payloads) emit('add-to-timeline', payload)
  toast.add({ title: 'Plan added to timeline', description: `${payloads.length} clips inserted.`, color: 'success' })
}

function jobStatusColor(status: IntelligenceJob['status']) {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'blocked') return 'error'
  if (status === 'running') return 'primary'
  return 'neutral'
}

function jobAssetLabel(job: IntelligenceJob) {
  const item = items.value.find(candidate => candidate.id === job.bucketItemId || candidate.assetId === job.sourceAssetId)
  return item?.title || item?.r2Key || job.sourceAssetId || 'Project asset'
}

function fmtJobDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}

function derivativeLabel(derivative: AssetDerivative) {
  const title = derivative.metadata?.title
  return typeof title === 'string' && title.trim() ? title.trim() : derivative.r2Key
}

watch(() => props.projectId, () => { void loadHarness() })
watch(activeJobCount, () => {
  scheduleActivityRefresh()
})
watch(selectedItemId, () => {
  clearMask()
  maskPreviewFailed.value = false
  void loadSelectedDerivatives()
})
onMounted(() => { void loadHarness() })
onBeforeUnmount(() => {
  clearActivityRefreshTimer()
})
</script>

<template>
  <section :class="embedded ? 'space-y-3' : 'rounded-lg border border-default bg-elevated'">
    <div
      v-if="embedded"
      class="flex flex-wrap items-start justify-between gap-3"
    >
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold text-highlighted">AI Producer workspace</span>
          <UBadge :label="`${items.length} assets`" size="xs" variant="subtle" color="neutral" />
          <UBadge :label="`${readyModelCount}/${models.length} models ready`" size="xs" :color="readyModelCount ? 'primary' : 'neutral'" variant="subtle" />
          <UBadge v-if="activeJobCount" :label="`${activeJobCount} active`" size="xs" color="primary" variant="subtle" />
        </div>
        <p class="mt-0.5 text-xs text-muted">
          Prepare clean layers, reuse derivatives, and assemble draft edits from the project media library.
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        size="xs"
        variant="ghost"
        color="neutral"
        :loading="loading"
        aria-label="Refresh AI Producer"
        @click="loadHarness"
      />
    </div>

    <div v-else class="flex flex-wrap items-start justify-between gap-3 border-b border-default px-4 py-3">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-start gap-2 text-left"
        :aria-expanded="harnessOpen"
        @click="harnessOpen = !harnessOpen"
      >
        <UIcon
          name="i-lucide-chevron-right"
          class="mt-0.5 size-4 shrink-0 text-muted transition-transform"
          :class="harnessOpen && 'rotate-90'"
        />
        <span class="min-w-0">
          <span class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold text-highlighted">AI Producer workspace</span>
            <UBadge :label="`${items.length} assets`" size="xs" variant="subtle" color="neutral" />
            <UBadge :label="`${readyModelCount}/${models.length} models ready`" size="xs" :color="readyModelCount ? 'primary' : 'neutral'" variant="subtle" />
            <UBadge v-if="activeJobCount" :label="`${activeJobCount} active`" size="xs" color="primary" variant="subtle" />
          </span>
          <span class="block text-xs text-muted">Prepare clean layers, reuse derivatives, and assemble draft edits from the project media library.</span>
        </span>
      </button>
      <div class="flex items-center gap-1">
        <UButton
          v-if="harnessOpen"
          icon="i-lucide-refresh-cw"
          size="xs"
          variant="ghost"
          color="neutral"
          :loading="loading"
          aria-label="Refresh AI Producer"
          @click="loadHarness"
        />
        <UButton
          :icon="harnessOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          size="xs"
          variant="ghost"
          color="neutral"
          :aria-label="harnessOpen ? 'Collapse AI Producer' : 'Expand AI Producer'"
          @click="harnessOpen = !harnessOpen"
        />
      </div>
    </div>

    <!-- Quick-create bar (collapsed state): one-line entry into agentic assembly -->
    <div
      v-if="!contentOpen"
      class="m-3 flex items-center gap-2 rounded-lg border border-default bg-default/40 py-1 pl-3 pr-1.5 transition-colors focus-within:border-primary/50"
    >
      <UIcon name="i-lucide-sparkles" class="size-4 shrink-0 text-muted" />
      <UInput
        v-model="quickBrief"
        variant="none"
        placeholder="What do you want to create?"
        class="flex-1"
        @keydown.enter="submitQuickBrief"
      />
      <UButton
        icon="i-lucide-arrow-up"
        size="xs"
        color="primary"
        :loading="assembling"
        :disabled="!quickBrief.trim()"
        aria-label="Build draft plan from this brief"
        @click="submitQuickBrief"
      />
    </div>

    <div
      v-show="contentOpen"
      :class="contentGridClass"
    >
      <div class="min-w-0 rounded-md border border-default bg-default/30 p-3">
        <div class="mb-2 flex items-center justify-between gap-2">
          <div>
            <p class="text-xs font-medium uppercase text-muted">Project assets</p>
            <p class="text-[11px] text-muted">Bucketed media available to this edit</p>
          </div>
          <UBadge :label="`${items.length}`" size="xs" variant="subtle" color="neutral" />
        </div>
        <div class="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          <div v-if="!items.length" class="rounded-md border border-dashed border-default px-3 py-4 text-center text-xs text-muted">
            No assets bucketed yet — generate a video or save a derivative to get started.
          </div>
          <div v-for="bucket in visibleBuckets" :key="bucket.id" class="space-y-1">
            <div class="flex items-center gap-2 text-xs text-muted">
              <UIcon name="i-lucide-folder" class="size-3.5" />
              <span>{{ bucket.name }}</span>
              <span class="ml-auto tabular-nums">{{ (itemsByBucket[bucket.id] || []).length }}</span>
            </div>
            <button
              v-for="item in (itemsByBucket[bucket.id] || [])"
              :key="item.id"
              type="button"
              class="w-full rounded-md border px-2 py-1.5 text-left text-xs transition"
              :class="selectedItemId === item.id ? 'border-primary bg-primary/10 text-highlighted' : 'border-default bg-elevated text-default hover:bg-muted'"
              @click="selectedItemId = item.id"
            >
              <span class="block truncate font-medium">{{ item.title || item.r2Key || 'Untitled asset' }}</span>
              <span class="mt-0.5 flex items-center gap-1 text-muted">
                <UBadge v-if="item.role" :label="item.role" size="xs" variant="subtle" color="neutral" />
                <span v-if="item.assetId">library asset</span>
              </span>
            </button>
          </div>
          <p v-if="items.length && emptyBucketCount" class="text-[11px] text-muted">
            {{ emptyBucketCount }} empty {{ emptyBucketCount === 1 ? 'bucket' : 'buckets' }} hidden
          </p>
        </div>
      </div>

      <div class="min-w-0 rounded-md border border-default bg-default/30 p-3">
        <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase text-muted">Prepare asset</p>
            <p class="truncate text-sm font-medium text-highlighted">{{ selectedItemTitle }}</p>
          </div>
          <UButton
            icon="i-lucide-highlighter"
            size="xs"
            color="primary"
            variant="soft"
            label="Run"
            :loading="runningExtraction"
            :disabled="!selectedItem?.assetId"
            @click="runExtraction"
          />
        </div>
        <div class="space-y-3">
          <div class="grid gap-2 lg:grid-cols-[220px_minmax(0,1fr)]">
            <UFormField label="Tool">
              <USelect v-model="selectedAction" :items="actionOptions" value-key="value" />
            </UFormField>
            <UFormField label="Instruction">
              <UTextarea v-model="toolPrompt" :rows="2" autoresize placeholder="Describe what to lift, erase, or preserve..." />
            </UFormField>
          </div>
          <div v-if="maskToolEnabled" class="rounded-md border border-default bg-elevated p-2">
            <div class="mb-2 flex items-center justify-between gap-2">
              <p class="text-xs font-medium text-muted">Highlighter mask</p>
              <div class="flex items-center gap-1">
                <UButton icon="i-lucide-eraser" size="xs" variant="ghost" color="neutral" aria-label="Clear mask" :disabled="!hasMaskStroke && !brushMaskKey" @click="clearMask" />
                <UButton icon="i-lucide-upload-cloud" size="xs" variant="ghost" color="neutral" aria-label="Save mask" :loading="uploadingMask" :disabled="!hasMaskStroke || !selectedItem?.assetId" @click="uploadMask" />
              </div>
            </div>
            <div class="relative mx-auto aspect-[9/16] min-h-[360px] max-h-[520px] overflow-hidden rounded-md border border-default bg-black">
              <img
                v-if="selectedAssetThumbnailUrl"
                :src="selectedAssetThumbnailUrl"
                alt=""
                class="absolute inset-0 size-full object-cover opacity-80"
                @error="maskPreviewFailed = true"
              >
              <p
                v-if="!selectedAssetThumbnailUrl && !hasMaskStroke"
                class="absolute inset-0 flex items-center justify-center px-4 text-center text-[11px] text-white/50"
              >
                No preview for this asset — draw over the frame to mark the area
              </p>
              <canvas
                ref="maskCanvasRef"
                width="540"
                height="960"
                class="absolute inset-0 size-full touch-none cursor-crosshair"
                @pointerdown="startMaskStroke"
                @pointermove="moveMaskStroke"
                @pointerup="endMaskStroke"
                @pointercancel="endMaskStroke"
                @pointerleave="endMaskStroke"
              />
            </div>
            <div class="mt-2 flex items-center gap-2">
              <UIcon name="i-lucide-highlighter" class="size-4 text-muted" />
              <USlider v-model="brushSize" :min="8" :max="72" :step="2" class="flex-1" />
              <span class="w-8 text-right text-xs tabular-nums text-muted">{{ brushSize }}</span>
            </div>
            <p v-if="brushMaskKey" class="mt-2 truncate text-[11px] text-muted">{{ brushMaskKey }}</p>
            <img v-if="maskPreviewUrl" :src="maskPreviewUrl" alt="" class="mt-2 h-10 rounded border border-default bg-black object-contain">
          </div>
          <UFormField v-else label="Brush mask key">
            <UInput v-model="brushMaskKey" placeholder="Optional R2 mask key" />
          </UFormField>
          <div class="rounded-md border border-default bg-elevated p-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-medium text-muted">Available models</p>
              <UBadge :label="`${selectedActionModels.length}`" size="xs" variant="subtle" color="neutral" />
            </div>
            <div class="mt-1 flex flex-wrap gap-1">
              <UBadge
                v-for="model in selectedActionModels"
                :key="model.id"
                :label="model.displayName"
                size="xs"
                :color="model.defaultEnabled ? 'primary' : 'neutral'"
                variant="subtle"
              />
            </div>
            <p v-if="!selectedActionModels.length" class="mt-1 text-[11px] text-muted">
              No gateway model is mapped to this action yet.
            </p>
          </div>
          <div v-if="selectedAssetActivityVisible" class="rounded-md border border-default bg-elevated p-2">
            <p class="text-xs font-medium text-muted">Selected asset activity</p>
            <p v-if="selectedDirectivePrompt" class="mt-1 line-clamp-2 text-xs text-default">{{ selectedDirectivePrompt }}</p>
            <div v-if="selectedItemJobs.length" class="mt-2 space-y-1">
              <div v-for="job in selectedItemJobs" :key="job.id" class="flex items-center gap-2 text-xs">
                <UBadge :label="job.status" size="xs" :color="jobStatusColor(job.status)" variant="subtle" />
                <span class="min-w-0 flex-1 truncate text-muted">{{ job.action }} · {{ job.modelId }}</span>
              </div>
            </div>
            <div v-if="loadingDerivatives" class="mt-2 space-y-1">
              <USkeleton v-for="n in 2" :key="n" class="h-7 w-full rounded-md" />
            </div>
            <div v-else-if="selectedDerivatives.length" class="mt-2 space-y-1">
              <div
                v-for="derivative in selectedDerivatives"
                :key="derivative.id"
                class="flex items-center gap-2 rounded-md border border-default bg-default/40 px-2 py-1"
              >
                <UBadge :label="derivative.kind" size="xs" variant="subtle" color="neutral" />
                <span class="min-w-0 flex-1 truncate text-xs text-muted">{{ derivativeLabel(derivative) }}</span>
                <UTooltip text="Add derivative to timeline">
                  <UButton
                    icon="i-lucide-list-plus"
                    size="xs"
                    variant="ghost"
                    color="primary"
                    aria-label="Add derivative to timeline"
                    @click="addDerivativeToTimeline(derivative)"
                  />
                </UTooltip>
                <UTooltip text="Reuse derivative in generated bucket">
                  <UButton
                    icon="i-lucide-folder-plus"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :loading="addingDerivativeId === derivative.id"
                    aria-label="Reuse derivative in generated bucket"
                    @click="addDerivativeToBucket(derivative)"
                  />
                </UTooltip>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!embedded" class="min-w-0 rounded-md border border-default bg-default/30 p-3">
        <div class="mb-2 flex items-center justify-between gap-2">
          <div>
            <p class="text-xs font-medium uppercase text-muted">Draft assembly</p>
            <p class="text-[11px] text-muted">Plan a timeline from prepared assets</p>
          </div>
          <UBadge v-if="completedJobCount" :label="`${completedJobCount} ready`" size="xs" color="primary" variant="subtle" />
        </div>
        <div class="space-y-3">
          <!-- Brief-first composer: the brief is the primary object; format and the
               build action live in a control bar along the bottom. -->
          <div class="rounded-lg border border-default bg-elevated/60 transition-colors focus-within:border-primary/50">
            <UTextarea v-model="brief" :rows="4" autoresize variant="none" placeholder="Tell the AI Producer what to make…" class="w-full" />
            <div class="flex flex-wrap items-center gap-1.5 border-t border-default px-2 py-2">
              <USelect
                v-model="targetFormat"
                :items="[
                  { label: 'Reels / TikTok 9:16', value: 'reels_9x16' },
                  { label: 'YouTube 16:9', value: 'youtube_16x9' },
                  { label: 'Square 1:1', value: 'square_1x1' },
                ]"
                value-key="value"
                size="xs"
                variant="soft"
                color="neutral"
                icon="i-lucide-proportions"
                aria-label="Output format"
              />
              <UButton icon="i-lucide-wand-sparkles" size="xs" color="primary" label="Build draft plan" :loading="assembling" class="ml-auto" @click="assemblePlan" />
            </div>
          </div>
          <div v-if="assemblyPlan" class="rounded-md border border-default bg-elevated p-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-medium text-highlighted">{{ assemblyPlan.steps?.length ?? 0 }} proposed timeline steps</p>
              <UButton icon="i-lucide-list-plus" size="xs" variant="soft" color="primary" label="Apply" @click="applyAssemblyPlan" />
            </div>
            <p v-if="assemblyPlan.rationale" class="mt-1 text-xs leading-snug text-default">
              {{ assemblyPlan.rationale }}
            </p>
            <ol class="mt-1 max-h-24 space-y-1 overflow-y-auto text-xs text-muted">
              <li v-for="step in assemblyPlan.steps" :key="step.bucketItemId" class="truncate">
                {{ step.title || step.r2Key || step.assetId }} · {{ step.durationSec }}s
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>

    <div
      v-show="contentOpen"
      :class="[
        'rounded-md border border-default bg-default/30 p-3',
        embedded ? '' : 'mx-3 mb-3'
      ]"
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <p class="text-xs font-medium uppercase text-muted">AI activity</p>
        <UButton icon="i-lucide-refresh-cw" size="xs" variant="ghost" color="neutral" aria-label="Refresh AI activity" @click="refreshActivity" />
      </div>
      <div v-if="intelligenceJobs.length" class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="job in intelligenceJobs.slice(0, 6)" :key="job.id" class="rounded-md border border-default bg-elevated p-2">
          <div class="flex items-start gap-2">
            <UBadge :label="job.status" size="xs" :color="jobStatusColor(job.status)" variant="subtle" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium text-highlighted">{{ jobAssetLabel(job) }}</p>
              <p class="mt-0.5 truncate text-[11px] text-muted">{{ job.action }} · {{ job.modelId }}</p>
            </div>
            <span class="shrink-0 text-[11px] text-muted">{{ job.provider }}</span>
          </div>
          <p v-if="job.prompt" class="mt-2 line-clamp-2 text-xs text-default">{{ job.prompt }}</p>
          <p v-if="job.errorMessage" class="mt-1 line-clamp-2 text-[11px] text-error">{{ job.errorMessage }}</p>
          <p class="mt-2 text-[11px] text-muted">{{ fmtJobDate(job.createdAt) }}</p>
        </div>
      </div>
      <div v-else class="rounded-md border border-dashed border-default px-3 py-4 text-center text-xs text-muted">
        No AI activity yet.
      </div>
    </div>
  </section>
</template>
