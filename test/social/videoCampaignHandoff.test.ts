import { describe, expect, it, vi } from 'vitest'
import { videoSocialCampaignContext } from '~~/server/utils/video/socialCampaignContext'
import { CampaignPromptSchema } from '~~/server/utils/audio/timelineSchema'
import { buildVideoStudioSocialDraft } from '~~/server/utils/socialVideoDraft'

const clientId = 'f7c142a6-a63f-4f75-90aa-700db68c1c76'
const campaignId = '01a60d22-ff86-4501-a0a7-521bc12e4cc9'
const saved = { clientId, brief: 'Introduce the product', guideRules: '', prompt: 'Move the camera slowly.', campaignId, socialBrief: 'Introduce DriveAgent to Australian dealerships. Invite them to book a demo.' }
describe('video campaign social handoff', () => {
  it('reads the saved social brief and campaign for the current client', () => {
    expect(videoSocialCampaignContext(clientId, { campaign_prompt: saved })).toEqual({ campaignId, socialBrief: saved.socialBrief })
  })
  it('does not inherit another client’s guidance after reassignment', () => {
    expect(videoSocialCampaignContext('bc8a15a8-f523-4a75-a8f4-a501649bb71d', { campaign_prompt: saved })).toEqual({ campaignId: null, socialBrief: null })
  })
  it('leaves legacy projects and malformed metadata without a campaign', () => {
    expect(videoSocialCampaignContext(clientId, {})).toEqual({ campaignId: null, socialBrief: null })
    expect(videoSocialCampaignContext(clientId, { campaign_prompt: { ...saved, campaignId: 'bad' } })).toEqual({ campaignId: null, socialBrief: null })
  })
  it('preserves motion provenance while captioning from the saved social brief', async () => {
    const captionGenerator = vi.fn().mockResolvedValue('Your dealership. Connected. Book a demo.')
    const draft = await buildVideoStudioSocialDraft({ clientId, createdBy: 'producer', mediaUrl: 'https://example.test/video.mp4', format: '16:9', projectId: 'project-1', prompt: saved.prompt, socialBrief: saved.socialBrief, campaignId, captionGenerator })
    expect(captionGenerator).toHaveBeenCalledWith(expect.objectContaining({ topic: saved.socialBrief }))
    expect(draft.metadata.prompt).toBe(saved.prompt)
    expect(draft.metadata.socialBrief).toBe(saved.socialBrief)
    expect(draft.metadata.campaignId).toBe(campaignId)
  })
  it('retains social settings in the project contract and bounds caption input', () => {
    expect(CampaignPromptSchema.parse(saved)).toMatchObject({ campaignId, socialBrief: saved.socialBrief })
    expect(CampaignPromptSchema.safeParse({ ...saved, socialBrief: 'x'.repeat(1201) }).success).toBe(false)
  })
})
