<script setup lang="ts">
// Admin-only: define "when an opportunity enters stage X, create a follow-up task".
// Writes are ADMIN-gated server-side; non-admins simply get a 403 on save.
import type { CrmStage } from '~/types/crm'

const props = defineProps<{ clientId: string }>()
const clientId = toRef(props, 'clientId')
const toast = useToast()

const { stages } = useCrmStages(clientId)
const stageItems = computed(() => stages.value.map(s => ({ label: s.name, value: s.id })))
const stageName = (id: string) => stages.value.find((s: CrmStage) => s.id === id)?.name ?? '—'

interface AutomationRow {
  id: string
  stage_id: string
  is_active: boolean
  task_template: { title: string, task_type: string, priority: string, due_offset_days: number }
}
const query = computed(() => ({ client_id: clientId.value }))
const { data, refresh } = useFetch<{ items: AutomationRow[] }>('/api/crm/stage-automations', {
  query, watch: [query], default: () => ({ items: [] }),
})
const rules = computed(() => data.value?.items ?? [])

const typeItems = [
  { label: 'Follow-up', value: 'follow_up' }, { label: 'Call', value: 'call' },
  { label: 'Email', value: 'email' }, { label: 'Meeting', value: 'meeting' }, { label: 'General', value: 'general' },
]
const priorityItems = [
  { label: 'Low', value: 'low' }, { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' }, { label: 'Urgent', value: 'urgent' },
]

const showForm = ref(false)
const form = reactive({ stage_id: '', title: '', task_type: 'follow_up', priority: 'medium', due_offset_days: 1 })
const saving = ref(false)

function openCreate() {
  form.stage_id = stages.value[0]?.id ?? ''
  form.title = ''; form.task_type = 'follow_up'; form.priority = 'medium'; form.due_offset_days = 1
  showForm.value = true
}
async function save() {
  if (!form.stage_id || !form.title.trim()) {
    toast.add({ title: 'Stage and title are required', color: 'error' }); return
  }
  saving.value = true
  try {
    await $fetch('/api/crm/stage-automations', {
      method: 'POST',
      body: {
        client_id: clientId.value,
        stage_id: form.stage_id,
        task_template: {
          title: form.title.trim(), task_type: form.task_type,
          priority: form.priority, due_offset_days: form.due_offset_days,
        },
      },
    })
    showForm.value = false
    await refresh()
    toast.add({ title: 'Automation added', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Could not add automation', description: (e as { data?: { statusMessage?: string } })?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}
async function toggle(r: AutomationRow) {
  try {
    await $fetch(`/api/crm/stage-automations/${r.id}`, { method: 'PATCH', body: { client_id: clientId.value, is_active: !r.is_active } })
    await refresh()
  } catch { toast.add({ title: 'Could not update', color: 'error' }) }
}
async function remove(r: AutomationRow) {
  try {
    await $fetch(`/api/crm/stage-automations/${r.id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
    toast.add({ title: 'Automation removed', color: 'success' })
  } catch { toast.add({ title: 'Could not remove', color: 'error' }) }
}
</script>

<template>
  <div class="rounded-xl border border-default">
    <div class="flex items-center justify-between gap-2 px-4 py-3">
      <div>
        <h3 class="text-sm font-semibold">Stage automations</h3>
        <p class="text-xs text-muted mt-0.5">Auto-create a follow-up task when an opportunity enters a stage.</p>
      </div>
      <UButton size="sm" icon="i-lucide-plus" @click="openCreate">Add</UButton>
    </div>

    <div v-if="!rules.length" class="px-4 py-3 text-sm text-muted border-t border-default">
      No automations yet.
    </div>
    <ul v-else class="divide-y divide-default border-t border-default">
      <li v-for="r in rules" :key="r.id" class="flex items-center justify-between gap-3 px-4 py-2.5">
        <div class="min-w-0 text-sm">
          <span class="font-medium">{{ stageName(r.stage_id) }}</span>
          <span class="text-muted"> → “{{ r.task_template.title }}”</span>
          <span class="text-muted"> ({{ r.task_template.task_type.replace('_', ' ') }}, due +{{ r.task_template.due_offset_days }}d)</span>
        </div>
        <div class="flex items-center gap-2">
          <USwitch :model-value="r.is_active" @update:model-value="() => toggle(r)" />
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" @click="remove(r)" />
        </div>
      </li>
    </ul>

    <UModal v-model:open="showForm" title="New stage automation">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="When opportunity enters stage" required>
            <USelectMenu v-model="form.stage_id" :items="stageItems" value-key="value" placeholder="Select a stage" />
          </UFormField>
          <UFormField label="Create task titled" required>
            <UInput v-model="form.title" placeholder="Send proposal follow-up" />
          </UFormField>
          <div class="grid grid-cols-3 gap-4">
            <UFormField label="Type">
              <USelectMenu v-model="form.task_type" :items="typeItems" value-key="value" />
            </UFormField>
            <UFormField label="Priority">
              <USelectMenu v-model="form.priority" :items="priorityItems" value-key="value" />
            </UFormField>
            <UFormField label="Due in (days)">
              <UInput v-model.number="form.due_offset_days" type="number" min="0" />
            </UFormField>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <UButton type="button" variant="ghost" color="neutral" @click="showForm = false">Cancel</UButton>
            <UButton type="submit" :loading="saving">Add automation</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
