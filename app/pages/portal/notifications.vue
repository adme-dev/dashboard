<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { data, pending, refresh } = useFetch('/api/portal/notifications')
const toast = useToast()

interface PortalNotification {
  id: string
  type: string
  title: string
  message?: string | null
  actionUrl?: string | null
  isRead: boolean
  createdAt: string
  approvalId?: string | null
  project?: { id: string, name: string } | null
  invoice?: { id: string, number: string } | null
}

const notificationIcons: Record<string, string> = {
  approval_requested: 'i-lucide-check-circle',
  approval_responded: 'i-lucide-check-check',
  deliverable_published: 'i-lucide-image',
  invoice_sent: 'i-lucide-receipt',
  comment_added: 'i-lucide-message-circle',
  comment_reply: 'i-lucide-message-circle',
  project_updated: 'i-lucide-folder-kanban',
  status_change: 'i-lucide-refresh-cw',
  default: 'i-lucide-bell'
}

function getIcon(type: string) {
  return notificationIcons[type] || notificationIcons.default
}

function timeAgo(date: string) {
  const now = new Date()
  const d = new Date(date)
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

async function markRead(id: string) {
  try {
    await $fetch(`/api/portal/notifications/${id}/read`, { method: 'POST' })
    await refresh()
  } catch {
    toast.add({ title: 'Failed to mark notification read', color: 'error' })
  }
}

async function markAllRead() {
  if (!data.value?.notifications) return
  const unread = data.value.notifications.filter(n => !n.isRead)
  try {
    await Promise.all(unread.map(n => $fetch(`/api/portal/notifications/${n.id}/read`, { method: 'POST' })))
    await refresh()
    toast.add({ title: 'All notifications marked as read', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to mark notifications read', color: 'error' })
  }
}

function getLink(n: PortalNotification) {
  if (n.actionUrl) return n.actionUrl
  if (n.approvalId) return `/portal/approvals/${n.approvalId}`
  if (n.project?.id) return `/portal/projects/${n.project.id}`
  if (n.invoice?.id) return '/portal/invoices'
  return null
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-3xl mx-auto">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        Notifications
      </h1>
      <UButton
        v-if="data?.unreadCount && data.unreadCount > 0"
        variant="ghost"
        size="sm"
        @click="markAllRead"
      >
        Mark all as read
      </UButton>
    </div>

    <div v-if="pending" class="space-y-3">
      <div v-for="i in 5" :key="i" class="h-16 rounded-lg bg-elevated animate-pulse" />
    </div>

    <div v-else class="space-y-1">
      <component
        :is="getLink(n) ? 'NuxtLink' : 'div'"
        v-for="n in data?.notifications"
        :key="n.id"
        :to="getLink(n)"
        class="flex items-start gap-3 p-3 rounded-lg transition-colors"
        :class="[
          n.isRead ? 'opacity-60' : 'bg-primary/5',
          getLink(n) ? 'hover:bg-elevated cursor-pointer' : ''
        ]"
        @click="!n.isRead && markRead(n.id)"
      >
        <div
          class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          :class="n.isRead ? 'bg-elevated' : 'bg-primary/10'"
        >
          <UIcon :name="getIcon(n.type)" class="w-4 h-4" :class="n.isRead ? 'text-muted' : 'text-primary'" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <p class="text-sm font-medium">
              {{ n.title }}
            </p>
            <div v-if="!n.isRead" class="w-2 h-2 rounded-full bg-primary shrink-0" />
          </div>
          <p v-if="n.message" class="text-xs text-muted mt-0.5 line-clamp-2">
            {{ n.message }}
          </p>
          <span class="text-xs text-muted">{{ timeAgo(n.createdAt) }}</span>
        </div>
      </component>
    </div>

    <p v-if="!pending && (!data?.notifications || data.notifications.length === 0)" class="text-center text-muted py-12">
      No notifications
    </p>
  </div>
</template>
