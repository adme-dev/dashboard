import { describe, expect, it } from 'vitest'
import { buildVideoStudioSocialDraft, defaultPlatformsForVideoFormat } from '~~/server/utils/socialVideoDraft'

describe('defaultPlatformsForVideoFormat', () => {
  it('maps render formats to platform presets', () => {
    expect(defaultPlatformsForVideoFormat('reels_9x16')).toEqual(['instagram', 'facebook'])
    expect(defaultPlatformsForVideoFormat('square_1x1')).toEqual(['facebook', 'instagram'])
    expect(defaultPlatformsForVideoFormat('youtube_16x9')).toEqual(['facebook'])
    expect(defaultPlatformsForVideoFormat('9:16')).toEqual(['instagram', 'facebook'])
  })
})

describe('buildVideoStudioSocialDraft', () => {
  it.each(['', '   ', ' Unable to generate insight '])('keeps the video draft reviewable when the caption is unusable (%j)', async (caption) => {
    const draft = await buildVideoStudioSocialDraft({
      clientId: 'client-1', createdBy: 'user-1', mediaUrl: 'https://example.com/approved.mp4',
      format: '4:5', projectId: 'project-1', assetId: 'asset-1', campaignId: 'campaign-1',
      socialBrief: 'Approved dealership introduction', prompt: 'Camera movement instructions',
      captionGenerator: async () => caption
    })
    expect(draft.content).toBe('')
    expect(draft.mediaUrls).toEqual(['https://example.com/approved.mp4'])
    expect(draft.metadata).toMatchObject({ captionGenerationFailed: true, campaignId: 'campaign-1', assetId: 'asset-1' })
  })

  it('retains a reviewable media draft when the caption provider throws without leaking its error', async () => {
    const draft = await buildVideoStudioSocialDraft({
      clientId: 'client-1', createdBy: 'user-1', mediaUrl: 'https://example.com/approved.mp4',
      format: '4:5', projectId: 'project-1', socialBrief: 'Approved message',
      captionGenerator: async () => { throw new Error('Private provider error') }
    })
    expect(draft.content).toBe('')
    expect(draft.mediaUrls).toEqual(['https://example.com/approved.mp4'])
    expect(draft.metadata.captionGenerationFailed).toBe(true)
    expect(JSON.stringify(draft)).not.toContain('Private provider error')
  })

  it('builds a campaign-ready draft with caption, media, tags, and source metadata', async () => {
    const draft = await buildVideoStudioSocialDraft({
      clientId: 'client-1',
      createdBy: 'user-1',
      mediaUrl: 'https://app.xeroflow.io/renders/job/reels.mp4',
      format: 'reels_9x16',
      projectId: 'project-1',
      jobId: 'job-1',
      assetId: 'asset-1',
      prompt: 'wheels turning through sand',
      modelId: 'aigateway/seedance-i2v',
      captionGenerator: async brief => `Caption for ${brief.platform}: ${brief.topic}`
    })

    expect(draft).toMatchObject({
      clientId: 'client-1',
      createdBy: 'user-1',
      content: 'Caption for instagram: wheels turning through sand',
      mediaUrls: ['https://app.xeroflow.io/renders/job/reels.mp4'],
      platforms: ['instagram', 'facebook'],
      tags: ['video-studio', 'reels_9x16'],
      metadata: {
        source: 'video_studio',
        projectId: 'project-1',
        jobId: 'job-1',
        assetId: 'asset-1',
        format: 'reels_9x16',
        prompt: 'wheels turning through sand',
        modelId: 'aigateway/seedance-i2v'
      }
    })
  })
})
