import { ref, toValue, type MaybeRefOrGetter } from 'vue'
import type {
  BoardFileItem,
  BoardKnowledgeReviewDetail,
  BoardKnowledgeSubmission
} from '~/types'

type KnowledgeTransitionAction = 'approve' | 'reject' | 'retry' | 'archive'

interface TransitionOptions {
  reason?: string
}

interface TransitionResponse {
  accepted: boolean
  queued: boolean
  submission: BoardKnowledgeSubmission
}

export function boardKnowledgeApiError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback
  const details = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
  return details.data?.statusMessage || details.statusMessage || details.message || fallback
}

export function boardKnowledgeApiStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const details = error as { statusCode?: number, status?: number, response?: { status?: number } }
  return details.statusCode || details.status || details.response?.status || null
}

export function useBoardKnowledge(boardId: MaybeRefOrGetter<string>) {
  const detail = ref<BoardKnowledgeReviewDetail | null>(null)
  const detailLoading = ref(false)
  const detailError = ref('')
  const pendingSubmissions = ref<Record<string, boolean>>({})
  const pendingAction = ref<KnowledgeTransitionAction | null>(null)

  function boardPath() {
    return `/api/agency/boards/${toValue(boardId)}`
  }

  function sourceKey(file: Pick<BoardFileItem, 'scope' | 'id'>) {
    return `${file.scope}:${file.id}`
  }

  function isSubmitting(file: Pick<BoardFileItem, 'scope' | 'id'>) {
    return Boolean(pendingSubmissions.value[sourceKey(file)])
  }

  async function submit(file: Pick<BoardFileItem, 'scope' | 'id'>): Promise<TransitionResponse | null> {
    const key = sourceKey(file)
    if (pendingSubmissions.value[key]) return null
    pendingSubmissions.value = { ...pendingSubmissions.value, [key]: true }
    const sourcePath = file.scope === 'board'
      ? `files/${file.id}`
      : `files/task/${file.id}`
    try {
      return await $fetch<TransitionResponse>(`${boardPath()}/${sourcePath}/knowledge/submit`, {
        method: 'POST'
      })
    } finally {
      pendingSubmissions.value = Object.fromEntries(
        Object.entries(pendingSubmissions.value).filter(([entryKey]) => entryKey !== key)
      )
    }
  }

  async function loadDetail(submissionId: string): Promise<BoardKnowledgeReviewDetail> {
    detailLoading.value = true
    detailError.value = ''
    detail.value = null
    try {
      const response = await $fetch<BoardKnowledgeReviewDetail>(`${boardPath()}/knowledge/${submissionId}`)
      detail.value = response
      return response
    } catch (error) {
      detailError.value = boardKnowledgeApiError(error, 'The knowledge review could not be loaded.')
      throw error
    } finally {
      detailLoading.value = false
    }
  }

  async function transition(
    submission: BoardKnowledgeSubmission,
    action: KnowledgeTransitionAction,
    options: TransitionOptions = {}
  ): Promise<TransitionResponse> {
    if (pendingAction.value) throw new Error('knowledge_action_in_progress')
    pendingAction.value = action
    try {
      const reason = options.reason?.trim()
      return await $fetch<TransitionResponse>(`${boardPath()}/knowledge/${submission.id}/${action}`, {
        method: 'POST',
        body: {
          expectedUpdatedAt: submission.updatedAt,
          ...(reason ? { reason } : {})
        }
      })
    } finally {
      pendingAction.value = null
    }
  }

  return {
    detail,
    detailLoading,
    detailError,
    pendingAction,
    isSubmitting,
    submit,
    loadDetail,
    transition
  }
}
