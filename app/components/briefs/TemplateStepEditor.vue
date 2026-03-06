<script setup lang="ts">
import type { BriefTemplateField } from '~/types'

const props = defineProps<{
  fields: BriefTemplateField[]
  isMultiStep: boolean
}>()

const emit = defineEmits<{
  'update:fields': [fields: BriefTemplateField[]]
  'select-field': [field: BriefTemplateField]
  'add-field': [stepNumber: number]
}>()

// Group fields by step
interface StepGroup {
  number: number
  title: string
  fields: BriefTemplateField[]
}

const steps = computed<StepGroup[]>(() => {
  const stepMap = new Map<number, StepGroup>()

  for (const field of props.fields) {
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

  // If no fields, create a default step
  if (stepMap.size === 0) {
    stepMap.set(1, { number: 1, title: 'Step 1', fields: [] })
  }

  return Array.from(stepMap.values()).sort((a, b) => a.number - b.number)
})

// Field type icons
const fieldTypeIcons: Record<string, string> = {
  text: 'i-lucide-type', textarea: 'i-lucide-align-left', richtext: 'i-lucide-file-text',
  email: 'i-lucide-mail', url: 'i-lucide-link', phone: 'i-lucide-phone',
  number: 'i-lucide-hash', currency: 'i-lucide-dollar-sign', rating: 'i-lucide-star',
  dropdown: 'i-lucide-chevron-down', multiselect: 'i-lucide-list-checks',
  radio: 'i-lucide-circle-dot', checkbox: 'i-lucide-square-check',
  checkboxgroup: 'i-lucide-check-square',
  date: 'i-lucide-calendar', datetime: 'i-lucide-calendar-clock',
  time: 'i-lucide-clock', daterange: 'i-lucide-calendar-range',
  file: 'i-lucide-paperclip', files: 'i-lucide-files',
  image: 'i-lucide-image', images: 'i-lucide-images',
  color: 'i-lucide-palette', heading: 'i-lucide-heading',
  paragraph: 'i-lucide-text', divider: 'i-lucide-minus',
  client: 'i-lucide-building', project: 'i-lucide-folder-kanban',
  department: 'i-lucide-building-2', user: 'i-lucide-user', users: 'i-lucide-users'
}

// Move field up/down within its step
function moveField(field: BriefTemplateField, direction: 'up' | 'down') {
  const allFields = [...props.fields]
  const idx = allFields.findIndex(f => f.fieldKey === field.fieldKey)
  if (idx === -1) return

  const newIdx = direction === 'up' ? idx - 1 : idx + 1
  if (newIdx < 0 || newIdx >= allFields.length) return

  // Swap
  const temp = allFields[idx]
  allFields[idx] = allFields[newIdx]
  allFields[newIdx] = temp

  // Update sort orders
  allFields.forEach((f, i) => { f.sortOrder = i })
  emit('update:fields', allFields)
}

// Remove field
function removeField(field: BriefTemplateField) {
  const allFields = props.fields.filter(f => f.fieldKey !== field.fieldKey)
  allFields.forEach((f, i) => { f.sortOrder = i })
  emit('update:fields', allFields)
}

// Add new step
function addStep() {
  const maxStep = Math.max(...steps.value.map(s => s.number), 0)
  // Add a placeholder heading field to create the step
  const newFields = [...props.fields]
  newFields.push({
    id: '',
    templateId: '',
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
  emit('update:fields', newFields)
}

// Update step title
function updateStepTitle(stepNumber: number, title: string) {
  const allFields = props.fields.map(f => {
    if (f.stepNumber === stepNumber) {
      return { ...f, stepTitle: title }
    }
    return f
  })
  emit('update:fields', allFields)
}

// Width badge label
function widthLabel(w: string) {
  if (w === 'half') return '1/2'
  if (w === 'third') return '1/3'
  return 'Full'
}
</script>

<template>
  <div class="space-y-4">
    <div v-for="step in steps" :key="step.number" class="border border-default rounded-lg overflow-hidden">
      <!-- Step header -->
      <div class="flex items-center gap-3 px-4 py-2.5 bg-elevated border-b border-default">
        <UIcon name="i-lucide-layers" class="size-4 text-muted" />
        <template v-if="isMultiStep">
          <UInput
            :model-value="step.title"
            size="sm"
            variant="none"
            class="flex-1 font-medium"
            placeholder="Step title"
            @update:model-value="updateStepTitle(step.number, $event as string)"
          />
          <UBadge variant="subtle" size="xs">Step {{ step.number }}</UBadge>
        </template>
        <template v-else>
          <span class="flex-1 text-sm font-medium text-highlighted">Fields</span>
        </template>
      </div>

      <!-- Fields list -->
      <div class="divide-y divide-default">
        <div
          v-for="(field, idx) in step.fields"
          :key="field.fieldKey"
          class="flex items-center gap-3 px-4 py-2.5 hover:bg-elevated/50 cursor-pointer transition-colors group"
          @click="emit('select-field', field)"
        >
          <UIcon
            :name="fieldTypeIcons[field.fieldType] || 'i-lucide-circle'"
            class="size-4 text-muted shrink-0"
          />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-highlighted truncate">
              {{ field.fieldLabel }}
            </p>
            <p class="text-xs text-muted truncate">
              {{ field.fieldType }}
              <span v-if="field.section"> &middot; {{ field.section }}</span>
            </p>
          </div>

          <!-- Indicators -->
          <UBadge v-if="field.isRequired" variant="subtle" color="error" size="xs">
            Required
          </UBadge>
          <UBadge v-if="field.width !== 'full'" variant="subtle" size="xs">
            {{ widthLabel(field.width) }}
          </UBadge>
          <UBadge v-if="field.conditionalLogic" variant="subtle" color="warning" size="xs">
            Conditional
          </UBadge>

          <!-- Actions (visible on hover) -->
          <div class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0" @click.stop>
            <UButton
              icon="i-lucide-chevron-up"
              variant="ghost"
              size="xs"
              :disabled="idx === 0"
              @click="moveField(field, 'up')"
            />
            <UButton
              icon="i-lucide-chevron-down"
              variant="ghost"
              size="xs"
              :disabled="idx === step.fields.length - 1"
              @click="moveField(field, 'down')"
            />
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              size="xs"
              color="error"
              @click="removeField(field)"
            />
          </div>
        </div>
      </div>

      <!-- Add field button -->
      <div class="px-4 py-2.5 border-t border-default">
        <UButton
          icon="i-lucide-plus"
          variant="ghost"
          size="sm"
          block
          @click="emit('add-field', step.number)"
        >
          Add Field
        </UButton>
      </div>
    </div>

    <!-- Add Step button (multi-step only) -->
    <UButton
      v-if="isMultiStep"
      icon="i-lucide-plus"
      variant="outline"
      size="sm"
      @click="addStep"
    >
      Add Step
    </UButton>
  </div>
</template>
