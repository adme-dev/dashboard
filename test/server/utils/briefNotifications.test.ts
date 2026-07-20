/**
 * Brief Notifications Utility Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: any[]) => mockQueryOne(...args),
  queryRows: (...args: any[]) => mockQueryRows(...args),
}))

const mockSendBriefStatusEmail = vi.fn()
const mockSendBriefCommentEmail = vi.fn()
const mockSendBriefAssignedEmail = vi.fn()

vi.mock('~~/server/utils/email', () => ({
  sendBriefStatusEmail: (...args: any[]) => mockSendBriefStatusEmail(...args),
  sendBriefCommentEmail: (...args: any[]) => mockSendBriefCommentEmail(...args),
  sendBriefAssignedEmail: (...args: any[]) => mockSendBriefAssignedEmail(...args),
  getAppUrl: () => 'http://localhost:3000',
}))

import { notifyBriefAssigneeChanged } from '../../../server/utils/briefNotifications'

describe('notifyBriefAssigneeChanged', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryOne.mockResolvedValue({ id: 'notif-1', created_at: new Date().toISOString() })
    mockSendBriefAssignedEmail.mockResolvedValue(undefined)
  })

  it('notifies the new assignee on a real change', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ name: 'John' }) // assigner
      .mockResolvedValueOnce({ name: 'Jane', email: 'jane@example.com', notification_preferences: { email_brief_assigned: true } }) // assignee
      .mockResolvedValueOnce({ notification_preferences: { inapp_brief_assigned: true } })

    const result = await notifyBriefAssigneeChanged({
      briefId: 'brief-1',
      briefTitle: 'Spring campaign',
      referenceNumber: 'BR-001',
      oldAssigneeId: null,
      newAssigneeId: 'jane-id',
      actorId: 'john-id',
    })

    expect(result).toEqual({ notified: true })
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining(['jane-id', 'brief_assigned'])
    )
    expect(mockSendBriefAssignedEmail).toHaveBeenCalledTimes(1)
  })

  it('skips when assignee is unchanged', async () => {
    const result = await notifyBriefAssigneeChanged({
      briefId: 'brief-1',
      briefTitle: 'Spring campaign',
      referenceNumber: 'BR-001',
      oldAssigneeId: 'jane-id',
      newAssigneeId: 'jane-id',
      actorId: 'john-id',
    })

    expect(result).toEqual({ notified: false, reason: 'unchanged' })
    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockSendBriefAssignedEmail).not.toHaveBeenCalled()
  })

  it('skips when brief is being unassigned', async () => {
    const result = await notifyBriefAssigneeChanged({
      briefId: 'brief-1',
      briefTitle: 'Spring campaign',
      referenceNumber: 'BR-001',
      oldAssigneeId: 'jane-id',
      newAssigneeId: null,
      actorId: 'john-id',
    })

    expect(result).toEqual({ notified: false, reason: 'unassigned' })
    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockSendBriefAssignedEmail).not.toHaveBeenCalled()
  })

  it('skips self-assignment (actor assigns themselves)', async () => {
    const result = await notifyBriefAssigneeChanged({
      briefId: 'brief-1',
      briefTitle: 'Spring campaign',
      referenceNumber: 'BR-001',
      oldAssigneeId: null,
      newAssigneeId: 'jane-id',
      actorId: 'jane-id',
    })

    expect(result).toEqual({ notified: false, reason: 'self_assignment' })
    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockSendBriefAssignedEmail).not.toHaveBeenCalled()
  })
})
