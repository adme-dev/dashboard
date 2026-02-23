<template>
  <div class="nb-table-container" :class="{ 'nb-grid': showGrid }">
    <table class="nb-table">
      <thead v-if="columns.length">
        <tr>
          <th 
            v-for="col in columns" 
            :key="String(col.key)"
            :class="{ 
              'cursor-pointer hover:text-white': col.sortable,
              'text-right': col.align === 'right',
              'text-center': col.align === 'center'
            }"
            @click="col.sortable && handleSort(col)"
          >
            <div class="flex items-center gap-1" :class="{
              'justify-end': col.align === 'right',
              'justify-center': col.align === 'center'
            }">
              {{ col.label }}
              <span v-if="col.sortable" class="text-xs">
                <UIcon 
                  v-if="sortKey === col.key"
                  :name="sortOrder === 'asc' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  class="w-3 h-3"
                />
                <UIcon v-else name="i-lucide-chevrons-up-down" class="w-3 h-3 opacity-30" />
              </span>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in sortedData" :key="getRowKey(row, index)">
          <td 
            v-for="col in columns" 
            :key="String(col.key)"
            :class="{
              'nb-table-mono': col.monospace,
              'text-right': col.align === 'right',
              'text-center': col.align === 'center'
            }"
          >
            <slot 
              :name="`cell-${String(col.key)}`" 
              :row="row" 
              :value="getRowValue(row, col.key)"
              :index="index"
            >
              {{ getRowValue(row, col.key) }}
            </slot>
          </td>
        </tr>
        <tr v-if="!sortedData.length">
          <td :colspan="columns.length" class="text-center py-8 text-tertiary">
            <slot name="empty">
              No data available
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts" generic="T extends Record<string, any>">
interface Column {
  key: keyof T | string
  label: string
  sortable?: boolean
  monospace?: boolean
  align?: 'left' | 'right' | 'center'
}

interface Props {
  columns: Column[]
  data: T[]
  showGrid?: boolean
  rowKey?: keyof T | ((row: T) => string)
  defaultSort?: { key: string; order: 'asc' | 'desc' }
}

const props = withDefaults(defineProps<Props>(), {
  showGrid: false,
  columns: () => []
})

const sortKey = ref<string | null>(props.defaultSort?.key ?? null)
const sortOrder = ref<'asc' | 'desc'>(props.defaultSort?.order ?? 'asc')

function getRowValue(row: T, key: Column['key']): any {
  const keys = String(key).split('.')
  let value: any = row
  for (const k of keys) {
    value = value?.[k]
  }
  return value
}

function getRowKey(row: T, index: number): string {
  if (typeof props.rowKey === 'function') {
    return props.rowKey(row)
  }
  if (typeof props.rowKey === 'string') {
    return String(row[props.rowKey] ?? index)
  }
  return String(row.id ?? row.key ?? index)
}

function handleSort(col: Column) {
  if (sortKey.value === col.key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = String(col.key)
    sortOrder.value = 'asc'
  }
}

const sortedData = computed(() => {
  if (!sortKey.value) return props.data
  
  const key = sortKey.value
  const order = sortOrder.value
  
  return [...props.data].sort((a, b) => {
    const aVal = getRowValue(a, key)
    const bVal = getRowValue(b, key)
    
    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return order === 'asc' ? aVal - bVal : bVal - aVal
    }
    
    const aStr = String(aVal).toLowerCase()
    const bStr = String(bVal).toLowerCase()
    
    if (order === 'asc') {
      return aStr < bStr ? -1 : aStr > bStr ? 1 : 0
    } else {
      return aStr > bStr ? -1 : aStr < bStr ? 1 : 0
    }
  })
})
</script>
