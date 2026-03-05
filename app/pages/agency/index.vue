<script setup lang="ts">
import { format, isPast, isToday, isThisWeek, startOfDay, addDays, parseISO } from 'date-fns'

definePageMeta({ title: 'Dashboard' })

const { user, isManager, isAdmin } = useAuth()
const {
  activeWidgets, pinnedItems, availableWidgets, widgetCategories, allWidgets,
  isVisible, toggleWidget, pinItem, unpinItem,
  loadPreferences, savePreferences, resetToDefaults, applyPersona, saving,
  loaded: prefsLoaded, preferences,
} = useDashboardWidgets()

// --- Load preferences (non-blocking) ---
loadPreferences()

// --- Data fetching (lazy — page renders immediately with skeletons) ---
const { data: teamData, status: teamStatus } = useLazyFetch('/api/agency/team-members')
const { data: kpis, status: kpisStatus } = useLazyFetch('/api/agency/kpis')
const { data: workspacesData, status: wsStatus } = useLazyFetch('/api/agency/workspaces')
const { data: boardsData, status: boardsStatus } = useLazyFetch('/api/agency/boards')
const { data: recentTime, status: timeStatus } = useLazyFetch('/api/agency/time/recent')

// --- Onboarding state ---
const showOnboarding = computed(() => prefsLoaded.value && !preferences.value)

async function handlePersonaSelect(role: string) {
  applyPersona(role)
  await savePreferences()
}

// --- Match current user to their team_member record ---
const myMember = computed(() => {
  const members = (teamData.value as any)?.members || []
  return members.find((m: any) =>
    m.email === user.value?.email || m.name === user.value?.name
  )
})

// --- Fetch my assigned tasks ---
const { data: myTasksData } = useLazyFetch('/api/agency/tasks', {
  query: computed(() => ({
    assigneeId: myMember.value?.id,
    excludeCompleted: 'true',
    limit: 30
  })),
  watch: [myMember]
})

// --- Helpers ---
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value)
const formatPercent = (value: number) => `${value.toFixed(1)}%`
const formatCompact = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`
  return value.toString()
}

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
})
const today = computed(() => format(new Date(), 'EEEE, d MMMM yyyy'))
const firstName = computed(() => user.value?.name?.split(' ')[0] || '')

// --- My Tasks grouped ---
const myTasks = computed(() => (myTasksData.value as any)?.tasks || [])

const overdueTasks = computed(() =>
  myTasks.value.filter((t: any) =>
    t.dueDate && isPast(startOfDay(addDays(parseISO(t.dueDate), 1))) && !t.completedAt
  )
)
const dueTodayTasks = computed(() =>
  myTasks.value.filter((t: any) =>
    t.dueDate && isToday(parseISO(t.dueDate)) && !overdueTasks.value.includes(t)
  )
)
const upcomingTasks = computed(() =>
  myTasks.value.filter((t: any) =>
    t.dueDate && !isPast(startOfDay(addDays(parseISO(t.dueDate), 1))) && !isToday(parseISO(t.dueDate))
  ).slice(0, 5)
)
const noDueDateTasks = computed(() =>
  myTasks.value.filter((t: any) => !t.dueDate).slice(0, 5)
)

const myTaskCount = computed(() => myTasks.value.length)
const overdueCount = computed(() => overdueTasks.value.length)

const priorityColors: Record<string, string> = {
  urgent: 'text-red-600 dark:text-red-400',
  high: 'text-orange-600 dark:text-orange-400',
  medium: 'text-blue-600 dark:text-blue-400',
  low: 'text-neutral-500 dark:text-neutral-400'
}
const priorityIcons: Record<string, string> = {
  urgent: 'i-lucide-alert-circle',
  high: 'i-lucide-arrow-up',
  medium: 'i-lucide-minus',
  low: 'i-lucide-arrow-down'
}

const formatDueDate = (date: string) => {
  const d = parseISO(date)
  if (isToday(d)) return 'Today'
  if (isPast(startOfDay(addDays(d, 1)))) return format(d, 'MMM d') + ' (overdue)'
  if (isThisWeek(d)) return format(d, 'EEEE')
  return format(d, 'MMM d')
}

// --- Workspaces ---
const workspaces = computed(() => (workspacesData.value as any)?.workspaces || [])
const workspaceColors: Record<string, string> = {
  blue: 'bg-blue-500', green: 'bg-emerald-500', purple: 'bg-violet-500',
  red: 'bg-red-500', orange: 'bg-orange-500', yellow: 'bg-amber-500',
  pink: 'bg-pink-500', cyan: 'bg-cyan-500',
}
const getWsColor = (c: string) => workspaceColors[c] || 'bg-neutral-500'
const wsIcons: Record<string, string> = {
  briefcase: 'i-lucide-briefcase', building: 'i-lucide-building-2',
  megaphone: 'i-lucide-megaphone', film: 'i-lucide-film',
  'shopping-bag': 'i-lucide-shopping-bag', users: 'i-lucide-users',
}
const getWsIcon = (i: string) => wsIcons[i] || 'i-lucide-briefcase'

// --- Boards (sorted by activity) ---
const boards = computed(() => {
  const raw = (boardsData.value as any)?.boards || []
  return [...raw]
    .sort((a: any, b: any) => (b.stats?.total || 0) - (a.stats?.total || 0))
    .slice(0, 6)
})
const cleanDescription = (desc: string | null) => {
  if (!desc) return null
  if (desc.startsWith('Imported from Monday')) return null
  return desc
}

// --- Financial KPIs ---
const kpiData = computed(() => kpis.value as any)
const financialMetrics = computed(() => [
  { label: 'Revenue', value: formatCurrency(kpiData.value?.totalRevenue || 0), icon: 'i-lucide-dollar-sign', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10' },
  { label: 'Gross Margin', value: formatPercent(kpiData.value?.grossMargin || 0), icon: 'i-lucide-trending-up', color: (kpiData.value?.grossMargin || 0) >= 30 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400', bg: (kpiData.value?.grossMargin || 0) >= 30 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-amber-50 dark:bg-amber-500/10' },
  { label: 'MRR', value: formatCurrency(kpiData.value?.mrr || 0), icon: 'i-lucide-repeat', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
  { label: 'Active Projects', value: kpiData.value?.activeProjects || 0, icon: 'i-lucide-folder-kanban', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10' },
])

// --- Team utilization (top 6) ---
const teamUtilization = computed(() => (kpiData.value?.teamUtilization || []).slice(0, 6))
const avgUtilization = computed(() => kpiData.value?.avgUtilizationRate || 0)

// --- Budget alerts ---
const budgetAlerts = computed(() => kpiData.value?.budgetAlerts || [])

// --- Time summary ---
const timeSummary = computed(() => (recentTime.value as any)?.summary)

// --- Quick actions ---
const quickActions = [
  { label: 'All Boards', icon: 'i-lucide-layout-grid', to: '/agency/boards' },
  { label: 'Workflow', icon: 'i-lucide-git-branch', to: '/agency/workflow' },
  { label: 'Time Log', icon: 'i-lucide-clock', to: '/agency/time' },
  { label: 'Billing', icon: 'i-lucide-receipt', to: '/agency/billing' },
  { label: 'Ad Spend', icon: 'i-lucide-megaphone', to: '/agency/social/spend' },
  { label: 'Clients', icon: 'i-lucide-building-2', to: '/agency/clients' },
]

// --- Customize modal ---
const showCustomize = ref(false)

async function handleSaveCustomize() {
  await savePreferences()
  showCustomize.value = false
}

// --- Pin board from boards list ---
function handlePinBoard(board: any) {
  pinItem({ type: 'board', id: board.id, label: board.name })
}

// --- Pinned item icons ---
const pinnedTypeIcons: Record<string, string> = {
  board: 'i-lucide-layout-grid',
  task: 'i-lucide-check-square',
  workspace: 'i-lucide-layers',
}
const pinnedTypeRoutes: Record<string, (item: any) => string> = {
  board: (item) => `/agency/boards/${item.id}`,
  task: (item) => `/agency/tasks/${item.id}`,
  workspace: (item) => `/agency/w/${item.id}`,
}
</script>

<template>
  <div class="min-h-screen bg-[var(--ui-bg)] w-full overflow-y-auto">
    <!-- Onboarding for first-time users -->
    <DashboardOnboarding v-if="showOnboarding" @select="handlePersonaSelect" />

    <!-- Main Dashboard -->
    <template v-else>
    <!-- Header -->
    <div class="border-b border-[var(--ui-border)]">
      <div class="px-6 lg:px-8 py-5">
        <div class="flex items-start justify-between">
          <div>
            <h1 class="text-2xl font-semibold text-[var(--ui-text-highlighted)]">
              {{ greeting }}<span v-if="firstName">, {{ firstName }}</span>
            </h1>
            <p class="text-sm text-[var(--ui-text-muted)] mt-0.5">{{ today }}</p>
          </div>
          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="ghost" icon="i-lucide-settings-2" size="sm" @click="showCustomize = true">
              Customize
            </UButton>
            <UButton to="/agency/workflow" color="neutral" variant="outline" icon="i-lucide-kanban" size="sm">
              Workflow
            </UButton>
            <UButton to="/agency/tasks" color="primary" icon="i-lucide-plus" size="sm">
              New Task
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <div class="px-6 lg:px-8 py-6 space-y-6">

      <!-- Pinned Items Row -->
      <div v-if="pinnedItems.length" class="flex items-center gap-3 flex-wrap">
        <span class="text-xs font-medium text-[var(--ui-text-muted)] uppercase tracking-wide">Pinned</span>
        <NuxtLink
          v-for="pin in pinnedItems"
          :key="pin.id"
          :to="pinnedTypeRoutes[pin.type]?.(pin) || '#'"
          class="group flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--ui-border)] hover:border-[var(--ui-border-accented)] hover:bg-[var(--ui-bg-elevated)] transition-all"
        >
          <UIcon :name="pinnedTypeIcons[pin.type] || 'i-lucide-pin'" class="w-3.5 h-3.5 text-[var(--ui-text-muted)]" />
          <span class="text-sm text-[var(--ui-text-highlighted)]">{{ pin.label }}</span>
          <button
            class="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
            @click.prevent.stop="unpinItem(pin.id)"
          >
            <UIcon name="i-lucide-x" class="w-3 h-3 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]" />
          </button>
        </NuxtLink>
      </div>

      <!-- Personal Stats Row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <NbCard hoverable>
          <div class="flex items-center gap-3">
            <div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50 dark:bg-blue-500/10">
              <UIcon name="i-lucide-list-checks" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div class="min-w-0">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">My Tasks</p>
              <USkeleton v-if="teamStatus === 'pending'" class="h-7 w-10 rounded" />
              <p v-else class="text-2xl font-bold text-[var(--ui-text-highlighted)]">{{ myTaskCount }}</p>
            </div>
          </div>
        </NbCard>
        <NbCard hoverable>
          <div class="flex items-center gap-3">
            <div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" :class="overdueCount > 0 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10'">
              <UIcon :name="overdueCount > 0 ? 'i-lucide-alert-triangle' : 'i-lucide-check-circle'" class="w-5 h-5" :class="overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'" />
            </div>
            <div class="min-w-0">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Overdue</p>
              <USkeleton v-if="teamStatus === 'pending'" class="h-7 w-10 rounded" />
              <p v-else class="text-2xl font-bold" :class="overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-[var(--ui-text-highlighted)]'">{{ overdueCount }}</p>
            </div>
          </div>
        </NbCard>
        <NbCard hoverable>
          <div class="flex items-center gap-3">
            <div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-amber-50 dark:bg-amber-500/10">
              <UIcon name="i-lucide-calendar-check" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div class="min-w-0">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Due Today</p>
              <USkeleton v-if="teamStatus === 'pending'" class="h-7 w-10 rounded" />
              <p v-else class="text-2xl font-bold text-[var(--ui-text-highlighted)]">{{ dueTodayTasks.length }}</p>
            </div>
          </div>
        </NbCard>
        <NbCard hoverable>
          <div class="flex items-center gap-3">
            <div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-violet-50 dark:bg-violet-500/10">
              <UIcon name="i-lucide-clock" class="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div class="min-w-0">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Hours This Week</p>
              <USkeleton v-if="timeStatus === 'pending'" class="h-7 w-10 rounded" />
              <p v-else class="text-2xl font-bold text-[var(--ui-text-highlighted)]">{{ timeSummary?.week?.total?.toFixed(1) || '0' }}h</p>
            </div>
          </div>
        </NbCard>
      </div>

      <!-- Main Grid: 2/3 + 1/3 -->
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <!-- Left Column (2/3) -->
        <div class="xl:col-span-2 space-y-6">

          <!-- My Work -->
          <UCard v-if="isVisible('my-work')">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-user" class="w-4 h-4 text-[var(--ui-text-muted)]" />
                  <h3 class="font-semibold text-[var(--ui-text-highlighted)]">My Work</h3>
                </div>
                <UButton to="/agency/tasks" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
                  All Tasks
                </UButton>
              </div>
            </template>

            <div v-if="myTasks.length" class="space-y-5">
              <!-- Overdue -->
              <div v-if="overdueTasks.length">
                <p class="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-red-500" />
                  Overdue ({{ overdueTasks.length }})
                </p>
                <div class="space-y-1">
                  <NuxtLink
                    v-for="task in overdueTasks.slice(0, 5)"
                    :key="task.id"
                    :to="`/agency/boards/${task.department?.name?.toLowerCase().replace(/\s+/g, '-')}`"
                    class="flex items-center gap-3 py-2 px-3 -mx-3 rounded-lg hover:bg-red-50/50 dark:hover:bg-red-500/5 transition-colors group"
                  >
                    <UIcon :name="priorityIcons[task.priority] || 'i-lucide-minus'" class="w-4 h-4 shrink-0" :class="priorityColors[task.priority]" />
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-[var(--ui-text-highlighted)] truncate">{{ task.title }}</p>
                      <p class="text-xs text-[var(--ui-text-muted)]">
                        {{ task.department?.name }}
                        <span v-if="task.dueDate"> &middot; Due {{ format(parseISO(task.dueDate), 'MMM d') }}</span>
                      </p>
                    </div>
                    <UBadge v-if="task.status" :style="{ backgroundColor: task.status.color + '20', color: task.status.color }" variant="subtle" size="xs">
                      {{ task.status.name }}
                    </UBadge>
                  </NuxtLink>
                </div>
              </div>

              <!-- Due Today -->
              <div v-if="dueTodayTasks.length">
                <p class="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Due Today ({{ dueTodayTasks.length }})
                </p>
                <div class="space-y-1">
                  <NuxtLink
                    v-for="task in dueTodayTasks.slice(0, 5)"
                    :key="task.id"
                    :to="`/agency/boards/${task.department?.name?.toLowerCase().replace(/\s+/g, '-')}`"
                    class="flex items-center gap-3 py-2 px-3 -mx-3 rounded-lg hover:bg-amber-50/50 dark:hover:bg-amber-500/5 transition-colors group"
                  >
                    <UIcon :name="priorityIcons[task.priority] || 'i-lucide-minus'" class="w-4 h-4 shrink-0" :class="priorityColors[task.priority]" />
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-[var(--ui-text-highlighted)] truncate">{{ task.title }}</p>
                      <p class="text-xs text-[var(--ui-text-muted)]">{{ task.department?.name }}</p>
                    </div>
                    <UBadge v-if="task.status" :style="{ backgroundColor: task.status.color + '20', color: task.status.color }" variant="subtle" size="xs">
                      {{ task.status.name }}
                    </UBadge>
                  </NuxtLink>
                </div>
              </div>

              <!-- Upcoming -->
              <div v-if="upcomingTasks.length">
                <p class="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] mb-2 flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Upcoming
                </p>
                <div class="space-y-1">
                  <NuxtLink
                    v-for="task in upcomingTasks"
                    :key="task.id"
                    :to="`/agency/boards/${task.department?.name?.toLowerCase().replace(/\s+/g, '-')}`"
                    class="flex items-center gap-3 py-2 px-3 -mx-3 rounded-lg hover:bg-[var(--ui-bg-elevated)] transition-colors group"
                  >
                    <UIcon :name="priorityIcons[task.priority] || 'i-lucide-minus'" class="w-4 h-4 shrink-0" :class="priorityColors[task.priority]" />
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-[var(--ui-text-highlighted)] truncate">{{ task.title }}</p>
                      <p class="text-xs text-[var(--ui-text-muted)]">
                        {{ task.department?.name }}
                        <span v-if="task.dueDate"> &middot; {{ formatDueDate(task.dueDate) }}</span>
                      </p>
                    </div>
                    <UBadge v-if="task.status" :style="{ backgroundColor: task.status.color + '20', color: task.status.color }" variant="subtle" size="xs">
                      {{ task.status.name }}
                    </UBadge>
                  </NuxtLink>
                </div>
              </div>

              <!-- No Due Date -->
              <div v-if="noDueDateTasks.length && !overdueTasks.length && !dueTodayTasks.length && !upcomingTasks.length">
                <p class="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] mb-2 flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                  Assigned to You
                </p>
                <div class="space-y-1">
                  <NuxtLink
                    v-for="task in noDueDateTasks"
                    :key="task.id"
                    :to="`/agency/boards/${task.department?.name?.toLowerCase().replace(/\s+/g, '-')}`"
                    class="flex items-center gap-3 py-2 px-3 -mx-3 rounded-lg hover:bg-[var(--ui-bg-elevated)] transition-colors group"
                  >
                    <UIcon :name="priorityIcons[task.priority] || 'i-lucide-minus'" class="w-4 h-4 shrink-0" :class="priorityColors[task.priority]" />
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-[var(--ui-text-highlighted)] truncate">{{ task.title }}</p>
                      <p class="text-xs text-[var(--ui-text-muted)]">{{ task.department?.name }}</p>
                    </div>
                    <UBadge v-if="task.status" :style="{ backgroundColor: task.status.color + '20', color: task.status.color }" variant="subtle" size="xs">
                      {{ task.status.name }}
                    </UBadge>
                  </NuxtLink>
                </div>
              </div>
            </div>

            <!-- Empty state -->
            <div v-else class="text-center py-8">
              <div class="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                <UIcon name="i-lucide-check-circle" class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">You're all caught up</p>
              <p class="text-xs text-[var(--ui-text-muted)] mt-1">No tasks assigned to you right now</p>
            </div>
          </UCard>

          <!-- Boards -->
          <UCard v-if="isVisible('boards')">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-layout-grid" class="w-4 h-4 text-[var(--ui-text-muted)]" />
                  <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Boards</h3>
                </div>
                <UButton to="/agency/boards" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
                  All Boards
                </UButton>
              </div>
            </template>
            <div v-if="boards.length" class="divide-y divide-[var(--ui-border)]">
              <div
                v-for="board in boards"
                :key="board.id"
                class="group flex items-center gap-4 py-3 first:pt-0 last:pb-0"
              >
                <NuxtLink
                  :to="`/agency/boards/${board.slug}`"
                  class="flex items-center gap-4 flex-1 min-w-0 hover:opacity-80 transition-opacity"
                >
                  <div class="shrink-0 w-2 h-8 rounded-full" :style="{ backgroundColor: board.color || '#6366f1' }" />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-[var(--ui-text-highlighted)] truncate">{{ board.name }}</p>
                    <p v-if="cleanDescription(board.description)" class="text-xs text-[var(--ui-text-muted)] truncate">{{ cleanDescription(board.description) }}</p>
                  </div>
                  <div class="flex items-center gap-3 text-xs text-[var(--ui-text-muted)]">
                    <span v-if="board.stats?.inProgress" class="flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      {{ board.stats.inProgress }} active
                    </span>
                    <UBadge variant="subtle" color="neutral" size="xs">{{ formatCompact(board.stats?.total || 0) }}</UBadge>
                  </div>
                </NuxtLink>
                <UButton
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  icon="i-lucide-pin"
                  class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  :class="pinnedItems.some(p => p.id === board.id) ? '!opacity-100 text-[var(--ui-primary)]' : ''"
                  @click="pinnedItems.some(p => p.id === board.id) ? unpinItem(board.id) : handlePinBoard(board)"
                />
              </div>
            </div>
            <div v-else class="text-center py-6 text-[var(--ui-text-muted)]">
              <p class="text-sm">No boards yet</p>
            </div>
          </UCard>

          <!-- Completion Trends Chart -->
          <ClientOnly v-if="isVisible('completion-trends')">
            <DashboardCompletionTrendsChart />
            <template #fallback>
              <UCard>
                <USkeleton class="w-full h-[200px] rounded-lg" />
              </UCard>
            </template>
          </ClientOnly>

          <!-- Workload Overview Chart -->
          <ClientOnly v-if="isVisible('workload-overview')">
            <DashboardWorkloadChart />
            <template #fallback>
              <UCard>
                <USkeleton class="w-full h-[200px] rounded-lg" />
              </UCard>
            </template>
          </ClientOnly>

          <!-- Job Types Chart -->
          <ClientOnly v-if="isVisible('job-types')">
            <DashboardJobTypesChart />
            <template #fallback>
              <UCard>
                <USkeleton class="w-full h-[200px] rounded-lg" />
              </UCard>
            </template>
          </ClientOnly>

          <!-- Workspaces -->
          <UCard v-if="isVisible('workspaces')">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-layers" class="w-4 h-4 text-[var(--ui-text-muted)]" />
                  <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Workspaces</h3>
                </div>
                <UButton to="/agency/boards" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
                  View All
                </UButton>
              </div>
            </template>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <NuxtLink
                v-for="ws in workspaces"
                :key="ws.id"
                :to="`/agency/w/${ws.slug}`"
                class="group flex items-center gap-3 p-3 rounded-lg border border-[var(--ui-border)] hover:border-[var(--ui-border-accented)] hover:bg-[var(--ui-bg-elevated)] transition-all"
              >
                <div class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white" :class="getWsColor(ws.color || 'blue')">
                  <UIcon :name="getWsIcon(ws.icon || 'briefcase')" class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-[var(--ui-text-highlighted)] truncate group-hover:text-[var(--ui-primary)]">{{ ws.name }}</p>
                  <p class="text-xs text-[var(--ui-text-muted)]">{{ ws.stats?.boards || 0 }} boards</p>
                </div>
                <UBadge variant="subtle" color="neutral" size="sm">{{ formatCompact(ws.stats?.tasks || 0) }}</UBadge>
              </NuxtLink>
            </div>
          </UCard>

          <!-- Financial KPIs -->
          <UCard v-if="isVisible('financial-kpis')">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-bar-chart-3" class="w-4 h-4 text-[var(--ui-text-muted)]" />
                <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Financial Overview</h3>
              </div>
            </template>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div v-for="m in financialMetrics" :key="m.label" class="flex items-center gap-3 p-3 rounded-lg bg-[var(--ui-bg-elevated)]">
                <div class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" :class="m.bg">
                  <UIcon :name="m.icon" class="w-4 h-4" :class="m.color" />
                </div>
                <div class="min-w-0">
                  <p class="text-xs text-[var(--ui-text-muted)]">{{ m.label }}</p>
                  <p class="text-lg font-semibold text-[var(--ui-text-highlighted)] truncate">{{ m.value }}</p>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Client Health (left) -->
          <DashboardClientHealthWidget v-if="isVisible('client-health')" />

          <!-- Briefs Pipeline (left) -->
          <DashboardBriefsPipelineWidget v-if="isVisible('briefs-pipeline')" />

          <!-- Spend Pacing (left) -->
          <DashboardSpendPacingWidget v-if="isVisible('spend-pacing')" />

          <!-- Platform Performance (left, client-only) -->
          <ClientOnly v-if="isVisible('platform-performance')">
            <DashboardPlatformPerformanceWidget />
            <template #fallback>
              <UCard>
                <USkeleton class="w-full h-[200px] rounded-lg" />
              </UCard>
            </template>
          </ClientOnly>

          <!-- Team Capacity (left) -->
          <DashboardTeamCapacityWidget v-if="isVisible('team-capacity')" />

          <!-- Deliverables Due This Week (left) -->
          <DashboardDeliverablesDueWidget v-if="isVisible('deliverables-due')" />

          <!-- Revenue Snapshot (left) -->
          <DashboardRevenueSnapshotWidget v-if="isVisible('revenue-snapshot')" />

          <!-- Project Profitability (left) -->
          <DashboardProjectProfitabilityWidget v-if="isVisible('project-profitability')" />
        </div>

        <!-- Right Column (1/3) -->
        <div class="space-y-6">

          <!-- Notifications -->
          <DashboardNotifications v-if="isVisible('notifications')" />

          <!-- Quick Actions -->
          <UCard v-if="isVisible('quick-actions')">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-zap" class="w-4 h-4 text-[var(--ui-text-muted)]" />
                <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Quick Actions</h3>
              </div>
            </template>
            <div class="grid grid-cols-3 gap-2">
              <NuxtLink
                v-for="action in quickActions"
                :key="action.label"
                :to="action.to"
                class="flex flex-col items-center gap-1.5 p-2.5 rounded-lg border border-[var(--ui-border)] hover:border-[var(--ui-border-accented)] hover:bg-[var(--ui-bg-elevated)] transition-all text-center group"
              >
                <UIcon :name="action.icon" class="w-5 h-5 text-[var(--ui-text-muted)] group-hover:text-[var(--ui-primary)]" />
                <span class="text-[10px] font-medium text-[var(--ui-text-highlighted)] leading-tight">{{ action.label }}</span>
              </NuxtLink>
            </div>
          </UCard>

          <!-- Time This Week -->
          <UCard v-if="isVisible('time-this-week')">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-clock" class="w-4 h-4 text-[var(--ui-text-muted)]" />
                  <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Time This Week</h3>
                </div>
                <UButton to="/agency/time" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
                  Log
                </UButton>
              </div>
            </template>
            <div class="grid grid-cols-2 gap-3">
              <div class="text-center p-3 rounded-lg bg-[var(--ui-bg-elevated)]">
                <p class="text-2xl font-bold text-[var(--ui-text-highlighted)]">{{ timeSummary?.week?.total?.toFixed(1) || '0' }}h</p>
                <p class="text-xs text-[var(--ui-text-muted)]">Total</p>
              </div>
              <div class="text-center p-3 rounded-lg bg-[var(--ui-bg-elevated)]">
                <p class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ timeSummary?.week?.billable?.toFixed(1) || '0' }}h</p>
                <p class="text-xs text-[var(--ui-text-muted)]">Billable</p>
              </div>
            </div>
          </UCard>

          <!-- Team Utilization -->
          <UCard v-if="isVisible('team-utilization')">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-users" class="w-4 h-4 text-[var(--ui-text-muted)]" />
                  <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Team Utilization</h3>
                </div>
                <UBadge :color="avgUtilization >= 70 ? 'success' : 'warning'" variant="subtle" size="sm">
                  {{ formatPercent(avgUtilization) }}
                </UBadge>
              </div>
            </template>
            <div class="space-y-3">
              <div v-for="member in teamUtilization" :key="member.name" class="space-y-1.5">
                <div class="flex justify-between text-sm">
                  <span class="text-[var(--ui-text)] truncate">{{ member.name }}</span>
                  <span class="font-medium shrink-0 ml-2" :class="member.rate >= (member.target || 75) ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'">
                    {{ formatPercent(member.rate) }}
                  </span>
                </div>
                <div class="h-1.5 bg-[var(--ui-bg-elevated)] rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    :class="member.rate >= (member.target || 75) ? 'bg-emerald-500' : 'bg-amber-500'"
                    :style="{ width: `${Math.min(member.rate, 100)}%` }"
                  />
                </div>
              </div>
              <div v-if="teamUtilization.length" class="pt-3 border-t border-[var(--ui-border)]">
                <UButton to="/agency/capacity" variant="link" color="neutral" size="xs" class="w-full justify-center" trailing-icon="i-lucide-arrow-right">
                  View All Team
                </UButton>
              </div>
            </div>
          </UCard>

          <!-- Budget Alerts -->
          <UCard v-if="isVisible('budget-alerts') && budgetAlerts.length">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-shield-alert" class="w-4 h-4 text-amber-500" />
                <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Budget Alerts</h3>
              </div>
            </template>
            <div class="space-y-3">
              <div
                v-for="alert in budgetAlerts"
                :key="alert.project"
                class="p-3 rounded-lg border-l-3"
                :class="alert.severity === 'critical' ? 'border-red-500 bg-red-50 dark:bg-red-500/10' : 'border-amber-500 bg-amber-50 dark:bg-amber-500/10'"
              >
                <div class="flex items-start justify-between gap-2">
                  <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">{{ alert.project }}</p>
                  <UBadge :color="alert.severity === 'critical' ? 'error' : 'warning'" variant="subtle" size="xs">
                    {{ alert.percentUsed }}%
                  </UBadge>
                </div>
                <p class="text-xs text-[var(--ui-text-muted)] mt-1">{{ alert.message }}</p>
              </div>
            </div>
          </UCard>

          <!-- Ad Spend Widget -->
          <DashboardAdSpendWidget v-if="isVisible('ad-spend')" />

          <!-- Proofs Pending (right) -->
          <DashboardProofsPendingWidget v-if="isVisible('proofs-pending')" />

          <!-- My Clients (right) -->
          <DashboardMyClientsWidget v-if="isVisible('my-clients')" />

          <!-- Campaign Alerts (right) -->
          <DashboardCampaignAlertsWidget v-if="isVisible('campaign-alerts')" />

          <!-- Unassigned Work (right) -->
          <DashboardUnassignedWorkWidget v-if="isVisible('unassigned-work')" />

          <!-- Blocked Tasks (right) -->
          <DashboardBlockedTasksWidget v-if="isVisible('blocked-tasks')" />

          <!-- Cash Position (right) -->
          <DashboardCashPositionWidget v-if="isVisible('cash-position')" />

          <!-- Receivables Aging (right) -->
          <DashboardReceivablesAgingWidget v-if="isVisible('receivables-aging')" />

          <!-- Overhead Burn (right) -->
          <DashboardOverheadBurnWidget v-if="isVisible('overhead-burn')" />

          <!-- Recent Creatives (right) -->
          <DashboardRecentCreativesWidget v-if="isVisible('recent-creatives')" />

          <!-- AI Insights (right) -->
          <DashboardAiInsightsWidget v-if="isVisible('ai-insights')" />

          <!-- AI Training (right) -->
          <DashboardAiTrainingWidget v-if="isVisible('ai-training')" />

        </div>
      </div>
    </div>

    </template>

    <!-- Customize Dashboard Modal -->
    <UModal v-model:open="showCustomize">
      <template #content>
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-lg font-semibold text-[var(--ui-text-highlighted)]">Customize Dashboard</h2>
              <p class="text-sm text-[var(--ui-text-muted)] mt-0.5">Choose which widgets to show on your dashboard</p>
            </div>
            <UButton variant="ghost" color="neutral" size="xs" @click="resetToDefaults()">
              Reset to defaults
            </UButton>
          </div>

          <!-- Persona Presets -->
          <div class="mb-5">
            <p class="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] mb-2">Quick Presets</p>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="preset in [
                  { key: 'member', label: 'Designer', icon: 'i-lucide-palette', color: 'text-blue-500' },
                  { key: 'project_manager', label: 'Producer', icon: 'i-lucide-gantt-chart', color: 'text-violet-500' },
                  { key: 'sales', label: 'Account Mgr', icon: 'i-lucide-handshake', color: 'text-emerald-500' },
                  { key: 'marketing', label: 'Media Buyer', icon: 'i-lucide-megaphone', color: 'text-orange-500' },
                  { key: 'consultant', label: 'Finance', icon: 'i-lucide-calculator', color: 'text-cyan-500' },
                  { key: 'owner', label: 'Owner', icon: 'i-lucide-crown', color: 'text-amber-500' },
                ]"
                :key="preset.key"
                class="flex items-center gap-2 p-2 rounded-lg border border-[var(--ui-border)] hover:bg-[var(--ui-bg-elevated)] transition-colors cursor-pointer text-left"
                @click="applyPersona(preset.key)"
              >
                <UIcon :name="preset.icon" class="w-4 h-4 shrink-0" :class="preset.color" />
                <span class="text-xs font-medium text-[var(--ui-text-highlighted)] truncate">{{ preset.label }}</span>
              </button>
            </div>
          </div>

          <div class="space-y-5 max-h-[400px] overflow-y-auto">
            <div v-for="category in widgetCategories" :key="category.label">
              <p class="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] mb-2">{{ category.label }}</p>
              <div class="space-y-1">
                <div
                  v-for="widget in category.widgets"
                  :key="widget.id"
                  class="flex items-center gap-3 p-2.5 rounded-lg border border-[var(--ui-border)] hover:bg-[var(--ui-bg-elevated)] transition-colors cursor-pointer"
                  @click="toggleWidget(widget.id)"
                >
                  <UCheckbox :model-value="isVisible(widget.id)" @update:model-value="toggleWidget(widget.id)" />
                  <div class="w-7 h-7 rounded-md bg-[var(--ui-bg-elevated)] flex items-center justify-center shrink-0">
                    <UIcon :name="widget.icon" class="w-3.5 h-3.5 text-[var(--ui-text-muted)]" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">{{ widget.title }}</p>
                    <p class="text-xs text-[var(--ui-text-muted)]">{{ widget.description }}</p>
                  </div>
                  <UBadge variant="subtle" color="neutral" size="xs">{{ widget.column }}</UBadge>
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[var(--ui-border)]">
            <UButton variant="ghost" color="neutral" @click="showCustomize = false">
              Cancel
            </UButton>
            <UButton color="primary" :loading="saving" @click="handleSaveCustomize">
              Save Layout
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
