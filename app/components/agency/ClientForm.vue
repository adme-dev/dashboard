<script setup lang="ts">
import type { BillingType } from '~/types'

const props = defineProps<{
  client?: {
    id?: string
    name: string
    billingType: BillingType
    retainerAmount?: number
    paymentTerms: number
    hourlyRate?: number
    mediaCommissionRate?: number
    notes?: string
  }
}>()

const emit = defineEmits<{
  submit: [data: typeof form]
  cancel: []
}>()

// Form state
const form = reactive({
  name: props.client?.name || '',
  billingType: props.client?.billingType || 'project' as BillingType,
  retainerAmount: props.client?.retainerAmount || undefined,
  paymentTerms: props.client?.paymentTerms || 30,
  hourlyRate: props.client?.hourlyRate || undefined,
  mediaCommissionRate: props.client?.mediaCommissionRate || undefined,
  notes: props.client?.notes || ''
})

const isEditing = computed(() => !!props.client?.id)

// Billing type options
const billingTypeOptions = [
  { label: 'Project-Based', value: 'project', description: 'Bill per project with fixed or T&M pricing' },
  { label: 'Retainer', value: 'retainer', description: 'Monthly recurring fee for ongoing work' },
  { label: 'Hybrid', value: 'hybrid', description: 'Retainer plus additional project work' },
  { label: 'Commission', value: 'commission', description: 'Based on media spend commission' }
]

// Show retainer fields
const showRetainerFields = computed(() =>
  form.billingType === 'retainer' || form.billingType === 'hybrid'
)

// Show commission fields
const showCommissionFields = computed(() =>
  form.billingType === 'commission' || form.billingType === 'hybrid'
)

// Payment terms options
const paymentTermsOptions = [
  { label: 'Due on Receipt', value: 0 },
  { label: 'Net 15', value: 15 },
  { label: 'Net 30', value: 30 },
  { label: 'Net 45', value: 45 },
  { label: 'Net 60', value: 60 }
]

// Validation
const errors = ref<Record<string, string>>({})

const validate = () => {
  errors.value = {}

  if (!form.name.trim()) {
    errors.value.name = 'Client name is required'
  }

  if (showRetainerFields.value && (!form.retainerAmount || form.retainerAmount <= 0)) {
    errors.value.retainerAmount = 'Retainer amount is required for this billing type'
  }

  if (showCommissionFields.value && (!form.mediaCommissionRate || form.mediaCommissionRate <= 0)) {
    errors.value.mediaCommissionRate = 'Commission rate is required for this billing type'
  }

  return Object.keys(errors.value).length === 0
}

// Submit handler
const loading = ref(false)

const handleSubmit = async () => {
  if (!validate()) return

  loading.value = true

  try {
    // In production, call API to save
    // await $fetch('/api/agency/clients', {
    //   method: isEditing.value ? 'PUT' : 'POST',
    //   body: form
    // })

    emit('submit', { ...form })
  } catch (error) {
    console.error('Failed to save client:', error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-6">
    <!-- Client Name -->
    <UFormGroup label="Client Name" :error="errors.name" required>
      <UInput
        v-model="form.name"
        placeholder="Enter client name"
        :disabled="loading"
      />
    </UFormGroup>

    <!-- Billing Type -->
    <UFormGroup label="Billing Type" required>
      <URadioGroup
        v-model="form.billingType"
        :items="billingTypeOptions"
        :disabled="loading"
      />
    </UFormGroup>

    <!-- Retainer Amount (conditional) -->
    <UFormGroup
      v-if="showRetainerFields"
      label="Monthly Retainer"
      :error="errors.retainerAmount"
      required
    >
      <UInput
        v-model.number="form.retainerAmount"
        type="number"
        min="0"
        step="100"
        placeholder="0"
        :disabled="loading"
      >
        <template #leading>
          <span class="text-gray-500">$</span>
        </template>
        <template #trailing>
          <span class="text-gray-500">/month</span>
        </template>
      </UInput>
    </UFormGroup>

    <!-- Media Commission Rate (conditional) -->
    <UFormGroup
      v-if="showCommissionFields"
      label="Media Commission Rate"
      :error="errors.mediaCommissionRate"
      required
    >
      <UInput
        v-model.number="form.mediaCommissionRate"
        type="number"
        min="0"
        max="100"
        step="0.5"
        placeholder="15"
        :disabled="loading"
      >
        <template #trailing>
          <span class="text-gray-500">%</span>
        </template>
      </UInput>
      <template #hint>
        <span class="text-xs text-gray-500">Industry standard: 10-15%</span>
      </template>
    </UFormGroup>

    <!-- Default Hourly Rate -->
    <UFormGroup label="Default Hourly Rate">
      <UInput
        v-model.number="form.hourlyRate"
        type="number"
        min="0"
        step="5"
        placeholder="150"
        :disabled="loading"
      >
        <template #leading>
          <span class="text-gray-500">$</span>
        </template>
        <template #trailing>
          <span class="text-gray-500">/hour</span>
        </template>
      </UInput>
      <template #hint>
        <span class="text-xs text-gray-500">Used for time-based billing if not specified per project</span>
      </template>
    </UFormGroup>

    <!-- Payment Terms -->
    <UFormGroup label="Payment Terms">
      <USelectMenu
        v-model="form.paymentTerms"
        :options="paymentTermsOptions"
        :disabled="loading"
      />
    </UFormGroup>

    <!-- Notes -->
    <UFormGroup label="Notes">
      <UTextarea
        v-model="form.notes"
        placeholder="Internal notes about this client..."
        :rows="3"
        :disabled="loading"
      />
    </UFormGroup>

    <!-- Actions -->
    <div class="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        :disabled="loading"
        @click="emit('cancel')"
      />
      <UButton
        :label="isEditing ? 'Update Client' : 'Create Client'"
        type="submit"
        color="primary"
        :loading="loading"
      />
    </div>
  </form>
</template>
