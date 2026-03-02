<script setup lang="ts">
import type { EomLineItem } from '~/types'

const props = defineProps<{
  item: EomLineItem
  runId: string
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const toast = useToast()
const { updateItem } = useEom()
const saving = ref(false)

const form = reactive({
  clientName: props.item.clientName,
  description: props.item.description,
  unitAmount: props.item.unitAmount,
  accountCode: props.item.accountCode,
  taxType: props.item.taxType,
  trackingOption1: props.item.trackingOption1 || '',
  reviewNotes: props.item.reviewNotes || '',
  reviewStatus: props.item.reviewStatus,
})

const coaOptions = [
  { value: '205', label: '205 - Graphic Design' },
  { value: '210', label: '210 - Digital Services' },
  { value: '211', label: '211 - Social Media Mgmt' },
  { value: '212', label: '212 - Consulting/Strategy' },
  { value: '215', label: '215 - Photography/Video' },
  { value: '219', label: '219 - Account Mgmt Fee' },
  { value: '220', label: '220 - Media Placement' },
  { value: '225', label: '225 - Print/Production' },
  { value: '330', label: '330 - PPC Passthrough' },
]

const gstOptions = [
  { value: 'GST on Income', label: 'GST on Income (10%)' },
  { value: 'GST Free Expenses', label: 'GST Free Expenses (Meta)' },
  { value: 'GST on Expenses', label: 'GST on Expenses (Google)' },
]

async function handleSave() {
  saving.value = true
  try {
    await updateItem(props.runId, props.item.id, {
      clientName: form.clientName,
      description: form.description,
      unitAmount: form.unitAmount,
      accountCode: form.accountCode,
      taxType: form.taxType,
      trackingOption1: form.trackingOption1,
      reviewNotes: form.reviewNotes,
      reviewStatus: form.reviewStatus as any,
    })
    toast.add({ title: 'Saved', color: 'success' })
    emit('saved')
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

function handleFlag() {
  form.reviewStatus = 'flagged'
  handleSave()
}
</script>

<template>
  <USlideover :open="true" @update:open="emit('close')">
    <template #header>
      <h3 class="font-semibold">Edit Line Item</h3>
    </template>
    <template #body>
      <div class="space-y-4 p-4">
        <UFormField label="Client Name">
          <UInput v-model="form.clientName" />
        </UFormField>
        <UFormField label="Description">
          <UTextarea v-model="form.description" :rows="3" />
        </UFormField>
        <UFormField label="Amount (ex-GST)">
          <UInput v-model.number="form.unitAmount" type="number" step="0.01" />
        </UFormField>
        <UFormField label="Account Code (COA)">
          <USelect v-model="form.accountCode" :items="coaOptions" value-key="value" />
        </UFormField>
        <UFormField label="GST Type">
          <USelect v-model="form.taxType" :items="gstOptions" value-key="value" />
        </UFormField>
        <UFormField label="Tracking Category">
          <UInput v-model="form.trackingOption1" />
        </UFormField>
        <UFormField label="Review Notes">
          <UTextarea v-model="form.reviewNotes" :rows="3" placeholder="Optional notes..." />
        </UFormField>

        <!-- Original values if corrected -->
        <div v-if="item.originalValues" class="border border-default rounded-lg p-3 bg-elevated/50">
          <p class="text-xs font-medium text-muted mb-2">Original Values (before correction)</p>
          <div v-for="(val, key) in item.originalValues" :key="key" class="text-xs">
            <span class="text-muted">{{ key }}:</span> {{ val }}
          </div>
        </div>

        <!-- Matched keyword -->
        <div v-if="item.matchedKeyword" class="text-xs text-muted">
          COA matched on keyword: <strong>{{ item.matchedKeyword }}</strong>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-between p-4">
        <UButton variant="soft" color="error" size="sm" @click="handleFlag">Flag for Review</UButton>
        <div class="flex gap-2">
          <UButton variant="ghost" size="sm" @click="emit('close')">Cancel</UButton>
          <UButton color="primary" size="sm" :loading="saving" @click="handleSave">Save</UButton>
        </div>
      </div>
    </template>
  </USlideover>
</template>
