vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.xeroflow.io' }))
import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ query: vi.fn(), fresh: vi.fn(), context: vi.fn(), access: vi.fn(), asset: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: m.fresh, transactionWithoutRetry: (fn: any) => fn({ query: m.query }) }))
vi.mock('~~/server/utils/banner/dissectionAccess', () => ({ resolveDissectionContext: m.context, assertDissectionAccess: m.access }))
vi.mock('~~/server/utils/banner/dissectionDelivery', () => ({ resolveScopedDissectionAsset: m.asset }))
import { prepareScopedExport, recheckScopedExport, parseScopedExportProvenance, scopedExportMetadata } from '~~/server/utils/banner/scopedExport'
import { hasScopedDissectionReferences } from '#shared/bannerScopedCanvas'
const projectId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
const assetId = '33333333-3333-4333-8333-333333333333'
const actorId = '44444444-4444-4444-8444-444444444444'
const revision = '2026-10-28T00:00:00.000Z'
const locator = `/api/agency/banner-studio/dissect/${jobId}/assets/${assetId}`
let row: any
let context: any
const event = { context: { cloudflare: { env: { MEDIA_BUCKET: {} } } } } as any
beforeEach(() => {
  vi.resetAllMocks()
  row = { id: projectId, updated_at: revision, canvas_data: { mrec: { layers: [{ id: 1, type: 'image', src: locator, x: 0, y: 0, w: 300, h: 250, opacity: 1, zIndex: 1 }], bgColor: '#ffffff' } } }
  context = { owner: { kind: 'project', userId: actorId, projectId, projectOwnerId: actorId, clientId: null }, sessionsInvalidatedAt: null }
  m.context.mockImplementation(async () => context)
  m.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('banner_dissections') ? [{ user_id: actorId, manifest: { source: { version: 1, mimeType: 'image/png', byteLength: 3, width: 1, height: 1, sha256: 'a'.repeat(64) }, ingestion: { version: 1, owner: context.owner, physical: null, ingestedAt: revision, sessionsInvalidatedAt: null } } }] : [row] }))
  m.asset.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png', jobId, sourceSha256: 'a'.repeat(64) })
})
const request = () => ({ projectId, sourceRevision: revision, formats: [{ key: 'mrec', html: '<script>caller</script>', width: 1, height: 1 }] })
describe('saved scoped exports', () => {
  it('canonicalizes uppercase project IDs before retaining export provenance', async () => {
    const canonical = 'abcdefab-abcd-4abc-8abc-abcdefabcdef'
    row.id = canonical
    context.owner.projectId = canonical
    const result = await prepareScopedExport(event, actorId, { ...request(), projectId: canonical.toUpperCase() }, row, 'image')
    expect(result!.provenance.projectId).toBe(canonical)
    expect(result!.body.projectId).toBe(canonical)
    const metadata = scopedExportMetadata(result!.provenance, assetId, 'b'.repeat(64))
    expect(parseScopedExportProvenance(metadata, assetId, canonical).projectId).toBe(canonical)
    expect(m.context).toHaveBeenCalledWith(expect.anything(), actorId, { projectId: canonical }, 'write')
  })
  it('uses saved canvas and embedded authorized bytes, ignoring caller HTML and dimensions', async () => {
    const result = await prepareScopedExport(event, actorId, request(), row, 'image')
    expect(result!.body.formats[0]).toMatchObject({ key: 'mrec', width: 300, height: 250 })
    expect(result!.body.formats[0].html).toContain('data:image/png;base64,AQID')
    expect(result!.body.formats[0].html).not.toContain('caller')
    expect(result!.body.formats[0].html).not.toContain(locator)
    expect(m.asset).toHaveBeenCalledWith(event, actorId, locator)
  })
  it.each([undefined, '2026-10-27T00:00:00.000Z'])('rejects absent/stale revision %s', async sourceRevision => {
    await expect(prepareScopedExport(event, actorId, { ...request(), sourceRevision }, row, 'image')).rejects.toMatchObject({ statusCode: 409 })
    expect(m.asset).not.toHaveBeenCalled()
  })
  it('denies removed source authority on final recheck', async () => {
    const result = await prepareScopedExport(event, actorId, request(), row, 'image')
    m.access.mockRejectedValueOnce(Object.assign(new Error('revoked'), { statusCode: 403 }))
    await expect(recheckScopedExport(actorId, result!.provenance, true)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('retains original dependencies after layers are removed and denies revoked source', async () => {
    const result = await prepareScopedExport(event, actorId, request(), row, 'image')
    row.canvas_data = {}; row.updated_at = '2026-10-29T00:00:00.000Z'
    await expect(recheckScopedExport(actorId, result!.provenance, false)).resolves.toBeUndefined()
    m.access.mockRejectedValueOnce(Object.assign(new Error('revoked'), { statusCode: 403 }))
    await expect(recheckScopedExport(actorId, result!.provenance, false)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('checks frozen target identity and in-flight saved revision', async () => {
    const result = await prepareScopedExport(event, actorId, request(), row, 'image')
    row.updated_at = '2026-10-29T00:00:00.000Z'
    await expect(recheckScopedExport(actorId, result!.provenance, true)).rejects.toMatchObject({ statusCode: 409 })
    context = { ...context, owner: { ...context.owner, projectOwnerId: jobId } }
    await expect(recheckScopedExport(actorId, result!.provenance, false)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([`https://foreign.test${locator}`, `${locator}?token=1`, '/scoped-dissection-assets/hidden.png', '/api/agency/banner-studio/dissect/bad/assets/bad'])('rejects malformed/foreign protected references %s', async src => {
    row.canvas_data.mrec.layers[0].src = src
    await expect(prepareScopedExport(event, actorId, request(), row, 'image')).rejects.toMatchObject({ statusCode: 400 })
    expect(m.asset).not.toHaveBeenCalled()
  })
  it('does not infer scoped status from managed QR or client metadata', async () => {
    row.canvas_data.mrec.layers[0] = { src: '/api/public/banner-assets/legacy', platformQr: { clientId: jobId } }
    expect(hasScopedDissectionReferences(row.canvas_data)).toBe(false)
    expect(await prepareScopedExport(event, actorId, request(), row, 'image')).toBeNull()
  })
  it('authorizes text-only source markers without fetching an asset', async () => {
    row.canvas_data.mrec = { dissectionSource: { jobId, sourceSha256: 'a'.repeat(64) }, layers: [{ type: 'text', text: 'Saved text', id: 1, x: 0, y: 0, w: 100, h: 40 }] }
    const result = await prepareScopedExport(event, actorId, request(), row, 'html')
    expect(result!.body.formats[0].html).toContain('Saved text')
    expect(m.asset).not.toHaveBeenCalled()
    expect(m.access).toHaveBeenCalled()
    expect(result!.provenance.dependencies).toEqual([{ jobId, sourceSha256: 'a'.repeat(64) }])
  })
  it('counts base64 expansion before allocation/rendering', async () => {
    m.asset.mockResolvedValue({ bytes: new Uint8Array(5 * 1024 * 1024), mimeType: 'image/png', jobId, sourceSha256: 'a'.repeat(64) })
    await expect(prepareScopedExport(event, actorId, request(), row, 'image')).rejects.toMatchObject({ statusCode: 413 })
  })
  it('counts repeated embedded references against the total allocation budget', async () => {
    row.canvas_data.mrec.layers.push({ ...row.canvas_data.mrec.layers[0], id: 2 })
    m.asset.mockResolvedValue({ bytes: new Uint8Array(3 * 1024 * 1024), mimeType: 'image/png', jobId, sourceSha256: 'a'.repeat(64) })
    await expect(prepareScopedExport(event, actorId, request(), row, 'image')).rejects.toMatchObject({ statusCode: 413 })
  })
  it('rejects protected textures and feed overrides explicitly', async () => {
    row.canvas_data.mrec.layers[0].textTexture = locator
    await expect(prepareScopedExport(event, actorId, request(), row, 'image')).rejects.toMatchObject({ statusCode: 409 })
    delete row.canvas_data.mrec.layers[0].textTexture
    row.canvas_data.mrec.feedUrl = 'https://example.test/feed'
    await expect(prepareScopedExport(event, actorId, request(), row, 'image')).rejects.toMatchObject({ statusCode: 409 })
  })
  it('loads custom font faces from server catalogue instead of caller content', async () => {
    row.canvas_data.mrec.layers.push({ id: 2, type: 'text', text: 'Custom type', fontFamily: 'Agency Serif', fontWeight: 400, x: 0, y: 0, w: 100, h: 20 })
    const query = m.query.getMockImplementation()!
    m.query.mockImplementation(async (sql, params) => sql.includes("'font' = ANY(tags)")
      ? { rows: [{ name: 'Agency Serif', url: 'https://assets.example.test/font.woff2', tags: ['font', 'weight:400', 'format:woff2'] }] }
      : query(sql, params))
    const result = await prepareScopedExport(event, actorId, request(), row, 'html')
    expect(result!.body.formats[0].html).toContain('https://assets.example.test/font.woff2')
    expect(result!.body.formats[0].html).toContain("font-family: 'Agency Serif'")
  })
  it.each(['personal', 'foreign-client', 'malformed'])('rejects %s source markers before any asset read', async kind => {
    const query = m.query.getMockImplementation()!
    m.query.mockImplementation(async (sql, params) => {
      const result = await query(sql, params)
      if (sql.includes('banner_dissections')) {
        if (kind === 'personal') result.rows[0].manifest.ingestion.owner = { kind: 'user', userId: actorId }
        if (kind === 'foreign-client') result.rows[0].manifest.ingestion.owner = { kind: 'client', userId: actorId, clientId: assetId }
        if (kind === 'malformed') delete result.rows[0].manifest.ingestion
      }
      return result
    })
    await expect(prepareScopedExport(event, actorId, request(), row, 'image')).rejects.toMatchObject({ statusCode: 403 })
    expect(m.asset).not.toHaveBeenCalled()
  })
  it('validates bounded strict atomic provenance and missing metadata', async () => {
    const result = await prepareScopedExport(event, actorId, request(), row, 'image')
    const metadata = scopedExportMetadata(result!.provenance, assetId, 'b'.repeat(64))
    expect(parseScopedExportProvenance(metadata, assetId, projectId).dependencies).toHaveLength(1)
    for (const value of [{}, { provenance: '{}' }, { provenance: 'x'.repeat(2000) }]) {
      expect(() => parseScopedExportProvenance(value, assetId, projectId)).toThrow()
    }
  })
})
