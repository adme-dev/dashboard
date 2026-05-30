<script setup lang="ts">
import { CalendarDate, parseDate, type DateValue } from '@internationalized/date'

definePageMeta({
  title: 'New Project',
  middleware: ['auth']
})

const router = useRouter()
const route = useRoute()
const toast = useToast()

// Pre-select the client when arriving from a client page
// (e.g. /agency/projects/new?clientId=…). Null when launched standalone.
const initialClientId = (route.query.clientId as string) || null

// Form data
const form = ref({
  name: '',
  description: '',
  clientId: initialClientId as string | null,
  budgetAmount: 0,
  budgetType: 'fixed',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  projectManagerId: null as string | null
})

// Fetch clients — include inactive so a pre-selected client from ?clientId=
// (which can point at an inactive client) is always present in the picker.
const { data: clientsData } = await useFetch('/api/agency/clients', { query: { active: 'false' } })
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

// Date picker helpers — bridge between ISO YYYY-MM-DD strings and CalendarDate
// (mirrors the canonical pattern in components/workflow/TaskCreateDialog.vue)
function toCalendarDate(iso: string): DateValue | null {
  if (!iso) return null
  try {
    return parseDate(iso.length > 10 ? iso.slice(0, 10) : iso)
  } catch {
    return null
  }
}

const dateFormatter = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

function formatDate(iso: string): string {
  if (!iso) return ''
  const cd = toCalendarDate(iso)
  if (!cd) return ''
  return dateFormatter.format(new Date((cd as CalendarDate).year, (cd as CalendarDate).month - 1, (cd as CalendarDate).day))
}

const startDateModel = computed({
  get: () => toCalendarDate(form.value.startDate),
  set: (v) => { form.value.startDate = v ? v.toString() : '' }
})

const endDateModel = computed({
  get: () => toCalendarDate(form.value.endDate),
  set: (v) => { form.value.endDate = v ? v.toString() : '' }
})

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
  <div class="flex-1 min-w-0 min-h-0 flex flex-col">
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

      <div class="flex-1 overflow-y-auto">
        <div class="max-w-2xl mx-auto px-6 sm:px-8 py-10">
          <!-- Header -->
          <div class="mb-10">
            <h1 class="text-[22px] font-[500] tracking-[-0.01em]">New Project</h1>
            <p class="text-[14px] text-[var(--ui-text-muted)] mt-1">Fill in the details to create a new project.</p>
          </div>

          <form @submit.prevent="createProject">
            <!-- Section: Project Info -->
            <fieldset class="space-y-5 pb-8 mb-8 border-b border-[var(--ui-border)]">
              <legend class="text-[11px] font-medium text-[var(--ui-text-muted)] uppercase tracking-widest mb-1">Project Info</legend>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <UFormField label="Client" required>
                  <USelectMenu
                    v-model="form.clientId"
                    :items="clients.map(c => ({ label: c.name, value: c.id }))"
                    placeholder="Select a client"
                    value-key="value"
                    searchable
                    size="xl"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Project Name" required>
                  <UInput
                    v-model="form.name"
                    placeholder="e.g., Website Redesign Q1 2024"
                    size="xl"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <UFormField label="Description" help="Brief scope and objectives for the project.">
                <UTextarea
                  v-model="form.description"
                  placeholder="Describe the project scope, deliverables, and key objectives..."
                  :rows="4"
                  size="xl"
                  class="w-full"
                />
              </UFormField>
            </fieldset>

            <!-- Section: Budget & Timeline -->
            <fieldset class="space-y-5 pb-8 mb-8 border-b border-[var(--ui-border)]">
              <legend class="text-[11px] font-medium text-[var(--ui-text-muted)] uppercase tracking-widest mb-1">Budget & Timeline</legend>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <UFormField label="Budget Amount" required>
                  <UInput
                    v-model.number="form.budgetAmount"
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    size="xl"
                    class="w-full"
                  >
                    <template #leading>
                      <span class="text-muted">$</span>
                    </template>
                  </UInput>
                </UFormField>

                <UFormField label="Budget Type" help="How the client is billed.">
                  <USelectMenu
                    v-model="form.budgetType"
                    :items="budgetTypeOptions"
                    value-key="value"
                    size="xl"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <UFormField label="Start Date" required>
                  <UPopover>
                    <UButton
                      color="neutral"
                      variant="outline"
                      icon="i-lucide-calendar"
                      size="xl"
                      class="w-full justify-start font-normal"
                      :class="!form.startDate && 'text-muted'"
                    >
                      {{ formatDate(form.startDate) || 'Pick start date' }}
                    </UButton>
                    <template #content>
                      <UCalendar v-model="startDateModel" class="p-2" />
                      <div v-if="form.startDate" class="border-t border-default p-2 flex justify-end">
                        <UButton size="xs" variant="ghost" color="neutral" @click="form.startDate = ''">Clear</UButton>
                      </div>
                    </template>
                  </UPopover>
                </UFormField>

                <UFormField label="End Date" help="Leave blank for ongoing projects.">
                  <UPopover>
                    <UButton
                      color="neutral"
                      variant="outline"
                      icon="i-lucide-calendar"
                      size="xl"
                      class="w-full justify-start font-normal"
                      :class="!form.endDate && 'text-muted'"
                    >
                      {{ formatDate(form.endDate) || 'Pick end date' }}
                    </UButton>
                    <template #content>
                      <UCalendar v-model="endDateModel" class="p-2" />
                      <div v-if="form.endDate" class="border-t border-default p-2 flex justify-end">
                        <UButton size="xs" variant="ghost" color="neutral" @click="form.endDate = ''">Clear</UButton>
                      </div>
                    </template>
                  </UPopover>
                </UFormField>
              </div>
            </fieldset>

            <!-- Section: Assignment -->
            <fieldset class="space-y-5 pb-8 mb-8">
              <legend class="text-[11px] font-medium text-[var(--ui-text-muted)] uppercase tracking-widest mb-1">Assignment</legend>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <UFormField label="Project Manager" help="Responsible for delivery and client communication.">
                  <USelectMenu
                    v-model="form.projectManagerId"
                    :items="[
                      { label: 'Not assigned', value: null },
                      ...teamMembers.map(m => ({ label: m.name, value: m.id }))
                    ]"
                    placeholder="Select project manager"
                    value-key="value"
                    size="xl"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </fieldset>

            <!-- Actions -->
            <div class="flex items-center justify-end gap-3 pt-2 pb-8">
              <UButton
                variant="ghost"
                color="neutral"
                label="Cancel"
                size="lg"
                to="/agency/projects"
              />
              <UButton
                type="submit"
                color="primary"
                label="Create Project"
                icon="i-lucide-plus"
                size="lg"
                :loading="creating"
                :disabled="!isValid"
              />
            </div>
          </form>
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
          <p class="text-sm text-muted">
            Select a template to quickly create a project with predefined phases and tasks.
          </p>

          <div class="space-y-2">
            <div
              v-for="template in templates"
              :key="template.id"
              class="p-4 border rounded-lg cursor-pointer transition-colors"
              :class="selectedTemplate?.id === template.id ? 'border-primary bg-primary-50 dark:bg-primary-950' : 'hover:bg-elevated'"
              @click="selectedTemplate = template"
            >
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium">{{ template.name }}</p>
                  <p class="text-sm text-muted">{{ template.description }}</p>
                </div>
                <UIcon
                  v-if="selectedTemplate?.id === template.id"
                  name="i-lucide-check-circle"
                  class="w-5 h-5 text-primary-500"
                />
              </div>
              <div class="mt-2 flex items-center gap-4 text-xs text-muted">
                <span>{{ template.phaseCount }} phases</span>
                <span>{{ template.taskCount }} tasks</span>
                <span v-if="template.estimatedDurationDays">~{{ template.estimatedDurationDays }} days</span>
              </div>
            </div>
          </div>

          <div v-if="templates.length === 0" class="text-center text-muted py-8">
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
