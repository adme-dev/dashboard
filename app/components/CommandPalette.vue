<script setup lang="ts">
interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: string
  shortcut?: string
  action: () => void | Promise<void>
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
    description: 'Executive dashboard with KPIs',
    icon: 'i-lucide-layout-dashboard',
    action: () => navigateTo('/dashboard'),
    group: 'Navigation'
  },
  {
    id: 'nav-expenses',
    label: 'Go to Expenses',
    description: 'Expense analytics and reports',
    icon: 'i-lucide-credit-card',
    action: () => navigateTo('/expenses'),
    group: 'Navigation'
  },
  {
    id: 'nav-reports',
    label: 'Go to Reports',
    description: 'Financial reports and analysis',
    icon: 'i-lucide-bar-chart-3',
    action: () => navigateTo('/reports'),
    group: 'Navigation'
  },
  {
    id: 'nav-cashflow',
    label: 'Go to Cash Flow',
    description: 'Cash flow analysis and forecasting',
    icon: 'i-lucide-trending-up',
    action: () => navigateTo('/cashflow'),
    group: 'Navigation'
  },
  {
    id: 'nav-anomalies',
    label: 'Go to Anomaly Detection',
    description: 'AI-powered expense anomaly detection',
    icon: 'i-lucide-search',
    action: () => navigateTo('/anomalies'),
    group: 'Navigation'
  },
  {
    id: 'nav-settings',
    label: 'Go to Settings',
    description: 'Application settings and configuration',
    icon: 'i-lucide-settings',
    action: () => navigateTo('/settings'),
    group: 'Navigation'
  },
  
  // Actions
  {
    id: 'action-refresh',
    label: 'Refresh Data',
    description: 'Refresh all dashboard data',
    icon: 'i-lucide-refresh-cw',
    shortcut: 'Cmd+R',
    action: () => window.location.reload(),
    group: 'Actions'
  },
  {
    id: 'action-export-expenses',
    label: 'Export Expenses',
    description: 'Download expense data as CSV',
    icon: 'i-lucide-download',
    action: async () => {
      // This would trigger an export
      console.log('Exporting expenses...')
    },
    group: 'Actions'
  },
  {
    id: 'action-new-invoice',
    label: 'Create New Invoice',
    description: 'Create a new invoice in Xero',
    icon: 'i-lucide-file-plus',
    action: () => {
      // This would open invoice creation
      console.log('Creating new invoice...')
    },
    group: 'Actions'
  },
  
  // Quick Links
  {
    id: 'link-xero',
    label: 'Open Xero',
    description: 'Open Xero in new tab',
    icon: 'i-lucide-external-link',
    action: () => window.open('https://xero.com', '_blank'),
    group: 'Quick Links'
  },
  {
    id: 'link-help',
    label: 'Help & Support',
    description: 'Get help and support',
    icon: 'i-lucide-help-circle',
    action: () => navigateTo('/help'),
    group: 'Quick Links'
  }
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
