import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreparedMotorstackBrand } from '~~/server/utils/banner/motorstackAssets'

const mocks = vi.hoisted(() => ({ read: vi.fn(), query: vi.fn(), prepare: vi.fn(), upload: vi.fn(), remove: vi.fn(), validate: vi.fn(), failureStage: vi.fn(), transaction: vi.fn(), access: vi.fn(), auth: vi.fn(), body: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: mocks.read, transactionWithoutRetry: mocks.transaction, getTransactionFailureStage: mocks.failureStage }))
vi.mock('~~/server/utils/banner/motorstackAssets', async original => ({ ...await original<typeof import('~~/server/utils/banner/motorstackAssets')>(), prepareMotorstackBrand: mocks.prepare }))
vi.mock('~~/server/utils/banner/fontAssets', () => ({ validateBrandKitFontAssets: mocks.validate }))
vi.mock('~~/server/utils/banner/assetDelivery', () => ({ resolveBannerAssetDelivery: () => ({ signingSecret: 'secret' }) }))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.example' }))
vi.mock('~~/server/utils/bannerStorage', () => ({
  createBannerAssetId: () => '22222222-2222-4222-8222-222222222222',
  createBannerAssetStorageKey: () => 'font-key',
  bannerAssetDeliveryUrl: async () => 'https://app.example/api/public/banner-assets/v1.font.signature',
  uploadBannerAsset: mocks.upload, deleteBannerFile: mocks.remove
}))
vi.mock('~~/server/utils/auth', () => ({ requireRole: mocks.auth }))
vi.mock('~~/server/utils/banner/brandKitAccess', () => ({ requireBrandKitWriteAccess: mocks.access }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', mocks.body)
const { importMotorstackBrand, listMotorstackBrands } = await import('~~/server/utils/banner/motorstackImport')
const { motorstackSourceUrl } = await import('~~/server/utils/banner/motorstackClient')
const post = (await import('~~/server/api/agency/banner-studio/brand-kits/motorstack.post')).default
const get = (await import('~~/server/api/agency/banner-studio/brand-kits/motorstack.get')).default
const service = { listBrands: vi.fn(), getBrandKit: vi.fn(), getBrandAsset: vi.fn() }
const event = { context: { cloudflare: { env: { MOTORSTACK_BRAND_ASSETS: service } } } } as unknown as Parameters<typeof importMotorstackBrand>[0]
const kitId = '11111111-1111-4111-8111-111111111111'

function prepared(): PreparedMotorstackBrand {
  const role = { family: 'Ford', weight: 700, sourceWeight: 700, assetId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', file: 'FordBold-400.woff2' }
  return {
    metadata: { schemaVersion: 1, brand: { id: 'ford', name: 'Ford' }, fonts: [{ ...role, role: 'heading' }, { ...role, role: 'medium' }], logos: [], colors: [], assets: [], warnings: [] },
    assets: [{ sourceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Ford', fileName: role.file, mimeType: 'font/woff2', bytes: Buffer.from('validated bytes'), sha256: 'a'.repeat(64), font: { family: 'Ford', weight: 700, format: 'woff2' } }],
    fonts: [{ sourceIndex: 0, assetKey: '["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","Ford",700]' }, { sourceIndex: 1, assetKey: '["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","Ford",700]' }], logos: [], colors: [], warnings: []
  }
}
let saved: Record<string, unknown> | undefined
describe('MotorStack atomic shared imports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    saved = undefined
    mocks.read.mockResolvedValue([])
    mocks.prepare.mockResolvedValue(prepared())
    mocks.upload.mockResolvedValue({ key: 'font-key', url: 'https://app.example/api/public/banner-assets/v1.font.signature', size: 64 })
    mocks.failureStage.mockReturnValue('definite_rollback')
    mocks.auth.mockResolvedValue({ id: 'staff' })
    mocks.access.mockResolvedValue(undefined)
    mocks.body.mockResolvedValue({ brandId: 'ford' })
    service.listBrands.mockResolvedValue({ schemaVersion: 1, brands: [{ id: 'ford', name: 'Ford' }] })
    mocks.query.mockImplementation(async (sql: string, values: unknown[]) => {
      if (sql.includes('FROM brand_kits')) return { rows: saved ? [saved] : [] }
      if (sql.includes('INSERT INTO brand_kits')) {
        saved = { id: kitId, name: values[0], colors: JSON.parse(values[1] as string), fonts: JSON.parse(values[2] as string), logos: JSON.parse(values[3] as string), guidelines: values[4], source_url: values[5] }
        return { rows: [{ id: kitId }] }
      }
      return { rows: [] }
    })
    let queue = Promise.resolve()
    mocks.transaction.mockImplementation((work: (db: unknown) => Promise<unknown>) => {
      const result = queue.then(() => work({ query: mocks.query }))
      queue = result.then(() => undefined, () => undefined)
      return result
    })
  })
  it('preserves role/face/weight mapping in a shared non-default kit without mutating designs', async () => {
    const result = await importMotorstackBrand(event, service, 'ford', 'staff')
    expect(result).toMatchObject({ status: 'imported', kitId, counts: { fonts: 1, logos: 0, colors: 0 } })
    expect(saved?.fonts).toEqual([
      { role: 'heading', family: 'Ford', weights: [700], defaultWeight: 700, assets: [{ id: '22222222-2222-4222-8222-222222222222', weight: 700 }] },
      { role: 'extra', family: 'Ford', weights: [700], defaultWeight: 700, assets: [{ id: '22222222-2222-4222-8222-222222222222', weight: 700 }] }
    ])
    expect(saved?.guidelines).toContain('medium: Ford; declared weight: 700; file: FordBold-400.woff2')
    expect(saved?.guidelines).not.toMatch(/schemaVersion|assetId|aaaaaaaaaaaaaaaa/)
    expect(mocks.validate).toHaveBeenCalledWith(saved?.fonts, null, expect.anything())
    expect(mocks.query.mock.calls.some(([sql]) => /UPDATE|banner_projects|is_default/.test(sql))).toBe(false)
  })
  it('serializes duplicate per-brand requests with a lock and returns the committed kit unchanged', async () => {
    const results = await Promise.all([importMotorstackBrand(event, service, 'ford', 'staff'), importMotorstackBrand(event, service, 'ford', 'staff')])
    expect(results.map(result => result.status)).toEqual(['imported', 'existing'])
    expect(mocks.upload).toHaveBeenCalledTimes(1)
    expect(mocks.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO brand_kits'))).toHaveLength(1)
    expect(mocks.query.mock.calls.filter(([sql, params]) => sql.includes('pg_advisory_xact_lock') && params[0] === 'motorstack-brand:ford')).toHaveLength(2)
  })
  it('places main marks before on-dark and favicon while preserving every logo and source order provenance', async () => {
    const data = prepared()
    for (const [index, role] of ['favicon', 'on-dark', 'main'].entries()) {
      const id = String(index + 1).repeat(64)
      data.metadata.logos.push({ assetId: id, role, name: `${role}.png`, file: `${role}.png`, mime: 'image/png', variant: role, onDark: role === 'on-dark' })
      data.assets.push({ sourceId: id, name: role, fileName: `${role}.png`, mimeType: 'image/png', bytes: Buffer.from('validated PNG'), sha256: id })
      data.logos.push({ sourceIndex: index, assetKey: JSON.stringify([id, null, null]) })
    }
    mocks.prepare.mockResolvedValue(data)
    const result = await importMotorstackBrand(event, service, 'ford', 'staff')
    expect(result.counts.logos).toBe(3)
    expect((saved?.logos as { name: string }[]).map(logo => logo.name)).toEqual(['main: main.png', 'on-dark: on-dark.png', 'favicon: favicon.png'])
    expect(saved?.guidelines).toContain('favicon (favicon): favicon.png; for light backgrounds')
    expect(saved?.guidelines).toContain('on-dark (on-dark): on-dark.png; for dark backgrounds')
  })
  it('retains a user-edited source kit without fetching or replacing source assets', async () => {
    mocks.read.mockResolvedValue([{ id: kitId, name: 'Custom Ford', fonts: [], logos: [], colors: [], guidelines: 'Our edited guidelines' }])
    expect(await importMotorstackBrand(event, service, 'ford', 'staff')).toMatchObject({ status: 'existing', brandName: 'Custom Ford', kitId })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('reopens readable missing-source warnings without replacing edited notes', async () => {
    const data = prepared()
    data.warnings = ['Body font has no downloadable file; no substitute was assigned.']
    data.metadata.colors = [{ name: 'primaryColor', value: '#123456' }]
    mocks.prepare.mockResolvedValue(data)
    await importMotorstackBrand(event, service, 'ford', 'staff')
    expect(saved?.guidelines).toContain('primaryColor: #123456')
    const edited = `${saved?.guidelines}\n\nProducer note: use the light logo on white.`
    mocks.read.mockResolvedValue([{ ...saved, guidelines: edited }])
    const result = await importMotorstackBrand(event, service, 'ford', 'staff')
    expect(result.warnings).toContain(data.warnings[0])
    expect(mocks.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO brand_kits'))).toHaveLength(1)
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
  })
  it('still reads legacy JSON warnings without rewriting the existing kit', async () => {
    mocks.read.mockResolvedValue([{ id: kitId, name: 'Ford', fonts: [], logos: [], colors: [], guidelines: JSON.stringify({ provider: 'MotorStack', warnings: ['Legacy missing file warning.'], schemaVersion: 1 }) }])
    const result = await importMotorstackBrand(event, service, 'ford', 'staff')
    expect(result.warnings).toContain('Legacy missing file warning.')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('reuses exact shared font checksums under the generic font upload lock', async () => {
    const base = mocks.query.getMockImplementation()!
    mocks.query.mockImplementation((sql, values) => sql.includes('FROM banner_assets') ? { rows: [{ id: '33333333-3333-4333-8333-333333333333', url: 'https://old.example/font', r2Key: 'old-key' }] } : base(sql, values))
    await importMotorstackBrand(event, service, 'ford', 'staff')
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.query.mock.calls.some(([sql, params]) => sql.includes('pg_advisory_xact_lock') && params[0] === `banner-font:shared:Ford:700:${'a'.repeat(64)}`)).toBe(true)
    expect(mocks.query.mock.calls.find(([sql]) => sql.includes('FROM banner_assets'))?.[0]).toContain('client_id IS NULL')
  })
  it('does not start writes for an incomplete asset download', async () => {
    mocks.prepare.mockRejectedValue(new Error('download failed'))
    await expect(importMotorstackBrand(event, service, 'ford', 'staff')).rejects.toThrow('download failed')
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it.each(['definite_rollback', 'ambiguous_commit'])('cleans up only confirmed rollback, preserving uncertain committed files: %s', async (stage) => {
    mocks.failureStage.mockReturnValue(stage)
    const base = mocks.transaction.getMockImplementation()!
    mocks.transaction.mockImplementation(async (work) => {
      await base(work)
      throw new Error('commit failure')
    })
    await expect(importMotorstackBrand(event, service, 'ford', 'staff')).rejects.toThrow('commit failure')
    expect(mocks.remove).toHaveBeenCalledTimes(stage === 'definite_rollback' ? 1 : 0)
  })
  it('lists only shared kit source matches, never assuming a same-name custom kit is imported', async () => {
    mocks.read.mockResolvedValue([{ id: kitId, source_url: motorstackSourceUrl('ford') }])
    expect(await listMotorstackBrands(service)).toEqual({ brands: [{ id: 'ford', name: 'Ford', existingKitId: kitId }], warnings: [] })
    expect(mocks.read.mock.calls[0]?.[0]).toContain('client_id IS NULL')
  })
  it.each([get, post])('requires creative role and shared-kit write permission before service calls', async (handler) => {
    mocks.access.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.auth).toHaveBeenCalled()
    expect(mocks.access).toHaveBeenCalledWith(event, null)
    expect(service.listBrands).not.toHaveBeenCalled()
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it('rejects arbitrary asset URLs and client scope in caller input', async () => {
    mocks.body.mockResolvedValue({ brandId: 'ford', url: 'https://evil.test/font', clientId: kitId })
    await expect(post(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
})
