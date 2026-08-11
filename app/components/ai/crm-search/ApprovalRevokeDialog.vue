<script setup lang="ts">
import type { CrmSearchApprovalView, CrmSearchOperationError } from '~/types/crmSearchOperations'

const props = defineProps<{ open: boolean, approval: CrmSearchApprovalView | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean], changed: [], refresh: [] }>()
const reason = ref(''); const confirmation = ref(''); const pending = ref(false); const error = ref<string | null>(null); const stale = ref(false)
const model = computed({ get: () => props.open, set: value => emit('update:open', value) })
const canSubmit = computed(() => Boolean(props.approval && reason.value.trim().length >= 10 && confirmation.value === 'REVOKE CRM SEARCH APPROVAL' && !pending.value))
function close() { model.value = false }
watch(() => props.open, open => { if (open) { reason.value = ''; confirmation.value = ''; error.value = null; stale.value = false } })

async function submit() {
  if (!props.approval || !canSubmit.value) return
  pending.value = true; error.value = null; stale.value = false
  try {
    await $fetch(`/api/admin/crm-search/approvals/${props.approval.id}/revoke`, { method: 'POST', body: {
      expectedRevision: props.approval.revision, reason: reason.value.trim(), confirmation: confirmation.value
    } })
    emit('changed'); model.value = false
  } catch (caught) {
    const failure = caught as CrmSearchOperationError
    stale.value = (failure.data?.data?.code ?? failure.data?.code) === 'crm_search_stale_revision'
    error.value = failure.data?.statusMessage ?? failure.data?.data?.statusMessage ?? 'The approval revocation was not admitted.'
  } finally { pending.value = false }
}
</script>

<template>
  <UModal v-model:open="model" title="Revoke CRM search approval" description="Revocation appends an immutable record; it never edits the approval.">
    <template #body><div class="@container space-y-4">
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Approval"><UInput :model-value="approval?.approvalType ?? 'No approval selected'" disabled class="w-full" /></UFormField>
        <UFormField label="Expected revision"><UInput :model-value="String(approval?.revision ?? 0)" disabled class="w-full" /></UFormField>
        <UFormField label="Revocation reason" class="@lg:col-span-2"><UTextarea v-model="reason" :rows="3" class="w-full" /></UFormField>
        <UFormField label="Type REVOKE CRM SEARCH APPROVAL" class="@lg:col-span-2"><UInput v-model="confirmation" autocomplete="off" class="w-full" /></UFormField>
      </div>
      <UAlert v-if="stale" color="warning" variant="soft" title="Approval state changed" description="Refresh the ledger before retrying."><template #actions><UButton size="xs" color="warning" variant="soft" @click="$emit('refresh')">Refresh ledger</UButton></template></UAlert>
      <UAlert v-else-if="error" color="error" variant="soft" title="Revocation unavailable" :description="error" />
    </div></template>
    <template #footer><div class="flex w-full justify-between gap-2"><UButton color="neutral" variant="ghost" @click="close">Cancel</UButton><UButton color="error" :loading="pending" :disabled="!canSubmit" @click="submit">Append revocation</UButton></div></template>
  </UModal>
</template>
