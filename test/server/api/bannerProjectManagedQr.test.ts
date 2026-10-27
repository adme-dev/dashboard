import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ write: vi.fn(), query: vi.fn(), fresh: vi.fn(), access: vi.fn(), all: vi.fn(), qrAccess: vi.fn(), delivery: vi.fn(), coordinator: vi.fn() }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (event: { routeId?: string }) => event.routeId || 'project')
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.write, requireWriteAccess: m.write }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.query, queryOneFresh: m.fresh }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ hasAllSocialClientAccess: m.all, requireSocialClientAccess: m.access }))
vi.mock('~~/server/utils/qr/permissions', () => ({ requireQrClientAccess: m.qrAccess }))
vi.mock('~~/server/utils/banner/assetDelivery', () => ({ resolveBannerAssetDelivery: m.delivery }))
vi.mock('~~/server/utils/banner/godModeProjectCreation', () => ({ executeGodModeBannerProjectCreation: m.coordinator }))
const update = (await import('../../../server/api/agency/banner-studio/projects/[id].patch')).default
const create = (await import('../../../server/api/agency/banner-studio/projects/index.post')).default
const duplicate = (await import('../../../server/api/agency/banner-studio/projects/[id]/duplicate.post')).default
const restore = (await import('../../../server/api/agency/banner-studio/versions/restore.post')).default
const updateAsset = (await import('../../../server/api/agency/banner-studio/assets/[id].patch')).default

const clientId = '11111111-1111-4111-8111-111111111111'
const otherClientId = '22222222-2222-4222-8222-222222222222'
const qrId = '33333333-3333-4333-8333-333333333333'
const assetId = '44444444-4444-4444-8444-444444444444'
const revision = '2026-10-26T01:00:00.000Z'
const secret = 'test-banner-asset-secret'.repeat(2)
let project: { clientId: string | null, createdBy: string, updatedAt: string, canvasData: unknown, name: string, tags: string[] }
let qr: { id: string, client_id: string, code: string, is_active: boolean, updated_at?: string, destination_url?: string } | null
let asset: { id: string, client_id: string | null, uploaded_by: string, mime_type: string, url: string, r2_key: string | null, tags: string[] } | null
let version: { projectId: string, canvasData: unknown } | null
function layer() {
  return {
    id: 1, type: 'image', name: 'QR', src: 'https://app.test/owned-qr.svg', srcType: 'image',
    fit: 'contain', opacity: 1, x: 10, y: 20, w: 150, h: 150, zIndex: 1,
    animIn: 'none', animOut: 'none', visualFilter: 'none', mixBlendMode: 'normal', borderRadius: 0,
    platformQr: {
      version: 1, qrCodeId: qrId, clientId, code: 'Code123', shortUrl: 'https://app.xeroflow.io/q/Code123',
      name: 'Campaign', renderedAt: revision, qrUpdatedAt: revision, assetId, sha256: 'a'.repeat(64),
      quietZone: 4, sourceQuietZone: 4, warnings: []
    }
  }
}
function canvas(qrLayer: unknown = layer()) {
  return { mrec: { layers: [qrLayer] } }
}
function attest(metadata = layer().platformQr, signingSecret = secret) {
  const digest = createHmac('sha256', signingSecret).update(JSON.stringify([
    'xeroflow:banner-platform-qr:v1', metadata.assetId, metadata.clientId,
    metadata.qrCodeId, metadata.code, metadata.sha256
  ])).digest('hex')
  return `platform-qr-attestation:v1:${digest}`
}
async function save(body: Record<string, unknown>) {
  return update({ body, context: {} } as never)
}
async function rejected(body: Record<string, unknown>, statusCode = 400) {
  await expect(save(body)).rejects.toMatchObject({ statusCode })
  expect(m.query).not.toHaveBeenCalled()
}
beforeEach(() => {
  vi.resetAllMocks()
  project = { clientId, createdBy: 'owner', updatedAt: revision, canvasData: canvas(), name: 'Campaign', tags: [] }
  qr = { id: qrId, client_id: clientId, code: 'Code123', is_active: true, updated_at: revision }
  asset = { id: assetId, client_id: clientId, uploaded_by: 'owner', mime_type: 'image/svg+xml', url: layer().src, r2_key: 'banner-assets/owner/owned/qr.svg', tags: ['platform-qr', `qr:${qrId}`, attest()] }
  version = { projectId: 'project', canvasData: canvas() }
  m.write.mockResolvedValue({ id: 'owner' })
  m.delivery.mockReturnValue({ signingSecret: secret })
  m.fresh.mockImplementation(async (sql: string) => sql.includes('banner_projects') ? project : sql.includes('qr_codes') ? qr : sql.includes('banner_assets') ? asset : sql.includes('banner_versions') ? version : null)
  m.query.mockImplementation(async (sql: string) => {
    if (sql.includes('UPDATE banner_projects') || sql.includes('INSERT INTO banner_projects')) return { id: 'project' }
    if (sql.includes('UPDATE banner_assets')) return { id: assetId }
    if (sql.includes('FROM banner_projects')) return { ...project, client_id: project.clientId, canvas_data: project.canvasData }
    if (sql.includes('FROM banner_versions') && !sql.includes('MAX(')) return version
    return null
  })
  m.coordinator.mockImplementation(async (_event, callback) => callback({ query: async (sql: string, params: unknown[]) => ({ rows: [await m.query(sql, params)] }) }))
})

function event(body: Record<string, unknown> = {}, routeId?: string) {
  return { body, routeId, context: {} } as never
}

describe('other managed QR document write boundaries', () => {
  const createBody = () => ({ name: 'Campaign', clientId, canvasData: canvas() })
  it('creates a signed same-client QR project through the existing mutation coordinator', async () => {
    expect(await create(event(createBody()))).toEqual({ id: 'project' })
    expect(m.write).toHaveBeenCalled()
    expect(m.access).toHaveBeenCalledWith(expect.anything(), clientId)
    expect(m.qrAccess).toHaveBeenCalledWith(expect.anything(), clientId)
  })
  it('rejects forged QR on create before a transaction or insert', async () => {
    asset!.tags = ['platform-qr']
    await expect(create(event(createBody()))).rejects.toMatchObject({ statusCode: 400 })
    expect(m.query).not.toHaveBeenCalled()
    expect(m.coordinator).not.toHaveBeenCalled()
  })
  it('blocks read-only and foreign client project creation', async () => {
    m.write.mockRejectedValueOnce({ statusCode: 403 })
    await expect(create(event(createBody()))).rejects.toMatchObject({ statusCode: 403 })
    m.access.mockRejectedValueOnce({ statusCode: 403 })
    await expect(create(event(createBody()))).rejects.toMatchObject({ statusCode: 403 })
    expect(m.coordinator).not.toHaveBeenCalled()
  })
  it('validates saved managed QR on coordinator replay even when request canvas has no QR', async () => {
    asset!.tags = []
    m.coordinator.mockResolvedValue({ id: 'project', clientId, canvasData: canvas() })
    await expect(create(event({ name: 'Replay', clientId, canvasData: {} }))).rejects.toMatchObject({ statusCode: 400 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it.each(['create', 'duplicate', 'restore'])('preserves legacy %s without managed QR or asset configuration', async (mode) => {
    project.canvasData = { mrec: { layers: [{ id: 1, type: 'image', src: '/legacy.png', fit: 'cover' }] } }
    version!.canvasData = project.canvasData
    m.delivery.mockImplementation(() => {
      throw new Error('Legacy QR-free documents do not need storage')
    })
    const action = mode === 'create' ? create(event({ name: 'Legacy', clientId, canvasData: project.canvasData })) : mode === 'duplicate' ? duplicate(event()) : restore(event({ versionId: 'version' }))
    expect(await action).toEqual({ id: 'project' })
    expect(m.qrAccess).not.toHaveBeenCalled()
  })
  it('duplicates a valid client QR while preserving source identity', async () => {
    expect(await duplicate(event())).toEqual({ id: 'project' })
    expect(m.access).toHaveBeenCalledWith(expect.anything(), clientId)
    expect(m.qrAccess).toHaveBeenCalledWith(expect.anything(), clientId)
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO banner_projects'), ['Campaign (Copy)', clientId, JSON.stringify(project.canvasData), [], 'owner'])
  })
  it('blocks foreign-client and unowned unassigned duplication before writes', async () => {
    m.access.mockRejectedValueOnce({ statusCode: 403 })
    await expect(duplicate(event())).rejects.toMatchObject({ statusCode: 403 })
    project.clientId = null
    project.createdBy = 'other'
    await expect(duplicate(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it('rejects forged QR duplication before inserting', async () => {
    asset!.tags = []
    await expect(duplicate(event())).rejects.toMatchObject({ statusCode: 400 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it('restores valid signed QR with fresh project revision CAS', async () => {
    expect(await restore(event({ versionId: 'version' }))).toEqual({ id: 'project' })
    expect(m.access).toHaveBeenCalledWith(expect.anything(), clientId)
    expect(m.qrAccess).toHaveBeenCalledWith(expect.anything(), clientId)
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining('date_trunc(\'milliseconds\', updated_at)'), [JSON.stringify(version!.canvasData), 'project', revision])
  })
  it('rejects historical foreign-client QR before taking restore snapshots', async () => {
    project.clientId = otherClientId
    await expect(restore(event({ versionId: 'version' }))).rejects.toMatchObject({ statusCode: 403 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it('rejects historical managed metadata stripping before taking restore snapshots', async () => {
    const next: Partial<ReturnType<typeof layer>> = layer()
    delete next.platformQr
    version!.canvasData = canvas(next)
    await expect(restore(event({ versionId: 'version' }))).rejects.toMatchObject({ statusCode: 400 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it('blocks unauthorized restore and stale restore requests before writes', async () => {
    m.access.mockRejectedValueOnce({ statusCode: 403 })
    await expect(restore(event({ versionId: 'version' }))).rejects.toMatchObject({ statusCode: 403 })
    await expect(restore(event({ versionId: 'version', expectedRevision: '2026-10-25T00:00:00.000Z' }))).rejects.toMatchObject({ statusCode: 409 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it('blocks read-only restore and unassigned project ownership violations', async () => {
    m.write.mockRejectedValueOnce({ statusCode: 403 })
    await expect(restore(event({ versionId: 'version' }))).rejects.toMatchObject({ statusCode: 403 })
    project.clientId = null
    project.createdBy = 'other'
    await expect(restore(event({ versionId: 'version' }))).rejects.toMatchObject({ statusCode: 403 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it('rejects restore that races a concurrent project write', async () => {
    m.query.mockResolvedValue(null)
    await expect(restore(event({ versionId: 'version' }))).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('managed QR asset metadata edits', () => {
  it('preserves server attestation when ordinary tags are replaced or cleared', async () => {
    await updateAsset(event({ tags: ['campaign'] }, assetId))
    expect(m.query).toHaveBeenLastCalledWith(expect.stringContaining('UPDATE banner_assets'), [['campaign', attest()], assetId])
    await updateAsset(event({ tags: [] }, assetId))
    expect(m.query).toHaveBeenLastCalledWith(expect.stringContaining('UPDATE banner_assets'), [[attest()], assetId])
  })
  it('allows existing attestation in the full tag list without duplication', async () => {
    await updateAsset(event({ tags: [attest(), 'campaign'] }, assetId))
    expect(m.query).toHaveBeenLastCalledWith(expect.stringContaining('UPDATE banner_assets'), [['campaign', attest()], assetId])
  })
  it('rejects introducing or replacing reserved attestation tags', async () => {
    await expect(updateAsset(event({ tags: ['platform-qr-attestation:v1:' + '0'.repeat(64)] }, assetId))).rejects.toMatchObject({ statusCode: 400 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it('requires asset client access and ownership of unassigned assets', async () => {
    m.access.mockRejectedValueOnce({ statusCode: 403 })
    await expect(updateAsset(event({ name: 'QR' }, assetId))).rejects.toMatchObject({ statusCode: 403 })
    asset!.client_id = null
    asset!.uploaded_by = 'other'
    await expect(updateAsset(event({ name: 'QR' }, assetId))).rejects.toMatchObject({ statusCode: 403 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it('rejects read-only asset edits and malformed tags', async () => {
    m.write.mockRejectedValueOnce({ statusCode: 403 })
    await expect(updateAsset(event({ name: 'QR' }, assetId))).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateAsset(event({ tags: 'not-an-array' }, assetId))).rejects.toMatchObject({ statusCode: 400 })
    expect(m.query).not.toHaveBeenCalled()
  })
})

describe('project save managed QR trust boundary', () => {
  it('allows moving signed same-client QR after destination or appearance settings change', async () => {
    qr.updated_at = '2026-10-27T01:00:00.000Z'
    qr.destination_url = 'https://campaign.test/new-destination'
    const next = layer()
    next.x = 40
    expect(await save({ canvasData: canvas(next), expectedRevision: revision })).toEqual({ id: 'project' })
    expect(m.qrAccess).toHaveBeenCalledWith(expect.anything(), clientId)
    expect(m.fresh).toHaveBeenCalledWith(expect.stringContaining('qr_codes'), [qrId])
    expect(m.fresh).toHaveBeenCalledWith(expect.stringContaining('banner_assets'), [assetId])
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining('date_trunc(\'milliseconds\', updated_at)'), expect.arrayContaining([revision]))
  })
  it('rejects permission loss before any snapshot or update', async () => {
    m.qrAccess.mockRejectedValueOnce({ statusCode: 403 })
    await rejected({ canvasData: canvas() }, 403)
  })
  it.each([otherClientId, null])('rejects retaining old client QR on reassignment to %s without replacement canvas', async (clientId) => {
    await rejected({ clientId }, 403)
  })
  it('allows reassignment when the managed QR is explicitly deleted', async () => {
    expect(await save({ clientId: otherClientId, canvasData: { mrec: { layers: [] } } })).toEqual({ id: 'project' })
    expect(m.qrAccess).not.toHaveBeenCalled()
  })
  it('rejects a QR record freshly reassigned to another client', async () => {
    qr.client_id = otherClientId
    await rejected({ canvasData: canvas() }, 403)
  })
  it('rejects a deleted or inactive QR clearly', async () => {
    qr = null
    await rejected({ canvasData: canvas() }, 404)
    qr = { id: qrId, client_id: clientId, code: 'Code123', is_active: false }
    await expect(save({ canvasData: canvas() })).rejects.toMatchObject({ statusCode: 409, statusMessage: expect.stringMatching(/inactive/i) })
    expect(m.query).not.toHaveBeenCalled()
  })
  it.each(['missing', 'client', 'mime', 'url', 'key'])('rejects %s asset ownership or delivery mismatch', async (mode) => {
    if (mode === 'missing') asset = null
    else if (mode === 'client') asset.client_id = otherClientId
    else if (mode === 'mime') asset.mime_type = 'image/png'
    else if (mode === 'url') asset.url = 'https://attacker.test/qr.svg'
    else asset.r2_key = null
    await rejected({ canvasData: canvas() })
  })
  it.each(['missing', 'forged', 'wrong-secret', 'copied-asset', 'copied-client', 'copied-code', 'copied-qr', 'copied-hash'])('rejects %s attestation despite convincing editable platform tags', async (mode) => {
    const metadata = layer().platformQr
    let tag: string | undefined
    if (mode === 'forged') tag = 'platform-qr-attestation:v1:' + '0'.repeat(64)
    if (mode === 'wrong-secret') tag = attest(metadata, 'attacker'.repeat(8))
    if (mode === 'copied-asset') tag = attest({ ...metadata, assetId: qrId })
    if (mode === 'copied-client') tag = attest({ ...metadata, clientId: otherClientId })
    if (mode === 'copied-code') tag = attest({ ...metadata, code: 'Forged' })
    if (mode === 'copied-qr') tag = attest({ ...metadata, qrCodeId: assetId })
    if (mode === 'copied-hash') tag = attest({ ...metadata, sha256: 'b'.repeat(64) })
    asset.tags = ['platform-qr', `qr:${qrId}`, ...(tag ? [tag] : [])]
    await rejected({ canvasData: canvas() })
  })
  it('rejects changed canonical code even when metadata and attestation agree with each other', async () => {
    project.canvasData = {}
    const next = layer()
    next.platformQr.code = 'Forged'
    next.platformQr.shortUrl = 'https://app.xeroflow.io/q/Forged'
    asset.tags = [attest(next.platformQr)]
    await rejected({ canvasData: canvas(next) })
  })
  it.each(['hash', 'url', 'schema', 'metadata-client'])('rejects forged %s metadata on a newly introduced QR layer', async (mode) => {
    project.canvasData = {}
    const next = layer()
    if (mode === 'hash') next.platformQr.sha256 = 'b'.repeat(64)
    if (mode === 'url') next.platformQr.shortUrl = 'https://attacker.test/qr'
    if (mode === 'schema') next.platformQr.version = 2
    if (mode === 'metadata-client') next.platformQr.clientId = otherClientId
    await rejected({ canvasData: canvas(next) }, mode === 'metadata-client' ? 403 : 400)
  })
  it('rejects replacing an existing QR source even when the new source is another registered asset', async () => {
    const next = layer()
    next.src = 'https://app.test/another-owned.svg'
    asset.url = next.src
    await rejected({ canvasData: canvas(next) })
  })
  it('fails closed when the provenance signing secret is unavailable', async () => {
    m.delivery.mockReturnValue({ signingSecret: null })
    await rejected({ canvasData: canvas() }, 503)
  })
  it('rejects stripping managed metadata while retaining the same layer ID', async () => {
    const next: Partial<ReturnType<typeof layer>> = layer()
    delete next.platformQr
    await rejected({ canvasData: canvas(next) })
  })
  it.each([
    { fit: 'cover' }, { opacity: 0.5 }, { w: -1 }, { h: Infinity }, { x: NaN },
    { imageCrop: { x: 0, y: 0, w: 0.5, h: 0.5 } }, { visualFilter: 'blur(2px)' },
    { isMask: true }, { animIn: 'fadeIn' }, { mixBlendMode: 'multiply' },
    { maskTargetIds: '1' }, { feedBindings: {} }, { motionPath: 'invalid' },
    { keyframes: { opacity: 'invalid' } }, { id: undefined }
  ])('rejects unsafe managed rendering %j', async (changes) => {
    project.canvasData = {}
    await rejected({ canvasData: canvas({ ...layer(), ...changes }) })
  })
  it('rejects another layer masking a managed code', async () => {
    const next = canvas()
    next.mrec.layers.push({ id: 2, type: 'rect', isMask: true, maskTargetIds: [1] })
    await rejected({ canvasData: next })
  })
  it('checks retained managed QR on metadata-only project saves', async () => {
    asset.tags = []
    await rejected({ name: 'Rename' })
  })
  it('preserves legacy project canvases without QR and needs no signing or QR access', async () => {
    project.canvasData = { custom: { layers: [{ id: 1, type: 'image', src: '/legacy.png', fit: 'cover' }] } }
    m.delivery.mockImplementation(() => {
      throw new Error('Must not need storage')
    })
    expect(await save({ name: 'Legacy', clientId: otherClientId })).toEqual({ id: 'project' })
    expect(m.qrAccess).not.toHaveBeenCalled()
    expect(m.fresh).toHaveBeenCalledTimes(1)
  })
  it('snapshots the fresh validated source canvas rather than rereading through a cache', async () => {
    m.query.mockImplementation(async (sql: string) => sql.includes('MAX(version_number)') ? { maxVersion: 6 } : { id: 'project' })
    const next = layer()
    next.x += 10
    await save({ canvasData: canvas(next) })
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO banner_versions'), ['project', 7, JSON.stringify(project.canvasData), 'owner'])
    expect(m.query.mock.calls.some(([sql]) => sql.includes('SELECT canvas_data'))).toBe(false)
  })
  it('rejects stale revision before querying QR ownership or taking a snapshot', async () => {
    await rejected({ canvasData: canvas(), expectedRevision: '2026-10-25T01:00:00.000Z' }, 409)
    expect(m.qrAccess).not.toHaveBeenCalled()
    expect(m.fresh).toHaveBeenCalledTimes(1)
  })
  it('keeps project revision CAS when a valid QR save races another write', async () => {
    m.query.mockResolvedValue(null)
    await expect(save({ canvasData: canvas(), expectedRevision: revision })).rejects.toMatchObject({ statusCode: 409 })
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining('date_trunc(\'milliseconds\', updated_at)'), expect.arrayContaining([revision]))
  })
})
