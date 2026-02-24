<template>
  <div class="comment-item" :class="{ 'is-reply': isReply }">
    <div class="flex gap-3">
      <!-- Avatar -->
      <UAvatar
        :src="comment.author_avatar || undefined"
        :alt="comment.author_name"
        size="md"
        class="flex-shrink-0"
      />

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <!-- Header -->
        <div class="flex items-center gap-2 mb-1">
          <span class="font-semibold text-gray-900">
            {{ comment.author_name }}
          </span>
          <span class="text-gray-400 text-sm">
            {{ formatTime(comment.created_at) }}
          </span>
          <span v-if="isEdited" class="text-gray-400 text-xs">
            (edited)
          </span>
          <span v-if="comment.is_internal" class="text-amber-600 text-xs bg-amber-50 px-1.5 py-0.5 rounded">
            Internal
          </span>
        </div>

        <!-- Edit Mode -->
        <div v-if="isEditing" class="mb-2">
          <UTextarea
            v-model="editContent"
            :rows="2"
            class="mb-2"
          />
          <div class="flex gap-2">
            <UButton size="xs" color="primary" @click="saveEdit">
              Save
            </UButton>
            <UButton size="xs" variant="ghost" @click="cancelEdit">
              Cancel
            </UButton>
          </div>
        </div>

        <!-- Display Content (with highlighted mentions) -->
        <div v-else class="text-gray-700 whitespace-pre-wrap break-words">
          <span v-html="highlightedContent" />
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-4 mt-2">
          <!-- Like Button -->
          <button
            class="flex items-center gap-1 text-sm transition-colors"
            :class="comment.user_has_liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'"
            @click="toggleLike"
          >
            <UIcon 
              :name="comment.user_has_liked ? 'i-lucide-heart' : 'i-lucide-heart'" 
              :class="comment.user_has_liked ? 'fill-current' : ''"
              class="w-4 h-4"
            />
            <span v-if="comment.likes_count > 0">
              {{ comment.likes_count }}
            </span>
            <span v-else>Like</span>
          </button>

          <!-- Reply Button (only for top-level comments) -->
          <button
            v-if="!isReply"
            class="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            @click="$emit('reply', comment)"
          >
            Reply
            <span v-if="comment.reply_count > 0" class="ml-1">
              ({{ comment.reply_count }})
            </span>
          </button>

          <!-- More Actions (if author) -->
          <UDropdownMenu
            v-if="isAuthor"
            :items="actionItems"
          >
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-lucide-more-horizontal"
            />
          </UDropdownMenu>
        </div>

        <!-- Replies -->
        <div v-if="showReplies && comment.replies?.length" class="mt-4 space-y-4">
          <TaskCommentItem
            v-for="reply in comment.replies"
            :key="reply.id"
            :comment="reply"
            :is-reply="true"
            @reply="$emit('reply', $event)"
            @edit="$emit('edit', $event)"
            @delete="$emit('delete', $event)"
            @like="$emit('like', $event)"
          />
        </div>

        <!-- Reply Input -->
        <div v-if="showReplyInput" class="mt-4">
          <TaskCommentInput
            :task-id="comment.task_id"
            :parent-id="comment.id"
            placeholder="Write a reply..."
            submit-label="Reply"
            :rows="2"
            auto-focus
            @submit="onReplySubmit"
            @cancel="showReplyInput = false"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Comment } from '~/composables/useTaskComments'

interface Props {
  comment: Comment
  isReply?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  reply: [comment: Comment]
  edit: [comment: Comment]
  delete: [comment: Comment]
  like: [comment: Comment]
}>()

const { user } = useAuth()

// State
const isEditing = ref(false)
const editContent = ref('')
const showReplies = ref(true)
const showReplyInput = ref(false)

// Computed
const isAuthor = computed(() => {
  return user.value?.id === props.comment.author_id
})

const isEdited = computed(() => {
  return !!props.comment.edited_at
})

// Highlight @mentions in content
const highlightedContent = computed(() => {
  let content = props.comment.content
  
  // Highlight @mentions
  if (props.comment.mentions) {
    props.comment.mentions.forEach(mention => {
      const regex = new RegExp(`@${mention.mentionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')
      content = content.replace(regex, `<span class="text-blue-600 font-medium">@${mention.name}</span>`)
    })
  }
  
  // Also highlight any @username pattern
  content = content.replace(
    /@([A-Za-z0-9_\s]+)/g,
    '<span class="text-blue-600 font-medium">@$1</span>'
  )
  
  return content
})

// Format time
const formatTime = (date: string): string => {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return then.toLocaleDateString()
}

// Actions
const actionItems = computed(() => [
  [{
    label: 'Edit',
    icon: 'i-lucide-pencil',
    click: () => {
      editContent.value = props.comment.content
      isEditing.value = true
    }
  }, {
    label: 'Delete',
    icon: 'i-lucide-trash-2',
    click: () => {
      if (confirm('Are you sure you want to delete this comment?')) {
        emit('delete', props.comment)
      }
    }
  }]
])

const toggleLike = () => {
  emit('like', props.comment)
}

const saveEdit = () => {
  if (editContent.value.trim() && editContent.value !== props.comment.content) {
    emit('edit', { ...props.comment, content: editContent.value.trim() })
  }
  isEditing.value = false
}

const cancelEdit = () => {
  isEditing.value = false
  editContent.value = ''
}

const onReplySubmit = (content: string, isInternal: boolean) => {
  // Parent component handles the actual submission
  showReplyInput.value = false
  emit('reply', props.comment)
}

// Expose
defineExpose({
  showReplyInput: () => { showReplyInput.value = true }
})
</script>

<style scoped>
.comment-item {
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}

.comment-item.is-reply {
  padding-left: 0;
}
</style>
