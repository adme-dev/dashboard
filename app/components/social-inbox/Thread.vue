<script setup lang="ts">
import type { SocialConversation, SocialMessage } from '~/types'
import { getSocialInboxIdentityDisplay } from '~/utils/socialInboxDisplay'

defineProps<{ conversation: SocialConversation | null, messages: SocialMessage[] }>()
function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : ''
}
function identityLabel(platform: string | null | undefined, name: string | null | undefined) {
  return getSocialInboxIdentityDisplay({ platform, name })
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div v-if="conversation" class="p-4 border-b border-default">
      <div class="flex items-center gap-2">
        <span
          class="font-semibold truncate"
          :class="identityLabel(conversation.platform, conversation.participant_name).unavailable ? 'text-muted' : ''"
          :title="identityLabel(conversation.platform, conversation.participant_name).reason || undefined"
        >
          {{ identityLabel(conversation.platform, conversation.participant_name).label }}
        </span>
        <UBadge color="neutral" variant="subtle" size="xs">
          {{ conversation.platform }}
        </UBadge>
        <UBadge color="neutral" variant="subtle" size="xs">
          {{ conversation.channel_type }}
        </UBadge>
        <UButton
          v-if="conversation.permalink"
          :to="conversation.permalink"
          target="_blank"
          icon="i-lucide-external-link"
          variant="ghost"
          size="xs"
          class="ml-auto"
        />
      </div>
      <div v-if="conversation.channel_type === 'review' && conversation.rating" class="mt-1 text-warning text-sm">
        {{ '★'.repeat(conversation.rating) }}{{ '☆'.repeat(5 - conversation.rating) }}
      </div>
    </div>
    <div class="flex-1 overflow-y-auto p-4 space-y-3">
      <div v-if="!conversation" class="text-sm text-muted">
        Select a conversation to view it.
      </div>
      <div
        v-for="m in messages"
        :key="m.id"
        class="flex"
        :class="m.direction === 'out' ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[75%] rounded-lg px-3 py-2 text-sm"
          :class="m.is_internal_note
            ? 'bg-warning/10 border border-warning/30'
            : m.direction === 'out' ? 'bg-primary text-inverted' : 'bg-elevated'"
        >
          <div
            v-if="m.direction === 'in'"
            class="text-xs text-muted mb-0.5"
            :title="identityLabel(conversation?.platform, m.author_name).reason || undefined"
          >
            {{ identityLabel(conversation?.platform, m.author_name).label }}
          </div>
          <p class="whitespace-pre-wrap break-words">
            {{ m.content }}
          </p>
          <div class="text-[10px] opacity-60 mt-1">
            {{ fmt(m.platform_timestamp || m.created_at) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
