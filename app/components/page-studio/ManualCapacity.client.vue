<script setup lang="ts">
import { z } from 'zod'

const props = defineProps<{ records: Array<Record<string, unknown>> }>()
const emit = defineEmits<{ saved: [] }>()
const { canWrite, hasPermission } = useAuth()
const allowed = computed(() => canWrite.value && hasPermission('PAGE_STUDIO_SUBSCRIPTIONS'))
const Entry = z.object({ id: z.string().uuid(), clientId: z.string().uuid(), clientName: z.string(), siteLimit: z.number().int().min(0), canIncreaseManualCapacity: z.literal(true) })
const entries = computed(() => props.records.flatMap((record) => {
  const entry = Entry.safeParse(record)
  return entry.success ? [entry.data] : []
}))
const open = ref(false)
const selectedId = ref<string>()
const selected = computed(() => entries.value.find(entry => entry.id === selectedId.value))
const limit = ref(2)
const reason = ref('')
const saving = ref(false)
const message = ref('')
const attempt = ref<{ entitlementId: string, body: { requestId: string, clientId: string, expectedSiteLimit: number, siteLimit: number, reason: string } } | null>(null)
watch(selected, (value) => {
  if (value && !attempt.value) limit.value = value.siteLimit + 1
})
function begin() {
  if (!attempt.value) {
    selectedId.value = entries.value[0]?.id
    limit.value = (entries.value[0]?.siteLimit ?? 1) + 1
    reason.value = ''
    message.value = ''
  }
  open.value = true
}
async function save() {
  if (!allowed.value || saving.value) return
  if (!attempt.value) {
    if (!selected.value || !Number.isInteger(limit.value) || limit.value <= selected.value.siteLimit || limit.value > 2147483647 || reason.value.trim().length < 3) {
      message.value = 'Choose a higher whole-number limit and enter a reason.'
      return
    }
    attempt.value = { entitlementId: selected.value.id, body: {
      requestId: crypto.randomUUID(), clientId: selected.value.clientId, expectedSiteLimit: selected.value.siteLimit,
      siteLimit: limit.value, reason: reason.value.trim()
    } }
  }
  const request = attempt.value
  saving.value = true
  message.value = ''
  try {
    const receipt = z.object({ replayed: z.boolean(), entitlement: z.object({
      id: z.string().uuid(), tenantId: z.string(), clientId: z.string().uuid(), previousSiteLimit: z.number().int(), siteLimit: z.number().int()
    }).strict() }).strict().parse(await $fetch(`/api/agency/page-studio/subscriptions/${request.entitlementId}/capacity`, { method: 'POST', body: request.body }))
    if (receipt.entitlement.id !== request.entitlementId || receipt.entitlement.clientId !== request.body.clientId
      || receipt.entitlement.previousSiteLimit !== request.body.expectedSiteLimit || receipt.entitlement.siteLimit !== request.body.siteLimit) throw new Error('Receipt mismatch')
    attempt.value = null
    open.value = false
    emit('saved')
  } catch {
    message.value = 'Capacity change was not confirmed. Retry the same request. If the allowance has changed, refresh this page to review its current value.'
  } finally { saving.value = false }
}
</script>

<template>
  <UButton
    v-if="allowed"
    label="Increase manual capacity"
    variant="outline"
    :disabled="!entries.length && !attempt"
    @click="begin"
  />
  <UModal v-model:open="open" title="Increase manual website capacity" :dismissible="!saving">
    <template #body>
      <div class="space-y-4">
        <UAlert description="Changes manually granted website access only. This does not create a charge or change a financial subscription." />
        <UFormField label="Client allowance" required>
          <USelect
            v-model="selectedId"
            :items="entries.map(entry => ({ label: `${entry.clientName} (${entry.siteLimit} sites)`, value: entry.id }))"
            :disabled="saving || Boolean(attempt)"
            class="w-full"
          />
        </UFormField>
        <UFormField label="New total website limit" required>
          <UInput
            v-model.number="limit"
            type="number"
            :min="(selected?.siteLimit ?? 0) + 1"
            :max="2147483647"
            :disabled="saving || Boolean(attempt)"
          />
        </UFormField>
        <UFormField label="Reason" required>
          <UTextarea
            v-model="reason"
            :maxlength="1000"
            :disabled="saving || Boolean(attempt)"
            class="w-full"
          />
        </UFormField>
        <UAlert v-if="message" color="warning" :title="message" />
      </div>
    </template>
    <template #footer>
      <UButton
        :label="attempt ? 'Retry capacity change' : 'Save capacity increase'"
        :loading="saving"
        :disabled="!allowed || saving"
        @click="save"
      />
    </template>
  </UModal>
</template>
