<script setup lang="ts">
const props = defineProps<{
  typingText?: string
  disabled?: boolean
  editingMessage?: { id: number; content: string } | null
}>()

const emit = defineEmits<{
  'send': [content: string]
  'typing': []
  'cancel-edit': []
  'save-edit': [messageId: number, content: string]
}>()

const content = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// When entering edit mode, populate the input
watch(() => props.editingMessage, (msg) => {
  if (msg) {
    content.value = msg.content
    nextTick(() => textareaRef.value?.focus())
  }
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
    return
  }
  if (e.key === 'Escape' && props.editingMessage) {
    emit('cancel-edit')
    content.value = ''
    return
  }
  // Emit typing on any other key
  emit('typing')
}

function handleSend() {
  const text = content.value.trim()
  if (!text) return

  if (props.editingMessage) {
    emit('save-edit', props.editingMessage.id, text)
  } else {
    emit('send', text)
  }
  content.value = ''
}
</script>

<template>
  <div class="border-t border-default px-4 py-3">
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

    <!-- Input row -->
    <div class="flex items-end gap-2">
      <div class="flex-1 relative">
        <UTextarea
          ref="textareaRef"
          v-model="content"
          :placeholder="editingMessage ? 'Edit your message...' : 'Type a message...'"
          :rows="1"
          autoresize
          :maxrows="6"
          :disabled="disabled"
          @keydown="handleKeydown"
        />
      </div>
      <UButton
        :icon="editingMessage ? 'i-lucide-check' : 'i-lucide-send'"
        :color="editingMessage ? 'success' : 'primary'"
        size="md"
        :disabled="!content.trim() || disabled"
        @click="handleSend"
      />
    </div>

    <p class="text-[10px] text-muted mt-1 px-1">
      <kbd class="font-mono">Enter</kbd> to send, <kbd class="font-mono">Shift+Enter</kbd> for new line
    </p>
  </div>
</template>
