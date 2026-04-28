<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-md' }">
    <template #content>
      <div class="p-5 space-y-4">
        <h3 class="text-base font-semibold">{{ props.itemId ? 'Item Notifications' : 'Board Notifications' }}</h3>

        <URadioGroup v-model="preset" :items="presetItems" />

        <div v-if="preset === 'custom'" class="space-y-3 pl-1 border-l-2 border-default">
          <p class="text-xs font-medium text-muted uppercase tracking-wide pl-2">Notify me about</p>
          <div class="pl-2 space-y-2">
            <UCheckbox
              v-for="g in groups"
              :key="g.key"
              v-model="selectedGroups[g.key]"
              :label="g.label"
            />
          </div>
        </div>

        <div class="pt-2 border-t border-default">
          <UCheckbox v-model="emailEnabled" label="Also send email" />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
          <UButton label="Save" color="primary" :loading="saving" @click="save" />
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{ boardId: string; itemId?: string }>()
const emit = defineEmits<{ saved: [{ subscribed: boolean; level: string | null }] }>()

const open = defineModel<boolean>('open', { default: false })
const toast = useToast()

const GROUPS = {
  items:     { key: 'items',     label: 'Items (created / updated / deleted)', events: ['task_created', 'task_updated', 'task_deleted'] },
  status:    { key: 'status',    label: 'Status moves',                        events: ['status_changed'] },
  fields:    { key: 'fields',    label: 'Field edits',                         events: ['cell_updated'] },
  people:    { key: 'people',    label: 'People (assigned, @mentioned)',       events: ['task_assigned', 'task_mentioned'] },
  structure: { key: 'structure', label: 'Structure (groups, columns)',         events: ['group_updated', 'column_updated'] },
} as const

type GroupKey = keyof typeof GROUPS
const groups = Object.values(GROUPS)

const presetItems = [
  { value: 'all',      label: 'All activity' },
  { value: 'mentions', label: 'Mentions only' },
  { value: 'muted',    label: 'Muted' },
  { value: 'custom',   label: 'Custom' },
]

const preset = ref<'all' | 'mentions' | 'muted' | 'custom'>('all')
const selectedGroups = reactive<Record<GroupKey, boolean>>({
  items: true, status: true, fields: false, people: true, structure: false,
})
const emailEnabled = ref(false)
const saving = ref(false)
let suppressPresetFlip = false

function eventsToGroups(events: string[]): { groups: Record<GroupKey, boolean>; matchesPreset: 'all' | 'mentions' | null } {
  if (events.length === 0) {
    return { groups: { items: true, status: true, fields: true, people: true, structure: true }, matchesPreset: 'all' }
  }
  if (events.length === 1 && events[0] === 'task_mentioned') {
    return { groups: { items: false, status: false, fields: false, people: true, structure: false }, matchesPreset: 'mentions' }
  }
  const result = { items: false, status: false, fields: false, people: false, structure: false } as Record<GroupKey, boolean>
  for (const k of Object.keys(GROUPS) as GroupKey[]) {
    const groupEvents = GROUPS[k].events as readonly string[]
    if (groupEvents.every(e => events.includes(e))) result[k] = true
  }
  return { groups: result, matchesPreset: null }
}

function groupsToEvents(): string[] {
  const out: string[] = []
  for (const k of Object.keys(GROUPS) as GroupKey[]) {
    if (selectedGroups[k]) out.push(...GROUPS[k].events)
  }
  // If everything is selected, send empty array (= "all events").
  const allEvents = Object.values(GROUPS).flatMap(g => g.events as readonly string[])
  if (out.length === allEvents.length) return []
  return out
}

async function hydrate() {
  suppressPresetFlip = true
  try {
    const { subscriptions } = await $fetch<{ subscriptions: any[] }>(
      `/api/agency/boards/${props.boardId}/subscriptions`
    )
    // Match the right subscription scope: item-level if itemId set, else board-level.
    const sub = props.itemId
      ? subscriptions.find((s: any) => s.itemId === props.itemId && !s.columnId)
      : subscriptions.find((s: any) => !s.itemId && !s.columnId)
    if (!sub) {
      preset.value = 'all'
      Object.assign(selectedGroups, { items: true, status: true, fields: true, people: true, structure: true })
      emailEnabled.value = false
      return
    }
    if (sub.isMuted) {
      preset.value = 'muted'
      emailEnabled.value = !!sub.notifyEmail
      return
    }
    const { groups: g, matchesPreset } = eventsToGroups(sub.events || [])
    Object.assign(selectedGroups, g)
    preset.value = matchesPreset || 'custom'
    emailEnabled.value = !!sub.notifyEmail
  } catch {
    // non-critical — leave defaults
  } finally {
    // Flush in next tick so the watch above (preset auto-flip) doesn't fire on hydrate.
    nextTick(() => { suppressPresetFlip = false })
  }
}

watch(open, (isOpen) => {
  if (isOpen) hydrate()
})

watch(selectedGroups, () => {
  if (suppressPresetFlip) return
  if (preset.value !== 'custom') preset.value = 'custom'
}, { deep: true })

async function save() {
  saving.value = true
  try {
    let body: { itemId?: string; events: string[]; notifyInapp: boolean; notifyEmail: boolean; isMuted: boolean }
    let level: string

    if (preset.value === 'muted') {
      body = { events: [], notifyInapp: true, notifyEmail: emailEnabled.value, isMuted: true }
      level = 'muted'
    } else if (preset.value === 'all') {
      body = { events: [], notifyInapp: true, notifyEmail: emailEnabled.value, isMuted: false }
      level = 'all'
    } else if (preset.value === 'mentions') {
      body = { events: ['task_mentioned'], notifyInapp: true, notifyEmail: emailEnabled.value, isMuted: false }
      level = 'mentions'
    } else {
      const events = groupsToEvents()
      const noneSelected = !Object.values(selectedGroups).some(v => v)
      if (noneSelected) {
        // Empty selection → treat as muted to avoid "subscribed but receives nothing" footgun.
        body = { events: [], notifyInapp: true, notifyEmail: emailEnabled.value, isMuted: true }
        level = 'muted'
      } else {
        body = { events, notifyInapp: true, notifyEmail: emailEnabled.value, isMuted: false }
        level = 'custom'
      }
    }

    if (props.itemId) body.itemId = props.itemId

    await $fetch(`/api/agency/boards/${props.boardId}/subscribe`, { method: 'POST', body })
    emit('saved', { subscribed: true, level })
    open.value = false
  } catch (err: any) {
    toast.add({
      title: 'Could not save notification settings',
      description: err?.statusMessage || 'Please try again.',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}
</script>
