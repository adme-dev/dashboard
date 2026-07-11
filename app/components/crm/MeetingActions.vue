<script setup lang="ts">
// Unconverted office-meeting action items linkable to this person/company.
// Agency-only: the meeting-actions endpoints live under /api/crm — self-guard so
// this renders nothing in the client portal.
const props = defineProps<{
  clientId: string
  targetType: 'person' | 'company'
  targetId: string
}>()

const base = inject<string>('crmApiBase', '/api/crm')
const isAgency = base === '/api/crm'
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
) => Promise<T>

interface MeetingAction {
  id: string
  content: string
  due_at: string | null
  meeting_session_id: string
  meeting_title: string
  created_at: string
}

const endpoint = computed(() =>
  `/api/crm/${props.targetType === 'person' ? 'people' : 'companies'}/${props.targetId}/meeting-actions`)
const query = computed(() => ({ client_id: props.clientId }))
const data = ref<{ actionItems: MeetingAction[] }>({ actionItems: [] })

async function refresh() {
  if (!isAgency) return
  data.value = await apiFetch<{ actionItems: MeetingAction[] }>(endpoint.value, { query: query.value })
}

watch([query, endpoint], () => {
  refresh()
}, { immediate: true })
const actionItems = computed(() => data.value?.actionItems ?? [])

const toast = useToast()
const converting = ref<string | null>(null)

async function convert(item: MeetingAction) {
  converting.value = item.id
  try {
    await apiFetch(`/api/crm/meeting-actions/${item.id}/convert`, {
      method: 'POST',
      body: { client_id: props.clientId, target_type: props.targetType, target_id: props.targetId },
    })
    toast.add({ title: 'CRM task created', icon: 'i-lucide-contact', color: 'success', duration: 1600 })
    await refresh()
  } catch (e: unknown) {
    const message = e && typeof e === 'object' && 'data' in e
      ? (e as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not create CRM task', description: message, color: 'error' })
  } finally {
    converting.value = null
  }
}
</script>

<template>
  <div v-if="isAgency && actionItems.length">
    <USeparator class="my-4" />
    <div class="mb-3 flex items-center gap-2">
      <UIcon name="i-lucide-calendar-check" class="size-4 text-dimmed" />
      <h3 class="text-sm font-semibold text-highlighted">From recent meetings</h3>
      <UBadge color="neutral" variant="subtle" size="sm">{{ actionItems.length }}</UBadge>
    </div>

    <div class="space-y-2">
      <div
        v-for="item in actionItems"
        :key="item.id"
        class="flex items-start gap-3 rounded-lg border border-default bg-elevated/40 px-3 py-2"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm text-highlighted">{{ item.content }}</p>
          <p class="mt-0.5 truncate text-xs text-muted">from “{{ item.meeting_title }}”</p>
        </div>
        <UButton
          icon="i-lucide-contact"
          size="xs"
          variant="soft"
          color="primary"
          :loading="converting === item.id"
          @click="convert(item)"
        >
          Convert
        </UButton>
      </div>
    </div>
  </div>
</template>
