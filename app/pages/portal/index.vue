<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { user } = usePortalAuth()

interface PortalDashboard {
  projects: {
    stats: { total: number, active: number, completed: number, onHold: number }
    active: Array<{ id: string, name: string, dueDate: string | null, progressPercent: number, completedTasks: number, totalTasks: number }>
    upcoming: Array<{ id: string, name: string, status: string, startDate: string | null, dueDate: string | null, completedTasks: number, totalTasks: number }>
    completedRecent: Array<{ id: string, name: string, status: string, dueDate: string | null, completedAt: string | null, completedTasks: number, totalTasks: number }>
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
    stats: { total: number, submitted: number, needsReview: number, inProgress: number, open: number, resolved: number }
    recent: Array<{ id: string, requestType: string, title: string, priority: string, status: string, assignedName: string | null, createdAt: string }>
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
  enterprise: {
    jobs: { active: number, overdue: number, dueSoon: number, completedLast30: number, nextDueDate: string | null }
    billing: { outstandingCount: number, overdueCount: number, outstandingAmount: number, aged60Amount: number, aged60Count: number, paidLast90: number, lastPaidAt: string | null, nextDueDate: string | null } | null
    campaigns: { campaigns: number, platforms: number, spend: number, impressions: number, clicks: number, conversions: number, leadsLast30: number, visibleLeads: number, contactedLeadsLast30: number, uncontactedLeadsLast30: number, wonLeads: number, avgResponseMinutesLast30: number | null, costPerLead: number | null, lastSyncedAt: string | null } | null
    access: { totalUsers: number, activeUsers: number, pendingUsers: number, lastLoginAt: string | null }
    content: { briefsTotal: number, briefsOpen: number, briefsNeedsInfo: number, briefsUrgent: number, briefsOverdue: number, briefsSubmitted30d: number, deliverablesVisible: number, deliverablesApproved: number, deliverablesFinal: number, deliverablesRecent30d: number, lastPublishedAt: string | null }
  }
  meetings: {
    stats: { totalVisible: number, live: number, planned: number, recordings: number }
    upcoming: Array<{ id: string, officeName: string, title: string, joinPath: string, status: string, startedAt: string | null, createdAt: string, scheduledStartAt: string | null, durationMinutes: number | null, zoneName: string | null, latestRecordingToken: string | null }>
  }
  upcomingDeadlines: Array<{ id: string, title: string, dueDate: string | null, projectName: string, status: { color: string | null } }>
  recentActivity: Array<{ id: string, action: string, entityType?: string | null, entityId?: string | null, details?: Record<string, unknown> | string | null, createdAt: string, userName: string | null }>
}

const { data: dashboard, pending } = useFetch<PortalDashboard>('/api/portal/dashboard')

type PriorityColor = 'primary' | 'warning' | 'error' | 'success' | 'info' | 'neutral'

interface AccountPriority {
  title: string
  detail: string
  icon: string
  color: PriorityColor
  to: string
}

interface AccountCoverage {
  label: string
  detail: string
  icon: string
  color: PriorityColor
  to: string
  status: 'Live' | 'Available' | 'Restricted'
}

interface EnterpriseScorecardMetric {
  label: string
  value: number
  detail: string
  icon: string
  color: PriorityColor
  to: string
}

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) return 100
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)))
}

function scoreColor(value: number): PriorityColor {
  if (value >= 85) return 'success'
  if (value >= 65) return 'primary'
  if (value >= 45) return 'warning'
  return 'error'
}

const accountPriorities = computed<AccountPriority[]>(() => {
  const data = dashboard.value
  if (!data) return []

  const items: AccountPriority[] = []

  if (data.enterprise.jobs.overdue > 0) {
    items.push({
      title: 'Review overdue job dates',
      detail: `${data.enterprise.jobs.overdue} job${data.enterprise.jobs.overdue === 1 ? '' : 's'} past the planned date`,
      icon: 'i-lucide-calendar-alert',
      color: 'error',
      to: '/portal/projects?view=upcoming'
    })
  } else if (data.enterprise.jobs.dueSoon > 0) {
    items.push({
      title: 'Check upcoming job dates',
      detail: `${data.enterprise.jobs.dueSoon} upcoming deadline${data.enterprise.jobs.dueSoon === 1 ? '' : 's'}`,
      icon: 'i-lucide-calendar-clock',
      color: 'warning',
      to: '/portal/projects?view=upcoming'
    })
  }

  if (data.approvals.pendingCount > 0) {
    items.push({
      title: 'Approve pending work',
      detail: `${data.approvals.pendingCount} item${data.approvals.pendingCount === 1 ? '' : 's'} waiting on your decision`,
      icon: 'i-lucide-check-check',
      color: 'warning',
      to: '/portal/approvals'
    })
  }

  if (data.enterprise.billing?.overdueCount) {
    items.push({
      title: 'Resolve overdue billing',
      detail: `${data.enterprise.billing.overdueCount} overdue invoice${data.enterprise.billing.overdueCount === 1 ? '' : 's'}`,
      icon: 'i-lucide-receipt-text',
      color: 'error',
      to: '/portal/invoices'
    })
  } else if (data.enterprise.billing?.outstandingCount) {
    items.push({
      title: 'Review current billing',
      detail: `${data.enterprise.billing.outstandingCount} outstanding invoice${data.enterprise.billing.outstandingCount === 1 ? '' : 's'}`,
      icon: 'i-lucide-receipt-text',
      color: 'neutral',
      to: '/portal/invoices'
    })
  }

  if (data.meetings.stats.live > 0) {
    items.push({
      title: 'Join live client meeting',
      detail: `${data.meetings.stats.live} live room${data.meetings.stats.live === 1 ? '' : 's'} available now`,
      icon: 'i-lucide-video',
      color: 'success',
      to: '/portal/meetings'
    })
  } else if (data.meetings.stats.planned > 0) {
    items.push({
      title: 'Prepare for upcoming meetings',
      detail: `${data.meetings.stats.planned} planned session${data.meetings.stats.planned === 1 ? '' : 's'}`,
      icon: 'i-lucide-video',
      color: 'primary',
      to: '/portal/meetings'
    })
  }

  if (data.leads.stats.new > 0) {
    items.push({
      title: 'Review new shared leads',
      detail: `${data.leads.stats.new} new lead${data.leads.stats.new === 1 ? '' : 's'} from connected forms`,
      icon: 'i-lucide-inbox',
      color: 'info',
      to: '/portal/leads'
    })
  }

  if (data.enterprise.campaigns?.uncontactedLeadsLast30) {
    items.push({
      title: 'Check lead follow-up',
      detail: `${data.enterprise.campaigns.uncontactedLeadsLast30} shared lead${data.enterprise.campaigns.uncontactedLeadsLast30 === 1 ? '' : 's'} still uncontacted`,
      icon: 'i-lucide-phone-missed',
      color: 'error',
      to: '/portal/leads'
    })
  }

  if (data.requests.stats.open > 0) {
    items.push({
      title: 'Track open requests',
      detail: `${data.requests.stats.open} request${data.requests.stats.open === 1 ? '' : 's'} in progress or review`,
      icon: 'i-lucide-message-square-plus',
      color: 'primary',
      to: '/portal/requests'
    })
  }

  if (data.enterprise.content.briefsOverdue > 0) {
    items.push({
      title: 'Review overdue briefs',
      detail: `${data.enterprise.content.briefsOverdue} brief${data.enterprise.content.briefsOverdue === 1 ? '' : 's'} past the requested date`,
      icon: 'i-lucide-file-clock',
      color: 'warning',
      to: '/portal/briefs'
    })
  } else if (data.enterprise.content.briefsNeedsInfo > 0) {
    items.push({
      title: 'Add brief details',
      detail: `${data.enterprise.content.briefsNeedsInfo} brief${data.enterprise.content.briefsNeedsInfo === 1 ? '' : 's'} need more information`,
      icon: 'i-lucide-file-question',
      color: 'info',
      to: '/portal/briefs'
    })
  }

  if (items.length === 0) {
    items.push({
      title: 'Account is up to date',
      detail: 'No urgent jobs, approvals, billing, meetings, leads, or requests need attention',
      icon: 'i-lucide-circle-check',
      color: 'success',
      to: '/portal/features'
    })
  }

  return items.slice(0, 4)
})

const accountCoverage = computed<AccountCoverage[]>(() => {
  const data = dashboard.value
  if (!data) return []

  const jobsPath = data.projects.stats.active > 0
    ? '/portal/projects?status=active'
    : data.projects.stats.completed > 0 ? '/portal/projects?view=history' : '/portal/projects?view=upcoming'

  return [
    {
      label: 'Jobs',
      detail: `${data.projects.stats.active} active, ${data.projects.stats.completed} completed`,
      icon: 'i-lucide-folder-kanban',
      color: data.projects.stats.total > 0 ? 'success' : 'neutral',
      to: jobsPath,
      status: data.projects.stats.total > 0 ? 'Live' : 'Available'
    },
    {
      label: 'Campaigns',
      detail: data.enterprise.campaigns
        ? `${data.enterprise.campaigns.campaigns} campaigns across ${data.enterprise.campaigns.platforms} platforms`
        : 'Analytics permission required',
      icon: 'i-lucide-chart-no-axes-combined',
      color: data.enterprise.campaigns ? 'success' : 'neutral',
      to: data.enterprise.campaigns ? '/portal/analytics' : '/portal/settings',
      status: data.enterprise.campaigns ? 'Live' : 'Restricted'
    },
    {
      label: 'Billing',
      detail: data.enterprise.billing
        ? `${data.enterprise.billing.outstandingCount} current, ${data.enterprise.billing.overdueCount} overdue`
        : 'Invoice permission required',
      icon: 'i-lucide-receipt-text',
      color: data.enterprise.billing?.overdueCount ? 'error' : data.enterprise.billing ? 'success' : 'neutral',
      to: data.enterprise.billing ? '/portal/invoices' : '/portal/settings',
      status: data.enterprise.billing ? 'Live' : 'Restricted'
    },
    {
      label: 'Approvals',
      detail: `${data.approvals.pendingCount} decision${data.approvals.pendingCount === 1 ? '' : 's'} pending`,
      icon: 'i-lucide-check-check',
      color: data.approvals.pendingCount > 0 ? 'warning' : 'success',
      to: '/portal/approvals',
      status: 'Live'
    },
    {
      label: 'Requests',
      detail: `${data.requests.stats.open} open, ${data.requests.stats.resolved} resolved`,
      icon: 'i-lucide-message-square-plus',
      color: data.requests.stats.open > 0 ? 'primary' : 'success',
      to: '/portal/requests',
      status: 'Live'
    },
    {
      label: 'Briefs & Files',
      detail: `${data.enterprise.content.briefsOpen} open briefs, ${data.enterprise.content.deliverablesVisible} files`,
      icon: 'i-lucide-folder-open-dot',
      color: data.enterprise.content.briefsOverdue > 0 ? 'warning' : data.enterprise.content.deliverablesVisible > 0 ? 'success' : 'neutral',
      to: '/portal/briefs',
      status: data.enterprise.content.briefsTotal > 0 || data.enterprise.content.deliverablesVisible > 0 ? 'Live' : 'Available'
    },
    {
      label: 'Meetings',
      detail: `${data.meetings.stats.planned + data.meetings.stats.live} upcoming, ${data.meetings.stats.recordings} recordings`,
      icon: 'i-lucide-video',
      color: data.meetings.stats.totalVisible > 0 ? 'success' : 'neutral',
      to: '/portal/meetings',
      status: data.meetings.stats.totalVisible > 0 ? 'Live' : 'Available'
    }
  ]
})

const enterpriseScorecard = computed<EnterpriseScorecardMetric[]>(() => {
  const data = dashboard.value
  if (!data) return []

  const activeJobs = data.enterprise.jobs.active
  const deliveryOnTrack = percent(Math.max(activeJobs - data.enterprise.jobs.overdue, 0), activeJobs)
  const metrics: EnterpriseScorecardMetric[] = [
    {
      label: 'Delivery confidence',
      value: deliveryOnTrack,
      detail: activeJobs > 0
        ? `${Math.max(activeJobs - data.enterprise.jobs.overdue, 0)} of ${activeJobs} active jobs on track`
        : `${data.enterprise.jobs.completedLast30} completed in the last 30 days`,
      icon: 'i-lucide-briefcase-business',
      color: scoreColor(deliveryOnTrack),
      to: data.enterprise.jobs.overdue > 0 ? '/portal/projects?view=upcoming' : '/portal/projects'
    }
  ]

  if (data.enterprise.campaigns) {
    const contacted = data.enterprise.campaigns.contactedLeadsLast30
    const uncontacted = data.enterprise.campaigns.uncontactedLeadsLast30
    const followUpScore = percent(contacted, contacted + uncontacted)
    metrics.push({
      label: 'Lead follow-up',
      value: followUpScore,
      detail: `${contacted} contacted, ${uncontacted} awaiting follow-up`,
      icon: 'i-lucide-phone-call',
      color: scoreColor(followUpScore),
      to: '/portal/leads'
    })
  }

  if (data.enterprise.billing) {
    const outstanding = data.enterprise.billing.outstandingCount
    const clear = Math.max(outstanding - data.enterprise.billing.overdueCount, 0)
    const billingScore = percent(clear, outstanding)
    metrics.push({
      label: 'Billing position',
      value: billingScore,
      detail: outstanding > 0
        ? `${data.enterprise.billing.overdueCount} overdue of ${outstanding} outstanding`
        : 'No outstanding invoices',
      icon: 'i-lucide-receipt-text',
      color: scoreColor(billingScore),
      to: data.enterprise.billing.overdueCount > 0 ? '/portal/invoices?status=overdue' : '/portal/invoices?view=current'
    })
  }

  const portalUsers = data.enterprise.access.totalUsers
  const adoptionScore = percent(data.enterprise.access.activeUsers, portalUsers)
  metrics.push({
    label: 'Portal adoption',
    value: adoptionScore,
    detail: `${data.enterprise.access.activeUsers} active, ${data.enterprise.access.pendingUsers} pending users`,
    icon: 'i-lucide-users-round',
    color: scoreColor(adoptionScore),
    to: '/portal/settings'
  })

  const visibleDeliverables = data.enterprise.content.deliverablesVisible
  const contentScore = percent(data.enterprise.content.deliverablesFinal || data.enterprise.content.deliverablesApproved, visibleDeliverables)
  metrics.push({
    label: 'Content readiness',
    value: contentScore,
    detail: visibleDeliverables > 0
      ? `${data.enterprise.content.deliverablesFinal} final, ${data.enterprise.content.deliverablesApproved} approved files`
      : `${data.enterprise.content.briefsOpen} open briefs`,
    icon: 'i-lucide-folder-open-dot',
    color: scoreColor(contentScore),
    to: data.enterprise.content.briefsNeedsInfo > 0 ? '/portal/briefs?status=needs_info' : '/portal/briefs?status=submitted'
  })

  return metrics.slice(0, 5)
})

const accountCoverageSummary = computed(() => {
  const items = accountCoverage.value
  const live = items.filter(item => item.status === 'Live').length
  const available = items.filter(item => item.status === 'Available').length
  const restricted = items.filter(item => item.status === 'Restricted').length
  const needsAction = items.find(item => item.color === 'error' || item.color === 'warning')
    || items.find(item => item.status === 'Available')
    || items.find(item => item.status === 'Restricted')

  return {
    live,
    available,
    restricted,
    total: items.length,
    needsAction
  }
})

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(amount)
}

function formatCompact(amount: number) {
  return new Intl.NumberFormat('en-AU', { notation: 'compact', maximumFractionDigits: 1 }).format(amount)
}

function formatLeadResponse(minutes: number | null | undefined) {
  if (minutes == null || Number.isNaN(minutes)) return '-'
  if (minutes < 60) return `${minutes}m`
  return `${Math.round(minutes / 60)}h`
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

function jobStatusColor(status: string) {
  if (status === 'active') return 'success'
  if (status === 'on_hold') return 'warning'
  if (status === 'completed') return 'neutral'
  if (status === 'cancelled') return 'error'
  return 'primary'
}

function requestStatusColor(status: string) {
  if (status === 'submitted') return 'warning'
  if (status === 'in_review') return 'info'
  if (status === 'approved') return 'success'
  if (status === 'in_progress') return 'primary'
  if (status === 'completed') return 'success'
  if (status === 'cancelled') return 'error'
  return 'neutral'
}

function activityDetails(details: Record<string, unknown> | string | null | undefined) {
  if (!details) return {}
  if (typeof details === 'object') return details
  try {
    const parsed = JSON.parse(details)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function activityIcon(action: string) {
  if (action.includes('request')) return 'i-lucide-message-square'
  if (action.includes('approval')) return 'i-lucide-check-check'
  if (action.includes('login') || action.includes('access')) return 'i-lucide-shield-check'
  if (action.includes('comment')) return 'i-lucide-message-circle'
  return 'i-lucide-activity'
}

function activityLabel(activity: PortalDashboard['recentActivity'][number]) {
  const details = activityDetails(activity.details)
  if (activity.action === 'agency_request_updated') {
    const status = typeof details.status === 'string' ? details.status.replaceAll('_', ' ') : 'updated'
    return `updated your request to ${status}`
  }
  if (activity.action === 'agency_request_reply') return 'replied to your request'
  if (activity.action === 'client_request_submitted') {
    const title = typeof details.title === 'string' ? `: ${details.title}` : ''
    return `submitted a request${title}`
  }
  if (activity.action === 'client_request_message_added') return 'added a request reply'
  if (activity.action === 'agency_portal_access') return 'previewed the client portal'
  if (activity.action === 'invite_accepted') return 'accepted a portal invite'
  if (activity.action === 'approval_response') return 'responded to an approval'
  if (activity.action === 'comment_added') return 'added a comment'
  return activity.action.replaceAll('_', ' ')
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
                to="/portal/requests?type=job_request"
                icon="i-lucide-plus"
                color="primary"
              >
                New request
              </UButton>
              <UButton
                v-if="user?.permissions?.canViewAnalytics"
                to="/portal/analytics?metric=leads"
                icon="i-lucide-chart-no-axes-combined"
                variant="outline"
                color="neutral"
              >
                Campaigns
              </UButton>
            </div>
          </div>

          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            <NuxtLink to="/portal/projects?status=active" class="rounded-lg bg-elevated/60 p-4 hover:bg-elevated transition-colors">
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

            <NuxtLink to="/portal/approvals?status=pending" class="rounded-lg bg-elevated/60 p-4 hover:bg-elevated transition-colors">
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
              to="/portal/invoices?view=current"
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
                  v-if="meeting.status === 'live' || meeting.status === 'planned'"
                  :to="meeting.joinPath"
                  icon="i-lucide-video"
                  size="xs"
                  color="primary"
                  variant="solid"
                >
                  Join
                </UButton>
                <UButton
                  to="/portal/meetings?view=upcoming"
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

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <NuxtLink
          :to="dashboard.enterprise.jobs.overdue > 0 || dashboard.enterprise.jobs.dueSoon > 0
            ? '/portal/projects?view=upcoming'
            : '/portal/projects?status=active'"
          class="rounded-lg border border-default bg-default p-4 hover:bg-elevated transition-colors"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm text-muted">
                Booked job health
              </p>
              <p class="text-2xl font-bold mt-1">
                {{ dashboard.enterprise.jobs.active }}
              </p>
            </div>
            <UIcon name="i-lucide-calendar-check" class="size-5 text-primary" />
          </div>
          <div class="mt-4 grid grid-cols-2 gap-2 text-xs">
            <span class="text-muted">Due soon</span>
            <span class="text-right font-medium">{{ dashboard.enterprise.jobs.dueSoon }}</span>
            <span class="text-muted">Overdue</span>
            <span class="text-right font-medium" :class="dashboard.enterprise.jobs.overdue > 0 ? 'text-error' : ''">
              {{ dashboard.enterprise.jobs.overdue }}
            </span>
            <span class="text-muted">Completed 30d</span>
            <span class="text-right font-medium">{{ dashboard.enterprise.jobs.completedLast30 }}</span>
            <span class="text-muted">Next date</span>
            <span class="text-right font-medium">{{ formatDate(dashboard.enterprise.jobs.nextDueDate) }}</span>
          </div>
        </NuxtLink>

        <NuxtLink
          v-if="dashboard.enterprise.billing"
          :to="dashboard.enterprise.billing.overdueCount > 0 ? '/portal/invoices?status=overdue' : '/portal/invoices?view=current'"
          class="rounded-lg border border-default bg-default p-4 hover:bg-elevated transition-colors"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm text-muted">
                Billing health
              </p>
              <p class="text-2xl font-bold mt-1">
                {{ formatCurrency(dashboard.enterprise.billing.outstandingAmount) }}
              </p>
            </div>
            <UIcon name="i-lucide-receipt-text" class="size-5 text-primary" />
          </div>
          <div class="mt-4 grid grid-cols-2 gap-2 text-xs">
            <span class="text-muted">Outstanding</span>
            <span class="text-right font-medium">{{ dashboard.enterprise.billing.outstandingCount }}</span>
            <span class="text-muted">Overdue</span>
            <span class="text-right font-medium" :class="dashboard.enterprise.billing.overdueCount > 0 ? 'text-error' : ''">
              {{ dashboard.enterprise.billing.overdueCount }}
            </span>
            <span class="text-muted">Paid 90d</span>
            <span class="text-right font-medium">{{ formatCurrency(dashboard.enterprise.billing.paidLast90) }}</span>
            <span class="text-muted">60+ days</span>
            <span class="text-right font-medium" :class="dashboard.enterprise.billing.aged60Amount > 0 ? 'text-error' : ''">
              {{ dashboard.enterprise.billing.aged60Amount > 0 ? formatCurrency(dashboard.enterprise.billing.aged60Amount) : '-' }}
            </span>
            <span class="text-muted">Next due</span>
            <span class="text-right font-medium">{{ formatDate(dashboard.enterprise.billing.nextDueDate) }}</span>
          </div>
        </NuxtLink>

        <div v-else class="rounded-lg border border-default bg-default p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm text-muted">
                Billing health
              </p>
              <p class="text-base font-semibold mt-2">
                Restricted
              </p>
            </div>
            <UIcon name="i-lucide-lock" class="size-5 text-muted" />
          </div>
          <p class="mt-4 text-xs text-muted">
            Invoice access is controlled by your portal permissions.
          </p>
        </div>

        <NuxtLink
          v-if="dashboard.enterprise.campaigns"
          to="/portal/analytics?metric=leads"
          class="rounded-lg border border-default bg-default p-4 hover:bg-elevated transition-colors"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm text-muted">
                Campaign health
              </p>
              <p class="text-2xl font-bold mt-1">
                {{ dashboard.enterprise.campaigns.campaigns }}
              </p>
            </div>
            <UIcon name="i-lucide-chart-no-axes-combined" class="size-5 text-primary" />
          </div>
          <div class="mt-4 grid grid-cols-2 gap-2 text-xs">
            <span class="text-muted">Spend</span>
            <span class="text-right font-medium">{{ formatCurrency(dashboard.enterprise.campaigns.spend) }}</span>
            <span class="text-muted">Leads 30d</span>
            <span class="text-right font-medium">{{ dashboard.enterprise.campaigns.leadsLast30 }}</span>
            <span class="text-muted">Contacted</span>
            <span class="text-right font-medium">{{ dashboard.enterprise.campaigns.contactedLeadsLast30 }}</span>
            <span class="text-muted">Uncontacted</span>
            <span class="text-right font-medium" :class="dashboard.enterprise.campaigns.uncontactedLeadsLast30 > 0 ? 'text-error' : ''">
              {{ dashboard.enterprise.campaigns.uncontactedLeadsLast30 }}
            </span>
            <span class="text-muted">Avg response</span>
            <span class="text-right font-medium">{{ formatLeadResponse(dashboard.enterprise.campaigns.avgResponseMinutesLast30) }}</span>
            <span class="text-muted">Cost / lead</span>
            <span class="text-right font-medium">
              {{ dashboard.enterprise.campaigns.costPerLead == null ? '-' : formatCurrency(dashboard.enterprise.campaigns.costPerLead) }}
            </span>
            <span class="text-muted">Clicks</span>
            <span class="text-right font-medium">{{ formatCompact(dashboard.enterprise.campaigns.clicks) }}</span>
          </div>
        </NuxtLink>

        <div v-else class="rounded-lg border border-default bg-default p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm text-muted">
                Campaign health
              </p>
              <p class="text-base font-semibold mt-2">
                Restricted
              </p>
            </div>
            <UIcon name="i-lucide-lock" class="size-5 text-muted" />
          </div>
          <p class="mt-4 text-xs text-muted">
            Analytics access is controlled by your portal permissions.
          </p>
        </div>

        <NuxtLink to="/portal/settings" class="rounded-lg border border-default bg-default p-4 hover:bg-elevated transition-colors">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm text-muted">
                Portal access
              </p>
              <p class="text-2xl font-bold mt-1">
                {{ dashboard.enterprise.access.activeUsers }}
              </p>
            </div>
            <UIcon name="i-lucide-users-round" class="size-5 text-primary" />
          </div>
          <div class="mt-4 grid grid-cols-2 gap-2 text-xs">
            <span class="text-muted">Total users</span>
            <span class="text-right font-medium">{{ dashboard.enterprise.access.totalUsers }}</span>
            <span class="text-muted">Pending</span>
            <span class="text-right font-medium">{{ dashboard.enterprise.access.pendingUsers }}</span>
            <span class="text-muted">Last login</span>
            <span class="text-right font-medium">{{ dashboard.enterprise.access.lastLoginAt ? timeAgo(dashboard.enterprise.access.lastLoginAt) : '-' }}</span>
          </div>
        </NuxtLink>

        <NuxtLink :to="dashboard.enterprise.content.briefsNeedsInfo > 0 ? '/portal/briefs?status=needs_info' : '/portal/briefs?status=submitted'" class="rounded-lg border border-default bg-default p-4 hover:bg-elevated transition-colors">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm text-muted">
                Briefs & files
              </p>
              <p class="text-2xl font-bold mt-1" :class="dashboard.enterprise.content.briefsOverdue > 0 ? 'text-warning' : ''">
                {{ dashboard.enterprise.content.briefsOpen }}
              </p>
            </div>
            <UIcon name="i-lucide-folder-open-dot" class="size-5 text-primary" />
          </div>
          <div class="mt-4 grid grid-cols-2 gap-2 text-xs">
            <span class="text-muted">Open briefs</span>
            <span class="text-right font-medium">{{ dashboard.enterprise.content.briefsOpen }}</span>
            <span class="text-muted">Need info</span>
            <span class="text-right font-medium">{{ dashboard.enterprise.content.briefsNeedsInfo }}</span>
            <span class="text-muted">Overdue</span>
            <span class="text-right font-medium" :class="dashboard.enterprise.content.briefsOverdue > 0 ? 'text-warning' : ''">
              {{ dashboard.enterprise.content.briefsOverdue }}
            </span>
            <span class="text-muted">Shared files</span>
            <span class="text-right font-medium">{{ dashboard.enterprise.content.deliverablesVisible }}</span>
            <span class="text-muted">Recent files</span>
            <span class="text-right font-medium">{{ dashboard.enterprise.content.deliverablesRecent30d }}</span>
            <span class="text-muted">Last shared</span>
            <span class="text-right font-medium">{{ formatDate(dashboard.enterprise.content.lastPublishedAt) }}</span>
          </div>
        </NuxtLink>
      </div>

      <UCard>
        <template #header>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-gauge" class="text-primary" />
              <span class="font-semibold">Operational Scorecard</span>
            </div>
            <UButton
              to="/portal/features"
              variant="ghost"
              color="neutral"
              size="xs"
              trailing-icon="i-lucide-arrow-right"
            >
              Services
            </UButton>
          </div>
        </template>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <NuxtLink
            v-for="metric in enterpriseScorecard"
            :key="metric.label"
            :to="metric.to"
            class="rounded-lg border border-default bg-default p-4 hover:bg-elevated transition-colors"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="rounded-md bg-elevated p-2">
                <UIcon :name="metric.icon" class="size-4" />
              </div>
              <UBadge :color="metric.color" variant="subtle" size="xs">
                {{ metric.value }}%
              </UBadge>
            </div>
            <p class="mt-3 text-sm font-semibold">
              {{ metric.label }}
            </p>
            <UProgress
              :value="metric.value"
              :color="metric.color"
              size="xs"
              class="mt-3"
            />
            <p class="mt-2 text-xs text-muted">
              {{ metric.detail }}
            </p>
          </NuxtLink>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-list-checks" class="text-primary" />
              <span class="font-semibold">Account Priorities</span>
            </div>
            <UButton
              to="/portal/features"
              variant="ghost"
              color="neutral"
              size="xs"
              trailing-icon="i-lucide-arrow-right"
            >
              Services
            </UButton>
          </div>
        </template>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <NuxtLink
            v-for="priority in accountPriorities"
            :key="priority.title"
            :to="priority.to"
            class="rounded-lg border border-default bg-default p-3 hover:bg-elevated transition-colors"
          >
            <div class="flex items-start gap-3">
              <div class="rounded-md bg-elevated p-2">
                <UIcon :name="priority.icon" class="size-4" />
              </div>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-semibold">
                    {{ priority.title }}
                  </p>
                  <UBadge :color="priority.color" variant="subtle" size="xs">
                    Action
                  </UBadge>
                </div>
                <p class="mt-1 text-xs text-muted">
                  {{ priority.detail }}
                </p>
              </div>
            </div>
          </NuxtLink>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-panels-top-left" class="text-primary" />
              <span class="font-semibold">Account Coverage</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge color="success" variant="subtle">
                {{ accountCoverageSummary.live }} live
              </UBadge>
              <UBadge color="warning" variant="subtle">
                {{ accountCoverageSummary.available }} available
              </UBadge>
              <UBadge v-if="accountCoverageSummary.restricted" color="neutral" variant="subtle">
                {{ accountCoverageSummary.restricted }} restricted
              </UBadge>
              <UButton
                to="/portal/features"
                variant="ghost"
                color="neutral"
                size="xs"
                trailing-icon="i-lucide-arrow-right"
              >
                Service catalogue
              </UButton>
            </div>
          </div>
        </template>

        <div
          v-if="accountCoverageSummary.needsAction"
          class="mb-4 rounded-lg border border-default bg-elevated/50 p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex items-start gap-3">
            <div class="rounded-md bg-default p-2">
              <UIcon :name="accountCoverageSummary.needsAction.icon" class="size-4" />
            </div>
            <div>
              <p class="text-sm font-semibold">
                Next service focus: {{ accountCoverageSummary.needsAction.label }}
              </p>
              <p class="text-xs text-muted mt-1">
                {{ accountCoverageSummary.needsAction.detail }}
              </p>
            </div>
          </div>
          <UButton
            :to="accountCoverageSummary.needsAction.to"
            :icon="accountCoverageSummary.needsAction.icon"
            size="xs"
            color="primary"
            variant="soft"
          >
            Open
          </UButton>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
          <NuxtLink
            v-for="item in accountCoverage"
            :key="item.label"
            :to="item.to"
            class="rounded-lg border border-default bg-default p-3 hover:bg-elevated transition-colors"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="rounded-md bg-elevated p-2">
                <UIcon :name="item.icon" class="size-4" />
              </div>
              <UBadge :color="item.color" variant="subtle" size="xs">
                {{ item.status }}
              </UBadge>
            </div>
            <p class="mt-3 text-sm font-semibold">
              {{ item.label }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ item.detail }}
            </p>
          </NuxtLink>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-briefcase-business" class="text-primary" />
              <span class="font-semibold">Job Timeline</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                to="/portal/projects?view=upcoming"
                variant="ghost"
                color="neutral"
                size="xs"
                trailing-icon="i-lucide-arrow-right"
              >
                Upcoming
              </UButton>
              <UButton
                to="/portal/projects?view=history"
                variant="ghost"
                color="neutral"
                size="xs"
                trailing-icon="i-lucide-arrow-right"
              >
                History
              </UButton>
            </div>
          </div>
        </template>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section>
            <div class="mb-3">
              <h3 class="text-sm font-semibold">
                Upcoming jobs
              </h3>
              <p class="text-xs text-muted">
                Booked work and scheduled projects coming up.
              </p>
            </div>
            <div class="space-y-2">
              <NuxtLink
                v-for="job in dashboard.projects.upcoming"
                :key="job.id"
                :to="`/portal/projects/${job.id}`"
                class="block rounded-lg border border-default bg-default p-3 hover:bg-elevated transition-colors"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">
                      {{ job.name }}
                    </p>
                    <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span v-if="job.dueDate">Due {{ formatDate(job.dueDate) }}</span>
                      <span v-else-if="job.startDate">Starts {{ formatDate(job.startDate) }}</span>
                      <span>{{ job.completedTasks }}/{{ job.totalTasks }} tasks</span>
                    </div>
                  </div>
                  <UBadge :color="jobStatusColor(job.status)" variant="subtle" size="xs">
                    {{ job.status.replace('_', ' ') }}
                  </UBadge>
                </div>
              </NuxtLink>
              <p v-if="!dashboard.projects.upcoming.length" class="text-sm text-muted text-center py-6">
                No upcoming jobs booked
              </p>
            </div>
          </section>

          <section>
            <div class="mb-3">
              <h3 class="text-sm font-semibold">
                Recent completed jobs
              </h3>
              <p class="text-xs text-muted">
                Finished work available in the client job history.
              </p>
            </div>
            <div class="space-y-2">
              <NuxtLink
                v-for="job in dashboard.projects.completedRecent"
                :key="job.id"
                :to="`/portal/projects/${job.id}`"
                class="block rounded-lg border border-default bg-default p-3 hover:bg-elevated transition-colors"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">
                      {{ job.name }}
                    </p>
                    <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span>{{ job.completedAt ? `Completed ${formatDate(job.completedAt)}` : 'Completed' }}</span>
                      <span v-if="job.dueDate">Due {{ formatDate(job.dueDate) }}</span>
                      <span>{{ job.completedTasks }}/{{ job.totalTasks }} tasks</span>
                    </div>
                  </div>
                  <UBadge :color="jobStatusColor(job.status)" variant="subtle" size="xs">
                    {{ job.status.replace('_', ' ') }}
                  </UBadge>
                </div>
              </NuxtLink>
              <p v-if="!dashboard.projects.completedRecent.length" class="text-sm text-muted text-center py-6">
                No completed job history yet
              </p>
            </div>
          </section>
        </div>
      </UCard>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Active Jobs -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-folder-kanban" class="text-primary" />
                <span class="font-semibold">Active Jobs</span>
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
            <NuxtLink to="/portal/approvals?status=pending" class="text-sm text-primary hover:underline">
              View pending approvals
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
                <UBadge v-if="dashboard.requests.stats.open > 0" color="primary" variant="subtle">
                  {{ dashboard.requests.stats.open }} open
                </UBadge>
                <UBadge v-if="dashboard.requests.stats.needsReview > 0" color="warning" variant="subtle">
                  {{ dashboard.requests.stats.needsReview }} review
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
                <div class="flex items-center gap-1">
                  <UBadge
                    size="xs"
                    variant="subtle"
                    :color="requestStatusColor(req.status)"
                  >
                    {{ req.status.replace(/_/g, ' ') }}
                  </UBadge>
                  <UBadge
                    size="xs"
                    variant="outline"
                    :color="req.priority === 'urgent' ? 'error' : req.priority === 'high' ? 'warning' : 'neutral'"
                  >
                    {{ req.priority }}
                  </UBadge>
                </div>
              </div>
              <div class="flex items-center gap-2 mt-1 text-xs text-muted">
                <span>{{ req.requestType === 'job_request' ? 'Job' : 'Support' }}</span>
                <span v-if="req.assignedName">· {{ req.assignedName }}</span>
                <span>· {{ timeAgo(req.createdAt) }}</span>
              </div>
            </NuxtLink>

            <p v-if="!dashboard.requests.recent.length" class="text-sm text-muted text-center py-4">
              No open requests
            </p>
          </div>

          <template #footer>
            <NuxtLink to="/portal/requests" class="text-sm text-primary hover:underline">
              View open requests
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
                to="/portal/analytics?metric=leads"
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
            <NuxtLink to="/portal/invoices?view=current" class="text-sm text-primary hover:underline">
              View current invoices
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
                <UIcon :name="activityIcon(activity.action)" class="w-3 h-3 text-muted" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm">
                  <span class="font-medium">{{ activity.userName || 'Agency team' }}</span>
                  {{ activityLabel(activity) }}
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
