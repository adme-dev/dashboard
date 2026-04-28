<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { ChatChannel, ChatMessage } from '~/types'
import type { ChatWsMessage } from '~/composables/useChatWebSocket'

const router = useRouter()
const toast = useToast()
const { close: closeHub } = useActivityHub()
const { user } = useAuth()

const {
  channels,
  activeChannel,
  messages,
  loadingChannels,
  loadingMessages,
  hasMoreMessages,
  fetchChannels,
  selectChannel,
  loadMoreMessages,
  applyWsMessage,
  updateChannelPreview,
  markChannelAsRead,
} = useChat()

type View = 'list' | 'conversation'
const view = ref<View>('list')
const search = ref('')
const showNewDM = ref(false)

const grouped = computed(() => {
  const q = search.value.trim().toLowerCase()
  const all = q
    ? channels.value.filter(c => c.name.toLowerCase().includes(q))
    : channels.value
  return {
    channels: all.filter(c => c.type === 'channel'),
    dms: all.filter(c => c.type === 'dm' || c.type === 'group_dm'),
  }
})

let ws: ReturnType<typeof useChatWebSocket> | null = null
const sending = ref(false)
const replyingTo = ref<ChatMessage | null>(null)
const wsConnected = computed(() => ws?.isConnected.value || false)
const typingText = computed(() => ws?.typingText.value || '')

// ── Polling fallback ──
// When WS fails to connect (dev without wrangler, network hiccup), poll for new
// messages instead. Stops automatically as soon as WS becomes available.
const POLL_INTERVAL_MS = 3000
const WS_GRACE_MS = 3000
let pollTimer: ReturnType<typeof setInterval> | null = null
let wsGraceTimer: ReturnType<typeof setTimeout> | null = null

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (wsGraceTimer) {
    clearTimeout(wsGraceTimer)
    wsGraceTimer = null
  }
}

async function pollOnce(channelId: string) {
  // Find highest message ID we have locally
  const lastId = messages.value.reduce((max, m) => (m.id > max ? m.id : max), 0)
  try {
    const fresh = await $fetch<ChatMessage[]>(
      `/api/chat/channels/${channelId}/messages`,
      { params: { after: String(lastId), limit: '50' } },
    )
    if (!fresh.length) return
    let newestId = lastId
    for (const m of fresh) {
      if (!messages.value.find(existing => existing.id === m.id)) {
        messages.value.push(m)
      }
      if (m.id > newestId) newestId = m.id
    }
    // Mark read since the user is actively looking at this channel
    if (newestId > lastId) {
      markChannelAsRead(channelId, newestId)
      const last = fresh[fresh.length - 1]
      updateChannelPreview(channelId, last.content, last.user_name || '')
    }
  } catch {
    // Silent — polling is best-effort
  }
}

function startPollingIfNeeded(channelId: string) {
  if (wsGraceTimer) clearTimeout(wsGraceTimer)
  wsGraceTimer = setTimeout(() => {
    if (wsConnected.value || pollTimer) return
    pollTimer = setInterval(() => {
      // If WS comes online mid-flight, kill the poll loop.
      if (wsConnected.value) {
        stopPolling()
        return
      }
      pollOnce(channelId)
    }, POLL_INTERVAL_MS)
    // Run an immediate first poll so the widget feels live within 1 RTT, not 3s.
    pollOnce(channelId)
  }, WS_GRACE_MS)
}

function openConversation(channel: ChatChannel) {
  selectChannel(channel)
  view.value = 'conversation'
  connectWs(channel)
}

function backToList() {
  view.value = 'list'
  stopPolling()
  ws?.disconnect()
  ws = null
  activeChannel.value = null
  replyingTo.value = null
}

function connectWs(channel: ChatChannel) {
  ws?.disconnect()
  stopPolling()
  ws = useChatWebSocket(channel.id)
  ws.onMessage((msg: ChatWsMessage) => {
    if (msg.type === 'history') {
      if (messages.value.length === 0 && msg.messages) {
        for (const m of msg.messages) applyWsMessage(m as any)
      }
      return
    }
    applyWsMessage(msg as any)
    if (msg.type === 'message' && msg.content && msg.userName) {
      updateChannelPreview(channel.id, msg.content, msg.userName)
      if (msg.id) markChannelAsRead(channel.id, msg.id)
    }
  })
  if (user.value) {
    ws.connect(user.value.id, user.value.name, user.value.avatar_url)
  }
  // Race the WS handshake; if it doesn't land within the grace window, poll.
  startPollingIfNeeded(channel.id)
}

async function handleSend(
  content: string,
  _mentions?: string[],
  attachments?: Array<{ url: string; name: string; type: string; size: number }>,
  replyToId?: number,
) {
  if (!activeChannel.value || sending.value) return
  const text = (content || '').trim()
  if (!text && !attachments?.length) return

  const channelId = activeChannel.value.id
  sending.value = true

  const metadata: Record<string, unknown> = {}
  if (attachments?.length) metadata.attachments = attachments
  if (replyToId) metadata.replyToId = replyToId

  try {
    const sent = await $fetch<ChatMessage>(`/api/chat/channels/${channelId}/messages`, {
      method: 'POST',
      body: {
        content: text || ' ',
        ...(Object.keys(metadata).length ? { metadata } : {}),
      },
    })
    if (!messages.value.find(m => m.id === sent.id)) {
      messages.value.push(sent)
    }
    updateChannelPreview(channelId, sent.content, sent.user_name || user.value?.name || '')
    replyingTo.value = null
  } catch {
    toast.add({ title: 'Failed to send', color: 'error' })
  } finally {
    sending.value = false
  }
}

function handleTyping() {
  ws?.sendTyping()
}

function handleReply(msg: ChatMessage) {
  replyingTo.value = msg
}

function handleReaction(messageId: number, emoji: string) {
  ws?.sendReaction(messageId, emoji)
}

function popOut() {
  if (!activeChannel.value) return
  const id = activeChannel.value.id
  closeHub()
  router.push(`/agency/chat?channel=${id}`)
}

function popOutToList() {
  closeHub()
  router.push('/agency/chat')
}

async function handleNewDmCreated(channel: ChatChannel) {
  showNewDM.value = false
  if (!channels.value.find(c => c.id === channel.id)) {
    channels.value.unshift(channel)
  }
  openConversation(channel)
}

function relativeTime(date: string | null | undefined) {
  if (!date) return ''
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true })
  } catch {
    return ''
  }
}

onMounted(() => {
  if (channels.value.length === 0 && !loadingChannels.value) {
    fetchChannels().catch(() => {
      toast.add({ title: 'Could not load channels', color: 'error' })
    })
  }
})

onUnmounted(() => {
  stopPolling()
  ws?.disconnect()
  ws = null
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- LIST VIEW -->
    <template v-if="view === 'list'">
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-default">
        <span class="text-xs font-medium text-muted flex-1">Team Chat</span>
        <UTooltip text="New message">
          <UButton
            icon="i-lucide-pen-square"
            size="xs"
            color="neutral"
            variant="ghost"
            @click="showNewDM = true"
          />
        </UTooltip>
        <UTooltip text="Open full chat">
          <UButton
            icon="i-lucide-external-link"
            size="xs"
            color="neutral"
            variant="ghost"
            @click="popOutToList"
          />
        </UTooltip>
      </div>

      <!-- Search -->
      <div class="px-3 pt-2 pb-1">
        <UInput
          v-model="search"
          placeholder="Search channels & DMs"
          icon="i-lucide-search"
          size="xs"
        />
      </div>

      <!-- Lists -->
      <div class="flex-1 overflow-y-auto px-1 pb-2">
        <!-- Loading skeleton -->
        <template v-if="loadingChannels && channels.length === 0">
          <div class="px-2 py-2 space-y-2">
            <USkeleton v-for="i in 4" :key="i" class="h-9 w-full" />
          </div>
        </template>

        <template v-else>
          <!-- Channels -->
          <div v-if="grouped.channels.length > 0" class="mb-2">
            <div class="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wide">
              Channels
            </div>
            <button
              v-for="ch in grouped.channels"
              :key="ch.id"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-elevated/60 transition-colors text-left cursor-pointer"
              @click="openConversation(ch)"
            >
              <UIcon
                :name="ch.is_private ? 'i-lucide-lock' : 'i-lucide-hash'"
                class="w-3.5 h-3.5 shrink-0"
                :class="ch.muted_until ? 'text-muted/50' : 'text-muted'"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1">
                  <span
                    class="text-xs truncate"
                    :class="[
                      (ch.unread_count || 0) > 0 ? 'font-semibold text-highlighted' : 'text-default',
                      ch.muted_until ? 'text-muted' : '',
                    ]"
                  >
                    {{ ch.name }}
                  </span>
                </div>
                <p v-if="ch.last_message" class="text-[11px] text-muted truncate">
                  <span class="font-medium">{{ ch.last_message.user_name }}:</span>
                  {{ ch.last_message.content }}
                </p>
              </div>
              <div class="shrink-0 flex flex-col items-end gap-0.5">
                <span v-if="ch.last_message" class="text-[9px] text-dimmed">
                  {{ relativeTime(ch.last_message.created_at) }}
                </span>
                <UBadge
                  v-if="(ch.unread_count || 0) > 0"
                  :label="String(ch.unread_count)"
                  size="xs"
                  color="primary"
                />
              </div>
            </button>
          </div>

          <!-- DMs -->
          <div v-if="grouped.dms.length > 0" class="mb-2">
            <div class="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wide">
              Direct Messages
            </div>
            <button
              v-for="ch in grouped.dms"
              :key="ch.id"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-elevated/60 transition-colors text-left cursor-pointer"
              @click="openConversation(ch)"
            >
              <UAvatar :src="ch.avatar_url" :alt="ch.name" size="2xs" class="shrink-0" />
              <div class="flex-1 min-w-0">
                <span
                  class="text-xs truncate block"
                  :class="(ch.unread_count || 0) > 0 ? 'font-semibold text-highlighted' : 'text-default'"
                >
                  {{ ch.name }}
                </span>
                <p v-if="ch.last_message" class="text-[11px] text-muted truncate">
                  {{ ch.last_message.content }}
                </p>
              </div>
              <UBadge
                v-if="(ch.unread_count || 0) > 0"
                :label="String(ch.unread_count)"
                size="xs"
                color="primary"
                class="shrink-0"
              />
            </button>
          </div>

          <!-- Empty state -->
          <div
            v-if="grouped.channels.length === 0 && grouped.dms.length === 0"
            class="flex flex-col items-center justify-center h-full text-center px-6 py-10"
          >
            <div class="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-message-square" class="w-6 h-6 text-muted" />
            </div>
            <p class="text-sm font-medium text-highlighted">
              {{ search ? 'No matches' : 'No conversations yet' }}
            </p>
            <p v-if="!search" class="text-xs text-muted mt-1 mb-3">
              Start a DM or join a channel.
            </p>
            <UButton
              v-if="!search"
              icon="i-lucide-pen-square"
              label="New message"
              size="xs"
              variant="soft"
              @click="showNewDM = true"
            />
          </div>
        </template>
      </div>
    </template>

    <!-- CONVERSATION VIEW -->
    <template v-else-if="view === 'conversation' && activeChannel">
      <!-- Header -->
      <div class="flex items-center gap-1.5 px-2 py-2 border-b border-default">
        <UButton
          icon="i-lucide-arrow-left"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="backToList"
        />
        <UIcon
          v-if="activeChannel.type === 'channel'"
          :name="activeChannel.is_private ? 'i-lucide-lock' : 'i-lucide-hash'"
          class="w-3.5 h-3.5 text-muted shrink-0"
        />
        <span class="text-sm font-semibold truncate flex-1">{{ activeChannel.name }}</span>
        <UTooltip text="Open full chat">
          <UButton
            icon="i-lucide-external-link"
            size="xs"
            color="neutral"
            variant="ghost"
            @click="popOut"
          />
        </UTooltip>
      </div>

      <!-- Messages -->
      <div class="flex-1 min-h-0 flex flex-col">
        <ChatMessageList
          :messages="messages"
          :current-user-id="user?.id || ''"
          :loading="loadingMessages"
          :has-more="hasMoreMessages"
          @load-more="loadMoreMessages"
          @reaction="handleReaction"
          @reply="handleReply"
          @open-thread="popOut"
          @edit="popOut"
          @delete="popOut"
          @pin="popOut"
          @save="popOut"
          @forward="popOut"
        />

        <!-- Full composer: file upload, formatting, emoji, mentions, shortcuts.
             Send goes via REST so it works regardless of WS state. -->
        <ChatMentionInput
          :typing-text="wsConnected ? typingText : ''"
          :replying-to="replyingTo"
          :disabled="sending"
          :channel-id="activeChannel.id"
          @send="handleSend"
          @typing="handleTyping"
          @cancel-reply="replyingTo = null"
        />
      </div>
    </template>

    <!-- New DM Modal -->
    <UModal v-model:open="showNewDM" title="New Message" description="Start a conversation with a team member">
      <template #content>
        <ChatNewMessage @close="showNewDM = false" @created="handleNewDmCreated" />
      </template>
    </UModal>
  </div>
</template>
