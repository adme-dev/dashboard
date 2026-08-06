import { describe, expect, it, vi } from 'vitest'
import { notifyGoogleAiMaxRun } from '~~/server/utils/googleAiMaxNotifications'

const recipients = [{ id: 'user-media' }, { id: 'user-owner' }]

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    isEnabled: () => true,
    listRecipients: vi.fn(async () => recipients),
    listEventCandidates: vi.fn(async () => [{
      stateId: 'state-1',
      campaignName: 'Generic Search',
      eventType: 'first_seen',
      readinessStatus: 'scheduled_upgrade',
      migrationReason: 'aca',
    }]),
    loadDigest: vi.fn(async () => ({ affected: 3, unknown: 1, needsReview: 2 })),
    claimDelivery: vi.fn(async () => true),
    markDelivered: vi.fn(async () => undefined),
    releaseDelivery: vi.fn(async () => undefined),
    createNotification: vi.fn(async () => ({ id: 'notification-1' })),
    ...overrides,
  }
}

describe('notifyGoogleAiMaxRun', () => {
  it('stays log-only until the production enable flag is explicitly armed', async () => {
    const deps = dependencies({ isEnabled: () => false })

    const result = await notifyGoogleAiMaxRun({
      tenantId: 'tenant-a', scanRunId: 'run-1', trigger: 'scheduled', effectiveDate: '2026-08-06',
    }, deps as any)

    expect(result).toEqual({ sent: 0, suppressed: 0, failed: 0 })
    expect(deps.listRecipients).not.toHaveBeenCalled()
  })

  it('notifies each media recipient once for a first affected observation', async () => {
    const deps = dependencies()
    const result = await notifyGoogleAiMaxRun({
      tenantId: 'tenant-a',
      scanRunId: 'run-1',
      trigger: 'manual',
      effectiveDate: '2026-08-06',
    }, deps as any)

    expect(result).toEqual({ sent: 2, suppressed: 0, failed: 0 })
    expect(deps.createNotification).toHaveBeenCalledTimes(2)
    expect(deps.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'system',
      title: 'Google AI Max migration detected',
      message: expect.stringContaining('Google-observed'),
      link: '/agency/social/google/ai-max?status=scheduled_upgrade',
      sendEmail: false,
    }))
    expect(deps.loadDigest).not.toHaveBeenCalled()
  })

  it('suppresses duplicate campaign/event/day deliveries', async () => {
    const deps = dependencies({ claimDelivery: vi.fn(async () => false) })

    const result = await notifyGoogleAiMaxRun({
      tenantId: 'tenant-a', scanRunId: 'run-1', trigger: 'manual', effectiveDate: '2026-08-06',
    }, deps as any)

    expect(result).toEqual({ sent: 0, suppressed: 2, failed: 0 })
    expect(deps.createNotification).not.toHaveBeenCalled()
  })

  it('sends one daily unresolved digest after a scheduled scan without per-scan noise', async () => {
    const deps = dependencies({ listEventCandidates: vi.fn(async () => []) })

    const result = await notifyGoogleAiMaxRun({
      tenantId: 'tenant-a', scanRunId: 'run-2', trigger: 'scheduled', effectiveDate: '2026-08-06',
    }, deps as any)

    expect(result.sent).toBe(2)
    expect(deps.createNotification).toHaveBeenCalledTimes(2)
    expect(deps.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: 'AI Max daily review',
      message: expect.stringContaining('3 affected'),
    }))
  })

  it('releases a delivery claim when notification creation fails', async () => {
    const releaseDelivery = vi.fn(async () => undefined)
    const deps = dependencies({
      listRecipients: vi.fn(async () => [{ id: 'user-media' }]),
      createNotification: vi.fn(async () => { throw new Error('notification table unavailable') }),
      releaseDelivery,
    })

    const result = await notifyGoogleAiMaxRun({
      tenantId: 'tenant-a', scanRunId: 'run-1', trigger: 'manual', effectiveDate: '2026-08-06',
    }, deps as any)

    expect(result.failed).toBe(1)
    expect(releaseDelivery).toHaveBeenCalledTimes(1)
  })
})
