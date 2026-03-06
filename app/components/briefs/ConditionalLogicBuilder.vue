<script setup lang="ts">
import type { BriefFieldCondition, BriefTemplateField } from '~/types'

const props = defineProps<{
  modelValue: BriefFieldCondition | null
  availableFields: BriefTemplateField[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: BriefFieldCondition | null]
}>()

const enabled = ref(!!props.modelValue)

const condition = ref<BriefFieldCondition>(props.modelValue || {
  fieldKey: '',
  operator: 'equals',
  value: '',
  action: 'show'
})

watch(() => props.modelValue, (val) => {
  if (val) {
    condition.value = { ...val }
    enabled.value = true
  }
}, { deep: true })

watch(enabled, (val) => {
  if (!val) {
    emit('update:modelValue', null)
  }
})

function updateCondition() {
  if (!enabled.value) return
  if (!condition.value.fieldKey) return
  emit('update:modelValue', { ...condition.value })
}

// Filter to only show fields that have user-inputtable values (exclude layout fields)
const eligibleFields = computed(() =>
  props.availableFields.filter(f =>
    !['heading', 'paragraph', 'divider'].includes(f.fieldType)
  )
)

const operatorOptions = [
  { label: 'Equals', value: 'equals' },
  { label: 'Not Equals', value: 'not_equals' },
  { label: 'Contains', value: 'contains' },
  { label: 'Not Contains', value: 'not_contains' },
  { label: 'Is Empty', value: 'is_empty' },
  { label: 'Is Not Empty', value: 'is_not_empty' }
]

const actionOptions = [
  { label: 'Show this field', value: 'show' },
  { label: 'Hide this field', value: 'hide' },
  { label: 'Make required', value: 'require' },
  { label: 'Make optional', value: 'unrequire' }
]

const fieldOptions = computed(() =>
  eligibleFields.value.map(f => ({ label: f.fieldLabel, value: f.fieldKey }))
)

const needsValue = computed(() =>
  !['is_empty', 'is_not_empty'].includes(condition.value.operator)
)
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium text-highlighted">Conditional Logic</span>
      <UCheckbox v-model="enabled" label="Enable" />
    </div>

    <template v-if="enabled">
      <div class="space-y-2 pl-2 border-l-2 border-primary/30">
        <UFormField label="When field">
          <USelectMenu
            v-model="condition.fieldKey"
            :items="fieldOptions"
            value-key="value"
            placeholder="Select a field"
            class="w-full"
            @update:model-value="updateCondition()"
          />
        </UFormField>

        <UFormField label="Operator">
          <USelectMenu
            v-model="condition.operator"
            :items="operatorOptions"
            value-key="value"
            class="w-full"
            @update:model-value="updateCondition()"
          />
        </UFormField>

        <UFormField v-if="needsValue" label="Value">
          <UInput
            v-model="condition.value"
            placeholder="Enter value"
            class="w-full"
            @blur="updateCondition()"
          />
        </UFormField>

        <UFormField label="Then">
          <USelectMenu
            v-model="condition.action"
            :items="actionOptions"
            value-key="value"
            class="w-full"
            @update:model-value="updateCondition()"
          />
        </UFormField>
      </div>
    </template>
  </div>
</template>
