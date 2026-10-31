import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), multipart: vi.fn(), upload: vi.fn(), query: vi.fn(), delivery: vi.fn(), remove: vi.fn() }))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), readMultipartFormData: mocks.multipart }))
vi.mock('~~/server/utils/auth', () => ({ requireRole: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: async (fn: (db: unknown) => unknown) => fn({ query: mocks.query }), getTransactionFailureStage: () => 'definite_rollback' }))
vi.mock('~~/server/utils/banner/brandKitAccess', () => ({ requireBrandKitWriteAccess: async () => {} }))
vi.mock('~~/server/utils/banner/fontDelivery', () => ({ withBannerFontDelivery: async (_event: unknown, rows: unknown[]) => rows }))
vi.mock('~~/server/utils/bannerStorage', () => ({
  uploadBannerAsset: mocks.upload,
  createBannerAssetId: () => '22222222-2222-4222-8222-222222222222',
  createBannerAssetStorageKey: () => 'font-key',
  bannerAssetDeliveryUrl: async () => 'https://app.example/api/public/banner-assets/v1.font.signature',
  deleteBannerFile: mocks.remove
}))
vi.mock('~~/server/utils/banner/assetDelivery', () => ({ resolveBannerAssetDelivery: mocks.delivery }))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.example' }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', (input: { statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
const handler = (await import('~~/server/api/agency/banner-studio/fonts/upload.post')).default

function fontBytes() {
  const bytes = Buffer.alloc(64)
  bytes.write('wOF2')
  bytes.writeUInt32BE(0x00010000, 4)
  bytes.writeUInt32BE(bytes.length, 8)
  bytes.writeUInt16BE(1, 12)
  bytes.writeUInt32BE(32, 16)
  return bytes
}

function request(weight?: string) {
  mocks.multipart.mockResolvedValue([
    { name: 'file', filename: 'gotham.woff2', type: 'font/woff2', data: fontBytes() },
    ...(weight === undefined ? [] : [{ name: 'weight', data: Buffer.from(weight) }])
  ])
  return handler({} as Parameters<typeof handler>[0])
}

describe('custom font upload weight fidelity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'producer' })
    mocks.delivery.mockReturnValue({ signingSecret: null })
    mocks.remove.mockResolvedValue(undefined)
    mocks.upload.mockResolvedValue({ key: 'font-key', url: 'https://assets.example/font.woff2', size: 4 })
    mocks.query.mockImplementation((sql, values) => Promise.resolve({ rows: sql.includes('INSERT INTO') ? [{ id: values[7], name: values[0], tags: values[5], clientId: values[8] }] : [] }))
  })

  it.each(['1', '325', '950', '1000'])('persists exact weight %s without rounding', async (weight) => {
    expect(await request(weight)).toMatchObject({ tags: ['font', `weight:${weight}`, 'format:woff2', `sha256:${createHash('sha256').update(fontBytes()).digest('hex')}`] })
  })
  it('defaults to regular only when weight is omitted', async () => {
    expect(await request()).toMatchObject({ tags: ['font', 'weight:400', 'format:woff2', `sha256:${createHash('sha256').update(fontBytes()).digest('hex')}`] })
  })
  it.each(['', ' ', '0', '-1', '1001', '325.5', '325px', 'NaN', 'Infinity'])('rejects invalid weight %j before storing an asset', async (weight) => {
    await expect(request(weight)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('uses native storage and a stable signed delivery URL tied to the inserted font id', async () => {
    const bucket = { put: vi.fn(), head: vi.fn(), delete: vi.fn() }
    mocks.delivery.mockReturnValue({ signingSecret: 'secret', nativeUpload: { bucket } })
    await request('700')
    expect(mocks.upload).toHaveBeenCalledWith(fontBytes(), 'gotham.woff2', 'font/woff2', 'producer', 'font-key',
      { bucket, assetUrl: 'https://app.example/api/public/banner-assets/v1.font.signature' }, 'https://app.example/api/public/banner-assets/v1.font.signature')
    expect(mocks.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO'))?.[1][7]).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('ignores an attacker-controlled multipart HTML MIME for valid font bytes', async () => {
    mocks.multipart.mockResolvedValue([{ name: 'file', filename: 'safe.woff2', type: 'text/html', data: fontBytes() }])
    await handler({} as Parameters<typeof handler>[0])
    expect(mocks.upload.mock.calls[0]?.[2]).toBe('font/woff2')
    expect(mocks.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO'))?.[1][1]).toBe('font/woff2')
  })

  it.each(['text/html', 'font/ttf'])('rejects HTML bytes disguised as a font with MIME %s', async (type) => {
    mocks.multipart.mockResolvedValue([{ name: 'file', filename: 'payload.ttf', type, data: Buffer.from('<script>alert(document.cookie)</script>') }])
    await expect(handler({} as Parameters<typeof handler>[0])).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('reuses an exact scoped family/weight/checksum without uploading again', async () => {
    const existing = { id: 'existing', name: 'gotham', clientId: null, tags: ['font', 'weight:400', `sha256:${'a'.repeat(64)}`] }
    mocks.query.mockImplementation(sql => Promise.resolve({ rows: sql.includes('LIMIT 1 FOR SHARE') ? [existing] : [] }))
    expect(await request()).toMatchObject({ id: 'existing', sha256: 'a'.repeat(64) })
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock')
    const lookup = mocks.query.mock.calls.find(([sql]) => sql.includes('LIMIT 1 FOR SHARE'))!
    expect(lookup[0]).toContain('client_id IS NOT DISTINCT FROM $1::uuid')
    expect(lookup[1].slice(0, 3)).toEqual([null, 'gotham', 'weight:400'])
  })

  it('removes the newly stored font if its database insert fails', async () => {
    mocks.query.mockImplementation(sql => sql.includes('INSERT INTO') ? Promise.reject(new Error('database unavailable')) : Promise.resolve({ rows: [] }))
    await expect(request('700')).rejects.toMatchObject({ statusCode: 500 })
    expect(mocks.remove).toHaveBeenCalledWith('font-key', undefined)
  })
})
