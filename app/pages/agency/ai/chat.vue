<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { AiConversation } from '~/types'

definePageMeta({ layout: 'agency' })

const toast = useToast()
const { conversations, activeConversation, messages, loading, sending, fetchConversations, createConversation, loadConversation, sendMessage, archiveConversation, submitFeedback } = useAiChat()

const feedbackMessageId = ref<string | null>(null)
const feedbackCorrection = ref('')

function handleFeedback(messageId: string, rating: -1 | 1) {
  if (rating === 1) {
    submitFeedback(messageId, 1)
    toast.add({ title: 'Thanks for your feedback!', color: 'success' })
  } else {
    feedbackMessageId.value = messageId
    feedbackCorrection.value = ''
  }
}

function submitCorrectionFeedback() {
  if (feedbackMessageId.value) {
    submitFeedback(feedbackMessageId.value, -1, feedbackCorrection.value || undefined)
    feedbackMessageId.value = null
    feedbackCorrection.value = ''
    toast.add({ title: 'Feedback submitted', color: 'success' })
  }
}

const messageInput = ref('')
const searchFilter = ref('')
const sidebarOpen = ref(true)
const messagesContainer = ref<HTMLElement | null>(null)

// Fetch conversations on mount
await fetchConversations()

// Filtered conversations
const filteredConversations = computed(() => {
  if (!searchFilter.value) return conversations.value
  const q = searchFilter.value.toLowerCase()
  return conversations.value.filter(c =>
    (c.title || 'New conversation').toLowerCase().includes(q)
  )
})

// Scroll to bottom of messages
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(messages, () => scrollToBottom(), { deep: true })

// Create new chat
async function handleNewChat() {
  try {
    await createConversation()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to create conversation', color: 'error' })
  }
}

// Select conversation
async function selectConversation(conv: AiConversation) {
  if (activeConversation.value?.id === conv.id) return
  await loadConversation(conv.id)
  // Collapse sidebar on mobile
  if (window.innerWidth < 768) {
    sidebarOpen.value = false
  }
}

// Send message
async function handleSend() {
  const content = messageInput.value.trim()
  if (!content || sending.value) return

  // If no active conversation, create one first
  if (!activeConversation.value) {
    try {
      await createConversation()
    } catch {
      toast.add({ title: 'Error', description: 'Failed to create conversation', color: 'error' })
      return
    }
  }

  messageInput.value = ''

  try {
    await sendMessage(content)
  } catch {
    toast.add({ title: 'Error', description: 'Failed to send message', color: 'error' })
  }
}

// Handle Enter key (send on Enter, newline on Shift+Enter)
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// Delete conversation
async function handleDelete(conv: AiConversation) {
  try {
    await archiveConversation(conv.id)
    toast.add({ title: 'Conversation deleted', color: 'success' })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete conversation', color: 'error' })
  }
}

// Format relative time
function relativeTime(date: string | null) {
  if (!date) return ''
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}
</script>

<template>
  <div class="flex h-[calc(100vh-3.5rem)] overflow-hidden">
    <!-- Sidebar: Conversation List -->
    <div
      :class="[
        'flex flex-col border-r border-default bg-elevated/50 transition-all duration-200',
        sidebarOpen ? 'w-72 min-w-72' : 'w-0 min-w-0 overflow-hidden',
        'md:w-72 md:min-w-72 md:overflow-visible'
      ]"
    >
      <!-- Sidebar Header -->
      <div class="flex items-center gap-2 p-3 border-b border-default">
        <UButton
          icon="i-lucide-plus"
          color="primary"
          variant="soft"
          size="sm"
          class="flex-1"
          @click="handleNewChat"
        >
          New Chat
        </UButton>
      </div>

      <!-- Search -->
      <div class="px-3 py-2">
        <UInput
          v-model="searchFilter"
          placeholder="Search conversations..."
          icon="i-lucide-search"
          size="sm"
        />
      </div>

      <!-- Conversation List -->
      <div class="flex-1 overflow-y-auto">
        <div v-if="loading && conversations.length === 0" class="p-4 text-center text-muted text-sm">
          Loading conversations...
        </div>
        <div v-else-if="filteredConversations.length === 0" class="p-4 text-center text-muted text-sm">
          {{ searchFilter ? 'No matching conversations' : 'No conversations yet' }}
        </div>
        <div v-else>
          <button
            v-for="conv in filteredConversations"
            :key="conv.id"
            :class="[
              'w-full text-left px-3 py-2.5 border-b border-default hover:bg-elevated/80 transition-colors group',
              activeConversation?.id === conv.id ? 'bg-elevated' : ''
            ]"
            @click="selectConversation(conv)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium truncate">
                  {{ conv.title || 'New conversation' }}
                </div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-xs text-muted">
                    {{ relativeTime(conv.lastMessageAt || conv.createdAt) }}
                  </span>
                  <UBadge
                    v-if="conv.messageCount > 0"
                    :label="String(conv.messageCount)"
                    size="xs"
                    color="neutral"
                    variant="subtle"
                  />
                </div>
              </div>
              <UButton
                icon="i-lucide-trash-2"
                variant="ghost"
                color="neutral"
                size="xs"
                class="opacity-0 group-hover:opacity-100 shrink-0"
                @click.stop="handleDelete(conv)"
              />
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Main Chat Area -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Toggle sidebar on mobile -->
      <div class="flex items-center gap-2 px-4 py-2 border-b border-default md:hidden">
        <UButton
          :icon="sidebarOpen ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
          variant="ghost"
          color="neutral"
          size="sm"
          @click="sidebarOpen = !sidebarOpen"
        />
        <span class="text-sm font-medium truncate">
          {{ activeConversation?.title || 'AI Chat' }}
        </span>
      </div>

      <!-- Chat Header (desktop) -->
      <div class="hidden md:flex items-center gap-3 px-4 py-3 border-b border-default">
        <UIcon name="i-lucide-sparkles" class="text-primary w-5 h-5" />
        <div class="flex-1 min-w-0">
          <h2 class="text-sm font-semibold truncate">
            {{ activeConversation?.title || 'AI Chat' }}
          </h2>
          <p v-if="activeConversation" class="text-xs text-muted">
            {{ activeConversation.messageCount }} messages
          </p>
        </div>
      </div>

      <!-- Messages -->
      <div
        ref="messagesContainer"
        class="flex-1 overflow-y-auto px-4 py-4"
      >
        <!-- Empty state -->
        <div
          v-if="!activeConversation || messages.length === 0"
          class="flex flex-col items-center justify-center h-full text-center"
        >
          <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <UIcon name="i-lucide-sparkles" class="w-8 h-8 text-primary" />
          </div>
          <h3 class="text-lg font-semibold mb-1">XeroFlow AI Assistant</h3>
          <p class="text-muted text-sm max-w-md mb-6">
            Ask me about your tasks, clients, boards, budgets, or anything about your agency operations.
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
            <button
              class="text-left px-3 py-2 rounded-lg border border-default hover:bg-elevated/80 transition-colors text-sm"
              @click="messageInput = 'What tasks are assigned to me?'"
            >
              <span class="font-medium">My tasks</span>
              <p class="text-xs text-muted mt-0.5">See what's on your plate</p>
            </button>
            <button
              class="text-left px-3 py-2 rounded-lg border border-default hover:bg-elevated/80 transition-colors text-sm"
              @click="messageInput = 'Show me overdue items across all boards'"
            >
              <span class="font-medium">Overdue items</span>
              <p class="text-xs text-muted mt-0.5">Find what needs attention</p>
            </button>
            <button
              class="text-left px-3 py-2 rounded-lg border border-default hover:bg-elevated/80 transition-colors text-sm"
              @click="messageInput = 'How is our ad spend looking this month?'"
            >
              <span class="font-medium">Ad spend summary</span>
              <p class="text-xs text-muted mt-0.5">Check budget pacing</p>
            </button>
            <button
              class="text-left px-3 py-2 rounded-lg border border-default hover:bg-elevated/80 transition-colors text-sm"
              @click="messageInput = 'Give me a status update on all active clients'"
            >
              <span class="font-medium">Client status</span>
              <p class="text-xs text-muted mt-0.5">Overview of active clients</p>
            </button>
          </div>
        </div>

        <!-- Message Thread -->
        <div v-else class="max-w-3xl mx-auto space-y-4">
          <div
            v-for="msg in messages"
            :key="msg.id"
            :class="[
              'flex',
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            ]"
          >
            <div
              :class="[
                'max-w-[85%] rounded-xl px-4 py-2.5',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-elevated border border-default',
                msg.isError ? 'border-red-500/50' : ''
              ]"
            >
              <!-- Message content -->
              <div
                v-if="msg.role === 'assistant'"
                class="prose prose-sm dark:prose-invert max-w-none"
                v-html="renderMarkdown(msg.content)"
              />
              <div v-else class="text-sm whitespace-pre-wrap">
                {{ msg.content }}
              </div>

              <!-- Context sources (assistant messages only) -->
              <div
                v-if="msg.role === 'assistant' && msg.contextSources && msg.contextSources.length > 0"
                class="flex flex-wrap gap-1 mt-2 pt-2 border-t border-default/50"
              >
                <NuxtLink
                  v-for="source in msg.contextSources"
                  :key="`${source.type}-${source.id}`"
                  :to="source.url"
                >
                  <UBadge
                    :label="source.title"
                    size="xs"
                    color="neutral"
                    variant="subtle"
                    class="cursor-pointer hover:bg-elevated"
                  />
                </NuxtLink>
              </div>

              <!-- Timestamp + Feedback -->
              <div
                :class="[
                  'flex items-center gap-2 text-[10px] mt-1',
                  msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted'
                ]"
              >
                <span>
                  {{ new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                  <span v-if="msg.latencyMs && msg.role === 'assistant'" class="ml-1">
                    ({{ (msg.latencyMs / 1000).toFixed(1) }}s)
                  </span>
                </span>
                <template v-if="msg.role === 'assistant' && !msg.id.startsWith('temp-')">
                  <UButton
                    icon="i-lucide-thumbs-up"
                    size="xs"
                    variant="ghost"
                    :color="msg.feedback?.rating === 1 ? 'success' : 'neutral'"
                    @click="handleFeedback(msg.id, 1)"
                  />
                  <UButton
                    icon="i-lucide-thumbs-down"
                    size="xs"
                    variant="ghost"
                    :color="msg.feedback?.rating === -1 ? 'error' : 'neutral'"
                    @click="handleFeedback(msg.id, -1)"
                  />
                </template>
              </div>
            </div>
          </div>

          <!-- Typing indicator -->
          <div v-if="sending" class="flex justify-start">
            <div class="bg-elevated border border-default rounded-xl px-4 py-3">
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-muted animate-pulse" />
                <span class="w-2 h-2 rounded-full bg-muted animate-pulse [animation-delay:200ms]" />
                <span class="w-2 h-2 rounded-full bg-muted animate-pulse [animation-delay:400ms]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Input Bar -->
      <div class="border-t border-default px-4 py-3">
        <div class="max-w-3xl mx-auto flex items-end gap-2">
          <UTextarea
            v-model="messageInput"
            placeholder="Ask about your tasks, clients, boards..."
            :rows="1"
            autoresize
            :maxrows="4"
            class="flex-1"
            :disabled="sending"
            @keydown="handleKeydown"
          />
          <UButton
            icon="i-lucide-send"
            color="primary"
            size="md"
            :loading="sending"
            :disabled="!messageInput.trim() || sending"
            @click="handleSend"
          />
        </div>
        <p class="max-w-3xl mx-auto text-[10px] text-muted mt-1.5 px-1">
          AI responses are generated using agency data. Always verify critical information.
        </p>
      </div>
    </div>

    <!-- Feedback correction modal -->
    <UModal v-model:open="feedbackMessageId">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-3">How should I have responded?</h3>
          <p class="text-sm text-muted mb-3">Your correction helps improve future responses.</p>
          <UTextarea
            v-model="feedbackCorrection"
            placeholder="What should the correct answer have been?"
            :rows="4"
            class="mb-4"
          />
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="feedbackMessageId = null">
              Skip
            </UButton>
            <UButton color="primary" @click="submitCorrectionFeedback">
              Submit Feedback
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script lang="ts">
// Simple markdown renderer (lightweight, no external deps)
function renderMarkdown(text: string): string {
  if (!text) return ''

  let html = text
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="bg-default/50 rounded-md p-3 overflow-x-auto text-xs"><code>${code.trim()}</code></pre>`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-default/50 px-1 rounded text-xs">$1</code>')

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h4 class="font-semibold text-sm mt-3 mb-1">$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3 class="font-semibold mt-3 mb-1">$1</h3>')
  html = html.replace(/^# (.+)$/gm, '<h2 class="font-bold text-lg mt-3 mb-1">$1</h2>')

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
  html = html.replace(/(<li.*<\/li>\n?)+/g, (match) => `<ul class="my-1">${match}</ul>`)

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary underline">$1</a>')

  // Line breaks (double newline = paragraph)
  html = html.replace(/\n\n/g, '</p><p class="my-2">')
  html = html.replace(/\n/g, '<br>')

  return `<p class="my-1">${html}</p>`
}
</script>
