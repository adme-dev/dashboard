<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Client Portal',
  middleware: ['role-clients']
})

const toast = useToast()

// Active tab
const activeTab = ref('users')

// Fetch client portal users
const { data: usersData, pending: usersPending, refresh: refreshUsers } = await useFetch('/api/agency/client-portal/users')

const users = computed(() => ((usersData.value as any)?.users || []) as any[])
const usersSummary = computed(() => ((usersData.value as any)?.summary || {
  total: 0, active: 0, pending: 0, suspended: 0
}) as any)

// Fetch approvals
const { data: approvalsData, pending: approvalsPending, refresh: refreshApprovals } = await useFetch('/api/agency/client-portal/approvals')

const approvals = computed(() => ((approvalsData.value as any)?.approvals || []) as any[])
const approvalsSummary = computed(() => ((approvalsData.value as any)?.summary || {
  total: 0, pending: 0, approved: 0, rejected: 0
}) as any)

// Fetch clients for invite modal
const { data: clientsData } = await useFetch('/api/agency/clients', {
  query: { limit: 100 }
})
const clients = computed(() => {
  const raw = clientsData.value
  if (Array.isArray(raw)) return raw as any[]
  return ((raw as any)?.clients || []) as any[]
})

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
    canViewBudgets: false
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
      canViewBudgets: false
    }
  }
}

// User columns (v4 format)
const userColumns = [
  { accessorKey: 'name', header: 'User' },
  { accessorKey: 'client', header: 'Client' },
  { accessorKey: 'permissions', header: 'Permissions' },
  { accessorKey: 'lastLogin', header: 'Last Login' },
  { accessorKey: 'status', header: 'Status' }
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
            @click="showInviteModal = true"
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
                <p class="text-sm text-[var(--ui-text-muted)]">Portal Users</p>
                <p class="text-xl font-bold">{{ usersSummary.total }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-emerald-500/10">
                <UIcon name="i-lucide-check-circle" class="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">Active Users</p>
                <p class="text-xl font-bold text-emerald-500">{{ usersSummary.active }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-amber-500/10">
                <UIcon name="i-lucide-clock" class="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">Pending Approvals</p>
                <p class="text-xl font-bold text-amber-500">{{ approvalsSummary.pending }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-purple-500/10">
                <UIcon name="i-lucide-mail" class="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p class="text-sm text-[var(--ui-text-muted)]">Pending Invites</p>
                <p class="text-xl font-bold text-purple-500">{{ usersSummary.pending }}</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Tabs -->
        <UTabs
          v-model="activeTab"
          :items="[
            { label: 'Portal Users', value: 'users', icon: 'i-lucide-users' },
            { label: 'Approvals', value: 'approvals', icon: 'i-lucide-check-square' }
          ]"
          class="mb-6"
        />

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
                :items="clients.map((c: any) => ({ label: c.name, value: c.id }))"
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
