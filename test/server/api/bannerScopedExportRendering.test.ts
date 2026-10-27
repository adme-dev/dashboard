vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.xeroflow.io' }))
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'
import { createHash } from 'node:crypto'
import { encode } from 'jpeg-js'
import { createRequire } from 'node:module'
import type { BannerRenderRequest } from '#shared/bannerRenderContract'
const { GIFEncoder } = createRequire(import.meta.url)('gifenc')
vi.mock('h3', async original => ({ ...await original<any>(), readBody: (event: any) => event.body, setHeader: vi.fn() }))
const m = vi.hoisted(() => ({ fresh: vi.fn(), query: vi.fn(), context: vi.fn(), access: vi.fn(), asset: vi.fn(), auth: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: m.fresh, queryOne: vi.fn(), transactionWithoutRetry: (fn: any) => fn({ query: m.query }) }))
vi.mock('~~/server/utils/banner/dissectionAccess', () => ({ resolveDissectionContext: m.context, assertDissectionAccess: m.access }))
vi.mock('~~/server/utils/banner/dissectionDelivery', () => ({ resolveScopedDissectionAsset: m.asset }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth, requireWriteAccess: m.auth }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: vi.fn(), hasAllSocialClientAccess: () => false }))
import { renderBannerExports } from '~~/server/utils/banner/exportRendering'
import htmlExport from '~~/server/api/agency/banner-studio/export-html.post'
import JSZip from 'jszip'
import { deliverBannerRasterExport } from '~~/server/utils/banner/exportDelivery'
const P = '11111111-1111-4111-8111-111111111111', J = '22222222-2222-4222-8222-222222222222', A = '33333333-3333-4333-8333-333333333333', U = '44444444-4444-4444-8444-444444444444'
const rev = '2026-10-28T00:00:00.000Z'
const locator = `/api/agency/banner-studio/dissect/${J}/assets/${A}`
let project: any, row: any, revoked: boolean, target: any
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
function fixture() {
  const objects = new Map<string, { data: Uint8Array, options: any }>()
  const stored = (key: string) => {
    const item = objects.get(key)
    return item ? { size: item.data.length, ...item.options, body: new Blob([item.data]).stream() } : null
  }
  const bucket = { put: vi.fn(async (key, data, options) => { objects.set(key, { data, options }); return {} }), get: vi.fn(async key => stored(key)), head: vi.fn(async key => stored(key)), delete: vi.fn() }
  const renderer = { render: vi.fn(async (req: BannerRenderRequest) => ({ version: 1, ok: true, value: { items: req.items.map(item => {
    const w = item.width * item.scale, h = item.height * item.scale
    let data: Uint8Array
    if (req.output === 'jpeg') data = encode({ width: w, height: h, data: Buffer.alloc(w*h*4) }, 90).data
    else if (req.output === 'gif') {
      const gif = GIFEncoder(); gif.writeFrame(new Uint8Array(w*h), w, h, { palette: [[0,0,0],[255,255,255]], delay: 100 }); gif.finish(); data = gif.bytes()
    } else data = PNG.sync.write(new PNG({ width: w, height: h }))
    return { ...item, output: req.output, mime: req.output === 'jpeg' ? 'image/jpeg' : `image/${req.output}`, pixelWidth: w, pixelHeight: h,
      frames: 1, bytes: new Uint8Array(data), byteLength: data.length, sha256: hash(data), ...(req.output === 'gif' ? { durationSec: 0.1, frameDelayMs: 100 } : {}) }
  }) } })) }
  const event: any = { context: { params: {}, cloudflare: { env: { MEDIA_BUCKET: bucket, BANNER_RENDERER_PRODUCTION: renderer } } } }
  return { event, renderer, bucket, objects }
}
const body = () => ({ projectId: P, sourceRevision: rev, formats: [{ key: 'mrec', html: '<html>caller secret</html>', width: 1, height: 1 }] })
beforeEach(() => {
  vi.resetAllMocks(); revoked = false; row = null
  project = { client_id: null, created_by: U, updated_at: rev, canvas_data: { mrec: { layers: [{ id: 1, type: 'image', src: locator, x: 0, y: 0, w: 300, h: 250, zIndex: 1, opacity: 1 }] } } }
  target = { owner: { kind: 'project', userId: U, projectId: P, projectOwnerId: U, clientId: null }, sessionsInvalidatedAt: null }
  m.context.mockImplementation(async () => target)
  m.auth.mockResolvedValue({ id: U })
  m.asset.mockResolvedValue({ bytes: new Uint8Array([1,2,3]), mimeType: 'image/png', jobId: J, sourceSha256: 'a'.repeat(64) })
  m.access.mockImplementation(async () => { if (revoked) throw Object.assign(new Error('denied'), { statusCode: 403 }) })
  m.fresh.mockImplementation(async sql => sql.includes('banner_exports') ? row : project)
  m.query.mockImplementation(async (sql, values) => {
    if (sql.includes('INSERT INTO banner_exports')) {
      row = { id: values[0], project_id: values[1], r2_key: values[3], export_type: values[6], file_size: values[5], client_id: null, created_by: U }
      return { rows: [{ id: values[0] }] }
    }
    return { rows: sql.includes('banner_dissections') ? [{ user_id: U, manifest: { source: { version: 1, mimeType: 'image/png', byteLength: 3, width: 1, height: 1, sha256: 'a'.repeat(64) }, ingestion: { version: 1, owner: { kind: 'project', userId: U, projectId: P, projectOwnerId: U, clientId: null }, physical: null, ingestedAt: rev, sessionsInvalidatedAt: null } } }] : [project] }
  })
})
describe('protected rendered exports and retained downloads', () => {
  it.each(['png', 'jpg', 'gif'])('renders saved %s without private URLs/cookies and writes atomic provenance', async format => {
    const f = fixture()
    const input = format === 'gif' ? { ...body(), fps: 10 } : { ...body(), format }
    const results = await renderBannerExports(f.event, { id: U } as any, input, format === 'gif' ? 'gif' : 'image')
    const sent = JSON.stringify(f.renderer.render.mock.calls)
    expect(sent).toContain('data:image/png;base64,AQID'); expect(sent).not.toContain(locator); expect(sent).not.toContain('caller secret'); expect(sent).not.toContain('cookie')
    expect(f.bucket.put).toHaveBeenCalledTimes(1)
    expect(f.bucket.put.mock.calls[0][0]).toMatch(/^scoped-banner-exports\//)
    expect(JSON.parse(f.bucket.put.mock.calls[0][2].customMetadata.provenance).dependencies).toEqual([{ jobId: J, sourceSha256: 'a'.repeat(64) }])
    f.event.context.params.id = results[0]!.url.split('/').at(-2)
    const delivered = await deliverBannerRasterExport(f.event)
    expect(delivered.headers.get('cache-control')).toBe('private, no-store')
    expect((await delivered.arrayBuffer()).byteLength).toBe(row.file_size)
  })
  it('delivers server-authorized HTML for a single file and a ZIP with embedded images', async () => {
    const f = fixture(); f.event.body = { projectId: P, sourceRevision: rev, formats: [{ key: 'mrec', html: 'caller injection' }] }
    const result = await htmlExport(f.event)
    expect(result.formats[0].html).toContain('data:image/png;base64,AQID')
    expect(result.formats[0].html).not.toContain(locator)
    expect(result.formats[0].html).not.toContain('caller injection')
    const zip = new JSZip(); zip.file('mrec.html', result.formats[0].html)
    const opened = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }))
    expect(await opened.file('mrec.html')!.async('string')).toBe(result.formats[0].html)
    expect(f.renderer.render).not.toHaveBeenCalled(); expect(f.bucket.put).not.toHaveBeenCalled()
  })
  it('retained download rechecks revocation after object read before response', async () => {
    const f = fixture(); await renderBannerExports(f.event, { id: U } as any, body(), 'image'); f.event.context.params.id = row.id
    const get = f.bucket.get.getMockImplementation()!
    f.bucket.get.mockImplementation(async key => { const result = await get(key); revoked = true; return result })
    await expect(deliverBannerRasterExport(f.event)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('preserves object evidence after an ambiguous export insert acknowledgement', async () => {
    const f = fixture(), query = m.query.getMockImplementation()!
    m.query.mockImplementation(async (sql, values) => { const result = await query(sql, values); if (sql.includes('INSERT INTO banner_exports')) throw new Error('ack lost'); return result })
    await expect(renderBannerExports(f.event, { id: U } as any, body(), 'image')).rejects.toMatchObject({ statusCode: 503 })
    expect(f.bucket.delete).not.toHaveBeenCalled(); expect(f.bucket.put).toHaveBeenCalledTimes(1)
    expect(row).not.toBeNull()
  })
  it('revocation during render prevents storage and result response', async () => {
    const f = fixture(), render = f.renderer.render.getMockImplementation()!
    f.renderer.render.mockImplementation(async req => { const result = await render(req); revoked = true; return result })
    await expect(renderBannerExports(f.event, { id: U } as any, body(), 'image')).rejects.toMatchObject({ statusCode: 403 })
    expect(f.bucket.put).not.toHaveBeenCalled()
  })
  it('loss of write permission during rendering denies creation while read remains allowed', async () => {
    const f = fixture(), render = f.renderer.render.getMockImplementation()!
    let readOnly = false
    m.access.mockImplementation(async (_db, _actor, _job, mode) => {
      if (readOnly && mode === 'write') throw Object.assign(new Error('read-only'), { statusCode: 403 })
    })
    f.renderer.render.mockImplementation(async req => { const result = await render(req); readOnly = true; return result })
    await expect(renderBannerExports(f.event, { id: U } as any, body(), 'image')).rejects.toMatchObject({ statusCode: 403 })
    expect(f.bucket.put).not.toHaveBeenCalled()
  })
  it('stale saved revision prevents renderer invocation', async () => {
    const f = fixture()
    await expect(renderBannerExports(f.event, { id: U } as any, { ...body(), sourceRevision: '2026-10-27T00:00:00.000Z' }, 'image')).rejects.toMatchObject({ statusCode: 409 })
    expect(f.renderer.render).not.toHaveBeenCalled()
  })
  it.each([false, true])('retained GET/HEAD denies original source revoked after canvas removal (HEAD=%s)', async headOnly => {
    const f = fixture(); await renderBannerExports(f.event, { id: U } as any, body(), 'image')
    f.event.context.params.id = row.id; project.canvas_data = {}; project.updated_at = '2026-10-29T00:00:00.000Z'; revoked = true
    await expect(deliverBannerRasterExport(f.event, headOnly)).rejects.toMatchObject({ statusCode: 403 })
    expect(f.bucket.get).not.toHaveBeenCalled()
  })
  it.each(['missing', 'hash', 'size'])('rejects %s stored provenance/bytes', async damage => {
    const f = fixture(); await renderBannerExports(f.event, { id: U } as any, body(), 'image'); f.event.context.params.id = row.id
    const stored = f.objects.get(row.r2_key)!
    if (damage === 'missing') delete stored.options.customMetadata
    if (damage === 'hash') stored.data[0] ^= 1
    if (damage === 'size') row.file_size++
    await expect(deliverBannerRasterExport(f.event)).rejects.toMatchObject({ statusCode: 503 })
  })
  it('never deletes or retries an ambiguous scoped object write', async () => {
    const f = fixture(); f.bucket.put.mockRejectedValueOnce(new Error('ack lost'))
    await expect(renderBannerExports(f.event, { id: U } as any, body(), 'image')).rejects.toMatchObject({ statusCode: 503 })
    expect(f.bucket.put).toHaveBeenCalledTimes(1); expect(f.bucket.delete).not.toHaveBeenCalled(); expect(row).toBeNull()
  })
  it('requires a native request bucket', async () => {
    const f = fixture(); delete f.event.context.cloudflare.env.MEDIA_BUCKET
    await expect(renderBannerExports(f.event, { id: U } as any, body(), 'image')).rejects.toMatchObject({ statusCode: 503 })
    expect(f.renderer.render).not.toHaveBeenCalled()
  })
})
