/* eslint-disable @stylistic/max-statements-per-line -- compact fixture tables */
import { describe, expect, it, vi } from 'vitest'
import { uploadAdImage, createAdCreative, createAd } from '~~/server/utils/metaClient'
import { assertDepartmentBannerAsset } from '~~/server/utils/ai/marketing/departmentMetaCampaignSchemas'

const request = vi.hoisted(() => vi.fn())
vi.mock('ofetch', () => ({ ofetch: request }))
describe('paid Meta safe assets and no mutation retries', () => {
  it('only admits immutable project image exports on the configured public storage origin', () => {
    expect(() => assertDepartmentBannerAsset('https://assets.example/banner-images/p/a.png', 'banner-images/p/a.png', 'p', 'https://assets.example')).not.toThrow()
    for (const url of ['http://127.0.0.1/a.png', 'https://assets.example/banner-hosted/p/index.html', 'https://evil.example/banner-images/p/a.png', 'https://user:pass@assets.example/banner-images/p/a.png']) expect(() => assertDepartmentBannerAsset(url, 'banner-images/p/a.png', 'p', 'https://assets.example')).toThrow()
  })
  it('does not retry ambiguous upload, creative or ad writes', async () => {
    request.mockRejectedValue(Object.assign(new Error('unknown'), { status: 500 }))
    const runs = [() => uploadAdImage('act_1', 'secret', Buffer.from('image'), { retries: 0 }),
      () => createAdCreative('act_1', 'secret', { name: 'a', imageHash: 'h', pageId: '1', primaryTexts: ['x'], headlines: ['x'], descriptions: [], callToAction: 'LEARN_MORE', linkUrl: 'https://example.com' }, { retries: 0 }),
      () => createAd('act_1', 'secret', { name: 'a', adsetId: '1', creativeId: '2', status: 'PAUSED' }, { retries: 0 })]
    for (const run of runs) { request.mockClear(); await expect(run()).rejects.toThrow('unknown'); expect(request).toHaveBeenCalledTimes(1) }
  })
})
