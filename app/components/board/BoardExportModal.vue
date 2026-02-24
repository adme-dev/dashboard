<script setup lang="ts">
import type { BoardColumn } from '~/composables/useBoardData'

const props = defineProps<{
  boardId: string
  boardName: string
  columns: BoardColumn[]
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const isExporting = ref(false)
const selectedColumns = ref<string[]>([])

// Initialize with all columns selected
watch(isOpen, (val) => {
  if (val) {
    selectedColumns.value = props.columns.map(c => c.slug)
  }
})

const allSelected = computed({
  get: () => selectedColumns.value.length === props.columns.length,
  set: (val: boolean) => {
    selectedColumns.value = val ? props.columns.map(c => c.slug) : []
  },
})

async function exportCSV() {
  if (isExporting.value) return
  isExporting.value = true

  try {
    const params = new URLSearchParams()
    if (selectedColumns.value.length < props.columns.length) {
      params.set('columns', selectedColumns.value.join(','))
    }

    const url = `/api/agency/boards/${props.boardId}/export?${params}`
    const link = document.createElement('a')
    link.href = url
    link.download = `${props.boardName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    isOpen.value = false

    useToast().add({
      title: 'Export started',
      description: 'Your CSV download should begin shortly',
      icon: 'i-lucide-download',
      color: 'success',
    })
  } catch (error: any) {
    useToast().add({
      title: 'Export failed',
      description: error.message || 'Failed to export board data',
      color: 'error',
    })
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="isOpen" title="Export Board">
    <template #body>
      <div class="space-y-5">
        <!-- Format -->
        <div class="p-3 bg-gray-50 rounded-lg flex items-center gap-3">
          <UIcon name="i-lucide-file-text" class="w-5 h-5 text-gray-500" />
          <div>
            <p class="text-sm font-medium">CSV (Comma Separated Values)</p>
            <p class="text-xs text-gray-500">Compatible with Excel, Google Sheets, and other spreadsheet apps</p>
          </div>
        </div>

        <!-- Column Selection -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <label class="text-sm font-medium">Columns to include</label>
            <button class="text-xs text-blue-600 hover:text-blue-700" @click="allSelected = !allSelected">
              {{ allSelected ? 'Deselect all' : 'Select all' }}
            </button>
          </div>
          <p class="text-xs text-gray-500 mb-3">
            Built-in fields (Group, Title, Status, Priority, Assignee, Due Date, Project) are always included.
          </p>
          <div class="max-h-48 overflow-auto border rounded-lg divide-y">
            <label
              v-for="col in columns"
              :key="col.slug"
              class="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
            >
              <UCheckbox
                :model-value="selectedColumns.includes(col.slug)"
                @update:model-value="(val: boolean | 'indeterminate') => {
                  if (val) selectedColumns.push(col.slug)
                  else selectedColumns = selectedColumns.filter(s => s !== col.slug)
                }"
              />
              <span class="text-sm">{{ col.name }}</span>
              <span class="text-xs text-gray-400 ml-auto">{{ col.columnType || col.type }}</span>
            </label>
          </div>
        </div>

        <!-- Info -->
        <div class="p-3 bg-blue-50 rounded-lg flex items-start gap-2">
          <UIcon name="i-lucide-info" class="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p class="text-xs text-blue-700">
            The export includes all tasks in the board. Subtasks are not included.
            Dropdown and status values are exported as their labels.
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" :disabled="isExporting" @click="isOpen = false">
          Cancel
        </UButton>
        <UButton icon="i-lucide-download" :loading="isExporting" @click="exportCSV">
          {{ isExporting ? 'Exporting...' : 'Export CSV' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
