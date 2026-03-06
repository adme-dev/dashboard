<template>
  <div class="comment-input-wrapper relative">
    <!-- Textarea with mention support -->
    <div class="relative">
      <UTextarea
        ref="textareaRef"
        v-model="content"
        :placeholder="placeholder"
        :rows="rows"
        class="w-full"
        :ui="{
          base: 'resize-none focus:ring-2 focus:ring-primary-500 rounded-lg'
        }"
        @keydown="onKeydown"
        @input="onInput"
      />

      <!-- Mention Dropdown -->
      <TaskMentionDropdown
        ref="mentionDropdownRef"
        :show="showMentions"
        :suggestions="mentionSuggestions"
        :loading="mentionLoading"
        :position="dropdownPosition"
        @select="onMentionSelect"
        @close="showMentions = false"
        @invite="onInviteMember"
      />
    </div>

    <!-- Pending Attachments -->
    <div v-if="pendingAttachments.length > 0" class="flex flex-wrap gap-2 mt-2">
      <div
        v-for="(file, idx) in pendingAttachments"
        :key="idx"
        class="flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-neutral-800 rounded-md text-xs"
      >
        <UIcon :name="getFileIcon(file.type)" class="w-3.5 h-3.5 text-gray-500 dark:text-neutral-400" />
        <span class="max-w-[120px] truncate text-gray-700 dark:text-neutral-300">{{ file.name }}</span>
        <span v-if="file.uploading" class="text-gray-400">
          <UIcon name="i-lucide-loader-2" class="w-3 h-3 animate-spin" />
        </span>
        <UIcon
          v-else-if="file.uploaded"
          name="i-lucide-check"
          class="w-3 h-3 text-green-500"
        />
        <button
          v-if="!file.uploading"
          class="text-gray-400 hover:text-red-500 transition-colors"
          @click="removePendingAttachment(idx)"
        >
          <UIcon name="i-lucide-x" class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center justify-between mt-2">
      <div class="flex items-center gap-1">
        <!-- @ Mention Button -->
        <UTooltip text="Mention someone">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-at-sign"
            @click="insertAtMention"
          />
        </UTooltip>

        <!-- Emoji Button -->
        <UPopover v-model:open="showEmoji">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-smile"
          />
          <template #content>
            <div class="p-2 w-[280px]">
              <div class="grid grid-cols-8 gap-1">
                <button
                  v-for="emoji in commonEmojis"
                  :key="emoji"
                  class="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-neutral-700 rounded cursor-pointer transition-colors"
                  @click="insertEmoji(emoji)"
                >
                  {{ emoji }}
                </button>
              </div>
            </div>
          </template>
        </UPopover>

        <!-- File Attachment -->
        <UTooltip text="Attach file">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-paperclip"
            :loading="attachUploading"
            @click="onAttachClick"
          />
        </UTooltip>

        <!-- Internal/Private Toggle -->
        <UTooltip :text="isInternal ? 'Internal (only team can see)' : 'Make internal (only team)'">
          <UButton
            variant="ghost"
            :color="isInternal ? 'warning' : 'neutral'"
            size="sm"
            :icon="isInternal ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            @click="isInternal = !isInternal"
          />
        </UTooltip>
      </div>

      <div class="flex items-center gap-2">
        <!-- Cancel Button (if replying) -->
        <UButton
          v-if="parentId"
          variant="ghost"
          color="neutral"
          size="sm"
          @click="$emit('cancel')"
        >
          Cancel
        </UButton>

        <!-- Submit Button -->
        <UButton
          color="primary"
          size="sm"
          :loading="loading"
          :disabled="!content.trim() && pendingAttachments.length === 0"
          @click="submit"
        >
          {{ submitLabel }}
        </UButton>
      </div>
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      class="hidden"
      multiple
      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.psd,.ai,.sketch,.fig"
      @change="onFileSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { useUserMentions } from '~/composables/useTaskComments'

interface Props {
  taskId: string
  parentId?: string
  placeholder?: string
  submitLabel?: string
  rows?: number
  autoFocus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Write an update and mention others with @',
  submitLabel: 'Update',
  rows: 3,
  autoFocus: false
})

const emit = defineEmits<{
  submit: [content: string, isInternal: boolean]
  cancel: []
}>()

const toast = useToast()
const content = ref('')
const isInternal = ref(false)
const loading = ref(false)
const textareaRef = ref()
const fileInputRef = ref<HTMLInputElement>()
const mentionDropdownRef = ref()
const showEmoji = ref(false)
const attachUploading = ref(false)

// Common emojis for the picker
const commonEmojis = [
  '👍', '👎', '❤️', '🔥', '🎉', '😊', '😂', '🤔',
  '👏', '💪', '✅', '❌', '⭐', '🚀', '💡', '📌',
  '🙌', '👀', '💯', '🎯', '⚡', '🛠️', '📎', '🔗',
  '😍', '🤝', '🏆', '📊', '💬', '🔔', '✏️', '📝',
]

// Pending file attachments
interface PendingFile {
  name: string
  type: string
  size: number
  uploading: boolean
  uploaded: boolean
  file: File
}
const pendingAttachments = ref<PendingFile[]>([])

// Helper: get the native textarea element from UTextarea component ref
const getNativeTextarea = (): HTMLTextAreaElement | null => {
  const el = textareaRef.value?.$el || textareaRef.value
  if (el instanceof HTMLTextAreaElement) return el
  return el?.querySelector?.('textarea') || null
}

// Helper: get file icon based on MIME type
const getFileIcon = (type: string): string => {
  if (type.startsWith('image/')) return 'i-lucide-image'
  if (type.includes('pdf')) return 'i-lucide-file-text'
  if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) return 'i-lucide-file-spreadsheet'
  if (type.includes('document') || type.includes('word')) return 'i-lucide-file-text'
  if (type.includes('zip') || type.includes('archive')) return 'i-lucide-file-archive'
  return 'i-lucide-file'
}

// Mention handling
const mentionSuggestions = ref<any[]>([])
const mentionLoading = ref(false)
const showMentions = ref(false)
const mentionQuery = ref('')
const dropdownPosition = ref({ top: '0px', left: '0px' })
const mentionStartIndex = ref(-1)
let mentionDebounceTimeout: NodeJS.Timeout | null = null

onMounted(() => {
  if (props.autoFocus) {
    nextTick(() => getNativeTextarea()?.focus())
  }
})

// Watch for mention query changes with debounce
watch(mentionQuery, async (query) => {
  if (mentionDebounceTimeout) {
    clearTimeout(mentionDebounceTimeout)
  }

  mentionDebounceTimeout = setTimeout(async () => {
    if (query.length >= 0) {
      await searchMentions(query)
    }
  }, 150)
})

// Search mentions (users + teams)
const searchMentions = async (query: string) => {
  mentionLoading.value = true
  try {
    const response = await $fetch('/api/users/search', {
      query: {
        q: query,
        taskId: props.taskId,
        limit: 15
      }
    })
    mentionSuggestions.value = response.suggestions || []
  } catch (err) {
    console.error('Failed to search mentions:', err)
    mentionSuggestions.value = []
  } finally {
    mentionLoading.value = false
  }
}

// Input handler for mention detection
const onInput = () => {
  const textarea = getNativeTextarea()
  if (!textarea) return

  const cursorPos = textarea.selectionStart
  const text = content.value

  // Find if we're typing after an @
  const lastAtIndex = text.lastIndexOf('@', cursorPos - 1)

  if (lastAtIndex !== -1 && cursorPos > lastAtIndex) {
    // Check if there's a space between @ and cursor (would mean new word)
    const betweenText = text.slice(lastAtIndex + 1, cursorPos)

    if (!betweenText.includes(' ')) {
      // We're in a mention
      mentionQuery.value = betweenText.toLowerCase()
      mentionStartIndex.value = lastAtIndex
      showMentions.value = true

      // Calculate dropdown position
      updateDropdownPosition(textarea, lastAtIndex)
    } else {
      showMentions.value = false
    }
  } else {
    showMentions.value = false
  }
}

// Update dropdown position based on cursor
const updateDropdownPosition = (textarea: HTMLTextAreaElement, atIndex: number) => {
  const lineHeight = 20
  const lines = textarea.value.slice(0, atIndex).split('\n').length

  dropdownPosition.value = {
    top: `${lines * lineHeight + 10}px`,
    left: '10px'
  }
}

// Handle mention selection
const onMentionSelect = (item: any) => {
  if (mentionStartIndex.value === -1) return

  const textarea = getNativeTextarea()
  const cursorPos = textarea?.selectionStart ?? content.value.length
  const beforeMention = content.value.slice(0, mentionStartIndex.value)
  const afterMention = content.value.slice(cursorPos)

  const mentionText = item.name
  content.value = `${beforeMention}@${mentionText} ${afterMention}`
  showMentions.value = false
  mentionQuery.value = ''

  // Focus back to textarea
  nextTick(() => getNativeTextarea()?.focus())
}

// Handle invite button
const onInviteMember = () => {
  showMentions.value = false
}

// Insert @ symbol
const insertAtMention = () => {
  const textarea = getNativeTextarea()
  if (!textarea) return

  const start = textarea.selectionStart
  const end = textarea.selectionEnd

  content.value = content.value.slice(0, start) + '@' + content.value.slice(end)

  nextTick(() => {
    textarea.selectionStart = textarea.selectionEnd = start + 1
    textarea.focus()
    onInput()
  })
}

// Insert emoji at cursor
const insertEmoji = (emoji: string) => {
  const textarea = getNativeTextarea()
  if (!textarea) {
    // Fallback: append to end
    content.value += emoji
    showEmoji.value = false
    return
  }

  const start = textarea.selectionStart
  const end = textarea.selectionEnd

  content.value = content.value.slice(0, start) + emoji + content.value.slice(end)
  showEmoji.value = false

  nextTick(() => {
    textarea.selectionStart = textarea.selectionEnd = start + emoji.length
    textarea.focus()
  })
}

// Keyboard handling
const onKeydown = (event: KeyboardEvent) => {
  // Pass to mention dropdown if visible
  if (showMentions.value && mentionDropdownRef.value) {
    mentionDropdownRef.value.handleKeydown(event)
    if (event.defaultPrevented) return
  }

  // Submit on Ctrl+Enter or Cmd+Enter
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    submit()
  }
}

// Submit comment
const submit = () => {
  const trimmed = content.value.trim()
  if ((!trimmed && pendingAttachments.value.length === 0) || loading.value) return

  loading.value = true
  // If there are attachments, append references to the content
  let finalContent = trimmed
  const uploadedFiles = pendingAttachments.value.filter(f => f.uploaded)
  if (uploadedFiles.length > 0 && !trimmed) {
    finalContent = `Attached ${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''}: ${uploadedFiles.map(f => f.name).join(', ')}`
  }

  emit('submit', finalContent, isInternal.value)

  // Reset form
  content.value = ''
  isInternal.value = false
  pendingAttachments.value = []
  loading.value = false
}

// File attachment
const onAttachClick = () => {
  fileInputRef.value?.click()
}

const onFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

  for (const file of Array.from(files)) {
    const pending: PendingFile = {
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      uploading: true,
      uploaded: false,
      file,
    }
    pendingAttachments.value.push(pending)

    // Upload file as task attachment
    uploadAttachment(pending)
  }

  // Reset input so the same file can be re-selected
  input.value = ''
}

const uploadAttachment = async (pending: PendingFile) => {
  attachUploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', pending.file)

    await $fetch(`/api/agency/tasks/${props.taskId}/attachments`, {
      method: 'POST',
      body: formData,
    })

    pending.uploading = false
    pending.uploaded = true
    toast.add({ title: 'File attached', description: pending.name, color: 'success' })
  } catch (err: any) {
    console.error('Failed to upload attachment:', err)
    pending.uploading = false
    toast.add({
      title: 'Upload failed',
      description: err?.data?.statusMessage || `Failed to upload ${pending.name}`,
      color: 'error',
    })
    // Remove failed attachment from list
    const idx = pendingAttachments.value.indexOf(pending)
    if (idx !== -1) pendingAttachments.value.splice(idx, 1)
  } finally {
    attachUploading.value = pendingAttachments.value.some(f => f.uploading)
  }
}

const removePendingAttachment = (idx: number) => {
  pendingAttachments.value.splice(idx, 1)
}

// Expose for parent
defineExpose({
  focus: () => getNativeTextarea()?.focus(),
  clear: () => { content.value = ''; pendingAttachments.value = [] }
})
</script>

<style scoped>
.comment-input-wrapper :deep(.mention-highlight) {
  color: #3b82f6;
  font-weight: 500;
}
</style>
