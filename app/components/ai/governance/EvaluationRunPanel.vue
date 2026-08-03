<script setup lang="ts">
import type { AiCatalogGovernanceItem, AiEvaluationRunView } from '~/types/aiGovernance'

const props = defineProps<{
  item: AiCatalogGovernanceItem
  runs: AiEvaluationRunView[]
  defaultCaseCount: number
}>()
const emit = defineEmits<{ changed: [] }>()

type Preflight = {
  evaluationRunId: string
  departmentId: string
  planDigest: string
  rateCardId: string
  estimatedUpperBoundUsdMicros: number
  maxModelCalls: number
  decision: 'preflight_only' | 'requires_cost_approval'
}

const open = ref(false)
const pending = ref(false)
const error = ref<string | null>(null)
const preflight = ref<Preflight | null>(null)
const approvalId = ref<string | null>(null)
const approvalReason = ref('')
const costAcknowledged = ref(false)
const provider = ref<'groq' | 'anthropic' | 'workers_ai'>('groq')
const modelId = ref('llama-3.3-70b-versatile')
const budget = reactive({
  maxCases: 1,
  maxInputTokensPerCase: 1,
  maxOutputTokensPerCase: 1,
  maxCostUsdMicrosPerCase: 0,
  maxLatencyMsPerCase: 1,
  maxTotalCostUsdMicros: 0,
  maxWallTimeMs: 1
})

const providerOptions = [
  { label: 'Groq', value: 'groq' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Workers AI', value: 'workers_ai' }
]

const latestRun = computed(() => [...props.runs]
  .filter(run => run.materialIdentity.packVersionId === props.item.version.id)
  .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null)
const canApprove = computed(() => Boolean(preflight.value && approvalReason.value.trim().length >= 10 && costAcknowledged.value && !pending.value))

function reset() {
  preflight.value = null
  approvalId.value = null
  approvalReason.value = ''
  costAcknowledged.value = false
  error.value = null
  budget.maxCases = Math.max(1, props.defaultCaseCount)
  budget.maxInputTokensPerCase = props.item.controls.maxInputTokens
  budget.maxOutputTokensPerCase = props.item.controls.maxOutputTokens
  budget.maxCostUsdMicrosPerCase = props.item.controls.maxCostUsdMicros
  budget.maxLatencyMsPerCase = props.item.controls.maxLatencyMs
  budget.maxTotalCostUsdMicros = props.item.controls.maxCostUsdMicros * Math.max(1, props.defaultCaseCount)
  budget.maxWallTimeMs = Math.min(3_600_000, (props.item.controls.maxLatencyMs * Math.max(1, props.defaultCaseCount)) + 5_000)
}

function message(caught: unknown, fallback: string) {
  return (caught as { data?: { statusMessage?: string } })?.data?.statusMessage ?? fallback
}

async function createPreflight() {
  pending.value = true
  error.value = null
  try {
    preflight.value = await $fetch<Preflight>('/api/admin/ai/governance/evaluations', {
      method: 'POST',
      body: { packVersionId: props.item.version.id, modelProvider: provider.value, modelId: modelId.value.trim(), budget }
    })
  } catch (caught) {
    error.value = message(caught, 'The evaluation preflight could not be created.')
  } finally {
    pending.value = false
  }
}

async function approveCost() {
  if (!preflight.value || !canApprove.value) return
  pending.value = true
  error.value = null
  try {
    const approval = await $fetch<{ approvalId: string }>(`/api/admin/ai/governance/evaluations/${preflight.value.evaluationRunId}/approve`, {
      method: 'POST',
      body: {
        planDigest: preflight.value.planDigest,
        maxSpendUsdMicros: preflight.value.estimatedUpperBoundUsdMicros,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        reason: approvalReason.value.trim()
      }
    })
    approvalId.value = approval.approvalId
  } catch (caught) {
    error.value = message(caught, 'The evaluation cost approval could not be recorded.')
  } finally {
    pending.value = false
  }
}

async function execute() {
  if (!preflight.value || !approvalId.value) return
  pending.value = true
  error.value = null
  try {
    await $fetch(`/api/admin/ai/governance/evaluations/${preflight.value.evaluationRunId}/run`, {
      method: 'POST',
      body: { planDigest: preflight.value.planDigest, rateCardId: preflight.value.rateCardId, approvalId: approvalId.value }
    })
    emit('changed')
  } catch (caught) {
    error.value = message(caught, 'The approved evaluation could not be executed.')
  } finally {
    pending.value = false
  }
}

watch(open, value => { if (value) reset() })
</script>

<template>
  <section class="space-y-3" aria-labelledby="evaluation-title">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 id="evaluation-title" class="text-sm font-semibold text-highlighted">Evaluation</h4>
        <p class="mt-0.5 text-xs text-muted">Preflight, cost approval, and execution are separate audited steps.</p>
      </div>
      <UButton color="primary" variant="soft" size="sm" icon="i-lucide-flask-conical" @click="open = true">Run evaluation</UButton>
    </div>

    <div v-if="latestRun" class="grid grid-cols-1 gap-3 text-sm @container @lg:grid-cols-2">
      <div class="rounded-md bg-elevated p-3">
        <p class="text-xs font-medium text-muted">Evaluation identity</p>
        <p class="mt-1 truncate text-default">{{ latestRun.materialIdentity.modelProvider }} · {{ latestRun.materialIdentity.modelId }}</p>
      </div>
      <div class="rounded-md bg-elevated p-3">
        <p class="text-xs font-medium text-muted">Gate result</p>
        <p class="mt-1 text-default">{{ latestRun.gatePassed ? 'Passed' : latestRun.gatePassed === false ? 'Did not pass' : 'Pending' }}</p>
      </div>
      <div class="rounded-md bg-elevated p-3">
        <p class="text-xs font-medium text-muted">Cost</p>
        <p class="mt-1 text-default">{{ (latestRun.totalCostUsdMicros / 1_000_000).toFixed(4) }} USD</p>
      </div>
      <div class="rounded-md bg-elevated p-3">
        <p class="text-xs font-medium text-muted">Latest result</p>
        <p class="mt-1 text-default">{{ latestRun.passedCount }} passed · {{ latestRun.failedCount }} failed · {{ latestRun.humanReviewCount }} review</p>
      </div>
    </div>
    <UAlert v-else color="neutral" variant="soft" icon="i-lucide-circle-dashed" title="No evaluation evidence" description="Create a preflight before an exact-version evaluation can run." />

    <UModal v-model:open="open" title="Run governed evaluation" description="Review the frozen execution envelope before any model call.">
      <template #body>
        <div class="@container space-y-4">
          <UAlert color="info" variant="soft" icon="i-lucide-shield-check" title="No one-click execution" description="Cost approval is required after preflight and before execution." />
          <div v-if="!preflight" class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="Model provider"><USelectMenu v-model="provider" :items="providerOptions" value-key="value" class="w-full" /></UFormField>
            <UFormField label="Model ID"><UInput v-model="modelId" class="w-full" /></UFormField>
            <UFormField label="Maximum cases"><UInput v-model.number="budget.maxCases" type="number" class="w-full" /></UFormField>
            <UFormField label="Input tokens per case"><UInput v-model.number="budget.maxInputTokensPerCase" type="number" class="w-full" /></UFormField>
            <UFormField label="Output tokens per case"><UInput v-model.number="budget.maxOutputTokensPerCase" type="number" class="w-full" /></UFormField>
            <UFormField label="Cost per case (micros)"><UInput v-model.number="budget.maxCostUsdMicrosPerCase" type="number" class="w-full" /></UFormField>
            <UFormField label="Latency per case (ms)"><UInput v-model.number="budget.maxLatencyMsPerCase" type="number" class="w-full" /></UFormField>
            <UFormField label="Maximum total cost (micros)"><UInput v-model.number="budget.maxTotalCostUsdMicros" type="number" class="w-full" /></UFormField>
          </div>
          <div v-else class="space-y-4">
            <dl class="grid grid-cols-1 gap-3 text-sm @lg:grid-cols-2">
              <div class="rounded-md bg-elevated p-3"><dt class="text-xs text-muted">Evaluation identity</dt><dd class="mt-1 text-default">{{ preflight.evaluationRunId }}</dd></div>
              <div class="rounded-md bg-elevated p-3"><dt class="text-xs text-muted">Estimated upper bound</dt><dd class="mt-1 text-default">{{ (preflight.estimatedUpperBoundUsdMicros / 1_000_000).toFixed(4) }} USD</dd></div>
            </dl>
            <template v-if="!approvalId">
              <UFormField label="Audit reason" help="At least 10 characters; stored with the cost approval."><UTextarea v-model="approvalReason" :rows="3" class="w-full" /></UFormField>
              <UFormField label="Confirmation"><UCheckbox v-model="costAcknowledged" label="I approve this maximum evaluation spend." /></UFormField>
            </template>
            <UAlert v-else color="success" variant="soft" icon="i-lucide-badge-check" title="Cost approval recorded" description="The evaluation can now be executed exactly once against this plan." />
          </div>
          <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-triangle-alert" title="Governance action unavailable" :description="error" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-between gap-2"><UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton><div class="flex gap-2"><UButton v-if="!preflight" :loading="pending" @click="createPreflight">Preflight evaluation</UButton><UButton v-else-if="!approvalId" :loading="pending" :disabled="!canApprove" @click="approveCost">Approve cost</UButton><UButton v-else :loading="pending" color="primary" @click="execute">Execute approved evaluation</UButton></div></div>
      </template>
    </UModal>
  </section>
</template>
