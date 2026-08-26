import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'

import { registerGodModeChatMutationFamily } from '../../../server/utils/ai/godModeMutationFamily'
import {
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '../../../server/utils/godMode/featureGate'

const ROUTE = '/api/agency/ai/chat/conversations'
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'

function event(): H3Event {
  const request = {
    method: 'POST',
    body: { title: 'Financial Advisor' },
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

describe('AI conversation creation God mode boundary', () => {
  it('admits the exact create route through the transaction coordinator', async () => {
    const unregister = registerGodModeChatMutationFamily()
    try {
      await expect(prepareRegisteredGodModeMutation(event())).rejects.toMatchObject({
        statusCode: 428,
        statusMessage: 'A stable Idempotency-Key header is required for God mode AI conversation creation'
      })
    } finally {
      unregister()
    }
  })
})
