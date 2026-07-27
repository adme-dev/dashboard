import { beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { digestPortalSessionToken } from '../../../server/utils/portalSession'

const testGlobal = globalThis as typeof globalThis & {
  getCookie: (event: unknown, name: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.getCookie = vi.fn(() => 'portal-session-token')
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: (...args: unknown[]) => mockQueryOne(...args),
  queryRowsFresh: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

const { requireClientAuth } = await import('../../../server/utils/clientAuth')

const activeUserRow = {
  id: 'client-user-1',
  email: 'jane@example.com',
  name: 'Jane',
  title: null,
  phone: null,
  avatar_url: null,
  role: 'client_admin',
  is_primary_contact: true,
  can_manage_lead_outcomes: false,
  can_view_projects: true,
  can_view_invoices: true,
  can_approve_work: true,
  can_view_time_entries: true,
  can_view_budgets: true,
  can_add_comments: true,
  can_upload_files: true,
  can_invite_users: true,
  can_view_analytics: true,
  can_submit_requests: true,
  can_view_crm: false,
  can_edit_crm: false,
  can_admin_crm: false,
  notification_preferences: {},
  timezone: 'Australia/Melbourne',
  client_id: 'client-1',
  client_name: 'Client Co',
  client_logo: null,
  lead_capture_mode: 'capture_only'
}

describe('portal client authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockExecute.mockReset()
  })

  it('authenticates a digest session with one indexed lookup and no bcrypt scan', async () => {
    mockQueryOne.mockResolvedValueOnce(activeUserRow)

    const event = { context: {} }
    const user = await requireClientAuth(event as never)
    const digest = await digestPortalSessionToken('portal-session-token')

    expect(user.id).toBe('client-user-1')
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('cs.token_hash = $1')
    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual([digest])
    expect(mockQueryOne).toHaveBeenCalledOnce()
    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('upgrades a matching legacy bcrypt session to the indexed digest', async () => {
    const legacyHash = await bcrypt.hash('portal-session-token', 4)
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activeUserRow)
    mockQueryRows.mockResolvedValueOnce([{
      id: 'legacy-session-1',
      token_hash: legacyHash,
      client_user_id: 'client-user-1'
    }])
    mockExecute.mockResolvedValueOnce(1)

    const user = await requireClientAuth({ context: {} } as never)
    const digest = await digestPortalSessionToken('portal-session-token')

    expect(user.id).toBe('client-user-1')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain(`cs.token_hash LIKE '$2%'`)
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE client_sessions'),
      [digest, 'legacy-session-1']
    )
  })
})
