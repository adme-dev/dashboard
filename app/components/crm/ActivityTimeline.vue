<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { CrmActivity } from '~/types/crm'

const props = defineProps<{ clientId: string, targetType: 'person' | 'company' | 'opportunity', targetId: string }>()
const clientId = toRef(props, 'clientId')
const targetId = toRef(props, 'targetId')
const { activities, pending, create, toggle, remove } = useCrmActivities(clientId, props.targetType, targetId)
const toast = useToast()

const TYPES = [
  { value: 'note', label: 'Note', icon: 'i-lucide-sticky-note' },
  { value: 'call', label: 'Call', icon: 'i-lucide-phone' },
  { value: 'email', label: 'Email', icon: 'i-lucide-mail' },
  { value: 'meeting', label: 'Meeting', icon: 'i-lucide-users' },
  { value: 'task', label: 'Task', icon: 'i-lucide-check-square' },
]
function iconFor(t: string) { return TYPES.find(x => x.value === t)?.icon ?? 'i-lucide-circle' }
function rel(a: CrmActivity) {
  const d = a.scheduled_at || a.created_at
  try { return formatDistanceToNow(new Date(d), { addSuffix: true }) }
  catch { return '' }
}

const draft = reactive({ type: 'note', title: '' })
const saving = ref(false)
async function add() {
  if (!draft.title.trim()) return
  saving.value = true
  try {
    await create({ type: draft.type as CrmActivity['type'], title: draft.title })
    draft.title = ''
  } catch (e: any) {
    toast.add({ title: 'Could not add activity', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <USelectMenu v-model="draft.type" :items="TYPES" value-key="value" class="w-32" />
      <UInput v-model="draft.title" placeholder="Log a note, call, task…" class="flex-1" @keyup.enter="add" />
      <UButton :loading="saving" :disabled="!draft.title.trim()" icon="i-lucide-plus" @click="add" />
    </div>

    <div v-if="pending" class="text-xs text-muted">Loading…</div>
    <ul v-else-if="activities.length" class="space-y-2">
      <li v-for="a in activities" :key="a.id" class="flex items-start gap-2.5 group">
        <UIcon :name="iconFor(a.type)" class="size-4 mt-0.5 text-muted shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="text-sm" :class="{ 'line-through text-muted': a.is_completed }">{{ a.title }}</p>
          <p v-if="a.body" class="text-xs text-muted">{{ a.body }}</p>
          <p class="text-xs text-muted/70">{{ rel(a) }}</p>
        </div>
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <UButton
            v-if="a.type === 'task'"
            :icon="a.is_completed ? 'i-lucide-rotate-ccw' : 'i-lucide-check'"
            size="xs" variant="ghost" color="neutral"
            @click="toggle(a.id, !a.is_completed)"
          />
          <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="remove(a.id)" />
        </div>
      </li>
    </ul>
    <p v-else class="text-xs text-muted">No activity yet.</p>
  </div>
</template>
