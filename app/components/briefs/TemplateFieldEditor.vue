<script setup lang="ts">
import type { BriefTemplateField, BriefFieldOption, BriefFieldCondition } from '~/types'

const props = defineProps<{
  field: BriefTemplateField
  allFields: BriefTemplateField[]
}>()

const emit = defineEmits<{
  'update:field': [field: BriefTemplateField]
  close: []
}>()

// Local copy to edit
const localField = ref<BriefTemplateField>({ ...props.field })

watch(() => props.field, (f) => {
  localField.value = { ...f }
}, { deep: true })

function emitUpdate() {
  emit('update:field', { ...localField.value })
}

// Auto-generate fieldKey from label
function onLabelChange(val: string) {
  localField.value.fieldLabel = val
  // Auto-generate key if the field is new (no existing key or key matches old auto-generated pattern)
  if (!localField.value.fieldKey || localField.value.fieldKey.startsWith('field_')) {
    localField.value.fieldKey = val.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')
  }
  emitUpdate()
}

// Width options
const widthOptions = [
  { label: 'Full Width', value: 'full' },
  { label: 'Half Width', value: 'half' },
  { label: 'Third Width', value: 'third' }
]

// Field type display info
const fieldTypeLabels: Record<string, string> = {
  text: 'Text Input', textarea: 'Text Area', richtext: 'Rich Text',
  email: 'Email', url: 'URL', phone: 'Phone',
  number: 'Number', currency: 'Currency', rating: 'Rating',
  dropdown: 'Dropdown', multiselect: 'Multi-select', radio: 'Radio',
  checkbox: 'Checkbox', checkboxgroup: 'Checkbox Group',
  date: 'Date', datetime: 'Date & Time', time: 'Time', daterange: 'Date Range',
  file: 'File Upload', files: 'Multiple Files', image: 'Image', images: 'Images',
  color: 'Color Picker', heading: 'Heading', paragraph: 'Paragraph', divider: 'Divider',
  client: 'Client', project: 'Project', department: 'Department', user: 'User', users: 'Users'
}

// Whether this field type supports options
const hasOptions = computed(() =>
  ['dropdown', 'multiselect', 'radio', 'checkboxgroup'].includes(localField.value.fieldType)
)

// Whether this field type supports validation rules
const hasValidation = computed(() =>
  !['heading', 'paragraph', 'divider', 'checkbox'].includes(localField.value.fieldType)
)

// Whether this field type is a layout element (no data)
const isLayout = computed(() =>
  ['heading', 'paragraph', 'divider'].includes(localField.value.fieldType)
)

// Options management
function addOption() {
  if (!localField.value.options) {
    localField.value.options = []
  }
  const idx = localField.value.options.length + 1
  localField.value.options.push({ label: `Option ${idx}`, value: `option_${idx}` })
  emitUpdate()
}

function removeOption(index: number) {
  localField.value.options?.splice(index, 1)
  emitUpdate()
}

function moveOption(index: number, direction: 'up' | 'down') {
  if (!localField.value.options) return
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= localField.value.options.length) return
  const opts = [...localField.value.options]
  const temp = opts[index]
  opts[index] = opts[newIndex]
  opts[newIndex] = temp
  localField.value.options = opts
  emitUpdate()
}

// Conditional logic
function updateConditionalLogic(logic: BriefFieldCondition | null) {
  localField.value.conditionalLogic = logic || undefined
  emitUpdate()
}

// Other fields (for conditional logic - exclude current field)
const otherFields = computed(() =>
  props.allFields.filter(f => f.fieldKey !== localField.value.fieldKey)
)
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h3 class="text-base font-semibold text-highlighted">Edit Field</h3>
      <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="emit('close')" />
    </div>

    <!-- Field Type (read-only) -->
    <div class="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-md">
      <UBadge color="primary" variant="subtle" size="sm">
        {{ fieldTypeLabels[localField.fieldType] || localField.fieldType }}
      </UBadge>
    </div>

    <!-- Label -->
    <UFormField label="Label" required>
      <UInput
        :model-value="localField.fieldLabel"
        placeholder="Field label"
        class="w-full"
        @update:model-value="onLabelChange($event as string)"
      />
    </UFormField>

    <!-- Field Key -->
    <UFormField label="Field Key">
      <UInput
        v-model="localField.fieldKey"
        placeholder="field_key"
        class="w-full font-mono text-xs"
        @blur="emitUpdate()"
      />
      <template #hint>Unique identifier used in form data</template>
    </UFormField>

    <!-- Non-layout fields -->
    <template v-if="!isLayout">
      <!-- Placeholder -->
      <UFormField label="Placeholder">
        <UInput
          v-model="localField.placeholder"
          placeholder="Placeholder text"
          class="w-full"
          @blur="emitUpdate()"
        />
      </UFormField>

      <!-- Help Text -->
      <UFormField label="Help Text">
        <UInput
          v-model="localField.helpText"
          placeholder="Hints or instructions"
          class="w-full"
          @blur="emitUpdate()"
        />
      </UFormField>

      <!-- Default Value -->
      <UFormField label="Default Value">
        <UInput
          v-model="localField.defaultValue"
          placeholder="Default value"
          class="w-full"
          @blur="emitUpdate()"
        />
      </UFormField>

      <!-- Required -->
      <UCheckbox
        v-model="localField.isRequired"
        label="Required field"
        @update:model-value="emitUpdate()"
      />
    </template>

    <!-- Help text for layout fields like heading/paragraph -->
    <UFormField v-if="localField.fieldType === 'paragraph'" label="Display Text">
      <UTextarea
        v-model="localField.helpText"
        placeholder="Text to display"
        :rows="3"
        class="w-full"
        @blur="emitUpdate()"
      />
    </UFormField>

    <!-- Width -->
    <UFormField label="Width">
      <USelectMenu
        v-model="localField.width"
        :items="widthOptions"
        value-key="value"
        class="w-full"
        @update:model-value="emitUpdate()"
      />
    </UFormField>

    <!-- Step/Section -->
    <div class="grid grid-cols-2 gap-3">
      <UFormField label="Step Number">
        <UInput
          v-model.number="localField.stepNumber"
          type="number"
          :min="1"
          class="w-full"
          @blur="emitUpdate()"
        />
      </UFormField>
      <UFormField label="Step Title">
        <UInput
          v-model="localField.stepTitle"
          placeholder="Step title"
          class="w-full"
          @blur="emitUpdate()"
        />
      </UFormField>
    </div>

    <UFormField label="Section">
      <UInput
        v-model="localField.section"
        placeholder="Section name (optional)"
        class="w-full"
        @blur="emitUpdate()"
      />
    </UFormField>

    <!-- Display options -->
    <div class="space-y-2">
      <p class="text-xs font-semibold text-muted uppercase">Display</p>
      <UCheckbox
        v-model="localField.showInPreview"
        label="Show in brief preview"
        @update:model-value="emitUpdate()"
      />
      <UCheckbox
        v-model="localField.showInList"
        label="Show in briefs list"
        @update:model-value="emitUpdate()"
      />
    </div>

    <!-- Options (for dropdown/multiselect/radio/checkboxgroup) -->
    <div v-if="hasOptions" class="space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-xs font-semibold text-muted uppercase">Options</p>
        <UButton icon="i-lucide-plus" variant="ghost" size="xs" @click="addOption">
          Add
        </UButton>
      </div>

      <div class="space-y-2">
        <div
          v-for="(opt, idx) in localField.options"
          :key="idx"
          class="flex items-center gap-2"
        >
          <UInput
            v-model="opt.label"
            placeholder="Label"
            size="sm"
            class="flex-1"
            @blur="emitUpdate()"
          />
          <UInput
            v-model="opt.value"
            placeholder="Value"
            size="sm"
            class="flex-1 font-mono text-xs"
            @blur="emitUpdate()"
          />
          <input
            v-model="opt.color"
            type="color"
            class="w-6 h-6 rounded cursor-pointer shrink-0"
            title="Color"
            @change="emitUpdate()"
          />
          <div class="flex shrink-0">
            <UButton
              icon="i-lucide-chevron-up"
              variant="ghost"
              size="xs"
              :disabled="idx === 0"
              @click="moveOption(idx, 'up')"
            />
            <UButton
              icon="i-lucide-chevron-down"
              variant="ghost"
              size="xs"
              :disabled="idx === (localField.options?.length || 0) - 1"
              @click="moveOption(idx, 'down')"
            />
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              size="xs"
              color="error"
              @click="removeOption(idx)"
            />
          </div>
        </div>
      </div>

      <p v-if="!localField.options?.length" class="text-xs text-muted italic">
        No options defined. Add at least one option.
      </p>
    </div>

    <!-- Validation Rules -->
    <div v-if="hasValidation" class="space-y-3">
      <p class="text-xs font-semibold text-muted uppercase">Validation</p>

      <div class="grid grid-cols-2 gap-3">
        <UFormField v-if="['text', 'textarea', 'richtext', 'email', 'url', 'phone'].includes(localField.fieldType)" label="Min Length">
          <UInput
            :model-value="localField.validationRules?.minLength"
            type="number"
            :min="0"
            placeholder="0"
            class="w-full"
            @update:model-value="(v: any) => { localField.validationRules = { ...localField.validationRules, minLength: v ? Number(v) : undefined }; emitUpdate() }"
          />
        </UFormField>
        <UFormField v-if="['text', 'textarea', 'richtext', 'email', 'url', 'phone'].includes(localField.fieldType)" label="Max Length">
          <UInput
            :model-value="localField.validationRules?.maxLength"
            type="number"
            :min="0"
            placeholder="No limit"
            class="w-full"
            @update:model-value="(v: any) => { localField.validationRules = { ...localField.validationRules, maxLength: v ? Number(v) : undefined }; emitUpdate() }"
          />
        </UFormField>
        <UFormField v-if="['number', 'currency', 'rating'].includes(localField.fieldType)" label="Minimum">
          <UInput
            :model-value="localField.validationRules?.min"
            type="number"
            placeholder="No min"
            class="w-full"
            @update:model-value="(v: any) => { localField.validationRules = { ...localField.validationRules, min: v !== '' ? Number(v) : undefined }; emitUpdate() }"
          />
        </UFormField>
        <UFormField v-if="['number', 'currency', 'rating'].includes(localField.fieldType)" label="Maximum">
          <UInput
            :model-value="localField.validationRules?.max"
            type="number"
            placeholder="No max"
            class="w-full"
            @update:model-value="(v: any) => { localField.validationRules = { ...localField.validationRules, max: v !== '' ? Number(v) : undefined }; emitUpdate() }"
          />
        </UFormField>
      </div>

      <UFormField v-if="['text', 'email', 'phone'].includes(localField.fieldType)" label="Pattern (Regex)">
        <UInput
          :model-value="localField.validationRules?.pattern"
          placeholder="e.g. ^[a-zA-Z]+$"
          class="w-full font-mono text-xs"
          @update:model-value="(v: any) => { localField.validationRules = { ...localField.validationRules, pattern: v || undefined }; emitUpdate() }"
        />
      </UFormField>
    </div>

    <!-- Conditional Logic -->
    <BriefsConditionalLogicBuilder
      :model-value="localField.conditionalLogic || null"
      :available-fields="otherFields"
      @update:model-value="updateConditionalLogic"
    />
  </div>
</template>
