import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tiktokProvider, fetchTikTokPublishStatus } from '~~/server/utils/social-providers/tiktok'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('~~/server/utils/social-providers/http', async importOriginal => ({ ...await importOriginal<any>(), providerFetch: request }))

const capabilities = { creator_nickname: 'Example', creator_username: 'example', privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'], comment_disabled: false, duet_disabled: false, stitch_disabled: true, max_video_post_duration_sec: 300 }
const params = () => ({ accountId: 'creator', accessToken: 'fixture', content: 'Reviewed description', media: [{ url: 'https://media.example.test/1.jpg', type: 'image' as const }], options: { privacy_level: 'SELF_ONLY', consent: true, title: 'Reviewed title' } })
beforeEach(() => {
  request.mockReset()
  request.mockImplementation(async (url: string) => url.includes('creator_info') ? { data: capabilities, error: { code: 'ok' } } : { data: { publish_id: 'receipt-1' }, error: { code: 'ok', log_id: 'log-1' } })
})
describe('TikTok exact direct post', () => {
  it('accepts and looks up the documented opaque publish ID unchanged', async () => {
    const id = 'v_pub_file~v2-1.123456789'
    request.mockResolvedValueOnce({ data: capabilities, error: { code: 'ok' } }).mockResolvedValueOnce({ data: { publish_id: id }, error: { code: 'ok' } })
    expect(await tiktokProvider.post(params())).toMatchObject({ status: 'accepted', platformPostId: id })
    request.mockResolvedValueOnce({ data: { status: 'PUBLISH_COMPLETE' }, error: { code: 'ok' } })
    expect(await fetchTikTokPublishStatus('fixture', id)).toMatchObject({ state: 'published' })
    expect(request).toHaveBeenLastCalledWith(expect.stringContaining('/status/fetch/'), expect.objectContaining({ body: { publish_id: id } }))
  })
  it('holds invalid or unauthorized receipt lookup errors returned as HTTP failures', async () => {
    request.mockRejectedValueOnce({ statusCode: 400, data: { error: { code: 'invalid_publish_id' } } })
    expect(await fetchTikTokPublishStatus('fixture', 'receipt-1')).toMatchObject({ state: 'unknown', providerReceipt: { code: 'invalid_publish_id' } })
  })
  it('retains exact string and safe numeric public IDs without inventing rounded int64 IDs', async () => {
    request.mockResolvedValueOnce({ data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['7123456789012345678', 12345, Number('7123456789012345678')] }, error: { code: 'ok' } })
    expect(await fetchTikTokPublishStatus('fixture', 'receipt-1')).toMatchObject({ state: 'published', publicPostIds: ['7123456789012345678', '12345'] })
  })
  it('returns accepted with a receipt and no publication URL; photo AIGC belongs at the top level', async () => {
    const result = await tiktokProvider.post(params())
    expect(result).toMatchObject({ status: 'accepted', platformPostId: 'receipt-1', url: '', providerReceipt: { code: 'ok', logId: 'log-1' } })
    const body = request.mock.calls.find(([url]) => url.includes('content/init'))![1].body
    expect(body.post_info).toMatchObject({ title: 'Reviewed title', description: 'Reviewed description', privacy_level: 'SELF_ONLY', disable_comment: true, brand_content_toggle: false })
    expect(body).toHaveProperty('is_aigc', false)
    expect(body.post_info).not.toHaveProperty('is_aigc')
  })
  it.each([{ privacy_level: undefined }, { consent: false }, { privacy_level: 'FOLLOWER_OF_CREATOR' }, { brand_content_toggle: true }, { title: 'x'.repeat(91) }])('blocks invalid choices before init: %j', async (options) => {
    const input = params()
    Object.assign(input.options, options)
    expect((await tiktokProvider.post(input)).status).toBe('failed')
    expect(request.mock.calls.some(([url]) => url.includes('/init/'))).toBe(false)
  })
  it('rejects mixed and excess video rather than dropping reviewed media', async () => {
    const input: any = params()
    input.media.push({ url: 'https://media.example.test/v.mp4', type: 'video' })
    expect((await tiktokProvider.post(input)).status).toBe('failed')
    expect(request.mock.calls.some(([url]) => url.includes('/init/'))).toBe(false)
  })
  it.each([undefined, 503, 408])('holds ambiguous init %s without a replay', async (status) => {
    request.mockImplementation(async (url: string) => {
      if (url.includes('creator_info'))
        return { data: capabilities, error: { code: 'ok' } }
      throw { statusCode: status }
    })
    expect(await tiktokProvider.post(params())).toMatchObject({ status: 'failed', indeterminate: true })
    expect(request.mock.calls.filter(([url]) => url.includes('/init/'))).toHaveLength(1)
  })
  it('holds ok without a publish ID', async () => {
    request.mockResolvedValueOnce({ data: capabilities, error: { code: 'ok' } }).mockResolvedValueOnce({ error: { code: 'ok' } })
    expect(await tiktokProvider.post(params())).toMatchObject({ indeterminate: true })
  })
  it.each([['PROCESSING_DOWNLOAD', 'accepted'], ['PUBLISH_COMPLETE', 'published'], ['FAILED', 'failed'], ['SEND_TO_USER_INBOX', 'unknown'], ['FUTURE', 'unknown']])('maps status %s to %s', async (status, state) => {
    request.mockResolvedValueOnce({ data: { status }, error: { code: 'ok' } })
    expect(await fetchTikTokPublishStatus('fixture', 'receipt-1')).toMatchObject({ state, providerStatus: status })
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/status/fetch/'), expect.objectContaining({ body: { publish_id: 'receipt-1' }, retry: 0 }))
  })
})
