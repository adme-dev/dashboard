import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), fonts: vi.fn(), delivery: vi.fn(), header: vi.fn() }))
vi.mock('~~/server/utils/banner/viewerSnapshot', () => ({ authorizedBannerSnapshot: mocks.authorize }))
vi.mock('~~/server/utils/banner/fontAssets', () => ({ resolveCanvasFonts: mocks.fonts, fontAssetMetadata: (font: object) => font }))
vi.mock('~~/server/utils/banner/fontDelivery', () => ({ withBannerFontDelivery: mocks.delivery }))
vi.stubGlobal('getRouterParam', () => '22222222-2222-4222-8222-222222222222')
vi.stubGlobal('setHeader', mocks.header)
const { teamBannerPreviewAccess } = await import('~~/server/utils/banner/teamPreview')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.authorize.mockResolvedValue({ document: { projectId: '22222222-2222-4222-8222-222222222222', name: 'Saved artwork', canvasData: { custom_1200x1200: { layers: [] } } }, clientId: 'client', clientName: 'Client' })
  mocks.fonts.mockResolvedValue([])
  mocks.delivery.mockImplementation(async (_event: unknown, fonts: unknown) => fonts)
})

it.each([401, 403, 404])('requires existing project/client authorization before exposing artwork or fonts: %s', async (statusCode) => {
  mocks.authorize.mockRejectedValueOnce(Object.assign(new Error(), { statusCode }))
  await expect(teamBannerPreviewAccess({} as never).load()).rejects.toMatchObject({ statusCode })
  expect(mocks.fonts).not.toHaveBeenCalled()
})

it('loads the same saved artwork and stable font metadata without creating a client link', async () => {
  mocks.fonts.mockResolvedValue([{ id: 'font', name: 'Face', url: 'managed-url', tags: ['font'], clientId: 'client', sha256: 'original', uploadedBy: 'private-owner', r2Key: 'private-key' }])
  const access = teamBannerPreviewAccess({} as never)
  const result = await access.load()
  expect(access.basePath).toBe('/api/agency/banner-studio/projects/22222222-2222-4222-8222-222222222222')
  expect(result.project).toMatchObject({ id: '22222222-2222-4222-8222-222222222222', clientId: 'client' })
  expect(result.fonts[0]).toEqual({ id: 'font', name: 'Face', url: 'managed-url', tags: ['font'], clientId: 'client', sha256: 'original' })
  expect(mocks.header).toHaveBeenCalledWith(expect.anything(), 'Cache-Control', 'private, no-store')
})
