import { describe, expect, it, vi } from 'vitest'
import { portalFormContext } from '~~/server/utils/pageStudio/portalFormContext'
import type { ContentAuthorityRequest, PageStudioContentActor } from '~~/server/utils/pageStudio/businessContent'

const scope = { tenantId: 'tenant', clientId: 'client', businessId: 'business', siteId: 'site', environment: 'staging' as const }

describe('portal form authority adapter', () => {
  it.each([
    { role: 'client', actorId: 'customer', clientId: 'client' },
    { role: 'agency', actorId: 'staff', tenantId: 'tenant', canEdit: true }
  ] satisfies PageStudioContentActor[])('keeps the canonical authority tuple for $role', async (actor) => {
    const request: ContentAuthorityRequest = { actor, login: { role: actor.role, userId: actor.actorId, tokenHash: 'a'.repeat(64), issuedAt: new Date(), expiresAt: new Date(Date.now() + 60000) }, siteId: scope.siteId, env: {} }
    const authorize = vi.fn().mockResolvedValue({ scope, canEdit: true })
    const authority = await portalFormContext(request, { authorize }).authorize(false)
    expect(authorize).toHaveBeenCalledWith(request, false, { policyOnly: true })
    expect(JSON.parse(authority.authorityKey)).toEqual([actor.role, actor.actorId, actor.role === 'client' ? actor.clientId : null, scope.businessId, scope.clientId, scope.tenantId])
    expect(authority.actorId).toBe(actor.actorId)
  })
})
