<template>
  <UModal v-model:open="isOpen" :title="column ? `Edit: ${column.name}` : 'Column Settings'">
    <template #body>
      <div v-if="column" class="space-y-5">
        <!-- Column Name -->
        <UFormField label="Column Name">
          <UInput v-model="form.name" placeholder="Column name" class="w-full" />
        </UFormField>

        <!-- Column Type (read-only) -->
        <UFormField label="Column Type">
          <div class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
            <div
              class="w-8 h-8 rounded-lg flex items-center justify-center"
              :style="{ backgroundColor: typeInfo.color + '20' }"
            >
              <UIcon :name="typeInfo.icon" class="w-4 h-4" :style="{ color: typeInfo.color }" />
            </div>
            <div>
              <span class="text-sm font-medium text-gray-900 dark:text-neutral-100">{{ typeInfo.name }}</span>
              <span class="text-xs text-gray-500 dark:text-neutral-400 ml-2">{{ typeInfo.description }}</span>
            </div>
          </div>
        </UFormField>

        <!-- Description -->
        <UFormField label="Description">
          <UInput v-model="form.description" placeholder="Optional description" class="w-full" />
        </UFormField>

        <!-- Width -->
        <UFormField label="Column Width">
          <div class="flex items-center gap-3">
            <input
              v-model.number="form.width"
              type="range"
              min="80"
              max="400"
              step="10"
              class="flex-1"
            />
            <span class="text-sm text-gray-500 dark:text-neutral-400 w-12 text-right">{{ form.width }}px</span>
          </div>
        </UFormField>

        <!-- Type-specific Settings -->

        <!-- Number/Currency Settings -->
        <template v-if="column.columnType === 'number' || column.columnType === 'currency'">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Prefix">
              <UInput v-model="form.settings.prefix" placeholder="e.g., $" class="w-full" />
            </UFormField>
            <UFormField label="Suffix">
              <UInput v-model="form.settings.suffix" placeholder="e.g., %" class="w-full" />
            </UFormField>
          </div>
          <UFormField v-if="column.columnType === 'currency'" label="Currency Code">
            <UInput v-model="form.settings.currencyCode" placeholder="USD" class="w-full" />
          </UFormField>
          <UFormField label="Decimal Places">
            <UInput v-model.number="form.settings.decimalPlaces" type="number" min="0" max="6" class="w-full" />
          </UFormField>
        </template>

        <!-- Status / Dropdown Options -->
        <template v-if="column.columnType === 'status' || column.columnType === 'dropdown'">
          <UFormField :label="column.columnType === 'status' ? 'Status Labels' : 'Dropdown Options'">
            <div class="space-y-2">
              <!-- Existing options -->
              <div
                v-for="opt in options"
                :key="opt.id"
                class="flex items-center gap-2 group/opt"
              >
                <button
                  class="w-5 h-5 rounded-full flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1"
                  :style="{ backgroundColor: opt.color, ringColor: opt.color }"
                  @click="editingOptionColor = editingOptionColor === opt.id ? null : opt.id"
                />
                <input
                  v-model="opt.label"
                  type="text"
                  class="flex-1 text-sm border border-gray-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded px-2 py-1 outline-none focus:border-blue-500"
                  @blur="saveOptionLabel(opt)"
                />
                <UBadge v-if="opt.isDefault" color="primary" variant="subtle" size="xs">Default</UBadge>
                <button
                  class="p-1 hover:bg-gray-200 dark:hover:bg-neutral-700 rounded opacity-0 group-hover/opt:opacity-100 transition-opacity"
                  @click="removeOption(opt)"
                >
                  <UIcon name="i-lucide-x" class="w-3.5 h-3.5 text-gray-400" />
                </button>

                <!-- Color picker for this option -->
                <div
                  v-if="editingOptionColor === opt.id"
                  class="absolute z-30 mt-8 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg p-2"
                >
                  <div class="grid grid-cols-7 gap-1.5">
                    <button
                      v-for="c in optionColors"
                      :key="c"
                      class="w-5 h-5 rounded-full hover:scale-110 transition-transform"
                      :class="c === opt.color ? 'ring-2 ring-offset-1' : ''"
                      :style="{ backgroundColor: c, ringColor: c }"
                      @click="updateOptionColor(opt, c)"
                    />
                  </div>
                </div>
              </div>

              <!-- Add new option -->
              <div class="flex items-center gap-2 mt-2">
                <UIcon name="i-lucide-plus" class="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  v-model="newOptionLabel"
                  type="text"
                  placeholder="Add new option..."
                  class="flex-1 text-sm border border-gray-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded px-2 py-1 outline-none focus:border-blue-500"
                  @keydown.enter="addNewOption"
                />
                <UButton
                  v-if="newOptionLabel.trim()"
                  size="xs"
                  color="primary"
                  @click="addNewOption"
                >
                  Add
                </UButton>
              </div>
            </div>
          </UFormField>
        </template>

        <!-- Visibility & Permissions -->
        <div class="border-t border-gray-200 dark:border-neutral-700 pt-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-medium text-gray-900 dark:text-neutral-100">Visible</span>
              <p class="text-xs text-gray-500 dark:text-neutral-400">Show this column on the board</p>
            </div>
            <UCheckbox v-model="form.isVisible" />
          </div>
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-medium text-gray-900 dark:text-neutral-100">Required</span>
              <p class="text-xs text-gray-500 dark:text-neutral-400">Require a value for this column</p>
            </div>
            <UCheckbox v-model="form.isRequired" />
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <UButton
          variant="ghost"
          color="error"
          icon="i-lucide-trash-2"
          @click="$emit('delete', column?.id)"
        >
          Delete Column
        </UButton>
        <div class="flex gap-2">
          <UButton variant="ghost" @click="isOpen = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" @click="save">Save Changes</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
interface ColumnOption {
  id: string
  columnId: string
  value: string
  label: string
  color: string
  sortOrder: number
  isDefault: boolean
}

interface Column {
  id: string
  name: string
  slug: string
  type: string
  columnType: string
  description?: string
  settings: any
  isVisible: boolean
  isRequired?: boolean
  width: number
  sortOrder: number
}

const props = defineProps<{
  column: Column | null
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  save: [columnId: string, payload: any]
  delete: [columnId: string | undefined]
  addOption: [columnId: string, payload: { label: string; color: string }]
  updateOption: [columnId: string, optionId: string, payload: any]
}>()

const isOpen = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val),
})

const saving = ref(false)
const newOptionLabel = ref('')
const editingOptionColor = ref<string | null>(null)

const form = ref({
  name: '',
  description: '',
  width: 150,
  isVisible: true,
  isRequired: false,
  settings: {} as any,
})

// Initialize form when column changes
watch(() => props.column, (col) => {
  if (!col) return
  form.value = {
    name: col.name,
    description: col.description || '',
    width: col.width || 150,
    isVisible: col.isVisible ?? true,
    isRequired: col.isRequired ?? false,
    settings: { ...(col.settings || {}) },
  }
}, { immediate: true })

// Options from column settings
const options = computed<ColumnOption[]>(() => {
  if (!props.column) return []
  return props.column.settings?.options || []
})

const columnTypeMap: Record<string, { name: string; icon: string; color: string; description: string }> = {
  status: { name: 'Status', icon: 'i-lucide-circle', color: '#00C875', description: 'Track progress' },
  dropdown: { name: 'Dropdown', icon: 'i-lucide-list', color: '#579BFC', description: 'Select from list' },
  text: { name: 'Text', icon: 'i-lucide-type', color: '#FFCC00', description: 'Free text' },
  date: { name: 'Date', icon: 'i-lucide-calendar', color: '#FF642E', description: 'Pick a date' },
  people: { name: 'People', icon: 'i-lucide-users', color: '#A25DDC', description: 'Assign members' },
  number: { name: 'Numbers', icon: 'i-lucide-hash', color: '#E2445C', description: 'Numeric values' },
  checkbox: { name: 'Checkbox', icon: 'i-lucide-check-square', color: '#00C875', description: 'Yes or no' },
  timeline: { name: 'Timeline', icon: 'i-lucide-gantt-chart', color: '#579BFC', description: 'Date range' },
  rating: { name: 'Rating', icon: 'i-lucide-star', color: '#FDAB3D', description: '1–5 stars' },
  progress: { name: 'Progress', icon: 'i-lucide-bar-chart', color: '#00C875', description: '0–100%' },
  email: { name: 'Email', icon: 'i-lucide-mail', color: '#579BFC', description: 'Email address' },
  phone: { name: 'Phone', icon: 'i-lucide-phone', color: '#A25DDC', description: 'Phone number' },
  link: { name: 'Link', icon: 'i-lucide-link', color: '#FF642E', description: 'URL link' },
  currency: { name: 'Currency', icon: 'i-lucide-dollar-sign', color: '#00C875', description: 'Money amount' },
  tags: { name: 'Tags', icon: 'i-lucide-tag', color: '#FFCC00', description: 'Multiple labels' },
  color: { name: 'Color', icon: 'i-lucide-palette', color: '#FF5AC4', description: 'Color picker' },
  dependency: { name: 'Dependency', icon: 'i-lucide-git-branch', color: '#784BD1', description: 'Link tasks' },
}

const typeInfo = computed(() => {
  const ct = props.column?.columnType || props.column?.type || 'text'
  return columnTypeMap[ct] || columnTypeMap.text
})

const optionColors = [
  '#00C875', '#FDAB3D', '#E2445C', '#579BFC', '#A25DDC',
  '#FF5AC4', '#FF642E', '#CAB641', '#9CD326', '#00D2D2',
  '#784BD1', '#66CCFF', '#BB3354', '#037F4C', '#6B7280',
  '#225091', '#4ECCC6', '#C4C4C4', '#808080', '#333333',
  '#7F5347',
]

async function save() {
  if (!props.column) return
  saving.value = true
  try {
    emit('save', props.column.id, {
      name: form.value.name.trim(),
      description: form.value.description || null,
      width: form.value.width,
      isVisible: form.value.isVisible,
      isRequired: form.value.isRequired,
      settings: form.value.settings,
    })
    isOpen.value = false
  } finally {
    saving.value = false
  }
}

function addNewOption() {
  const label = newOptionLabel.value.trim()
  if (!label || !props.column) return
  const randomColor = optionColors[Math.floor(Math.random() * optionColors.length)]
  emit('addOption', props.column.id, { label, color: randomColor })
  newOptionLabel.value = ''
}

function saveOptionLabel(opt: ColumnOption) {
  if (!props.column) return
  emit('updateOption', props.column.id, opt.id, { label: opt.label })
}

function updateOptionColor(opt: ColumnOption, color: string) {
  if (!props.column) return
  opt.color = color
  editingOptionColor.value = null
  emit('updateOption', props.column.id, opt.id, { color })
}

function removeOption(opt: ColumnOption) {
  // For now, options can't be deleted via API - would need a DELETE endpoint
  // This is handled as hiding via sortOrder=-1 or by removing from frontend
}
</script>
