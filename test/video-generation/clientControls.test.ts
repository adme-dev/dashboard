import { afterEach, describe, expect, it, vi } from 'vitest'
import { videoFeatureEnabled } from '~~/server/utils/video-generation/features'
import { setCachedCfBindings } from '~~/server/utils/cfBindings'
import { VideoClientProfileSchema } from '~~/server/utils/video-generation/clientProfile'
import { sourceAspectRatio, sourceImageDimensions } from '~~/server/utils/video-generation/sourceDimensions'
import { buildVideoStudioSocialDraft, defaultPlatformsForVideoFormat } from '~~/server/utils/socialVideoDraft'

afterEach(() => { vi.unstubAllEnvs(); setCachedCfBindings({}) })
describe('client video controls', () => {
  it('uses live request flags ahead of local and cached configuration', () => {
    vi.stubEnv('VIDEO_GENERATION_ENABLED', 'true')
    setCachedCfBindings({ VIDEO_GENERATION_ENABLED: 'true' })
    expect(videoFeatureEnabled('VIDEO_GENERATION_ENABLED', { context: { cloudflare: { env: { VIDEO_GENERATION_ENABLED: 'false' } } } } as any)).toBe(false)
    expect(videoFeatureEnabled('VIDEO_GENERATION_ENABLED', { context: { cloudflare: { env: { VIDEO_GENERATION_ENABLED: 'true' } } } } as any)).toBe(true)
  })
  it('retains the actual source aspect and landscape platform selection', () => {
    const png = Buffer.alloc(24)
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
    png.writeUInt32BE(1200, 16); png.writeUInt32BE(630, 20)
    expect(sourceImageDimensions(png)).toEqual({ width: 1200, height: 630 })
    expect(sourceImageDimensions(Buffer.from('not an image'))).toBeNull()
    expect(sourceAspectRatio(1200, 630)).toBe('40:21')
    expect(defaultPlatformsForVideoFormat('40:21')).toEqual(['facebook'])
  })
  it('uses the social brief instead of the technical motion prompt', async () => {
    const generator = vi.fn().mockResolvedValue('Follow DriveAgent News')
    await buildVideoStudioSocialDraft({ clientId: 'client', createdBy: 'user', mediaUrl: 'https://example.com/video.mp4', format: '16:9', projectId: 'project', prompt: 'Pan left with specular reflections', socialBrief: 'Australian automotive news and Formula 1', captionGenerator: generator })
    expect(generator).toHaveBeenCalledWith(expect.objectContaining({ topic: 'Australian automotive news and Formula 1' }))
  })
  it('rejects unsafe websites, unsupported models and excessive budgets', () => {
    const profile = { enabled: true, monthlyCapCents: 2000, allowedModelIds: ['aigateway/seedance-25-i2v'], brandName: 'DriveAgent', brandWebsite: 'https://driveagent.io', styleGuide: '', templatePrompt: '', socialBrief: '' }
    expect(VideoClientProfileSchema.safeParse(profile).success).toBe(true)
    expect(VideoClientProfileSchema.safeParse({ ...profile, brandWebsite: 'javascript:alert(1)' }).success).toBe(false)
    expect(VideoClientProfileSchema.safeParse({ ...profile, allowedModelIds: ['mock/i2v-safe'] }).success).toBe(false)
    expect(VideoClientProfileSchema.safeParse({ ...profile, monthlyCapCents: 100001 }).success).toBe(false)
  })
})
