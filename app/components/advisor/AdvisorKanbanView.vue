<script setup lang="ts">
// Four-column Kanban grouped by status. Native HTML5 drag-and-drop
// (mirrors the pattern used in app/components/workflow/KanbanCard.vue
// and KanbanColumn.vue — no library dependency).
//
// Drop fires @move(id, newStatus); parent owns the PATCH and the snap-
// back on failure (this component just optimistically dims the card
// while it's the active dragged item).

type Recommendation = {
  id: string
  title: string
  action: string
  client_name: string | null
  priority: 'low' | 'medium' | 'high'
  category: string | null
  effort: 'xs' | 's' | 'm' | 'l' | 'xl' | null
  source: 'ai' | 'manual'
  status: 'open' | 'in_progress' | 'done' | 'dismissed'
  due_date: string | null
  snoozed_until: string | null
  assignee_name: string | null
  assignee_avatar_url: string | null
  comment_count?: number | null
}

type Status = 'open' | 'in_progress' | 'done' | 'dismissed'

const props = defineProps<{
  recommendations: Recommendation[]
}>()

const emit = defineEmits<{
  (e: 'open', rec: Recommendation): void
  (e: 'move', id: string, status: Status): void
  (e: 'add', status: Status): void
}>()

const COLUMNS: Array<{ key: Status; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
  { key: 'dismissed', label: 'Dismissed' },
]

const grouped = computed(() => {
  const buckets: Record<Status, Recommendation[]> = {
    open: [], in_progress: [], done: [], dismissed: [],
  }
  for (const r of props.recommendations) {
    if (r.status in buckets) buckets[r.status].push(r)
  }
  return buckets
})

// Drag state — the id of the card currently being dragged. Used to
// dim it visually and to know what to PATCH on drop.
const draggingId = ref<string | null>(null)
const overColumn = ref<Status | null>(null)

function onDragStart(rec: Recommendation, ev: DragEvent) {
  draggingId.value = rec.id
  // Required for Firefox; the value is unused but must be set.
  ev.dataTransfer?.setData('text/plain', rec.id)
  ev.dataTransfer && (ev.dataTransfer.effectAllowed = 'move')
}

function onDragEnd() {
  draggingId.value = null
  overColumn.value = null
}

function onDragOver(status: Status, ev: DragEvent) {
  ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
  overColumn.value = status
}

function onDragLeave(status: Status) {
  if (overColumn.value === status) overColumn.value = null
}

function onDrop(status: Status, ev: DragEvent) {
  ev.preventDefault()
  const id = draggingId.value
  draggingId.value = null
  overColumn.value = null
  if (!id) return
  // No-op if the card was already in this column.
  const rec = props.recommendations.find((r) => r.id === id)
  if (!rec || rec.status === status) return
  emit('move', id, status)
}
</script>

<template>
  <div class="flex gap-3 overflow-x-auto pb-2">
    <div
      v-for="col in COLUMNS"
      :key="col.key"
      class="shrink-0 w-72 rounded-md border border-default bg-elevated/30
             flex flex-col"
      :class="{ 'ring-2 ring-primary/30 bg-elevated/60': overColumn === col.key }"
      @dragover="(e) => onDragOver(col.key, e)"
      @dragleave="onDragLeave(col.key)"
      @drop="(e) => onDrop(col.key, e)"
    >
      <!-- Column header -->
      <div class="flex items-center justify-between px-3 py-2 border-b border-default">
        <div class="flex items-center gap-2">
          <span class="font-medium text-sm">{{ col.label }}</span>
          <UBadge color="neutral" variant="subtle" size="xs">{{ grouped[col.key].length }}</UBadge>
        </div>
        <UButton
          icon="i-lucide-plus"
          size="3xs"
          color="neutral"
          variant="ghost"
          @click="emit('add', col.key)"
        />
      </div>

      <!-- Cards -->
      <div class="flex-1 p-2 space-y-2 min-h-[120px]">
        <AdvisorRecCard
          v-for="rec in grouped[col.key]"
          :key="rec.id"
          :rec="rec"
          :dragging="draggingId === rec.id"
          @click="emit('open', rec)"
          @dragstart="(ev) => onDragStart(rec, ev)"
          @dragend="onDragEnd"
        />
        <div
          v-if="!grouped[col.key].length"
          class="text-center text-xs text-muted py-6 italic"
        >No items</div>
      </div>
    </div>
  </div>
</template>
