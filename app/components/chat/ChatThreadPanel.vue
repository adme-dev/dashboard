<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { ChatMessage } from '~/types'

const props = defineProps<{
  parentMessage: ChatMessage
  channelId: string
  currentUserId: string
}>()

const emit = defineEmits<{
  'close': []
  'reaction': [messageId: number, emoji: string]
  'edit': [messageId: number, content: string]
  'delete': [messageId: number]
}>()

const { fetchThreadMessages } = useChat()

const replies = ref<ChatMessage[]>([])
const loading = ref(true)
const replyContent = ref('')
const sending = ref(false)
const editingReply = ref<{ id: number; content: string } | null>(null)
const showDeleteConfirm = ref<number | null>(null)
const emojiPickerReplyId = ref<number | null>(null)

// Quick emojis
const quickEmojis = ['👍', '❤️', '😂', '🎉', '👀', '🙏']

// Load thread messages
onMounted(async () => {
  try {
    replies.value = await fetchThreadMessages(props.channelId, props.parentMessage.id)
  } catch {
    // Silent fail
  } finally {
    loading.value = false
  }
})

// Send reply (via WS if connected, or emit to parent for handling)
function handleSendReply() {
  const text = replyContent.value.trim()
  if (!text || sending.value) return
  sending.value = true

  const event = new CustomEvent('chat-thread-reply', {
    detail: {
      channelId: props.channelId,
      threadParentId: props.parentMessage.id,
      content: text
    }
  })
  window.dispatchEvent(event)
  replyContent.value = ''
  sending.value = false
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (editingReply.value) {
      handleSaveEdit()
    } else {
      handleSendReply()
    }
  }
  if (e.key === 'Escape' && editingReply.value) {
    editingReply.value = null
  }
}

// Edit
function startEdit(reply: ChatMessage) {
  editingReply.value = { id: reply.id, content: reply.content }
  replyContent.value = reply.content
}

function handleSaveEdit() {
  if (!editingReply.value) return
  const text = replyContent.value.trim()
  if (!text) return
  emit('edit', editingReply.value.id, text)
  editingReply.value = null
  replyContent.value = ''
}

function cancelEdit() {
  editingReply.value = null
  replyContent.value = ''
}

// Delete
function confirmDelete(messageId: number) {
  showDeleteConfirm.value = messageId
}

function handleDelete() {
  if (showDeleteConfirm.value) {
    emit('delete', showDeleteConfirm.value)
    replies.value = replies.value.filter(r => r.id !== showDeleteConfirm.value)
    showDeleteConfirm.value = null
  }
}

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Listen for new thread messages added from WS
function addReply(msg: ChatMessage) {
  if (msg.thread_parent_id === props.parentMessage.id) {
    if (!replies.value.find(r => r.id === msg.id)) {
      replies.value.push(msg)
    }
  }
}

// Apply edit from WS
function applyEdit(messageId: number, content: string, editedAt: string) {
  const reply = replies.value.find(r => r.id === messageId)
  if (reply) {
    reply.content = content
    reply.edited_at = editedAt
  }
}

// Apply delete from WS
function applyDelete(messageId: number) {
  replies.value = replies.value.filter(r => r.id !== messageId)
}

// Apply reaction from WS
function applyReaction(messageId: number, reactions: Array<{ emoji: string; user_ids: string[]; count: number }>) {
  const reply = replies.value.find(r => r.id === messageId)
  if (reply) {
    reply.reactions = reactions
  }
}

defineExpose({ addReply, applyEdit, applyDelete, applyReaction })
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 py-3 border-b border-default">
      <UIcon name="i-lucide-message-square" class="w-4.5 h-4.5 text-primary" />
      <h3 class="text-sm font-semibold flex-1">Thread</h3>
      <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="emit('close')" />
    </div>

    <!-- Parent message -->
    <div class="px-4 py-3 border-b border-default bg-elevated/25">
      <div class="flex items-center gap-2 mb-1">
        <UAvatar :src="parentMessage.user_avatar" :alt="parentMessage.user_name" size="xs" />
        <span class="text-sm font-semibold">{{ parentMessage.user_name }}</span>
        <span class="text-[11px] text-muted">{{ formatTime(parentMessage.created_at) }}</span>
      </div>
      <ChatMarkdown :content="parentMessage.content" />
      <ChatAttachment v-if="parentMessage.metadata?.attachments?.length" :attachments="parentMessage.metadata.attachments" />

      <!-- Parent reactions -->
      <div v-if="parentMessage.reactions && parentMessage.reactions.length > 0" class="flex flex-wrap gap-1 mt-1.5">
        <button
          v-for="reaction in parentMessage.reactions"
          :key="reaction.emoji"
          :class="[
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border',
            reaction.user_ids.includes(currentUserId)
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-default bg-elevated/50 hover:bg-elevated'
          ]"
          @click="emit('reaction', parentMessage.id, reaction.emoji)"
        >
          <span>{{ reaction.emoji }}</span>
          <span class="font-medium">{{ reaction.count }}</span>
        </button>
      </div>
    </div>

    <!-- Replies count -->
    <div class="px-4 py-2 text-xs text-muted border-b border-default">
      {{ replies.length }} {{ replies.length === 1 ? 'reply' : 'replies' }}
    </div>

    <!-- Thread replies -->
    <div class="flex-1 overflow-y-auto px-4 py-2">
      <div v-if="loading" class="flex justify-center py-4">
        <XfLoader size="sm" />
      </div>

      <div v-else-if="replies.length === 0" class="text-center text-sm text-muted py-4">
        No replies yet. Start the thread!
      </div>

      <div v-else class="space-y-1">
        <div v-for="reply in replies" :key="reply.id" class="flex gap-2.5 group relative py-1 -mx-1 px-1 rounded-md hover:bg-elevated/50">
          <UAvatar :src="reply.user_avatar" :alt="reply.user_name" size="xs" class="shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 mb-0.5">
              <span class="text-sm font-semibold">{{ reply.user_name }}</span>
              <span class="text-[11px] text-muted">{{ formatTime(reply.created_at) }}</span>
              <UBadge v-if="reply.edited_at" label="edited" size="xs" color="neutral" variant="subtle" />
            </div>
            <ChatMarkdown :content="reply.content" />
            <ChatAttachment v-if="reply.metadata?.attachments?.length" :attachments="reply.metadata.attachments" />

            <!-- Reply reactions -->
            <div v-if="reply.reactions && reply.reactions.length > 0" class="flex flex-wrap gap-1 mt-1">
              <button
                v-for="reaction in reply.reactions"
                :key="reaction.emoji"
                :class="[
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border',
                  reaction.user_ids.includes(currentUserId)
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-default bg-elevated/50 hover:bg-elevated'
                ]"
                @click="emit('reaction', reply.id, reaction.emoji)"
              >
                <span>{{ reaction.emoji }}</span>
                <span class="font-medium">{{ reaction.count }}</span>
              </button>
            </div>
          </div>

          <!-- Hover actions -->
          <div class="absolute top-0 right-0 -mt-2 hidden group-hover:flex items-center gap-0.5 bg-elevated border border-default rounded-md shadow-sm px-0.5 py-0.5">
            <button
              v-for="emoji in quickEmojis.slice(0, 3)"
              :key="emoji"
              class="w-5 h-5 flex items-center justify-center rounded hover:bg-default/50 text-xs"
              @click="emit('reaction', reply.id, emoji)"
            >
              {{ emoji }}
            </button>

            <!-- Emoji picker -->
            <UPopover :open="emojiPickerReplyId === reply.id" @update:open="v => { if (!v) emojiPickerReplyId = null }">
              <UButton
                icon="i-lucide-smile-plus"
                variant="ghost"
                color="neutral"
                size="xs"
                @click="emojiPickerReplyId = reply.id"
              />
              <template #content>
                <ChatEmojiPicker @select="(emoji: string) => { emit('reaction', reply.id, emoji); emojiPickerReplyId = null }" />
              </template>
            </UPopover>

            <!-- Edit (own messages) -->
            <UTooltip v-if="reply.user_id === currentUserId" text="Edit">
              <UButton
                icon="i-lucide-pencil"
                variant="ghost"
                color="neutral"
                size="xs"
                @click="startEdit(reply)"
              />
            </UTooltip>

            <!-- Delete (own messages) -->
            <UTooltip v-if="reply.user_id === currentUserId" text="Delete">
              <UButton
                icon="i-lucide-trash-2"
                variant="ghost"
                color="neutral"
                size="xs"
                @click="confirmDelete(reply.id)"
              />
            </UTooltip>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit mode banner -->
    <div v-if="editingReply" class="flex items-center gap-2 px-4 py-2 border-t border-default bg-primary/5">
      <UIcon name="i-lucide-pencil" class="w-3.5 h-3.5 text-primary" />
      <span class="text-xs text-primary font-medium flex-1">Editing reply</span>
      <UButton label="Cancel" variant="link" color="neutral" size="xs" @click="cancelEdit" />
    </div>

    <!-- Reply input -->
    <div class="border-t border-default px-4 py-3">
      <div class="flex items-end gap-2">
        <UTextarea
          v-model="replyContent"
          :placeholder="editingReply ? 'Edit your reply...' : 'Reply in thread...'"
          :rows="1"
          autoresize
          :maxrows="4"
          class="flex-1"
          @keydown="handleKeydown"
        />
        <UButton
          :icon="editingReply ? 'i-lucide-check' : 'i-lucide-send'"
          :color="editingReply ? 'success' : 'primary'"
          size="md"
          :disabled="!replyContent.trim() || sending"
          @click="editingReply ? handleSaveEdit() : handleSendReply()"
        />
      </div>
    </div>

    <!-- Delete confirmation -->
    <UModal :open="showDeleteConfirm !== null" title="Delete Reply" description="Confirm reply deletion" @update:open="v => { if (!v) showDeleteConfirm = null }">
      <template #content>
        <div class="p-6">
          <p class="text-sm text-muted mb-4">
            Are you sure you want to delete this reply? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="showDeleteConfirm = null">Cancel</UButton>
            <UButton color="error" @click="handleDelete">Delete</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
