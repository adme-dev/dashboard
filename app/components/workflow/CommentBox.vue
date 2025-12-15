<script setup lang="ts">
const props = defineProps<{
  taskId: string
  placeholder?: string
}>()

const emit = defineEmits<{
  submitted: []
}>()

const content = ref('')
const loading = ref(false)
const inputRef = ref<HTMLTextAreaElement | null>(null)

// Submit comment
const handleSubmit = async () => {
  if (!content.value.trim()) return

  loading.value = true

  try {
    await $fetch(`/api/agency/tasks/${props.taskId}/comments`, {
      method: 'POST',
      body: { content: content.value.trim() }
    })

    content.value = ''
    emit('submitted')
  } catch (error) {
    console.error('Failed to add comment:', error)
  } finally {
    loading.value = false
  }
}

// Handle keyboard shortcuts
const handleKeydown = (e: KeyboardEvent) => {
  // Cmd/Ctrl + Enter to submit
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    handleSubmit()
  }
}

// Auto-resize textarea
const autoResize = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  target.style.height = 'auto'
  target.style.height = `${Math.min(target.scrollHeight, 200)}px`
}

// Focus method
const focus = () => {
  inputRef.value?.focus()
}

// Platform detection for keyboard shortcut hint
const isMac = computed(() => {
  if (import.meta.client) {
    return navigator.platform.includes('Mac')
  }
  return false
})

defineExpose({ focus })
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-3">
      <UAvatar alt="You" size="sm" class="flex-shrink-0" />

      <div class="flex-1">
        <textarea
          ref="inputRef"
          v-model="content"
          :placeholder="placeholder || 'Write a comment...'"
          :disabled="loading"
          class="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          rows="2"
          @keydown="handleKeydown"
          @input="autoResize"
        />
      </div>
    </div>

    <div class="flex items-center justify-between pl-11">
      <p class="text-xs text-muted">
        <kbd class="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs">{{ isMac ? '⌘' : 'Ctrl' }}</kbd>
        +
        <kbd class="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs">Enter</kbd>
        to send
      </p>

      <UButton
        label="Comment"
        color="primary"
        size="sm"
        :loading="loading"
        :disabled="!content.trim()"
        @click="handleSubmit"
      />
    </div>
  </div>
</template>
