<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { hasPermission } = usePortalAuth()
const toast = useToast()
const route = useRoute()

const activeTab = ref('all')
const typeFilter = computed(() => {
  if (activeTab.value === 'job_request') return 'job_request'
  if (activeTab.value === 'support_ticket') return 'support_ticket'
  return undefined
})

const { data, pending, refresh } = useFetch('/api/portal/requests', {
  query: { type: typeFilter }
})

const tabs = [
  { label: 'All', value: 'all' },
  { label: 'Job Requests', value: 'job_request' },
  { label: 'Support Tickets', value: 'support_ticket' }
]

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

// Fetch projects for the selector
const { data: projectsData } = useFetch('/api/portal/projects')

function resetForm() {
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

onMounted(() => applyServicePreset(route.query.service))
onMounted(() => applyAccessPreset(route.query.access))
watch(() => route.query.service, applyServicePreset)
watch(() => route.query.access, applyAccessPreset)

async function submitRequest() {
  if (!form.title.trim() || !form.description.trim()) {
    toast.add({ title: 'Please fill in title and description', color: 'error' })
    return
  }
  creating.value = true
  try {
    await $fetch('/api/portal/requests', {
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
            </div>
            <div class="flex items-center gap-2 text-xs text-muted mt-1">
              <UBadge color="neutral" variant="subtle" size="xs">
                {{ request.requestType === 'job_request' ? 'Job Request' : 'Support' }}
              </UBadge>
              <span v-if="request.category">{{ request.category.replace(/_/g, ' ') }}</span>
              <span v-if="request.projectName">· {{ request.projectName }}</span>
            </div>
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
          <h2 class="text-lg font-semibold">
            New Request
          </h2>

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
