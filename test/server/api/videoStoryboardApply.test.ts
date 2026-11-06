import { beforeEach, describe, expect, it, vi } from 'vitest'
import apply from '~~/server/api/agency/video/projects/[id]/storyboard/apply.post'
import recovery from '~~/server/api/agency/video/projects/[id]/storyboard/applications/[operationId].get'
import { id } from '../../video/fixtures/storyboard'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), readAuth: vi.fn(), prepare: vi.fn(), apply: vi.fn(), recovery: vi.fn(), ledger: vi.fn(), body: {} as Record<string, unknown> }))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), defineEventHandler: (fn: unknown) => fn, readBody: async () => mocks.body, getRouterParam: (_event: unknown, name: string) => name === 'id' ? id(2) : id(30) }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.auth, requireAuth: mocks.readAuth }))
vi.mock('~~/server/utils/video-storyboard/apply', async original => ({ ...await original<typeof import('~~/server/utils/video-storyboard/apply')>(), prepareStoryboardApplication: mocks.prepare, applyStoryboardIn: mocks.apply, getStoryboardApplication: mocks.recovery }))
vi.mock('~~/server/utils/video-storyboard/godMode', () => ({ executeStoryboardReferenceWrite: mocks.ledger }))
const actor = { id: id(6), role: 'member' }
const event = { context: { cloudflare: { env: { VIDEO_STORYBOARD_ENABLED: 'true' } } } }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue(actor)
  mocks.readAuth.mockResolvedValue(actor)
  mocks.prepare.mockResolvedValue({ measurements: new Map() })
  mocks.ledger.mockImplementation((_event, work) => work({ query: vi.fn() }))
  mocks.body = { operationId: id(30), revisionId: id(3), expectedTimelineId: id(40), expectedEditRevision: 0, replaceConfirmed: false }
})
describe('storyboard apply API', () => {
  it('requires write authorization and the creation flag', async () => {
    await expect(apply({ context: { cloudflare: { env: { VIDEO_STORYBOARD_ENABLED: 'false' } } } } as never)).rejects.toMatchObject({ statusCode: 404 })
    mocks.auth.mockRejectedValue({ statusCode: 403 })
    await expect(apply(event as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it('rejects caller compiled state/obligations and missing preconditions', async () => {
    mocks.body.timeline = { tracks: [] }
    await expect(apply(event as never)).rejects.toMatchObject({ statusCode: 400 })
    delete mocks.body.timeline
    delete mocks.body.expectedEditRevision
    await expect(apply(event as never)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('prepares before owner transaction and routes server actor/dependencies', async () => {
    mocks.apply.mockResolvedValue({ id: id(31) })
    await expect(apply(event as never)).resolves.toEqual({ id: id(31) })
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.ledger.mock.invocationCallOrder[0]!)
    expect(mocks.apply.mock.calls[0][1]).toMatchObject({ actor, projectId: id(2), operationId: id(30) })
  })
  it('keeps authenticated recovery available with flag off', async () => {
    mocks.recovery.mockResolvedValue({ id: id(31) })
    await expect(recovery({ context: {} } as never)).resolves.toEqual({ id: id(31) })
    expect(mocks.recovery).toHaveBeenCalledWith({ actor, projectId: id(2), operationId: id(30) })
    mocks.readAuth.mockRejectedValue({ statusCode: 401 })
    await expect(recovery({ context: {} } as never)).rejects.toMatchObject({ statusCode: 401 })
  })
})
