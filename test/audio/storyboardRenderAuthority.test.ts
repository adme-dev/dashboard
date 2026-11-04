import type { H3Event } from 'h3'
import type { GodModeTransactionDb as Db } from '~~/server/utils/godMode/transactionCoordinator'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authorizeStoryboardRenderCallbackIn, createStoryboardRenderJobIfObligatedIn } from '~~/server/utils/video-storyboard/renderDispatch'
import { storyboardHash } from '~~/server/utils/video-storyboard/hash'

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), lineage: vi.fn(), create: vi.fn(), authority: vi.fn(), fence: vi.fn(), resolveScope: vi.fn() }))
vi.mock('~~/server/utils/video-storyboard/reviewRecovery', () => ({ resolveTimelineReferenceSetIn: mocks.resolveScope }))
vi.mock('~~/server/utils/video-storyboard/renderValidation', () => ({ prepareStoryboardRenderIn: mocks.prepare }))
vi.mock('~~/server/utils/video-storyboard/lineage', () => ({ loadTimelineObligationsIn: mocks.lineage }))
vi.mock('~~/server/utils/audio/projects', () => ({ createRenderJobIn: mocks.create }))
vi.mock('~~/server/utils/video-storyboard/apply', () => ({ fenceWriteAuthorityIn: mocks.authority, fenceDependenciesIn: mocks.fence }))
vi.mock('~~/server/utils/video-storyboard/store', () => ({ getStoryboardIn: vi.fn().mockResolvedValue({ referenceSet: { id: 'global' } }) }))
vi.mock('~~/server/utils/video-storyboard/access', () => ({ requireStoryboardProjectIn: vi.fn() }))
const projectId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
const timelineId = '33333333-3333-4333-8333-333333333333'
const actor = { id: 'actor', role: 'member' }
const prepared = { state: { tracks: [] }, lineage: { applicationId: 'app', contract: {}, referenceSetId: 'refs' }, objects: [], overlays: {}, findings: [] }
const signature = storyboardHash({ state: prepared.state, applicationId: 'app', contract: {}, referenceSetId: 'refs', objects: [], overlays: {} })
const manifest = { id: 'manifest', jobId, projectId, timelineId, editRevision: 0, formats: ['square_1x1'], dependencies: { actorId: actor.id, signature } }
const variants = { square_1x1: `media/${projectId}/${jobId}/44444444-4444-4444-8444-444444444444/square_1x1.mp4` }
const event = { context: { cloudflare: { env: { MEDIA_BUCKET: { head: vi.fn().mockResolvedValue({ size: 42 }), get: vi.fn(), put: vi.fn() }, STORYBOARD_RENDER_SECRET: 'secret', STORYBOARD_MEDIA_PROBE: {}, VIDEO_RENDER_QUEUE: {} } } } } as unknown as H3Event
function dbFor(status = 'rendering', costCents = 0) {
  return { query: vi.fn(async (sql: string) => {
    if (sql.includes('SELECT j.*')) return { rows: [{ id: jobId, project_id: projectId, timeline_id: timelineId, requested_by: actor.id, manifest, manifest_hash: storyboardHash(manifest), status, variants, cost_cents: costCents }] }
    if (sql.includes('FROM team_members')) return { rows: [actor] }
    if (sql.includes('SELECT edit_revision')) return { rows: [{ edit_revision: 0 }] }
    return { rows: [] }
  }) } as unknown as Db & { query: ReturnType<typeof vi.fn> }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveScope.mockResolvedValue({ current: true, referenceSet: { id: 'refs', references: [{ assetId: 'scoped-only-source' }] } })
  mocks.prepare.mockResolvedValue(structuredClone(prepared))
  mocks.lineage.mockResolvedValue(prepared.lineage)
  mocks.create.mockResolvedValue({ id: jobId, timelineId })
})
describe('storyboard dispatch and publication', () => {
  it('preserves legacy path only on an authoritative empty lineage', async () => {
    mocks.lineage.mockResolvedValue(null)
    expect(await createStoryboardRenderJobIfObligatedIn(dbFor(), event, { projectId, actor, channels: [], expectedTimelineId: timelineId, expectedEditRevision: 0, formats: ['square_1x1'] })).toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()
    mocks.lineage.mockRejectedValue(new Error('database failure'))
    await expect(createStoryboardRenderJobIfObligatedIn(dbFor(), event, { projectId, actor, channels: [], expectedTimelineId: timelineId, expectedEditRevision: 0, formats: ['square_1x1'] })).rejects.toThrow('database failure')
  })
  it('rejects unavailable capability and stale CAS before manifest persistence', async () => {
    const input = { projectId, actor, channels: [], expectedTimelineId: timelineId, expectedEditRevision: 0, formats: ['square_1x1'] as const }
    await expect(createStoryboardRenderJobIfObligatedIn(dbFor(), { context: {} } as unknown as H3Event, { ...input, formats: [...input.formats] })).rejects.toThrow('capability')
    mocks.create.mockRejectedValue(new Error('stale revision'))
    const db = dbFor()
    await expect(createStoryboardRenderJobIfObligatedIn(db, event, { ...input, formats: [...input.formats] })).rejects.toThrow('stale')
    expect(db.query.mock.calls.some(([sql]: string[]) => sql.includes('INSERT INTO video_storyboard_render_manifests'))).toBe(false)
  })
  it('pins a validated snapshot and persists a manifest under dependency fences', async () => {
    const db = dbFor()
    await createStoryboardRenderJobIfObligatedIn(db, event, { projectId, actor, channels: [], expectedTimelineId: timelineId, expectedEditRevision: 0, formats: ['square_1x1'] })
    expect(mocks.authority).toHaveBeenCalledWith(db, actor)
    expect(mocks.fence).toHaveBeenCalled()
    expect(mocks.prepare.mock.calls[0][1].timelineId).toBe(timelineId)
    expect(db.query.mock.calls.some(([sql]: string[]) => sql.includes('INSERT INTO video_storyboard_render_manifests'))).toBe(true)
  })
  it('rejects revoked dependencies after queueing without publishing outputs', async () => {
    mocks.prepare.mockResolvedValue({ ...prepared, findings: [{ severity: 'blocker', code: 'source_unavailable' }] })
    const db = dbFor()
    await expect(authorizeStoryboardRenderCallbackIn(db, event, { action: 'publish', jobId, manifestHash: storyboardHash(manifest), variants })).rejects.toThrow('findings')
    expect(db.query.mock.calls.some(([sql]: string[]) => sql.startsWith('UPDATE'))).toBe(false)
  })
  it('rejects even valid new approval content when it differs from dispatch', async () => {
    mocks.prepare.mockResolvedValue({ ...prepared, objects: [{ key: 'changed', etag: 'new', size: 4 }] })
    await expect(authorizeStoryboardRenderCallbackIn(dbFor(), event, { action: 'check', jobId, manifestHash: storyboardHash(manifest) })).rejects.toThrow('changed')
  })
  it('publishes under locks and permits only identical completion replay', async () => {
    const input = { action: 'publish' as const, jobId, manifestHash: storyboardHash(manifest), variants }
    const db = dbFor()
    expect(await authorizeStoryboardRenderCallbackIn(db, event, input)).toEqual({ ok: true, completed: true })
    expect(db.query.mock.calls.some(([sql]: string[]) => sql.startsWith('UPDATE'))).toBe(true)
    mocks.prepare.mockClear()
    expect(await authorizeStoryboardRenderCallbackIn(dbFor('done'), event, input)).toEqual({ ok: true, completed: true })
    expect(mocks.prepare).not.toHaveBeenCalled()
    await expect(authorizeStoryboardRenderCallbackIn(dbFor('done'), event, { ...input, variants: { square_1x1: variants.square_1x1.replace('44444444-', '55555555-') } })).rejects.toThrow('different outputs')
    await expect(authorizeStoryboardRenderCallbackIn(dbFor('failed'), event, input)).rejects.toThrow('no longer publishable')
  })
})

it('rejects oversized payloads before copying objects', async () => {
  mocks.prepare.mockResolvedValue({ ...prepared, objects: [{ key: 'large', etag: 'etag', size: 16 * 1024 * 1024 + 1 }] })
  await expect(createStoryboardRenderJobIfObligatedIn(dbFor(), event, { projectId, actor, channels: [], expectedTimelineId: timelineId, expectedEditRevision: 0, formats: ['square_1x1'] })).rejects.toThrow('16 MiB')
})

it('copies conditional media bytes and rewrites only manifest state, preserving the original snapshot', async () => {
  const state = { tracks: [{ clips: [{ id: 'footage', type: 'video', r2_key: 'source-key' }, { id: 'caption', type: 'caption', text: 'Exact copy' }] }] }
  const bytes = new Uint8Array([1, 2, 3]).buffer
  const get = vi.fn().mockResolvedValue({ etag: 'etag', size: 3, arrayBuffer: async () => bytes })
  const put = vi.fn()
  const localEvent = { context: { cloudflare: { env: { MEDIA_BUCKET: { get, put }, STORYBOARD_RENDER_SECRET: 'secret', STORYBOARD_MEDIA_PROBE: {}, VIDEO_RENDER_QUEUE: {} } } } } as unknown as H3Event
  mocks.prepare.mockResolvedValue({ ...prepared, state, objects: [{ key: 'source-key', etag: 'etag', size: 3 }] })
  const db = dbFor()
  await createStoryboardRenderJobIfObligatedIn(db, localEvent, { projectId, actor, channels: [], expectedTimelineId: timelineId, expectedEditRevision: 0, formats: ['square_1x1'] })
  expect(get).toHaveBeenCalledWith('source-key', { onlyIf: { etagMatches: 'etag' } })
  const insert = db.query.mock.calls.find(([sql]: string[]) => sql.includes('INSERT INTO video_storyboard_render_manifests'))!
  const persisted = JSON.parse(insert[1][5])
  expect(persisted.state.tracks[0].clips).toHaveLength(1)
  expect(persisted.state.tracks[0].clips[0].r2_key).toBe(persisted.objects[0].key)
  expect(persisted.objects[0].key).toMatch(/^storyboard-render-inputs\//)
  expect(state.tracks[0]!.clips).toHaveLength(2)
  expect(state.tracks[0]!.clips[0]!.r2_key).toBe('source-key')
  expect(put).toHaveBeenCalledOnce()
})

it('requires identical publication cost on replay while status checks remain independent of cost', async () => {
  const input = { action: 'publish' as const, jobId, manifestHash: storyboardHash(manifest), variants, costCents: 100 }
  expect(await authorizeStoryboardRenderCallbackIn(dbFor('done', 100), event, input)).toEqual({ ok: true, completed: true })
  await expect(authorizeStoryboardRenderCallbackIn(dbFor('done', 100), event, { ...input, costCents: 999 })).rejects.toThrow('different outputs or cost')
  await expect(authorizeStoryboardRenderCallbackIn(dbFor('done', 100), event, { ...input, costCents: undefined })).rejects.toThrow('different outputs or cost')
  expect(await authorizeStoryboardRenderCallbackIn(dbFor('done', 100), event, { action: 'check', jobId, manifestHash: input.manifestHash })).toEqual({ ok: true, completed: true })
})

describe('edit scoped reference fencing', () => {
  it('fences scoped-only sources before dispatch validation and persistence', async () => {
    const db = dbFor()
    await createStoryboardRenderJobIfObligatedIn(db, event, { projectId, actor, channels: [], expectedTimelineId: timelineId, expectedEditRevision: 0, formats: ['square_1x1'] })
    expect(mocks.resolveScope).toHaveBeenCalledWith(db, { id: 'global' }, 'refs')
    expect(mocks.fence).toHaveBeenCalledWith(db, { referenceSet: { id: 'refs', references: [{ assetId: 'scoped-only-source' }] } }, actor)
    expect(mocks.fence.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.prepare.mock.invocationCallOrder[0]!)
  })
  it('fences scoped-only sources before publication validation and commit', async () => {
    const db = dbFor()
    await authorizeStoryboardRenderCallbackIn(db, event, { action: 'publish', jobId, manifestHash: storyboardHash(manifest), variants })
    expect(mocks.lineage).toHaveBeenCalledWith(db, projectId, timelineId, 0)
    expect(mocks.resolveScope).toHaveBeenCalledWith(db, { id: 'global' }, 'refs')
    expect(mocks.fence).toHaveBeenCalledWith(db, { referenceSet: { id: 'refs', references: [{ assetId: 'scoped-only-source' }] } }, actor)
    expect(mocks.fence.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.prepare.mock.invocationCallOrder[0]!)
  })
  it('rejects a scoped approval after global reference revocation on dispatch', async () => {
    mocks.resolveScope.mockResolvedValue({ current: false, referenceSet: { id: 'refs' } })
    await expect(createStoryboardRenderJobIfObligatedIn(dbFor(), event, { projectId, actor, channels: [], expectedTimelineId: timelineId, expectedEditRevision: 0, formats: ['square_1x1'] })).rejects.toThrow('changed')
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it('rejects a scoped approval after global reference revocation before publication', async () => {
    mocks.resolveScope.mockResolvedValue({ current: false, referenceSet: { id: 'refs' } })
    const db = dbFor()
    await expect(authorizeStoryboardRenderCallbackIn(db, event, { action: 'publish', jobId, manifestHash: storyboardHash(manifest), variants })).rejects.toThrow('changed')
    expect(db.query.mock.calls.some(([sql]: string[]) => sql.startsWith('UPDATE'))).toBe(false)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
})

it('fences the lineage actually copied into the locked render snapshot, not an earlier pre-lock review', async () => {
  mocks.lineage.mockResolvedValueOnce({ ...prepared.lineage, referenceSetId: 'superseded-review' }).mockResolvedValueOnce(prepared.lineage)
  const db = dbFor()
  await createStoryboardRenderJobIfObligatedIn(db, event, { projectId, actor, channels: [], expectedTimelineId: timelineId, expectedEditRevision: 0, formats: ['square_1x1'] })
  expect(mocks.lineage).toHaveBeenCalledTimes(2)
  expect(mocks.resolveScope).toHaveBeenCalledWith(db, { id: 'global' }, 'refs')
})
