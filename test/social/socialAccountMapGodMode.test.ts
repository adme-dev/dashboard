import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'

import {
  isSocialAccountMapPath,
  registerGodModeSocialAccountMapMutationFamily
} from '../../server/utils/social/accountMapGodMode'
import {
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '../../server/utils/godMode/featureGate'

const ROUTE = '/api/agency/social/spend/map-account'
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'

function event(path: string): H3Event {
  const request = {
    method: 'POST',
    req: new Request(`https://app.xeroflow.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        connectionId: '87d6e44f-e6a0-47d1-9a32-27ade143b538',
        clientId: 'ef849136-7368-4650-bf89-853cbfa6a24a'
      })
    }),
    body: {
      connectionId: '87d6e44f-e6a0-47d1-9a32-27ade143b538',
      clientId: 'ef849136-7368-4650-bf89-853cbfa6a24a'
    },
    context: { user: { id: ACTOR_ID } },
    node: {
      req: { url: path, originalUrl: path, headers: { host: 'app.xeroflow.test' }, connection: {} },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as unknown as H3Event
  seedGodModeRouteAuditState(request, {
    actorUserId: ACTOR_ID,
    correlationId: '22222222-2222-4222-8222-222222222222',
    sessionDigest: 'a'.repeat(64),
    routeOrTool: `POST ${path}`,
    emergencyDisabled: false
  })
  return request
}

describe('Social account mapping God mode boundary', () => {
  it('matches only the account-level social mapping endpoint', () => {
    expect(isSocialAccountMapPath(ROUTE)).toBe(true)
    expect(isSocialAccountMapPath('/api/agency/social/google/map-client')).toBe(false)
    expect(isSocialAccountMapPath('/api/agency/social/spend/auto-map')).toBe(false)
  })

  it('requires a stable idempotency key before admitting an account mapping mutation', async () => {
    const unregister = registerGodModeSocialAccountMapMutationFamily()
    try {
      await expect(prepareRegisteredGodModeMutation(event(ROUTE))).rejects.toMatchObject({
        statusCode: 428,
        statusMessage: 'A stable Idempotency-Key header is required for God mode social account mapping'
      })
    } finally {
      unregister()
    }
  })

  it('routes the handler through the transaction-bound account mapping coordinator', () => {
    const route = readFileSync('server/api/agency/social/spend/map-account.post.ts', 'utf8')
    const plugin = readFileSync('server/plugins/godModeExecution.ts', 'utf8')

    expect(route).toContain('executeGodModeSocialAccountMap')
    expect(route).toContain(`requirePermission(event, 'MEDIA_BUYING')`)
    expect(route).toContain('requireSocialClientAccess(event, authorizedConnection.client_id)')
    expect(route).toContain('requireSocialClientAccess(event, clientId)')
    expect(route).toContain('currentConnection.client_id !== authorizedConnection.client_id')
    expect(plugin).toContain('registerGodModeSocialAccountMapMutationFamily()')
  })
})
