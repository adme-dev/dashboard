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

  const listCampaigns = (clientId: string) =>
    $fetch<SocialCampaignWithCounts[]>(`${base}/campaigns`, { query: { clientId } })
  const createCampaign = (body: Record<string, any>) =>
    $fetch<SocialCampaign>(`${base}/campaigns`, { method: 'POST', body })
  const updateCampaign = (id: string, body: Record<string, any>) =>
    $fetch<SocialCampaign>(`${base}/campaigns/${id}`, { method: 'PATCH', body })
  const deleteCampaign = (id: string) =>
    $fetch<{ ok: true }>(`${base}/campaigns/${id}`, { method: 'DELETE' })

  const getBoard = (clientId: string, campaignId?: string) =>
    $fetch<SocialBoardPost[]>(`${base}/board`, { query: { clientId, ...(campaignId ? { campaignId } : {}) } })
  const updatePost = (id: string, body: Record<string, any>) =>
    $fetch<SocialPost>(`${base}/posts/${id}`, { method: 'PATCH', body })

  const generatePlan = (body: Record<string, any>) =>
    $fetch<{ posts: SocialGeneratedDraft[] }>(`${base}/ai/generate-plan`, { method: 'POST', body })
  const acceptDraft = (body: Record<string, any>) =>
    $fetch<SocialPost>(`${base}/posts`, { method: 'POST', body })

  return { listCampaigns, createCampaign, updateCampaign, deleteCampaign, getBoard, updatePost, generatePlan, acceptDraft }
}
