import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  params?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, name) => event.params?.[name]
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireAuth = vi.fn()
const mockRequireClientAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const { default: agencyDetailHandler } = await import(
  '../../../../server/api/agency/client-portal/requests/[id].get'
)
const { default: clientDetailHandler } = await import(
  '../../../../server/api/portal/requests/[id].get'
)

const requestRow = {
  id: 'request-1',
  client_id: 'client-1',
  client_name: 'Client One',
  client_user_id: 'client-user-1',
  request_type: 'support_ticket',
  category: 'access',
  title: 'Request access to billing',
  description: 'Please enable billing.',
  priority: 'normal',
  status: 'in_review',
  assigned_to: 'team-1',
  assigned_name: 'Agency User',
  assigned_avatar: null,
  assigned_role: 'Account Manager',
  project_id: null,
  project_name: null,
  task_id: null,
  attachments: [],
  estimated_budget: null,
  desired_deadline: null,
  response_notes: null,
  responded_by_name: null,
  responded_at: null,
  resolved_at: null,
  submitted_by_name: 'Jane Client',
  submitted_by_email: 'jane@example.com',
  created_at: '2026-05-28T01:00:00Z',
  updated_at: '2026-05-28T02:00:00Z'
}

describe('client portal request detail APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'team-1' })
    mockRequireClientAuth.mockResolvedValue({ id: 'client-user-1', clientId: 'client-1' })
    mockQueryOne.mockResolvedValue(requestRow)
    mockQueryRows.mockResolvedValue([
      {
        id: 'message-public',
        content: 'Public reply',
        attachments: [],
        is_internal: false,
        created_at: '2026-05-28T02:00:00Z',
        client_user_name: null,
        client_user_avatar: null,
        team_member_name: 'Agency User',
        team_member_avatar: null
      },
      {
        id: 'message-internal',
        content: 'Internal note',
        attachments: [],
        is_internal: true,
        created_at: '2026-05-28T02:05:00Z',
        client_user_name: null,
        client_user_avatar: null,
        team_member_name: 'Agency User',
        team_member_avatar: null
      }
    ])
  })

  it('allows agency staff to see internal request notes', async () => {
    const result = await agencyDetailHandler({ params: { id: 'request-1' } })

    expect(mockRequireAuth).toHaveBeenCalledOnce()
    expect(String(mockQueryRows.mock.calls[0]?.[0])).not.toContain('m.is_internal = false')
    expect(result.messages).toEqual([
      expect.objectContaining({ id: 'message-public', isInternal: false }),
      expect.objectContaining({ id: 'message-internal', isInternal: true })
    ])
  })

  it('hides internal request notes from client users', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'message-public',
        content: 'Public reply',
        attachments: [],
        is_internal: false,
        created_at: '2026-05-28T02:00:00Z',
        client_user_name: null,
        client_user_avatar: null,
        team_member_name: 'Agency User',
        team_member_avatar: null
      }
    ])

    const result = await clientDetailHandler({ params: { id: 'request-1' } })

    expect(mockRequireClientAuth).toHaveBeenCalledOnce()
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('WHERE cr.id = $1 AND cr.client_id = $2'), ['request-1', 'client-1'])
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('m.is_internal = false')
    expect(result.messages).toEqual([
      expect.objectContaining({ id: 'message-public', isInternal: false })
    ])
  })
})
