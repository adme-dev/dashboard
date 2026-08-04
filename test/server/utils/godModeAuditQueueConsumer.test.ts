import { describe, expect, it, vi } from 'vitest'

const appendGodModeAuditEvent = vi.fn().mockResolvedValue(undefined)
vi.mock('../../../server/utils/godMode/audit', () => ({ appendGodModeAuditEvent }))

import { processJob } from '../../../server/utils/queueConsumer'

describe('God mode audit terminal queue consumer', () => {
  it('persists the strict terminal payload through the dedicated recovery handler', async () => {
    const payload = {
      actorUserId: '11111111-1111-4111-8111-111111111111',
      correlationId: '22222222-2222-4222-8222-222222222222',
      sessionDigest: 'a'.repeat(64),
      channel: 'application',
      routeOrTool: 'GET /api/agency/clients',
      phase: 'succeeded',
      bypassedControls: [],
      outcomeCode: 'http_2xx',
      emergencyDisabled: false
    }

    await processJob({ type: 'god-mode.audit-terminal', payload } as any)

    expect(appendGodModeAuditEvent).toHaveBeenCalledOnce()
    expect(appendGodModeAuditEvent).toHaveBeenCalledWith(payload)
  })
})
