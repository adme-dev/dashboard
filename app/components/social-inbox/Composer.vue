<script setup lang="ts">
import { insertAtCaret } from '~/utils/insertAtCaret'

interface SavedReply {
  id: string
  name: string
  content: string
}

const props = defineProps<{
  disabled?: boolean
  disabledReason?: string
  sending?: boolean
  approvalRequesting?: boolean
  conversationId?: string | null
  typingWarning?: string | null
}>()
const emit = defineEmits<{
  send: [content: string]
  requestApproval: [content: string]
}>()

const draft = ref('')
const showEmoji = ref(false)
const replyField = ref<{ $el?: HTMLElement } | null>(null)
const aiDrafting = ref(false)
const hasFocus = ref(false)
const typingActive = ref(false)
const typingConversationId = ref<string | null>(null)
const lastTypingPing = ref(0)
const toast = useToast()

const TYPING_PING_MS = 8000
let typingTimer: ReturnType<typeof setTimeout> | null = null

const { data: savedReplies } = await useFetch<SavedReply[]>('/api/agency/social/inbox/saved-replies', { default: () => [] })
const replyItems = computed(() => [(savedReplies.value || []).map(r => ({ label: r.name, onSelect: () => insertReply(r) }))])

function replyTextarea(): HTMLTextAreaElement | null {
  const root = replyField.value?.$el
  if (!root) return null
  return (root.tagName === 'TEXTAREA' ? root : root.querySelector('textarea')) as HTMLTextAreaElement | null
}

function insertReply(r: SavedReply) {
  draft.value = draft.value ? `${draft.value}\n${r.content}` : r.content
  $fetch(`/api/agency/social/inbox/saved-replies/${r.id}`, { method: 'PATCH', body: { incrementUsage: true } }).catch(() => {})
}

function insertEmoji(emoji: string) {
  const el = replyTextarea()
  const text = draft.value || ''
  const start = el ? el.selectionStart : text.length
  const end = el ? el.selectionEnd : text.length
  const { text: next, caret } = insertAtCaret(text, emoji, start, end)
  draft.value = next
  showEmoji.value = false
  nextTick(() => {
    if (!el) return
    el.focus()
    el.setSelectionRange(caret, caret)
  })
}

function clearTypingTimer() {
  if (typingTimer) {
    clearTimeout(typingTimer)
    typingTimer = null
  }
}

async function sendTypingState(conversationId: string, active: boolean) {
  try {
    await $fetch(`/api/agency/social/inbox/conversations/${conversationId}/typing`, {
      method: 'POST',
      body: { active }
    })
  } catch {
    // Typing state is advisory only; failed presence should never block a reply.
  }
}

async function notifyTyping(active: boolean, options: { force?: boolean } = {}) {
  const conversationId = active ? props.conversationId : (typingConversationId.value || props.conversationId)
  if (!conversationId) return
  if (active && props.disabled) return

  const now = Date.now()
  if (active && typingActive.value && !options.force && now - lastTypingPing.value < TYPING_PING_MS) return
  if (!active && !typingActive.value && !options.force) return

  typingActive.value = active
  typingConversationId.value = active ? conversationId : null
  lastTypingPing.value = active ? now : 0
  await sendTypingState(conversationId, active)
}

function scheduleTypingHeartbeat() {
  clearTypingTimer()
  if (!hasFocus.value || !draft.value.trim() || props.disabled || !props.conversationId) return
  typingTimer = setTimeout(() => {
    void notifyTyping(true, { force: true }).then(scheduleTypingHeartbeat)
  }, TYPING_PING_MS)
}

function syncTypingState() {
  const shouldBeActive = hasFocus.value && Boolean(draft.value.trim()) && !props.disabled
  void notifyTyping(shouldBeActive)
  if (shouldBeActive) scheduleTypingHeartbeat()
  else clearTypingTimer()
}

function onFocus() {
  hasFocus.value = true
  syncTypingState()
}

function onBlur() {
  hasFocus.value = false
  syncTypingState()
}

function send() {
  const c = draft.value.trim()
  if (!c) return
  emit('send', c)
  draft.value = ''
  void notifyTyping(false, { force: true })
  clearTypingTimer()
}

function requestApproval() {
  const c = draft.value.trim()
  if (!c) return
  emit('requestApproval', c)
  draft.value = ''
  void notifyTyping(false, { force: true })
  clearTypingTimer()
}

async function aiDraft() {
  if (!props.conversationId) return
  aiDrafting.value = true
  try {
    const res = await $fetch<{ reply: string, confidence: number, risk: boolean }>(
      `/api/agency/social/inbox/conversations/${props.conversationId}/ai-draft`, { method: 'POST', body: {} })
    if (!res.reply) {
      toast.add({ title: 'No draft', description: 'This one needs a human — the model flagged it.', color: 'warning' })
    } else {
      draft.value = res.reply
      if (res.risk || (res.confidence ?? 0) < 0.6) {
        toast.add({
          title: 'Review carefully',
          description: `Low confidence (${Math.round(res.confidence * 100)}%) — edit before sending.`,
          color: 'warning'
        })
      }
    }
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'AI draft failed', description: e.data?.statusMessage || e.message || 'Try again', color: 'error' })
  } finally {
    aiDrafting.value = false
  }
}

watch(draft, syncTypingState)
watch(() => props.disabled, (disabled) => {
  if (disabled) void notifyTyping(false, { force: true })
  syncTypingState()
})
watch(() => props.conversationId, (next, previous) => {
  clearTypingTimer()
  if (previous && typingActive.value) void sendTypingState(previous, false)
  typingActive.value = false
  typingConversationId.value = null
  lastTypingPing.value = 0
  if (next !== previous) draft.value = ''
  syncTypingState()
})

onBeforeUnmount(() => {
  clearTypingTimer()
  const conversationId = typingConversationId.value
  if (conversationId && typingActive.value) void sendTypingState(conversationId, false)
})
</script>

<template>
  <div class="p-3 border-t border-default">
    <UTooltip :text="disabledReason || ''" :disabled="!disabled || !disabledReason">
      <div class="flex flex-col gap-2">
        <div
          v-if="typingWarning"
          class="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-xs text-warning"
          role="status"
        >
          <UIcon name="i-lucide-pencil-line" class="size-3.5 shrink-0" />
          <span class="min-w-0 truncate">{{ typingWarning }}</span>
        </div>
        <UTextarea
          ref="replyField"
          v-model="draft"
          :rows="3"
          :disabled="disabled || sending"
          autoresize
          placeholder="Write a reply…"
          aria-label="Reply"
          class="w-full ring-1 ring-default rounded-md"
          @focus="onFocus"
          @blur="onBlur"
        />
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1">
            <UPopover v-model:open="showEmoji">
              <UTooltip text="Emoji">
                <UButton
                  icon="i-lucide-smile"
                  color="neutral"
                  variant="ghost"
                  aria-label="Insert emoji"
                  :disabled="disabled || sending"
                />
              </UTooltip>
              <template #content>
                <ChatEmojiPicker @select="insertEmoji" />
              </template>
            </UPopover>
            <UDropdownMenu v-if="replyItems[0].length" :items="replyItems">
              <UButton
                label="Saved"
                icon="i-lucide-message-square-text"
                color="neutral"
                variant="ghost"
              />
            </UDropdownMenu>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              v-if="conversationId"
              label="AI draft"
              icon="i-lucide-sparkles"
              color="neutral"
              variant="ghost"
              :loading="aiDrafting"
              :disabled="disabled || aiDrafting"
              @click="aiDraft"
            />
            <UButton
              v-if="conversationId"
              label="Client approval"
              icon="i-lucide-shield-check"
              color="neutral"
              variant="subtle"
              :loading="approvalRequesting"
              :disabled="disabled || sending || approvalRequesting || !draft.trim()"
              @click="requestApproval"
            />
            <UButton
              label="Send reply"
              icon="i-lucide-send"
              :loading="sending"
              :disabled="disabled || approvalRequesting || !draft.trim()"
              @click="send"
            />
          </div>
        </div>
      </div>
    </UTooltip>
  </div>
</template>
