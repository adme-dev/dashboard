<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Client Portal',
  middleware: ['auth']
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
const clients = computed(() => ((clientsData.value as any)?.clients || []) as any[])

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

// Invite modal
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

// User columns
const userColumns: any[] = [
  { key: 'name', label: 'User' },
  { key: 'client', label: 'Client' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'lastLogin', label: 'Last Login' },
  { key: 'status', label: 'Status' }
]

// Approval columns
const approvalColumns: any[] = [
  { key: 'title', label: 'Item' },
  { key: 'project', label: 'Project' },
  { key: 'requestedAt', label: 'Requested' },
  { key: 'dueDate', label: 'Due' },
  { key: 'status', label: 'Status' }
]
</script>

<template>
  <div class="flex-1 min-w-0">
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
                <p class="text-sm text-gray-500">Portal Users</p>
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
                <p class="text-sm text-gray-500">Active Users</p>
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
                <p class="text-sm text-gray-500">Pending Approvals</p>
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
                <p class="text-sm text-gray-500">Pending Invites</p>
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
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
          </div>

          <UCard v-else>
            <UTable :data="users" :columns="userColumns">
              <template #name-cell="{ row: r }">
                <div>
                  <p class="font-medium">{{ (r as any).name }}</p>
                  <p class="text-xs text-gray-500">{{ (r as any).email }}</p>
                </div>
              </template>

              <template #client-cell="{ row: r }">
                <span class="text-gray-600">{{ (r as any).clientName }}</span>
              </template>

              <template #permissions-cell="{ row: r }">
                <div class="flex flex-wrap gap-1">
                  <UBadge v-if="(r as any).permissions.canApproveWork" size="xs" variant="subtle" color="success">
                    Approve
                  </UBadge>
                  <UBadge v-if="(r as any).permissions.canViewBudgets" size="xs" variant="subtle" color="info">
                    Budgets
                  </UBadge>
                  <UBadge v-if="(r as any).permissions.canViewTimeEntries" size="xs" variant="subtle" color="neutral">
                    Time
                  </UBadge>
                </div>
              </template>

              <template #lastLogin-cell="{ row: r }">
                <span class="text-sm text-gray-500">
                  {{ formatDateTime((r as any).lastLoginAt) }}
                </span>
              </template>

              <template #status-cell="{ row: r }">
                <UBadge :color="getUserStatusColor((r as any).status)" variant="subtle">
                  {{ (r as any).status }}
                </UBadge>
              </template>
            </UTable>

            <div v-if="users.length === 0" class="text-center text-gray-500 py-8">
              No portal users yet. Invite a client to get started!
            </div>
          </UCard>
        </div>

        <!-- Approvals Tab -->
        <div v-if="activeTab === 'approvals'">
          <div v-if="approvalsPending" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
          </div>

          <UCard v-else>
            <UTable :data="approvals" :columns="approvalColumns">
              <template #title-cell="{ row: r }">
                <div>
                  <p class="font-medium">{{ (r as any).title }}</p>
                  <UBadge size="xs" variant="subtle" color="neutral">
                    {{ (r as any).approvalType }}
                  </UBadge>
                </div>
              </template>

              <template #project-cell="{ row: r }">
                <div>
                  <p class="text-gray-600">{{ (r as any).projectName }}</p>
                  <p class="text-xs text-gray-400">{{ (r as any).clientName }}</p>
                </div>
              </template>

              <template #requestedAt-cell="{ row: r }">
                <span class="text-sm">{{ formatDate((r as any).requestedAt) }}</span>
              </template>

              <template #dueDate-cell="{ row: r }">
                <span class="text-sm" :class="{ 'text-red-500': (r as any).dueDate && new Date((r as any).dueDate) < new Date() }">
                  {{ formatDate((r as any).dueDate) }}
                </span>
              </template>

              <template #status-cell="{ row: r }">
                <UBadge :color="getApprovalStatusColor((r as any).status)" variant="subtle">
                  {{ (r as any).status }}
                </UBadge>
              </template>
            </UTable>

            <div v-if="approvals.length === 0" class="text-center text-gray-500 py-8">
              No approval requests yet
            </div>
          </UCard>
        </div>
      </div>
    </UDashboardPanel>

    <!-- Invite Modal -->
    <UModal v-model:open="showInviteModal">
      <template #header>
        <h3 class="font-semibold">Invite Client User</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Client" required>
            <USelectMenu
              v-model="inviteForm.clientId"
              :items="clients.map(c => ({ label: c.name, value: c.id }))"
              placeholder="Select client"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Email" required>
            <UInput v-model="inviteForm.email" type="email" placeholder="client@example.com" />
          </UFormField>

          <UFormField label="Name" required>
            <UInput v-model="inviteForm.name" placeholder="Full name" />
          </UFormField>

          <div class="space-y-2">
            <p class="text-sm font-medium">Permissions</p>
            <div class="space-y-2">
              <UCheckbox v-model="inviteForm.permissions.canViewProjects" label="View projects" />
              <UCheckbox v-model="inviteForm.permissions.canViewInvoices" label="View invoices" />
              <UCheckbox v-model="inviteForm.permissions.canApproveWork" label="Approve deliverables" />
              <UCheckbox v-model="inviteForm.permissions.canViewTimeEntries" label="View time entries" />
              <UCheckbox v-model="inviteForm.permissions.canViewBudgets" label="View budget details" />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showInviteModal = false" />
          <UButton
            color="primary"
            label="Send Invitation"
            icon="i-lucide-send"
            :loading="inviting"
            @click="sendInvite"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
