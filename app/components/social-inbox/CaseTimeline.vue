<script setup lang="ts">
import type { SocialInboxCaseTimelineItem } from '~/types'

defineProps<{
  items: SocialInboxCaseTimelineItem[]
  loading?: boolean
}>()

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : ''
}

function sourceLabel(item: SocialInboxCaseTimelineItem) {
  if (item.source === 'task_activity') return 'Task'
  if (item.source === 'client_request_message') return 'Request'
  if (item.source === 'conversation_event') return 'Case'
  return item.is_internal ? 'Internal' : 'Social'
}

function iconForSource(item: SocialInboxCaseTimelineItem) {
  if (item.source === 'task_activity') return 'i-lucide-list-checks'
  if (item.source === 'client_request_message') return 'i-lucide-inbox'
  if (item.source === 'conversation_event') return 'i-lucide-git-branch'
  if (item.is_internal) return 'i-lucide-lock'
  return 'i-lucide-message-circle'
}

function titleForItem(item: SocialInboxCaseTimelineItem) {
  if (item.source === 'task_activity') {
    const taskTitle = item.metadata?.task_title
    return taskTitle ? `${item.type} - ${taskTitle}` : item.type
  }
  if (item.source === 'client_request_message') {
    return item.metadata?.client_request_title || 'Client request'
  }
  if (item.source === 'conversation_event') return item.type.replaceAll('_', ' ')
  return item.type === 'internal_note' ? 'Internal note' : 'Social message'
}
</script>

<template>
  <div class="space-y-3 rounded-md border border-default bg-elevated/40 p-3">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 text-xs font-medium text-muted">
        <UIcon name="i-lucide-history" class="size-3.5" />
        Case timeline
      </div>
      <UIcon
        v-if="loading"
        name="i-lucide-loader-circle"
        class="size-3.5 animate-spin text-muted"
      />
    </div>
    <div v-if="!loading && !items.length" class="text-xs text-muted">
      Link a task or client request to show native work history.
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="item in items"
        :key="`${item.source}:${item.id}`"
        class="grid grid-cols-[1rem_1fr] gap-2 text-xs"
      >
        <UIcon
          :name="iconForSource(item)"
          class="mt-0.5 size-3.5 text-muted"
        />
        <div class="min-w-0 space-y-0.5">
          <div class="flex min-w-0 items-center gap-1.5">
            <span class="truncate font-medium text-default">{{ titleForItem(item) }}</span>
            <UBadge
              color="neutral"
              variant="subtle"
              size="xs"
              class="shrink-0"
            >
              {{ sourceLabel(item) }}
            </UBadge>
          </div>
          <p v-if="item.content" class="line-clamp-2 whitespace-pre-wrap break-words text-muted">
            {{ item.content }}
          </p>
          <div class="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
            <span class="truncate">{{ item.actor_name || 'Unknown' }}</span>
            <span aria-hidden="true">-</span>
            <span class="shrink-0">{{ fmt(item.occurred_at) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
