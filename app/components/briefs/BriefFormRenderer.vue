<script setup lang="ts">
import type { BriefTemplate, BriefTemplateField, BriefFormValues, BriefFormStep } from '~/types'

const props = defineProps<{
  template: BriefTemplate
  initialValues?: BriefFormValues
  disabled?: boolean
}>()

const emit = defineEmits<{
  submit: [values: BriefFormValues, isDraft: boolean]
  cancel: []
}>()

// Form state
const formValues = ref<BriefFormValues>({})
const currentStep = ref(1)
const isSubmitting = ref(false)

// Initialize form values
onMounted(() => {
  // Set default values from template fields
  if (props.template.fields) {
    for (const field of props.template.fields) {
      if (field.defaultValue !== undefined && field.defaultValue !== null) {
        formValues.value[field.fieldKey] = field.defaultValue
      }
    }
  }

  // Override with initial values if provided
  if (props.initialValues) {
    formValues.value = { ...formValues.value, ...props.initialValues }
  }
})

// Organize fields into steps
const steps = computed<BriefFormStep[]>(() => {
  if (!props.template.fields) return []

  const stepMap = new Map<number, BriefFormStep>()

  for (const field of props.template.fields) {
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

  return Array.from(stepMap.values()).sort((a, b) => a.number - b.number)
})

const totalSteps = computed(() => steps.value.length)
const isMultiStep = computed(() => props.template.isMultiStep && totalSteps.value > 1)
const currentStepData = computed(() => steps.value.find(s => s.number === currentStep.value))

const googlePmaxBudgetPreview = computed(() => {
  if (props.template.slug !== 'google-pmax') return null
  if (formValues.value.pmax_type !== 'inventory') return null
  if (formValues.value.budget_period !== 'fixed_flight') return null

  const rawAllocatedTotal = formValues.value.allocated_total
  if (typeof rawAllocatedTotal !== 'number' && typeof rawAllocatedTotal !== 'string') return null
  const allocatedTotal = Number(rawAllocatedTotal)
  const currency = String(formValues.value.budget_currency || '').toUpperCase()
  const startDate = String(formValues.value.start_date || '')
  const endDate = String(formValues.value.end_date || '')
  const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
  const startMatch = datePattern.exec(startDate)
  const endMatch = datePattern.exec(endDate)

  if (!Number.isFinite(allocatedTotal) || allocatedTotal <= 0 || !/^[A-Z]{3}$/.test(currency)) return null
  if (!startMatch || !endMatch) return null

  const start = Date.UTC(Number(startMatch[1]), Number(startMatch[2]) - 1, Number(startMatch[3]))
  const end = Date.UTC(Number(endMatch[1]), Number(endMatch[2]) - 1, Number(endMatch[3]))
  const parsedStart = new Date(start)
  const parsedEnd = new Date(end)
  if (
    parsedStart.getUTCFullYear() !== Number(startMatch[1])
    || parsedStart.getUTCMonth() !== Number(startMatch[2]) - 1
    || parsedStart.getUTCDate() !== Number(startMatch[3])
    || parsedEnd.getUTCFullYear() !== Number(endMatch[1])
    || parsedEnd.getUTCMonth() !== Number(endMatch[2]) - 1
    || parsedEnd.getUTCDate() !== Number(endMatch[3])
  ) return null
  if (end < start) return null

  const campaignDays = Math.floor((end - start) / 86_400_000) + 1
  const calculatedDailyPace = allocatedTotal / campaignDays
  const totalAmountMicros = Math.round(allocatedTotal * 1_000_000)
  if (!Number.isSafeInteger(totalAmountMicros)) return null

  try {
    const formatter = new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
    return {
      allocatedTotal: formatter.format(allocatedTotal),
      campaignDays,
      calculatedDailyPace: formatter.format(calculatedDailyPace),
      totalAmountMicros: String(totalAmountMicros)
    }
  } catch {
    return null
  }
})

// Group current step fields by section
const currentStepSections = computed(() => {
  if (!currentStepData.value) return []

  const sectionMap = new Map<string, BriefTemplateField[]>()

  for (const field of currentStepData.value.fields) {
    const section = field.section || ''
    if (!sectionMap.has(section)) {
      sectionMap.set(section, [])
    }
    sectionMap.get(section)!.push(field)
  }

  return Array.from(sectionMap.entries()).map(([name, fields]) => ({
    name,
    fields: fields.sort((a, b) => a.sortOrder - b.sortOrder)
  }))
})

// Progress percentage
const progressPercentage = computed(() => {
  if (!isMultiStep.value) return 100
  return Math.round((currentStep.value / totalSteps.value) * 100)
})

// Conditional field visibility
function isFieldVisible(field: BriefTemplateField): boolean {
  if (!field.conditionalLogic) return true

  const { fieldKey, operator, value, action } = field.conditionalLogic
  const targetValue = formValues.value[fieldKey]

  let conditionMet = false

  switch (operator) {
    case 'equals':
      conditionMet = targetValue === value
      break
    case 'not_equals':
      conditionMet = targetValue !== value
      break
    case 'contains':
      conditionMet = Array.isArray(targetValue)
        ? targetValue.includes(value)
        : String(targetValue).includes(String(value))
      break
    case 'not_contains':
      conditionMet = Array.isArray(targetValue)
        ? !targetValue.includes(value)
        : !String(targetValue).includes(String(value))
      break
    case 'is_empty':
      conditionMet = targetValue === undefined || targetValue === null || targetValue === '' ||
                     (Array.isArray(targetValue) && targetValue.length === 0)
      break
    case 'is_not_empty':
      conditionMet = targetValue !== undefined && targetValue !== null && targetValue !== '' &&
                     (!Array.isArray(targetValue) || targetValue.length > 0)
      break
  }

  if (action === 'show') return conditionMet
  if (action === 'hide') return !conditionMet

  return true
}

function isFieldRequired(field: BriefTemplateField): boolean {
  if (!field.conditionalLogic) return field.isRequired

  if (field.conditionalLogic.action === 'require') {
    return isFieldVisible({
      ...field,
      conditionalLogic: { ...field.conditionalLogic, action: 'show' }
    })
  }
  if (field.conditionalLogic.action === 'unrequire') {
    return !isFieldVisible({
      ...field,
      conditionalLogic: { ...field.conditionalLogic, action: 'show' }
    })
  }
  return field.isRequired
}

// Validate current step
function validateCurrentStep(): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!currentStepData.value) return { valid: true, errors }

  for (const field of currentStepData.value.fields) {
    if (!isFieldVisible(field)) continue

    // Check required fields
    const isRequired = isFieldRequired(field)

    if (isRequired) {
      const value = formValues.value[field.fieldKey]
      const isEmpty = value === undefined || value === null || value === '' ||
                      (Array.isArray(value) && value.length === 0)

      if (isEmpty) {
        errors.push(`${field.fieldLabel} is required`)
      }
    }

    // Additional validation rules
    const rules = field.validationRules
    if (rules && formValues.value[field.fieldKey] !== undefined) {
      const value = formValues.value[field.fieldKey]

      if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
        errors.push(`${field.fieldLabel} must be at least ${rules.minLength} characters`)
      }

      if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
        errors.push(`${field.fieldLabel} must be at most ${rules.maxLength} characters`)
      }

      if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
        errors.push(`${field.fieldLabel} must be at least ${rules.min}`)
      }

      if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
        errors.push(`${field.fieldLabel} must be at most ${rules.max}`)
      }

      if (rules.pattern && typeof value === 'string') {
        const regex = new RegExp(rules.pattern)
        if (!regex.test(value)) {
          errors.push(rules.patternMessage || `${field.fieldLabel} format is invalid`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

// Navigation
const toast = useToast()

function nextStep() {
  const validation = validateCurrentStep()
  if (!validation.valid) {
    toast.add({
      title: 'Please fix the following errors',
      description: validation.errors.join(', '),
      color: 'error',
      duration: 5000
    })
    return
  }

  if (currentStep.value < totalSteps.value) {
    currentStep.value++
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function previousStep() {
  if (currentStep.value > 1) {
    currentStep.value--
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function goToStep(step: number) {
  // Only allow going back, or forward if current step is valid
  if (step < currentStep.value) {
    currentStep.value = step
  } else if (step > currentStep.value) {
    const validation = validateCurrentStep()
    if (validation.valid) {
      currentStep.value = step
    } else {
      toast.add({
        title: 'Please complete the current step first',
        color: 'warning',
        duration: 3000
      })
    }
  }
}

// Submit handlers
async function handleSubmit(isDraft = false) {
  if (!isDraft) {
    const validation = validateCurrentStep()
    if (!validation.valid) {
      toast.add({
        title: 'Please fix the following errors',
        description: validation.errors.join(', '),
        color: 'error',
        duration: 5000
      })
      return
    }
  }

  isSubmitting.value = true
  try {
    emit('submit', { ...formValues.value }, isDraft)
  } finally {
    isSubmitting.value = false
  }
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <div class="space-y-6">
    <!-- Progress indicator (multi-step only) -->
    <div v-if="isMultiStep && template.showProgress" class="space-y-4">
      <!-- Step indicators -->
      <div class="flex items-center justify-between">
        <div
          v-for="step in steps"
          :key="step.number"
          class="flex items-center"
        >
          <button
            type="button"
            class="flex items-center gap-2 transition-colors"
            :class="{
              'text-primary font-medium': step.number === currentStep,
              'text-muted hover:text-highlighted': step.number !== currentStep,
              'cursor-pointer': step.number < currentStep,
              'cursor-default': step.number > currentStep
            }"
            @click="goToStep(step.number)"
          >
            <span
              class="flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors"
              :class="{
                'bg-primary text-white': step.number === currentStep,
                'bg-primary/20 text-primary': step.number < currentStep,
                'bg-muted/50 text-muted': step.number > currentStep
              }"
            >
              <UIcon v-if="step.number < currentStep" name="i-lucide-check" class="size-4" />
              <span v-else>{{ step.number }}</span>
            </span>
            <span class="hidden sm:inline">{{ step.title }}</span>
          </button>

          <!-- Connector line -->
          <div
            v-if="step.number < totalSteps"
            class="hidden sm:block w-12 h-0.5 mx-2"
            :class="{
              'bg-primary': step.number < currentStep,
              'bg-muted/30': step.number >= currentStep
            }"
          />
        </div>
      </div>

      <!-- Progress bar -->
      <UProgress :value="progressPercentage" size="sm" />
    </div>

    <!-- Step title -->
    <div v-if="isMultiStep && currentStepData" class="border-b border-default pb-4">
      <h2 class="text-xl font-semibold text-highlighted">
        {{ currentStepData.title }}
      </h2>
      <p class="text-sm text-muted mt-1">
        Step {{ currentStep }} of {{ totalSteps }}
      </p>
    </div>

    <!-- Form fields -->
    <form @submit.prevent="handleSubmit(false)">
      <div class="space-y-8">
        <!-- Sections -->
        <div
          v-for="section in currentStepSections"
          :key="section.name"
          class="space-y-4"
        >
          <!-- Section header -->
          <h3 v-if="section.name" class="text-base font-medium text-highlighted border-b border-default pb-2">
            {{ section.name }}
          </h3>

          <!-- Fields grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <template v-for="field in section.fields" :key="field.id">
              <BriefsBriefFormField
                v-if="isFieldVisible(field)"
                v-model="formValues[field.fieldKey]"
                :field="{ ...field, isRequired: isFieldRequired(field) }"
                :disabled="disabled || isSubmitting"
                :class="{
                  'md:col-span-2': field.width === 'full',
                  'md:col-span-1': field.width === 'half' || field.width === 'third'
                }"
              />
            </template>

            <div
              v-if="section.name === 'Budget' && googlePmaxBudgetPreview"
              class="md:col-span-2 rounded-lg border border-default bg-elevated/40 p-4"
              aria-live="polite"
            >
              <div class="flex items-start gap-3">
                <UIcon name="i-lucide-calculator" class="mt-0.5 size-5 shrink-0 text-primary" />
                <div class="min-w-0 space-y-2">
                  <div>
                    <p class="text-sm font-semibold text-highlighted">
                      Fixed-flight budget equation
                    </p>
                    <p class="mt-1 text-sm text-muted">
                      {{ googlePmaxBudgetPreview.allocatedTotal }} total ÷
                      {{ googlePmaxBudgetPreview.campaignDays }} inclusive days =
                      {{ googlePmaxBudgetPreview.calculatedDailyPace }}/day
                    </p>
                  </div>
                  <div class="border-t border-default pt-2">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted">
                      Google provider contract
                    </p>
                    <p class="mt-1 font-mono text-sm text-highlighted">
                      CUSTOM_PERIOD · total_amount_micros = {{ googlePmaxBudgetPreview.totalAmountMicros }}
                    </p>
                  </div>
                  <p class="text-xs text-muted">
                    Preview only. Launch validation checks the selected Google Ads account currency and timezone.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation buttons -->
      <div class="flex items-center justify-between pt-6 mt-6 border-t border-default">
        <div class="flex items-center gap-2">
          <!-- Cancel button -->
          <UButton
            type="button"
            variant="ghost"
            :disabled="isSubmitting"
            @click="handleCancel"
          >
            Cancel
          </UButton>

          <!-- Save as draft (if allowed) -->
          <UButton
            v-if="template.allowDrafts"
            type="button"
            variant="outline"
            :loading="isSubmitting"
            :disabled="isSubmitting"
            @click="handleSubmit(true)"
          >
            Save Draft
          </UButton>
        </div>

        <div class="flex items-center gap-2">
          <!-- Previous step -->
          <UButton
            v-if="isMultiStep && currentStep > 1"
            type="button"
            variant="outline"
            icon="i-lucide-chevron-left"
            :disabled="isSubmitting"
            @click="previousStep"
          >
            Previous
          </UButton>

          <!-- Next step / Submit -->
          <UButton
            v-if="isMultiStep && currentStep < totalSteps"
            type="button"
            icon="i-lucide-chevron-right"
            trailing
            :disabled="isSubmitting"
            @click="nextStep"
          >
            Next
          </UButton>

          <UButton
            v-else
            type="submit"
            icon="i-lucide-send"
            :loading="isSubmitting"
            :disabled="isSubmitting"
          >
            Submit Brief
          </UButton>
        </div>
      </div>
    </form>
  </div>
</template>
