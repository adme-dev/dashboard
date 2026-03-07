<template>
  <div class="min-h-[28px] flex items-center gap-2 w-full" @click.stop="startEditing">
    <template v-if="editing">
      <input
        ref="inputRef"
        v-model.number="localValue"
        type="number"
        step="0.01"
        min="0"
        class="w-full px-1 py-0.5 text-sm border border-gray-200 dark:border-neutral-700 rounded outline-none focus:border-blue-500 bg-white dark:bg-neutral-800 dark:text-neutral-100 text-right"
        @blur="save"
        @keydown.enter="save"
        @keydown.escape="cancel"
        @click.stop
      />
    </template>
    <template v-else>
      <!-- Progress bar when we have both estimated and actual -->
      <div v-if="estimated > 0" class="flex items-center gap-2 w-full">
        <UTooltip v-if="budgetSource && budgetSource !== 'manual'" :text="sourceTooltip">
          <UIcon :name="sourceIcon" class="size-3.5 text-gray-400 dark:text-neutral-500 shrink-0" />
        </UTooltip>
        <UTooltip :text="tooltipText">
          <div class="flex-1 bg-gray-200 dark:bg-neutral-700 rounded-full h-2 min-w-[40px] cursor-pointer">
            <div
              class="h-2 rounded-full transition-all"
              :class="barColor"
              :style="{ width: `${Math.min(spendPercent, 100)}%` }"
            />
          </div>
        </UTooltip>
        <span class="text-xs whitespace-nowrap" :class="textColor">
          {{ formattedEstimated }}
        </span>
      </div>
      <!-- Just the amount when no estimated cost -->
      <span v-else class="text-sm text-gray-700 dark:text-neutral-300 truncate cursor-text hover:bg-gray-100 dark:hover:bg-neutral-800 px-1 py-0.5 rounded w-full text-right">
        {{ formattedEstimated || '-' }}
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { CustomColumn, TaskColumnValue } from '~/types'

const props = defineProps<{
  column: CustomColumn
  value: TaskColumnValue | null
  taskId: string
  readonly?: boolean
}>()

const emit = defineEmits<{ update: [payload: any] }>()

const editing = ref(false)
const localValue = ref<number | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

const currencyCode = computed(() => props.value?.jsonValue?.currency || props.column.settings?.currencyCode || 'AUD')
const budgetSource = computed(() => props.value?.jsonValue?.budgetSource || null)

const SOURCE_ICONS: Record<string, string> = {
  quote: 'i-lucide-receipt',
  brief: 'i-lucide-file-text',
  invoice: 'i-lucide-file-check',
  rate_card: 'i-lucide-credit-card',
}
const SOURCE_LABELS: Record<string, string> = {
  quote: 'From quote',
  brief: 'From brief',
  invoice: 'From invoice',
  rate_card: 'From rate card',
}
const sourceIcon = computed(() => budgetSource.value ? SOURCE_ICONS[budgetSource.value] || 'i-lucide-link' : 'i-lucide-link')
const sourceTooltip = computed(() => budgetSource.value ? SOURCE_LABELS[budgetSource.value] || 'Linked budget' : 'Linked budget')
const estimated = computed(() => {
  const n = props.value?.numberValue
  return n != null ? Number(n) : 0
})
const actual = computed(() => {
  const n = props.value?.jsonValue?.actualCost
  return n != null ? Number(n) : 0
})

const spendPercent = computed(() => {
  if (estimated.value <= 0) return 0
  return Math.round((actual.value / estimated.value) * 100)
})

const barColor = computed(() => {
  if (spendPercent.value > 100) return 'bg-red-500'
  if (spendPercent.value > 80) return 'bg-amber-500'
  return 'bg-emerald-500'
})

const textColor = computed(() => {
  if (spendPercent.value > 100) return 'text-red-500 font-semibold'
  if (spendPercent.value > 80) return 'text-amber-500'
  return 'text-gray-500 dark:text-neutral-400'
})

function formatCurrency(amount: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode.value,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currencyCode.value} ${amount.toFixed(0)}`
  }
}

const formattedEstimated = computed(() => {
  if (estimated.value <= 0) return '-'
  return formatCurrency(estimated.value)
})

const tooltipText = computed(() => {
  if (estimated.value <= 0) return 'No budget set'
  return `Spent ${formatCurrency(actual.value)} of ${formatCurrency(estimated.value)} (${spendPercent.value}%)`
})

function startEditing() {
  if (props.readonly) return
  localValue.value = estimated.value > 0 ? estimated.value : null
  editing.value = true
  nextTick(() => inputRef.value?.focus())
}

function save() {
  editing.value = false
  if ((localValue.value || 0) !== (estimated.value || 0)) {
    emit('update', { numberValue: localValue.value })
  }
}

function cancel() {
  editing.value = false
}
</script>
