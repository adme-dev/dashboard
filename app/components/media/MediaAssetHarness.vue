<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps<{ projectId: string }>()

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

const toast = useToast()
const loading = ref(false)
const buckets = ref<Bucket[]>([])
const items = ref<BucketItem[]>([])
const actions = ref<HarnessAction[]>([])
const models = ref<HarnessModel[]>([])
const selectedItemId = ref<string | null>(null)
const selectedAction = ref('mask-lift')
const toolPrompt = ref('Lift the highlighted embedded graphic into a transparent layer.')
const brushMaskKey = ref('')
const brief = ref('Create a punchy vertical social edit using the strongest project assets.')
const targetFormat = ref('reels_9x16')
const runningExtraction = ref(false)
const assembling = ref(false)
const assemblyPlan = ref<any | null>(null)

const selectedItem = computed(() => items.value.find(item => item.id === selectedItemId.value) ?? null)
const selectedActionModels = computed(() => models.value.filter(model => model.actions.includes(selectedAction.value)))
const itemsByBucket = computed(() => {
  const grouped: Record<string, BucketItem[]> = {}
  for (const item of items.value) {
    grouped[item.bucketId] ||= []
    grouped[item.bucketId]!.push(item)
  }
  return grouped
})

async function loadHarness() {
  if (!props.projectId) return
  loading.value = true
  try {
    const [bucketRes, modelRes] = await Promise.all([
      $fetch<{ buckets: Bucket[]; items: BucketItem[] }>(`/api/agency/video/projects/${props.projectId}/buckets`),
      $fetch<{ actions: HarnessAction[]; models: HarnessModel[] }>('/api/agency/video/asset-intelligence/models'),
    ])
    buckets.value = bucketRes.buckets
    items.value = bucketRes.items
    actions.value = modelRes.actions
    models.value = modelRes.models
    if (!selectedItemId.value && items.value[0]) selectedItemId.value = items.value[0].id
  } catch (e: any) {
    toast.add({ title: 'Could not load AI Producer', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally {
    loading.value = false
  }
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
    const res = await $fetch<{ job: { id: string; status: string; errorMessage?: string | null } }>(`/api/agency/video/assets/${item.assetId}/extract`, {
      method: 'POST',
      body: {
        projectId: props.projectId,
        bucketItemId: item.id,
        action: selectedAction.value,
        prompt: toolPrompt.value,
        brushMaskKey: brushMaskKey.value || null,
      },
    })
    await saveDirective(item)
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

watch(() => props.projectId, () => { void loadHarness() })
onMounted(() => { void loadHarness() })
</script>

<template>
  <section class="rounded-lg border border-default bg-elevated p-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-sm font-semibold text-highlighted">AI Producer</p>
        <p class="text-xs text-muted">Bucket assets, lift masks/layers, erase embedded graphics, and draft social edits.</p>
      </div>
      <UButton icon="i-lucide-refresh-cw" size="xs" variant="ghost" color="neutral" :loading="loading" aria-label="Refresh AI Producer" @click="loadHarness" />
    </div>

    <div class="mt-3 grid gap-3 lg:grid-cols-[1.1fr_1fr_1fr]">
      <div class="min-w-0 rounded-md border border-default bg-default/30 p-3">
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="text-xs font-medium uppercase text-muted">Project buckets</p>
          <UBadge :label="`${items.length} assets`" size="xs" variant="subtle" color="neutral" />
        </div>
        <div class="max-h-72 space-y-2 overflow-y-auto pr-1">
          <div v-for="bucket in buckets" :key="bucket.id" class="space-y-1">
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
        </div>
      </div>

      <div class="rounded-md border border-default bg-default/30 p-3">
        <p class="mb-2 text-xs font-medium uppercase text-muted">Lift / erase / mask</p>
        <div class="space-y-3">
          <UFormField label="Tool">
            <USelect v-model="selectedAction" :items="actions.filter(a => ['mask-lift', 'erase-fill', 'mask-only', 'layer-decomposition', 'background-removal'].includes(a.id)).map(a => ({ label: a.label, value: a.id }))" value-key="value" />
          </UFormField>
          <UFormField label="Instruction">
            <UTextarea v-model="toolPrompt" :rows="3" autoresize placeholder="Describe what to lift, erase, or preserve..." />
          </UFormField>
          <UFormField label="Brush mask key">
            <UInput v-model="brushMaskKey" placeholder="Optional R2 mask key from highlighter canvas" />
          </UFormField>
          <div class="rounded-md border border-default bg-elevated p-2">
            <p class="text-xs font-medium text-muted">Available models</p>
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
          </div>
          <UButton
            icon="i-lucide-highlighter"
            size="sm"
            color="primary"
            variant="soft"
            label="Run on selected asset"
            :loading="runningExtraction"
            :disabled="!selectedItem?.assetId"
            @click="runExtraction"
          />
        </div>
      </div>

      <div class="rounded-md border border-default bg-default/30 p-3">
        <p class="mb-2 text-xs font-medium uppercase text-muted">Agentic assembly</p>
        <div class="space-y-3">
          <UFormField label="Brief">
            <UTextarea v-model="brief" :rows="4" autoresize placeholder="Tell the AI Producer what to make..." />
          </UFormField>
          <UFormField label="Format">
            <USelect
              v-model="targetFormat"
              :items="[
                { label: 'Reels / TikTok 9:16', value: 'reels_9x16' },
                { label: 'YouTube 16:9', value: 'youtube_16x9' },
                { label: 'Square 1:1', value: 'square_1x1' },
              ]"
              value-key="value"
            />
          </UFormField>
          <UButton icon="i-lucide-wand-sparkles" size="sm" color="primary" label="Build draft plan" :loading="assembling" @click="assemblePlan" />
          <div v-if="assemblyPlan" class="rounded-md border border-default bg-elevated p-2">
            <p class="text-xs font-medium text-highlighted">{{ assemblyPlan.steps?.length ?? 0 }} proposed timeline steps</p>
            <ol class="mt-1 max-h-24 space-y-1 overflow-y-auto text-xs text-muted">
              <li v-for="step in assemblyPlan.steps" :key="step.bucketItemId" class="truncate">
                {{ step.title || step.r2Key || step.assetId }} · {{ step.durationSec }}s
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
