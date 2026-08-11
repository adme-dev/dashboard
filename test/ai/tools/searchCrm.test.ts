import { describe, expect, it, vi } from 'vitest'
import {
  searchCrm,
  searchCrmTool,
  type CrmSearchDeps
} from '~~/server/utils/ai/tools/searchCrm'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'
import type { CrmSearchHit } from '~~/server/utils/crm/search'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: { context: {} } as never }
const context: CrmSearchContext = {
  organisationScopeId: 'org-1',
  clientId: '11111111-1111-4111-8111-111111111111',
  correlationId: 'correlation-1',
  actorType: 'staff',
  actorId: 'u1',
  surface: 'agency_ai',
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped: false },
  assistantScope: { clientIds: ['11111111-1111-4111-8111-111111111111'], sourceRevision: 'r1' }
}
const hits = (count: number): CrmSearchHit[] => Array.from({ length: count }, (_, index) => ({
  type: 'person',
  id: `p${index}`,
  title: `Person ${index}`,
  subtitle: `note ${index}`,
  rank: 1
}))
const retrievalDependencies = { boundary: 'retrieval-dependencies' } as never

function resolvedDeps(retrieve = vi.fn().mockResolvedValue({
  results: hits(8),
  mode: 'assist'
})): CrmSearchDeps {
  return {
    resolveContext: vi.fn().mockResolvedValue({ status: 'resolved', context, clientName: 'Acme' }),
    createRetrievalDependencies: vi.fn().mockReturnValue(retrievalDependencies),
    retrieveCrm: retrieve
  } as CrmSearchDeps
}

describe('search_crm', () => {
  it('uses the fresh agency-AI context and direct authorized retrieval coordinator', async () => {
    const deps = resolvedDeps()
    const result = await searchCrm({ clientName: 'Acme', query: 'jo', limit: 5 }, ctx, deps)

    expect(result).toEqual({
      ok: true,
      data: {
        client: 'Acme',
        results: hits(5).map(({ rank: _rank, ...hit }) => hit),
        more: 3
      }
    })
    expect(deps.resolveContext).toHaveBeenCalledWith(ctx, {
      clientSelector: 'Acme',
      surface: 'agency_ai'
    })
    expect(deps.createRetrievalDependencies).toHaveBeenCalledWith(ctx.event)
    expect(deps.retrieveCrm).toHaveBeenCalledWith(context, {
      query: 'jo',
      limit: 5,
      semanticEligible: true
    }, retrievalDependencies)
  })

  it('resolves only the normalized NFKC client selector', async () => {
    const deps = resolvedDeps()
    await searchCrm({ clientName: '  Ａcme\u202e\tﬃ  Group ', query: 'jo', limit: 5 }, ctx, deps)

    expect(deps.resolveContext).toHaveBeenCalledWith(ctx, {
      clientSelector: 'Acme ffi Group',
      surface: 'agency_ai'
    })
  })

  it('returns a generic failure without resolving or retrieving for an invalid normalized selector', async () => {
    const resolveContext = vi.fn()
    const retrieveCrm = vi.fn()
    const result = await searchCrm({ clientName: 'ﬃ'.repeat(54), query: 'private', limit: 5 }, ctx, {
      resolveContext,
      createRetrievalDependencies: vi.fn(),
      retrieveCrm
    } as CrmSearchDeps)

    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).not.toContain('ﬃ')
    expect(resolveContext).not.toHaveBeenCalled()
    expect(retrieveCrm).not.toHaveBeenCalled()
  })

  it.each(['not_found', 'ambiguous', 'scope_unavailable'] as const)(
    'returns a non-disclosing failure for %s client resolution',
    async (status) => {
      const retrieveCrm = vi.fn()
      const deps: CrmSearchDeps = {
        resolveContext: vi.fn().mockResolvedValue({ status }),
        createRetrievalDependencies: vi.fn(),
        retrieveCrm
      } as CrmSearchDeps
      const result = await searchCrm({ clientName: 'Secret Client', query: 'x', limit: 20 }, ctx, deps)

      expect(result.ok).toBe(false)
      expect((result as { error: string }).error).not.toContain('Secret Client')
      expect(retrieveCrm).not.toHaveBeenCalled()
    }
  )

  it('keeps privacy-classified identifiers available to direct keyword search', async () => {
    const deps = resolvedDeps(vi.fn().mockResolvedValue({ results: [], mode: 'keyword', fallbackReason: 'privacy' }))
    await searchCrm({ clientName: 'Acme', query: 'user@example.com', limit: 20 }, ctx, deps)
    expect(deps.retrieveCrm).toHaveBeenCalledWith(context, {
      query: 'user@example.com',
      limit: 20,
      semanticEligible: false
    }, retrievalDependencies)
  })

  it('returns a recoverable generic error without echoing query or storage details', async () => {
    const deps = resolvedDeps(vi.fn().mockRejectedValue(new Error('tenant table crm_people failed')))
    const result = await searchCrm({ clientName: 'Acme', query: 'private query', limit: 20 }, ctx, deps)

    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).not.toMatch(/private query|crm_people|tenant/i)
  })

  it('bounds queries and remains read-only, untrusted, and CLIENTS-authorized', () => {
    expect(searchCrmTool.parameters.safeParse({ clientName: 'Acme', query: 'x'.repeat(257), limit: 20 }).success).toBe(false)
    expect(searchCrmTool.mutates).toBeUndefined()
    expect(searchCrmTool.returnsUntrusted).toBe(true)
    expect(searchCrmTool.requiredPermission).toBe('CLIENTS')
  })
})
