<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const route = useRoute()
const requestId = route.params.id as string
const toast = useToast()

const { data, pending, refresh } = useFetch(`/api/portal/requests/${requestId}`)

const newMessage = ref('')
const sendingMessage = ref(false)

async function sendMessage() {
  if (!newMessage.value.trim()) return
  sendingMessage.value = true
  try {
    await $fetch(`/api/portal/requests/${requestId}/messages`, {
      method: 'POST',
      body: { content: newMessage.value }
    })
    newMessage.value = ''
    await refresh()
    toast.add({ title: 'Message sent', color: 'success' })
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'data' in error
      ? (error as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Failed to send', description: message, color: 'error' })
  } finally {
    sendingMessage.value = false
  }
}

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

function getStatusColor(status: string): 'success' | 'warning' | 'error' | 'neutral' | 'info' | 'primary' {
  if (status === 'submitted') return 'warning'
  if (status === 'in_review') return 'info'
  if (status === 'approved') return 'success'
  if (status === 'in_progress') return 'primary'
  if (status === 'completed') return 'success'
  if (status === 'cancelled') return 'error'
  return 'neutral'
}

function getPriorityColor(priority: string): 'error' | 'warning' | 'info' | 'neutral' {
  if (priority === 'urgent') return 'error'
  if (priority === 'high') return 'warning'
  if (priority === 'normal') return 'info'
  return 'neutral'
}

const isOpen = computed(() => {
  if (!data.value?.request) return false
  return !['completed', 'closed', 'cancelled'].includes(data.value.request.status)
})

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(amount)
}

function daysUntil(date: string | null | undefined) {
  if (!date) return null
  const due = new Date(date)
  const now = new Date()
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function deadlineStatus(date: string | null | undefined) {
  const days = daysUntil(date)
  if (days == null) return { label: 'No target date', color: 'neutral' as const }
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: 'error' as const }
  if (days === 0) return { label: 'Due today', color: 'warning' as const }
  if (days <= 14) return { label: `Due in ${days}d`, color: 'warning' as const }
  return { label: formatDate(date || null), color: 'neutral' as const }
}

const requestHealth = computed(() => {
  const request = data.value?.request
  if (!request) return []

  const deadline = deadlineStatus(request.desiredDeadline)
  const responseState = request.respondedAt
    ? { label: `Responded ${formatDate(request.respondedAt)}`, color: 'success' as const }
    : ['submitted', 'in_review'].includes(request.status)
        ? { label: 'Awaiting response', color: 'warning' as const }
        : { label: 'Response not logged', color: 'neutral' as const }

  return [
    {
      label: 'Owner',
      value: request.assignedName || 'Unassigned',
      icon: request.assignedName ? 'i-lucide-user-check' : 'i-lucide-user-x',
      color: request.assignedName ? 'success' as const : 'warning' as const
    },
    {
      label: 'Target',
      value: deadline.label,
      icon: 'i-lucide-calendar-clock',
      color: deadline.color
    },
    {
      label: 'Response',
      value: responseState.label,
      icon: 'i-lucide-message-circle',
      color: responseState.color
    },
    {
      label: 'Budget',
      value: request.estimatedBudget ? formatCurrency(request.estimatedBudget) : 'Not provided',
      icon: 'i-lucide-wallet',
      color: request.estimatedBudget ? 'primary' as const : 'neutral' as const
    }
  ]
})

const requestProgress = computed(() => {
  const request = data.value?.request
  if (!request) return []

  const responded = Boolean(request.respondedAt || request.assignedName || ['in_review', 'approved', 'in_progress', 'completed', 'closed'].includes(request.status))
  const active = ['approved', 'in_progress', 'completed', 'closed'].includes(request.status)
  const resolved = Boolean(request.resolvedAt || ['completed', 'closed'].includes(request.status))

  return [
    { label: 'Submitted', done: true, detail: formatDate(request.createdAt) },
    { label: 'Agency response', done: responded, detail: request.respondedAt ? formatDate(request.respondedAt) : request.assignedName || 'Pending' },
    { label: 'In progress', done: active, detail: active ? request.status.replace(/_/g, ' ') : 'Queued' },
    { label: 'Resolved', done: resolved, detail: request.resolvedAt ? formatDate(request.resolvedAt) : 'Open' }
  ]
})

const requestNextStep = computed(() => {
  const request = data.value?.request
  if (!request) return null

  if (request.status === 'submitted') {
    return {
      icon: 'i-lucide-search-check',
      title: 'Waiting for agency review',
      description: 'The agency team has received this request and has not responded yet.'
    }
  }

  if (request.status === 'in_review') {
    return {
      icon: 'i-lucide-clipboard-check',
      title: 'Agency review in progress',
      description: request.assignedName
        ? `${request.assignedName} is reviewing the request and will confirm the next step.`
        : 'The agency team is reviewing the scope and next step.'
    }
  }

  if (request.status === 'approved') {
    return {
      icon: 'i-lucide-calendar-plus',
      title: 'Approved for scheduling',
      description: 'This request has been approved and is ready to be scheduled into upcoming work.'
    }
  }

  if (request.status === 'in_progress') {
    return {
      icon: 'i-lucide-loader-circle',
      title: 'Work is in progress',
      description: request.assignedName
        ? `${request.assignedName} is currently handling this request.`
        : 'The agency team is actively working on this request.'
    }
  }

  if (request.status === 'completed') {
    return {
      icon: 'i-lucide-check-circle-2',
      title: 'Request completed',
      description: 'The requested work has been completed.'
    }
  }

  if (request.status === 'closed') {
    return {
      icon: 'i-lucide-lock',
      title: 'Request closed',
      description: 'This request has been closed and the conversation is read-only.'
    }
  }

  if (request.status === 'cancelled') {
    return {
      icon: 'i-lucide-circle-x',
      title: 'Request cancelled',
      description: 'This request was cancelled and no further action is scheduled.'
    }
  }

  return {
    icon: 'i-lucide-message-square',
    title: 'Request received',
    description: 'The agency team can review and respond from their client portal workspace.'
  }
})
</script>

<template>
  <div class="p-6 space-y-6 w-full">
    <div v-if="pending" class="space-y-4">
      <div class="h-8 w-64 bg-elevated animate-pulse rounded" />
      <div class="h-32 bg-elevated animate-pulse rounded-lg" />
    </div>

    <template v-else-if="data?.request">
      <!-- Header -->
      <div>
        <NuxtLink
          :to="data.request.status === 'completed' || data.request.status === 'closed'
            ? '/portal/requests?view=resolved'
            : `/portal/requests?type=${data.request.requestType}&view=open`"
          class="text-sm text-muted hover:text-default mb-2 inline-flex items-center gap-1"
        >
          <UIcon name="i-lucide-arrow-left" class="w-3 h-3" />
          Back to requests
        </NuxtLink>

        <div class="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 class="text-2xl font-bold">
              {{ data.request.title }}
            </h1>
            <div class="flex items-center gap-2 mt-2 flex-wrap">
              <UBadge :color="getStatusColor(data.request.status)" variant="subtle">
                {{ data.request.status.replace(/_/g, ' ') }}
              </UBadge>
              <UBadge :color="getPriorityColor(data.request.priority)" variant="outline">
                {{ data.request.priority }}
              </UBadge>
              <UBadge color="neutral" variant="subtle">
                {{ data.request.requestType === 'job_request' ? 'Job Request' : 'Support Ticket' }}
              </UBadge>
            </div>
          </div>
        </div>
      </div>

      <UCard>
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div
            v-for="step in requestProgress"
            :key="step.label"
            class="rounded-lg border border-default p-3"
            :class="step.done ? 'bg-primary/5' : 'bg-elevated/40'"
          >
            <div class="flex items-center gap-2">
              <UIcon
                :name="step.done ? 'i-lucide-check-circle-2' : 'i-lucide-circle'"
                class="size-4"
                :class="step.done ? 'text-primary' : 'text-muted'"
              />
              <p class="text-sm font-medium">
                {{ step.label }}
              </p>
            </div>
            <p class="text-xs text-muted mt-2">
              {{ step.detail }}
            </p>
          </div>
        </div>
      </UCard>

      <UCard v-if="requestNextStep">
        <div class="flex items-start gap-3">
          <div class="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <UIcon :name="requestNextStep.icon" class="size-5" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-semibold">
              {{ requestNextStep.title }}
            </p>
            <p class="mt-1 text-sm text-muted">
              {{ requestNextStep.description }}
            </p>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-radar" class="text-primary" />
            <span class="font-semibold text-sm">Request Health</span>
          </div>
        </template>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div
            v-for="item in requestHealth"
            :key="item.label"
            class="rounded-lg border border-default bg-default p-3"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs text-muted">
                {{ item.label }}
              </p>
              <UIcon :name="item.icon" class="size-4 text-muted" />
            </div>
            <UBadge :color="item.color" variant="subtle" class="mt-2">
              {{ item.value }}
            </UBadge>
          </div>
        </div>
      </UCard>

      <!-- Info Card -->
      <UCard>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div v-if="data.request.category">
            <p class="text-muted">
              Category
            </p>
            <p class="font-medium">
              {{ data.request.category.replace(/_/g, ' ') }}
            </p>
          </div>
          <div v-if="data.request.projectName">
            <p class="text-muted">
              Project
            </p>
            <p class="font-medium">
              {{ data.request.projectName }}
            </p>
          </div>
          <div>
            <p class="text-muted">
              Submitted By
            </p>
            <p class="font-medium">
              {{ data.request.submittedByName }}
            </p>
          </div>
          <div>
            <p class="text-muted">
              Submitted
            </p>
            <p class="font-medium">
              {{ formatDate(data.request.createdAt) }}
            </p>
          </div>
          <div v-if="data.request.estimatedBudget">
            <p class="text-muted">
              Estimated Budget
            </p>
            <p class="font-medium">
              {{ formatCurrency(data.request.estimatedBudget) }}
            </p>
          </div>
          <div v-if="data.request.desiredDeadline">
            <p class="text-muted">
              Desired Deadline
            </p>
            <p class="font-medium">
              {{ formatDate(data.request.desiredDeadline) }}
            </p>
          </div>
          <div v-if="data.request.respondedAt">
            <p class="text-muted">
              First Response
            </p>
            <p class="font-medium">
              {{ formatDate(data.request.respondedAt) }}
            </p>
          </div>
          <div v-if="data.request.resolvedAt">
            <p class="text-muted">
              Resolved
            </p>
            <p class="font-medium">
              {{ formatDate(data.request.resolvedAt) }}
            </p>
          </div>
        </div>
      </UCard>

      <!-- Description -->
      <UCard>
        <template #header>
          <span class="font-semibold text-sm">Description</span>
        </template>
        <p class="text-sm whitespace-pre-wrap">
          {{ data.request.description }}
        </p>
      </UCard>

      <!-- Assigned Team Member -->
      <UCard v-if="data.request.assignedName">
        <template #header>
          <span class="font-semibold text-sm">Assigned To</span>
        </template>
        <div class="flex items-center gap-3">
          <UAvatar :src="data.request.assignedAvatar || undefined" :alt="data.request.assignedName" size="sm" />
          <div>
            <p class="font-medium text-sm">
              {{ data.request.assignedName }}
            </p>
            <p v-if="data.request.assignedRole" class="text-xs text-muted">
              {{ data.request.assignedRole }}
            </p>
          </div>
        </div>
      </UCard>

      <!-- Response Notes -->
      <UCard v-if="data.request.responseNotes">
        <template #header>
          <span class="font-semibold text-sm">Team Response</span>
        </template>
        <p class="text-sm whitespace-pre-wrap">
          {{ data.request.responseNotes }}
        </p>
        <p v-if="data.request.respondedByName" class="text-xs text-muted mt-2">
          — {{ data.request.respondedByName }}
        </p>
      </UCard>

      <!-- Message Thread -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-messages-square" class="text-primary" />
            <span class="font-semibold text-sm">Conversation</span>
            <UBadge
              v-if="data.messages.length"
              color="neutral"
              variant="subtle"
              size="xs"
            >
              {{ data.messages.length }}
            </UBadge>
          </div>
        </template>

        <div class="space-y-4">
          <div
            v-for="msg in data.messages"
            :key="msg.id"
            class="flex items-start gap-3"
          >
            <UAvatar :src="msg.authorAvatar || undefined" :alt="msg.authorName || 'User'" size="sm" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-sm">{{ msg.authorName }}</span>
                <UBadge
                  v-if="msg.authorType === 'team'"
                  size="xs"
                  variant="subtle"
                  color="primary"
                >
                  Team
                </UBadge>
                <span class="text-xs text-muted">{{ formatDateTime(msg.createdAt) }}</span>
              </div>
              <p class="text-sm mt-1 whitespace-pre-wrap">
                {{ msg.content }}
              </p>
            </div>
          </div>

          <p v-if="!data.messages.length" class="text-sm text-muted text-center py-4">
            No messages yet
          </p>
        </div>

        <!-- Reply form -->
        <div v-if="isOpen" class="mt-4 pt-4 border-t border-default">
          <form class="space-y-3" @submit.prevent="sendMessage">
            <UTextarea
              v-model="newMessage"
              placeholder="Write a reply..."
              :rows="3"
              class="w-full"
            />
            <div class="flex justify-end">
              <UButton
                type="submit"
                :loading="sendingMessage"
                :disabled="!newMessage.trim()"
                icon="i-lucide-send"
              >
                Send
              </UButton>
            </div>
          </form>
        </div>

        <div v-else class="mt-4 pt-4 border-t border-default">
          <p class="text-sm text-muted text-center">
            This request is {{ data.request.status.replace(/_/g, ' ') }}.
          </p>
        </div>
      </UCard>
    </template>
  </div>
</template>
