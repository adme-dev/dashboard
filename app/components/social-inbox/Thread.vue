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
function fmtShort(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  if (Number.isFinite(diffMs) && diffMs >= 0) {
    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d`
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
function identityLabel(
  platform: string | null | undefined,
  name: string | null | undefined,
  channelType: string | null | undefined = props.conversation?.channel_type
) {
  return getSocialInboxIdentityDisplay({ platform, channelType, name })
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
    if (isPlatformSyncedReply(message)) return message.author_name || 'Replied on platform'
    return message.author_name || ''
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
function metadataNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}
function metadataString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
function messageAvatarUrl(message: SocialMessage) {
  return metadataString(message.metadata?.authorAvatarUrl)
}
function messageAuthorProfileUrl(message: SocialMessage) {
  return metadataString(message.metadata?.authorProfileUrl)
}
function messageInitials(message: SocialMessage) {
  const label = messageLabel(message) || message.author_name || props.conversation?.participant_name || props.conversation?.platform || '?'
  const parts = label.split(/\s+/).filter(Boolean)
  const initials = parts.length > 1
    ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`
    : label.slice(0, 2)
  return initials.toUpperCase()
}
function messageStats(message: SocialMessage) {
  const likes = metadataNumber(message.metadata?.likeCount)
  const replies = metadataNumber(message.metadata?.replyCount)
  const reactions = metadataNumber(message.metadata?.reactionCount)
  return [
    likes && likes > 0 ? { key: 'likes', icon: 'i-lucide-thumbs-up', value: likes, label: likes === 1 ? 'like' : 'likes' } : null,
    replies && replies > 0 ? { key: 'replies', icon: 'i-lucide-message-circle', value: replies, label: replies === 1 ? 'reply' : 'replies' } : null,
    reactions && reactions > 0 ? { key: 'reactions', icon: 'i-lucide-heart', value: reactions, label: reactions === 1 ? 'reaction' : 'reactions' } : null
  ].filter(Boolean) as Array<{ key: string, icon: string, value: number, label: string }>
}
function messageTime(message: SocialMessage) {
  return message.platform_timestamp || message.created_at
}
</script>

<template>
  <div class="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
    <div v-if="conversation" class="shrink-0 border-b border-default p-4">
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
    </div>
    <div class="flex-1 min-h-0 w-full overflow-y-auto p-4 space-y-3">
      <div
        v-if="conversation && sourcePost"
        class="overflow-hidden rounded-md border border-default bg-elevated/30"
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
      <div v-if="!conversation" class="text-sm text-muted">
        Select a conversation to view it.
      </div>
      <template v-for="item in threadItems" v-else :key="item.message.id">
        <div class="space-y-2">
          <div
            class="flex items-end gap-2"
            :class="item.message.direction === 'out' ? 'justify-end' : 'justify-start'"
          >
            <NuxtLink
              v-if="item.message.direction !== 'out' && messageAuthorProfileUrl(item.message)"
              :to="messageAuthorProfileUrl(item.message) || ''"
              target="_blank"
              class="mb-1 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted/20 text-[11px] font-semibold text-muted ring-1 ring-default"
              :aria-label="`${messageLabel(item.message)} profile`"
            >
              <img
                v-if="messageAvatarUrl(item.message)"
                :src="messageAvatarUrl(item.message) || undefined"
                :alt="messageLabel(item.message)"
                class="size-full object-cover"
                loading="lazy"
                referrerpolicy="no-referrer"
              >
              <span v-else>{{ messageInitials(item.message) }}</span>
            </NuxtLink>
            <div
              v-else-if="item.message.direction !== 'out'"
              class="mb-1 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted/20 text-[11px] font-semibold text-muted ring-1 ring-default"
              :title="messageLabel(item.message)"
            >
              <img
                v-if="messageAvatarUrl(item.message)"
                :src="messageAvatarUrl(item.message) || undefined"
                :alt="messageLabel(item.message)"
                class="size-full object-cover"
                loading="lazy"
                referrerpolicy="no-referrer"
              >
              <span v-else>{{ messageInitials(item.message) }}</span>
            </div>
            <div
              class="max-w-[92%] rounded-lg px-3 py-2 text-sm xl:max-w-[56rem]"
              :class="bubbleClass(item.message)"
            >
              <div class="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span
                  v-if="messageLabel(item.message)"
                  class="text-xs font-medium"
                  :class="item.message.direction === 'out' ? 'opacity-80' : 'text-muted'"
                  :title="messageLabelTitle(item.message)"
                >
                  {{ messageLabel(item.message) }}
                </span>
                <span
                  class="text-[10px] opacity-60"
                  :title="fmt(messageTime(item.message))"
                >
                  {{ fmtShort(messageTime(item.message)) }}
                </span>
              </div>
              <p class="whitespace-pre-wrap break-words">
                {{ item.message.content }}
              </p>
              <div v-if="messageStats(item.message).length" class="mt-2 flex flex-wrap items-center gap-2 text-[10px] opacity-70">
                <span
                  v-for="stat in messageStats(item.message)"
                  :key="stat.key"
                  class="inline-flex items-center gap-1"
                  :title="`${stat.value} ${stat.label}`"
                >
                  <UIcon :name="stat.icon" class="size-3" />
                  {{ stat.value }}
                </span>
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
              class="flex items-end gap-2"
              :class="reply.direction === 'out' ? 'justify-end' : 'justify-start'"
            >
              <NuxtLink
                v-if="reply.direction !== 'out' && messageAuthorProfileUrl(reply)"
                :to="messageAuthorProfileUrl(reply) || ''"
                target="_blank"
                class="mb-1 flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted/20 text-[10px] font-semibold text-muted ring-1 ring-default"
                :aria-label="`${messageLabel(reply)} profile`"
              >
                <img
                  v-if="messageAvatarUrl(reply)"
                  :src="messageAvatarUrl(reply) || undefined"
                  :alt="messageLabel(reply)"
                  class="size-full object-cover"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                >
                <span v-else>{{ messageInitials(reply) }}</span>
              </NuxtLink>
              <div
                v-else-if="reply.direction !== 'out'"
                class="mb-1 flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted/20 text-[10px] font-semibold text-muted ring-1 ring-default"
                :title="messageLabel(reply)"
              >
                <img
                  v-if="messageAvatarUrl(reply)"
                  :src="messageAvatarUrl(reply) || undefined"
                  :alt="messageLabel(reply)"
                  class="size-full object-cover"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                >
                <span v-else>{{ messageInitials(reply) }}</span>
              </div>
              <div
                class="max-w-[88%] rounded-lg px-3 py-2 text-sm xl:max-w-[52rem]"
                :class="bubbleClass(reply)"
              >
                <div class="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span
                    v-if="messageLabel(reply)"
                    class="text-xs font-medium"
                    :class="reply.direction === 'out' ? 'opacity-80' : 'text-muted'"
                    :title="messageLabelTitle(reply)"
                  >
                    {{ messageLabel(reply) }}
                  </span>
                  <span
                    class="text-[10px] opacity-60"
                    :title="fmt(messageTime(reply))"
                  >
                    {{ fmtShort(messageTime(reply)) }}
                  </span>
                </div>
                <p class="whitespace-pre-wrap break-words">
                  {{ reply.content }}
                </p>
                <div v-if="messageStats(reply).length" class="mt-2 flex flex-wrap items-center gap-2 text-[10px] opacity-70">
                  <span
                    v-for="stat in messageStats(reply)"
                    :key="stat.key"
                    class="inline-flex items-center gap-1"
                    :title="`${stat.value} ${stat.label}`"
                  >
                    <UIcon :name="stat.icon" class="size-3" />
                    {{ stat.value }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
