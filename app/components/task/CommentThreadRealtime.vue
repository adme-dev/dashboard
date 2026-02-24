<template>
  <div class="comment-thread-realtime">
    <!-- Connection Status -->
    <div 
      v-if="!isConnected" 
      class="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 text-sm rounded-lg mb-4"
    >
      <UIcon name="i-lucide-wifi-off" class="w-4 h-4" />
      <span>Offline mode - comments will sync when reconnected</span>
      <UButton 
        v-if="!isConnecting" 
        size="xs" 
        variant="ghost" 
        @click="reconnect"
      >
        Reconnect
      </UButton>
    </div>

    <!-- Active Users -->
    <div v-if="activeUsers.length > 0" class="flex items-center gap-2 mb-4">
      <div class="flex -space-x-2">
        <UAvatar
          v-for="user in activeUsers.slice(0, 3)"
          :key="user.userId"
          :alt="user.userName"
          size="xs"
          class="border-2 border-white"
        />
      </div>
      <span class="text-xs text-gray-500">
        {{ activeUsers.length }} {{ activeUsers.length === 1 ? 'person' : 'people' }} viewing
      </span>
    </div>

    <!-- New Comment Input -->
    <div class="mb-6 pb-6 border-b border-gray-200">
      <TaskCommentInput
        :task-id="taskId"
        :placeholder="placeholder"
        submit-label="Update"
        @submit="onCreateComment"
      />
    </div>

    <!-- Typing Indicator -->
    <div v-if="typingText" class="flex items-center gap-2 mb-4 text-sm text-gray-500">
      <span class="flex gap-0.5">
        <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms" />
        <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms" />
        <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms" />
      </span>
      {{ typingText }}
    </div>

    <!-- Comments List -->
    <div v-if="loading && comments.length === 0" class="py-8 text-center">
      <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-primary mx-auto" />
      <p class="text-gray-500 mt-2">Loading comments...</p>
    </div>

    <div v-else-if="comments.length === 0" class="py-8 text-center text-gray-500">
      <UIcon name="i-lucide-message-circle" class="w-12 h-12 mx-auto mb-3 text-gray-300" />
      <p>No updates yet</p>
      <p class="text-sm">Be the first to share an update!</p>
    </div>

    <div v-else class="space-y-4">
      <TransitionGroup name="comment">
        <TaskCommentItem
          v-for="comment in comments"
          :key="comment.id"
          :comment="comment"
          @reply="onReply"
          @edit="onEdit"
          @delete="onDelete"
          @like="onLike"
        />
      </TransitionGroup>

      <!-- Load More -->
      <div v-if="hasMore" class="text-center py-4">
        <UButton
          variant="ghost"
          color="neutral"
          :loading="loading"
          @click="() => fetchComments()"
        >
          Load more comments
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTaskComments, type CreateCommentData } from '~/composables/useTaskComments'
import { useTaskWebSocket, type WebSocketMessage } from '~/composables/useTaskWebSocket'

interface Props {
  taskId: string
  placeholder?: string
}

const props = defineProps<Props>()
const { user } = useAuth()

// HTTP-based comments (fallback/persistence)
const { 
  comments, 
  loading, 
  hasMore, 
  fetchComments, 
  createComment: httpCreateComment,
  editComment: httpEditComment,
  deleteComment: httpDeleteComment,
  toggleLike: httpToggleLike,
  formatTime
} = useTaskComments(props.taskId)

// WebSocket for real-time
const {
  isConnected,
  isConnecting,
  activeUsers,
  typingText,
  connect,
  disconnect,
  sendComment,
  sendLike,
  sendEdit,
  sendDelete,
  sendTyping,
  onMessage
} = useTaskWebSocket(props.taskId)

// Typing debounce
let typingTimeout: NodeJS.Timeout | null = null

// Connect on mount
onMounted(() => {
  if (user.value?.id) {
    connect(user.value.id, user.value.name || 'Unknown', user.value.avatarUrl)
  }
  
  // Listen for WebSocket messages
  onMessage((msg: WebSocketMessage) => {
    handleWebSocketMessage(msg)
  })
})

// Cleanup
onUnmounted(() => {
  disconnect()
})

// Handle WebSocket messages
const handleWebSocketMessage = (msg: WebSocketMessage) => {
  switch (msg.type) {
    case 'comment':
      // Add new comment to list
      if (msg.userId !== user.value?.id) {
        // Only add if not from current user (we already add optimistically)
        comments.value.unshift({
          id: msg.commentId || `temp-${Date.now()}`,
          task_id: props.taskId,
          author_id: msg.userId!,
          author_name: msg.userName!,
          author_avatar: msg.userAvatar || null,
          parent_id: msg.data?.parentId || null,
          content: msg.content!,
          is_internal: false,
          created_at: new Date(msg.timestamp!).toISOString(),
          edited_at: null,
          likes_count: 0,
          user_has_liked: false,
          reply_count: 0,
          replies: []
        } as any)
      }
      break
      
    case 'like':
      // Update like count
      const commentToLike = findComment(msg.commentId!)
      if (commentToLike) {
        if (msg.userId === user.value?.id) {
          // Confirmation of our like
          commentToLike.user_has_liked = !commentToLike.user_has_liked
          commentToLike.likes_count += commentToLike.user_has_liked ? 1 : -1
        } else {
          // Someone else liked
          commentToLike.likes_count += 1
        }
      }
      break
      
    case 'edit':
      // Update comment content
      const commentToEdit = findComment(msg.commentId!)
      if (commentToEdit && msg.userId !== user.value?.id) {
        commentToEdit.content = msg.content!
        commentToEdit.edited_at = new Date(msg.timestamp!).toISOString()
      }
      break
      
    case 'delete':
      // Remove comment
      if (msg.userId !== user.value?.id) {
        removeComment(msg.commentId!)
      }
      break
  }
}

// Create comment via WebSocket (with HTTP fallback)
const onCreateComment = async (content: string, isInternal: boolean) => {
  // Send via WebSocket if connected
  if (isConnected.value) {
    sendComment(content)
  }
  
  // Also persist via HTTP
  try {
    await httpCreateComment({ content, isInternal })
  } catch (err) {
    console.error('Failed to create comment:', err)
  }
}

// Edit comment
const onEdit = async (comment: any) => {
  if (isConnected.value) {
    sendEdit(comment.id, comment.content)
  }
  
  try {
    await httpEditComment(comment.id, comment.content)
  } catch (err) {
    console.error('Failed to edit comment:', err)
  }
}

// Delete comment
const onDelete = async (comment: any) => {
  if (isConnected.value) {
    sendDelete(comment.id)
  }
  
  try {
    await httpDeleteComment(comment.id)
  } catch (err) {
    console.error('Failed to delete comment:', err)
  }
}

// Like comment
const onLike = async (comment: any) => {
  if (isConnected.value) {
    sendLike(comment.id)
  }
  
  try {
    await httpToggleLike(comment.id)
  } catch (err) {
    console.error('Failed to toggle like:', err)
  }
}

// Reply to comment
const onReply = (parentComment: any) => {
  // Show reply input (handled by CommentItem)
  // When submitted, it will call onCreateComment with parentId
}

// Reconnect
const reconnect = () => {
  if (user.value?.id) {
    connect(user.value.id, user.value.name || 'Unknown', user.value.avatarUrl)
  }
}

// Helper: Find comment by ID
const findComment = (id: string) => {
  for (const comment of comments.value) {
    if (comment.id === id) return comment
    if (comment.replies) {
      const reply = comment.replies.find((r: any) => r.id === id)
      if (reply) return reply
    }
  }
  return null
}

// Helper: Remove comment from list
const removeComment = (id: string) => {
  const comment = findComment(id)
  if (!comment) return
  
  if (comment.parent_id) {
    const parent = comments.value.find((c: any) => c.id === comment.parent_id)
    if (parent && parent.replies) {
      parent.replies = parent.replies.filter((r: any) => r.id !== id)
      parent.reply_count--
    }
  } else {
    comments.value = comments.value.filter((c: any) => c.id !== id)
  }
}
</script>

<style scoped>
.comment-enter-active,
.comment-leave-active {
  transition: all 0.3s ease;
}

.comment-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.comment-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

.animate-bounce {
  animation: bounce 0.6s infinite;
}
</style>
