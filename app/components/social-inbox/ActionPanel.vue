<script setup lang="ts">
import type {
  SocialConversation,
  SocialInboxAiActionInput,
  SocialInboxAiActionProposal,
  SocialInboxAiTriageResult,
  SocialInboxCaseTimelineItem,
  SocialInboxPriority
} from '~/types'
import { getSocialInboxCapabilities } from '~/utils/socialInboxCapabilities'

const props = defineProps<{
  conversation: SocialConversation | null
  timeline?: SocialInboxCaseTimelineItem[]
  timelineLoading?: boolean
  aiTriage?: SocialInboxAiTriageResult | null
  aiTriageLoading?: boolean
  aiActionBusy?: string | null
  aiActionProposals?: Record<string, SocialInboxAiActionProposal>
}>()
const emit = defineEmits<{
  status: [s: 'open' | 'snoozed' | 'closed']
  markRead: []
  assigned: [userId: string | null]
  triage: [patch: { priority?: SocialInboxPriority | null, tags?: string[] }]
  nativeLinks: [patch: { linked_task_id?: string | null, linked_client_request_id?: string | null }]
  aiTriage: []
  aiApplyTriage: [patch: { priority?: SocialInboxPriority | null, tags?: string[] }]
  aiProposeAction: [payload: { actionKey: string, input: SocialInboxAiActionInput }]
  aiConfirmAction: [payload: { actionKey: string, proposal: SocialInboxAiActionProposal }]
  changed: []
}>()

interface TeamMember {
  id: string | number
  name?: string | null
  email?: string | null
}

type BadgeColor = 'error' | 'success' | 'warning' | 'neutral'

function fetchErrorDescription(error: unknown) {
  const e = error as { data?: { statusMessage?: string }, message?: string }
  return e.data?.statusMessage || e.message
}

const statusOptions = [
  { label: 'Open', value: 'open' },
  { label: 'Snoozed', value: 'snoozed' },
  { label: 'Closed', value: 'closed' }
]
const status = ref<'open' | 'snoozed' | 'closed'>(props.conversation?.status ?? 'open')
watch(() => props.conversation, (c) => {
  status.value = c?.status ?? 'open'
  priority.value = c?.priority ?? NO_PRIORITY
  tags.value = [...(c?.tags ?? [])]
  linkedTaskId.value = c?.linked_task_id ?? ''
  linkedClientRequestId.value = c?.linked_client_request_id ?? ''
})
watch(status, (s) => {
  if (props.conversation && s !== props.conversation.status) {
    emit('status', s)
  }
})

const { data: teamData } = await useFetch<{ members: TeamMember[] }>('/api/agency/team-members', { default: () => ({ members: [] }) })
const UNASSIGNED = '__unassigned__'
const memberOptions = computed(() => [
  { label: 'Unassigned', value: UNASSIGNED },
  ...(teamData.value?.members || []).map(m => ({ label: m.name || m.email || String(m.id), value: String(m.id) }))
])
const assignee = computed({
  get: () => props.conversation?.assigned_to || UNASSIGNED,
  set: (v: string) => emit('assigned', v === UNASSIGNED ? null : (v || null))
})

const NO_PRIORITY = '__none__'
const priority = ref<SocialInboxPriority | typeof NO_PRIORITY>(props.conversation?.priority ?? NO_PRIORITY)
const priorityOptions = [
  { label: 'No priority', value: NO_PRIORITY },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' }
]
const priorityColor: Record<SocialInboxPriority, BadgeColor> = {
  low: 'neutral',
  medium: 'warning',
  high: 'warning',
  urgent: 'error'
}
watch(priority, (value) => {
  const current = props.conversation?.priority ?? NO_PRIORITY
  if (!props.conversation || value === current) return
  emit('triage', { priority: value === NO_PRIORITY ? null : value })
})

const tags = ref<string[]>([...(props.conversation?.tags ?? [])])
const tagsDirty = computed(() => {
  const current = props.conversation?.tags ?? []
  return tags.value.join('\n') !== current.join('\n')
})
function saveTags() {
  if (!props.conversation || !tagsDirty.value) return
  emit('triage', { tags: tags.value })
}

const linkedTaskId = ref(props.conversation?.linked_task_id ?? '')
const linkedClientRequestId = ref(props.conversation?.linked_client_request_id ?? '')
const linkedTaskDirty = computed(() => linkedTaskId.value.trim() !== (props.conversation?.linked_task_id ?? ''))
const linkedClientRequestDirty = computed(() => linkedClientRequestId.value.trim() !== (props.conversation?.linked_client_request_id ?? ''))
const linkedTaskLabel = computed(() => props.conversation?.linked_task?.title || props.conversation?.linked_task_id || '')
const linkedClientRequestLabel = computed(() => props.conversation?.linked_client_request?.title || props.conversation?.linked_client_request_id || '')

function linkTask() {
  if (!props.conversation || !linkedTaskDirty.value) return
  emit('nativeLinks', { linked_task_id: linkedTaskId.value.trim() || null })
}

function unlinkTask() {
  if (!props.conversation) return
  linkedTaskId.value = ''
  emit('nativeLinks', { linked_task_id: null })
}

function linkClientRequest() {
  if (!props.conversation || !linkedClientRequestDirty.value) return
  emit('nativeLinks', { linked_client_request_id: linkedClientRequestId.value.trim() || null })
}

function unlinkClientRequest() {
  if (!props.conversation) return
  linkedClientRequestId.value = ''
  emit('nativeLinks', { linked_client_request_id: null })
}

const noteText = ref('')
const toast = useToast()
async function addNote() {
  if (!noteText.value.trim() || !props.conversation?.id) return
  try {
    await $fetch(`/api/agency/social/inbox/conversations/${props.conversation.id}/note`, { method: 'POST', body: { content: noteText.value.trim() } })
    noteText.value = ''
    emit('changed')
    toast.add({ title: 'Note added', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Failed', description: fetchErrorDescription(e), color: 'error' })
  }
}

const slaBadge = computed(() => {
  const c = props.conversation
  if (!c?.sla_due_at) return null
  if (c.sla_breached) return { label: 'SLA breached', color: 'error' as BadgeColor }
  if (c.first_response_at) return { label: 'Responded', color: 'success' as BadgeColor }
  return { label: `Due ${new Date(c.sla_due_at).toLocaleString()}`, color: 'warning' as BadgeColor }
})
const capabilities = computed(() => getSocialInboxCapabilities(props.conversation))
</script>

<template>
  <div v-if="conversation" class="p-4 space-y-4 border-l border-default h-full overflow-y-auto">
    <UFormField label="Status">
      <USelectMenu
        v-model="status"
        :items="statusOptions"
        value-key="value"
        class="w-full"
      />
    </UFormField>
    <UFormField label="Assigned to">
      <USelectMenu
        v-model="assignee"
        :items="memberOptions"
        value-key="value"
        class="w-full"
      />
    </UFormField>
    <UFormField label="Priority">
      <USelectMenu
        v-model="priority"
        :items="priorityOptions"
        value-key="value"
        class="w-full"
      />
      <template v-if="conversation.priority" #help>
        <UBadge :color="priorityColor[conversation.priority]" variant="subtle" size="xs">
          {{ conversation.priority }}
        </UBadge>
      </template>
    </UFormField>
    <UFormField label="Tags">
      <UInputTags v-model="tags" placeholder="Add tag, press Enter" class="w-full" />
      <template #help>
        <UButton
          size="xs"
          variant="ghost"
          label="Save tags"
          :disabled="!tagsDirty"
          @click="saveTags"
        />
      </template>
    </UFormField>
    <div class="space-y-3 rounded-md border border-default bg-elevated/40 p-3">
      <div class="flex items-center gap-2 text-xs font-medium text-muted">
        <UIcon name="i-lucide-workflow" class="size-3.5" />
        Native workflow
      </div>
      <UFormField label="Task ID">
        <div
          v-if="conversation.linked_task_id"
          class="mb-2 flex min-w-0 items-center justify-between gap-2 rounded-md bg-default/40 px-2 py-1.5 text-xs"
        >
          <span class="min-w-0 truncate text-default">{{ linkedTaskLabel }}</span>
          <UBadge
            v-if="conversation.linked_task?.status_name"
            color="neutral"
            variant="subtle"
            size="xs"
          >
            {{ conversation.linked_task.status_name }}
          </UBadge>
        </div>
        <UInput
          v-model="linkedTaskId"
          placeholder="Paste task id"
          class="w-full"
          size="sm"
        />
        <template #help>
          <div class="flex flex-wrap items-center gap-1.5">
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-link"
              label="Link"
              :disabled="!linkedTaskDirty"
              @click="linkTask"
            />
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-unlink"
              label="Unlink"
              :disabled="!conversation.linked_task_id"
              @click="unlinkTask"
            />
            <UButton
              v-if="conversation.linked_task_id"
              :to="`/agency/tasks/${conversation.linked_task_id}`"
              size="xs"
              variant="ghost"
              icon="i-lucide-external-link"
              label="Open"
            />
          </div>
        </template>
      </UFormField>
      <UFormField label="Client request ID">
        <div
          v-if="conversation.linked_client_request_id"
          class="mb-2 flex min-w-0 items-center justify-between gap-2 rounded-md bg-default/40 px-2 py-1.5 text-xs"
        >
          <span class="min-w-0 truncate text-default">{{ linkedClientRequestLabel }}</span>
          <UBadge
            v-if="conversation.linked_client_request?.status"
            color="neutral"
            variant="subtle"
            size="xs"
          >
            {{ conversation.linked_client_request.status }}
          </UBadge>
        </div>
        <UInput
          v-model="linkedClientRequestId"
          placeholder="Paste request id"
          class="w-full"
          size="sm"
        />
        <template #help>
          <div class="flex flex-wrap items-center gap-1.5">
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-link"
              label="Link"
              :disabled="!linkedClientRequestDirty"
              @click="linkClientRequest"
            />
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-unlink"
              label="Unlink"
              :disabled="!conversation.linked_client_request_id"
              @click="unlinkClientRequest"
            />
          </div>
        </template>
      </UFormField>
      <p
        v-if="conversation.native_linked_at"
        class="text-xs text-muted"
      >
        Last linked {{ new Date(conversation.native_linked_at).toLocaleString() }}
      </p>
    </div>
    <SocialInboxCaseTimeline
      :items="timeline ?? []"
      :loading="timelineLoading"
    />
    <SocialInboxAiTriagePanel
      :conversation="conversation"
      :triage="aiTriage"
      :loading="aiTriageLoading"
      :busy-key="aiActionBusy"
      :proposals="aiActionProposals"
      @run="emit('aiTriage')"
      @apply-triage="emit('aiApplyTriage', $event)"
      @propose-action="emit('aiProposeAction', $event)"
      @confirm-action="emit('aiConfirmAction', $event)"
    />
    <UBadge v-if="slaBadge" :color="slaBadge.color" variant="subtle">
      {{ slaBadge.label }}
    </UBadge>
    <UButton
      label="Mark read"
      icon="i-lucide-check-check"
      variant="subtle"
      block
      @click="emit('markRead')"
    />
    <UButton
      v-if="conversation.permalink"
      :to="conversation.permalink"
      target="_blank"
      label="Open on platform"
      icon="i-lucide-external-link"
      variant="ghost"
      block
    />
    <div class="space-y-2 rounded-md border border-default bg-elevated/40 p-3">
      <div class="flex items-center gap-2 text-xs font-medium text-muted">
        <UIcon name="i-lucide-shield-check" class="size-3.5" />
        Platform capability
      </div>
      <div class="flex items-center justify-between gap-2 text-xs">
        <span class="text-muted">Reply</span>
        <UBadge :color="capabilities.reply.color" variant="subtle" size="xs">
          {{ capabilities.reply.label }}
        </UBadge>
      </div>
      <p v-if="capabilities.reply.reason" class="text-xs text-muted">
        {{ capabilities.reply.reason }}
      </p>
      <div class="flex items-center justify-between gap-2 text-xs">
        <span class="text-muted">Channel</span>
        <span class="text-default">{{ capabilities.channelLabel }}</span>
      </div>
      <div class="flex items-center justify-between gap-2 text-xs">
        <span class="text-muted">Source</span>
        <span class="text-default">{{ capabilities.syncLabel }}</span>
      </div>
    </div>
    <UFormField label="Internal note">
      <UTextarea
        v-model="noteText"
        :rows="2"
        placeholder="Staff-only — never sent"
        class="w-full"
      />
      <template #help>
        <UButton
          size="xs"
          variant="ghost"
          label="Add note"
          :disabled="!noteText.trim()"
          @click="addNote"
        />
      </template>
    </UFormField>
    <div class="text-xs text-muted pt-3 border-t border-default space-y-0.5">
      <div>{{ conversation.message_count }} messages</div>
      <div v-if="conversation.unread_count">
        {{ conversation.unread_count }} unread
      </div>
    </div>
  </div>
  <div v-else class="p-4 text-sm text-muted border-l border-default h-full">
    No conversation selected.
  </div>
</template>
