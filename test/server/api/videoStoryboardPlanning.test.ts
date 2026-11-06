import { beforeEach, describe, expect, it, vi } from 'vitest'
import planRoute from '~~/server/api/agency/video/projects/[id]/storyboard/plan.post'
import revisionsRoute from '~~/server/api/agency/video/projects/[id]/storyboard/revisions.post'
import { id } from '../../video/fixtures/storyboard'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), accept: vi.fn(), planLedger: vi.fn(), writeLedger: vi.fn(), body: {} as Record<string, unknown> }))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), defineEventHandler: (fn: unknown) => fn, readBody: async () => mocks.body, getRouterParam: () => id(2) }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.auth }))
vi.mock('~~/server/utils/video-storyboard/candidates', () => ({ createStoryboardPlan: mocks.create, acceptStoryboardCandidateIn: mocks.accept }))
vi.mock('~~/server/utils/video-storyboard/planningGodMode', () => ({ executeStoryboardPlan: mocks.planLedger }))
vi.mock('~~/server/utils/video-storyboard/godMode', () => ({ executeStoryboardReferenceWrite: mocks.writeLedger }))
const actor = { id: id(6), role: 'member' }
const event = { context: { cloudflare: { env: { VIDEO_STORYBOARD_ENABLED: 'true' } } } }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue(actor)
  mocks.planLedger.mockImplementation((_event, work) => work(vi.fn()))
  mocks.writeLedger.mockImplementation((_event, work) => work({ query: vi.fn() }))
  mocks.body = { operationId: id(30), expectedRevision: null, expectedReferenceSetRevisionId: id(5), method: 'ai', brief: 'A dealer offer', inputMode: 'idea', durationSeconds: 30, targetFormat: 'reels_9x16', copy: { scriptSegments: [], cues: [] }, assets: [] }
})
describe('storyboard planning routes', () => {
  it('requires write authority and the deployed feature flag before planning', async () => {
    await expect(planRoute({ context: { cloudflare: { env: {} } } } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.create).not.toHaveBeenCalled()
    mocks.auth.mockRejectedValue({ statusCode: 403 })
    await expect(planRoute(event as never)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('routes candidates with the server actor/context and owner coordinator', async () => {
    mocks.create.mockResolvedValue({ id: id(30), plan: {} })
    await expect(planRoute(event as never)).resolves.toMatchObject({ id: id(30) })
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ projectId: id(2), actor })
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ event })
    expect(mocks.accept).not.toHaveBeenCalled()
  })
  it('rejects approval fields and arbitrary source URLs', async () => {
    (mocks.body.copy as Record<string, unknown>).approval = { actorId: id(99) }
    await expect(planRoute(event as never)).rejects.toMatchObject({ statusCode: 400 })
    delete (mocks.body.copy as Record<string, unknown>).approval
    mocks.body.assets = [{ sourceKind: 'video_asset', assetId: id(20), url: 'http://localhost' }]
    await expect(planRoute(event as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('requires an explicit accepted diff and reviewed candidate hash', async () => {
    mocks.body = { candidateId: id(30), candidateHash: 'a'.repeat(64), expectedRevision: null, operationId: id(31), acceptChanges: false, approveCopy: true }
    await expect(revisionsRoute(event as never)).rejects.toMatchObject({ statusCode: 400 })
    mocks.body.acceptChanges = true
    mocks.accept.mockResolvedValue({ id: id(40) })
    await expect(revisionsRoute(event as never)).resolves.toEqual({ revision: { id: id(40) } })
    expect(mocks.accept.mock.calls[0][1]).toMatchObject({ actor, projectId: id(2), approveCopy: true })
  })
})
