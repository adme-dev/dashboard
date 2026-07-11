<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { user } = usePortalAuth()

const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
const dashboard = ref<any | null>(null)
const pending = ref(false)

async function refreshDashboard() {
  pending.value = true
  try {
    dashboard.value = await apiFetch<any>('/api/portal/dashboard')
  } catch {
    dashboard.value = null
  } finally {
    pending.value = false
  }
}

refreshDashboard()

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(amount)
}

const canViewAnalytics = computed(() => user.value?.permissions?.canViewAnalytics)
const canViewInvoices = computed(() => user.value?.permissions?.canViewInvoices)

interface FeatureCard {
  title: string
  description: string
  icon: string
  iconColor: string
  to: string
  permission?: boolean
}

interface ServiceModule {
  title: string
  description: string
  icon: string
  status: 'Active' | 'Included' | 'Available' | 'Restricted'
  proof: string
  metrics: Array<{ label: string, value: string }>
  requestService: string
  to?: string
}

const features = computed<FeatureCard[]>(() => {
  const cards: FeatureCard[] = [
    {
      title: 'Campaigns',
      description: 'Track ad performance across Meta & Google Ads with AI-powered insights, demographic breakdowns, and creative analysis.',
      icon: 'i-lucide-bar-chart-4',
      iconColor: 'text-primary',
      to: '/portal/analytics?metric=leads',
      permission: canViewAnalytics.value
    },
    {
      title: 'Booked Jobs',
      description: 'Monitor booked work, upcoming jobs, completed job history, tasks, and delivery timelines.',
      icon: 'i-lucide-folder-kanban',
      iconColor: 'text-blue-500',
      to: '/portal/projects?view=upcoming'
    },
    {
      title: 'Approvals',
      description: 'Review and approve deliverables, creative concepts, and campaign briefs in one place.',
      icon: 'i-lucide-check-circle',
      iconColor: 'text-amber-500',
      to: '/portal/approvals?status=pending'
    },
    {
      title: 'Creative Gallery',
      description: 'Browse all deliverables and creative assets from your campaigns.',
      icon: 'i-lucide-image',
      iconColor: 'text-violet-500',
      to: '/portal/gallery'
    },
    {
      title: 'Billing',
      description: 'View current billing, outstanding balances, paid invoice history, and project-linked invoice details.',
      icon: 'i-lucide-receipt',
      iconColor: 'text-emerald-500',
      to: '/portal/invoices?view=current',
      permission: canViewInvoices.value
    },
    {
      title: 'Meetings',
      description: 'Join client review calls, see scheduled sessions, and watch shared recordings from your agency.',
      icon: 'i-lucide-video',
      iconColor: 'text-cyan-500',
      to: '/portal/meetings?view=upcoming'
    },
    {
      title: 'Leads',
      description: 'See the portal-visible leads your agency is routing from ad campaigns and forms.',
      icon: 'i-lucide-inbox',
      iconColor: 'text-orange-500',
      to: '/portal/leads',
      permission: canViewAnalytics.value
    },
    {
      title: 'Requests',
      description: 'Submit new briefs, job requests, support items, and follow-up tasks for the agency team.',
      icon: 'i-lucide-message-square-plus',
      iconColor: 'text-fuchsia-500',
      to: '/portal/requests?type=job_request'
    },
    {
      title: 'Notifications',
      description: 'Stay informed with real-time updates on project milestones and approvals.',
      icon: 'i-lucide-bell',
      iconColor: 'text-rose-500',
      to: '/portal/notifications?view=unread'
    }
  ]

  return cards.filter(c => c.permission !== false)
})

const serviceModules = computed<ServiceModule[]>(() => {
  const hasCampaigns = Boolean(dashboard.value?.enterprise?.campaigns?.campaigns)
  const content = dashboard.value?.enterprise?.content
  const hasCreative = Boolean((content?.deliverablesVisible || 0) > 0 || dashboard.value?.gallery?.recent?.length)
  const hasContentBriefs = Boolean((content?.briefsTotal || 0) > 0)
  const hasJobs = Boolean(dashboard.value?.projects?.stats?.total)
  const hasMeetings = Boolean(dashboard.value?.meetings?.stats?.totalVisible)
  const campaigns = dashboard.value?.enterprise?.campaigns
  const jobs = dashboard.value?.projects?.stats
  const meetings = dashboard.value?.meetings?.stats

  return [
    {
      title: 'Paid media',
      description: 'Google, Meta, lead routing, performance review, budget pacing, and campaign growth.',
      icon: 'i-lucide-megaphone',
      status: canViewAnalytics.value ? (hasCampaigns ? 'Active' : 'Included') : 'Restricted',
      proof: hasCampaigns ? `${dashboard.value?.enterprise?.campaigns?.campaigns || 0} campaigns visible` : 'Campaign dashboard module',
      metrics: [
        { label: 'Campaigns', value: String(campaigns?.campaigns || 0) },
        { label: 'Leads 30d', value: String(campaigns?.leadsLast30 || 0) },
        { label: 'CPL', value: campaigns?.costPerLead == null ? '-' : formatCurrency(campaigns.costPerLead) }
      ],
      requestService: 'paid_media',
      to: canViewAnalytics.value ? '/portal/analytics?metric=leads' : undefined
    },
    {
      title: 'Creative production',
      description: 'Campaign assets, design revisions, approvals, gallery delivery, and creative refreshes.',
      icon: 'i-lucide-palette',
      status: hasCreative ? 'Active' : 'Available',
      proof: hasCreative ? `${content?.deliverablesVisible || dashboard.value?.gallery?.recent?.length || 0} shared assets` : 'Request creative work',
      metrics: [
        { label: 'Shared', value: String(content?.deliverablesVisible || 0) },
        { label: 'Final', value: String(content?.deliverablesFinal || 0) },
        { label: 'Approvals', value: String(dashboard.value?.approvals?.pendingCount || 0) }
      ],
      requestService: 'creative',
      to: '/portal/gallery'
    },
    {
      title: 'SEO and content',
      description: 'Content planning, on-page improvements, landing page copy, and organic growth work.',
      icon: 'i-lucide-file-text',
      status: hasContentBriefs ? 'Active' : 'Available',
      proof: hasContentBriefs ? `${content?.briefsTotal || 0} briefs on record` : 'Briefs and requests supported',
      metrics: [
        { label: 'Open', value: String(content?.briefsOpen || 0) },
        { label: 'Needs info', value: String(content?.briefsNeedsInfo || 0) },
        { label: 'Requests', value: String(dashboard.value?.requests?.stats?.open || 0) }
      ],
      requestService: 'seo_content',
      to: (content?.briefsNeedsInfo || 0) > 0 ? '/portal/briefs?status=needs_info' : '/portal/briefs?status=submitted'
    },
    {
      title: 'Web and CRO',
      description: 'Website updates, conversion improvements, forms, landing pages, and tracking fixes.',
      icon: 'i-lucide-monitor-check',
      status: hasJobs ? 'Active' : 'Available',
      proof: hasJobs ? `${dashboard.value?.projects?.stats?.total || 0} jobs on record` : 'Create a job request',
      metrics: [
        { label: 'Active', value: String(jobs?.active || 0) },
        { label: 'History', value: String(dashboard.value?.projects?.completedRecent?.length || 0) }
      ],
      requestService: 'web_cro',
      to: hasJobs ? '/portal/projects?status=active' : '/portal/projects?view=upcoming'
    },
    {
      title: 'Reporting and insights',
      description: 'Executive reporting, lead quality review, next actions, campaign summaries, and exports.',
      icon: 'i-lucide-chart-pie',
      status: canViewAnalytics.value ? 'Included' : 'Restricted',
      proof: canViewAnalytics.value ? 'Analytics exports available' : 'Analytics permission required',
      metrics: [
        { label: 'Visible leads', value: String(campaigns?.visibleLeads || 0) },
        { label: 'Won', value: String(campaigns?.wonLeads || 0) }
      ],
      requestService: 'reporting',
      to: canViewAnalytics.value ? '/portal/analytics?metric=leads' : undefined
    },
    {
      title: 'Strategy and account planning',
      description: 'Review calls, roadmap planning, service prioritisation, and performance check-ins.',
      icon: 'i-lucide-compass',
      status: hasMeetings ? 'Active' : 'Available',
      proof: hasMeetings ? `${dashboard.value?.meetings?.stats?.totalVisible || 0} meetings shared` : 'Request a session',
      metrics: [
        { label: 'Meetings', value: String(meetings?.totalVisible || 0) },
        { label: 'Recordings', value: String(meetings?.recordings || 0) }
      ],
      requestService: 'strategy',
      to: '/portal/meetings?view=upcoming'
    }
  ]
})

const serviceHealth = computed(() => {
  const modules = serviceModules.value
  return {
    total: modules.length,
    active: modules.filter(module => module.status === 'Active').length,
    included: modules.filter(module => module.status === 'Included').length,
    available: modules.filter(module => module.status === 'Available').length,
    restricted: modules.filter(module => module.status === 'Restricted').length,
    requestable: modules.filter(module => user.value?.permissions?.canSubmitRequests && module.status !== 'Restricted').length
  }
})

const nextServiceAction = computed(() => {
  const modules = serviceModules.value
  return modules.find(module => module.status === 'Available')
    || modules.find(module => module.status === 'Included')
    || modules.find(module => module.status === 'Restricted')
    || modules[0]
})

const serviceCoverageItems = computed(() => [
  { label: 'Active', value: serviceHealth.value.active, color: 'success' as const, icon: 'i-lucide-circle-check' },
  { label: 'Included', value: serviceHealth.value.included, color: 'primary' as const, icon: 'i-lucide-package-check' },
  { label: 'Available', value: serviceHealth.value.available, color: 'warning' as const, icon: 'i-lucide-sparkles' },
  { label: 'Restricted', value: serviceHealth.value.restricted, color: 'neutral' as const, icon: 'i-lucide-lock' }
])

function serviceStatusColor(status: ServiceModule['status']) {
  if (status === 'Active') return 'success'
  if (status === 'Included') return 'primary'
  if (status === 'Restricted') return 'neutral'
  return 'warning'
}
</script>

<template>
  <div class="p-6 space-y-8 max-w-7xl mx-auto">
    <!-- Hero Header -->
    <div class="text-center space-y-2 py-4">
      <h1 class="text-3xl font-bold">
        Your Portal at a Glance
      </h1>
      <p class="text-muted text-lg max-w-2xl mx-auto">
        Everything you need to manage your projects, review deliverables, and track campaign performance — all in one place.
      </p>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div v-for="i in 6" :key="i" class="h-72 rounded-xl bg-elevated animate-pulse" />
    </div>

    <!-- Feature Cards -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <UCard
        v-for="feature in features"
        :key="feature.title"
        class="flex flex-col"
        :ui="{ body: 'flex-1' }"
      >
        <template #header>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-elevated flex items-center justify-center shrink-0">
              <UIcon :name="feature.icon" :class="feature.iconColor" class="w-5 h-5" />
            </div>
            <span class="font-semibold text-lg">{{ feature.title }}</span>
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-muted leading-relaxed">
            {{ feature.description }}
          </p>

          <!-- Analytics mini-widget -->
          <div v-if="feature.title === 'Campaigns'" class="rounded-lg bg-elevated/50 p-3">
            <PortalAdPerformanceCard />
          </div>

          <!-- Projects mini-widget -->
          <div v-else-if="feature.title === 'Booked Jobs' && dashboard" class="rounded-lg bg-elevated/50 p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Active projects</span>
              <UBadge color="primary" variant="subtle" size="xs">
                {{ dashboard.projects.stats.active }}
              </UBadge>
            </div>
            <div v-for="project in dashboard.projects.active.slice(0, 2)" :key="project.id" class="space-y-1">
              <div class="flex items-center justify-between text-xs">
                <span class="truncate font-medium">{{ project.name }}</span>
                <span class="text-muted shrink-0 ml-2">{{ project.progressPercent }}%</span>
              </div>
              <div class="w-full bg-muted/20 rounded-full h-1">
                <div
                  class="bg-primary rounded-full h-1 transition-all"
                  :style="{ width: `${project.progressPercent}%` }"
                />
              </div>
            </div>
            <p v-if="!dashboard.projects.active.length" class="text-xs text-muted text-center py-2">
              No active projects
            </p>
          </div>

          <!-- Approvals mini-widget -->
          <div v-else-if="feature.title === 'Approvals' && dashboard" class="rounded-lg bg-elevated/50 p-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Pending review</span>
              <UBadge
                :color="dashboard.approvals.pendingCount > 0 ? 'warning' : 'success'"
                variant="subtle"
                size="xs"
              >
                {{ dashboard.approvals.pendingCount > 0 ? dashboard.approvals.pendingCount + ' pending' : 'All clear' }}
              </UBadge>
            </div>
          </div>

          <!-- Gallery mini-widget -->
          <div v-else-if="feature.title === 'Creative Gallery' && dashboard" class="rounded-lg bg-elevated/50 p-2">
            <div class="grid grid-cols-4 gap-1">
              <div
                v-for="item in dashboard.gallery.recent.slice(0, 4)"
                :key="item.id"
                class="aspect-square rounded overflow-hidden bg-elevated"
              >
                <img
                  v-if="safeMediaUrl(item.thumbnailUrl)"
                  :src="safeMediaUrl(item.thumbnailUrl)"
                  :alt="item.title"
                  class="w-full h-full object-cover"
                >
                <div v-else class="w-full h-full flex items-center justify-center">
                  <UIcon name="i-lucide-file" class="w-4 h-4 text-muted" />
                </div>
              </div>
            </div>
          </div>

          <!-- Invoices mini-widget -->
          <div v-else-if="feature.title === 'Billing' && dashboard" class="rounded-lg bg-elevated/50 p-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Outstanding</span>
              <span class="text-sm font-semibold text-warning">
                {{ formatCurrency(dashboard.invoices.stats.totalOutstanding) }}
              </span>
            </div>
            <div class="flex items-center justify-between mt-1">
              <span class="text-xs text-muted">Invoices due</span>
              <span class="text-xs font-medium">{{ dashboard.invoices.outstanding.length }}</span>
            </div>
          </div>

          <!-- Meetings mini-widget -->
          <div v-else-if="feature.title === 'Meetings' && dashboard" class="rounded-lg bg-elevated/50 p-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Visible meetings</span>
              <UBadge color="primary" variant="subtle" size="xs">
                {{ dashboard.meetings?.stats?.totalVisible || 0 }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between mt-1">
              <span class="text-xs text-muted">Recordings</span>
              <span class="text-xs font-medium">{{ dashboard.meetings?.stats?.recordings || 0 }}</span>
            </div>
          </div>

          <!-- Leads mini-widget -->
          <div v-else-if="feature.title === 'Leads' && dashboard" class="rounded-lg bg-elevated/50 p-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Visible leads</span>
              <span class="text-sm font-semibold">{{ dashboard.leads?.stats?.total || 0 }}</span>
            </div>
            <div class="flex items-center justify-between mt-1">
              <span class="text-xs text-muted">Won leads</span>
              <span class="text-xs font-medium">{{ dashboard.leads?.stats?.won || 0 }}</span>
            </div>
          </div>

          <!-- Requests mini-widget -->
          <div v-else-if="feature.title === 'Requests' && dashboard" class="rounded-lg bg-elevated/50 p-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Submitted</span>
              <span class="text-sm font-semibold">{{ dashboard.requests?.stats?.submitted || 0 }}</span>
            </div>
            <div class="flex items-center justify-between mt-1">
              <span class="text-xs text-muted">In progress</span>
              <span class="text-xs font-medium">{{ dashboard.requests?.stats?.inProgress || 0 }}</span>
            </div>
          </div>

          <!-- Notifications mini-widget -->
          <div v-else-if="feature.title === 'Notifications'" class="rounded-lg bg-elevated/50 p-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Stay up to date</span>
              <UBadge color="neutral" variant="subtle" size="xs">
                Real-time
              </UBadge>
            </div>
          </div>
        </div>

        <template #footer>
          <UButton
            :to="feature.to"
            variant="soft"
            color="primary"
            block
            trailing-icon="i-lucide-arrow-right"
          >
            Explore {{ feature.title }}
          </UButton>
        </template>
      </UCard>
    </div>

    <UCard v-if="!pending">
      <template #header>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-map" class="text-primary" />
            <span class="font-semibold">Service Coverage</span>
          </div>
          <UBadge color="primary" variant="subtle">
            {{ serviceHealth.requestable }} requestable
          </UBadge>
        </div>
      </template>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          v-for="item in serviceCoverageItems"
          :key="item.label"
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="text-xs text-muted">
              {{ item.label }}
            </p>
            <UIcon :name="item.icon" class="size-4 text-muted" />
          </div>
          <p class="mt-1 text-sm font-semibold">
            {{ item.value }}
          </p>
        </button>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <UBadge
          v-for="module in serviceModules"
          :key="module.title"
          :color="serviceStatusColor(module.status)"
          variant="subtle"
        >
          {{ module.title }} · {{ module.status }}
        </UBadge>
      </div>

      <div
        v-if="nextServiceAction"
        class="mt-4 rounded-lg border border-default bg-elevated/50 p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-start gap-3">
          <div class="rounded-md bg-default p-2">
            <UIcon :name="nextServiceAction.icon" class="size-4 text-primary" />
          </div>
          <div>
            <p class="text-sm font-semibold">
              Suggested next step: {{ nextServiceAction.title }}
            </p>
            <p class="text-xs text-muted mt-1">
              {{ nextServiceAction.proof }}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="nextServiceAction.to"
            :to="nextServiceAction.to"
            icon="i-lucide-arrow-right"
            size="xs"
            color="neutral"
            variant="outline"
          >
            Open
          </UButton>
          <UButton
            v-if="user?.permissions?.canSubmitRequests && nextServiceAction.status !== 'Restricted'"
            :to="`/portal/requests?service=${nextServiceAction.requestService}`"
            icon="i-lucide-message-square-plus"
            size="xs"
            color="primary"
            variant="soft"
          >
            Request
          </UButton>
        </div>
      </div>
    </UCard>

    <UCard v-if="!pending">
      <template #header>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-lg font-semibold">
              Services
            </h2>
            <p class="text-sm text-muted mt-1">
              Active services, available workstreams, and request paths for the agency team.
            </p>
          </div>
          <UBadge color="primary" variant="subtle">
            {{ serviceModules.filter(module => module.status === 'Active').length }} active
          </UBadge>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div
          v-for="module in serviceModules"
          :key="module.title"
          class="rounded-lg border border-default bg-default p-4 space-y-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="size-9 rounded-lg bg-elevated flex items-center justify-center shrink-0">
                <UIcon :name="module.icon" class="size-4 text-primary" />
              </div>
              <div class="min-w-0">
                <p class="font-medium truncate">
                  {{ module.title }}
                </p>
                <p class="text-xs text-muted truncate">
                  {{ module.proof }}
                </p>
              </div>
            </div>
            <UBadge :color="serviceStatusColor(module.status)" variant="subtle" size="xs">
              {{ module.status }}
            </UBadge>
          </div>

          <p class="text-sm text-muted leading-relaxed">
            {{ module.description }}
          </p>

          <div v-if="module.metrics.length" class="grid grid-cols-2 gap-2">
            <div
              v-for="metric in module.metrics"
              :key="metric.label"
              class="rounded-md bg-elevated/60 p-2"
            >
              <p class="text-[11px] text-muted">
                {{ metric.label }}
              </p>
              <p class="text-sm font-semibold truncate">
                {{ metric.value }}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="module.to"
              :to="module.to"
              icon="i-lucide-arrow-right"
              variant="outline"
              color="neutral"
              size="sm"
            >
              Open
            </UButton>
            <UButton
              v-if="user?.permissions?.canSubmitRequests"
              :to="`/portal/requests?service=${module.requestService}`"
              icon="i-lucide-message-square-plus"
              color="primary"
              variant="soft"
              size="sm"
            >
              Request
            </UButton>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
