import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGooglePmaxProviderWorker } from '../../../workers/google-pmax-provider/src/index'

const validRequest = {
  action: 'validate',
  config: { customerId: '1234567890', languages: ['en'] },
  connection: {
    id: 'connection-1', clientId: 'client-1', status: 'active', customerId: '1234567890',
    accessToken: 'access-secret', developerToken: 'developer-secret'
  }
}

function request(body: unknown, marker = 'google-pmax-provider-v1', path = '/v1/execute') {
  return new Request(`https://worker.internal${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-xeroflow-service': marker },
    body: JSON.stringify(body)
  })
}

describe('Google PMax provider Worker boundary', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not expose its operation endpoint without the private service marker', async () => {
    const response = await createGooglePmaxProviderWorker().fetch(request(validRequest, 'wrong'))
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ ok: false })
  })

  it('returns a sanitized provider error without echoing credentials or upstream details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream detail', { status: 500 })))
    const response = await createGooglePmaxProviderWorker().fetch(request(validRequest))
    const serialized = JSON.stringify(await response.json())

    expect(response.status).toBe(502)
    expect(serialized).toContain('PMAX_PROVIDER_FAILED')
    expect(serialized).not.toContain('access-secret')
    expect(serialized).not.toContain('developer-secret')
    expect(serialized).not.toContain('upstream detail')
  })

  it('runs deterministic decision checks without requiring provider credentials', async () => {
    const response = await createGooglePmaxProviderWorker().fetch(request({
      action: 'normalize',
      input: {
        brief: { id: '', version: 1, tenantId: '', clientId: '', status: 'draft', templateSlug: 'wrong' },
        fieldValues: {},
        provider: {
          selectedConnectionId: '', connectionId: '', selectedConversionActionIds: [], customerId: '',
          accountCurrency: '', accountTimezone: '',
          inventorySource: {
            linkId: '', providerId: '', selectedFeedId: '', feedId: '', platform: '', active: false
          },
          locations: [],
          assetGroup: {
            requiredAssetCoverageComplete: false,
            imageAssetResourceNames: [], logoAssetResourceNames: [], youtubeVideoAssetResourceNames: []
          },
          conversionGoals: []
        }
      }
    }, 'google-pmax-provider-v1', '/v1/decision'))
    const body = await response.json() as { ok: boolean, result: { ok: boolean } }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.result.ok).toBe(false)
  })

  it('fails closed for database-backed control-plane actions without Hyperdrive', async () => {
    for (const body of [
      { action: 'platform_evidence', input: { identity: {}, collectedAt: new Date().toISOString() } },
      { action: 'persist_evidence', input: { evidence: {} } },
      { action: 'sync_tasks', input: { preflightChecks: [], onboardingTasks: [] } }
    ]) {
      const response = await createGooglePmaxProviderWorker().fetch(
        request(body, 'google-pmax-provider-v1', '/v1/decision')
      )
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ ok: false })
    }
  })
})
