<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const route = useRoute()
const { hasPermission } = usePortalAuth()
const projectId = route.params.id as string

const { data, pending } = useFetch(`/api/portal/projects/${projectId}`)

const { data: commentsData, refresh: refreshComments } = useFetch('/api/portal/comments', {
  query: { projectId }
})

const activeTab = ref('overview')
const newComment = ref('')
const submittingComment = ref(false)
const toast = useToast()

const tabs = computed(() => {
  const items = [
    { label: 'Overview', value: 'overview' },
    { label: 'Work', value: 'work' },
    { label: 'Deliverables', value: 'deliverables' },
    { label: 'Approvals', value: 'approvals' }
  ]
  if (data.value?.settings?.show_comments !== false) {
    items.push({ label: 'Comments', value: 'comments' })
  }
  return items
})

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

const statusColors: Record<string, string> = {
  draft: 'neutral',
  active: 'success',
  completed: 'neutral',
  on_hold: 'warning',
  cancelled: 'error'
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { statusMessage?: string } }).data
    return data?.statusMessage
  }

  return undefined
}

async function submitComment() {
  if (!newComment.value.trim()) return
  submittingComment.value = true
  try {
    await $fetch('/api/portal/comments', {
      method: 'POST',
      body: { content: newComment.value, projectId }
    })
    newComment.value = ''
    await refreshComments()
    toast.add({ title: 'Comment added', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Failed to add comment', description: getErrorMessage(e), color: 'error' })
  } finally {
    submittingComment.value = false
  }
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    <div v-if="pending" class="space-y-4">
      <div class="h-8 w-64 bg-elevated animate-pulse rounded" />
      <div class="h-32 bg-elevated animate-pulse rounded-lg" />
    </div>

    <template v-else-if="data">
      <!-- Header -->
      <div>
        <NuxtLink to="/portal/projects" class="text-sm text-muted hover:text-default mb-2 inline-flex items-center gap-1">
          <UIcon name="i-lucide-arrow-left" class="w-3 h-3" />
          Back to projects
        </NuxtLink>

        <div class="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 class="text-2xl font-bold">
              {{ data.project.name }}
            </h1>
            <p v-if="data.project.description" class="text-muted mt-1">
              {{ data.project.description }}
            </p>
          </div>
          <UBadge :color="(statusColors[data.project.status] as any) || 'neutral'" variant="subtle">
            {{ data.project.status.replace('_', ' ') }}
          </UBadge>
        </div>

        <!-- Progress bar -->
        <div class="mt-4 p-4 rounded-lg bg-elevated">
          <div class="flex items-center justify-between text-sm mb-2">
            <span class="text-muted">Overall Progress</span>
            <span class="font-semibold">{{ data.project.tasks.progressPercent }}%</span>
          </div>
          <div class="w-full bg-muted/20 rounded-full h-2">
            <div
              class="bg-primary rounded-full h-2 transition-all"
              :style="{ width: `${data.project.tasks.progressPercent}%` }"
            />
          </div>
          <div class="flex items-center justify-between text-xs text-muted mt-2">
            <span>{{ data.project.tasks.completed }}/{{ data.project.tasks.total }} tasks completed</span>
            <div class="flex items-center gap-4">
              <span v-if="data.project.startDate">Start: {{ formatDate(data.project.startDate) }}</span>
              <span v-if="data.project.dueDate">Due: {{ formatDate(data.project.dueDate) }}</span>
            </div>
          </div>
        </div>
      </div>

      <UTabs v-model="activeTab" :items="tabs" />

      <!-- Overview Tab -->
      <div v-if="activeTab === 'overview'" class="space-y-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="rounded-lg border border-default bg-default p-4">
            <p class="text-xs text-muted">
              Upcoming work
            </p>
            <p class="text-2xl font-semibold mt-1">
              {{ data.upcomingTasks.length }}
            </p>
          </div>
          <div class="rounded-lg border border-default bg-default p-4">
            <p class="text-xs text-muted">
              Completed work
            </p>
            <p class="text-2xl font-semibold mt-1">
              {{ data.completedTasks.length }}
            </p>
          </div>
          <div class="rounded-lg border border-default bg-default p-4">
            <p class="text-xs text-muted">
              Approvals
            </p>
            <p class="text-2xl font-semibold mt-1">
              {{ data.approvals.length }}
            </p>
          </div>
          <div class="rounded-lg border border-default bg-default p-4">
            <p class="text-xs text-muted">
              Deliverables
            </p>
            <p class="text-2xl font-semibold mt-1">
              {{ data.deliverables.length }}
            </p>
          </div>
        </div>

        <div v-if="data.project.projectManager" class="flex items-center gap-3 p-4 rounded-lg bg-elevated">
          <UAvatar :src="data.project.projectManager.avatarUrl || undefined" :alt="data.project.projectManager.name" size="sm" />
          <div>
            <p class="text-sm font-medium">
              {{ data.project.projectManager.name }}
            </p>
            <p class="text-xs text-muted">
              Project Manager
            </p>
          </div>
        </div>

        <!-- Team Members -->
        <div v-if="data.teamMembers?.length">
          <h3 class="font-semibold mb-3">
            Team Members
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              v-for="member in data.teamMembers"
              :key="member.id"
              class="flex items-center gap-3 p-3 rounded-lg bg-elevated"
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
            </div>
          </div>
        </div>

        <div v-if="data.upcomingTasks.length">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold">
              Next scheduled work
            </h3>
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              @click="activeTab = 'work'"
            >
              View work history
            </UButton>
          </div>
          <div class="space-y-2">
            <div v-for="task in data.upcomingTasks" :key="task.id" class="flex items-center gap-3 p-3 rounded-lg bg-elevated">
              <div class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: task.status.color || '#6b7280' }" />
              <span class="text-sm flex-1">{{ task.title }}</span>
              <span class="text-xs text-muted">{{ formatDate(task.dueDate) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Work Tab -->
      <div v-if="activeTab === 'work'" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section class="space-y-3">
          <div>
            <h3 class="font-semibold">
              Upcoming jobs and tasks
            </h3>
            <p class="text-sm text-muted">
              Scheduled work still to be completed for this client job.
            </p>
          </div>

          <div v-if="data.upcomingTasks.length" class="space-y-2">
            <div
              v-for="task in data.upcomingTasks"
              :key="task.id"
              class="rounded-lg border border-default bg-default p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-medium truncate">
                    {{ task.title }}
                  </p>
                  <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span v-if="task.dueDate">Due {{ formatDate(task.dueDate) }}</span>
                    <span v-else-if="task.startDate">Starts {{ formatDate(task.startDate) }}</span>
                    <span v-if="task.assignee">Owner: {{ task.assignee.name }}</span>
                  </div>
                </div>
                <UBadge variant="subtle" color="primary" size="xs">
                  {{ task.status.name }}
                </UBadge>
              </div>
            </div>
          </div>
          <p v-else class="text-center text-muted py-10 rounded-lg border border-dashed border-default">
            No upcoming work scheduled
          </p>
        </section>

        <section class="space-y-3">
          <div>
            <h3 class="font-semibold">
              Completed job history
            </h3>
            <p class="text-sm text-muted">
              Recent work completed for this client job.
            </p>
          </div>

          <div v-if="data.completedTasks.length" class="space-y-2">
            <div
              v-for="task in data.completedTasks"
              :key="task.id"
              class="rounded-lg border border-default bg-default p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-medium truncate">
                    {{ task.title }}
                  </p>
                  <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>Completed {{ formatDateTime(task.completedAt) }}</span>
                    <span v-if="task.dueDate">Due {{ formatDate(task.dueDate) }}</span>
                    <span v-if="task.assignee">Owner: {{ task.assignee.name }}</span>
                  </div>
                </div>
                <UBadge variant="subtle" color="success" size="xs">
                  Done
                </UBadge>
              </div>
            </div>
          </div>
          <p v-else class="text-center text-muted py-10 rounded-lg border border-dashed border-default">
            No completed work history yet
          </p>
        </section>
      </div>

      <!-- Deliverables Tab -->
      <div v-if="activeTab === 'deliverables'">
        <div v-if="data.deliverables.length" class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div
            v-for="d in data.deliverables"
            :key="d.id"
            class="relative aspect-video rounded-lg overflow-hidden bg-elevated group"
          >
            <img
              v-if="safeMediaUrl(d.thumbnailUrl)"
              :src="safeMediaUrl(d.thumbnailUrl)"
              :alt="d.title"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform"
            >
            <div v-else class="w-full h-full flex items-center justify-center">
              <UIcon name="i-lucide-file" class="w-8 h-8 text-muted" />
            </div>
            <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
              <p class="text-xs text-white truncate">
                {{ d.title }}
              </p>
            </div>
            <UBadge
              v-if="d.isFeatured"
              color="warning"
              size="xs"
              class="absolute top-2 right-2"
            >
              Featured
            </UBadge>
          </div>
        </div>
        <p v-else class="text-center text-muted py-12">
          No deliverables yet
        </p>
      </div>

      <!-- Approvals Tab -->
      <div v-if="activeTab === 'approvals'" class="space-y-3">
        <NuxtLink
          v-for="a in data.approvals"
          :key="a.id"
          :to="`/portal/approvals/${a.id}`"
          class="block p-4 rounded-lg bg-elevated hover:ring-1 hover:ring-primary/50 transition-all"
        >
          <div class="flex items-center justify-between">
            <span class="font-medium">{{ a.title }}</span>
            <UBadge
              :color="a.status === 'pending' ? 'warning' : a.status === 'approved' ? 'success' : 'error'"
              variant="subtle"
              size="xs"
            >
              {{ a.status }}
            </UBadge>
          </div>
          <div class="flex items-center gap-2 text-xs text-muted mt-1">
            <span>{{ a.approvalType }}</span>
            <span v-if="a.dueDate">· Due {{ formatDate(a.dueDate) }}</span>
          </div>
        </NuxtLink>
        <p v-if="!data.approvals.length" class="text-center text-muted py-12">
          No approvals
        </p>
      </div>

      <!-- Comments Tab -->
      <div v-if="activeTab === 'comments'" class="space-y-4">
        <div class="space-y-4">
          <div
            v-for="c in commentsData?.comments"
            :key="c.id"
            class="flex items-start gap-3"
          >
            <UAvatar :src="c.author.avatarUrl || undefined" :alt="c.author.name" size="sm" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-sm">{{ c.author.name }}</span>
                <UBadge
                  v-if="c.author.type === 'team'"
                  size="xs"
                  variant="subtle"
                  color="primary"
                >
                  Team
                </UBadge>
                <span class="text-xs text-muted">{{ formatDate(c.createdAt) }}</span>
              </div>
              <p class="text-sm mt-1 whitespace-pre-wrap">
                {{ c.content }}
              </p>
            </div>
          </div>
        </div>

        <form v-if="hasPermission('canAddComments')" class="flex gap-2" @submit.prevent="submitComment">
          <UInput
            v-model="newComment"
            placeholder="Add a comment..."
            class="flex-1"
          />
          <UButton type="submit" :loading="submittingComment" :disabled="!newComment.trim()">
            Send
          </UButton>
        </form>
      </div>
    </template>
  </div>
</template>
