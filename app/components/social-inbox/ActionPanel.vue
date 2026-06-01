<script setup lang="ts">
import type { SocialConversation } from '~/types'

const props = defineProps<{ conversation: SocialConversation | null }>()
const emit = defineEmits<{ status: [s: 'open' | 'snoozed' | 'closed']; markRead: [] }>()

const statusOptions = [
  { label: 'Open', value: 'open' },
  { label: 'Snoozed', value: 'snoozed' },
  { label: 'Closed', value: 'closed' },
]
const status = ref<'open' | 'snoozed' | 'closed'>(props.conversation?.status ?? 'open')
watch(() => props.conversation, (c) => { status.value = c?.status ?? 'open' })
watch(status, (s) => { if (props.conversation && s !== props.conversation.status) emit('status', s) })
</script>

<template>
  <div v-if="conversation" class="p-4 space-y-4 border-l border-default h-full">
    <UFormField label="Status">
      <USelectMenu v-model="status" :items="statusOptions" value-key="value" class="w-full" />
    </UFormField>
    <UButton label="Mark read" icon="i-lucide-check-check" variant="subtle" block @click="emit('markRead')" />
    <UButton
      v-if="conversation.permalink" :to="conversation.permalink" target="_blank"
      label="Open on platform" icon="i-lucide-external-link" variant="ghost" block
    />
    <div class="text-xs text-muted pt-3 border-t border-default space-y-0.5">
      <div>{{ conversation.message_count }} messages</div>
      <div v-if="conversation.unread_count">{{ conversation.unread_count }} unread</div>
    </div>
  </div>
  <div v-else class="p-4 text-sm text-muted border-l border-default h-full">No conversation selected.</div>
</template>
