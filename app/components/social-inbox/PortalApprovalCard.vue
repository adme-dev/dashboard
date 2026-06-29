<script setup lang="ts">
interface PortalApproval {
  id: string
  draft_content: string
  confidence: number | null
  platform: string
  channel_type: string
  participant_name: string | null
  permalink: string | null
  inbound_preview: string | null
  rating: number | null
  recent_messages?: Array<{
    direction: 'in' | 'out'
    author_name: string | null
    content: string | null
    occurred_at: string | null
  }>
}

const props = defineProps<{ approval: PortalApproval, canApprove: boolean, busy?: boolean }>()
const emit = defineEmits<{ approve: [id: string, content: string], reject: [id: string] }>()

// Local editable copy of the AI draft — the client may tweak before approving.
const draft = ref(props.approval.draft_content)
watch(() => props.approval.draft_content, (v) => {
  draft.value = v
})

const PLATFORM_COLOR: Record<string, string> = {
  'facebook': 'info',
  'instagram': 'error',
  'linkedin': 'primary',
  'youtube': 'error',
  'tiktok': 'neutral',
  'google-business': 'success'
}
const confidencePct = computed(() =>
  props.approval.confidence != null ? Math.round(props.approval.confidence * 100) : null)
function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : ''
}
</script>

<template>
  <div class="rounded-lg border border-default bg-default p-4 space-y-3">
    <div class="flex items-center gap-2">
      <UBadge :color="(PLATFORM_COLOR[approval.platform] || 'neutral') as any" variant="subtle" size="xs">
        {{ approval.platform }}
      </UBadge>
      <UBadge color="neutral" variant="subtle" size="xs">
        {{ approval.channel_type }}
      </UBadge>
      <UBadge
        v-if="approval.channel_type === 'review' && approval.rating"
        color="warning"
        variant="subtle"
        size="xs"
      >
        ★ {{ approval.rating }}
      </UBadge>
      <span class="text-sm font-medium truncate">{{ approval.participant_name || 'Unknown' }}</span>
      <UButton
        v-if="approval.permalink"
        :to="approval.permalink"
        target="_blank"
        icon="i-lucide-external-link"
        variant="ghost"
        size="xs"
        class="ml-auto"
      />
    </div>

    <div v-if="approval.inbound_preview" class="rounded-md bg-elevated px-3 py-2 text-sm text-muted">
      <span class="text-xs uppercase tracking-wide opacity-60">They said</span>
      <p class="mt-0.5 whitespace-pre-wrap break-words">
        {{ approval.inbound_preview }}
      </p>
    </div>

    <div v-if="approval.recent_messages?.length" class="space-y-2 rounded-md border border-default bg-elevated/40 px-3 py-2">
      <div class="text-xs font-medium text-muted">
        Recent context
      </div>
      <div
        v-for="(message, index) in approval.recent_messages"
        :key="`${message.occurred_at || index}:${index}`"
        class="space-y-0.5 text-xs"
      >
        <div class="flex items-center justify-between gap-2 text-muted">
          <span>{{ message.direction === 'out' ? 'Team' : (message.author_name || 'Customer') }}</span>
          <span class="shrink-0">{{ fmt(message.occurred_at) }}</span>
        </div>
        <p class="line-clamp-2 whitespace-pre-wrap break-words text-default">
          {{ message.content }}
        </p>
      </div>
    </div>

    <UFormField label="Suggested reply" :hint="confidencePct != null ? `${confidencePct}% confidence` : undefined">
      <UTextarea
        v-model="draft"
        :rows="3"
        autoresize
        class="w-full"
        :disabled="!canApprove || busy"
      />
    </UFormField>

    <div class="flex items-center gap-2">
      <UButton
        label="Approve"
        icon="i-lucide-check"
        size="sm"
        color="primary"
        :loading="busy"
        :disabled="!canApprove || !draft.trim()"
        @click="emit('approve', approval.id, draft)"
      />
      <UButton
        label="Reject"
        icon="i-lucide-x"
        size="sm"
        variant="subtle"
        color="neutral"
        :disabled="!canApprove || busy"
        @click="emit('reject', approval.id)"
      />
      <span v-if="!canApprove" class="text-xs text-muted ml-auto">View only — you can't approve responses.</span>
    </div>
  </div>
</template>
