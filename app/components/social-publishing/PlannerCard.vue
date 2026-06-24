<script setup lang="ts">
import type { SocialBoardPost } from '~/types'

/**
 * A single draft on the planner board. Dumb/presentational: click opens it in
 * Compose, drag is handled by the parent board (lane transition). Shows copy,
 * networks, campaign colour chip, assignee, the scheduled/due date, and an
 * attention flag for failed/cancelled posts.
 */
const props = defineProps<{ post: SocialBoardPost }>()
const emit = defineEmits<{ open: [SocialBoardPost]; dragstart: [DragEvent, SocialBoardPost] }>()

const fmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const dateLabel = computed(() => {
  const iso = props.post.scheduled_at || props.post.due_at
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : fmt.format(d)
})
const dateIcon = computed(() => (props.post.scheduled_at ? 'i-lucide-calendar-clock' : 'i-lucide-flag'))
</script>

<template>
  <div
    draggable="true"
    class="rounded-lg border border-default bg-default p-3 cursor-pointer hover:border-primary/50 transition-colors space-y-2"
    @click="emit('open', post)"
    @dragstart="emit('dragstart', $event, post)"
  >
    <p class="text-sm line-clamp-2">{{ post.content || '(no copy yet)' }}</p>

    <div class="flex items-center gap-1 flex-wrap">
      <UBadge v-for="pl in post.platforms" :key="pl" size="xs" color="neutral" variant="subtle">{{ pl }}</UBadge>
      <UBadge v-if="post.needs_attention" size="xs" color="error" variant="subtle" icon="i-lucide-alert-triangle">
        {{ post.status }}
      </UBadge>
    </div>

    <div class="flex items-center gap-2 text-xs text-muted">
      <span v-if="post.campaign" class="inline-flex items-center gap-1 min-w-0">
        <span class="size-2 rounded-full shrink-0" :style="{ backgroundColor: post.campaign.color }" />
        <span class="truncate">{{ post.campaign.name }}</span>
      </span>
      <span v-if="dateLabel" class="inline-flex items-center gap-1 ml-auto shrink-0">
        <UIcon :name="dateIcon" class="size-3" />{{ dateLabel }}
      </span>
      <UTooltip v-if="post.assigned_to" text="Assigned">
        <UIcon name="i-lucide-user-check" class="size-3.5 shrink-0" :class="post.campaign ? 'ml-1' : 'ml-auto'" />
      </UTooltip>
    </div>
  </div>
</template>
