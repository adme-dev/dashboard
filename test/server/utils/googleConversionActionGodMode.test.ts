import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'

import {
  isGoogleConversionActionProvisionPath,
  registerGodModeGoogleConversionActionMutationFamily
} from '../../../server/utils/measurement/googleConversionActionGodMode'
import {
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '../../../server/utils/godMode/featureGate'

const CLIENT_ID = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'
const ROUTE = `/api/agency/measurement/clients/${CLIENT_ID}/google-conversion-actions`
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'

function event(): H3Event {
  const request = {
    method: 'POST',
    body: {
      connectionId: '96ba2b11-ba1c-4e8f-b459-0f36f6aa8959',
      name: 'Stock Enquiry'
    },
    context: { user: { id: ACTOR_ID } },
    node: {
      req: {
        originalUrl: ROUTE,
        headers: { host: 'app.xeroflow.test' },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as unknown as H3Event
  seedGodModeRouteAuditState(request, {
    actorUserId: ACTOR_ID,
    correlationId: '22222222-2222-4222-8222-222222222222',
    sessionDigest: 'a'.repeat(64),
    routeOrTool: `POST ${ROUTE}`,
    emergencyDisabled: false
  })
  return request
}

describe('Google conversion action God mode mutation boundary', () => {
  it('matches only an exact client-scoped provisioning route', () => {
    expect(isGoogleConversionActionProvisionPath(ROUTE)).toBe(true)
    expect(isGoogleConversionActionProvisionPath(`${ROUTE}/extra`)).toBe(false)
    expect(isGoogleConversionActionProvisionPath('/api/agency/measurement/clients/not-a-uuid/google-conversion-actions')).toBe(false)
  })

  it('requires a stable idempotency key before admission', async () => {
    const unregister = registerGodModeGoogleConversionActionMutationFamily()
    try {
      await expect(prepareRegisteredGodModeMutation(event())).rejects.toMatchObject({
        statusCode: 428,
        statusMessage: 'A stable Idempotency-Key header is required for God mode Google conversion action provisioning'
      })
    } finally {
      unregister()
    }
  })

  it('routes provisioning through the coordinator and registers the family', () => {
    const route = readFileSync(
      'server/api/agency/measurement/clients/[clientId]/google-conversion-actions.post.ts',
      'utf8'
    )
    const plugin = readFileSync('server/plugins/godModeExecution.ts', 'utf8')

    expect(route).toContain('executeGodModeGoogleConversionActionProvision')
    expect(plugin).toContain('registerGodModeGoogleConversionActionMutationFamily()')
  })
})
