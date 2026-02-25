<script setup lang="ts">
import { format, parseISO } from 'date-fns'

definePageMeta({
  title: 'Timesheet Approvals',
  middleware: ['auth']
})

const toast = useToast()

// Filter state
const activeFilter = ref('submitted')
const filterOptions = [
  { label: 'Pending', value: 'submitted' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All', value: '' }
]

// Fetch timesheets
const { data: timesheetsData, pending, refresh } = await useFetch('/api/agency/time/timesheets', {
  query: {
    status: computed(() => activeFilter.value || undefined),
    limit: 50
  }
})

const timesheets = computed(() => (timesheetsData.value?.timesheets || []) as any[])

// Selection for bulk actions
const selectedIds = ref<Set<string>>(new Set())
const allSelected = computed(() =>
  timesheets.value.length > 0 && timesheets.value.every(ts => selectedIds.value.has(ts.id))
)

function toggleSelectAll(val: boolean) {
  if (val) {
    timesheets.value.forEach(ts => selectedIds.value.add(ts.id))
  } else {
    selectedIds.value.clear()
  }
}

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
}

// Expanded rows for detail view
const expandedId = ref<string | null>(null)
const expandedEntries = ref<any[]>([])
const loadingDetail = ref(false)

async function toggleExpand(id: string) {
  if (expandedId.value === id) {
    expandedId.value = null
    return
  }
  expandedId.value = id
  loadingDetail.value = true
  try {
    const data = await $fetch<any>(`/api/agency/time/timesheets/${id}`)
    expandedEntries.value = data.entries || []
  } catch {
    expandedEntries.value = []
  } finally {
    loadingDetail.value = false
  }
}

// Approve/Reject
const approvingId = ref<string | null>(null)
const showRejectModal = ref(false)
const rejectTargetId = ref<string | null>(null)
const rejectionReason = ref('')
const rejecting = ref(false)

async function approveTimesheet(id: string) {
  approvingId.value = id
  try {
    await $fetch(`/api/agency/time/timesheets/${id}`, {
      method: 'PATCH',
      body: { action: 'approve' }
    })
    toast.add({ title: 'Timesheet approved', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to approve', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    approvingId.value = null
  }
}

function openRejectModal(id: string) {
  rejectTargetId.value = id
  rejectionReason.value = ''
  showRejectModal.value = true
}

async function submitReject() {
  if (!rejectTargetId.value || !rejectionReason.value.trim()) return
  rejecting.value = true
  try {
    await $fetch(`/api/agency/time/timesheets/${rejectTargetId.value}`, {
      method: 'PATCH',
      body: { action: 'reject', rejectionReason: rejectionReason.value }
    })
    toast.add({ title: 'Timesheet rejected', color: 'warning' })
    showRejectModal.value = false
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to reject', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    rejecting.value = false
  }
}

// Bulk approve
const bulkApproving = ref(false)
async function bulkApprove() {
  bulkApproving.value = true
  const ids = [...selectedIds.value]
  let successCount = 0
  for (const id of ids) {
    try {
      await $fetch(`/api/agency/time/timesheets/${id}`, {
        method: 'PATCH',
        body: { action: 'approve' }
      })
      successCount++
    } catch {
      // continue with others
    }
  }
  bulkApproving.value = false
  selectedIds.value.clear()
  toast.add({ title: `${successCount} timesheet${successCount !== 1 ? 's' : ''} approved`, color: 'success' })
  refresh()
}

// Helpers
function formatPeriod(start: string, end: string) {
  try {
    return `${format(parseISO(start), 'MMM d')} - ${format(parseISO(end), 'MMM d, yyyy')}`
  } catch {
    return `${start} - ${end}`
  }
}

function statusColor(status: string): 'warning' | 'success' | 'error' | 'neutral' {
  const map: Record<string, any> = {
    submitted: 'warning',
    approved: 'success',
    rejected: 'error',
    draft: 'neutral'
  }
  return map[status] || 'neutral'
}

function utilization(ts: any) {
  if (!ts.totalHours || ts.totalHours === 0) return 0
  return Math.round((ts.billableHours / ts.totalHours) * 100)
}

// Group entries by date for expanded detail
const entriesByDate = computed(() => {
  const grouped: Record<string, any[]> = {}
  for (const entry of expandedEntries.value) {
    if (!grouped[entry.date]) grouped[entry.date] = []
    grouped[entry.date].push(entry)
  }
  return grouped
})
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Timesheet Approvals">
        <template #right>
          <UButton
            v-if="selectedIds.size > 0 && activeFilter === 'submitted'"
            color="primary"
            icon="i-lucide-check-check"
            :loading="bulkApproving"
            @click="bulkApprove"
          >
            Approve Selected ({{ selectedIds.size }})
          </UButton>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Filter Tabs -->
        <div class="flex items-center gap-1 mb-6 border-b">
          <button
            v-for="opt in filterOptions"
            :key="opt.value"
            class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px"
            :class="activeFilter === opt.value ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
            @click="activeFilter = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>

        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin text-gray-400" />
          <span class="ml-2 text-sm text-gray-500">Loading timesheets...</span>
        </div>

        <!-- Empty State -->
        <div v-else-if="timesheets.length === 0" class="text-center py-12">
          <UIcon name="i-lucide-check-check" class="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <h3 class="font-medium text-gray-700">No timesheets</h3>
          <p class="text-sm text-gray-500 mt-1">
            {{ activeFilter === 'submitted' ? 'No timesheets waiting for approval.' : 'No timesheets match this filter.' }}
          </p>
        </div>

        <!-- Timesheets Table -->
        <UCard v-else>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b text-left text-xs font-medium text-gray-500 uppercase">
                  <th v-if="activeFilter === 'submitted'" class="p-3 w-10">
                    <UCheckbox :model-value="allSelected" @update:model-value="toggleSelectAll" />
                  </th>
                  <th class="p-3">Team Member</th>
                  <th class="p-3">Period</th>
                  <th class="p-3 text-right">Total Hours</th>
                  <th class="p-3 text-right">Billable</th>
                  <th class="p-3 text-right">Utilization</th>
                  <th class="p-3">Status</th>
                  <th class="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="ts in timesheets" :key="ts.id">
                  <tr
                    class="border-b hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    :class="{ 'bg-blue-50/50 dark:bg-blue-900/10': expandedId === ts.id }"
                    @click="toggleExpand(ts.id)"
                  >
                    <td v-if="activeFilter === 'submitted'" class="p-3" @click.stop>
                      <UCheckbox :model-value="selectedIds.has(ts.id)" @update:model-value="toggleSelect(ts.id)" />
                    </td>
                    <td class="p-3">
                      <div class="flex items-center gap-2">
                        <UAvatar :alt="ts.user?.name || '?'" size="xs" />
                        <span class="text-sm font-medium">{{ ts.user?.name || 'Unknown' }}</span>
                      </div>
                    </td>
                    <td class="p-3 text-sm">{{ formatPeriod(ts.periodStart, ts.periodEnd) }}</td>
                    <td class="p-3 text-sm text-right font-medium">{{ ts.totalHours.toFixed(1) }}h</td>
                    <td class="p-3 text-sm text-right">{{ ts.billableHours.toFixed(1) }}h</td>
                    <td class="p-3 text-sm text-right">
                      <span :class="utilization(ts) >= 70 ? 'text-emerald-600' : 'text-amber-600'">
                        {{ utilization(ts) }}%
                      </span>
                    </td>
                    <td class="p-3">
                      <UBadge :color="statusColor(ts.status)" variant="soft" size="sm">
                        {{ ts.status }}
                      </UBadge>
                    </td>
                    <td class="p-3" @click.stop>
                      <div v-if="ts.status === 'submitted'" class="flex items-center gap-1">
                        <UButton
                          size="xs"
                          color="success"
                          variant="soft"
                          icon="i-lucide-check"
                          :loading="approvingId === ts.id"
                          @click="approveTimesheet(ts.id)"
                        />
                        <UButton
                          size="xs"
                          color="error"
                          variant="soft"
                          icon="i-lucide-x"
                          @click="openRejectModal(ts.id)"
                        />
                      </div>
                      <div v-else-if="ts.status === 'approved'" class="text-xs text-gray-400">
                        {{ ts.approver?.name || '' }}
                      </div>
                    </td>
                  </tr>

                  <!-- Expanded Detail -->
                  <tr v-if="expandedId === ts.id">
                    <td :colspan="activeFilter === 'submitted' ? 8 : 7" class="p-0">
                      <div class="bg-gray-50 dark:bg-gray-800 p-4 border-b">
                        <!-- Rejection Reason -->
                        <div v-if="ts.status === 'rejected' && ts.rejectionReason" class="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                          <p class="text-sm font-medium text-red-700 dark:text-red-400">Rejection Reason</p>
                          <p class="text-sm text-red-600 dark:text-red-300 mt-1">{{ ts.rejectionReason }}</p>
                        </div>

                        <!-- Loading entries -->
                        <div v-if="loadingDetail" class="flex items-center justify-center py-6">
                          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin text-gray-400" />
                          <span class="ml-2 text-sm text-gray-500">Loading entries...</span>
                        </div>

                        <!-- Daily Breakdown -->
                        <div v-else>
                          <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Daily Breakdown</h4>
                          <div v-for="(dayEntries, date) in entriesByDate" :key="date" class="mb-3">
                            <div class="text-xs font-medium text-gray-500 mb-1">
                              {{ format(parseISO(date), 'EEE, MMM d') }} —
                              {{ dayEntries.reduce((s, e) => s + e.hours, 0).toFixed(1) }}h
                            </div>
                            <div class="space-y-1 ml-3">
                              <div
                                v-for="entry in dayEntries"
                                :key="entry.id"
                                class="flex items-center gap-3 text-xs py-1"
                              >
                                <span class="font-medium w-10">{{ entry.hours }}h</span>
                                <span class="text-gray-600 dark:text-gray-400">
                                  {{ entry.project?.name || 'No project' }}
                                  <span v-if="entry.task?.title" class="text-gray-400"> / {{ entry.task.title }}</span>
                                </span>
                                <UBadge v-if="entry.billable" color="success" variant="soft" size="xs">B</UBadge>
                                <span v-if="entry.description" class="text-gray-400 truncate max-w-[200px]">{{ entry.description }}</span>
                              </div>
                            </div>
                          </div>
                          <div v-if="expandedEntries.length === 0" class="text-sm text-gray-400 py-4 text-center">
                            No entries for this period.
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </UCard>
      </div>
    </UDashboardPanel>

    <!-- Reject Modal -->
    <UModal v-model:open="showRejectModal">
      <template #header>
        <h3 class="font-semibold">Reject Timesheet</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-gray-600">Please provide a reason for rejecting this timesheet. The team member will be able to edit and resubmit.</p>
          <UFormField label="Reason" required>
            <UTextarea
              v-model="rejectionReason"
              placeholder="Explain what needs to be corrected..."
              :rows="3"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showRejectModal = false" />
          <UButton
            color="error"
            label="Reject Timesheet"
            :loading="rejecting"
            :disabled="!rejectionReason.trim()"
            @click="submitReject"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
