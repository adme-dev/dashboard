<script setup lang="ts">
import { runTaskWhen } from '~/utils/asyncControl'
import { canViewPortalTeamAccess } from '~/utils/permissions'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { user, fetchUser } = usePortalAuth()
const toast = useToast()
const saving = ref(false)

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

interface PortalAccessUser {
  id: string
  email: string
  name: string
  title?: string | null
  role: string
  status: string
  avatarUrl?: string | null
  isPrimaryContact: boolean
  permissions: {
    canViewProjects: boolean
    canViewInvoices: boolean
    canApproveWork: boolean
    canViewAnalytics: boolean
    canSubmitRequests: boolean
  }
  lastLoginAt?: string | null
  invitedAt?: string | null
  createdAt: string
  isCurrentUser: boolean
}

const accessData = ref<{ users: PortalAccessUser[] } | null>(null)
const accessPending = ref(false)
const accessError = ref<unknown>(null)
const canViewTeamAccess = computed(() => canViewPortalTeamAccess(user.value))

async function refreshAccessUsers() {
  accessPending.value = true
  accessError.value = null

  const result = await runTaskWhen(
    canViewTeamAccess.value,
    () => apiFetch<{ users: PortalAccessUser[] }>('/api/portal/users'),
  )

  if (result.status === 'fulfilled') {
    accessData.value = result.value
  } else if (result.status === 'rejected') {
    accessError.value = result.reason
  }

  accessPending.value = false
}

watch(canViewTeamAccess, (allowed, wasAllowed) => {
  if (allowed && !wasAllowed && !accessData.value && !accessPending.value) {
    refreshAccessUsers()
  }
})

const form = reactive({
  name: user.value?.name || '',
  phone: user.value?.phone || '',
  title: user.value?.title || '',
  timezone: user.value?.timezone || 'UTC'
})

// Sync form when user loads
watch(() => user.value, (u) => {
  if (u) {
    form.name = u.name
    form.phone = u.phone || ''
    form.title = u.title || ''
    form.timezone = u.timezone || 'UTC'
  }
}, { immediate: true })

const timezoneOptions = [
  { label: 'UTC', value: 'UTC' },
  { label: 'Australia/Sydney (AEST)', value: 'Australia/Sydney' },
  { label: 'Australia/Melbourne', value: 'Australia/Melbourne' },
  { label: 'Australia/Brisbane', value: 'Australia/Brisbane' },
  { label: 'Australia/Perth (AWST)', value: 'Australia/Perth' },
  { label: 'Pacific/Auckland (NZST)', value: 'Pacific/Auckland' },
  { label: 'America/New_York (EST)', value: 'America/New_York' },
  { label: 'America/Los_Angeles (PST)', value: 'America/Los_Angeles' },
  { label: 'Europe/London (GMT)', value: 'Europe/London' },
  { label: 'Asia/Singapore (SGT)', value: 'Asia/Singapore' },
  { label: 'Asia/Tokyo (JST)', value: 'Asia/Tokyo' }
]

const permissionModules = computed(() => [
  {
    key: 'jobs',
    label: 'Jobs',
    description: 'Booked jobs, project timelines, tasks, and job history.',
    icon: 'i-lucide-folder-kanban',
    enabled: user.value?.permissions?.canViewProjects !== false,
    to: '/portal/projects?view=upcoming'
  },
  {
    key: 'billing',
    label: 'Billing',
    description: 'Current billing, outstanding invoices, and paid invoice history.',
    icon: 'i-lucide-receipt-text',
    enabled: Boolean(user.value?.permissions?.canViewInvoices),
    to: '/portal/invoices?view=current'
  },
  {
    key: 'analytics',
    label: 'Campaign analytics',
    description: 'Campaign performance, portal-visible leads, reports, and exports.',
    icon: 'i-lucide-chart-no-axes-combined',
    enabled: Boolean(user.value?.permissions?.canViewAnalytics),
    to: '/portal/analytics?metric=leads'
  },
  {
    key: 'approvals',
    label: 'Approvals',
    description: 'Review work, approve deliverables, and request revisions.',
    icon: 'i-lucide-check-check',
    enabled: Boolean(user.value?.permissions?.canApproveWork),
    to: '/portal/approvals?status=pending'
  },
  {
    key: 'requests',
    label: 'Requests',
    description: 'Submit briefs, job requests, and support tickets.',
    icon: 'i-lucide-message-square-plus',
    enabled: Boolean(user.value?.permissions?.canSubmitRequests),
    to: '/portal/requests?type=job_request'
  },
  {
    key: 'budgets',
    label: 'Budgets',
    description: 'Budget and commercial project visibility.',
    icon: 'i-lucide-badge-dollar-sign',
    enabled: Boolean(user.value?.permissions?.canViewBudgets)
  },
  {
    key: 'time',
    label: 'Time entries',
    description: 'Time tracked against projects and tasks.',
    icon: 'i-lucide-timer',
    enabled: Boolean(user.value?.permissions?.canViewTimeEntries)
  }
])

const enabledModuleCount = computed(() => permissionModules.value.filter(module => module.enabled).length)
const activeAccessUsers = computed(() => accessData.value?.users.filter(accessUser => accessUser.status === 'active').length ?? 0)
const pendingAccessUsers = computed(() => accessData.value?.users.filter(accessUser => accessUser.status === 'pending').length ?? 0)
const accessSummary = computed(() => {
  const users = accessData.value?.users || []
  const activeUsers = users.filter(accessUser => accessUser.status === 'active')
  const lastLoginAt = users
    .map(accessUser => accessUser.lastLoginAt)
    .filter(Boolean)
    .sort((a, b) => new Date(String(b)).getTime() - new Date(String(a)).getTime())[0] || null

  return {
    total: users.length,
    active: activeUsers.length,
    pending: users.filter(accessUser => accessUser.status === 'pending').length,
    primaryContacts: users.filter(accessUser => accessUser.isPrimaryContact).length,
    lastLoginAt,
    moduleCoverage: {
      projects: activeUsers.filter(accessUser => accessUser.permissions.canViewProjects).length,
      invoices: activeUsers.filter(accessUser => accessUser.permissions.canViewInvoices).length,
      approvals: activeUsers.filter(accessUser => accessUser.permissions.canApproveWork).length,
      analytics: activeUsers.filter(accessUser => accessUser.permissions.canViewAnalytics).length,
      requests: activeUsers.filter(accessUser => accessUser.permissions.canSubmitRequests).length
    }
  }
})
const accessCoverageItems = computed(() => [
  { label: 'Jobs', value: accessSummary.value.moduleCoverage.projects, icon: 'i-lucide-folder-kanban' },
  { label: 'Billing', value: accessSummary.value.moduleCoverage.invoices, icon: 'i-lucide-receipt-text' },
  { label: 'Approvals', value: accessSummary.value.moduleCoverage.approvals, icon: 'i-lucide-check-check' },
  { label: 'Analytics', value: accessSummary.value.moduleCoverage.analytics, icon: 'i-lucide-chart-no-axes-combined' },
  { label: 'Requests', value: accessSummary.value.moduleCoverage.requests, icon: 'i-lucide-message-square-plus' }
])

function formatDate(date: string | null | undefined) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function accessModules(accessUser: PortalAccessUser) {
  const modules = []
  if (accessUser.permissions.canViewProjects) modules.push('Jobs')
  if (accessUser.permissions.canViewInvoices) modules.push('Billing')
  if (accessUser.permissions.canViewAnalytics) modules.push('Analytics')
  if (accessUser.permissions.canApproveWork) modules.push('Approvals')
  if (accessUser.permissions.canSubmitRequests) modules.push('Requests')
  return modules
}

async function saveProfile() {
  saving.value = true
  try {
    await apiFetch('/api/portal/profile', {
      method: 'PUT',
      body: {
        name: form.name,
        title: form.title,
        phone: form.phone,
        timezone: form.timezone
      }
    })
    toast.add({ title: 'Profile saved', color: 'success' })
    await fetchUser()
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'data' in error
      ? (error as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Failed to save', description: message, color: 'error' })
  } finally {
    saving.value = false
  }
}

await refreshAccessUsers()
</script>

<template>
  <div class="w-full p-6 space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          Settings
        </h1>
        <p class="text-sm text-muted mt-1">
          Profile, account details, and portal module access for {{ user?.clientName }}.
        </p>
      </div>
      <UBadge color="primary" variant="subtle">
        {{ enabledModuleCount }}/{{ permissionModules.length }} modules enabled
      </UBadge>
    </div>

    <!-- Profile -->
    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Profile
        </h2>
      </template>

      <form class="space-y-4" @submit.prevent="saveProfile">
        <div class="space-y-2">
          <label class="text-sm font-medium">Name</label>
          <UInput v-model="form.name" />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Email</label>
          <UInput :model-value="user?.email" disabled />
          <p class="text-xs text-muted">
            Contact support to change your email.
          </p>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Title</label>
          <UInput v-model="form.title" placeholder="e.g. Marketing Manager" />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Phone</label>
          <UInput v-model="form.phone" type="tel" placeholder="+61 400 000 000" />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Timezone</label>
          <USelect v-model="form.timezone" :items="timezoneOptions" />
        </div>

        <div class="flex justify-end">
          <UButton type="submit" :loading="saving">
            Save Changes
          </UButton>
        </div>
      </form>
    </UCard>

    <UCard v-if="canViewTeamAccess">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-shield-check" class="text-primary" />
          <h2 class="font-semibold">
            Access Health
          </h2>
        </div>
      </template>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="rounded-lg border border-default bg-default p-3">
          <p class="text-xs text-muted">
            Active users
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ accessSummary.active }}/{{ accessSummary.total }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ accessSummary.pending }} pending invite{{ accessSummary.pending === 1 ? '' : 's' }}
          </p>
        </div>
        <div class="rounded-lg border border-default bg-default p-3">
          <p class="text-xs text-muted">
            Primary contacts
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ accessSummary.primaryContacts }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Main agency contact route
          </p>
        </div>
        <div class="rounded-lg border border-default bg-default p-3">
          <p class="text-xs text-muted">
            Last login
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ formatDate(accessSummary.lastLoginAt) }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Most recent portal access
          </p>
        </div>
        <div class="rounded-lg border border-default bg-default p-3">
          <p class="text-xs text-muted">
            Module coverage
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ accessCoverageItems.filter(item => item.value > 0).length }}/{{ accessCoverageItems.length }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Modules available to active users
          </p>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <UBadge
          v-for="item in accessCoverageItems"
          :key="item.label"
          :color="item.value > 0 ? 'success' : 'neutral'"
          variant="subtle"
        >
          <UIcon :name="item.icon" class="size-3 mr-1" />
          {{ item.label }} {{ item.value }}
        </UBadge>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-semibold">
            Portal Access
          </h2>
          <UBadge color="neutral" variant="subtle">
            Managed by agency
          </UBadge>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          v-for="module in permissionModules"
          :key="module.key"
          class="rounded-lg border border-default bg-default p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0">
              <div class="size-9 rounded-lg bg-elevated flex items-center justify-center shrink-0">
                <UIcon :name="module.icon" class="size-4 text-primary" />
              </div>
              <div class="min-w-0">
                <p class="font-medium">
                  {{ module.label }}
                </p>
                <p class="text-sm text-muted mt-1 leading-relaxed">
                  {{ module.description }}
                </p>
              </div>
            </div>
            <UBadge :color="module.enabled ? 'success' : 'neutral'" variant="subtle" size="xs">
              {{ module.enabled ? 'Enabled' : 'Disabled' }}
            </UBadge>
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <UButton
              v-if="module.enabled && module.to"
              :to="module.to"
              icon="i-lucide-arrow-right"
              variant="outline"
              color="neutral"
              size="sm"
            >
              Open
            </UButton>
            <UButton
              v-if="!module.enabled && user?.permissions?.canSubmitRequests"
              :to="`/portal/requests?access=${module.key}`"
              icon="i-lucide-message-square-plus"
              color="primary"
              variant="soft"
              size="sm"
            >
              Request access
            </UButton>
          </div>
        </div>
      </div>
    </UCard>

    <UCard v-if="canViewTeamAccess">
      <template #header>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="font-semibold">
              Team Access
            </h2>
            <p class="text-sm text-muted mt-1">
              People in {{ user?.clientName }} with client portal accounts.
            </p>
          </div>
          <div class="flex gap-2">
            <UBadge color="success" variant="subtle">
              {{ activeAccessUsers }} active
            </UBadge>
            <UBadge v-if="pendingAccessUsers" color="warning" variant="subtle">
              {{ pendingAccessUsers }} pending
            </UBadge>
          </div>
        </div>
      </template>

      <UAlert
        v-if="accessError"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        title="Team access is temporarily unavailable"
        description="Please try loading the portal users again."
        :actions="[{ label: 'Retry', onClick: refreshAccessUsers }]"
      />

      <div v-else-if="accessPending" class="space-y-3">
        <div v-for="i in 3" :key="i" class="h-20 rounded-lg bg-elevated animate-pulse" />
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="accessUser in accessData?.users"
          :key="accessUser.id"
          class="rounded-lg border border-default bg-default p-4"
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex items-start gap-3 min-w-0">
              <UAvatar :src="accessUser.avatarUrl || undefined" :alt="accessUser.name" size="sm" />
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-medium">
                    {{ accessUser.name }}
                  </p>
                  <UBadge
                    v-if="accessUser.isCurrentUser"
                    size="xs"
                    color="primary"
                    variant="subtle"
                  >
                    You
                  </UBadge>
                  <UBadge
                    v-if="accessUser.isPrimaryContact"
                    size="xs"
                    color="neutral"
                    variant="subtle"
                  >
                    Primary
                  </UBadge>
                </div>
                <p class="text-sm text-muted truncate">
                  {{ accessUser.email }}
                </p>
                <p v-if="accessUser.title" class="text-xs text-muted mt-1">
                  {{ accessUser.title }}
                </p>
              </div>
            </div>
            <div class="flex flex-col gap-2 sm:items-end">
              <UBadge :color="accessUser.status === 'active' ? 'success' : accessUser.status === 'pending' ? 'warning' : 'neutral'" variant="subtle">
                {{ accessUser.status }}
              </UBadge>
              <p class="text-xs text-muted">
                Last login {{ formatDate(accessUser.lastLoginAt) }}
              </p>
            </div>
          </div>

          <div class="mt-3 flex flex-wrap gap-1">
            <UBadge
              v-for="module in accessModules(accessUser)"
              :key="module"
              color="neutral"
              variant="subtle"
              size="xs"
            >
              {{ module }}
            </UBadge>
            <span v-if="accessModules(accessUser).length === 0" class="text-xs text-muted">
              No portal modules enabled
            </span>
          </div>
        </div>

        <p v-if="!accessData?.users.length" class="text-sm text-muted text-center py-6">
          No portal users found.
        </p>
      </div>
    </UCard>

    <!-- Account Info -->
    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Account
        </h2>
      </template>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium">
              Role
            </p>
            <p class="text-sm text-muted capitalize">
              {{ user?.role }}
            </p>
          </div>
          <UBadge variant="subtle" color="neutral">
            {{ user?.role }}
          </UBadge>
        </div>

        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium">
              Organization
            </p>
            <p class="text-sm text-muted">
              {{ user?.clientName }}
            </p>
          </div>
        </div>

        <div v-if="user?.isPrimaryContact" class="flex items-center gap-2">
          <UBadge color="primary" variant="subtle" size="xs">
            Primary Contact
          </UBadge>
        </div>
      </div>
    </UCard>
  </div>
</template>
