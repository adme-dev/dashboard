<template>
  <div class="min-h-[28px] flex items-center" @click.stop>
    <div
      class="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium min-w-[80px] justify-center"
      :style="currentStyle"
    >
      <UIcon v-if="statusIcon" :name="statusIcon" class="w-3.5 h-3.5" />
      {{ currentLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CustomColumn, TaskColumnValue } from '~/types'

const INVOICE_STATUSES: Record<string, { label: string; color: string; icon: string }> = {
  'not_billed': { label: 'Not Billed', color: '#C4C4C4', icon: 'i-lucide-circle' },
  'in_eom_queue': { label: 'In EOM Queue', color: '#579BFC', icon: 'i-lucide-clock' },
  'in_review': { label: 'In Review', color: '#FDAB3D', icon: 'i-lucide-eye' },
  'draft_in_xero': { label: 'DRAFT in Xero', color: '#FF642E', icon: 'i-lucide-file-text' },
  'authorised': { label: 'AUTHORISED', color: '#00C875', icon: 'i-lucide-check' },
  'paid': { label: 'PAID', color: '#037F4C', icon: 'i-lucide-check-check' },
}

const props = defineProps<{
  column: CustomColumn
  value: TaskColumnValue | null
  taskId: string
  readonly?: boolean
}>()

defineEmits<{
  update: [payload: any]
  editColumn: []
}>()

const statusKey = computed(() => {
  return props.value?.textValue || props.value?.jsonValue?.status || 'not_billed'
})

const statusDef = computed(() => INVOICE_STATUSES[statusKey.value] || INVOICE_STATUSES['not_billed'])

const currentLabel = computed(() => statusDef.value.label)
const statusIcon = computed(() => statusDef.value.icon)

const currentStyle = computed(() => {
  const color = statusDef.value.color
  return {
    backgroundColor: color,
    color: getContrastColor(color),
  }
})

function getContrastColor(hex: string): string {
  if (!hex || hex === '#C4C4C4') return '#333333'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#333333' : '#ffffff'
}
</script>
