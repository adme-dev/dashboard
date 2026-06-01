<script setup lang="ts">
// frontend-design principles applied as consistency with the dashboard system:
// UFormField rhythm, 2-col grid, semantic tokens, UPopover+UCalendar dates.
import { CalendarDate, parseDate, getLocalTimeZone, type DateValue } from '@internationalized/date'
import type { CrmTask, CrmTaskType, CrmTaskPriority } from '~/types/crm'

const props = defineProps<{ task: CrmTask | null }>()
const emit = defineEmits<{ submit: [Record<string, unknown>], cancel: [] }>()

const typeItems = [
  { label: 'Follow-up', value: 'follow_up' },
  { label: 'Call', value: 'call' },
  { label: 'Email', value: 'email' },
  { label: 'SMS', value: 'sms' },
  { label: 'Meeting', value: 'meeting' },
  { label: 'General', value: 'general' },
]
const priorityItems = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' },
]

const form = reactive({
  title: props.task?.title ?? '',
  task_type: (props.task?.task_type ?? 'follow_up') as CrmTaskType,
  priority: (props.task?.priority ?? 'medium') as CrmTaskPriority,
  due_date: props.task?.due_at ? props.task.due_at.slice(0, 10) : '',
  reminder_date: props.task?.reminder_at ? props.task.reminder_at.slice(0, 10) : '',
  description: props.task?.description ?? '',
})
const errors = ref<Record<string, string>>({})
const loading = ref(false)

// ISO date <-> CalendarDate bridge (canonical TaskCreateDialog pattern).
function toCalendarDate(iso: string): DateValue | null {
  if (!iso) return null
  try { return parseDate(iso.length > 10 ? iso.slice(0, 10) : iso) } catch { return null }
}
const dateFormatter = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
function formatDate(iso: string): string {
  const cd = toCalendarDate(iso)
  if (!cd) return ''
  return dateFormatter.format(new Date((cd as CalendarDate).year, (cd as CalendarDate).month - 1, (cd as CalendarDate).day))
}
const dueDateModel = computed({
  get: () => toCalendarDate(form.due_date),
  set: v => { form.due_date = v ? v.toString() : '' },
})
const reminderDateModel = computed({
  get: () => toCalendarDate(form.reminder_date),
  set: v => { form.reminder_date = v ? v.toString() : '' },
})
// Date-only -> full ISO datetime (server columns are timestamptz; zod wants .datetime()).
function toIso(date: string): string | null {
  return date ? new Date(`${date}T00:00:00.000Z`).toISOString() : null
}

function submit() {
  errors.value = {}
  if (!form.title.trim()) errors.value.title = 'Title is required'
  if (Object.keys(errors.value).length) return
  loading.value = true
  try {
    emit('submit', {
      title: form.title.trim(),
      task_type: form.task_type,
      priority: form.priority,
      due_at: toIso(form.due_date),
      reminder_at: toIso(form.reminder_date),
      description: form.description || null,
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <UFormField label="Title" :error="errors.title" required>
      <UInput v-model="form.title" placeholder="Call back about renewal" autofocus />
    </UFormField>

    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Type">
        <USelectMenu v-model="form.task_type" :items="typeItems" value-key="value" />
      </UFormField>
      <UFormField label="Priority">
        <USelectMenu v-model="form.priority" :items="priorityItems" value-key="value" />
      </UFormField>

      <UFormField label="Due date">
        <UPopover>
          <UButton color="neutral" variant="outline" class="w-full justify-start" icon="i-lucide-calendar">
            {{ form.due_date ? formatDate(form.due_date) : 'No due date' }}
          </UButton>
          <template #content>
            <UCalendar v-model="dueDateModel" class="p-2" />
            <div class="flex justify-end p-2 pt-0">
              <UButton size="xs" variant="ghost" color="neutral" @click="form.due_date = ''">Clear</UButton>
            </div>
          </template>
        </UPopover>
      </UFormField>

      <UFormField label="Reminder">
        <UPopover>
          <UButton color="neutral" variant="outline" class="w-full justify-start" icon="i-lucide-bell">
            {{ form.reminder_date ? formatDate(form.reminder_date) : 'No reminder' }}
          </UButton>
          <template #content>
            <UCalendar v-model="reminderDateModel" class="p-2" />
            <div class="flex justify-end p-2 pt-0">
              <UButton size="xs" variant="ghost" color="neutral" @click="form.reminder_date = ''">Clear</UButton>
            </div>
          </template>
        </UPopover>
      </UFormField>
    </div>

    <UFormField label="Notes">
      <UTextarea v-model="form.description" :rows="3" class="w-full" placeholder="Context, talking points…" />
    </UFormField>

    <div class="flex justify-end gap-2 pt-2">
      <UButton type="button" variant="ghost" color="neutral" @click="emit('cancel')">Cancel</UButton>
      <UButton type="submit" :loading="loading">{{ task ? 'Save' : 'Create task' }}</UButton>
    </div>
  </form>
</template>
