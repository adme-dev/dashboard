<script setup lang="ts">
// Create/edit slideover for a config-object record (distinct from RecordSlideover.vue).
import type { CrmFieldDef } from '~/types/crm'
const props = defineProps<{ open: boolean, fields: CrmFieldDef[], clientId: string, record?: Record<string, unknown> | null }>()
const emit = defineEmits<{ 'update:open': [boolean], save: [Record<string, unknown>] }>()
const form = ref<Record<string, unknown>>({ ...(props.record ?? {}) })
watch(() => props.record, r => { form.value = { ...(r ?? {}) } })
const saving = ref(false)
async function onSave() {
  saving.value = true
  try { emit('save', { ...form.value }) }
  finally { saving.value = false }
}
</script>

<template>
  <USlideover :open="open" :title="record && Object.keys(record).length ? 'Edit record' : 'New record'" @update:open="emit('update:open', $event)">
    <template #body>
      <CrmEngineRecordForm v-model="form" :fields="fields" :client-id="clientId" />
      <template v-if="record && (record as any).id">
        <USeparator class="my-4" />
        <CrmAuditHistory :client-id="clientId" entity-type="record" :entity-id="(record as any).id" />
      </template>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" color="neutral" @click="emit('update:open', false)">Cancel</UButton>
        <UButton :loading="saving" @click="onSave">Save</UButton>
      </div>
    </template>
  </USlideover>
</template>
