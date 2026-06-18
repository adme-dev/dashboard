<script setup lang="ts">
// MediaGeneratePicker.vue — USlideover to generate an AI video clip (text-to-video
// or image-to-video) via the gated generation API. Emits `submitted(jobId)` so the
// page can start polling; the finished asset surfaces in the Video Library.
import { ref, computed, watch } from 'vue'
import { modelsForMode, validateGenerationForm, costPreviewCents, draftFromGenerationJob } from '~~/app/utils/videoGenerationForm'
import { videoModelPresentation, type VideoModelOption } from '~~/app/utils/video/modelPresentation'
import { VIDEO_GENERATION_TEMPLATES, type VideoGenerationTemplate } from '~~/app/utils/video/generationTemplates'
import { videoGenerationJobTimelinePayload, type VideoLibraryTimelinePayload } from '~~/app/utils/video/videoLibraryTimeline'
import { apiErrorDescription, apiErrorReasons } from '~~/app/utils/apiError'
import type { VideoGenerationMode } from '~~/server/utils/video-generation/types'
import type { VideoGenerationJobView } from '~~/app/composables/useVideoGenerationJobs'

const props = defineProps<{
  open: boolean
  projectId: string
  /** stills already on the timeline that can be registered as i2v source assets */
  timelineStills: { clipId: string; label: string }[]
  /** default aspect from the project format, e.g. '9:16' */
  defaultAspect: string
  initialPrompt?: string | null
  initialSourceAsset?: { assetId: string; title: string } | null
  recentJobs?: VideoGenerationJobView[]
  prepareTimelineStillSource?: () => Promise<void>
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'submitted', jobId: string): void
  (e: 'add-to-timeline', payload: VideoLibraryTimelinePayload): void
}>()

const toast = useToast()
const { data: modelData, pending: modelsPending, refresh: refreshModels } = useFetch<{ models: VideoModelOption[] }>('/api/agency/video/generation/models', {
  lazy: true,
  immediate: false,
  query: computed(() => ({ projectId: props.projectId })),
})
const allModels = computed((): VideoModelOption[] => modelData.value?.models ?? [])
const hasModels = computed(() => allModels.value.length > 0)

const mode = ref<VideoGenerationMode>('image-to-video')
const models = computed(() => modelsForMode(allModels.value, mode.value))
const modelId = ref<string>('')
const model = computed(() => allModels.value.find((m) => m.id === modelId.value) ?? null)
const prompt = ref('')
const sourceAssetId = ref<string | null>(null)
const sourceFileName = ref<string | null>(null)
const selectedStillId = ref<string | null>(null)
const subjectType = ref<'vehicle' | 'non_vehicle' | 'unknown'>('unknown')
const durationSeconds = ref<number>(model.value?.durationsSeconds[0] ?? 5)
const submitting = ref(false)
const uploading = ref(false)
const registeredInitialSource = ref<{ assetId: string; sourceId: string } | null>(null)

// Hidden file input ref — triggered programmatically via the upload button
const fileInputRef = ref<HTMLInputElement | null>(null)

const MODE_OPTIONS = [
  { label: 'Image → video', value: 'image-to-video' },
  { label: 'Text → video', value: 'text-to-video' },
]
const SUBJECT_OPTIONS = [
  { label: 'Unknown', value: 'unknown' },
  { label: 'Vehicle', value: 'vehicle' },
  { label: 'Non-vehicle', value: 'non_vehicle' },
]

const validation = computed(() => validateGenerationForm({ mode: mode.value, model: model.value, prompt: prompt.value, sourceAssetId: sourceAssetId.value, durationSeconds: durationSeconds.value }))
const estCostCents = computed(() => (model.value ? costPreviewCents(model.value, durationSeconds.value) : 0))

// Rich composer-bar presentation: provider icon + capability sublabel + cost per row.
const modelItems = computed(() => models.value.map((m) => {
  const presentation = videoModelPresentation(m)
  return { label: m.label, value: m.id, ...presentation }
}))
const selectedModelIcon = computed(() => (model.value ? videoModelPresentation(model.value).icon : 'i-lucide-box'))
const costChipLabel = computed(() => `~$${(estCostCents.value / 100).toFixed(2)} · ${durationSeconds.value}s`)
const recentJobs = computed(() => (props.recentJobs ?? []).slice(0, 5))

// Templates gallery shows while the prompt is empty (the blank-page moment);
// clearing the prompt brings it back. Applying one prefills mode + prompt +
// duration — everything stays editable before Generate.
const templatesVisible = computed(() => !prompt.value.trim())

function applyTemplate(template: VideoGenerationTemplate) {
  if (mode.value !== template.mode) {
    mode.value = template.mode
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

  mode.value = draft.mode
  modelId.value = draft.modelId
  prompt.value = draft.prompt
  durationSeconds.value = draft.durationSeconds
  subjectType.value = draft.subjectType
  selectedStillId.value = null

  if (draft.sourceAssetId) {
    sourceAssetId.value = draft.sourceAssetId
    sourceFileName.value = 'Previous source image'
  } else {
    clearSource()
  }
}

function jobModelLabel(job: VideoGenerationJobView): string {
  return allModels.value.find((candidate) => candidate.id === job.modelId)?.label ?? job.modelId
}

function jobStatusColor(job: VideoGenerationJobView): 'primary' | 'success' | 'error' | 'warning' | 'neutral' {
  if (job.status === 'succeeded') return 'success'
  if (job.status === 'failed') return 'error'
  if (job.status === 'blocked') return 'warning'
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
  durationSeconds.value = model.value?.durationsSeconds[0] ?? 5
  if (mode.value === 'text-to-video') clearSource()
}

watch(modelId, () => {
  if (!model.value) return
  if (!model.value.durationsSeconds.includes(durationSeconds.value)) {
    durationSeconds.value = model.value.durationsSeconds[0] ?? 5
  }
})

watch(models, (next) => {
  if (!next.length) return
  if (!next.some((candidate) => candidate.id === modelId.value)) {
    modelId.value = next[0]?.id ?? ''
  }
}, { immediate: true })

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  void refreshModels()
  if (props.initialPrompt) prompt.value = props.initialPrompt
  void applyInitialSourceAsset()
})

watch(() => props.initialSourceAsset?.assetId ?? null, () => {
  registeredInitialSource.value = null
})

function clearSource() {
  sourceAssetId.value = null
  sourceFileName.value = null
  selectedStillId.value = null
}

async function applyInitialSourceAsset() {
  const source = props.initialSourceAsset
  if (!source) return
  mode.value = 'image-to-video'
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
    const res = await $fetch<{ id: string }>('/api/agency/video/generation/source-assets/from-asset', {
      method: 'POST',
      body: { assetId: source.assetId, subjectType: subjectType.value },
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

function triggerFileInput() {
  fileInputRef.value?.click()
}

// Register a still already in this project timeline as the i2v source — reuses
// media the user already uploaded instead of requiring another image upload.
async function onExistingStillSelected(clipId: string | null) {
  if (!clipId) return
  uploading.value = true
  try {
    await props.prepareTimelineStillSource?.()
    const res = await $fetch<{ id: string }>('/api/agency/video/generation/source-assets/from-timeline-still', {
      method: 'POST',
      body: { projectId: props.projectId, clipId, subjectType: subjectType.value },
    })
    sourceAssetId.value = res.id
    sourceFileName.value = props.timelineStills.find((s) => s.clipId === clipId)?.label ?? 'Project still'
  } catch (e: unknown) {
    toast.add({ title: 'Could not use still', description: apiErrorDescription(e), color: 'error' })
    clearSource()
  } finally {
    uploading.value = false
  }
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('projectId', props.projectId)
    formData.append('subjectType', subjectType.value)

    const res = await $fetch<{ id: string }>('/api/agency/video/generation/source-assets', {
      method: 'POST',
      body: formData,
    })

    sourceAssetId.value = res.id
    sourceFileName.value = file.name
  } catch (e: unknown) {
    toast.add({ title: 'Upload failed', description: apiErrorDescription(e), color: 'error' })
    // Reset so the user can retry
    sourceAssetId.value = null
    sourceFileName.value = null
  } finally {
    uploading.value = false
    // Reset the input so the same file can be re-selected if needed
    input.value = ''
  }
}

async function submit() {
  if (!validation.value.valid || !model.value) return
  submitting.value = true
  try {
    const res = await $fetch<{ job: { id: string } }>(`/api/agency/video/generation/jobs`, {
      method: 'POST',
      body: {
        projectId: props.projectId,
        mode: mode.value,
        modelId: model.value.id,
        prompt: prompt.value,
        sourceAssetIds: sourceAssetId.value ? [sourceAssetId.value] : [],
        durationSeconds: durationSeconds.value,
        aspectRatio: props.defaultAspect,
        subjectType: subjectType.value,
        idempotencyKey: crypto.randomUUID(),
      },
    })
    toast.add({ title: 'Generation queued', description: 'Your clip will appear in the Library when ready.', color: 'success' })
    emit('submitted', res.job.id)
    emit('update:open', false)
  } catch (e: unknown) {
    const reasons = apiErrorReasons(e)
    toast.add({ title: 'Could not start generation', description: reasons?.join(' ') ?? apiErrorDescription(e), color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <USlideover :open="open" title="Generate video (AI)" description="Create a clip from a prompt or animate a still." @update:open="emit('update:open', $event)">
    <template #body>
      <div class="flex flex-col gap-6 py-1">
        <UAlert
          v-if="!modelsPending && !hasModels"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="AI video generation is unavailable"
          description="No runnable video models are configured for this Cloudflare account."
        />

        <!-- Loading skeleton while the model list fetches -->
        <div v-if="modelsPending && !hasModels" class="space-y-3">
          <USkeleton class="h-10 w-full rounded-md" />
          <USkeleton class="h-24 w-full rounded-md" />
        </div>

        <!-- Prompt-first composer: big prompt card with a control bar along the
             bottom (mode ▾ / model ▾ / advanced params / cost chip), instead of a
             stacked form. The prompt is the primary object; everything else is a
             setting hanging off it. -->
        <template v-if="hasModels">
          <!-- Start from a template — visible while the prompt is blank -->
          <div v-if="templatesVisible" class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-widest text-muted">
              Start from a template
            </p>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="template in VIDEO_GENERATION_TEMPLATES"
                :key="template.id"
                type="button"
                class="group flex items-start gap-2.5 rounded-lg border border-default bg-elevated/60 p-2.5 text-left transition hover:border-primary/50 hover:bg-primary/5"
                @click="applyTemplate(template)"
              >
                <UIcon :name="template.icon" class="mt-0.5 size-4 shrink-0 text-muted transition-colors group-hover:text-primary" />
                <span class="min-w-0">
                  <span class="block truncate text-xs font-medium text-highlighted">{{ template.title }}</span>
                  <span class="mt-0.5 block text-[11px] leading-snug text-muted">{{ template.tagline }}</span>
                </span>
              </button>
            </div>
            <p class="text-[11px] text-muted">
              Templates prefill the prompt — edit anything before generating.
            </p>
          </div>

          <div class="rounded-xl border border-default bg-elevated/60 transition-colors focus-within:border-primary/50">
            <UTextarea
              v-model="prompt"
              :rows="5"
              autoresize
              variant="none"
              placeholder="Describe the motion, atmosphere, or scene you want…"
              class="w-full"
            />

            <!-- i2v source image attachment -->
            <div v-if="mode === 'image-to-video'" class="px-3 pb-2.5">
              <!-- Hidden file input — triggered by the upload button below -->
              <input
                ref="fileInputRef"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="sr-only"
                tabindex="-1"
                aria-hidden="true"
                @change="onFileSelected"
              />
              <div v-if="sourceFileName" class="flex items-center gap-2 rounded-lg border border-default bg-default/40 px-2.5 py-1.5">
                <UIcon name="i-lucide-image" class="size-4 shrink-0 text-muted" />
                <span class="truncate text-xs text-default">{{ sourceFileName }}</span>
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  aria-label="Clear source image"
                  :disabled="uploading"
                  class="ml-auto shrink-0"
                  @click="clearSource"
                />
              </div>
              <div v-else class="flex flex-wrap items-center gap-2">
                <USelectMenu
                  v-if="timelineStills.length"
                  v-model="selectedStillId"
                  :items="timelineStills.map((s) => ({ label: s.label, value: s.clipId }))"
                  value-key="value"
                  size="xs"
                  placeholder="Use a project still"
                  :disabled="uploading"
                  @update:model-value="onExistingStillSelected"
                />
                <UButton
                  size="xs"
                  variant="outline"
                  color="neutral"
                  icon="i-lucide-image-plus"
                  :label="timelineStills.length ? 'Upload still' : 'Add source image'"
                  :loading="uploading"
                  :disabled="uploading"
                  @click="triggerFileInput"
                />
                <span class="text-[11px] text-muted">Required for image → video</span>
              </div>
            </div>

            <!-- Composer bar -->
            <div class="flex flex-wrap items-center gap-1.5 border-t border-default px-2 py-2">
              <USelect
                v-model="mode"
                :items="MODE_OPTIONS"
                value-key="value"
                size="xs"
                variant="soft"
                color="neutral"
                :icon="mode === 'image-to-video' ? 'i-lucide-image-play' : 'i-lucide-type'"
                aria-label="Generation mode"
                @update:model-value="onModeChange"
              />
              <USelectMenu
                v-model="modelId"
                :items="modelItems"
                value-key="value"
                size="xs"
                variant="soft"
                color="neutral"
                :icon="selectedModelIcon"
                :search-input="false"
                class="min-w-44"
                aria-label="Model"
              >
                <template #item="{ item }">
                  <div class="flex min-w-0 flex-1 items-center gap-2.5 py-0.5">
                    <UIcon :name="item.icon" class="size-4 shrink-0 text-muted" />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-xs font-medium text-highlighted">{{ item.label }}</p>
                      <p class="truncate text-[11px] text-muted">{{ item.sublabel }}</p>
                    </div>
                    <span class="shrink-0 text-[11px] tabular-nums text-muted">{{ item.costLabel }}</span>
                  </div>
                </template>
              </USelectMenu>
              <UPopover>
                <UButton icon="i-lucide-sliders-horizontal" size="xs" variant="soft" color="neutral" aria-label="Advanced parameters" />
                <template #content>
                  <div class="w-64 space-y-4 p-4">
                    <p class="text-sm font-medium text-highlighted">Advanced</p>
                    <UFormField label="Duration">
                      <USelect v-model="durationSeconds" :items="(model?.durationsSeconds ?? [5]).map((d) => ({ label: `${d}s`, value: d }))" value-key="value" class="w-full" />
                    </UFormField>
                    <UFormField label="Subject" help="Helps with compliance routing.">
                      <USelect v-model="subjectType" :items="SUBJECT_OPTIONS" value-key="value" class="w-full" />
                    </UFormField>
                  </div>
                </template>
              </UPopover>
              <UTooltip :text="`Estimated cost for ${durationSeconds}s${model?.costUnit === 'second' ? ' (billed per second)' : ''}`">
                <UBadge :label="costChipLabel" variant="subtle" color="neutral" class="ml-auto tabular-nums" />
              </UTooltip>
            </div>
          </div>

          <div v-if="recentJobs.length" class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs font-semibold uppercase tracking-widest text-muted">
                Recent generations
              </p>
              <span class="text-[11px] text-muted">{{ recentJobs.length }} latest</span>
            </div>
            <div class="space-y-2">
              <div
                v-for="job in recentJobs"
                :key="job.id"
                class="flex items-center gap-3 rounded-lg border border-default bg-default/30 px-3 py-2.5"
              >
                <UIcon
                  :name="job.status === 'succeeded' ? 'i-lucide-circle-check' : job.status === 'failed' || job.status === 'blocked' ? 'i-lucide-circle-alert' : 'i-lucide-loader-circle'"
                  class="size-4 shrink-0 text-muted"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex min-w-0 items-center gap-2">
                    <p class="truncate text-xs font-medium text-highlighted">{{ jobModelLabel(job) }}</p>
                    <UBadge :label="job.status" :color="jobStatusColor(job)" variant="subtle" size="xs" class="shrink-0 capitalize" />
                  </div>
                  <p class="mt-0.5 truncate text-[11px] text-muted">{{ job.prompt }}</p>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <UButton
                    v-if="canAddJobToTimeline(job)"
                    size="xs"
                    variant="soft"
                    color="neutral"
                    icon="i-lucide-plus-circle"
                    label="Add"
                    @click="addJobToTimeline(job)"
                  />
                  <UButton
                    v-if="canReuseJob(job)"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-rotate-ccw"
                    :label="job.status === 'failed' || job.status === 'blocked' ? 'Retry' : 'Reuse'"
                    @click="applyJobDraft(job)"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Validation warning -->
          <UAlert v-if="!validation.valid" color="warning" variant="subtle" icon="i-lucide-info" :title="validation.errors[0]" />

          <UButton block color="primary" icon="i-lucide-sparkles" :loading="submitting" :disabled="!validation.valid" label="Generate" @click="submit" />
        </template>
      </div>
    </template>
  </USlideover>
</template>
