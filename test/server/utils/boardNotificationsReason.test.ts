/**
 * notifyBoardSubscribers reason-inference tests.
 *
 * Lives in a separate file so the top-level vi.mock for subscriptions and
 * notifications doesn't leak into the existing boardNotifications.test.ts
 * fixtures (which test notifyBoardMemberAdded with a different mock setup).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: any[]) => mockQueryOne(...args),
  queryRows: (...args: any[]) => mockQueryRows(...args),
}))

const mockSendBoardChangeEmail = vi.fn()
const mockSendBoardMemberAddedEmail = vi.fn()
vi.mock('~~/server/utils/email', () => ({
  sendBoardChangeEmail: (...args: any[]) => mockSendBoardChangeEmail(...args),
  sendBoardMemberAddedEmail: (...args: any[]) => mockSendBoardMemberAddedEmail(...args),
}))

const mockGetSubscribers = vi.fn()
vi.mock('~~/server/utils/subscriptions', () => ({
  getSubscribers: (...args: any[]) => mockGetSubscribers(...args),
}))

const mockCreateNotification = vi.fn()
vi.mock('~~/server/utils/notifications', () => ({
  createNotification: (...args: any[]) => mockCreateNotification(...args),
}))

import { notifyBoardSubscribers } from '../../../server/utils/boardNotifications'

describe('notifyBoardSubscribers reason inference', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockCreateNotification.mockResolvedValue(undefined)
    // Actor, board, task lookups inside notifyBoardSubscribers (in order)
    mockQueryOne
      .mockResolvedValueOnce({ name: 'Alice', email: 'a@x.com' })
      .mockResolvedValueOnce({ name: 'Board' })
      .mockResolvedValueOnce({ title: 'Task' })
  })

  it('tags board-level subscribers (item_id NULL) with watching_board', async () => {
    mockGetSubscribers.mockResolvedValueOnce([
      { userId: 'u1', notifyInapp: true, notifyEmail: false, itemId: null },
    ])

    await notifyBoardSubscribers({
      boardId: 'b1',
      type: 'cell_updated',
      taskId: 't1',
      actorId: 'actor',
    })

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', reason: 'watching_board' })
    )
  })

  it('tags item-level subscribers (item_id set) with watching_item', async () => {
    mockGetSubscribers.mockResolvedValueOnce([
      { userId: 'u2', notifyInapp: true, notifyEmail: false, itemId: 't1' },
    ])

    await notifyBoardSubscribers({
      boardId: 'b1',
      type: 'cell_updated',
      taskId: 't1',
      actorId: 'actor',
    })

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', reason: 'watching_item' })
    )
  })

  it('skips the actor', async () => {
    mockGetSubscribers.mockResolvedValueOnce([
      { userId: 'actor', notifyInapp: true, notifyEmail: false, itemId: null },
    ])

    await notifyBoardSubscribers({
      boardId: 'b1',
      type: 'cell_updated',
      taskId: 't1',
      actorId: 'actor',
    })

    expect(mockCreateNotification).not.toHaveBeenCalled()
  })
})
