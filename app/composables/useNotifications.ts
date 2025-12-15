/**
 * Notifications Composable
 * Manages in-app notifications state and actions
 */

interface NotificationActor {
  id: string
  name: string
  avatarUrl: string | null
}

interface Notification {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  metadata: Record<string, any> | null
  isRead: boolean
  readAt: string | null
  createdAt: string
  actor: NotificationActor | null
}

interface NotificationsResponse {
  notifications: Notification[]
  unreadCount: number
  hasMore: boolean
}

export function useNotifications() {
  const notifications = useState<Notification[]>('notifications', () => [])
  const unreadCount = useState<number>('notifications-unread', () => 0)
  const loading = useState<boolean>('notifications-loading', () => false)
  const hasMore = useState<boolean>('notifications-has-more', () => false)

  /**
   * Fetch notifications from API
   */
  async function fetchNotifications(options?: { unreadOnly?: boolean; append?: boolean }) {
    loading.value = true
    try {
      const offset = options?.append ? notifications.value.length : 0
      const params = new URLSearchParams()
      if (options?.unreadOnly) params.set('unread', 'true')
      if (offset) params.set('offset', String(offset))

      const data = await $fetch<NotificationsResponse>(`/api/notifications?${params}`)

      if (options?.append) {
        notifications.value = [...notifications.value, ...data.notifications]
      } else {
        notifications.value = data.notifications
      }
      unreadCount.value = data.unreadCount
      hasMore.value = data.hasMore

      return data
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  /**
   * Mark a single notification as read
   */
  async function markAsRead(notificationId: string) {
    try {
      await $fetch(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })

      // Update local state
      const notification = notifications.value.find(n => n.id === notificationId)
      if (notification && !notification.isRead) {
        notification.isRead = true
        notification.readAt = new Date().toISOString()
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
      throw error
    }
  }

  /**
   * Mark all notifications as read
   */
  async function markAllAsRead() {
    try {
      await $fetch('/api/notifications/read-all', { method: 'PATCH' })

      // Update local state
      notifications.value.forEach(n => {
        if (!n.isRead) {
          n.isRead = true
          n.readAt = new Date().toISOString()
        }
      })
      unreadCount.value = 0
    } catch (error) {
      console.error('Failed to mark all as read:', error)
      throw error
    }
  }

  /**
   * Delete a notification
   */
  async function deleteNotification(notificationId: string) {
    try {
      await $fetch(`/api/notifications/${notificationId}`, { method: 'DELETE' })

      // Update local state
      const index = notifications.value.findIndex(n => n.id === notificationId)
      if (index !== -1) {
        const notification = notifications.value[index]
        if (!notification.isRead) {
          unreadCount.value = Math.max(0, unreadCount.value - 1)
        }
        notifications.value.splice(index, 1)
      }
    } catch (error) {
      console.error('Failed to delete notification:', error)
      throw error
    }
  }

  /**
   * Get notification icon based on type
   */
  function getNotificationIcon(type: string): string {
    const icons: Record<string, string> = {
      task_assigned: 'i-lucide-user-check',
      task_mentioned: 'i-lucide-at-sign',
      task_comment: 'i-lucide-message-circle',
      task_status_changed: 'i-lucide-arrow-right-circle',
      task_due_soon: 'i-lucide-clock',
      task_overdue: 'i-lucide-alert-triangle',
      approval_requested: 'i-lucide-check-circle',
      approval_completed: 'i-lucide-check-circle-2',
      invitation_received: 'i-lucide-mail',
      team_update: 'i-lucide-users',
      system: 'i-lucide-info'
    }
    return icons[type] || 'i-lucide-bell'
  }

  /**
   * Get notification color based on type
   */
  function getNotificationColor(type: string): string {
    const colors: Record<string, string> = {
      task_assigned: 'text-blue-500',
      task_mentioned: 'text-purple-500',
      task_comment: 'text-neutral-500',
      task_status_changed: 'text-emerald-500',
      task_due_soon: 'text-amber-500',
      task_overdue: 'text-red-500',
      approval_requested: 'text-indigo-500',
      approval_completed: 'text-emerald-500',
      invitation_received: 'text-blue-500',
      team_update: 'text-neutral-500',
      system: 'text-neutral-500'
    }
    return colors[type] || 'text-neutral-500'
  }

  /**
   * Format relative time for notification
   */
  function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return {
    notifications,
    unreadCount,
    loading,
    hasMore,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getNotificationIcon,
    getNotificationColor,
    formatRelativeTime
  }
}
