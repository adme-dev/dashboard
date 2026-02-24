<template>
  <div class="w-80 p-3">
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm font-medium text-gray-700">Filters</span>
      <button v-if="modelValue.length" class="text-xs text-blue-600 hover:text-blue-700" @click="$emit('update:modelValue', [])">
        Clear all
      </button>
    </div>

    <!-- Active filters -->
    <div v-if="modelValue.length" class="space-y-2 mb-3">
      <div
        v-for="rule in modelValue"
        :key="rule.id"
        class="flex items-center gap-2 bg-gray-50 rounded-md px-2 py-1.5 text-sm"
      >
        <span class="font-medium text-gray-700 truncate max-w-[80px]">{{ columnName(rule.columnId) }}</span>
        <span class="text-gray-500">{{ operatorLabel(rule) }}</span>
        <span v-if="showsValue(rule.operator, ruleColumnType(rule))" class="text-gray-900 truncate max-w-[80px]">{{ displayValue(rule) }}</span>
        <button class="ml-auto text-gray-400 hover:text-gray-600 shrink-0" @click="removeFilter(rule.id)">
          <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Add filter row -->
    <div class="space-y-2 border-t pt-3">
      <select v-model="newRule.columnId" class="w-full text-sm border rounded-md px-2 py-1.5 bg-white">
        <option value="">Select column...</option>
        <option v-for="col in columns" :key="col.id" :value="col.id">{{ col.name }}</option>
      </select>

      <select
        v-if="newRule.columnId"
        v-model="newRule.operator"
        class="w-full text-sm border rounded-md px-2 py-1.5 bg-white"
      >
        <option v-for="op in availableOperators" :key="op.value" :value="op.value">{{ op.label }}</option>
      </select>

      <!-- Value input -->
      <template v-if="newRule.columnId && newRule.operator && showsValue(newRule.operator)">
        <!-- Status/Dropdown: select from options -->
        <select
          v-if="selectedColumnType === 'status' || selectedColumnType === 'dropdown'"
          v-model="newRule.value"
          class="w-full text-sm border rounded-md px-2 py-1.5 bg-white"
        >
          <option value="">Select value...</option>
          <option v-for="opt in selectedColumnOptions" :key="opt.value || opt.id" :value="opt.value || opt.id">
            {{ opt.label || opt.name }}
          </option>
        </select>

        <!-- Number -->
        <UInput
          v-else-if="selectedColumnType === 'number'"
          v-model="newRule.value"
          type="number"
          placeholder="Value..."
          size="sm"
        />

        <!-- Date -->
        <input
          v-else-if="selectedColumnType === 'date' || selectedColumnType === 'timeline'"
          v-model="newRule.value"
          type="date"
          class="w-full text-sm border rounded-md px-2 py-1.5"
        />

        <!-- Text (default) -->
        <UInput
          v-else
          v-model="newRule.value"
          placeholder="Value..."
          size="sm"
        />
      </template>

      <UButton
        v-if="newRule.columnId && newRule.operator"
        size="sm"
        color="primary"
        variant="soft"
        block
        :disabled="showsValue(newRule.operator) && !newRule.value && newRule.value !== 0"
        @click="addFilter"
      >
        Add filter
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BoardColumn, FilterRule } from '~/composables/useBoardData'

const props = defineProps<{
  columns: BoardColumn[]
}>()

const modelValue = defineModel<FilterRule[]>({ default: () => [] })

const operatorsByType: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  number: [
    { value: 'is', label: '=' },
    { value: 'is_not', label: '\u2260' },
    { value: 'gt', label: '>' },
    { value: 'lt', label: '<' },
    { value: 'gte', label: '\u2265' },
    { value: 'lte', label: '\u2264' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  date: [
    { value: 'is', label: 'is' },
    { value: 'is_before', label: 'is before' },
    { value: 'is_after', label: 'is after' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  status: [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  checkbox: [
    { value: 'is', label: 'is checked' },
    { value: 'is_not', label: 'is not checked' },
  ],
  people: [
    { value: 'contains', label: 'contains' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
}

const typeMapping: Record<string, string> = {
  long_text: 'text',
  timeline: 'date',
  dropdown: 'status',
  priority: 'status',
  label: 'status',
}

function getOperatorGroup(type: string): string {
  return typeMapping[type] || type
}

const newRule = ref<{ columnId: string; operator: string; value: any }>({
  columnId: '',
  operator: '',
  value: '',
})

const selectedColumn = computed(() => (props.columns || []).find(c => c.id === newRule.value.columnId))
const selectedColumnType = computed(() => {
  if (!selectedColumn.value) return 'text'
  return selectedColumn.value.columnType || selectedColumn.value.type
})
const selectedColumnOptions = computed(() => selectedColumn.value?.settings?.options || [])

const availableOperators = computed(() => {
  const group = getOperatorGroup(selectedColumnType.value)
  return operatorsByType[group] || operatorsByType.text
})

// Reset operator/value when column changes
watch(() => newRule.value.columnId, () => {
  newRule.value.operator = ''
  newRule.value.value = ''
})

function showsValue(operator: string, columnType?: string): boolean {
  const type = columnType || selectedColumnType.value
  if (['is_empty', 'is_not_empty'].includes(operator)) return false
  if (['is', 'is_not'].includes(operator) && type === 'checkbox') return false
  return true
}

function columnName(columnId: string): string {
  return (props.columns || []).find(c => c.id === columnId)?.name || 'Unknown'
}

function ruleColumnType(rule: FilterRule): string {
  const col = (props.columns || []).find(c => c.id === rule.columnId)
  return col?.columnType || col?.type || 'text'
}

function operatorLabel(rule: FilterRule): string {
  const col = (props.columns || []).find(c => c.id === rule.columnId)
  const type = col?.columnType || col?.type || 'text'
  const group = getOperatorGroup(type)
  const ops = operatorsByType[group] || operatorsByType.text
  return ops.find(o => o.value === rule.operator)?.label || rule.operator
}

function displayValue(rule: FilterRule): string {
  const col = (props.columns || []).find(c => c.id === rule.columnId)
  const type = col?.columnType || col?.type || 'text'
  if (type === 'status' || type === 'dropdown' || type === 'priority' || type === 'label') {
    const opt = col?.settings?.options?.find((o: any) => (o.value || o.id) === rule.value)
    if (opt) return opt.label || opt.name || rule.value
  }
  return String(rule.value || '')
}

function addFilter() {
  const rules = [...modelValue.value]
  rules.push({
    id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    columnId: newRule.value.columnId,
    operator: newRule.value.operator,
    value: newRule.value.value,
  })
  modelValue.value = rules
  newRule.value = { columnId: '', operator: '', value: '' }
}

function removeFilter(id: string) {
  modelValue.value = modelValue.value.filter(r => r.id !== id)
}
</script>
