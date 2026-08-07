<script setup lang="ts">
import { parseDate, type CalendarDate, type DateValue } from '@internationalized/date'
import type { BriefTemplateField, BriefFieldOption } from '~/types'

const props = defineProps<{
  field: BriefTemplateField
  modelValue: any
  disabled?: boolean
  templateId?: string
  clientId?: string
  existingValues?: Record<string, any>
  clients?: { id: string; name: string }[]
  projects?: { id: string; name: string }[]
  departments?: { id: string; name: string; color: string }[]
  users?: { id: string; name: string; email: string }[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

function toCalendarDate(iso: unknown): DateValue | null {
  if (typeof iso !== 'string' || !iso) return null
  try {
    return parseDate(iso.length > 10 ? iso.slice(0, 10) : iso)
  } catch {
    return null
  }
}

const dateModel = computed<DateValue | null>({
  get: () => toCalendarDate(props.modelValue),
  set: val => emit('update:modelValue', val ? val.toString() : '')
})

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})

const formattedDate = computed(() => {
  const date = dateModel.value as CalendarDate | null
  if (!date) return ''
  return dateFormatter.format(new Date(date.year, date.month - 1, date.day))
})

// For rating field
const ratingValue = computed({
  get: () => Number(props.modelValue) || 0,
  set: (val) => emit('update:modelValue', val)
})

// For multiselect/checkboxgroup - ensure array
const arrayValue = computed({
  get: () => Array.isArray(props.modelValue) ? props.modelValue : [],
  set: (val) => emit('update:modelValue', val)
})

// Format options for select components
const selectOptions = computed(() => {
  if (!props.field.options) return []
  return props.field.options.map(opt => ({
    value: opt.value,
    label: opt.label,
    color: opt.color
  }))
})

// Client options
const clientOptions = computed(() => {
  if (!props.clients) return []
  return props.clients.map(c => ({ value: c.id, label: c.name }))
})

// Project options
const projectOptions = computed(() => {
  if (!props.projects) return []
  return props.projects.map(p => ({ value: p.id, label: p.name }))
})

// Department options
const departmentOptions = computed(() => {
  if (!props.departments) return []
  return props.departments.map(d => ({ value: d.id, label: d.name }))
})

// User options
const userOptions = computed(() => {
  if (!props.users) return []
  return props.users.map(u => ({ value: u.id, label: u.name }))
})

// File handling
const fileInput = ref<HTMLInputElement | null>(null)
const uploadingFile = ref(false)

function triggerFileUpload() {
  fileInput.value?.click()
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files

  if (!files?.length) return

  uploadingFile.value = true
  try {
    // For now, store as base64 - in production you'd upload to storage
    const file = files[0]
    if (!file) return

    const reader = new FileReader()

    reader.onload = () => {
      const fileData = {
        name: file.name,
        type: file.type,
        size: file.size,
        data: reader.result
      }

      if (props.field.fieldType === 'files' || props.field.fieldType === 'images') {
        // Multiple files
        const currentFiles = Array.isArray(props.modelValue) ? props.modelValue : []
        emit('update:modelValue', [...currentFiles, fileData])
      } else {
        // Single file
        emit('update:modelValue', fileData)
      }
    }

    reader.readAsDataURL(file)
  } finally {
    uploadingFile.value = false
    if (input) input.value = ''
  }
}

function removeFile(index?: number) {
  if (props.field.fieldType === 'files' || props.field.fieldType === 'images') {
    const files = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    if (index !== undefined) {
      files.splice(index, 1)
    }
    emit('update:modelValue', files)
  } else {
    emit('update:modelValue', null)
  }
}

// Validation
const validationRules = computed(() => props.field.validationRules || {})
const acceptedFileTypes = computed(() => {
  if (props.field.fieldType === 'image' || props.field.fieldType === 'images') {
    return 'image/*'
  }
  return validationRules.value.accept || '*'
})
</script>

<template>
  <div
    :class="{
      'col-span-1': field.width === 'full',
      'md:col-span-1': field.width === 'half',
      'lg:col-span-1': field.width === 'third'
    }"
  >
    <!-- Heading (display only) -->
    <template v-if="field.fieldType === 'heading'">
      <h3 class="text-lg font-semibold text-highlighted mt-4 mb-2">
        {{ field.fieldLabel }}
      </h3>
    </template>

    <!-- Paragraph (display only) -->
    <template v-else-if="field.fieldType === 'paragraph'">
      <p class="text-sm text-muted mb-4">
        {{ field.helpText || field.fieldLabel }}
      </p>
    </template>

    <!-- Divider -->
    <template v-else-if="field.fieldType === 'divider'">
      <USeparator class="my-4" />
    </template>

    <!-- Text Input -->
    <template v-else-if="field.fieldType === 'text'">
      <UFormField :name="field.fieldKey" :required="field.isRequired">
        <template #label>
          <div class="flex items-center gap-1">
            <span>{{ field.fieldLabel }}</span>
            <BriefsAiFieldSuggestions
              v-if="templateId && !disabled"
              :template-id="templateId"
              :field-key="field.fieldKey"
              :field-type="field.fieldType"
              :field-label="field.fieldLabel"
              :client-id="clientId"
              :existing-values="existingValues || {}"
              @apply="(v: string) => value = v"
            />
          </div>
        </template>
        <UInput
          v-model="value"
          :placeholder="field.placeholder"
          :disabled="disabled"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Email Input -->
    <template v-else-if="field.fieldType === 'email'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <UInput
          v-model="value"
          type="email"
          :placeholder="field.placeholder || 'email@example.com'"
          :disabled="disabled"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- URL Input -->
    <template v-else-if="field.fieldType === 'url'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <UInput
          v-model="value"
          type="url"
          :placeholder="field.placeholder || 'https://'"
          :disabled="disabled"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Phone Input -->
    <template v-else-if="field.fieldType === 'phone'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <UInput
          v-model="value"
          type="tel"
          :placeholder="field.placeholder || '+1 (555) 000-0000'"
          :disabled="disabled"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Textarea -->
    <template v-else-if="field.fieldType === 'textarea'">
      <UFormField :name="field.fieldKey" :required="field.isRequired">
        <template #label>
          <div class="flex items-center gap-1">
            <span>{{ field.fieldLabel }}</span>
            <BriefsAiFieldSuggestions
              v-if="templateId && !disabled"
              :template-id="templateId"
              :field-key="field.fieldKey"
              :field-type="field.fieldType"
              :field-label="field.fieldLabel"
              :client-id="clientId"
              :existing-values="existingValues || {}"
              @apply="(v: string) => value = v"
            />
          </div>
        </template>
        <UTextarea
          v-model="value"
          :placeholder="field.placeholder"
          :disabled="disabled"
          :rows="4"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Rich Text -->
    <template v-else-if="field.fieldType === 'richtext'">
      <UFormField :name="field.fieldKey" :required="field.isRequired">
        <template #label>
          <div class="flex items-center gap-1">
            <span>{{ field.fieldLabel }}</span>
            <BriefsAiFieldSuggestions
              v-if="templateId && !disabled"
              :template-id="templateId"
              :field-key="field.fieldKey"
              :field-type="field.fieldType"
              :field-label="field.fieldLabel"
              :client-id="clientId"
              :existing-values="existingValues || {}"
              @apply="(v: string) => value = v"
            />
          </div>
        </template>
        <UTextarea
          v-model="value"
          :placeholder="field.placeholder"
          :disabled="disabled"
          :rows="6"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Number Input -->
    <template v-else-if="field.fieldType === 'number'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <UInput
          v-model.number="value"
          type="number"
          :placeholder="field.placeholder"
          :disabled="disabled"
          :min="validationRules.min"
          :max="validationRules.max"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Currency Input -->
    <template v-else-if="field.fieldType === 'currency'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <UInput
          v-model.number="value"
          type="number"
          :placeholder="field.placeholder || '0.00'"
          :disabled="disabled"
          step="0.01"
          class="w-full"
        >
          <template #leading>
            <span class="text-muted">$</span>
          </template>
        </UInput>
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Date Input -->
    <template v-else-if="field.fieldType === 'date'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <UPopover>
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            icon="i-lucide-calendar"
            class="w-full justify-start font-normal"
            :class="!dateModel && 'text-muted'"
            :disabled="disabled"
          >
            {{ formattedDate || field.placeholder || 'Pick a date' }}
          </UButton>
          <template #content>
            <UCalendar v-model="dateModel" class="p-2" />
            <div v-if="dateModel" class="flex justify-end border-t border-default p-2">
              <UButton
                type="button"
                size="xs"
                variant="ghost"
                color="neutral"
                @click="dateModel = null"
              >
                Clear
              </UButton>
            </div>
          </template>
        </UPopover>
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- DateTime Input -->
    <template v-else-if="field.fieldType === 'datetime'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <UInput
          v-model="value"
          type="datetime-local"
          :disabled="disabled"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Time Input -->
    <template v-else-if="field.fieldType === 'time'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <UInput
          v-model="value"
          type="time"
          :disabled="disabled"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Dropdown -->
    <template v-else-if="field.fieldType === 'dropdown'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <USelectMenu
          v-model="value"
          :items="selectOptions"
          value-key="value"
          :placeholder="field.placeholder || 'Select an option'"
          :disabled="disabled"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Multi-select -->
    <template v-else-if="field.fieldType === 'multiselect'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <USelectMenu
          v-model="arrayValue"
          :items="selectOptions"
          value-key="value"
          :placeholder="field.placeholder || 'Select options'"
          :disabled="disabled"
          multiple
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Radio Group -->
    <template v-else-if="field.fieldType === 'radio'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <URadioGroup
          v-model="value"
          :items="selectOptions"
          :disabled="disabled"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Checkbox -->
    <template v-else-if="field.fieldType === 'checkbox'">
      <UCheckbox
        v-model="value"
        :label="field.fieldLabel"
        :disabled="disabled"
      />
      <p v-if="field.helpText" class="text-xs text-muted mt-1">
        {{ field.helpText }}
      </p>
    </template>

    <!-- Checkbox Group -->
    <template v-else-if="field.fieldType === 'checkboxgroup'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <div class="space-y-2">
          <UCheckbox
            v-for="option in field.options"
            :key="option.value"
            :model-value="arrayValue.includes(option.value)"
            :label="option.label"
            :disabled="disabled"
            @update:model-value="(checked: boolean | 'indeterminate') => {
              if (checked === true) {
                arrayValue = [...arrayValue, option.value]
              } else {
                arrayValue = arrayValue.filter((v: string) => v !== option.value)
              }
            }"
          />
        </div>
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Rating -->
    <template v-else-if="field.fieldType === 'rating'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <div class="flex items-center gap-1">
          <button
            v-for="star in 5"
            :key="star"
            type="button"
            :disabled="disabled"
            class="p-1 transition-colors"
            @click="ratingValue = star"
          >
            <UIcon
              :name="star <= ratingValue ? 'i-lucide-star' : 'i-lucide-star'"
              :class="star <= ratingValue ? 'text-yellow-400 fill-yellow-400' : 'text-muted'"
              class="size-6"
            />
          </button>
        </div>
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Client Select -->
    <template v-else-if="field.fieldType === 'client'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <USelectMenu
          v-model="value"
          :items="clientOptions"
          value-key="value"
          :placeholder="field.placeholder || 'Select a client'"
          :disabled="disabled"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Project Select -->
    <template v-else-if="field.fieldType === 'project'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <USelectMenu
          v-model="value"
          :items="projectOptions"
          value-key="value"
          :placeholder="field.placeholder || 'Select a project'"
          :disabled="disabled"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Department Select -->
    <template v-else-if="field.fieldType === 'department'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <USelectMenu
          v-model="value"
          :items="departmentOptions"
          value-key="value"
          :placeholder="field.placeholder || 'Select a department'"
          :disabled="disabled"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- User Select -->
    <template v-else-if="field.fieldType === 'user'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <USelectMenu
          v-model="value"
          :items="userOptions"
          value-key="value"
          :placeholder="field.placeholder || 'Select a person'"
          :disabled="disabled"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Multiple Users Select -->
    <template v-else-if="field.fieldType === 'users'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <USelectMenu
          v-model="arrayValue"
          :items="userOptions"
          value-key="value"
          :placeholder="field.placeholder || 'Select people'"
          :disabled="disabled"
          multiple
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- File Upload (Single) -->
    <template v-else-if="field.fieldType === 'file' || field.fieldType === 'image'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <input
          ref="fileInput"
          type="file"
          :accept="acceptedFileTypes"
          class="hidden"
          :disabled="disabled"
          @change="handleFileSelect"
        />

        <div v-if="modelValue" class="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
          <UIcon name="i-lucide-file" class="size-5 text-muted" />
          <span class="text-sm flex-1 truncate">{{ modelValue.name }}</span>
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            color="error"
            :disabled="disabled"
            @click="removeFile()"
          />
        </div>

        <UButton
          v-else
          icon="i-lucide-upload"
          variant="outline"
          :loading="uploadingFile"
          :disabled="disabled || uploadingFile"
          @click="triggerFileUpload"
        >
          Upload File
        </UButton>

        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- File Upload (Multiple) -->
    <template v-else-if="field.fieldType === 'files' || field.fieldType === 'images'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <input
          ref="fileInput"
          type="file"
          :accept="acceptedFileTypes"
          class="hidden"
          :disabled="disabled"
          multiple
          @change="handleFileSelect"
        />

        <div class="space-y-2">
          <div
            v-for="(file, index) in (Array.isArray(modelValue) ? modelValue : [])"
            :key="index"
            class="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
          >
            <UIcon name="i-lucide-file" class="size-5 text-muted" />
            <span class="text-sm flex-1 truncate">{{ file.name }}</span>
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              size="xs"
              color="error"
              :disabled="disabled"
              @click="removeFile(index)"
            />
          </div>

          <UButton
            icon="i-lucide-plus"
            variant="outline"
            size="sm"
            :loading="uploadingFile"
            :disabled="disabled || uploadingFile"
            @click="triggerFileUpload"
          >
            Add File
          </UButton>
        </div>

        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Color Picker -->
    <template v-else-if="field.fieldType === 'color'">
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <div class="flex items-center gap-2">
          <input
            v-model="value"
            type="color"
            :disabled="disabled"
            class="w-10 h-10 rounded cursor-pointer"
          />
          <UInput
            v-model="value"
            :placeholder="field.placeholder || '#000000'"
            :disabled="disabled"
            class="flex-1"
          />
        </div>
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>

    <!-- Fallback for unknown types -->
    <template v-else>
      <UFormField :name="field.fieldKey" :label="field.fieldLabel" :required="field.isRequired">
        <UInput
          v-model="value"
          :placeholder="field.placeholder"
          :disabled="disabled"
          class="w-full"
        />
        <template v-if="field.helpText" #hint>
          {{ field.helpText }}
        </template>
      </UFormField>
    </template>
  </div>
</template>
