<template>
  <div class="p-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="mb-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">Monday.com Items</h1>
          <p class="text-gray-500 mt-1">
            {{ totalItems }} items imported from Monday.com
            <a 
              href="https://adme2.monday.com/boards/18230429150" 
              target="_blank"
              class="text-primary hover:underline ml-2"
            >
              View in Monday.com →
            </a>
          </p>
        </div>
        <div class="flex gap-2">
          <UButton
            variant="outline"
            icon="i-lucide-refresh-cw"
            @click="refresh"
            :loading="loading"
          >
            Refresh
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-external-link"
            to="https://adme2.monday.com/boards/18230429150"
            target="_blank"
          >
            Open Monday.com
          </UButton>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-6">
      <USelectMenu
        v-model="selectedBoard"
        :items="boardOptions"
        placeholder="All Boards"
        class="w-48"
      />
      <USelectMenu
        v-model="selectedDepartment"
        :items="departmentOptions"
        placeholder="All Departments"
        class="w-48"
      />
      <UInput
        v-model="searchQuery"
        placeholder="Search items..."
        icon="i-lucide-search"
        class="w-64"
      />
    </div>

    <!-- Items Table -->
    <UCard>
      <div v-if="loading" class="flex justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
      </div>

      <div v-else-if="filteredItems.length === 0" class="text-center py-12 text-gray-500">
        <UIcon name="i-lucide-inbox" class="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>No items found</p>
      </div>

      <UTable v-else :data="filteredItems" :columns="columns">
        <!-- Title Column with Monday Link -->
        <template #title-cell="{ row }">
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-layout-grid" class="w-4 h-4 text-purple-500" />
            <div>
              <p class="font-medium">{{ row.title }}</p>
              <a 
                :href="`https://adme2.monday.com/boards/${row.monday_board_id}/pulses/${row.monday_item_id}`"
                target="_blank"
                class="text-xs text-gray-400 hover:text-primary"
              >
                View in Monday →
              </a>
            </div>
          </div>
        </template>

        <!-- Department Column -->
        <template #department-cell="{ row }">
          <UBadge variant="subtle" :color="getDeptColor(row.department_id)">
            {{ row.department_name }}
          </UBadge>
        </template>

        <!-- Status Column -->
        <template #status-cell="{ row }">
          <UBadge 
            v-if="row.status_name"
            :style="{ backgroundColor: row.status_color + '20', color: row.status_color }"
            variant="subtle"
          >
            {{ row.status_name }}
          </UBadge>
          <span v-else class="text-gray-400">-</span>
        </template>

        <!-- Due Date Column -->
        <template #due_date-cell="{ row }">
          <span v-if="row.due_date" :class="isOverdue(row.due_date) ? 'text-red-500' : ''">
            {{ formatDate(row.due_date) }}
          </span>
          <span v-else class="text-gray-400">-</span>
        </template>

        <!-- Actions Column -->
        <template #actions-cell="{ row }">
          <div class="flex items-center gap-1">
            <UButton
              variant="ghost"
              size="xs"
              icon="i-lucide-external-link"
              :to="`https://adme2.monday.com/boards/${row.monday_board_id}/pulses/${row.monday_item_id}`"
              target="_blank"
            />
            <UButton
              variant="ghost"
              size="xs"
              icon="i-lucide-eye"
              :to="`/agency/tasks/${row.id}`"
            />
          </div>
        </template>
      </UTable>

      <!-- Pagination -->
      <div v-if="filteredItems.length > 0" class="flex items-center justify-between mt-4 pt-4 border-t">
        <p class="text-sm text-gray-500">
          Showing {{ pagination.offset + 1 }} to {{ Math.min(pagination.offset + pagination.limit, pagination.total) }} of {{ pagination.total }} items
        </p>
        <div class="flex gap-2">
          <UButton
            variant="outline"
            size="sm"
            :disabled="pagination.offset === 0"
            @click="prevPage"
          >
            Previous
          </UButton>
          <UButton
            variant="outline"
            size="sm"
            :disabled="pagination.offset + pagination.limit >= pagination.total"
            @click="nextPage"
          >
            Next
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Monday.com Screenshot Reference -->
    <UCard class="mt-6">
      <template #header>
        <h3 class="font-semibold">Reference: Monday.com Support Board</h3>
      </template>
      
      <div class="space-y-4">
        <p class="text-sm text-gray-500">
          This is how the items appear in Monday.com. Click "View in Monday.com" to see the original board with full context, updates, and comments.
        </p>
        
        <div class="border rounded-lg overflow-hidden bg-gray-50">
          <div class="bg-purple-600 text-white px-4 py-2 text-sm font-medium">
            Support Board - All Client Inventory Feeds
          </div>
          <div class="p-4 space-y-2 text-sm">
            <div class="flex items-center gap-2 text-gray-600">
              <span class="w-2 h-2 rounded-full bg-green-500"></span>
              <span>Emailed Items ({{ emailedItems.length }})</span>
            </div>
            <div class="flex items-center gap-2 text-gray-600">
              <span class="w-2 h-2 rounded-full bg-yellow-500"></span>
              <span>Follow Up ({{ followUpItems.length }})</span>
            </div>
            <div class="flex items-center gap-2 text-gray-600">
              <span class="w-2 h-2 rounded-full bg-pink-500"></span>
              <span>Toyota ({{ toyotaItems.length }})</span>
            </div>
            <div class="flex items-center gap-2 text-gray-600">
              <span class="w-2 h-2 rounded-full bg-purple-500"></span>
              <span>Current Support Jobs ({{ supportJobsItems.length }})</span>
            </div>
          </div>
          <div class="px-4 py-3 bg-gray-100 border-t">
            <a 
              href="https://adme2.monday.com/boards/18230429150"
              target="_blank"
              class="text-primary hover:underline text-sm font-medium"
            >
              Open Full Board in Monday.com →
            </a>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const toast = useToast()

// State
const loading = ref(true)
const items = ref<any[]>([])
const totalItems = ref(0)
const searchQuery = ref('')
const selectedBoard = ref('')
const selectedDepartment = ref('')
const boards = ref<any[]>([])
const departments = ref<any[]>([])

const pagination = ref({
  offset: 0,
  limit: 25,
  total: 0
})

// Fetch data
const { data, refresh, pending } = await useFetch('/api/agency/monday/items', {
  query: computed(() => ({
    offset: pagination.value.offset,
    limit: pagination.value.limit,
    search: searchQuery.value || undefined,
    boardId: selectedBoard.value || undefined,
    departmentId: selectedDepartment.value || undefined
  }))
})

watch(data, (newData) => {
  if (newData) {
    items.value = newData.items || []
    totalItems.value = newData.total || 0
    pagination.value.total = newData.total || 0
    boards.value = newData.boards || []
    departments.value = newData.departments || []
  }
  loading.value = false
}, { immediate: true })

watch(pending, (isPending) => {
  loading.value = isPending
})

// Computed
const filteredItems = computed(() => items.value)

const boardOptions = computed(() => [
  { label: 'All Boards', value: '' },
  ...boards.value.map((b: any) => ({ label: b.name, value: b.id }))
])

const departmentOptions = computed(() => [
  { label: 'All Departments', value: '' },
  ...departments.value.map((d: any) => ({ label: d.name, value: d.id }))
])

// Group items by category (simulated based on title keywords)
const emailedItems = computed(() => items.value.filter(i => i.title?.toLowerCase().includes('fwd:') || i.title?.toLowerCase().includes('email')))
const followUpItems = computed(() => items.value.filter(i => i.title?.toLowerCase().includes('follow') || i.title?.toLowerCase().includes('action required')))
const toyotaItems = computed(() => items.value.filter(i => i.title?.toLowerCase().includes('toyota') || i.title?.toLowerCase().includes('werribee')))
const supportJobsItems = computed(() => items.value.filter(i => !emailedItems.value.includes(i) && !followUpItems.value.includes(i) && !toyotaItems.value.includes(i)))

const columns = [
  { accessorKey: 'title', header: 'Item', width: '40%' },
  { accessorKey: 'department', header: 'Department', width: '15%' },
  { accessorKey: 'status', header: 'Status', width: '15%' },
  { accessorKey: 'due_date', header: 'Due Date', width: '15%' },
  { accessorKey: 'actions', header: '', width: '15%' }
]

// Helpers
function getDeptColor(deptId: string) {
  const colors: Record<string, string> = {
    'cc00daa9-9548-44d3-846e-6924f91d9043': 'pink', // Marketing
    '1c5b6643-eb10-4ab3-9194-7e6325f36de4': 'blue', // Creative
    '732cf3d5-09f3-452f-a20f-15f9db35a4c7': 'green', // Sales
  }
  return colors[deptId] || 'gray'
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

function isOverdue(date: string) {
  return new Date(date) < new Date()
}

function prevPage() {
  if (pagination.value.offset > 0) {
    pagination.value.offset -= pagination.value.limit
  }
}

function nextPage() {
  if (pagination.value.offset + pagination.value.limit < pagination.value.total) {
    pagination.value.offset += pagination.value.limit
  }
}
</script>
