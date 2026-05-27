<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { user } = usePortalAuth()

interface PortalDashboard {
  projects: {
    stats: { total: number, active: number, completed: number, onHold: number }
    active: Array<{ id: string, name: string, dueDate: string | null, progressPercent: number, completedTasks: number, totalTasks: number }>
  }
  approvals: {
    pending: Array<{ id: string, type: string, title: string, dueDate: string | null, projectName: string }>
    pendingCount: number
  }
  leads: {
    stats: { total: number, new: number, won: number }
    recent: Array<{ id: string, source: string, formName: string | null, submittedAt: string, fieldData: Record<string, unknown> | null, status: string, campaignName: string | null }>
  }
  requests: {
    stats: { submitted: number, inProgress: number }
    recent: Array<{ id: string, requestType: string, title: string, priority: string, assignedName: string | null }>
  }
  gallery: {
    recent: Array<{ id: string, title: string, thumbnailUrl: string | null }>
  }
  invoices: {
    stats: { totalOutstanding: number, outstanding: number }
    outstanding: Array<{ id: string, invoiceNumber: string, amountDue: number, dueDate: string | null, status: string }>
  }
  team: {
    members: Array<{ id: string, name: string, email: string | null, phone: string | null, avatarUrl: string | null, role: string | null, department: string | null }>
  }
  meetings: {
    stats: { totalVisible: number, live: number, planned: number, recordings: number }
    upcoming: Array<{ id: string, officeName: string, title: string, status: string, startedAt: string | null, createdAt: string, scheduledStartAt: string | null, durationMinutes: number | null, zoneName: string | null, latestRecordingToken: string | null }>
  }
  upcomingDeadlines: Array<{ id: string, title: string, dueDate: string | null, projectName: string, status: { color: string | null } }>
  recentActivity: Array<{ id: string, action: string, createdAt: string, userName: string | null }>
}

const { data: dashboard, pending } = useFetch<PortalDashboard>('/api/portal/dashboard')

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

function leadSummary(fieldData: Record<string, unknown> | null | undefined) {
  const fields = fieldData ?? {}
  return [
    fields.full_name,
    fields.name,
    fields.email,
    fields.phone_number ?? fields.phone
  ].filter(Boolean).slice(0, 2).map(String).join(' · ')
}

function leadSourceIcon(source: string) {
  if (source === 'google') return 'i-lucide-chrome'
  if (source === 'meta') return 'i-lucide-badge'
  if (source === 'webhook') return 'i-lucide-webhook'
  if (source === 'csv') return 'i-lucide-file-spreadsheet'
  return 'i-lucide-inbox'
}

function leadStatusColor(status: string) {
  if (status === 'new') return 'info'
  if (status === 'contacted') return 'primary'
  if (status === 'qualified') return 'warning'
  if (status === 'won') return 'success'
  if (status === 'lost') return 'neutral'
  return 'error'
}

function meetingStatusColor(status: string) {
  if (status === 'live') return 'success'
  if (status === 'planned') return 'primary'
  if (status === 'ended') return 'neutral'
  return 'warning'
}

function meetingWhen(meeting: { scheduledStartAt?: string | null, startedAt?: string | null, createdAt: string }) {
  const date = meeting.scheduledStartAt || meeting.startedAt || meeting.createdAt
  return new Date(date).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  })
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-7xl mx-auto">
    <!-- Welcome Header -->
    <div>
      <h1 class="text-2xl font-bold">
        Welcome back, {{ user?.name }}
      </h1>
      <p class="text-muted">
        {{ user?.clientName }}
      </p>
    </div>

    <div v-if="pending" class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div v-for="i in 6" :key="i" class="h-48 rounded-lg bg-elevated animate-pulse" />
    </div>

    <div v-else-if="dashboard" class="space-y-6">
      <div class="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6">
        <UCard>
          <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p class="text-sm text-muted">
                Account command centre
              </p>
              <h2 class="text-3xl font-bold tracking-tight mt-1">
                {{ user?.clientName }}
              </h2>
              <p class="text-sm text-muted mt-2 max-w-2xl">
                Jobs booked in, live campaigns, billing, meetings, approvals, and client requests in one place.
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                to="/portal/requests"
                icon="i-lucide-plus"
                color="primary"
              >
                New request
              </UButton>
              <UButton
                v-if="user?.permissions?.canViewAnalytics"
                to="/portal/analytics"
                icon="i-lucide-chart-no-axes-combined"
                variant="outline"
                color="neutral"
              >
                Campaigns
              </UButton>
            </div>
          </div>

          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            <NuxtLink to="/portal/projects" class="rounded-lg bg-elevated/60 p-4 hover:bg-elevated transition-colors">
              <div class="flex items-center gap-2 text-sm text-muted">
                <UIcon name="i-lucide-briefcase-business" class="size-4" />
                Jobs booked
              </div>
              <p class="text-2xl font-bold mt-2">
                {{ dashboard.projects.stats.active }}
              </p>
              <p class="text-xs text-muted">
                {{ dashboard.projects.stats.total }} total projects
              </p>
            </NuxtLink>

            <NuxtLink to="/portal/approvals" class="rounded-lg bg-elevated/60 p-4 hover:bg-elevated transition-colors">
              <div class="flex items-center gap-2 text-sm text-muted">
                <UIcon name="i-lucide-check-check" class="size-4" />
                Awaiting approval
              </div>
              <p class="text-2xl font-bold mt-2">
                {{ dashboard.approvals.pendingCount }}
              </p>
              <p class="text-xs text-muted">
                Client decisions needed
              </p>
            </NuxtLink>

            <NuxtLink to="/portal/leads" class="rounded-lg bg-elevated/60 p-4 hover:bg-elevated transition-colors">
              <div class="flex items-center gap-2 text-sm text-muted">
                <UIcon name="i-lucide-inbox" class="size-4" />
                Shared leads
              </div>
              <p class="text-2xl font-bold mt-2">
                {{ dashboard.leads.stats.total }}
              </p>
              <p class="text-xs text-muted">
                {{ dashboard.leads.stats.new }} new, {{ dashboard.leads.stats.won }} won
              </p>
            </NuxtLink>

            <NuxtLink
              v-if="user?.permissions?.canViewInvoices"
              to="/portal/invoices"
              class="rounded-lg bg-elevated/60 p-4 hover:bg-elevated transition-colors"
            >
              <div class="flex items-center gap-2 text-sm text-muted">
                <UIcon name="i-lucide-receipt-text" class="size-4" />
                Current billing
              </div>
              <p class="text-2xl font-bold mt-2">
                {{ formatCurrency(dashboard.invoices.stats.totalOutstanding) }}
              </p>
              <p class="text-xs text-muted">
                {{ dashboard.invoices.stats.outstanding }} outstanding invoices
              </p>
            </NuxtLink>

            <div v-else class="rounded-lg bg-elevated/60 p-4">
              <div class="flex items-center gap-2 text-sm text-muted">
                <UIcon name="i-lucide-lock" class="size-4" />
                Billing
              </div>
              <p class="text-sm font-medium mt-3">
                Restricted
              </p>
              <p class="text-xs text-muted">
                Ask your agency for access.
              </p>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-video" class="text-primary" />
                <span class="font-semibold">Meetings</span>
              </div>
              <UBadge color="neutral" variant="subtle">
                {{ dashboard.meetings?.stats?.totalVisible || 0 }}
              </UBadge>
            </div>
          </template>

          <div class="space-y-3">
            <div
              v-for="meeting in dashboard.meetings?.upcoming?.slice(0, 3)"
              :key="meeting.id"
              class="rounded-lg border border-default p-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-medium text-sm truncate">
                    {{ meeting.title }}
                  </p>
                  <p class="text-xs text-muted mt-1">
                    {{ meeting.zoneName || meeting.officeName }} · {{ meetingWhen(meeting) }}
                  </p>
                </div>
                <UBadge :color="meetingStatusColor(meeting.status)" variant="subtle" size="xs">
                  {{ meeting.status }}
                </UBadge>
              </div>
              <div class="flex items-center gap-2 mt-3">
                <UButton
                  to="/portal/meetings"
                  icon="i-lucide-door-open"
                  size="xs"
                  variant="outline"
                  color="neutral"
                >
                  Details
                </UButton>
                <UButton
                  v-if="meeting.latestRecordingToken"
                  :to="`/recordings/${meeting.latestRecordingToken}`"
                  icon="i-lucide-play"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                >
                  Recording
                </UButton>
              </div>
            </div>

            <div v-if="!dashboard.meetings?.upcoming?.length" class="text-sm text-muted py-6 text-center">
              No client meetings shared yet.
            </div>
          </div>
        </UCard>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
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

        <!-- Recent Leads -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-inbox" class="text-primary" />
                <span class="font-semibold">Recent Leads</span>
              </div>
              <div class="flex items-center gap-2">
                <UBadge v-if="dashboard.leads.stats.new > 0" color="info" variant="subtle">
                  {{ dashboard.leads.stats.new }} new
                </UBadge>
                <UBadge color="neutral" variant="subtle">
                  {{ dashboard.leads.stats.total }} total
                </UBadge>
              </div>
            </div>
          </template>

          <div class="space-y-3">
            <NuxtLink
              v-for="lead in dashboard.leads.recent"
              :key="lead.id"
              :to="{ path: '/portal/leads', query: { leadId: lead.id } }"
              class="block p-3 rounded-lg hover:bg-elevated transition-colors"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <UIcon :name="leadSourceIcon(lead.source)" class="size-4 text-muted" />
                    <span class="text-sm font-medium truncate">
                      {{ leadSummary(lead.fieldData) || lead.formName || 'Lead inquiry' }}
                    </span>
                  </div>
                  <div class="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span>{{ timeAgo(lead.submittedAt) }}</span>
                    <span v-if="lead.campaignName">· {{ lead.campaignName }}</span>
                  </div>
                </div>
                <UBadge size="xs" variant="subtle" :color="leadStatusColor(lead.status)">
                  {{ lead.status }}
                </UBadge>
              </div>
            </NuxtLink>

            <p v-if="!dashboard.leads.recent.length" class="text-sm text-muted text-center py-4">
              No shared leads yet
            </p>
          </div>

          <template #footer>
            <NuxtLink to="/portal/leads" class="text-sm text-primary hover:underline">
              View all leads
            </NuxtLink>
          </template>
        </UCard>

        <!-- Open Requests -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-message-square-plus" class="text-primary" />
                <span class="font-semibold">Open Requests</span>
              </div>
              <div class="flex items-center gap-2">
                <UBadge v-if="dashboard.requests.stats.submitted > 0" color="warning" variant="subtle">
                  {{ dashboard.requests.stats.submitted }} new
                </UBadge>
                <UBadge v-if="dashboard.requests.stats.inProgress > 0" color="primary" variant="subtle">
                  {{ dashboard.requests.stats.inProgress }} active
                </UBadge>
              </div>
            </div>
          </template>

          <div class="space-y-3">
            <NuxtLink
              v-for="req in dashboard.requests.recent"
              :key="req.id"
              :to="`/portal/requests/${req.id}`"
              class="block p-3 rounded-lg hover:bg-elevated transition-colors"
            >
              <div class="flex items-center justify-between">
                <span class="font-medium text-sm">{{ req.title }}</span>
                <UBadge
                  size="xs"
                  variant="subtle"
                  :color="req.priority === 'urgent' ? 'error' : req.priority === 'high' ? 'warning' : 'neutral'"
                >
                  {{ req.priority }}
                </UBadge>
              </div>
              <div class="flex items-center gap-2 mt-1 text-xs text-muted">
                <span>{{ req.requestType === 'job_request' ? 'Job' : 'Support' }}</span>
                <span v-if="req.assignedName">· {{ req.assignedName }}</span>
              </div>
            </NuxtLink>

            <p v-if="!dashboard.requests.recent.length" class="text-sm text-muted text-center py-4">
              No open requests
            </p>
          </div>

          <template #footer>
            <NuxtLink to="/portal/requests" class="text-sm text-primary hover:underline">
              View all requests
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
                v-if="safeMediaUrl(item.thumbnailUrl)"
                :src="safeMediaUrl(item.thumbnailUrl)"
                :alt="item.title"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform"
              >
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

        <!-- Ad Performance Summary -->
        <UCard v-if="user?.permissions?.canViewAnalytics">
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-bar-chart-4" class="text-primary" />
                <span class="font-semibold">Ad Performance</span>
              </div>
              <UButton
                to="/portal/analytics"
                variant="link"
                color="neutral"
                size="xs"
                trailing-icon="i-lucide-arrow-right"
              >
                Details
              </UButton>
            </div>
          </template>

          <PortalAdPerformanceCard />
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
                <p class="text-xs text-muted">
                  Due {{ formatDate(invoice.dueDate) }}
                </p>
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

        <!-- Your Team -->
        <UCard v-if="dashboard.team.members.length">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-users" class="text-primary" />
              <span class="font-semibold">Your Team</span>
            </div>
          </template>

          <div class="space-y-3">
            <div
              v-for="member in dashboard.team.members"
              :key="member.id"
              class="flex items-center gap-3 p-2"
            >
              <UAvatar :src="member.avatarUrl || undefined" :alt="member.name" size="sm" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium truncate">
                  {{ member.name }}
                </p>
                <p class="text-xs text-muted truncate">
                  {{ member.role || member.department || 'Team Member' }}
                </p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <UButton
                  v-if="member.email"
                  :to="`mailto:${member.email}`"
                  icon="i-lucide-mail"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                />
                <UButton
                  v-if="member.phone"
                  :to="`tel:${member.phone}`"
                  icon="i-lucide-phone"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                />
              </div>
            </div>
          </div>
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
                <p class="text-sm font-medium truncate">
                  {{ deadline.title }}
                </p>
                <p class="text-xs text-muted">
                  {{ deadline.projectName }}
                </p>
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
  </div>
</template>
