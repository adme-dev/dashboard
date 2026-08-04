import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appendGodModeAuditEvent: vi.fn(),
  queryOneFresh: vi.fn()
}))
vi.mock('../../../server/utils/godMode/audit', () => ({ appendGodModeAuditEvent: mocks.appendGodModeAuditEvent }))
vi.mock('../../../server/utils/db', () => ({ queryOneFresh: mocks.queryOneFresh }))

import { processJob } from '../../../server/utils/queueConsumer'

const payload = (over: Record<string, unknown> = {}) => ({
  actorUserId: '11111111-1111-4111-8111-111111111111',
  correlationId: '22222222-2222-4222-8222-222222222222',
  sessionDigest: 'a'.repeat(64),
  channel: 'application',
  routeOrTool: 'POST /api/agency/ai/chat/conversations/1/messages',
  phase: 'succeeded',
  tenantId: null,
  clientId: '33333333-3333-4333-8333-333333333333',
  entityType: null,
  entityId: null,
  bypassedControls: ['confirmation'],
  outcomeCode: 'executed',
  emergencyDisabled: false,
  ...over
})

function stored(over: Record<string, unknown> = {}) {
  const value = payload(over)
  return {
    actor_user_id: value.actorUserId,
    correlation_id: value.correlationId,
    session_digest: value.sessionDigest,
    channel: value.channel,
    route_or_tool: value.routeOrTool,
    phase: value.phase,
    tenant_id: value.tenantId,
    client_id: value.clientId,
    entity_type: value.entityType,
    entity_id: value.entityId,
    bypassed_controls: value.bypassedControls,
    outcome_code: value.outcomeCode,
    emergency_disabled: value.emergencyDisabled
  }
}

describe('God mode audit terminal queue consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.appendGodModeAuditEvent.mockResolvedValue(undefined)
  })

  it('persists the strict terminal payload through the dedicated recovery handler', async () => {
    const terminal = payload()
    await processJob({ type: 'god-mode.audit-terminal', payload: terminal } as any)
    expect(mocks.appendGodModeAuditEvent).toHaveBeenCalledWith(terminal)
  })

  it('treats an exact at-least-once duplicate as delivered', async () => {
    mocks.appendGodModeAuditEvent.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }))
    mocks.queryOneFresh.mockResolvedValue(stored())
    await expect(processJob({ type: 'god-mode.audit-terminal', payload: payload() } as any)).resolves.toBeUndefined()
  })

  it.each([
    ['success versus failure', { phase: 'failed', outcomeCode: 'executor_failed' }],
    ['actor mismatch', { actorUserId: '44444444-4444-4444-8444-444444444444' }],
    ['route mismatch', { routeOrTool: 'POST /api/agency/ai/other' }],
    ['session digest mismatch', { sessionDigest: 'b'.repeat(64) }],
    ['control mismatch', { bypassedControls: ['confirmation', 'budget'] }]
  ])('rejects a correlation collision with %s for retry/DLQ visibility', async (_label, conflicting) => {
    mocks.appendGodModeAuditEvent.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }))
    mocks.queryOneFresh.mockResolvedValue(stored())
    await expect(processJob({ type: 'god-mode.audit-terminal', payload: payload(conflicting) } as any))
      .rejects.toThrow('duplicate')
  })
})
