<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- Header -->
    <div class="bg-white border-b px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold">Teams</h1>
          <p class="text-gray-500 mt-1">
            Organize your account users into teams and assign them to content.
          </p>
        </div>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden">
      <!-- Left Sidebar -->
      <div class="w-64 bg-white border-r flex flex-col">
        <div class="p-4">
          <UButton
            color="primary"
            variant="outline"
            icon="i-lucide-plus"
            class="w-full justify-center"
            @click="showCreateModal = true"
          >
            New team
          </UButton>
        </div>

        <div class="px-4 pb-2">
          <UInput
            v-model="sidebarSearch"
            icon="i-lucide-search"
            placeholder="Search teams"
            size="sm"
          />
        </div>

        <div class="flex-1 overflow-auto py-2">
          <div
            v-for="team in filteredSidebarTeams"
            :key="team.id"
            class="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-100"
            :class="{ 'bg-blue-50': selectedTeam?.id === team.id }"
            @click="selectTeam(team)"
          >
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
              :style="{ backgroundColor: team.color }"
            >
              {{ team.name[0] }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm truncate">{{ team.name }}</div>
            </div>
            <span class="text-xs text-gray-500">{{ team.memberCount }}</span>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Loading State -->
        <div v-if="pending" class="flex-1 flex items-center justify-center">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
        </div>

        <!-- Error State -->
        <div v-else-if="teamsError" class="flex-1 flex flex-col items-center justify-center p-6">
          <UIcon name="i-lucide-alert-circle" class="w-12 h-12 text-red-500 mb-4" />
          <h3 class="text-lg font-medium text-gray-900">Failed to load teams</h3>
          <p class="text-gray-500 mt-1">{{ teamsError.message || 'An error occurred' }}</p>
          <UButton class="mt-4" color="primary" @click="refreshTeams()">Retry</UButton>
        </div>

        <!-- All Teams View -->
        <div v-else-if="!selectedTeam" class="flex-1 overflow-auto p-6">
          <UCard>
            <template #header>
              <h3 class="font-semibold">All teams</h3>
            </template>

            <table class="w-full">
              <thead class="bg-gray-50 border-b">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Members</th>
                  <th class="w-8 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr
                  v-for="team in teams"
                  :key="team.id"
                  class="hover:bg-gray-50 cursor-pointer"
                  @click="selectTeam(team)"
                >
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                      <div
                        class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                        :style="{ backgroundColor: team.color }"
                      >
                        {{ team.name[0] }}
                      </div>
                      <span class="font-medium">{{ team.name }}</span>
                      <UBadge v-if="team.isSystem" size="xs" variant="subtle" color="primary">System</UBadge>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-600">{{ team.memberCount }}</td>
                  <td class="px-4 py-3">
                    <UDropdownMenu :items="teamActions(team)">
                      <UButton
                        variant="ghost"
                        color="neutral"
                        icon="i-lucide-more-horizontal"
                        size="xs"
                        @click.stop
                      />
                    </UDropdownMenu>
                  </td>
                </tr>
              </tbody>
            </table>

            <div v-if="teams.length === 0" class="py-12 text-center text-gray-500">
              <UIcon name="i-lucide-users-round" class="w-12 h-12 mx-auto mb-3" />
              <p>No teams found</p>
            </div>
          </UCard>
        </div>

        <!-- Single Team View -->
        <div v-else class="flex-1 flex flex-col overflow-hidden">
          <!-- Team Header -->
          <div class="bg-white border-b px-6 py-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-4">
                <UButton
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-arrow-left"
                  size="sm"
                  @click="selectedTeam = null"
                />
                <div
                  class="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white"
                  :style="{ backgroundColor: selectedTeam.color }"
                >
                  {{ selectedTeam.name[0] }}
                </div>
                <div>
                  <h2 class="text-xl font-semibold">{{ selectedTeam.name }}</h2>
                  <p class="text-sm text-gray-500">{{ selectedTeam.memberCount }} members</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-pencil"
                  size="sm"
                  @click="editTeam(selectedTeam)"
                >
                  Edit
                </UButton>
                <UDropdownMenu :items="teamActions(selectedTeam)">
                  <UButton
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-more-horizontal"
                    size="sm"
                  />
                </UDropdownMenu>
              </div>
            </div>

            <!-- Tabs -->
            <div class="flex gap-6 mt-4">
              <button
                class="pb-2 text-sm font-medium border-b-2 transition-colors"
                :class="activeTab === 'users' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'"
                @click="activeTab = 'users'"
              >
                Users: {{ members.length }}
              </button>
              <button
                class="pb-2 text-sm font-medium border-b-2 transition-colors"
                :class="activeTab === 'content' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'"
                @click="activeTab = 'content'"
              >
                Content: 0
              </button>
            </div>
          </div>

          <!-- Members List -->
          <div v-if="activeTab === 'users'" class="flex-1 overflow-auto p-6">
            <div class="flex items-center gap-3 mb-4">
              <UInput
                v-model="memberSearch"
                icon="i-lucide-search"
                placeholder="Search by name or email"
                class="w-80"
                size="sm"
              />
              <UButton
                color="primary"
                icon="i-lucide-user-plus"
                @click="showAddMembersModal = true"
              >
                Add users
              </UButton>
            </div>

            <UCard>
              <table class="w-full">
                <thead class="bg-gray-50 border-b">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th class="w-8 px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody class="divide-y">
                  <tr
                    v-for="member in filteredMembers"
                    :key="member.id"
                    class="hover:bg-gray-50 group"
                  >
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3">
                        <UAvatar
                          :src="member.avatarUrl"
                          :alt="member.name"
                          size="sm"
                        />
                        <span class="font-medium">{{ member.name }}</span>
                        <UIcon
                          v-if="member.isAdmin"
                          name="i-lucide-crown"
                          class="w-4 h-4 text-amber-500"
                          title="Team Admin"
                        />
                      </div>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-600">{{ member.email }}</td>
                    <td class="px-4 py-3 text-sm text-gray-600">{{ member.title || '-' }}</td>
                    <td class="px-4 py-3">
                      <UBadge size="xs" variant="subtle">
                        {{ member.role || 'Member' }}
                      </UBadge>
                    </td>
                    <td class="px-4 py-3">
                      <UDropdownMenu :items="memberActions(member)">
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

              <div v-if="filteredMembers.length === 0" class="py-12 text-center text-gray-500">
                <UIcon name="i-lucide-users" class="w-12 h-12 mx-auto mb-3" />
                <p>No members found</p>
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Team Modal -->
    <UModal v-model:open="showCreateModal" title="Create new team">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Team name" required>
            <UInput v-model="newTeam.name" placeholder="Enter team name" class="w-full" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="newTeam.description" placeholder="Enter description" rows="3" />
          </UFormField>
          <UFormField label="Color">
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="color in teamColors"
                :key="color"
                class="w-8 h-8 rounded-full border-2 transition-all"
                :class="newTeam.color === color ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'"
                :style="{ backgroundColor: color }"
                @click="newTeam.color = color"
              />
            </div>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton variant="ghost" color="neutral" @click="showCreateModal = false">
          Cancel
        </UButton>
        <UButton color="primary" :loading="createLoading" :disabled="!newTeam.name" @click="createTeam">
          Create team
        </UButton>
      </template>
    </UModal>

    <!-- Add Members Modal -->
    <UModal v-model:open="showAddMembersModal" title="Add users to team">
      <template #body>
        <div class="space-y-2 max-h-80 overflow-auto">
          <div class="text-sm text-gray-500 mb-2">Select users to add:</div>
          <div
            v-for="user in availableUsers"
            :key="user.id"
            class="flex items-center justify-between p-2 rounded hover:bg-gray-50"
          >
            <div class="flex items-center gap-2">
              <UAvatar size="sm" :src="user.avatarUrl" :alt="user.name" />
              <div>
                <div class="font-medium text-sm">{{ user.name }}</div>
                <div class="text-xs text-gray-500">{{ user.email }}</div>
              </div>
            </div>
            <UCheckbox
              :model-value="selectedUsersToAdd.includes(user.id)"
              @update:model-value="toggleUserToAdd(user.id)"
            />
          </div>
          <div v-if="availableUsers.length === 0" class="py-4 text-center text-gray-500">
            All users are already in this team
          </div>
        </div>
      </template>
      <template #footer>
        <UButton variant="ghost" color="neutral" @click="showAddMembersModal = false">
          Cancel
        </UButton>
        <UButton color="primary" :disabled="selectedUsersToAdd.length === 0" @click="addMembers">
          Add {{ selectedUsersToAdd.length }} user{{ selectedUsersToAdd.length !== 1 ? 's' : '' }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
interface Team {
  id: string
  name: string
  color: string
  icon: string
  isSystem: boolean
  memberCount: number
  description?: string
}

interface TeamMember {
  id: string
  name: string
  email: string
  avatarUrl?: string
  title?: string
  role?: string
  isAdmin: boolean
}

interface User {
  id: string
  name: string
  email: string
  avatarUrl?: string
}

definePageMeta({ layout: 'admin' })

// Fetch teams from API
const { data: teamsData, pending, refresh: refreshTeams, error: teamsError } = await useFetch('/api/admin/teams')
const teams = computed(() => teamsData.value?.teams || [])

// Fetch all users for add members modal
const { data: usersData, error: usersError2 } = await useFetch('/api/admin/users')
const allUsers = computed(() => usersData.value?.users || [])

// Debug logging
if (process.client) {
  watch(teamsData, (val) => {
    console.log('Teams data loaded:', val?.teams?.length || 0, 'teams')
  }, { immediate: true })
  watch(usersData, (val) => {
    console.log('Users data loaded:', val?.users?.length || 0, 'users')
  }, { immediate: true })
}

const sidebarSearch = ref('')
const memberSearch = ref('')
const selectedTeam = ref<Team | null>(null)
const activeTab = ref<'users' | 'content'>('users')
const showCreateModal = ref(false)
const showAddMembersModal = ref(false)
const createLoading = ref(false)
const members = ref<TeamMember[]>([])
const membersLoading = ref(false)
const selectedUsersToAdd = ref<string[]>([])

const newTeam = ref({
  name: '',
  description: '',
  color: '#3B82F6',
})

const teamColors = ['#3B82F6', '#EC4899', '#F97316', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#6366F1', '#14B8A6', '#84CC16']

const filteredSidebarTeams = computed(() => {
  if (!sidebarSearch.value) return teams.value
  const query = sidebarSearch.value.toLowerCase()
  return teams.value.filter((t: Team) => t.name.toLowerCase().includes(query))
})

const filteredMembers = computed(() => {
  if (!memberSearch.value) return members.value
  const query = memberSearch.value.toLowerCase()
  return members.value.filter((m: TeamMember) =>
    m.name.toLowerCase().includes(query) ||
    m.email.toLowerCase().includes(query)
  )
})

const availableUsers = computed(() => {
  const memberIds = new Set(members.value.map(m => m.id))
  return allUsers.value.filter((u: User) => !memberIds.has(u.id))
})

const teamActions = (team: Team) => [
  [{
    label: 'Edit',
    icon: 'i-lucide-pencil',
    onSelect: () => editTeam(team),
  }],
  [{
    label: 'Delete',
    icon: 'i-lucide-trash',
    color: 'error' as const,
    onSelect: () => deleteTeam(team),
  }],
]

const memberActions = (member: TeamMember) => [
  [{
    label: member.isAdmin ? 'Remove admin' : 'Make admin',
    icon: 'i-lucide-crown',
    onSelect: () => toggleAdmin(member),
  }],
  [{
    label: 'Remove from team',
    icon: 'i-lucide-user-x',
    onSelect: () => removeFromTeam(member),
  }],
]

const selectTeam = async (team: Team) => {
  selectedTeam.value = team
  memberSearch.value = ''
  await loadMembers(team.id)
}

const loadMembers = async (teamId: string) => {
  membersLoading.value = true
  try {
    const data = await $fetch(`/api/admin/teams/${teamId}/members`, {
      // Use the correct path - Nitro will match [teamId]
    })
    members.value = data.members || []
  } catch (err) {
    console.error('Failed to load members:', err)
    members.value = []
  } finally {
    membersLoading.value = false
  }
}

const editTeam = (team: Team) => {
  newTeam.value = {
    name: team.name,
    description: team.description || '',
    color: team.color,
  }
  showCreateModal.value = true
}

const deleteTeam = async (team: Team) => {
  if (team.isSystem) {
    alert('System teams cannot be deleted')
    return
  }
  if (!confirm(`Are you sure you want to delete "${team.name}"?`)) return
  
  try {
    // TODO: Implement delete API
    await refreshTeams()
    if (selectedTeam.value?.id === team.id) {
      selectedTeam.value = null
    }
  } catch (err) {
    console.error('Failed to delete team:', err)
  }
}

const createTeam = async () => {
  if (!newTeam.value.name) return
  
  createLoading.value = true
  try {
    await $fetch('/api/admin/teams', {
      method: 'POST',
      body: {
        name: newTeam.value.name,
        description: newTeam.value.description,
        color: newTeam.value.color,
      }
    })
    await refreshTeams()
    showCreateModal.value = false
    newTeam.value = { name: '', description: '', color: '#3B82F6' }
  } catch (err) {
    console.error('Failed to create team:', err)
  } finally {
    createLoading.value = false
  }
}

const toggleUserToAdd = (userId: string) => {
  const index = selectedUsersToAdd.value.indexOf(userId)
  if (index === -1) {
    selectedUsersToAdd.value.push(userId)
  } else {
    selectedUsersToAdd.value.splice(index, 1)
  }
}

const addMembers = async () => {
  if (!selectedTeam.value || selectedUsersToAdd.value.length === 0) return
  
  try {
    await $fetch('/api/admin/team-members', {
      method: 'POST',
      body: {
        teamId: selectedTeam.value.id,
        userIds: selectedUsersToAdd.value,
        role: 'member'
      }
    })
    
    // Refresh
    selectedTeam.value.memberCount += selectedUsersToAdd.value.length
    await loadMembers(selectedTeam.value.id)
    await refreshTeams()
    
    selectedUsersToAdd.value = []
    showAddMembersModal.value = false
  } catch (err) {
    console.error('Failed to add members:', err)
  }
}

const toggleAdmin = async (member: TeamMember) => {
  // TODO: Implement admin toggle API
  member.isAdmin = !member.isAdmin
}

const removeFromTeam = async (member: TeamMember) => {
  if (!selectedTeam.value) return
  if (!confirm(`Remove ${member.name} from ${selectedTeam.value.name}?`)) return
  
  try {
    await $fetch('/api/admin/team-members', {
      method: 'DELETE',
      body: {
        teamId: selectedTeam.value.id,
        userId: member.id
      }
    })
    
    selectedTeam.value.memberCount--
    await loadMembers(selectedTeam.value.id)
    await refreshTeams()
  } catch (err) {
    console.error('Failed to remove member:', err)
  }
}
</script>
