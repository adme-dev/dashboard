<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Client Portal',
  middleware: ['role-client-portal-access']
})

const toast = useToast()

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

const portalClients = computed(() => ((portalClientsData.value as any)?.clients || []) as any[])
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
const { data: usersData, pending: usersPending, refresh: refreshUsers } = await useFetch('/api/agency/client-portal/users')

const users = computed(() => ((usersData.value as any)?.users || []) as any[])
// Fetch approvals
const { data: approvalsData, pending: approvalsPending } = await useFetch('/api/agency/client-portal/approvals')

const approvals = computed(() => ((approvalsData.value as any)?.approvals || []) as any[])

// Fetch clients for invite modal
const { data: clientsData } = await useFetch('/api/agency/clients', {
  query: { limit: 100 }
})
const clients = computed(() => {
  const raw = clientsData.value
  if (Array.isArray(raw)) return raw as any[]
  return ((raw as any)?.clients || []) as any[]
})
const clientOptions = computed(() => clients.value.map((c: any) => ({ label: c.name, value: c.id })))

const selectedAccessClientId = ref<string | null>(null)
watch(clients, (items) => {
  if (!selectedAccessClientId.value && items.length > 0) {
    selectedAccessClientId.value = items[0].id
  }
}, { immediate: true })

const openingPortal = ref(false)
const openClientPortal = async (clientId?: string | null) => {
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
    await navigateTo('/portal')
  } catch (err: any) {
    toast.add({
      title: 'Failed to open portal',
      description: err.data?.message || err.message,
      color: 'error'
    })
  } finally {
    openingPortal.value = false
  }
}

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
    const result = await $fetch('/api/agency/client-portal/invite', {
      method: 'POST',
      body: inviteForm.value
    }) as any

    toast.add({
      title: 'Invitation sent',
      description: `Invite link created for ${result.user.email}`,
      color: 'success'
    })
    showInviteModal.value = false
    resetInviteForm()
    refreshUsers()
    refreshPortalClients()
  } catch (err: any) {
    toast.add({ title: 'Failed to send invite', description: err.data?.message || err.message, color: 'error' })
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
                <p class="text-sm text-[var(--ui-text-muted)]">Client Portals</p>
                <p class="text-xl font-bold">{{ portalClientSummary.total }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-emerald-500/10">
                <UIcon name="i-lucide-check-circle" class="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">Active Portals</p>
                <p class="text-xl font-bold text-emerald-500">{{ portalClientSummary.active }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-amber-500/10">
                <UIcon name="i-lucide-clock" class="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">30d Portal Leads</p>
                <p class="text-xl font-bold text-amber-500">{{ portalClientSummary.leads30d }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-purple-500/10">
                <UIcon name="i-lucide-mail" class="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">Needs Setup</p>
                <p class="text-xl font-bold text-purple-500">{{ portalClientSummary.notConfigured }}</p>
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
            { label: 'Approvals', value: 'approvals', icon: 'i-lucide-check-square' }
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
                    <p class="font-medium truncate">{{ row.original.name }}</p>
                    <p class="text-xs text-[var(--ui-text-muted)]">
                      {{ row.original.activeProjects }} active projects
                    </p>
                  </div>
                </div>
              </template>

              <template #status-cell="{ row }">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge :color="getPortalStatusColor(row.original.portalStatus)" variant="subtle">
                    {{ formatPortalStatus(row.original.portalStatus) }}
                  </UBadge>
                  <UBadge v-if="row.original.pendingApprovals" color="warning" variant="subtle" size="xs">
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
                </div>
              </template>

              <template #leads-cell="{ row }">
                <div class="text-sm">
                  <p class="font-medium">{{ row.original.portalLeads30d }} leads</p>
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
                  <UButton
                    icon="i-lucide-external-link"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    :loading="openingPortal"
                    aria-label="Open client portal"
                    @click="openClientPortal(row.original.id)"
                  />
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
          <div v-if="usersPending" class="flex items-center justify-center py-12">
            <XfLoader />
          </div>

          <UCard v-else>
            <UTable :data="users" :columns="userColumns">
              <template #name-cell="{ row }">
                <div>
                  <p class="font-medium">{{ row.original.name }}</p>
                  <p class="text-xs text-[var(--ui-text-muted)]">{{ row.original.email }}</p>
                </div>
              </template>

              <template #client-cell="{ row }">
                <span class="text-[var(--ui-text-dimmed)]">{{ row.original.clientName }}</span>
              </template>

              <template #permissions-cell="{ row }">
                <div class="flex flex-wrap gap-1">
                  <UBadge v-if="row.original.permissions?.canApproveWork" size="xs" variant="subtle" color="success">
                    Approve
                  </UBadge>
                  <UBadge v-if="row.original.permissions?.canViewBudgets" size="xs" variant="subtle" color="info">
                    Budgets
                  </UBadge>
                  <UBadge v-if="row.original.permissions?.canViewTimeEntries" size="xs" variant="subtle" color="neutral">
                    Time
                  </UBadge>
                  <UBadge v-if="row.original.permissions?.canViewAnalytics" size="xs" variant="subtle" color="primary">
                    Analytics
                  </UBadge>
                  <UBadge v-if="row.original.permissions?.canSubmitRequests" size="xs" variant="subtle" color="warning">
                    Requests
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
                <UButton
                  icon="i-lucide-external-link"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  :loading="openingPortal"
                  aria-label="Open client portal"
                  @click="openClientPortal(row.original.clientId)"
                />
              </template>
            </UTable>

            <div v-if="users.length === 0" class="text-center text-[var(--ui-text-muted)] py-8">
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
                  <p class="font-medium">{{ row.original.title }}</p>
                  <UBadge size="xs" variant="subtle" color="neutral">
                    {{ row.original.approvalType }}
                  </UBadge>
                </div>
              </template>

              <template #project-cell="{ row }">
                <div>
                  <p class="text-[var(--ui-text-dimmed)]">{{ row.original.projectName }}</p>
                  <p class="text-xs text-[var(--ui-text-muted)]">{{ row.original.clientName }}</p>
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
      </div>
    </UDashboardPanel>

    <!-- Invite Slideover -->
    <USlideover v-model:open="showInviteModal">
      <template #header>
        <h3 class="text-[18px] font-[600]">Invite Client User</h3>
      </template>
      <template #body>
        <form class="space-y-0" @submit.prevent="sendInvite">
          <!-- Section: Client & Contact -->
          <fieldset class="space-y-5 pb-6 mb-6 border-b border-[var(--ui-border)]">
            <legend class="text-[11px] font-medium text-[var(--ui-text-muted)] uppercase tracking-widest mb-1">Client & Contact</legend>

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
              <p class="text-[12px] text-[var(--ui-text-muted)] mt-1.5">The client account this user belongs to.</p>
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
              <p class="text-[12px] text-[var(--ui-text-muted)] mt-1.5">An invitation email with a sign-up link will be sent here.</p>
            </div>
          </fieldset>

          <!-- Section: Permissions -->
          <fieldset class="space-y-4">
            <legend class="text-[11px] font-medium text-[var(--ui-text-muted)] uppercase tracking-widest mb-1">Permissions</legend>
            <p class="text-[12px] text-[var(--ui-text-muted)]">Control what the invited user can see and do in the client portal.</p>

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
