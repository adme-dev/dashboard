import { readFileSync } from 'node:fs'
import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'

import {
  isMeasurementDestinationCreatePath,
  isMeasurementProfileUpdatePath,
  registerGodModeMeasurementConfigurationMutationFamilies
} from '../../../server/utils/measurement/configurationGodMode'
import {
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '../../../server/utils/godMode/featureGate'

const CLIENT_ID = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'

function event(method: 'PUT' | 'POST', route: string): H3Event {
  const request = {
    method,
    body: { expectedVersion: 1, reason: 'Configure measurement' },
    context: { user: { id: ACTOR_ID } },
    node: {
      req: {
        originalUrl: route,
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
    routeOrTool: `${method} ${route}`,
    emergencyDisabled: false
  })
  return request
}

describe('measurement configuration God mode mutation boundary', () => {
  const profileRoute = `/api/agency/measurement/clients/${CLIENT_ID}/profile`
  const destinationRoute = `/api/agency/measurement/clients/${CLIENT_ID}/destinations`

  it('matches only the exact client-scoped configuration routes', () => {
    expect(isMeasurementProfileUpdatePath(profileRoute)).toBe(true)
    expect(isMeasurementProfileUpdatePath(`${profileRoute}/extra`)).toBe(false)
    expect(isMeasurementProfileUpdatePath('/api/agency/measurement/clients/not-a-uuid/profile')).toBe(false)

    expect(isMeasurementDestinationCreatePath(destinationRoute)).toBe(true)
    expect(isMeasurementDestinationCreatePath(`${destinationRoute}/extra`)).toBe(false)
    expect(isMeasurementDestinationCreatePath(`/api/agency/measurement/clients/${CLIENT_ID}/google-conversion-actions`)).toBe(false)
  })

  it.each([
    ['PUT', profileRoute, 'measurement profile update'],
    ['POST', destinationRoute, 'measurement destination creation']
  ] as const)('requires a stable idempotency key for %s %s', async (method, route, mutationName) => {
    const unregister = registerGodModeMeasurementConfigurationMutationFamilies()
    try {
      await expect(prepareRegisteredGodModeMutation(event(method, route))).rejects.toMatchObject({
        statusCode: 428,
        statusMessage: `A stable Idempotency-Key header is required for God mode ${mutationName}`
      })
    } finally {
      unregister()
    }
  })

  it('routes both handlers through transaction-bound runtimes and registers the families', () => {
    const profileRouteSource = readFileSync(
      'server/api/agency/measurement/clients/[clientId]/profile.put.ts',
      'utf8'
    )
    const destinationRouteSource = readFileSync(
      'server/api/agency/measurement/clients/[clientId]/destinations/index.post.ts',
      'utf8'
    )
    const plugin = readFileSync('server/plugins/godModeExecution.ts', 'utf8')

    expect(profileRouteSource).toContain('executeGodModeMeasurementProfileUpdate')
    expect(profileRouteSource).toContain('createMeasurementProfileRuntime(event, db)')
    expect(destinationRouteSource).toContain('executeGodModeMeasurementDestinationCreate')
    expect(destinationRouteSource).toContain('createMeasurementDestinationRuntime(event, db)')
    expect(plugin).toContain('registerGodModeMeasurementConfigurationMutationFamilies()')
  })
})
