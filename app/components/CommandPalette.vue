<script setup lang="ts">
interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: string
  shortcut?: string
  action: () => unknown
  group?: string
}

const isOpen = ref(false)
const searchQuery = ref('')

// Define available commands
const commands: CommandItem[] = [
  // Navigation
  {
    id: 'nav-dashboard',
    label: 'Go to Dashboard',
    description: 'Agency overview and KPIs',
    icon: 'i-lucide-layout-dashboard',
    action: () => navigateTo('/agency'),
    group: 'Navigation'
  },
  {
    id: 'nav-boards',
    label: 'Go to Boards',
    description: 'All boards and workspaces',
    icon: 'i-lucide-layout-grid',
    action: () => navigateTo('/agency/boards'),
    group: 'Navigation'
  },
  {
    id: 'nav-projects',
    label: 'Go to Projects',
    description: 'Manage active projects',
    icon: 'i-lucide-folder-kanban',
    action: () => navigateTo('/agency/projects'),
    group: 'Navigation'
  },
  {
    id: 'nav-tasks',
    label: 'Go to Tasks',
    description: 'View and manage all tasks',
    icon: 'i-lucide-check-square',
    action: () => navigateTo('/agency/tasks'),
    group: 'Navigation'
  },
  {
    id: 'nav-clients',
    label: 'Go to Clients',
    description: 'Client management and details',
    icon: 'i-lucide-building-2',
    action: () => navigateTo('/agency/clients'),
    group: 'Navigation'
  },
  {
    id: 'nav-workflow',
    label: 'Go to Workflow',
    description: 'Kanban workflow board',
    icon: 'i-lucide-git-branch',
    action: () => navigateTo('/agency/workflow'),
    group: 'Navigation'
  },
  {
    id: 'nav-time',
    label: 'Go to Time Tracking',
    description: 'Track and manage time entries',
    icon: 'i-lucide-clock',
    action: () => navigateTo('/agency/time'),
    group: 'Navigation'
  },
  {
    id: 'nav-invoices',
    label: 'Go to Invoices',
    description: 'Invoice management',
    icon: 'i-lucide-receipt',
    action: () => navigateTo('/agency/billing'),
    group: 'Navigation'
  },
  {
    id: 'nav-reports',
    label: 'Go to Reports',
    description: 'Agency reports and analytics',
    icon: 'i-lucide-pie-chart',
    action: () => navigateTo('/agency/reports'),
    group: 'Navigation'
  },
  {
    id: 'nav-team',
    label: 'Go to Team',
    description: 'Team members and capacity',
    icon: 'i-lucide-users',
    action: () => navigateTo('/agency/team'),
    group: 'Navigation'
  },
  {
    id: 'nav-settings',
    label: 'Go to Settings',
    description: 'Agency settings and configuration',
    icon: 'i-lucide-settings',
    action: () => navigateTo('/agency/settings'),
    group: 'Navigation'
  },

  // Actions
  {
    id: 'action-new-project',
    label: 'New Project',
    description: 'Create a new project',
    icon: 'i-lucide-folder-plus',
    action: () => navigateTo('/agency/projects/new'),
    group: 'Actions'
  },
  {
    id: 'action-new-brief',
    label: 'New Brief',
    description: 'Create a new brief',
    icon: 'i-lucide-file-plus',
    action: () => navigateTo('/agency/briefs/new'),
    group: 'Actions'
  },
  {
    id: 'action-new-quote',
    label: 'New Quote',
    description: 'Create a new sales quote',
    icon: 'i-lucide-file-badge',
    action: () => navigateTo('/agency/sales/quotes/new'),
    group: 'Actions'
  },
  {
    id: 'action-refresh',
    label: 'Refresh Data',
    description: 'Refresh all page data',
    icon: 'i-lucide-refresh-cw',
    shortcut: 'Cmd+R',
    action: () => window.location.reload(),
    group: 'Actions'
  },

  // Quick Links
  {
    id: 'link-ai',
    label: 'AI Assistant',
    description: 'Open AI tools',
    icon: 'i-lucide-sparkles',
    action: () => navigateTo('/agency/ai'),
    group: 'Quick Links'
  },
  {
    id: 'link-automation',
    label: 'Automation',
    description: 'Manage automations and workflows',
    icon: 'i-lucide-zap',
    action: () => navigateTo('/agency/automation'),
    group: 'Quick Links'
  },
  {
    id: 'link-capacity',
    label: 'Capacity Planner',
    description: 'View team capacity and workload',
    icon: 'i-lucide-gauge',
    action: () => navigateTo('/agency/capacity'),
    group: 'Quick Links'
  },
  {
    id: 'link-health',
    label: 'Project Health',
    description: 'Monitor project health scores',
    icon: 'i-lucide-activity',
    action: () => navigateTo('/agency/health'),
    group: 'Quick Links'
  },
]

// Filter commands based on search query
const filteredCommands = computed(() => {
  if (!searchQuery.value) return commands
  
  const query = searchQuery.value.toLowerCase()
  return commands.filter(command => 
    command.label.toLowerCase().includes(query) ||
    command.description?.toLowerCase().includes(query) ||
    command.group?.toLowerCase().includes(query)
  )
})

// Group commands
const groupedCommands = computed(() => {
  const groups: Record<string, CommandItem[]> = {}
  
  filteredCommands.value.forEach(command => {
    const group = command.group || 'Other'
    if (!groups[group]) groups[group] = []
    groups[group].push(command)
  })
  
  return groups
})

// Handle command execution
async function executeCommand(command: CommandItem) {
  isOpen.value = false
  searchQuery.value = ''
  await command.action()
}

// Keyboard shortcuts
onMounted(() => {
  const handleKeydown = (e: KeyboardEvent) => {
    // Open command palette with Cmd+K or Ctrl+K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      isOpen.value = !isOpen.value
      if (isOpen.value) {
        nextTick(() => {
          const input = document.querySelector('[data-command-input]') as HTMLInputElement
          input?.focus()
        })
      }
    }
    
    // Close with Escape
    if (e.key === 'Escape') {
      isOpen.value = false
      searchQuery.value = ''
    }
  }
  
  document.addEventListener('keydown', handleKeydown)
  
  return () => {
    document.removeEventListener('keydown', handleKeydown)
  }
})

// Expose methods for parent components
defineExpose({
  open: () => { isOpen.value = true },
  close: () => { isOpen.value = false }
})
</script>

<template>
  <UModal v-model="isOpen">
    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-command" class="h-5 w-5 text-muted" />
          <span class="font-semibold">Command Palette</span>
          <span class="ml-auto text-xs bg-muted px-2 py-1 rounded">Esc</span>
        </div>
      </template>

      <!-- Search Input -->
      <div class="p-4 border-b border-border">
        <UInput
          v-model="searchQuery"
          placeholder="Search commands..."
          icon="i-lucide-search"
          size="lg"
          data-command-input
          autofocus
        />
      </div>

      <!-- Commands List -->
      <div class="max-h-96 overflow-y-auto">
        <div v-if="Object.keys(groupedCommands).length === 0" class="p-8 text-center">
          <UIcon name="i-lucide-search-x" class="h-8 w-8 text-muted/50 mx-auto mb-2" />
          <p class="text-muted">No commands found</p>
        </div>

        <div v-else class="divide-y divide-border">
          <div
            v-for="(groupCommands, groupName) in groupedCommands"
            :key="groupName"
            class="p-2"
          >
            <div class="px-3 py-2 text-xs font-medium text-muted uppercase tracking-wider">
              {{ groupName }}
            </div>
            
            <div class="space-y-1">
              <button
                v-for="command in groupCommands"
                :key="command.id"
                class="w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg hover:bg-muted/50 transition-colors group"
                @click="executeCommand(command)"
              >
                <UIcon
                  v-if="command.icon"
                  :name="command.icon"
                  class="h-4 w-4 text-muted group-hover:text-highlighted"
                />
                
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-highlighted group-hover:text-primary">
                    {{ command.label }}
                  </div>
                  <div v-if="command.description" class="text-sm text-muted truncate">
                    {{ command.description }}
                  </div>
                </div>
                
                <span v-if="command.shortcut" class="text-xs bg-muted px-2 py-1 rounded">
                  {{ command.shortcut }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <template #footer>
        <div class="flex items-center justify-between text-xs text-muted">
          <span>Press <span class="bg-muted px-1 py-0.5 rounded">↵</span> to select, <span class="bg-muted px-1 py-0.5 rounded">↑</span><span class="bg-muted px-1 py-0.5 rounded">↓</span> to navigate</span>
          <span>Tip: Try searching by feature or action</span>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<style scoped>
/* Add smooth animations */
.command-item {
  transition: all 0.15s ease;
}

.command-item:hover {
  transform: translateX(2px);
}
</style>
