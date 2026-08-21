import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'

import {
  isTrackingSiteCreatePath,
  registerGodModeTrackingSiteMutationFamily
} from '../../../server/utils/tracking/godModeMutations'
import {
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '../../../server/utils/godMode/featureGate'

const ROUTE = '/api/agency/tracking'
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'

function event(): H3Event {
  const request = {
    method: 'POST',
    body: { clientId: 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0', name: 'Knox LDV Website' },
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

describe('tracking site God mode mutation boundary', () => {
  it('matches only the exact tracking-site create route', () => {
    expect(isTrackingSiteCreatePath(ROUTE)).toBe(true)
    expect(isTrackingSiteCreatePath(`${ROUTE}/extra`)).toBe(false)
  })

  it('requires a stable idempotency key before admission', async () => {
    const unregister = registerGodModeTrackingSiteMutationFamily()
    try {
      await expect(prepareRegisteredGodModeMutation(event())).rejects.toMatchObject({
        statusCode: 428,
        statusMessage: 'A stable Idempotency-Key header is required for God mode tracking site creation'
      })
    } finally {
      unregister()
    }
  })

  it('routes creation through the transaction coordinator and registers the family', () => {
    const route = readFileSync('server/api/agency/tracking/index.post.ts', 'utf8')
    const plugin = readFileSync('server/plugins/godModeExecution.ts', 'utf8')

    expect(route).toContain('executeGodModeTrackingSiteCreate')
    expect(plugin).toContain('registerGodModeTrackingSiteMutationFamily()')
  })
})
