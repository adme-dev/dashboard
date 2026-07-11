<script setup lang="ts">
import { PERMISSIONS } from '~/utils/permissions'

const props = defineProps<{
  clientId: string
}>()

const toast = useToast()
const { isManager } = useAuth()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

// Fetch assigned team
const teamData = ref<any[]>([])

async function refreshTeam() {
  teamData.value = await apiFetch<any[]>(`/api/agency/clients/${props.clientId}/team`)
}

watch(() => props.clientId, () => {
  refreshTeam()
}, { immediate: true })

const team = computed(() => ((teamData.value as any) || []) as any[])

// Add member form
const showAddForm = ref(false)
const selectedMemberId = ref<string | null>(null)
const selectedRole = ref('support')
const assigning = ref(false)

// Fetch all team members for the dropdown
const allMembersData = ref<any | null>(null)

async function refreshAllMembers() {
  allMembersData.value = await apiFetch<any>('/api/agency/team-members')
}

refreshAllMembers()

const allMembers = computed(() => ((allMembersData.value as any)?.members || []) as any[])

// Filter out already-assigned members
const availableMembers = computed(() => {
  const assignedIds = new Set(team.value.map((t: any) => t.team_member_id))
  return allMembers.value
    .filter((m: any) => !assignedIds.has(m.id))
    .map((m: any) => ({ label: `${m.name} (${m.email})`, value: m.id }))
})

const roleOptions = [
  { label: 'Primary AM', value: 'primary_am' },
  { label: 'Secondary AM', value: 'secondary_am' },
  { label: 'Support', value: 'support' }
]

const getRoleBadgeColor = (role: string): 'success' | 'info' | 'neutral' => {
  switch (role) {
    case 'primary_am': return 'success'
    case 'secondary_am': return 'info'
    default: return 'neutral'
  }
}

const getRoleLabel = (role: string): string => {
  switch (role) {
    case 'primary_am': return 'Primary AM'
    case 'secondary_am': return 'Secondary AM'
    case 'support': return 'Support'
    default: return role
  }
}

const assignMember = async () => {
  if (!selectedMemberId.value) {
    toast.add({ title: 'Please select a team member', color: 'error' })
    return
  }
  assigning.value = true
  try {
    await apiFetch(`/api/agency/clients/${props.clientId}/team`, {
      method: 'POST',
      body: { teamMemberId: selectedMemberId.value, role: selectedRole.value }
    })
    toast.add({ title: 'Team member assigned', color: 'success' })
    showAddForm.value = false
    selectedMemberId.value = null
    selectedRole.value = 'support'
    await refreshTeam()
  } catch (err: any) {
    toast.add({ title: 'Failed to assign member', description: err.data?.message || err.message, color: 'error' })
  } finally {
    assigning.value = false
  }
}

const removeMember = async (memberId: string, memberName: string) => {
  try {
    await apiFetch(`/api/agency/clients/${props.clientId}/team/${memberId}`, {
      method: 'DELETE'
    })
    toast.add({ title: `${memberName} removed from team`, color: 'success' })
    await refreshTeam()
  } catch (err: any) {
    toast.add({ title: 'Failed to remove member', description: err.data?.message || err.message, color: 'error' })
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-users" class="w-5 h-5 text-gray-400" />
          <h3 class="font-semibold">Account Team</h3>
          <UBadge v-if="team.length" variant="subtle" color="neutral" size="xs">
            {{ team.length }}
          </UBadge>
        </div>
        <UButton
          v-if="isManager && !showAddForm"
          label="Add"
          icon="i-lucide-plus"
          variant="outline"
          size="xs"
          @click="showAddForm = true"
        />
      </div>
    </template>

    <!-- Add member form -->
    <div v-if="showAddForm" class="mb-4 p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 space-y-3">
      <USelectMenu
        v-model="selectedMemberId"
        :items="availableMembers"
        placeholder="Select team member..."
        value-key="value"
        class="w-full"
      />
      <USelectMenu
        v-model="selectedRole"
        :items="roleOptions"
        value-key="value"
        class="w-full"
      />
      <div class="flex items-center gap-2">
        <UButton
          label="Assign"
          icon="i-lucide-check"
          size="xs"
          color="primary"
          :loading="assigning"
          @click="assignMember"
        />
        <UButton
          label="Cancel"
          variant="ghost"
          size="xs"
          @click="showAddForm = false"
        />
      </div>
    </div>

    <!-- Team members list -->
    <div class="space-y-3">
      <div
        v-for="member in team"
        :key="member.id"
        class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div class="flex items-center gap-3 min-w-0">
          <UAvatar
            :src="safeMediaUrl(member.member_avatar)"
            :alt="member.member_name"
            size="sm"
          />
          <div class="min-w-0">
            <p class="font-medium text-sm truncate">{{ member.member_name }}</p>
            <p class="text-xs text-gray-500 truncate">{{ member.member_email }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <UBadge :color="getRoleBadgeColor(member.role)" variant="subtle" size="xs">
            {{ getRoleLabel(member.role) }}
          </UBadge>
          <UDropdownMenu
            v-if="isManager"
            :items="[[{
              label: 'Remove',
              icon: 'i-lucide-user-minus',
              color: 'error' as const,
              onSelect: () => removeMember(member.team_member_id, member.member_name)
            }]]"
          >
            <UButton
              icon="i-lucide-more-vertical"
              variant="ghost"
              size="xs"
            />
          </UDropdownMenu>
        </div>
      </div>

      <div v-if="team.length === 0 && !showAddForm" class="text-center text-sm text-gray-500 py-4">
        No team members assigned
      </div>
    </div>
  </UCard>
</template>
