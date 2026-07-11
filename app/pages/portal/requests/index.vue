<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { hasPermission } = usePortalAuth()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
) => Promise<T>

const routeQueryString = (value: unknown) => Array.isArray(value) ? value[0] : value
const requestTypeTabs = ['all', 'job_request', 'support_ticket']
const requestStatusTabs = ['open', 'needs_review', 'in_progress', 'resolved', 'all']
const routeType = routeQueryString(route.query.type)
const routeView = routeQueryString(route.query.view)

const activeTab = ref(typeof routeType === 'string' && requestTypeTabs.includes(routeType) ? routeType : 'all')
const activeStatus = ref(typeof routeView === 'string' && requestStatusTabs.includes(routeView) ? routeView : 'open')
const typeFilter = computed(() => {
  if (activeTab.value === 'job_request') return 'job_request'
  if (activeTab.value === 'support_ticket') return 'support_ticket'
  return undefined
})
const viewFilter = computed(() => activeStatus.value === 'all' ? undefined : activeStatus.value)

const data = ref<any | null>(null)
const pending = ref(false)

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<any>('/api/portal/requests', {
      query: { type: typeFilter.value, view: viewFilter.value }
    })
  } finally {
    pending.value = false
  }
}

watch([typeFilter, viewFilter], () => {
  refresh()
}, { immediate: true })

watch([activeTab, activeStatus], () => {
  const query: Record<string, string> = {}
  if (activeTab.value !== 'all') query.type = activeTab.value
  if (activeStatus.value !== 'open') query.view = activeStatus.value

  const service = routeQueryString(route.query.service)
  const access = routeQueryString(route.query.access)
  const support = routeQueryString(route.query.support)
  if (typeof service === 'string' && service) query.service = service
  if (typeof access === 'string' && access) query.access = access
  if (typeof support === 'string' && support) query.support = support

  const current = new URLSearchParams(route.query as Record<string, string>).toString()
  const next = new URLSearchParams(query).toString()
  if (current !== next) {
    router.replace({ query })
  }
})

watch(
  () => [route.query.type, route.query.view],
  () => {
    const type = routeQueryString(route.query.type)
    const view = routeQueryString(route.query.view)
    activeTab.value = typeof type === 'string' && requestTypeTabs.includes(type) ? type : 'all'
    activeStatus.value = typeof view === 'string' && requestStatusTabs.includes(view) ? view : 'open'
  }
)

const tabs = [
  { label: 'All', value: 'all' },
  { label: 'Job Requests', value: 'job_request' },
  { label: 'Support Tickets', value: 'support_ticket' }
]

const statusTabs = computed(() => [
  { label: `Open (${data.value?.summary?.open ?? 0})`, value: 'open' },
  { label: `Needs review (${data.value?.summary?.needsReview ?? 0})`, value: 'needs_review' },
  { label: `In progress (${data.value?.summary?.inProgress ?? 0})`, value: 'in_progress' },
  { label: `Resolved (${data.value?.summary?.resolved ?? 0})`, value: 'resolved' },
  { label: 'All', value: 'all' }
])

// Create request slideover
const showCreate = ref(false)
const creating = ref(false)
const form = reactive({
  requestType: 'job_request' as 'job_request' | 'support_ticket',
  category: '',
  title: '',
  description: '',
  priority: 'normal',
  projectId: null as string | null,
  estimatedBudget: '',
  desiredDeadline: ''
})

const jobCategories = [
  { label: 'New Project', value: 'new_project' },
  { label: 'Additional Work', value: 'additional_work' },
  { label: 'Revision', value: 'revision' },
  { label: 'Content', value: 'content' },
  { label: 'Design', value: 'design' },
  { label: 'Development', value: 'development' },
  { label: 'Strategy', value: 'strategy' },
  { label: 'Other', value: 'other' }
]

const supportCategories = [
  { label: 'Billing', value: 'billing' },
  { label: 'Access', value: 'access' },
  { label: 'Bug Report', value: 'bug' },
  { label: 'Question', value: 'question' },
  { label: 'Feedback', value: 'feedback' },
  { label: 'Other', value: 'other' }
]

const categoryOptions = computed(() =>
  form.requestType === 'job_request' ? jobCategories : supportCategories
)

const priorities = [
  { label: 'Low', value: 'low' },
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' }
]

const serviceRequestPresets: Record<string, { category: string, title: string, description: string }> = {
  paid_media: {
    category: 'strategy',
    title: 'Paid media support',
    description: 'We would like help reviewing or expanding our paid media activity.'
  },
  creative: {
    category: 'design',
    title: 'Creative production request',
    description: 'We would like new creative, design, or production support for upcoming campaigns.'
  },
  seo_content: {
    category: 'content',
    title: 'SEO and content request',
    description: 'We would like help planning or producing SEO and content work.'
  },
  web_cro: {
    category: 'development',
    title: 'Website and conversion request',
    description: 'We would like help improving our website, landing pages, or conversion paths.'
  },
  reporting: {
    category: 'strategy',
    title: 'Reporting and insights request',
    description: 'We would like a clearer report, dashboard review, or campaign insights session.'
  },
  strategy: {
    category: 'strategy',
    title: 'Strategy session request',
    description: 'We would like to book a strategy discussion with the agency team.'
  }
}

const servicePresetOptions = [
  { label: 'Paid media', value: 'paid_media', icon: 'i-lucide-megaphone' },
  { label: 'Creative', value: 'creative', icon: 'i-lucide-palette' },
  { label: 'SEO & content', value: 'seo_content', icon: 'i-lucide-file-text' },
  { label: 'Web & CRO', value: 'web_cro', icon: 'i-lucide-monitor-check' },
  { label: 'Reporting', value: 'reporting', icon: 'i-lucide-chart-pie' },
  { label: 'Strategy', value: 'strategy', icon: 'i-lucide-compass' }
]

const selectedPreset = ref<string | null>(null)
const selectedPresetLabel = computed(() => servicePresetOptions.find(option => option.value === selectedPreset.value)?.label || null)

const accessRequestPresets: Record<string, { title: string, description: string }> = {
  jobs: {
    title: 'Request access to jobs',
    description: 'Please review whether I should have access to booked jobs, project timelines, tasks, and job history.'
  },
  billing: {
    title: 'Request access to billing',
    description: 'Please review whether I should have access to current billing, outstanding invoices, and billing history.'
  },
  analytics: {
    title: 'Request access to campaign analytics',
    description: 'Please review whether I should have access to campaign analytics, leads, reports, and exports.'
  },
  approvals: {
    title: 'Request approval permissions',
    description: 'Please review whether I should be able to approve work or request revisions in the client portal.'
  },
  requests: {
    title: 'Request intake permissions',
    description: 'Please review whether I should be able to submit job requests, briefs, and support tickets.'
  },
  budgets: {
    title: 'Request budget visibility',
    description: 'Please review whether I should have access to budget and commercial project information.'
  },
  time: {
    title: 'Request time entry visibility',
    description: 'Please review whether I should have access to time entries tracked against our work.'
  }
}

const supportRequestPresets: Record<string, { category: string, title: string, description: string }> = {
  meeting_follow_up: {
    category: 'question',
    title: 'Meeting follow-up',
    description: 'We would like to send a follow-up question or request after a client meeting.'
  }
}

// Fetch projects for the selector
const projectsData = ref<any | null>(null)

async function refreshProjectsData() {
  projectsData.value = await apiFetch<any>('/api/portal/projects')
}

refreshProjectsData()

function resetForm() {
  selectedPreset.value = null
  form.requestType = 'job_request'
  form.category = ''
  form.title = ''
  form.description = ''
  form.priority = 'normal'
  form.projectId = null
  form.estimatedBudget = ''
  form.desiredDeadline = ''
}

function applyServicePreset(service: unknown) {
  if (typeof service !== 'string') return
  const preset = serviceRequestPresets[service]
  if (!preset || !hasPermission('canSubmitRequests')) return

  selectedPreset.value = service
  form.requestType = 'job_request'
  form.category = preset.category
  form.title = preset.title
  form.description = preset.description
  form.priority = 'normal'
  showCreate.value = true
}

function applyAccessPreset(access: unknown) {
  if (typeof access !== 'string') return
  const preset = accessRequestPresets[access]
  if (!preset || !hasPermission('canSubmitRequests')) return

  form.requestType = 'support_ticket'
  form.category = 'access'
  form.title = preset.title
  form.description = preset.description
  form.priority = 'normal'
  showCreate.value = true
}

function applySupportPreset(support: unknown) {
  if (typeof support !== 'string') return
  const preset = supportRequestPresets[support]
  if (!preset || !hasPermission('canSubmitRequests')) return

  selectedPreset.value = null
  form.requestType = 'support_ticket'
  form.category = preset.category
  form.title = preset.title
  form.description = preset.description
  form.priority = 'normal'
  showCreate.value = true
}

onMounted(() => applyServicePreset(route.query.service))
onMounted(() => applyAccessPreset(route.query.access))
onMounted(() => applySupportPreset(route.query.support))
watch(() => route.query.service, applyServicePreset)
watch(() => route.query.access, applyAccessPreset)
watch(() => route.query.support, applySupportPreset)

async function submitRequest() {
  if (!form.title.trim() || !form.description.trim()) {
    toast.add({ title: 'Please fill in title and description', color: 'error' })
    return
  }
  creating.value = true
  try {
    await apiFetch('/api/portal/requests', {
      method: 'POST',
      body: {
        requestType: form.requestType,
        category: form.category || undefined,
        title: form.title,
        description: form.description,
        priority: form.priority,
        projectId: form.projectId || undefined,
        estimatedBudget: form.estimatedBudget ? Number(form.estimatedBudget) : undefined,
        desiredDeadline: form.desiredDeadline || undefined
      }
    })
    toast.add({ title: 'Request submitted', color: 'success' })
    showCreate.value = false
    resetForm()
    await refresh()
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'data' in error
      ? (error as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Failed to submit', description: message, color: 'error' })
  } finally {
    creating.value = false
  }
}

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return '-'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(amount)
}

function deadlineLabel(date: string | null | undefined) {
  if (!date) return null
  const due = new Date(date)
  const now = new Date()
  const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 0) return `${Math.abs(days)}d past desired date`
  if (days === 0) return 'Desired today'
  if (days <= 14) return `Desired in ${days}d`
  return `Desired ${formatDate(date)}`
}

const statusColors: Record<string, string> = {
  submitted: 'warning',
  in_review: 'info',
  approved: 'success',
  in_progress: 'primary',
  completed: 'success',
  closed: 'neutral',
  cancelled: 'error'
}

const priorityColors: Record<string, string> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'error'
}

function statusHint(status: string) {
  if (status === 'submitted') return 'Waiting for agency review'
  if (status === 'in_review') return 'Agency is reviewing'
  if (status === 'approved') return 'Approved for scheduling'
  if (status === 'in_progress') return 'Work in progress'
  if (status === 'completed') return 'Completed'
  if (status === 'closed') return 'Closed'
  if (status === 'cancelled') return 'Cancelled'
  return 'Request received'
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        Requests
      </h1>
      <div class="flex items-center gap-3">
        <div v-if="data?.summary" class="flex items-center gap-2 text-sm">
          <UBadge v-if="data.summary.submitted > 0" color="warning" variant="subtle">
            {{ data.summary.submitted }} new
          </UBadge>
          <UBadge v-if="data.summary.inProgress > 0" color="primary" variant="subtle">
            {{ data.summary.inProgress }} active
          </UBadge>
        </div>
        <UButton
          v-if="hasPermission('canSubmitRequests')"
          icon="i-lucide-plus"
          @click="showCreate = true"
        >
          New Request
        </UButton>
      </div>
    </div>

    <UTabs v-model="activeTab" :items="tabs" />

    <div v-if="data?.summary" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <button
        type="button"
        class="rounded-lg border border-default bg-default p-3 text-left hover:bg-elevated transition-colors"
        @click="activeStatus = 'open'"
      >
        <p class="text-xs text-muted">
          Open requests
        </p>
        <p class="mt-1 text-lg font-semibold">
          {{ data.summary.open }}
        </p>
      </button>
      <button
        type="button"
        class="rounded-lg border border-default bg-default p-3 text-left hover:bg-elevated transition-colors"
        @click="activeStatus = 'needs_review'"
      >
        <p class="text-xs text-muted">
          Needs review
        </p>
        <p class="mt-1 text-lg font-semibold">
          {{ data.summary.needsReview }}
        </p>
      </button>
      <button
        type="button"
        class="rounded-lg border border-default bg-default p-3 text-left hover:bg-elevated transition-colors"
        @click="activeStatus = 'open'"
      >
        <p class="text-xs text-muted">
          Urgent open
        </p>
        <p class="mt-1 text-lg font-semibold" :class="data.summary.urgentOpen > 0 ? 'text-error' : ''">
          {{ data.summary.urgentOpen }}
        </p>
      </button>
      <button
        type="button"
        class="rounded-lg border border-default bg-default p-3 text-left hover:bg-elevated transition-colors"
        @click="activeStatus = 'resolved'"
      >
        <p class="text-xs text-muted">
          Resolved
        </p>
        <p class="mt-1 text-lg font-semibold">
          {{ data.summary.resolved }}
        </p>
      </button>
    </div>

    <UCard v-if="data?.summary">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-radar" class="text-primary" />
          <span class="font-semibold">Request intake health</span>
        </div>
      </template>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeStatus = 'open'"
        >
          <p class="text-xs text-muted">
            Unassigned open
          </p>
          <p class="mt-1 text-sm font-semibold" :class="data.summary.unassignedOpen > 0 ? 'text-warning' : ''">
            {{ data.summary.unassignedOpen }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Waiting for team ownership
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeStatus = 'open'"
        >
          <p class="text-xs text-muted">
            Past desired date
          </p>
          <p class="mt-1 text-sm font-semibold" :class="data.summary.pastDesiredDeadline > 0 ? 'text-error' : ''">
            {{ data.summary.pastDesiredDeadline }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Open requests past target
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeStatus = 'open'"
        >
          <p class="text-xs text-muted">
            Due next 14 days
          </p>
          <p class="mt-1 text-sm font-semibold" :class="data.summary.dueSoon > 0 ? 'text-warning' : ''">
            {{ data.summary.dueSoon }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Desired deadlines approaching
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="activeTab = 'job_request'; activeStatus = 'open'"
        >
          <p class="text-xs text-muted">
            Open requested budget
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ formatCurrency(data.summary.openRequestedBudget) }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Client-estimated job requests
          </p>
        </button>
      </div>
    </UCard>

    <UTabs v-model="activeStatus" :items="statusTabs" />

    <div v-if="pending" class="space-y-3">
      <div v-for="i in 4" :key="i" class="h-24 rounded-lg bg-elevated animate-pulse" />
    </div>

    <div v-else class="space-y-3">
      <NuxtLink
        v-for="request in data?.requests"
        :key="request.id"
        :to="`/portal/requests/${request.id}`"
        class="block p-4 rounded-lg bg-elevated hover:ring-1 hover:ring-primary/50 transition-all"
        :class="{ 'border-l-4 border-warning': request.status === 'submitted' }"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="font-medium">{{ request.title }}</h3>
              <UBadge :color="(statusColors[request.status] as any) || 'neutral'" variant="subtle" size="xs">
                {{ request.status.replace(/_/g, ' ') }}
              </UBadge>
              <UBadge :color="(priorityColors[request.priority] as any) || 'neutral'" variant="outline" size="xs">
                {{ request.priority }}
              </UBadge>
              <UBadge
                v-if="!request.assignedName && !['completed', 'closed', 'cancelled'].includes(request.status)"
                color="warning"
                variant="subtle"
                size="xs"
              >
                Unassigned
              </UBadge>
            </div>
            <div class="flex items-center gap-2 text-xs text-muted mt-1">
              <UBadge color="neutral" variant="subtle" size="xs">
                {{ request.requestType === 'job_request' ? 'Job Request' : 'Support' }}
              </UBadge>
              <span v-if="request.category">{{ request.category.replace(/_/g, ' ') }}</span>
              <span v-if="request.projectName">· {{ request.projectName }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-muted mt-2">
              <span v-if="deadlineLabel(request.desiredDeadline)" :class="deadlineLabel(request.desiredDeadline)?.includes('past') ? 'text-error' : ''">
                {{ deadlineLabel(request.desiredDeadline) }}
              </span>
              <span v-if="request.estimatedBudget != null">Budget {{ formatCurrency(request.estimatedBudget) }}</span>
            </div>
            <p class="text-xs text-muted mt-2">
              {{ statusHint(request.status) }}
            </p>
          </div>
          <div class="text-right shrink-0 space-y-1">
            <span class="text-xs text-muted block">{{ formatDate(request.createdAt) }}</span>
            <div v-if="request.assignedName" class="flex items-center gap-1.5 justify-end">
              <UAvatar :src="request.assignedAvatar || undefined" :alt="request.assignedName" size="2xs" />
              <span class="text-xs text-muted">{{ request.assignedName }}</span>
            </div>
          </div>
        </div>
      </NuxtLink>
    </div>

    <p v-if="!pending && (!data?.requests || data.requests.length === 0)" class="text-center text-muted py-12">
      No requests found. Click "New Request" to submit one.
    </p>

    <!-- Create Request Slideover -->
    <USlideover v-model:open="showCreate">
      <template #content>
        <div class="p-6 space-y-6">
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-lg font-semibold">
                New Request
              </h2>
              <UBadge v-if="selectedPresetLabel" color="primary" variant="subtle">
                {{ selectedPresetLabel }}
              </UBadge>
            </div>
            <p class="text-sm text-muted">
              {{ selectedPresetLabel ? `Prefilled from ${selectedPresetLabel}. Adjust the details before submitting.` : 'Tell the agency what you need, when you need it, and whether it relates to an existing job.' }}
            </p>
          </div>

          <div class="rounded-lg border border-default bg-elevated/50 p-3">
            <p class="text-xs font-medium text-muted mb-2">
              Service shortcuts
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="option in servicePresetOptions"
                :key="option.value"
                :icon="option.icon"
                size="xs"
                :color="selectedPreset === option.value ? 'primary' : 'neutral'"
                :variant="selectedPreset === option.value ? 'soft' : 'outline'"
                @click="applyServicePreset(option.value)"
              >
                {{ option.label }}
              </UButton>
            </div>
          </div>

          <fieldset class="space-y-4">
            <legend class="text-sm font-medium text-muted mb-2">
              Request Details
            </legend>

            <div>
              <label class="text-sm font-medium mb-1 block">Type</label>
              <USelect
                v-model="form.requestType"
                :items="[
                  { label: 'Job Request', value: 'job_request' },
                  { label: 'Support Ticket', value: 'support_ticket' }
                ]"
                size="xl"
                class="w-full"
              />
            </div>

            <div>
              <label class="text-sm font-medium mb-1 block">Category</label>
              <USelect
                v-model="form.category"
                :items="categoryOptions"
                placeholder="Select a category"
                size="xl"
                class="w-full"
              />
            </div>

            <div>
              <label class="text-sm font-medium mb-1 block">Title</label>
              <UInput
                v-model="form.title"
                placeholder="Brief summary of your request"
                size="xl"
                class="w-full"
              />
            </div>

            <div>
              <label class="text-sm font-medium mb-1 block">Description</label>
              <UTextarea
                v-model="form.description"
                placeholder="Describe what you need in detail..."
                :rows="6"
                class="w-full"
              />
            </div>

            <div>
              <label class="text-sm font-medium mb-1 block">Priority</label>
              <USelect
                v-model="form.priority"
                :items="priorities"
                size="xl"
                class="w-full"
              />
            </div>
          </fieldset>

          <fieldset class="space-y-4">
            <legend class="text-sm font-medium text-muted mb-2">
              Additional Info
            </legend>

            <div v-if="projectsData?.projects?.length">
              <label class="text-sm font-medium mb-1 block">Related Project</label>
              <USelect
                v-model="form.projectId"
                :items="projectsData.projects.map((p: any) => ({ label: p.name, value: p.id }))"
                placeholder="None"
                size="xl"
                class="w-full"
              />
            </div>

            <div v-if="form.requestType === 'job_request'">
              <label class="text-sm font-medium mb-1 block">Estimated Budget (AUD)</label>
              <UInput
                v-model="form.estimatedBudget"
                type="number"
                placeholder="Optional"
                size="xl"
                class="w-full"
              />
            </div>

            <div>
              <label class="text-sm font-medium mb-1 block">Desired Deadline</label>
              <UInput
                v-model="form.desiredDeadline"
                type="date"
                size="xl"
                class="w-full"
              />
            </div>
          </fieldset>

          <div class="flex justify-end gap-3 pt-4 border-t border-default">
            <UButton variant="outline" @click="showCreate = false">
              Cancel
            </UButton>
            <UButton
              :loading="creating"
              :disabled="!form.title.trim() || !form.description.trim()"
              @click="submitRequest"
            >
              Submit Request
            </UButton>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
