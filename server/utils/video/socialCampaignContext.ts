import { CampaignPromptSchema } from '~~/server/utils/audio/timelineSchema'

/** Campaign text is scoped to the current project client, including after re-homing. */
export function videoSocialCampaignContext(clientId: string, state: unknown): { campaignId: string | null, socialBrief: string | null } {
  const parsed = CampaignPromptSchema.safeParse((state as { campaign_prompt?: unknown } | null)?.campaign_prompt)
  if (!parsed.success || parsed.data.clientId !== clientId) return { campaignId: null, socialBrief: null }
  return { campaignId: parsed.data.campaignId ?? null, socialBrief: parsed.data.socialBrief?.trim() || null }
}
