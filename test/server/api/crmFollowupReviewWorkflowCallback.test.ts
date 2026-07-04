import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  headers?: Record<string, string>
  body?: unknown
}

const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
const mockCreateNotification = vi.fn()
const mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/notifications', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args)
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
      WORKFLOW_CALLBACK_SECRET: 'workflow-secret'
    }
    vi.clearAllMocks()
    mockQueryRows.mockResolvedValue([
      task({ id: 'notify-1', assigned_to: 'user-1', reminder_at: '2026-07-04T04:30:00.000Z' }),
      task({ id: 'drain-1', assigned_to: null, reminder_at: '2026-07-04T04:40:00.000Z' }),
      task({ id: 'overdue-1', assigned_to: 'user-2', reminder_at: '2026-07-04T04:50:00.000Z', due_at: '2026-07-03T04:50:00.000Z' })
    ])
  })

  it('requires the workflow callback secret before touching CRM follow-up state', async () => {
    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'wrong' },
      body: validPayload()
    })).rejects.toMatchObject({ statusCode: 401 })

    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('stays inert while agency workflows are disabled', async () => {
    process.env.AGENCY_WORKFLOWS_ENABLED = 'false'

    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })).rejects.toMatchObject({ statusCode: 503 })

    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('runs a read-only CRM follow-up pressure review for the requested client scope', async () => {
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
        considered: 3,
        notifyCandidateCount: 2,
        drainCandidateCount: 1,
        assignedCount: 2,
        unassignedCount: 1,
        overdueCount: 1,
        oldestReminderAt: '2026-07-04T04:30:00.000Z',
        newestReminderAt: '2026-07-04T04:50:00.000Z'
      }
    })
    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.stringContaining('AND client_id = $2'),
      ['2026-07-04T06:00:00.000Z', 'client-1']
    )
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
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
    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.not.stringContaining('AND client_id = $1'),
      ['2026-07-04T06:00:00.000Z']
    )
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('rejects malformed workflow payloads', async () => {
    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: { kind: 'crm.followup.review', bucket: '2026-07-04T05', scope: 'client', trigger: 'cron' }
    })).rejects.toMatchObject({ statusCode: 400 })

    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
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
