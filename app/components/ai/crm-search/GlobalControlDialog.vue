<script setup lang="ts">
import type { CrmSearchGlobalState, CrmSearchHealthView, CrmSearchOperationError } from '~/types/crmSearchOperations'

const props = defineProps<{ open: boolean, health: CrmSearchHealthView | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean], changed: [], refresh: [] }>()
const action = ref<'control' | 'reconcile'>('control')
const nextState = ref<CrmSearchGlobalState>('halted')
const nextMaximumMode = ref<'off' | 'shadow' | 'assist'>('off')
const indexingReady = ref(false)
const approvalId = ref('')
const reason = ref('')
const confirmation = ref('')
const pending = ref(false)
const error = ref<string | null>(null)
const stale = ref(false)
const model = computed({ get: () => props.open, set: value => emit('update:open', value) })
const actionOptions = [{ label: 'Change global control', value: 'control' }, { label: 'Schedule reconciliation', value: 'reconcile' }]
const stateOptions = ['halted', 'delete_only', 'enabled'].map(value => ({ label: value.replace('_', ' '), value }))
const modeOptions = ['off', 'shadow', 'assist'].map(value => ({ label: value, value }))
const stateConfirmation = computed(() => nextState.value === 'halted' ? 'HALT CRM SEARCH' : nextState.value === 'delete_only' ? 'SET CRM SEARCH DELETE ONLY' : 'ENABLE CRM SEARCH')
const requiredConfirmation = computed(() => action.value === 'reconcile' ? 'SCHEDULE CRM SEARCH RECONCILIATION' : stateConfirmation.value)
const requiresApproval = computed(() => action.value === 'control' && nextState.value === 'enabled')
const canSubmit = computed(() => Boolean(props.health && (!requiresApproval.value || approvalId.value)
  && reason.value.trim().length >= 10 && confirmation.value === requiredConfirmation.value && !pending.value))
function close() { model.value = false }

watch(() => props.open, open => { if (open) { action.value = 'control'; nextState.value = props.health?.global.state ?? 'halted'; nextMaximumMode.value = props.health?.global.maximumMode ?? 'off'; indexingReady.value = props.health?.global.indexingReady ?? false; approvalId.value = ''; reason.value = ''; confirmation.value = ''; error.value = null; stale.value = false } })

async function submit() {
  if (!props.health || !canSubmit.value) return
  pending.value = true; error.value = null; stale.value = false
  try {
    const expectedRevision = props.health.global.revision
    if (action.value === 'control') await $fetch('/api/admin/crm-search/global-control', { method: 'PUT', body: { nextState: nextState.value, nextMaximumMode: nextMaximumMode.value, indexingReady: indexingReady.value, expectedRevision, approvalId: approvalId.value || null, reason: reason.value.trim(), confirmation: confirmation.value } })
    else await $fetch('/api/admin/crm-search/reconcile', { method: 'POST', body: { expectedControlRevision: expectedRevision, reason: reason.value.trim(), confirmation: confirmation.value } })
    emit('changed'); model.value = false
  } catch (caught) {
    const failure = caught as CrmSearchOperationError
    stale.value = (failure.data?.data?.code ?? failure.data?.code) === 'crm_search_stale_revision'
    error.value = failure.data?.statusMessage ?? failure.data?.data?.statusMessage ?? 'The global CRM search command was not admitted.'
  } finally { pending.value = false }
}
</script>

<template>
  <UModal v-model:open="model" title="Global CRM search control" description="Global changes fail closed and require current authority.">
    <template #body><div class="@container space-y-4">
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Operator action"><USelectMenu v-model="action" :items="actionOptions" value-key="value" class="w-full" /></UFormField>
        <UFormField v-if="action === 'control'" label="Next state"><USelectMenu v-model="nextState" :items="stateOptions" value-key="value" class="w-full" /></UFormField>
        <UFormField v-if="action === 'control' && nextState === 'enabled'" label="Maximum mode"><USelectMenu v-model="nextMaximumMode" :items="modeOptions" value-key="value" class="w-full" /></UFormField>
        <UFormField v-if="action === 'control' && nextState === 'enabled'" label="Indexing readiness"><UCheckbox v-model="indexingReady" label="Allow approved indexing work" /></UFormField>
        <UFormField v-if="requiresApproval" label="Change approval ID"><UInput v-model="approvalId" class="w-full" /></UFormField>
        <UFormField label="Audit reason" class="@lg:col-span-2"><UTextarea v-model="reason" :rows="3" class="w-full" /></UFormField>
        <UFormField :label="`Type ${requiredConfirmation}`" class="@lg:col-span-2"><UInput v-model="confirmation" autocomplete="off" class="w-full" /></UFormField>
      </div>
      <UAlert v-if="stale" color="warning" variant="soft" title="Global state changed" description="Refresh the current revision before retrying."><template #actions><UButton size="xs" color="warning" variant="soft" @click="$emit('refresh')">Refresh state</UButton></template></UAlert>
      <UAlert v-else-if="error" color="error" variant="soft" title="Global command unavailable" :description="error" />
    </div></template>
    <template #footer><div class="flex w-full justify-between gap-2"><UButton color="neutral" variant="ghost" @click="close">Cancel</UButton><UButton :loading="pending" :disabled="!canSubmit" @click="submit">Submit audited command</UButton></div></template>
  </UModal>
</template>
