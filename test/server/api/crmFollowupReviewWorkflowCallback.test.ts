import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  headers?: Record<string, string>
  body?: unknown
}

const mockListCandidates = vi.fn()
const mockAuthorizeTask = vi.fn()
const mockQueryOneFresh = vi.fn()
const mockQueryRowsFresh = vi.fn()
const mockClaimCandidates = vi.fn()
const mockTransactionQuery = vi.fn()
const mockTransaction = vi.fn()
const mockCreateNotification = vi.fn()
const mockRecordFieldChanges = vi.fn()
const mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
let reviewCandidates: Array<ReturnType<typeof task>> = []

vi.mock('~~/server/utils/db', () => ({
  queryRows: (sql: string, params: unknown[]) => String(sql).includes('FROM crm_tasks task')
    ? mockAuthorizeTask(sql, params)
    : mockListCandidates(sql, params),
  queryOneFresh: (...args: unknown[]) => mockQueryOneFresh(...args),
  queryRowsFresh: (...args: unknown[]) => mockQueryRowsFresh(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

vi.mock('~~/server/utils/notifications', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args)
}))

vi.mock('~~/server/utils/crm/audit', () => ({
  recordFieldChanges: (...args: unknown[]) => mockRecordFieldChanges(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(fn: T) => fn,
  getHeader: (event: TestEvent, name: string) => event.headers?.[name.toLowerCase()] ?? event.headers?.[name],
  readBody: async (event: TestEvent) => event.body,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

const oldEnv = { ...process.env }

const { default: handler } = await import('../../../server/api/internal/workflows/crm/followup-review.post')
const workflowCallback = handler as (event: TestEvent) => Promise<unknown>

describe('crm follow-up review workflow callback', () => {
  beforeEach(() => {
    process.env = {
      ...oldEnv,
      AGENCY_WORKFLOWS_ENABLED: 'true',
      AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED: 'false',
      WORKFLOW_CALLBACK_SECRET: 'workflow-secret'
    }
    vi.clearAllMocks()
    mockListCandidates.mockReset()
    mockAuthorizeTask.mockReset()
    mockQueryOneFresh.mockReset()
    mockQueryRowsFresh.mockReset()
    mockClaimCandidates.mockReset()
    mockTransactionQuery.mockReset()
    mockTransaction.mockReset()
    mockCreateNotification.mockReset()
    mockRecordFieldChanges.mockReset()
    reviewCandidates = [
      task({ id: 'notify-1', assigned_to: 'user-1', reminder_at: '2026-07-04T04:30:00.000Z' }),
      task({ id: 'drain-1', assigned_to: null, reminder_at: '2026-07-04T04:40:00.000Z' }),
      task({ id: 'overdue-1', assigned_to: 'user-2', reminder_at: '2026-07-04T04:50:00.000Z', due_at: '2026-07-03T04:50:00.000Z' })
    ]
    mockListCandidates.mockImplementation(async () => reviewCandidates)
    mockAuthorizeTask.mockImplementation(async (_sql: string, params: unknown[]) => {
      const row = reviewCandidates.find(candidate => candidate.id === params[0])
      return row ? [row] : []
    })
    mockQueryOneFresh.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM agency_clients client')) {
        return { id: params[0], name: 'Test client', record_visibility: 'team' }
      }
      throw new Error('unexpected fresh single-row query')
    })
    mockQueryRowsFresh.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM crm_search_organisation_scopes')) return [{ id: 'organisation-1' }]
      throw new Error('unexpected fresh multi-row query')
    })
    mockClaimCandidates.mockResolvedValue([])
    mockTransactionQuery.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM crm_tasks task')) {
        return { rows: await mockAuthorizeTask(sql, params) }
      }
      if (sql.includes('UPDATE crm_tasks')) {
        return { rows: await mockClaimCandidates(sql, params) }
      }
      throw new Error('unexpected CRM reminder transaction query')
    })
    mockTransaction.mockImplementation(async callback => callback({ query: mockTransactionQuery }))
    mockCreateNotification.mockResolvedValue({ id: 'notification-1' })
    mockRecordFieldChanges.mockResolvedValue(undefined)
  })

  it('requires the workflow callback secret before touching CRM follow-up state', async () => {
    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'wrong' },
      body: validPayload()
    })).rejects.toMatchObject({ statusCode: 401 })

    expect(mockListCandidates).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockRecordFieldChanges).not.toHaveBeenCalled()
  })

  it('stays inert while agency workflows are disabled', async () => {
    process.env.AGENCY_WORKFLOWS_ENABLED = 'false'

    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })).rejects.toMatchObject({ statusCode: 503 })

    expect(mockListCandidates).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockRecordFieldChanges).not.toHaveBeenCalled()
  })

  it('runs a read-only CRM follow-up pressure review by default for the requested client scope', async () => {
    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })

    expect(result).toEqual({
      ok: true,
      workflow: 'crm.followup.review',
      bucket: '2026-07-04T05',
      scope: 'client',
      clientId: 'client-1',
      result: {
        ok: true,
        mode: 'review',
        considered: 3,
        notifyCandidateCount: 2,
        drainCandidateCount: 1,
        assignedCount: 2,
        unassignedCount: 1,
        overdueCount: 1,
        notifiedCount: 0,
        notificationFailureCount: 0,
        drainedCount: 0,
        markedRemindedCount: 0,
        skippedAlreadyProcessedCount: 0,
        auditFailureCount: 0,
        oldestReminderAt: '2026-07-04T04:30:00.000Z',
        newestReminderAt: '2026-07-04T04:50:00.000Z'
      }
    })
    expect(mockListCandidates).toHaveBeenCalledWith(
      expect.stringContaining('AND client_id = $2'),
      ['2026-07-04T06:00:00.000Z', 'client-1']
    )
    expect(mockQueryOneFresh).toHaveBeenCalledWith(
      expect.stringContaining('client.is_active = TRUE'),
      ['client-1']
    )
    expect(mockQueryRowsFresh).toHaveBeenCalledWith(
      expect.stringContaining('crm_search_organisation_scopes')
    )
    expect(mockAuthorizeTask).toHaveBeenCalledTimes(3)
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockRecordFieldChanges).not.toHaveBeenCalled()
    expect(mockConsoleInfo).toHaveBeenCalledWith(
      'agency-workflows.crm-followup.review.completed',
      expect.objectContaining({
        bucket: '2026-07-04T05',
        scope: 'client',
        clientId: 'client-1',
        considered: 3,
        notifyCandidateCount: 2,
        drainCandidateCount: 1
      })
    )
  })

  it('runs an all-client pressure review without client filtering', async () => {
    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: {
        kind: 'crm.followup.review',
        bucket: '2026-07-04T05',
        scope: 'all',
        trigger: 'cron'
      }
    })

    expect(result).toMatchObject({
      ok: true,
      workflow: 'crm.followup.review',
      scope: 'all',
      clientId: null,
      result: { considered: 3 }
    })
    expect(mockListCandidates).toHaveBeenCalledWith(
      expect.not.stringContaining('AND client_id = $1'),
      ['2026-07-04T06:00:00.000Z']
    )
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockRecordFieldChanges).not.toHaveBeenCalled()
  })

  it('creates notifications, stamps reminded_at, and audits claimed reminders when write mode is explicitly enabled', async () => {
    process.env.AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED = 'true'
    reviewCandidates = [
      task({ id: '00000000-0000-4000-8000-000000000001', assigned_to: 'user-1', reminder_at: '2026-07-04T04:30:00.000Z' }),
      task({ id: '00000000-0000-4000-8000-000000000002', assigned_to: null, reminder_at: '2026-07-04T04:40:00.000Z' }),
      task({ id: '00000000-0000-4000-8000-000000000003', assigned_to: 'user-2', reminder_at: '2026-07-04T04:50:00.000Z', due_at: '2026-07-03T04:50:00.000Z' })
    ]
    mockClaimCandidates.mockResolvedValue([
      { id: '00000000-0000-4000-8000-000000000001', client_id: 'client-1', reminded_at: '2026-07-04T06:00:00.000Z' },
      { id: '00000000-0000-4000-8000-000000000002', client_id: 'client-1', reminded_at: '2026-07-04T06:00:00.000Z' },
      { id: '00000000-0000-4000-8000-000000000003', client_id: 'client-1', reminded_at: '2026-07-04T06:00:00.000Z' }
    ])

    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })

    expect(result).toMatchObject({
      ok: true,
      workflow: 'crm.followup.review',
      result: {
        mode: 'write',
        considered: 3,
        notifyCandidateCount: 2,
        drainCandidateCount: 1,
        notifiedCount: 2,
        notificationFailureCount: 0,
        drainedCount: 1,
        markedRemindedCount: 3,
        skippedAlreadyProcessedCount: 0,
        auditFailureCount: 0
      }
    })
    expect(mockClaimCandidates).toHaveBeenCalledWith(
      expect.stringContaining('AND id = ANY($3::uuid[])'),
      [
        '2026-07-04T06:00:00.000Z',
        'client-1',
        [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000003',
          '00000000-0000-4000-8000-000000000002'
        ]
      ]
    )
    expect(String(mockClaimCandidates.mock.calls[0][0])).toContain('AND reminded_at IS NULL')
    expect(mockCreateNotification).toHaveBeenCalledTimes(2)
    expect(mockCreateNotification).toHaveBeenNthCalledWith(1, expect.objectContaining({
      userId: 'user-1',
      type: 'task_due_soon',
      title: 'CRM task reminder',
      message: 'Reminder: "Follow up"',
      link: '/agency/crm',
      metadata: expect.objectContaining({
        crmTaskId: '00000000-0000-4000-8000-000000000001',
        workflow: 'crm.followup.review',
        bucket: '2026-07-04T05'
      }),
      reason: 'assigned'
    }))
    expect(mockCreateNotification).toHaveBeenNthCalledWith(2, expect.objectContaining({
      userId: 'user-2',
      type: 'task_overdue',
      title: 'CRM task overdue',
      message: '"Follow up" is overdue'
    }))
    expect(mockRecordFieldChanges).toHaveBeenCalledTimes(3)
    expect(mockRecordFieldChanges).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1',
      entityType: 'task',
      entityId: '00000000-0000-4000-8000-000000000001',
      before: { reminded_at: null },
      after: { reminded_at: '2026-07-04T06:00:00.000Z' },
      fields: ['reminded_at'],
      actor: null
    }))
  })

  it('does not notify reminders that lose the idempotent claim race', async () => {
    process.env.AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED = 'true'
    reviewCandidates = [
      task({ id: '00000000-0000-4000-8000-000000000001', assigned_to: 'user-1' }),
      task({ id: '00000000-0000-4000-8000-000000000002', assigned_to: 'user-2' })
    ]
    mockClaimCandidates.mockResolvedValue([
      { id: '00000000-0000-4000-8000-000000000002', client_id: 'client-1', reminded_at: '2026-07-04T06:00:00.000Z' }
    ])

    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })

    expect(result).toMatchObject({
      result: {
        mode: 'write',
        notifiedCount: 1,
        markedRemindedCount: 1,
        skippedAlreadyProcessedCount: 1
      }
    })
    expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-2' }))
  })

  it('keeps notification and audit failures observable without retrying claimed CRM reminders forever', async () => {
    process.env.AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED = 'true'
    reviewCandidates = [task({ id: '00000000-0000-4000-8000-000000000001', assigned_to: 'user-1' })]
    mockClaimCandidates.mockResolvedValue([
      { id: '00000000-0000-4000-8000-000000000001', client_id: 'client-1', reminded_at: '2026-07-04T06:00:00.000Z' }
    ])
    mockCreateNotification.mockRejectedValueOnce(new Error('push transport failed'))
    mockRecordFieldChanges.mockRejectedValueOnce(new Error('audit failed'))

    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })

    expect(result).toMatchObject({
      result: {
        mode: 'write',
        notifiedCount: 0,
        notificationFailureCount: 1,
        markedRemindedCount: 1,
        auditFailureCount: 1
      }
    })
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      'agency-workflows.crm-followup.review.notification.failed',
      expect.objectContaining({ taskId: '00000000-0000-4000-8000-000000000001' })
    )
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      'agency-workflows.crm-followup.review.audit.failed',
      expect.objectContaining({ taskId: '00000000-0000-4000-8000-000000000001' })
    )
  })

  it('rejects malformed workflow payloads', async () => {
    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: { kind: 'crm.followup.review', bucket: '2026-07-04T05', scope: 'client', trigger: 'cron' }
    })).rejects.toMatchObject({ statusCode: 400 })

    expect(mockListCandidates).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockRecordFieldChanges).not.toHaveBeenCalled()
  })
})

function validPayload() {
  return {
    kind: 'crm.followup.review',
    bucket: '2026-07-04T05:42:00.000Z',
    scope: 'client',
    clientId: 'client-1',
    trigger: 'manual'
  }
}

function task(overrides: Partial<{
  id: string
  client_id: string
  title: string
  assigned_to: string | null
  reminder_at: string
  due_at: string | null
}> = {}) {
  return {
    id: 'task-1',
    client_id: 'client-1',
    title: 'Follow up',
    assigned_to: 'user-1',
    reminder_at: '2026-07-04T04:30:00.000Z',
    due_at: null,
    ...overrides
  }
}
