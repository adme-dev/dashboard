<script setup lang="ts">
import { parseInboxEntity } from '~~/app/utils/inboxEntity'
import InboxItemPreview from '~/components/inbox/InboxItemPreview.vue'

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

const props = defineProps<{
  notification: Notification
}>()

const emit = defineEmits<{
  close: []
  markRead: [notification: Notification]
  delete: [notification: Notification]
  navigate: [notification: Notification]
}>()

const { getNotificationIcon, getNotificationColor, formatRelativeTime } = useNotifications()

// Resolve the underlying item this notification points at (task / brief) so we can
// render it inline. null → no dedicated preview; fall back to the metadata card.
const previewEntity = computed(() => parseInboxEntity(props.notification.link))

const badgeColorMap: Record<string, string> = {
  task_assigned: 'info',
  task_mentioned: 'purple',
  task_comment: 'neutral',
  task_status_changed: 'success',
  task_due_soon: 'warning',
  task_overdue: 'error',
  approval_requested: 'indigo',
  approval_completed: 'success',
  system: 'neutral',
  team_update: 'neutral'
}

const typeLabelMap: Record<string, string> = {
  task_assigned: 'Assigned',
  task_mentioned: 'Mention',
  task_comment: 'Comment',
  task_status_changed: 'Status Changed',
  task_due_soon: 'Due Soon',
  task_overdue: 'Overdue',
  approval_requested: 'Approval',
  approval_completed: 'Approved',
  team_update: 'Team Update',
  system: 'System',
  brief_actioned: 'Brief'
}

function getBadgeColor(type: string) {
  return badgeColorMap[type] || 'neutral'
}

function getTypeLabel(type: string) {
  return typeLabelMap[type] || type.replace(/_/g, ' ')
}
</script>

<template>
  <UDashboardPanel id="inbox-2">
    <UDashboardNavbar :title="notification.title" :toggle="false">
      <template #leading>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          class="-ms-1.5"
          @click="emit('close')"
        />
      </template>

      <template #right>
        <UTooltip v-if="notification.link" :text="previewEntity ? `Open ${previewEntity.label}` : 'Open'">
          <UButton
            icon="i-lucide-external-link"
            color="neutral"
            variant="ghost"
            @click="emit('navigate', notification)"
          />
        </UTooltip>

        <UTooltip v-if="!notification.isRead" text="Mark as Read">
          <UButton
            icon="i-lucide-check"
            color="neutral"
            variant="ghost"
            @click="emit('markRead', notification)"
          />
        </UTooltip>

        <UTooltip text="Delete">
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            @click="emit('delete', notification)"
          />
        </UTooltip>
      </template>
    </UDashboardNavbar>

    <!-- Header section -->
    <div class="flex flex-col sm:flex-row justify-between gap-1 p-4 sm:px-6 border-b border-default">
      <div class="flex items-start gap-4 sm:my-1.5">
        <!-- Avatar with type icon -->
        <div v-if="notification.actor" class="relative shrink-0">
          <UAvatar
            :src="notification.actor.avatarUrl || undefined"
            :alt="notification.actor.name"
            size="3xl"
          />
          <div class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-elevated flex items-center justify-center">
            <UIcon
              :name="getNotificationIcon(notification.type)"
              :class="getNotificationColor(notification.type)"
              class="h-4 w-4"
            />
          </div>
        </div>
        <div v-else class="shrink-0 w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
          <UIcon
            :name="getNotificationIcon(notification.type)"
            :class="getNotificationColor(notification.type)"
            class="h-6 w-6"
          />
        </div>

        <div class="min-w-0">
          <p class="font-semibold text-highlighted">
            {{ notification.actor?.name || 'System' }}
          </p>
          <div class="flex items-center gap-2 mt-0.5">
            <UBadge
              :label="getTypeLabel(notification.type)"
              :color="getBadgeColor(notification.type)"
              variant="subtle"
              size="xs"
            />
          </div>
        </div>
      </div>

      <p class="max-sm:pl-16 text-muted text-sm sm:mt-2">
        {{ formatRelativeTime(notification.createdAt) }}
      </p>
    </div>

    <!-- Message body -->
    <div class="flex-1 p-4 sm:p-6 overflow-y-auto">
      <p class="whitespace-pre-wrap">
        {{ notification.message }}
      </p>

      <!-- Inline preview of the underlying item (task / brief) — "view what's inside it" -->
      <div v-if="previewEntity" class="mt-6 rounded-lg border border-default bg-elevated/30 p-4">
        <InboxItemPreview :notification="notification" />
      </div>

      <!-- Metadata fallback — only when there's no rich item preview -->
      <div v-else-if="notification.metadata && Object.keys(notification.metadata).length > 0" class="mt-6">
        <UCard variant="subtle">
          <template #header>
            <span class="text-xs font-medium text-dimmed uppercase tracking-wider">Details</span>
          </template>
          <dl class="space-y-2 text-sm">
            <div v-for="(value, key) in notification.metadata" :key="String(key)" class="flex items-start gap-2">
              <dt class="text-muted font-medium min-w-[100px] capitalize">
                {{ String(key).replace(/_/g, ' ') }}
              </dt>
              <dd class="text-highlighted">
                {{ value }}
              </dd>
            </div>
          </dl>
        </UCard>
      </div>
    </div>

    <!-- Action buttons -->
    <div class="p-4 sm:px-6 shrink-0 border-t border-default flex items-center gap-2">
      <UButton
        v-if="notification.link"
        :label="previewEntity ? `Open ${previewEntity.label}` : 'View'"
        icon="i-lucide-external-link"
        color="primary"
        @click="emit('navigate', notification)"
      />
      <UButton
        v-if="!notification.isRead"
        label="Mark as Read"
        icon="i-lucide-check"
        color="neutral"
        variant="outline"
        @click="emit('markRead', notification)"
      />
      <UButton
        label="Delete"
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        @click="emit('delete', notification)"
      />
    </div>
  </UDashboardPanel>
</template>
