<script setup lang="ts">
const props = defineProps<{
  workspaceId?: string
  workspaceName?: string
  departmentId?: string
  departmentName?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { user } = useAuth()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

const {
  activeConversation,
  messages,
  sending,
  createConversation,
  sendMessage,
  submitFeedback,
} = useAiChat()

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

// Visible messages (last 20 in this panel)
const visibleMessages = computed(() => messages.value.slice(-20))

// Workflow-specific quick actions based on current context
const quickActions = computed(() => {
  const actions: { label: string; icon: string; prompt: string }[] = []

  if (props.departmentId) {
    actions.push(
      { label: 'Summarize board', icon: 'i-lucide-layout-grid', prompt: 'Summarize this board' },
      { label: 'Overdue tasks', icon: 'i-lucide-alert-triangle', prompt: "What tasks are overdue on this board?" },
      { label: 'Blocked tasks', icon: 'i-lucide-shield-alert', prompt: 'What tasks are currently blocked on this board and why?' },
    )
  } else if (props.workspaceId) {
    actions.push(
      { label: 'Workspace overview', icon: 'i-lucide-briefcase', prompt: `Give me an overview of the ${props.workspaceName || 'selected'} workspace` },
      { label: 'Overdue tasks', icon: 'i-lucide-alert-triangle', prompt: `What tasks are overdue in the ${props.workspaceName || 'selected'} workspace?` },
      { label: 'Team workload', icon: 'i-lucide-users', prompt: `What does the team workload look like in the ${props.workspaceName || 'selected'} workspace?` },
    )
  } else {
    actions.push(
      { label: "What's overdue?", icon: 'i-lucide-alert-triangle', prompt: "What tasks are overdue across all workspaces?" },
      { label: 'Team workload', icon: 'i-lucide-users', prompt: 'Show me the team workload summary across all boards' },
      { label: 'Suggest priorities', icon: 'i-lucide-sparkles', prompt: 'Based on due dates and dependencies, what should the team focus on today?' },
    )
  }

  return actions
})

// Build context string for AI messages
function buildContext(): Record<string, string> {
  const ctx: Record<string, string> = {
    pageRoute: route.path,
    pageContext: 'workflow',
  }
  if (props.departmentId) ctx.boardId = props.departmentId
  if (props.workspaceId) ctx.workspaceId = props.workspaceId
  if (props.workspaceName) ctx.workspaceName = props.workspaceName
  if (props.departmentName) ctx.departmentName = props.departmentName
  return ctx
}

async function ensureConversation() {
  if (!activeConversation.value) {
    const title = props.departmentName
      ? `Workflow: ${props.departmentName}`
      : props.workspaceName
        ? `Workflow: ${props.workspaceName}`
        : 'Workflow Assistant'
    await createConversation(title)
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

async function handleQuickAction(action: { label: string; prompt: string }) {
  const context = buildContext()

  try {
    await ensureConversation()

    const result = await apiFetch<any>('/api/agency/ai/chat/quick-action', {
      method: 'POST',
      body: { action: action.prompt, context },
    })

    if (result.userMessage) {
      messages.value.push(result.userMessage)
    }
    if (result.message) {
      messages.value.push(result.message)
    }

    scrollToBottom()
  } catch {
    // Fallback: send as regular message
    inputText.value = action.prompt
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

function openFullChat() {
  const convId = activeConversation.value?.id
  router.push(convId ? `/agency/ai/chat?conversation=${convId}` : '/agency/ai/chat')
}

// Auto-scroll when new messages arrive
watch(() => messages.value.length, () => {
  scrollToBottom()
})
</script>

<template>
  <div class="flex flex-col h-full border-l border-default bg-default">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-default bg-elevated/30">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-brain" class="w-4 h-4 text-primary" />
        <span class="font-semibold text-sm">AI Assistant</span>
      </div>
      <div class="flex items-center gap-1">
        <UTooltip text="Open full chat">
          <UButton
            icon="i-lucide-maximize-2"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="openFullChat"
          />
        </UTooltip>
        <UButton
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="emit('close')"
        />
      </div>
    </div>

    <!-- Context indicator -->
    <div v-if="departmentName || workspaceName" class="px-4 py-2 bg-primary/5 border-b border-default">
      <div class="flex items-center gap-1.5 text-xs text-muted">
        <UIcon :name="departmentId ? 'i-lucide-kanban' : 'i-lucide-briefcase'" class="w-3 h-3" />
        <span>Context: <strong class="text-default">{{ departmentName || workspaceName }}</strong></span>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="px-3 py-2 border-b border-default">
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="action in quickActions"
          :key="action.label"
          class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full
                 border border-default bg-elevated/50 hover:bg-elevated
                 text-muted hover:text-default transition-colors cursor-pointer"
          @click="handleQuickAction(action)"
        >
          <UIcon :name="action.icon" class="w-3 h-3 flex-shrink-0" />
          <span class="truncate">{{ action.label }}</span>
        </button>
      </div>
    </div>

    <!-- Messages -->
    <div
      ref="messagesContainer"
      class="flex-1 overflow-y-auto px-4 py-3 space-y-3"
    >
      <!-- Empty state -->
      <div v-if="visibleMessages.length === 0" class="flex flex-col items-center justify-center h-full text-muted">
        <UIcon name="i-lucide-sparkles" class="w-10 h-10 mb-2 opacity-40" />
        <p class="text-sm font-medium">Workflow Assistant</p>
        <p class="text-xs mt-1 text-center">Ask about tasks, workload, blockers, or try a quick action above</p>
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
            'max-w-[85%] rounded-lg px-3 py-2 text-sm',
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
          placeholder="Ask about tasks, workload..."
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
    </div>
  </div>
</template>
