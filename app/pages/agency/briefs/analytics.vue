<script setup lang="ts">
definePageMeta({
  title: 'Brief Analytics'
})

// Period selector
const periodOptions = [
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Last 90 Days', value: '90d' },
  { label: 'Last Year', value: '1y' }
]

const selectedPeriod = ref('30d')

// Fetch analytics data
const { data: analytics, pending, refresh } = await useFetch('/api/agency/briefs/analytics', {
  query: { period: selectedPeriod },
  watch: [selectedPeriod]
})

// Computed stats
const submissionRate = computed(() => {
  if (!analytics.value?.summary) return '0%'
  const { total, submitted } = analytics.value.summary
  if (total === 0) return '0%'
  return `${Math.round(((submitted + (analytics.value.summary.approved || 0) + (analytics.value.summary.completed || 0)) / total) * 100)}%`
})

const approvalRate = computed(() => {
  if (!analytics.value?.summary) return '0%'
  const { approved, rejected } = analytics.value.summary
  const reviewed = approved + rejected
  if (reviewed === 0) return 'N/A'
  return `${Math.round((approved / reviewed) * 100)}%`
})

const avgCycleTime = computed(() => {
  if (!analytics.value?.cycleTime) return 'N/A'
  const { avgSubmitToReview, avgReviewToApproval, avgApprovalToCompletion } = analytics.value.cycleTime
  const total = (avgSubmitToReview || 0) + (avgReviewToApproval || 0) + (avgApprovalToCompletion || 0)
  return total > 0 ? `${total.toFixed(1)}d` : 'N/A'
})

// Status colors for chart
const statusColors: Record<string, string> = {
  draft: '#9CA3AF',
  submitted: '#3B82F6',
  under_review: '#F59E0B',
  needs_info: '#F59E0B',
  approved: '#10B981',
  rejected: '#EF4444',
  in_progress: '#6366F1',
  completed: '#059669',
  cancelled: '#DC2626'
}

// Format status label
const formatStatus = (status: string) => {
  return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

// Template usage table columns
const templateColumns = [
  { accessorKey: 'templateName', header: 'Template' },
  { accessorKey: 'count', header: 'Briefs' }
]

// Top submitters table columns
const submitterColumns = [
  { accessorKey: 'userName', header: 'Submitter' },
  { accessorKey: 'count', header: 'Submissions' }
]
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Brief Analytics">
        <template #right>
          <USelectMenu
            v-model="selectedPeriod"
            :items="periodOptions"
            placeholder="Period"
            class="w-40"
          />
          <UButton
            to="/agency/briefs"
            variant="ghost"
            icon="i-lucide-arrow-left"
            label="Back to Briefs"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <XfLoader />
        </div>

        <div v-else-if="analytics" class="space-y-6">
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <UCard>
              <div class="text-center">
                <p class="text-sm text-muted">Total Briefs</p>
                <p class="text-3xl font-bold">{{ analytics.summary.total }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-muted">Submission Rate</p>
                <p class="text-3xl font-bold text-blue-500">{{ submissionRate }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-muted">Approval Rate</p>
                <p class="text-3xl font-bold text-emerald-500">{{ approvalRate }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-muted">Avg Cycle Time</p>
                <p class="text-3xl font-bold text-amber-500">{{ avgCycleTime }}</p>
              </div>
            </UCard>
          </div>

          <!-- Charts Row -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Status Breakdown -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Status Breakdown</h3>
              </template>
              <div v-if="analytics.byStatus.length > 0" class="space-y-3">
                <div
                  v-for="item in analytics.byStatus"
                  :key="item.status"
                  class="flex items-center justify-between"
                >
                  <div class="flex items-center gap-2">
                    <div
                      class="w-3 h-3 rounded-full"
                      :style="{ backgroundColor: statusColors[item.status] || '#9CA3AF' }"
                    />
                    <span class="text-sm">{{ formatStatus(item.status) }}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <div class="w-32 bg-muted/30 rounded-full h-2">
                      <div
                        class="h-2 rounded-full transition-all"
                        :style="{
                          width: `${analytics.summary.total > 0 ? (item.count / analytics.summary.total) * 100 : 0}%`,
                          backgroundColor: statusColors[item.status] || '#9CA3AF'
                        }"
                      />
                    </div>
                    <span class="text-sm font-medium w-8 text-right">{{ item.count }}</span>
                  </div>
                </div>
              </div>
              <div v-else class="text-center py-8 text-muted">
                No data for this period
              </div>
            </UCard>

            <!-- Category Breakdown -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">By Category</h3>
              </template>
              <div v-if="analytics.byCategory.length > 0" class="space-y-3">
                <div
                  v-for="(item, index) in analytics.byCategory"
                  :key="item.categoryId"
                  class="flex items-center justify-between"
                >
                  <span class="text-sm">{{ item.categoryName }}</span>
                  <div class="flex items-center gap-3">
                    <div class="w-32 bg-muted/30 rounded-full h-2">
                      <div
                        class="h-2 rounded-full bg-primary transition-all"
                        :style="{
                          width: `${analytics.summary.total > 0 ? (item.count / analytics.summary.total) * 100 : 0}%`,
                          opacity: 1 - (index * 0.15)
                        }"
                      />
                    </div>
                    <span class="text-sm font-medium w-8 text-right">{{ item.count }}</span>
                  </div>
                </div>
              </div>
              <div v-else class="text-center py-8 text-muted">
                No data for this period
              </div>
            </UCard>
          </div>

          <!-- Timeline -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">Submissions Over Time</h3>
            </template>
            <div v-if="analytics.timeline.length > 0" class="space-y-2">
              <!-- Simple bar chart -->
              <div class="flex items-end gap-1 h-40">
                <div
                  v-for="point in analytics.timeline"
                  :key="point.date"
                  class="flex-1 min-w-1 bg-primary/80 rounded-t hover:bg-primary transition-colors"
                  :style="{
                    height: `${Math.max(4, (point.count / Math.max(...analytics.timeline.map((t: any) => t.count), 1)) * 100)}%`
                  }"
                  :title="`${point.date}: ${point.count} briefs`"
                />
              </div>
              <div class="flex justify-between text-xs text-muted">
                <span>{{ analytics.timeline[0]?.date }}</span>
                <span>{{ analytics.timeline[analytics.timeline.length - 1]?.date }}</span>
              </div>
            </div>
            <div v-else class="text-center py-8 text-muted">
              No submissions in this period
            </div>
          </UCard>

          <!-- Cycle Time -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">Average Cycle Times</h3>
            </template>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div class="text-center p-4">
                <div class="flex items-center justify-center gap-2 mb-2">
                  <UIcon name="i-lucide-send" class="size-5 text-blue-500" />
                  <UIcon name="i-lucide-arrow-right" class="size-4 text-muted" />
                  <UIcon name="i-lucide-eye" class="size-5 text-amber-500" />
                </div>
                <p class="text-2xl font-bold">
                  {{ analytics.cycleTime.avgSubmitToReview || 'N/A' }}
                </p>
                <p class="text-sm text-muted">Submit to Review (days)</p>
              </div>
              <div class="text-center p-4">
                <div class="flex items-center justify-center gap-2 mb-2">
                  <UIcon name="i-lucide-eye" class="size-5 text-amber-500" />
                  <UIcon name="i-lucide-arrow-right" class="size-4 text-muted" />
                  <UIcon name="i-lucide-check-circle" class="size-5 text-emerald-500" />
                </div>
                <p class="text-2xl font-bold">
                  {{ analytics.cycleTime.avgReviewToApproval || 'N/A' }}
                </p>
                <p class="text-sm text-muted">Review to Approval (days)</p>
              </div>
              <div class="text-center p-4">
                <div class="flex items-center justify-center gap-2 mb-2">
                  <UIcon name="i-lucide-check-circle" class="size-5 text-emerald-500" />
                  <UIcon name="i-lucide-arrow-right" class="size-4 text-muted" />
                  <UIcon name="i-lucide-flag" class="size-5 text-primary" />
                </div>
                <p class="text-2xl font-bold">
                  {{ analytics.cycleTime.avgApprovalToCompletion || 'N/A' }}
                </p>
                <p class="text-sm text-muted">Approval to Completion (days)</p>
              </div>
            </div>
          </UCard>

          <!-- Tables Row -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Template Usage -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Template Usage</h3>
              </template>
              <UTable
                v-if="analytics.byTemplate.length > 0"
                :columns="templateColumns"
                :data="analytics.byTemplate"
              />
              <div v-else class="text-center py-6 text-muted text-sm">
                No template data
              </div>
            </UCard>

            <!-- Top Submitters -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Top Submitters</h3>
              </template>
              <UTable
                v-if="analytics.topSubmitters.length > 0"
                :columns="submitterColumns"
                :data="analytics.topSubmitters"
              />
              <div v-else class="text-center py-6 text-muted text-sm">
                No submitter data
              </div>
            </UCard>
          </div>

          <!-- Priority Distribution -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">Priority Distribution</h3>
            </template>
            <div v-if="analytics.byPriority.length > 0" class="flex items-center gap-6 justify-center py-4">
              <div
                v-for="item in analytics.byPriority"
                :key="item.priority"
                class="text-center"
              >
                <p class="text-2xl font-bold">{{ item.count }}</p>
                <UBadge
                  :color="item.priority === 'urgent' ? 'error' : item.priority === 'high' ? 'warning' : item.priority === 'low' ? 'neutral' : 'info'"
                  variant="subtle"
                  size="xs"
                >
                  {{ item.priority }}
                </UBadge>
              </div>
            </div>
            <div v-else class="text-center py-6 text-muted text-sm">
              No priority data
            </div>
          </UCard>
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>
