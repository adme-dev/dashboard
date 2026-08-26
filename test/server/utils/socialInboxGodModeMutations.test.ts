import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'

import {
  matchesSocialInboxExternalFamily,
  matchesSocialInboxTransactionFamily,
  registerGodModeSocialInboxMutationFamilies
} from '../../../server/utils/socialInbox/godModeMutations'
import {
  listRegisteredGodModeMutationFamilies,
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '../../../server/utils/godMode/featureGate'

const ID = '2c7a9f6e-3f4a-4e5d-9bac-8d9e0f1a2b33'
const BASE = '/api/agency/social/inbox'

function event(method: string, path: string) {
  const request = {
    method,
    req: new Request(`https://app.xeroflow.test${path}`, { method }),
    body: { clientId: '0a5e7d4c-1d2e-4c3b-9f8a-6b7c8d9e0f11' },
    context: { user: { id: '11111111-1111-4111-8111-111111111111' } },
    node: {
      req: { url: path, originalUrl: path, method, headers: { host: 'app.xeroflow.test' }, connection: {} },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as unknown as H3Event
  seedGodModeRouteAuditState(request, {
    actorUserId: '11111111-1111-4111-8111-111111111111',
    correlationId: '22222222-2222-4222-8222-222222222222',
    sessionDigest: 'a'.repeat(64),
    routeOrTool: `${method} ${path}`,
    emergencyDisabled: false
  })
  return request
}

describe('Social inbox God mode mutation families', () => {
  it('classifies every DB-only write route as a transaction family', () => {
    expect(matchesSocialInboxTransactionFamily('POST', `${BASE}/automation-rules`)).toBe('automation-rule-create')
    expect(matchesSocialInboxTransactionFamily('PATCH', `${BASE}/automation-rules/${ID}`)).toBe('automation-rule-update')
    expect(matchesSocialInboxTransactionFamily('DELETE', `${BASE}/automation-rules/${ID}`)).toBe('automation-rule-delete')
    expect(matchesSocialInboxTransactionFamily('POST', `${BASE}/saved-replies`)).toBe('saved-reply-create')
    expect(matchesSocialInboxTransactionFamily('PATCH', `${BASE}/saved-replies/${ID}`)).toBe('saved-reply-update')
    expect(matchesSocialInboxTransactionFamily('DELETE', `${BASE}/saved-replies/${ID}`)).toBe('saved-reply-delete')
    expect(matchesSocialInboxTransactionFamily('POST', `${BASE}/sla-policies`)).toBe('sla-policy-create')
    expect(matchesSocialInboxTransactionFamily('PATCH', `${BASE}/sla-policies/${ID}`)).toBe('sla-policy-update')
    expect(matchesSocialInboxTransactionFamily('DELETE', `${BASE}/sla-policies/${ID}`)).toBe('sla-policy-delete')
    expect(matchesSocialInboxTransactionFamily('PATCH', `${BASE}/conversations/${ID}`)).toBe('conversation-update')
    expect(matchesSocialInboxTransactionFamily('PATCH', `${BASE}/conversations/${ID}/native-links`)).toBe('conversation-native-links')
    expect(matchesSocialInboxTransactionFamily('POST', `${BASE}/conversations/${ID}/note`)).toBe('conversation-note')
    expect(matchesSocialInboxTransactionFamily('POST', `${BASE}/conversations/${ID}/client-approval`)).toBe('conversation-client-approval')
    expect(matchesSocialInboxTransactionFamily('POST', `${BASE}/conversations/${ID}/ai-actions/propose`)).toBe('ai-action-propose')
    expect(matchesSocialInboxTransactionFamily('POST', `${BASE}/response-queue/${ID}/reject`)).toBe('response-queue-reject')
  })

  it('classifies every provider-touching write route as an external-ledger family', () => {
    expect(matchesSocialInboxExternalFamily('POST', `${BASE}/accounts/sync`)).toBe('accounts-sync')
    expect(matchesSocialInboxExternalFamily('POST', `${BASE}/conversations/${ID}/reply`)).toBe('conversation-reply')
    expect(matchesSocialInboxExternalFamily('POST', `${BASE}/response-queue/${ID}/approve`)).toBe('response-queue-approve')
    expect(matchesSocialInboxExternalFamily('POST', `${BASE}/conversations/${ID}/ai-draft`)).toBe('ai-draft')
    expect(matchesSocialInboxExternalFamily('POST', `${BASE}/conversations/${ID}/ai-triage`)).toBe('ai-triage')
    expect(matchesSocialInboxExternalFamily('POST', `${BASE}/conversations/${ID}/ai-actions/confirm`)).toBe('ai-action-confirm')
    expect(matchesSocialInboxExternalFamily('POST', `${BASE}/conversations/${ID}/typing`)).toBe('typing')
  })

  it('does not claim reads, publishing routes, or look-alike paths', () => {
    expect(matchesSocialInboxTransactionFamily('GET', `${BASE}/conversations/${ID}`)).toBeNull()
    expect(matchesSocialInboxTransactionFamily('PATCH', `${BASE}/conversations/not-a-uuid`)).toBeNull()
    expect(matchesSocialInboxTransactionFamily('POST', `${BASE}/conversations/${ID}/reply`)).toBeNull()
    expect(matchesSocialInboxTransactionFamily('POST', '/api/agency/social/publishing/accounts/complete')).toBeNull()
    expect(matchesSocialInboxExternalFamily('POST', `${BASE}/conversations/${ID}/reply/extra`)).toBeNull()
    expect(matchesSocialInboxExternalFamily('GET', `${BASE}/accounts/sync`)).toBeNull()
    expect(matchesSocialInboxExternalFamily('POST', `${BASE}/conversations/${ID}/note`)).toBeNull()
  })

  it('never lets one route match both a transaction and an external family', () => {
    const paths = [
      `${BASE}/accounts/sync`, `${BASE}/automation-rules`, `${BASE}/automation-rules/${ID}`,
      `${BASE}/saved-replies`, `${BASE}/saved-replies/${ID}`, `${BASE}/sla-policies`, `${BASE}/sla-policies/${ID}`,
      `${BASE}/conversations/${ID}`, `${BASE}/conversations/${ID}/native-links`, `${BASE}/conversations/${ID}/note`,
      `${BASE}/conversations/${ID}/client-approval`, `${BASE}/conversations/${ID}/reply`, `${BASE}/conversations/${ID}/typing`,
      `${BASE}/conversations/${ID}/ai-draft`, `${BASE}/conversations/${ID}/ai-triage`,
      `${BASE}/conversations/${ID}/ai-actions/propose`, `${BASE}/conversations/${ID}/ai-actions/confirm`,
      `${BASE}/response-queue/${ID}/approve`, `${BASE}/response-queue/${ID}/reject`
    ]
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      for (const path of paths) {
        const both = matchesSocialInboxTransactionFamily(method, path) && matchesSocialInboxExternalFamily(method, path)
        expect(both, `${method} ${path}`).toBeFalsy()
      }
    }
  })

  it('registers one family per write route and requires an Idempotency-Key for owners', async () => {
    const before = listRegisteredGodModeMutationFamilies().length
    const unregister = registerGodModeSocialInboxMutationFamilies()
    try {
      expect(listRegisteredGodModeMutationFamilies().length - before).toBe(22)

      await expect(prepareRegisteredGodModeMutation(
        event('POST', `${BASE}/accounts/sync`)
      )).rejects.toMatchObject({ statusCode: 428 })

      await expect(prepareRegisteredGodModeMutation(
        event('PATCH', `${BASE}/conversations/${ID}`)
      )).rejects.toMatchObject({ statusCode: 428 })

      await expect(prepareRegisteredGodModeMutation(
        event('DELETE', `${BASE}/saved-replies/${ID}`)
      )).rejects.toMatchObject({ statusCode: 428 })
    } finally {
      unregister()
    }
    expect(listRegisteredGodModeMutationFamilies().length).toBe(before)
  })
})
