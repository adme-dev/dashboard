<script setup lang="ts">
// Card used inside the Kanban view. Compact summary of a recommendation;
// drag-and-drop is handled at the column level — this component just
// emits dragstart/dragend so the parent can track the dragged id.

type Recommendation = {
  id: string
  title: string
  action: string
  client_name: string | null
  priority: 'low' | 'medium' | 'high'
  category: string | null
  effort: 'xs' | 's' | 'm' | 'l' | 'xl' | null
  source: 'ai' | 'manual'
  due_date: string | null
  snoozed_until: string | null
  assignee_name: string | null
  assignee_avatar_url: string | null
  comment_count?: number | null
}

const props = defineProps<{
  rec: Recommendation
  dragging?: boolean
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'dragstart', ev: DragEvent): void
  (e: 'dragend'): void
}>()

const PRIORITY_STRIPE: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
}

const EFFORT_LABELS: Record<string, string> = {
  xs: 'XS', s: 'S', m: 'M', l: 'L', xl: 'XL',
}

function formatDue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const isOverdue = computed(() => {
  if (!props.rec.due_date) return false
  return new Date(props.rec.due_date).getTime() < Date.now()
})
</script>

<template>
  <div
    class="relative p-3 pl-4 rounded-md border border-default bg-default
           cursor-pointer select-none hover:bg-elevated/40 transition-colors"
    :class="{ 'opacity-40 scale-95': dragging }"
    draggable="true"
    role="listitem"
    tabindex="0"
    @click="emit('click')"
    @keydown.enter="emit('click')"
    @keydown.space.prevent="emit('click')"
    @dragstart="(e) => emit('dragstart', e)"
    @dragend="emit('dragend')"
  >
    <!-- Priority left stripe -->
    <span
      class="absolute left-0 top-0 bottom-0 w-1 rounded-l-md"
      :class="PRIORITY_STRIPE[rec.priority] ?? 'bg-slate-400'"
      :title="`${rec.priority} priority`"
      aria-hidden="true"
    />

    <!-- Title -->
    <p class="font-medium text-sm line-clamp-1">{{ rec.title }}</p>

    <!-- Action excerpt -->
    <p class="text-xs text-muted line-clamp-2 mt-0.5">{{ rec.action }}</p>

    <!-- Meta row -->
    <div class="flex items-center flex-wrap gap-1.5 mt-2">
      <AdvisorCategoryBadge v-if="rec.category" :category="rec.category" size="xs" />
      <UBadge v-if="rec.effort" color="neutral" variant="subtle" size="xs">
        {{ EFFORT_LABELS[rec.effort] }}
      </UBadge>
      <UBadge v-if="rec.client_name" color="info" variant="subtle" size="xs">
        {{ rec.client_name }}
      </UBadge>
      <UBadge v-else color="neutral" variant="subtle" size="xs">Agency</UBadge>
      <UBadge
        v-if="rec.source === 'manual'"
        color="info"
        variant="subtle"
        size="xs"
      >Manual</UBadge>
    </div>

    <!-- Footer: due/snooze/assignee/comments -->
    <div class="flex items-center justify-between gap-2 mt-2 text-[10px] text-muted">
      <div class="flex items-center gap-2">
        <span
          v-if="rec.due_date"
          class="inline-flex items-center gap-0.5"
          :class="{ 'text-red-500': isOverdue }"
        >
          <UIcon name="i-lucide-calendar" class="size-3" />
          {{ formatDue(rec.due_date) }}
        </span>
        <UTooltip
          v-if="rec.snoozed_until"
          :text="`Snoozed until ${formatDue(rec.snoozed_until)}`"
        >
          <UIcon name="i-lucide-bell-off" class="size-3 text-amber-500" />
        </UTooltip>
        <span
          v-if="rec.comment_count && rec.comment_count > 0"
          class="inline-flex items-center gap-0.5"
        >
          <UIcon name="i-lucide-message-square" class="size-3" />
          {{ rec.comment_count }}
        </span>
      </div>
      <UAvatar
        v-if="rec.assignee_name"
        :src="rec.assignee_avatar_url ?? undefined"
        :alt="rec.assignee_name"
        size="3xs"
      />
    </div>
  </div>
</template>
