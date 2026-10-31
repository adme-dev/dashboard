import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mediaCatalog, mediaQuerySchema, mediaSelectionSchema, readMedia, importMedia } from '~~/server/utils/banner/motorstackMedia'

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), failureStage: vi.fn(), query: vi.fn(), upload: vi.fn(), remove: vi.fn(), delivery: vi.fn(), assetId: vi.fn(), storageKey: vi.fn(), deliveryUrl: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: mocks.transaction, getTransactionFailureStage: mocks.failureStage }))
vi.mock('~~/server/utils/bannerStorage', () => ({ bannerAssetDeliveryUrl: mocks.deliveryUrl, createBannerAssetId: mocks.assetId, createBannerAssetStorageKey: mocks.storageKey, deleteBannerFile: mocks.remove, uploadBannerAsset: mocks.upload }))
vi.mock('~~/server/utils/banner/assetDelivery', () => ({ resolveBannerAssetDelivery: mocks.delivery }))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.example' }))
const id = 'a'.repeat(64)
const selection = { brandId: 'gwm', assetId: id, model: 'H7' }
const metadata = () => ({ schemaVersion: 1, brand: { id: 'gwm', name: 'GWM' }, assets: [{ id, name: 'GWM H7', type: 'image', mime: 'image/png', importable: true }], models: ['H7'], warnings: [] })
const service = (data = metadata(), bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), mime = 'image/png') => ({ listMedia: vi.fn().mockResolvedValue(data), getMediaAsset: vi.fn().mockImplementation(async () => new Response(bytes, { headers: { 'content-type': mime } })) })
describe('MotorStack media boundaries', () => {
  it('accepts only exact brand/model/asset selectors, never remote URLs', () => {
    expect(mediaSelectionSchema.parse(selection)).toEqual(selection)
    for (const bad of [{ ...selection, url: 'https://evil.test' }, { ...selection, brandId: '../gwm' }, { ...selection, model: 'H7\nsecret' }, { ...selection, assetId: 'bad' }]) expect(mediaSelectionSchema.safeParse(bad).success).toBe(false)
    expect(mediaQuerySchema.safeParse({ brandId: 'gwm', model: ['H7'] }).success).toBe(false)
    expect(mediaQuerySchema.safeParse({ brandId: 'gwm', model: 'a'.repeat(101) }).success).toBe(false)
  })
  it('projects only authenticated application file URLs with stable source identities', async () => {
    const result = await mediaCatalog(service(), { brandId: 'gwm', model: 'H7' })
    expect(result.assets[0]?.previewUrl).toBe(`/api/agency/banner-studio/motorstack/file?brandId=gwm&model=H7&assetId=${id}`)
    expect(result.assets[0]?.importable).toBe(true)
  })
  it('rejects mismatched brand and duplicate asset identities', async () => {
    const data = metadata()
    data.brand.id = 'ford'
    await expect(mediaCatalog(service(data), { brandId: 'gwm' })).rejects.toMatchObject({ statusCode: 502 })
    data.brand.id = 'gwm'
    data.assets.push(data.assets[0]!)
    await expect(mediaCatalog(service(data), { brandId: 'gwm' })).rejects.toMatchObject({ statusCode: 502 })
  })
  it('rebinds a file to current catalog before reading any bytes', async () => {
    const binding = service()
    await expect(readMedia(binding, { ...selection, assetId: 'b'.repeat(64) })).rejects.toMatchObject({ statusCode: 404 })
    expect(binding.getMediaAsset).not.toHaveBeenCalled()
    expect((await readMedia(binding, selection)).bytes.length).toBe(8)
    expect(binding.getMediaAsset).toHaveBeenCalledWith(selection)
  })
  it('rejects changed MIME and HTML disguised as raster media', async () => {
    await expect(readMedia(service(metadata(), Buffer.from('<html>bad</html>')), selection)).rejects.toMatchObject({ statusCode: 502 })
    await expect(readMedia(service(metadata(), Buffer.from('bad'), 'text/html'), selection)).rejects.toMatchObject({ statusCode: 502 })
  })
  it('accepts verified WebP bytes behind a PNG catalog path and uses the delivered extension', async () => {
    const bytes = Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'binary')
    const file = await readMedia(service(metadata(), bytes, 'image/webp'), selection)
    expect(file.mimeType).toBe('image/webp')
    expect(file.filename).toBe('motorstack-GWM H7.webp')
    await expect(readMedia(service(metadata(), Buffer.from('invalid'), 'image/webp'), selection)).rejects.toMatchObject({ statusCode: 502 })
    await expect(readMedia(service(metadata(), Buffer.from('<svg/>'), 'image/svg+xml'), selection)).rejects.toMatchObject({ statusCode: 502 })
    const document = metadata()
    document.assets[0]!.mime = 'application/pdf'
    await expect(readMedia(service(document, bytes, 'image/webp'), selection)).rejects.toMatchObject({ statusCode: 502 })
  })
  it('uses JPEG bytes when MotorStack labels a vehicle image as PNG', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    const file = await readMedia(service(metadata(), bytes, 'image/png'), selection)
    expect(file.mimeType).toBe('image/jpeg')
    expect(file.filename).toBe('motorstack-GWM H7.jpg')
  })
  it('allows valid PDF downloads but never persists PDF as an image layer asset', async () => {
    const data = metadata()
    Object.assign(data.assets[0]!, { mime: 'application/pdf', type: 'document', importable: true })
    const binding = service(data, Buffer.from('%PDF-1.7\n'), 'application/pdf')
    expect((await mediaCatalog(binding, { brandId: 'gwm' })).assets[0]?.importable).toBe(false)
    expect((await readMedia(binding, selection)).filename).toBe('motorstack-GWM H7.pdf')
    await expect(importMedia({} as Parameters<typeof importMedia>[0], binding, selection, 'user')).rejects.toMatchObject({ statusCode: 422 })
  })
  it('does not expose SVG or unsupported media through previews', async () => {
    const data = metadata()
    data.assets[0]!.mime = 'image/svg+xml'
    const catalog = await mediaCatalog(service(data), { brandId: 'gwm' })
    expect(catalog.assets).toEqual([])
    expect(catalog.warnings.join(' ')).toMatch(/unsupported|not supported|omitted/i)
  })
  it('accepts a short display name without misclassifying valid image bytes', async () => {
    const data = metadata()
    data.assets[0]!.name = 'H7'
    const file = await readMedia(service(data), selection)
    expect(file.asset.name).toBe('H7')
    expect(file.filename).toBe('motorstack-H7.png')
  })
})

interface StoredMedia { id: string, name: string, mimeType: string, fileSize: number, r2Key: string, url: string, tags: string[], uploadedBy: string, clientId: string | null }
describe('MotorStack managed media transactions', () => {
  const event = {} as Parameters<typeof importMedia>[0]
  const bucket = { put: vi.fn(), head: vi.fn(), delete: vi.fn() }
  let rows: StoredMedia[]
  const serializeTransactions = () => {
    let queue = Promise.resolve()
    mocks.transaction.mockImplementation((work: (db: unknown) => Promise<unknown>) => {
      const result = queue.then(() => work({ query: mocks.query }))
      queue = result.then(() => undefined, () => undefined)
      return result
    })
  }
  beforeEach(() => {
    vi.clearAllMocks()
    rows = []
    let sequence = 0
    mocks.assetId.mockImplementation(() => `22222222-2222-4222-8222-${String(++sequence).padStart(12, '0')}`)
    mocks.storageKey.mockImplementation((filename, userId) => `banner-assets/${userId}/${sequence}/${filename}`)
    mocks.deliveryUrl.mockImplementation(async assetId => `https://app.example/api/public/banner-assets/${assetId}`)
    mocks.delivery.mockReturnValue({ signingSecret: 'local-test-secret', nativeUpload: { bucket } })
    mocks.upload.mockImplementation(async (bytes: Buffer, _name, _mime, _user, key, _native, url) => ({ key, url, size: bytes.length }))
    mocks.remove.mockResolvedValue(undefined)
    mocks.failureStage.mockReturnValue('definite_rollback')
    mocks.query.mockImplementation(async (sql: string, values: unknown[]) => {
      if (sql.includes('FROM banner_assets')) return { rows: rows.filter(row => row.uploadedBy === values[0] && row.clientId === null && (values[1] as string[]).every(tag => row.tags.includes(tag))).slice(0, 1) }
      if (sql.includes('INSERT INTO banner_assets')) {
        const row = { id: values[0], name: values[1], mimeType: values[2], fileSize: values[3], r2Key: values[4], url: values[5], tags: values[6], uploadedBy: values[7], clientId: null } as StoredMedia
        rows.push(row)
        return { rows: [row] }
      }
      return { rows: [] }
    })
    serializeTransactions()
  })
  it('reuses one asset for concurrent imports of the same owner/source/content', async () => {
    const results = await Promise.all([importMedia(event, service(), selection, 'owner-a'), importMedia(event, service(), selection, 'owner-a')])
    expect(results[0]?.asset.id).toBe(results[1]?.asset.id)
    expect(rows).toHaveLength(1)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
    const locks = mocks.query.mock.calls.filter(([sql]) => sql.includes('pg_advisory_xact_lock'))
    expect(locks).toHaveLength(2)
    expect(locks[0]?.[1]).toEqual(locks[1]?.[1])
    expect(locks[0]?.[1][0]).toMatch(/^motorstack-media:owner-a:[a-f0-9]{64}:[a-f0-9]{64}$/)
    expect(rows[0]?.tags).toEqual(expect.arrayContaining(['motorstack-media', 'motorstack-brand:gwm', `motorstack-asset:${id}`]))
  })
  it('never reuses another owner’s personal upload', async () => {
    const first = await importMedia(event, service(), selection, 'owner-a')
    const second = await importMedia(event, service(), selection, 'owner-b')
    expect(first.asset.id).not.toBe(second.asset.id)
    expect(second.asset.uploadedBy).toBe('owner-b')
    expect(mocks.upload).toHaveBeenCalledTimes(2)
    expect(mocks.query.mock.calls.filter(([sql]) => sql.includes('FROM banner_assets')).every(([sql]) => sql.includes('uploaded_by = $1') && sql.includes('client_id IS NULL'))).toBe(true)
  })
  it('never reuses an asset assigned to a client, even for the same owner', async () => {
    await importMedia(event, service(), selection, 'owner-a')
    rows[0]!.clientId = 'client-a'
    await importMedia(event, service(), selection, 'owner-a')
    expect(rows).toHaveLength(2)
    expect(rows[1]?.clientId).toBeNull()
  })
  it('stores a fresh asset when source bytes change under the same source ID', async () => {
    await importMedia(event, service(), selection, 'owner-a')
    await importMedia(event, service(metadata(), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])), selection, 'owner-a')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.tags.find(tag => tag.startsWith('sha256:'))).not.toBe(rows[1]?.tags.find(tag => tag.startsWith('sha256:')))
  })
  it('cleans a created object after confirmed database rollback', async () => {
    const base = mocks.query.getMockImplementation()!
    mocks.query.mockImplementation(async (sql, values) => {
      if (sql.includes('INSERT INTO')) throw new Error('insert failed')
      return base(sql, values)
    })
    await expect(importMedia(event, service(), selection, 'owner-a')).rejects.toThrow('insert failed')
    expect(mocks.remove).toHaveBeenCalledWith(mocks.upload.mock.calls[0]?.[4], bucket)
    expect(rows).toHaveLength(0)
  })
  it('cleans attempted storage after a put/head failure and confirmed rollback', async () => {
    mocks.upload.mockRejectedValue(new Error('R2 verification failed'))
    await expect(importMedia(event, service(), selection, 'owner-a')).rejects.toThrow('R2 verification failed')
    expect(mocks.remove).toHaveBeenCalledTimes(1)
    expect(rows).toHaveLength(0)
  })
  it('preserves uncertain committed assets and safely reuses them on retry', async () => {
    const base = mocks.transaction.getMockImplementation()!
    mocks.transaction.mockImplementation(async (work) => {
      await base(work)
      throw new Error('commit acknowledgement lost')
    })
    mocks.failureStage.mockReturnValue('ambiguous_commit')
    await expect(importMedia(event, service(), selection, 'owner-a')).rejects.toThrow('commit acknowledgement lost')
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(rows).toHaveLength(1)
    serializeTransactions()
    const retry = await importMedia(event, service(), selection, 'owner-a')
    expect(retry.asset.id).toBe(rows[0]?.id)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })
  it('does not open a transaction or upload after invalid bytes', async () => {
    await expect(importMedia(event, service(metadata(), Buffer.from('<html>bad</html>')), selection, 'owner-a')).rejects.toMatchObject({ statusCode: 502 })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
