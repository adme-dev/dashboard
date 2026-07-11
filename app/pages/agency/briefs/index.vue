<script setup lang="ts">
import { format } from 'date-fns'
import type { Brief, BriefStatus } from '~/types'

definePageMeta({
  title: 'Project Briefs'
})

const toast = useToast()
const { user } = useAuth()
const apiFetch = $fetch as <T>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

// Filters
const statusFilter = ref<BriefStatus | 'all'>('all')
const categoryFilter = ref<string | null>(null)
const searchQuery = ref('')

// Bulk selection
const selectedBriefs = ref<Set<string>>(new Set())
const bulkStatusValue = ref<string>('none')
const bulkAssignValue = ref<string>('none')
const isBulkUpdating = ref(false)

// Fetch briefs
const { data: briefs, pending, refresh } = await useFetch('/api/agency/briefs', {
  query: {
    status: computed(() => statusFilter.value === 'all' ? undefined : statusFilter.value),
    categoryId: categoryFilter
  }
})

// Fetch categories for filter
const { data: categories } = await useFetch('/api/agency/briefs/categories')

// Fetch team members for bulk assign
const { data: teamMembers } = await useFetch('/api/agency/team-members')

// Status options
const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Under Review', value: 'under_review' },
  { label: 'Needs Info', value: 'needs_info' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' }
]

// Bulk status options (sentinel 'none' instead of empty string)
const bulkStatusOptions = [
  { label: 'Change Status...', value: 'none' },
  { label: 'Draft', value: 'draft' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Under Review', value: 'under_review' },
  { label: 'Needs Info', value: 'needs_info' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' }
]

// Bulk assign options
const bulkAssignOptions = computed(() => {
  const options = [{ label: 'Assign To...', value: 'none' }]
  const members = (teamMembers.value as any)?.members || teamMembers.value || []
  for (const m of members) {
    options.push({ label: m.name || m.email, value: m.id })
  }
  return options
})

// Category options for dropdown
const categoryOptions = computed(() => {
  const options: { label: string; value: string | null }[] = [{ label: 'All Categories', value: null }]
  if (categories.value) {
    categories.value.forEach((c: any) => {
      options.push({ label: c.name, value: c.id })
    })
  }
  return options
})

// Briefs list (unwrapped from API response)
const briefsList = computed(() => briefs.value?.briefs || [])

// Filtered briefs
const filteredBriefs = computed(() => {
  if (!briefsList.value.length) return []

  let result = briefsList.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter((b: any) =>
      b.title.toLowerCase().includes(query) ||
      b.referenceNumber?.toLowerCase().includes(query) ||
      b.templateName?.toLowerCase().includes(query)
    )
  }

  return result
})

// Summary stats
const summary = computed(() => {
  if (!briefsList.value.length) return { total: 0, submitted: 0, inProgress: 0, completed: 0 }

  return {
    total: briefsList.value.length,
    submitted: briefsList.value.filter((b: any) => b.status === 'submitted').length,
    inProgress: briefsList.value.filter((b: any) => ['under_review', 'in_progress'].includes(b.status)).length,
    completed: briefsList.value.filter((b: any) => b.status === 'completed').length
  }
})

// Status badge color
const getStatusColor = (status: string) => {
  switch (status) {
    case 'draft': return 'neutral'
    case 'submitted': return 'info'
    case 'under_review': return 'warning'
    case 'needs_info': return 'warning'
    case 'approved': return 'success'
    case 'rejected': return 'error'
    case 'in_progress': return 'info'
    case 'completed': return 'success'
    case 'cancelled': return 'error'
    default: return 'neutral'
  }
}

// Priority badge color
const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent': return 'error'
    case 'high': return 'warning'
    case 'medium': return 'info'
    case 'low': return 'neutral'
    default: return 'neutral'
  }
}

// Format status label
const formatStatus = (status: string) => {
  return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

// Table columns
const columns = [
  { accessorKey: 'select', header: '', size: 40 },
  { accessorKey: 'reference', header: 'Reference', enableSorting: true },
  { accessorKey: 'title', header: 'Title', enableSorting: true },
  { accessorKey: 'templateName', header: 'Type', enableSorting: true },
  { accessorKey: 'priority', header: 'Priority', enableSorting: true },
  { accessorKey: 'status', header: 'Status', enableSorting: true },
  { accessorKey: 'submittedAt', header: 'Submitted', enableSorting: true },
  { accessorKey: 'actions', header: '' }
]

// Bulk selection helpers
const allSelected = computed(() =>
  filteredBriefs.value.length > 0 && selectedBriefs.value.size === filteredBriefs.value.length
)

function toggleSelectAll() {
  if (allSelected.value) {
    selectedBriefs.value = new Set()
  } else {
    selectedBriefs.value = new Set(filteredBriefs.value.map((b: any) => b.id))
  }
}

function toggleSelect(id: string) {
  const next = new Set(selectedBriefs.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedBriefs.value = next
}

function clearSelection() {
  selectedBriefs.value = new Set()
  bulkStatusValue.value = 'none'
  bulkAssignValue.value = 'none'
}

// Bulk status update
async function applyBulkStatus() {
  if (bulkStatusValue.value === 'none' || selectedBriefs.value.size === 0) return
  isBulkUpdating.value = true
  try {
    await apiFetch('/api/agency/briefs/bulk/status', {
      method: 'PATCH',
      body: {
        briefIds: Array.from(selectedBriefs.value),
        status: bulkStatusValue.value
      }
    })
    toast.add({ title: 'Status Updated', description: `${selectedBriefs.value.size} brief(s) updated`, color: 'success' })
    clearSelection()
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to update status', color: 'error' })
  } finally {
    isBulkUpdating.value = false
  }
}

// Bulk assign
async function applyBulkAssign() {
  if (bulkAssignValue.value === 'none' || selectedBriefs.value.size === 0) return
  isBulkUpdating.value = true
  try {
    await apiFetch('/api/agency/briefs/bulk/assign', {
      method: 'PATCH',
      body: {
        briefIds: Array.from(selectedBriefs.value),
        assigneeId: bulkAssignValue.value
      }
    })
    toast.add({ title: 'Briefs Assigned', description: `${selectedBriefs.value.size} brief(s) assigned`, color: 'success' })
    clearSelection()
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to assign briefs', color: 'error' })
  } finally {
    isBulkUpdating.value = false
  }
}

// Watch bulk dropdowns to auto-apply
watch(bulkStatusValue, (val) => {
  if (val !== 'none') applyBulkStatus()
})
watch(bulkAssignValue, (val) => {
  if (val !== 'none') applyBulkAssign()
})

// Actions dropdown items
const getActions = (brief: any) => [
  [
    { label: 'View Details', icon: 'i-lucide-eye', onSelect: () => navigateTo(`/agency/briefs/${brief.id}`) },
    { label: 'Edit Brief', icon: 'i-lucide-pencil', onSelect: () => navigateTo(`/agency/briefs/${brief.id}/edit`), disabled: brief.status !== 'draft' }
  ],
  [
    { label: 'Add Comment', icon: 'i-lucide-message-square' },
    { label: 'Download PDF', icon: 'i-lucide-download' }
  ]
]
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Project Briefs">
        <template #right>
          <UButton
            label="Analytics"
            icon="i-lucide-bar-chart-3"
            variant="outline"
            color="neutral"
            to="/agency/briefs/analytics"
          />
          <UButton
            label="Submit New Brief"
            icon="i-lucide-plus"
            color="primary"
            to="/agency/briefs/new"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <UCard>
            <div class="text-center">
              <p class="text-sm text-muted">Total Briefs</p>
              <p class="text-3xl font-bold">{{ summary.total }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-muted">Awaiting Review</p>
              <p class="text-3xl font-bold text-blue-500">{{ summary.submitted }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-muted">In Progress</p>
              <p class="text-3xl font-bold text-amber-500">{{ summary.inProgress }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-muted">Completed</p>
              <p class="text-3xl font-bold text-emerald-500">{{ summary.completed }}</p>
            </div>
          </UCard>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-4 mb-6">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Search briefs..."
            class="w-64"
          />

          <USelectMenu
            v-model="statusFilter"
            :items="statusOptions"
            value-key="value"
            placeholder="Status"
            class="w-40"
          />

          <USelectMenu
            v-model="categoryFilter"
            :items="categoryOptions"
            value-key="value"
            placeholder="Category"
            class="w-48"
          />

          <UButton
            v-if="statusFilter !== 'all' || categoryFilter || searchQuery"
            label="Clear Filters"
            variant="ghost"
            icon="i-lucide-x"
            @click="statusFilter = 'all'; categoryFilter = null; searchQuery = ''"
          />
        </div>

        <!-- Briefs Table -->
        <UCard>
          <UTable
            :columns="columns"
            :data="filteredBriefs"
            :loading="pending"
          >
            <template #select-cell="{ row }">
              <UCheckbox
                :model-value="selectedBriefs.has((row.original as any).id)"
                @update:model-value="toggleSelect((row.original as any).id)"
              />
            </template>

            <template #select-header>
              <UCheckbox
                :model-value="allSelected"
                @update:model-value="toggleSelectAll"
              />
            </template>

            <template #reference-cell="{ row }">
              <NuxtLink
                :to="`/agency/briefs/${(row.original as any).id}`"
                class="font-mono text-sm font-medium hover:text-primary"
              >
                {{ (row.original as any).referenceNumber }}
              </NuxtLink>
            </template>

            <template #title-cell="{ row }">
              <NuxtLink
                :to="`/agency/briefs/${(row.original as any).id}`"
                class="font-medium hover:text-primary"
              >
                {{ (row.original as any).title }}
              </NuxtLink>
              <p v-if="(row.original as any).submittedByName" class="text-xs text-muted">
                by {{ (row.original as any).submittedByName }}
              </p>
            </template>

            <template #templateName-cell="{ row }">
              <div class="flex items-center gap-2">
                <UIcon v-if="(row.original as any).templateIcon" :name="(row.original as any).templateIcon" class="size-4 text-muted" />
                <span>{{ (row.original as any).templateName }}</span>
              </div>
            </template>

            <template #priority-cell="{ row }">
              <UBadge :color="getPriorityColor((row.original as any).priority)" variant="subtle" size="xs">
                {{ (row.original as any).priority }}
              </UBadge>
            </template>

            <template #status-cell="{ row }">
              <UBadge :color="getStatusColor((row.original as any).status)" variant="subtle">
                {{ formatStatus((row.original as any).status) }}
              </UBadge>
            </template>

            <template #submittedAt-cell="{ row }">
              <span v-if="(row.original as any).submittedAt" class="text-sm">
                {{ format(new Date((row.original as any).submittedAt), 'MMM d, yyyy') }}
              </span>
              <span v-else class="text-sm text-muted">Draft</span>
            </template>

            <template #actions-cell="{ row }">
              <UDropdownMenu :items="getActions(row.original)">
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-more-horizontal"
                />
              </UDropdownMenu>
            </template>
          </UTable>
        </UCard>
      </div>
    </UDashboardPanel>

    <!-- Floating Bulk Action Bar -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <div
        v-if="selectedBriefs.size > 0"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-elevated border border-default rounded-xl shadow-lg px-4 py-3 flex items-center gap-4"
      >
        <span class="text-sm font-medium whitespace-nowrap">
          {{ selectedBriefs.size }} selected
        </span>

        <USelectMenu
          v-model="bulkStatusValue"
          :items="bulkStatusOptions"
          value-key="value"
          placeholder="Change Status..."
          :disabled="isBulkUpdating"
          class="w-44"
        />

        <USelectMenu
          v-model="bulkAssignValue"
          :items="bulkAssignOptions"
          value-key="value"
          placeholder="Assign To..."
          :disabled="isBulkUpdating"
          class="w-44"
        />

        <UButton
          label="Clear"
          variant="ghost"
          size="sm"
          icon="i-lucide-x"
          :disabled="isBulkUpdating"
          @click="clearSelection"
        />
      </div>
    </Transition>
  </div>
</template>
