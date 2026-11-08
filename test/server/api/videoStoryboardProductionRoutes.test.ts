import { beforeEach, describe, expect, it, vi } from 'vitest'

import reserve from '~~/server/api/agency/video/projects/[id]/storyboard/production/attempts/index.post'
import approve from '~~/server/api/agency/video/projects/[id]/storyboard/production/attempts/[attemptId]/approve.post'
import cancel from '~~/server/api/agency/video/projects/[id]/storyboard/production/attempts/[attemptId]/cancel.post'
import get from '~~/server/api/agency/video/projects/[id]/storyboard/production/attempts/[attemptId].get'
import allowance from '~~/server/api/agency/video/projects/[id]/storyboard/production/allowance.get'
import setAllowance from '~~/server/api/agency/video/projects/[id]/storyboard/production/allowance.put'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), write: vi.fn(), reserve: vi.fn(), approve: vi.fn(), cancel: vi.fn(),
  get: vi.fn(), allowance: vi.fn(), setAllowance: vi.fn(), project: vi.fn(), query: vi.fn()
}))
vi.mock('h3', async original => ({
  ...await original<typeof import('h3')>(),
  defineEventHandler: (handler: unknown) => handler,
  readBody: async (event: { body?: unknown }) => event.body,
  getRouterParam: (event: { params: Record<string, string> }, key: string) => event.params[key]
}))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth, requireWriteAccess: mocks.write }))
vi.mock('~~/server/utils/video-storyboard/production', () => ({
  reserveShotAttemptIn: mocks.reserve, approveShotArtifactIn: mocks.approve,
  cancelShotAttemptIn: mocks.cancel, getShotProductionAttempt: mocks.get
}))
vi.mock('~~/server/utils/video-storyboard/productionBudget', () => ({
  getProjectProductionAllowanceIn: mocks.allowance, setProjectProductionAllowanceIn: mocks.setAllowance
}))
vi.mock('~~/server/utils/video-storyboard/access', () => ({ requireStoryboardProjectIn: mocks.project }))
vi.mock('~~/server/utils/video-storyboard/godMode', () => ({
  executeStoryboardReferenceWrite: (_event: unknown, mutate: (db: unknown) => Promise<unknown>) => mutate({ query: mocks.query })
}))
vi.mock('~~/server/utils/db', () => ({ transaction: (mutate: (db: unknown) => Promise<unknown>) => mutate({ query: mocks.query }) }))

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const actor = { id: id(1), role: 'owner' }
function event(body: unknown = {}, enabled = true) {
  return {
    params: { id: id(2), attemptId: id(3) }, body,
    context: { cloudflare: { env: {
      VIDEO_STORYBOARD_PRODUCTION_ENABLED: enabled ? 'true' : 'false',
      VIDEO_STORYBOARD_ENABLED: 'true', VIDEO_GENERATION_ENABLED: 'true'
    } } }
  }
}
const request = { shotId: id(4), expectedRevision: id(5), operationId: id(6), modelId: 'aigateway/seedance-i2v', sourceAssetIds: [id(7)] }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue(actor)
  mocks.write.mockResolvedValue(actor)
  for (const fn of [mocks.reserve, mocks.approve, mocks.cancel, mocks.get]) fn.mockResolvedValue({ id: id(3) })
  mocks.allowance.mockResolvedValue({ projectId: id(2), allowanceCents: 0, configured: false })
  mocks.setAllowance.mockResolvedValue({ projectId: id(2), allowanceCents: 100, configured: true })
})

describe('storyboard production routes', () => {
  it.each([reserve, approve, setAllowance])('keeps new production mutations behind the runtime opt-in', async (handler) => {
    await expect(handler(event(request, false) as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.approve).not.toHaveBeenCalled()
    expect(mocks.setAllowance).not.toHaveBeenCalled()
  })

  it('takes project and actor only from the authorized route/session', async () => {
    expect(await reserve(event(request) as never)).toEqual({ attempt: { id: id(3) } })
    expect(mocks.write).toHaveBeenCalled()
    expect(mocks.reserve).toHaveBeenCalledWith(expect.anything(), { ...request, projectId: id(2), actor }, expect.objectContaining({ loadTenantPolicy: expect.any(Function) }))
    await expect(reserve(event({ ...request, projectId: id(8) }) as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.reserve).toHaveBeenCalledTimes(1)
  })

  it('requires exact revision and valid artifact hash on approval requests', async () => {
    const body = { expectedRevision: id(5), expectedShotRevision: { revisionId: id(5), shotHash: 'a'.repeat(64) }, artifactHash: 'b'.repeat(64) }
    await expect(approve(event({ ...body, artifactHash: 'invented' }) as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.approve).not.toHaveBeenCalled()
    await approve(event(body) as never)
    expect(mocks.approve).toHaveBeenCalledWith(expect.anything(), { ...body, projectId: id(2), attemptId: id(3), actor }, expect.anything())
  })

  it('retains authenticated reads and cancellation when new production is disabled', async () => {
    await get(event({}, false) as never)
    await cancel(event({}, false) as never)
    await allowance(event({}, false) as never)
    expect(mocks.get).toHaveBeenCalledWith({ projectId: id(2), attemptId: id(3), actor })
    expect(mocks.cancel).toHaveBeenCalledWith(expect.anything(), { projectId: id(2), attemptId: id(3), actor })
    expect(mocks.project).toHaveBeenCalledWith(expect.anything(), id(2), actor)
    expect(mocks.write).toHaveBeenCalledTimes(1)
    expect(mocks.auth).toHaveBeenCalledTimes(2)
  })

  it('does not call production cores after authentication rejects', async () => {
    mocks.write.mockRejectedValue({ statusCode: 403 })
    await expect(reserve(event(request) as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.reserve).not.toHaveBeenCalled()
  })
})
