<script setup lang="ts">
import type { CodeContext } from '~/composables/useCodeAssistant'

const props = defineProps<{
  context: CodeContext
  instanceId: string
}>()

const emit = defineEmits<{
  apply: [language: string, code: string]
}>()

const {
  conversations, activeConversationId, messages, sending,
  send, newConversation, switchConversation, deleteConversation, clearCurrentChat,
} = useCodeAssistant(props.instanceId)

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const showHistory = ref(false)

const quickActions = [
  { label: 'Add animation', action: 'animate', prompt: 'Add a smooth entrance animation to the banner content using CSS keyframes' },
  { label: 'Add hover effect', action: 'modify', prompt: 'Add an interactive hover effect to the main CTA button or banner container' },
  { label: 'Optimize code', action: 'optimize', prompt: 'Optimize the banner code for smaller file size and better performance' },
  { label: 'Fix bugs', action: 'fix', prompt: 'Review the code for bugs, missing elements, or broken styles and fix them' },
  { label: 'Explain code', action: 'explain', prompt: 'Explain what the current banner code does, section by section' },
  { label: 'Make responsive', action: 'modify', prompt: 'Make the banner scale responsively to fit different container sizes while maintaining aspect ratio' },
]

async function handleSend() {
  if (!inputText.value.trim() || sending.value) return
  const text = inputText.value
  inputText.value = ''
  await send(text, props.context)
  scrollToBottom()
}

async function handleQuickAction(qa: typeof quickActions[0]) {
  await send(qa.prompt, props.context, qa.action)
  scrollToBottom()
}

function handleApply(language: string, code: string) {
  emit('apply', language, code)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function handleNewChat() {
  newConversation()
  showHistory.value = false
}

function handleSwitchConversation(id: string) {
  switchConversation(id)
  showHistory.value = false
  scrollToBottom()
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString()
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// Auto-scroll on new messages
watch(() => messages.value.length, () => scrollToBottom())
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-default shrink-0">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-sparkles" class="text-primary" />
        <h3 class="text-sm font-semibold">AI Assistant</h3>
      </div>
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-clock"
          variant="ghost"
          size="xs"
          :color="showHistory ? 'primary' : 'neutral'"
          @click="showHistory = !showHistory"
        />
        <UButton
          icon="i-lucide-plus"
          variant="ghost"
          size="xs"
          @click="handleNewChat"
        />
        <UButton
          v-if="messages.length > 0"
          icon="i-lucide-trash-2"
          variant="ghost"
          size="xs"
          @click="clearCurrentChat"
        />
      </div>
    </div>

    <!-- History sidebar (slides over messages) -->
    <div v-if="showHistory" class="flex-1 overflow-y-auto border-b border-default">
      <div class="p-2">
        <p class="text-xs text-muted uppercase tracking-wide font-medium px-2 mb-2">Conversations</p>
        <div v-if="conversations.length === 0" class="px-2 py-4 text-center text-sm text-muted">
          No conversations yet
        </div>
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-elevated transition-colors"
          :class="conv.id === activeConversationId ? 'bg-elevated' : ''"
          @click="handleSwitchConversation(conv.id)"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm truncate" :class="conv.id === activeConversationId ? 'font-medium' : ''">
              {{ conv.title }}
            </p>
            <p class="text-[11px] text-muted">
              {{ conv.messages.length }} messages · {{ formatTime(conv.updatedAt) }}
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            class="opacity-0 group-hover:opacity-100 shrink-0"
            @click.stop="deleteConversation(conv.id)"
          />
        </div>
      </div>
    </div>

    <!-- Messages area -->
    <div
      v-if="!showHistory"
      ref="messagesContainer"
      class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3"
    >
      <!-- Empty state with quick actions -->
      <div v-if="messages.length === 0" class="flex flex-col items-center justify-center h-full gap-4">
        <div class="text-center">
          <UIcon name="i-lucide-sparkles" class="text-3xl text-muted mb-2" />
          <p class="text-sm text-muted">Ask AI to write, modify, or explain your banner code</p>
        </div>
        <div class="flex flex-wrap gap-2 justify-center max-w-[320px]">
          <UButton
            v-for="qa in quickActions"
            :key="qa.label"
            :label="qa.label"
            variant="outline"
            size="xs"
            :loading="sending"
            @click="handleQuickAction(qa)"
          />
        </div>
      </div>

      <!-- Message list -->
      <template v-else>
        <BannerCodeAssistMessage
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
          @apply="handleApply"
        />

        <!-- Typing indicator -->
        <div v-if="sending" class="flex items-center gap-2 text-muted text-sm">
          <UIcon name="i-lucide-loader-2" class="animate-spin" />
          <span>Thinking...</span>
        </div>
      </template>
    </div>

    <!-- Input pod — Claude/ChatGPT style -->
    <div class="shrink-0 p-3 pt-0">
      <!-- Quick actions row (when chat has messages) -->
      <div v-if="messages.length > 0 && !showHistory" class="flex flex-wrap gap-1 mb-2">
        <UButton
          v-for="qa in quickActions"
          :key="qa.label"
          :label="qa.label"
          variant="ghost"
          size="xs"
          class="text-[11px]"
          :disabled="sending"
          @click="handleQuickAction(qa)"
        />
      </div>

      <div class="relative rounded-xl border border-default bg-elevated focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all">
        <textarea
          v-model="inputText"
          placeholder="Ask AI about your banner code..."
          rows="3"
          class="block w-full resize-none bg-transparent text-sm px-4 pt-3 pb-10 outline-none placeholder:text-muted/60"
          :disabled="sending"
          @keydown="handleKeydown"
        />
        <div class="absolute bottom-2 right-2 flex items-center gap-2">
          <span class="text-[10px] text-muted/40 select-none">
            Enter to send · Shift+Enter for newline
          </span>
          <UButton
            icon="i-lucide-arrow-up"
            color="primary"
            size="xs"
            :loading="sending"
            :disabled="!inputText.trim()"
            class="rounded-lg"
            @click="handleSend"
          />
        </div>
      </div>
    </div>
  </div>
</template>
