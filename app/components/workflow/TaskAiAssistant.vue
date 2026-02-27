<script setup lang="ts">
import type { Task } from '~/types'

const props = defineProps<{
  taskId: string
  task: Task | null
}>()

const emit = defineEmits<{
  'task-updated': []
}>()

const toast = useToast()

// AI analysis state
const loading = ref(false)
const actions = ref<Array<{
  type: 'status_change' | 'assign' | 'set_date' | 'set_priority'
  label: string
  reason: string
  value: any
}>>([])
const insights = ref('')
const applyingAction = ref<number | null>(null)

// Chat state
const chatMessages = ref<Array<{ role: 'user' | 'assistant'; content: string }>>([])
const chatInput = ref('')
const chatLoading = ref(false)

const quickQuestions = [
  { label: 'What should I do next?', icon: 'i-lucide-arrow-right' },
  { label: 'Who should work on this?', icon: 'i-lucide-user-plus' },
  { label: 'Break into subtasks', icon: 'i-lucide-list-tree' },
  { label: 'Is this blocked?', icon: 'i-lucide-shield-alert' }
]

// Fetch AI analysis when component mounts or task changes
watch(() => props.taskId, () => {
  fetchAnalysis()
}, { immediate: true })

async function fetchAnalysis() {
  if (!props.taskId) return

  loading.value = true
  actions.value = []
  insights.value = ''
  chatMessages.value = []

  try {
    const result = await $fetch('/api/agency/ai/task-assist', {
      method: 'POST',
      body: { taskId: props.taskId }
    }) as any

    actions.value = result.actions || []
    insights.value = result.insights || ''
  } catch (error: any) {
    insights.value = 'Unable to analyze this task right now.'
  } finally {
    loading.value = false
  }
}

async function applyAction(action: typeof actions.value[0], index: number) {
  applyingAction.value = index

  try {
    const body: Record<string, any> = {}

    switch (action.type) {
      case 'status_change':
        body.statusId = action.value
        break
      case 'assign':
        body.assigneeId = action.value
        break
      case 'set_date':
        body.dueDate = action.value
        break
      case 'set_priority':
        body.priority = action.value
        break
    }

    await $fetch(`/api/agency/tasks/${props.taskId}`, {
      method: 'PATCH',
      body
    })

    toast.add({ title: 'Task updated', description: action.label, color: 'success' })

    // Remove the applied action
    actions.value.splice(index, 1)
    emit('task-updated')
  } catch (error: any) {
    toast.add({
      title: 'Failed to update task',
      description: error?.data?.statusMessage || 'Please try again.',
      color: 'error'
    })
  } finally {
    applyingAction.value = null
  }
}

async function askQuestion(question: string) {
  if (!question.trim()) return

  chatMessages.value.push({ role: 'user', content: question })
  chatInput.value = ''
  chatLoading.value = true

  try {
    // Use the task-assist endpoint with description as the question + taskId for context
    const result = await $fetch('/api/agency/ai/task-assist', {
      method: 'POST',
      body: {
        taskId: props.taskId,
        description: question
      }
    }) as any

    const answer = result.insights || 'I could not generate a response for that question.'
    chatMessages.value.push({ role: 'assistant', content: answer })

    // If the AI also returned new actions, add them
    if (result.actions?.length) {
      actions.value = result.actions
    }
  } catch {
    chatMessages.value.push({ role: 'assistant', content: 'Sorry, I could not process that question right now.' })
  } finally {
    chatLoading.value = false
  }
}

function handleChatKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    askQuestion(chatInput.value)
  }
}

function getActionIcon(type: string) {
  switch (type) {
    case 'status_change': return 'i-lucide-circle-arrow-right'
    case 'assign': return 'i-lucide-user-plus'
    case 'set_date': return 'i-lucide-calendar-plus'
    case 'set_priority': return 'i-lucide-flag'
    default: return 'i-lucide-zap'
  }
}

function getActionColor(type: string) {
  switch (type) {
    case 'status_change': return 'primary'
    case 'assign': return 'info'
    case 'set_date': return 'warning'
    case 'set_priority': return 'error'
    default: return 'neutral'
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="flex items-center gap-2 text-muted">
        <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin" />
        <span class="text-sm">Analyzing task...</span>
      </div>
    </div>

    <template v-else>
      <!-- Smart Action Cards -->
      <div v-if="actions.length" class="space-y-2">
        <h4 class="text-xs font-medium text-muted uppercase tracking-wide">Recommended Actions</h4>
        <div
          v-for="(action, i) in actions"
          :key="i"
          class="rounded-lg border border-default p-3 hover:bg-elevated/50 transition-colors"
        >
          <div class="flex items-start gap-3">
            <div
              class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              :class="`bg-${getActionColor(action.type)}/10`"
            >
              <UIcon
                :name="getActionIcon(action.type)"
                class="w-4 h-4"
                :class="`text-${getActionColor(action.type)}`"
              />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium">{{ action.label }}</p>
              <p class="text-xs text-muted mt-0.5">{{ action.reason }}</p>
            </div>
            <UButton
              size="xs"
              variant="soft"
              :loading="applyingAction === i"
              @click="applyAction(action, i)"
            >
              Apply
            </UButton>
          </div>
        </div>
      </div>

      <!-- Insights -->
      <div v-if="insights" class="rounded-lg border border-default p-3 bg-elevated/20">
        <div class="flex items-start gap-2">
          <UIcon name="i-lucide-sparkles" class="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <p class="text-sm text-default">{{ insights }}</p>
        </div>
      </div>

      <!-- Quick Questions -->
      <div class="space-y-2">
        <h4 class="text-xs font-medium text-muted uppercase tracking-wide">Ask AI</h4>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="q in quickQuestions"
            :key="q.label"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border border-default text-muted hover:text-default hover:bg-elevated transition-colors"
            :disabled="chatLoading"
            @click="askQuestion(q.label)"
          >
            <UIcon :name="q.icon" class="w-3 h-3" />
            {{ q.label }}
          </button>
        </div>
      </div>

      <!-- Chat Messages -->
      <div v-if="chatMessages.length" class="space-y-3 border-t border-default pt-3">
        <div
          v-for="(msg, i) in chatMessages"
          :key="i"
          class="flex gap-2"
          :class="msg.role === 'user' ? 'justify-end' : ''"
        >
          <div
            class="max-w-[85%] rounded-lg px-3 py-2 text-sm"
            :class="msg.role === 'user'
              ? 'bg-primary text-primary-foreground'
              : 'bg-elevated border border-default'"
          >
            <p class="whitespace-pre-wrap">{{ msg.content }}</p>
          </div>
        </div>

        <div v-if="chatLoading" class="flex items-center gap-2 text-muted">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          <span class="text-xs">Thinking...</span>
        </div>
      </div>

      <!-- Chat Input -->
      <div class="flex gap-2">
        <UInput
          v-model="chatInput"
          placeholder="Ask about this task..."
          class="flex-1"
          size="sm"
          @keydown="handleChatKeydown"
        />
        <UButton
          icon="i-lucide-send"
          size="sm"
          variant="soft"
          :loading="chatLoading"
          :disabled="!chatInput.trim()"
          @click="askQuestion(chatInput)"
        />
      </div>
    </template>
  </div>
</template>
