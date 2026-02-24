<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Project Templates',
  middleware: ['auth']
})

const toast = useToast()

// Filters
const categoryFilter = ref('all')
const searchQuery = ref('')

// Fetch templates
const { data: templatesData, pending, refresh } = await useFetch('/api/agency/templates', {
  query: {
    category: categoryFilter,
    search: searchQuery
  }
})

const templates = computed(() => ((templatesData.value as any)?.templates || []) as any[])
const categories = computed(() => ((templatesData.value as any)?.categories || []) as string[])

// Fetch clients for "use template" modal
const { data: clientsData } = await useFetch('/api/agency/clients', {
  query: { limit: 100 }
})
const clients = computed(() => ((clientsData.value as any)?.clients || []) as any[])

// Format helpers
const formatCurrency = (value: number) => {
  if (!value) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

// Use template modal
const showUseModal = ref(false)
const selectedTemplate = ref<any>(null)
const newProject = ref({
  clientId: null as string | null,
  projectName: '',
  startDate: new Date().toISOString().split('T')[0],
  budgetOverride: null as number | null
})

const openUseModal = (template: any) => {
  selectedTemplate.value = template
  newProject.value = {
    clientId: null,
    projectName: '',
    startDate: new Date().toISOString().split('T')[0],
    budgetOverride: null
  }
  showUseModal.value = true
}

const creatingProject = ref(false)
const createProjectFromTemplate = async () => {
  if (!newProject.value.clientId || !newProject.value.projectName) {
    toast.add({ title: 'Please fill in required fields', color: 'error' })
    return
  }

  creatingProject.value = true
  try {
    const result = await $fetch(`/api/agency/templates/${selectedTemplate.value.id}/use`, {
      method: 'POST',
      body: newProject.value
    }) as any

    toast.add({
      title: 'Project created',
      description: `Created ${result.project.name} with ${result.tasksCreated} tasks`,
      color: 'success'
    })
    showUseModal.value = false
    refresh()
    navigateTo(`/agency/projects/${result.project.id}`)
  } catch (err: any) {
    toast.add({ title: 'Failed to create project', description: err.data?.message || err.message, color: 'error' })
  } finally {
    creatingProject.value = false
  }
}

// New template modal
const showNewModal = ref(false)
const newTemplate = ref({
  name: '',
  description: '',
  category: '',
  defaultBudgetType: 'time_materials',
  defaultBudgetAmount: null as number | null,
  estimatedDurationDays: null as number | null,
  estimatedHours: null as number | null,
  isPublic: true
})

const creatingTemplate = ref(false)
const createTemplate = async () => {
  if (!newTemplate.value.name) {
    toast.add({ title: 'Please enter a template name', color: 'error' })
    return
  }

  creatingTemplate.value = true
  try {
    await $fetch('/api/agency/templates', {
      method: 'POST',
      body: newTemplate.value
    })

    toast.add({ title: 'Template created', color: 'success' })
    showNewModal.value = false
    resetNewTemplate()
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to create template', description: err.data?.message || err.message, color: 'error' })
  } finally {
    creatingTemplate.value = false
  }
}

const resetNewTemplate = () => {
  newTemplate.value = {
    name: '',
    description: '',
    category: '',
    defaultBudgetType: 'time_materials',
    defaultBudgetAmount: null,
    estimatedDurationDays: null,
    estimatedHours: null,
    isPublic: true
  }
}

const budgetTypeOptions = [
  { label: 'Time & Materials', value: 'time_materials' },
  { label: 'Fixed Price', value: 'fixed' },
  { label: 'Retainer', value: 'retainer_allocation' }
]
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Project Templates">
        <template #right>
          <UButton
            label="New Template"
            icon="i-lucide-plus"
            color="primary"
            @click="showNewModal = true"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-4 mb-6">
          <UInput
            v-model="searchQuery"
            placeholder="Search templates..."
            icon="i-lucide-search"
            class="w-64"
          />
          <USelectMenu
            v-model="categoryFilter"
            :items="[{ label: 'All Categories', value: 'all' }, ...categories.map(c => ({ label: c, value: c }))]"
            placeholder="Category"
            value-key="value"
            class="w-48"
          />
        </div>

        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>

        <!-- Templates Grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <UCard
            v-for="template in templates"
            :key="template.id"
            class="hover:shadow-md transition-shadow"
          >
            <div class="flex flex-col h-full">
              <div class="flex items-start justify-between mb-3">
                <div>
                  <h3 class="font-semibold text-lg">{{ template.name }}</h3>
                  <UBadge v-if="template.category" variant="subtle" color="neutral" class="mt-1">
                    {{ template.category }}
                  </UBadge>
                </div>
                <UDropdownMenu
                  :items="[[
                    { label: 'Use Template', icon: 'i-lucide-play', onClick: () => openUseModal(template) },
                    { label: 'View Details', icon: 'i-lucide-eye', onClick: () => navigateTo(`/agency/templates/${template.id}`) }
                  ]]"
                >
                  <UButton variant="ghost" icon="i-lucide-more-vertical" size="xs" />
                </UDropdownMenu>
              </div>

              <p v-if="template.description" class="text-sm text-gray-500 mb-4 line-clamp-2">
                {{ template.description }}
              </p>

              <div class="grid grid-cols-2 gap-3 mt-auto">
                <div>
                  <p class="text-xs text-gray-400">Duration</p>
                  <p class="font-medium">{{ template.estimatedDurationDays || '—' }} days</p>
                </div>
                <div>
                  <p class="text-xs text-gray-400">Hours</p>
                  <p class="font-medium">{{ template.estimatedHours || '—' }}h</p>
                </div>
                <div>
                  <p class="text-xs text-gray-400">Tasks</p>
                  <p class="font-medium">{{ template.taskCount }}</p>
                </div>
                <div>
                  <p class="text-xs text-gray-400">Used</p>
                  <p class="font-medium">{{ template.timesUsed }}x</p>
                </div>
              </div>

              <div class="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <p class="text-xs text-gray-400">
                  {{ template.defaultBudgetType === 'fixed' ? 'Fixed' : 'T&M' }}
                  {{ template.defaultBudgetAmount ? `· ${formatCurrency(template.defaultBudgetAmount)}` : '' }}
                </p>
                <UButton
                  size="xs"
                  variant="soft"
                  label="Use"
                  icon="i-lucide-play"
                  @click="openUseModal(template)"
                />
              </div>
            </div>
          </UCard>

          <div v-if="templates.length === 0" class="col-span-full text-center text-gray-500 py-12">
            No templates found. Create one to get started!
          </div>
        </div>
      </div>
    </UDashboardPanel>

    <!-- Use Template Modal -->
    <UModal v-model:open="showUseModal">
      <template #header>
        <h3 class="font-semibold">Create Project from Template</h3>
      </template>
      <template #body>
        <div v-if="selectedTemplate" class="space-y-4">
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 mb-4">
            <p class="font-medium">{{ selectedTemplate.name }}</p>
            <p class="text-sm text-gray-500">
              {{ selectedTemplate.taskCount }} tasks · {{ selectedTemplate.estimatedHours || 0 }}h estimated
            </p>
          </div>

          <UFormField label="Client" required>
            <USelectMenu
              v-model="newProject.clientId"
              :items="clients.map(c => ({ label: c.name, value: c.id }))"
              placeholder="Select client"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Project Name" required>
            <UInput v-model="newProject.projectName" placeholder="Enter project name" />
          </UFormField>

          <UFormField label="Start Date">
            <UInput v-model="newProject.startDate" type="date" />
          </UFormField>

          <UFormField label="Budget Override (optional)">
            <UInput
              v-model.number="newProject.budgetOverride"
              type="number"
              min="0"
              :placeholder="`Default: ${formatCurrency(selectedTemplate.defaultBudgetAmount || 0)}`"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showUseModal = false" />
          <UButton
            color="primary"
            label="Create Project"
            icon="i-lucide-play"
            :loading="creatingProject"
            @click="createProjectFromTemplate"
          />
        </div>
      </template>
    </UModal>

    <!-- New Template Modal -->
    <UModal v-model:open="showNewModal">
      <template #header>
        <h3 class="font-semibold">Create New Template</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Template Name" required>
            <UInput v-model="newTemplate.name" placeholder="e.g., Website Development" />
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="newTemplate.description" placeholder="Describe this template..." :rows="2" />
          </UFormField>

          <UFormField label="Category">
            <UInput v-model="newTemplate.category" placeholder="e.g., Web Development, Marketing" />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Duration (days)">
              <UInput v-model.number="newTemplate.estimatedDurationDays" type="number" min="1" />
            </UFormField>
            <UFormField label="Estimated Hours">
              <UInput v-model.number="newTemplate.estimatedHours" type="number" min="0" step="0.5" />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Budget Type">
              <USelectMenu
                v-model="newTemplate.defaultBudgetType"
                :items="budgetTypeOptions"
                value-key="value"
              />
            </UFormField>
            <UFormField label="Default Budget">
              <UInput v-model.number="newTemplate.defaultBudgetAmount" type="number" min="0" placeholder="0" />
            </UFormField>
          </div>

          <UCheckbox v-model="newTemplate.isPublic" label="Make template visible to all team members" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showNewModal = false" />
          <UButton
            color="primary"
            label="Create Template"
            :loading="creatingTemplate"
            @click="createTemplate"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
