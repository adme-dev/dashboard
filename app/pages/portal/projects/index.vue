<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const activeTab = ref('all')
const statusFilter = computed(() => activeTab.value === 'all' ? undefined : activeTab.value)

const { data, pending, refresh } = useFetch('/api/portal/projects', {
  query: { status: statusFilter }
})

const tabs = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'On Hold', value: 'on_hold' }
]

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

const statusColors: Record<string, string> = {
  active: 'success',
  completed: 'neutral',
  on_hold: 'warning',
  cancelled: 'error'
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Projects</h1>
      <div v-if="data?.summary" class="flex items-center gap-2 text-sm text-muted">
        <span>{{ data.summary.total }} total</span>
      </div>
    </div>

    <UTabs
      :items="tabs"
      v-model="activeTab"
    />

    <div v-if="pending" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="i in 6" :key="i" class="h-48 rounded-lg bg-elevated animate-pulse" />
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <NuxtLink
        v-for="project in data?.projects"
        :key="project.id"
        :to="`/portal/projects/${project.id}`"
        class="block"
      >
        <UCard class="hover:ring-primary/50 hover:ring-1 transition-all h-full">
          <div class="space-y-3">
            <div class="flex items-start justify-between">
              <h3 class="font-semibold truncate pr-2">{{ project.name }}</h3>
              <UBadge :color="(statusColors[project.status] as any) || 'neutral'" variant="subtle" size="xs">
                {{ project.status.replace('_', ' ') }}
              </UBadge>
            </div>

            <div>
              <div class="flex items-center justify-between text-xs text-muted mb-1">
                <span>Progress</span>
                <span>{{ project.tasks.progressPercent }}%</span>
              </div>
              <div class="w-full bg-muted/20 rounded-full h-1.5">
                <div
                  class="bg-primary rounded-full h-1.5 transition-all"
                  :style="{ width: `${project.tasks.progressPercent}%` }"
                />
              </div>
            </div>

            <div class="flex items-center justify-between text-xs text-muted">
              <span>{{ project.tasks.completed }}/{{ project.tasks.total }} tasks</span>
              <span v-if="project.dueDate">Due {{ formatDate(project.dueDate) }}</span>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              <UBadge v-if="project.pendingApprovals > 0" color="warning" variant="subtle" size="xs">
                {{ project.pendingApprovals }} approvals
              </UBadge>
              <UBadge v-if="project.deliverableCount > 0" color="primary" variant="subtle" size="xs">
                {{ project.deliverableCount }} deliverables
              </UBadge>
            </div>

            <div v-if="project.projectManagerName" class="text-xs text-muted">
              PM: {{ project.projectManagerName }}
            </div>
          </div>
        </UCard>
      </NuxtLink>
    </div>

    <p v-if="!pending && (!data?.projects || data.projects.length === 0)" class="text-center text-muted py-12">
      No projects found
    </p>
  </div>
</template>
