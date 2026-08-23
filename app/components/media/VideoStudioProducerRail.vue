<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  assemblyPlanToTimelinePayloads,
  validateAssemblyPlanForTimeline,
  type AiAssemblyPlan,
  type AiAssemblyTimelinePayload,
} from '~~/app/utils/video/aiAssemblyTimeline'
import { apiErrorDescription } from '~~/app/utils/apiError'
import {
  VIDEO_PRODUCER_RECIPES,
  findVideoProducerRecipe,
  type VideoProducerTargetFormat,
} from '~~/app/utils/video/producerRecipes'
import type { VideoGenerationJobView } from '~~/app/composables/useVideoGenerationJobs'
import type { VideoStudioAsset } from '~~/app/utils/video/videoStudioAssets'
import { idempotencyKey } from '~~/app/utils/idempotencyKey'

const props = withDefaults(defineProps<{
  projectId: string
  selectedAsset?: VideoStudioAsset | null
  assetCount?: number
  voiceAssetCount?: number
  overlayAssetCount?: number
  recentGenerationJobs?: VideoGenerationJobView[]
  initialPlan?: AiAssemblyPlan | null
}>(), {
  selectedAsset: null,
  assetCount: 0,
  voiceAssetCount: 0,
  overlayAssetCount: 0,
  recentGenerationJobs: () => [],
  initialPlan: null,
})

const emit = defineEmits<{
  (event: 'add-to-timeline', payload: AiAssemblyTimelinePayload): void
  (event: 'brief-change', brief: string): void
}>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown
    headers?: Record<string, string>
  }
) => Promise<T>
const selectedRecipeId = ref(VIDEO_PRODUCER_RECIPES[0]?.id ?? null)
const brief = ref('Create a punchy vertical social edit using the strongest project assets.')
const targetFormat = ref<VideoProducerTargetFormat>('reels_9x16')
const assembling = ref(false)
const assemblyPlan = ref<AiAssemblyPlan | null>(props.initialPlan)

const selectedRecipe = computed(() => findVideoProducerRecipe(selectedRecipeId.value))
const recipeOptions = computed(() => VIDEO_PRODUCER_RECIPES.map(recipe => ({
  label: recipe.label,
  value: recipe.id,
})))
const recentGenerationJobs = computed(() => props.recentGenerationJobs.slice(0, 3))
const timelinePayloads = computed(() => assemblyPlanToTimelinePayloads(assemblyPlan.value))
const planValidation = computed(() => validateAssemblyPlanForTimeline(assemblyPlan.value))
const hasManualLaneAssets = computed(() => props.voiceAssetCount > 0 || props.overlayAssetCount > 0)
const selectedAssetContext = computed(() => props.selectedAsset
  ? {
      id: props.selectedAsset.rawId,
      title: props.selectedAsset.title,
      type: props.selectedAsset.type,
      source: props.selectedAsset.source,
      prompt: props.selectedAsset.prompt,
      transcript: props.selectedAsset.transcript,
    }
  : null)
const captionReady = computed(() => Boolean(props.selectedAsset?.captionVttUrl || props.selectedAsset?.transcript || /caption|subtitle/i.test(brief.value)))
const producerSections = computed(() => [
  {
    id: 'brief',
    label: 'Brief',
    icon: 'i-lucide-scroll-text',
    ready: brief.value.trim().length >= 12,
    detail: brief.value.trim().length >= 12 ? 'Ready' : 'Needs direction',
  },
  {
    id: 'format',
    label: 'Format',
    icon: 'i-lucide-proportions',
    ready: Boolean(targetFormat.value),
    detail: targetFormat.value.replace(/_/g, ' / '),
  },
  {
    id: 'script',
    label: 'Script',
    icon: 'i-lucide-file-text',
    ready: Boolean(props.selectedAsset?.transcript || brief.value.trim().length >= 60),
    detail: props.selectedAsset?.transcript ? 'Transcript available' : 'Brief-led',
  },
  {
    id: 'voice',
    label: 'Voice',
    icon: 'i-lucide-mic-2',
    ready: props.voiceAssetCount > 0,
    detail: props.voiceAssetCount > 0 ? `${props.voiceAssetCount} assets` : 'Optional',
  },
  {
    id: 'overlays',
    label: 'Overlays',
    icon: 'i-lucide-shapes',
    ready: props.overlayAssetCount > 0,
    detail: props.overlayAssetCount > 0 ? `${props.overlayAssetCount} assets` : 'Optional',
  },
  {
    id: 'captions',
    label: 'Captions',
    icon: 'i-lucide-subtitles',
    ready: captionReady.value,
    detail: captionReady.value ? 'Requested' : 'Optional',
  },
  {
    id: 'plan',
    label: 'Draft plan',
    icon: 'i-lucide-list-checks',
    ready: Boolean(assemblyPlan.value?.steps?.length),
    detail: assemblyPlan.value?.steps?.length ? `${assemblyPlan.value.steps.length} steps` : 'Not built',
  },
  {
    id: 'render',
    label: 'Render',
    icon: 'i-lucide-clapperboard',
    ready: planValidation.value.canApply,
    detail: planValidation.value.canApply ? `${planValidation.value.timelineReadyCount} clips` : 'After plan',
  },
])

watch(() => props.initialPlan, (plan) => {
  assemblyPlan.value = plan
})

watch(brief, (next) => {
  emit('brief-change', next)
}, { immediate: true })

function applyRecipe(recipeId: string | null | undefined = selectedRecipeId.value) {
  const recipe = findVideoProducerRecipe(recipeId)
  if (!recipe) return
  selectedRecipeId.value = recipe.id
  brief.value = recipe.brief
  targetFormat.value = recipe.targetFormat
}

async function assemblePlan() {
  assembling.value = true
  try {
    const res = await apiFetch<{ plan: AiAssemblyPlan }>(`/api/agency/video/projects/${props.projectId}/assemble`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('project-assemble') },
      body: {
        brief: brief.value,
        targetFormat: targetFormat.value,
        selectedAsset: selectedAssetContext.value,
      },
    })
    assemblyPlan.value = res.plan
    toast.add({ title: 'Draft plan prepared', description: `${res.plan.steps?.length ?? 0} proposed steps.`, color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Could not build draft plan', description: apiErrorDescription(e, ''), color: 'error' })
  } finally {
    assembling.value = false
  }
}

function applyPlan() {
  if (!planValidation.value.canApply) {
    toast.add({
      title: 'Plan needs review',
      description: planValidation.value.warnings[0] ?? 'No timeline-ready clips.',
      color: 'warning',
    })
    return
  }
  for (const payload of timelinePayloads.value) emit('add-to-timeline', payload)
  toast.add({
    title: 'Plan added to timeline',
    description: `${timelinePayloads.value.length} clips inserted. Use editor Undo to reverse inserts.`,
    color: 'success',
  })
}

function durationLabel(seconds: number | null | undefined) {
  if (!seconds) return null
  const rounded = Number.isInteger(seconds) ? seconds : Number(seconds.toFixed(1))
  return `${rounded}s`
}

function generationJobColor(status: VideoGenerationJobView['status']) {
  switch (status) {
    case 'succeeded': return 'success'
    case 'failed': return 'error'
    case 'blocked': return 'warning'
    case 'running': return 'primary'
    default: return 'neutral'
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-start gap-2">
      <UIcon name="i-lucide-wand-sparkles" class="mt-0.5 size-4 shrink-0 text-primary" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-highlighted">AI Producer</p>
        <p class="mt-0.5 text-xs leading-snug text-muted">Build a reviewable draft timeline from the current project library.</p>
      </div>
    </div>

    <div class="grid grid-cols-3 divide-x divide-default rounded-md border border-default bg-default/30">
      <div class="px-2 py-1.5">
        <p class="text-[10px] uppercase text-muted">Assets</p>
        <p class="text-sm font-medium text-highlighted">{{ props.assetCount }}</p>
      </div>
      <div class="px-2 py-1.5">
        <p class="text-[10px] uppercase text-muted">Voice</p>
        <p class="text-sm font-medium text-highlighted">{{ props.voiceAssetCount }}</p>
      </div>
      <div class="px-2 py-1.5">
        <p class="text-[10px] uppercase text-muted">Overlays</p>
        <p class="text-sm font-medium text-highlighted">{{ props.overlayAssetCount }}</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <div
        v-for="section in producerSections"
        :key="section.id"
        class="flex min-w-0 items-center gap-2 rounded-md border border-default bg-default/30 px-2 py-1.5"
      >
        <UIcon :name="section.icon" class="size-3.5 shrink-0" :class="section.ready ? 'text-primary' : 'text-muted'" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-[11px] font-medium text-highlighted">{{ section.label }}</p>
          <p class="truncate text-[10px] text-muted">{{ section.detail }}</p>
        </div>
        <UIcon
          :name="section.ready ? 'i-lucide-check-circle-2' : 'i-lucide-circle'"
          class="size-3.5 shrink-0"
          :class="section.ready ? 'text-primary' : 'text-muted'"
        />
      </div>
    </div>

    <div class="border-t border-default pt-3">
      <p class="text-[11px] font-medium uppercase text-muted">Selected asset</p>
      <div v-if="props.selectedAsset" class="mt-1 flex items-start gap-2">
        <UIcon name="i-lucide-library" class="mt-0.5 size-3.5 shrink-0 text-primary" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-medium text-highlighted">{{ props.selectedAsset.title }}</p>
          <p class="mt-0.5 truncate text-[11px] text-muted">
            {{ props.selectedAsset.type }} · {{ props.selectedAsset.source }}<span v-if="props.selectedAsset.subtitle"> · {{ props.selectedAsset.subtitle }}</span>
          </p>
        </div>
      </div>
      <p v-else class="mt-1 text-xs text-muted">Select an item in the library rail to anchor the brief.</p>
    </div>

    <div class="border-t border-default pt-3">
      <div class="flex items-center gap-1.5">
        <USelect
          v-model="selectedRecipeId"
          :items="recipeOptions"
          value-key="value"
          size="xs"
          variant="soft"
          color="neutral"
          icon="i-lucide-clipboard-list"
          aria-label="Producer recipe"
          class="min-w-0 flex-1"
        />
        <UButton
          icon="i-lucide-check"
          size="xs"
          variant="soft"
          color="primary"
          label="Use"
          @click="applyRecipe()"
        />
      </div>
      <p v-if="selectedRecipe" class="mt-2 text-xs leading-snug text-muted">{{ selectedRecipe.description }}</p>
      <div v-if="selectedRecipe" class="mt-2 flex flex-wrap gap-1">
        <span
          v-for="assetType in selectedRecipe.preferredAssetTypes"
          :key="assetType"
          class="rounded border border-default bg-elevated px-1.5 py-0.5 text-[10px] uppercase text-muted"
        >
          {{ assetType }}
        </span>
      </div>
    </div>

    <div class="rounded-md border border-default bg-default/30 transition-colors focus-within:border-primary/50">
      <UTextarea
        v-model="brief"
        :rows="4"
        autoresize
        variant="none"
        placeholder="Tell the AI Producer what to make..."
        class="w-full"
      />
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
        <UButton
          icon="i-lucide-wand-sparkles"
          size="xs"
          color="primary"
          label="Build draft plan"
          :loading="assembling"
          class="ml-auto"
          @click="assemblePlan"
        />
      </div>
    </div>

    <div v-if="hasManualLaneAssets" class="rounded-md border border-default bg-default/30 px-2 py-1.5">
      <p class="text-[11px] leading-snug text-muted">
        Voice and overlays are available as lane inserts. Add them before or after applying the visual draft.
      </p>
    </div>

    <div v-if="recentGenerationJobs.length" class="border-t border-default pt-3">
      <div class="flex items-center justify-between gap-2">
        <p class="text-[11px] font-medium uppercase text-muted">Recent generations</p>
        <UBadge :label="String(recentGenerationJobs.length)" size="xs" variant="soft" color="neutral" />
      </div>
      <div class="mt-2 space-y-1.5">
        <div
          v-for="job in recentGenerationJobs"
          :key="job.id"
          class="flex items-center gap-2 rounded border border-default bg-elevated/70 px-2 py-1"
        >
          <UBadge :label="job.status" :color="generationJobColor(job.status)" size="xs" variant="soft" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs text-highlighted">{{ job.prompt || job.modelId }}</p>
            <p class="truncate text-[11px] text-muted">{{ job.mode }}<span v-if="job.aspectRatio"> · {{ job.aspectRatio }}</span></p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="assemblyPlan" class="border-t border-default pt-3">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-xs font-medium text-highlighted">{{ assemblyPlan.steps?.length ?? 0 }} proposed steps</p>
          <p class="text-[11px] text-muted">{{ planValidation.timelineReadyCount }} timeline-ready clips</p>
        </div>
        <UButton
          icon="i-lucide-list-plus"
          size="xs"
          variant="soft"
          color="primary"
          label="Apply"
          :disabled="!planValidation.canApply"
          @click="applyPlan"
        />
      </div>
      <p v-if="planValidation.canApply" class="mt-1 text-[11px] text-muted">Apply inserts visual clips only. Use editor Undo to reverse inserts.</p>
      <div v-if="planValidation.warnings.length" class="mt-2 rounded border border-default bg-default/30 px-2 py-1.5">
        <p class="text-[11px] font-medium text-highlighted">Plan validation</p>
        <ul class="mt-1 space-y-0.5 text-[11px] text-muted">
          <li v-for="warning in planValidation.warnings" :key="warning">{{ warning }}</li>
        </ul>
      </div>
      <p v-if="assemblyPlan.rationale" class="mt-2 text-xs leading-snug text-default">{{ assemblyPlan.rationale }}</p>
      <ol class="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
        <li
          v-for="(step, index) in assemblyPlan.steps ?? []"
          :key="`${step.assetId ?? step.r2Key ?? index}:${index}`"
          class="rounded border border-default bg-elevated/70 px-2 py-1"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="min-w-0 truncate">{{ step.title || step.r2Key || step.assetId || step.type || 'Draft step' }}</span>
            <span v-if="durationLabel(step.durationSec)" class="shrink-0 tabular-nums">{{ durationLabel(step.durationSec) }}</span>
          </div>
          <p class="mt-0.5 truncate text-[11px] text-muted">{{ step.type ?? 'step' }}<span v-if="step.startSec != null"> · {{ step.startSec }}s</span></p>
        </li>
      </ol>
    </div>
  </div>
</template>
