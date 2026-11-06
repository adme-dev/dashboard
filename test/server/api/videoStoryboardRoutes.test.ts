import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { id } from '../../video/fixtures/storyboard'
import getRoot from '~~/server/api/agency/video/projects/[id]/storyboard/index.get'
import getRevision from '~~/server/api/agency/video/projects/[id]/storyboard/revisions/[revision].get'
import putReferences from '~~/server/api/agency/video/projects/[id]/storyboard/references.put'

const mocks = vi.hoisted(() => ({ application: vi.fn(), auth: vi.fn(), write: vi.fn(), get: vi.fn(), resolve: vi.fn(), save: vi.fn(), ledger: vi.fn(), body: {} as unknown }))
vi.mock('h3', async original => ({
  ...await original<typeof import('h3')>(), defineEventHandler: (fn: unknown) => fn,
  readBody: async () => mocks.body,
  getRouterParam: (event: { params: Record<string, string> }, key: string) => event.params[key]
}))
vi.mock('~~/server/utils/video-storyboard/apply', () => ({ getLatestStoryboardApplication: mocks.application }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth, requireWriteAccess: mocks.write }))
vi.mock('~~/server/utils/video-storyboard/store', () => ({ getStoryboard: mocks.get, resolveReferenceSet: mocks.resolve, saveReferenceSetIn: mocks.save }))
vi.mock('~~/server/utils/video-storyboard/godMode', () => ({ executeStoryboardReferenceWrite: mocks.ledger }))
const actor = { id: id(6), role: 'member' }
const event = { params: { id: id(2), revision: id(3) }, context: { cloudflare: { env: { VIDEO_STORYBOARD_ENABLED: 'false' } } } }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.application.mockResolvedValue(null)
  mocks.auth.mockResolvedValue(actor)
  mocks.write.mockResolvedValue(actor)
  mocks.get.mockResolvedValue({ storyboard: null, revision: null, referenceSet: null })
  mocks.resolve.mockResolvedValue(null)
  mocks.ledger.mockImplementation(async (_event, fn) => fn({ query: vi.fn() }))
  mocks.body = { expectedRevision: null, operationId: id(9), references: [], brandKit: null }
})
afterEach(() => vi.unstubAllEnvs())
describe('storyboard HTTP boundaries', () => {
  it('keeps authorized current and historical reads available while disabled', async () => {
    await getRoot(event as never)
    await getRevision(event as never)
    expect(mocks.get).toHaveBeenCalledWith(id(2), actor)
    expect(mocks.get).toHaveBeenCalledWith(id(2), actor, id(3))
    expect(mocks.application).toHaveBeenCalledWith({ projectId: id(2), actor })
    expect(mocks.write).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('denies writes when the deployed binding is false even if local env is on', async () => {
    vi.stubEnv('VIDEO_STORYBOARD_ENABLED', 'true')
    await expect(putReferences(event as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.ledger).not.toHaveBeenCalled()
  })
  it('requires write access and uses the caller-owned transaction', async () => {
    const enabled = { ...event, context: { cloudflare: { env: { VIDEO_STORYBOARD_ENABLED: 'true' } } } }
    mocks.save.mockResolvedValue({ id: id(8) })
    expect(await putReferences(enabled as never)).toEqual({ referenceSet: { id: id(8) } })
    expect(mocks.save.mock.calls[0][1]).toMatchObject({ projectId: id(2), actor })
    mocks.write.mockRejectedValue({ statusCode: 403 })
    await expect(putReferences(enabled as never)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects caller-supplied approval actors and URLs', async () => {
    mocks.body = { ...(mocks.body as object), approval: { actorId: id(6) }, url: 'http://localhost/private' }
    await expect(putReferences({ ...event, context: { cloudflare: { env: { VIDEO_STORYBOARD_ENABLED: 'true' } } } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.ledger).not.toHaveBeenCalled()
  })
  it('does not return historical data after authorization failure', async () => {
    mocks.get.mockRejectedValue({ statusCode: 403 })
    await expect(getRevision(event as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.resolve).not.toHaveBeenCalled()
  })
})
