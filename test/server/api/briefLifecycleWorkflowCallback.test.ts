import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  headers?: Record<string, string>
  body?: unknown
}

const mockQueryOne = vi.fn()
const mockScoreBriefCompleteness = vi.fn()
const mockDecideBriefGate = vi.fn()
const mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/aiBriefScoring', () => ({
  scoreBriefCompleteness: (...args: unknown[]) => mockScoreBriefCompleteness(...args)
}))

vi.mock('~~/server/utils/automation/briefGatekeeper', () => ({
  decideBriefGate: (...args: unknown[]) => mockDecideBriefGate(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(fn: T) => fn,
  getHeader: (event: TestEvent, name: string) => event.headers?.[name.toLowerCase()] ?? event.headers?.[name],
  readBody: async (event: TestEvent) => event.body,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

const oldEnv = { ...process.env }

const { default: handler } = await import('../../../server/api/internal/workflows/briefs/lifecycle-check.post')
const workflowCallback = handler as (event: TestEvent) => Promise<unknown>

describe('brief lifecycle check workflow callback', () => {
  beforeEach(() => {
    process.env = {
      ...oldEnv,
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_CALLBACK_SECRET: 'workflow-secret'
    }
    vi.clearAllMocks()
    mockQueryOne.mockResolvedValue({
      id: 'brief-1',
      client_id: 'client-1',
      status: 'submitted',
      title: 'Launch brief'
    })
    mockScoreBriefCompleteness.mockResolvedValue({
      overall: 62,
      fieldScores: [],
      recommendations: ['Add campaign objective']
    })
    mockDecideBriefGate.mockReturnValue({
      gate: 'needs_info',
      requiredComplete: false,
      missingRequired: [{ fieldKey: 'objective', fieldLabel: 'Objective' }],
      recommendations: ['Add campaign objective']
    })
  })

  it('requires the workflow callback secret before touching brief lifecycle state', async () => {
    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'wrong' },
      body: validPayload()
    })).rejects.toMatchObject({ statusCode: 401 })

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockScoreBriefCompleteness).not.toHaveBeenCalled()
  })

  it('stays inert while agency workflows are disabled', async () => {
    process.env.AGENCY_WORKFLOWS_ENABLED = 'false'

    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })).rejects.toMatchObject({ statusCode: 503 })

    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('runs a read-only lifecycle check for a verified brief', async () => {
    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })

    expect(result).toEqual({
      ok: true,
      workflow: 'brief.lifecycle.check',
      briefId: 'brief-1',
      clientId: 'client-1',
      result: {
        ok: true,
        status: 'submitted',
        title: 'Launch brief',
        gate: 'needs_info',
        overall: 62,
        requiredComplete: false,
        missingRequired: [{ fieldKey: 'objective', fieldLabel: 'Objective' }],
        recommendations: ['Add campaign objective']
      }
    })
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('FROM briefs'),
      ['brief-1', 'client-1']
    )
    expect(mockScoreBriefCompleteness).toHaveBeenCalledWith('brief-1')
    expect(mockDecideBriefGate).toHaveBeenCalledWith(expect.objectContaining({ overall: 62 }))
    expect(mockConsoleInfo).toHaveBeenCalledWith(
      'agency-workflows.brief-lifecycle.check.completed',
      expect.objectContaining({ briefId: 'brief-1', clientId: 'client-1', gate: 'needs_info', overall: 62 })
    )
  })

  it('acknowledges missing briefs without retrying stale workflow events', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })

    expect(result).toMatchObject({
      ok: true,
      workflow: 'brief.lifecycle.check',
      briefId: 'brief-1',
      result: {
        ok: true,
        skipped: true,
        reason: 'brief_not_found'
      }
    })
    expect(mockScoreBriefCompleteness).not.toHaveBeenCalled()
  })

  it('rejects malformed workflow payloads', async () => {
    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: { kind: 'brief.lifecycle.check', trigger: 'submit' }
    })).rejects.toMatchObject({ statusCode: 400 })

    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})

function validPayload() {
  return {
    kind: 'brief.lifecycle.check',
    briefId: 'brief-1',
    clientId: 'client-1',
    trigger: 'submit'
  }
}
