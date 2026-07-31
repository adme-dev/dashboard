<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date'
import type {
  SearchAuthorityLifecycleStatus,
  SearchAuthorityOpportunity,
  SearchAuthorityOverview
} from '~/types'

interface ClientOption {
  id: string
  name: string
}

interface Workspace {
  id: string
  name: string
  boards: Array<{ id: string, name: string }>
}

interface TeamMember {
  id: string
  name: string
  email?: string
  role?: string
  avatar?: string
  active_task_count?: number
}

interface Project {
  id: string
  name: string
  client_name?: string
}

interface TaskStatus {
  id: string
  name: string
  color: string
  category?: string
}

interface TaskLabel {
  id: string
  name: string
  color: string
}

interface PendingTaskLink {
  opportunityId: string
  task: { id: string, title: string }
}

const toast = useToast()
const clients = ref<ClientOption[]>([])
const workspaces = ref<Workspace[]>([])
const teamMembers = ref<TeamMember[]>([])
const projects = ref<Project[]>([])
const statuses = ref<TaskStatus[]>([])
const labels = ref<TaskLabel[]>([])
const selectedClientId = ref<string | null>(null)
const selectedBoardId = ref<string | null>(null)
const lifecycleFilter = ref<SearchAuthorityLifecycleStatus | 'all'>('all')
const startDate = ref('')
const endDate = ref('')
const overview = ref<SearchAuthorityOverview | null>(null)
const opportunities = ref<SearchAuthorityOpportunity[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const busyOpportunityId = ref<string | null>(null)
const showTaskDialog = ref(false)
const activeOpportunity = ref<SearchAuthorityOpportunity | null>(null)
const pendingTaskLink = ref<PendingTaskLink | null>(null)
let loadedClientId: string | null = null
let evidenceRequestId = 0

const lifecycleOptions = [
  { label: 'All lifecycle states', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Under review', value: 'under_review' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Task created', value: 'task_created' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Published', value: 'published' },
  { label: 'Measuring', value: 'measuring' },
  { label: 'Closed', value: 'closed' },
  { label: 'Dismissed', value: 'dismissed' }
]

const clientOptions = computed(() => clients.value.map(client => ({
  label: client.name,
  value: client.id
})))
const boardOptions = computed(() => workspaces.value.flatMap(workspace => (
  workspace.boards.map(board => ({
    label: `${workspace.name} · ${board.name}`,
    value: board.id
  }))
)))
const selectedBoard = computed(() => boardOptions.value.find(
  board => board.value === selectedBoardId.value
))
const filteredOpportunities = computed(() => (
  lifecycleFilter.value === 'all'
    ? opportunities.value
    : opportunities.value.filter(opportunity => (
        opportunity.lifecycleStatus === lifecycleFilter.value
      ))
))
const acceptedCount = computed(() => overview.value?.opportunities.accepted || 0)

function errorMessage(error: unknown): string {
  const candidate = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  } | null
  return candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || 'Search Authority evidence could not be loaded'
}

function toCalendarDate(value: string): DateValue | null {
  if (!value) return null
  try {
    return parseDate(value)
  } catch {
    return null
  }
}

const startDateModel = computed({
  get: () => toCalendarDate(startDate.value),
  set: (value) => { startDate.value = value?.toString() || '' }
})
const endDateModel = computed({
  get: () => toCalendarDate(endDate.value),
  set: (value) => { endDate.value = value?.toString() || '' }
})

function formatDate(value: string): string {
  if (!value) return 'Choose date'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00.000Z`))
}

async function loadWorkspaceOptions() {
  try {
    const [clientRows, workspaceResponse, teamResponse, projectRows, labelRows]
      = await Promise.all([
        $fetch<ClientOption[]>('/api/agency/clients?active=true'),
        $fetch<{ workspaces: Workspace[] }>('/api/agency/workspaces')
          .catch(() => ({ workspaces: [] })),
        $fetch<{ members: TeamMember[] }>('/api/agency/team-members?active=true')
          .catch(() => ({ members: [] })),
        $fetch<Project[]>('/api/agency/projects?status=active')
          .catch(() => []),
        $fetch<TaskLabel[]>('/api/agency/labels')
          .catch(() => [])
      ])
    clients.value = clientRows
    workspaces.value = workspaceResponse.workspaces
    teamMembers.value = teamResponse.members
    projects.value = projectRows
    labels.value = labelRows
    selectedClientId.value ||= clients.value[0]?.id || null
    selectedBoardId.value ||= boardOptions.value[0]?.value || null
  } catch (error: unknown) {
    loadError.value = errorMessage(error)
  }
}

async function loadStatuses() {
  if (!selectedBoardId.value) {
    statuses.value = []
    return
  }
  try {
    statuses.value = await $fetch<TaskStatus[]>(
      `/api/agency/statuses?departmentId=${encodeURIComponent(selectedBoardId.value)}`
    )
  } catch (error: unknown) {
    toast.add({
      title: 'Task board unavailable',
      description: errorMessage(error),
      color: 'warning'
    })
  }
}

async function loadEvidence() {
  const requestId = ++evidenceRequestId
  if (!selectedClientId.value) {
    loading.value = false
    return
  }
  const clientId = selectedClientId.value
  if (loadedClientId !== clientId) {
    overview.value = null
    opportunities.value = []
    loadedClientId = clientId
  }
  loading.value = true
  loadError.value = null
  const query = new URLSearchParams({ clientId })
  if (startDate.value && endDate.value) {
    query.set('startDate', startDate.value)
    query.set('endDate', endDate.value)
  }

  try {
    const [overviewResponse, opportunityResponse] = await Promise.all([
      $fetch<SearchAuthorityOverview>(
        `/api/agency/search-authority/overview?${query.toString()}`
      ),
      $fetch<{ opportunities: SearchAuthorityOpportunity[] }>(
        `/api/agency/search-authority/opportunities?clientId=${encodeURIComponent(clientId)}`
      )
    ])
    if (requestId !== evidenceRequestId) return
    overview.value = overviewResponse
    opportunities.value = opportunityResponse.opportunities
    startDate.value ||= overviewResponse.window.startDate
    endDate.value ||= overviewResponse.window.endDate
    if (
      pendingTaskLink.value
      && opportunities.value.some(opportunity => (
        opportunity.id === pendingTaskLink.value?.opportunityId
        && opportunity.taskId === pendingTaskLink.value?.task.id
      ))
    ) {
      pendingTaskLink.value = null
    }
  } catch (error: unknown) {
    if (requestId !== evidenceRequestId) return
    loadError.value = errorMessage(error)
  } finally {
    if (requestId === evidenceRequestId) loading.value = false
  }
}

async function transitionOpportunity(
  opportunity: SearchAuthorityOpportunity,
  status: SearchAuthorityLifecycleStatus
) {
  if (!selectedClientId.value) return
  busyOpportunityId.value = opportunity.id
  try {
    await $fetch(
      `/api/agency/search-authority/opportunities/${opportunity.id}`,
      {
        method: 'PATCH',
        body: { clientId: selectedClientId.value, status }
      }
    )
    await loadEvidence()
  } catch (error: unknown) {
    toast.add({
      title: 'Opportunity could not be updated',
      description: errorMessage(error),
      color: 'error'
    })
  } finally {
    busyOpportunityId.value = null
  }
}

function taskDescription(opportunity: SearchAuthorityOpportunity): string {
  const reasons = opportunity.reasonCodes
    .filter(reason => reason.contribution > 0)
    .map(reason => (
      `- ${reason.code.replaceAll('_', ' ')}: observed ${reason.observed ?? 'not available'}; expected ${reason.expected ?? 'not available'}`
    ))
    .join('\n')
  return [
    'Search Authority evidence',
    '',
    opportunity.summary,
    '',
    `Evidence window: ${opportunity.evidenceStartDate} to ${opportunity.evidenceEndDate}`,
    `Score: ${opportunity.score}/100 (${Math.round(opportunity.confidence * 100)}% confidence)`,
    opportunity.queryText ? `Query: ${opportunity.queryText}` : null,
    opportunity.pageUrl ? `Page: ${opportunity.pageUrl}` : null,
    '',
    reasons,
    '',
    'Review the evidence, make the approved change, and record the publish date before measurement.'
  ].filter(value => value !== null).join('\n')
}

function openTaskHandoff(opportunity: SearchAuthorityOpportunity) {
  if (!selectedBoardId.value) {
    toast.add({
      title: 'Choose a task board',
      description: 'Select where the accepted opportunity should be handed off.',
      color: 'warning'
    })
    return
  }
  activeOpportunity.value = opportunity
  showTaskDialog.value = true
}

async function linkTask(
  opportunityId: string,
  task: { id: string, title: string }
) {
  busyOpportunityId.value = opportunityId
  try {
    await $fetch(
      `/api/agency/search-authority/opportunities/${opportunityId}/task-link`,
      {
        method: 'POST',
        body: { taskId: task.id }
      }
    )
    pendingTaskLink.value = null
    toast.add({
      title: 'Task linked',
      description: `${task.title} now carries the Search Authority evidence.`,
      color: 'success'
    })
    await loadEvidence()
  } catch (error: unknown) {
    pendingTaskLink.value = { opportunityId, task }
    await loadEvidence()
    if (pendingTaskLink.value) {
      toast.add({
        title: 'Task created, link still pending',
        description: `${errorMessage(error)} You can retry without creating another task.`,
        color: 'warning'
      })
    }
  } finally {
    busyOpportunityId.value = null
  }
}

async function taskCreated(task: { id: string, title: string }) {
  const opportunity = activeOpportunity.value
  activeOpportunity.value = null
  if (!opportunity) return
  await linkTask(opportunity.id, task)
}

async function retryPendingLink() {
  if (!pendingTaskLink.value) return
  await linkTask(
    pendingTaskLink.value.opportunityId,
    pendingTaskLink.value.task
  )
}

watch(selectedClientId, () => {
  void loadEvidence()
})
watch(selectedBoardId, () => {
  void loadStatuses()
})

onMounted(async () => {
  await loadWorkspaceOptions()
  if (!selectedClientId.value) loading.value = false
})
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header class="flex flex-col gap-4 border-b border-default pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-3xl">
          <div class="flex items-center gap-2 text-sm font-medium text-primary">
            <UIcon name="i-lucide-search-check" class="size-4" />
            Search Authority &amp; AI Trust
          </div>
          <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">
            Evidence workspace
          </h1>
          <p class="mt-2 text-base leading-7 text-muted">
            Turn Search Console evidence into governed opportunities, then hand accepted work into the normal XeroFlow task workflow.
          </p>
        </div>
        <UButton
          to="/agency/search-authority/connections"
          label="Connections"
          icon="i-lucide-settings-2"
          color="neutral"
          variant="soft"
        />
      </header>

      <UAlert
        v-if="loadError"
        title="Showing last-known evidence"
        :description="loadError"
        icon="i-lucide-triangle-alert"
        color="warning"
        variant="subtle"
      >
        <template #actions>
          <UButton
            label="Try again"
            color="warning"
            variant="soft"
            size="sm"
            @click="loadEvidence"
          />
        </template>
      </UAlert>

      <UAlert
        v-if="pendingTaskLink"
        title="A created task still needs linking"
        :description="`${pendingTaskLink.task.title} already exists. Retry the link without creating a duplicate task.`"
        icon="i-lucide-link-2-off"
        color="warning"
        variant="subtle"
      >
        <template #actions>
          <UButton
            label="Retry link"
            size="sm"
            color="warning"
            :loading="busyOpportunityId === pendingTaskLink.opportunityId"
            @click="retryPendingLink"
          />
        </template>
      </UAlert>

      <UCard>
        <div class="@container grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-5">
          <UFormField label="Client" class="@4xl:col-span-2">
            <USelectMenu
              v-model="selectedClientId"
              :items="clientOptions"
              value-key="value"
              placeholder="Choose a client"
              class="w-full"
              :disabled="showTaskDialog || Boolean(pendingTaskLink)"
            />
          </UFormField>

          <UFormField label="Start date">
            <UPopover>
              <UButton
                :label="formatDate(startDate)"
                icon="i-lucide-calendar"
                color="neutral"
                variant="outline"
                class="w-full justify-start font-normal"
              />
              <template #content>
                <UCalendar v-model="startDateModel" class="p-2" />
                <div class="flex justify-end border-t border-default p-2">
                  <UButton
                    label="Clear"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="startDate = ''"
                  />
                </div>
              </template>
            </UPopover>
          </UFormField>

          <UFormField label="End date">
            <UPopover>
              <UButton
                :label="formatDate(endDate)"
                icon="i-lucide-calendar"
                color="neutral"
                variant="outline"
                class="w-full justify-start font-normal"
              />
              <template #content>
                <UCalendar v-model="endDateModel" class="p-2" />
                <div class="flex justify-end border-t border-default p-2">
                  <UButton
                    label="Clear"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="endDate = ''"
                  />
                </div>
              </template>
            </UPopover>
          </UFormField>

          <div class="flex items-end">
            <UButton
              label="Refresh evidence"
              icon="i-lucide-refresh-cw"
              class="w-full justify-center"
              :loading="loading"
              :disabled="!selectedClientId"
              @click="loadEvidence"
            />
          </div>
        </div>
      </UCard>

      <SearchAuthorityOverviewMetrics
        :metrics="overview?.metrics || null"
        :loading="loading"
      />

      <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="space-y-4">
          <div class="@container grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="Lifecycle">
              <USelectMenu
                v-model="lifecycleFilter"
                :items="lifecycleOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Task handoff board"
              help="Accepted opportunities create normal XeroFlow tasks on this board."
            >
              <USelectMenu
                v-model="selectedBoardId"
                :items="boardOptions"
                value-key="value"
                placeholder="Choose a task board"
                class="w-full"
                :disabled="showTaskDialog || Boolean(pendingTaskLink)"
              />
            </UFormField>
          </div>

          <SearchAuthorityOpportunityTable
            :opportunities="filteredOpportunities"
            :loading="loading"
            :busy-opportunity-id="busyOpportunityId"
            @transition="transitionOpportunity"
            @create-task="openTaskHandoff"
          />
        </div>

        <div class="space-y-4 lg:sticky lg:top-6">
          <SearchAuthorityDataHealthCard
            :provider="overview?.provider || null"
            :loading="loading"
          />
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Review queue
              </h2>
            </template>
            <dl class="space-y-3 text-sm">
              <div class="flex items-center justify-between">
                <dt class="text-muted">
                  New
                </dt>
                <dd class="font-medium text-highlighted">
                  {{ overview?.opportunities.new || 0 }}
                </dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-muted">
                  Under review
                </dt>
                <dd class="font-medium text-highlighted">
                  {{ overview?.opportunities.underReview || 0 }}
                </dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-muted">
                  Ready for task
                </dt>
                <dd class="font-medium text-highlighted">
                  {{ acceptedCount }}
                </dd>
              </div>
            </dl>
          </UCard>
        </div>
      </div>
    </div>

    <WorkflowTaskCreateDialog
      v-if="activeOpportunity"
      v-model:open="showTaskDialog"
      :statuses="statuses"
      :team-members="teamMembers"
      :projects="projects"
      :labels="labels"
      :department-id="selectedBoardId || undefined"
      :board-name="selectedBoard?.label"
      :initial-title="activeOpportunity.title"
      :initial-description="taskDescription(activeOpportunity)"
      @created="taskCreated"
    />
  </div>
</template>
