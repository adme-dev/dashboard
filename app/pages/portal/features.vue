<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { user } = usePortalAuth()

const { data: dashboard, pending } = useFetch('/api/portal/dashboard')

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

const features = computed<FeatureCard[]>(() => {
  const cards: FeatureCard[] = [
    {
      title: 'Campaign Analytics',
      description: 'Track ad performance across Meta & Google Ads with AI-powered insights, demographic breakdowns, and creative analysis.',
      icon: 'i-lucide-bar-chart-4',
      iconColor: 'text-primary',
      to: '/portal/analytics',
      permission: canViewAnalytics.value,
    },
    {
      title: 'Projects',
      description: 'Monitor project progress, track tasks, and stay on top of deadlines.',
      icon: 'i-lucide-folder-kanban',
      iconColor: 'text-blue-500',
      to: '/portal/projects',
    },
    {
      title: 'Approvals',
      description: 'Review and approve deliverables, creative concepts, and campaign briefs in one place.',
      icon: 'i-lucide-check-circle',
      iconColor: 'text-amber-500',
      to: '/portal/approvals',
    },
    {
      title: 'Creative Gallery',
      description: 'Browse all deliverables and creative assets from your campaigns.',
      icon: 'i-lucide-image',
      iconColor: 'text-violet-500',
      to: '/portal/gallery',
    },
    {
      title: 'Invoices',
      description: 'View invoices, payment history, and outstanding balances.',
      icon: 'i-lucide-receipt',
      iconColor: 'text-emerald-500',
      to: '/portal/invoices',
      permission: canViewInvoices.value,
    },
    {
      title: 'Notifications',
      description: 'Stay informed with real-time updates on project milestones and approvals.',
      icon: 'i-lucide-bell',
      iconColor: 'text-rose-500',
      to: '/portal/notifications',
    },
  ]

  return cards.filter(c => c.permission !== false)
})
</script>

<template>
  <div class="p-6 space-y-8 max-w-7xl mx-auto">
    <!-- Hero Header -->
    <div class="text-center space-y-2 py-4">
      <h1 class="text-3xl font-bold">Your Portal at a Glance</h1>
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
          <p class="text-sm text-muted leading-relaxed">{{ feature.description }}</p>

          <!-- Analytics mini-widget -->
          <div v-if="feature.title === 'Campaign Analytics'" class="rounded-lg bg-elevated/50 p-3">
            <PortalAdPerformanceCard />
          </div>

          <!-- Projects mini-widget -->
          <div v-else-if="feature.title === 'Projects' && dashboard" class="rounded-lg bg-elevated/50 p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted">Active projects</span>
              <UBadge color="primary" variant="subtle" size="xs">{{ dashboard.projects.stats.active }}</UBadge>
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
            <p v-if="!dashboard.projects.active.length" class="text-xs text-muted text-center py-2">No active projects</p>
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
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <UIcon name="i-lucide-file" class="w-4 h-4 text-muted" />
                </div>
              </div>
            </div>
          </div>

          <!-- Invoices mini-widget -->
          <div v-else-if="feature.title === 'Invoices' && dashboard" class="rounded-lg bg-elevated/50 p-3">
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
  </div>
</template>
