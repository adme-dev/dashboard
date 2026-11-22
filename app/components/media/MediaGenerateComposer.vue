<script setup lang="ts">
// MediaGenerateComposer.vue — reusable inline AI video generation composer.
// The slideover picker wraps this component; Video Studio can also embed it in
// the workbench so generation is part of the editing surface.
import { ref, computed, watch } from 'vue'
import { validateGenerationForm, costPreviewCents, draftFromGenerationJob } from '~~/app/utils/videoGenerationForm'
import { availableWorkflows, modelsForWorkflow, videoGenerationWorkflow, workflowForMode, type VideoGenerationWorkflow } from '~~/app/utils/video/generationWorkflows'
import { videoModelPresentation } from '~~/app/utils/video/modelPresentation'
import { VIDEO_GENERATION_TEMPLATES, type VideoGenerationTemplate } from '~~/app/utils/video/generationTemplates'
import { videoGenerationJobTimelinePayload, type VideoLibraryTimelinePayload } from '~~/app/utils/video/videoLibraryTimeline'
import { apiErrorDescription, apiErrorReasons, isPossiblyAppliedFailure } from '~~/app/utils/apiError'
import { generationBudgetNotice, generationBudgetSummary, isGenerationBudgetStatus } from '~~/app/utils/video/generationBudget'
import { useVideoModelAccess } from '~~/app/composables/useVideoModelAccess'
import type { VideoGenerationMode } from '~~/server/utils/video-generation/types'
import type { VideoGenerationJobView } from '~~/app/composables/useVideoGenerationJobs'
import { idempotencyKey } from '~~/app/utils/idempotencyKey'
import MediaGeneratedThumbnail from '~~/app/components/media/MediaGeneratedThumbnail.vue'

const props = defineProps<{
  active?: boolean
  projectId: string
  /** stills already on the timeline that can be registered as i2v source assets */
  timelineStills: { clipId: string, label: string }[]
  /** default aspect from the project format, e.g. '9:16' */
  defaultAspect: string
  defaultDurationSeconds?: number
  initialPrompt?: string | null
  initialModelId?: string | null
  modelSelectionKey?: number
  initialSourceAsset?: { assetId: string, title: string } | null
  recentJobs?: VideoGenerationJobView[]
  prepareTimelineStillSource?: () => Promise<void>
}>()
const emit = defineEmits<{
  (e: 'submitted', jobId: string): void
  (e: 'add-to-timeline', payload: VideoLibraryTimelinePayload): void
  (e: 'close'): void
}>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: {
    method?: string
    body?: unknown
    query?: Record<string, unknown>
    headers?: Record<string, string>
  }
) => Promise<T>
const { data: modelData, models: allModels, pending: modelsPending, failed: modelsFailed, detail: modelAccessDetail, retry: retryModels } = useVideoModelAccess(
  computed(() => props.projectId), computed(() => props.active ?? true)
)
const hasModels = computed(() => allModels.value.length > 0)

// Workflow-first: staff pick what to make; the model list narrows to models that can do it.
const workflow = ref<VideoGenerationWorkflow>('animate-image')
const mode = computed<VideoGenerationMode>(() => videoGenerationWorkflow(workflow.value).mode)
const needsEndFrame = computed(() => videoGenerationWorkflow(workflow.value).frames === 2)
const models = computed(() => modelsForWorkflow(allModels.value, workflow.value))
const workflowItems = computed(() => availableWorkflows(allModels.value).map(w => ({ label: w.label, value: w.id, icon: w.icon })))
const workflowIcon = computed(() => videoGenerationWorkflow(workflow.value).icon)
const modelId = ref<string>('')
const model = computed(() => allModels.value.find(m => m.id === modelId.value) ?? null)
const prompt = ref('')
const sourceAssetId = ref<string | null>(null)
const sourceFileName = ref<string | null>(null)
const selectedStillId = ref<string | null>(null)
// End frame (Start & end frames workflow only).
const endSourceAssetId = ref<string | null>(null)
const endSourceFileName = ref<string | null>(null)
const endSelectedStillId = ref<string | null>(null)
type FrameSlot = 'start' | 'end'
const uploadTarget = ref<FrameSlot>('start')
const frameSlots = computed((): { slot: FrameSlot, label: string | null, hint: string }[] => needsEndFrame.value
  ? [{ slot: 'start', label: 'Start frame', hint: 'Where the clip begins' }, { slot: 'end', label: 'End frame', hint: 'Where the clip ends' }]
  : [{ slot: 'start', label: null, hint: 'Required for image → video' }])
const frameName = (slot: FrameSlot) => (slot === 'end' ? endSourceFileName.value : sourceFileName.value)
const frameStillId = (slot: FrameSlot) => (slot === 'end' ? endSelectedStillId.value : selectedStillId.value)
function setFrame(slot: FrameSlot, id: string | null, name: string | null) {
  if (slot === 'end') {
    endSourceAssetId.value = id
    endSourceFileName.value = name
  } else {
    sourceAssetId.value = id
    sourceFileName.value = name
  }
}
const subjectType = ref<'vehicle' | 'non_vehicle' | 'unknown'>('unknown')
const chosenDuration = ref<number | null>(null)
const chosenAspect = ref<string | null>(null)
const durationSeconds = computed({
  get() {
    const options = model.value?.durationsSeconds ?? []
    if (chosenDuration.value !== null && options.includes(chosenDuration.value)) return chosenDuration.value
    const target = props.defaultDurationSeconds
    if (!target || !Number.isFinite(target)) return options[0] ?? 5
    return options.reduce((best, next) => Math.abs(next - target) < Math.abs(best - target) ? next : best, options[0] ?? 5)
  },
  set(value: number) { chosenDuration.value = value }
})
const aspectRatio = computed({
  get() {
    const options = model.value?.aspectRatios ?? []
    if (chosenAspect.value && options.includes(chosenAspect.value)) return chosenAspect.value
    return options.includes(props.defaultAspect) ? props.defaultAspect : options[0] ?? ''
  },
  set(value: string) { chosenAspect.value = value }
})
const submitting = ref(false)
const uploading = ref(false)
const registeredInitialSource = ref<{ assetId: string, sourceId: string } | null>(null)

// Hidden file input ref — triggered programmatically via the upload button
const fileInputRef = ref<{ inputRef?: HTMLInputElement } | null>(null)

const SUBJECT_OPTIONS = [
  { label: 'Unknown', value: 'unknown' },
  { label: 'Vehicle', value: 'vehicle' },
  { label: 'Non-vehicle', value: 'non_vehicle' }
]

const validation = computed(() => validateGenerationForm({
  mode: mode.value,
  model: model.value,
  prompt: prompt.value,
  sourceAssetId: sourceAssetId.value,
  durationSeconds: durationSeconds.value,
  requireEndFrame: needsEndFrame.value,
  endSourceAssetId: endSourceAssetId.value
}))
const estCostCents = computed(() => (model.value ? costPreviewCents(model.value, durationSeconds.value) : 0))

// Rich composer-bar presentation: provider icon + capability sublabel + cost per row.
const modelItems = computed(() => models.value.map((m) => {
  const presentation = videoModelPresentation(m)
  return { label: m.label, value: m.id, ...presentation }
}))
const selectedModelIcon = computed(() => (model.value ? videoModelPresentation(model.value).icon : 'i-lucide-box'))
const estimateTitle = computed(() => (modelData.value.policy?.payer === 'agency' ? 'Agency-funded estimate' : 'Estimated cost'))
const estimateAmount = computed(() => `US$${(estCostCents.value / 100).toFixed(2)}`)
const budget = computed(() => (isGenerationBudgetStatus(modelData.value.budget) ? modelData.value.budget : null))
const budgetNotice = computed(() => (model.value ? generationBudgetNotice(budget.value, estCostCents.value) : null))
const estimateDetail = computed(() => {
  const billing = model.value?.costUnit === 'second' ? ', billed per second' : ''
  return `${durationSeconds.value}s clip${billing}${generationBudgetSummary(budget.value)}`
})
const recentJobs = computed(() => (props.recentJobs ?? []).slice(0, 5))

// Templates gallery shows while the prompt is empty (the blank-page moment);
// clearing the prompt brings it back. Applying one prefills mode + prompt +
// duration — everything stays editable before Generate.
const templatesVisible = computed(() => !prompt.value.trim())

function applyTemplate(template: VideoGenerationTemplate) {
  if (mode.value !== template.mode) {
    workflow.value = workflowForMode(template.mode)
    onModeChange()
  }
  prompt.value = template.prompt
  if (model.value?.durationsSeconds.includes(template.durationSeconds)) {
    durationSeconds.value = template.durationSeconds
  }
}

function applyJobDraft(job: VideoGenerationJobView) {
  const draft = draftFromGenerationJob(job, allModels.value)
  if (!draft) {
    toast.add({ title: 'Cannot reuse this generation', description: 'The model or mode is no longer available.', color: 'warning' })
    return
  }

  workflow.value = draft.endSourceAssetId ? 'start-end-frames' : workflowForMode(draft.mode)
  modelId.value = draft.modelId
  prompt.value = draft.prompt
  aspectRatio.value = job.aspectRatio
  durationSeconds.value = draft.durationSeconds
  subjectType.value = draft.subjectType
  selectedStillId.value = null

  if (draft.sourceAssetId) {
    sourceAssetId.value = draft.sourceAssetId
    sourceFileName.value = 'Previous source image'
  } else {
    clearSource()
  }
  if (draft.endSourceAssetId) setFrame('end', draft.endSourceAssetId, 'Previous end frame')
  else clearSource('end')
}

function jobModelLabel(job: VideoGenerationJobView): string {
  return allModels.value.find(candidate => candidate.id === job.modelId)?.label ?? job.modelId
}

function jobStatusColor(job: VideoGenerationJobView): 'primary' | 'success' | 'error' | 'warning' | 'neutral' {
  if (job.status === 'succeeded') return 'success'
  if (job.status === 'failed') return 'error'
  if (job.status === 'blocked' || job.status === 'unknown') return 'warning'
  if (job.status === 'running') return 'primary'
  return 'neutral'
}

function canReuseJob(job: VideoGenerationJobView): boolean {
  return job.status === 'succeeded' || job.status === 'failed' || job.status === 'blocked'
}

function canAddJobToTimeline(job: VideoGenerationJobView): boolean {
  return job.status === 'succeeded' && Boolean(job.outputAssetId && job.outputR2Key)
}

function addJobToTimeline(job: VideoGenerationJobView) {
  const payload = videoGenerationJobTimelinePayload(job)
  if (!payload) return
  emit('add-to-timeline', payload)
}

function onModeChange() {
  modelId.value = models.value[0]?.id ?? ''
  if (mode.value === 'text-to-video') clearSource()
  if (!needsEndFrame.value) clearSource('end')
}

// If the current workflow stops being available (models changed), fall back to one that is.
watch(workflowItems, (items) => {
  if (items.length && !items.some(item => item.value === workflow.value)) {
    workflow.value = items[0]!.value
    onModeChange()
  }
})

watch([() => props.initialModelId, allModels, () => props.modelSelectionKey], ([requested, available]) => {
  if (!requested) return
  const candidate = available.find(item => item.id === requested)
  if (!candidate) return
  if (!videoGenerationWorkflow(workflow.value).supports(candidate)) {
    workflow.value = workflowForMode(candidate.modes[0]!)
    onModeChange()
  }
  modelId.value = candidate.id
}, { immediate: true })

watch(models, (next) => {
  if (!next.length) return
  if (!next.some(candidate => candidate.id === modelId.value)) {
    modelId.value = next[0]?.id ?? ''
  }
}, { immediate: true })

watch(() => props.active ?? true, (isActive) => {
  if (!isActive) return
  if (props.initialPrompt) prompt.value = props.initialPrompt
  void applyInitialSourceAsset()
}, { immediate: true })

watch(() => props.initialSourceAsset?.assetId ?? null, () => {
  registeredInitialSource.value = null
  if (props.active ?? true) void applyInitialSourceAsset()
})

function clearSource(slot: FrameSlot = 'start') {
  setFrame(slot, null, null)
  if (slot === 'end') endSelectedStillId.value = null
  else selectedStillId.value = null
}

async function applyInitialSourceAsset() {
  const source = props.initialSourceAsset
  if (!source) return
  if (workflow.value === 'text-to-video') workflow.value = 'animate-image'
  onModeChange()
  selectedStillId.value = null

  if (registeredInitialSource.value?.assetId === source.assetId) {
    sourceAssetId.value = registeredInitialSource.value.sourceId
    sourceFileName.value = source.title
    return
  }

  uploading.value = true
  sourceAssetId.value = null
  sourceFileName.value = `Preparing ${source.title}`
  try {
    const res = await apiFetch<{ id: string }>('/api/agency/video/generation/source-assets/from-asset', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('source-asset-from-asset') },
      body: { assetId: source.assetId, subjectType: subjectType.value }
    })
    registeredInitialSource.value = { assetId: source.assetId, sourceId: res.id }
    sourceAssetId.value = res.id
    sourceFileName.value = source.title
  } catch (e: unknown) {
    toast.add({ title: 'Could not use selected asset', description: apiErrorDescription(e), color: 'error' })
    clearSource()
  } finally {
    uploading.value = false
  }
}

function triggerFileInput(slot: FrameSlot = 'start') {
  uploadTarget.value = slot
  fileInputRef.value?.inputRef?.click()
}

// Register a still already in this project timeline as the i2v source — reuses
// media the user already uploaded instead of requiring another image upload.
async function onExistingStillSelected(clipId: string | null, slot: FrameSlot = 'start') {
  if (!clipId) return
  if (slot === 'end') endSelectedStillId.value = clipId
  else selectedStillId.value = clipId
  uploadTarget.value = slot
  uploading.value = true
  try {
    await props.prepareTimelineStillSource?.()
    const res = await apiFetch<{ id: string }>('/api/agency/video/generation/source-assets/from-timeline-still', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('source-asset-from-still') },
      body: { projectId: props.projectId, clipId, subjectType: subjectType.value }
    })
    setFrame(slot, res.id, props.timelineStills.find(s => s.clipId === clipId)?.label ?? 'Project still')
  } catch (e: unknown) {
    toast.add({ title: 'Could not use still', description: apiErrorDescription(e), color: 'error' })
    clearSource(slot)
  } finally {
    uploading.value = false
  }
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const slot = uploadTarget.value
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('projectId', props.projectId)
    formData.append('subjectType', subjectType.value)

    const res = await apiFetch<{ id: string }>('/api/agency/video/generation/source-assets', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('source-asset-upload') },
      body: formData
    })

    setFrame(slot, res.id, file.name)
  } catch (e: unknown) {
    toast.add({ title: 'Upload failed', description: apiErrorDescription(e), color: 'error' })
    // Reset so the user can retry
    setFrame(slot, null, null)
  } finally {
    uploading.value = false
    // Reset the input so the same file can be re-selected if needed
    input.value = ''
  }
}

const readinessReason = computed(() => {
  if (uploading.value) return 'Preparing your source image…'
  if (!validation.value.valid) return validation.value.errors.join(' ')
  if (!aspectRatio.value) return 'Select a model with a supported aspect ratio.'
  return ''
})

async function submit() {
  if (submitting.value || readinessReason.value || budgetNotice.value || !model.value) return
  submitting.value = true
  // One key for both the body (tenant-level dedupe) and the header (God mode ledger).
  const idempotencyKey = `video-gen:${crypto.randomUUID()}`
  try {
    const res = await apiFetch<{ job: { id: string } }>(`/api/agency/video/generation/jobs`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        projectId: props.projectId,
        mode: mode.value,
        modelId: model.value.id,
        prompt: prompt.value,
        // Start frame first, then the end frame (the server maps the second id to end_image).
        sourceAssetIds: [sourceAssetId.value, needsEndFrame.value ? endSourceAssetId.value : null].filter((id): id is string => Boolean(id)),
        durationSeconds: durationSeconds.value,
        aspectRatio: aspectRatio.value,
        subjectType: subjectType.value,
        idempotencyKey
      }
    })
    toast.add({ title: 'Generation queued', description: 'Your clip will appear in the Library when ready.', color: 'success' })
    emit('submitted', res.job.id)
    emit('close')
  } catch (e: unknown) {
    if (isPossiblyAppliedFailure(e)) {
      // The job may already be queued (and billed). Don't invite a duplicate.
      toast.add({
        title: 'Generation may already be queued',
        description: `${apiErrorDescription(e, 'No response from the server')}. Check Recent generations before submitting again — a second request would start (and charge for) another job.`,
        color: 'warning',
        icon: 'i-lucide-clock-alert'
      })
      emit('submitted', '')
      return
    }
    const refusedBudget = (e as { data?: { data?: { budget?: unknown } } })?.data?.data?.budget
    if (isGenerationBudgetStatus(refusedBudget)) {
      modelData.value = { ...modelData.value, budget: refusedBudget }
      const notice = generationBudgetNotice(refusedBudget, estCostCents.value)
      toast.add({ title: notice?.title ?? 'Video generation budget unavailable', description: notice?.description ?? apiErrorDescription(e), color: 'warning', icon: 'i-lucide-wallet' })
      return
    }
    const reasons = apiErrorReasons(e)
    toast.add({ title: 'Could not start generation', description: reasons?.join(' ') ?? apiErrorDescription(e), color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="@container flex flex-col gap-4 py-1">
    <UAlert
      v-if="!modelsPending && !hasModels"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="AI video generation is unavailable"
      :description="modelAccessDetail"
      :actions="modelsFailed ? [{ label: 'Retry', onClick: retryModels }] : []"
    />

    <!-- Loading skeleton while the model list fetches -->
    <div v-if="modelsPending && !hasModels" class="space-y-3">
      <USkeleton class="h-10 w-full rounded-md" />
      <USkeleton class="h-24 w-full rounded-md" />
    </div>

    <!-- Workflow-first, top to bottom: what to make → model → prompt/frames →
         clip settings → estimate + Generate. Generate sits in normal flow after
         every input, so it can never cover the selectors above it. -->
    <template v-if="hasModels">
      <div class="grid grid-cols-1 gap-3 @md:grid-cols-2">
        <UFormField label="What to make">
          <USelect
            v-model="workflow"
            :items="workflowItems"
            value-key="value"
            size="sm"
            :icon="workflowIcon"
            aria-label="What to make"
            class="w-full"
            @update:model-value="onModeChange"
          />
        </UFormField>
        <UFormField label="Model">
          <USelectMenu
            v-model="modelId"
            :items="modelItems"
            value-key="value"
            size="sm"
            :icon="selectedModelIcon"
            :search-input="false"
            class="w-full"
            aria-label="Model"
          >
            <template #item="{ item }">
              <div class="flex min-w-0 flex-1 items-center gap-2.5 py-0.5">
                <UIcon :name="item.icon" class="size-4 shrink-0 text-muted" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-medium text-highlighted">
                    {{ item.label }}
                  </p>
                  <p class="truncate text-[11px] text-muted">
                    {{ item.sublabel }}
                  </p>
                </div>
                <span class="shrink-0 text-[11px] tabular-nums text-muted">{{ item.costLabel }}</span>
              </div>
            </template>
          </USelectMenu>
        </UFormField>
      </div>

      <div class="rounded-xl border border-default bg-elevated/60 transition-colors focus-within:border-primary/50">
        <UFormField label="Prompt" class="px-3 pt-2">
          <UTextarea
            v-model="prompt"
            :rows="3"
            :maxlength="4000"
            autoresize
            variant="none"
            placeholder="Describe the motion, atmosphere, or scene you want…"
            class="w-full"
          />
        </UFormField>

        <!-- i2v source image attachment -->
        <div v-if="mode === 'image-to-video'" class="border-t border-default px-3 py-2.5">
          <!-- Hidden file input — triggered by the upload button below -->
          <UInput
            ref="fileInputRef"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            @change="onFileSelected"
          />
          <div class="space-y-1.5">
            <div v-for="frame in frameSlots" :key="frame.slot" class="flex min-w-0 flex-wrap items-center gap-2">
              <span v-if="frame.label" class="w-20 shrink-0 text-[11px] font-medium text-muted">{{ frame.label }}</span>
              <div v-if="frameName(frame.slot)" class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-default bg-default/40 px-2.5 py-1.5">
                <UIcon name="i-lucide-image" class="size-4 shrink-0 text-muted" />
                <span class="truncate text-xs text-default">{{ frameName(frame.slot) }}</span>
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :aria-label="`Clear ${frame.label?.toLowerCase() ?? 'source image'}`"
                  :disabled="uploading"
                  class="ml-auto shrink-0"
                  @click="clearSource(frame.slot)"
                />
              </div>
              <div v-else class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <USelectMenu
                  v-if="timelineStills.length"
                  :model-value="frameStillId(frame.slot) ?? undefined"
                  :items="timelineStills.map((s) => ({ label: s.label, value: s.clipId }))"
                  value-key="value"
                  size="xs"
                  placeholder="Use a project still"
                  :aria-label="frame.label ? `${frame.label} from project` : 'Source image from project'"
                  :disabled="uploading"
                  class="min-w-0 max-w-full"
                  @update:model-value="(clipId: string) => onExistingStillSelected(clipId, frame.slot)"
                />
                <UButton
                  size="xs"
                  variant="outline"
                  color="neutral"
                  icon="i-lucide-image-plus"
                  :label="timelineStills.length ? 'Upload still' : (frame.label ? `Add ${frame.label.toLowerCase()}` : 'Add source image')"
                  :loading="uploading && uploadTarget === frame.slot"
                  :disabled="uploading"
                  @click="triggerFileInput(frame.slot)"
                />
                <span class="text-[11px] text-muted">{{ frame.hint }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 @min-[15rem]:grid-cols-2 @lg:grid-cols-3">
        <UFormField label="Aspect ratio">
          <USelect
            v-model="aspectRatio"
            :items="(model?.aspectRatios ?? []).map(value => ({ label: value, value }))"
            value-key="value"
            aria-label="Aspect ratio"
            class="w-full"
            size="sm"
          />
        </UFormField>
        <UFormField label="Clip duration">
          <USelect
            v-model="durationSeconds"
            aria-label="Clip duration"
            :items="(model?.durationsSeconds ?? []).map(value => ({ label: `${value}s`, value }))"
            value-key="value"
            class="w-full"
            size="sm"
          />
        </UFormField>
        <UFormField label="Subject" help="Routes compliance checks." class="@min-[15rem]:col-span-2 @lg:col-span-1">
          <USelect
            v-model="subjectType"
            :items="SUBJECT_OPTIONS"
            value-key="value"
            aria-label="Subject"
            class="w-full"
            size="sm"
          />
        </UFormField>
      </div>

      <!-- Budget: explains unconfirmed historical liability instead of a bare refusal -->
      <UAlert
        v-if="budgetNotice"
        color="warning"
        variant="subtle"
        icon="i-lucide-wallet"
        :title="budgetNotice.title"
        :description="budgetNotice.description"
      />

      <!-- Estimate + Generate sit in normal flow (not sticky) so they can never
           cover the workflow selector or inputs inside a scrolling rail. -->
      <div data-generation-submit class="space-y-2 rounded-lg border border-default bg-default/40 p-3">
        <div data-generation-estimate class="flex items-baseline justify-between gap-3">
          <span class="text-xs font-medium text-muted">{{ estimateTitle }}</span>
          <span class="text-lg font-semibold tabular-nums text-highlighted">{{ estimateAmount }}</span>
        </div>
        <p class="text-[11px] leading-snug text-muted">
          {{ estimateDetail }}
        </p>
        <UButton
          block
          :color="readinessReason || budgetNotice ? 'neutral' : 'primary'"
          :variant="readinessReason || budgetNotice ? 'soft' : 'solid'"
          icon="i-lucide-sparkles"
          :loading="submitting"
          :disabled="Boolean(readinessReason || budgetNotice || submitting)"
          label="Generate"
          @click="submit"
        />
        <p v-if="readinessReason" role="status" class="text-xs text-muted">
          {{ readinessReason }}
        </p>
      </div>

      <!-- Start from a template — visible while the prompt is blank -->
      <div v-if="templatesVisible" class="space-y-2">
        <p class="text-xs font-medium text-muted">
          Start from a template
        </p>
        <div class="grid grid-cols-1 gap-2 @xs:grid-cols-2">
          <UButton
            v-for="template in VIDEO_GENERATION_TEMPLATES"
            :key="template.id"
            color="neutral"
            variant="outline"
            type="button"
            class="group flex whitespace-normal items-start gap-2.5 rounded-lg border border-default bg-elevated/60 p-2.5 text-left transition hover:border-primary/50 hover:bg-primary/5"
            @click="applyTemplate(template)"
          >
            <UIcon :name="template.icon" class="mt-0.5 size-4 shrink-0 text-muted transition-colors group-hover:text-primary" />
            <span class="min-w-0">
              <span class="block truncate text-xs font-medium text-highlighted">{{ template.title }}</span>
              <span class="mt-0.5 block text-[11px] leading-snug text-muted">{{ template.tagline }}</span>
            </span>
          </UButton>
        </div>
        <p class="text-[11px] text-muted">
          Templates prefill the prompt — edit anything before generating.
        </p>
      </div>
    </template>

    <div v-if="recentJobs.length" class="space-y-2" data-recent-generations>
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs font-medium text-muted">
          Recent generations
        </p>
        <span class="text-[11px] text-muted">{{ recentJobs.length }} latest</span>
      </div>
      <div class="space-y-2">
        <div
          v-for="job in recentJobs"
          :key="job.id"
          :data-generation-job="job.id"
          class="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg border border-default bg-default/30 px-3 py-2.5"
        >
          <div class="size-16 overflow-hidden rounded-md border border-default bg-elevated">
            <!-- Poster comes from the actual output asset, seeked past fade-in frames. -->
            <MediaGeneratedThumbnail
              v-if="job.status === 'succeeded' && job.outputAssetId"
              :asset-id="job.outputAssetId"
              :duration-sec="job.durationSeconds"
              :alt="`Preview of ${job.prompt || 'generated clip'}`"
            />
            <div v-else class="flex size-full items-center justify-center">
              <UIcon
                :name="job.status === 'failed' || job.status === 'blocked' ? 'i-lucide-circle-alert' : job.status === 'succeeded' ? 'i-lucide-film' : 'i-lucide-clock'"
                class="size-4 text-muted"
              />
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-center gap-2">
              <p class="truncate text-xs font-medium text-highlighted">
                {{ jobModelLabel(job) }}
              </p>
              <UBadge
                :label="job.status"
                :color="jobStatusColor(job)"
                variant="subtle"
                size="xs"
                class="shrink-0 capitalize"
              />
            </div>
            <p class="mt-0.5 line-clamp-2 text-xs text-muted" :title="job.prompt">
              {{ job.prompt }}
            </p>
          </div>
          <div class="col-span-2 space-y-2">
            <p v-if="job.errorMessage && (job.status === 'failed' || job.status === 'blocked')" class="text-xs text-error">
              {{ job.errorMessage }}
            </p>
            <div class="flex flex-wrap justify-end gap-1">
              <UButton
                v-if="canAddJobToTimeline(job)"
                size="xs"
                variant="soft"
                color="neutral"
                icon="i-lucide-plus-circle"
                label="Add at playhead"
                @click="addJobToTimeline(job)"
              />
              <UButton
                v-if="hasModels && canReuseJob(job)"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-rotate-ccw"
                :label="job.status === 'failed' || job.status === 'blocked' ? 'Edit and retry' : 'Reuse'"
                @click="applyJobDraft(job)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
