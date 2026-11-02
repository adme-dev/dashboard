<script setup lang="ts">
import type {
  ConditionPredicate,
  ConditionField
} from '~~/shared/emailRendering/conditions'

defineOptions({ name: 'EmailBuilderEdmConditionPredicateEditor' })

const props = withDefaults(
  defineProps<{ modelValue: ConditionPredicate, depth?: number }>(),
  { depth: 1 }
)
const emit = defineEmits<{ 'update:modelValue': [value: ConditionPredicate] }>()
const fields = [
  { label: 'Email address', value: 'email' },
  { label: 'Full name', value: 'name' },
  { label: 'First name', value: 'first_name' }
]
const operators = [
  { label: 'Has a value', value: 'exists' },
  { label: 'Equals', value: 'equals' },
  { label: 'Does not equal', value: 'not-equals' },
  { label: 'Contains', value: 'contains' }
]
const fresh = (): ConditionPredicate => ({ field: 'first_name', op: 'exists' })
function mode(op: string) {
  if (op === 'all' || op === 'any')
    emit('update:modelValue', {
      op,
      terms:
        'terms' in props.modelValue
          ? props.modelValue.terms
          : [props.modelValue]
    })
  else emit('update:modelValue', fresh())
}
function field(value: string) {
  if ('field' in props.modelValue)
    emit('update:modelValue', {
      ...props.modelValue,
      field: value as ConditionField
    })
}
function operator(op: string) {
  if (!('field' in props.modelValue)) return
  emit(
    'update:modelValue',
    op === 'exists'
      ? { field: props.modelValue.field, op }
      : {
          field: props.modelValue.field,
          op: op as 'equals',
          value: 'value' in props.modelValue ? props.modelValue.value : ''
        }
  )
}
function operand(value: string) {
  if ('value' in props.modelValue)
    emit('update:modelValue', { ...props.modelValue, value })
}
function term(index: number, value?: ConditionPredicate) {
  if (!('terms' in props.modelValue)) return
  const terms = [...props.modelValue.terms]
  if (value) terms[index] = value
  else terms.splice(index, 1)
  emit('update:modelValue', { ...props.modelValue, terms })
}
function add() {
  if ('terms' in props.modelValue)
    emit('update:modelValue', {
      ...props.modelValue,
      terms: [...props.modelValue.terms, fresh()]
    })
}
</script>

<template>
  <div class="@container space-y-3">
    <UFormField v-if="depth < 4" label="Match">
      <USelect
        :model-value="'terms' in modelValue ? modelValue.op : 'rule'"
        :items="[
          { label: 'One rule', value: 'rule' },
          { label: 'All rules', value: 'all' },
          { label: 'Any rule', value: 'any' }
        ]"
        class="w-full"
        @update:model-value="mode(String($event))"
      />
    </UFormField>
    <template v-if="'terms' in modelValue">
      <div
        v-for="(rule, index) in modelValue.terms"
        :key="index"
        class="border-l-2 border-default pl-3 space-y-2"
      >
        <EmailBuilderEdmConditionPredicateEditor
          :model-value="rule"
          :depth="depth + 1"
          @update:model-value="term(index, $event)"
        />
        <UButton
          v-if="modelValue.terms.length > 1"
          label="Remove rule"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="term(index)"
        />
      </div>
      <UButton
        v-if="modelValue.terms.length < 8 && depth < 4"
        label="Add rule"
        icon="i-lucide-plus"
        variant="soft"
        size="xs"
        @click="add"
      />
    </template>
    <template v-else>
      <div class="grid grid-cols-1 gap-3 @lg:grid-cols-2">
        <UFormField label="Recipient field">
          <USelect
            :model-value="modelValue.field"
            :items="fields"
            class="w-full"
            @update:model-value="field(String($event))"
          />
        </UFormField>
        <UFormField label="Rule">
          <USelect
            :model-value="modelValue.op"
            :items="operators"
            class="w-full"
            @update:model-value="operator(String($event))"
          />
        </UFormField>
      </div>
      <UFormField
        v-if="'value' in modelValue"
        label="Compare with"
        help="Exact, case-sensitive text. Empty recipient values never match."
      >
        <UInput
          :model-value="modelValue.value"
          :maxlength="200"
          class="w-full"
          @update:model-value="operand(String($event))"
        />
      </UFormField>
    </template>
  </div>
</template>
