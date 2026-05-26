<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- Header -->
    <div class="bg-white border-b px-6 py-4">
      <h1 class="text-2xl font-semibold">Teams</h1>
      <p class="text-gray-500 mt-1">
        Organize your account users into teams and assign them to content.
        <ULink href="#" class="text-blue-600 hover:underline">Learn more</ULink>
      </p>
    </div>

    <div class="flex-1 flex overflow-hidden">
      <!-- Sidebar -->
      <div class="w-72 bg-white border-r flex flex-col">
        <!-- New Team Button -->
        <div class="p-4 border-b">
          <UButton block color="primary" variant="soft" icon="i-lucide-plus" @click="showCreateModal = true">
            New team
          </UButton>
        </div>

        <!-- Search -->
        <div class="p-3">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Search teams"
            size="sm"
          />
        </div>

        <!-- Team List -->
        <div class="flex-1 overflow-y-auto">
          <button
            v-for="team in filteredTeams"
            :key="team.id"
            class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
            :class="{ 'bg-blue-50 border-r-2 border-blue-500': selectedTeam?.id === team.id }"
            @click="selectedTeam = team"
          >
            <div 
              class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              :style="{ backgroundColor: team.color + '20' }"
            >
              <UIcon :name="team.icon" class="w-4 h-4" :style="{ color: team.color }" />
            </div>
            <span class="flex-1 truncate text-sm">{{ team.name }}</span>
            <span class="text-xs text-gray-400">{{ team.member_count }}</span>
          </button>
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 overflow-auto p-6">
        <div v-if="!selectedTeam" class="h-full flex items-center justify-center text-gray-400">
          <div class="text-center">
            <UIcon name="i-lucide-users" class="w-12 h-12 mx-auto mb-3" />
            <p>Select a team to view members</p>
          </div>
        </div>

        <div v-else>
          <!-- Team Header -->
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <div 
                class="w-10 h-10 rounded-full flex items-center justify-center"
                :style="{ backgroundColor: selectedTeam.color + '20' }"
              >
                <UIcon :name="selectedTeam.icon" class="w-5 h-5" :style="{ color: selectedTeam.color }" />
              </div>
              <div>
                <h2 class="text-xl font-semibold">{{ selectedTeam.name }}</h2>
                <p class="text-sm text-gray-500">{{ selectedTeam.member_count }} members</p>
              </div>
            </div>
            
            <div class="flex items-center gap-2">
              <UButton
                v-if="!selectedTeam.is_system"
                variant="ghost"
                color="neutral"
                icon="i-lucide-pencil"
                @click="editTeam(selectedTeam)"
              >
                Edit
              </UButton>
              <UButton
                v-if="!selectedTeam.is_system"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="deleteTeam(selectedTeam)"
              >
                Delete
              </UButton>
            </div>
          </div>

          <!-- Description -->
          <p v-if="selectedTeam.description" class="text-gray-600 mb-6">
            {{ selectedTeam.description }}
          </p>

          <!-- Members Section -->
          <div class="bg-white rounded-lg border">
            <div class="px-4 py-3 border-b flex items-center justify-between">
              <h3 class="font-medium">Members</h3>
              <UButton size="xs" color="primary" variant="soft" icon="i-lucide-plus" @click="addMember">
                Add member
              </UButton>
            </div>

            <!-- Members List -->
            <div class="divide-y">
              <div
                v-for="member in teamMembers"
                :key="member.id"
                class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
              >
                <UAvatar :src="member.avatar_url || undefined" :alt="member.name" size="sm" />
                <div class="flex-1">
                  <div class="text-sm font-medium">{{ member.name }}</div>
                  <div class="text-xs text-gray-500">{{ member.email }}</div>
                </div>
                <UBadge v-if="member.role === 'admin'" color="primary" variant="soft" size="xs">
                  Admin
                </UBadge>
                <UButton
                  v-if="!selectedTeam.is_system"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  icon="i-lucide-x"
                  @click="removeMember(member)"
                />
              </div>
            </div>

            <div v-if="teamMembers.length === 0" class="px-4 py-8 text-center text-gray-500">
              <UIcon name="i-lucide-users" class="w-8 h-8 mx-auto mb-2" />
              <p class="text-sm">No members yet</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Team Confirm Modal -->
    <UModal v-model:open="showDeleteTeamConfirm">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-2">Delete team</h3>
          <p class="text-sm text-muted mb-4">Are you sure you want to delete "{{ teamToDelete?.name }}"?</p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="showDeleteTeamConfirm = false">Cancel</UButton>
            <UButton color="error" @click="onConfirmDeleteTeam">Delete</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Remove Member Confirm Modal -->
    <UModal v-model:open="showRemoveMemberConfirm">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-2">Remove member</h3>
          <p class="text-sm text-muted mb-4">Remove {{ memberToRemove?.name }} from this team?</p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="showRemoveMemberConfirm = false">Cancel</UButton>
            <UButton color="error" @click="onConfirmRemoveMember">Remove</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Create Team Modal -->
    <UModal v-model:open="showCreateModal" title="Create New Team">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Team Name" required>
            <UInput v-model="newTeam.name" placeholder="e.g., Design Team" class="w-full" />
          </UFormField>
          
          <UFormField label="Description">
            <UTextarea v-model="newTeam.description" placeholder="What this team does..." :rows="2" />
          </UFormField>
          
          <UFormField label="Color">
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="color in teamColors"
                :key="color"
                class="w-8 h-8 rounded-full border-2 transition-all"
                :class="newTeam.color === color ? 'border-gray-900 scale-110' : 'border-transparent'"
                :style="{ backgroundColor: color }"
                @click="newTeam.color = color"
              />
            </div>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="showCreateModal = false">Cancel</UButton>
        <UButton color="primary" :disabled="!newTeam.name" @click="createTeam">
          Create Team
        </UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
interface Team {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string
  color: string
  is_system: boolean
  member_count: number
}

interface TeamMember {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: 'admin' | 'member'
}

definePageMeta({})

const searchQuery = ref('')
const selectedTeam = ref<Team | null>(null)
const showCreateModal = ref(false)
const showDeleteTeamConfirm = ref(false)
const showRemoveMemberConfirm = ref(false)
const teamToDelete = ref<Team | null>(null)
const memberToRemove = ref<TeamMember | null>(null)

const { data: teams, refresh } = await useFetch<{ teams: Team[] }>('/api/teams')

const filteredTeams = computed(() => {
  if (!searchQuery.value) return teams.value?.teams || []
  const query = searchQuery.value.toLowerCase()
  return teams.value?.teams.filter(t => 
    t.name.toLowerCase().includes(query)
  ) || []
})

const teamMembers = ref<TeamMember[]>([])

// Fetch members when team is selected
watch(selectedTeam, async (team) => {
  if (!team) {
    teamMembers.value = []
    return
  }
  
  const { data } = await useFetch(`/api/teams/${team.id}/members`)
  teamMembers.value = data.value?.members || []
})

const teamColors = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F59E0B', // Orange
  '#10B981', // Green
  '#EF4444', // Red
  '#6366F1', // Indigo
  '#14B8A6', // Teal
]

const newTeam = ref({
  name: '',
  description: '',
  color: '#3B82F6',
  icon: 'i-lucide-users'
})

const createTeam = async () => {
  try {
    await $fetch('/api/teams', {
      method: 'POST',
      body: newTeam.value
    })
    showCreateModal.value = false
    newTeam.value = { name: '', description: '', color: '#3B82F6', icon: 'i-lucide-users' }
    refresh()
  } catch (err) {
    console.error('Failed to create team:', err)
  }
}

const editTeam = (team: Team) => {
  // TODO: Implement edit
}

const deleteTeam = (team: Team) => {
  teamToDelete.value = team
  showDeleteTeamConfirm.value = true
}

const onConfirmDeleteTeam = async () => {
  const team = teamToDelete.value
  if (!team) return
  showDeleteTeamConfirm.value = false

  try {
    await $fetch(`/api/teams/${team.id}`, { method: 'DELETE' })
    selectedTeam.value = null
    refresh()
  } catch (err) {
    console.error('Failed to delete team:', err)
  } finally {
    teamToDelete.value = null
  }
}

const addMember = () => {
  // TODO: Open member selection modal
}

const removeMember = (member: TeamMember) => {
  memberToRemove.value = member
  showRemoveMemberConfirm.value = true
}

const onConfirmRemoveMember = async () => {
  const member = memberToRemove.value
  if (!member) return
  showRemoveMemberConfirm.value = false

  try {
    await $fetch(`/api/teams/${selectedTeam.value?.id}/members/${member.id}`, {
      method: 'DELETE'
    })
    // Refresh members
    const { data } = await useFetch(`/api/teams/${selectedTeam.value?.id}/members`)
    teamMembers.value = data.value?.members || []
  } catch (err) {
    console.error('Failed to remove member:', err)
  } finally {
    memberToRemove.value = null
  }
}
</script>
