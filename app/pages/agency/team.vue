<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({
  title: 'Team Members',
  middleware: ['auth']
})

type TeamMember = {
  id: string
  name: string
  email: string
  role?: string | null
  department?: string | null
  hourlyRate: number
  hourlyCost: number
  targetUtilization: number
  avatarUrl?: string | null
  isActive: boolean
  hoursThisMonth: number
  billableHoursThisMonth: number
  utilizationRate: number
  activeProjects: number
  createdAt?: string
}

type TeamMembersResponse = {
  members?: Array<Partial<TeamMember>>
  summary?: {
    total: number
    active: number
    totalCapacity: number
    totalBillableHours: number
    avgUtilization: number
  }
  departments?: string[]
  roles?: string[]
}

type TeamTableRow = TeamMember | { original?: Partial<TeamMember> }

const toast = useToast()
const route = useRoute()

// Filters
const departmentFilter = ref<string | null>(null)
const roleFilter = ref<string | null>(null)
const activeFilter = ref('true')

// Fetch team members
const { data, pending, refresh } = await useFetch<TeamMembersResponse>('/api/agency/team-members', {
  query: {
    active: activeFilter,
    department: departmentFilter,
    role: roleFilter
  }
})

const toSafeNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const normalizeMember = (member: Partial<TeamMember> = {}): TeamMember => ({
  id: member.id ?? '',
  name: member.name ?? '',
  email: member.email ?? '',
  role: member.role ?? null,
  department: member.department ?? null,
  hourlyRate: toSafeNumber(member?.hourlyRate),
  hourlyCost: toSafeNumber(member?.hourlyCost),
  targetUtilization: toSafeNumber(member?.targetUtilization),
  avatarUrl: member.avatarUrl ?? null,
  isActive: member.isActive ?? false,
  hoursThisMonth: toSafeNumber(member?.hoursThisMonth),
  billableHoursThisMonth: toSafeNumber(member?.billableHoursThisMonth),
  utilizationRate: toSafeNumber(member?.utilizationRate),
  activeProjects: toSafeNumber(member?.activeProjects),
  createdAt: member.createdAt
})

const members = computed(() => (data.value?.members || []).map(normalizeMember))
const summary = computed(() => data.value?.summary || {
  total: 0, active: 0, totalCapacity: 0, totalBillableHours: 0, avgUtilization: 0
})
const departments = computed(() => data.value?.departments || [])
const roles = computed(() => data.value?.roles || [])

// Format helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

// Utilization color
const getUtilizationColor = (rate: number): 'success' | 'warning' | 'error' | 'neutral' => {
  if (rate >= 90) return 'success'
  if (rate >= 70) return 'warning'
  if (rate >= 50) return 'neutral'
  return 'error'
}

// Table columns
const columns: TableColumn<TeamMember>[] = [
  { id: 'name', accessorKey: 'name', header: 'Team Member' },
  { id: 'role', accessorKey: 'role', header: 'Role' },
  { id: 'department', accessorKey: 'department', header: 'Department' },
  { id: 'utilization', accessorKey: 'utilizationRate', header: 'Utilization' },
  { id: 'hoursThisMonth', accessorKey: 'hoursThisMonth', header: 'Hours (Month)' },
  { id: 'activeProjects', accessorKey: 'activeProjects', header: 'Projects' },
  { id: 'status', accessorKey: 'isActive', header: 'Status' },
  { id: 'actions', accessorKey: 'id', header: '' }
]

const tableMember = (row: TeamTableRow) => normalizeMember('original' in row ? row.original : row)

// Member detail modal
const showMemberModal = ref(false)
const selectedMember = ref<TeamMember | null>(null)

const openMemberModal = (member: Partial<TeamMember>) => {
  selectedMember.value = normalizeMember(member)
  showMemberModal.value = true
}

const handledRouteMemberId = ref<string | null>(null)

watch(
  [members, () => route.query.member],
  ([currentMembers, memberId]) => {
    if (typeof memberId !== 'string' || handledRouteMemberId.value === memberId) return

    const member = currentMembers.find(item => item.id === memberId)
    if (member) {
      handledRouteMemberId.value = memberId
      openMemberModal(member)
      return
    }

    if (activeFilter.value === 'true') {
      activeFilter.value = ''
      refresh()
    }
  },
  { immediate: true }
)

// Get initials for avatar
const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Create/Edit modal
const showCreateModal = ref(false)
const editingMember = ref<TeamMember | null>(null)
const saving = ref(false)

const memberForm = ref({
  name: '',
  email: '',
  role: '',
  department: '',
  hourlyRate: null as number | null,
  hourlyCost: null as number | null,
  targetUtilization: null as number | null,
  isActive: true
})

const openCreateModal = () => {
  editingMember.value = null
  memberForm.value = {
    name: '',
    email: '',
    role: '',
    department: '',
    hourlyRate: null,
    hourlyCost: null,
    targetUtilization: null,
    isActive: true
  }
  showCreateModal.value = true
}

const openEditModal = (member: Partial<TeamMember>) => {
  const normalizedMember = normalizeMember(member)
  editingMember.value = normalizedMember
  memberForm.value = {
    name: normalizedMember.name,
    email: normalizedMember.email,
    role: normalizedMember.role || '',
    department: normalizedMember.department || '',
    hourlyRate: normalizedMember.hourlyRate || null,
    hourlyCost: normalizedMember.hourlyCost || null,
    targetUtilization: normalizedMember.targetUtilization || null,
    isActive: normalizedMember.isActive
  }
  showMemberModal.value = false
  showCreateModal.value = true
}

const errorDescription = (error: unknown) => {
  if (typeof error === 'object' && error && 'data' in error) {
    const data = (error as { data?: { message?: string } }).data
    if (data?.message) return data.message
  }
  return error instanceof Error ? error.message : 'Unknown error'
}

const saveMember = async () => {
  if (!memberForm.value.name || !memberForm.value.email) {
    toast.add({ title: 'Name and email are required', color: 'error' })
    return
  }

  saving.value = true
  try {
    if (editingMember.value) {
      await $fetch(`/api/agency/team-members/${editingMember.value.id}`, {
        method: 'PUT',
        body: memberForm.value
      })
      toast.add({ title: 'Team member updated', color: 'success' })
    } else {
      await $fetch('/api/agency/team-members', {
        method: 'POST',
        body: memberForm.value
      })
      toast.add({ title: 'Team member created', color: 'success' })
    }
    showCreateModal.value = false
    refresh()
  } catch (error: unknown) {
    toast.add({
      title: editingMember.value ? 'Failed to update team member' : 'Failed to create team member',
      description: errorDescription(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

// Delete member
const deletingMember = ref<TeamMember | null>(null)
const showDeleteModal = ref(false)
const deleting = ref(false)

const confirmDelete = (member: Partial<TeamMember>) => {
  deletingMember.value = normalizeMember(member)
  showDeleteModal.value = true
}

const deleteMember = async () => {
  if (!deletingMember.value) return

  deleting.value = true
  try {
    const result = await $fetch<{ deactivated?: boolean }>(`/api/agency/team-members/${deletingMember.value.id}`, {
      method: 'DELETE'
    })
    if (result.deactivated) {
      toast.add({ title: 'Team member deactivated', description: 'Member has time entries and was deactivated instead of deleted', color: 'warning' })
    } else {
      toast.add({ title: 'Team member deleted', color: 'success' })
    }
    showDeleteModal.value = false
    refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to delete team member',
      description: errorDescription(error),
      color: 'error'
    })
  } finally {
    deleting.value = false
  }
}

// Common roles and departments for suggestions
const commonRoles = [
  'Designer',
  'Developer',
  'Project Manager',
  'Account Manager',
  'Copywriter',
  'Strategist',
  'Art Director',
  'Creative Director',
  'Marketing Manager',
  'SEO Specialist',
  'Social Media Manager',
  'Video Producer'
]

// Client book slideover
const showClientBook = ref(false)
const clientBookMember = ref<TeamMember | null>(null)

const openClientBook = (member: Partial<TeamMember>) => {
  clientBookMember.value = normalizeMember(member)
  showClientBook.value = true
}

const commonDepartments = [
  'Design',
  'Development',
  'Marketing',
  'Strategy',
  'Creative',
  'Account Management',
  'Production',
  'Analytics'
]
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Team Members">
        <template #right>
          <UButton
            label="Add Team Member"
            icon="i-lucide-user-plus"
            color="primary"
            @click="openCreateModal"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-blue-500/10">
                <UIcon name="i-lucide-users" class="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">
                  Total Members
                </p>
                <p class="text-xl font-bold">
                  {{ summary.total }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-emerald-500/10">
                <UIcon name="i-lucide-user-check" class="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">
                  Active
                </p>
                <p class="text-xl font-bold text-emerald-500">
                  {{ summary.active }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-purple-500/10">
                <UIcon name="i-lucide-clock" class="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">
                  Total Capacity
                </p>
                <p class="text-xl font-bold text-purple-500">
                  {{ summary.totalCapacity }}h
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-amber-500/10">
                <UIcon name="i-lucide-timer" class="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">
                  Billable Hours
                </p>
                <p class="text-xl font-bold text-amber-500">
                  {{ summary.totalBillableHours.toFixed(1) }}h
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-cyan-500/10">
                <UIcon name="i-lucide-trending-up" class="w-5 h-5 text-cyan-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">
                  Avg Utilization
                </p>
                <p class="text-xl font-bold text-cyan-500">
                  {{ summary.avgUtilization }}%
                </p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-4 mb-6">
          <USelectMenu
            v-model="activeFilter"
            :items="[
              { label: 'Active Only', value: 'true' },
              { label: 'All Members', value: '' }
            ]"
            placeholder="Status"
            value-key="value"
            class="w-36"
          />

          <USelectMenu
            v-model="departmentFilter"
            :items="[{ label: 'All Departments', value: null }, ...departments.map(d => ({ label: d, value: d }))]"
            placeholder="Department"
            value-key="value"
            class="w-44"
          />

          <USelectMenu
            v-model="roleFilter"
            :items="[{ label: 'All Roles', value: null }, ...roles.map(r => ({ label: r, value: r }))]"
            placeholder="Role"
            value-key="value"
            class="w-40"
          />
        </div>

        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <XfLoader />
        </div>

        <!-- Team Members Table -->
        <UCard v-else>
          <UTable :data="members" :columns="columns">
            <template #name-cell="{ row: r }">
              <div class="flex items-center gap-3 cursor-pointer" @click="openMemberModal(tableMember(r))">
                <UAvatar
                  :src="tableMember(r).avatarUrl || undefined"
                  :alt="tableMember(r).name"
                  size="sm"
                >
                  <template #fallback>
                    {{ getInitials(tableMember(r).name) }}
                  </template>
                </UAvatar>
                <div>
                  <p class="font-medium">
                    {{ tableMember(r).name }}
                  </p>
                  <p class="text-xs text-gray-500">
                    {{ tableMember(r).email }}
                  </p>
                </div>
              </div>
            </template>

            <template #role-cell="{ row: r }">
              <span class="text-gray-600">{{ tableMember(r).role || '—' }}</span>
            </template>

            <template #department-cell="{ row: r }">
              <UBadge v-if="tableMember(r).department" variant="subtle" color="neutral">
                {{ tableMember(r).department }}
              </UBadge>
              <span v-else class="text-gray-400">—</span>
            </template>

            <template #utilization-cell="{ row: r }">
              <div class="flex items-center gap-2">
                <UProgress
                  :value="tableMember(r).utilizationRate"
                  :max="100"
                  :color="getUtilizationColor(tableMember(r).utilizationRate)"
                  size="sm"
                  class="w-20"
                />
                <span class="text-sm font-medium">{{ tableMember(r).utilizationRate }}%</span>
              </div>
            </template>

            <template #hoursThisMonth-cell="{ row: r }">
              <div>
                <span class="font-medium">{{ tableMember(r).hoursThisMonth.toFixed(1) }}h</span>
                <span class="text-xs text-gray-500 ml-1">
                  ({{ tableMember(r).billableHoursThisMonth.toFixed(1) }}h billable)
                </span>
              </div>
            </template>

            <template #activeProjects-cell="{ row: r }">
              <span class="font-medium">{{ tableMember(r).activeProjects }}</span>
            </template>

            <template #status-cell="{ row: r }">
              <UBadge
                :color="tableMember(r).isActive ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ tableMember(r).isActive ? 'Active' : 'Inactive' }}
              </UBadge>
            </template>

            <template #actions-cell="{ row: r }">
              <UDropdownMenu
                :items="[
                  [{
                     label: 'View Clients',
                     icon: 'i-lucide-briefcase',
                     click: () => openClientBook(tableMember(r))
                   },
                   {
                     label: 'Edit',
                     icon: 'i-lucide-edit',
                     click: () => openEditModal(tableMember(r))
                   }],
                  [{
                    label: 'Delete',
                    icon: 'i-lucide-trash-2',
                    color: 'error' as const,
                    click: () => confirmDelete(tableMember(r))
                  }]
                ]"
              >
                <UButton
                  icon="i-lucide-more-horizontal"
                  variant="ghost"
                  size="xs"
                />
              </UDropdownMenu>
            </template>
          </UTable>

          <div v-if="members.length === 0" class="text-center text-gray-500 py-8">
            No team members found
          </div>
        </UCard>
      </div>
    </UDashboardPanel>

    <!-- Member Detail Modal -->
    <UModal v-model:open="showMemberModal">
      <template #header>
        <div class="flex items-center gap-3">
          <UAvatar
            :src="selectedMember?.avatarUrl || undefined"
            :alt="selectedMember?.name"
            size="lg"
          >
            <template #fallback>
              {{ selectedMember ? getInitials(selectedMember.name) : '' }}
            </template>
          </UAvatar>
          <div>
            <h3 class="font-semibold">
              {{ selectedMember?.name }}
            </h3>
            <p class="text-sm text-gray-500">
              {{ selectedMember?.role }}
            </p>
          </div>
        </div>
      </template>
      <template #body>
        <div v-if="selectedMember" class="space-y-4">
          <dl class="grid grid-cols-2 gap-4">
            <div>
              <dt class="text-sm text-gray-500">
                Email
              </dt>
              <dd class="font-medium">
                {{ selectedMember.email }}
              </dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500">
                Department
              </dt>
              <dd class="font-medium">
                {{ selectedMember.department || '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500">
                Hourly Rate
              </dt>
              <dd class="font-medium">
                {{ formatCurrency(selectedMember.hourlyRate) }}/hr
              </dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500">
                Hourly Cost
              </dt>
              <dd class="font-medium">
                {{ formatCurrency(selectedMember.hourlyCost) }}/hr
              </dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500">
                Target Utilization
              </dt>
              <dd class="font-medium">
                {{ selectedMember.targetUtilization }}h/month
              </dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500">
                Current Utilization
              </dt>
              <dd class="font-medium">
                {{ selectedMember.utilizationRate }}%
              </dd>
            </div>
          </dl>

          <div class="pt-4 border-t">
            <h4 class="font-medium mb-3">
              This Month
            </h4>
            <div class="grid grid-cols-3 gap-4 text-center">
              <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p class="text-2xl font-bold">
                  {{ selectedMember.hoursThisMonth.toFixed(1) }}h
                </p>
                <p class="text-xs text-gray-500">
                  Total Hours
                </p>
              </div>
              <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p class="text-2xl font-bold text-emerald-500">
                  {{ selectedMember.billableHoursThisMonth.toFixed(1) }}h
                </p>
                <p class="text-xs text-gray-500">
                  Billable
                </p>
              </div>
              <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p class="text-2xl font-bold text-blue-500">
                  {{ selectedMember.activeProjects }}
                </p>
                <p class="text-xs text-gray-500">
                  Active Projects
                </p>
              </div>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-between">
          <UButton
            variant="outline"
            label="Edit"
            icon="i-lucide-edit"
            @click="openEditModal(selectedMember)"
          />
          <UButton variant="ghost" label="Close" @click="showMemberModal = false" />
        </div>
      </template>
    </UModal>

    <!-- Create/Edit Modal -->
    <UModal v-model:open="showCreateModal" class="max-w-lg">
      <template #header>
        <h3 class="font-semibold">
          {{ editingMember ? 'Edit Team Member' : 'Add Team Member' }}
        </h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="memberForm.name" placeholder="Full name" />
          </UFormField>

          <UFormField label="Email" required>
            <UInput v-model="memberForm.email" type="email" placeholder="email@company.com" />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Role">
              <UInput v-model="memberForm.role" placeholder="e.g. Designer" list="roles-list" />
              <datalist id="roles-list">
                <option v-for="r in commonRoles" :key="r" :value="r" />
              </datalist>
            </UFormField>

            <UFormField label="Department">
              <UInput v-model="memberForm.department" placeholder="e.g. Design" list="departments-list" />
              <datalist id="departments-list">
                <option v-for="d in commonDepartments" :key="d" :value="d" />
              </datalist>
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Hourly Rate ($)">
              <UInput
                v-model.number="memberForm.hourlyRate"
                type="number"
                min="0"
                placeholder="150"
              />
            </UFormField>

            <UFormField label="Hourly Cost ($)">
              <UInput
                v-model.number="memberForm.hourlyCost"
                type="number"
                min="0"
                placeholder="75"
              />
            </UFormField>
          </div>

          <UFormField label="Target Utilization (hours/month)">
            <UInput
              v-model.number="memberForm.targetUtilization"
              type="number"
              min="0"
              placeholder="120"
            />
          </UFormField>

          <UCheckbox v-model="memberForm.isActive" label="Active team member" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="ghost" label="Cancel" @click="showCreateModal = false" />
          <UButton
            color="primary"
            :label="editingMember ? 'Save Changes' : 'Add Member'"
            :loading="saving"
            @click="saveMember"
          />
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal" class="max-w-sm">
      <template #header>
        <h3 class="font-semibold text-red-500">
          Delete Team Member
        </h3>
      </template>
      <template #body>
        <p>Are you sure you want to delete <strong>{{ deletingMember?.name }}</strong>?</p>
        <p class="text-sm text-gray-500 mt-2">
          If this member has time entries, they will be deactivated instead of deleted.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="ghost" label="Cancel" @click="showDeleteModal = false" />
          <UButton
            color="error"
            label="Delete"
            :loading="deleting"
            @click="deleteMember"
          />
        </div>
      </template>
    </UModal>

    <!-- Client Book Slideover -->
    <TeamMemberClientsSlideover
      v-if="clientBookMember"
      v-model:open="showClientBook"
      :member-id="String(clientBookMember.id)"
      :member-name="clientBookMember.name"
    />
  </div>
</template>
