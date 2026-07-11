<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { ChatMessage } from '~/types'

const props = defineProps<{
  messages: ChatMessage[]
  currentUserId: string
  loading?: boolean
  hasMore?: boolean
  lastReadMessageId?: number
}>()

const emit = defineEmits<{
  'load-more': []
  'open-thread': [message: ChatMessage]
  'edit': [message: ChatMessage]
  'delete': [messageId: number]
  'reaction': [messageId: number, emoji: string]
  'pin': [messageId: number]
  'save': [messageId: number]
  'reply': [message: ChatMessage]
  'forward': [message: ChatMessage]
}>()
const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>

// Emoji picker / dropdown open state. Used both to control the popover open
// state AND to keep the hover toolbar pinned visible while a menu is open
// (otherwise leaving .group:hover unmounts the trigger and Radix drops the
// menu at viewport 0,0).
const emojiPickerMessageId = ref<number | null>(null)
const menuOpenMessageId = ref<number | null>(null)

const container = ref<HTMLElement | null>(null)
// Vue collects refs inside v-for as an array, even when only one element ever
// matches. Type as array so .scrollIntoView() doesn't throw on the array
// itself.
const unreadDividerRef = ref<HTMLElement[]>([])

function getUnreadDividerEl(): HTMLElement | null {
  const v = unreadDividerRef.value
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}
const isAtBottom = ref(true)
const showScrollDown = ref(false)

// Common emoji shortcuts
const quickEmojis = ['👍', '❤️', '😂', '🎉', '👀', '🙏']

// Track first unread message ID for divider placement
const firstUnreadId = computed(() => {
  if (!props.lastReadMessageId) return null
  // Find first message after the last read one
  for (const msg of props.messages) {
    if (msg.id > props.lastReadMessageId && msg.user_id !== props.currentUserId) {
      return msg.id
    }
  }
  return null
})

// Count unread messages
const unreadCount = computed(() => {
  if (!props.lastReadMessageId) return 0
  return props.messages.filter(m => m.id > props.lastReadMessageId! && m.user_id !== props.currentUserId).length
})

// Scroll to bottom
function scrollToBottom(smooth = true) {
  nextTick(() => {
    if (container.value) {
      container.value.scrollTo({
        top: container.value.scrollHeight,
        behavior: smooth ? 'smooth' : 'instant'
      })
    }
  })
}

// Scroll to unread divider
function scrollToUnread() {
  nextTick(() => {
    const el = getUnreadDividerEl()
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

// Track scroll position
function onScroll() {
  if (!container.value) return
  const { scrollTop, scrollHeight, clientHeight } = container.value
  isAtBottom.value = scrollHeight - scrollTop - clientHeight < 50
  showScrollDown.value = !isAtBottom.value

  // Load more when scrolled near top
  if (scrollTop < 100 && props.hasMore && !props.loading) {
    emit('load-more')
  }
}

// Auto-scroll when new messages arrive (if already at bottom)
watch(() => props.messages.length, () => {
  if (isAtBottom.value) {
    scrollToBottom()
  }
})

// On initial load, scroll to unread divider or bottom
onMounted(() => {
  nextTick(() => {
    const dividerEl = getUnreadDividerEl()
    if (firstUnreadId.value && dividerEl) {
      dividerEl.scrollIntoView({ behavior: 'instant', block: 'center' })
    } else {
      scrollToBottom(false)
    }
  })
})

// Group messages by date
const groupedMessages = computed(() => {
  const groups: Array<{ date: string; messages: ChatMessage[] }> = []
  let currentDate = ''

  for (const msg of props.messages) {
    const msgDate = new Date(msg.created_at).toLocaleDateString('en-AU', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
    if (msgDate !== currentDate) {
      currentDate = msgDate
      groups.push({ date: msgDate, messages: [] })
    }
    groups[groups.length - 1].messages.push(msg)
  }
  return groups
})

// Should we show avatar/name (not consecutive same-author messages)
function showAuthor(messages: ChatMessage[], index: number): boolean {
  if (index === 0) return true
  const prev = messages[index - 1]
  const curr = messages[index]
  if (prev.user_id !== curr.user_id) return true
  // Show if > 5 min gap
  const gap = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime()
  return gap > 5 * 60 * 1000
}

// Find quoted message content for reply-to
function getQuotedMessage(msg: ChatMessage): ChatMessage | undefined {
  if (!msg.reply_to_id) return undefined
  return props.messages.find(m => m.id === msg.reply_to_id)
}

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Extract first URL from message for link preview
const urlRegex = /https?:\/\/[^\s<>)"']+/
function extractFirstUrl(content: string): string | null {
  // Skip if the content is just a code block
  if (content.startsWith('```')) return null
  const match = content.match(urlRegex)
  return match ? match[0] : null
}

// Read receipts — track which of the current user's messages are the last in the list
const lastOwnMessageId = computed(() => {
  for (let i = props.messages.length - 1; i >= 0; i--) {
    if (props.messages[i].user_id === props.currentUserId) {
      return props.messages[i].id
    }
  }
  return null
})

// Lazy-load read receipt readers for the last own message
const readReceipts = ref<Array<{ userId: string; userName: string; userAvatar?: string }>>([])
const readReceiptsFetched = ref(false)

watch(lastOwnMessageId, async (msgId) => {
  readReceipts.value = []
  readReceiptsFetched.value = false
  if (!msgId) return

  const channelId = props.messages.find(m => m.id === msgId)?.channel_id
  if (!channelId) return

  try {
    const data = await apiFetch<Array<{ userId: string; userName: string; userAvatar?: string }>>(
      `/api/chat/channels/${channelId}/messages/${msgId}/readers`
    )
    readReceipts.value = data.filter(r => r.userId !== props.currentUserId)
    readReceiptsFetched.value = true
  } catch {
    // Silent — read receipts are non-critical
  }
}, { immediate: true })

// Expose scrollToBottom for parent
defineExpose({ scrollToBottom, scrollToUnread })
</script>

<template>
  <div class="relative flex-1 min-h-0">
    <div
      ref="container"
      class="h-full overflow-y-auto px-4 py-3"
      @scroll="onScroll"
    >
      <!-- Loading more indicator -->
      <div v-if="loading && hasMore" class="text-center py-3">
        <XfLoader size="sm" />
      </div>

      <!-- Empty state -->
      <div
        v-if="messages.length === 0 && !loading"
        class="flex flex-col items-center justify-center h-full text-center"
      >
        <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <UIcon name="i-lucide-message-circle" class="w-7 h-7 text-primary" />
        </div>
        <h3 class="text-base font-semibold mb-1">No messages yet</h3>
        <p class="text-sm text-muted">Send the first message to start the conversation.</p>
      </div>

      <!-- Message groups by date -->
      <div v-for="group in groupedMessages" :key="group.date">
        <!-- Date divider -->
        <div class="flex items-center gap-3 my-4">
          <div class="flex-1 h-px bg-default" />
          <span class="text-xs text-muted font-medium px-2">{{ group.date }}</span>
          <div class="flex-1 h-px bg-default" />
        </div>

        <!-- Messages -->
        <template v-for="(msg, idx) in group.messages" :key="msg.id">
          <!-- Unread divider -->
          <div
            v-if="msg.id === firstUnreadId"
            ref="unreadDividerRef"
            class="flex items-center gap-3 my-3"
          >
            <div class="flex-1 h-px bg-red-400" />
            <span class="text-xs text-red-500 font-semibold px-2">New messages</span>
            <div class="flex-1 h-px bg-red-400" />
          </div>

          <div
            class="group relative"
            :class="showAuthor(group.messages, idx) ? 'mt-3' : 'mt-0.5'"
          >
            <div class="flex gap-2.5 px-1 py-0.5 -mx-1 rounded-md hover:bg-elevated/50">
              <!-- Avatar column -->
              <div class="w-9 shrink-0">
                <UAvatar
                  v-if="showAuthor(group.messages, idx)"
                  :src="msg.user_avatar || undefined"
                  :alt="msg.user_name"
                  size="sm"
                />
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <!-- Author + time -->
                <div v-if="showAuthor(group.messages, idx)" class="flex items-baseline gap-2 mb-0.5">
                  <span class="text-sm font-semibold">{{ msg.user_name }}</span>
                  <UTooltip :text="new Date(msg.created_at).toLocaleString()">
                    <span class="text-[11px] text-muted">{{ formatTime(msg.created_at) }}</span>
                  </UTooltip>
                  <UBadge v-if="msg.edited_at" label="edited" size="xs" color="neutral" variant="subtle" />
                </div>

                <!-- Quoted/reply-to message -->
                <div
                  v-if="msg.reply_to_id"
                  class="flex items-start gap-2 mb-1 pl-2 border-l-2 border-primary/40 rounded-sm"
                >
                  <template v-if="getQuotedMessage(msg)">
                    <UAvatar :src="getQuotedMessage(msg)!.user_avatar || undefined" :alt="getQuotedMessage(msg)!.user_name" size="2xs" class="mt-0.5" />
                    <div class="min-w-0">
                      <span class="text-[11px] font-semibold text-muted">{{ getQuotedMessage(msg)!.user_name }}</span>
                      <p class="text-xs text-muted line-clamp-2">{{ getQuotedMessage(msg)!.content }}</p>
                    </div>
                  </template>
                  <span v-else class="text-xs text-muted italic">Original message unavailable</span>
                </div>

                <!-- Message text (markdown) -->
                <ChatMarkdown :content="msg.content" />

                <!-- Link preview -->
                <ChatLinkPreview
                  v-if="extractFirstUrl(msg.content)"
                  :url="extractFirstUrl(msg.content)!"
                />

                <!-- Attachments -->
                <ChatAttachment v-if="msg.metadata?.attachments?.length" :attachments="msg.metadata.attachments" />

                <!-- Reactions -->
                <div v-if="msg.reactions && msg.reactions.length > 0" class="flex flex-wrap gap-1 mt-1.5">
                  <button
                    v-for="reaction in msg.reactions"
                    :key="reaction.emoji"
                    :class="[
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors',
                      reaction.user_ids.includes(currentUserId)
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-default bg-elevated/50 hover:bg-elevated'
                    ]"
                    @click="emit('reaction', msg.id, reaction.emoji)"
                  >
                    <span>{{ reaction.emoji }}</span>
                    <span class="font-medium">{{ reaction.count }}</span>
                  </button>
                </div>

                <!-- Forwarded indicator -->
                <div v-if="(msg.metadata as any)?.forwarded" class="flex items-center gap-1 mt-1 text-[11px] text-muted">
                  <UIcon name="i-lucide-forward" class="w-3 h-3" />
                  <span>Forwarded</span>
                </div>

                <!-- Thread indicator -->
                <button
                  v-if="(msg.thread_count || 0) > 0"
                  class="flex items-center gap-1.5 mt-1.5 text-xs text-primary hover:underline"
                  @click="emit('open-thread', msg)"
                >
                  <UIcon name="i-lucide-message-square" class="w-3.5 h-3.5" />
                  {{ msg.thread_count }} {{ msg.thread_count === 1 ? 'reply' : 'replies' }}
                </button>

                <!-- Read receipts (on last own message) -->
                <div
                  v-if="msg.id === lastOwnMessageId && readReceiptsFetched && readReceipts.length > 0"
                  class="flex items-center gap-1 mt-1"
                >
                  <UIcon name="i-lucide-check-check" class="w-3 h-3 text-primary" />
                  <UTooltip
                    :text="readReceipts.map(r => r.userName).join(', ')"
                  >
                    <div class="flex -space-x-1">
                      <UAvatar
                        v-for="reader in readReceipts.slice(0, 3)"
                        :key="reader.userId"
                        :src="reader.userAvatar"
                        :alt="reader.userName"
                        size="3xs"
                        class="ring-1 ring-elevated"
                      />
                      <span v-if="readReceipts.length > 3" class="text-[10px] text-muted ml-1">
                        +{{ readReceipts.length - 3 }}
                      </span>
                    </div>
                  </UTooltip>
                </div>
              </div>

              <!-- Hover actions — kept visible while a popover/dropdown is open
                   on this message so its trigger stays mounted and the floating
                   menu doesn't lose its anchor. -->
              <div
                class="absolute top-0 right-1 -mt-3 items-center gap-0.5 bg-elevated border border-default rounded-md shadow-sm px-0.5 py-0.5"
                :class="(emojiPickerMessageId === msg.id || menuOpenMessageId === msg.id) ? 'flex' : 'hidden group-hover:flex'"
              >
                <!-- Quick emoji -->
                <button
                  v-for="emoji in quickEmojis.slice(0, 3)"
                  :key="emoji"
                  class="w-6 h-6 flex items-center justify-center rounded hover:bg-default/50 text-sm"
                  @click="emit('reaction', msg.id, emoji)"
                >
                  {{ emoji }}
                </button>

                <!-- Emoji picker -->
                <UPopover
                  :open="emojiPickerMessageId === msg.id"
                  :content="{ side: 'top', align: 'end', sideOffset: 6, collisionPadding: 8 }"
                  @update:open="v => { if (!v) emojiPickerMessageId = null }"
                >
                  <UTooltip text="Add reaction">
                    <UButton
                      icon="i-lucide-smile-plus"
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      @click="emojiPickerMessageId = msg.id"
                    />
                  </UTooltip>
                  <template #content>
                    <ChatEmojiPicker @select="(emoji: string) => { emit('reaction', msg.id, emoji); emojiPickerMessageId = null }" />
                  </template>
                </UPopover>

                <!-- Thread -->
                <UTooltip text="Reply in thread">
                  <UButton
                    icon="i-lucide-message-square"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    @click="emit('open-thread', msg)"
                  />
                </UTooltip>

                <!-- More actions -->
                <UDropdownMenu
                  :content="{ side: 'top', align: 'end', sideOffset: 6, collisionPadding: 8 }"
                  @update:open="v => menuOpenMessageId = v ? msg.id : (menuOpenMessageId === msg.id ? null : menuOpenMessageId)"
                  :items="[
                    [
                      { label: 'Reply', icon: 'i-lucide-reply', onSelect: () => emit('reply', msg) },
                      { label: 'Forward', icon: 'i-lucide-forward', onSelect: () => emit('forward', msg) },
                      { label: 'Save message', icon: 'i-lucide-bookmark', onSelect: () => emit('save', msg.id) },
                      { label: 'Pin message', icon: 'i-lucide-pin', onSelect: () => emit('pin', msg.id) },
                      ...(msg.user_id === currentUserId ? [
                        { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => emit('edit', msg) },
                        { label: 'Delete', icon: 'i-lucide-trash-2', onSelect: () => emit('delete', msg.id) }
                      ] : [])
                    ]
                  ]"
                >
                  <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
                </UDropdownMenu>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Jump to unread button -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <button
        v-if="unreadCount > 0 && !isAtBottom && firstUnreadId"
        class="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-primary text-primary-foreground shadow-md text-xs font-medium hover:bg-primary/90 flex items-center gap-1.5"
        @click="scrollToUnread()"
      >
        <UIcon name="i-lucide-arrow-up" class="w-3.5 h-3.5" />
        {{ unreadCount }} new {{ unreadCount === 1 ? 'message' : 'messages' }}
      </button>
    </Transition>

    <!-- Scroll to bottom button -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <button
        v-if="showScrollDown"
        class="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center hover:bg-primary/90"
        @click="scrollToBottom()"
      >
        <UIcon name="i-lucide-chevron-down" class="w-5 h-5" />
      </button>
    </Transition>
  </div>
</template>
