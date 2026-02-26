<script setup lang="ts">
import type { ChatChannel, ChatMessage, ChatPresenceStatus } from '~/types'
import type { ChatWsMessage } from '~/composables/useChatWebSocket'

definePageMeta({ layout: 'agency' })

const toast = useToast()
const { user } = useAuth()

const {
  channels, activeChannel, messages, loadingChannels, loadingMessages, hasMoreMessages,
  fetchChannels, createChannel, selectChannel, loadMoreMessages,
  applyWsMessage, updateChannelPreview, markChannelAsRead
} = useChat()

// ── State ──
const sidebarOpen = ref(true)
const showCreateChannel = ref(false)
const showNewDM = ref(false)
const showMembers = ref(false)
const showSearch = ref(false)
const showSettings = ref(false)
const showPins = ref(false)
const showSaved = ref(false)
const showBrowseChannels = ref(false)
const showChannelSwitcher = ref(false)
const forwardingMessage = ref<ChatMessage | null>(null)
const threadMessage = ref<ChatMessage | null>(null)
const editingMessage = ref<{ id: number; content: string } | null>(null)
const replyingTo = ref<ChatMessage | null>(null)
const showDeleteConfirm = ref<number | null>(null)
const isDeleteModalOpen = computed({
  get: () => showDeleteConfirm.value !== null,
  set: (v: boolean) => { if (!v) showDeleteConfirm.value = null }
})
const messageListRef = ref<InstanceType<any> | null>(null)
const threadPanelRef = ref<InstanceType<any> | null>(null)
const lastReadMessageId = ref<number>(0)

// ── User Presence ──
const userStatuses = ref<Map<string, ChatPresenceStatus>>(new Map())

async function fetchPresenceStatuses() {
  // Collect user IDs from DM channels
  const dmChannels = channels.value.filter(c => c.type === 'dm' || c.type === 'group_dm')
  const userIds = new Set<string>()
  for (const ch of dmChannels) {
    if (ch.members) {
      for (const m of ch.members) {
        if (m.user_id !== user.value?.id) userIds.add(m.user_id)
      }
    }
    if (ch.created_by && ch.created_by !== user.value?.id) {
      userIds.add(ch.created_by)
    }
  }
  if (userIds.size === 0) return

  try {
    const data = await $fetch<Array<{ userId: string; status: ChatPresenceStatus }>>('/api/chat/status', {
      params: { userIds: [...userIds].join(',') }
    })
    const map = new Map<string, ChatPresenceStatus>()
    for (const d of data) {
      map.set(d.userId, d.status)
    }
    userStatuses.value = map
  } catch {
    // Silent — presence is non-critical
  }
}

// ── Create channel form ──
const newChannelName = ref('')
const newChannelDescription = ref('')
const newChannelPrivate = ref(false)
const creatingChannel = ref(false)

// ── Channel details (for member list) ──
const channelDetails = ref<any>(null)

// ── WebSocket ──
let wsComposable: ReturnType<typeof useChatWebSocket> | null = null

function connectToChannel(channel: ChatChannel) {
  // Disconnect previous
  if (wsComposable) {
    wsComposable.disconnect()
  }

  wsComposable = useChatWebSocket(channel.id)

  // Subscribe to incoming messages
  wsComposable.onMessage((msg: ChatWsMessage) => {
    if (msg.type === 'history') {
      if (messages.value.length === 0 && msg.messages) {
        for (const m of msg.messages) {
          applyWsMessage(m as any)
        }
      }
      return
    }

    applyWsMessage(msg as any)

    // Update sidebar preview
    if (msg.type === 'message' && msg.content && msg.userName) {
      updateChannelPreview(channel.id, msg.content, msg.userName)

      // Mark as read (we're looking at this channel)
      if (msg.id) {
        markChannelAsRead(channel.id, msg.id)
      }
    }

    // Thread replies
    if (msg.type === 'message' && msg.threadParentId && threadPanelRef.value) {
      threadPanelRef.value.addReply({
        id: msg.id,
        channel_id: channel.id,
        user_id: msg.userId || '',
        content: msg.content || '',
        thread_parent_id: msg.threadParentId,
        created_at: msg.createdAt || new Date().toISOString(),
        user_name: msg.userName,
        user_avatar: msg.userAvatar,
        reactions: []
      })
    }

    // Thread edit/delete/reaction sync
    if (threadPanelRef.value) {
      if (msg.type === 'edit' && msg.messageId) {
        threadPanelRef.value.applyEdit(msg.messageId, msg.content, msg.editedAt || new Date().toISOString())
      }
      if (msg.type === 'delete' && msg.messageId) {
        threadPanelRef.value.applyDelete(msg.messageId)
      }
      if (msg.type === 'reaction' && msg.messageId && msg.reactions) {
        threadPanelRef.value.applyReaction(msg.messageId, msg.reactions.map((r: any) => ({
          emoji: r.emoji,
          user_ids: r.userIds,
          count: r.count
        })))
      }
    }
  })

  // Connect
  if (user.value) {
    wsComposable.connect(user.value.id, user.value.name, user.value.avatar_url)
  }
}

// ── Channel Selection ──
async function handleSelectChannel(channel: ChatChannel) {
  // Store last_read_message_id before selecting
  const ch = channels.value.find(c => c.id === channel.id)
  // We use the channel's current unread info to determine last read position
  // The channel members table stores last_read_message_id, we can compute it from messages
  await selectChannel(channel)
  connectToChannel(channel)
  threadMessage.value = null
  editingMessage.value = null
  replyingTo.value = null

  // Use last_read_message_id from channel membership for unread divider
  lastReadMessageId.value = ch?.last_read_message_id || 0

  // Collapse sidebar on mobile
  if (window.innerWidth < 768) {
    sidebarOpen.value = false
  }
}

// ── Send Message ──
function handleSendMessage(content: string, _mentions?: string[], attachments?: Array<{ url: string; name: string; type: string; size: number }>, replyToId?: number) {
  if (!wsComposable) return
  const metadata: Record<string, unknown> = {}
  if (attachments && attachments.length > 0) {
    metadata.attachments = attachments
  }
  if (replyToId) {
    metadata.replyToId = replyToId
  }
  wsComposable.sendMessage(content, undefined, Object.keys(metadata).length > 0 ? metadata : undefined)
}

// ── Pin ──
async function handlePinMessage(messageId: number) {
  if (!activeChannel.value) return
  try {
    const result = await $fetch(`/api/chat/channels/${activeChannel.value.id}/messages/${messageId}/pin`, {
      method: 'PATCH'
    }) as { pinned: boolean }
    toast.add({
      title: result.pinned ? 'Message pinned' : 'Message unpinned',
      color: 'success'
    })
  } catch {
    toast.add({ title: 'Failed to pin message', color: 'error' })
  }
}

// ── Save/Bookmark ──
async function handleSaveMessage(messageId: number) {
  if (!activeChannel.value) return
  try {
    const result = await $fetch('/api/chat/saved', {
      method: 'POST',
      body: { messageId, channelId: activeChannel.value.id }
    }) as { saved: boolean }
    toast.add({
      title: result.saved ? 'Message saved' : 'Message unsaved',
      color: 'success'
    })
  } catch {
    toast.add({ title: 'Failed to save message', color: 'error' })
  }
}

// ── Reply-to ──
function handleReplyTo(msg: ChatMessage) {
  replyingTo.value = msg
}

// ── Typing ──
function handleTyping() {
  wsComposable?.sendTyping()
}

// ── Reactions ──
function handleReaction(messageId: number, emoji: string) {
  wsComposable?.sendReaction(messageId, emoji)
}

// ── Edit ──
function handleStartEdit(msg: ChatMessage) {
  editingMessage.value = { id: msg.id, content: msg.content }
  replyingTo.value = null
}

function handleSaveEdit(messageId: number, content: string) {
  wsComposable?.sendEdit(messageId, content)
  editingMessage.value = null
}

function handleCancelEdit() {
  editingMessage.value = null
}

// ── Thread edit/delete ──
function handleThreadEdit(messageId: number, content: string) {
  wsComposable?.sendEdit(messageId, content)
}

function handleThreadDelete(messageId: number) {
  wsComposable?.sendDelete(messageId)
}

// ── Delete ──
function handleDeleteConfirm(messageId: number) {
  showDeleteConfirm.value = messageId
}

function handleDelete() {
  if (showDeleteConfirm.value) {
    wsComposable?.sendDelete(showDeleteConfirm.value)
    showDeleteConfirm.value = null
  }
}

// ── Thread ──
function handleOpenThread(msg: ChatMessage) {
  threadMessage.value = msg
}

// ── Forward ──
function handleForwardMessage(msg: ChatMessage) {
  forwardingMessage.value = msg
}

function handleForwarded(_channelId: string) {
  forwardingMessage.value = null
}

// ── Cmd+K Channel Switcher ──
function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    showChannelSwitcher.value = !showChannelSwitcher.value
  }
}

// Listen for thread replies from the thread panel
onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('chat-thread-reply', ((e: CustomEvent) => {
    const { threadParentId, content } = e.detail
    wsComposable?.sendMessage(content, threadParentId)
  }) as EventListener)
})

// ── Create Channel ──
async function handleCreateChannel() {
  if (!newChannelName.value.trim()) return
  creatingChannel.value = true
  try {
    const ch = await createChannel({
      name: newChannelName.value.trim(),
      description: newChannelDescription.value.trim() || undefined,
      isPrivate: newChannelPrivate.value,
      type: 'channel'
    })
    showCreateChannel.value = false
    newChannelName.value = ''
    newChannelDescription.value = ''
    newChannelPrivate.value = false
    await handleSelectChannel(ch)
    toast.add({ title: 'Channel created', color: 'success' })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to create channel', color: 'error' })
  } finally {
    creatingChannel.value = false
  }
}

// ── New Message (DM or Group DM) ──
async function handleNewMessageCreated(channel: ChatChannel) {
  showNewDM.value = false
  // Add to channels list if not present
  if (!channels.value.find(c => c.id === channel.id)) {
    channels.value.unshift(channel)
  }
  await handleSelectChannel(channel)
}

// ── Browse Channels — join ──
async function handleChannelJoined(channel: any) {
  // Add to channels list
  if (!channels.value.find(c => c.id === channel.id)) {
    channels.value.unshift(channel as ChatChannel)
  }
  showBrowseChannels.value = false
  await handleSelectChannel(channel as ChatChannel)
}

// ── Search ──
async function handleSearchSelect(channelId: string, _messageId?: number) {
  const channel = channels.value.find((c: any) => c.id === channelId)
  if (channel) {
    await handleSelectChannel(channel)
    showSearch.value = false
  }
}

// ── Saved message navigation ──
async function handleSavedSelect(channelId: string, _messageId: number) {
  const channel = channels.value.find((c: any) => c.id === channelId)
  if (channel) {
    await handleSelectChannel(channel)
    showSaved.value = false
  }
}

// ── Channel Settings ──
function handleChannelUpdated(updatedChannel: ChatChannel) {
  if (activeChannel.value?.id === updatedChannel.id) {
    Object.assign(activeChannel.value, updatedChannel)
  }
  showSettings.value = false
}

function handleChannelLeft() {
  showSettings.value = false
  const idx = channels.value.findIndex((c: any) => c.id === activeChannel.value?.id)
  if (idx !== -1) channels.value.splice(idx, 1)
  activeChannel.value = null
}

function handleChannelArchived() {
  showSettings.value = false
  fetchChannels()
}

// ── Members Panel ──
async function handleOpenMembers() {
  if (!activeChannel.value) return
  showMembers.value = true
  try {
    const { fetchChannelDetails } = useChat()
    channelDetails.value = await fetchChannelDetails(activeChannel.value.id)
  } catch {
    // Silent
  }
}

// ── Set own presence on mount ──
async function setOwnPresence(status: 'online' | 'offline') {
  try {
    await $fetch('/api/chat/status', {
      method: 'PATCH',
      body: { status }
    })
  } catch {
    // Silent
  }
}

// ── Init ──
await fetchChannels()

// Handle ?channel= query param for deep linking (from Activity Hub, TaskChatPanel, etc.)
const route = useRoute()
const channelParam = route.query.channel as string | undefined
if (channelParam) {
  const target = channels.value.find(c => c.id === channelParam)
  if (target) await handleSelectChannel(target)
}

fetchPresenceStatuses()
setOwnPresence('online')

// Poll presence every 60s
const presenceInterval = setInterval(fetchPresenceStatuses, 60_000)

// Cleanup
onUnmounted(() => {
  wsComposable?.disconnect()
  clearInterval(presenceInterval)
  setOwnPresence('offline')
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <div class="flex h-[calc(100vh-3.5rem)] overflow-hidden">
    <!-- Sidebar -->
    <div
      :class="[
        'flex flex-col border-r border-default bg-elevated/50 transition-all duration-200',
        sidebarOpen ? 'w-72 min-w-72' : 'w-0 min-w-0 overflow-hidden',
        'md:w-72 md:min-w-72 md:overflow-visible'
      ]"
    >
      <ChatSidebar
        :channels="channels"
        :active-channel-id="activeChannel?.id"
        :loading="loadingChannels"
        :user-statuses="userStatuses"
        @select="handleSelectChannel"
        @create-channel="showCreateChannel = true"
        @create-dm="showNewDM = true"
        @browse-channels="showBrowseChannels = true"
      />
    </div>

    <!-- Main chat area -->
    <div class="flex-1 flex flex-col min-w-0">
      <ChatHeader
        :channel="activeChannel"
        :active-users="wsComposable?.activeUsers.value"
        :is-connected="wsComposable?.isConnected.value"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
        @open-members="handleOpenMembers"
        @open-search="showSearch = !showSearch"
        @open-settings="showSettings = true"
        @open-pins="showPins = !showPins"
        @open-saved="showSaved = !showSaved"
      />

      <!-- Empty state when no channel selected -->
      <div v-if="!activeChannel" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <UIcon name="i-lucide-message-circle" class="w-8 h-8 text-primary" />
          </div>
          <h3 class="text-lg font-semibold mb-1">Welcome to Chat</h3>
          <p class="text-sm text-muted mb-4 max-w-sm">
            Select a channel or start a conversation to begin messaging your team.
          </p>
          <div class="flex gap-2 justify-center flex-wrap">
            <UButton
              icon="i-lucide-hash"
              label="New Channel"
              variant="soft"
              color="primary"
              @click="showCreateChannel = true"
            />
            <UButton
              icon="i-lucide-pen-square"
              label="New Message"
              variant="soft"
              color="neutral"
              @click="showNewDM = true"
            />
            <UButton
              icon="i-lucide-compass"
              label="Browse Channels"
              variant="soft"
              color="neutral"
              @click="showBrowseChannels = true"
            />
          </div>
        </div>
      </div>

      <!-- Chat content -->
      <template v-else>
        <div class="flex flex-1 min-h-0">
          <!-- Messages + input -->
          <div class="flex-1 flex flex-col min-w-0">
            <ChatMessageList
              ref="messageListRef"
              :messages="messages"
              :current-user-id="user?.id || ''"
              :loading="loadingMessages"
              :has-more="hasMoreMessages"
              :last-read-message-id="lastReadMessageId"
              @load-more="loadMoreMessages"
              @open-thread="handleOpenThread"
              @edit="handleStartEdit"
              @delete="handleDeleteConfirm"
              @reaction="handleReaction"
              @pin="handlePinMessage"
              @save="handleSaveMessage"
              @reply="handleReplyTo"
              @forward="handleForwardMessage"
            />

            <ChatMentionInput
              :typing-text="wsComposable?.typingText.value"
              :editing-message="editingMessage"
              :replying-to="replyingTo"
              :disabled="!wsComposable?.isConnected.value"
              :channel-id="activeChannel?.id"
              @send="handleSendMessage"
              @typing="handleTyping"
              @save-edit="handleSaveEdit"
              @cancel-edit="handleCancelEdit"
              @cancel-reply="replyingTo = null"
            />
          </div>

          <!-- Thread panel -->
          <div
            v-if="threadMessage"
            class="w-80 border-l border-default bg-elevated/25 flex flex-col"
          >
            <ChatThreadPanel
              ref="threadPanelRef"
              :parent-message="threadMessage"
              :channel-id="activeChannel.id"
              :current-user-id="user?.id || ''"
              @close="threadMessage = null"
              @reaction="handleReaction"
              @edit="handleThreadEdit"
              @delete="handleThreadDelete"
            />
          </div>

          <!-- Search panel -->
          <div
            v-if="showSearch"
            class="w-80 border-l border-default bg-elevated/25 flex flex-col"
          >
            <ChatSearchPanel
              @close="showSearch = false"
              @select="handleSearchSelect"
            />
          </div>

          <!-- Pinned messages panel -->
          <div
            v-if="showPins"
            class="w-80 border-l border-default bg-elevated/25 flex flex-col"
          >
            <ChatPinnedMessages
              :channel-id="activeChannel.id"
              @close="showPins = false"
              @unpin="() => {}"
              @select="() => {}"
            />
          </div>

          <!-- Saved messages panel -->
          <div
            v-if="showSaved"
            class="w-80 border-l border-default bg-elevated/25 flex flex-col"
          >
            <ChatSavedMessages
              @close="showSaved = false"
              @select="handleSavedSelect"
              @unsave="() => {}"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- Create Channel Modal -->
    <UModal v-model:open="showCreateChannel" title="Create a Channel" description="Add a new channel for your team">
      <template #content>
        <div class="p-6">
          <div class="space-y-4">
            <div>
              <label class="text-sm font-medium mb-1 block">Channel name</label>
              <UInput
                v-model="newChannelName"
                placeholder="e.g. project-updates"
                icon="i-lucide-hash"
                @keydown.enter="handleCreateChannel"
              />
            </div>

            <div>
              <label class="text-sm font-medium mb-1 block">Description (optional)</label>
              <UInput
                v-model="newChannelDescription"
                placeholder="What's this channel about?"
              />
            </div>

            <div class="flex items-center gap-2">
              <UCheckbox v-model="newChannelPrivate" />
              <div>
                <span class="text-sm font-medium">Private channel</span>
                <p class="text-xs text-muted">Only invited members can see and join</p>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-6">
            <UButton variant="ghost" color="neutral" @click="showCreateChannel = false">
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="creatingChannel"
              :disabled="!newChannelName.trim()"
              @click="handleCreateChannel"
            >
              Create Channel
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- New Message Modal (DM / Group DM) -->
    <UModal v-model:open="showNewDM" title="New Message" description="Start a conversation with a team member">
      <template #content>
        <ChatNewMessage
          @close="showNewDM = false"
          @created="handleNewMessageCreated"
        />
      </template>
    </UModal>

    <!-- Browse Channels Modal -->
    <UModal v-model:open="showBrowseChannels" title="Browse Channels" description="Discover and join channels">
      <template #content>
        <ChatBrowseChannels
          @close="showBrowseChannels = false"
          @joined="handleChannelJoined"
        />
      </template>
    </UModal>

    <!-- Members Slideover -->
    <USlideover v-model:open="showMembers">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-4">Channel Members</h3>

          <div v-if="channelDetails?.members" class="space-y-2">
            <div
              v-for="member in channelDetails.members"
              :key="member.user_id"
              class="flex items-center gap-3 px-2 py-2"
            >
              <div class="relative">
                <UAvatar :src="member.avatar_url" :alt="member.name" size="sm" />
                <span
                  :class="[
                    'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-elevated',
                    wsComposable?.activeUsers.value?.find((u: any) => u.userId === member.user_id) ? 'bg-green-500' :
                    userStatuses.get(member.user_id) === 'away' ? 'bg-amber-500' :
                    userStatuses.get(member.user_id) === 'dnd' ? 'bg-red-500' : 'bg-gray-400'
                  ]"
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ member.name }}</div>
                <div class="text-xs text-muted capitalize">{{ member.role }}</div>
              </div>
            </div>
          </div>
          <div v-else class="text-center text-sm text-muted py-4">
            Loading members...
          </div>
        </div>
      </template>
    </USlideover>

    <!-- Channel Settings Modal -->
    <UModal v-model:open="showSettings" title="Channel Settings" description="Manage channel configuration">
      <template #content>
        <ChatChannelSettings
          v-if="activeChannel"
          :channel="activeChannel"
          @close="showSettings = false"
          @updated="handleChannelUpdated"
          @left="handleChannelLeft"
          @archived="handleChannelArchived"
        />
      </template>
    </UModal>

    <!-- Delete confirmation Modal -->
    <UModal v-model:open="isDeleteModalOpen" title="Delete Message" description="Confirm message deletion">
      <template #content>
        <div class="p-6">
          <p class="text-sm text-muted mb-4">
            Are you sure you want to delete this message? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="showDeleteConfirm = null">
              Cancel
            </UButton>
            <UButton color="error" @click="handleDelete">
              Delete
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Channel Switcher (Cmd+K) -->
    <UModal v-model:open="showChannelSwitcher" title="Switch Channel" description="Quick channel switcher">
      <template #content>
        <ChatChannelSwitcher
          :channels="channels"
          :active-channel-id="activeChannel?.id"
          @select="(ch: ChatChannel) => { handleSelectChannel(ch); showChannelSwitcher = false }"
          @close="showChannelSwitcher = false"
        />
      </template>
    </UModal>

    <!-- Forward Message Modal -->
    <UModal :open="!!forwardingMessage" title="Forward Message" description="Forward to another channel" @update:open="(v: boolean) => { if (!v) forwardingMessage = null }">
      <template #content>
        <ChatForwardModal
          v-if="forwardingMessage"
          :message="forwardingMessage"
          :channels="channels"
          @forward="handleForwarded"
          @close="forwardingMessage = null"
        />
      </template>
    </UModal>
  </div>
</template>
