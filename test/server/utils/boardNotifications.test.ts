/**
 * Board Notifications Utility Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: any[]) => mockQueryOne(...args),
  queryRows: (...args: any[]) => mockQueryRows(...args),
}))

const mockSendBoardMemberAddedEmail = vi.fn()
const mockSendBoardChangeEmail = vi.fn()

vi.mock('~~/server/utils/email', () => ({
  sendBoardMemberAddedEmail: (...args: any[]) => mockSendBoardMemberAddedEmail(...args),
  sendBoardChangeEmail: (...args: any[]) => mockSendBoardChangeEmail(...args),
}))

import { notifyBoardMemberAdded } from '../../../server/utils/boardNotifications'

describe('notifyBoardMemberAdded', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendBoardMemberAddedEmail.mockResolvedValue(undefined)
  })

  it('creates a notification and sends an email when a member is added', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ name: 'Alice' }) // actor
      .mockResolvedValueOnce({ name: 'Bob', email: 'bob@example.com', notification_preferences: {} }) // member
      .mockResolvedValueOnce({ id: 'notif-1', created_at: new Date().toISOString() }) // notification insert

    const result = await notifyBoardMemberAdded({
      memberId: 'bob-id',
      boardId: 'board-1',
      boardName: 'Creative Team',
      actorId: 'alice-id',
    })

    expect(result).toEqual({ notified: true })
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining(['bob-id', 'board_member_added'])
    )
    expect(mockSendBoardMemberAddedEmail).toHaveBeenCalledTimes(1)
    expect(mockSendBoardMemberAddedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'bob@example.com',
        boardName: 'Creative Team',
        adderName: 'Alice',
      })
    )
  })

  it('skips when the actor adds themselves', async () => {
    const result = await notifyBoardMemberAdded({
      memberId: 'alice-id',
      boardId: 'board-1',
      boardName: 'Creative Team',
      actorId: 'alice-id',
    })

    expect(result).toEqual({ notified: false, reason: 'self_add' })
    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockSendBoardMemberAddedEmail).not.toHaveBeenCalled()
  })

  it('respects email_board_member_added preference', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ name: 'Alice' })
      .mockResolvedValueOnce({
        name: 'Bob',
        email: 'bob@example.com',
        notification_preferences: { email_board_member_added: false },
      })
      .mockResolvedValueOnce({ id: 'notif-1', created_at: new Date().toISOString() })

    const result = await notifyBoardMemberAdded({
      memberId: 'bob-id',
      boardId: 'board-1',
      boardName: 'Creative Team',
      actorId: 'alice-id',
    })

    expect(result).toEqual({ notified: true })
    expect(mockSendBoardMemberAddedEmail).not.toHaveBeenCalled()
  })

  it('returns silently if member not found', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ name: 'Alice' })
      .mockResolvedValueOnce(null) // member missing

    const result = await notifyBoardMemberAdded({
      memberId: 'ghost-id',
      boardId: 'board-1',
      boardName: 'Creative Team',
      actorId: 'alice-id',
    })

    expect(result).toEqual({ notified: false, reason: 'member_not_found' })
    expect(mockSendBoardMemberAddedEmail).not.toHaveBeenCalled()
  })
})
