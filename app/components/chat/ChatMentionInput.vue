<script setup lang="ts">
import type { ChatMessage } from '~/types'

const props = defineProps<{
  typingText?: string
  disabled?: boolean
  // Connection-state signal that drives the "Reconnecting…" banner. Distinct
  // from `disabled` (which also goes true for transient reasons like an
  // in-flight REST send in the Activity Hub mini-chat) so the banner only
  // appears when the socket is genuinely down.
  reconnecting?: boolean
  editingMessage?: { id: number; content: string } | null
  replyingTo?: ChatMessage | null
  channelId?: string
}>()
const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>

const emit = defineEmits<{
  'send': [content: string, mentions?: string[], attachments?: Array<{ url: string; name: string; type: string; size: number }>, replyToId?: number]
  'typing': []
  'cancel-edit': []
  'save-edit': [messageId: number, content: string]
  'cancel-reply': []
}>()

// File upload state
const fileUploadRef = ref<InstanceType<any> | null>(null)
const pendingAttachments = ref<Array<{ url: string; name: string; type: string; size: number; key: string }>>([])
const showEmojiPicker = ref(false)

function handleFileUploaded(att: { url: string; name: string; type: string; size: number; key: string }) {
  pendingAttachments.value.push(att)
}

function removePendingAttachment(index: number) {
  pendingAttachments.value.splice(index, 1)
}

function insertEmoji(emoji: string) {
  content.value += emoji
  showEmojiPicker.value = false
  nextTick(() => textareaRef.value?.focus())
}

const content = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const showFormatBar = ref(false)
const focused = ref(false)

// The send/save button is active only when there's something to send.
const canSend = computed(() =>
  (content.value.trim().length > 0 || pendingAttachments.value.length > 0) && !props.disabled
)

// ── Formatting helpers ──
function getTextarea(): HTMLTextAreaElement | null {
  // UTextarea wraps a native textarea — access via $el or ref
  const el = (textareaRef.value as any)?.$el || textareaRef.value
  return el?.querySelector?.('textarea') || el
}

function wrapSelection(prefix: string, suffix?: string) {
  const ta = getTextarea()
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const text = content.value
  const selected = text.substring(start, end)
  const suf = suffix ?? prefix

  if (selected) {
    content.value = text.substring(0, start) + prefix + selected + suf + text.substring(end)
    nextTick(() => {
      ta.focus()
      ta.setSelectionRange(start + prefix.length, end + prefix.length)
    })
  } else {
    // Insert placeholder
    const placeholder = prefix === '```\n' ? 'code' : 'text'
    content.value = text.substring(0, start) + prefix + placeholder + suf + text.substring(end)
    nextTick(() => {
      ta.focus()
      ta.setSelectionRange(start + prefix.length, start + prefix.length + placeholder.length)
    })
  }
}

function insertLink() {
  const ta = getTextarea()
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const text = content.value
  const selected = text.substring(start, end)

  if (selected) {
    content.value = text.substring(0, start) + `[${selected}](url)` + text.substring(end)
    nextTick(() => {
      ta.focus()
      // Select "url" for replacement
      const urlStart = start + selected.length + 3
      ta.setSelectionRange(urlStart, urlStart + 3)
    })
  } else {
    content.value = text.substring(0, start) + '[text](url)' + text.substring(end)
    nextTick(() => {
      ta.focus()
      ta.setSelectionRange(start + 1, start + 5)
    })
  }
}

function formatBold() { wrapSelection('**') }
function formatItalic() { wrapSelection('*') }
function formatStrikethrough() { wrapSelection('~~') }
function formatCode() { wrapSelection('`') }
function formatCodeBlock() { wrapSelection('```\n', '\n```') }

// Mention state
const showMentions = ref(false)
const mentionQuery = ref('')
const mentionStartPos = ref(-1)
const selectedMentionIndex = ref(0)

// Fetch team members for mention autocomplete
const teamMembersData = ref<any | null>(null)

async function refreshTeamMembers() {
  teamMembersData.value = await apiFetch<any>('/api/agency/team-members')
}

refreshTeamMembers()

const teamMembers = computed(() => ((teamMembersData.value as any)?.members as any[]) || [])

const filteredMentions = computed(() => {
  if (!mentionQuery.value) return teamMembers.value.slice(0, 8)
  const q = mentionQuery.value.toLowerCase()
  return teamMembers.value
    .filter((m: any) => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q))
    .slice(0, 8)
})

// When entering edit mode, populate the input
watch(() => props.editingMessage, (msg) => {
  if (msg) {
    content.value = msg.content
    nextTick(() => textareaRef.value?.focus())
  }
})

function handleInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  const text = target.value
  const cursorPos = target.selectionStart || 0

  // Check if we're in a mention context
  const textBeforeCursor = text.substring(0, cursorPos)
  const atIndex = textBeforeCursor.lastIndexOf('@')

  if (atIndex !== -1) {
    const textAfterAt = textBeforeCursor.substring(atIndex + 1)
    // Only show mentions if there's no space before the @ (or it's at the start)
    const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' '
    if ((charBeforeAt === ' ' || charBeforeAt === '\n' || atIndex === 0) && !/\s/.test(textAfterAt)) {
      showMentions.value = true
      mentionQuery.value = textAfterAt
      mentionStartPos.value = atIndex
      selectedMentionIndex.value = 0
      return
    }
  }

  showMentions.value = false
  mentionQuery.value = ''
}

function insertMention(member: any) {
  const name = member.name as string
  const before = content.value.substring(0, mentionStartPos.value)
  const afterPos = mentionStartPos.value + 1 + mentionQuery.value.length
  const after = content.value.substring(afterPos)

  // Use @"Name" format for names with spaces, @Name for single-word names
  const mentionText = name.includes(' ') ? `@"${name}" ` : `@${name} `
  content.value = before + mentionText + after

  showMentions.value = false
  mentionQuery.value = ''
  nextTick(() => textareaRef.value?.focus())
}

function handleKeydown(e: KeyboardEvent) {
  // Mention navigation
  if (showMentions.value && filteredMentions.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedMentionIndex.value = (selectedMentionIndex.value + 1) % filteredMentions.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedMentionIndex.value = selectedMentionIndex.value === 0
        ? filteredMentions.value.length - 1
        : selectedMentionIndex.value - 1
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertMention(filteredMentions.value[selectedMentionIndex.value])
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      showMentions.value = false
      return
    }
  }

  // Formatting shortcuts
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
    if (e.key === 'b') { e.preventDefault(); formatBold(); return }
    if (e.key === 'i') { e.preventDefault(); formatItalic(); return }
    if (e.key === 'k') { e.preventDefault(); insertLink(); return }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
    return
  }
  if (e.key === 'Escape') {
    if (props.editingMessage) {
      emit('cancel-edit')
      content.value = ''
      return
    }
    if (props.replyingTo) {
      emit('cancel-reply')
      return
    }
  }
  // Emit typing on any other key
  emit('typing')
}

function extractMentionIds(): string[] {
  const mentionPattern = /@"([^"]+)"|@(\S+)/g
  const names: string[] = []
  let match

  while ((match = mentionPattern.exec(content.value)) !== null) {
    const name = (match[1] || match[2] || '').trim()
    if (name) names.push(name.toLowerCase())
  }

  return teamMembers.value
    .filter((m: any) => names.includes(m.name?.toLowerCase()))
    .map((m: any) => m.id)
}

function handleSend() {
  const text = content.value.trim()
  if (!text && pendingAttachments.value.length === 0) return

  if (props.editingMessage) {
    emit('save-edit', props.editingMessage.id, text)
  } else {
    const mentionIds = extractMentionIds()
    const attachments = pendingAttachments.value.length > 0
      ? pendingAttachments.value.map(({ url, name, type, size }) => ({ url, name, type, size }))
      : undefined
    const replyToId = props.replyingTo?.id
    emit('send', text || ' ', mentionIds.length > 0 ? mentionIds : undefined, attachments, replyToId)
    if (replyToId) emit('cancel-reply')
  }
  content.value = ''
  pendingAttachments.value = []
  showMentions.value = false
}
</script>

<template>
  <div class="border-t border-default px-4 py-3">
    <!-- Connection state — only while the socket is genuinely down (not for an
         in-flight send), so the mini-chat doesn't flash this on every message. -->
    <div
      v-if="reconnecting"
      class="flex items-center gap-2 mb-2 px-2.5 py-1.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs"
    >
      <UIcon name="i-lucide-loader-circle" class="w-3.5 h-3.5 animate-spin shrink-0" />
      <span>Reconnecting to chat… you can’t send messages right now.</span>
    </div>

    <!-- Typing indicator -->
    <div v-if="typingText" class="text-xs text-muted mb-1.5 px-1 animate-pulse">
      {{ typingText }}
    </div>

    <!-- Edit mode banner -->
    <div v-if="editingMessage" class="flex items-center gap-2 mb-2 px-1">
      <UIcon name="i-lucide-pencil" class="w-3.5 h-3.5 text-primary" />
      <span class="text-xs text-primary font-medium">Editing message</span>
      <UButton
        label="Cancel"
        variant="link"
        color="neutral"
        size="xs"
        @click="emit('cancel-edit'); content = ''"
      />
    </div>

    <!-- Reply-to preview -->
    <div v-if="replyingTo && !editingMessage" class="flex items-start gap-2 mb-2 px-1 py-1.5 bg-elevated/50 rounded-md border-l-2 border-primary/50">
      <UIcon name="i-lucide-reply" class="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
      <div class="flex-1 min-w-0">
        <span class="text-xs font-semibold text-primary">{{ replyingTo.user_name }}</span>
        <p class="text-xs text-muted line-clamp-2">{{ replyingTo.content }}</p>
      </div>
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        size="xs"
        class="shrink-0"
        @click="emit('cancel-reply')"
      />
    </div>

    <!-- Pending attachments preview -->
    <div v-if="pendingAttachments.length > 0" class="flex flex-wrap gap-2 mb-2 px-1">
      <div
        v-for="(att, idx) in pendingAttachments"
        :key="att.key"
        class="flex items-center gap-2 px-2 py-1 bg-elevated rounded-lg border border-default text-xs"
      >
        <UIcon name="i-lucide-paperclip" class="w-3.5 h-3.5 text-muted" />
        <span class="truncate max-w-32">{{ att.name }}</span>
        <UButton
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          size="xs"
          class="shrink-0"
          @click="removePendingAttachment(idx)"
        />
      </div>
    </div>

    <!-- Formatting toolbar -->
    <div v-if="showFormatBar" class="flex items-center gap-0.5 mb-1.5 px-1">
      <UTooltip text="Bold (Ctrl+B)">
        <UButton icon="i-lucide-bold" variant="ghost" color="neutral" size="xs" @click="formatBold" />
      </UTooltip>
      <UTooltip text="Italic (Ctrl+I)">
        <UButton icon="i-lucide-italic" variant="ghost" color="neutral" size="xs" @click="formatItalic" />
      </UTooltip>
      <UTooltip text="Strikethrough">
        <UButton icon="i-lucide-strikethrough" variant="ghost" color="neutral" size="xs" @click="formatStrikethrough" />
      </UTooltip>
      <div class="w-px h-4 bg-default mx-0.5" />
      <UTooltip text="Inline code">
        <UButton icon="i-lucide-code" variant="ghost" color="neutral" size="xs" @click="formatCode" />
      </UTooltip>
      <UTooltip text="Code block">
        <UButton icon="i-lucide-square-code" variant="ghost" color="neutral" size="xs" @click="formatCodeBlock" />
      </UTooltip>
      <div class="w-px h-4 bg-default mx-0.5" />
      <UTooltip text="Link (Ctrl+K)">
        <UButton icon="i-lucide-link" variant="ghost" color="neutral" size="xs" @click="insertLink" />
      </UTooltip>
    </div>

    <!-- Input row with mention dropdown -->
    <div class="relative">
      <!-- Mention autocomplete dropdown -->
      <div
        v-if="showMentions && filteredMentions.length > 0"
        class="absolute bottom-full left-0 right-0 mb-1 bg-elevated border border-default rounded-lg shadow-lg max-h-52 overflow-y-auto z-50"
      >
        <button
          v-for="(member, idx) in filteredMentions"
          :key="member.id"
          :class="[
            'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
            idx === selectedMentionIndex ? 'bg-primary/10' : 'hover:bg-elevated/80'
          ]"
          @mousedown.prevent="insertMention(member)"
          @mouseenter="selectedMentionIndex = idx"
        >
          <UAvatar :src="member.avatar_url || undefined" :alt="member.name" size="xs" />
          <div class="min-w-0">
            <div class="text-sm font-medium truncate">{{ member.name }}</div>
            <div class="text-xs text-muted truncate">{{ member.email }}</div>
          </div>
        </button>

        <div v-if="filteredMentions.length === 0" class="px-3 py-2 text-sm text-muted">
          No matching members
        </div>
      </div>

      <!-- Unified composer — textarea on top, action toolbar below, all inside a
           single focus-within container for a cohesive, professional feel. -->
      <div
        class="rounded-xl border border-default bg-default shadow-sm transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/25"
      >
        <div class="px-3 pt-2.5">
          <UTextarea
            ref="textareaRef"
            v-model="content"
            color="neutral"
            variant="none"
            :placeholder="editingMessage ? 'Edit your message…' : 'Type a message…'"
            :rows="1"
            autoresize
            :maxrows="6"
            :disabled="disabled"
            class="w-full"
            :ui="{ base: 'p-0 resize-none text-sm' }"
            @input="handleInput"
            @keydown="handleKeydown"
            @focus="focused = true"
            @blur="focused = false"
          />
        </div>

        <div class="flex items-center gap-0.5 px-2 pb-2 pt-1">
          <!-- File upload -->
          <ChatFileUpload
            v-if="channelId && !editingMessage"
            ref="fileUploadRef"
            :channel-id="channelId"
            :disabled="disabled"
            @uploaded="handleFileUploaded"
          />

          <!-- Formatting toggle -->
          <UTooltip :text="showFormatBar ? 'Hide formatting' : 'Show formatting'">
            <UButton
              icon="i-lucide-a-large-small"
              variant="ghost"
              :color="showFormatBar ? 'primary' : 'neutral'"
              size="sm"
              :disabled="disabled"
              @click="showFormatBar = !showFormatBar"
            />
          </UTooltip>

          <!-- Emoji picker -->
          <UPopover v-model:open="showEmojiPicker">
            <UTooltip text="Emoji">
              <UButton
                icon="i-lucide-smile"
                variant="ghost"
                color="neutral"
                size="sm"
                :disabled="disabled"
                @click="showEmojiPicker = !showEmojiPicker"
              />
            </UTooltip>
            <template #content>
              <ChatEmojiPicker @select="insertEmoji" />
            </template>
          </UPopover>

          <div class="flex-1" />

          <!-- Send / save -->
          <UTooltip :text="editingMessage ? 'Save changes (Enter)' : 'Send message (Enter)'">
            <UButton
              :icon="editingMessage ? 'i-lucide-check' : 'i-lucide-send'"
              :color="editingMessage ? 'success' : 'primary'"
              :variant="canSend ? 'solid' : 'soft'"
              size="sm"
              :disabled="!canSend"
              @click="handleSend"
            />
          </UTooltip>
        </div>
      </div>
    </div>

    <!-- Hints surface only while composing — fixed height avoids layout shift.
         Formatting shortcuts (Ctrl+B/I/K) live in the AA toolbar tooltips. -->
    <div class="h-4 mt-1 px-1 overflow-hidden">
      <p
        v-show="focused || content.length > 0"
        class="text-[10px] text-muted leading-4 whitespace-nowrap"
      >
        <kbd class="font-mono">Enter</kbd> send
        <span class="mx-1 opacity-60">·</span>
        <kbd class="font-mono">Shift+Enter</kbd> new line
        <span class="mx-1 opacity-60">·</span>
        <kbd class="font-mono">@</kbd> mention
      </p>
    </div>
  </div>
</template>
