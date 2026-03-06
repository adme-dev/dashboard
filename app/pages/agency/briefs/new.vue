<script setup lang="ts">
import type { BriefCategory, BriefTemplate } from '~/types'

definePageMeta({
  title: 'Submit New Brief'
})

const toast = useToast()
const { user } = useAuth()

// State
const selectedCategory = ref<BriefCategory | null>(null)
const selectedTemplate = ref<BriefTemplate | null>(null)
const isSubmitting = ref(false)

// Fetch categories with templates
const { data: categories, pending: categoriesLoading } = await useFetch('/api/agency/briefs/categories')

// Fetch full template with fields when selected
const { data: templateData, pending: templateLoading } = await useFetch(
  () => selectedTemplate.value?.slug ? `/api/agency/briefs/templates/${selectedTemplate.value.slug}` as const : '/api/agency/briefs/templates' as const,
  {
    watch: [selectedTemplate],
    immediate: false
  }
)

// Templates for selected category
const categoryTemplates = computed(() => {
  if (!selectedCategory.value || !categories.value) return []
  const categoriesList = categories.value as any[]
  const category = categoriesList.find((c: any) => c.id === selectedCategory.value?.id)
  return category?.templates || []
})

// Select category
function selectCategory(category: BriefCategory) {
  selectedCategory.value = category
  selectedTemplate.value = null
}

// Select template
function selectTemplate(template: BriefTemplate) {
  selectedTemplate.value = template
}

// Go back to category selection
function goBackToCategories() {
  selectedCategory.value = null
  selectedTemplate.value = null
}

// Go back to template selection
function goBackToTemplates() {
  selectedTemplate.value = null
}

// Handle form submission
async function handleSubmit(values: Record<string, any>, isDraft: boolean) {
  if (!selectedTemplate.value || !templateData.value) return

  isSubmitting.value = true

  try {
    const templateDataValue = templateData.value as any
    const response = await $fetch('/api/agency/briefs', {
      method: 'POST',
      body: {
        templateId: templateDataValue.id,
        title: values.project_name || values.title || `${templateDataValue.name} - ${new Date().toLocaleDateString()}`,
        description: values.description || values.project_description || '',
        priority: values.priority || templateDataValue.defaultPriority || 'normal',
        fieldValues: values,
        isDraft
      }
    }) as any

    toast.add({
      title: isDraft ? 'Draft Saved' : 'Brief Submitted',
      description: isDraft
        ? 'Your brief has been saved as a draft.'
        : `Your brief has been submitted successfully. Reference: ${response.reference}`,
      color: 'success',
      duration: 5000
    })

    navigateTo(`/agency/briefs/${response.id}`)
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.statusMessage || 'Failed to submit brief',
      color: 'error',
      duration: 5000
    })
  } finally {
    isSubmitting.value = false
  }
}

// Handle cancel
function handleCancel() {
  if (selectedTemplate.value) {
    goBackToTemplates()
  } else if (selectedCategory.value) {
    goBackToCategories()
  } else {
    navigateTo('/agency/briefs')
  }
}

// Get category icon
function getCategoryIcon(category: any) {
  return category.icon || 'i-lucide-folder'
}

// Get category color class
function getCategoryColorClass(category: any) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
  }
  return colors[category.color] || colors.blue
}
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar>
        <template #left>
          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-arrow-left"
              variant="ghost"
              color="neutral"
              @click="handleCancel"
            />
            <h1 class="text-lg font-semibold">
              <span v-if="!selectedCategory">Submit New Brief</span>
              <span v-else-if="!selectedTemplate">{{ selectedCategory.name }}</span>
              <span v-else>{{ selectedTemplate.name }}</span>
            </h1>
          </div>
        </template>

        <template #right>
          <div v-if="selectedTemplate" class="flex items-center gap-2 text-sm text-muted">
            <UIcon name="i-lucide-info" class="size-4" />
            <span>All fields marked with * are required</span>
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Loading State -->
        <div v-if="categoriesLoading" class="flex items-center justify-center py-12">
          <XfLoader />
        </div>

        <!-- Step 1: Category Selection -->
        <div v-else-if="!selectedCategory" class="space-y-6">
          <div class="text-center max-w-2xl mx-auto mb-8">
            <h2 class="text-2xl font-bold text-highlighted mb-2">What type of brief do you need?</h2>
            <p class="text-muted">
              Select a category to see available brief templates
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <UCard
              v-for="category in (categories as any[])"
              :key="(category as any).id"
              class="cursor-pointer hover:ring-2 hover:ring-primary transition-all"
              @click="selectCategory(category as any)"
            >
              <div class="flex flex-col items-center text-center p-4">
                <div
                  class="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                  :class="getCategoryColorClass(category as any)"
                >
                  <UIcon :name="getCategoryIcon(category as any)" class="size-8" />
                </div>
                <h3 class="text-lg font-semibold text-highlighted mb-2">
                  {{ (category as any).name }}
                </h3>
                <p class="text-sm text-muted mb-4">
                  {{ (category as any).description }}
                </p>
                <UBadge color="neutral" variant="subtle" size="xs">
                  {{ (category as any).templateCount || (category as any).templates?.length || 0 }} templates
                </UBadge>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Step 2: Template Selection -->
        <div v-else-if="!selectedTemplate" class="space-y-6">
          <div class="flex items-center gap-4 mb-6">
            <UButton
              icon="i-lucide-arrow-left"
              variant="ghost"
              size="sm"
              @click="goBackToCategories"
            >
              Back to Categories
            </UButton>
          </div>

          <div class="text-center max-w-2xl mx-auto mb-8">
            <div
              class="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
              :class="getCategoryColorClass(selectedCategory)"
            >
              <UIcon :name="getCategoryIcon(selectedCategory)" class="size-6" />
            </div>
            <h2 class="text-2xl font-bold text-highlighted mb-2">{{ selectedCategory.name }}</h2>
            <p class="text-muted">
              {{ selectedCategory.description }}
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <UCard
              v-for="template in categoryTemplates"
              :key="template.id"
              class="cursor-pointer hover:ring-2 hover:ring-primary transition-all"
              @click="selectTemplate(template)"
            >
              <div class="flex items-start gap-4">
                <div
                  class="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                  :class="getCategoryColorClass(selectedCategory)"
                >
                  <UIcon :name="template.icon || 'i-lucide-file-text'" class="size-6" />
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="font-semibold text-highlighted mb-1">
                    {{ template.name }}
                  </h3>
                  <p class="text-sm text-muted line-clamp-2 mb-3">
                    {{ template.description }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <UBadge v-if="template.isMultiStep" color="info" variant="subtle" size="xs">
                      <UIcon name="i-lucide-layers" class="size-3 mr-1" />
                      Multi-step
                    </UBadge>
                    <UBadge v-if="template.allowAttachments" color="neutral" variant="subtle" size="xs">
                      <UIcon name="i-lucide-paperclip" class="size-3 mr-1" />
                      Attachments
                    </UBadge>
                    <UBadge v-if="template.requiresApproval" color="warning" variant="subtle" size="xs">
                      <UIcon name="i-lucide-shield-check" class="size-3 mr-1" />
                      Requires Approval
                    </UBadge>
                  </div>
                </div>
                <UIcon name="i-lucide-chevron-right" class="size-5 text-muted shrink-0" />
              </div>
            </UCard>
          </div>

          <div v-if="categoryTemplates.length === 0" class="text-center py-12">
            <UIcon name="i-lucide-file-x" class="size-12 mx-auto text-muted mb-4" />
            <p class="text-muted">No templates available in this category</p>
          </div>
        </div>

        <!-- Step 3: Form -->
        <div v-else class="max-w-4xl mx-auto">
          <!-- Breadcrumbs -->
          <div class="flex items-center gap-2 text-sm mb-6">
            <button
              class="text-muted hover:text-highlighted transition-colors"
              @click="goBackToCategories"
            >
              Briefs
            </button>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
            <button
              class="text-muted hover:text-highlighted transition-colors"
              @click="goBackToTemplates"
            >
              {{ selectedCategory.name }}
            </button>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
            <span class="text-highlighted font-medium">{{ selectedTemplate.name }}</span>
          </div>

          <!-- Template Header -->
          <div class="mb-8">
            <div class="flex items-start gap-4">
              <div
                class="w-14 h-14 rounded-lg flex items-center justify-center shrink-0"
                :class="getCategoryColorClass(selectedCategory)"
              >
                <UIcon :name="selectedTemplate.icon || 'i-lucide-file-text'" class="size-7" />
              </div>
              <div>
                <h2 class="text-xl font-bold text-highlighted">{{ selectedTemplate.name }}</h2>
                <p class="text-muted mt-1">{{ selectedTemplate.description }}</p>
              </div>
            </div>
          </div>

          <!-- Loading template -->
          <div v-if="templateLoading" class="flex items-center justify-center py-12">
            <XfLoader />
          </div>

          <!-- Form -->
          <UCard v-else-if="templateData">
            <BriefsBriefFormRenderer
              :template="templateData as any"
              :disabled="isSubmitting"
              @submit="handleSubmit"
              @cancel="handleCancel"
            />
          </UCard>
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>
