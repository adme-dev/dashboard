<script setup lang="ts">
import type { CrmSearchDeadLetterView, CrmSearchOperationError } from '~/types/crmSearchOperations'

const props = defineProps<{ open: boolean, item: CrmSearchDeadLetterView | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean], changed: [], refresh: [] }>()
const reason = ref(''); const confirmation = ref(''); const pending = ref(false); const error = ref<string | null>(null)
const model = computed({ get: () => props.open, set: value => emit('update:open', value) })
const action = computed(() => props.item?.origin === 'cloudflare_transport' ? 'transport_retry' : 'confirmation_reconcile')
const canSubmit = computed(() => Boolean(props.item && reason.value.trim().length >= 10 && confirmation.value === 'RECOVER CRM SEARCH DEAD LETTER' && !pending.value))
function close() { model.value = false }
watch(() => props.open, open => { if (open) { reason.value = ''; confirmation.value = ''; error.value = null } })

async function submit() {
  if (!props.item || !canSubmit.value) return
  pending.value = true; error.value = null
  try {
    await $fetch(`/api/admin/crm-search/dead-letters/${props.item.id}`, { method: 'POST', body: {
      origin: props.item.origin, action: action.value,
      expectedRevision: props.item.revision, expectedGeneration: props.item.generation,
      reason: reason.value.trim(), confirmation: confirmation.value
    } })
    emit('changed'); model.value = false
  } catch (caught) {
    const response = caught as CrmSearchOperationError
    const code = response.data?.code ?? response.data?.data?.code
    if (code === 'crm_search_stale_revision') {
      error.value = 'Dead-letter evidence changed. The latest revision and generation are being refreshed.'
      emit('refresh')
    } else error.value = 'The origin-specific recovery request was not admitted.'
  }
  finally { pending.value = false }
}
</script>

<template>
  <UModal v-model:open="model" title="Recover dead-letter work" description="Review the failure origin before creating durable recovery work.">
    <template #body><div class="@container space-y-4">
      <UAlert v-if="item" color="warning" variant="soft" title="Failure evidence" :description="`${item.origin} · ${item.errorClass} · ${item.attempts} attempts`" />
      <p class="text-sm text-muted">cloudflare_transport permits transport_retry. provider_confirmation permits confirmation_reconcile.</p>
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Origin-specific action"><UInput :model-value="action" disabled class="w-full" /></UFormField>
        <UFormField label="Expected revision"><UInput :model-value="String(item?.revision ?? 0)" disabled class="w-full" /></UFormField>
        <UFormField label="Expected generation"><UInput :model-value="String(item?.generation ?? 0)" disabled class="w-full" /></UFormField>
        <UFormField label="Audit reason" class="@lg:col-span-2"><UTextarea v-model="reason" :rows="3" class="w-full" /></UFormField>
        <UFormField label="Type RECOVER CRM SEARCH DEAD LETTER" class="@lg:col-span-2"><UInput v-model="confirmation" autocomplete="off" class="w-full" /></UFormField>
      </div>
      <UAlert v-if="error" color="error" variant="soft" title="Recovery request unavailable" :description="error" />
    </div></template>
    <template #footer><div class="flex w-full justify-between gap-2"><UButton color="neutral" variant="ghost" @click="close">Cancel</UButton><UButton color="warning" :loading="pending" :disabled="!canSubmit" @click="submit">Create recovery work</UButton></div></template>
  </UModal>
</template>
