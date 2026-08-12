import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'

import {
  isCatalogSourceUpsertPath,
  registerGodModeCatalogSourceMutationFamily
} from '../../../../server/utils/crm/catalogSourceGodMode'
import {
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '../../../../server/utils/godMode/featureGate'

function event(path: string) {
  const request = {
    method: 'POST',
    req: new Request(`https://app.xeroflow.test${path}`, { method: 'POST' }),
    body: { client_id: 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0', connector_type: 'supabase' },
    context: { user: { id: '11111111-1111-4111-8111-111111111111' } },
    node: {
      req: { url: path, originalUrl: path, headers: { host: 'app.xeroflow.test' }, connection: {} },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as unknown as H3Event
  seedGodModeRouteAuditState(request, {
    actorUserId: '11111111-1111-4111-8111-111111111111',
    correlationId: '22222222-2222-4222-8222-222222222222',
    sessionDigest: 'a'.repeat(64),
    routeOrTool: `POST ${path}`,
    emergencyDisabled: false
  })
  return request
}

describe('Catalog source God mode mutation boundary', () => {
  it('matches only the agency CRM data-source upsert endpoint', () => {
    expect(isCatalogSourceUpsertPath('/api/crm/data-sources')).toBe(true)
    expect(isCatalogSourceUpsertPath('/api/client-portal/crm/data-sources')).toBe(false)
    expect(isCatalogSourceUpsertPath('/api/crm/data-sources/source-id/sync')).toBe(false)
  })

  it('requires a stable idempotency key before admitting the save', async () => {
    const unregister = registerGodModeCatalogSourceMutationFamily()
    try {
      await expect(prepareRegisteredGodModeMutation(
        event('/api/crm/data-sources')
      )).rejects.toMatchObject({
        statusCode: 428,
        statusMessage: 'A stable Idempotency-Key header is required for God mode catalog source connection'
      })
    } finally {
      unregister()
    }
  })
})
