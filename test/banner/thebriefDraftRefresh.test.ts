// Malformed fixture mutations deliberately exercise runtime validation outside TypeScript contracts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readTheBriefDraftRefresh } from '../../server/utils/banner/thebriefDraftRefresh'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PROJECT = '33333333-3333-4333-8333-333333333333'
const ASSET = 'https://assets.example.com/banners/source.png'
const originalTime = '2026-10-31T01:00:00.000Z'
const source = { designHash: 'blood-oct', sha256: 'a'.repeat(64), folder: 'Blood Motor Group', duration: 4, loopCount: 0 }
const layer = { id: 1, type: 'image', name: 'Car', x: 0, y: 0, w: 300, h: 250, zIndex: 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 4, src: ASSET }
const replacement = { custom_300x250: { layers: [{ ...layer, opacity: 0.6, visualFilter: 'brightness(0.8) contrast(1.2)' }], playback: { duration: 4, loopCount: 0 } } }
let project: any
let versions: any[]
let owned: string[]
let fontRows: any[]
let active: boolean
let failAt: 'backup' | 'update' | 'version-conflict' | null
let queries: string[]
const writeAccess = vi.fn()
const clientAccess = vi.fn()
const marketing = vi.fn()
const transact = vi.fn()
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: (...args: unknown[]) => writeAccess(...args) }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: (...args: unknown[]) => clientAccess(...args) }))
vi.mock('~~/server/utils/banner/marketingProjectAccess', () => ({ isMarketingPortfolioUser: (...args: unknown[]) => marketing(...args) }))
vi.mock('~~/server/utils/db', () => ({ transaction: (...args: unknown[]) => transact(...args) }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (event: any) => event.id)
vi.stubGlobal('readBody', async (event: any) => event.body)
vi.stubGlobal('setHeader', vi.fn())
const { default: endpoint } = await import('../../server/api/agency/banner-studio/projects/[id]/thebrief-refresh.patch')

const db = {
  async query(sql: string, params: any[] = []) {
    queries.push(sql)
    if (sql.includes('FROM banner_projects')) return { rows: project ? [structuredClone(project)] : [] }
    if (sql.includes('FROM agency_clients')) return { rows: active ? [{ id: CLIENT }] : [] }
    if (sql.includes('FROM banner_assets') && sql.includes("'font' = ANY(tags)")) return { rows: fontRows }
    if (sql.includes('FROM banner_assets')) return { rows: owned.map(url => ({ url })) }
    if (sql.includes('INSERT INTO banner_versions')) {
      if (failAt === 'backup') throw new Error('Backup storage unavailable')
      if (failAt === 'version-conflict') throw Object.assign(new Error('Duplicate version'), { code: '23505', constraint: 'idx_banner_versions_project_number' })
      versions.push({ projectId: params[0], version: versions.length + 1, canvasData: JSON.parse(params[1]), label: params[2], createdBy: params[3] })
      return { rows: [] }
    }
    if (sql.includes('UPDATE banner_projects')) {
      if (failAt === 'update') throw new Error('Update storage unavailable')
      project = { ...project, canvasData: JSON.parse(params[1]), tags: params[2], thumbnailUrl: null, updatedAt: params[3] }
      return { rows: [structuredClone(project)] }
    }
    throw new Error('Unexpected query')
  }
}
// Model rollback of the DB-only callback; the endpoint must supply both writes to this transaction.
async function transaction(operation: (connection: typeof db) => Promise<unknown>) {
  const beforeProject = structuredClone(project), beforeVersions = structuredClone(versions)
  try {
    return await operation(db)
  } catch (error) {
    project = beforeProject
    versions = beforeVersions
    throw error
  }
}
function request(overrides = {}) {
  return { id: PROJECT, body: { clientId: CLIENT, expectedUpdatedAt: originalTime, source, canvasData: replacement, ...overrides } } as never
}
beforeEach(() => {
  project = {
    id: PROJECT, name: 'Producer edited title', clientId: CLIENT, folderId: 'folder-original', thumbnailUrl: 'old-thumbnail',
    canvasData: { custom_300x250: { layers: [structuredClone(layer)], playback: { duration: 4, loopCount: 0 } } },
    status: 'draft', reviewStatus: 'draft', createdBy: 'original-author', createdAt: originalTime, updatedAt: originalTime,
    tags: ['custom:retain-me', 'source:thebrief', `source-sha256:${source.sha256}`, `source-design:${source.designHash}`, 'source-duration:4', 'source-loops:0', 'import:needs-review']
  }
  versions = []
  owned = [ASSET]
  fontRows = []
  active = true
  failAt = null
  queries = []
  writeAccess.mockReset().mockResolvedValue({ id: 'producer' })
  clientAccess.mockReset().mockResolvedValue(undefined)
  marketing.mockReset().mockReturnValue(false)
  transact.mockReset().mockImplementation(transaction)
})

describe('TheBrief imported draft refresh boundary', () => {
  it('preserves managed font IDs through strict refresh validation and checks client ownership', async () => {
    const fontId = '44444444-4444-4444-8444-444444444444'
    const canvas = structuredClone(replacement)
    Object.assign(canvas.custom_300x250.layers[0], { type: 'text', fontFamily: 'Imported Brand', fontWeight: 700, fontAssetId: fontId, text: 'Brand' })
    delete (canvas.custom_300x250.layers[0] as any).src
    fontRows = [{ id: fontId, name: 'Imported Brand', clientId: OTHER, tags: ['font', 'weight:700'] }]
    await expect(endpoint(request({ canvasData: canvas }))).rejects.toMatchObject({ statusCode: 400 })
    expect(versions).toHaveLength(0)
    fontRows[0].clientId = CLIENT
    const result: any = await endpoint(request({ canvasData: canvas }))
    expect(result.canvasData.custom_300x250.layers[0].fontAssetId).toBe(fontId)
    expect(queries.some(sql => sql.includes('FROM banner_assets') && sql.includes('FOR SHARE'))).toBe(true)
  })

  it('snapshots the old canvas and saves corrected effects while preserving project identity', async () => {
    const previous = structuredClone(project)
    const saved: any = await endpoint(request())
    expect(saved.refreshed).toBe(true)
    expect(saved.canvasData).toEqual(replacement)
    expect(saved).toMatchObject({ name: previous.name, folderId: previous.folderId, clientId: CLIENT, status: 'draft', reviewStatus: 'draft', createdBy: previous.createdBy })
    expect(saved.tags).toEqual(expect.arrayContaining(previous.tags))
    expect(saved.thumbnailUrl).toBeNull()
    expect(versions).toEqual([{ projectId: PROJECT, version: 1, canvasData: previous.canvasData, label: 'Before TheBrief imported draft update', createdBy: 'producer' }])
    expect(queries[0]).toContain('FOR UPDATE')
    expect(queries.find(sql => sql.includes('FROM banner_assets'))).toContain('client_id = $1')
    expect(transact).toHaveBeenCalledOnce()
    expect(clientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT)
  })
  it('reconciles an identical request after a lost response without another version or write', async () => {
    const first: any = await endpoint(request())
    queries = []
    const retry: any = await endpoint(request())
    expect(retry).toEqual({ ...first, refreshed: false })
    expect(versions).toHaveLength(1)
    expect(queries).toHaveLength(1)
  })
  it('does not use a previous retry marker to overwrite later edits', async () => {
    await endpoint(request())
    project.canvasData.custom_300x250.layers[0].x = 20
    await expect(endpoint(request())).rejects.toMatchObject({ statusCode: 409 })
    expect(project.canvasData.custom_300x250.layers[0].x).toBe(20)
    expect(versions).toHaveLength(1)
  })
  it('rejects retry after a later save even when the canvas values are unchanged', async () => {
    await endpoint(request())
    project.updatedAt = new Date(new Date(project.updatedAt).getTime() + 1).toISOString()
    await expect(endpoint(request())).rejects.toMatchObject({ statusCode: 409 })
    expect(versions).toHaveLength(1)
  })
  it('rejects a different corrected package against a stale revision', async () => {
    await endpoint(request())
    const changed = structuredClone(replacement)
    changed.custom_300x250.layers[0].opacity = 0.7
    await expect(endpoint(request({ canvasData: changed }))).rejects.toMatchObject({ statusCode: 409 })
    expect(versions).toHaveLength(1)
  })
  it('keeps an identical current canvas without an unnecessary backup', async () => {
    project.canvasData = structuredClone(replacement)
    const saved: any = await endpoint(request())
    expect(saved.refreshed).toBe(false)
    expect(versions).toHaveLength(0)
    expect(queries.some(sql => sql.includes('UPDATE banner_projects'))).toBe(false)
  })
  it.each(['backup', 'update'] as const)('rolls back the complete transaction when %s fails', async (failure) => {
    const previous = structuredClone(project)
    failAt = failure
    await expect(endpoint(request())).rejects.toThrow('storage unavailable')
    expect(project).toEqual(previous)
    expect(versions).toHaveLength(0)
  })
  it('returns a conflict and leaves the draft intact when a legacy writer claims the version number', async () => {
    const previous = structuredClone(project)
    failAt = 'version-conflict'
    await expect(endpoint(request())).rejects.toMatchObject({ statusCode: 409 })
    expect(project).toEqual(previous)
    expect(versions).toHaveLength(0)
  })
  it.each([
    ['published', (p: any) => { p.status = 'published' }],
    ['under review', (p: any) => { p.reviewStatus = 'in_review' }],
    ['approved', (p: any) => { p.reviewStatus = 'approved' }],
    ['review flag removed', (p: any) => { p.tags = p.tags.filter((t: string) => t !== 'import:needs-review') }],
    ['different client', (p: any) => { p.clientId = OTHER }],
    ['different design', (p: any) => { p.tags = p.tags.map((t: string) => t.startsWith('source-design:') ? 'source-design:other' : t) }],
    ['different hash', (p: any) => { p.tags = p.tags.map((t: string) => t.startsWith('source-sha256:') ? `source-sha256:${'b'.repeat(64)}` : t) }],
    ['duplicate hash', (p: any) => { p.tags.push(`source-sha256:${source.sha256}`) }],
    ['missing source', (p: any) => { p.tags = p.tags.filter((t: string) => t !== 'source:thebrief') }],
    ['different duration', (p: any) => { p.tags = p.tags.map((t: string) => t === 'source-duration:4' ? 'source-duration:8' : t) }],
    ['stale timestamp', (p: any) => { p.updatedAt = '2026-10-31T01:00:01.000Z' }]
  ])('rejects %s without a snapshot or update', async (_name, mutate) => {
    mutate(project)
    await expect(endpoint(request())).rejects.toMatchObject({ statusCode: 409 })
    expect(versions).toHaveLength(0)
    expect(queries).toHaveLength(1)
  })
  it('denies unauthorized and read-only requests before beginning a transaction', async () => {
    writeAccess.mockRejectedValue(Object.assign(new Error('Denied'), { statusCode: 401 }))
    await expect(endpoint(request())).rejects.toMatchObject({ statusCode: 401 })
    expect(clientAccess).not.toHaveBeenCalled()
    expect(transact).not.toHaveBeenCalled()
    writeAccess.mockRejectedValue(Object.assign(new Error('Read only'), { statusCode: 403 }))
    await expect(endpoint(request())).rejects.toMatchObject({ statusCode: 403 })
    expect(transact).not.toHaveBeenCalled()
  })
  it('preserves the marketing portfolio rule protecting imported artwork', async () => {
    marketing.mockReturnValue(true)
    await expect(endpoint(request())).rejects.toMatchObject({ statusCode: 403 })
    expect(transact).not.toHaveBeenCalled()
  })
  it('denies foreign client access before any project read', async () => {
    clientAccess.mockRejectedValue(Object.assign(new Error('No client access'), { statusCode: 403 }))
    await expect(endpoint(request())).rejects.toMatchObject({ statusCode: 403 })
    expect(transact).not.toHaveBeenCalled()
    expect(queries).toEqual([])
  })
  it('requires active client ownership of every managed asset', async () => {
    owned = []
    await expect(endpoint(request())).rejects.toMatchObject({ statusCode: 400 })
    expect(versions).toHaveLength(0)
    active = false
    await expect(endpoint(request())).rejects.toMatchObject({ statusCode: 409 })
    expect(versions).toHaveLength(0)
  })
  it('returns 404 for a missing project', async () => {
    project = null
    await expect(endpoint(request())).rejects.toMatchObject({ statusCode: 404 })
    expect(versions).toHaveLength(0)
  })
})

describe('strict managed draft update validation', () => {
  it('accepts bounded static filters and restores managed URLs after schema validation', () => {
    const parsed = readTheBriefDraftRefresh((request() as any).body)
    expect(parsed.canvasData).toEqual(replacement)
    expect(parsed.assetUrls).toEqual([ASSET])
  })
  it.each([
    ['external effect', (body: any) => { body.canvasData.custom_300x250.layers[0].visualFilter = 'url(https://attacker.example/filter)' }],
    ['local asset', (body: any) => { body.canvasData.custom_300x250.layers[0].src = './media/image.png' }],
    ['script asset', (body: any) => { body.canvasData.custom_300x250.layers[0].src = 'javascript:alert(1)' }],
    ['invalid animation timing', (body: any) => { body.canvasData.custom_300x250.layers[0].endTime = 5 }],
    ['arbitrary layer field', (body: any) => { body.canvasData.custom_300x250.layers[0].html = '<script>bad</script>' }],
    ['attempted rename', (body: any) => { body.name = 'New name' }],
    ['attempted publish', (body: any) => { body.status = 'published' }],
    ['missing expected revision', (body: any) => { delete body.expectedUpdatedAt }],
    ['invalid client', (body: any) => { body.clientId = 'bad' }],
    ['empty canvas', (body: any) => { body.canvasData = {} }]
  ])('rejects %s before database access', async (_name, mutate) => {
    const event: any = structuredClone(request())
    mutate(event.body)
    await expect(endpoint(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(transact).not.toHaveBeenCalled()
  })
})
