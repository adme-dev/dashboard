<script setup lang="ts">
const emit = defineEmits<{
  action: [label: string]
}>()

const route = useRoute()

interface QuickAction {
  label: string
  icon: string
}

const actions = computed<QuickAction[]>(() => {
  const base: QuickAction[] = [
    { label: "What's overdue?", icon: 'i-lucide-alert-triangle' },
    { label: 'Team workload', icon: 'i-lucide-users' },
  ]

  // Context-specific actions based on current route
  if (route.path.includes('/boards/')) {
    base.unshift({ label: 'Summarize this board', icon: 'i-lucide-layout-grid' })
  }
  if (route.path.includes('/briefs')) {
    base.unshift({ label: 'Brief status update', icon: 'i-lucide-file-text' })
  }
  if (route.path.includes('/eom') || route.path.includes('/social')) {
    base.unshift({ label: 'Financial overview', icon: 'i-lucide-dollar-sign' })
  }
  if (route.path.includes('/projects')) {
    base.unshift({ label: 'Project status summary', icon: 'i-lucide-folder-kanban' })
  }
  if (route.path.includes('/clients')) {
    base.unshift({ label: 'Client overview', icon: 'i-lucide-building-2' })
  }

  return base.slice(0, 4)
})
</script>

<template>
  <div class="flex flex-wrap gap-1.5 px-3 py-2">
    <button
      v-for="action in actions"
      :key="action.label"
      class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full
             border border-default bg-elevated/50 hover:bg-elevated
             text-muted hover:text-default transition-colors cursor-pointer"
      @click="emit('action', action.label)"
    >
      <UIcon :name="action.icon" class="w-3 h-3 flex-shrink-0" />
      <span class="truncate">{{ action.label }}</span>
    </button>
  </div>
</template>
