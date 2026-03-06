<template>
  <component
    :is="cellComponent"
    v-if="cellComponent"
    :column="column"
    :value="value"
    :task-id="taskId"
    :readonly="readonly"
    @update="onUpdate"
    @edit-column="onEditColumn"
  />
  <span v-else class="text-gray-400 dark:text-neutral-500 text-sm">-</span>
</template>

<script setup lang="ts">
import type { CustomColumn, TaskColumnValue } from '~/types'
import CellText from './cells/CellText.vue'
import CellNumber from './cells/CellNumber.vue'
import CellCurrency from './cells/CellCurrency.vue'
import CellDate from './cells/CellDate.vue'
import CellTimeline from './cells/CellTimeline.vue'
import CellStatus from './cells/CellStatus.vue'
import CellDropdown from './cells/CellDropdown.vue'
import CellPeople from './cells/CellPeople.vue'
import CellCheckbox from './cells/CellCheckbox.vue'
import CellRating from './cells/CellRating.vue'
import CellLink from './cells/CellLink.vue'
import CellEmail from './cells/CellEmail.vue'
import CellPhone from './cells/CellPhone.vue'
import CellProgress from './cells/CellProgress.vue'
import CellTags from './cells/CellTags.vue'
import CellColor from './cells/CellColor.vue'
import CellDependency from './cells/CellDependency.vue'
import CellLabel from './cells/CellLabel.vue'
import CellInvoiceStatus from './cells/CellInvoiceStatus.vue'
import CellClient from './cells/CellClient.vue'
import CellLinkedItems from './cells/CellLinkedItems.vue'

const cellComponents: Record<string, any> = {
  text: CellText,
  number: CellNumber,
  currency: CellCurrency,
  date: CellDate,
  timeline: CellTimeline,
  status: CellStatus,
  dropdown: CellDropdown,
  people: CellPeople,
  checkbox: CellCheckbox,
  rating: CellRating,
  link: CellLink,
  email: CellEmail,
  phone: CellPhone,
  progress: CellProgress,
  tags: CellTags,
  color: CellColor,
  dependency: CellDependency,
  label: CellLabel,
  numbers: CellNumber,
  invoice_status: CellInvoiceStatus,
  client: CellClient,
  linked_items: CellLinkedItems,
}

const props = defineProps<{
  column: CustomColumn
  value: TaskColumnValue | null
  taskId: string
  readonly?: boolean
}>()

const emit = defineEmits<{
  update: [columnId: string, payload: any]
  editColumn: [columnId: string]
}>()

const cellComponent = computed(() => {
  const type = props.column.columnType || (props.column as any).type
  return cellComponents[type] || CellText
})

function onUpdate(payload: any) {
  emit('update', props.column.id, payload)
}

function onEditColumn() {
  emit('editColumn', props.column.id)
}
</script>
