<script setup lang="ts">
definePageMeta({ middleware: ['role-admin'] })

const toast = useToast()
const { isOwner } = useAuth()

interface Role {
  id: string
  name: string
  slug: string
  description: string | null
  color: string
  icon: string
  isSystem: boolean
  isReadOnly: boolean
  sortOrder: number
  permissionGroups: string[]
  memberCount: number
}

const { data: rolesData, refresh, pending } = useFetch<{ roles: Role[] }>('/api/admin/roles')
const roles = computed(() => rolesData.value?.roles || [])
const systemRoles = computed(() => roles.value.filter(r => r.isSystem))
const customRoles = computed(() => roles.value.filter(r => !r.isSystem))

const selectedRoleId = ref<string | null>(null)
const selectedRole = computed(() => roles.value.find(r => r.id === selectedRoleId.value) || null)

// Auto-select first role
watch(roles, (r) => {
  if (r.length && !selectedRoleId.value) {
    selectedRoleId.value = r[0].id
  }
}, { immediate: true })

// Permission groups definition
const GROUPS = [
  { key: 'ADMIN', label: 'Admin Access', description: 'User management, settings, integrations', icon: 'i-lucide-shield' },
  { key: 'MANAGEMENT', label: 'Management', description: 'Reports, approvals, capacity planning', icon: 'i-lucide-bar-chart-3' },
  { key: 'FINANCE', label: 'Finance', description: 'Invoices, expenses, EOM, rate cards', icon: 'i-lucide-calculator' },
  { key: 'SALES', label: 'Sales', description: 'Quotes, pricing, retainers', icon: 'i-lucide-badge-dollar-sign' },
  { key: 'CLIENTS', label: 'Clients', description: 'Client management, portal, intake', icon: 'i-lucide-handshake' },
  { key: 'CREATIVE', label: 'Creative', description: 'Banner studio, proofs, ad preview', icon: 'i-lucide-palette' },
  { key: 'MEDIA_BUYING', label: 'Media Buying', description: 'Ad spend, social hub, budget tracking', icon: 'i-lucide-megaphone' },
  { key: 'TIME_APPROVALS', label: 'Time Approvals', description: 'Timesheet approval workflow', icon: 'i-lucide-clock' },
  { key: 'AUTOMATION', label: 'Automation', description: 'Board automations, AI automation', icon: 'i-lucide-zap' },
]

// Edit state
const editName = ref('')
const editDescription = ref('')
const editColor = ref('')
const editIcon = ref('')
const editReadOnly = ref(false)
const saving = ref(false)

watch(selectedRole, (role) => {
  if (role) {
    editName.value = role.name
    editDescription.value = role.description || ''
    editColor.value = role.color
    editIcon.value = role.icon
    editReadOnly.value = role.isReadOnly
  }
})

// Toggle a permission group
async function toggleGroup(group: string) {
  if (!selectedRole.value || !isOwner.value) return

  const current = selectedRole.value.permissionGroups || []
  const newGroups = current.includes(group)
    ? current.filter(g => g !== group)
    : [...current, group]

  try {
    await $fetch(`/api/admin/roles/${selectedRole.value.id}`, {
      method: 'PUT',
      body: { permissionGroups: newGroups }
    })
    await refresh()
    toast.add({ title: 'Permissions updated', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to update permissions', description: err.data?.statusMessage, color: 'error' })
  }
}

// Save role details
async function saveRole() {
  if (!selectedRole.value) return
  saving.value = true
  try {
    await $fetch(`/api/admin/roles/${selectedRole.value.id}`, {
      method: 'PUT',
      body: {
        name: selectedRole.value.isSystem ? undefined : editName.value,
        description: editDescription.value,
        color: editColor.value,
        icon: editIcon.value,
        isReadOnly: selectedRole.value.isSystem ? undefined : editReadOnly.value,
      }
    })
    await refresh()
    toast.add({ title: 'Role updated', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Failed to update role', description: err.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}

// Delete role
const showDeleteModal = ref(false)
const deleting = ref(false)

async function deleteRole() {
  if (!selectedRole.value) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/roles/${selectedRole.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Role deleted', color: 'success' })
    selectedRoleId.value = null
    await refresh()
    showDeleteModal.value = false
  } catch (err: any) {
    toast.add({ title: 'Failed to delete role', description: err.data?.statusMessage, color: 'error' })
  } finally {
    deleting.value = false
  }
}

// Create role modal
const showCreateModal = ref(false)
const createForm = ref({
  name: '',
  description: '',
  color: '#6366f1',
  icon: 'i-lucide-user',
  permissionGroups: [] as string[],
  isReadOnly: false,
})
const creating = ref(false)

function toggleCreateGroup(group: string) {
  const idx = createForm.value.permissionGroups.indexOf(group)
  if (idx === -1) {
    createForm.value.permissionGroups.push(group)
  } else {
    createForm.value.permissionGroups.splice(idx, 1)
  }
}

async function createRole() {
  if (!createForm.value.name.trim()) {
    toast.add({ title: 'Role name is required', color: 'error' })
    return
  }
  creating.value = true
  try {
    const result = await $fetch<{ id: string }>('/api/admin/roles', {
      method: 'POST',
      body: createForm.value
    })
    toast.add({ title: 'Role created', color: 'success' })
    showCreateModal.value = false
    createForm.value = { name: '', description: '', color: '#6366f1', icon: 'i-lucide-user', permissionGroups: [], isReadOnly: false }
    await refresh()
    selectedRoleId.value = result.id
  } catch (err: any) {
    toast.add({ title: 'Failed to create role', description: err.data?.statusMessage, color: 'error' })
  } finally {
    creating.value = false
  }
}

// Color presets
const colorPresets = [
  '#dc2626', '#ea580c', '#d97706', '#ca8a04', '#65a30d',
  '#059669', '#0891b2', '#0284c7', '#4f46e5', '#7c3aed',
  '#9333ea', '#c026d3', '#6366f1', '#78716c', '#a8a29e',
]

// Icon options
const iconOptions = [
  { label: 'Crown', value: 'i-lucide-crown' },
  { label: 'Shield', value: 'i-lucide-shield' },
  { label: 'Star', value: 'i-lucide-star' },
  { label: 'Folder', value: 'i-lucide-folder-kanban' },
  { label: 'Handshake', value: 'i-lucide-handshake' },
  { label: 'Palette', value: 'i-lucide-palette' },
  { label: 'Megaphone', value: 'i-lucide-megaphone' },
  { label: 'Clapperboard', value: 'i-lucide-clapperboard' },
  { label: 'Calculator', value: 'i-lucide-calculator' },
  { label: 'Receipt', value: 'i-lucide-receipt' },
  { label: 'Code', value: 'i-lucide-code' },
  { label: 'Dollar', value: 'i-lucide-badge-dollar-sign' },
  { label: 'User', value: 'i-lucide-user' },
  { label: 'Eye', value: 'i-lucide-eye' },
  { label: 'Users', value: 'i-lucide-users' },
  { label: 'Lock', value: 'i-lucide-lock' },
  { label: 'Key', value: 'i-lucide-key' },
  { label: 'Settings', value: 'i-lucide-settings' },
  { label: 'Zap', value: 'i-lucide-zap' },
  { label: 'Heart', value: 'i-lucide-heart' },
]

// Members for selected role
const { data: membersData } = useFetch(() =>
  selectedRoleId.value ? `/api/admin/roles/${selectedRoleId.value}/members` : null,
  { watch: [selectedRoleId] }
)
const roleMembers = computed(() => (membersData.value as any)?.members || [])
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="border-b border-default px-6 py-4 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-highlighted">Roles & Permissions</h1>
        <p class="text-muted mt-1">Create custom roles and manage permission groups</p>
      </div>
      <UButton
        v-if="isOwner"
        color="primary"
        icon="i-lucide-plus"
        size="sm"
        @click="showCreateModal = true"
      >
        Create Role
      </UButton>
    </div>

    <!-- Loading State -->
    <div v-if="pending" class="flex-1 flex items-center justify-center">
      <XfLoader />
    </div>

    <!-- Two-panel layout -->
    <div v-else class="flex-1 flex overflow-hidden">
      <!-- Left panel: Role list -->
      <div class="w-72 border-r border-default overflow-y-auto flex-shrink-0">
        <!-- System Roles -->
        <div class="px-3 pt-3 pb-1">
          <p class="text-xs font-semibold text-muted uppercase tracking-wider px-2">System Roles</p>
        </div>
        <div class="px-3 space-y-1 pb-3">
          <button
            v-for="role in systemRoles"
            :key="role.id"
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
            :class="selectedRoleId === role.id
              ? 'bg-primary/10 ring-1 ring-primary'
              : 'hover:bg-elevated'"
            @click="selectedRoleId = role.id"
          >
            <div
              class="size-8 rounded-lg flex items-center justify-center shrink-0"
              :style="{ backgroundColor: role.color + '20', color: role.color }"
            >
              <UIcon :name="role.icon" class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-highlighted truncate">{{ role.name }}</p>
              <p class="text-xs text-muted">{{ role.memberCount }} member{{ role.memberCount !== 1 ? 's' : '' }}</p>
            </div>
          </button>
        </div>

        <!-- Custom Roles -->
        <div v-if="customRoles.length" class="px-3 pb-1 border-t border-default pt-3">
          <p class="text-xs font-semibold text-muted uppercase tracking-wider px-2">Custom Roles</p>
        </div>
        <div v-if="customRoles.length" class="px-3 space-y-1 pb-3">
          <button
            v-for="role in customRoles"
            :key="role.id"
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
            :class="selectedRoleId === role.id
              ? 'bg-primary/10 ring-1 ring-primary'
              : 'hover:bg-elevated'"
            @click="selectedRoleId = role.id"
          >
            <div
              class="size-8 rounded-lg flex items-center justify-center shrink-0"
              :style="{ backgroundColor: role.color + '20', color: role.color }"
            >
              <UIcon :name="role.icon" class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <p class="text-sm font-medium text-highlighted truncate">{{ role.name }}</p>
                <UBadge label="Custom" size="xs" color="primary" variant="subtle" />
              </div>
              <p class="text-xs text-muted">{{ role.memberCount }} member{{ role.memberCount !== 1 ? 's' : '' }}</p>
            </div>
          </button>
        </div>
      </div>

      <!-- Right panel: Role detail -->
      <div v-if="selectedRole" class="flex-1 overflow-y-auto p-6 space-y-6">
        <!-- Header -->
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-4">
            <div
              class="size-12 rounded-xl flex items-center justify-center"
              :style="{ backgroundColor: selectedRole.color + '20', color: selectedRole.color }"
            >
              <UIcon :name="selectedRole.icon" class="size-6" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-xl font-semibold text-highlighted">{{ selectedRole.name }}</h2>
                <UBadge
                  :label="selectedRole.isSystem ? 'System' : 'Custom'"
                  :color="selectedRole.isSystem ? 'neutral' : 'primary'"
                  variant="subtle"
                  size="xs"
                />
                <UBadge
                  v-if="selectedRole.isReadOnly"
                  label="Read-only"
                  color="warning"
                  variant="subtle"
                  size="xs"
                />
              </div>
              <p class="text-sm text-muted mt-0.5">{{ selectedRole.description || 'No description' }}</p>
            </div>
          </div>
        </div>

        <!-- Role Details -->
        <div v-if="isOwner" class="grid grid-cols-2 gap-4">
          <UFormField :label="selectedRole.isSystem ? 'Name (system role — not editable)' : 'Name'">
            <UInput
              v-model="editName"
              :disabled="selectedRole.isSystem"
              size="sm"
            />
          </UFormField>
          <UFormField label="Description">
            <UInput
              v-model="editDescription"
              size="sm"
            />
          </UFormField>
          <UFormField label="Color">
            <div class="flex items-center gap-2 flex-wrap">
              <button
                v-for="c in colorPresets"
                :key="c"
                class="size-6 rounded-full border-2 transition-all"
                :class="editColor === c ? 'border-primary scale-110' : 'border-transparent'"
                :style="{ backgroundColor: c }"
                @click="editColor = c"
              />
            </div>
          </UFormField>
          <UFormField label="Icon">
            <USelectMenu
              v-model="editIcon"
              :items="iconOptions"
              value-key="value"
              size="sm"
            >
              <template #leading>
                <UIcon :name="editIcon" class="size-4" />
              </template>
            </USelectMenu>
          </UFormField>
        </div>

        <!-- Save / Delete buttons -->
        <div v-if="isOwner" class="flex items-center gap-2">
          <UButton
            color="primary"
            size="sm"
            :loading="saving"
            @click="saveRole"
          >
            Save Changes
          </UButton>
          <UButton
            v-if="!selectedRole.isSystem"
            color="error"
            variant="ghost"
            size="sm"
            icon="i-lucide-trash-2"
            :disabled="selectedRole.memberCount > 0"
            @click="showDeleteModal = true"
          >
            Delete Role
          </UButton>
          <span v-if="!selectedRole.isSystem && selectedRole.memberCount > 0" class="text-xs text-muted">
            Remove all members before deleting
          </span>
        </div>

        <!-- Permission Groups -->
        <div>
          <h3 class="text-sm font-semibold text-highlighted mb-3">Permission Groups</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <button
              v-for="group in GROUPS"
              :key="group.key"
              class="flex items-start gap-3 p-4 rounded-xl border transition-all text-left"
              :class="selectedRole.permissionGroups.includes(group.key)
                ? 'border-primary bg-primary/5'
                : 'border-default hover:border-muted'"
              :disabled="!isOwner"
              @click="toggleGroup(group.key)"
            >
              <div class="mt-0.5">
                <div
                  class="size-8 rounded-lg flex items-center justify-center"
                  :class="selectedRole.permissionGroups.includes(group.key)
                    ? 'bg-primary/10 text-primary'
                    : 'bg-elevated text-muted'"
                >
                  <UIcon :name="group.icon" class="size-4" />
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <p class="text-sm font-medium text-highlighted">{{ group.label }}</p>
                  <UIcon
                    :name="selectedRole.permissionGroups.includes(group.key) ? 'i-lucide-check-circle-2' : 'i-lucide-circle'"
                    class="size-4 shrink-0"
                    :class="selectedRole.permissionGroups.includes(group.key) ? 'text-primary' : 'text-muted'"
                  />
                </div>
                <p class="text-xs text-muted mt-0.5">{{ group.description }}</p>
              </div>
            </button>
          </div>
        </div>

        <!-- Read-only toggle (custom roles only) -->
        <div v-if="!selectedRole.isSystem && isOwner" class="flex items-center gap-3 pt-2">
          <UCheckbox
            v-model="editReadOnly"
            label="Read-only role"
          />
          <span class="text-xs text-muted">Members with this role cannot create or modify data</span>
        </div>

        <!-- Members section -->
        <div>
          <h3 class="text-sm font-semibold text-highlighted mb-3">
            Members with this role
            <span class="text-muted font-normal">({{ selectedRole.memberCount }})</span>
          </h3>
          <div v-if="roleMembers.length" class="flex items-center gap-2 flex-wrap">
            <div
              v-for="member in roleMembers.slice(0, 20)"
              :key="member.id"
              class="flex items-center gap-2 px-3 py-1.5 bg-elevated rounded-full"
            >
              <UAvatar
                :src="member.avatarUrl || undefined"
                :alt="member.name"
                size="2xs"
              />
              <span class="text-sm text-highlighted">{{ member.name }}</span>
            </div>
            <span v-if="roleMembers.length > 20" class="text-sm text-muted">
              +{{ roleMembers.length - 20 }} more
            </span>
          </div>
          <p v-else class="text-sm text-muted">No members assigned to this role</p>
        </div>
      </div>

      <!-- No role selected -->
      <div v-else class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <UIcon name="i-lucide-shield" class="size-12 text-muted mx-auto mb-3" />
          <p class="text-muted">Select a role to manage permissions</p>
        </div>
      </div>
    </div>

    <!-- Create Role Modal -->
    <UModal v-model:open="showCreateModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-highlighted">Create Custom Role</h3>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" @click="showCreateModal = false" />
            </div>
          </template>

          <div class="space-y-4">
            <UFormField label="Name" required>
              <UInput v-model="createForm.name" placeholder="e.g. Senior Designer" />
            </UFormField>

            <UFormField label="Description">
              <UTextarea v-model="createForm.description" placeholder="What this role is for..." :rows="3" />
            </UFormField>

            <UFormField label="Color">
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  v-for="c in colorPresets"
                  :key="c"
                  class="size-6 rounded-full border-2 transition-all"
                  :class="createForm.color === c ? 'border-primary scale-110' : 'border-transparent'"
                  :style="{ backgroundColor: c }"
                  @click="createForm.color = c"
                />
              </div>
            </UFormField>

            <UFormField label="Icon">
              <USelectMenu
                v-model="createForm.icon"
                :items="iconOptions"
                value-key="value"
              >
                <template #leading>
                  <UIcon :name="createForm.icon" class="size-4" />
                </template>
              </USelectMenu>
            </UFormField>

            <UFormField label="Permission Groups">
              <div class="space-y-2">
                <button
                  v-for="group in GROUPS"
                  :key="group.key"
                  class="w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left"
                  :class="createForm.permissionGroups.includes(group.key)
                    ? 'border-primary bg-primary/5'
                    : 'border-default hover:border-muted'"
                  @click="toggleCreateGroup(group.key)"
                >
                  <UIcon
                    :name="createForm.permissionGroups.includes(group.key) ? 'i-lucide-check-square' : 'i-lucide-square'"
                    class="size-4"
                    :class="createForm.permissionGroups.includes(group.key) ? 'text-primary' : 'text-muted'"
                  />
                  <div class="flex-1">
                    <p class="text-sm font-medium text-highlighted">{{ group.label }}</p>
                    <p class="text-xs text-muted">{{ group.description }}</p>
                  </div>
                </button>
              </div>
            </UFormField>

            <div class="flex items-center gap-3">
              <UCheckbox v-model="createForm.isReadOnly" label="Read-only role" />
              <span class="text-xs text-muted">Cannot create or modify data</span>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" color="neutral" @click="showCreateModal = false">Cancel</UButton>
              <UButton color="primary" :loading="creating" @click="createRole">Create Role</UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold text-highlighted">Delete Role</h3>
          </template>
          <p class="text-muted">
            Are you sure you want to delete <strong class="text-highlighted">{{ selectedRole?.name }}</strong>?
            This action cannot be undone.
          </p>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" color="neutral" @click="showDeleteModal = false">Cancel</UButton>
              <UButton color="error" :loading="deleting" @click="deleteRole">Delete</UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
