<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Search user name / email"
          class="w-80"
          size="sm"
        />
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-filter"
          size="sm"
        >
          Filter
        </UButton>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-sm text-muted">
          Showing: {{ filteredUsers.length }} results
        </span>
        <UButton
          variant="outline"
          color="neutral"
          icon="i-lucide-users-round"
          to="/admin/teams"
          size="sm"
        >
          Manage teams
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-circle-help"
          size="sm"
          @click="showRolesHelp = true"
        >
          Roles guide
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-user-plus"
          size="sm"
          @click="showInviteModal = true"
        >
          Invite
        </UButton>
      </div>
    </div>

    <div>
      <!-- Loading State -->
      <div v-if="pending" class="flex-1 flex items-center justify-center min-h-64">
        <XfLoader />
      </div>

      <!-- Error State -->
      <div v-else-if="usersError" class="flex-1 flex items-center justify-center min-h-64">
        <UEmpty
          icon="i-lucide-alert-circle"
          title="Failed to load users"
          :description="usersError.message || 'An error occurred'"
          :actions="[{ label: 'Retry', color: 'primary', onClick: () => refresh() }]"
        />
      </div>

      <!-- Empty State -->
      <div v-else-if="users.length === 0" class="flex-1 flex items-center justify-center min-h-64">
        <UEmpty
          icon="i-lucide-users"
          title="No users found"
          description="Get started by inviting your team members"
          :actions="[{ label: 'Invite users', icon: 'i-lucide-user-plus', color: 'primary', onClick: () => showInviteModal = true }]"
        />
      </div>

      <!-- Users Table -->
      <UTable
        v-else
        :data="filteredUsers"
        :columns="columns"
        :loading="pending"
      >
        <template #name-cell="{ row }">
          <UUser
            :name="row.original.name"
            :avatar="{ src: row.original.avatarUrl, alt: row.original.name }"
            size="sm"
          />
        </template>

        <template #role-cell="{ row }">
          <USelect
            :model-value="row.original.role"
            :items="roleOptions"
            value-key="value"
            size="xs"
            class="w-48 min-w-48"
            @update:model-value="updateUserRole(row.original, $event)"
          />
        </template>

        <template #status-cell="{ row }">
          <UBadge
            :color="row.original.status === 'active' ? 'success' : 'neutral'"
            variant="subtle"
            size="xs"
          >
            {{ row.original.status }}
          </UBadge>
        </template>

        <template #teams-cell="{ row }">
          <div class="flex items-center gap-1.5">
            <template v-if="row.original.teams.length">
              <UAvatarGroup size="xs" :max="3">
                <UTooltip
                  v-for="team in row.original.teams.slice(0, 3)"
                  :key="team.id"
                  :text="team.name"
                >
                  <UAvatar
                    :alt="team.name[0]"
                    size="xs"
                  />
                </UTooltip>
              </UAvatarGroup>
              <span v-if="row.original.teams.length > 3" class="text-xs text-muted">
                +{{ row.original.teams.length - 3 }}
              </span>
            </template>
            <UButton
              variant="ghost"
              color="neutral"
              :icon="row.original.teams.length ? 'i-lucide-pencil' : 'i-lucide-plus'"
              size="xs"
              @click="openTeamsModal(row.original)"
            />
          </div>
        </template>

        <template #joinedAt-cell="{ row }">
          {{ formatDate(row.original.joinedAt) }}
        </template>

        <template #actions-cell="{ row }">
          <UDropdownMenu :items="userActions(row.original)">
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-more-horizontal"
              size="xs"
            />
          </UDropdownMenu>
        </template>

        <template #empty>
          <UEmpty
            icon="i-lucide-users"
            :title="searchQuery ? 'No users match your search' : 'No users found'"
          />
        </template>
      </UTable>
    </div>

    <!-- Invite Modal -->
    <UModal v-model:open="showInviteModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-lg">Invite users</h3>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" @click="showInviteModal = false" />
            </div>
          </template>
          <div class="space-y-4">
            <UFormField label="Email addresses" description="Separate multiple emails with commas">
              <UTextarea
                v-model="inviteEmails"
                placeholder="john@example.com, jane@example.com"
                :rows="4"
              />
            </UFormField>
            <UFormField label="Title">
              <UInput
                v-model="inviteTitle"
                placeholder="e.g. Creative Director"
              />
            </UFormField>
            <UFormField label="Role">
              <USelect
                v-model="inviteRole"
                :items="roleOptions"
                value-key="value"
                option-key="value"
              />
            </UFormField>
            <UFormField label="Teams">
              <USelect
                v-model="inviteTeams"
                :items="availableTeams"
                multiple
              />
            </UFormField>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" color="neutral" @click="showInviteModal = false">
                Cancel
              </UButton>
              <UButton color="primary" :loading="inviteLoading" @click="sendInvites">
                Send invites
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- Edit User Modal -->
    <UModal v-model:open="showEditModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-lg">Edit user</h3>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" @click="showEditModal = false" />
            </div>
          </template>
          <div class="space-y-4">
            <UFormField label="Name">
              <UInput v-model="editForm.name" />
            </UFormField>
            <UFormField label="Email">
              <UInput v-model="editForm.email" type="email" />
            </UFormField>
            <UFormField label="Role">
              <USelect v-model="editForm.role" :items="roleOptions" value-key="value" option-key="value" />
            </UFormField>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" color="neutral" @click="showEditModal = false">
                Cancel
              </UButton>
              <UButton color="primary" :loading="editLoading" @click="saveUser">
                Save changes
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- Roles Help Slideover -->
    <USlideover v-model:open="showRolesHelp" title="Roles & Permissions" :ui="{ width: 'max-w-lg' }">
      <template #body>
        <div class="space-y-6">
          <p class="text-sm text-muted">
            Each role determines what a user can access and manage across the platform. Roles are listed from most to least privileged.
          </p>

          <div
            v-for="role in rolesPermissions"
            :key="role.value"
            class="border border-default rounded-lg overflow-hidden"
          >
            <div class="flex items-center gap-3 px-4 py-3 bg-elevated/50">
              <UIcon :name="role.icon" class="size-4 text-primary shrink-0" />
              <div class="min-w-0">
                <p class="font-medium text-highlighted text-sm">{{ role.label }}</p>
                <p class="text-xs text-muted">{{ role.description }}</p>
              </div>
            </div>
            <div class="px-4 py-3 space-y-2">
              <div class="flex items-start gap-2" v-for="(perm, i) in role.canDo" :key="'can-' + i">
                <UIcon name="i-lucide-check" class="size-3.5 text-success mt-0.5 shrink-0" />
                <span class="text-xs text-muted">{{ perm }}</span>
              </div>
              <div class="flex items-start gap-2" v-for="(perm, i) in role.cantDo" :key="'cant-' + i">
                <UIcon name="i-lucide-x" class="size-3.5 text-error mt-0.5 shrink-0" />
                <span class="text-xs text-muted">{{ perm }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </USlideover>

    <!-- Assign Teams Modal -->
    <UModal v-model:open="showTeamsModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-lg">Manage teams</h3>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" @click="showTeamsModal = false" />
            </div>
          </template>
          <div v-if="teamsLoading" class="py-8 text-center">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin mx-auto" />
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="team in availableTeams"
              :key="team.value"
              class="flex items-center justify-between p-2 rounded hover:bg-elevated"
            >
              <div class="flex items-center gap-2">
                <div
                  class="size-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  :style="{ backgroundColor: team.color }"
                >
                  {{ team.label[0] }}
                </div>
                <span>{{ team.label }}</span>
              </div>
              <UCheckbox
                :model-value="selectedUserTeams.includes(team.value)"
                @update:model-value="toggleTeam(team.value)"
              />
            </div>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" color="neutral" @click="showTeamsModal = false">
                Cancel
              </UButton>
              <UButton color="primary" :loading="saveTeamsLoading" @click="saveTeams">
                Save
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- Remove User Confirmation Modal -->
    <UModal v-model:open="showRemoveModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-lg">Deactivate user</h3>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" @click="showRemoveModal = false" />
            </div>
          </template>
          <p class="text-sm text-muted">
            Are you sure you want to deactivate <strong class="text-highlighted">{{ userToRemove?.name }}</strong>?
            They will lose access to the platform but their data will be preserved.
          </p>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" color="neutral" @click="showRemoveModal = false">
                Cancel
              </UButton>
              <UButton color="error" @click="removeUser">
                Deactivate
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { h } from 'vue'
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'admin', middleware: ['role-admin'] })

interface User {
  id: string
  name: string
  email: string
  avatarUrl?: string
  role: string
  status: 'active' | 'inactive' | 'pending'
  teams: Array<{ id: string; name: string }>
  joinedAt: string
}

interface Team {
  id: string
  name: string
  color: string
  icon: string
  memberCount: number
}

const { isAuthenticated, fetchUser } = useAuth()

const isAuthChecked = ref(false)

onMounted(async () => {
  await fetchUser()
  isAuthChecked.value = true
})

const { data: usersData, pending, refresh, error: usersError } = useFetch('/api/admin/users', {
  immediate: false,
  server: false
})

watch(isAuthChecked, (checked) => {
  if (checked && isAuthenticated.value) {
    refresh()
  }
}, { immediate: true })

const users = computed(() => usersData.value?.users || [])

const { data: teamsData } = useFetch('/api/admin/teams')
const teams = computed(() => teamsData.value?.teams || [])

const searchQuery = ref('')
const showInviteModal = ref(false)
const showEditModal = ref(false)
const showTeamsModal = ref(false)
const showRolesHelp = ref(false)
const editLoading = ref(false)
const inviteLoading = ref(false)
const saveTeamsLoading = ref(false)
const teamsLoading = ref(false)
const inviteEmails = ref('')
const inviteTitle = ref('')
const inviteRole = ref('member')
const inviteTeams = ref<string[]>([])
const selectedUser = ref<User | null>(null)
const selectedUserTeams = ref<string[]>([])
const editForm = ref({ name: '', email: '', role: 'member' })

const { data: rolesApiData } = useFetch<{ roles: Array<{ name: string; slug: string; isSystem: boolean; color: string; icon: string; description: string; permissionGroups: string[] }> }>('/api/admin/roles')

const ROLE_LABEL_OVERRIDES: Record<string, string> = {
  accounts: 'Accounts / Bookkeeper',
}

const roleLabel = (slug: string, fallback: string) => ROLE_LABEL_OVERRIDES[slug] || fallback

const roleOptions = computed(() => {
  if (!rolesApiData.value?.roles) return [{ label: 'Member', value: 'member' }]
  return rolesApiData.value.roles.map(r => ({ label: roleLabel(r.slug, r.name), value: r.slug }))
})

const PERMISSION_GROUP_LABELS: Record<string, string> = {
  ADMIN: 'Admin access',
  MANAGEMENT: 'Management & reports',
  FINANCE: 'Finance & invoicing',
  SALES: 'Sales & pricing',
  CLIENTS: 'Client management',
  CREATIVE: 'Creative tools',
  MEDIA_BUYING: 'Media buying & ads',
  TIME_APPROVALS: 'Time approvals',
  AUTOMATION: 'Automations',
}

const rolesPermissions = computed(() => {
  if (!rolesApiData.value?.roles) return []
  return rolesApiData.value.roles.map(r => ({
    value: r.slug,
    label: roleLabel(r.slug, r.name),
    icon: r.icon || 'i-lucide-user',
    description: r.description || '',
    canDo: r.permissionGroups.map((g: string) => PERMISSION_GROUP_LABELS[g] || g),
    cantDo: [] as string[],
  }))
})

const availableTeams = computed(() => {
  return teams.value.map(team => ({
    label: team.name,
    value: team.id,
    color: team.color,
  }))
})

const filteredUsers = computed(() => {
  if (!searchQuery.value) return users.value
  const query = searchQuery.value.toLowerCase()
  return users.value.filter((user: User) =>
    user.name.toLowerCase().includes(query) ||
    user.email.toLowerCase().includes(query)
  )
})

const columns = [
  {
    id: 'select',
    header: ({ table }: any) => h(resolveComponent('UCheckbox'), {
      modelValue: table.getIsAllPageRowsSelected(),
      'onUpdate:modelValue': (v: boolean) => table.toggleAllPageRowsSelected(!!v)
    }),
    cell: ({ row }: any) => h(resolveComponent('UCheckbox'), {
      modelValue: row.getIsSelected(),
      'onUpdate:modelValue': (v: boolean) => row.toggleSelected(!!v)
    })
  },
  { accessorKey: 'name', header: 'Name', meta: { class: { th: 'w-full', td: 'w-full' } } },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'role', header: 'User role' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'teams', header: 'Teams' },
  { accessorKey: 'joinedAt', header: 'Joined' },
  { id: 'actions', header: '' },
]

const userActions = (user: User) => [
  [{
    label: 'Edit user',
    icon: 'i-lucide-pencil',
    onSelect: () => openEditModal(user),
  }, {
    label: 'Manage teams',
    icon: 'i-lucide-users-round',
    onSelect: () => openTeamsModal(user),
  }],
  [{
    label: user.status === 'active' ? 'Deactivate' : 'Activate',
    icon: user.status === 'active' ? 'i-lucide-user-x' : 'i-lucide-user-check',
    onSelect: () => toggleUserStatus(user),
  }, {
    label: 'Remove',
    icon: 'i-lucide-trash',
    color: 'error' as const,
    onSelect: () => confirmRemoveUser(user),
  }],
]

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const toast = useToast()

const updateUserRole = async (user: User, role: string) => {
  if (user.role === role) return

  try {
    await $fetch(`/api/auth/users/${user.id}/role`, {
      method: 'PATCH',
      body: { userRole: role }
    })
    user.role = role
    toast.add({ title: `Role updated to ${role}`, color: 'success' })
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to update role', description: err.data?.statusMessage || 'Please try again', color: 'error' })
  }
}

const openEditModal = (user: User) => {
  selectedUser.value = user
  editForm.value = { name: user.name, email: user.email, role: user.role }
  showEditModal.value = true
}

const saveUser = async () => {
  if (!selectedUser.value) return

  editLoading.value = true
  try {
    // Update user details
    await $fetch(`/api/admin/users/${selectedUser.value.id}`, {
      method: 'PATCH',
      body: { name: editForm.value.name, email: editForm.value.email }
    })
    // Update role separately via the correct endpoint
    if (editForm.value.role !== selectedUser.value.role) {
      await $fetch(`/api/auth/users/${selectedUser.value.id}/role`, {
        method: 'PATCH',
        body: { userRole: editForm.value.role }
      })
    }
    toast.add({ title: 'User updated', color: 'success' })
    await refresh()
    showEditModal.value = false
  } catch (err: any) {
    toast.add({ title: 'Failed to update user', description: err.data?.statusMessage || 'Please try again', color: 'error' })
  } finally {
    editLoading.value = false
  }
}

const openTeamsModal = (user: User) => {
  selectedUser.value = user
  selectedUserTeams.value = user.teams.map(t => t.id)
  showTeamsModal.value = true
}

const toggleTeam = (teamId: string) => {
  const index = selectedUserTeams.value.indexOf(teamId)
  if (index === -1) {
    selectedUserTeams.value.push(teamId)
  } else {
    selectedUserTeams.value.splice(index, 1)
  }
}

const saveTeams = async () => {
  if (!selectedUser.value) return

  saveTeamsLoading.value = true
  try {
    const currentTeamIds = selectedUser.value.teams.map(t => t.id)
    const teamsToAdd = selectedUserTeams.value.filter(id => !currentTeamIds.includes(id))
    const teamsToRemove = currentTeamIds.filter(id => !selectedUserTeams.value.includes(id))

    for (const teamId of teamsToAdd) {
      await $fetch('/api/admin/team-members', {
        method: 'POST',
        body: { teamId, userIds: [selectedUser.value.id], role: 'member' }
      })
    }

    for (const teamId of teamsToRemove) {
      await $fetch('/api/admin/team-members', {
        method: 'DELETE',
        body: { teamId, userId: selectedUser.value.id }
      })
    }

    await refresh()
    showTeamsModal.value = false
  } catch (err) {
    console.error('Failed to save teams:', err)
  } finally {
    saveTeamsLoading.value = false
  }
}

const toggleUserStatus = async (user: User) => {
  try {
    const newStatus = user.status === 'active' ? false : true
    await $fetch(`/api/auth/users/${user.id}/status`, {
      method: 'PATCH',
      body: { isActive: newStatus }
    })
    user.status = newStatus ? 'active' : 'inactive'
  } catch (err) {
    console.error('Failed to toggle status:', err)
  }
}

const showRemoveModal = ref(false)
const userToRemove = ref<User | null>(null)

const confirmRemoveUser = (u: User) => {
  userToRemove.value = u
  showRemoveModal.value = true
}

const removeUser = async () => {
  if (!userToRemove.value) return

  try {
    await $fetch(`/api/auth/users/${userToRemove.value.id}/status`, {
      method: 'PATCH',
      body: { isActive: false }
    })
    toast.add({ title: `${userToRemove.value.name} has been deactivated`, color: 'success' })
    showRemoveModal.value = false
    userToRemove.value = null
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to remove user', description: err.data?.statusMessage || 'Please try again', color: 'error' })
  }
}

const sendInvites = async () => {
  inviteLoading.value = true
  try {
    const emails = inviteEmails.value.split(',').map(e => e.trim()).filter(Boolean)
    showInviteModal.value = false
    inviteEmails.value = ''
    inviteTitle.value = ''
    inviteRole.value = 'member'
    inviteTeams.value = []
  } finally {
    inviteLoading.value = false
  }
}
</script>
