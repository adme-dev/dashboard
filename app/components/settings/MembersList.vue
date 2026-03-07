<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

interface TeamMember {
  id: string
  name: string
  email: string
  jobRole: string | null
  userRole: string
  avatarUrl: string | null
  isActive: boolean
  departments: { id: string; name: string; color: string }[]
}

const props = defineProps<{
  members: TeamMember[]
}>()

const emit = defineEmits<{
  refresh: []
}>()

const toast = useToast()
const { user, isAdmin, isOwner } = useAuth()

// Role options (dynamic from API)
const { data: rolesApiData } = useFetch<{ roles: Array<{ name: string; slug: string }> }>('/api/admin/roles')
const roleOptions = computed(() => {
  if (!rolesApiData.value?.roles) return [{ label: 'Member', value: 'member' }]
  return rolesApiData.value.roles.map(r => ({ label: r.name, value: r.slug }))
})

// Change user role
async function changeRole(member: TeamMember, newRole: string) {
  if (member.userRole === newRole) return

  try {
    await $fetch(`/api/auth/users/${member.id}/role`, {
      method: 'PATCH',
      body: { userRole: newRole }
    })
    toast.add({ title: `Role updated to ${newRole}`, color: 'success' })
    emit('refresh')
  } catch (error: any) {
    toast.add({
      title: 'Failed to update role',
      description: error.data?.statusMessage || 'Please try again',
      color: 'error'
    })
  }
}

// Toggle active status
async function toggleStatus(member: TeamMember) {
  try {
    await $fetch(`/api/auth/users/${member.id}/status`, {
      method: 'PATCH',
      body: { isActive: !member.isActive }
    })
    toast.add({
      title: member.isActive ? 'User deactivated' : 'User activated',
      color: 'success'
    })
    emit('refresh')
  } catch (error: any) {
    toast.add({
      title: 'Failed to update status',
      description: error.data?.statusMessage || 'Please try again',
      color: 'error'
    })
  }
}

// Get dropdown items for a member
function getDropdownItems(member: TeamMember): DropdownMenuItem[] {
  const items: DropdownMenuItem[] = []

  if (isAdmin.value && member.id !== user.value?.id) {
    items.push({
      label: member.isActive ? 'Deactivate user' : 'Activate user',
      icon: member.isActive ? 'i-lucide-user-x' : 'i-lucide-user-check',
      onSelect: () => toggleStatus(member)
    })
  }

  return items
}

// Check if current user can edit this member's role
function canEditRole(member: TeamMember) {
  if (!isAdmin.value) return false
  if (member.id === user.value?.id) return false
  // Owners can edit anyone, admins can't edit owners
  if (isOwner.value) return true
  return member.userRole !== 'owner'
}
</script>

<template>
  <ul role="list" class="divide-y divide-default">
    <li
      v-for="member in members"
      :key="member.id"
      class="flex items-center justify-between gap-3 py-3 px-4 sm:px-6"
      :class="{ 'opacity-50': !member.isActive }"
    >
      <div class="flex items-center gap-3 min-w-0">
        <UAvatar
          :src="member.avatarUrl || undefined"
          :alt="member.name"
          size="md"
        />

        <div class="text-sm min-w-0">
          <div class="flex items-center gap-2">
            <p class="text-highlighted font-medium truncate">
              {{ member.name }}
            </p>
            <UBadge
              v-if="!member.isActive"
              label="Inactive"
              color="neutral"
              size="xs"
            />
            <UBadge
              v-if="member.id === user?.id"
              label="You"
              color="primary"
              variant="subtle"
              size="xs"
            />
          </div>
          <p class="text-muted truncate">
            {{ member.email }}
          </p>
          <div v-if="member.departments?.length" class="flex items-center gap-1 mt-1">
            <span
              v-for="dept in member.departments.slice(0, 2)"
              :key="dept.id"
              class="text-xs px-1.5 py-0.5 rounded"
              :style="{
                backgroundColor: `${dept.color}20`,
                color: dept.color
              }"
            >
              {{ dept.name }}
            </span>
            <span v-if="member.departments.length > 2" class="text-xs text-muted">
              +{{ member.departments.length - 2 }}
            </span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Job Role Badge -->
        <UBadge
          v-if="member.jobRole"
          :label="member.jobRole"
          color="neutral"
          variant="subtle"
          class="hidden sm:inline-flex"
        />

        <!-- User Role Select -->
        <USelect
          v-if="canEditRole(member)"
          :model-value="member.userRole"
          :items="roleOptions"
          value-key="value"
          option-key="value"
          color="neutral"
          @update:model-value="(val) => changeRole(member, val)"
        />
        <UBadge
          v-else
          :label="member.userRole"
          :color="member.userRole === 'owner' ? 'primary' : member.userRole === 'admin' ? 'info' : 'neutral'"
          variant="subtle"
          class="capitalize"
        />

        <!-- Actions Dropdown -->
        <UDropdownMenu
          v-if="getDropdownItems(member).length > 0"
          :items="getDropdownItems(member)"
          :content="{ align: 'end' }"
        >
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
          />
        </UDropdownMenu>
      </div>
    </li>

    <!-- Empty State -->
    <li v-if="!members.length" class="py-8 text-center">
      <UIcon name="i-lucide-users" class="h-12 w-12 text-muted mx-auto mb-2" />
      <p class="text-muted">No members found</p>
    </li>
  </ul>
</template>
