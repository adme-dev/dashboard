<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- Header -->
    <div class="bg-white border-b px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold">User management</h1>
          <p class="text-gray-500 mt-1">
            Manage your team members, their roles, and permissions
          </p>
        </div>
        <div class="flex items-center gap-3">
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
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-white border-b px-6 py-3">
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
      <div class="mt-2 text-sm text-gray-500">
        Showing: {{ filteredUsers.length }} results
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="pending" class="flex-1 flex items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <!-- Error State -->
    <div v-else-if="usersError" class="flex-1 flex flex-col items-center justify-center p-6">
      <UIcon name="i-lucide-alert-circle" class="w-12 h-12 text-red-500 mb-4" />
      <h3 class="text-lg font-medium text-gray-900">Failed to load users</h3>
      <p class="text-gray-500 mt-1">{{ usersError.message || 'An error occurred' }}</p>
      <UButton class="mt-4" color="primary" @click="refresh()">Retry</UButton>
    </div>

    <!-- Empty State - No Users -->
    <div v-else-if="users.length === 0" class="flex-1 flex flex-col items-center justify-center p-6">
      <UIcon name="i-lucide-users" class="w-16 h-16 text-gray-300 mb-4" />
      <h3 class="text-lg font-medium text-gray-900">No users found</h3>
      <p class="text-gray-500 mt-1">Get started by inviting your team members</p>
      <UButton class="mt-4" color="primary" icon="i-lucide-user-plus" @click="showInviteModal = true">
        Invite users
      </UButton>
    </div>

    <!-- Users Table -->
    <div v-else class="flex-1 overflow-auto p-6">
      <UCard class="overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-50 border-b">
            <tr>
              <th class="w-8 px-4 py-3">
                <UCheckbox />
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User role</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teams</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
              <th class="w-8 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr
              v-for="user in filteredUsers"
              :key="user.id"
              class="hover:bg-gray-50 group"
            >
              <td class="px-4 py-3">
                <UCheckbox />
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <UAvatar
                    :src="user.avatarUrl"
                    :alt="user.name"
                    size="sm"
                  />
                  <span class="font-medium">{{ user.name }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ user.email }}</td>
              <td class="px-4 py-3">
                <USelect
                  v-model="user.role"
                  :items="roleOptions"
                  size="xs"
                  class="w-28"
                  @update:model-value="updateUserRole(user.id, $event)"
                />
              </td>
              <td class="px-4 py-3">
                <UBadge
                  :color="user.status === 'active' ? 'success' : 'neutral'"
                  variant="subtle"
                  size="xs"
                >
                  {{ user.status }}
                </UBadge>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-1">
                  <UAvatarGroup size="xs" :max="3">
                    <UTooltip
                      v-for="team in user.teams.slice(0, 3)"
                      :key="team.id"
                      :text="team.name"
                    >
                      <UAvatar
                        :alt="team.name[0]"
                        size="xs"
                      />
                    </UTooltip>
                  </UAvatarGroup>
                  <span v-if="user.teams.length > 3" class="text-xs text-gray-500">
                    +{{ user.teams.length - 3 }}
                  </span>
                  <UButton
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-plus"
                    size="xs"
                    class="opacity-0 group-hover:opacity-100"
                    @click="openTeamsModal(user)"
                  />
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ formatDate(user.joinedAt) }}</td>
              <td class="px-4 py-3">
                <UDropdownMenu :items="userActions(user)">
                  <UButton
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-more-horizontal"
                    size="xs"
                  />
                </UDropdownMenu>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="filteredUsers.length === 0" class="py-12 text-center text-gray-500">
          <UIcon name="i-lucide-users" class="w-12 h-12 mx-auto mb-3" />
          <p>{{ searchQuery ? 'No users match your search' : 'No users found' }}</p>
        </div>
      </UCard>
    </div>

    <!-- Invite Modal -->
    <UModal v-model:open="showInviteModal" title="Invite users">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Email addresses" description="Separate multiple emails with commas">
            <UTextarea
              v-model="inviteEmails"
              placeholder="john@example.com, jane@example.com"
              rows="4"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Title">
            <UInput
              v-model="inviteTitle"
              placeholder="e.g. Creative Director"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Role">
            <USelect
              v-model="inviteRole"
              :items="roleOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Teams">
            <USelect
              v-model="inviteTeams"
              :items="availableTeams"
              multiple
              class="w-full"
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

    <!-- Assign Teams Modal -->
    <UModal v-model:open="showTeamsModal" title="Manage teams">
      <template #body>
        <div v-if="teamsLoading" class="py-8 text-center">
          <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin mx-auto" />
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="team in availableTeams"
            :key="team.value"
            class="flex items-center justify-between p-2 rounded hover:bg-gray-50"
          >
            <div class="flex items-center gap-2">
              <div
                class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
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

// Wait for auth check before fetching
const isAuthChecked = ref(false)

onMounted(async () => {
  await fetchUser()
  isAuthChecked.value = true
})

// Only fetch users after auth is confirmed
const { data: usersData, pending, refresh, error: usersError } = useFetch('/api/admin/users', {
  immediate: false,
  server: false
})

// Watch for auth and then fetch
watch(isAuthChecked, (checked) => {
  if (checked && isAuthenticated.value) {
    refresh()
  }
}, { immediate: true })

const users = computed(() => usersData.value?.users || [])
if (process.client) {
  watch(usersData, (val) => {
    console.log('Users data loaded:', val?.users?.length || 0, 'users')
  }, { immediate: true })
}

// Fetch teams for dropdown
const { data: teamsData } = await useFetch('/api/admin/teams')
const teams = computed(() => teamsData.value?.teams || [])

const searchQuery = ref('')
const showInviteModal = ref(false)
const showTeamsModal = ref(false)
const inviteLoading = ref(false)
const saveTeamsLoading = ref(false)
const teamsLoading = ref(false)
const inviteEmails = ref('')
const inviteTitle = ref('')
const inviteRole = ref('member')
const inviteTeams = ref<string[]>([])
const selectedUser = ref<User | null>(null)
const selectedUserTeams = ref<string[]>([])

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

const userActions = (user: User) => [
  [{
    label: 'Edit user',
    icon: 'i-lucide-pencil',
    to: `/admin/users/${user.id}`,
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
    // Calculate teams to add and remove
    const currentTeamIds = selectedUser.value.teams.map(t => t.id)
    const teamsToAdd = selectedUserTeams.value.filter(id => !currentTeamIds.includes(id))
    const teamsToRemove = currentTeamIds.filter(id => !selectedUserTeams.value.includes(id))

    // Add new memberships
    for (const teamId of teamsToAdd) {
      await $fetch('/api/admin/team-members', {
        method: 'POST',
        body: { teamId, userIds: [selectedUser.value.id], role: 'member' }
      })
    }

    // Remove memberships
    for (const teamId of teamsToRemove) {
      await $fetch('/api/admin/team-members', {
        method: 'DELETE',
        body: { teamId, userId: selectedUser.value.id }
      })
    }

    // Refresh users data
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
    // TODO: Implement invite API
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
