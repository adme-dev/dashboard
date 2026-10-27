import { describe, expect, it } from 'vitest'
import {
  assertProviderCompatibleMedia,
  assertSocialMediaAssetsCurrent,
  normalizeSocialMediaAssetRefs,
  readPinnedSocialMedia,
  resolveSocialMediaAssets,
  signSocialMediaToken,
  socialMediaDeliveryUrl,
  verifySocialMediaToken,
  SOCIAL_MEDIA_CAPABILITY_PATH,
  type SocialMediaAssetIdentity,
  type SocialMediaBucket
} from '~~/server/utils/socialPublishing/mediaAssets'
import { mediaTypeForUrl } from '~~/server/utils/socialPublishing'

const CLIENT = '0a000000-0000-4000-8000-00000000000a'
const OTHER = '0b000000-0000-4000-8000-00000000000b'
const UPLOADER = '51000000-0000-4000-8000-000000000001'
const ASSET = 'aa000000-0000-4000-8000-000000000001'
const VIDEO = 'ab000000-0000-4000-8000-000000000001'
const SECRET = 'a-render-link-secret-that-is-at-least-32-bytes'
const KEY = `banner-assets/${UPLOADER}/${ASSET}/photo.jpg`

function rows(overrides: Record<string, unknown> = {}) {
  return [{
    kind: 'banner_asset', id: ASSET, client_id: CLIENT, r2_key: KEY, mime_type: 'image/jpeg',
    name: 'photo.jpg', uploaded_by: UPLOADER, byte_size: 100, created_at: '2026-10-01T00:00:00Z', ...overrides
  }]
}
const dbWith = (result: any[]) => ({
  calls: [] as unknown[][],
  async queryRows<T>(sql: string, params?: unknown[]) {
    this.calls.push([sql, params])
    return result as T[]
  }
})

function bucketWith(objects: Record<string, { etag: string, size: number }>, conditional = true): SocialMediaBucket & { gets: any[] } {
  const gets: any[] = []
  return {
    gets,
    conditionalGet: conditional,
    async head(key) {
      const object = objects[key]
      return object ? { size: object.size, etag: object.etag, httpEtag: `"${object.etag}"` } : null
    },
    async get(key, options) {
      gets.push({ key, options })
      const object = objects[key]
      if (!object) return null
      if (options?.onlyIf && options.onlyIf.etagMatches !== object.etag) return { size: object.size, etag: object.etag }
      return { size: object.size, etag: object.etag, body: new Response('bytes').body }
    }
  }
}
const event = (env: Record<string, unknown> = {}) => ({ context: { cloudflare: { env: { RENDER_LINK_SECRET: SECRET, APP_URL: 'https://app.xeroflow.example', ...env } } } }) as any

describe('typed client-owned media references', () => {
  it('accepts only bounded, typed, de-duplicated {kind,id} references', () => {
    expect(normalizeSocialMediaAssetRefs([{ kind: 'banner_asset', id: ASSET.toUpperCase() }, { kind: 'banner_asset', id: ASSET }]))
      .toEqual([{ kind: 'banner_asset', id: ASSET }])
    expect(() => normalizeSocialMediaAssetRefs([{ kind: 'url', id: ASSET }])).toThrow('Invalid media asset kind')
    expect(() => normalizeSocialMediaAssetRefs([{ kind: 'banner_asset', id: ASSET, url: 'https://x' }])).toThrow('Invalid media asset reference')
    expect(() => normalizeSocialMediaAssetRefs(['https://cdn.example/a.jpg'])).toThrow('Invalid media asset reference')
    expect(() => normalizeSocialMediaAssetRefs(Array.from({ length: 11 }, (_, i) => ({ kind: 'banner_asset', id: ASSET.replace(/1$/, String(i % 10)) }))))
      .toThrow('at most 10')
  })

  it('filters by owning client at the query and captures the stored object identity', async () => {
    const db = dbWith(rows())
    const bucket = bucketWith({ [KEY]: { etag: 'etag-1', size: 100 } })
    const media = await resolveSocialMediaAssets({ event: event(), clientId: CLIENT, refs: [{ kind: 'banner_asset', id: ASSET }], db, bucket })
    expect(media).toEqual([{ kind: 'banner_asset', id: ASSET, mediaType: 'image', mimeType: 'image/jpeg', byteSize: 100, etag: 'etag-1' }])
    expect(String(db.calls[0]![0])).toContain('b.client_id = $1')
    expect(db.calls[0]![1]).toEqual([CLIENT, [ASSET], []])
  })

  it('rejects another client\'s asset, an unowned asset, unsafe keys, unsupported types and missing objects', async () => {
    const bucket = bucketWith({ [KEY]: { etag: 'etag-1', size: 100 } })
    const refs = [{ kind: 'banner_asset' as const, id: ASSET }]
    for (const result of [rows({ client_id: OTHER }), rows({ client_id: null }), rows({ r2_key: `banner-assets/${UPLOADER}/../x.jpg` }), rows({ mime_type: 'image/svg+xml' })]) {
      await expect(resolveSocialMediaAssets({ event: event(), clientId: CLIENT, refs, db: dbWith(result), bucket })).rejects.toMatchObject({ statusCode: 400 })
    }
    await expect(resolveSocialMediaAssets({ event: event(), clientId: CLIENT, refs, db: dbWith(rows()), bucket: bucketWith({}) }))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'Media asset file is missing' })
    await expect(resolveSocialMediaAssets({ event: { context: { cloudflare: { env: {} } } } as any, clientId: CLIENT, refs, db: dbWith(rows()) }))
      .rejects.toMatchObject({ statusCode: 503 })
  })

  it('detects replaced bytes behind the same asset UUID and storage key', async () => {
    const identity: SocialMediaAssetIdentity = { kind: 'banner_asset', id: ASSET, mediaType: 'image', mimeType: 'image/jpeg', byteSize: 100, etag: 'etag-1' }
    await expect(assertSocialMediaAssetsCurrent({ event: event(), clientId: CLIENT, identities: [identity], db: dbWith(rows()), bucket: bucketWith({ [KEY]: { etag: 'etag-1', size: 100 } }) }))
      .resolves.toBeUndefined()
    await expect(assertSocialMediaAssetsCurrent({ event: event(), clientId: CLIENT, identities: [identity], db: dbWith(rows()), bucket: bucketWith({ [KEY]: { etag: 'etag-2', size: 100 } }) }))
      .rejects.toMatchObject({ statusCode: 409 })
    await expect(assertSocialMediaAssetsCurrent({ event: event(), clientId: CLIENT, identities: [identity], db: dbWith(rows({ client_id: OTHER })), bucket: bucketWith({ [KEY]: { etag: 'etag-1', size: 100 } }) }))
      .rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('content-pinned delivery', () => {
  const identity: SocialMediaAssetIdentity = { kind: 'banner_asset', id: ASSET, mediaType: 'image', mimeType: 'image/jpeg', byteSize: 100, etag: 'etag-1' }

  it('signs expiring tokens bound to asset, client, etag and size; rejects tampering and expiry', async () => {
    const token = await signSocialMediaToken(identity, CLIENT, SECRET, Date.now() / 1000 + 60)
    expect(await verifySocialMediaToken(token, SECRET)).toEqual({ kind: 'banner_asset', id: ASSET, clientId: CLIENT, etag: 'etag-1', byteSize: 100 })
    expect(await verifySocialMediaToken(token, `${SECRET}-other`)).toBeNull()
    const [version, body, signature] = token.split('.')
    expect(await verifySocialMediaToken(`${version}.${body}A.${signature}`, SECRET)).toBeNull()
    expect(await verifySocialMediaToken(await signSocialMediaToken(identity, CLIENT, SECRET, Date.now() / 1000 - 1), SECRET)).toBeNull()
  })

  it('derives an absolute URL that matches the auth capability path and the provider media type', async () => {
    const imageUrl = await socialMediaDeliveryUrl(event(), CLIENT, identity)
    const videoUrl = await socialMediaDeliveryUrl(event(), CLIENT, { ...identity, kind: 'video_asset', id: VIDEO, mediaType: 'video', mimeType: 'video/mp4' })
    expect(SOCIAL_MEDIA_CAPABILITY_PATH.test(new URL(imageUrl).pathname)).toBe(true)
    expect(SOCIAL_MEDIA_CAPABILITY_PATH.test(new URL(videoUrl).pathname)).toBe(true)
    expect(mediaTypeForUrl(imageUrl)).toBe('image')
    expect(mediaTypeForUrl(videoUrl)).toBe('video')
    await expect(socialMediaDeliveryUrl(event({ RENDER_LINK_SECRET: 'short' }), CLIENT, identity)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('streams only the reviewed bytes, using an R2 conditional get, and refuses replaced objects', async () => {
    const url = await socialMediaDeliveryUrl(event(), CLIENT, identity)
    const token = url.split('/api/public/social-media/')[1]!
    const same = bucketWith({ [KEY]: { etag: 'etag-1', size: 100 } })
    const served = await readPinnedSocialMedia({ event: event(), token, db: dbWith(rows()), bucket: same })
    expect(served.status).toBe(200)
    expect(same.gets[0].options).toEqual({ onlyIf: { etagMatches: 'etag-1' } })
    expect((served as any).headers.get('content-type')).toBe('image/jpeg')

    expect((await readPinnedSocialMedia({ event: event(), token, db: dbWith(rows()), bucket: bucketWith({ [KEY]: { etag: 'etag-2', size: 100 } }) })).status).toBe(412)
    expect((await readPinnedSocialMedia({ event: event(), token, db: dbWith(rows({ client_id: OTHER })), bucket: same })).status).toBe(404)
    expect((await readPinnedSocialMedia({ event: event(), token: 'v1.forged.token.jpg', db: dbWith(rows()), bucket: same })).status).toBe(403)
    // A race between head and get still fails closed: the conditional get returns no body.
    const racing = bucketWith({ [KEY]: { etag: 'etag-1', size: 100 } })
    const originalGet = racing.get
    racing.get = async (key, options) => originalGet(key, { onlyIf: { etagMatches: `${options?.onlyIf?.etagMatches}-stale` } })
    expect((await readPinnedSocialMedia({ event: event(), token, db: dbWith(rows()), bucket: racing })).status).toBe(412)
  })
})

describe('provider-compatible effective media', () => {
  const image = (overrides: Partial<SocialMediaAssetIdentity> = {}): SocialMediaAssetIdentity => ({ kind: 'banner_asset', id: ASSET, mediaType: 'image', mimeType: 'image/jpeg', byteSize: 1000, etag: 'e', ...overrides })
  const video = (overrides: Partial<SocialMediaAssetIdentity> = {}): SocialMediaAssetIdentity => ({ kind: 'video_asset', id: VIDEO, mediaType: 'video', mimeType: 'video/mp4', byteSize: 1000, etag: 'v', ...overrides })

  it('requires Instagram media and JPEG images; stories/reels take exactly one item', () => {
    expect(() => assertProviderCompatibleMedia(['instagram'], [], { content: 'text only' })).toThrow('Instagram requires at least one image or video')
    expect(() => assertProviderCompatibleMedia(['instagram'], [image({ mimeType: 'image/png' })], { content: '' })).toThrow('Instagram images must be JPEG')
    expect(() => assertProviderCompatibleMedia(['instagram'], [image(), image()], { content: '', instagramTypes: { a: 'story' } })).toThrow('exactly one')
    expect(() => assertProviderCompatibleMedia(['instagram'], [image()], { content: '', instagramTypes: { a: 'reel' } })).toThrow('reels require a video')
    expect(() => assertProviderCompatibleMedia(['instagram'], [image(), video()], { content: '' })).not.toThrow()
  })

  it('rejects Facebook/LinkedIn combinations their providers would silently drop', () => {
    expect(() => assertProviderCompatibleMedia(['facebook'], [image(), video()], { content: 'x' })).toThrow('cannot mix')
    expect(() => assertProviderCompatibleMedia(['linkedin'], [video(), video()], { content: 'x' })).toThrow('one video')
    expect(() => assertProviderCompatibleMedia(['linkedin'], [], { content: ' ' })).toThrow('text or media')
    expect(() => assertProviderCompatibleMedia(['linkedin'], [video({ byteSize: 80 * 1024 * 1024 })], { content: 'x' })).toThrow('75 MB')
    expect(() => assertProviderCompatibleMedia(['facebook', 'linkedin'], [image()], { content: 'x' })).not.toThrow()
  })
})
