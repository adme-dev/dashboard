<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { user } = useAuth()

const isOpen = ref(false)
const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const {
  activeConversation,
  messages,
  sending,
  createConversation,
  sendMessage,
  submitFeedback,
} = useAiChat()

// Get the last N messages for the compact view
const visibleMessages = computed(() => messages.value.slice(-10))

function toggle() {
  isOpen.value = !isOpen.value
}

function close() {
  isOpen.value = false
}

function openFullChat() {
  close()
  const convId = activeConversation.value?.id
  router.push(convId ? `/agency/ai/chat?conversation=${convId}` : '/agency/ai/chat')
}

async function ensureConversation() {
  if (!activeConversation.value) {
    await createConversation()
  }
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || sending.value) return

  inputText.value = ''

  try {
    await ensureConversation()
    await sendMessage(text)
    scrollToBottom()
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err?.data?.statusMessage || 'Failed to send message',
      color: 'error',
    })
  }
}

async function handleQuickAction(label: string) {
  // Build context from current route
  const context: Record<string, string> = { pageRoute: route.path }

  // Extract board ID if on a board page
  const boardMatch = route.path.match(/\/boards\/([^/]+)/)
  if (boardMatch) {
    context.boardId = boardMatch[1]
  }

  try {
    await ensureConversation()

    // Use the quick-action API
    const result = await $fetch<any>('/api/agency/ai/chat/quick-action', {
      method: 'POST',
      body: { action: label, context },
    })

    // Add messages from the result
    if (result.userMessage) {
      messages.value.push(result.userMessage)
    }
    if (result.message) {
      messages.value.push(result.message)
    }

    scrollToBottom()
  } catch {
    // Fallback: just send the label as a regular message
    inputText.value = label
    await handleSend()
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

async function handleFeedback(messageId: string, rating: -1 | 1) {
  await submitFeedback(messageId, rating)
}

// Auto-scroll when new messages arrive
watch(() => messages.value.length, () => {
  scrollToBottom()
})
</script>

<template>
  <!-- Floating Chat Button -->
  <div class="fixed bottom-6 right-6 z-50">
    <!-- Expanded Chat Panel -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-4 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-4 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute bottom-16 right-0 w-[400px] h-[500px] bg-default border border-default
               rounded-xl shadow-xl flex flex-col overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-default bg-elevated/50">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-brain" class="w-5 h-5 text-primary" />
            <span class="font-semibold text-sm">AI Assistant</span>
          </div>
          <div class="flex items-center gap-1">
            <UButton
              icon="i-lucide-maximize-2"
              variant="ghost"
              color="neutral"
              size="xs"
              @click="openFullChat"
            />
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              size="xs"
              @click="close"
            />
          </div>
        </div>

        <!-- Quick Actions -->
        <AiQuickActions @action="handleQuickAction" />

        <!-- Messages -->
        <div
          ref="messagesContainer"
          class="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        >
          <!-- Empty state -->
          <div v-if="visibleMessages.length === 0" class="flex flex-col items-center justify-center h-full text-muted">
            <UIcon name="i-lucide-message-circle" class="w-10 h-10 mb-2 opacity-40" />
            <p class="text-sm">Ask me anything about your agency</p>
            <p class="text-xs mt-1">Tasks, clients, budgets, processes...</p>
          </div>

          <!-- Message list -->
          <div
            v-for="msg in visibleMessages"
            :key="msg.id"
            :class="[
              'flex gap-2',
              msg.role === 'user' ? 'justify-end' : 'justify-start',
            ]"
          >
            <!-- AI Avatar -->
            <div
              v-if="msg.role === 'assistant'"
              class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"
            >
              <UIcon name="i-lucide-sparkles" class="text-primary w-3 h-3" />
            </div>

            <div
              :class="[
                'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                msg.role === 'user'
                  ? 'bg-primary text-white'
                  : 'bg-elevated border border-default',
              ]"
            >
              <div class="whitespace-pre-wrap break-words" v-text="msg.content" />

              <!-- Feedback buttons for assistant messages -->
              <div
                v-if="msg.role === 'assistant' && !msg.isError"
                class="flex items-center gap-1 mt-1.5 -mb-0.5"
              >
                <button
                  :class="[
                    'p-0.5 rounded transition-colors',
                    msg.feedback?.rating === 1
                      ? 'text-success'
                      : 'text-muted/50 hover:text-muted',
                  ]"
                  @click="handleFeedback(msg.id, 1)"
                >
                  <UIcon name="i-lucide-thumbs-up" class="w-3 h-3" />
                </button>
                <button
                  :class="[
                    'p-0.5 rounded transition-colors',
                    msg.feedback?.rating === -1
                      ? 'text-error'
                      : 'text-muted/50 hover:text-muted',
                  ]"
                  @click="handleFeedback(msg.id, -1)"
                >
                  <UIcon name="i-lucide-thumbs-down" class="w-3 h-3" />
                </button>
              </div>
            </div>

            <!-- User Avatar -->
            <UAvatar
              v-if="msg.role === 'user'"
              :src="user?.avatar_url || undefined"
              :alt="user?.name || 'You'"
              size="2xs"
              class="shrink-0 mt-0.5"
            />
          </div>

          <!-- Sending indicator -->
          <div v-if="sending" class="flex gap-2 justify-start">
            <div class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-sparkles" class="text-primary w-3 h-3" />
            </div>
            <div class="bg-elevated border border-default rounded-lg px-3 py-2">
              <div class="flex items-center gap-2 text-sm text-muted">
                <UIcon name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" />
                <span>Thinking...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Input -->
        <div class="border-t border-default px-3 py-2">
          <div class="flex items-end gap-2">
            <textarea
              v-model="inputText"
              placeholder="Ask a question..."
              class="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted
                     max-h-20 min-h-[36px]"
              rows="1"
              @keydown="handleKeydown"
            />
            <UButton
              icon="i-lucide-send"
              size="xs"
              :disabled="!inputText.trim() || sending"
              :loading="sending"
              @click="handleSend"
            />
          </div>
          <div class="flex items-center justify-between mt-1">
            <button
              class="text-xs text-muted hover:text-default transition-colors"
              @click="openFullChat"
            >
              Open full chat
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- FAB Button -->
    <button
      class="rounded-full w-12 h-12 shadow-lg bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors cursor-pointer"
      @click="toggle"
    >
      <UIcon :name="isOpen ? 'i-lucide-x' : 'i-lucide-brain'" class="w-5 h-5" />
    </button>
  </div>
</template>
