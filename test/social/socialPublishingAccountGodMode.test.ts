import { readFileSync } from 'node:fs'
import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'

import {
  isSocialPublishingAccountCompletePath,
  isSocialPublishingAccountDisconnectPath,
  registerGodModeSocialPublishingAccountMutationFamilies
} from '../../server/utils/social/publishingAccountGodMode'
import {
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '../../server/utils/godMode/featureGate'

const COMPLETE_ROUTE = '/api/agency/social/publishing/accounts/complete'
const ACCOUNT_ID = '64c90507-6131-4659-ac57-766e933d8c82'
const DISCONNECT_ROUTE = `/api/agency/social/publishing/accounts/${ACCOUNT_ID}`
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'

function event(method: 'POST' | 'DELETE', path: string): H3Event {
  const body = method === 'POST'
    ? { token: 'signed-selection', pageIds: ['202496791651565507'] }
    : undefined
  const request = {
    method,
    req: new Request(`https://app.xeroflow.test${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    }),
    body,
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
    routeOrTool: `${method} ${path}`,
    emergencyDisabled: false
  })
  return request
}

describe('Social publishing account God mode boundary', () => {
  it('matches only the exact selection completion and UUID disconnect routes', () => {
    expect(isSocialPublishingAccountCompletePath(COMPLETE_ROUTE)).toBe(true)
    expect(isSocialPublishingAccountCompletePath(`${COMPLETE_ROUTE}/extra`)).toBe(false)
    expect(isSocialPublishingAccountDisconnectPath(DISCONNECT_ROUTE)).toBe(true)
    expect(isSocialPublishingAccountDisconnectPath('/api/agency/social/publishing/accounts/not-a-uuid')).toBe(false)
    expect(isSocialPublishingAccountDisconnectPath('/api/agency/social/spend/map-account')).toBe(false)
  })

  it.each([
    ['POST', COMPLETE_ROUTE, 'social publishing account completion'],
    ['DELETE', DISCONNECT_ROUTE, 'social publishing account disconnection']
  ] as const)('requires a stable idempotency key for %s %s', async (method, path, mutationName) => {
    const unregister = registerGodModeSocialPublishingAccountMutationFamilies()
    try {
      await expect(prepareRegisteredGodModeMutation(event(method, path))).rejects.toMatchObject({
        statusCode: 428,
        statusMessage: `A stable Idempotency-Key header is required for God mode ${mutationName}`
      })
    } finally {
      unregister()
    }
  })

  it('routes handlers through transaction coordination and sends stable browser keys', () => {
    const complete = readFileSync('server/api/agency/social/publishing/accounts/complete.post.ts', 'utf8')
    const disconnect = readFileSync('server/api/agency/social/publishing/accounts/[id].delete.ts', 'utf8')
    const plugin = readFileSync('server/plugins/godModeExecution.ts', 'utf8')
    const page = readFileSync('app/pages/agency/social/publishing/accounts.vue', 'utf8')
    const inboxSettings = readFileSync('app/pages/agency/social/inbox/settings.vue', 'utf8')
    const composable = readFileSync('app/composables/useSocialPublishing.ts', 'utf8')

    expect(complete).toContain('executeGodModeSocialPublishingAccountComplete')
    expect(disconnect).toContain('executeGodModeSocialPublishingAccountDisconnect')
    expect(plugin).toContain('registerGodModeSocialPublishingAccountMutationFamilies()')
    expect(page).toContain('\'Idempotency-Key\': socialPublishingCompletionIdempotencyKey')
    expect(inboxSettings).toContain('\'Idempotency-Key\': socialPublishingCompletionIdempotencyKey')
    expect(composable).toContain('\'Idempotency-Key\': `social-publishing-account-disconnect:${id}`')
  })
})
