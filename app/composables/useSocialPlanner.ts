import type {
  SocialCampaign, SocialCampaignWithCounts, SocialBoardPost, SocialGeneratedDraft, SocialPost,
} from '~/types'

/**
 * Thin API client for the Planner (Slice 3): campaigns CRUD, the board feed,
 * post mutations (lane transitions / assignment), and AI plan generation +
 * accept. Mirrors useSocialPublishing.ts — reads/mutations via $fetch.
 */
export function useSocialPlanner() {
  const base = '/api/agency/social/publishing'
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string, body?: unknown, query?: Record<string, unknown> }
  ) => Promise<T>

  const listCampaigns = (clientId: string) =>
    apiFetch<SocialCampaignWithCounts[]>(`${base}/campaigns`, { query: { clientId } })
  const createCampaign = (body: Record<string, any>) =>
    apiFetch<SocialCampaign>(`${base}/campaigns`, { method: 'POST', body })
  const updateCampaign = (id: string, body: Record<string, any>) =>
    apiFetch<SocialCampaign>(`${base}/campaigns/${id}`, { method: 'PATCH', body })
  const deleteCampaign = (id: string) =>
    apiFetch<{ ok: true }>(`${base}/campaigns/${id}`, { method: 'DELETE' })

  const getBoard = (clientId: string, campaignId?: string) =>
    apiFetch<SocialBoardPost[]>(`${base}/board`, { query: { clientId, ...(campaignId ? { campaignId } : {}) } })
  const updatePost = (id: string, body: Record<string, any>) =>
    apiFetch<SocialPost>(`${base}/posts/${id}`, { method: 'PATCH', body })

  const generatePlan = (body: Record<string, any>) =>
    apiFetch<{ posts: SocialGeneratedDraft[] }>(`${base}/ai/generate-plan`, { method: 'POST', body })
  const acceptDraft = (body: Record<string, any>) =>
    apiFetch<SocialPost>(`${base}/posts`, { method: 'POST', body })

  return { listCampaigns, createCampaign, updateCampaign, deleteCampaign, getBoard, updatePost, generatePlan, acceptDraft }
}
