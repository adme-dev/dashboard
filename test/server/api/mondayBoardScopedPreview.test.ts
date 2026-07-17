import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireRole = vi.fn()
const mockCreateMondayClient = vi.fn()
const mockGetBoard = vi.fn()
const mockGetItems = vi.fn()

let routerBoardId = '18422459929'
let query: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/mondayClient', () => ({
  createMondayClient: (...args: unknown[]) => mockCreateMondayClient(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getRouterParam: () => routerBoardId,
  getQuery: () => query,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

describe('GET /api/agency/monday/boards/:boardId/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    routerBoardId = '18422459929'
    query = {}
    mockRequireRole.mockResolvedValue({ id: 'owner-1', role: 'owner' })
    mockCreateMondayClient.mockResolvedValue({
      getBoard: mockGetBoard,
      getItems: mockGetItems
    })
    mockGetBoard.mockResolvedValue({
      id: '18422459929',
      name: 'Meta CAPI Rollout',
      type: 'board',
      state: 'active',
      workspace_id: '123',
      owner: { id: 'person-1', name: 'Private Owner', email: 'owner@example.com' },
      groups: [
        { id: 'topics', title: 'Pilot', color: '#123456', position: '1' }
      ],
      columns: [
        { id: 'status', title: 'Status', type: 'status', settings_str: '{"labels":{"1":"Done"}}' },
        { id: 'date', title: 'Due date', type: 'date' },
        { id: 'person', title: 'Owner', type: 'people' },
        { id: 'notes', title: 'Private notes', type: 'long_text' }
      ]
    })
    mockGetItems.mockResolvedValue({
      items: [
        {
          id: '9001',
          name: 'Configure pilot destination',
          url: 'https://adme2.monday.com/boards/18422459929/pulses/9001',
          board_id: '18422459929',
          group_id: 'topics',
          group_title: 'Pilot',
          state: 'active',
          created_at: '2026-07-17T00:00:00.000Z',
          updated_at: '2026-07-18T00:00:00.000Z',
          creator_id: 'person-1',
          column_values: [
            { id: 'status', type: 'status', text: 'Working on it', value: '{"index":1}' },
            { id: 'date', type: 'date', text: '2026-07-20', value: '{"date":"2026-07-20"}' },
            { id: 'person', type: 'people', text: 'Private Owner', value: '{"personsAndTeams":[{"id":1}]}' },
            { id: 'notes', type: 'long_text', text: 'Do not expose this', value: '{"text":"Do not expose this"}' }
          ],
          subitems: [{ id: '9101' }, { id: '9102' }]
        }
      ],
      cursor: 'opaque-next-page'
    })
  })

  it('requires owner or administrator access and returns a bounded redacted board preview', async () => {
    query = { pageSize: '25' }
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/preview.get')).default

    const result = await handler({ context: {} } as never)

    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['owner', 'admin'])
    expect(mockGetBoard).toHaveBeenCalledWith('18422459929')
    expect(mockGetItems).toHaveBeenCalledWith('18422459929', { limit: 25 })
    expect(result).toEqual({
      board: {
        id: '18422459929',
        name: 'Meta CAPI Rollout',
        type: 'board',
        state: 'active',
        workspaceId: '123'
      },
      groups: [{ id: 'topics', title: 'Pilot', color: '#123456', position: '1' }],
      columns: [
        { id: 'status', title: 'Status', type: 'status' },
        { id: 'date', title: 'Due date', type: 'date' },
        { id: 'person', title: 'Owner', type: 'people' },
        { id: 'notes', title: 'Private notes', type: 'long_text' }
      ],
      items: [{
        id: '9001',
        name: 'Configure pilot destination',
        state: 'active',
        groupId: 'topics',
        groupTitle: 'Pilot',
        createdAt: '2026-07-17T00:00:00.000Z',
        updatedAt: '2026-07-18T00:00:00.000Z',
        subitemCount: 2,
        columnValues: [
          { columnId: 'status', type: 'status', text: 'Working on it' },
          { columnId: 'date', type: 'date', text: '2026-07-20' }
        ],
        redactedColumnCount: 2
      }],
      pagination: {
        pageSize: 25,
        returnedItems: 1,
        isTruncated: true
      }
    })
    expect(JSON.stringify(result)).not.toContain('owner@example.com')
    expect(JSON.stringify(result)).not.toContain('Private Owner')
    expect(JSON.stringify(result)).not.toContain('Do not expose this')
    expect(JSON.stringify(result)).not.toContain('opaque-next-page')
  })

  it('rejects an invalid board identifier before creating a Monday client', async () => {
    routerBoardId = '18422459929") { malicious }'
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/preview.get')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid Monday board preview request'
    })
    expect(mockCreateMondayClient).not.toHaveBeenCalled()
  })

  it('rejects unbounded page sizes', async () => {
    query = { pageSize: '101' }
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/preview.get')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid Monday board preview request'
    })
    expect(mockCreateMondayClient).not.toHaveBeenCalled()
  })

  it('returns a generic not-found response for an unavailable board', async () => {
    mockGetBoard.mockResolvedValue(null)
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/preview.get')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Monday board not found'
    })
    expect(mockGetItems).not.toHaveBeenCalled()
  })

  it('does not expose Monday provider errors to callers', async () => {
    mockGetBoard.mockRejectedValue(new Error('provider token and internal detail'))
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/preview.get')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'Monday board preview unavailable'
    })
  })

  it('rejects malformed third-party response data at the response boundary', async () => {
    mockGetItems.mockResolvedValue({
      items: [{ id: 'not-numeric', name: '<script>unsafe</script>' }],
      cursor: null
    })
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/preview.get')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'Monday board preview unavailable'
    })
  })
})
