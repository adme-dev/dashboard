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
  tags: '',
  defaultBudgetType: 'time_materials',
  defaultBudgetAmount: null as number | null,
  estimatedDurationDays: null as number | null,
  estimatedHours: null as number | null,
  defaultHourlyRate: null as number | null,
  defaultBillingMethod: 'hourly',
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
    const tags = newTemplate.value.tags
      ? newTemplate.value.tags.split(',').map(t => t.trim()).filter(Boolean)
      : null

    await $fetch('/api/agency/templates', {
      method: 'POST',
      body: {
        name: newTemplate.value.name,
        description: newTemplate.value.description || null,
        category: newTemplate.value.category || null,
        tags,
        defaultBudgetType: newTemplate.value.defaultBudgetType,
        defaultBudgetAmount: newTemplate.value.defaultBudgetAmount,
        estimatedDurationDays: newTemplate.value.estimatedDurationDays,
        estimatedHours: newTemplate.value.estimatedHours,
        defaultHourlyRate: newTemplate.value.defaultHourlyRate,
        defaultBillingMethod: newTemplate.value.defaultBillingMethod,
        isPublic: newTemplate.value.isPublic
      }
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
    tags: '',
    defaultBudgetType: 'time_materials',
    defaultBudgetAmount: null,
    estimatedDurationDays: null,
    estimatedHours: null,
    defaultHourlyRate: null,
    defaultBillingMethod: 'hourly',
    isPublic: true
  }
}

const budgetTypeOptions = [
  { label: 'Time & Materials', value: 'time_materials' },
  { label: 'Fixed Price', value: 'fixed' },
  { label: 'Retainer', value: 'retainer_allocation' }
]

const billingMethodOptions = [
  { label: 'Hourly', value: 'hourly' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Per Milestone', value: 'milestone' },
  { label: 'Monthly Retainer', value: 'retainer' }
]

const categoryOptions = computed(() => {
  return [
    ...categories.value.map(c => ({ label: c, value: c })),
    { label: 'Other...', value: '__custom__' }
  ]
})

const selectedCategoryOption = ref('__custom__')
const customCategory = ref('')

watch(selectedCategoryOption, (val) => {
  if (val !== '__custom__') {
    newTemplate.value.category = val
  }
})

watch(customCategory, (val) => {
  if (selectedCategoryOption.value === '__custom__') {
    newTemplate.value.category = val
  }
})

// View toggle
const viewMode = ref<'grid' | 'table'>('grid')

const budgetTypeLabel = (type: string) => {
  const map: Record<string, string> = { time_materials: 'T&M', fixed: 'Fixed', retainer_allocation: 'Retainer' }
  return map[type] || type
}

const tableColumns = [
  { accessorKey: 'name', header: 'Template' },
  { accessorKey: 'category', header: 'Category' },
  { accessorKey: 'estimatedDurationDays', header: 'Duration' },
  { accessorKey: 'estimatedHours', header: 'Hours' },
  { accessorKey: 'taskCount', header: 'Tasks' },
  { accessorKey: 'defaultBudgetType', header: 'Budget Type' },
  { accessorKey: 'defaultBudgetAmount', header: 'Budget' },
  { accessorKey: 'timesUsed', header: 'Used' },
  { accessorKey: 'actions', header: '' }
]
</script>

<template>
  <div class="flex-1 min-w-0 min-h-0">
    <UDashboardPanel :ui="{ root: 'max-h-svh' }">
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
          <div class="ml-auto inline-flex rounded-md shadow-xs">
            <UButton
              :variant="viewMode === 'grid' ? 'solid' : 'outline'"
              icon="i-lucide-layout-grid"
              class="rounded-r-none"
              @click="viewMode = 'grid'"
            />
            <UButton
              :variant="viewMode === 'table' ? 'solid' : 'outline'"
              icon="i-lucide-table"
              class="rounded-l-none -ml-px"
              @click="viewMode = 'table'"
            />
          </div>
        </div>

        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <XfLoader />
        </div>

        <!-- Templates Grid -->
        <div v-else-if="viewMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

        <!-- Templates Table -->
        <div v-else>
          <UTable :data="templates" :columns="tableColumns">
            <template #name-cell="{ row }">
              <div>
                <NuxtLink :to="`/agency/templates/${row.original.id}`" class="font-medium hover:text-primary">
                  {{ row.original.name }}
                </NuxtLink>
                <p v-if="row.original.description" class="text-xs text-muted line-clamp-1 mt-0.5">
                  {{ row.original.description }}
                </p>
              </div>
            </template>

            <template #category-cell="{ row }">
              <UBadge v-if="row.original.category" variant="subtle" color="neutral" size="sm">
                {{ row.original.category }}
              </UBadge>
              <span v-else class="text-muted">—</span>
            </template>

            <template #estimatedDurationDays-cell="{ row }">
              {{ row.original.estimatedDurationDays ? `${row.original.estimatedDurationDays}d` : '—' }}
            </template>

            <template #estimatedHours-cell="{ row }">
              {{ row.original.estimatedHours ? `${row.original.estimatedHours}h` : '—' }}
            </template>

            <template #taskCount-cell="{ row }">
              {{ row.original.taskCount }}
            </template>

            <template #defaultBudgetType-cell="{ row }">
              {{ budgetTypeLabel(row.original.defaultBudgetType) }}
            </template>

            <template #defaultBudgetAmount-cell="{ row }">
              {{ row.original.defaultBudgetAmount ? formatCurrency(row.original.defaultBudgetAmount) : '—' }}
            </template>

            <template #timesUsed-cell="{ row }">
              {{ row.original.timesUsed }}x
            </template>

            <template #actions-cell="{ row }">
              <div class="flex items-center justify-end gap-1">
                <UButton
                  size="xs"
                  variant="soft"
                  label="Use"
                  icon="i-lucide-play"
                  @click="openUseModal(row.original)"
                />
                <UDropdownMenu
                  :items="[[
                    { label: 'Use Template', icon: 'i-lucide-play', onClick: () => openUseModal(row.original) },
                    { label: 'View Details', icon: 'i-lucide-eye', onClick: () => navigateTo(`/agency/templates/${row.original.id}`) }
                  ]]"
                >
                  <UButton variant="ghost" icon="i-lucide-more-vertical" size="xs" />
                </UDropdownMenu>
              </div>
            </template>
          </UTable>

          <div v-if="templates.length === 0" class="text-center text-gray-500 py-12">
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

    <!-- New Template Slideover -->
    <USlideover v-model:open="showNewModal">
      <template #header>
        <div class="flex items-center justify-between w-full">
          <h3 class="font-semibold text-lg">Create New Template</h3>
        </div>
      </template>
      <template #body>
        <div class="space-y-6">
          <!-- Basic Info -->
          <div>
            <h4 class="text-sm font-medium text-muted mb-3">Basic Information</h4>
            <div class="space-y-4">
              <UFormField label="Template Name" required class="w-full">
                <UInput v-model="newTemplate.name" placeholder="e.g., Website Development" class="w-full" />
              </UFormField>

              <UFormField label="Description" class="w-full">
                <UTextarea v-model="newTemplate.description" placeholder="Describe what this template is used for, the typical workflow, and expected deliverables..." :rows="5" class="w-full" />
              </UFormField>

              <UFormField label="Category" class="w-full">
                <div class="flex gap-2">
                  <USelectMenu
                    v-model="selectedCategoryOption"
                    :items="categoryOptions"
                    value-key="value"
                    placeholder="Select a category"
                    class="w-full"
                  />
                </div>
                <UInput
                  v-if="selectedCategoryOption === '__custom__'"
                  v-model="customCategory"
                  placeholder="Enter custom category..."
                  class="w-full mt-2"
                />
              </UFormField>

              <UFormField label="Tags" class="w-full">
                <UInput v-model="newTemplate.tags" placeholder="e.g., marketing, campaign, digital (comma-separated)" class="w-full" />
                <p class="text-xs text-muted mt-1">Comma-separated tags for search and filtering</p>
              </UFormField>
            </div>
          </div>

          <!-- Timeline & Effort -->
          <div>
            <h4 class="text-sm font-medium text-muted mb-3">Timeline & Effort</h4>
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Duration (days)">
                <UInput v-model.number="newTemplate.estimatedDurationDays" type="number" min="1" placeholder="e.g., 30" class="w-full" />
              </UFormField>
              <UFormField label="Estimated Hours">
                <UInput v-model.number="newTemplate.estimatedHours" type="number" min="0" step="0.5" placeholder="e.g., 80" class="w-full" />
              </UFormField>
            </div>
          </div>

          <!-- Budget & Billing -->
          <div>
            <h4 class="text-sm font-medium text-muted mb-3">Budget & Billing</h4>
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <UFormField label="Budget Type">
                  <USelectMenu
                    v-model="newTemplate.defaultBudgetType"
                    :items="budgetTypeOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Default Budget ($)">
                  <UInput v-model.number="newTemplate.defaultBudgetAmount" type="number" min="0" step="100" placeholder="e.g., 10000" class="w-full" />
                </UFormField>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <UFormField label="Billing Method">
                  <USelectMenu
                    v-model="newTemplate.defaultBillingMethod"
                    :items="billingMethodOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Hourly Rate ($)">
                  <UInput v-model.number="newTemplate.defaultHourlyRate" type="number" min="0" step="5" placeholder="e.g., 150" class="w-full" />
                </UFormField>
              </div>
            </div>
          </div>

          <!-- Visibility -->
          <div>
            <h4 class="text-sm font-medium text-muted mb-3">Visibility</h4>
            <UCheckbox v-model="newTemplate.isPublic" label="Make template visible to all team members" />
            <p class="text-xs text-muted mt-1 ml-6">Private templates are only visible to you and admins</p>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showNewModal = false" />
          <UButton
            color="primary"
            label="Create Template"
            icon="i-lucide-plus"
            :loading="creatingTemplate"
            :disabled="!newTemplate.name"
            @click="createTemplate"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>
