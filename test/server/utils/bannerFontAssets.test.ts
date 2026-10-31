import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fontAssetMetadata, resolveCanvasFonts, validateBrandKitFontAssets, validateCanvasFontAssets } from '~~/server/utils/banner/fontAssets'

const rows = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: rows }))
const ID = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'
const face = { id: ID, name: 'Brand', clientId: CLIENT, tags: ['font', 'weight:325'], url: 'https://example.com/font.woff' }
const query = vi.fn()
const db = { query }
const kit = [{ family: 'Brand', weights: [325], defaultWeight: 325, assets: [{ id: ID, weight: 325 }] }]
const canvas = { custom_300x250: { layers: [{ fontFamily: 'Brand', fontWeight: 325, fontAssetId: ID }] } }
beforeEach(() => {
  vi.clearAllMocks()
  query.mockResolvedValue({ rows: [face] })
  rows.mockResolvedValue([face])
})
describe('managed brand font references', () => {
  it('validates exact client/family/weight under a font row lock', async () => {
    await validateBrandKitFontAssets(kit, CLIENT, db)
    expect(query.mock.calls[0][0]).toContain('FOR SHARE')
    await validateCanvasFontAssets(canvas, CLIENT, db)
  })
  it('allows shared legacy fonts without assigning them to the client', async () => {
    query.mockResolvedValue({ rows: [{ ...face, clientId: null }] })
    await validateBrandKitFontAssets(kit, CLIENT, db)
    expect(query.mock.calls.every(([sql]) => !/UPDATE|INSERT/.test(sql))).toBe(true)
  })
  it.each([
    [[{ ...face, clientId: 'other' }]],
    [[{ ...face, name: 'Other family' }]],
    [[{ ...face, tags: ['font', 'weight:700'] }]],
    [[]]
  ])('rejects a foreign, mismatched or missing face', async (result) => {
    query.mockResolvedValue({ rows: result })
    await expect(validateBrandKitFontAssets(kit, CLIENT, db)).rejects.toMatchObject({ statusCode: 400 })
    await expect(validateCanvasFontAssets(canvas, CLIENT, db)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('rejects unavailable role defaults and weights without an uploaded face', async () => {
    await expect(validateBrandKitFontAssets([{ ...kit[0], defaultWeight: 700 }], CLIENT, db)).rejects.toMatchObject({ statusCode: 400 })
    await expect(validateBrandKitFontAssets([{ ...kit[0], weights: [325, 700] }], CLIENT, db)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('rejects malformed explicit layer ids before querying', async () => {
    await expect(validateCanvasFontAssets({ x: { layers: [{ fontAssetId: 'not-id' }] } }, CLIENT, db)).rejects.toMatchObject({ statusCode: 400 })
    expect(query).not.toHaveBeenCalled()
  })
  it('resolves explicit identities and keeps same-name legacy fallback scoped and deterministic', async () => {
    const shared = { ...face, id: '33333333-3333-4333-8333-333333333333', clientId: null }
    rows.mockResolvedValueOnce([face]).mockResolvedValueOnce([face, shared])
    const result = await resolveCanvasFonts({ x: { layers: [...canvas.custom_300x250.layers, { fontFamily: 'Brand' }] } }, CLIENT)
    expect(result).toEqual([face])
    expect(rows.mock.calls[1][0]).toContain('(client_id IS NULL OR client_id = $2::uuid)')
    expect(rows.mock.calls[1][1]).toEqual([['Brand'], CLIENT])
  })
  it('rejects ambiguous role assets and malformed canvas without server errors', async () => {
    await expect(validateBrandKitFontAssets([{ ...kit[0], assets: [kit[0].assets[0], kit[0].assets[0]] }], CLIENT, db)).rejects.toMatchObject({ statusCode: 400 })
    await expect(validateCanvasFontAssets('broken JSON', CLIENT, db)).rejects.toMatchObject({ statusCode: 400 })
    await expect(validateCanvasFontAssets({ x: { layers: [null, 'bad'] } }, CLIENT, db)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('locks existing legacy family faces in the destination scope without requiring managed Google/system fonts', async () => {
    query.mockResolvedValue({ rows: [] })
    await validateCanvasFontAssets({ mrec: { layers: [{ fontFamily: 'Legacy Brand' }, { fontFamily: 'Arial' }] } }, CLIENT, db)
    await validateBrandKitFontAssets([{ family: 'Google Family', weights: [400] }], CLIENT, db)
    expect(query).toHaveBeenCalledTimes(2)
    for (const [sql] of query.mock.calls) {
      expect(sql).toContain('ORDER BY id FOR SHARE')
      expect(sql).toContain('(client_id IS NULL OR client_id = $2::uuid)')
    }
    expect(query.mock.calls[0][1]).toEqual([['Legacy Brand', 'Arial'], CLIENT])
    expect(query.mock.calls[1][1]).toEqual([['Google Family'], CLIENT])
  })

  it('returns null for legacy checksum and exact new checksums', () => {
    expect(fontAssetMetadata({ tags: ['font'] })).toMatchObject({ clientId: null, sha256: null })
    expect(fontAssetMetadata({ tags: [`sha256:${'a'.repeat(64)}`] }).sha256).toBe('a'.repeat(64))
  })
})
