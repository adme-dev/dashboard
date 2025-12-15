<script setup lang="ts">
import { format } from 'date-fns'
import type { Brief, BriefStatus } from '~/types'

definePageMeta({
  title: 'Project Briefs'
})

const { user } = useAuth()

// Filters
const statusFilter = ref<BriefStatus | 'all'>('all')
const categoryFilter = ref<string | null>(null)
const searchQuery = ref('')

// Fetch briefs
const { data: briefs, pending, refresh } = await useFetch('/api/agency/briefs', {
  query: {
    status: computed(() => statusFilter.value === 'all' ? undefined : statusFilter.value),
    categoryId: categoryFilter
  }
})

// Fetch categories for filter
const { data: categories } = await useFetch('/api/agency/briefs/categories')

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
    case 'normal': return 'info'
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
  { accessorKey: 'reference', header: 'Reference', enableSorting: true },
  { accessorKey: 'title', header: 'Title', enableSorting: true },
  { accessorKey: 'templateName', header: 'Type', enableSorting: true },
  { accessorKey: 'priority', header: 'Priority', enableSorting: true },
  { accessorKey: 'status', header: 'Status', enableSorting: true },
  { accessorKey: 'submittedAt', header: 'Submitted', enableSorting: true },
  { accessorKey: 'actions', header: '' }
]

// Actions dropdown items
const getActions = (brief: any) => [
  [
    { label: 'View Details', icon: 'i-lucide-eye', click: () => navigateTo(`/agency/briefs/${brief.id}`) },
    { label: 'Edit Brief', icon: 'i-lucide-pencil', click: () => navigateTo(`/agency/briefs/${brief.id}/edit`), disabled: brief.status !== 'draft' }
  ],
  [
    { label: 'Add Comment', icon: 'i-lucide-message-square' },
    { label: 'Download PDF', icon: 'i-lucide-download' }
  ]
]
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Project Briefs">
        <template #right>
          <UButton
            label="Submit New Brief"
            icon="i-lucide-plus"
            color="primary"
            to="/agency/briefs/new"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
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
        <div class="flex flex-wrap gap-4 mb-6">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Search briefs..."
            class="w-64"
          />

          <USelectMenu
            v-model="statusFilter"
            :options="statusOptions"
            placeholder="Status"
            class="w-40"
          />

          <USelectMenu
            v-model="categoryFilter"
            :options="categoryOptions"
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
              <UDropdown :items="getActions(row.original)">
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-more-horizontal"
                />
              </UDropdown>
            </template>
          </UTable>
        </UCard>
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>
