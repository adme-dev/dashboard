<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Edit Intake Form',
  middleware: ['auth']
})

const route = useRoute()
const toast = useToast()
const formId = route.params.id as string

// Fetch form with fields
const { data: formData, pending: loading, refresh } = await useFetch(`/api/agency/intake/forms/${formId}`)
const form = computed(() => (formData.value as any)?.form || null)
const fields = computed(() => (formData.value as any)?.fields || [])

// Fetch departments for routing
const { data: departmentsData } = await useFetch('/api/agency/departments')
const departments = computed(() => ((departmentsData.value as any)?.departments || []) as any[])

// Fetch templates for auto-project
const { data: templatesData } = await useFetch('/api/agency/templates', { query: { limit: 100 } })
const templates = computed(() => ((templatesData.value as any)?.templates || []) as any[])

// Editing state
const editedForm = ref<any>(null)
const editedFields = ref<any[]>([])
const saving = ref(false)
const hasChanges = computed(() => {
  if (!form.value || !editedForm.value) return false
  return JSON.stringify(form.value) !== JSON.stringify(editedForm.value) ||
         JSON.stringify(fields.value) !== JSON.stringify(editedFields.value)
})

// Initialize edited values when data loads
watch([form, fields], ([f, flds]) => {
  if (f && !editedForm.value) {
    editedForm.value = { ...f }
  }
  if (flds && editedFields.value.length === 0) {
    editedFields.value = [...flds]
  }
}, { immediate: true })

// Field types
const fieldTypes = [
  { label: 'Text', value: 'text', icon: 'i-lucide-type' },
  { label: 'Text Area', value: 'textarea', icon: 'i-lucide-align-left' },
  { label: 'Email', value: 'email', icon: 'i-lucide-mail' },
  { label: 'Phone', value: 'phone', icon: 'i-lucide-phone' },
  { label: 'URL', value: 'url', icon: 'i-lucide-link' },
  { label: 'Number', value: 'number', icon: 'i-lucide-hash' },
  { label: 'Select', value: 'select', icon: 'i-lucide-list' },
  { label: 'Multi Select', value: 'multiselect', icon: 'i-lucide-list-checks' },
  { label: 'Radio', value: 'radio', icon: 'i-lucide-circle-dot' },
  { label: 'Checkbox', value: 'checkbox', icon: 'i-lucide-check-square' },
  { label: 'Date', value: 'date', icon: 'i-lucide-calendar' },
  { label: 'Date & Time', value: 'datetime', icon: 'i-lucide-calendar-clock' },
  { label: 'File Upload', value: 'file', icon: 'i-lucide-upload' },
  { label: 'Multiple Files', value: 'files', icon: 'i-lucide-files' },
  { label: 'Heading', value: 'heading', icon: 'i-lucide-heading' },
  { label: 'Paragraph', value: 'paragraph', icon: 'i-lucide-text' },
  { label: 'Divider', value: 'divider', icon: 'i-lucide-minus' }
]

const widthOptions = [
  { label: 'Full Width', value: 'full' },
  { label: 'Half Width', value: 'half' },
  { label: 'Third Width', value: 'third' }
]

// Add new field
const addField = (type: string) => {
  const newField = {
    id: `temp-${Date.now()}`,
    fieldKey: `field_${editedFields.value.length + 1}`,
    label: '',
    description: '',
    placeholder: '',
    fieldType: type,
    options: type === 'select' || type === 'multiselect' || type === 'radio' || type === 'checkbox' ? [] : null,
    isRequired: false,
    width: 'full',
    sortOrder: editedFields.value.length * 10,
    isNew: true
  }
  editedFields.value.push(newField)
  selectedFieldIndex.value = editedFields.value.length - 1
}

// Selected field for editing
const selectedFieldIndex = ref<number | null>(null)
const selectedField = computed(() => {
  if (selectedFieldIndex.value === null) return null
  return editedFields.value[selectedFieldIndex.value]
})

// Remove field
const removeField = (index: number) => {
  editedFields.value.splice(index, 1)
  if (selectedFieldIndex.value === index) {
    selectedFieldIndex.value = null
  } else if (selectedFieldIndex.value !== null && selectedFieldIndex.value > index) {
    selectedFieldIndex.value--
  }
}

// Move field
const moveField = (index: number, direction: 'up' | 'down') => {
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= editedFields.value.length) return

  const temp = editedFields.value[index]
  editedFields.value[index] = editedFields.value[newIndex]
  editedFields.value[newIndex] = temp

  // Update sort orders
  editedFields.value.forEach((f, i) => {
    f.sortOrder = i * 10
  })

  // Update selection
  if (selectedFieldIndex.value === index) {
    selectedFieldIndex.value = newIndex
  } else if (selectedFieldIndex.value === newIndex) {
    selectedFieldIndex.value = index
  }
}

// Add option to select/multiselect/radio/checkbox field
const addOption = () => {
  if (!selectedField.value || !selectedField.value.options) return
  selectedField.value.options.push({ value: '', label: '' })
}

// Remove option
const removeOption = (optIndex: number) => {
  if (!selectedField.value || !selectedField.value.options) return
  selectedField.value.options.splice(optIndex, 1)
}

// Save form
const saveForm = async () => {
  if (!editedForm.value.name) {
    toast.add({ title: 'Please enter a form name', color: 'error' })
    return
  }

  saving.value = true
  try {
    // Update form
    await $fetch(`/api/agency/intake/forms/${formId}`, {
      method: 'PUT',
      body: {
        name: editedForm.value.name,
        slug: editedForm.value.slug,
        description: editedForm.value.description,
        isActive: editedForm.value.isActive,
        isPublic: editedForm.value.isPublic,
        requiresClientLogin: editedForm.value.requiresClientLogin,
        defaultDepartmentId: editedForm.value.defaultDepartmentId,
        autoCreateProject: editedForm.value.autoCreateProject,
        autoProjectTemplateId: editedForm.value.autoProjectTemplateId,
        confirmationMessage: editedForm.value.confirmationMessage,
        confirmationRedirectUrl: editedForm.value.confirmationRedirectUrl,
        primaryColor: editedForm.value.primaryColor
      }
    })

    // Update fields
    await $fetch(`/api/agency/intake/forms/${formId}/fields`, {
      method: 'PUT',
      body: {
        fields: editedFields.value.map((f, i) => ({
          id: f.isNew ? undefined : f.id,
          fieldKey: f.fieldKey,
          label: f.label,
          description: f.description,
          placeholder: f.placeholder,
          fieldType: f.fieldType,
          options: f.options,
          isRequired: f.isRequired,
          minLength: f.minLength,
          maxLength: f.maxLength,
          width: f.width,
          sortOrder: i * 10,
          mapsTo: f.mapsTo
        }))
      }
    })

    toast.add({ title: 'Form saved', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to save form', description: err.data?.message || err.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

// Copy public link
const copyPublicLink = () => {
  if (!editedForm.value?.slug) return
  const link = `${window.location.origin}/intake/${editedForm.value.slug}`
  navigator.clipboard.writeText(link)
  toast.add({ title: 'Link copied to clipboard', color: 'success' })
}

// Preview mode
const showPreview = ref(false)

// Get field icon
const getFieldIcon = (type: string) => {
  return fieldTypes.find(t => t.value === type)?.icon || 'i-lucide-square'
}

// Format date
const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar :title="form?.name || 'Loading...'">
        <template #left>
          <UButton
            variant="ghost"
            icon="i-lucide-arrow-left"
            to="/agency/intake"
          />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              variant="ghost"
              icon="i-lucide-eye"
              label="Preview"
              @click="showPreview = true"
            />
            <UButton
              variant="outline"
              icon="i-lucide-link"
              label="Copy Link"
              @click="copyPublicLink"
            />
            <UButton
              color="primary"
              icon="i-lucide-save"
              label="Save"
              :loading="saving"
              :disabled="!hasChanges"
              @click="saveForm"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent v-if="!loading && editedForm">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Form Settings -->
          <div class="space-y-6">
            <UCard>
              <template #header>
                <h3 class="font-semibold">Form Settings</h3>
              </template>

              <div class="space-y-4">
                <UFormField label="Form Name" required>
                  <UInput v-model="editedForm.name" />
                </UFormField>

                <UFormField label="URL Slug">
                  <UInput v-model="editedForm.slug" />
                </UFormField>

                <UFormField label="Description">
                  <UTextarea v-model="editedForm.description" :rows="2" />
                </UFormField>

                <UFormField label="Primary Color">
                  <div class="flex items-center gap-2">
                    <input
                      v-model="editedForm.primaryColor"
                      type="color"
                      class="w-10 h-10 rounded cursor-pointer"
                    />
                    <UInput v-model="editedForm.primaryColor" class="flex-1" />
                  </div>
                </UFormField>

                <div class="space-y-2">
                  <UCheckbox v-model="editedForm.isActive" label="Active" />
                  <UCheckbox v-model="editedForm.isPublic" label="Public (no login required)" />
                  <UCheckbox v-model="editedForm.requiresClientLogin" label="Require client login" />
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="font-semibold">Routing & Automation</h3>
              </template>

              <div class="space-y-4">
                <UFormField label="Default Department">
                  <USelectMenu
                    v-model="editedForm.defaultDepartmentId"
                    :items="[{ label: 'None', value: null }, ...departments.map(d => ({ label: d.name, value: d.id }))]"
                    placeholder="Select department"
                    value-key="value"
                  />
                </UFormField>

                <UCheckbox v-model="editedForm.autoCreateProject" label="Auto-create project on submission" />

                <UFormField v-if="editedForm.autoCreateProject" label="Project Template">
                  <USelectMenu
                    v-model="editedForm.autoProjectTemplateId"
                    :items="[{ label: 'None (blank project)', value: null }, ...templates.map(t => ({ label: t.name, value: t.id }))]"
                    placeholder="Select template"
                    value-key="value"
                  />
                </UFormField>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="font-semibold">Confirmation</h3>
              </template>

              <div class="space-y-4">
                <UFormField label="Confirmation Message">
                  <UTextarea
                    v-model="editedForm.confirmationMessage"
                    :rows="3"
                    placeholder="Thank you for your submission..."
                  />
                </UFormField>

                <UFormField label="Redirect URL (optional)">
                  <UInput
                    v-model="editedForm.confirmationRedirectUrl"
                    placeholder="https://..."
                  />
                </UFormField>
              </div>
            </UCard>
          </div>

          <!-- Form Builder -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Add Field -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">Form Fields</h3>
                  <span class="text-sm text-gray-500">{{ editedFields.length }} fields</span>
                </div>
              </template>

              <!-- Field type buttons -->
              <div class="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-6">
                <button
                  v-for="type in fieldTypes"
                  :key="type.value"
                  class="flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                  @click="addField(type.value)"
                >
                  <UIcon :name="type.icon" class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <span class="text-xs text-gray-600 dark:text-gray-400">{{ type.label }}</span>
                </button>
              </div>

              <!-- Fields list -->
              <div v-if="editedFields.length > 0" class="space-y-2">
                <div
                  v-for="(field, index) in editedFields"
                  :key="field.id"
                  class="flex items-center gap-2 p-3 rounded-lg border transition-colors cursor-pointer"
                  :class="selectedFieldIndex === index ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
                  @click="selectedFieldIndex = index"
                >
                  <UIcon :name="getFieldIcon(field.fieldType)" class="w-5 h-5 text-gray-400" />
                  <div class="flex-1 min-w-0">
                    <p class="font-medium truncate">{{ field.label || '(Unlabeled)' }}</p>
                    <p class="text-xs text-gray-500">{{ field.fieldType }} · {{ field.fieldKey }}</p>
                  </div>
                  <div class="flex items-center gap-1">
                    <UBadge v-if="field.isRequired" color="error" variant="subtle" size="xs">Required</UBadge>
                    <UButton
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-chevron-up"
                      :disabled="index === 0"
                      @click.stop="moveField(index, 'up')"
                    />
                    <UButton
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-chevron-down"
                      :disabled="index === editedFields.length - 1"
                      @click.stop="moveField(index, 'down')"
                    />
                    <UButton
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-trash"
                      color="error"
                      @click.stop="removeField(index)"
                    />
                  </div>
                </div>
              </div>

              <div v-else class="text-center py-8 text-gray-500">
                <UIcon name="i-lucide-layout-list" class="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No fields yet. Click a field type above to add one.</p>
              </div>
            </UCard>

            <!-- Field Editor -->
            <UCard v-if="selectedField">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">Edit Field</h3>
                  <UButton
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-x"
                    @click="selectedFieldIndex = null"
                  />
                </div>
              </template>

              <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <UFormField label="Label" required>
                    <UInput v-model="selectedField.label" placeholder="Field label" />
                  </UFormField>

                  <UFormField label="Field Key">
                    <UInput v-model="selectedField.fieldKey" placeholder="field_name" />
                  </UFormField>
                </div>

                <UFormField label="Description">
                  <UInput v-model="selectedField.description" placeholder="Help text for this field" />
                </UFormField>

                <UFormField
                  v-if="!['heading', 'paragraph', 'divider'].includes(selectedField.fieldType)"
                  label="Placeholder"
                >
                  <UInput v-model="selectedField.placeholder" placeholder="Placeholder text" />
                </UFormField>

                <!-- Options for select/multiselect/radio/checkbox -->
                <div v-if="['select', 'multiselect', 'radio', 'checkbox'].includes(selectedField.fieldType)">
                  <p class="text-sm font-medium mb-2">Options</p>
                  <div class="space-y-2">
                    <div
                      v-for="(opt, optIndex) in selectedField.options"
                      :key="optIndex"
                      class="flex items-center gap-2"
                    >
                      <UInput v-model="opt.label" placeholder="Label" class="flex-1" />
                      <UInput v-model="opt.value" placeholder="Value" class="flex-1" />
                      <UButton
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-x"
                        @click="removeOption(optIndex)"
                      />
                    </div>
                    <UButton
                      variant="outline"
                      size="sm"
                      icon="i-lucide-plus"
                      label="Add Option"
                      @click="addOption"
                    />
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <UFormField label="Width">
                    <USelectMenu
                      v-model="selectedField.width"
                      :items="widthOptions"
                      value-key="value"
                    />
                  </UFormField>

                  <UFormField
                    v-if="['text', 'textarea'].includes(selectedField.fieldType)"
                    label="Max Length"
                  >
                    <UInput v-model.number="selectedField.maxLength" type="number" />
                  </UFormField>
                </div>

                <UCheckbox v-model="selectedField.isRequired" label="Required field" />
              </div>
            </UCard>
          </div>
        </div>
      </UDashboardPanelContent>

      <!-- Loading -->
      <UDashboardPanelContent v-else>
        <div class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>
      </UDashboardPanelContent>
    </UDashboardPanel>

    <!-- Preview Modal -->
    <UModal v-model:open="showPreview" class="max-w-2xl">
      <template #header>
        <h3 class="font-semibold">Form Preview</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <div
            v-for="field in editedFields"
            :key="field.id"
            :class="[
              field.width === 'half' ? 'w-1/2' : field.width === 'third' ? 'w-1/3' : 'w-full',
              'inline-block align-top pr-2'
            ]"
          >
            <template v-if="field.fieldType === 'heading'">
              <h3 class="text-lg font-semibold">{{ field.label }}</h3>
            </template>
            <template v-else-if="field.fieldType === 'paragraph'">
              <p class="text-gray-600">{{ field.label }}</p>
            </template>
            <template v-else-if="field.fieldType === 'divider'">
              <hr class="my-4" />
            </template>
            <template v-else>
              <UFormField :label="field.label" :required="field.isRequired">
                <template v-if="field.description">
                  <p class="text-xs text-gray-500 mb-1">{{ field.description }}</p>
                </template>
                <UInput
                  v-if="['text', 'email', 'phone', 'url', 'number'].includes(field.fieldType)"
                  :type="field.fieldType === 'number' ? 'number' : 'text'"
                  :placeholder="field.placeholder"
                  disabled
                />
                <UTextarea
                  v-else-if="field.fieldType === 'textarea'"
                  :placeholder="field.placeholder"
                  disabled
                />
                <UInput
                  v-else-if="field.fieldType === 'date'"
                  type="date"
                  disabled
                />
                <USelectMenu
                  v-else-if="field.fieldType === 'select'"
                  :items="field.options?.map((o: any) => ({ label: o.label, value: o.value })) || []"
                  :placeholder="field.placeholder"
                  disabled
                />
                <div v-else-if="field.fieldType === 'file'" class="border-2 border-dashed rounded-lg p-4 text-center text-gray-500">
                  <UIcon name="i-lucide-upload" class="w-6 h-6 mx-auto mb-2" />
                  <p class="text-sm">Click to upload or drag and drop</p>
                </div>
              </UFormField>
            </template>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton variant="ghost" label="Close" @click="showPreview = false" />
      </template>
    </UModal>
  </UDashboardPage>
</template>
