<template>
  <div class="flex-1 min-w-0">
  <UDashboardPanel>
    <UDashboardNavbar title="User management">
      <template #right>
        <UButton
          variant="outline"
          color="neutral"
          icon="i-lucide-users-round"
          to="/admin/teams"
        >
          Manage teams
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-user-plus"
          @click="showInviteModal = true"
        >
          Invite
        </UButton>
      </template>
    </UDashboardNavbar>

    <UDashboardToolbar>
      <template #left>
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
      </template>

      <template #right>
        <span class="text-sm text-muted">
          Showing: {{ filteredUsers.length }} results
        </span>
      </template>
    </UDashboardToolbar>

    <div class="flex-1 overflow-y-auto p-4 sm:p-6">
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
            v-model="row.original.role"
            :items="roleOptions"
            size="xs"
            class="w-28"
            @update:model-value="updateUserRole(row.original.id, $event)"
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
    </UDashboardPanel>

    <!-- Invite Modal -->
    <UModal v-model:open="showInviteModal" title="Invite users">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Email addresses" description="Separate multiple emails with commas">
            <UTextarea
              v-model="inviteEmails"
              placeholder="john@example.com, jane@example.com"
              rows="4"
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
      </template>
      <template #footer>
        <UButton variant="ghost" color="neutral" @click="showInviteModal = false">
          Cancel
        </UButton>
        <UButton color="primary" :loading="inviteLoading" @click="sendInvites">
          Send invites
        </UButton>
      </template>
    </UModal>

    <!-- Edit User Modal -->
    <UModal v-model:open="showEditModal" title="Edit user">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name">
            <UInput v-model="editForm.name" />
          </UFormField>
          <UFormField label="Email">
            <UInput v-model="editForm.email" type="email" />
          </UFormField>
          <UFormField label="Role">
            <USelect v-model="editForm.role" :items="roleOptions" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton variant="ghost" color="neutral" @click="showEditModal = false">
          Cancel
        </UButton>
        <UButton color="primary" :loading="editLoading" @click="saveUser">
          Save changes
        </UButton>
      </template>
    </UModal>

    <!-- Assign Teams Modal -->
    <UModal v-model:open="showTeamsModal" title="Manage teams">
      <template #body>
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
      </template>
      <template #footer>
        <UButton variant="ghost" color="neutral" @click="showTeamsModal = false">
          Cancel
        </UButton>
        <UButton color="primary" :loading="saveTeamsLoading" @click="saveTeams">
          Save
        </UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { h } from 'vue'
import { useAuth } from '~/composables/useAuth'

interface User {
  id: string
  name: string
  email: string
  avatarUrl?: string
  role: 'admin' | 'member' | 'viewer'
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

definePageMeta({ layout: 'admin' })

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

const roleOptions = [
  { label: 'Admin', value: 'admin' },
  { label: 'Member', value: 'member' },
  { label: 'Viewer', value: 'viewer' },
]

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
    onSelect: () => removeUser(user),
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

const updateUserRole = async (userId: string, role: string) => {
  try {
    await $fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: { role }
    })
  } catch (err) {
    console.error('Failed to update role:', err)
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
    await $fetch(`/api/admin/users/${selectedUser.value.id}`, {
      method: 'PATCH',
      body: editForm.value
    })
    await refresh()
    showEditModal.value = false
  } catch (err) {
    console.error('Failed to update user:', err)
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
    await $fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      body: { isActive: newStatus }
    })
    user.status = newStatus ? 'active' : 'inactive'
  } catch (err) {
    console.error('Failed to toggle status:', err)
  }
}

const removeUser = async (user: User) => {
  if (!confirm(`Are you sure you want to remove ${user.name}?`)) return

  try {
    await $fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      body: { isActive: false }
    })
    await refresh()
  } catch (err) {
    console.error('Failed to remove user:', err)
  }
}

const sendInvites = async () => {
  inviteLoading.value = true
  try {
    const emails = inviteEmails.value.split(',').map(e => e.trim()).filter(Boolean)
    console.log('Sending invites to:', emails, 'with title:', inviteTitle.value)
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
