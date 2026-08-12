import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { hashCanonicalLaunchJson } from '~~/server/utils/googlePmaxLaunchHash'
import {
  createGooglePmaxRemoteDecisionEngine,
  type GooglePmaxRemoteDecisionError
} from '~~/server/utils/googlePmaxRemoteDecisionEngine'

describe('Google PMax private decision engine client', () => {
  it('accepts only a hash-verified normalized config from the private binding', async () => {
    const config = { schemaVersion: 2, customerId: '1234567890' }
    const fetch = vi.fn().mockResolvedValue(Response.json({
      ok: true,
      result: { ok: true, value: { config, configHash: hashCanonicalLaunchJson(config) } }
    }))
    const engine = createGooglePmaxRemoteDecisionEngine({ context: {} } as H3Event, { fetch })

    await expect(engine.normalize({} as never)).resolves.toMatchObject({ ok: true })
    expect(fetch).toHaveBeenCalledWith(
      'https://google-pmax-provider.internal/v1/decision',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('fails closed for a mismatched config hash or missing binding', async () => {
    const invalid = createGooglePmaxRemoteDecisionEngine({ context: {} } as H3Event, {
      fetch: vi.fn().mockResolvedValue(Response.json({
        ok: true,
        result: { ok: true, value: { config: { schemaVersion: 2 }, configHash: '0'.repeat(64) } }
      }))
    })
    await expect(invalid.normalize({} as never)).rejects.toMatchObject<Partial<GooglePmaxRemoteDecisionError>>({
      code: 'PMAX_DECISION_SERVICE_RESPONSE_INVALID'
    })

    const unavailable = createGooglePmaxRemoteDecisionEngine({ context: {} } as H3Event)
    await expect(unavailable.onboarding({} as never)).rejects.toMatchObject<Partial<GooglePmaxRemoteDecisionError>>({
      code: 'PMAX_DECISION_SERVICE_UNAVAILABLE'
    })
  })

  it('validates private persistence and task-sync envelopes before trusting them', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({
        ok: true,
        result: {
          id: 'snapshot-1', evidenceHash: 'a'.repeat(64),
          collectedAt: '2026-08-07T10:00:00.000Z', isReplay: false
        }
      }))
      .mockResolvedValueOnce(Response.json({
        ok: true,
        result: { status: 'synced', created: 1, reopened: 0, cleared: 0, taskCount: 1 }
      }))
    const engine = createGooglePmaxRemoteDecisionEngine({ context: {} } as H3Event, { fetch })

    await expect(engine.persistEvidence({} as never)).resolves.toMatchObject({ id: 'snapshot-1' })
    await expect(engine.syncTasks({} as never)).resolves.toMatchObject({ status: 'synced', taskCount: 1 })
  })
})
