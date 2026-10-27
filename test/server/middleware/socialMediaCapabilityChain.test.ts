import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'

const mocks = vi.hoisted(() => ({ rows: vi.fn(), session: vi.fn(), delegated: vi.fn(async () => null) }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: mocks.rows }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.session, acceptGodModeInternalExecution: mocks.delegated, TransientAuthError: class extends Error {} }))
vi.mock('~~/server/utils/roleResolver', () => ({ resolveUserPermissions: vi.fn() }))
const CLIENT = '0a000000-0000-4000-8000-00000000000a'
const OTHER = '0b000000-0000-4000-8000-00000000000b'
const ASSET = 'aa000000-0000-4000-8000-000000000001'
const SECRET = 'fixture-media-signing-secret-at-least-32-bytes'
const identity = { kind: 'video_asset' as const, id: ASSET, mediaType: 'video' as const, mimeType: 'video/webm', byteSize: 5, etag: 'reviewed' }
const media = await import('~~/server/utils/socialPublishing/mediaAssets')
let etag: string
const bucket = { head: vi.fn(async () => ({ etag, size: 5 })), get: vi.fn(async () => ({ etag, size: 5, body: new Response('bytes').body })) }
const event = (url = 'https://fixture.test/') => ({ method: 'GET', url, context: { params: { token: new URL(url).pathname.split('/').pop() }, cloudflare: { env: { APP_URL: 'https://fixture.test', RENDER_LINK_SECRET: SECRET, MEDIA_BUCKET: bucket } } } }) as any
async function chain(url: string) {
  const ev = event(url)
  const auth = (await import('~~/server/middleware/auth')).default
  await auth(ev)
  return await (await import('~~/server/api/public/social-media/[token].get')).default(ev)
}
describe('generated signed WebM through actual auth middleware and media handler', () => {
  beforeEach(() => {
    vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
    vi.stubGlobal('getRequestURL', (ev: any) => new URL(ev.url))
    vi.stubGlobal('getHeader', () => undefined)
    vi.stubGlobal('getCookie', () => undefined)
    vi.stubGlobal('createError', createError)
    etag = 'reviewed'
    vi.clearAllMocks()
    mocks.rows.mockResolvedValue([{ kind: 'video_asset', id: ASSET, client_id: CLIENT, r2_key: 'video-assets/reviewed.webm', mime_type: null }])
  })
  afterEach(() => vi.unstubAllGlobals())
  it('serves the generated URL without a session and preserves content identity', async () => {
    const url = await media.socialMediaDeliveryUrl(event(), CLIENT, identity)
    expect(url.endsWith('.webm')).toBe(true)
    const response = await chain(url)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('video/webm')
    expect(await response.text()).toBe('bytes')
    expect(mocks.session).not.toHaveBeenCalled()
    expect(mocks.delegated).not.toHaveBeenCalled()
    etag = 'replaced'
    await expect(chain(url)).rejects.toMatchObject({ statusCode: 412 })
  })
  it('keeps HMAC, expiry and owning-client checks at the handler', async () => {
    for (const token of ['v1.forged.signature', await media.signSocialMediaToken(identity, CLIENT, SECRET, Date.now() / 1000 - 10)]) {
      await expect(chain(`https://fixture.test/api/public/social-media/${token}.webm`)).rejects.toMatchObject({ statusCode: 403 })
    }
    expect(mocks.rows).not.toHaveBeenCalled()
    const url = await media.socialMediaDeliveryUrl(event(), CLIENT, identity)
    mocks.rows.mockResolvedValue([{ kind: 'video_asset', id: ASSET, client_id: OTHER, r2_key: 'video-assets/reviewed.webm' }])
    await expect(chain(url)).rejects.toMatchObject({ statusCode: 404 })
    expect(bucket.get).not.toHaveBeenCalled()
  })
  it.each(['unsigned.webm', 'v1.payload.signature.webm/extra', 'v1.payload.signature.svg', 'v1..signature.webm'])('denies malformed or unsigned path %s at middleware', async (path) => {
    await expect(chain(`https://fixture.test/api/public/social-media/${path}`)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.rows).not.toHaveBeenCalled()
    expect(bucket.get).not.toHaveBeenCalled()
  })
})
