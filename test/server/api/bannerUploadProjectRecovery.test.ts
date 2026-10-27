import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasScopedCanvas } from '../../../shared/bannerScopedCanvas'

const m = vi.hoisted(() => ({ write: vi.fn(), client: vi.fn(), multipart: vi.fn(), upload: vi.fn(), insert: vi.fn() }))
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.mock('h3', async importOriginal => ({ ...await importOriginal<typeof import('h3')>(), readMultipartFormData: m.multipart }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: m.write, requireAuth: async () => ({ id: '11111111-1111-4111-8111-111111111111' }) }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: m.client }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.insert }))
vi.mock('~~/server/utils/bannerStorage', () => ({ uploadBannerAsset: m.upload }))
const upload = (await import('../../../server/api/agency/banner-studio/projects/upload-banners.post')).default
const actor = '11111111-1111-4111-8111-111111111111'
const client = '22222222-2222-4222-8222-222222222222'
const file = (filename: string, type = 'image/png') => ({ name: 'files', filename, type, data: Buffer.from('legacy bytes') })
const field = (name: string, value: string) => ({ name, data: Buffer.from(value) })
function parts(files = [file('Sale banner.png')], dimensions: unknown = files.map(() => ({ w: 300, h: 250 }))) {
  return [field('name', 'Upload'), field('clientId', client), field('dimensions', JSON.stringify(dimensions)), ...files]
}
beforeEach(() => {
  vi.resetAllMocks()
  m.write.mockResolvedValue({ id: actor })
  m.client.mockResolvedValue({ id: actor })
  m.multipart.mockResolvedValue(parts())
  m.upload.mockImplementation(async (_bytes, filename) => ({ url: `https://assets.example/banner-assets/${actor}/object/${filename}` }))
  m.insert.mockResolvedValue({ id: 'project', name: 'Upload' })
})
const noEffects = () => {
  expect(m.upload).not.toHaveBeenCalled()
  expect(m.insert).not.toHaveBeenCalled()
}
describe('legacy upload project admission', () => {
  it.each([
    'scoped-banner-exports/x.png', 'scoped-banner-exports', 'a%2Fbanner-studio%2Fdissect%2Fx.png',
    'a%252Fbanner-studio%252Fdissect%252Fx.png', 'scoped-dissection-assets\\x.png',
    '../x.png', '..\\x.png', 'x.png?private', 'x.png#private', '%2e%2e.png', '.', '..', '\u0000x.png',
  ])('rejects unsafe filename %s before any batch effect', async filename => {
    m.multipart.mockResolvedValue(parts([file('safe.png'), file(filename)]))
    await expect(upload({} as any)).rejects.toMatchObject({ statusCode: 400 })
    noEffects()
  })
  it.each([
    null, {}, [{ w: 'a%2Fbanner-studio%2Fdissect%2Fx', h: 250 }],
    [{ w: 0, h: 250 }], [{ w: 1.5, h: 250 }], [{ w: 300, h: -1 }], [null],
  ])('rejects malformed dimensions %j before any effects', async dimensions => {
    m.multipart.mockResolvedValue(parts([file('safe.png')], dimensions))
    await expect(upload({} as any)).rejects.toMatchObject({ statusCode: 400 })
    noEffects()
  })
  it('requires write access before reading multipart or storage', async () => {
    m.write.mockRejectedValue(createError({ statusCode: 403, statusMessage: 'Read only' }))
    await expect(upload({} as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.multipart).not.toHaveBeenCalled()
    noEffects()
  })
  it.each([400, 403, 503])('propagates client scope failure %s before storage', async statusCode => {
    m.client.mockRejectedValue(createError({ statusCode, statusMessage: 'Client unavailable' }))
    await expect(upload({} as any)).rejects.toMatchObject({ statusCode })
    expect(m.client).toHaveBeenCalledWith(expect.anything(), client)
    noEffects()
  })
  it('preserves PNG/JPEG/GIF/WebP batches, normal filenames and format deduplication', async () => {
    const files = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].map((type, i) => file(`Sale 50% été ${i}.png`, type))
    m.multipart.mockResolvedValue(parts(files))
    await expect(upload({} as any)).resolves.toEqual({ id: 'project', name: 'Upload', formatCount: 4 })
    expect(m.client.mock.invocationCallOrder[0]).toBeLessThan(m.upload.mock.invocationCallOrder[0])
    expect(m.upload).toHaveBeenCalledTimes(4)
    const params = m.insert.mock.calls[0]![1]
    const canvas = JSON.parse(params[2])
    expect(Object.keys(canvas)).toEqual(['mrec', 'mrec_2', 'mrec_3', 'mrec_4'])
    expect(hasScopedCanvas(canvas)).toBe(false)
    expect(params[1]).toBe(client)
    expect(m.upload.mock.calls[0]).toEqual([files[0]!.data, files[0]!.filename, files[0]!.type, actor])
  })
  it('preserves personal legacy uploads without a client', async () => {
    m.multipart.mockResolvedValue(parts().filter(part => part.name !== 'clientId'))
    await expect(upload({} as any)).resolves.toMatchObject({ formatCount: 1 })
    expect(m.client).not.toHaveBeenCalled()
    expect(m.insert.mock.calls[0]![1][1]).toBeNull()
  })
})
