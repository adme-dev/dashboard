/**
 * Composable for managing task comments
 * Handles fetching, creating, editing, and real-time updates
 */

export interface Comment {
  id: string
  task_id: string
  author_id: string
  author_name: string
  author_avatar: string | null
  parent_id: string | null
  content: string
  is_internal: boolean
  created_at: string
  edited_at: string | null
  likes_count: number
  user_has_liked: boolean
  reply_count: number
  replies: Comment[]
  mentions?: Array<{
    userId: string
    name: string
    mentionText: string
  }>
}

export interface CreateCommentData {
  content: string
  parentId?: string
  isInternal?: boolean
}

export function useTaskComments(taskId: string) {
  const comments = ref<Comment[]>([])
  const loading = ref(false)
  const hasMore = ref(true)
  const offset = ref(0)
  const limit = 20
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string, body?: unknown, query?: Record<string, unknown> }
  ) => Promise<T>

  // Fetch comments
  const fetchComments = async (reset = false) => {
    if (loading.value) return
    
    loading.value = true
    if (reset) {
      offset.value = 0
      comments.value = []
    }

    try {
      const response = await apiFetch<{ comments: Comment[], pagination: { hasMore: boolean } }>(`/api/tasks/${taskId}/comments`, {
        query: {
          limit,
          offset: offset.value,
          replies: 'true'
        }
      })

      if (reset) {
        comments.value = response.comments
      } else {
        comments.value.push(...response.comments)
      }

      hasMore.value = response.pagination.hasMore
      offset.value += limit
    } catch (error) {
      console.error('Failed to fetch comments:', error)
    } finally {
      loading.value = false
    }
  }

  // Create comment
  const createComment = async (data: CreateCommentData): Promise<Comment | null> => {
    try {
      const response = await apiFetch<Comment>(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        body: data
      })

      // Add to top of list if it's a top-level comment
      if (!data.parentId) {
        comments.value.unshift(response)
      } else {
        // Add to parent's replies
        const parent = comments.value.find(c => c.id === data.parentId)
        if (parent) {
          parent.replies = parent.replies || []
          parent.replies.push(response)
          parent.reply_count++
        }
      }

      return response
    } catch (error) {
      console.error('Failed to create comment:', error)
      throw error
    }
  }

  // Edit comment
  const editComment = async (commentId: string, content: string): Promise<boolean> => {
    try {
      const response = await apiFetch<Comment>(`/api/comments/${commentId}`, {
        method: 'PUT',
        body: { content }
      })

      // Update in local state
      const comment = findComment(commentId)
      if (comment) {
        comment.content = response.content
        comment.edited_at = response.edited_at
      }

      return true
    } catch (error) {
      console.error('Failed to edit comment:', error)
      throw error
    }
  }

  // Delete comment (soft delete)
  const deleteComment = async (commentId: string): Promise<boolean> => {
    try {
      await apiFetch(`/api/comments/${commentId}`, {
        method: 'DELETE'
      })

      // Remove from local state or mark as deleted
      const comment = findComment(commentId)
      if (comment) {
        if (comment.parent_id) {
          // Remove from parent's replies
          const parent = comments.value.find(c => c.id === comment.parent_id)
          if (parent && parent.replies) {
            parent.replies = parent.replies.filter(r => r.id !== commentId)
            parent.reply_count--
          }
        } else {
          // Remove top-level comment
          comments.value = comments.value.filter(c => c.id !== commentId)
        }
      }

      return true
    } catch (error) {
      console.error('Failed to delete comment:', error)
      throw error
    }
  }

  // Toggle like
  const toggleLike = async (commentId: string): Promise<{ liked: boolean; likesCount: number }> => {
    try {
      const response = await apiFetch<{ liked: boolean, likesCount: number }>(`/api/comments/${commentId}/like`, {
        method: 'POST'
      })

      // Update local state
      const comment = findComment(commentId)
      if (comment) {
        comment.user_has_liked = response.liked
        comment.likes_count = response.likesCount
      }

      return response
    } catch (error) {
      console.error('Failed to toggle like:', error)
      throw error
    }
  }

  // Helper: Find comment by ID (including in replies)
  const findComment = (id: string): Comment | null => {
    for (const comment of comments.value) {
      if (comment.id === id) return comment
      if (comment.replies) {
        const reply = comment.replies.find(r => r.id === id)
        if (reply) return reply
      }
    }
    return null
  }

  // Format relative time
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

  // Load initial comments
  onMounted(() => fetchComments(true))

  return {
    comments,
    loading,
    hasMore,
    fetchComments,
    createComment,
    editComment,
    deleteComment,
    toggleLike,
    formatTime
  }
}

// Composable for user search (@mentions)
export function useUserMentions() {
  const users = ref<Array<{
    id: string
    name: string
    email: string
    avatar_url: string | null
    mention_name: string
  }>>([])
  const loading = ref(false)
  const searchQuery = ref('')
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { query?: Record<string, unknown> }
  ) => Promise<T>

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      users.value = []
      return
    }

    loading.value = true
    searchQuery.value = query

    try {
      const response = await apiFetch<{ users?: typeof users.value, suggestions?: typeof users.value }>('/api/users/search', {
        query: { q: query }
      })
      users.value = response.users ?? response.suggestions ?? []
    } catch (error) {
      console.error('Failed to search users:', error)
      users.value = []
    } finally {
      loading.value = false
    }
  }

  return {
    users,
    loading,
    searchQuery,
    searchUsers
  }
}
