<script setup lang="ts">
// MediaGeneratePicker.vue — USlideover to generate an AI video clip (text-to-video
// or image-to-video) via the gated generation API. Emits `submitted(jobId)` so the
// page can start polling; the finished asset surfaces in the Video Library.
import { ref, computed } from 'vue'
import { listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'
import { modelsForMode, validateGenerationForm, costPreviewCents } from '~~/app/utils/videoGenerationForm'
import type { VideoGenerationMode } from '~~/server/utils/video-generation/types'

const props = defineProps<{
  open: boolean
  projectId: string
  /** stills already on the timeline: { assetId, label } — assetId must be a video_assets id */
  timelineStills: { assetId: string; label: string }[]
  /** default aspect from the project format, e.g. '9:16' */
  defaultAspect: string
}>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void; (e: 'submitted', jobId: string): void }>()

const toast = useToast()
const allModels = listSelectableVideoGenerationModels()
const hasModels = computed(() => allModels.length > 0)

const mode = ref<VideoGenerationMode>('image-to-video')
const models = computed(() => modelsForMode(allModels, mode.value))
const modelId = ref<string>(models.value[0]?.id ?? '')
const model = computed(() => allModels.find((m) => m.id === modelId.value) ?? null)
const prompt = ref('')
const sourceAssetId = ref<string | null>(null)
const sourceFileName = ref<string | null>(null)
const selectedStillId = ref<string | null>(null)
const subjectType = ref<'vehicle' | 'non_vehicle' | 'unknown'>('unknown')
const durationSeconds = ref<number>(model.value?.durationsSeconds[0] ?? 5)
const submitting = ref(false)
const uploading = ref(false)

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

function onModeChange() {
  modelId.value = models.value[0]?.id ?? ''
  durationSeconds.value = model.value?.durationsSeconds[0] ?? 5
  if (mode.value === 'text-to-video') clearSource()
}

function clearSource() {
  sourceAssetId.value = null
  sourceFileName.value = null
  selectedStillId.value = null
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

// Register a still already in this project (on the timeline) as the i2v source —
// reuses media the user already uploaded instead of a fresh upload.
async function onExistingStillSelected(assetId: string | null) {
  if (!assetId) return
  uploading.value = true
  try {
    const res = await $fetch<{ id: string }>('/api/agency/video/generation/source-assets/from-asset', {
      method: 'POST',
      body: { assetId, subjectType: subjectType.value },
    })
    sourceAssetId.value = res.id
    sourceFileName.value = props.timelineStills.find((s) => s.assetId === assetId)?.label ?? 'Project still'
  } catch (e: any) {
    toast.add({ title: 'Could not use still', description: e?.data?.statusMessage ?? 'Failed', color: 'error' })
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
    formData.append('subjectType', subjectType.value)

    const res = await $fetch<{ id: string }>('/api/agency/video/generation/source-assets', {
      method: 'POST',
      body: formData,
    })

    sourceAssetId.value = res.id
    sourceFileName.value = file.name
  } catch (e: any) {
    toast.add({ title: 'Upload failed', description: e?.data?.statusMessage ?? 'Failed', color: 'error' })
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
  } catch (e: any) {
    const reasons = e?.data?.data?.reasons as string[] | undefined
    toast.add({ title: 'Could not start generation', description: reasons?.join(' ') ?? e?.data?.statusMessage ?? 'Failed', color: 'error' })
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
          v-if="!hasModels"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="AI video generation is unavailable"
          description="No runnable video models are configured for this Cloudflare account."
        />

        <!-- Mode + Model row -->
        <div v-if="hasModels" class="flex flex-col gap-4">
          <p class="text-xs font-semibold uppercase tracking-widest text-muted">Source &amp; model</p>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Mode">
              <USelect v-model="mode" :items="MODE_OPTIONS" value-key="value" @update:model-value="onModeChange" />
            </UFormField>
            <UFormField label="Model">
              <USelectMenu v-model="modelId" :items="models.map((m) => ({ label: m.displayName, value: m.id }))" value-key="value" />
            </UFormField>
          </div>
          <UFormField v-if="mode === 'image-to-video'" label="Source image" help="Pick a still already in this project, or upload a new one.">
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
            <div class="flex flex-col gap-2">
              <!-- Selected source -->
              <div v-if="sourceFileName" class="flex items-center gap-2">
                <UIcon name="i-lucide-image" class="size-4 shrink-0 text-muted" />
                <span class="truncate text-sm text-default">{{ sourceFileName }}</span>
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  label="Clear"
                  :disabled="uploading"
                  class="ml-auto shrink-0"
                  @click="clearSource"
                />
              </div>
              <!-- Pick existing project still, or upload new -->
              <template v-else>
                <USelectMenu
                  v-if="timelineStills.length"
                  v-model="selectedStillId"
                  :items="timelineStills.map((s) => ({ label: s.label, value: s.assetId }))"
                  value-key="value"
                  placeholder="Use a still from this project"
                  :disabled="uploading"
                  @update:model-value="onExistingStillSelected"
                />
                <UButton
                  variant="outline"
                  color="neutral"
                  icon="i-lucide-upload"
                  :label="timelineStills.length ? 'Or upload a new still' : 'Upload source image'"
                  :loading="uploading"
                  :disabled="uploading"
                  @click="triggerFileInput"
                />
              </template>
            </div>
          </UFormField>
        </div>

        <USeparator v-if="hasModels" />

        <!-- Prompt -->
        <div v-if="hasModels" class="flex flex-col gap-4">
          <p class="text-xs font-semibold uppercase tracking-widest text-muted">Generation prompt</p>
          <UFormField label="Prompt" help="Describe the motion, atmosphere, or scene you want.">
            <UTextarea v-model="prompt" :rows="3" placeholder="Describe the motion / scene…" autoresize />
          </UFormField>
        </div>

        <USeparator v-if="hasModels" />

        <!-- Duration + Subject + Cost -->
        <div v-if="hasModels" class="flex flex-col gap-4">
          <p class="text-xs font-semibold uppercase tracking-widest text-muted">Output settings</p>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Duration (s)">
              <USelect v-model="durationSeconds" :items="(model?.durationsSeconds ?? [5]).map((d) => ({ label: `${d}s`, value: d }))" value-key="value" />
            </UFormField>
            <UFormField label="Subject" help="Helps with compliance routing.">
              <USelect v-model="subjectType" :items="SUBJECT_OPTIONS" value-key="value" />
            </UFormField>
          </div>
          <p class="text-xs text-muted">
            Estimated cost:
            <span class="font-medium text-default">${{ (estCostCents / 100).toFixed(2) }}</span>
            <span v-if="model?.costUnit === 'generation'" class="ml-1 opacity-60">/ generation</span>
            <span v-else-if="model?.costUnit === 'second'" class="ml-1 opacity-60">/ second</span>
          </p>
        </div>

        <!-- Validation warning -->
        <UAlert v-if="hasModels && !validation.valid" color="warning" variant="subtle" icon="i-lucide-info" :title="validation.errors[0]" />

        <UButton v-if="hasModels" block color="primary" icon="i-lucide-sparkles" :loading="submitting" :disabled="!validation.valid" label="Generate" @click="submit" />
      </div>
    </template>
  </USlideover>
</template>
