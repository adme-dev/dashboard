<template>
  <div class="comment-thread">
    <!-- New Comment Input (Top Level) -->
    <div class="mb-6 pb-6 border-b border-gray-200">
      <TaskCommentInput
        :task-id="taskId"
        :placeholder="placeholder"
        submit-label="Update"
        @submit="onCreateComment"
      />
    </div>

    <!-- Comments List -->
    <div v-if="loading && comments.length === 0" class="py-8 text-center">
      <ULoadingIcon size="lg" />
      <p class="text-gray-500 mt-2">Loading comments...</p>
    </div>

    <div v-else-if="comments.length === 0" class="py-8 text-center text-gray-500">
      <UIcon name="i-lucide-message-circle" class="w-12 h-12 mx-auto mb-3 text-gray-300" />
      <p>No updates yet</p>
      <p class="text-sm">Be the first to share an update!</p>
    </div>

    <div v-else class="space-y-4">
      <TaskCommentItem
        v-for="comment in comments"
        :key="comment.id"
        :comment="comment"
        @reply="onReply"
        @edit="onEdit"
        @delete="onDelete"
        @like="onLike"
      />

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

interface Props {
  taskId: string
  placeholder?: string
}

const props = defineProps<Props>()

const { 
  comments, 
  loading, 
  hasMore, 
  fetchComments, 
  createComment, 
  editComment, 
  deleteComment, 
  toggleLike 
} = useTaskComments(props.taskId)

// Create top-level comment
const onCreateComment = async (content: string, isInternal: boolean) => {
  try {
    await createComment({
      content,
      isInternal
    })
  } catch (error) {
    // Error handled in composable
  }
}

// Reply to comment
const onReply = async (parentComment: any) => {
  // The reply input is shown by CommentItem
  // When submitted, it will call createComment with parentId
}

// Edit comment
const onEdit = async (comment: any) => {
  try {
    await editComment(comment.id, comment.content)
  } catch (error) {
    // Error handled in composable
  }
}

// Delete comment
const onDelete = async (comment: any) => {
  try {
    await deleteComment(comment.id)
  } catch (error) {
    // Error handled in composable
  }
}

// Like comment
const onLike = async (comment: any) => {
  try {
    await toggleLike(comment.id)
  } catch (error) {
    // Error handled in composable
  }
}
</script>

<style scoped>
/* Component styles */
</style>
