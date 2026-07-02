import type { SocialPost, SocialAccount, SocialSlot } from '~/types'

/**
 * Thin API client for the social publishing module. Reads use $fetch directly so callers
 * control their own loading state; mutations return the updated row.
 */
export function useSocialPublishing() {
  const base = '/api/agency/social/publishing'

  const listPosts = (clientId: string, opts: { status?: string; limit?: number } = {}) =>
    $fetch<SocialPost[]>(`${base}/posts`, { query: { clientId, ...opts } })

  const getPost = (id: string) => $fetch<SocialPost>(`${base}/posts/${id}`)

  const createPost = (body: Record<string, any>) =>
    $fetch<SocialPost>(`${base}/posts`, { method: 'POST', body })

  const updatePost = (id: string, body: Record<string, any>) =>
    $fetch<SocialPost>(`${base}/posts/${id}`, { method: 'PATCH', body })

  const deletePost = (id: string) =>
    $fetch<{ ok: true }>(`${base}/posts/${id}`, { method: 'DELETE' })

  const publishNow = (id: string) =>
    $fetch(`${base}/posts/${id}/publish`, { method: 'POST' })

  const schedulePost = (id: string, body: { scheduledAt: string; timezone?: string }) =>
    $fetch<SocialPost>(`${base}/posts/${id}/schedule`, { method: 'POST', body })

  const requestApproval = (id: string) =>
    $fetch(`${base}/posts/${id}/request-approval`, { method: 'POST' })

  const approve = (id: string) =>
    $fetch(`${base}/posts/${id}/approve`, { method: 'POST' })

  const reject = (id: string, reason: string) =>
    $fetch(`${base}/posts/${id}/reject`, { method: 'POST', body: { reason } })

  const listAccounts = (clientId: string) =>
    $fetch<SocialAccount[]>(`${base}/accounts`, { query: { clientId } })

  const deleteAccount = (id: string) =>
    $fetch<{ ok: true }>(`${base}/accounts/${id}`, { method: 'DELETE' })

  const listSlots = (clientId: string) =>
    $fetch<SocialSlot[]>(`${base}/slots`, { query: { clientId } })

  const createSlot = (body: Record<string, any>) =>
    $fetch<SocialSlot>(`${base}/slots`, { method: 'POST', body })

  const updateSlot = (id: string, body: Record<string, any>) =>
    $fetch<SocialSlot>(`${base}/slots/${id}`, { method: 'PATCH', body })

  const deleteSlot = (id: string) =>
    $fetch<{ ok: true }>(`${base}/slots/${id}`, { method: 'DELETE' })

  const getQueue = (clientId: string) =>
    $fetch<SocialPost[]>(`${base}/queue`, { query: { clientId } })

  const reorderQueue = (clientId: string, orderedIds: string[]) =>
    $fetch(`${base}/queue/reorder`, { method: 'POST', body: { clientId, orderedIds } })

  const fillQueueFromDrafts = (clientId: string, postIds?: string[]) =>
    $fetch<{ count: number }>(`${base}/queue/fill`, { method: 'POST', body: { clientId, postIds } })

  const getCalendar = (clientId: string, from: string, to: string) =>
    $fetch<SocialPost[]>(`${base}/calendar`, { query: { clientId, from, to } })

  const getApprovals = (clientId?: string) =>
    $fetch<SocialPost[]>(`${base}/approvals`, { query: clientId ? { clientId } : {} })

  const getApprovalsBadge = (clientId?: string) =>
    $fetch<{ count: number }>(`${base}/approvals/badge`, { query: clientId ? { clientId } : {} })

  return {
    listPosts, getPost, createPost, updatePost, deletePost, publishNow, schedulePost,
    requestApproval, approve, reject,
    listAccounts, deleteAccount,
    listSlots, createSlot, updateSlot, deleteSlot,
    getQueue, reorderQueue, fillQueueFromDrafts, getCalendar, getApprovals, getApprovalsBadge,
  }
}
