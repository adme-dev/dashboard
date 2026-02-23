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
        <UTooltip text="Add emoji">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-smile"
            @click="showEmoji = !showEmoji"
          />
        </UTooltip>

        <!-- File Attachment -->
        <UTooltip text="Attach file">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-paperclip"
            @click="onAttachClick"
          />
        </UTooltip>

        <!-- Internal/Private Toggle -->
        <UTooltip text="Make internal (only team)">
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
          :disabled="!content.trim()"
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

const content = ref('')
const isInternal = ref(false)
const loading = ref(false)
const textareaRef = ref<HTMLTextAreaElement>()
const fileInputRef = ref<HTMLInputElement>()
const mentionDropdownRef = ref()
const showEmoji = ref(false)

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
    nextTick(() => textareaRef.value?.focus())
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
  const textarea = textareaRef.value
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
  // Simple positioning - could be improved with getBoundingClientRect
  const rect = textarea.getBoundingClientRect()
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
  
  const beforeMention = content.value.slice(0, mentionStartIndex.value)
  const afterMention = content.value.slice(
    textareaRef.value!.selectionStart
  )
  
  // Use the appropriate mention format
  const mentionText = item.is_team ? item.name : item.name
  content.value = `${beforeMention}@${mentionText} ${afterMention}`
  showMentions.value = false
  mentionQuery.value = ''
  
  // Focus back to textarea
  nextTick(() => textareaRef.value?.focus())
}

// Handle invite button
const onInviteMember = () => {
  showMentions.value = false
  // TODO: Open invite modal
  console.log('Invite member clicked')
}

// Insert @ symbol
const insertAtMention = () => {
  const textarea = textareaRef.value
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
  if (!trimmed || loading.value) return

  loading.value = true
  emit('submit', trimmed, isInternal.value)
  
  // Reset form
  content.value = ''
  isInternal.value = false
  loading.value = false
}

// File attachment
const onAttachClick = () => {
  fileInputRef.value?.click()
}

const onFileSelect = (event: Event) => {
  const files = (event.target as HTMLInputElement).files
  if (files && files.length > 0) {
    // Handle file upload
    console.log('Files selected:', files)
    // TODO: Implement file upload
  }
}

// Expose for parent
defineExpose({
  focus: () => textareaRef.value?.focus(),
  clear: () => { content.value = '' }
})
</script>

<style scoped>
.comment-input-wrapper :deep(.mention-highlight) {
  color: #3b82f6;
  font-weight: 500;
}
</style>
