import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), multipart: vi.fn(), upload: vi.fn(), query: vi.fn() }))
vi.mock('h3', () => ({ readMultipartFormData: mocks.multipart }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.query }))
vi.mock('~~/server/utils/bannerStorage', () => ({ uploadBannerAsset: mocks.upload }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', (input: { statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
const handler = (await import('~~/server/api/agency/banner-studio/fonts/upload.post')).default

function request(weight?: string) {
  mocks.multipart.mockResolvedValue([
    { name: 'file', filename: 'gotham.woff2', type: 'font/woff2', data: Buffer.from('font') },
    ...(weight === undefined ? [] : [{ name: 'weight', data: Buffer.from(weight) }])
  ])
  return handler({} as Parameters<typeof handler>[0])
}

describe('custom font upload weight fidelity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'producer' })
    mocks.upload.mockResolvedValue({ key: 'font-key', url: 'https://assets.example/font.woff2', size: 4 })
    mocks.query.mockImplementation((_sql, values) => Promise.resolve({ tags: values[5] }))
  })

  it.each(['1', '325', '950', '1000'])('persists exact weight %s without rounding', async (weight) => {
    expect(await request(weight)).toMatchObject({ tags: ['font', `weight:${weight}`, 'format:woff2'] })
  })
  it('defaults to regular only when weight is omitted', async () => {
    expect(await request()).toMatchObject({ tags: ['font', 'weight:400', 'format:woff2'] })
  })
  it.each(['', ' ', '0', '-1', '1001', '325.5', '325px', 'NaN', 'Infinity'])('rejects invalid weight %j before storing an asset', async (weight) => {
    await expect(request(weight)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
