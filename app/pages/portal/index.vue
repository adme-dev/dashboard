<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { user } = usePortalAuth()

const { data: dashboard, pending } = useFetch('/api/portal/dashboard')

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(amount)
}

function timeAgo(date: string) {
  const now = new Date()
  const d = new Date(date)
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-7xl mx-auto">
    <!-- Welcome Header -->
    <div>
      <h1 class="text-2xl font-bold">Welcome back, {{ user?.name }}</h1>
      <p class="text-muted">{{ user?.clientName }}</p>
    </div>

    <div v-if="pending" class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div v-for="i in 6" :key="i" class="h-48 rounded-lg bg-elevated animate-pulse" />
    </div>

    <div v-else-if="dashboard" class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Active Projects -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-folder-kanban" class="text-primary" />
              <span class="font-semibold">Active Projects</span>
            </div>
            <UBadge color="primary" variant="subtle">
              {{ dashboard.projects.stats.active }}
            </UBadge>
          </div>
        </template>

        <div class="space-y-3">
          <NuxtLink
            v-for="project in dashboard.projects.active"
            :key="project.id"
            :to="`/portal/projects/${project.id}`"
            class="block p-3 rounded-lg hover:bg-elevated transition-colors"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium text-sm">{{ project.name }}</span>
              <span class="text-xs text-muted">{{ project.progressPercent }}%</span>
            </div>
            <div class="w-full bg-muted/20 rounded-full h-1.5">
              <div
                class="bg-primary rounded-full h-1.5 transition-all"
                :style="{ width: `${project.progressPercent}%` }"
              />
            </div>
            <div class="flex items-center justify-between mt-1.5 text-xs text-muted">
              <span>{{ project.completedTasks }}/{{ project.totalTasks }} tasks</span>
              <span v-if="project.dueDate">Due {{ formatDate(project.dueDate) }}</span>
            </div>
          </NuxtLink>

          <p v-if="!dashboard.projects.active.length" class="text-sm text-muted text-center py-4">
            No active projects
          </p>
        </div>

        <template #footer>
          <NuxtLink to="/portal/projects" class="text-sm text-primary hover:underline">
            View all projects
          </NuxtLink>
        </template>
      </UCard>

      <!-- Pending Approvals -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-check-circle" class="text-warning" />
              <span class="font-semibold">Pending Approvals</span>
            </div>
            <UBadge
              v-if="dashboard.approvals.pendingCount > 0"
              color="warning"
              variant="subtle"
            >
              {{ dashboard.approvals.pendingCount }}
            </UBadge>
          </div>
        </template>

        <div class="space-y-3">
          <NuxtLink
            v-for="approval in dashboard.approvals.pending"
            :key="approval.id"
            :to="`/portal/approvals/${approval.id}`"
            class="block p-3 rounded-lg hover:bg-elevated transition-colors"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium text-sm">{{ approval.title }}</span>
              <UBadge size="xs" variant="subtle" color="neutral">{{ approval.type }}</UBadge>
            </div>
            <div class="flex items-center gap-2 mt-1 text-xs text-muted">
              <span>{{ approval.projectName }}</span>
              <span v-if="approval.dueDate">· Due {{ formatDate(approval.dueDate) }}</span>
            </div>
          </NuxtLink>

          <p v-if="!dashboard.approvals.pending.length" class="text-sm text-muted text-center py-4">
            No pending approvals
          </p>
        </div>

        <template #footer>
          <NuxtLink to="/portal/approvals" class="text-sm text-primary hover:underline">
            View all approvals
          </NuxtLink>
        </template>
      </UCard>

      <!-- Recent Deliverables -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-image" class="text-primary" />
            <span class="font-semibold">Recent Deliverables</span>
          </div>
        </template>

        <div class="grid grid-cols-2 gap-2">
          <NuxtLink
            v-for="item in dashboard.gallery.recent.slice(0, 4)"
            :key="item.id"
            to="/portal/gallery"
            class="relative aspect-video rounded-lg overflow-hidden bg-elevated group"
          >
            <img
              v-if="item.thumbnailUrl"
              :src="item.thumbnailUrl"
              :alt="item.title"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <UIcon name="i-lucide-file" class="w-8 h-8 text-muted" />
            </div>
            <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
              <p class="text-xs text-white truncate">{{ item.title }}</p>
            </div>
          </NuxtLink>
        </div>

        <template #footer>
          <NuxtLink to="/portal/gallery" class="text-sm text-primary hover:underline">
            View gallery
          </NuxtLink>
        </template>
      </UCard>

      <!-- Outstanding Invoices -->
      <UCard v-if="user?.permissions?.canViewInvoices">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-receipt" class="text-primary" />
              <span class="font-semibold">Outstanding Invoices</span>
            </div>
            <span class="text-sm font-semibold text-warning">
              {{ formatCurrency(dashboard.invoices.stats.totalOutstanding) }}
            </span>
          </div>
        </template>

        <div class="space-y-2">
          <div
            v-for="invoice in dashboard.invoices.outstanding"
            :key="invoice.id"
            class="flex items-center justify-between p-2 rounded-lg"
          >
            <div>
              <span class="text-sm font-medium">{{ invoice.invoiceNumber }}</span>
              <p class="text-xs text-muted">Due {{ formatDate(invoice.dueDate) }}</p>
            </div>
            <div class="text-right">
              <span class="text-sm font-semibold">{{ formatCurrency(invoice.amountDue) }}</span>
              <UBadge
                size="xs"
                :color="invoice.status === 'overdue' ? 'error' : 'warning'"
                variant="subtle"
                class="ml-2"
              >
                {{ invoice.status }}
              </UBadge>
            </div>
          </div>

          <p v-if="!dashboard.invoices.outstanding.length" class="text-sm text-muted text-center py-4">
            No outstanding invoices
          </p>
        </div>

        <template #footer>
          <NuxtLink to="/portal/invoices" class="text-sm text-primary hover:underline">
            View all invoices
          </NuxtLink>
        </template>
      </UCard>

      <!-- Upcoming Deadlines -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-calendar-clock" class="text-primary" />
            <span class="font-semibold">Upcoming Deadlines</span>
          </div>
        </template>

        <div class="space-y-2">
          <div
            v-for="deadline in dashboard.upcomingDeadlines"
            :key="deadline.id"
            class="flex items-center gap-3 p-2"
          >
            <div
              class="w-2 h-2 rounded-full shrink-0"
              :style="{ backgroundColor: deadline.status.color || '#6b7280' }"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">{{ deadline.title }}</p>
              <p class="text-xs text-muted">{{ deadline.projectName }}</p>
            </div>
            <span class="text-xs text-muted shrink-0">{{ formatDate(deadline.dueDate) }}</span>
          </div>

          <p v-if="!dashboard.upcomingDeadlines.length" class="text-sm text-muted text-center py-4">
            No upcoming deadlines
          </p>
        </div>
      </UCard>

      <!-- Recent Activity -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-activity" class="text-primary" />
            <span class="font-semibold">Recent Activity</span>
          </div>
        </template>

        <div class="space-y-3">
          <div
            v-for="activity in dashboard.recentActivity"
            :key="activity.id"
            class="flex items-start gap-3"
          >
            <div class="w-6 h-6 rounded-full bg-elevated flex items-center justify-center mt-0.5 shrink-0">
              <UIcon name="i-lucide-activity" class="w-3 h-3 text-muted" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm">
                <span class="font-medium">{{ activity.userName || 'System' }}</span>
                {{ activity.action.replace(/_/g, ' ') }}
              </p>
              <span class="text-xs text-muted">{{ timeAgo(activity.createdAt) }}</span>
            </div>
          </div>

          <p v-if="!dashboard.recentActivity.length" class="text-sm text-muted text-center py-4">
            No recent activity
          </p>
        </div>
      </UCard>
    </div>
  </div>
</template>
