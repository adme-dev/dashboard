<script setup lang="ts">
import type { SocialConversation, SocialMessage } from '~/types'
import {
  getSocialInboxAccountContextDisplay,
  getSocialInboxIdentityDisplay
} from '~/utils/socialInboxDisplay'
import {
  getSocialInboxSourcePost,
  getSocialInboxSourcePostImage,
  getSocialInboxSourcePostTitle
} from '~/utils/socialInboxSourcePost'
import { groupSocialInboxMessages } from '~/utils/socialInboxThread'

const props = defineProps<{ conversation: SocialConversation | null, messages: SocialMessage[] }>()
const threadItems = computed(() => groupSocialInboxMessages(props.messages))
const sourcePost = computed(() => getSocialInboxSourcePost(props.messages))
const sourcePostImage = computed(() => getSocialInboxSourcePostImage(sourcePost.value))
const sourcePostTitle = computed(() => getSocialInboxSourcePostTitle(sourcePost.value))
const sourcePostText = computed(() => {
  const text = sourcePost.value?.text?.trim()
  if (!text) return null
  const title = sourcePostTitle.value?.trim()
  if (!title) return text
  const lines = text.split(/\r?\n/)
  const firstContentLineIndex = lines.findIndex(line => line.trim())
  if (firstContentLineIndex >= 0 && lines[firstContentLineIndex]?.trim() === title) {
    return lines.slice(firstContentLineIndex + 1).join('\n').trim() || null
  }
  return text === title ? null : text
})
function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : ''
}
function identityLabel(platform: string | null | undefined, name: string | null | undefined) {
  return getSocialInboxIdentityDisplay({ platform, name })
}
function accountFor(conversation: SocialConversation | null | undefined) {
  if (!conversation) return null
  return getSocialInboxAccountContextDisplay({
    accountName: conversation.social_account_name,
    platformAccountId: conversation.social_account_platform_id
  })
}
function isPlatformSyncedReply(message: SocialMessage) {
  return message.direction === 'out' && message.metadata?.source === 'platform_sync'
}
function messageLabel(message: SocialMessage) {
  if (message.direction === 'out') {
    return isPlatformSyncedReply(message) ? 'Replied on platform' : ''
  }
  return identityLabel(props.conversation?.platform, message.author_name).label
}
function messageLabelTitle(message: SocialMessage) {
  if (message.direction === 'out') {
    return isPlatformSyncedReply(message) ? 'Synced from the native platform reply thread.' : undefined
  }
  return identityLabel(props.conversation?.platform, message.author_name).reason || undefined
}
function bubbleClass(message: SocialMessage) {
  if (message.is_internal_note) return 'bg-warning/10 border border-warning/30'
  return message.direction === 'out' ? 'bg-primary text-inverted' : 'bg-elevated'
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div v-if="conversation" class="p-4 border-b border-default">
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
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
          </div>
          <div class="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <UIcon name="i-lucide-panels-top-left" class="size-3 shrink-0" />
            <span class="truncate">{{ accountFor(conversation) ? `via ${accountFor(conversation)}` : 'Account not linked' }}</span>
          </div>
        </div>
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
      <div
        v-if="sourcePost"
        class="mt-3 overflow-hidden rounded-md border border-default bg-elevated/30"
      >
        <div class="flex gap-3 p-3">
          <img
            v-if="sourcePostImage"
            :src="sourcePostImage"
            :alt="sourcePostTitle || 'Original post image'"
            class="size-20 shrink-0 rounded object-cover sm:size-24"
            loading="eager"
            fetchpriority="high"
            referrerpolicy="no-referrer"
          >
          <div
            v-else
            class="flex size-20 shrink-0 items-center justify-center rounded bg-muted/20 text-muted sm:size-24"
          >
            <UIcon name="i-lucide-image" class="size-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-center gap-2 text-xs text-muted">
              <UIcon name="i-lucide-newspaper" class="size-3 shrink-0" />
              <span class="truncate">Original post</span>
            </div>
            <p
              v-if="sourcePostTitle"
              class="mt-1 line-clamp-2 text-sm font-medium"
            >
              {{ sourcePostTitle }}
            </p>
            <p
              v-if="sourcePostText"
              class="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted"
            >
              {{ sourcePostText }}
            </p>
            <UButton
              v-if="sourcePost.permalink"
              :to="sourcePost.permalink"
              target="_blank"
              icon="i-lucide-external-link"
              size="xs"
              variant="link"
              class="mt-1 px-0"
            >
              Open post
            </UButton>
          </div>
        </div>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto p-4 space-y-3">
      <div v-if="!conversation" class="text-sm text-muted">
        Select a conversation to view it.
      </div>
      <template v-for="item in threadItems" :key="item.message.id">
        <div class="space-y-2">
          <div
            class="flex"
            :class="item.message.direction === 'out' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[75%] rounded-lg px-3 py-2 text-sm"
              :class="bubbleClass(item.message)"
            >
              <div
                v-if="messageLabel(item.message)"
                class="text-xs mb-0.5"
                :class="item.message.direction === 'out' ? 'opacity-75' : 'text-muted'"
                :title="messageLabelTitle(item.message)"
              >
                {{ messageLabel(item.message) }}
              </div>
              <p class="whitespace-pre-wrap break-words">
                {{ item.message.content }}
              </p>
              <div class="text-[10px] opacity-60 mt-1">
                {{ fmt(item.message.platform_timestamp || item.message.created_at) }}
              </div>
            </div>
          </div>

          <div
            v-if="item.replies.length"
            class="ml-3 space-y-2 border-l border-default pl-3"
          >
            <div
              v-for="reply in item.replies"
              :key="reply.id"
              class="flex"
              :class="reply.direction === 'out' ? 'justify-end' : 'justify-start'"
            >
              <div
                class="max-w-[72%] rounded-lg px-3 py-2 text-sm"
                :class="bubbleClass(reply)"
              >
                <div
                  v-if="messageLabel(reply)"
                  class="text-xs mb-0.5"
                  :class="reply.direction === 'out' ? 'opacity-75' : 'text-muted'"
                  :title="messageLabelTitle(reply)"
                >
                  {{ messageLabel(reply) }}
                </div>
                <p class="whitespace-pre-wrap break-words">
                  {{ reply.content }}
                </p>
                <div class="text-[10px] opacity-60 mt-1">
                  {{ fmt(reply.platform_timestamp || reply.created_at) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
