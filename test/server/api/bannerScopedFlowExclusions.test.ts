import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
const m = vi.hoisted(() => ({ fresh: vi.fn(), query: vi.fn(), upload: vi.fn(), render: vi.fn(), edit: vi.fn() }))
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('createError', createError)
vi.stubGlobal('readBody', (event: any) => event.body)
vi.mock('h3', async original => ({ ...await original<any>(), readBody: (event: any) => event.body, readMultipartFormData: (event: any) => event.parts }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => ({ id: '44444444-4444-4444-8444-444444444444' }) }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: m.fresh, queryOne: m.query, execute: vi.fn(), transactionWithoutRetry: vi.fn() }))
vi.mock('~~/server/utils/storage', () => ({ uploadFile: m.upload }))
vi.mock('~~/server/utils/bannerStorage', () => ({ uploadBannerExport: m.upload, uploadBannerAsset: m.upload }))
vi.mock('~~/server/utils/qwenImageEditor', () => ({ editImageWithAI: m.edit }))
vi.mock('~~/server/utils/banner/godModeRender', () => ({ executeGodModeBannerRender: m.render }))
const publish = (await import('~~/server/api/agency/banner-studio/publish.post')).default
const video = (await import('~~/server/api/agency/banner-studio/export-video.post')).default
const upload = (await import('~~/server/api/agency/banner-studio/exports/upload.post')).default
const edit = (await import('~~/server/api/agency/banner-studio/ai/edit-layer.post')).default
import { assertProjectAllowsUnprotectedFlow } from '~~/server/utils/banner/scopedExport'
const projectId = '11111111-1111-4111-8111-111111111111'
const locator = '/api/agency/banner-studio/dissect/22222222-2222-4222-8222-222222222222/assets/33333333-3333-4333-8333-333333333333'
beforeEach(() => {
  vi.resetAllMocks()
  m.fresh.mockResolvedValue({ canvas_data: { mrec: { layers: [{ src: locator }] } } })
  m.query.mockResolvedValue({ id: projectId })
})
describe('managed flow exclusions from authoritative saved canvas', () => {
  it('rejects publishing even with caller HTML and no client provenance', async () => {
    await expect(publish({ body: { projectId, formatKey: 'mrec', html: '<html>caller bytes</html>', width: 300, height: 250 } } as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.upload).not.toHaveBeenCalled()
  })
  it('rejects MP4 before queue/audit/render effects', async () => {
    await expect(video({ body: { projectId, formats: [{ key: 'mrec', html: '<html>caller</html>', width: 300, height: 250 }] } } as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.render).not.toHaveBeenCalled()
  })
  it('rejects opaque ZIP upload before storage', async () => {
    const parts = [{ name: 'file', data: Buffer.from('opaque'), filename: 'x.zip' }, { name: 'projectId', data: Buffer.from(projectId) }, { name: 'formatKey', data: Buffer.from('mrec') }]
    await expect(upload({ parts } as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.upload).not.toHaveBeenCalled()
  })
  it.each([locator, `https://foreign.test${locator}`, encodeURIComponent(locator)])('rejects AI source %s before fetch/provider', async imageUrl => {
    await expect(edit({ body: { imageUrl, prompt: 'edit' } } as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.edit).not.toHaveBeenCalled(); expect(m.upload).not.toHaveBeenCalled()
  })
  it('permits legacy/QR canvases and rejects malformed protected namespaces', async () => {
    m.fresh.mockResolvedValue({ canvas_data: { mrec: { layers: [{ src: '/api/public/banner-assets/token', platformQr: { clientId: projectId } }] } } })
    await expect(assertProjectAllowsUnprotectedFlow(projectId)).resolves.toBeUndefined()
    await expect(assertProjectAllowsUnprotectedFlow(projectId, '/scoped-dissection-assets/bad')).rejects.toMatchObject({ statusCode: 409 })
  })
})
