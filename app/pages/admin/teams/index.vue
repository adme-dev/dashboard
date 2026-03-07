<template>
  <div class="flex-1 min-w-0 flex overflow-hidden">
    <!-- Teams Sidebar -->
    <div class="w-64 border-r border-default flex flex-col shrink-0">
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

      <div class="flex-1 overflow-y-auto py-2">
        <div v-if="pending" class="flex justify-center py-4">
          <XfLoader size="sm" />
        </div>
        <div
          v-for="team in filteredSidebarTeams"
          v-else
          :key="team.id"
          class="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-elevated"
          :class="{ 'bg-elevated': selectedTeam?.id === team.id }"
          @click="selectTeam(team)"
        >
          <div
            class="size-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
            :style="{ backgroundColor: team.color }"
          >
            {{ team.name[0] }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">{{ team.name }}</div>
          </div>
          <span class="text-xs text-muted">{{ team.memberCount }}</span>
        </div>
      </div>
    </div>

    <!-- Main Content Panel -->
    <UDashboardPanel>
      <!-- All Teams View -->
      <template v-if="!selectedTeam">
        <UDashboardNavbar title="All teams">
          <template #right>
            <UButton color="primary" icon="i-lucide-plus" @click="showCreateModal = true">
              New team
            </UButton>
          </template>
        </UDashboardNavbar>

        <div class="flex-1 overflow-y-auto p-4 sm:p-6">
          <div v-if="pending" class="flex items-center justify-center min-h-64">
            <XfLoader />
          </div>

          <div v-else-if="teamsError" class="flex items-center justify-center min-h-64">
            <UEmpty
              icon="i-lucide-alert-circle"
              title="Failed to load teams"
              :description="teamsError.message || 'An error occurred'"
              :actions="[{ label: 'Retry', color: 'primary', onClick: () => refreshTeams() }]"
            />
          </div>

          <div v-else-if="teams.length === 0" class="flex items-center justify-center min-h-64">
            <UEmpty
              icon="i-lucide-users-round"
              title="No teams yet"
              description="Create your first team to get started"
              :actions="[{ label: 'New team', icon: 'i-lucide-plus', color: 'primary', onClick: () => showCreateModal = true }]"
            />
          </div>

          <UTable
            v-else
            :data="teams"
            :columns="teamsColumns"
            @select="(_e, row) => selectTeam(row.original)"
          >
            <template #name-cell="{ row }">
              <div class="flex items-center gap-3">
                <div
                  class="size-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  :style="{ backgroundColor: row.original.color }"
                >
                  {{ row.original.name[0] }}
                </div>
                <span class="font-medium">{{ row.original.name }}</span>
                <UBadge v-if="row.original.isSystem" size="xs" variant="subtle" color="primary">System</UBadge>
              </div>
            </template>

            <template #memberCount-cell="{ row }">
              <div class="flex items-center gap-1">
                <UIcon name="i-lucide-users" class="size-4 text-muted" />
                <span>{{ row.original.memberCount || 0 }}</span>
              </div>
            </template>

            <template #actions-cell="{ row }">
              <UDropdownMenu :items="teamActions(row.original)">
                <UButton
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-more-horizontal"
                  size="xs"
                  @click.stop
                />
              </UDropdownMenu>
            </template>
          </UTable>
        </div>
      </template>

      <!-- Single Team View -->
      <template v-else>
        <UDashboardNavbar :title="selectedTeam.name">
          <template #leading>
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-arrow-left"
              size="sm"
              @click="selectedTeam = null"
            />
          </template>
          <template #right>
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
          </template>
        </UDashboardNavbar>

        <UTabs
          v-model="activeTab"
          :items="tabItems"
          variant="link"
          :content="false"
          class="px-4 sm:px-6"
        />

        <!-- Users Tab -->
        <template v-if="activeTab === 'users'">
          <UDashboardToolbar>
            <template #left>
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
            </template>
            <template #right>
              <span class="text-sm text-muted">{{ filteredMembers.length }} members</span>
            </template>
          </UDashboardToolbar>

          <div class="flex-1 overflow-y-auto p-4 sm:p-6">
            <div v-if="membersLoading" class="flex items-center justify-center min-h-64">
              <XfLoader />
            </div>

            <UTable
              v-else-if="filteredMembers.length"
              :data="filteredMembers"
              :columns="membersColumns"
            >
              <template #name-cell="{ row }">
                <UUser
                  :name="row.original.name"
                  :avatar="{ src: row.original.avatarUrl, alt: row.original.name }"
                  size="sm"
                />
              </template>

              <template #role-cell="{ row }">
                <UBadge size="xs" variant="subtle">
                  {{ row.original.role || 'Member' }}
                </UBadge>
              </template>

              <template #actions-cell="{ row }">
                <UDropdownMenu :items="memberActions(row.original)">
                  <UButton
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-more-horizontal"
                    size="xs"
                  />
                </UDropdownMenu>
              </template>
            </UTable>

            <div v-else class="flex items-center justify-center min-h-64">
              <UEmpty
                icon="i-lucide-users"
                :title="memberSearch ? 'No members match your search' : 'No members yet'"
                :description="memberSearch ? undefined : 'Add users to this team'"
                :actions="memberSearch ? undefined : [{ label: 'Add users', icon: 'i-lucide-user-plus', color: 'primary', onClick: () => showAddMembersModal = true }]"
              />
            </div>
          </div>
        </template>

        <!-- Content Tab -->
        <template v-if="activeTab === 'content'">
          <div class="flex-1 overflow-y-auto p-4 sm:p-6">
            <div class="flex items-center justify-center min-h-64">
              <UEmpty
                icon="i-lucide-file-text"
                title="No content assigned"
                description="Assign content to this team"
              />
            </div>
          </div>
        </template>
      </template>
    </UDashboardPanel>

    <!-- Create / Edit Team Modal -->
    <UModal v-model:open="showCreateModal" title="Create new team">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Team name" required>
            <UInput v-model="newTeam.name" placeholder="Enter team name" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="newTeam.description" placeholder="Enter description" rows="3" />
          </UFormField>
          <UFormField label="Color">
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="color in teamColors"
                :key="color"
                class="size-8 rounded-full border-2 transition-all"
                :class="newTeam.color === color ? 'border-highlighted scale-110' : 'border-transparent hover:scale-105'"
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
        <div class="space-y-2 max-h-80 overflow-y-auto">
          <p class="text-sm text-muted mb-2">Select users to add:</p>
          <div
            v-for="user in availableUsers"
            :key="user.id"
            class="flex items-center justify-between p-2 rounded hover:bg-elevated"
          >
            <div class="flex items-center gap-2">
              <UAvatar size="sm" :src="user.avatarUrl" :alt="user.name" />
              <div>
                <div class="text-sm font-medium">{{ user.name }}</div>
                <div class="text-xs text-muted">{{ user.email }}</div>
              </div>
            </div>
            <UCheckbox
              :model-value="selectedUsersToAdd.includes(user.id)"
              @update:model-value="toggleUserToAdd(user.id)"
            />
          </div>
          <div v-if="availableUsers.length === 0" class="py-4 text-center text-muted">
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

const { data: teamsData, pending, refresh: refreshTeams, error: teamsError } = useFetch('/api/admin/teams')
const teams = computed(() => teamsData.value?.teams || [])

const { data: usersData } = useFetch('/api/admin/users')
const allUsers = computed(() => usersData.value?.users || [])

const sidebarSearch = ref('')
const memberSearch = ref('')
const selectedTeam = ref<Team | null>(null)
const activeTab = ref('users')
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

const tabItems = computed(() => [
  { label: 'Users', value: 'users', badge: members.value.length },
  { label: 'Content', value: 'content', badge: 0 },
])

const teamsColumns = [
  { accessorKey: 'name', header: 'Team Name', meta: { class: { th: 'w-full', td: 'w-full' } } },
  { accessorKey: 'memberCount', header: 'Members' },
  { id: 'actions', header: '' },
]

const membersColumns = [
  { accessorKey: 'name', header: 'Name', meta: { class: { th: 'w-full', td: 'w-full' } } },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'role', header: 'Role' },
  { id: 'actions', header: '' },
]

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
  activeTab.value = 'users'
  await loadMembers(team.id)
}

const loadMembers = async (teamId: string) => {
  membersLoading.value = true
  try {
    const data = await $fetch(`/api/admin/teams/${teamId}/members`)
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
  if (team.isSystem) return
  if (!confirm(`Are you sure you want to delete "${team.name}"?`)) return

  try {
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
