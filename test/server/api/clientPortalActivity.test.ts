import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireRole = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/permissions', () => ({
  PERMISSIONS: {
    CLIENTS: ['clients:read'],
    MEDIA_BUYING: ['media:read']
  }
}))

const { default: activityHandler } = await import(
  '../../../../server/api/agency/client-portal/activity.get'
)

describe('agency client portal activity API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({
      id: 'agency-user-1',
      email: 'owner@example.com',
      role: 'owner'
    })
    mockQueryRows.mockResolvedValue([
      {
        id: 'activity-1',
        client_id: 'client-1',
        client_name: 'Client One',
        client_user_id: 'client-user-1',
        client_user_name: 'Owner User (Agency)',
        client_user_email: 'agency-agency-user-1-client-1@portal-access.local',
        action: 'agency_portal_access',
        entity_type: 'client',
        entity_id: 'client-1',
        details: JSON.stringify({
          agencyUserId: 'agency-user-1',
          agencyUserEmail: 'owner@example.com',
          agencyUserRole: 'owner'
        }),
        ip_address: '127.0.0.1',
        user_agent: 'vitest',
        created_at: '2026-05-27T02:30:00Z'
      }
    ])
  })

  it('lists agency portal access audit events with actor details', async () => {
    const result = await activityHandler({
      query: {
        clientId: 'client-1',
        action: 'agency_portal_access',
        limit: '25'
      }
    })

    expect(mockRequireRole).toHaveBeenCalledOnce()
    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.stringContaining('FROM client_activity_log cal'),
      ['client-1', 'agency_portal_access', 25]
    )
    expect(result.activity).toEqual([
      expect.objectContaining({
        id: 'activity-1',
        clientId: 'client-1',
        clientName: 'Client One',
        action: 'agency_portal_access',
        agencyUserEmail: 'owner@example.com',
        agencyUserRole: 'owner',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest'
      })
    ])
  })

  it('can list all portal activity without an action filter', async () => {
    await activityHandler({
      query: {
        action: 'all'
      }
    })

    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.not.stringContaining('cal.action ='),
      [50]
    )
  })
})
