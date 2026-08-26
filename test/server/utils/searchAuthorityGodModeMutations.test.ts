import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'

import {
  matchesSearchAuthorityExternalFamily,
  matchesSearchAuthorityTransactionFamily,
  registerGodModeSearchAuthorityMutationFamilies
} from '../../../server/utils/searchAuthority/godModeMutations'
import {
  listRegisteredGodModeMutationFamilies,
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '../../../server/utils/godMode/featureGate'

const ASSET = '2c7a9f6e-3f4a-4e5d-9bac-8d9e0f1a2b33'
const BASE = '/api/agency/search-authority'

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

describe('Search Authority God mode mutation families', () => {
  it('classifies every DB-only write route as a transaction family', () => {
    expect(matchesSearchAuthorityTransactionFamily('POST', `${BASE}/content`)).toBe('asset-create')
    expect(matchesSearchAuthorityTransactionFamily('POST', `${BASE}/content/${ASSET}/versions`)).toBe('version-create')
    expect(matchesSearchAuthorityTransactionFamily('POST', `${BASE}/content/${ASSET}/submit`)).toBe('version-submit')
    expect(matchesSearchAuthorityTransactionFamily('POST', `${BASE}/content/${ASSET}/approve`)).toBe('version-approve')
    expect(matchesSearchAuthorityTransactionFamily('POST', `${BASE}/content/${ASSET}/reject`)).toBe('version-reject')
    expect(matchesSearchAuthorityTransactionFamily('PUT', `${BASE}/menu/config`)).toBe('menu-config')
    expect(matchesSearchAuthorityTransactionFamily('POST', `${BASE}/sites`)).toBe('site-configure')
    expect(matchesSearchAuthorityTransactionFamily('PATCH', `${BASE}/opportunities/${ASSET}`)).toBe('opportunity-transition')
    expect(matchesSearchAuthorityTransactionFamily('DELETE', `${BASE}/google/disconnect`)).toBe('google-disconnect')
  })

  it('classifies every provider-touching write route as an external-ledger family', () => {
    expect(matchesSearchAuthorityExternalFamily('POST', `${BASE}/content/${ASSET}/publish`)).toBe('publish')
    expect(matchesSearchAuthorityExternalFamily('POST', `${BASE}/content/${ASSET}/rollback`)).toBe('rollback')
    expect(matchesSearchAuthorityExternalFamily('POST', `${BASE}/sync`)).toBe('sync')
    expect(matchesSearchAuthorityExternalFamily('POST', `${BASE}/trust/refresh`)).toBe('trust-refresh')
    expect(matchesSearchAuthorityExternalFamily('POST', `${BASE}/google/map`)).toBe('google-map')
    expect(matchesSearchAuthorityExternalFamily('POST', `${BASE}/opportunities/${ASSET}/task-link`)).toBe('opportunity-task-link')
    expect(matchesSearchAuthorityExternalFamily('POST', `${BASE}/trust/findings/${ASSET}/task-link`)).toBe('finding-task-link')
  })

  it('does not claim reads, portal routes, or look-alike paths', () => {
    expect(matchesSearchAuthorityTransactionFamily('GET', `${BASE}/content`)).toBeNull()
    expect(matchesSearchAuthorityTransactionFamily('POST', `${BASE}/content/not-a-uuid/approve`)).toBeNull()
    expect(matchesSearchAuthorityTransactionFamily('POST', `/api/portal/search-authority/content/${ASSET}/decision`)).toBeNull()
    expect(matchesSearchAuthorityExternalFamily('POST', `${BASE}/content/${ASSET}/publish/extra`)).toBeNull()
    expect(matchesSearchAuthorityExternalFamily('GET', `${BASE}/sync`)).toBeNull()
  })

  it('registers one family per write route and requires an Idempotency-Key for owners', async () => {
    const before = listRegisteredGodModeMutationFamilies().length
    const unregister = registerGodModeSearchAuthorityMutationFamilies()
    try {
      expect(listRegisteredGodModeMutationFamilies().length - before).toBe(16)

      await expect(prepareRegisteredGodModeMutation(
        event('POST', `${BASE}/content/${ASSET}/approve`)
      )).rejects.toMatchObject({ statusCode: 428 })

      await expect(prepareRegisteredGodModeMutation(
        event('POST', `${BASE}/content/${ASSET}/publish`)
      )).rejects.toMatchObject({ statusCode: 428 })

      await expect(prepareRegisteredGodModeMutation(
        event('PUT', `${BASE}/menu/config`)
      )).rejects.toMatchObject({ statusCode: 428 })
    } finally {
      unregister()
    }
    expect(listRegisteredGodModeMutationFamilies().length).toBe(before)
  })
})
