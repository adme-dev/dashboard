<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Teams Management">
        <template #right>
          <UButton
            icon="i-lucide-plus"
            label="Create Team"
            @click="showCreateModal = true"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        <!-- Loading State -->
        <div v-if="pending" class="py-12 text-center">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin mx-auto" />
          <p class="text-gray-500 mt-2">Loading teams...</p>
        </div>

        <!-- Empty State -->
        <UCard v-else-if="!teams || teams.length === 0" class="text-center py-12">
          <UIcon name="i-lucide-users" class="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">No teams yet</h3>
          <p class="text-gray-500 mt-1">Create your first team to get started.</p>
          <UButton
            class="mt-4"
            icon="i-lucide-plus"
            @click="showCreateModal = true"
          >
            Create Team
          </UButton>
        </UCard>

        <!-- Teams Table -->
        <UCard v-else>
          <UTable
            :data="teams"
            :columns="columns"
          >
            <template #name-cell="{ row }">
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-medium"
                  :style="{ backgroundColor: row.original.color || '#6B7280' }"
                >
                  {{ row.original.name.charAt(0).toUpperCase() }}
                </div>
                <span class="font-medium">{{ row.original.name }}</span>
              </div>
            </template>

            <template #members-cell="{ row }">
              <div class="flex items-center gap-1">
                <UIcon name="i-lucide-users" class="w-4 h-4 text-gray-400" />
                <span>{{ row.original.memberCount || 0 }}</span>
              </div>
            </template>

            <template #status-cell="{ row }">
              <UBadge
                :color="row.original.isActive ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ row.original.isActive ? 'Active' : 'Inactive' }}
              </UBadge>
            </template>

            <template #actions-cell="{ row }">
              <UDropdownMenu
                :items="[
                  { label: 'Edit', icon: 'i-lucide-pencil', click: () => editTeam(row.original) },
                  { label: 'Members', icon: 'i-lucide-users', click: () => manageMembers(row.original) },
                  { label: 'Delete', icon: 'i-lucide-trash', color: 'error', click: () => deleteTeam(row.original) }
                ]"
              >
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-more-vertical"
                  size="sm"
                />
              </UDropdownMenu>
            </template>
          </UTable>
        </UCard>
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// Page meta
definePageMeta({
  layout: 'admin',
  middleware: ['auth']
})

// State
const showCreateModal = ref(false)
const toast = useToast()

// Table columns
const columns = [
  { accessorKey: 'name', header: 'Team Name' },
  { accessorKey: 'description', header: 'Description' },
  { accessorKey: 'members', header: 'Members' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'actions', header: '' }
]

// Fetch teams
const { data: teams, pending, refresh } = await useFetch('/api/admin/teams')

// Actions
function editTeam(team: any) {
  console.log('Edit team:', team)
}

function manageMembers(team: any) {
  console.log('Manage members:', team)
}

async function deleteTeam(team: any) {
  if (!confirm(`Are you sure you want to delete "${team.name}"?`)) {
    return
  }
  
  try {
    await $fetch(`/api/admin/teams/${team.id}`, { method: 'DELETE' })
    toast.add({
      title: 'Team deleted',
      color: 'success'
    })
    refresh()
  } catch (error) {
    toast.add({
      title: 'Failed to delete team',
      color: 'error'
    })
  }
}
</script>
