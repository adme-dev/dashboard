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
</script>

<template>
  <div class="p-6 space-y-6 max-w-4xl mx-auto">
    <div v-if="pending" class="space-y-4">
      <div class="h-8 w-64 bg-elevated animate-pulse rounded" />
      <div class="h-32 bg-elevated animate-pulse rounded-lg" />
    </div>

    <template v-else-if="data?.request">
      <!-- Header -->
      <div>
        <NuxtLink to="/portal/requests" class="text-sm text-muted hover:text-default mb-2 inline-flex items-center gap-1">
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
