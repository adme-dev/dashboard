import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

const apiRoot = new URL('../../../server/api/admin/crm-search/', import.meta.url)

const readRoutes = [
  'health.get.ts',
  'policies/index.get.ts',
  'dead-letters/index.get.ts',
  'approvals/index.get.ts',
  'telemetry.get.ts',
  'evaluations/[id].get.ts'
] as const

const mutationRoutes = [
  'policies/[clientId].put.ts',
  'global-control.put.ts',
  'backfills.post.ts',
  'reconcile.post.ts',
  'dead-letters/[id].post.ts',
  'approvals/index.post.ts',
  'approvals/import.post.ts',
  'approvals/[id]/revoke.post.ts',
  'evaluations/index.post.ts'
] as const

async function readRoute(path: string) {
  return await readFile(new URL(path, apiRoot), 'utf8')
}

describe('CRM search admin API authorization boundary', () => {
  it.each([...readRoutes, ...mutationRoutes])('%s requires the shared fresh ADMIN authority boundary', async (path) => {
    const source = await readRoute(path)

    expect(source).toContain('requireFreshCrmSearchAdmin')
    expect(source).not.toMatch(/requireRole\s*\(|event\.context\.(?:org|organization)|ToolContext/i)
  })

  it('authorizes from the authenticated actor and a fresh server-owned organization before reading a mutation body', async () => {
    const { createGlobalControlHandler } = await import(
      '~~/server/api/admin/crm-search/global-control.put'
    )
    const order: string[] = []
    const transitionGlobalControl = vi.fn().mockResolvedValue({ state: 'halted', revision: 8 })
    const handler = createGlobalControlHandler({
      requireFreshAdmin: vi.fn().mockImplementation(async () => {
        order.push('fresh-admin')
        return {
          actorId: '10000000-0000-4000-8000-000000000001',
          orgId: '20000000-0000-4000-8000-000000000001',
          permissions: ['ADMIN'],
          authorityRevision: 'fresh-8'
        }
      }),
      readValidatedBody: vi.fn().mockImplementation(async () => {
        order.push('body')
        return {
          nextState: 'halted',
          expectedRevision: 7,
          approvalId: 'approval-16',
          reason: 'Provider incident',
          confirmation: 'HALT CRM SEARCH'
        }
      }),
      setResponseHeader: vi.fn(),
      transitionGlobalControl
    })

    await expect(handler({
      context: {
        user: { id: '10000000-0000-4000-8000-000000000001' },
        org: { id: 'attacker-org' }
      }
    } as never)).resolves.toMatchObject({ state: 'halted', revision: 8 })

    expect(order).toEqual(['fresh-admin', 'body'])
    expect(transitionGlobalControl).toHaveBeenCalledWith(expect.objectContaining({
      actorId: '10000000-0000-4000-8000-000000000001',
      orgId: '20000000-0000-4000-8000-000000000001',
      expectedRevision: 7
    }))
  })

  it.each(mutationRoutes)('%s accepts no client-supplied actor or organization authority', async (path) => {
    const source = await readRoute(path)

    expect(source).not.toMatch(/body\.(?:actor|actorId|org|orgId|organizationId)/)
    expect(source).not.toMatch(/input\.(?:actor|actorId|org|orgId|organizationId)/)
  })
})

describe('CRM search admin API command surface', () => {
  it.each(readRoutes)('%s returns private no-store operational data', async (path) => {
    const source = await readRoute(path)

    expect(source).toMatch(/setResponseHeader\([^)]*['"]cache-control['"][^)]*['"]private, no-store['"]/i)
  })

  it.each(mutationRoutes)('%s delegates to an audited operation command and never performs provider/deploy work', async (path) => {
    const source = await readRoute(path)

    expect(source).toMatch(/operations\/(?:commands|audit)|runAuditedCrmSearchCommand/)
    expect(source).not.toMatch(/\$fetch\s*\(|\bfetch\s*\(/)
    expect(source).not.toMatch(/wrangler|pages\s+deploy|deploy:production/i)
    expect(source).not.toMatch(/CRM_SEARCH_VECTORIZE|vectorize\.(?:query|insert|upsert)|AI\.run|env\.AI/i)
    expect(source).not.toMatch(/(?:queue|env\.[A-Z_]*QUEUE)\.(?:send|sendBatch)\s*\(/i)
  })

  it.each([
    ['global-control.put.ts', 'expectedRevision'],
    ['policies/[clientId].put.ts', 'expectedPolicyRevision'],
    ['dead-letters/[id].post.ts', 'expectedRevision'],
    ['dead-letters/[id].post.ts', 'expectedGeneration'],
    ['approvals/[id]/revoke.post.ts', 'expectedRevision']
  ] as const)('%s validates %s for CAS protection', async (path, revisionField) => {
    const source = await readRoute(path)

    expect(source).toContain(revisionField)
    expect(source).toMatch(/z\.(?:number|object)|safeParse|parse\(/)
  })

  it.each([
    'global-control.put.ts',
    'policies/[clientId].put.ts',
    'backfills.post.ts',
    'reconcile.post.ts',
    'dead-letters/[id].post.ts',
    'approvals/[id]/revoke.post.ts'
  ] as const)('%s requires a reason and exact typed confirmation', async (path) => {
    const source = await readRoute(path)

    expect(source).toContain('reason')
    expect(source).toContain('confirmation')
  })

  it('returns generic 409 refresh guidance for stale expected revisions', async () => {
    const { createClientPolicyHandler } = await import(
      '~~/server/api/admin/crm-search/policies/[clientId].put'
    )
    const handler = createClientPolicyHandler({
      requireFreshAdmin: vi.fn().mockResolvedValue({
        actorId: '10000000-0000-4000-8000-000000000001',
        orgId: '20000000-0000-4000-8000-000000000001',
        permissions: ['ADMIN']
      }),
      readValidatedBody: vi.fn().mockResolvedValue({
        nextState: 'shadow',
        expectedControlRevision: 7,
        expectedPolicyRevision: 3,
        approvalId: 'approval-shadow-16',
        reason: 'Approved staged rollout',
        confirmation: 'ENABLE CLIENT CRM SEARCH SHADOW'
      }),
      setResponseHeader: vi.fn(),
      transitionClientPolicy: vi.fn().mockRejectedValue({ code: 'crm_search_stale_revision' })
    })

    await expect(handler({ context: { params: { clientId: '40000000-0000-4000-8000-000000000001' } } } as never))
      .rejects.toMatchObject({
        statusCode: 409,
        statusMessage: 'CRM search state changed. Refresh before retrying.',
        data: { code: 'crm_search_stale_revision', action: 'refresh' }
      })
  })

  it('creates backfill/reconciliation work as pending durable requests, not synchronous results', async () => {
    for (const path of ['backfills.post.ts', 'reconcile.post.ts'] as const) {
      const source = await readRoute(path)
      expect(source).toMatch(/operationId|requestId/)
      expect(source).toMatch(/pending|scheduled/)
      expect(source).not.toMatch(/vectors|matches|providerResponse|completedSynchronously/)
    }
  })

  it('routes each dead-letter origin to only its accepted action', async () => {
    const source = await readRoute('dead-letters/[id].post.ts')

    expect(source).toContain('cloudflare_transport')
    expect(source).toContain('transport_retry')
    expect(source).toContain('provider_confirmation')
    expect(source).toContain('confirmation_reconcile')
    expect(source).toContain('crm_search_dead_letter_action_mismatch')
    expect(source).toContain('expectedGeneration')
  })

  it('returns 409 refresh guidance when exact dead-letter revision or generation changed', async () => {
    const { createCrmSearchDeadLetterActionHandler } = await import(
      '~~/server/api/admin/crm-search/dead-letters/[id].post'
    )
    const handler = createCrmSearchDeadLetterActionHandler({
      requireFreshAdmin: vi.fn().mockResolvedValue({
        actorId: '10000000-0000-4000-8000-000000000001',
        orgId: '20000000-0000-4000-8000-000000000001',
        permissions: ['ADMIN'],
        authorityRevision: 'fresh-8'
      }),
      getId: vi.fn().mockReturnValue('80000000-0000-4000-8000-000000000001'),
      readValidatedBody: vi.fn().mockResolvedValue({
        origin: 'provider_confirmation',
        action: 'confirmation_reconcile',
        expectedRevision: '2026-08-11T01:02:03.456789Z',
        expectedGeneration: 9,
        reason: 'Recover exact accepted provider mutation',
        confirmation: 'RECOVER CRM SEARCH DEAD LETTER'
      }),
      requestDurableRecovery: vi.fn().mockRejectedValue({ code: 'crm_search_dead_letter_changed' }),
      setResponseHeader: vi.fn(),
      setResponseStatus: vi.fn()
    })

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { code: 'crm_search_stale_revision', action: 'refresh' }
    })
  })

  it('limits bootstrap import to resource_provision while preserving original provenance', async () => {
    const source = await readRoute('approvals/import.post.ts')

    expect(source).toContain('resource_provision')
    expect(source).toContain('CRM_SEARCH_RESOURCE_APPROVAL_VERIFICATION_KEYRING')
    expect(source).toContain('verifyCrmSearchBootstrapApprovalEnvelope')
    expect(source).not.toMatch(/importedProvenanceHash\s*:/)
    expect(source).not.toMatch(/production_deploy|client_indexing|client_shadow|client_assist/)
  })
})
