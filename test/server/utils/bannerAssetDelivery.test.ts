import { describe, expect, it } from 'vitest'

import * as bannerStorage from '~~/server/utils/bannerStorage'

const SECRET = 'render-link-secret-with-at-least-thirty-two-bytes'
const ASSET_ID = '22222222-2222-4222-8222-222222222222'
const UPLOADER_ID = '11111111-1111-4111-8111-111111111111'
const KEY = `banner-assets/${UPLOADER_ID}/33333333-3333-4333-8333-333333333333/launch-car.jpg`

describe('Banner Studio first-party asset delivery contract', () => {
  it('mints and verifies a versioned domain-separated Worker-safe capability', async () => {
    const token = await bannerStorage.signBannerAssetToken(ASSET_ID, SECRET)

    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    await expect(bannerStorage.verifyBannerAssetToken(token, SECRET)).resolves.toEqual({ version: 1, assetId: ASSET_ID })
    await expect(bannerStorage.verifyBannerAssetToken(token, `${SECRET}-different`)).resolves.toBeNull()
  })

  it.each([
    ['malformed asset id', 'not-a-uuid', SECRET],
    ['short signing secret', ASSET_ID, 'too-short'],
    ['missing signing secret', ASSET_ID, '']
  ])('fails closed for %s', async (_case, assetId, secret) => {
    await expect(bannerStorage.signBannerAssetToken(assetId, secret)).rejects.toThrow()
  })

  it('rejects malformed, tampered, unversioned, and non-UUID tokens', async () => {
    const token = await bannerStorage.signBannerAssetToken(ASSET_ID, SECRET)
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`

    await expect(bannerStorage.verifyBannerAssetToken(tampered, SECRET)).resolves.toBeNull()
    await expect(bannerStorage.verifyBannerAssetToken(token.replace(/^v1\./, 'v2.'), SECRET)).resolves.toBeNull()
    await expect(bannerStorage.verifyBannerAssetToken('v1.bm90LWEtdXVpZA.signature', SECRET)).resolves.toBeNull()
    await expect(bannerStorage.verifyBannerAssetToken('../banner-assets/key', SECRET)).resolves.toBeNull()
  })

  it('accepts only a canonical uploader-scoped Banner Studio object key', () => {
    expect(bannerStorage.isBannerAssetDeliveryKey(KEY, UPLOADER_ID)).toBe(true)
    expect(bannerStorage.isBannerAssetDeliveryKey(KEY, '44444444-4444-4444-8444-444444444444')).toBe(false)
    expect(bannerStorage.isBannerAssetDeliveryKey('banner-assets/../../private/key', UPLOADER_ID)).toBe(false)
    expect(bannerStorage.isBannerAssetDeliveryKey(`banner-assets/${UPLOADER_ID}/33333333-3333-4333-8333-333333333333/nested/file.jpg`, UPLOADER_ID)).toBe(false)
    expect(bannerStorage.isBannerAssetDeliveryKey('banner-exports/project/file.zip', UPLOADER_ID)).toBe(false)
  })
})
