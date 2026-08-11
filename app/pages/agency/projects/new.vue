<script setup lang="ts">
import { parseDate, type CalendarDate, type DateValue } from '@internationalized/date'

interface ClientSummary {
  id: string
  name: string
}

interface TeamMemberSummary {
  id: string
  name: string
}

interface ProjectTemplateSummary {
  id: string
  name: string
  description?: string | null
  category?: string | null
  phaseCount?: number
  taskCount?: number
  estimatedDurationDays?: number | null
}

interface CreatedProjectResult {
  project: {
    id: string
    name: string
  }
}

interface CreatedTemplateProjectResult extends CreatedProjectResult {
  tasksCreated: number
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as { data?: { message?: unknown }, message?: unknown }
    if (typeof candidate.data?.message === 'string') return candidate.data.message
    if (typeof candidate.message === 'string') return candidate.message
  }
  return 'An unexpected error occurred'
}

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
const clients = computed<ClientSummary[]>(() => {
  const rows = clientsData.value as unknown as ClientSummary[] | null
  return rows || []
})

// Fetch team members for project manager selection
const { data: teamData } = await useFetch('/api/agency/team-members')
const teamMembers = computed<TeamMemberSummary[]>(() => (teamData.value?.members || []).map(member => ({
  id: String(member.id),
  name: String(member.name)
})))
const projectManagerOptions = computed(() => [
  { label: 'Not assigned', value: '__unassigned__' },
  ...teamMembers.value.map(member => ({ label: member.name, value: member.id }))
])

const projectManagerModel = computed({
  get: () => form.value.projectManagerId || '__unassigned__',
  set: (value: string) => {
    form.value.projectManagerId = value === '__unassigned__' ? null : value
  }
})

// Fetch templates for quick setup
const { data: templatesData } = await useFetch('/api/agency/templates')
const templates = computed<ProjectTemplateSummary[]>(() => {
  const data = templatesData.value as unknown as { templates?: ProjectTemplateSummary[] } | null
  return data?.templates || []
})
const templateSearch = ref('')
const filteredTemplates = computed(() => {
  const search = templateSearch.value.trim().toLowerCase()
  if (!search) return templates.value

  return templates.value.filter((template) => {
    return [template.name, template.description, template.category]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(search))
  })
})

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

function clearStartDate(): void {
  form.value.startDate = ''
}

function clearEndDate(): void {
  form.value.endDate = ''
}

// Form validation
const isValid = computed(() => {
  return Boolean(
    form.value.name.trim()
    && form.value.clientId
    && form.value.budgetAmount > 0
    && form.value.startDate
  )
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
    const result = await $fetch<CreatedProjectResult>('/api/agency/projects', {
      method: 'POST',
      body: form.value
    })

    toast.add({
      title: 'Project created',
      description: `${result.project.name} has been created`,
      color: 'success'
    })

    router.push(`/agency/projects/${result.project.id}`)
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to create project',
      description: getErrorMessage(error),
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}

// Template selection
const showTemplateModal = ref(false)
const selectedTemplate = ref<ProjectTemplateSummary | null>(null)
const applyingTemplate = ref(false)

function openTemplateModal() {
  templateSearch.value = ''
  selectedTemplate.value = null
  showTemplateModal.value = true
}

function closeTemplateModal() {
  showTemplateModal.value = false
  selectedTemplate.value = null
}

function selectTemplate(template: ProjectTemplateSummary): void {
  selectedTemplate.value = template
}

const applyTemplate = async () => {
  if (!selectedTemplate.value || !form.value.clientId) {
    toast.add({ title: 'Please select a client first', color: 'error' })
    return
  }

  applyingTemplate.value = true
  try {
    const result = await $fetch<CreatedTemplateProjectResult>(`/api/agency/templates/${selectedTemplate.value.id}/use`, {
      method: 'POST',
      body: {
        clientId: form.value.clientId,
        projectName: form.value.name || selectedTemplate.value.name,
        startDate: form.value.startDate,
        budgetOverride: form.value.budgetAmount > 0 ? form.value.budgetAmount : undefined,
        projectManagerId: form.value.projectManagerId
      }
    })

    toast.add({
      title: 'Project created from template',
      description: `${result.project.name} was created with ${result.tasksCreated} tasks`,
      color: 'success'
    })

    router.push(`/agency/projects/${result.project.id}`)
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to create from template',
      description: getErrorMessage(error),
      color: 'error'
    })
  } finally {
    applyingTemplate.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <UDashboardPanel>
      <UDashboardNavbar title="New Project">
        <template #left>
          <UButton
            icon="i-lucide-arrow-left"
            variant="ghost"
            to="/agency/projects"
            aria-label="Back to projects"
          />
        </template>
        <template #right>
          <UButton
            v-if="templates.length > 0"
            label="Use Template"
            icon="i-lucide-copy"
            variant="outline"
            @click="openTemplateModal"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto">
        <div class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <div class="mb-6">
            <p class="text-xs font-medium uppercase tracking-wider text-muted">
              Project setup
            </p>
            <h1 class="mt-1 text-2xl font-semibold tracking-tight text-highlighted">
              Create a new project
            </h1>
            <p class="mt-2 max-w-2xl text-sm text-muted">
              Set the commercial details, delivery dates and project owner before work begins.
            </p>
          </div>

          <form class="overflow-hidden rounded-lg border border-default bg-default" @submit.prevent="createProject">
            <section class="grid gap-6 border-b border-default px-5 py-6 sm:px-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-primary">
                  01 · Details
                </p>
                <h2 class="mt-1 text-base font-semibold text-highlighted">
                  Project identity
                </h2>
                <p class="mt-2 text-sm leading-6 text-muted">
                  Choose the client and give the work a clear, searchable name.
                </p>
              </div>

              <div class="@container">
                <div class="grid grid-cols-1 gap-5 @lg:grid-cols-2">
                  <UFormField label="Client" required>
                    <USelectMenu
                      v-model="form.clientId"
                      :items="clients.map(client => ({ label: client.name, value: client.id }))"
                      placeholder="Select a client"
                      value-key="value"
                      searchable
                      size="xl"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Project name" required>
                    <UInput
                      v-model="form.name"
                      placeholder="e.g. August GWM PMax rollout"
                      size="xl"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField class="@lg:col-span-2" label="Description" help="Summarise the scope, deliverables and intended outcome.">
                    <UTextarea
                      v-model="form.description"
                      placeholder="Describe what the team is delivering and what success looks like."
                      :rows="4"
                      size="xl"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </div>
            </section>

            <section class="grid gap-6 border-b border-default px-5 py-6 sm:px-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-primary">
                  02 · Commercial
                </p>
                <h2 class="mt-1 text-base font-semibold text-highlighted">
                  Budget and timing
                </h2>
                <p class="mt-2 text-sm leading-6 text-muted">
                  Record the approved project budget and the delivery window.
                </p>
              </div>

              <div class="@container">
                <div class="grid grid-cols-1 gap-5 @lg:grid-cols-2">
                  <UFormField label="Budget amount" required>
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

                  <UFormField label="Budget type" help="How the client is billed.">
                    <USelectMenu
                      v-model="form.budgetType"
                      :items="budgetTypeOptions"
                      value-key="value"
                      size="xl"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Start date" required>
                    <UPopover>
                      <UButton
                        type="button"
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
                        <div v-if="form.startDate" class="flex justify-end border-t border-default p-2">
                          <UButton
                            type="button"
                            size="xs"
                            variant="ghost"
                            color="neutral"
                            label="Clear"
                            @click="clearStartDate"
                          />
                        </div>
                      </template>
                    </UPopover>
                  </UFormField>

                  <UFormField label="End date" help="Leave blank for ongoing projects.">
                    <UPopover>
                      <UButton
                        type="button"
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
                        <div v-if="form.endDate" class="flex justify-end border-t border-default p-2">
                          <UButton
                            type="button"
                            size="xs"
                            variant="ghost"
                            color="neutral"
                            label="Clear"
                            @click="clearEndDate"
                          />
                        </div>
                      </template>
                    </UPopover>
                  </UFormField>
                </div>
              </div>
            </section>

            <section class="grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-primary">
                  03 · Ownership
                </p>
                <h2 class="mt-1 text-base font-semibold text-highlighted">
                  Delivery owner
                </h2>
                <p class="mt-2 text-sm leading-6 text-muted">
                  Assign the person accountable for delivery and client communication.
                </p>
              </div>

              <div class="@container">
                <div class="grid grid-cols-1 gap-5 @lg:grid-cols-2">
                  <UFormField class="@lg:col-span-2" label="Project manager" help="You can leave this unassigned and allocate an owner later.">
                    <USelectMenu
                      v-model="projectManagerModel"
                      :items="projectManagerOptions"
                      placeholder="Select project manager"
                      value-key="value"
                      searchable
                      size="xl"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </div>
            </section>

            <div class="flex flex-col-reverse gap-3 border-t border-default bg-elevated/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
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

    <UModal v-model:open="showTemplateModal" :ui="{ content: 'sm:max-w-2xl' }">
      <template #content>
        <div class="border-b border-default px-5 py-4 sm:px-6">
          <p class="text-xs font-medium uppercase tracking-wider text-primary">
            Template library
          </p>
          <h2 class="mt-1 text-lg font-semibold text-highlighted">
            Create from a project template
          </h2>
          <p class="mt-1 text-sm text-muted">
            Choose a template to add its predefined phases, tasks and monitoring steps.
          </p>
        </div>

        <div class="space-y-4 px-5 py-5 sm:px-6">
          <UFormField label="Find a template">
            <UInput
              v-model="templateSearch"
              icon="i-lucide-search"
              placeholder="Search by name, description or category"
              class="w-full"
            />
          </UFormField>

          <div v-if="filteredTemplates.length > 0" class="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            <UButton
              v-for="template in filteredTemplates"
              :key="template.id"
              type="button"
              color="neutral"
              :variant="selectedTemplate?.id === template.id ? 'soft' : 'outline'"
              class="h-auto w-full justify-start whitespace-normal p-4 text-left"
              :aria-pressed="selectedTemplate?.id === template.id"
              @click="selectTemplate(template)"
            >
              <div class="flex w-full min-w-0 items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="font-medium text-highlighted">
                    {{ template.name }}
                  </p>
                  <p v-if="template.description" class="mt-1 line-clamp-2 text-sm font-normal text-muted">
                    {{ template.description }}
                  </p>
                  <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-normal text-muted">
                    <span>{{ template.phaseCount }} phases</span>
                    <span>{{ template.taskCount }} tasks</span>
                    <span v-if="template.estimatedDurationDays">About {{ template.estimatedDurationDays }} days</span>
                  </div>
                </div>
                <UIcon
                  v-if="selectedTemplate?.id === template.id"
                  name="i-lucide-check-circle-2"
                  class="mt-0.5 size-5 shrink-0 text-primary"
                />
              </div>
            </UButton>
          </div>

          <div v-else class="rounded-lg border border-dashed border-default px-6 py-10 text-center">
            <UIcon name="i-lucide-folder-search" class="mx-auto size-6 text-muted" />
            <p class="mt-3 text-sm font-medium text-highlighted">
              No matching templates
            </p>
            <p class="mt-1 text-sm text-muted">
              Try a different search term or create a template first.
            </p>
          </div>
        </div>

        <div class="flex flex-col-reverse gap-2 border-t border-default px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="closeTemplateModal"
          />
          <UButton
            color="primary"
            label="Create from Template"
            icon="i-lucide-copy-plus"
            :loading="applyingTemplate"
            :disabled="!selectedTemplate || !form.clientId"
            @click="applyTemplate"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
