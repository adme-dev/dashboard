<template>
  <div class="flex items-center bg-gray-50/30 dark:bg-neutral-800/30 text-xs text-gray-500 dark:text-neutral-400 border-t border-gray-200 dark:border-neutral-700">
    <div class="w-10 px-2 py-2 border-r border-gray-200 dark:border-neutral-700"></div>
    <div class="flex-1 min-w-[250px] px-4 py-2 border-r border-gray-200 dark:border-neutral-700 font-medium">
      {{ itemCount }} item{{ itemCount !== 1 ? 's' : '' }}
    </div>
    <div
      v-for="col in columns"
      :key="col.id"
      class="px-4 py-2 border-r border-gray-200 dark:border-neutral-700"
      :style="{ width: (col.width || 150) + 'px' }"
    >
      <span v-if="aggregations[col.id]" class="font-medium">
        {{ aggregations[col.id] }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ColumnDef {
  id: string
  slug: string
  type: string
  columnType?: string
  width?: number
  settings?: any
}

interface BoardItem {
  id: string
  columnValues?: Record<string, any>
  columnValuesArray?: any[]
}

const props = defineProps<{
  columns: ColumnDef[]
  items: BoardItem[]
}>()

const itemCount = computed(() => props.items.length)

const aggregations = computed(() => {
  const result: Record<string, string> = {}

  for (const col of props.columns) {
    const colType = col.columnType || col.type

    if (colType === 'number' || colType === 'currency') {
      let sum = 0
      let count = 0
      for (const item of props.items) {
        const cv = item.columnValues?.[col.slug]
        const val = cv?.numberValue ?? cv?.number_value
        if (val != null) {
          sum += Number(val)
          count++
        }
      }
      if (count > 0) {
        if (colType === 'currency') {
          const code = col.settings?.currencyCode || 'USD'
          try {
            result[col.id] = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: code,
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            }).format(sum)
          } catch {
            result[col.id] = `${sum}`
          }
        } else {
          result[col.id] = `Σ ${sum}`
        }
      }
    } else if (colType === 'progress') {
      let sum = 0
      let count = 0
      for (const item of props.items) {
        const cv = item.columnValues?.[col.slug]
        const val = cv?.numberValue ?? cv?.number_value
        if (val != null) {
          sum += Number(val)
          count++
        }
      }
      if (count > 0) {
        result[col.id] = `${Math.round(sum / count)}% avg`
      }
    } else if (colType === 'checkbox') {
      let checked = 0
      for (const item of props.items) {
        const cv = item.columnValues?.[col.slug]
        const val = cv?.numberValue ?? cv?.number_value
        if (val === 1) checked++
      }
      if (props.items.length > 0) {
        result[col.id] = `${checked}/${props.items.length}`
      }
    } else if (colType === 'rating') {
      let sum = 0
      let count = 0
      for (const item of props.items) {
        const cv = item.columnValues?.[col.slug]
        const val = cv?.numberValue ?? cv?.number_value
        if (val != null && val > 0) {
          sum += Number(val)
          count++
        }
      }
      if (count > 0) {
        result[col.id] = `★ ${(sum / count).toFixed(1)}`
      }
    }
  }

  return result
})
</script>
