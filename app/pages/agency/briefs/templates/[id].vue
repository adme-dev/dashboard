<script setup lang="ts">
import type { BriefTemplateField } from '~/types'

definePageMeta({
  title: 'Template Builder',
  middleware: ['auth']
})

const route = useRoute()
const toast = useToast()
const templateId = route.params.id as string

// Fetch template with fields
const { data: template, pending, refresh } = await useFetch(`/api/agency/briefs/templates/${templateId}/preview`)

// Fetch categories for the metadata form
const { data: categoriesData } = await useFetch('/api/agency/briefs/categories')
const categories = computed(() => (categoriesData.value || []) as any[])

// Local state for metadata
const metadata = ref({
  name: '',
  description: '',
  categoryId: 'none' as string,
  icon: 'i-lucide-file-text',
  isMultiStep: false,
  requiresApproval: false,
  defaultPriority: 'medium',
  allowAttachments: true,
  maxAttachments: 10,
  isPublic: true,
  requireClientLink: false,
  allowDrafts: true,
  showProgress: true,
  sortOrder: 0
})

// Local state for fields
const fields = ref<BriefTemplateField[]>([])

// Selected field for editing in the right panel
const selectedField = ref<BriefTemplateField | null>(null)

// Add field panel
const showFieldPicker = ref(false)
const addFieldStep = ref(1)

// Preview slideover
const showPreview = ref(false)

// Saving state
const saving = ref(false)
const hasChanges = ref(false)

// Initialize from fetched data
watch(template, (tmpl) => {
  if (!tmpl) return
  const t = tmpl as any
  metadata.value = {
    name: t.name || '',
    description: t.description || '',
    categoryId: t.categoryId || 'none',
    icon: t.icon || 'i-lucide-file-text',
    isMultiStep: t.isMultiStep ?? false,
    requiresApproval: t.requiresApproval ?? false,
    defaultPriority: t.defaultPriority || 'medium',
    allowAttachments: t.allowAttachments ?? true,
    maxAttachments: t.maxAttachments || 10,
    isPublic: t.isPublic ?? true,
    requireClientLink: t.requireClientLink ?? false,
    allowDrafts: t.allowDrafts ?? true,
    showProgress: t.showProgress ?? true,
    sortOrder: t.sortOrder || 0
  }
  fields.value = (t.fields || []).map((f: any) => ({ ...f }))
  hasChanges.value = false
}, { immediate: true })

// Track changes
watch([metadata, fields], () => {
  hasChanges.value = true
}, { deep: true })

// Category options for select (never use empty string)
const categoryOptions = computed(() => {
  return [
    { label: 'Select category...', value: 'none' },
    ...categories.value.map((c: any) => ({ label: c.name, value: c.id }))
  ]
})

// Priority options
const priorityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' }
]

// Field type icon mapping
const fieldTypeIcons: Record<string, string> = {
  text: 'i-lucide-type',
  textarea: 'i-lucide-align-left',
  richtext: 'i-lucide-text-cursor',
  dropdown: 'i-lucide-chevrons-up-down',
  multiselect: 'i-lucide-list-checks',
  radio: 'i-lucide-circle-dot',
  checkbox: 'i-lucide-check-square',
  checkboxgroup: 'i-lucide-list-todo',
  number: 'i-lucide-hash',
  currency: 'i-lucide-dollar-sign',
  slider: 'i-lucide-sliders-horizontal',
  rating: 'i-lucide-star',
  date: 'i-lucide-calendar',
  datetime: 'i-lucide-clock',
  time: 'i-lucide-timer',
  daterange: 'i-lucide-calendar-range',
  file: 'i-lucide-paperclip',
  files: 'i-lucide-files',
  image: 'i-lucide-image',
  images: 'i-lucide-images',
  client: 'i-lucide-building-2',
  project: 'i-lucide-folder-kanban',
  department: 'i-lucide-users',
  user: 'i-lucide-user',
  users: 'i-lucide-users',
  divider: 'i-lucide-minus',
  heading: 'i-lucide-heading',
  paragraph: 'i-lucide-pilcrow',
  url: 'i-lucide-link',
  email: 'i-lucide-mail',
  phone: 'i-lucide-phone',
  color: 'i-lucide-palette',
  link: 'i-lucide-external-link'
}

// Group fields by step for the left panel
interface StepGroup {
  number: number
  title: string
  fields: BriefTemplateField[]
}

const steps = computed<StepGroup[]>(() => {
  const stepMap = new Map<number, StepGroup>()

  for (const field of fields.value) {
    const stepNum = field.stepNumber || 1
    if (!stepMap.has(stepNum)) {
      stepMap.set(stepNum, {
        number: stepNum,
        title: field.stepTitle || `Step ${stepNum}`,
        fields: []
      })
    }
    stepMap.get(stepNum)!.fields.push(field)
  }

  // If no fields at all, create a default empty step
  if (stepMap.size === 0) {
    stepMap.set(1, { number: 1, title: 'Step 1', fields: [] })
  }

  return Array.from(stepMap.values()).sort((a, b) => a.number - b.number)
})

// Add a new field
function handleAddField(stepNumber: number) {
  addFieldStep.value = stepNumber
  showFieldPicker.value = true
}

function addField(fieldType: string) {
  const idx = fields.value.length
  const newField: BriefTemplateField = {
    id: '',
    templateId: templateId,
    fieldKey: `field_${idx + 1}`,
    fieldLabel: `New ${fieldType} field`,
    fieldType: fieldType as any,
    isRequired: false,
    stepNumber: addFieldStep.value,
    stepTitle: fields.value.find(f => f.stepNumber === addFieldStep.value)?.stepTitle || undefined,
    width: 'full',
    sortOrder: idx,
    showInPreview: true,
    showInList: false,
    createdAt: ''
  }

  // Default options for selection types
  if (['dropdown', 'multiselect', 'radio', 'checkboxgroup'].includes(fieldType)) {
    newField.options = [
      { label: 'Option 1', value: 'option_1' },
      { label: 'Option 2', value: 'option_2' }
    ]
  }

  fields.value.push(newField)
  showFieldPicker.value = false
  selectedField.value = newField
}

// Update a field from the editor
function updateField(updatedField: BriefTemplateField) {
  const idx = fields.value.findIndex(f => f.fieldKey === updatedField.fieldKey || f === selectedField.value)
  if (idx !== -1) {
    fields.value[idx] = { ...updatedField }
    selectedField.value = fields.value[idx]
  }
}

// Update the full fields list (from step editor reorder/remove)
function updateFields(newFields: BriefTemplateField[]) {
  fields.value = newFields
  // If selected field was removed, deselect
  if (selectedField.value && !newFields.find(f => f.fieldKey === selectedField.value!.fieldKey)) {
    selectedField.value = null
  }
}

// Select a field
function selectField(field: BriefTemplateField) {
  selectedField.value = field
}

// Add new step
function addStep() {
  const maxStep = Math.max(...steps.value.map(s => s.number), 0)
  const newFields = [...fields.value]
  newFields.push({
    id: '',
    templateId: templateId,
    fieldKey: `step_${maxStep + 1}_heading`,
    fieldLabel: `Step ${maxStep + 1} Header`,
    fieldType: 'heading',
    isRequired: false,
    stepNumber: maxStep + 1,
    stepTitle: `Step ${maxStep + 1}`,
    width: 'full',
    sortOrder: newFields.length,
    showInPreview: false,
    showInList: false,
    createdAt: ''
  })
  fields.value = newFields
}

// Save everything
async function save() {
  if (!metadata.value.name.trim()) {
    toast.add({ title: 'Template name is required', color: 'error' })
    return
  }
  if (metadata.value.categoryId === 'none') {
    toast.add({ title: 'Category is required', color: 'error' })
    return
  }

  saving.value = true
  try {
    // Save metadata
    await $fetch(`/api/agency/briefs/templates/${templateId}`, {
      method: 'PUT',
      body: {
        ...metadata.value,
        categoryId: metadata.value.categoryId === 'none' ? null : metadata.value.categoryId
      }
    })

    // Save fields
    await $fetch(`/api/agency/briefs/templates/${templateId}/fields`, {
      method: 'PUT',
      body: { fields: fields.value }
    })

    toast.add({ title: 'Template saved', description: 'All changes have been saved', color: 'success' })
    hasChanges.value = false
    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Failed to save template',
      description: err.data?.statusMessage || err.message,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

// Duplicate template
async function duplicateTemplate() {
  if (!template.value) return
  const t = template.value as any
  try {
    const result = await $fetch('/api/agency/briefs/templates', {
      method: 'POST',
      body: {
        categoryId: t.categoryId,
        name: `${t.name} (Copy)`,
        description: t.description,
        icon: t.icon,
        isMultiStep: t.isMultiStep,
        requiresApproval: t.requiresApproval,
        defaultPriority: t.defaultPriority,
        allowAttachments: t.allowAttachments,
        maxAttachments: t.maxAttachments,
        isPublic: t.isPublic
      }
    }) as any

    // Copy fields to the new template
    if (fields.value.length > 0) {
      await $fetch(`/api/agency/briefs/templates/${result.id}/fields`, {
        method: 'PUT',
        body: { fields: fields.value }
      })
    }

    toast.add({ title: 'Template duplicated', color: 'success' })
    navigateTo(`/agency/briefs/templates/${result.id}`)
  } catch (err: any) {
    toast.add({
      title: 'Failed to duplicate',
      description: err.data?.statusMessage || err.message,
      color: 'error'
    })
  }
}

// Preview template object
const previewTemplate = computed(() => ({
  ...(template.value || {}),
  ...metadata.value,
  id: templateId,
  fields: fields.value
}))

// Width badge label helper
function widthLabel(w: string) {
  if (w === 'half') return '1/2'
  if (w === 'third') return '1/3'
  return 'Full'
}

// Field type categories for the picker modal
const fieldTypeCategories = [
  {
    name: 'Text',
    icon: 'i-lucide-type',
    types: [
      { type: 'text', label: 'Text Input', icon: 'i-lucide-type' },
      { type: 'textarea', label: 'Text Area', icon: 'i-lucide-align-left' },
      { type: 'richtext', label: 'Rich Text', icon: 'i-lucide-text-cursor' },
      { type: 'heading', label: 'Heading', icon: 'i-lucide-heading' },
      { type: 'paragraph', label: 'Paragraph', icon: 'i-lucide-pilcrow' }
    ]
  },
  {
    name: 'Selection',
    icon: 'i-lucide-list',
    types: [
      { type: 'dropdown', label: 'Dropdown', icon: 'i-lucide-chevrons-up-down' },
      { type: 'multiselect', label: 'Multi-select', icon: 'i-lucide-list-checks' },
      { type: 'radio', label: 'Radio', icon: 'i-lucide-circle-dot' },
      { type: 'checkboxgroup', label: 'Checkbox Group', icon: 'i-lucide-list-todo' },
      { type: 'checkbox', label: 'Checkbox', icon: 'i-lucide-check-square' }
    ]
  },
  {
    name: 'Number',
    icon: 'i-lucide-hash',
    types: [
      { type: 'number', label: 'Number', icon: 'i-lucide-hash' },
      { type: 'currency', label: 'Currency', icon: 'i-lucide-dollar-sign' },
      { type: 'slider', label: 'Slider', icon: 'i-lucide-sliders-horizontal' },
      { type: 'rating', label: 'Rating', icon: 'i-lucide-star' }
    ]
  },
  {
    name: 'Date & Time',
    icon: 'i-lucide-calendar',
    types: [
      { type: 'date', label: 'Date', icon: 'i-lucide-calendar' },
      { type: 'datetime', label: 'Date & Time', icon: 'i-lucide-clock' },
      { type: 'time', label: 'Time', icon: 'i-lucide-timer' },
      { type: 'daterange', label: 'Date Range', icon: 'i-lucide-calendar-range' }
    ]
  },
  {
    name: 'Media',
    icon: 'i-lucide-image',
    types: [
      { type: 'file', label: 'File Upload', icon: 'i-lucide-paperclip' },
      { type: 'files', label: 'Multiple Files', icon: 'i-lucide-files' },
      { type: 'image', label: 'Image', icon: 'i-lucide-image' },
      { type: 'images', label: 'Multiple Images', icon: 'i-lucide-images' }
    ]
  },
  {
    name: 'Relations',
    icon: 'i-lucide-link',
    types: [
      { type: 'client', label: 'Client', icon: 'i-lucide-building-2' },
      { type: 'project', label: 'Project', icon: 'i-lucide-folder-kanban' },
      { type: 'department', label: 'Department', icon: 'i-lucide-users' },
      { type: 'user', label: 'User', icon: 'i-lucide-user' },
      { type: 'users', label: 'Multiple Users', icon: 'i-lucide-users' }
    ]
  },
  {
    name: 'Layout',
    icon: 'i-lucide-layout',
    types: [
      { type: 'divider', label: 'Divider', icon: 'i-lucide-minus' },
      { type: 'heading', label: 'Section Heading', icon: 'i-lucide-heading' },
      { type: 'paragraph', label: 'Info Text', icon: 'i-lucide-pilcrow' }
    ]
  },
  {
    name: 'Special',
    icon: 'i-lucide-sparkles',
    types: [
      { type: 'url', label: 'URL', icon: 'i-lucide-link' },
      { type: 'email', label: 'Email', icon: 'i-lucide-mail' },
      { type: 'phone', label: 'Phone', icon: 'i-lucide-phone' },
      { type: 'color', label: 'Color Picker', icon: 'i-lucide-palette' },
      { type: 'link', label: 'Link', icon: 'i-lucide-external-link' }
    ]
  }
]
</script>

<template>
  <div class="flex-1 min-w-0 min-h-0">
    <UDashboardPanel :ui="{ root: 'max-h-svh' }">
      <UDashboardNavbar :title="metadata.name || 'Untitled Template'">
        <template #left>
          <UButton
            icon="i-lucide-arrow-left"
            variant="ghost"
            size="sm"
            @click="navigateTo('/agency/briefs/templates')"
          />
        </template>
        <template #right>
          <span v-if="hasChanges" class="text-xs text-warning mr-2">Unsaved changes</span>
          <UButton
            variant="outline"
            size="sm"
            icon="i-lucide-copy"
            label="Duplicate"
            @click="duplicateTemplate"
          />
          <UButton
            variant="outline"
            size="sm"
            icon="i-lucide-eye"
            label="Preview"
            @click="showPreview = true"
          />
          <UButton
            color="primary"
            size="sm"
            icon="i-lucide-save"
            label="Save"
            :loading="saving"
            :disabled="!hasChanges"
            @click="save"
          />
        </template>
      </UDashboardNavbar>

      <!-- Loading -->
      <div v-if="pending" class="flex items-center justify-center flex-1 py-16">
        <XfLoader />
      </div>

      <!-- Main content: two-column layout -->
      <div v-else class="flex-1 flex overflow-hidden">
        <!-- Left column (60%): Field list organized by steps -->
        <div class="flex-[3] overflow-y-auto p-6 min-w-0">
          <!-- Steps and fields -->
          <div class="space-y-4">
            <div v-for="step in steps" :key="step.number" class="border border-default rounded-lg overflow-hidden">
              <!-- Step header -->
              <div class="flex items-center gap-3 px-4 py-3 bg-elevated border-b border-default">
                <div class="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--ui-color-primary)]/10 text-[var(--ui-color-primary)] text-xs font-bold shrink-0">
                  {{ step.number }}
                </div>
                <span class="flex-1 text-sm font-semibold">{{ step.title }}</span>
                <UBadge variant="subtle" size="xs" color="neutral">
                  {{ step.fields.length }} {{ step.fields.length === 1 ? 'field' : 'fields' }}
                </UBadge>
              </div>

              <!-- Fields list -->
              <div v-if="step.fields.length > 0" class="divide-y divide-default">
                <div
                  v-for="(field, idx) in step.fields"
                  :key="field.fieldKey"
                  class="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors group"
                  :class="[
                    selectedField?.fieldKey === field.fieldKey
                      ? 'bg-[var(--ui-color-primary)]/5 border-l-2 border-l-[var(--ui-color-primary)]'
                      : 'hover:bg-elevated/50'
                  ]"
                  @click="selectField(field)"
                >
                  <!-- Drag handle -->
                  <UIcon name="i-lucide-grip-vertical" class="w-4 h-4 text-muted/50 shrink-0 cursor-grab" />

                  <!-- Field type icon -->
                  <div class="w-8 h-8 rounded-md bg-elevated flex items-center justify-center shrink-0">
                    <UIcon
                      :name="fieldTypeIcons[field.fieldType] || 'i-lucide-circle'"
                      class="w-4 h-4 text-muted"
                    />
                  </div>

                  <!-- Field info -->
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">
                      {{ field.fieldLabel }}
                    </p>
                    <p class="text-xs text-muted truncate">
                      {{ field.fieldType }}
                      <span v-if="field.fieldKey"> -- {{ field.fieldKey }}</span>
                    </p>
                  </div>

                  <!-- Indicators -->
                  <UBadge v-if="field.isRequired" variant="subtle" color="error" size="xs">
                    Required
                  </UBadge>
                  <UBadge v-if="field.width !== 'full'" variant="subtle" size="xs" color="neutral">
                    {{ widthLabel(field.width) }}
                  </UBadge>
                  <UBadge v-if="field.conditionalLogic" variant="subtle" color="warning" size="xs">
                    Conditional
                  </UBadge>

                  <!-- Drag handle icon -->
                  <UIcon name="i-lucide-grip-vertical" class="w-4 h-4 text-muted/30 shrink-0 opacity-0 group-hover:opacity-100" />
                </div>
              </div>

              <!-- Empty state for step -->
              <div v-else class="px-4 py-8 text-center">
                <p class="text-sm text-muted">No fields in this step yet</p>
              </div>

              <!-- Add field button per step -->
              <div class="px-4 py-2.5 border-t border-default">
                <UButton
                  icon="i-lucide-plus"
                  variant="ghost"
                  size="sm"
                  block
                  @click="handleAddField(step.number)"
                >
                  Add Field
                </UButton>
              </div>
            </div>
          </div>

          <!-- Add Step button -->
          <div class="mt-4">
            <UButton
              icon="i-lucide-plus"
              variant="outline"
              size="sm"
              @click="addStep"
            >
              Add Step
            </UButton>
          </div>
        </div>

        <!-- Right column (40%): Field config or template metadata -->
        <div class="flex-[2] border-l border-default overflow-y-auto bg-elevated/30 shrink-0">
          <!-- Field editor (when a field is selected) -->
          <div v-if="selectedField" class="p-5">
            <BriefsTemplateFieldEditor
              :field="selectedField"
              :all-fields="fields"
              @update:field="updateField"
              @close="selectedField = null"
            />
          </div>

          <!-- Template metadata settings (when no field selected) -->
          <div v-else class="p-5 space-y-5">
            <h3 class="text-base font-semibold">Template Settings</h3>

            <UFormField label="Name" required>
              <UInput v-model="metadata.name" placeholder="Template name" class="w-full" />
            </UFormField>

            <UFormField label="Description">
              <UTextarea
                v-model="metadata.description"
                placeholder="What is this template for?"
                :rows="4"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Slug" v-if="template">
              <UInput
                :model-value="(template as any)?.slug || ''"
                class="w-full font-mono text-xs"
                disabled
              />
              <p class="text-xs text-muted mt-1">Auto-generated, cannot be changed</p>
            </UFormField>

            <UFormField label="Category" required>
              <USelectMenu
                v-model="metadata.categoryId"
                :items="categoryOptions"
                value-key="value"
                placeholder="Select category"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Icon">
              <UInput v-model="metadata.icon" placeholder="i-lucide-file-text" class="w-full font-mono text-xs" />
              <div v-if="metadata.icon" class="flex items-center gap-2 mt-1.5">
                <div class="w-8 h-8 rounded-md bg-[var(--ui-color-primary)]/10 flex items-center justify-center">
                  <UIcon :name="metadata.icon" class="w-4 h-4 text-[var(--ui-color-primary)]" />
                </div>
                <span class="text-xs text-muted">Preview</span>
              </div>
            </UFormField>

            <UFormField label="Default Priority">
              <USelectMenu
                v-model="metadata.defaultPriority"
                :items="priorityOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Sort Order">
              <UInput v-model.number="metadata.sortOrder" type="number" :min="0" class="w-full" />
            </UFormField>

            <!-- Toggle options -->
            <div class="space-y-3 pt-3 border-t border-default">
              <p class="text-xs font-semibold text-muted uppercase tracking-wider">Options</p>
              <UCheckbox v-model="metadata.isMultiStep" label="Multi-step form" />
              <UCheckbox v-model="metadata.showProgress" label="Show progress bar" />
              <UCheckbox v-model="metadata.requiresApproval" label="Requires approval" />
              <UCheckbox v-model="metadata.isPublic" label="Publicly available" />
              <UCheckbox v-model="metadata.allowDrafts" label="Allow draft saves" />
              <UCheckbox v-model="metadata.allowAttachments" label="Allow attachments" />
              <UCheckbox v-model="metadata.requireClientLink" label="Require client link" />
            </div>

            <UFormField v-if="metadata.allowAttachments" label="Max Attachments">
              <UInput v-model.number="metadata.maxAttachments" type="number" :min="1" :max="50" class="w-full" />
            </UFormField>

            <!-- Template stats (read-only info) -->
            <div v-if="template" class="space-y-2 pt-3 border-t border-default">
              <p class="text-xs font-semibold text-muted uppercase tracking-wider">Info</p>
              <div class="flex justify-between text-sm">
                <span class="text-muted">Fields</span>
                <span class="font-medium">{{ fields.length }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-muted">Steps</span>
                <span class="font-medium">{{ steps.length }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-muted">Required fields</span>
                <span class="font-medium">{{ fields.filter(f => f.isRequired).length }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UDashboardPanel>

    <!-- Field Type Picker Modal -->
    <UModal v-model:open="showFieldPicker">
      <template #content>
        <div class="p-6">
          <h2 class="text-lg font-semibold mb-4">Add Field</h2>
          <p class="text-sm text-muted mb-4">Choose a field type to add to step {{ addFieldStep }}</p>

          <div class="max-h-[60vh] overflow-y-auto space-y-4">
            <div v-for="category in fieldTypeCategories" :key="category.name">
              <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                {{ category.name }}
              </p>
              <div class="grid grid-cols-2 gap-1.5">
                <button
                  v-for="ft in category.types"
                  :key="ft.type"
                  type="button"
                  class="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm text-left transition-colors hover:bg-elevated border border-transparent hover:border-default"
                  @click="addField(ft.type)"
                >
                  <div class="w-7 h-7 rounded-md bg-elevated flex items-center justify-center shrink-0">
                    <UIcon :name="ft.icon" class="w-3.5 h-3.5 text-muted" />
                  </div>
                  <span class="truncate">{{ ft.label }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Preview Slideover -->
    <USlideover v-model:open="showPreview" side="right" :ui="{ content: 'max-w-2xl' }">
      <template #content>
        <BriefsTemplatePreview :template="previewTemplate as any" />
      </template>
    </USlideover>
  </div>
</template>
