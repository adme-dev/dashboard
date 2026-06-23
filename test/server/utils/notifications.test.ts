/**
 * Notifications Utility Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock database queries
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: any[]) => mockQueryOne(...args),
  queryRows: (...args: any[]) => mockQueryRows(...args)
}))

// Mock email utilities
const mockSendTaskAssignedEmail = vi.fn()
const mockSendMentionEmail = vi.fn()
const mockSendApprovalRequestEmail = vi.fn()
const mockSendDueReminderEmail = vi.fn()

vi.mock('~~/server/utils/email', () => ({
  sendTaskAssignedEmail: (...args: any[]) => mockSendTaskAssignedEmail(...args),
  sendMentionEmail: (...args: any[]) => mockSendMentionEmail(...args),
  sendApprovalRequestEmail: (...args: any[]) => mockSendApprovalRequestEmail(...args),
  sendDueReminderEmail: (...args: any[]) => mockSendDueReminderEmail(...args)
}))

// getAppUrl lives in its own module (server/utils/appUrl). notifications.ts imports
// it from there, so mock it here to keep taskUrl deterministic — the real impl returns
// https://app.xeroflow.io outside dev, which would otherwise break these assertions.
vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: () => 'http://localhost:3000'
}))

import {
  createNotification,
  createBulkNotifications,
  notifyTaskAssigned,
  notifyTaskAssigneeChanged,
  notifyMention,
  notifyApprovalRequest,
  notifyDueReminder,
  notifyTaskStatusChanged
} from '../../../server/utils/notifications'

describe('notifications utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryOne.mockResolvedValue({ id: 'notif-1', created_at: new Date().toISOString() })
    mockSendTaskAssignedEmail.mockResolvedValue(undefined)
    mockSendMentionEmail.mockResolvedValue(undefined)
    mockSendApprovalRequestEmail.mockResolvedValue(undefined)
    mockSendDueReminderEmail.mockResolvedValue(undefined)
  })

  describe('createNotification', () => {
    it('should create notification with all required fields', async () => {
      const params = {
        userId: 'user-123',
        type: 'task_assigned' as const,
        title: 'New Task',
        message: 'You have been assigned a task'
      }

      const result = await createNotification(params)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([
          'user-123',
          'task_assigned',
          'New Task',
          'You have been assigned a task',
          null, // link
          null, // actor_id
          null  // metadata
        ])
      )
      expect(result).toEqual({ id: 'notif-1', created_at: expect.any(String) })
    })

    it('should include optional fields when provided', async () => {
      const params = {
        userId: 'user-123',
        type: 'task_comment' as const,
        title: 'New Comment',
        message: 'Someone commented on your task',
        link: '/tasks/123',
        actorId: 'actor-456',
        metadata: { taskId: '123', commentId: '456' }
      }

      await createNotification(params)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'user-123',
          'task_comment',
          'New Comment',
          'Someone commented on your task',
          '/tasks/123',
          'actor-456',
          JSON.stringify({ taskId: '123', commentId: '456' })
        ])
      )
    })

    it('should throw on database error', async () => {
      mockQueryOne.mockRejectedValue(new Error('Database error'))

      const params = {
        userId: 'user-123',
        type: 'system' as const,
        title: 'Test',
        message: 'Test message'
      }

      await expect(createNotification(params)).rejects.toThrow('Database error')
    })

    describe('in-app preference gating', () => {
      it('skips creation when inapp pref for the type is false', async () => {
        mockQueryOne
          .mockResolvedValueOnce({ notification_preferences: { inapp_task_assigned: false } })

        const result = await createNotification({
          userId: 'user-123',
          type: 'task_assigned',
          title: 'New Task',
          message: 'You were assigned',
        })

        // Only the prefs lookup should have run; no INSERT
        expect(mockQueryOne).toHaveBeenCalledTimes(1)
        expect(mockQueryOne).toHaveBeenCalledWith(
          expect.stringContaining('notification_preferences'),
          ['user-123']
        )
        expect(result).toBeNull()
      })

      it('creates notification when inapp pref is true', async () => {
        mockQueryOne
          .mockResolvedValueOnce({ notification_preferences: { inapp_task_assigned: true } })
          .mockResolvedValueOnce({ id: 'notif-1', created_at: new Date().toISOString() })

        const result = await createNotification({
          userId: 'user-123',
          type: 'task_assigned',
          title: 'New Task',
          message: 'You were assigned',
        })

        expect(mockQueryOne).toHaveBeenCalledTimes(2)
        expect(mockQueryOne).toHaveBeenLastCalledWith(
          expect.stringContaining('INSERT INTO notifications'),
          expect.anything()
        )
        expect(result).toEqual({ id: 'notif-1', created_at: expect.any(String) })
      })

      it('defaults to creating when no preference is set', async () => {
        mockQueryOne
          .mockResolvedValueOnce({ notification_preferences: {} })
          .mockResolvedValueOnce({ id: 'notif-1', created_at: new Date().toISOString() })

        await createNotification({
          userId: 'user-123',
          type: 'task_assigned',
          title: 'New Task',
          message: 'You were assigned',
        })

        expect(mockQueryOne).toHaveBeenCalledTimes(2)
      })

      it('creates ungated notification types regardless of preferences', async () => {
        // 'system' has no inapp_ pref mapping — should always create without lookup
        mockQueryOne
          .mockResolvedValueOnce({ id: 'notif-1', created_at: new Date().toISOString() })

        await createNotification({
          userId: 'user-123',
          type: 'system',
          title: 'Important',
          message: 'System alert',
        })

        // Goes straight to INSERT — no preference lookup
        expect(mockQueryOne).toHaveBeenCalledTimes(1)
        expect(mockQueryOne).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO notifications'),
          expect.anything()
        )
      })
    })
  })

  describe('createBulkNotifications', () => {
    it('should create notifications for multiple users', async () => {
      const userIds = ['user-1', 'user-2', 'user-3']
      const params = {
        type: 'team_update' as const,
        title: 'Team Update',
        message: 'Important announcement'
      }

      const result = await createBulkNotifications(userIds, params)

      expect(mockQueryOne).toHaveBeenCalledTimes(3)
      expect(result.successful).toBe(3)
      expect(result.failed).toBe(0)
    })

    it('should report partial failures', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: '1' })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ id: '3' })

      const userIds = ['user-1', 'user-2', 'user-3']
      const params = {
        type: 'system' as const,
        title: 'Test',
        message: 'Test'
      }

      const result = await createBulkNotifications(userIds, params)

      expect(result.successful).toBe(2)
      expect(result.failed).toBe(1)
    })

    it('should handle empty user array', async () => {
      const result = await createBulkNotifications([], {
        type: 'system' as const,
        title: 'Test',
        message: 'Test'
      })

      expect(mockQueryOne).not.toHaveBeenCalled()
      expect(result.successful).toBe(0)
      expect(result.failed).toBe(0)
    })
  })

  describe('notifyTaskAssigned', () => {
    it('should create notification and send email', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ name: 'John', email: 'john@example.com' }) // assigner
        .mockResolvedValueOnce({ name: 'Jane', email: 'jane@example.com', notification_preferences: {} }) // assignee
        .mockResolvedValueOnce({ id: 'notif-1', created_at: new Date().toISOString() }) // notification

      await notifyTaskAssigned({
        taskId: 'task-123',
        taskTitle: 'Complete report',
        assigneeId: 'assignee-id',
        assignerId: 'assigner-id',
        projectName: 'Project X'
      })

      // Check notification created
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([
          'assignee-id',
          'task_assigned',
          'New Task Assigned',
          'John assigned you to "Complete report"'
        ])
      )

      // Check email sent with corrected parameters
      expect(mockSendTaskAssignedEmail).toHaveBeenCalledWith({
        to: 'jane@example.com',
        name: 'Jane',
        taskTitle: 'Complete report',
        assignerName: 'John',
        projectName: 'Project X',
        dueDate: undefined,
        taskUrl: 'http://localhost:3000/agency/tasks/task-123'
      })
    })

    it('should not send email if preference disabled', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ name: 'John', email: 'john@example.com' })
        .mockResolvedValueOnce({ name: 'Jane', email: 'jane@example.com', notification_preferences: { email_task_assigned: false } })
        .mockResolvedValueOnce({ id: 'notif-1', created_at: new Date().toISOString() })

      await notifyTaskAssigned({
        taskId: 'task-123',
        taskTitle: 'Complete report',
        assigneeId: 'assignee-id',
        assignerId: 'assigner-id'
      })

      // Notification should still be created
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.anything()
      )

      // Email should NOT be sent
      expect(mockSendTaskAssignedEmail).not.toHaveBeenCalled()
    })

    it('should not notify if assigner not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      await notifyTaskAssigned({
        taskId: 'task-123',
        taskTitle: 'Test',
        assigneeId: 'assignee-id',
        assignerId: 'invalid-id'
      })

      expect(mockSendTaskAssignedEmail).not.toHaveBeenCalled()
    })

    it('should not notify if assignee not found', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ name: 'John', email: 'john@example.com' })
        .mockResolvedValueOnce(null)

      await notifyTaskAssigned({
        taskId: 'task-123',
        taskTitle: 'Test',
        assigneeId: 'invalid-id',
        assignerId: 'assigner-id'
      })

      expect(mockSendTaskAssignedEmail).not.toHaveBeenCalled()
    })
  })

  describe('notifyTaskAssigneeChanged', () => {
    it('notifies the new assignee on a real change', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ name: 'John', email: 'john@example.com' }) // assigner
        .mockResolvedValueOnce({ name: 'Jane', email: 'jane@example.com', notification_preferences: {} }) // assignee
        .mockResolvedValueOnce({ id: 'notif-1', created_at: new Date().toISOString() }) // notification insert

      const result = await notifyTaskAssigneeChanged({
        taskId: 'task-1',
        taskTitle: 'Ship it',
        oldAssigneeId: null,
        newAssigneeId: 'jane-id',
        actorId: 'john-id',
      })

      expect(result).toEqual({ notified: true })
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining(['jane-id', 'task_assigned'])
      )
      expect(mockSendTaskAssignedEmail).toHaveBeenCalledTimes(1)
    })

    it('skips when assignee is unchanged', async () => {
      const result = await notifyTaskAssigneeChanged({
        taskId: 'task-1',
        taskTitle: 'Ship it',
        oldAssigneeId: 'jane-id',
        newAssigneeId: 'jane-id',
        actorId: 'john-id',
      })

      expect(result).toEqual({ notified: false, reason: 'unchanged' })
      expect(mockQueryOne).not.toHaveBeenCalled()
      expect(mockSendTaskAssignedEmail).not.toHaveBeenCalled()
    })

    it('skips when task is being unassigned', async () => {
      const result = await notifyTaskAssigneeChanged({
        taskId: 'task-1',
        taskTitle: 'Ship it',
        oldAssigneeId: 'jane-id',
        newAssigneeId: null,
        actorId: 'john-id',
      })

      expect(result).toEqual({ notified: false, reason: 'unassigned' })
      expect(mockQueryOne).not.toHaveBeenCalled()
      expect(mockSendTaskAssignedEmail).not.toHaveBeenCalled()
    })

    it('skips self-assignment (actor assigns themselves)', async () => {
      const result = await notifyTaskAssigneeChanged({
        taskId: 'task-1',
        taskTitle: 'Ship it',
        oldAssigneeId: null,
        newAssigneeId: 'jane-id',
        actorId: 'jane-id',
      })

      expect(result).toEqual({ notified: false, reason: 'self_assignment' })
      expect(mockQueryOne).not.toHaveBeenCalled()
      expect(mockSendTaskAssignedEmail).not.toHaveBeenCalled()
    })

    it('passes dueDate and projectName through to the email', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ name: 'John', email: 'john@example.com' })
        .mockResolvedValueOnce({ name: 'Jane', email: 'jane@example.com', notification_preferences: {} })
        .mockResolvedValueOnce({ id: 'notif-1', created_at: new Date().toISOString() })

      const due = new Date('2026-12-31T00:00:00Z')
      await notifyTaskAssigneeChanged({
        taskId: 'task-1',
        taskTitle: 'Ship it',
        oldAssigneeId: null,
        newAssigneeId: 'jane-id',
        actorId: 'john-id',
        dueDate: due,
        projectName: 'Project X',
      })

      expect(mockSendTaskAssignedEmail).toHaveBeenCalledWith(
        expect.objectContaining({ dueDate: due, projectName: 'Project X' })
      )
    })
  })

  describe('notifyMention', () => {
    it('should create notification and send email for mention', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ name: 'Alice', email: 'alice@example.com' }) // mentioner
        .mockResolvedValueOnce({ name: 'Bob', email: 'bob@example.com', notification_preferences: {} }) // mentioned
        .mockResolvedValueOnce({ id: 'notif-1' }) // notification

      await notifyMention({
        taskId: 'task-456',
        taskTitle: 'Review design',
        mentionedUserId: 'bob-id',
        mentionerId: 'alice-id',
        commentSnippet: 'Hey @Bob, can you take a look at this?'
      })

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([
          'bob-id',
          'task_mentioned',
          'You were mentioned',
          'Alice mentioned you in "Review design"'
        ])
      )

      // Check email sent with corrected parameters
      expect(mockSendMentionEmail).toHaveBeenCalledWith({
        to: 'bob@example.com',
        name: 'Bob',
        mentionerName: 'Alice',
        taskTitle: 'Review design',
        commentSnippet: 'Hey @Bob, can you take a look at this?',
        taskUrl: 'http://localhost:3000/agency/tasks/task-456'
      })
    })

    it('should truncate long comment snippets in metadata', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ name: 'Alice', email: 'alice@example.com' })
        .mockResolvedValueOnce({ name: 'Bob', email: 'bob@example.com', notification_preferences: {} })
        .mockResolvedValueOnce({ id: 'notif-1' })

      const longComment = 'A'.repeat(200)

      await notifyMention({
        taskId: 'task-456',
        taskTitle: 'Test',
        mentionedUserId: 'bob-id',
        mentionerId: 'alice-id',
        commentSnippet: longComment
      })

      // The notification metadata should have truncated comment
      const notificationCall = mockQueryOne.mock.calls.find(
        call => call[0].includes('INSERT INTO notifications')
      )
      const metadata = JSON.parse(notificationCall![1][6])
      expect(metadata.commentSnippet).toHaveLength(100)
    })
  })

  describe('notifyApprovalRequest', () => {
    it('should create notification and send email for approval', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ name: 'Requester', email: 'req@example.com' })
        .mockResolvedValueOnce({ name: 'Approver', email: 'appr@example.com', notification_preferences: {} })
        .mockResolvedValueOnce({ id: 'notif-1' })

      await notifyApprovalRequest({
        taskId: 'task-789',
        taskTitle: 'Budget approval',
        approverId: 'approver-id',
        requesterId: 'requester-id',
        stepName: 'Manager Review'
      })

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([
          'approver-id',
          'approval_requested',
          'Approval Requested',
          'Requester requested your approval for "Budget approval"'
        ])
      )

      // Check email sent with corrected parameters
      expect(mockSendApprovalRequestEmail).toHaveBeenCalledWith({
        to: 'appr@example.com',
        name: 'Approver',
        taskTitle: 'Budget approval',
        requesterName: 'Requester',
        stepName: 'Manager Review',
        taskUrl: 'http://localhost:3000/agency/tasks/task-789'
      })
    })
  })

  describe('notifyDueReminder', () => {
    it('should create notification for upcoming task', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ name: 'User', email: 'user@example.com', notification_preferences: {} })
        .mockResolvedValueOnce({ id: 'notif-1' })

      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 1) // Tomorrow

      await notifyDueReminder({
        taskId: 'task-due',
        taskTitle: 'Submit report',
        assigneeId: 'user-id',
        dueDate,
        isOverdue: false
      })

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([
          'user-id',
          'task_due_soon',
          'Task Due Soon'
        ])
      )

      // Check email sent with corrected parameters
      expect(mockSendDueReminderEmail).toHaveBeenCalledWith({
        to: 'user@example.com',
        name: 'User',
        taskTitle: 'Submit report',
        dueDate: expect.any(Date),
        daysRemaining: expect.any(Number),
        taskUrl: 'http://localhost:3000/agency/tasks/task-due'
      })
    })

    it('should create notification for overdue task', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ name: 'User', email: 'user@example.com', notification_preferences: {} })
        .mockResolvedValueOnce({ id: 'notif-1' })

      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() - 1) // Yesterday

      await notifyDueReminder({
        taskId: 'task-overdue',
        taskTitle: 'Late task',
        assigneeId: 'user-id',
        dueDate,
        isOverdue: true
      })

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([
          'user-id',
          'task_overdue',
          'Task Overdue',
          '"Late task" is overdue'
        ])
      )
    })
  })

  describe('notifyTaskStatusChanged', () => {
    it('should notify all watchers about status change', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ name: 'Changer' }) // Who changed
        .mockResolvedValue({ id: 'notif-1' }) // Notifications

      const watcherIds = ['watcher-1', 'watcher-2', 'watcher-3']

      await notifyTaskStatusChanged(
        'task-status',
        'Important Task',
        'In Progress',
        'Completed',
        'changer-id',
        watcherIds
      )

      // Should query for changer name
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('SELECT name FROM team_members'),
        ['changer-id']
      )

      // Should create notifications for all watchers
      // (3 watchers + 1 changer lookup = at least 3 notification inserts)
      const notificationInserts = mockQueryOne.mock.calls.filter(
        call => call[0].includes('INSERT INTO notifications')
      )
      expect(notificationInserts.length).toBe(3)
    })

    it('should not notify if changer not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      await notifyTaskStatusChanged(
        'task-123',
        'Task',
        'Old',
        'New',
        'invalid-changer',
        ['watcher-1']
      )

      // Only the changer lookup should be called
      expect(mockQueryOne).toHaveBeenCalledTimes(1)
    })

    it('should include status change details in metadata', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ name: 'User' })
        .mockResolvedValue({ id: 'notif-1' })

      await notifyTaskStatusChanged(
        'task-123',
        'Task Title',
        'Todo',
        'Done',
        'changer-id',
        ['watcher-1']
      )

      const notificationCall = mockQueryOne.mock.calls.find(
        call => call[0].includes('INSERT INTO notifications')
      )

      const metadata = JSON.parse(notificationCall![1][6])
      expect(metadata).toEqual({
        taskId: 'task-123',
        taskTitle: 'Task Title',
        oldStatus: 'Todo',
        newStatus: 'Done'
      })
    })
  })

  describe('notification types', () => {
    it('should support all notification types', async () => {
      const types = [
        'task_assigned',
        'task_mentioned',
        'task_comment',
        'task_status_changed',
        'task_due_soon',
        'task_overdue',
        'approval_requested',
        'approval_completed',
        'approval_response',
        'team_update',
        'system'
      ] as const

      for (const type of types) {
        mockQueryOne.mockResolvedValueOnce({ id: `notif-${type}` })

        await createNotification({
          userId: 'user-123',
          type,
          title: `Test ${type}`,
          message: `Testing ${type} notification`
        })

        expect(mockQueryOne).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([type])
        )
      }
    })
  })
})

describe('notification reason propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createNotification stores reason when provided', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ notification_preferences: {} })
      .mockResolvedValueOnce({ id: 'n1', created_at: new Date().toISOString() })

    await createNotification({
      userId: 'u1',
      type: 'task_assigned',
      title: 't',
      message: 'm',
      reason: 'assigned',
    })

    const insertCall = mockQueryOne.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO notifications')
    )
    expect(insertCall).toBeDefined()
    const sql = insertCall![0] as string
    const params = insertCall![1] as any[]
    expect(sql).toMatch(/reason/)
    expect(params[params.length - 2]).toBe('assigned')
  })

  it('createNotification stores null reason when not provided', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ notification_preferences: {} })
      .mockResolvedValueOnce({ id: 'n2', created_at: new Date().toISOString() })

    await createNotification({
      userId: 'u1',
      type: 'system',
      title: 't',
      message: 'm',
    })

    const insertCall = mockQueryOne.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO notifications')
    )
    const params = insertCall![1] as any[]
    expect(params[params.length - 2]).toBeNull()
  })

  it('notifyMention passes reason="mentioned"', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ name: 'Alice', email: 'a@x.com' })
      .mockResolvedValueOnce({ name: 'Bob', email: 'b@x.com', notification_preferences: { email_task_mentioned: false } })
      .mockResolvedValueOnce({ notification_preferences: {} })
      .mockResolvedValueOnce({ id: 'n', created_at: new Date().toISOString() })

    await notifyMention({
      taskId: 't1',
      taskTitle: 'Task',
      mentionedUserId: 'bob',
      mentionerId: 'alice',
      commentSnippet: 'hi @Bob',
    })

    const insertCall = mockQueryOne.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO notifications')
    )
    const params = insertCall![1] as any[]
    expect(params[params.length - 2]).toBe('mentioned')
  })

  it('notifyTaskAssigned passes reason="assigned"', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ name: 'Alice', email: 'a@x.com' })
      .mockResolvedValueOnce({ name: 'Bob', email: 'b@x.com', notification_preferences: { email_task_assigned: false } })
      .mockResolvedValueOnce({ notification_preferences: {} })
      .mockResolvedValueOnce({ id: 'n', created_at: new Date().toISOString() })

    await notifyTaskAssigned({
      taskId: 't1',
      taskTitle: 'Task',
      assigneeId: 'bob',
      assignerId: 'alice',
    })

    const insertCall = mockQueryOne.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO notifications')
    )
    const params = insertCall![1] as any[]
    expect(params[params.length - 2]).toBe('assigned')
  })
})
