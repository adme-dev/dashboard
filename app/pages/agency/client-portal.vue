<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Client Portal',
  middleware: ['role-client-portal-access']
})

const toast = useToast()

interface PortalClient {
  id: string
  name: string
  logoUrl?: string | null
  portalStatus: 'active' | 'pending' | 'not_configured'
  portalUsers: number
  activeUsers: number
  pendingUsers: number
  agencyAccessUsers: number
  moduleAccess: {
    projects: number
    invoices: number
    approvals: number
    analytics: number
    requests: number
  }
  lastLoginAt?: string | null
  lastActivityAt?: string | null
  pendingApprovals: number
  portalLeads30d: number
  newLeads30d: number
  wonLeads30d: number
  activeProjects: number
  upcomingJobs: number
  historyJobs: number
}

interface PortalUser {
  id: string
  name: string
  email: string
  clientId: string
  clientName: string
  permissions?: {
    canViewProjects?: boolean
    canViewInvoices?: boolean
    canApproveWork?: boolean
    canViewBudgets?: boolean
    canViewTimeEntries?: boolean
    canViewAnalytics?: boolean
    canSubmitRequests?: boolean
  }
  lastLoginAt?: string | null
  status: string
}

interface PortalApproval {
  id: string
  title: string
  approvalType: string
  projectName: string
  clientName: string
  requestedAt: string
  dueDate?: string | null
  status: string
}

interface PortalActivity {
  id: string
  clientId: string
  clientName: string
  clientUserName?: string | null
  clientUserEmail?: string | null
  action: string
  entityType?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  createdAt: string
  agencyUserEmail?: string | null
  agencyUserRole?: string | null
}

interface AgencyClient {
  id: string
  name: string
}

interface InviteResponse {
  user: {
    email: string
  }
}

const errorMessage = (error: unknown) => {
  if (error && typeof error === 'object') {
    const maybeError = error as { data?: { message?: string }, message?: string }
    return maybeError.data?.message || maybeError.message || 'Unknown error'
  }
  return 'Unknown error'
}

// Active tab
const activeTab = ref('clients')

const portalClientFilters = ref({
  search: '',
  status: 'all'
})

const portalClientQuery = computed(() => ({
  search: portalClientFilters.value.search || undefined,
  status: portalClientFilters.value.status,
  limit: 100
}))

const { data: portalClientsData, pending: portalClientsPending, refresh: refreshPortalClients } = await useFetch('/api/agency/client-portal/clients', {
  query: portalClientQuery
})

const portalClients = computed(() => ((portalClientsData.value as { clients?: PortalClient[] } | null)?.clients || []))
const portalClientSummary = computed(() => {
  const items = portalClients.value
  return {
    total: items.length,
    active: items.filter(client => client.portalStatus === 'active').length,
    pending: items.filter(client => client.portalStatus === 'pending').length,
    notConfigured: items.filter(client => client.portalStatus === 'not_configured').length,
    leads30d: items.reduce((sum, client) => sum + Number(client.portalLeads30d || 0), 0)
  }
})

// Fetch client portal users
const portalUserFilters = ref({
  clientId: '',
  status: 'all'
})

const portalUserQuery = computed(() => ({
  clientId: portalUserFilters.value.clientId || undefined,
  status: portalUserFilters.value.status,
  limit: 100
}))

const { data: usersData, pending: usersPending, refresh: refreshUsers } = await useFetch('/api/agency/client-portal/users', {
  query: portalUserQuery
})

const users = computed(() => ((usersData.value as unknown as { users?: PortalUser[] } | null)?.users || []))
// Fetch approvals
const { data: approvalsData, pending: approvalsPending } = await useFetch('/api/agency/client-portal/approvals')

const approvals = computed(() => ((approvalsData.value as unknown as { approvals?: PortalApproval[] } | null)?.approvals || []))

const activityFilters = ref({
  clientId: '',
  action: 'agency_portal_access'
})

const activityQuery = computed(() => ({
  clientId: activityFilters.value.clientId || undefined,
  action: activityFilters.value.action,
  limit: 100
}))

const { data: activityData, pending: activityPending, refresh: refreshActivity } = await useFetch('/api/agency/client-portal/activity', {
  query: activityQuery
})

const portalActivity = computed(() => ((activityData.value as { activity?: PortalActivity[] } | null)?.activity || []))

// Fetch clients for invite modal
const { data: clientsData } = await useFetch('/api/agency/clients', {
  query: { limit: 100 }
})
const clients = computed(() => {
  const raw = clientsData.value
  if (Array.isArray(raw)) return raw as unknown as AgencyClient[]
  return ((raw as { clients?: AgencyClient[] } | null)?.clients || [])
})
const clientOptions = computed(() => clients.value.map(client => ({ label: client.name, value: client.id })))
const portalUserClientOptions = computed(() => [
  { label: 'All clients', value: '' },
  ...clientOptions.value
])

const selectedAccessClientId = ref<string | null>(null)
watch(clients, (items) => {
  if (!selectedAccessClientId.value && items.length > 0) {
    selectedAccessClientId.value = items[0].id
  }
}, { immediate: true })

const openingPortal = ref(false)
const openClientPortal = async (clientId?: string | null, path = '/portal') => {
  const targetClientId = clientId || selectedAccessClientId.value
  if (!targetClientId) {
    toast.add({ title: 'Select a client first', color: 'error' })
    return
  }

  openingPortal.value = true
  try {
    await $fetch('/api/agency/client-portal/access', {
      method: 'POST',
      body: { clientId: targetClientId }
    })
    refreshActivity()
    await navigateTo(path)
  } catch (err: unknown) {
    toast.add({
      title: 'Failed to open portal',
      description: errorMessage(err),
      color: 'error'
    })
  } finally {
    openingPortal.value = false
  }
}

const getClientPortalActions = (clientId?: string | null) => [
  [
    {
      label: 'Dashboard',
      icon: 'i-lucide-layout-dashboard',
      onSelect: () => openClientPortal(clientId, '/portal')
    },
    {
      label: 'All Jobs',
      icon: 'i-lucide-folder-kanban',
      onSelect: () => openClientPortal(clientId, '/portal/projects')
    },
    {
      label: 'Upcoming Jobs',
      icon: 'i-lucide-calendar-clock',
      onSelect: () => openClientPortal(clientId, '/portal/projects?view=upcoming')
    },
    {
      label: 'Job History',
      icon: 'i-lucide-history',
      onSelect: () => openClientPortal(clientId, '/portal/projects?view=history')
    }
  ],
  [
    {
      label: 'Campaign Analytics',
      icon: 'i-lucide-chart-no-axes-combined',
      onSelect: () => openClientPortal(clientId, '/portal/analytics')
    },
    {
      label: 'Billing',
      icon: 'i-lucide-receipt-text',
      onSelect: () => openClientPortal(clientId, '/portal/invoices')
    },
    {
      label: 'Requests',
      icon: 'i-lucide-message-square-plus',
      onSelect: () => openClientPortal(clientId, '/portal/requests')
    },
    {
      label: 'Meetings',
      icon: 'i-lucide-video',
      onSelect: () => openClientPortal(clientId, '/office')
    }
  ]
]

const selectedClientPortalActions = computed(() => getClientPortalActions(selectedAccessClientId.value))

const portalModuleReadiness = (client: PortalClient) => [
  { label: 'Jobs', value: client.moduleAccess?.projects || 0 },
  { label: 'Billing', value: client.moduleAccess?.invoices || 0 },
  { label: 'Analytics', value: client.moduleAccess?.analytics || 0 },
  { label: 'Approvals', value: client.moduleAccess?.approvals || 0 },
  { label: 'Requests', value: client.moduleAccess?.requests || 0 }
]

const portalUserModules = (user: PortalUser) => [
  { label: 'Jobs', enabled: user.permissions?.canViewProjects !== false },
  { label: 'Billing', enabled: Boolean(user.permissions?.canViewInvoices) },
  { label: 'Analytics', enabled: Boolean(user.permissions?.canViewAnalytics) },
  { label: 'Approvals', enabled: Boolean(user.permissions?.canApproveWork) },
  { label: 'Requests', enabled: Boolean(user.permissions?.canSubmitRequests) }
]

const inviteClientUser = (clientId?: string | null) => {
  inviteForm.value.clientId = clientId || null
  showInviteModal.value = true
}

// Format helpers
const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

const formatDateTime = (date: string) => {
  if (!date) return 'Never'
  return format(new Date(date), 'MMM d, yyyy h:mm a')
}

// Status colors
const getUserStatusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' => {
  switch (status) {
    case 'active': return 'success'
    case 'pending': return 'warning'
    case 'suspended': return 'error'
    default: return 'neutral'
  }
}

const getApprovalStatusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' | 'info' => {
  switch (status) {
    case 'approved': return 'success'
    case 'pending': return 'warning'
    case 'rejected': return 'error'
    case 'revision_requested': return 'info'
    default: return 'neutral'
  }
}

const getPortalStatusColor = (status: string): 'success' | 'warning' | 'neutral' => {
  switch (status) {
    case 'active': return 'success'
    case 'pending': return 'warning'
    default: return 'neutral'
  }
}

const formatPortalStatus = (status: string) => {
  switch (status) {
    case 'active': return 'Active'
    case 'pending': return 'Invite pending'
    default: return 'Not configured'
  }
}

const formatActivityAction = (action: string) => {
  switch (action) {
    case 'agency_portal_access': return 'Agency opened portal'
    case 'invite_accepted': return 'Invite accepted'
    case 'login': return 'Client login'
    case 'approval_response': return 'Approval response'
    case 'comment_added': return 'Comment added'
    default: return action.replaceAll('_', ' ')
  }
}

// Invite slideover
const showInviteModal = ref(false)
const inviteForm = ref({
  clientId: null as string | null,
  email: '',
  name: '',
  permissions: {
    canViewProjects: true,
    canViewInvoices: true,
    canApproveWork: false,
    canViewTimeEntries: false,
    canViewBudgets: false,
    canViewAnalytics: true,
    canSubmitRequests: true
  }
})

const inviting = ref(false)
const sendInvite = async () => {
  if (!inviteForm.value.clientId || !inviteForm.value.email || !inviteForm.value.name) {
    toast.add({ title: 'Please fill in all required fields', color: 'error' })
    return
  }

  inviting.value = true
  try {
    const result = await $fetch<InviteResponse>('/api/agency/client-portal/invite', {
      method: 'POST',
      body: inviteForm.value
    })

    toast.add({
      title: 'Invitation sent',
      description: `Invite link created for ${result.user.email}`,
      color: 'success'
    })
    showInviteModal.value = false
    resetInviteForm()
    refreshUsers()
    refreshPortalClients()
  } catch (err: unknown) {
    toast.add({ title: 'Failed to send invite', description: errorMessage(err), color: 'error' })
  } finally {
    inviting.value = false
  }
}

const resetInviteForm = () => {
  inviteForm.value = {
    clientId: null,
    email: '',
    name: '',
    permissions: {
      canViewProjects: true,
      canViewInvoices: true,
      canApproveWork: false,
      canViewTimeEntries: false,
      canViewBudgets: false,
      canViewAnalytics: true,
      canSubmitRequests: true
    }
  }
}

// User columns (v4 format)
const userColumns = [
  { accessorKey: 'name', header: 'User' },
  { accessorKey: 'client', header: 'Client' },
  { accessorKey: 'permissions', header: 'Permissions' },
  { accessorKey: 'lastLogin', header: 'Last Login' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'actions', header: '' }
]

const clientColumns = [
  { accessorKey: 'name', header: 'Client' },
  { accessorKey: 'status', header: 'Portal Status' },
  { accessorKey: 'users', header: 'Users' },
  { accessorKey: 'leads', header: 'Leads 30d' },
  { accessorKey: 'activity', header: 'Last Activity' },
  { accessorKey: 'actions', header: '' }
]

// Approval columns (v4 format)
const approvalColumns = [
  { accessorKey: 'title', header: 'Item' },
  { accessorKey: 'project', header: 'Project' },
  { accessorKey: 'requestedAt', header: 'Requested' },
  { accessorKey: 'dueDate', header: 'Due' },
  { accessorKey: 'status', header: 'Status' }
]

const activityColumns = [
  { accessorKey: 'event', header: 'Event' },
  { accessorKey: 'client', header: 'Client' },
  { accessorKey: 'actor', header: 'Actor' },
  { accessorKey: 'source', header: 'Source' },
  { accessorKey: 'createdAt', header: 'When' }
]

const enterpriseModules = [
  {
    title: 'Booked Jobs',
    icon: 'i-lucide-folder-kanban',
    status: 'Live',
    color: 'success',
    clientPath: '/portal/projects',
    description: 'Client-scoped projects, active work, progress, due dates, deliverables, tasks, and approvals.',
    next: 'Add a booking calendar view, signed scope, key milestones, and account-owner health flags per job.'
  },
  {
    title: 'Billing',
    icon: 'i-lucide-receipt-text',
    status: 'Live',
    color: 'success',
    clientPath: '/portal/invoices',
    description: 'Outstanding invoices and billing history are already permission gated for client users.',
    next: 'Add retainer burn, payment status timeline, statement export, and optional payment links.'
  },
  {
    title: 'Campaign Analytics',
    icon: 'i-lucide-chart-no-axes-combined',
    status: 'Live',
    color: 'success',
    clientPath: '/portal/analytics',
    description: 'Portal-visible campaign performance, trends, creatives, breakdowns, exports, and lead visibility.',
    next: 'Add executive narrative, campaign goals, budget pacing, and platform health indicators for Meta and Google.'
  },
  {
    title: 'Approvals & Files',
    icon: 'i-lucide-check-check',
    status: 'Live',
    color: 'success',
    clientPath: '/portal/approvals',
    description: 'Creative review, approval state, revision requests, gallery access, and comments.',
    next: 'Add version history, side-by-side review, legal/audit sign-off, and approval SLA reporting.'
  },
  {
    title: 'Requests & Briefs',
    icon: 'i-lucide-message-square-plus',
    status: 'Live',
    color: 'success',
    clientPath: '/portal/requests',
    description: 'Clients can submit job requests, briefs, support items, and threaded follow-up messages.',
    next: 'Add intake templates by service line, request triage queues, estimates, and conversion into booked jobs.'
  },
  {
    title: 'Video Meetings',
    icon: 'i-lucide-video',
    status: 'R&D',
    color: 'warning',
    clientPath: '/office',
    description: 'The office/video system exists separately with lobbies, meetings, guests, rooms, and recordings.',
    next: 'Expose client-safe meeting cards in the portal dashboard with join links, upcoming sessions, recordings, and permissions.'
  }
] as const

const enterprisePlaybook = [
  'Make the client dashboard the account home: jobs, approvals, leads, campaigns, invoices, meetings, and team contacts in one executive view.',
  'Keep visibility explicit: every job, campaign, invoice, recording, file, and lead must have client-facing permissions.',
  'Package the agency offer around service modules: paid media, SEO, content, creative, web, reporting, and support.',
  'Give marketers an agency control plane: invite users, open as client, review portal readiness, and see which clients are missing setup.',
  'Add executive reporting: goals, spend, leads, conversion, budget pacing, next actions, and plain-English account summaries.'
]

const enterpriseRollout = [
  {
    phase: 'Phase 1',
    title: 'Client Home',
    detail: 'Upgrade /portal into a dense executive dashboard for jobs booked in, approvals, leads, invoices, campaign performance, requests, and team contacts.'
  },
  {
    phase: 'Phase 2',
    title: 'Meetings',
    detail: 'Connect office meetings to clients so they can see upcoming calls, join approved rooms, and watch shared recordings from the portal.'
  },
  {
    phase: 'Phase 3',
    title: 'Commercial Layer',
    detail: 'Add retainers, past/current billing, account health, campaign objectives, service catalogue, and upsell-ready reporting.'
  }
]
</script>

<template>
  <div class="flex-1 min-w-0 min-h-0 flex flex-col">
    <UDashboardPanel>
      <UDashboardNavbar title="Client Portal">
        <template #right>
          <UButton
            label="Invite Client User"
            icon="i-lucide-user-plus"
            color="primary"
            @click="inviteClientUser()"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-blue-500/10">
                <UIcon name="i-lucide-users" class="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">
                  Client Portals
                </p>
                <p class="text-xl font-bold">
                  {{ portalClientSummary.total }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-emerald-500/10">
                <UIcon name="i-lucide-check-circle" class="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">
                  Active Portals
                </p>
                <p class="text-xl font-bold text-emerald-500">
                  {{ portalClientSummary.active }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-amber-500/10">
                <UIcon name="i-lucide-clock" class="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">
                  30d Portal Leads
                </p>
                <p class="text-xl font-bold text-amber-500">
                  {{ portalClientSummary.leads30d }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-purple-500/10">
                <UIcon name="i-lucide-mail" class="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">
                  Needs Setup
                </p>
                <p class="text-xl font-bold text-purple-500">
                  {{ portalClientSummary.notConfigured }}
                </p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Tabs -->
        <UTabs
          v-model="activeTab"
          :items="[
            { label: 'Clients', value: 'clients', icon: 'i-lucide-building-2' },
            { label: 'Portal Users', value: 'users', icon: 'i-lucide-users' },
            { label: 'Approvals', value: 'approvals', icon: 'i-lucide-check-square' },
            { label: 'Audit', value: 'audit', icon: 'i-lucide-shield-check' },
            { label: 'Enterprise', value: 'enterprise', icon: 'i-lucide-building' }
          ]"
          class="mb-6"
        />

        <div v-if="activeTab === 'clients'">
          <UCard class="mb-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:w-[520px]">
                <UInput
                  v-model="portalClientFilters.search"
                  icon="i-lucide-search"
                  placeholder="Search clients"
                />
                <USelect
                  v-model="portalClientFilters.status"
                  :items="[
                    { label: 'All portal statuses', value: 'all' },
                    { label: 'Configured', value: 'configured' },
                    { label: 'Invite pending', value: 'pending' },
                    { label: 'No users yet', value: 'no-users' }
                  ]"
                  value-key="value"
                />
              </div>
              <div class="flex flex-col sm:flex-row gap-2">
                <USelectMenu
                  v-model="selectedAccessClientId"
                  :items="clientOptions"
                  placeholder="Quick open client"
                  value-key="value"
                  searchable
                  class="w-full sm:w-64"
                />
                <UButton
                  label="Open Portal"
                  icon="i-lucide-external-link"
                  color="primary"
                  :loading="openingPortal"
                  @click="openClientPortal()"
                />
                <UDropdownMenu :items="selectedClientPortalActions">
                  <UButton
                    icon="i-lucide-chevron-down"
                    color="neutral"
                    variant="outline"
                    :loading="openingPortal"
                    aria-label="Open selected client portal section"
                  />
                </UDropdownMenu>
              </div>
            </div>
          </UCard>

          <UCard>
            <div v-if="portalClientsPending" class="flex items-center justify-center py-12">
              <XfLoader />
            </div>

            <UTable v-else :data="portalClients" :columns="clientColumns">
              <template #name-cell="{ row }">
                <div class="flex items-center gap-3 min-w-0">
                  <UAvatar
                    :src="row.original.logoUrl || undefined"
                    :alt="row.original.name"
                    size="sm"
                  />
                  <div class="min-w-0">
                    <p class="font-medium truncate">
                      {{ row.original.name }}
                    </p>
                    <p class="text-xs text-[var(--ui-text-muted)]">
                      {{ row.original.activeProjects }} active projects
                    </p>
                    <p class="text-xs text-[var(--ui-text-dimmed)]">
                      {{ row.original.upcomingJobs }} upcoming, {{ row.original.historyJobs }} completed
                    </p>
                  </div>
                </div>
              </template>

              <template #status-cell="{ row }">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge :color="getPortalStatusColor(row.original.portalStatus)" variant="subtle">
                    {{ formatPortalStatus(row.original.portalStatus) }}
                  </UBadge>
                  <UBadge
                    v-if="row.original.pendingApprovals"
                    color="warning"
                    variant="subtle"
                    size="xs"
                  >
                    {{ row.original.pendingApprovals }} approvals
                  </UBadge>
                </div>
              </template>

              <template #users-cell="{ row }">
                <div class="text-sm">
                  <p>{{ row.original.activeUsers }} active / {{ row.original.portalUsers }} total</p>
                  <p class="text-xs text-[var(--ui-text-muted)]">
                    {{ row.original.pendingUsers }} pending, {{ row.original.agencyAccessUsers }} agency access
                  </p>
                  <div class="mt-2 flex flex-wrap gap-1">
                    <UBadge
                      v-for="module in portalModuleReadiness(row.original)"
                      :key="module.label"
                      :color="module.value > 0 ? 'success' : 'neutral'"
                      variant="subtle"
                      size="xs"
                    >
                      {{ module.label }} {{ module.value }}
                    </UBadge>
                  </div>
                </div>
              </template>

              <template #leads-cell="{ row }">
                <div class="text-sm">
                  <p class="font-medium">
                    {{ row.original.portalLeads30d }} leads
                  </p>
                  <p class="text-xs text-[var(--ui-text-muted)]">
                    {{ row.original.newLeads30d }} new, {{ row.original.wonLeads30d }} won
                  </p>
                </div>
              </template>

              <template #activity-cell="{ row }">
                <div class="text-sm text-[var(--ui-text-muted)]">
                  <p>{{ formatDateTime(row.original.lastActivityAt || row.original.lastLoginAt) }}</p>
                  <p v-if="row.original.lastLoginAt" class="text-xs">
                    Login {{ formatDate(row.original.lastLoginAt) }}
                  </p>
                </div>
              </template>

              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-2">
                  <UButton
                    icon="i-lucide-user-plus"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    aria-label="Invite portal user"
                    @click="inviteClientUser(row.original.id)"
                  />
                  <UDropdownMenu :items="getClientPortalActions(row.original.id)">
                    <UButton
                      icon="i-lucide-more-horizontal"
                      variant="ghost"
                      color="neutral"
                      size="sm"
                      :loading="openingPortal"
                      aria-label="Open client portal sections"
                    />
                  </UDropdownMenu>
                </div>
              </template>
            </UTable>

            <div v-if="!portalClientsPending && portalClients.length === 0" class="text-center text-[var(--ui-text-muted)] py-8">
              No clients match the current filters.
            </div>
          </UCard>
        </div>

        <!-- Users Tab -->
        <div v-if="activeTab === 'users'">
          <UCard class="mb-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:w-[520px]">
                <USelectMenu
                  v-model="portalUserFilters.clientId"
                  :items="portalUserClientOptions"
                  placeholder="All clients"
                  value-key="value"
                  searchable
                />
                <USelect
                  v-model="portalUserFilters.status"
                  :items="[
                    { label: 'All user statuses', value: 'all' },
                    { label: 'Active users', value: 'active' },
                    { label: 'Pending invites', value: 'pending' },
                    { label: 'Suspended users', value: 'suspended' }
                  ]"
                  value-key="value"
                />
              </div>
              <UButton
                label="Invite Client User"
                icon="i-lucide-user-plus"
                color="primary"
                @click="inviteClientUser()"
              />
            </div>
          </UCard>

          <UCard>
            <div v-if="usersPending" class="flex items-center justify-center py-12">
              <XfLoader />
            </div>

            <UTable v-else :data="users" :columns="userColumns">
              <template #name-cell="{ row }">
                <div>
                  <p class="font-medium">
                    {{ row.original.name }}
                  </p>
                  <p class="text-xs text-[var(--ui-text-muted)]">
                    {{ row.original.email }}
                  </p>
                </div>
              </template>

              <template #client-cell="{ row }">
                <span class="text-[var(--ui-text-dimmed)]">{{ row.original.clientName }}</span>
              </template>

              <template #permissions-cell="{ row }">
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="module in portalUserModules(row.original)"
                    :key="module.label"
                    size="xs"
                    variant="subtle"
                    :color="module.enabled ? 'success' : 'neutral'"
                  >
                    {{ module.label }}
                  </UBadge>
                </div>
              </template>

              <template #lastLogin-cell="{ row }">
                <span class="text-sm text-[var(--ui-text-muted)]">
                  {{ formatDateTime(row.original.lastLoginAt) }}
                </span>
              </template>

              <template #status-cell="{ row }">
                <UBadge :color="getUserStatusColor(row.original.status)" variant="subtle">
                  {{ row.original.status }}
                </UBadge>
              </template>

              <template #actions-cell="{ row }">
                <UDropdownMenu :items="getClientPortalActions(row.original.clientId)">
                  <UButton
                    icon="i-lucide-more-horizontal"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    :loading="openingPortal"
                    aria-label="Open client portal sections"
                  />
                </UDropdownMenu>
              </template>
            </UTable>

            <div v-if="!usersPending && users.length === 0" class="text-center text-[var(--ui-text-muted)] py-8">
              No portal users yet. Invite a client to get started!
            </div>
          </UCard>
        </div>

        <!-- Approvals Tab -->
        <div v-if="activeTab === 'approvals'">
          <div v-if="approvalsPending" class="flex items-center justify-center py-12">
            <XfLoader />
          </div>

          <UCard v-else>
            <UTable :data="approvals" :columns="approvalColumns">
              <template #title-cell="{ row }">
                <div>
                  <p class="font-medium">
                    {{ row.original.title }}
                  </p>
                  <UBadge size="xs" variant="subtle" color="neutral">
                    {{ row.original.approvalType }}
                  </UBadge>
                </div>
              </template>

              <template #project-cell="{ row }">
                <div>
                  <p class="text-[var(--ui-text-dimmed)]">
                    {{ row.original.projectName }}
                  </p>
                  <p class="text-xs text-[var(--ui-text-muted)]">
                    {{ row.original.clientName }}
                  </p>
                </div>
              </template>

              <template #requestedAt-cell="{ row }">
                <span class="text-sm">{{ formatDate(row.original.requestedAt) }}</span>
              </template>

              <template #dueDate-cell="{ row }">
                <span class="text-sm" :class="{ 'text-red-500': row.original.dueDate && new Date(row.original.dueDate) < new Date() }">
                  {{ formatDate(row.original.dueDate) }}
                </span>
              </template>

              <template #status-cell="{ row }">
                <UBadge :color="getApprovalStatusColor(row.original.status)" variant="subtle">
                  {{ row.original.status }}
                </UBadge>
              </template>
            </UTable>

            <div v-if="approvals.length === 0" class="text-center text-[var(--ui-text-muted)] py-8">
              No approval requests yet
            </div>
          </UCard>
        </div>

        <!-- Audit Tab -->
        <div v-if="activeTab === 'audit'">
          <UCard class="mb-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 class="text-lg font-semibold">
                  Portal Access Audit
                </h2>
                <p class="text-sm text-[var(--ui-text-muted)] mt-1">
                  Track owner, marketer, and client portal activity before clients are invited in.
                </p>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:w-[520px]">
                <USelectMenu
                  v-model="activityFilters.clientId"
                  :items="portalUserClientOptions"
                  placeholder="All clients"
                  value-key="value"
                  searchable
                />
                <USelect
                  v-model="activityFilters.action"
                  :items="[
                    { label: 'Agency portal access', value: 'agency_portal_access' },
                    { label: 'All portal activity', value: 'all' }
                  ]"
                  value-key="value"
                />
              </div>
            </div>
          </UCard>

          <UCard>
            <div v-if="activityPending" class="flex items-center justify-center py-12">
              <XfLoader />
            </div>

            <UTable v-else :data="portalActivity" :columns="activityColumns">
              <template #event-cell="{ row }">
                <div>
                  <p class="font-medium">
                    {{ formatActivityAction(row.original.action) }}
                  </p>
                  <p class="text-xs text-[var(--ui-text-muted)]">
                    {{ row.original.entityType || 'portal' }}
                  </p>
                </div>
              </template>

              <template #client-cell="{ row }">
                <span class="text-sm text-[var(--ui-text-dimmed)]">{{ row.original.clientName }}</span>
              </template>

              <template #actor-cell="{ row }">
                <div class="text-sm">
                  <p class="font-medium">
                    {{ row.original.agencyUserEmail || row.original.clientUserEmail || row.original.clientUserName || 'Unknown user' }}
                  </p>
                  <div class="mt-1 flex flex-wrap gap-1">
                    <UBadge
                      v-if="row.original.agencyUserRole"
                      color="primary"
                      variant="subtle"
                      size="xs"
                    >
                      {{ row.original.agencyUserRole }}
                    </UBadge>
                    <UBadge
                      v-if="row.original.clientUserName"
                      color="neutral"
                      variant="subtle"
                      size="xs"
                    >
                      {{ row.original.clientUserName }}
                    </UBadge>
                  </div>
                </div>
              </template>

              <template #source-cell="{ row }">
                <div class="max-w-[280px] text-sm text-[var(--ui-text-muted)]">
                  <p>{{ row.original.ipAddress || 'No IP recorded' }}</p>
                  <p class="truncate text-xs">
                    {{ row.original.userAgent || 'No user agent recorded' }}
                  </p>
                </div>
              </template>

              <template #createdAt-cell="{ row }">
                <span class="text-sm text-[var(--ui-text-muted)]">
                  {{ formatDateTime(row.original.createdAt) }}
                </span>
              </template>
            </UTable>

            <div v-if="!activityPending && portalActivity.length === 0" class="text-center text-[var(--ui-text-muted)] py-8">
              No portal audit activity matches the current filters.
            </div>
          </UCard>
        </div>

        <!-- Enterprise Tab -->
        <div v-if="activeTab === 'enterprise'" class="space-y-6">
          <UCard>
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 class="text-lg font-semibold">
                  Client Portal Preview
                </h2>
                <p class="text-sm text-[var(--ui-text-muted)] mt-1">
                  Choose a client, then open the exact portal module they will see.
                </p>
              </div>
              <div class="flex flex-col sm:flex-row gap-2 lg:w-[460px]">
                <USelectMenu
                  v-model="selectedAccessClientId"
                  :items="clientOptions"
                  placeholder="Select client"
                  value-key="value"
                  searchable
                  class="w-full"
                />
                <UButton
                  label="Open Dashboard"
                  icon="i-lucide-layout-dashboard"
                  color="primary"
                  :loading="openingPortal"
                  @click="openClientPortal(selectedAccessClientId, '/portal')"
                />
              </div>
            </div>
          </UCard>

          <div class="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
            <UCard>
              <template #header>
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <h2 class="text-lg font-semibold">
                      Enterprise Portal Readiness
                    </h2>
                    <p class="text-sm text-[var(--ui-text-muted)] mt-1">
                      The target is a client-facing operating room, not just a login area.
                    </p>
                  </div>
                  <UBadge color="primary" variant="subtle">
                    {{ enterpriseModules.filter(module => module.status === 'Live').length }}/{{ enterpriseModules.length }} live
                  </UBadge>
                </div>
              </template>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  v-for="module in enterpriseModules"
                  :key="module.title"
                  class="rounded-lg border border-[var(--ui-border)] p-4 space-y-3"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="size-9 rounded-lg bg-[var(--ui-bg-elevated)] flex items-center justify-center shrink-0">
                        <UIcon :name="module.icon" class="size-4 text-[var(--ui-text-muted)]" />
                      </div>
                      <div class="min-w-0">
                        <p class="font-medium truncate">
                          {{ module.title }}
                        </p>
                        <p class="text-xs text-[var(--ui-text-muted)] truncate">
                          {{ module.clientPath }}
                        </p>
                      </div>
                    </div>
                    <UBadge :color="module.color" variant="subtle" size="xs">
                      {{ module.status }}
                    </UBadge>
                  </div>
                  <p class="text-sm text-[var(--ui-text-muted)] leading-relaxed">
                    {{ module.description }}
                  </p>
                  <div class="rounded-md bg-[var(--ui-bg-elevated)] p-3">
                    <p class="text-xs font-medium mb-1">
                      Enterprise next step
                    </p>
                    <p class="text-xs text-[var(--ui-text-muted)] leading-relaxed">
                      {{ module.next }}
                    </p>
                  </div>
                  <UButton
                    :label="`Preview ${module.title}`"
                    icon="i-lucide-external-link"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    block
                    :loading="openingPortal"
                    @click="openClientPortal(selectedAccessClientId, module.clientPath)"
                  />
                </div>
              </div>
            </UCard>

            <div class="space-y-6">
              <UCard>
                <template #header>
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-compass" class="size-4 text-primary" />
                    <h2 class="font-semibold">
                      Product Direction
                    </h2>
                  </div>
                </template>
                <div class="space-y-3">
                  <div
                    v-for="item in enterprisePlaybook"
                    :key="item"
                    class="flex gap-3"
                  >
                    <UIcon name="i-lucide-check" class="size-4 text-emerald-500 mt-0.5 shrink-0" />
                    <p class="text-sm text-[var(--ui-text-muted)] leading-relaxed">
                      {{ item }}
                    </p>
                  </div>
                </div>
              </UCard>

              <UCard>
                <template #header>
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-list-checks" class="size-4 text-primary" />
                    <h2 class="font-semibold">
                      Rollout Plan
                    </h2>
                  </div>
                </template>
                <div class="space-y-4">
                  <div
                    v-for="item in enterpriseRollout"
                    :key="item.phase"
                    class="rounded-lg border border-[var(--ui-border)] p-4"
                  >
                    <div class="flex items-center gap-2 mb-2">
                      <UBadge color="neutral" variant="subtle" size="xs">
                        {{ item.phase }}
                      </UBadge>
                      <p class="font-medium text-sm">
                        {{ item.title }}
                      </p>
                    </div>
                    <p class="text-sm text-[var(--ui-text-muted)] leading-relaxed">
                      {{ item.detail }}
                    </p>
                  </div>
                </div>
              </UCard>
            </div>
          </div>

          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-shield-check" class="size-4 text-primary" />
                <h2 class="font-semibold">
                  Enterprise Guardrails
                </h2>
              </div>
            </template>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="rounded-lg bg-[var(--ui-bg-elevated)] p-4">
                <p class="font-medium text-sm mb-1">
                  Client isolation
                </p>
                <p class="text-sm text-[var(--ui-text-muted)] leading-relaxed">
                  Portal APIs must continue to scope every query from the authenticated client session, never from client-controlled route params.
                </p>
              </div>
              <div class="rounded-lg bg-[var(--ui-bg-elevated)] p-4">
                <p class="font-medium text-sm mb-1">
                  Permission gates
                </p>
                <p class="text-sm text-[var(--ui-text-muted)] leading-relaxed">
                  Billing, analytics, time, approvals, meetings, recordings, and request creation need independent per-user switches.
                </p>
              </div>
              <div class="rounded-lg bg-[var(--ui-bg-elevated)] p-4">
                <p class="font-medium text-sm mb-1">
                  Agency control
                </p>
                <p class="text-sm text-[var(--ui-text-muted)] leading-relaxed">
                  Owners and marketing users need open-as-client access, readiness checks, audit logs, and visibility previews before inviting clients.
                </p>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </UDashboardPanel>

    <!-- Invite Slideover -->
    <USlideover v-model:open="showInviteModal">
      <template #header>
        <h3 class="text-[18px] font-[600]">
          Invite Client User
        </h3>
      </template>
      <template #body>
        <form class="space-y-0" @submit.prevent="sendInvite">
          <!-- Section: Client & Contact -->
          <fieldset class="space-y-5 pb-6 mb-6 border-b border-[var(--ui-border)]">
            <legend class="text-[11px] font-medium text-[var(--ui-text-muted)] uppercase tracking-widest mb-1">
              Client & Contact
            </legend>

            <div>
              <label class="block text-[13px] font-medium mb-2">Client <span class="text-red-500">*</span></label>
              <USelectMenu
                v-model="inviteForm.clientId"
                :items="clientOptions"
                placeholder="Select client"
                value-key="value"
                searchable
                size="xl"
                class="w-full"
              />
              <p class="text-[12px] text-[var(--ui-text-muted)] mt-1.5">
                The client account this user belongs to.
              </p>
            </div>

            <div>
              <label class="block text-[13px] font-medium mb-2">Full Name <span class="text-red-500">*</span></label>
              <UInput
                v-model="inviteForm.name"
                placeholder="e.g., Jane Smith"
                size="xl"
                class="w-full"
              />
            </div>

            <div>
              <label class="block text-[13px] font-medium mb-2">Email Address <span class="text-red-500">*</span></label>
              <UInput
                v-model="inviteForm.email"
                type="email"
                placeholder="client@example.com"
                size="xl"
                class="w-full"
              />
              <p class="text-[12px] text-[var(--ui-text-muted)] mt-1.5">
                An invitation email with a sign-up link will be sent here.
              </p>
            </div>
          </fieldset>

          <!-- Section: Permissions -->
          <fieldset class="space-y-4">
            <legend class="text-[11px] font-medium text-[var(--ui-text-muted)] uppercase tracking-widest mb-1">
              Permissions
            </legend>
            <p class="text-[12px] text-[var(--ui-text-muted)]">
              Control what the invited user can see and do in the client portal.
            </p>

            <div class="space-y-3 pt-1">
              <label class="flex items-center gap-3 cursor-pointer">
                <UCheckbox v-model="inviteForm.permissions.canViewProjects" />
                <div>
                  <span class="text-[13px] font-medium">View projects</span>
                  <p class="text-[12px] text-[var(--ui-text-muted)]">See project details, status, and deliverables.</p>
                </div>
              </label>

              <label class="flex items-center gap-3 cursor-pointer">
                <UCheckbox v-model="inviteForm.permissions.canViewInvoices" />
                <div>
                  <span class="text-[13px] font-medium">View invoices</span>
                  <p class="text-[12px] text-[var(--ui-text-muted)]">Access invoices and payment history.</p>
                </div>
              </label>

              <label class="flex items-center gap-3 cursor-pointer">
                <UCheckbox v-model="inviteForm.permissions.canApproveWork" />
                <div>
                  <span class="text-[13px] font-medium">Approve deliverables</span>
                  <p class="text-[12px] text-[var(--ui-text-muted)]">Approve or request revisions on submitted work.</p>
                </div>
              </label>

              <label class="flex items-center gap-3 cursor-pointer">
                <UCheckbox v-model="inviteForm.permissions.canViewTimeEntries" />
                <div>
                  <span class="text-[13px] font-medium">View time entries</span>
                  <p class="text-[12px] text-[var(--ui-text-muted)]">See time tracked against their projects.</p>
                </div>
              </label>

              <label class="flex items-center gap-3 cursor-pointer">
                <UCheckbox v-model="inviteForm.permissions.canViewBudgets" />
                <div>
                  <span class="text-[13px] font-medium">View budget details</span>
                  <p class="text-[12px] text-[var(--ui-text-muted)]">See budget allocation and spend breakdowns.</p>
                </div>
              </label>

              <label class="flex items-center gap-3 cursor-pointer">
                <UCheckbox v-model="inviteForm.permissions.canViewAnalytics" />
                <div>
                  <span class="text-[13px] font-medium">View analytics</span>
                  <p class="text-[12px] text-[var(--ui-text-muted)]">See campaign performance, lead volume, and trends.</p>
                </div>
              </label>

              <label class="flex items-center gap-3 cursor-pointer">
                <UCheckbox v-model="inviteForm.permissions.canSubmitRequests" />
                <div>
                  <span class="text-[13px] font-medium">Submit requests</span>
                  <p class="text-[12px] text-[var(--ui-text-muted)]">Create briefs and portal requests.</p>
                </div>
              </label>
            </div>
          </fieldset>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            size="lg"
            @click="showInviteModal = false"
          />
          <UButton
            color="primary"
            label="Send Invitation"
            icon="i-lucide-send"
            size="lg"
            :loading="inviting"
            @click="sendInvite"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>
