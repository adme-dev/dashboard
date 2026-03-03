/**
 * Dashboard Widget System Composable
 * Manages widget visibility, ordering, pinned items, and preference persistence
 */

export interface PinnedItem {
  type: 'board' | 'task' | 'workspace'
  id: string
  label: string
}

export interface DashboardPreferences {
  widgets: string[]
  pinnedItems: PinnedItem[]
}

export interface WidgetDefinition {
  id: string
  title: string
  icon: string
  description: string
  defaultRoles: string[]
  column: 'left' | 'right'
}

const ALL_WIDGETS: WidgetDefinition[] = [
  // --- Existing widgets ---
  { id: 'my-work', title: 'My Work', icon: 'i-lucide-user', description: 'Tasks assigned to you', defaultRoles: ['admin', 'owner', 'project_manager', 'member', 'consultant', 'sales', 'marketing'], column: 'left' },
  { id: 'notifications', title: 'Notifications', icon: 'i-lucide-bell', description: 'Recent notifications', defaultRoles: ['admin', 'owner', 'project_manager', 'member', 'consultant', 'sales', 'marketing'], column: 'right' },
  { id: 'boards', title: 'Boards', icon: 'i-lucide-layout-grid', description: 'Active boards', defaultRoles: ['admin', 'owner', 'project_manager', 'member', 'consultant', 'sales', 'marketing'], column: 'left' },
  { id: 'workspaces', title: 'Workspaces', icon: 'i-lucide-layers', description: 'Your workspaces', defaultRoles: ['admin', 'owner', 'project_manager', 'member', 'sales', 'marketing'], column: 'left' },
  { id: 'quick-actions', title: 'Quick Actions', icon: 'i-lucide-zap', description: 'Shortcuts to common pages', defaultRoles: ['admin', 'owner', 'project_manager', 'member', 'sales', 'marketing'], column: 'right' },
  { id: 'time-this-week', title: 'Time This Week', icon: 'i-lucide-clock', description: 'Your time tracking summary', defaultRoles: ['admin', 'owner', 'project_manager', 'member', 'sales', 'marketing'], column: 'right' },
  { id: 'budget-alerts', title: 'Budget Alerts', icon: 'i-lucide-shield-alert', description: 'Projects over budget', defaultRoles: ['admin', 'owner', 'project_manager', 'marketing'], column: 'right' },
  { id: 'financial-kpis', title: 'Financial Overview', icon: 'i-lucide-bar-chart-3', description: 'Revenue, margin, MRR', defaultRoles: ['admin', 'owner', 'consultant'], column: 'left' },
  { id: 'team-utilization', title: 'Team Utilization', icon: 'i-lucide-users', description: 'Team capacity breakdown', defaultRoles: ['admin', 'owner', 'project_manager'], column: 'right' },
  { id: 'completion-trends', title: 'Completion Trends', icon: 'i-lucide-trending-up', description: 'Tasks completed vs created', defaultRoles: ['admin', 'owner', 'project_manager'], column: 'left' },
  { id: 'workload-overview', title: 'Workload Overview', icon: 'i-lucide-bar-chart-horizontal', description: 'Department task distribution', defaultRoles: ['admin', 'owner', 'project_manager'], column: 'left' },
  { id: 'job-types', title: 'Job Types', icon: 'i-lucide-pie-chart', description: 'Brief categories breakdown', defaultRoles: ['admin', 'owner', 'project_manager'], column: 'left' },
  { id: 'ad-spend', title: 'Ad Spend', icon: 'i-lucide-megaphone', description: 'Meta & Google ad spend summary', defaultRoles: ['admin', 'owner', 'marketing'], column: 'right' },
  // --- Account Manager widgets ---
  { id: 'client-health', title: 'Client Health', icon: 'i-lucide-heart-pulse', description: 'Client health scorecard with margin & activity', defaultRoles: ['admin', 'owner', 'sales'], column: 'left' },
  { id: 'proofs-pending', title: 'Proofs Pending', icon: 'i-lucide-eye', description: 'Proofs awaiting review', defaultRoles: ['admin', 'owner', 'project_manager', 'member'], column: 'right' },
  { id: 'briefs-pipeline', title: 'Briefs Pipeline', icon: 'i-lucide-file-text', description: 'Brief status pipeline overview', defaultRoles: ['admin', 'owner', 'project_manager', 'sales'], column: 'left' },
  { id: 'my-clients', title: 'My Clients', icon: 'i-lucide-building-2', description: 'Your assigned clients', defaultRoles: ['admin', 'owner', 'sales'], column: 'right' },
  // --- Media Buyer widgets ---
  { id: 'analytics-overview', title: 'Analytics Overview', icon: 'i-lucide-bar-chart-4', description: 'Cross-platform spend, clicks, CTR across all 8 ad platforms', defaultRoles: ['admin', 'owner', 'marketing'], column: 'left' },
  { id: 'spend-pacing', title: 'Spend Pacing', icon: 'i-lucide-gauge', description: 'Ad spend pacing vs budget', defaultRoles: ['admin', 'owner', 'marketing'], column: 'left' },
  { id: 'campaign-alerts', title: 'Campaign Alerts', icon: 'i-lucide-alert-triangle', description: 'Campaigns over/under budget', defaultRoles: ['admin', 'owner', 'marketing'], column: 'right' },
  { id: 'platform-performance', title: 'Platform Performance', icon: 'i-lucide-bar-chart-2', description: 'Daily spend chart with CTR, CPC, CPM', defaultRoles: ['admin', 'owner', 'marketing'], column: 'left' },
  // --- Producer / Traffic Manager widgets ---
  { id: 'team-capacity', title: 'Team Capacity', icon: 'i-lucide-users-round', description: 'Team availability and workload', defaultRoles: ['admin', 'owner', 'project_manager'], column: 'left' },
  { id: 'unassigned-work', title: 'Unassigned Work', icon: 'i-lucide-inbox', description: 'Tasks with no assignee', defaultRoles: ['admin', 'owner', 'project_manager'], column: 'right' },
  { id: 'blocked-tasks', title: 'Blocked Tasks', icon: 'i-lucide-ban', description: 'Tasks that are stuck or blocked', defaultRoles: ['admin', 'owner', 'project_manager'], column: 'right' },
  { id: 'deliverables-due', title: 'Due This Week', icon: 'i-lucide-calendar-clock', description: 'Deliverables due this week by day', defaultRoles: ['admin', 'owner', 'project_manager', 'member'], column: 'left' },
  // --- Owner / Finance widgets ---
  { id: 'cash-position', title: 'Cash Position', icon: 'i-lucide-wallet', description: 'Current cash balance and forecast', defaultRoles: ['admin', 'owner', 'consultant'], column: 'right' },
  { id: 'revenue-snapshot', title: 'Revenue Snapshot', icon: 'i-lucide-trending-up', description: 'Revenue, expenses, profit & margin', defaultRoles: ['admin', 'owner', 'consultant'], column: 'left' },
  { id: 'receivables-aging', title: 'Receivables Aging', icon: 'i-lucide-hourglass', description: 'Outstanding invoices by age', defaultRoles: ['admin', 'owner', 'consultant'], column: 'right' },
  { id: 'project-profitability', title: 'Project Profitability', icon: 'i-lucide-calculator', description: 'Project margins and revenue breakdown', defaultRoles: ['admin', 'owner', 'consultant'], column: 'left' },
  // --- Creative gallery ---
  { id: 'recent-creatives', title: 'Recent Creatives', icon: 'i-lucide-image', description: 'Visual assets from proofs and deliverables', defaultRoles: ['admin', 'owner', 'project_manager', 'member'], column: 'right' },
  // --- AI ---
  { id: 'ai-insights', title: 'AI Insights', icon: 'i-lucide-brain', description: 'AI-generated insights and alerts', defaultRoles: ['admin', 'owner', 'project_manager'], column: 'right' },
  { id: 'ai-training', title: 'AI Training', icon: 'i-lucide-graduation-cap', description: 'Training pipeline status, datasets, and LoRA adapters', defaultRoles: ['admin', 'owner'], column: 'right' },
]

const ROLE_DEFAULTS: Record<string, string[]> = {
  member: ['my-work', 'notifications', 'boards', 'time-this-week', 'quick-actions', 'proofs-pending', 'deliverables-due', 'recent-creatives'],
  project_manager: ['my-work', 'notifications', 'completion-trends', 'workload-overview', 'boards', 'team-utilization', 'budget-alerts', 'team-capacity', 'unassigned-work', 'blocked-tasks', 'deliverables-due', 'briefs-pipeline', 'proofs-pending', 'recent-creatives'],
  admin: ALL_WIDGETS.map(w => w.id),
  owner: ALL_WIDGETS.map(w => w.id),
  consultant: ['financial-kpis', 'budget-alerts', 'boards', 'notifications', 'cash-position', 'revenue-snapshot', 'receivables-aging', 'project-profitability'],
  sales: ['my-work', 'notifications', 'boards', 'quick-actions', 'client-health', 'my-clients', 'briefs-pipeline'],
  marketing: ['my-work', 'notifications', 'boards', 'quick-actions', 'analytics-overview', 'ad-spend', 'budget-alerts', 'spend-pacing', 'campaign-alerts', 'platform-performance'],
}

export function useDashboardWidgets() {
  const { user } = useAuth()
  const toast = useToast()

  const preferences = useState<DashboardPreferences | null>('dashboard-prefs', () => null)
  const loaded = useState('dashboard-prefs-loaded', () => false)
  const saving = ref(false)

  // Determine role-based defaults
  const roleDefaults = computed(() => {
    const role = user.value?.role || 'member'
    return ROLE_DEFAULTS[role] || ROLE_DEFAULTS.member
  })

  // Active widget IDs (from preferences or role defaults)
  const activeWidgets = computed(() => {
    if (preferences.value?.widgets?.length) {
      return preferences.value.widgets
    }
    return roleDefaults.value
  })

  // Pinned items
  const pinnedItems = computed(() => preferences.value?.pinnedItems || [])

  // Widget visibility check
  function isVisible(widgetId: string) {
    return activeWidgets.value.includes(widgetId)
  }

  // Widgets available for user's role
  const availableWidgets = computed(() => {
    const role = user.value?.role || 'member'
    // Admins/owners see all widgets as available
    if (role === 'admin' || role === 'owner') return ALL_WIDGETS
    return ALL_WIDGETS.filter(w => w.defaultRoles.includes(role))
  })

  // Left and right column widgets (ordered)
  const leftWidgets = computed(() =>
    activeWidgets.value.filter(id => {
      const w = ALL_WIDGETS.find(def => def.id === id)
      return w?.column === 'left'
    })
  )
  const rightWidgets = computed(() =>
    activeWidgets.value.filter(id => {
      const w = ALL_WIDGETS.find(def => def.id === id)
      return w?.column === 'right'
    })
  )

  // Toggle widget on/off
  function toggleWidget(widgetId: string) {
    const current = [...activeWidgets.value]
    const idx = current.indexOf(widgetId)
    if (idx >= 0) {
      current.splice(idx, 1)
    } else {
      current.push(widgetId)
    }
    preferences.value = {
      widgets: current,
      pinnedItems: pinnedItems.value,
    }
  }

  // Reorder widgets
  function reorderWidgets(orderedIds: string[]) {
    preferences.value = {
      widgets: orderedIds,
      pinnedItems: pinnedItems.value,
    }
  }

  // Pin/unpin items
  function pinItem(item: PinnedItem) {
    if (pinnedItems.value.some(p => p.id === item.id && p.type === item.type)) return
    preferences.value = {
      widgets: activeWidgets.value,
      pinnedItems: [...pinnedItems.value, item],
    }
  }

  function unpinItem(id: string) {
    preferences.value = {
      widgets: activeWidgets.value,
      pinnedItems: pinnedItems.value.filter(p => p.id !== id),
    }
  }

  // Load preferences from API
  async function loadPreferences() {
    try {
      const data = await $fetch('/api/agency/dashboard/preferences') as any
      if (data?.preferences) {
        preferences.value = data.preferences as DashboardPreferences
      }
      loaded.value = true
    } catch {
      loaded.value = true
    }
  }

  // Save preferences to API
  async function savePreferences() {
    if (!preferences.value) return
    saving.value = true
    try {
      await $fetch('/api/agency/dashboard/preferences', {
        method: 'PUT',
        body: preferences.value,
      })
      toast.add({ title: 'Dashboard saved', color: 'success' })
    } catch {
      toast.add({ title: 'Failed to save', description: 'Could not save dashboard preferences', color: 'error' })
    } finally {
      saving.value = false
    }
  }

  // Reset to role defaults
  function resetToDefaults() {
    preferences.value = {
      widgets: [...roleDefaults.value],
      pinnedItems: [],
    }
  }

  // Apply persona defaults (for onboarding)
  function applyPersona(role: string) {
    const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.member
    preferences.value = {
      widgets: [...defaults],
      pinnedItems: [],
    }
  }

  // Widget categories for grouped customize modal
  const widgetCategories = computed(() => {
    const widgets = availableWidgets.value
    const categories = [
      { label: 'Core', ids: ['my-work', 'notifications', 'boards', 'workspaces', 'quick-actions', 'time-this-week'] },
      { label: 'Analytics', ids: ['completion-trends', 'workload-overview', 'job-types', 'team-utilization', 'financial-kpis'] },
      { label: 'Account Management', ids: ['client-health', 'proofs-pending', 'briefs-pipeline', 'my-clients'] },
      { label: 'Media Buying', ids: ['analytics-overview', 'ad-spend', 'spend-pacing', 'campaign-alerts', 'platform-performance', 'budget-alerts'] },
      { label: 'Production', ids: ['team-capacity', 'unassigned-work', 'blocked-tasks', 'deliverables-due'] },
      { label: 'Finance', ids: ['cash-position', 'revenue-snapshot', 'receivables-aging', 'project-profitability'] },
      { label: 'Creative & AI', ids: ['recent-creatives', 'ai-insights', 'ai-training'] },
    ]
    return categories
      .map(cat => ({
        label: cat.label,
        widgets: cat.ids
          .map(id => widgets.find(w => w.id === id))
          .filter((w): w is WidgetDefinition => !!w),
      }))
      .filter(cat => cat.widgets.length > 0)
  })

  return {
    preferences,
    loaded,
    saving,
    activeWidgets,
    pinnedItems,
    availableWidgets,
    widgetCategories,
    leftWidgets,
    rightWidgets,
    allWidgets: ALL_WIDGETS,
    isVisible,
    toggleWidget,
    reorderWidgets,
    pinItem,
    unpinItem,
    loadPreferences,
    savePreferences,
    resetToDefaults,
    applyPersona,
  }
}
