<script setup lang="ts">
import type { BriefTemplate, BriefFormValues, BriefCategory } from '~/types'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const toast = useToast()
const router = useRouter()

// Step: 'categories' → 'templates' → 'form'
const step = ref<'categories' | 'templates' | 'form'>('categories')
const selectedCategoryId = ref<string | null>(null)
const selectedTemplate = ref<BriefTemplate | null>(null)

// Extra fields
const briefTitle = ref('')
const briefPriority = ref('medium')
const briefDeadline = ref('')
const submitting = ref(false)

interface BriefTemplateCategory extends BriefCategory {
  templates: BriefTemplate[]
}

interface BriefTemplatesResponse {
  categories: BriefTemplateCategory[]
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    return (error as { data?: { statusMessage?: string } }).data?.statusMessage
  }
  return undefined
}

// Fetch templates grouped by category
const { data: templatesData, pending } = useFetch<BriefTemplatesResponse>('/api/portal/briefs/templates')

const categories = computed(() => templatesData.value?.categories || [])

const selectedCategory = computed(() =>
  categories.value.find(category => category.id === selectedCategoryId.value)
)

const priorities = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' }
]

function selectCategory(categoryId: string) {
  selectedCategoryId.value = categoryId
  step.value = 'templates'
}

function selectTemplate(template: BriefTemplate) {
  selectedTemplate.value = template
  briefTitle.value = ''
  briefPriority.value = template.defaultPriority || 'medium'
  briefDeadline.value = ''
  step.value = 'form'
}

function goBack() {
  if (step.value === 'form') {
    step.value = 'templates'
    selectedTemplate.value = null
  } else if (step.value === 'templates') {
    step.value = 'categories'
    selectedCategoryId.value = null
  }
}

async function handleSubmit(fieldValues: BriefFormValues) {
  if (!selectedTemplate.value) return

  if (!briefTitle.value.trim()) {
    toast.add({ title: 'Please enter a title for your brief', color: 'error' })
    return
  }

  submitting.value = true
  try {
    const result = await $fetch<{ id: string, referenceNumber: string }>('/api/portal/briefs', {
      method: 'POST',
      body: {
        templateId: selectedTemplate.value.id,
        title: briefTitle.value.trim(),
        fieldValues,
        priority: briefPriority.value,
        requestedDeadline: briefDeadline.value || undefined
      }
    })
    toast.add({
      title: 'Brief submitted',
      description: `Reference: ${result.referenceNumber}`,
      color: 'success'
    })
    await router.push(`/portal/briefs/${result.id}`)
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to submit brief',
      description: errorMessage(error) || 'An error occurred',
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div>
      <button
        v-if="step !== 'categories'"
        class="text-sm text-muted hover:text-default mb-2 inline-flex items-center gap-1"
        @click="goBack"
      >
        <UIcon name="i-lucide-arrow-left" class="w-3 h-3" />
        Back
      </button>
      <NuxtLink
        v-else
        to="/portal/briefs?status=submitted"
        class="text-sm text-muted hover:text-default mb-2 inline-flex items-center gap-1"
      >
        <UIcon name="i-lucide-arrow-left" class="w-3 h-3" />
        Back to briefs
      </NuxtLink>

      <h1 class="text-2xl font-bold">
        Submit a Brief
      </h1>
      <p class="text-sm text-muted mt-1">
        <template v-if="step === 'categories'">
          Choose a category to get started
        </template>
        <template v-else-if="step === 'templates'">
          Select a template from {{ selectedCategory?.name }}
        </template>
        <template v-else-if="selectedTemplate">
          Fill out the {{ selectedTemplate.name }} brief
        </template>
      </p>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="space-y-4">
      <div v-for="i in 3" :key="i" class="h-32 rounded-lg bg-elevated animate-pulse" />
    </div>

    <!-- Step 1: Categories -->
    <div v-else-if="step === 'categories'" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <button
        v-for="category in categories"
        :key="category.id"
        class="p-6 rounded-lg bg-elevated hover:ring-1 hover:ring-primary/50 transition-all text-left"
        @click="selectCategory(category.id)"
      >
        <div class="flex items-center gap-3 mb-2">
          <UIcon v-if="category.icon" :name="category.icon" class="size-6 text-primary" />
          <h3 class="text-lg font-semibold">
            {{ category.name }}
          </h3>
        </div>
        <p class="text-sm text-muted">
          {{ category.templates.length }} template{{ category.templates.length !== 1 ? 's' : '' }}
        </p>
      </button>

      <p v-if="categories.length === 0" class="col-span-full text-center text-muted py-12">
        No brief templates are available at the moment.
      </p>
    </div>

    <!-- Step 2: Templates -->
    <div v-else-if="step === 'templates'" class="space-y-4">
      <button
        v-for="template in selectedCategory?.templates"
        :key="template.id"
        class="w-full p-5 rounded-lg bg-elevated hover:ring-1 hover:ring-primary/50 transition-all text-left"
        @click="selectTemplate(template)"
      >
        <div class="flex items-start gap-3">
          <UIcon v-if="template.icon" :name="template.icon" class="size-5 text-primary mt-0.5" />
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold">
              {{ template.name }}
            </h3>
            <p v-if="template.description" class="text-sm text-muted mt-1">
              {{ template.description }}
            </p>
            <div class="flex items-center gap-2 mt-2">
              <UBadge
                v-if="template.fields?.length"
                color="neutral"
                variant="subtle"
                size="xs"
              >
                {{ template.fields.length }} field{{ template.fields.length !== 1 ? 's' : '' }}
              </UBadge>
              <UBadge
                v-if="template.isMultiStep"
                color="info"
                variant="subtle"
                size="xs"
              >
                Multi-step
              </UBadge>
            </div>
          </div>
          <UIcon name="i-lucide-chevron-right" class="text-muted size-5 mt-0.5" />
        </div>
      </button>

      <p v-if="!selectedCategory?.templates?.length" class="text-center text-muted py-12">
        No templates in this category.
      </p>
    </div>

    <!-- Step 3: Form -->
    <div v-else-if="step === 'form' && selectedTemplate" class="space-y-6">
      <!-- Title + meta fields -->
      <UCard>
        <div class="space-y-4">
          <UFormField name="title" label="Brief Title" required>
            <UInput
              v-model="briefTitle"
              placeholder="Give your brief a title..."
              class="w-full"
            />
          </UFormField>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField name="priority" label="Priority">
              <USelectMenu
                v-model="briefPriority"
                :items="priorities"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField name="deadline" label="Requested Deadline">
              <UInput
                v-model="briefDeadline"
                type="date"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>
      </UCard>

      <!-- Dynamic form fields -->
      <UCard>
        <template #header>
          <span class="font-semibold text-sm">Brief Details</span>
        </template>
        <BriefsBriefFormRenderer
          :template="selectedTemplate"
          :disabled="submitting"
          @submit="handleSubmit"
          @cancel="goBack"
        />
      </UCard>
    </div>
  </div>
</template>
