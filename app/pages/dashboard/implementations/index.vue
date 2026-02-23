<template>
  <div>
    <!-- Page Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Implementations</h1>
        <p class="text-gray-600">Manage your Xero client implementations</p>
      </div>
      <UButton
        to="/dashboard/implementations/new"
        color="primary"
        icon="i-lucide-plus"
      >
        New Implementation
      </UButton>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div class="flex flex-wrap items-center gap-4">
        <UInput
          v-model="searchQuery"
          placeholder="Search clients..."
          icon="i-lucide-search"
          class="w-full sm:w-64"
        />
        
        <USelect
          v-model="statusFilter"
          :options="statusOptions"
          placeholder="All Statuses"
          class="w-full sm:w-40"
        />
        
        <UButton
          color="gray"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          :loading="isLoading"
          @click="refresh"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <!-- Implementations Table -->
    <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div v-if="isLoading" class="p-12 text-center">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin mx-auto mb-2 text-gray-400" />
        <p class="text-gray-500">Loading implementations...</p>
      </div>

      <div v-else-if="filteredImplementations.length === 0" class="p-12 text-center">
        <UIcon name="i-lucide-inbox" class="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <h3 class="text-lg font-medium text-gray-900 mb-1">No implementations found</h3>
        <p class="text-gray-500 mb-4">Get started by creating your first implementation</p>
        <UButton to="/dashboard/implementations/new" color="primary">
          Create Implementation
        </UButton>
      </div>

      <table v-else class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Client
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Progress
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Target Date
            </th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr 
            v-for="impl in filteredImplementations" 
            :key="impl.id"
            class="hover:bg-gray-50"
          >
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm font-medium text-gray-900">
                {{ impl.client_name }}
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <Badge :color="getStatusColor(impl.status)">
                {{ formatStatus(impl.status) }}
              </Badge>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="flex items-center gap-2">
                <div class="w-24 bg-gray-200 rounded-full h-2">
                  <div 
                    class="bg-[#13B5EA] h-2 rounded-full transition-all"
                    :style="{ width: `${impl.progress_percent || 0}%` }"
                  />
                </div>
                <span class="text-sm text-gray-600">
                  {{ impl.progress_percent || 0 }}%
                </span>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm text-gray-900">
                {{ formatDate(impl.target_date) }}
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <UButton
                :to="`/dashboard/implementations/${impl.id}`"
                color="gray"
                variant="ghost"
                size="sm"
              >
                View
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'dashboard'
})

const { implementations, isLoading, fetchImplementations, getStatusColor } = useImplementations()

const searchQuery = ref('')
const statusFilter = ref('')

const statusOptions = [
  { label: 'All Statuses', value: '' },
  { label: 'Not Started', value: 'not_started' },
  { label: 'Setup Phase', value: 'setup_phase' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Review', value: 'review' },
  { label: 'Go Live', value: 'go_live' },
  { label: 'Complete', value: 'complete' }
]

onMounted(() => {
  fetchImplementations()
})

const filteredImplementations = computed(() => {
  let filtered = implementations.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(impl => 
      impl.client_name?.toLowerCase().includes(query)
    )
  }

  if (statusFilter.value) {
    filtered = filtered.filter(impl => impl.status === statusFilter.value)
  }

  return filtered
})

const refresh = () => {
  fetchImplementations()
}

const formatStatus = (status) => {
  return status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

const formatDate = (date) => {
  if (!date) return 'Not set'
  return new Date(date).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  })
}
</script>
