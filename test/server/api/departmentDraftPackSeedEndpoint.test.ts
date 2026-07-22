import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DepartmentDraftPackSeedError } from '~~/server/utils/ai/governance/departmentDraftPackSeeder'

const DEPARTMENT_ID = '10000000-0000-4000-8000-000000000001'
const OWNER_ID = '20000000-0000-4000-8000-000000000001'
const ACTOR_ID = '30000000-0000-4000-8000-000000000001'

const { createDepartmentDraftPackSeedPostHandler } = await import(
  '~~/server/api/admin/ai/governance/draft-packs.post'
)

describe('POST /api/admin/ai/governance/draft-packs', () => {
  const requirePermission = vi.fn()
  const readBody = vi.fn()
  const setResponseHeader = vi.fn()
  const setResponseStatus = vi.fn()
  const seedDraftPack = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    requirePermission.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    readBody.mockResolvedValue({
      blueprintKey: 'creative',
      departmentId: DEPARTMENT_ID,
      ownerUserId: OWNER_ID,
      reason: 'Owner confirmed for the first read/draft evaluation cycle.',
      confirmation: 'SEED_DRAFT'
    })
    seedDraftPack.mockResolvedValue({ outcome: 'created', releaseState: 'draft' })
  })

  function handler() {
    return createDepartmentDraftPackSeedPostHandler({
      requirePermission,
      readBody,
      setResponseHeader,
      setResponseStatus,
      seedDraftPack
    })
  }

  it('derives the actor from the admin session and creates only a draft', async () => {
    const event = { context: {} } as never
    const result = await handler()(event)

    expect(requirePermission).toHaveBeenCalledWith(event, 'ADMIN')
    expect(seedDraftPack).toHaveBeenCalledWith({
      blueprintKey: 'creative',
      departmentId: DEPARTMENT_ID,
      ownerUserId: OWNER_ID,
      actorUserId: ACTOR_ID,
      reason: 'Owner confirmed for the first read/draft evaluation cycle.'
    })
    expect(setResponseStatus).toHaveBeenCalledWith(event, 201)
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'private, no-store')
    expect(result).toEqual({ outcome: 'created', releaseState: 'draft' })
  })

  it('rejects missing confirmation, unknown fields, and actor injection before seeding', async () => {
    for (const body of [
      { blueprintKey: 'creative', departmentId: DEPARTMENT_ID, ownerUserId: OWNER_ID, reason: 'A sufficiently long reason.' },
      { blueprintKey: 'creative', departmentId: DEPARTMENT_ID, ownerUserId: OWNER_ID, reason: 'A sufficiently long reason.', confirmation: 'ACTIVATE' },
      { blueprintKey: 'creative', departmentId: DEPARTMENT_ID, ownerUserId: OWNER_ID, actorUserId: ACTOR_ID, reason: 'A sufficiently long reason.', confirmation: 'SEED_DRAFT' }
    ]) {
      readBody.mockResolvedValueOnce(body)
      await expect(handler()({ context: {} } as never)).rejects.toMatchObject({
        statusCode: 422,
        data: { code: 'invalid_request' }
      })
    }
    expect(seedDraftPack).not.toHaveBeenCalled()
  })

  it('does not read or mutate when admin permission is denied', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(readBody).not.toHaveBeenCalled()
    expect(seedDraftPack).not.toHaveBeenCalled()
  })

  it('maps known service conflicts without leaking internal details', async () => {
    seedDraftPack.mockRejectedValue(new DepartmentDraftPackSeedError(
      'draft_pack_conflict',
      409,
      'sensitive internal detail'
    ))

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Department draft pack could not be seeded',
      data: { code: 'draft_pack_conflict' }
    })
  })
})
