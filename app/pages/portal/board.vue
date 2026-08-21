<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

type BoardItem = {
  id: string
  title: string
  projectName: string
  status: string
  statusColor: string | null
  priority: string | null
  assigneeName: string | null
  dueDate: string | null
  progressPercent: number
}
type PortalBoard = {
  linked: boolean
  board: { id: string, name: string, description: string | null, color: string | null } | null
  groups: Array<{ id: string | null, name: string, color: string | null, items: BoardItem[] }>
  total: number
  limit: number
  more: number
  readOnly?: boolean
}

const { data, status, error, refresh } = await useFetch<PortalBoard>('/api/portal/board', {
  default: () => ({ linked: false, board: null, groups: [], total: 0, limit: 250, more: 0 })
})
const pending = computed(() => status.value === 'pending')

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No due date'
}

function priorityColor(priority: string | null): 'error' | 'warning' | 'primary' | 'neutral' {
  if (priority === 'urgent') return 'error'
  if (priority === 'high') return 'warning'
  if (priority === 'medium') return 'primary'
  return 'neutral'
}
</script>

<template>
  <div class="w-full space-y-6 p-4 sm:p-6 lg:p-8">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="flex items-center gap-2">
          <span v-if="data.board?.color" class="size-3 rounded-full" :style="{ backgroundColor: data.board.color }" />
          <h1 class="text-2xl font-semibold text-highlighted">
            {{ data.board?.name || 'Client board' }}
          </h1>
        </div>
        <p class="mt-1 text-sm text-muted">
          {{ data.board?.description || 'A read-only view of work linked to your projects.' }}
        </p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="pending" @click="refresh()" />
    </div>

    <UAlert
      v-if="error"
      title="The board could not be loaded"
      description="Try refreshing the page. If the problem continues, contact your agency team."
      icon="i-lucide-circle-alert"
      color="error"
      variant="soft"
    />

    <UCard v-else-if="pending">
      <div class="space-y-3">
        <USkeleton v-for="index in 5" :key="index" class="h-16 w-full" />
      </div>
    </UCard>

    <UAlert
      v-else-if="!data.linked"
      title="No board linked yet"
      description="Your agency team can link a board from your client settings."
      icon="i-lucide-panels-top-left"
      color="neutral"
      variant="soft"
    />

    <template v-else>
      <div class="flex items-center gap-2 text-sm text-muted">
        <UBadge color="neutral" variant="subtle">Read only</UBadge>
        <span>{{ data.total }} visible item{{ data.total === 1 ? '' : 's' }}</span>
      </div>

      <UAlert
        v-if="data.more"
        title="Board view capped"
        :description="`Showing the first ${data.limit} items. Ask your agency team to archive completed work or narrow the board.`"
        icon="i-lucide-info"
        color="warning"
        variant="soft"
      />

      <UCard v-for="group in data.groups" :key="group.id || '__ungrouped__'">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="size-2.5 rounded-full" :style="{ backgroundColor: group.color || '#94a3b8' }" />
              <h2 class="font-semibold text-highlighted">{{ group.name }}</h2>
            </div>
            <UBadge color="neutral" variant="subtle">{{ group.items.length }}</UBadge>
          </div>
        </template>

        <div class="divide-y divide-default">
          <div v-for="item in group.items" :key="item.id" class="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-highlighted">{{ item.title }}</p>
              <p class="mt-1 truncate text-xs text-muted">{{ item.projectName }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2 sm:justify-end">
              <UBadge v-if="item.priority" :color="priorityColor(item.priority)" variant="subtle">{{ item.priority }}</UBadge>
              <UBadge color="neutral" variant="subtle">{{ item.status }}</UBadge>
              <span class="text-xs text-muted">{{ item.assigneeName || 'Unassigned' }}</span>
              <span class="text-xs text-muted">{{ formatDate(item.dueDate) }}</span>
            </div>
          </div>
        </div>
      </UCard>

      <UCard v-if="!data.groups.length">
        <div class="py-10 text-center">
          <UIcon name="i-lucide-panels-top-left" class="mx-auto size-8 text-muted" />
          <p class="mt-3 text-sm font-medium text-highlighted">No client work on this board yet</p>
          <p class="mt-1 text-sm text-muted">Items will appear when they are assigned to one of your projects.</p>
        </div>
      </UCard>
    </template>
  </div>
</template>
