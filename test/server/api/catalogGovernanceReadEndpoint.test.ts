import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogGovernanceReadError } from '~~/server/utils/ai/governance/catalogGovernanceRead'

const DEPARTMENT_ID = '10000000-0000-4000-8000-000000000001'
const ACTOR_ID = '20000000-0000-4000-8000-000000000001'

const { createCatalogGovernanceGetHandler } = await import(
  '~~/server/api/admin/ai/governance/catalog.get'
)

describe('GET /api/admin/ai/governance/catalog', () => {
  const requirePermission = vi.fn()
  const getQuery = vi.fn()
  const setResponseHeader = vi.fn()
  const listCatalog = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    requirePermission.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    getQuery.mockReturnValue({
      departmentId: DEPARTMENT_ID,
      kind: 'capability',
      releaseState: 'pilot',
      limit: '25'
    })
    listCatalog.mockResolvedValue({ items: [], nextCursor: null })
  })

  function handler() {
    return createCatalogGovernanceGetHandler({
      requirePermission,
      getQuery,
      setResponseHeader,
      listCatalog
    })
  }

  it('requires company governance permission and disables caching', async () => {
    const event = { context: {} } as never

    const result = await handler()(event)

    expect(requirePermission).toHaveBeenCalledWith(event, 'ADMIN')
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'private, no-store')
    expect(listCatalog).toHaveBeenCalledWith({
      departmentId: DEPARTMENT_ID,
      kind: 'capability',
      releaseState: 'pilot',
      limit: 25,
      cursor: null
    })
    expect(result).toEqual({ items: [], nextCursor: null })
  })

  it('does not query catalog data when governance permission is denied', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(getQuery).not.toHaveBeenCalled()
    expect(listCatalog).not.toHaveBeenCalled()
  })

  it.each([
    ['unknown field', { surprise: 'true' }],
    ['invalid department', { departmentId: 'not-a-uuid' }],
    ['invalid kind', { kind: 'workflow' }],
    ['invalid release state', { releaseState: 'deleted' }],
    ['zero limit', { limit: '0' }],
    ['excessive limit', { limit: '101' }],
    ['oversized cursor', { cursor: 'a'.repeat(513) }]
  ])('rejects malformed filters: %s', async (_label, query) => {
    getQuery.mockReturnValue(query)

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 422,
      data: { code: 'invalid_request' }
    })
    expect(listCatalog).not.toHaveBeenCalled()
  })

  it('maps an invalid opaque cursor to the public invalid-request contract', async () => {
    getQuery.mockReturnValue({ cursor: 'e30' })
    listCatalog.mockRejectedValue(new CatalogGovernanceReadError('invalid_cursor', 'Invalid catalog cursor'))

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 422,
      data: { code: 'invalid_request' }
    })
  })
})
