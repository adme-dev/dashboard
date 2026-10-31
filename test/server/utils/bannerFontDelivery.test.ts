import { beforeEach, expect, it, vi } from 'vitest'
import { withBannerFontDelivery } from '~~/server/utils/banner/fontDelivery'
import { verifyBannerAssetToken } from '~~/server/utils/bannerStorage'

const mocks = vi.hoisted(() => ({ delivery: vi.fn() }))
vi.mock('~~/server/utils/banner/assetDelivery', () => ({ resolveBannerAssetDelivery: mocks.delivery }))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.xeroflow.test' }))
const secret = 'font-delivery-test-secret-at-least-32-bytes'
const owner = '11111111-1111-4111-8111-111111111111'
const font = {
  id: '22222222-2222-4222-8222-222222222222',
  uploadedBy: owner,
  r2Key: `banner-assets/${owner}/33333333-3333-4333-8333-333333333333/brand.ttf`,
  url: 'https://private.r2.cloudflarestorage.com/font?expired=1',
  name: 'Imported Brand', tags: ['font', 'weight:700', 'format:truetype']
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.delivery.mockReturnValue({ signingSecret: secret })
})

it('projects an existing managed font to a stable CORS delivery token without changing its row', async () => {
  const result = await withBannerFontDelivery({} as never, [font])
  expect(result[0]).toMatchObject({ name: font.name, tags: font.tags })
  expect(result[0]!.url).toMatch(/^https:\/\/app\.xeroflow\.test\/api\/public\/banner-assets\/v1\./)
  expect(result[0]!.url).not.toContain('?')
  const token = result[0]!.url.split('/').at(-1)!
  await expect(verifyBannerAssetToken(token, secret)).resolves.toMatchObject({ assetId: font.id })
  expect(font.url).toContain('expired=1')
})

it('never signs another owner, non-banner key, traversal, or malformed asset identity', async () => {
  for (const invalid of [
    { ...font, uploadedBy: '44444444-4444-4444-8444-444444444444' },
    { ...font, r2Key: 'private/customer/file.ttf' },
    { ...font, r2Key: font.r2Key.replace('brand.ttf', '../brand.ttf') },
    { ...font, id: 'not-a-uuid' }
  ]) expect(await withBannerFontDelivery({} as never, [invalid])).toEqual([invalid])
  expect(mocks.delivery).not.toHaveBeenCalled()
})

it('fails closed when managed font delivery cannot be signed', async () => {
  mocks.delivery.mockReturnValue({ signingSecret: null })
  await expect(withBannerFontDelivery({} as never, [font])).rejects.toMatchObject({ statusCode: 503 })
})
