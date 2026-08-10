<script setup lang="ts">
import type { CrmSearchOperationError, CrmSearchPolicyState, CrmSearchPolicyView } from '~/types/crmSearchOperations'

const props = defineProps<{ open: boolean, policy: CrmSearchPolicyView | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean], changed: [], refresh: [] }>()
const action = ref<'transition' | 'backfill'>('transition')
const nextState = ref<CrmSearchPolicyState>('shadow')
const approvalId = ref('')
const evaluationRunId = ref('')
const teardownCycleId = ref('')
const candidateSchemaVersion = ref('crm-search-v1')
const reason = ref('')
const confirmation = ref('')
const pending = ref(false)
const error = ref<string | null>(null)
const stale = ref(false)

const model = computed({ get: () => props.open, set: value => emit('update:open', value) })
const actionOptions = [{ label: 'Policy transition', value: 'transition' }, { label: 'Schedule candidate backfill', value: 'backfill' }]
const allowedTransitions: Record<CrmSearchPolicyState, CrmSearchPolicyState[]> = {
  off: ['indexing', 'teardown_pending'],
  indexing: ['off', 'shadow', 'teardown_pending'],
  shadow: ['off', 'assist', 'teardown_pending'],
  assist: ['shadow', 'off', 'teardown_pending'],
  teardown_pending: ['off']
}
const stateOptions = computed(() => (props.policy ? allowedTransitions[props.policy.state] : [])
  .map(value => ({ label: value.replace('_', ' '), value })))
const confirmations: Record<CrmSearchPolicyState, string> = {
  off: 'DISABLE CLIENT CRM SEARCH', indexing: 'ENABLE CLIENT CRM SEARCH INDEXING',
  shadow: 'ENABLE CLIENT CRM SEARCH SHADOW', assist: 'ENABLE CLIENT CRM SEARCH ASSIST',
  teardown_pending: 'BEGIN CLIENT CRM SEARCH TEARDOWN'
}
const requiredConfirmation = computed(() => action.value === 'backfill' ? 'SCHEDULE CRM SEARCH BACKFILL' : confirmations[nextState.value])
const requiresApproval = computed(() => action.value === 'backfill' || Boolean(props.policy && (
  (props.policy.state === 'off' && nextState.value === 'indexing')
  || (props.policy.state === 'indexing' && nextState.value === 'shadow')
  || (props.policy.state === 'shadow' && nextState.value === 'assist')
)))
const requiresTeardownCycle = computed(() => action.value === 'transition' && Boolean(props.policy)
  && (nextState.value === 'teardown_pending' || (props.policy?.state === 'teardown_pending' && nextState.value === 'off')))
const canSubmit = computed(() => Boolean(props.policy
  && (!requiresApproval.value || approvalId.value)
  && (action.value !== 'transition' || nextState.value !== 'assist' || evaluationRunId.value)
  && (!requiresTeardownCycle.value || teardownCycleId.value)
  && reason.value.trim().length >= 10
  && confirmation.value === requiredConfirmation.value
  && !pending.value))
function close() { model.value = false }

watch(() => props.open, (open) => { if (open) { action.value = 'transition'; nextState.value = props.policy ? allowedTransitions[props.policy.state][0] : 'off'; approvalId.value = ''; evaluationRunId.value = ''; teardownCycleId.value = ''; candidateSchemaVersion.value = props.policy?.candidateSchemaVersion ?? 'crm-search-v1'; reason.value = ''; confirmation.value = ''; error.value = null; stale.value = false } })

async function submit() {
  if (!props.policy || !canSubmit.value) return
  pending.value = true
  error.value = null
  stale.value = false
  try {
    if (action.value === 'transition') {
      await $fetch(`/api/admin/crm-search/policies/${props.policy.clientId}`, { method: 'PUT', body: {
        nextState: nextState.value, expectedControlRevision: props.policy.controlRevision,
        expectedPolicyRevision: props.policy.revision, approvalId: approvalId.value || null,
        evaluationRunId: evaluationRunId.value || null, teardownCycleId: teardownCycleId.value || null,
        reason: reason.value.trim(), confirmation: confirmation.value
      } })
    } else {
      await $fetch('/api/admin/crm-search/backfills', { method: 'POST', body: {
        clientId: props.policy.clientId, candidateSchemaVersion: candidateSchemaVersion.value,
        expectedPolicyRevision: props.policy.revision, approvalId: approvalId.value, limit: 100,
        reason: reason.value.trim(), confirmation: confirmation.value
      } })
    }
    emit('changed')
    model.value = false
  } catch (caught) {
    const failure = caught as CrmSearchOperationError
    stale.value = (failure.data?.data?.code ?? failure.data?.code) === 'crm_search_stale_revision'
    error.value = failure.data?.statusMessage ?? failure.data?.data?.statusMessage ?? 'The client policy command was not admitted.'
  } finally { pending.value = false }
}
</script>

<template>
  <UModal v-model:open="model" title="Manage client CRM search" description="Every action is revision-bound, approved, and audited.">
    <template #body>
      <div class="@container space-y-4">
        <UAlert v-if="policy" color="info" variant="soft" title="Current authority" :description="`${policy.clientName} · control ${policy.controlRevision} · policy ${policy.revision}`" />
        <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
          <UFormField label="Operator action"><USelectMenu v-model="action" :items="actionOptions" value-key="value" class="w-full" /></UFormField>
          <UFormField v-if="action === 'transition'" label="Next policy state"><USelectMenu v-model="nextState" :items="stateOptions" value-key="value" class="w-full" /></UFormField>
          <UFormField v-else label="Candidate schema"><UInput v-model="candidateSchemaVersion" class="w-full" /></UFormField>
          <UFormField v-if="requiresApproval" label="Change approval ID"><UInput v-model="approvalId" class="w-full" /></UFormField>
          <UFormField v-if="action === 'transition' && nextState === 'assist'" label="Evaluation run ID"><UInput v-model="evaluationRunId" class="w-full" /></UFormField>
          <UFormField v-if="requiresTeardownCycle" label="Teardown cycle ID"><UInput v-model="teardownCycleId" class="w-full" /></UFormField>
          <UFormField label="Audit reason" class="@lg:col-span-2"><UTextarea v-model="reason" :rows="3" class="w-full" /></UFormField>
          <UFormField :label="`Type ${requiredConfirmation}`" class="@lg:col-span-2"><UInput v-model="confirmation" autocomplete="off" class="w-full" /></UFormField>
        </div>
        <UAlert v-if="stale" color="warning" variant="soft" title="State changed" description="Refresh the latest revisions before retrying."><template #actions><UButton size="xs" color="warning" variant="soft" @click="$emit('refresh')">Refresh state</UButton></template></UAlert>
        <UAlert v-else-if="error" color="error" variant="soft" title="Policy command unavailable" :description="error" />
      </div>
    </template>
    <template #footer><div class="flex w-full justify-between gap-2"><UButton color="neutral" variant="ghost" @click="close">Cancel</UButton><UButton :loading="pending" :disabled="!canSubmit" @click="submit">Submit audited command</UButton></div></template>
  </UModal>
</template>
