import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { createDesignAssetStorage } from '../../server/utils/email-marketing/designAssets'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../../server/utils/db', () => ({ queryOneFresh: query, transactionWithoutRetry: vi.fn() }))
const origin = 'https://app.xeroflow.io'
const id = '20000000-0000-4000-8000-000000000001'
const url = `${origin}/api/public/banner-assets/v1.registered-existing-upload.signature`
const fixture = () => {
  const get = vi.fn(async () => ({ size: 3, body: new Response(new Uint8Array([1, 2, 3])).body! }))
  return { get, event: { context: { cloudflare: { env: { MEDIA_BUCKET: { get } } } } } as unknown as H3Event }
}

describe('registered asset delivery keeps the upload signing owner', () => {
  beforeEach(() => query.mockReset())
  it('reads only the bound bucket and uses exact stored signed URLs without a signing secret', async () => {
    const { event, get } = fixture()
    const storage = createDesignAssetStorage(event, origin)
    expect(await storage.read('registered/storage/key')).toEqual(new Uint8Array([1, 2, 3]))
    expect(get).toHaveBeenCalledWith('registered/storage/key')
    query.mockResolvedValueOnce({ url }).mockResolvedValueOnce({ id })
    expect(await storage.url(id)).toBe(url)
    expect(query.mock.calls[0][1]).toEqual([id])
    expect(await storage.identifyUrl(url)).toBe(id)
    expect(query.mock.calls[1][1]).toEqual([url])
    expect(query.mock.calls.every(([sql]) => sql.includes('email_publication IS NOT NULL'))).toBe(true)
  })
  it('never accepts URL strings as authority without an exact registered row', async () => {
    const { event } = fixture()
    const storage = createDesignAssetStorage(event, origin)
    for (const candidate of ['https://foreign.example/image.png', url + '?extra=1', url + '#fragment', 'javascript:alert(1)', url.replace('https:', 'http:')]) {
      expect(await storage.identifyUrl(candidate)).toBe(null)
    }
    expect(query).not.toHaveBeenCalled()
    query.mockResolvedValueOnce(null)
    expect(await storage.identifyUrl(url)).toBe(null)
    query.mockResolvedValueOnce({ url: 'https://foreign.example/image.png' })
    await expect(storage.url(id)).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
  })
  it('fails closed on hosted requests without the actual storage read binding', () => {
    expect(() => createDesignAssetStorage({ context: { cloudflare: { env: {} } } } as H3Event, origin)).toThrowError(expect.objectContaining({ code: 'ASSET_STORAGE_UNAVAILABLE' }))
  })
})
