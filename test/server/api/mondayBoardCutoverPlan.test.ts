import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireRole = vi.fn()
const mockCreateMondayClient = vi.fn()
const mockGetBoard = vi.fn()
const mockGetItems = vi.fn()
const mockGetSubitems = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

let routerBoardId = '18422459929'
let query: Record<string, unknown> = {
  targetBoardId: '86054ef6-6454-46fb-9002-1ba4d8d060b8'
}
let body: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/mondayClient', () => ({
  createMondayClient: (...args: unknown[]) => mockCreateMondayClient(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getRouterParam: () => routerBoardId,
  getQuery: () => query,
  readBody: () => body,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

describe('GET /api/agency/monday/boards/:boardId/cutover-plan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    routerBoardId = '18422459929'
    query = { targetBoardId: '86054ef6-6454-46fb-9002-1ba4d8d060b8' }
    body = {}
    mockRequireRole.mockResolvedValue({ id: 'owner-1', role: 'owner' })
    mockCreateMondayClient.mockResolvedValue({
      getBoard: mockGetBoard,
      getItems: mockGetItems,
      getSubitems: mockGetSubitems
    })
    mockGetBoard.mockResolvedValue({
      id: '18422459929',
      name: 'Meta CAPI Rollout',
      type: 'board',
      state: 'active',
      owner: { id: 'private-person', name: 'Private Owner', email: 'private@example.com' },
      groups: [{ id: 'topics', title: 'Rollout', color: '#123456', position: '1' }],
      columns: [
        { id: 'name', title: 'Name', type: 'name', settings_str: '{}' },
        { id: 'dealer', title: 'Dealer Group', type: 'dropdown', settings_str: '{"private":true}' },
        { id: 'token', title: 'CAPI Token', type: 'status', settings_str: '{"labels":{"1":"Configured"}}' },
        { id: 'owner', title: 'Owner', type: 'people', settings_str: '{}' },
        { id: 'notes', title: 'Notes', type: 'long_text', settings_str: '{}' },
        { id: 'subitems', title: 'Subitems', type: 'subtasks', settings_str: '{}' }
      ]
    })
    mockGetItems.mockResolvedValue({
      items: [
        {
          id: '1001',
          name: 'Alan Mance Motors',
          url: 'https://adme2.monday.com/private-item',
          creator_id: 'private-person',
          state: 'active',
          created_at: '2026-07-17T00:00:00Z',
          updated_at: '2026-07-18T00:00:00Z',
          group_id: 'topics',
          group_title: 'Rollout',
          column_values: [
            { id: 'dealer', type: 'dropdown', text: 'Alan Mance Motors', value: '{"private":"raw"}' },
            { id: 'token', type: 'status', text: 'real-token-must-not-leak', value: '{"secret":"real-token-must-not-leak"}' },
            { id: 'owner', type: 'people', text: 'Private Owner', value: '{"personsAndTeams":[{"id":1}]}' },
            { id: 'notes', type: 'long_text', text: 'private-note-must-not-leak', value: '{"text":"private-note-must-not-leak"}' }
          ],
          subitems: []
        },
        {
          id: '1002',
          name: 'Zero Measurement Signal Hub — production foundation',
          state: 'active',
          created_at: '2026-07-17T00:00:00Z',
          updated_at: '2026-07-18T00:00:00Z',
          group_id: 'topics',
          group_title: 'Rollout',
          column_values: [],
          subitems: [{ id: '1101' }]
        }
      ],
      cursor: undefined
    })
    mockGetSubitems.mockResolvedValue([
      {
        id: '1101',
        name: 'Verify event identity',
        state: 'active',
        created_at: '2026-07-17T01:00:00Z',
        updated_at: '2026-07-18T01:00:00Z',
        creator_id: 'private-person',
        url: 'https://adme2.monday.com/private-subitem',
        column_values: [{ id: 'notes', type: 'long_text', text: 'subitem-secret', value: '{"secret":true}' }]
      }
    ])
    mockQueryOne.mockResolvedValue({
      id: '86054ef6-6454-46fb-9002-1ba4d8d060b8',
      name: 'Meta CAPI Rollout'
    })
    mockQueryRows
      .mockResolvedValueOnce([
        {
          id: 'task-alan',
          title: 'Alan Mance Motors',
          parentTaskId: null,
          statusName: 'To Do',
          mondayItemId: '1001',
          mondayBoardId: '18422459929',
          reconciliationStatus: 'current'
        },
        {
          id: 'task-native',
          title: 'P1 — Canonical control plane',
          parentTaskId: null,
          statusName: 'Verified',
          mondayItemId: null,
          mondayBoardId: null,
          reconciliationStatus: null
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 'client-alan',
          name: 'Alan Mance Motors',
          measurementProfileId: 'profile-alan'
        }
      ])
  })

  it('requires owner/admin and returns a bounded redacted no-write cutover plan', async () => {
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-plan.get')).default

    const result = await handler({ context: {} } as never)

    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['owner', 'admin'])
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1::uuid'), [
      '86054ef6-6454-46fb-9002-1ba4d8d060b8'
    ])
    expect(mockGetBoard).toHaveBeenCalledWith('18422459929')
    expect(mockGetItems).toHaveBeenCalledWith('18422459929', { limit: 100, cursor: undefined })
    expect(mockGetSubitems).toHaveBeenCalledWith('1002')
    expect(result).toEqual(expect.objectContaining({
      mode: 'dry_run',
      source: expect.objectContaining({ boardId: '18422459929', topLevelItems: 2, subitems: 1, totalRecords: 3 }),
      target: expect.objectContaining({ boardId: '86054ef6-6454-46fb-9002-1ba4d8d060b8', totalRecords: 2 }),
      summary: expect.objectContaining({ mappedByProvenance: 1, toCreate: 2, isReadyForImport: false })
    }))
    expect(result.records.find((record: { sourceId: string }) => record.sourceId === '1001')).toEqual(expect.objectContaining({
      action: 'reuse',
      clientLink: expect.objectContaining({ status: 'exact', clientId: 'client-alan' })
    }))
    expect(result.columnMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceColumnId: 'dealer', populatedRecords: 1 }),
      expect.objectContaining({ sourceColumnId: 'token', populatedRecords: 1 }),
      expect.objectContaining({ sourceColumnId: 'owner', populatedRecords: 1 }),
      expect.objectContaining({ sourceColumnId: 'notes', populatedRecords: 2 })
    ]))
    expect(JSON.stringify(result)).not.toContain('real-token-must-not-leak')
    expect(JSON.stringify(result)).not.toContain('private-note-must-not-leak')
    expect(JSON.stringify(result)).not.toContain('subitem-secret')
    expect(JSON.stringify(result)).not.toContain('private@example.com')
    expect(JSON.stringify(result)).not.toContain('private-item')
    expect(JSON.stringify(result)).not.toContain('creator_id')
  })

  it('rejects invalid source and target identifiers before database or Monday access', async () => {
    routerBoardId = '18422459929") { malicious }'
    query = { targetBoardId: 'not-a-uuid' }
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-plan.get')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover plan request'
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockCreateMondayClient).not.toHaveBeenCalled()
  })

  it('returns not found without calling Monday when the exact Zero board is unavailable', async () => {
    mockQueryOne.mockResolvedValue(null)
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-plan.get')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Zero target board not found'
    })
    expect(mockCreateMondayClient).not.toHaveBeenCalled()
  })

  it('returns a safe not-found response for an unavailable exact Monday board', async () => {
    mockGetBoard.mockResolvedValue(null)
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-plan.get')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Monday source board not found'
    })
    expect(mockGetItems).not.toHaveBeenCalled()
  })

  it('marks the source truncated when the parent-item safety cap is reached', async () => {
    const items = Array.from({ length: 500 }, (_, index) => ({
      id: String(2000 + index),
      name: `Client ${index}`,
      state: 'active',
      created_at: '2026-07-17T00:00:00Z',
      updated_at: '2026-07-18T00:00:00Z',
      group_id: 'topics',
      group_title: 'Rollout',
      column_values: [],
      subitems: []
    }))
    mockGetItems.mockResolvedValue({ items, cursor: 'more-source-data' })
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-plan.get')).default

    const result = await handler({ context: {} } as never)

    expect(result.source).toEqual(expect.objectContaining({ topLevelItems: 500, isTruncated: true }))
    expect(result.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SOURCE_TRUNCATED', severity: 'blocking' })
    ]))
    expect(mockGetItems).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed Monday response data with a generic provider error', async () => {
    mockGetItems.mockResolvedValue({
      items: [{ id: 'not-numeric', name: '<script>unsafe</script>' }],
      cursor: undefined
    })
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-plan.get')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'Monday cutover plan unavailable'
    })
  })

  it('rejects an unsafe provider cursor before it can be reused in GraphQL', async () => {
    mockGetItems.mockResolvedValue({ items: [], cursor: 'opaque-cursor" } malicious {' })
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-plan.get')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'Monday cutover plan unavailable'
    })
    expect(mockGetItems).toHaveBeenCalledTimes(1)
  })

  it('does not expose Monday provider failures to callers', async () => {
    mockGetBoard.mockRejectedValue(new Error('provider token and internal detail'))
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-plan.get')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'Monday cutover plan unavailable'
    })
  })

  it('applies bounded review resolutions through a no-write POST plan', async () => {
    mockQueryRows.mockReset()
    mockQueryRows
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: '436e159b-d053-4de2-ad0e-e589b938ced7',
        name: 'Alan Mance Motors',
        measurementProfileId: 'profile-alan'
      }])
    body = {
      targetBoardId: '86054ef6-6454-46fb-9002-1ba4d8d060b8',
      resolutions: {
        clients: [{
          sourceId: '1001',
          clientId: '436e159b-d053-4de2-ad0e-e589b938ced7',
          reason: 'Approved against the existing Zero client profile.'
        }],
        columns: [
          { sourceColumnId: 'dealer', decision: 'import', reason: 'Use the reviewed client links.' },
          { sourceColumnId: 'owner', decision: 'exclude', reason: 'Exclude after explicit owner review.' },
          { sourceColumnId: 'notes', decision: 'exclude', reason: 'Exclude after explicit privacy review.' }
        ]
      }
    }
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-plan.post')).default

    const result = await handler({ context: {} } as never)

    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['owner', 'admin'])
    expect(result.mode).toBe('dry_run')
    expect(result.records.find((record: { sourceId: string }) => record.sourceId === '1001')).toEqual(expect.objectContaining({
      clientLink: expect.objectContaining({ status: 'resolved', clientId: '436e159b-d053-4de2-ad0e-e589b938ced7' })
    }))
    expect(result.columnMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceColumnId: 'dealer', resolutionStatus: 'applied', resolutionDecision: 'import' }),
      expect.objectContaining({ sourceColumnId: 'owner', resolutionStatus: 'applied', resolutionDecision: 'exclude' }),
      expect.objectContaining({ sourceColumnId: 'notes', resolutionStatus: 'applied', resolutionDecision: 'exclude' })
    ]))
    expect(JSON.stringify(result)).not.toContain('Approved against the existing')
    expect(JSON.stringify(result)).not.toContain('privacy review')
  })

  it('rejects malformed or duplicate POST resolutions before database or Monday access', async () => {
    body = {
      targetBoardId: '86054ef6-6454-46fb-9002-1ba4d8d060b8',
      resolutions: {
        clients: [
          {
            sourceId: '1001',
            clientId: '436e159b-d053-4de2-ad0e-e589b938ced7',
            reason: 'First explicit mapping decision.'
          },
          {
            sourceId: '1001',
            clientId: '436e159b-d053-4de2-ad0e-e589b938ced7',
            reason: 'Conflicting duplicate mapping decision.'
          }
        ],
        columns: []
      },
      unexpected: 'must be rejected'
    }
    const handler = (await import('~~/server/api/agency/monday/boards/[boardId]/cutover-plan.post')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover resolution request'
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockCreateMondayClient).not.toHaveBeenCalled()
  })
})
