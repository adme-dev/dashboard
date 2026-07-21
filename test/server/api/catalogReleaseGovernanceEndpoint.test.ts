import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogGovernanceError } from '~~/server/utils/ai/governance/catalogReleaseGovernance'

const RELEASE_ID = '10000000-0000-4000-8000-000000000001'
const EVALUATION_RUN_ID = '50000000-0000-4000-8000-000000000001'
const ACTOR_ID = '60000000-0000-4000-8000-000000000001'
const UPDATED_AT = '2026-07-21T08:00:00.000Z'

const { createCatalogReleasePatchHandler } = await import(
  '~~/server/api/admin/ai/governance/releases/[id].patch'
)

function body(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'capability',
    targetState: 'active',
    evaluationRunId: EVALUATION_RUN_ID,
    expectedUpdatedAt: UPDATED_AT,
    reason: 'Exact evaluation passed and the pilot is approved for activation.',
    ...overrides
  }
}

describe('PATCH /api/admin/ai/governance/releases/:id', () => {
  const requirePermission = vi.fn()
  const requireWriteAccess = vi.fn()
  const readBody = vi.fn()
  const getRouterParam = vi.fn()
  const transitionRelease = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    requirePermission.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    requireWriteAccess.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    readBody.mockResolvedValue(body())
    getRouterParam.mockReturnValue(RELEASE_ID)
    transitionRelease.mockResolvedValue({ id: RELEASE_ID, state: 'active' })
  })

  function handler() {
    return createCatalogReleasePatchHandler({
      requirePermission,
      requireWriteAccess,
      readBody,
      getRouterParam,
      transitionRelease
    })
  }

  it('requires company governance permission and write access before transitioning', async () => {
    const result = await handler()({ context: {} } as never)

    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), 'ADMIN')
    expect(requireWriteAccess).toHaveBeenCalledWith(expect.anything())
    expect(transitionRelease).toHaveBeenCalledWith({
      kind: 'capability',
      releaseId: RELEASE_ID,
      targetState: 'active',
      evaluationRunId: EVALUATION_RUN_ID,
      expectedUpdatedAt: UPDATED_AT,
      reason: 'Exact evaluation passed and the pilot is approved for activation.',
      actorUserId: ACTOR_ID
    })
    expect(result).toEqual({ release: { id: RELEASE_ID, state: 'active' } })
  })

  it('does not parse or mutate when company governance permission is denied', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(requireWriteAccess).not.toHaveBeenCalled()
    expect(readBody).not.toHaveBeenCalled()
    expect(transitionRelease).not.toHaveBeenCalled()
  })

  it('does not mutate when a custom governance role is read-only', async () => {
    requireWriteAccess.mockRejectedValue(Object.assign(new Error('Read-only'), { statusCode: 403 }))

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(readBody).not.toHaveBeenCalled()
    expect(transitionRelease).not.toHaveBeenCalled()
  })

  it.each([
    ['unknown field', body({ bypassApproval: true })],
    ['invalid kind', body({ kind: 'workflow' })],
    ['draft target', body({ targetState: 'draft' })],
    ['invalid evaluation id', body({ evaluationRunId: 'not-a-uuid' })],
    ['invalid timestamp', body({ expectedUpdatedAt: 'yesterday' })],
    ['empty reason', body({ reason: '   ' })]
  ])('rejects malformed input: %s', async (_label, invalidBody) => {
    readBody.mockResolvedValue(invalidBody)

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 422,
      data: { code: 'invalid_request' }
    })
    expect(transitionRelease).not.toHaveBeenCalled()
  })

  it('returns a stable conflict code without exposing database details', async () => {
    transitionRelease.mockRejectedValue(new CatalogGovernanceError(
      'release_version_conflict',
      409,
      'Catalog release changed after it was loaded'
    ))

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Catalog release changed after it was loaded',
      data: { code: 'release_version_conflict' }
    })
  })
})
