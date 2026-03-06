<script setup lang="ts">
definePageMeta({
  layout: false,
  auth: false
})

const route = useRoute()
const toast = useToast()
const slug = route.params.slug as string

// Fetch public form
const { data: formData, pending: loading, error } = await useFetch(`/api/agency/intake/forms/${slug}/public`)
const form = computed(() => (formData.value as any)?.form || null)
const fields = computed(() => (formData.value as any)?.fields || [])

// Form state
const formValues = ref<Record<string, any>>({})
const formErrors = ref<Record<string, string>>({})
const submitting = ref(false)
const submitted = ref(false)

// Initialize form values
watch(fields, (flds) => {
  flds.forEach((field: any) => {
    if (formValues.value[field.fieldKey] === undefined) {
      if (field.fieldType === 'checkbox' || field.fieldType === 'multiselect') {
        formValues.value[field.fieldKey] = []
      } else {
        formValues.value[field.fieldKey] = ''
      }
    }
  })
}, { immediate: true })

// Contact info (always required)
const contactInfo = ref({
  name: '',
  email: '',
  phone: '',
  company: ''
})

// Validate field
const validateField = (field: any): string | null => {
  const value = formValues.value[field.fieldKey]

  if (field.isRequired) {
    if (Array.isArray(value) && value.length === 0) {
      return `${field.label} is required`
    }
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return `${field.label} is required`
    }
  }

  if (value && field.fieldType === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      return 'Please enter a valid email address'
    }
  }

  if (value && field.fieldType === 'url') {
    try {
      new URL(value)
    } catch {
      return 'Please enter a valid URL'
    }
  }

  if (value && field.minLength && typeof value === 'string' && value.length < field.minLength) {
    return `Minimum ${field.minLength} characters required`
  }

  if (value && field.maxLength && typeof value === 'string' && value.length > field.maxLength) {
    return `Maximum ${field.maxLength} characters allowed`
  }

  return null
}

// Validate all fields
const validateForm = (): boolean => {
  formErrors.value = {}
  let isValid = true

  // Validate contact info
  if (!contactInfo.value.name.trim()) {
    formErrors.value['_name'] = 'Name is required'
    isValid = false
  }
  if (!contactInfo.value.email.trim()) {
    formErrors.value['_email'] = 'Email is required'
    isValid = false
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(contactInfo.value.email)) {
      formErrors.value['_email'] = 'Please enter a valid email address'
      isValid = false
    }
  }

  // Validate form fields
  fields.value.forEach((field: any) => {
    if (['heading', 'paragraph', 'divider'].includes(field.fieldType)) return

    const error = validateField(field)
    if (error) {
      formErrors.value[field.fieldKey] = error
      isValid = false
    }
  })

  return isValid
}

// Submit form
const submitForm = async () => {
  if (!validateForm()) {
    toast.add({ title: 'Please fix the errors before submitting', color: 'error' })
    return
  }

  submitting.value = true
  try {
    await $fetch(`/api/agency/intake/forms/${slug}/submit`, {
      method: 'POST',
      body: {
        name: contactInfo.value.name,
        email: contactInfo.value.email,
        phone: contactInfo.value.phone || null,
        company: contactInfo.value.company || null,
        data: formValues.value,
        source: 'direct',
        referrerUrl: document.referrer || null
      }
    })

    submitted.value = true
  } catch (err: any) {
    toast.add({
      title: 'Failed to submit form',
      description: err.data?.message || 'Please try again',
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}

// Check if field should be shown (conditional logic)
const shouldShowField = (field: any): boolean => {
  if (!field.showWhen) return true

  const condition = field.showWhen
  const targetValue = formValues.value[condition.field_key]

  switch (condition.operator) {
    case 'equals':
      return targetValue === condition.value
    case 'not_equals':
      return targetValue !== condition.value
    case 'contains':
      return Array.isArray(targetValue)
        ? targetValue.includes(condition.value)
        : String(targetValue).includes(condition.value)
    case 'not_empty':
      return !!targetValue && (Array.isArray(targetValue) ? targetValue.length > 0 : true)
    case 'empty':
      return !targetValue || (Array.isArray(targetValue) ? targetValue.length === 0 : false)
    default:
      return true
  }
}

// Get field width class
const getWidthClass = (width: string) => {
  switch (width) {
    case 'half': return 'w-full md:w-1/2'
    case 'third': return 'w-full md:w-1/3'
    default: return 'w-full'
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
      <XfLoader />
    </div>

    <!-- Error -->
    <div v-else-if="error || !form" class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <UIcon name="i-lucide-file-x" class="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Form Not Found</h1>
        <p class="text-gray-500">This form may have been deactivated or doesn't exist.</p>
      </div>
    </div>

    <!-- Form -->
    <div v-else class="max-w-2xl mx-auto px-4 py-12">
      <!-- Header -->
      <div class="text-center mb-8">
        <img
          v-if="form.logoUrl"
          :src="form.logoUrl"
          alt="Logo"
          class="h-12 mx-auto mb-4"
        />
        <h1
          class="text-3xl font-bold mb-2"
          :style="{ color: form.primaryColor }"
        >
          {{ form.name }}
        </h1>
        <p v-if="form.description" class="text-gray-600 dark:text-gray-400">
          {{ form.description }}
        </p>
      </div>

      <!-- Success Message -->
      <UCard v-if="submitted" class="text-center">
        <UIcon name="i-lucide-check-circle" class="w-16 h-16 text-emerald-500 mx-auto mb-4" />
        <h2 class="text-2xl font-bold mb-2">Thank You!</h2>
        <p class="text-gray-600 dark:text-gray-400">
          {{ form.confirmationMessage || 'Your submission has been received. We\'ll be in touch shortly.' }}
        </p>
        <UButton
          v-if="form.confirmationRedirectUrl"
          :href="form.confirmationRedirectUrl"
          class="mt-6"
          color="primary"
          label="Continue"
        />
      </UCard>

      <!-- Form Content -->
      <UCard v-else>
        <form @submit.prevent="submitForm">
          <!-- Contact Information -->
          <div class="mb-8 pb-6 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-lg font-semibold mb-4">Contact Information</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UFormField label="Your Name" required :error="formErrors['_name']">
                <UInput
                  v-model="contactInfo.name"
                  placeholder="John Doe"
                  :class="{ 'ring-red-500': formErrors['_name'] }"
                />
              </UFormField>

              <UFormField label="Email Address" required :error="formErrors['_email']">
                <UInput
                  v-model="contactInfo.email"
                  type="email"
                  placeholder="john@example.com"
                  :class="{ 'ring-red-500': formErrors['_email'] }"
                />
              </UFormField>

              <UFormField label="Phone Number">
                <UInput
                  v-model="contactInfo.phone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                />
              </UFormField>

              <UFormField label="Company">
                <UInput
                  v-model="contactInfo.company"
                  placeholder="Acme Inc."
                />
              </UFormField>
            </div>
          </div>

          <!-- Form Fields -->
          <div class="flex flex-wrap -mx-2">
            <template v-for="field in fields" :key="field.id">
              <div
                v-if="shouldShowField(field)"
                :class="[getWidthClass(field.width), 'px-2 mb-4']"
              >
                <!-- Heading -->
                <h3 v-if="field.fieldType === 'heading'" class="text-lg font-semibold mt-4">
                  {{ field.label }}
                </h3>

                <!-- Paragraph -->
                <p v-else-if="field.fieldType === 'paragraph'" class="text-gray-600 dark:text-gray-400">
                  {{ field.label }}
                </p>

                <!-- Divider -->
                <hr v-else-if="field.fieldType === 'divider'" class="my-4 border-gray-200 dark:border-gray-700" />

                <!-- Regular Fields -->
                <UFormField
                  v-else
                  :label="field.label"
                  :required="field.isRequired"
                  :hint="field.description"
                  :error="formErrors[field.fieldKey]"
                >
                  <!-- Text -->
                  <UInput
                    v-if="['text', 'email', 'phone', 'url', 'number'].includes(field.fieldType)"
                    v-model="formValues[field.fieldKey]"
                    :type="field.fieldType === 'number' ? 'number' : 'text'"
                    :placeholder="field.placeholder"
                    :maxlength="field.maxLength"
                  />

                  <!-- Textarea -->
                  <UTextarea
                    v-else-if="field.fieldType === 'textarea'"
                    v-model="formValues[field.fieldKey]"
                    :placeholder="field.placeholder"
                    :rows="4"
                    :maxlength="field.maxLength"
                  />

                  <!-- Date -->
                  <UInput
                    v-else-if="field.fieldType === 'date'"
                    v-model="formValues[field.fieldKey]"
                    type="date"
                  />

                  <!-- DateTime -->
                  <UInput
                    v-else-if="field.fieldType === 'datetime'"
                    v-model="formValues[field.fieldKey]"
                    type="datetime-local"
                  />

                  <!-- Select -->
                  <USelectMenu
                    v-else-if="field.fieldType === 'select'"
                    v-model="formValues[field.fieldKey]"
                    :items="(field.options || []).map((o: any) => ({ label: o.label, value: o.value }))"
                    :placeholder="field.placeholder || 'Select an option'"
                    value-key="value"
                  />

                  <!-- Multi Select -->
                  <USelectMenu
                    v-else-if="field.fieldType === 'multiselect'"
                    v-model="formValues[field.fieldKey]"
                    :items="(field.options || []).map((o: any) => ({ label: o.label, value: o.value }))"
                    :placeholder="field.placeholder || 'Select options'"
                    value-key="value"
                    multiple
                  />

                  <!-- Radio -->
                  <div v-else-if="field.fieldType === 'radio'" class="space-y-2">
                    <label
                      v-for="option in field.options"
                      :key="option.value"
                      class="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        v-model="formValues[field.fieldKey]"
                        type="radio"
                        :value="option.value"
                        class="text-primary-500"
                      />
                      <span>{{ option.label }}</span>
                    </label>
                  </div>

                  <!-- Checkbox -->
                  <div v-else-if="field.fieldType === 'checkbox'" class="space-y-2">
                    <label
                      v-for="option in field.options"
                      :key="option.value"
                      class="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        v-model="formValues[field.fieldKey]"
                        type="checkbox"
                        :value="option.value"
                        class="rounded text-primary-500"
                      />
                      <span>{{ option.label }}</span>
                    </label>
                  </div>

                  <!-- File Upload -->
                  <div v-else-if="field.fieldType === 'file' || field.fieldType === 'files'" class="border-2 border-dashed rounded-lg p-6 text-center">
                    <UIcon name="i-lucide-upload" class="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p class="text-sm text-gray-500">
                      Drag and drop files here, or click to select
                    </p>
                    <input
                      type="file"
                      :multiple="field.fieldType === 'files'"
                      :accept="field.allowedFileTypes?.join(',')"
                      class="absolute inset-0 opacity-0 cursor-pointer"
                      @change="(e: Event) => {
                        const target = e.target as HTMLInputElement
                        formValues[field.fieldKey] = target.files
                      }"
                    />
                  </div>
                </UFormField>
              </div>
            </template>
          </div>

          <!-- Submit Button -->
          <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <UButton
              type="submit"
              color="primary"
              size="lg"
              block
              :loading="submitting"
              :style="{ backgroundColor: form.primaryColor }"
            >
              Submit
            </UButton>
          </div>
        </form>
      </UCard>

      <!-- Footer -->
      <p class="text-center text-xs text-gray-400 mt-6">
        Powered by Agency Dashboard
      </p>
    </div>
  </div>
</template>
