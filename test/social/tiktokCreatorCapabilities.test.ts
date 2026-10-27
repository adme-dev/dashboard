import { describe, expect, it } from 'vitest'
import { normalizeTikTokOptions, tikTokPayloadError } from '~~/shared/tiktokPosting'
import { assertProviderCompatibleMedia } from '~~/server/utils/socialPublishing/mediaAssets'
import { classifySocialPublishingAccountHealth } from '~~/server/utils/socialPublishing/accountHealth'

const creator = { creator_nickname: 'x', creator_username: 'x', privacy_level_options: ['SELF_ONLY'], comment_disabled: true, duet_disabled: true, stitch_disabled: true, max_video_post_duration_sec: 90 }
const options = { privacy_level: 'SELF_ONLY', consent: true }
const photo = { kind: 'banner_asset' as const, id: 'fixture', mediaType: 'image' as const, mimeType: 'image/jpeg', byteSize: 20 * 1024 * 1024, etag: 'fixture' }
describe('TikTok reviewed choices and media', () => {
  it('retains 35 photos and preserves other providers limits', () => {
    const photos = Array(35).fill(photo)
    expect(() => assertProviderCompatibleMedia(['tiktok'], photos)).not.toThrow()
    expect(() => assertProviderCompatibleMedia(['facebook'], photos)).toThrow()
    expect(() => assertProviderCompatibleMedia(['tiktok'], Array(36).fill(photo))).toThrow()
    expect(() => assertProviderCompatibleMedia(['tiktok'], [{ ...photo, mimeType: 'image/png' }])).toThrow()
  })
  it('requires known duration within the fresh creator limit', () => {
    expect(tikTokPayloadError('x', [{ mediaType: 'video', durationSeconds: 91 }], options, creator)).toContain('duration')
    expect(tikTokPayloadError('x', [{ mediaType: 'video' }], options, creator)).toContain('duration')
    expect(tikTokPayloadError('x', [{ mediaType: 'video', durationSeconds: 90 }], options, creator)).toBeNull()
  })
  it('rejects restricted interactions and missing disclosure selection', () => {
    expect(tikTokPayloadError('x', [photo], { ...options, disable_comment: false }, creator)).toContain('disabled')
    expect(tikTokPayloadError('x', [photo], { ...options, commercial_disclosure: true }, creator)).toContain('Select')
    expect(() => normalizeTikTokOptions({ consent: 'true' })).toThrow()
    expect(() => normalizeTikTokOptions({ commercial_capability: true })).toThrow()
  })
  it.each([{}, { grantedScopes: ['video.publish'] }, { grantedScopes: ['video.publish'], refreshTokenExpiresAt: '2000-01-01' }])('requires reconnect for absent/expired grant %j', (metadata) => {
    expect(classifySocialPublishingAccountHealth({ platform: 'tiktok', isActive: true, hasRefreshToken: true, tokenExpiresAt: '2099-01-01', metadata }).requiresReconnect).toBe(true)
  })
})
