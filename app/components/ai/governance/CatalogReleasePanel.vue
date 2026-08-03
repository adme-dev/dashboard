<script setup lang="ts">
import type { AiCatalogGovernanceItem, AiCatalogReleaseState, AiEvaluationRunView } from '~/types/aiGovernance'

const props = defineProps<{
  item: AiCatalogGovernanceItem
  runs: AiEvaluationRunView[]
  headingId?: string
  evidenceUnavailable?: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const open = ref(false)
const pending = ref(false)
const error = ref<string | null>(null)
const target = ref<Exclude<AiCatalogReleaseState, 'draft'> | null>(null)
const reason = ref('')
const acknowledged = ref(false)
const conflictNotice = ref<string | null>(null)

const headingId = computed(() => props.headingId ?? `release-${props.item.release.id}`)

const latestEvaluation = computed(() => [...props.runs]
  .filter(run => run.materialIdentity.packVersionId === props.item.version.id)
  .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null)
const evidenceStale = computed(() => props.evidenceUnavailable || !latestEvaluation.value || latestEvaluation.value.gatePassed !== true || latestEvaluation.value.materialIdentity.packVersionId !== props.item.version.id)
const canConfirm = computed(() => Boolean(target.value && reason.value.trim().length >= 10 && acknowledged.value && !pending.value))

const nextTargets = computed(() => {
  const state = props.item.release.state
  if (state === 'draft') return ['pilot', 'retired'] as const
  if (state === 'pilot') return ['active', 'suspended', 'retired'] as const
  if (state === 'active') return ['suspended', 'retired'] as const
  if (state === 'suspended') return ['pilot', 'active', 'retired'] as const
  return [] as const
})

function label(state: Exclude<AiCatalogReleaseState, 'draft'>) {
  return state === 'active' ? 'Activate release' : state === 'pilot' ? 'Start pilot' : state === 'suspended' ? 'Suspend release' : 'Retire release'
}

function color(state: Exclude<AiCatalogReleaseState, 'draft'>) {
  return state === 'suspended' || state === 'retired' ? 'error' : state === 'active' ? 'primary' : 'warning'
}

function openConfirmation(next: Exclude<AiCatalogReleaseState, 'draft'>) {
  target.value = next
  reason.value = ''
  acknowledged.value = false
  error.value = null
  conflictNotice.value = null
  open.value = true
}

function errorMessage(caught: unknown) {
  return (caught as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'The release transition could not be recorded.'
}

function isConflict(caught: unknown) {
  const data = (caught as { data?: unknown })?.data
  if (!data || typeof data !== 'object') return false
  const serialized = (data as { data?: unknown }).data
  return serialized != null
    && typeof serialized === 'object'
    && (serialized as { code?: unknown }).code === 'release_version_conflict'
}

async function transition() {
  if (!target.value || !canConfirm.value) return
  const targetState = target.value
  pending.value = true
  error.value = null
  try {
    await $fetch(`/api/admin/ai/governance/releases/${props.item.release.id}`, {
      method: 'PATCH',
      body: {
        kind: props.item.kind,
        targetState,
        evaluationRunId: targetState === 'pilot' || targetState === 'active' ? latestEvaluation.value?.id ?? null : null,
        expectedUpdatedAt: props.item.release.updatedAt,
        reason: reason.value.trim()
      }
    })
    open.value = false
    emit('changed')
  } catch (caught) {
    if (isConflict(caught)) {
      target.value = null
      reason.value = ''
      acknowledged.value = false
      open.value = false
      conflictNotice.value = 'Release changed by another admin. Current state reloaded; review it before retrying.'
      emit('changed')
    } else {
      error.value = errorMessage(caught)
    }
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="space-y-3" :aria-labelledby="headingId">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 :id="headingId" class="text-sm font-semibold text-highlighted">Release</h4>
        <p class="mt-0.5 text-xs text-muted">Current state: {{ item.release.state }} · scope: {{ item.release.rolloutScope }}</p>
      </div>
      <UBadge :color="evidenceStale ? 'warning' : 'success'" variant="soft"><UIcon :name="evidenceStale ? 'i-lucide-clock-alert' : 'i-lucide-badge-check'" class="mr-1 size-3" />{{ evidenceStale ? 'Evidence is stale' : 'Evidence current' }}</UBadge>
    </div>
    <UAlert v-if="evidenceStale" color="warning" variant="soft" icon="i-lucide-clock-alert" title="Evidence is stale" description="Promotion is blocked until an exact-version evaluation passes. Suspension and retirement remain available." />
    <UAlert v-if="conflictNotice" color="warning" variant="soft" icon="i-lucide-refresh-cw" title="Release state changed" :description="conflictNotice" />
    <div class="flex flex-wrap gap-2">
      <UButton v-for="next in nextTargets" :key="next" size="sm" :color="color(next)" :variant="next === 'suspended' || next === 'retired' ? 'outline' : 'soft'" :disabled="(next === 'pilot' || next === 'active') && evidenceStale" @click="openConfirmation(next)">{{ label(next) }}</UButton>
    </div>

    <UModal v-model:open="open" :title="target ? label(target) : 'Release transition'" description="This change is appended to the governance audit and checked for concurrent changes.">
      <template #body>
        <div class="@container space-y-4">
          <UAlert v-if="target === 'suspended' || target === 'retired'" color="error" variant="soft" icon="i-lucide-octagon-alert" title="Destructive release change" description="Runtime access is stopped or permanently retired after confirmation." />
          <UAlert v-else color="warning" variant="soft" icon="i-lucide-shield-check" title="Exact-version evidence required" :description="evidenceStale ? 'A current passing evaluation is required before this promotion.' : 'The current passing evaluation will be bound to this transition.'" />
          <UFormField label="Audit reason" help="Minimum 10 characters; explain the operational decision."><UTextarea v-model="reason" :rows="3" :maxlength="2000" class="w-full" /></UFormField>
          <UFormField label="Confirmation"><UCheckbox v-model="acknowledged" label="I confirm this release transition and its runtime access effect." /></UFormField>
          <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-triangle-alert" title="Transition not applied" :description="error" />
        </div>
      </template>
      <template #footer><div class="flex w-full justify-end gap-2"><UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton><UButton :color="target && (target === 'suspended' || target === 'retired') ? 'error' : 'primary'" :loading="pending" :disabled="!canConfirm || ((target === 'pilot' || target === 'active') && evidenceStale)" @click="transition">{{ target ? label(target) : 'Confirm' }}</UButton></div></template>
    </UModal>
  </section>
</template>
