import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { searchCrm, type CrmSearchDeps } from '~~/server/utils/ai/tools/searchCrm'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const ctx: ToolContext = {
  userId: 'staff-3',
  userRole: 'member',
  event: { context: {} } as never
}
const context: CrmSearchContext = {
  organisationScopeId: 'server-organisation',
  clientId: CLIENT_ID,
  correlationId: 'server-correlation',
  actorType: 'staff',
  actorId: ctx.userId,
  surface: 'agency_ai',
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped: false },
  assistantScope: { clientIds: [CLIENT_ID], sourceRevision: 'assignment-r3' }
}
const safeHit = {
  type: 'company' as const,
  id: 'company-1',
  title: 'Acme',
  subtitle: 'Current Postgres subtitle',
  rank: 0.42,
  providerMetadata: { sourceText: 'must never leave the tool' },
  score: 0.99
}

function dependencies(retrieval: unknown): CrmSearchDeps {
  return {
    resolveContext: vi.fn().mockResolvedValue({
      status: 'resolved',
      context,
      clientName: 'Acme'
    }),
    createRetrievalDependencies: vi.fn().mockReturnValue({ boundary: 'direct' }),
    retrieveCrm: vi.fn().mockResolvedValue(retrieval)
  } as CrmSearchDeps
}

describe('search_crm direct assist mapping', () => {
  it.each([
    ['keyword', { results: [safeHit], mode: 'keyword' }],
    ['assist', { results: [safeHit], mode: 'assist' }],
    ['provider fallback', {
      results: [safeHit],
      mode: 'keyword',
      fallbackReason: 'provider'
    }]
  ])('maps %s retrieval to the same compact successful ToolResult', async (_label, retrieval) => {
    const deps = dependencies(retrieval)

    await expect(searchCrm({ clientName: 'Acme', query: 'renewal', limit: 20 }, ctx, deps))
      .resolves.toEqual({
        ok: true,
        data: {
          client: 'Acme',
          results: [{
            type: 'company',
            id: 'company-1',
            title: 'Acme',
            subtitle: 'Current Postgres subtitle'
          }],
          more: 0
        }
      })

    const serialized = JSON.stringify(await searchCrm(
      { clientName: 'Acme', query: 'renewal', limit: 20 },
      ctx,
      deps
    ))
    expect(serialized).not.toMatch(/providerMetadata|sourceText|score|rank|fallbackReason/u)
  })

  it('uses the authenticated event to create direct dependencies without internal HTTP', async () => {
    const deps = dependencies({ results: [], mode: 'keyword' })

    await searchCrm({ clientName: 'Acme', query: 'renewal', limit: 20 }, ctx, deps)

    expect(deps.createRetrievalDependencies).toHaveBeenCalledWith(ctx.event)
    expect(deps.retrieveCrm).toHaveBeenCalledWith(context, {
      query: 'renewal',
      limit: 20,
      semanticEligible: true
    }, { boundary: 'direct' })
    const source = await readFile('server/utils/ai/tools/searchCrm.ts', 'utf8')
    expect(source).not.toMatch(/\$fetch|useFetch|\/api\/crm\/search/u)
  })

  it('returns a recoverable ToolResult when primary keyword retrieval fails without leaking details', async () => {
    const deps = dependencies(null)
    deps.retrieveCrm = vi.fn().mockRejectedValue(
      new Error('crm_people private renewal query failed')
    )

    const result = await searchCrm({
      clientName: 'Acme',
      query: 'private renewal query',
      limit: 20
    }, ctx, deps)

    expect(result.ok).toBe(false)
    expect((result as { error: string }).error)
      .not.toMatch(/crm_people|private renewal query|server-organisation/u)
  })
})
