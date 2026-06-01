<script setup lang="ts">
import type { SocialConversation } from '~/types'

const props = defineProps<{ conversation: SocialConversation | null }>()
const emit = defineEmits<{ status: [s: 'open' | 'snoozed' | 'closed']; markRead: []; assigned: [userId: string | null] }>()

const statusOptions = [
  { label: 'Open', value: 'open' },
  { label: 'Snoozed', value: 'snoozed' },
  { label: 'Closed', value: 'closed' },
]
const status = ref<'open' | 'snoozed' | 'closed'>(props.conversation?.status ?? 'open')
watch(() => props.conversation, (c) => { status.value = c?.status ?? 'open' })
watch(status, (s) => { if (props.conversation && s !== props.conversation.status) emit('status', s) })

const { data: members } = await useFetch<any[]>('/api/agency/team-members', { default: () => [] })
const memberOptions = computed(() => [{ label: 'Unassigned', value: '' }, ...(members.value || []).map((m: any) => ({ label: m.name || m.email, value: String(m.id) }))])
const assignee = computed({
  get: () => (props.conversation as any)?.assigned_to || '',
  set: (v: string) => emit('assigned', v || null),
})

const noteText = ref('')
const toast = useToast()
async function addNote() {
  if (!noteText.value.trim() || !props.conversation?.id) return
  try {
    await $fetch(`/api/agency/social/inbox/conversations/${props.conversation.id}/note`, { method: 'POST', body: { content: noteText.value.trim() } })
    noteText.value = ''
    toast.add({ title: 'Note added', color: 'success' })
  } catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' }) }
}

const slaBadge = computed(() => {
  const c = props.conversation as any
  if (!c?.sla_due_at) return null
  if (c.sla_breached) return { label: 'SLA breached', color: 'error' }
  if (c.first_response_at) return { label: 'Responded', color: 'success' }
  return { label: `Due ${new Date(c.sla_due_at).toLocaleString()}`, color: 'warning' }
})
</script>

<template>
  <div v-if="conversation" class="p-4 space-y-4 border-l border-default h-full">
    <UFormField label="Status">
      <USelectMenu v-model="status" :items="statusOptions" value-key="value" class="w-full" />
    </UFormField>
    <UFormField label="Assigned to">
      <USelectMenu v-model="assignee" :items="memberOptions" value-key="value" class="w-full" />
    </UFormField>
    <UBadge v-if="slaBadge" :color="(slaBadge.color as any)" variant="subtle">{{ slaBadge.label }}</UBadge>
    <UButton label="Mark read" icon="i-lucide-check-check" variant="subtle" block @click="emit('markRead')" />
    <UButton
      v-if="conversation.permalink" :to="conversation.permalink" target="_blank"
      label="Open on platform" icon="i-lucide-external-link" variant="ghost" block
    />
    <UFormField label="Internal note">
      <UTextarea v-model="noteText" :rows="2" placeholder="Staff-only — never sent" class="w-full" />
      <template #help>
        <UButton size="xs" variant="ghost" label="Add note" :disabled="!noteText.trim()" @click="addNote" />
      </template>
    </UFormField>
    <div class="text-xs text-muted pt-3 border-t border-default space-y-0.5">
      <div>{{ conversation.message_count }} messages</div>
      <div v-if="conversation.unread_count">{{ conversation.unread_count }} unread</div>
    </div>
  </div>
  <div v-else class="p-4 text-sm text-muted border-l border-default h-full">No conversation selected.</div>
</template>
