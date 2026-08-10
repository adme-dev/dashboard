import { describe, expect, it, vi } from 'vitest'
import {
  searchCrm,
  searchCrmTool,
  type CrmSearchDeps
} from '~~/server/utils/ai/tools/searchCrm'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ctx: ToolContext = {
  userId: 'staff-1',
  userRole: 'owner',
  event: { context: {} } as never
}
const canonicalContext: CrmSearchContext = {
  organisationScopeId: 'server-owned-organisation',
  clientId: CLIENT_ID,
  correlationId: 'server-owned-correlation',
  actorType: 'staff',
  actorId: ctx.userId,
  surface: 'agency_ai',
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped: true },
  assistantScope: { clientIds: [CLIENT_ID], sourceRevision: 'fresh-revision' }
}

function dependencies(resolution: unknown): CrmSearchDeps {
  return {
    resolveContext: vi.fn().mockResolvedValue(resolution),
    createRetrievalDependencies: vi.fn().mockReturnValue({ boundary: 'retrieval' }),
    retrieveCrm: vi.fn().mockResolvedValue({ results: [], mode: 'keyword' })
  } as CrmSearchDeps
}

describe('search_crm server-owned authorization', () => {
  it.each(['not_found', 'ambiguous', 'scope_unavailable'] as const)(
    'returns one non-disclosing result and performs no retrieval for %s resolution',
    async (status) => {
      const deps = dependencies({ status })

      await expect(searchCrm({
        clientName: 'Private Client',
        query: 'renewal',
        limit: 20
      }, ctx, deps)).resolves.toEqual({ ok: false, error: 'No matching client.' })

      expect(deps.retrieveCrm).not.toHaveBeenCalled()
      expect(deps.createRetrievalDependencies).not.toHaveBeenCalled()
    }
  )

  it('passes only the normalized selector and fixed agency-AI surface to fresh resolution', async () => {
    const deps = dependencies({
      status: 'resolved',
      context: canonicalContext,
      clientName: 'Server Acme'
    })

    await searchCrm({
      clientName: '  Ｓerver\tAcme\u202e ',
      query: 'renewal',
      limit: 20,
      clientId: 'model-client',
      organisationScopeId: 'model-organisation'
    } as never, ctx, deps)

    expect(deps.resolveContext).toHaveBeenCalledWith(ctx, {
      clientSelector: 'Server Acme',
      surface: 'agency_ai'
    })
    expect(deps.retrieveCrm).toHaveBeenCalledWith(
      canonicalContext,
      expect.objectContaining({ query: 'renewal' }),
      expect.anything()
    )
  })

  it.each([
    ['wrong surface', { ...canonicalContext, surface: 'agency_global' as const }],
    ['missing fresh assignment scope', { ...canonicalContext, assistantScope: undefined }],
    ['selected client outside assignment scope', {
      ...canonicalContext,
      assistantScope: {
        clientIds: ['22222222-2222-4222-8222-222222222222'],
        sourceRevision: 'fresh-revision'
      }
    }],
    ['actor mismatch', { ...canonicalContext, actorId: 'different-staff' }],
    ['missing CLIENTS permission', { ...canonicalContext, permissionSet: [] }]
  ])('fails closed before retrieval for a resolved context with %s', async (_label, context) => {
    const deps = dependencies({ status: 'resolved', context, clientName: 'Acme' })

    await expect(searchCrm({ clientName: 'Acme', query: 'renewal', limit: 20 }, ctx, deps))
      .resolves.toEqual({ ok: false, error: 'No matching client.' })

    expect(deps.retrieveCrm).not.toHaveBeenCalled()
    expect(deps.createRetrievalDependencies).not.toHaveBeenCalled()
  })

  it('bounds selector and query after normalization before authority or retrieval work', async () => {
    for (const input of [
      { clientName: `A${'ﬃ'.repeat(54)}`, query: 'renewal', limit: 20 },
      { clientName: 'Acme', query: `A${'ﬃ'.repeat(86)}`, limit: 20 }
    ]) {
      const deps = dependencies({
        status: 'resolved',
        context: canonicalContext,
        clientName: 'Acme'
      })

      const result = await searchCrm(input, ctx, deps)

      expect(result.ok).toBe(false)
      expect(deps.resolveContext).not.toHaveBeenCalled()
      expect(deps.retrieveCrm).not.toHaveBeenCalled()
    }
  })

  it('rejects model-supplied client and organisation authority fields at the tool schema', () => {
    expect(searchCrmTool.parameters.safeParse({
      clientName: 'Acme',
      query: 'renewal',
      clientId: CLIENT_ID
    }).success).toBe(false)
    expect(searchCrmTool.parameters.safeParse({
      clientName: 'Acme',
      query: 'renewal',
      organisationScopeId: 'model-owned'
    }).success).toBe(false)
  })

  it('applies selector and query limits to the normalized forms at schema admission', () => {
    expect(searchCrmTool.parameters.safeParse({
      clientName: 'ﬃ'.repeat(54),
      query: 'renewal'
    }).success).toBe(false)
    expect(searchCrmTool.parameters.safeParse({
      clientName: 'Acme',
      query: 'ﬃ'.repeat(86)
    }).success).toBe(false)
    expect(searchCrmTool.parameters.safeParse({
      clientName: 'Acme',
      query: `renewal${'\u202e'.repeat(257)}`
    }).success).toBe(true)
  })
})
