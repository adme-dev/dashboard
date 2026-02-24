<script setup lang="ts">
definePageMeta({
  title: 'New Project',
  middleware: ['auth']
})

const router = useRouter()
const toast = useToast()

// Form data
const form = ref({
  name: '',
  description: '',
  clientId: null as string | null,
  budgetAmount: 0,
  budgetType: 'fixed',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  projectManagerId: null as string | null
})

// Fetch clients
const { data: clientsData } = await useFetch('/api/agency/clients')
const clients = computed(() => ((clientsData.value as any) || []) as any[])

// Fetch team members for project manager selection
const { data: teamData } = await useFetch('/api/agency/team-members')
const teamMembers = computed(() => ((teamData.value as any)?.members || []) as any[])

// Fetch templates for quick setup
const { data: templatesData } = await useFetch('/api/agency/templates')
const templates = computed(() => ((templatesData.value as any)?.templates || []) as any[])

// Budget type options
const budgetTypeOptions = [
  { label: 'Fixed Price', value: 'fixed' },
  { label: 'Time & Materials', value: 'time_materials' },
  { label: 'Retainer', value: 'retainer' },
  { label: 'Hourly', value: 'hourly' }
]

// Form validation
const isValid = computed(() => {
  return form.value.name.trim() &&
    form.value.clientId &&
    form.value.budgetAmount > 0 &&
    form.value.startDate
})

// Submit
const creating = ref(false)
const createProject = async () => {
  if (!isValid.value) {
    toast.add({ title: 'Please fill in all required fields', color: 'error' })
    return
  }

  creating.value = true
  try {
    const result = await $fetch('/api/agency/projects', {
      method: 'POST',
      body: form.value
    }) as any

    toast.add({
      title: 'Project created',
      description: `${result.project.name} has been created`,
      color: 'success'
    })

    router.push(`/agency/projects/${result.project.id}`)
  } catch (err: any) {
    toast.add({
      title: 'Failed to create project',
      description: err.data?.message || err.message,
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}

// Template selection
const showTemplateModal = ref(false)
const selectedTemplate = ref<any>(null)

const applyTemplate = async () => {
  if (!selectedTemplate.value || !form.value.clientId) {
    toast.add({ title: 'Please select a client first', color: 'error' })
    return
  }

  try {
    const result = await $fetch(`/api/agency/templates/${selectedTemplate.value.id}/use`, {
      method: 'POST',
      body: {
        clientId: form.value.clientId,
        name: form.value.name || selectedTemplate.value.name,
        startDate: form.value.startDate
      }
    }) as any

    toast.add({
      title: 'Project created from template',
      color: 'success'
    })

    router.push(`/agency/projects/${result.project.id}`)
  } catch (err: any) {
    toast.add({
      title: 'Failed to create from template',
      description: err.data?.message || err.message,
      color: 'error'
    })
  }
}
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="New Project">
        <template #left>
          <UButton
            icon="i-lucide-arrow-left"
            variant="ghost"
            to="/agency/projects"
          />
        </template>
        <template #right>
          <UButton
            v-if="templates.length > 0"
            label="Use Template"
            icon="i-lucide-copy"
            variant="outline"
            @click="showTemplateModal = true"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <div class="max-w-2xl mx-auto">
          <UCard>
            <template #header>
              <h3 class="text-lg font-semibold">Project Details</h3>
              <p class="text-sm text-gray-500">Create a new project for a client</p>
            </template>

            <div class="space-y-6">
              <!-- Client Selection -->
              <UFormField label="Client" required>
                <USelectMenu
                  v-model="form.clientId"
                  :items="clients.map(c => ({ label: c.name, value: c.id }))"
                  placeholder="Select a client"
                  value-key="value"
                  searchable
                />
              </UFormField>

              <!-- Project Name -->
              <UFormField label="Project Name" required>
                <UInput
                  v-model="form.name"
                  placeholder="e.g., Website Redesign Q1 2024"
                />
              </UFormField>

              <!-- Description -->
              <UFormField label="Description">
                <UTextarea
                  v-model="form.description"
                  placeholder="Brief description of the project scope and objectives..."
                  :rows="3"
                />
              </UFormField>

              <!-- Budget Section -->
              <div class="grid grid-cols-2 gap-4">
                <UFormField label="Budget Amount" required>
                  <UInput
                    v-model.number="form.budgetAmount"
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                  >
                    <template #leading>
                      <span class="text-gray-500">$</span>
                    </template>
                  </UInput>
                </UFormField>

                <UFormField label="Budget Type">
                  <USelectMenu
                    v-model="form.budgetType"
                    :items="budgetTypeOptions"
                    value-key="value"
                  />
                </UFormField>
              </div>

              <!-- Dates -->
              <div class="grid grid-cols-2 gap-4">
                <UFormField label="Start Date" required>
                  <UInput v-model="form.startDate" type="date" />
                </UFormField>

                <UFormField label="End Date">
                  <UInput v-model="form.endDate" type="date" />
                </UFormField>
              </div>

              <!-- Project Manager -->
              <UFormField label="Project Manager">
                <USelectMenu
                  v-model="form.projectManagerId"
                  :items="[
                    { label: 'Not assigned', value: null },
                    ...teamMembers.map(m => ({ label: m.name, value: m.id }))
                  ]"
                  placeholder="Select project manager"
                  value-key="value"
                />
              </UFormField>
            </div>

            <template #footer>
              <div class="flex justify-between">
                <UButton
                  variant="ghost"
                  label="Cancel"
                  to="/agency/projects"
                />
                <UButton
                  color="primary"
                  label="Create Project"
                  icon="i-lucide-plus"
                  :loading="creating"
                  :disabled="!isValid"
                  @click="createProject"
                />
              </div>
            </template>
          </UCard>

          <!-- Quick Tips -->
          <UCard class="mt-6">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-lightbulb" class="w-5 h-5 text-amber-500" />
                <h4 class="font-medium">Quick Tips</h4>
              </div>
            </template>

            <ul class="space-y-2 text-sm text-gray-600">
              <li class="flex items-start gap-2">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-emerald-500 mt-0.5" />
                <span>Set a realistic budget that includes a buffer for unexpected work</span>
              </li>
              <li class="flex items-start gap-2">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-emerald-500 mt-0.5" />
                <span>Use templates for recurring project types to save time</span>
              </li>
              <li class="flex items-start gap-2">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-emerald-500 mt-0.5" />
                <span>Assign a project manager early to ensure accountability</span>
              </li>
            </ul>
          </UCard>
        </div>
      </div>
    </UDashboardPanel>

    <!-- Template Selection Modal -->
    <UModal v-model:open="showTemplateModal">
      <template #header>
        <h3 class="font-semibold">Create from Template</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-gray-500">
            Select a template to quickly create a project with predefined phases and tasks.
          </p>

          <div class="space-y-2">
            <div
              v-for="template in templates"
              :key="template.id"
              class="p-4 border rounded-lg cursor-pointer transition-colors"
              :class="selectedTemplate?.id === template.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
              @click="selectedTemplate = template"
            >
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium">{{ template.name }}</p>
                  <p class="text-sm text-gray-500">{{ template.description }}</p>
                </div>
                <UIcon
                  v-if="selectedTemplate?.id === template.id"
                  name="i-lucide-check-circle"
                  class="w-5 h-5 text-primary-500"
                />
              </div>
              <div class="mt-2 flex items-center gap-4 text-xs text-gray-500">
                <span>{{ template.phaseCount }} phases</span>
                <span>{{ template.taskCount }} tasks</span>
                <span v-if="template.estimatedDurationDays">~{{ template.estimatedDurationDays }} days</span>
              </div>
            </div>
          </div>

          <div v-if="templates.length === 0" class="text-center text-gray-500 py-8">
            No templates available. Create templates in the Templates section.
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showTemplateModal = false" />
          <UButton
            color="primary"
            label="Use Template"
            :disabled="!selectedTemplate"
            @click="applyTemplate"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
