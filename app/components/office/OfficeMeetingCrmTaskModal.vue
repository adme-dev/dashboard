<script setup lang="ts">
// Disambiguation modal for converting a meeting action item into a CRM task.
// Fetches ranked CRM-target proposals on open, lets the operator pick the target
// (pre-selecting the top proposal) + priority, then posts the conversion.
interface ActionItemLite { id: string, content: string, crm_task_id: string | null }

const props = defineProps<{
  officeId: string
  meetingId: string | null
  actionItem: ActionItemLite | null
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ converted: [] }>()
const toast = useToast()

interface TargetOption {
  label: string
  value: string
  target_type: 'opportunity' | 'person' | 'company'
  client_id: string
  target_id: string
  matched_email: string
  isAlternative: boolean
}

const loading = ref(false)
const submitting = ref(false)
const options = ref<TargetOption[]>([])
const selected = ref<string>('')
const priority = ref<'low' | 'medium' | 'high' | 'urgent'>('medium')
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

const priorityItems = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' },
]
const typeIcon: Record<string, string> = {
  opportunity: 'i-lucide-target',
  person: 'i-lucide-user',
  company: 'i-lucide-building-2',
}

const chosen = computed(() => options.value.find(o => o.value === selected.value) || null)

async function load() {
  if (!props.meetingId || !props.actionItem) return
  loading.value = true
  options.value = []
  selected.value = ''
  priority.value = 'medium'
  try {
    const res = await apiFetch<{ proposals: Array<{
      client_id: string, target_type: TargetOption['target_type'], target_id: string,
      label: string, matched_email: string,
      alternatives: Array<{ client_id: string, target_type: TargetOption['target_type'], target_id: string, label: string }>
    }> }>(
      `/api/office/${props.officeId}/meetings/${props.meetingId}/action-items/${props.actionItem.id}/crm-candidates`,
    )
    const flat: TargetOption[] = []
    const seen = new Set<string>()
    for (const p of res.proposals ?? []) {
      const refs = [
        { client_id: p.client_id, target_type: p.target_type, target_id: p.target_id, label: p.label, isAlternative: false },
        ...(p.alternatives ?? []).map(a => ({ ...a, isAlternative: true })),
      ]
      for (const r of refs) {
        const key = `${r.client_id}|${r.target_type}|${r.target_id}`
        if (seen.has(key)) continue
        seen.add(key)
        flat.push({
          label: r.label,
          value: key,
          target_type: r.target_type,
          client_id: r.client_id,
          target_id: r.target_id,
          matched_email: p.matched_email,
          isAlternative: r.isAlternative,
        })
      }
    }
    options.value = flat
    selected.value = flat[0]?.value ?? ''
  } catch {
    toast.add({ title: 'Could not load CRM matches', color: 'error' })
  } finally {
    loading.value = false
  }
}

watch(() => [open.value, props.actionItem?.id] as const, ([isOpen]) => {
  if (isOpen) load()
})

async function submit() {
  if (!props.meetingId || !props.actionItem || !chosen.value) return
  submitting.value = true
  try {
    await apiFetch(
      `/api/office/${props.officeId}/meetings/${props.meetingId}/action-items/${props.actionItem.id}/crm-task`,
      {
        method: 'POST',
        body: {
          client_id: chosen.value.client_id,
          target_type: chosen.value.target_type,
          target_id: chosen.value.target_id,
          priority: priority.value,
        },
      },
    )
    toast.add({ title: 'CRM task created', icon: 'i-lucide-contact', color: 'success', duration: 1600 })
    emit('converted')
    open.value = false
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not create CRM task', description: message, color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <div class="flex flex-col gap-4 p-4">
        <div>
          <p class="text-sm font-semibold text-highlighted">
            Create CRM task
          </p>
          <p class="mt-1 line-clamp-2 text-xs text-muted">
            {{ actionItem?.content }}
          </p>
        </div>

        <div v-if="loading" class="flex items-center gap-2 py-6 text-sm text-muted">
          <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
          Finding CRM matches…
        </div>

        <UAlert
          v-else-if="!options.length"
          icon="i-lucide-user-x"
          color="neutral"
          variant="subtle"
          title="No CRM contact matched"
          description="None of this meeting's guest emails match a CRM contact. Add the contact in the CRM first, then try again."
        />

        <template v-else>
          <UFormField
            label="CRM record"
            :help="chosen ? `${chosen.target_type} · matched ${chosen.matched_email}` : undefined"
          >
            <USelectMenu
              v-model="selected"
              :items="options"
              value-key="value"
              :icon="chosen ? typeIcon[chosen.target_type] : undefined"
              class="w-full"
            >
              <template #item-label="{ item }">
                <span class="flex items-center gap-2">
                  <UIcon :name="typeIcon[item.target_type]" class="size-3.5 text-dimmed" />
                  <span>{{ item.label }}</span>
                  <UBadge v-if="item.isAlternative" color="neutral" variant="soft" size="sm">alt</UBadge>
                </span>
              </template>
            </USelectMenu>
          </UFormField>

          <UFormField label="Priority">
            <USelectMenu
              v-model="priority"
              :items="priorityItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </template>

        <div class="flex justify-end gap-2 pt-2">
          <UButton color="neutral" variant="ghost" :disabled="submitting" @click="open = false">
            Cancel
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-contact"
            :loading="submitting"
            :disabled="!chosen || loading"
            @click="submit"
          >
            Create CRM task
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
