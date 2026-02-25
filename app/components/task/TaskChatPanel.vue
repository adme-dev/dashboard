<script setup lang="ts">
import type { ChatMessage } from '~/types'

const props = defineProps<{
  taskId: string
}>()

const { user } = useAuth()
const toast = useToast()

const channelId = ref<string | null>(null)
const channelName = ref('')
const messages = ref<ChatMessage[]>([])
const loading = ref(true)
const creating = ref(false)
const sending = ref(false)
const newMessage = ref('')
const hasChannel = ref(false)
const memberCount = ref(0)
const messageCount = ref(0)
const scrollRef = ref<HTMLElement | null>(null)

// Fetch linked channel for this task
async function fetchTaskChannel() {
  loading.value = true
  try {
    const data = await $fetch<any>(`/api/chat/channels/by-task/${props.taskId}`)
    if (data) {
      channelId.value = data.id
      channelName.value = data.name
      memberCount.value = data.member_count || 0
      messageCount.value = data.message_count || 0
      hasChannel.value = true
      await fetchMessages()
    } else {
      hasChannel.value = false
    }
  } catch {
    hasChannel.value = false
  } finally {
    loading.value = false
  }
}

// Create a chat channel for this task
async function createTaskChannel() {
  creating.value = true
  try {
    const data = await $fetch<any>(`/api/chat/channels/by-task/${props.taskId}`, {
      method: 'POST'
    })
    channelId.value = data.id
    channelName.value = data.name
    hasChannel.value = true
    memberCount.value = 1
    toast.add({ title: 'Chat channel created', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to create chat channel', color: 'error' })
  } finally {
    creating.value = false
  }
}

// Fetch messages for the channel
async function fetchMessages() {
  if (!channelId.value) return
  try {
    const data = await $fetch<ChatMessage[]>(
      `/api/chat/channels/${channelId.value}/messages`,
      { params: { limit: '50' } }
    )
    messages.value = data
    await nextTick()
    scrollToBottom()
  } catch {
    // Silent
  }
}

// Send a message
async function handleSend() {
  if (!channelId.value || !newMessage.value.trim()) return
  const content = newMessage.value.trim()
  newMessage.value = ''
  sending.value = true
  try {
    // Post message via REST (not WS — simpler for embedded mini-chat)
    const msg = await $fetch<ChatMessage>(
      `/api/chat/channels/${channelId.value}/messages`,
      {
        method: 'POST',
        body: { content }
      }
    )
    messages.value.push(msg)
    messageCount.value++
    await nextTick()
    scrollToBottom()
  } catch {
    toast.add({ title: 'Failed to send message', color: 'error' })
    newMessage.value = content // Restore on failure
  } finally {
    sending.value = false
  }
}

function scrollToBottom() {
  if (scrollRef.value) {
    scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  }
}

function openInChat() {
  if (channelId.value) {
    navigateTo(`/agency/chat?channel=${channelId.value}`)
  }
}

function formatTime(date: string) {
  try {
    const d = new Date(date)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function isSystemMessage(msg: ChatMessage): boolean {
  return !!(msg.metadata as any)?.system
}

// Watch for task changes
watch(() => props.taskId, () => {
  channelId.value = null
  messages.value = []
  hasChannel.value = false
  fetchTaskChannel()
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Loading -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="text-sm text-muted">Loading chat...</div>
    </div>

    <!-- No channel yet -->
    <div v-else-if="!hasChannel" class="flex-1 flex items-center justify-center">
      <div class="text-center px-6">
        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <UIcon name="i-lucide-message-circle" class="w-6 h-6 text-primary" />
        </div>
        <h4 class="font-medium mb-1">Start a conversation</h4>
        <p class="text-sm text-muted mb-4">
          Create a chat channel for this task to discuss with your team.
        </p>
        <UButton
          label="Create Chat Channel"
          icon="i-lucide-plus"
          color="primary"
          :loading="creating"
          @click="createTaskChannel"
        />
      </div>
    </div>

    <!-- Chat -->
    <template v-else>
      <!-- Mini header -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-default">
        <UIcon name="i-lucide-hash" class="w-4 h-4 text-muted" />
        <span class="text-sm font-medium flex-1 truncate">{{ channelName }}</span>
        <span class="text-xs text-muted">{{ memberCount }} member{{ memberCount !== 1 ? 's' : '' }}</span>
        <UButton
          icon="i-lucide-external-link"
          variant="ghost"
          color="neutral"
          size="xs"
          title="Open in Chat"
          @click="openInChat"
        />
      </div>

      <!-- Messages -->
      <div ref="scrollRef" class="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        <div v-if="messages.length === 0" class="text-center text-sm text-muted py-8">
          No messages yet. Start the conversation!
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="[
            'flex gap-2',
            isSystemMessage(msg) ? 'justify-center' : ''
          ]"
        >
          <!-- System message (board event) -->
          <div v-if="isSystemMessage(msg)" class="text-xs text-muted italic px-2 py-1">
            {{ msg.content }}
          </div>

          <!-- Regular message -->
          <template v-else>
            <UAvatar
              :src="msg.user_avatar"
              :alt="msg.user_name"
              size="xs"
              class="mt-0.5 shrink-0"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="text-xs font-medium">{{ msg.user_name }}</span>
                <span class="text-[10px] text-muted">{{ formatTime(msg.created_at) }}</span>
              </div>
              <p class="text-sm whitespace-pre-wrap break-words">{{ msg.content }}</p>
            </div>
          </template>
        </div>
      </div>

      <!-- Input -->
      <div class="border-t border-default p-2">
        <form class="flex gap-2" @submit.prevent="handleSend">
          <UInput
            v-model="newMessage"
            placeholder="Type a message..."
            size="sm"
            class="flex-1"
            :disabled="sending"
            @keydown.enter.exact.prevent="handleSend"
          />
          <UButton
            type="submit"
            icon="i-lucide-send"
            color="primary"
            size="sm"
            :loading="sending"
            :disabled="!newMessage.trim()"
          />
        </form>
      </div>
    </template>
  </div>
</template>
