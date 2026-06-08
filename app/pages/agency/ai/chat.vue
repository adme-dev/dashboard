<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { AiConversation, AiMessage } from '~/types'
import { AI_PERSONA_OPTIONS } from '~~/app/utils/aiPersonas'

definePageMeta({ layout: 'agency' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { user } = useAuth()

const {
  conversations, activeConversation, messages, selectedPersona, loading, sending,
  hasMoreConversations, hasMoreMessages, totalConversations,
  fetchConversations, loadMoreConversations, createConversation,
  loadConversation, loadMoreMessages, renameConversation, togglePin,
  sendMessage, archiveConversation, cleanupOldConversations, submitFeedback,
} = useAiChat()

// Slice 1.5 persona picker — narrows the AI's tools/focus (∩ RBAC). Generalist by default.
// Hidden until the agentic tool loop is live: the picker only does anything once
// AI_TOOLS_ENABLED is on, so gate its visibility on the client-visible mirror of that flag.
const aiToolsEnabled = Boolean(useRuntimeConfig().public.aiToolsEnabled)
const personaItems = AI_PERSONA_OPTIONS.map(o => ({ label: o.label, value: o.key }))

// --- Voice Chat ---
const {
  isAvailable: voiceAvailable,
  isRecording, isProcessing: voiceProcessing,
  isPlaying: voicePlaying,
  volumeLevel,
  error: voiceError,
  startRecording, stopRecording, cancelRecording,
  sendVoiceMessage, playAudio, stopAudio,
} = useVoiceChat()

watch(voiceError, (err) => {
  if (err) toast.add({ title: 'Voice', description: err, color: 'warning' })
})

// --- Hands-free Voice Session (open-mic, agentic, barge-in) ---
// A continuous voice loop over the live tool-calling agent: listen → answer aloud → re-arm,
// with barge-in and spoken write-confirmation. Gated (in the template) behind aiToolsEnabled.
async function ensureConversationId(): Promise<string | null> {
  if (activeConversation.value) return activeConversation.value.id
  try {
    const conv = await createConversation()
    updateUrl(conv.id)
    return conv.id
  } catch {
    toast.add({ title: 'Error', description: 'Failed to create conversation', color: 'error' })
    return null
  }
}

function pushVoiceTurn(
  userText: string,
  assistant: AiMessage,
  proposedAction: { proposalId: string, resolved: unknown } | null,
) {
  if (!activeConversation.value) return
  messages.value.push({
    id: `voice-user-${Date.now()}`,
    conversationId: activeConversation.value.id,
    role: 'user',
    content: userText,
    contextSources: [],
    tokenCount: null,
    model: null,
    latencyMs: null,
    isError: false,
    createdAt: new Date().toISOString(),
  })
  messages.value.push({ ...assistant, proposedAction: proposedAction ?? null })
  activeConversation.value.messageCount += 2
  activeConversation.value.lastMessageAt = new Date().toISOString()
}

function pushAssistantNote(text: string) {
  if (!activeConversation.value) return
  messages.value.push({
    id: `voice-note-${Date.now()}`,
    conversationId: activeConversation.value.id,
    role: 'assistant',
    content: text,
    contextSources: [],
    tokenCount: null,
    model: null,
    latencyMs: null,
    isError: false,
    createdAt: new Date().toISOString(),
  })
}

function resolveLastProposal() {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].role === 'assistant' && messages.value[i].proposedAction) {
      messages.value[i] = { ...messages.value[i], proposedAction: null } as AiMessage
      break
    }
  }
}

const voiceSession = useVoiceSession({
  ensureConversation: ensureConversationId,
  onTurn: pushVoiceTurn,
  onAssistantNote: pushAssistantNote,
  onProposalResolved: resolveLastProposal,
})

function toggleVoiceSession() {
  if (voiceSession.isActive.value) voiceSession.stop()
  else voiceSession.start()
}

watch(voiceSession.error, (err) => {
  if (err) toast.add({ title: 'Voice', description: err, color: 'warning' })
})

async function handleVoiceRecord() {
  // If currently playing audio, stop it
  if (voicePlaying.value) {
    stopAudio()
    return
  }

  // If currently recording, stop
  if (isRecording.value) {
    stopRecording()
    return
  }

  // Ensure we have an active conversation
  if (!activeConversation.value) {
    try {
      const conv = await createConversation()
      updateUrl(conv.id)
    } catch {
      toast.add({ title: 'Error', description: 'Failed to create conversation', color: 'error' })
      return
    }
  }

  // Start recording — returns blob when stopped
  const blob = await startRecording()
  if (!blob || !activeConversation.value) return

  // Add temporary "Listening..." user message
  const tempId = `voice-${Date.now()}`
  const tempUserMsg: AiMessage = {
    id: tempId,
    conversationId: activeConversation.value.id,
    role: 'user',
    content: 'Transcribing voice...',
    contextSources: [],
    tokenCount: null,
    model: null,
    latencyMs: null,
    isError: false,
    createdAt: new Date().toISOString(),
  }
  messages.value.push(tempUserMsg)

  // Collect entity references
  const entities = mentionedEntities.value.map(e => ({ type: e.type, id: e.id }))
  mentionedEntities.value = []

  try {
    const result = await sendVoiceMessage(
      activeConversation.value.id,
      blob,
      entities.length > 0 ? entities : undefined
    )

    // Replace temp message with actual transcribed text
    const idx = messages.value.findIndex(m => m.id === tempId)
    if (idx >= 0) {
      messages.value[idx] = {
        ...messages.value[idx],
        content: result.transcribedText,
      }
    }

    // Add assistant message (carry any proposed action so the confirm card renders)
    messages.value.push({ ...result.message, proposedAction: (result as any).proposedAction ?? null })

    // Update conversation metadata
    if (activeConversation.value) {
      activeConversation.value.messageCount += 2
      activeConversation.value.lastMessageAt = new Date().toISOString()
      if (!activeConversation.value.title) {
        activeConversation.value.title = result.transcribedText.length > 60
          ? result.transcribedText.slice(0, 57) + '...'
          : result.transcribedText
      }
      const convIdx = conversations.value.findIndex(c => c.id === activeConversation.value!.id)
      if (convIdx >= 0) {
        conversations.value[convIdx] = { ...activeConversation.value }
        const [moved] = conversations.value.splice(convIdx, 1)
        conversations.value.unshift(moved)
      }
    }

    // Auto-play audio response (fire-and-forget with error suppression)
    if (result.audioBase64 && result.audioFormat) {
      playAudio(result.audioBase64, result.audioFormat).catch(() => {})
    }
  } catch {
    // Remove temp message on failure
    messages.value = messages.value.filter(m => m.id !== tempId)
  }
}

// --- Feedback ---
const feedbackMessageId = ref<string | null>(null)
const feedbackModalOpen = ref(false)
const feedbackCorrection = ref('')

function handleFeedback(messageId: string, rating: -1 | 1) {
  if (rating === 1) {
    submitFeedback(messageId, 1)
    toast.add({ title: 'Thanks for your feedback!', color: 'success' })
  } else {
    feedbackMessageId.value = messageId
    feedbackCorrection.value = ''
    feedbackModalOpen.value = true
  }
}

function submitCorrectionFeedback() {
  if (feedbackMessageId.value) {
    submitFeedback(feedbackMessageId.value, -1, feedbackCorrection.value || undefined)
    feedbackMessageId.value = null
    feedbackCorrection.value = ''
    feedbackModalOpen.value = false
    toast.add({ title: 'Feedback submitted', color: 'success' })
  }
}

// --- Rename ---
const renamingId = ref<string | null>(null)
const renameInput = ref('')

function startRename(conv: AiConversation) {
  renamingId.value = conv.id
  renameInput.value = conv.title || ''
}

async function confirmRename() {
  if (!renamingId.value || !renameInput.value.trim()) {
    renamingId.value = null
    return
  }
  try {
    await renameConversation(renamingId.value, renameInput.value.trim())
  } catch {
    toast.add({ title: 'Error', description: 'Failed to rename conversation', color: 'error' })
  }
  renamingId.value = null
}

function handleRenameKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') { e.preventDefault(); confirmRename() }
  if (e.key === 'Escape') { renamingId.value = null }
}

// --- Cleanup ---
const cleanupModalOpen = ref(false)
const cleanupDays = ref(90)
const cleanupLoading = ref(false)

async function handleCleanup() {
  cleanupLoading.value = true
  try {
    const result = await cleanupOldConversations(cleanupDays.value)
    cleanupModalOpen.value = false
    toast.add({
      title: result.archivedCount > 0
        ? `Archived ${result.archivedCount} old conversation${result.archivedCount === 1 ? '' : 's'}`
        : 'No old conversations to clean up',
      color: result.archivedCount > 0 ? 'success' : 'neutral',
    })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to clean up conversations', color: 'error' })
  } finally {
    cleanupLoading.value = false
  }
}

// --- Context Panel (right sidebar) ---
const contextPanelOpen = ref(false)

interface ContextEntity {
  type: string
  id: string
  title: string
  snippet: string
  url: string
}

// Collect unique referenced entities from all assistant messages in current conversation
const referencedEntities = computed(() => {
  const seen = new Set<string>()
  const entities: ContextEntity[] = []
  for (const msg of messages.value) {
    if (msg.role !== 'assistant' || !msg.contextSources) continue
    for (const source of msg.contextSources) {
      if (seen.has(source.id)) continue
      seen.add(source.id)
      entities.push({
        type: source.type,
        id: source.id,
        title: source.title,
        snippet: source.snippet,
        url: source.url,
      })
    }
  }
  return entities
})

// Group referenced entities by type
const groupedEntities = computed(() => {
  const groups: Record<string, ContextEntity[]> = {}
  for (const entity of referencedEntities.value) {
    if (!groups[entity.type]) groups[entity.type] = []
    groups[entity.type].push(entity)
  }
  return groups
})

const entityTypeLabels: Record<string, string> = {
  task: 'Tasks',
  client: 'Clients',
  project: 'Projects',
  brief: 'Briefs',
  board: 'Boards',
  spend: 'Ad Spend',
  team: 'Team',
  knowledge: 'Knowledge',
  time_tracking: 'Time Tracking',
}

// Fetch user's own tasks (overdue + upcoming)
const { data: myTasksData } = useFetch<{ tasks: any[] }>('/api/agency/tasks', {
  params: { assigneeId: user.value?.id, limit: 20, excludeCompleted: 'true' },
  default: () => ({ tasks: [] }),
})

const overdueTasks = computed(() =>
  (myTasksData.value?.tasks || []).filter((t: any) => t.dueDate && new Date(t.dueDate) < new Date())
)

const upcomingTasks = computed(() =>
  (myTasksData.value?.tasks || []).filter((t: any) => t.dueDate && new Date(t.dueDate) >= new Date()).slice(0, 5)
)

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    done: 'success', completed: 'success',
    'in_progress': 'warning', active: 'warning',
    overdue: 'error', blocked: 'error',
    todo: 'neutral', draft: 'neutral',
  }
  return map[status] || 'neutral'
}

// --- State ---
const messageInput = ref('')
const searchFilter = ref('')
const sidebarOpen = ref(true)
const messagesContainer = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)

// --- @Mention entity references ---
interface MentionEntity {
  id: string
  type: string
  title: string
  subtitle: string | null
}

const mentionedEntities = ref<MentionEntity[]>([])
const mentionQuery = ref('')
const mentionResults = ref<MentionEntity[]>([])
const mentionDropdownOpen = ref(false)
const mentionSelectedIndex = ref(0)
const mentionAtPosition = ref(-1) // cursor position of the @ trigger
let mentionDebounceTimer: ReturnType<typeof setTimeout> | null = null

const ENTITY_ICONS: Record<string, string> = {
  task: 'i-lucide-check-square',
  client: 'i-lucide-building-2',
  project: 'i-lucide-folder-kanban',
  brief: 'i-lucide-file-text',
  knowledge: 'i-lucide-book-open',
  time_tracking: 'i-lucide-clock',
  spend: 'i-lucide-wallet',
  team: 'i-lucide-users',
  board: 'i-lucide-layout-dashboard',
}

async function searchEntities(q: string) {
  if (q.length < 2) {
    mentionResults.value = []
    return
  }
  try {
    const data = await $fetch<{ results: MentionEntity[] }>('/api/agency/ai/chat/entity-search', {
      params: { q, limit: 8 },
    })
    mentionResults.value = data.results
    mentionSelectedIndex.value = 0
  } catch {
    mentionResults.value = []
  }
}

function handleMentionInput() {
  const el = inputRef.value
  if (!el) return

  const cursorPos = el.selectionStart
  const textBeforeCursor = messageInput.value.slice(0, cursorPos)

  // Find the last @ that isn't part of an email
  const atMatch = textBeforeCursor.match(/@([^\s@]*)$/)
  if (atMatch) {
    mentionAtPosition.value = cursorPos - atMatch[0].length
    mentionQuery.value = atMatch[1]
    mentionDropdownOpen.value = true

    // Debounce the search
    if (mentionDebounceTimer) clearTimeout(mentionDebounceTimer)
    mentionDebounceTimer = setTimeout(() => searchEntities(atMatch[1]), 200)
  } else {
    closeMentionDropdown()
  }
}

function selectMention(entity: MentionEntity) {
  // Already added?
  if (mentionedEntities.value.some(e => e.id === entity.id)) {
    closeMentionDropdown()
    return
  }

  // Replace the @query text with the entity name
  const before = messageInput.value.slice(0, mentionAtPosition.value)
  const afterPos = mentionAtPosition.value + 1 + mentionQuery.value.length // @ + query length
  const after = messageInput.value.slice(afterPos)
  messageInput.value = `${before}@${entity.title} ${after}`

  mentionedEntities.value.push(entity)
  closeMentionDropdown()

  // Refocus the textarea
  nextTick(() => {
    if (inputRef.value) {
      const newPos = before.length + entity.title.length + 2 // @ + title + space
      inputRef.value.setSelectionRange(newPos, newPos)
      inputRef.value.focus()
    }
  })
}

function removeMention(entityId: string) {
  mentionedEntities.value = mentionedEntities.value.filter(e => e.id !== entityId)
}

function closeMentionDropdown() {
  mentionDropdownOpen.value = false
  mentionQuery.value = ''
  mentionResults.value = []
  mentionAtPosition.value = -1
}

function handleMentionKeydown(e: KeyboardEvent) {
  if (!mentionDropdownOpen.value || mentionResults.value.length === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    mentionSelectedIndex.value = (mentionSelectedIndex.value + 1) % mentionResults.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    mentionSelectedIndex.value = (mentionSelectedIndex.value - 1 + mentionResults.value.length) % mentionResults.value.length
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    selectMention(mentionResults.value[mentionSelectedIndex.value])
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeMentionDropdown()
  }
}

// Auto-resize textarea to fit content
function autoResizeInput() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

// Fetch conversations on mount
await fetchConversations()

// If navigated from widget with a conversation ID, load it
const conversationParam = route.query.conversation as string | undefined
if (conversationParam && activeConversation.value?.id !== conversationParam) {
  await loadConversation(conversationParam)
}

// Filtered conversations (client-side filter on loaded set)
const filteredConversations = computed(() => {
  if (!searchFilter.value) return conversations.value
  const q = searchFilter.value.toLowerCase()
  return conversations.value.filter(c =>
    (c.title || 'New conversation').toLowerCase().includes(q)
  )
})

// Split pinned vs unpinned for section headers
const pinnedConversations = computed(() => filteredConversations.value.filter(c => c.isPinned))
const unpinnedConversations = computed(() => filteredConversations.value.filter(c => !c.isPinned))

// --- URL Sync ---
function updateUrl(convId: string | null) {
  const query = convId ? { conversation: convId } : {}
  router.replace({ query })
}

// --- Scroll ---
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// Watch message count (not deep) for auto-scroll
watch(() => messages.value.length, () => scrollToBottom())

// Auto-open context panel when AI references entities for the first time
watch(() => referencedEntities.value.length, (newLen, oldLen) => {
  if (newLen > 0 && oldLen === 0 && !contextPanelOpen.value) {
    contextPanelOpen.value = true
  }
})

// Cleanup debounce timer on unmount
onUnmounted(() => {
  if (mentionDebounceTimer) clearTimeout(mentionDebounceTimer)
})

// Close mention dropdown on outside click
function handleDocumentClick(e: MouseEvent) {
  if (!mentionDropdownOpen.value) return
  const target = e.target as HTMLElement
  // Keep open if clicking inside the textarea or dropdown
  if (inputRef.value?.contains(target)) return
  const dropdown = document.querySelector('[data-mention-dropdown]')
  if (dropdown?.contains(target)) return
  closeMentionDropdown()
}
onMounted(() => document.addEventListener('click', handleDocumentClick))
onUnmounted(() => document.removeEventListener('click', handleDocumentClick))

// Create new chat
async function handleNewChat() {
  try {
    const conv = await createConversation()
    updateUrl(conv.id)
  } catch {
    toast.add({ title: 'Error', description: 'Failed to create conversation', color: 'error' })
  }
}

// Select conversation
async function selectConversation(conv: AiConversation) {
  if (activeConversation.value?.id === conv.id) return
  await loadConversation(conv.id)
  updateUrl(conv.id)
  if (window.innerWidth < 768) {
    sidebarOpen.value = false
  }
}

// Send message
async function handleSend() {
  const content = messageInput.value.trim()
  if (!content || sending.value) return

  if (!activeConversation.value) {
    try {
      const conv = await createConversation()
      updateUrl(conv.id)
    } catch {
      toast.add({ title: 'Error', description: 'Failed to create conversation', color: 'error' })
      return
    }
  }

  messageInput.value = ''
  // Reset textarea height after clearing
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.style.height = 'auto'
    }
  })

  // Collect entity references to send with the message
  const entities = mentionedEntities.value.map(e => ({ type: e.type, id: e.id }))
  mentionedEntities.value = []

  try {
    await sendMessage(content, entities)
  } catch (err: any) {
    const status = err?.response?.status || err?.statusCode
    if (status === 429) {
      toast.add({ title: 'Slow down', description: 'Too many messages. Please wait a moment.', color: 'warning' })
    } else {
      toast.add({ title: 'Error', description: 'Failed to send message', color: 'error' })
    }
  }
}

function handleKeydown(e: KeyboardEvent) {
  // Mention dropdown navigation takes priority
  if (mentionDropdownOpen.value && ['ArrowDown', 'ArrowUp', 'Tab', 'Escape'].includes(e.key)) {
    handleMentionKeydown(e)
    return
  }
  if (mentionDropdownOpen.value && e.key === 'Enter') {
    handleMentionKeydown(e)
    return
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// Pin/unpin conversation
async function handleTogglePin(conv: AiConversation) {
  const wasPinned = conv.isPinned
  try {
    await togglePin(conv.id)
    toast.add({
      title: wasPinned ? 'Unpinned conversation' : 'Pinned conversation',
      color: 'success',
    })
  } catch (err: any) {
    const msg = err?.data?.statusMessage || err?.statusMessage || 'Failed to update pin'
    toast.add({ title: 'Error', description: msg, color: 'error' })
  }
}

// Delete conversation
async function handleDelete(conv: AiConversation) {
  try {
    const wasActive = activeConversation.value?.id === conv.id
    await archiveConversation(conv.id)
    if (wasActive) updateUrl(null)
    toast.add({ title: 'Conversation deleted', color: 'success' })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete conversation', color: 'error' })
  }
}

// Load older messages on scroll to top
function handleMessagesScroll() {
  if (!messagesContainer.value || !hasMoreMessages.value || loading.value) return
  if (messagesContainer.value.scrollTop < 80) {
    const prevHeight = messagesContainer.value.scrollHeight
    loadMoreMessages().then(() => {
      // Preserve scroll position after prepending older messages
      nextTick(() => {
        if (messagesContainer.value) {
          messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight - prevHeight
        }
      })
    })
  }
}

function relativeTime(date: string | null) {
  if (!date) return ''
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

// Memoized markdown cache
const markdownCache = new Map<string, string>()

function getRenderedMarkdown(content: string): string {
  const cached = markdownCache.get(content)
  if (cached) return cached
  const rendered = renderMarkdown(content)
  markdownCache.set(content, rendered)
  // Keep cache bounded
  if (markdownCache.size > 200) {
    const firstKey = markdownCache.keys().next().value
    if (firstKey) markdownCache.delete(firstKey)
  }
  return rendered
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
        <UDropdownMenu
          :items="[
            [
              { label: 'Clean up old chats', icon: 'i-lucide-archive', onSelect: () => { cleanupModalOpen = true } },
            ],
          ]"
        >
          <UButton
            icon="i-lucide-more-horizontal"
            variant="ghost"
            color="neutral"
            size="sm"
          />
        </UDropdownMenu>
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

      <!-- Conversation count -->
      <div v-if="totalConversations > 0" class="px-3 pb-1">
        <span class="text-[10px] text-muted">{{ totalConversations }} conversation{{ totalConversations === 1 ? '' : 's' }}</span>
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
          <!-- Pinned Section -->
          <template v-if="pinnedConversations.length > 0">
            <div class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
              <UIcon name="i-lucide-pin" class="w-3 h-3" />
              Pinned
            </div>
            <button
              v-for="conv in pinnedConversations"
              :key="conv.id"
              :class="[
                'w-full text-left px-3 py-2.5 border-b border-default hover:bg-elevated/80 transition-colors group',
                activeConversation?.id === conv.id ? 'bg-elevated' : ''
              ]"
              @click="selectConversation(conv)"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <input
                    v-if="renamingId === conv.id"
                    v-model="renameInput"
                    class="text-sm font-medium w-full bg-default border border-default rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-primary"
                    @keydown="handleRenameKeydown"
                    @blur="confirmRename"
                    @click.stop
                    autofocus
                  />
                  <div v-else class="flex items-center gap-1 text-sm font-medium truncate">
                    <UIcon name="i-lucide-pin" class="w-3 h-3 text-primary shrink-0" />
                    <span class="truncate">{{ conv.title || 'New conversation' }}</span>
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
                <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                  <UButton
                    icon="i-lucide-pin-off"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    @click.stop="handleTogglePin(conv)"
                  />
                  <UButton
                    icon="i-lucide-pencil"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    @click.stop="startRename(conv)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    @click.stop="handleDelete(conv)"
                  />
                </div>
              </div>
            </button>

            <!-- Separator between pinned and recent -->
            <div v-if="unpinnedConversations.length > 0" class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              Recent
            </div>
          </template>

          <!-- Unpinned (Recent) Conversations -->
          <button
            v-for="conv in unpinnedConversations"
            :key="conv.id"
            :class="[
              'w-full text-left px-3 py-2.5 border-b border-default hover:bg-elevated/80 transition-colors group',
              activeConversation?.id === conv.id ? 'bg-elevated' : ''
            ]"
            @click="selectConversation(conv)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <input
                  v-if="renamingId === conv.id"
                  v-model="renameInput"
                  class="text-sm font-medium w-full bg-default border border-default rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-primary"
                  @keydown="handleRenameKeydown"
                  @blur="confirmRename"
                  @click.stop
                  autofocus
                />
                <div v-else class="text-sm font-medium truncate">
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
              <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                <UButton
                  icon="i-lucide-pin"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  @click.stop="handleTogglePin(conv)"
                />
                <UButton
                  icon="i-lucide-pencil"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  @click.stop="startRename(conv)"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  @click.stop="handleDelete(conv)"
                />
              </div>
            </div>
          </button>

          <!-- Load more conversations -->
          <div v-if="hasMoreConversations" class="p-3 text-center">
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              :loading="loading"
              @click="loadMoreConversations"
            >
              Load older conversations
            </UButton>
          </div>
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
        <span class="text-sm font-medium truncate flex-1">
          {{ activeConversation?.title || 'AI Chat' }}
        </span>
        <UButton
          :icon="contextPanelOpen ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right-open'"
          variant="ghost"
          color="neutral"
          size="sm"
          @click="contextPanelOpen = !contextPanelOpen"
        />
      </div>

      <!-- Chat Header (desktop) -->
      <div class="hidden md:flex items-center gap-3 px-4 py-3 border-b border-default">
        <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <UIcon name="i-lucide-sparkles" class="text-primary w-4 h-4" />
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="text-sm font-semibold truncate">
            {{ activeConversation?.title || 'AI Chat' }}
          </h2>
          <p v-if="activeConversation" class="text-xs text-muted">
            {{ activeConversation.messageCount }} messages
          </p>
        </div>
        <UButton
          :icon="contextPanelOpen ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right-open'"
          variant="ghost"
          color="neutral"
          size="sm"
          @click="contextPanelOpen = !contextPanelOpen"
        >
          <template v-if="referencedEntities.length > 0" #trailing>
            <UBadge :label="String(referencedEntities.length)" size="xs" color="primary" variant="subtle" class="ml-0.5" />
          </template>
        </UButton>
      </div>

      <!-- Messages + Floating Input wrapper -->
      <div class="flex-1 flex flex-col min-h-0 relative">
        <!-- Messages scroll area -->
        <div
          ref="messagesContainer"
          class="flex-1 overflow-y-auto px-4 pt-4 pb-48"
          @scroll="handleMessagesScroll"
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
            <!-- Load more messages indicator -->
            <div v-if="hasMoreMessages" class="text-center py-2">
              <UButton
                variant="ghost"
                color="neutral"
                size="xs"
                icon="i-lucide-chevron-up"
                :loading="loading"
                @click="loadMoreMessages"
              >
                Load earlier messages
              </UButton>
            </div>

            <div
              v-for="msg in messages"
              :key="msg.id"
              :class="[
                'flex gap-2.5',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              ]"
            >
              <!-- AI Avatar -->
              <div
                v-if="msg.role === 'assistant'"
                class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"
              >
                <UIcon name="i-lucide-sparkles" class="text-primary w-3.5 h-3.5" />
              </div>

              <div
                :class="[
                  'max-w-[80%] rounded-xl px-4 py-2.5',
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
                  v-html="getRenderedMarkdown(msg.content)"
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

                <!-- Proposed action (guarded write awaiting the user's confirmation) -->
                <AiProposedActionCard
                  v-if="msg.role === 'assistant' && msg.proposedAction"
                  :conversation-id="msg.conversationId"
                  :proposal="msg.proposedAction"
                  @cancelled="msg.proposedAction = null"
                />

                <!-- Tool-call trace (assistant messages that consulted live data) -->
                <div
                  v-if="msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0"
                  class="flex flex-wrap items-center gap-1 mt-2 pt-2 border-t border-default/50"
                >
                  <span class="inline-flex items-center gap-1 text-[10px] text-muted">
                    <UIcon name="i-lucide-search" class="size-3" /> Consulted:
                  </span>
                  <UBadge
                    v-for="(tc, i) in msg.toolCalls"
                    :key="`tool-${i}`"
                    :label="tc.name"
                    size="xs"
                    color="neutral"
                    variant="soft"
                  />
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

              <!-- User Avatar -->
              <UAvatar
                v-if="msg.role === 'user'"
                :src="user?.avatar_url || undefined"
                :alt="user?.name || 'You'"
                size="xs"
                class="shrink-0 mt-0.5"
              />
            </div>

            <!-- Typing indicator -->
            <div v-if="sending" class="flex gap-2.5 justify-start">
              <div class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <UIcon name="i-lucide-sparkles" class="text-primary w-3.5 h-3.5" />
              </div>
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

        <!-- Gradient fade behind input -->
        <div class="absolute bottom-0 left-0 right-0 pointer-events-none h-40 bg-gradient-to-t from-[var(--ui-bg)] via-[var(--ui-bg)]/80 to-transparent" />

        <!-- Floating Input Area (Claude/ChatGPT style) -->
        <div class="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-2">
          <div class="max-w-3xl mx-auto relative">
            <!-- @Mention Autocomplete Dropdown -->
            <Transition
              enter-active-class="transition duration-100 ease-out"
              enter-from-class="opacity-0 translate-y-1"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition duration-75 ease-in"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 translate-y-1"
            >
              <div
                v-if="mentionDropdownOpen && mentionResults.length > 0"
                id="mention-listbox"
                data-mention-dropdown
                role="listbox"
                class="absolute bottom-full mb-2 left-0 right-0 bg-elevated border border-default rounded-xl shadow-xl z-20 overflow-hidden max-h-64 overflow-y-auto"
              >
                <div class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted border-b border-default">
                  Reference an entity
                </div>
                <button
                  v-for="(result, i) in mentionResults"
                  :key="result.id"
                  role="option"
                  :aria-selected="i === mentionSelectedIndex"
                  :class="[
                    'w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors',
                    i === mentionSelectedIndex ? 'bg-primary/10' : 'hover:bg-elevated/80',
                    mentionedEntities.some(e => e.id === result.id) ? 'opacity-40' : '',
                  ]"
                  @click="selectMention(result)"
                  @mouseenter="mentionSelectedIndex = i"
                >
                  <div class="w-7 h-7 rounded-lg bg-default flex items-center justify-center shrink-0">
                    <UIcon :name="ENTITY_ICONS[result.type] || 'i-lucide-hash'" class="w-3.5 h-3.5 text-muted" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium truncate">{{ result.title }}</div>
                    <div v-if="result.subtitle" class="text-xs text-muted truncate">{{ result.subtitle }}</div>
                  </div>
                  <UBadge :label="result.type" size="xs" color="neutral" variant="subtle" />
                </button>
              </div>
            </Transition>

            <!-- Hands-free voice session status -->
            <VoiceModePanel
              v-if="voiceSession.isActive.value"
              :phase="voiceSession.phase.value"
              :volume-level="voiceSession.volumeLevel.value"
              :error="voiceSession.error.value"
              class="mb-2"
              @stop="voiceSession.stop()"
            />

            <div class="bg-elevated border border-default rounded-2xl shadow-lg ring-1 ring-black/[0.03] dark:ring-white/[0.03] overflow-hidden">
              <!-- Entity chips (referenced items) -->
              <div v-if="mentionedEntities.length > 0" class="flex flex-wrap gap-1.5 px-4 pt-3 pb-1">
                <span
                  v-for="entity in mentionedEntities"
                  :key="entity.id"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
                >
                  <UIcon :name="ENTITY_ICONS[entity.type] || 'i-lucide-hash'" class="w-3 h-3" />
                  <span class="max-w-[150px] truncate">{{ entity.title }}</span>
                  <button
                    class="ml-0.5 hover:text-primary/80 shrink-0"
                    @click="removeMention(entity.id)"
                  >
                    <UIcon name="i-lucide-x" class="w-3 h-3" />
                  </button>
                </span>
              </div>

              <!-- Textarea -->
              <div class="px-4 pt-3">
                <textarea
                  ref="inputRef"
                  v-model="messageInput"
                  placeholder="Ask about your tasks, clients, boards... Type @ to reference"
                  class="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted min-h-[72px] max-h-[200px]"
                  :rows="3"
                  :disabled="sending"
                  :aria-expanded="mentionDropdownOpen && mentionResults.length > 0"
                  aria-controls="mention-listbox"
                  @keydown="handleKeydown"
                  @input="autoResizeInput(); handleMentionInput()"
                />
              </div>
              <!-- Bottom bar inside the card -->
              <div class="flex items-center justify-between px-3 py-2">
                <div class="flex items-center gap-1">
                  <!-- Persona picker (Slice 1.5) — narrows the AI's tools/focus, generalist by default.
                       Hidden until AI_TOOLS_ENABLED is on (the loop it drives is flag-gated). -->
                  <USelect
                    v-if="aiToolsEnabled"
                    v-model="selectedPersona"
                    :items="personaItems"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-sparkles"
                    class="w-auto mr-1"
                    :disabled="sending"
                    :ui="{ base: 'text-[11px]' }"
                  />
                  <!-- Recording indicator -->
                  <template v-if="isRecording">
                    <span class="flex items-center gap-1.5 px-1">
                      <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span class="text-[10px] text-red-500 font-medium">Listening...</span>
                      <span class="h-3 w-12 flex items-end gap-px">
                        <span
                          v-for="i in 6"
                          :key="i"
                          class="flex-1 bg-red-400 rounded-t transition-all duration-75"
                          :style="{ height: Math.max(2, Math.min(12, volumeLevel * 80 * (0.5 + Math.random() * 0.5))) + 'px' }"
                        />
                      </span>
                      <button
                        class="ml-1 text-muted hover:text-default transition-colors"
                        @click.stop="cancelRecording"
                      >
                        <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </template>
                  <template v-else-if="voiceProcessing">
                    <span class="flex items-center gap-1.5 px-1">
                      <span class="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      <span class="text-[10px] text-primary font-medium">Processing voice...</span>
                    </span>
                  </template>
                  <template v-else>
                    <span class="text-[10px] text-muted px-1">
                      <kbd class="font-mono text-[10px] px-1 py-0.5 rounded bg-default border border-default">@</kbd>
                      to reference
                      <span class="mx-1 text-muted/40">&middot;</span>
                      <kbd class="font-mono text-[10px] px-1 py-0.5 rounded bg-default border border-default">Enter</kbd>
                      to send
                    </span>
                  </template>
                </div>
                <div class="flex items-center gap-1.5">
                  <!-- Hands-free voice session (agentic, open-mic) — gated like the persona picker -->
                  <UButton
                    v-if="aiToolsEnabled && voiceAvailable"
                    :icon="voiceSession.isActive.value ? 'i-lucide-square' : 'i-lucide-radio'"
                    :color="voiceSession.isActive.value ? 'error' : 'neutral'"
                    :variant="voiceSession.isActive.value ? 'solid' : 'ghost'"
                    size="sm"
                    class="rounded-lg"
                    :disabled="sending || isRecording || voiceProcessing"
                    :title="voiceSession.isActive.value ? 'Stop voice session' : 'Start hands-free voice session'"
                    @click="toggleVoiceSession"
                  />
                  <!-- Voice button -->
                  <UButton
                    v-if="voiceAvailable"
                    :icon="voicePlaying ? 'i-lucide-volume-x' : isRecording ? 'i-lucide-square' : 'i-lucide-mic'"
                    :color="isRecording ? 'error' : voicePlaying ? 'warning' : 'neutral'"
                    :variant="isRecording || voicePlaying ? 'solid' : 'ghost'"
                    size="sm"
                    class="rounded-lg"
                    :loading="voiceProcessing"
                    :disabled="sending || voiceProcessing || voiceSession.isActive.value"
                    @click="handleVoiceRecord"
                  />
                  <!-- Send button -->
                  <UButton
                    icon="i-lucide-arrow-up"
                    color="primary"
                    size="sm"
                    :class="[
                      'rounded-lg transition-all duration-150',
                      (!messageInput.trim() || sending || isRecording) ? 'opacity-40' : 'opacity-100 shadow-sm'
                    ]"
                    :loading="sending"
                    :disabled="!messageInput.trim() || sending || isRecording"
                    @click="handleSend"
                  />
                </div>
              </div>
            </div>
            <p class="text-[10px] text-muted text-center mt-2">
              AI responses are generated using agency data. Always verify critical information.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Context Panel -->
    <div
      :class="[
        'flex flex-col border-l border-default bg-elevated/50 transition-all duration-200 overflow-hidden',
        contextPanelOpen ? 'w-80 min-w-80' : 'w-0 min-w-0',
      ]"
    >
      <!-- Panel Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-default shrink-0">
        <h3 class="text-sm font-semibold">Context</h3>
        <UButton
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="contextPanelOpen = false"
        />
      </div>

      <div class="flex-1 overflow-y-auto">
        <!-- Overdue Tasks -->
        <div v-if="overdueTasks.length > 0" class="px-3 py-3 border-b border-default">
          <div class="flex items-center gap-1.5 mb-2">
            <UIcon name="i-lucide-alert-circle" class="w-3.5 h-3.5 text-error" />
            <span class="text-xs font-semibold uppercase tracking-wider text-error">Overdue</span>
            <UBadge :label="String(overdueTasks.length)" size="xs" color="error" variant="subtle" />
          </div>
          <div class="space-y-1.5">
            <NuxtLink
              v-for="task in overdueTasks"
              :key="task.id"
              :to="`/agency/tasks/${task.id}`"
              class="flex items-start gap-2 px-2.5 py-2 rounded-lg hover:bg-elevated transition-colors group"
            >
              <UIcon name="i-lucide-check-square" class="w-3.5 h-3.5 text-error shrink-0 mt-0.5" />
              <div class="min-w-0 flex-1">
                <div class="text-xs font-medium truncate group-hover:text-primary transition-colors">{{ task.title }}</div>
                <div class="text-[10px] text-muted flex items-center gap-1 mt-0.5">
                  <span>Due {{ relativeTime(task.dueDate) }}</span>
                  <span v-if="task.project?.name" class="truncate">&middot; {{ task.project.name }}</span>
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Upcoming Tasks -->
        <div v-if="upcomingTasks.length > 0" class="px-3 py-3 border-b border-default">
          <div class="flex items-center gap-1.5 mb-2">
            <UIcon name="i-lucide-calendar-clock" class="w-3.5 h-3.5 text-muted" />
            <span class="text-xs font-semibold uppercase tracking-wider text-muted">Upcoming</span>
          </div>
          <div class="space-y-1.5">
            <NuxtLink
              v-for="task in upcomingTasks"
              :key="task.id"
              :to="`/agency/tasks/${task.id}`"
              class="flex items-start gap-2 px-2.5 py-2 rounded-lg hover:bg-elevated transition-colors group"
            >
              <UIcon name="i-lucide-check-square" class="w-3.5 h-3.5 text-muted shrink-0 mt-0.5" />
              <div class="min-w-0 flex-1">
                <div class="text-xs font-medium truncate group-hover:text-primary transition-colors">{{ task.title }}</div>
                <div class="text-[10px] text-muted flex items-center gap-1 mt-0.5">
                  <span>Due {{ relativeTime(task.dueDate) }}</span>
                  <UBadge v-if="task.status?.name" :label="task.status.name" size="xs" :color="getStatusColor(task.status.category || task.status.name)" variant="subtle" />
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Referenced Entities (from AI responses in this conversation) -->
        <div v-if="referencedEntities.length > 0" class="px-3 py-3">
          <div class="flex items-center gap-1.5 mb-2">
            <UIcon name="i-lucide-link" class="w-3.5 h-3.5 text-muted" />
            <span class="text-xs font-semibold uppercase tracking-wider text-muted">Referenced</span>
            <UBadge :label="String(referencedEntities.length)" size="xs" color="neutral" variant="subtle" />
          </div>

          <template v-for="(entities, entityType) in groupedEntities" :key="entityType">
            <div class="mb-3">
              <div class="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1 px-1">
                {{ entityTypeLabels[entityType] || entityType }}
              </div>
              <div class="space-y-1">
                <NuxtLink
                  v-for="entity in entities"
                  :key="entity.id"
                  :to="entity.url"
                  class="flex items-start gap-2 px-2.5 py-2 rounded-lg hover:bg-elevated transition-colors group"
                >
                  <div class="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <UIcon :name="ENTITY_ICONS[entity.type] || 'i-lucide-hash'" class="w-3 h-3 text-primary" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-xs font-medium truncate group-hover:text-primary transition-colors">{{ entity.title }}</div>
                    <div class="text-[10px] text-muted line-clamp-2 mt-0.5">{{ entity.snippet }}</div>
                  </div>
                  <UIcon name="i-lucide-arrow-up-right" class="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 shrink-0 mt-1" />
                </NuxtLink>
              </div>
            </div>
          </template>
        </div>

        <!-- Empty state when no entities and no tasks -->
        <div v-if="referencedEntities.length === 0 && overdueTasks.length === 0 && upcomingTasks.length === 0" class="flex flex-col items-center justify-center h-full text-center px-6 py-12">
          <div class="w-10 h-10 rounded-full bg-muted/10 flex items-center justify-center mb-3">
            <UIcon name="i-lucide-layout-panel-left" class="w-5 h-5 text-muted" />
          </div>
          <p class="text-xs text-muted">
            As you chat, referenced tasks, clients, and projects will appear here.
          </p>
        </div>
      </div>
    </div>

    <!-- Feedback correction modal -->
    <UModal v-model:open="feedbackModalOpen">
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
            <UButton variant="ghost" color="neutral" @click="feedbackModalOpen = false">
              Skip
            </UButton>
            <UButton color="primary" @click="submitCorrectionFeedback">
              Submit Feedback
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Cleanup modal -->
    <UModal v-model:open="cleanupModalOpen">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-3">Clean Up Old Conversations</h3>
          <p class="text-sm text-muted mb-4">
            Archive conversations with no activity in the selected period.
            This helps keep your chat list tidy.
          </p>
          <div class="flex items-center gap-3 mb-4">
            <span class="text-sm">Older than</span>
            <USelect
              :model-value="String(cleanupDays)"
              :items="[
                { label: '30 days', value: '30' },
                { label: '60 days', value: '60' },
                { label: '90 days', value: '90' },
                { label: '180 days', value: '180' },
              ]"
              size="sm"
              class="w-32"
              @update:model-value="(v: string) => cleanupDays = Number(v)"
            />
          </div>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="cleanupModalOpen = false">
              Cancel
            </UButton>
            <UButton color="primary" :loading="cleanupLoading" @click="handleCleanup">
              Clean Up
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

  // Links (sanitize javascript: URLs)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    if (/^javascript:/i.test(url.trim())) return text
    return `<a href="${url}" class="text-primary underline">${text}</a>`
  })

  // Line breaks (double newline = paragraph)
  html = html.replace(/\n\n/g, '</p><p class="my-2">')
  html = html.replace(/\n/g, '<br>')

  return `<p class="my-1">${html}</p>`
}
</script>
