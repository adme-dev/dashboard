import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  headers?: Record<string, string>
}

const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
const mockCreateNotification = vi.fn()
const mockStartCrmFollowupReviewWorkflow = vi.fn()
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/notifications', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args)
}))

vi.mock('~~/server/utils/agencyWorkflows/client', () => ({
  startCrmFollowupReviewWorkflow: (...args: unknown[]) => mockStartCrmFollowupReviewWorkflow(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(fn: T) => fn,
  getHeader: (event: TestEvent, name: string) => event.headers?.[name.toLowerCase()] ?? event.headers?.[name],
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

const oldEnv = { ...process.env }

const { default: handler } = await import('../../../server/api/cron/crm-task-reminders.post')
const cronHandler = handler as (event: TestEvent) => Promise<unknown>

describe('crm task reminders cron', () => {
  beforeEach(() => {
    process.env = {
      ...oldEnv,
      CRON_SECRET: 'cron-secret',
      AGENCY_WORKFLOWS_ENABLED: 'true',
      AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED: 'false',
      AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY: 'false'
    }
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T05:42:00.000Z'))
    vi.clearAllMocks()
    mockQueryRows.mockReset()
    mockExecute.mockReset()
    mockCreateNotification.mockReset()
    mockStartCrmFollowupReviewWorkflow.mockReset()
    mockQueryRows.mockResolvedValue([
      task({ id: '00000000-0000-4000-8000-000000000001', assigned_to: 'user-1' }),
      task({ id: '00000000-0000-4000-8000-000000000002', assigned_to: null })
    ])
    mockExecute.mockResolvedValue(2)
    mockCreateNotification.mockResolvedValue({ id: 'notification-1' })
    mockStartCrmFollowupReviewWorkflow.mockResolvedValue({
      ok: true,
      enabled: true,
      workflow: 'crm.followup.review',
      instanceId: 'crm-followup-review-2026-07-04T04-all-all'
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the legacy direct reminder writer while the workflow primary flag is disabled', async () => {
    const result = await cronHandler({ headers: { 'x-cron-secret': 'cron-secret' } })

    expect(result).toEqual({ ok: true, considered: 2, notified: 1, drained: 1 })
    expect(mockStartCrmFollowupReviewWorkflow).not.toHaveBeenCalled()
    expect(mockQueryRows).toHaveBeenCalledWith(expect.stringContaining('FROM crm_tasks'))
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      type: 'task_due_soon',
      metadata: { crmTaskId: '00000000-0000-4000-8000-000000000001', clientId: 'client-1' }
    }))
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE crm_tasks SET reminded_at = NOW()'),
      [
        [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002'
        ]
      ]
    )
  })

  it('delegates to the CRM follow-up Workflow instead of running direct writes when workflow primary is enabled', async () => {
    process.env.AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY = 'true'
    process.env.AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED = 'true'

    const result = await cronHandler({ headers: { 'x-cron-secret': 'cron-secret' } })

    expect(result).toEqual({
      ok: true,
      delegated: true,
      workflow: 'crm.followup.review',
      bucket: '2026-07-04T04',
      result: {
        ok: true,
        enabled: true,
        workflow: 'crm.followup.review',
        instanceId: 'crm-followup-review-2026-07-04T04-all-all'
      }
    })
    expect(mockStartCrmFollowupReviewWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      {
        bucket: '2026-07-04T04',
        scope: 'all',
        trigger: 'cron'
      }
    )
    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockConsoleLog).toHaveBeenCalledWith(
      '[crm-cron] task-reminders delegated',
      expect.objectContaining({ workflow: 'crm.followup.review', bucket: '2026-07-04T04' })
    )
  })

  it('fails closed when workflow primary is enabled before workflow writes are enabled', async () => {
    process.env.AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY = 'true'
    process.env.AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED = 'false'

    await expect(cronHandler({ headers: { 'x-cron-secret': 'cron-secret' } }))
      .rejects.toMatchObject({ statusCode: 503 })

    expect(mockStartCrmFollowupReviewWorkflow).not.toHaveBeenCalled()
    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('fails closed when workflow primary delegation is enabled but workflow start is unavailable', async () => {
    process.env.AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY = 'true'
    process.env.AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED = 'true'
    mockStartCrmFollowupReviewWorkflow.mockResolvedValueOnce({ ok: false, enabled: true, reason: 'not_configured' })

    await expect(cronHandler({ headers: { 'x-cron-secret': 'cron-secret' } }))
      .rejects.toMatchObject({ statusCode: 503 })

    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
  })
})

function task(overrides: Partial<{
  id: string
  client_id: string
  title: string
  assigned_to: string | null
  reminder_at: string
  due_at: string | null
}> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    client_id: 'client-1',
    title: 'Follow up',
    assigned_to: 'user-1',
    reminder_at: '2026-07-04T04:30:00.000Z',
    due_at: null,
    ...overrides
  }
}
