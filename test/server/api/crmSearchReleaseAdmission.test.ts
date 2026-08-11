import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import {
  createCrmSearchApproval,
  scheduleCrmSearchBackfillCommand
} from '../../../server/utils/crm/search/operations/commands'
import { CRM_SEARCH_ORDINARY_CHANGE_APPROVAL_TYPES } from '../../../server/utils/crm/search/operations/contracts'

const actor = {
  actorId: '30000000-0000-4000-8000-000000000001',
  orgId: '20000000-0000-4000-8000-000000000001',
  permissions: ['ADMIN'], authorityRevision: 'fresh-1'
}
const digest = (value: string) => value.repeat(64)

describe('CRM search release and indexing admission', () => {
  it('rejects ordinary resource_provision creation before requester lookup or persistence', async () => {
    const endpoint = readFileSync(new URL(
      '../../../server/api/admin/crm-search/approvals/index.post.ts', import.meta.url
    ), 'utf8')
    expect(CRM_SEARCH_ORDINARY_CHANGE_APPROVAL_TYPES).not.toContain('resource_provision')
    expect(endpoint).toContain('CRM_SEARCH_ORDINARY_CHANGE_APPROVAL_TYPES')
    expect(endpoint).not.toMatch(/z\.enum\(\[[\s\S]*resource_provision/)

    const insert = vi.fn()
    const loadActiveRequester = vi.fn()
    await expect(createCrmSearchApproval({
      approvalType: 'resource_provision', environment: 'preview',
      implementationGitSha: 'a'.repeat(40), artifactManifestDigest: digest('1'),
      bindingManifestDigest: digest('2'), evidenceBundleHash: digest('3'),
      maximumCostUsdMicros: 0,
      requestedByActorId: '10000000-0000-4000-8000-000000000001',
      reason: 'Attempt unsigned resource provisioning approval',
      expiresAt: '2026-08-12T00:00:00.000Z'
    }, actor, { insert, loadActiveRequester })).rejects.toThrow(
      'crm_search_resource_provision_import_required'
    )
    expect(loadActiveRequester).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('blocks client indexing approval at 90% durable dirty-row or operation capacity', async () => {
    const insert = vi.fn()
    const approval = {
      approvalType: 'client_indexing', environment: 'preview',
      implementationGitSha: 'a'.repeat(40), artifactManifestDigest: digest('1'),
      pagesBundleDigest: digest('2'), workerBundleDigest: digest('3'),
      bindingManifestDigest: digest('4'), evidenceBundleHash: digest('5'),
      loadProtocolDigest: digest('6'), providerContractDigest: digest('7'),
      rateCardId: '50000000-0000-4000-8000-000000000001',
      clientId: '60000000-0000-4000-8000-000000000001', maximumCostUsdMicros: 1,
      expectedControlRevision: 1, expectedPolicyRevision: 1,
      expectedDeploymentApprovalId: '40000000-0000-4000-8000-000000000001',
      targetSchemaVersion: 'crm-search-v1', requestedAction: 'enable_indexing',
      activeVectorCount: 1, candidateVectorCount: 0, retiringVectorCount: 0,
      sentinelVectorCount: 0, deletionPendingVectorCount: 0, forecastVectorCount: 1,
      vectorCapacity: 10, activeNamespaceCount: 1, candidateNamespaceCount: 0,
      retiringNamespaceCount: 0, sentinelNamespaceCount: 0,
      deletionPendingNamespaceCount: 0, forecastNamespaceCount: 1, namespaceCapacity: 10,
      requestedByActorId: '10000000-0000-4000-8000-000000000001',
      reason: 'Approve bounded isolated client indexing', expiresAt: '2026-08-12T00:00:00.000Z'
    }
    await expect(createCrmSearchApproval(approval, actor, {
      insert,
      loadActiveRequester: vi.fn().mockResolvedValue({
        actorId: approval.requestedByActorId, active: true
      }),
      loadDurableCapacity: vi.fn().mockResolvedValue({
        dirty: { used: 90_000, limit: 100_000 },
        operations: { used: 1, limit: 50_000 }
      })
    } as never)).rejects.toThrow('crm_search_dirty_operation_capacity_blocked')
    expect(insert).not.toHaveBeenCalled()
  })

  it('blocks backfill scheduling at 90% durable capacity before creating an operation', async () => {
    const createDurableOperation = vi.fn()
    await expect(scheduleCrmSearchBackfillCommand({
      actor,
      clientId: '60000000-0000-4000-8000-000000000001',
      expectedPolicyRevision: 1,
      reason: 'Schedule bounded client backfill',
      confirmation: 'SCHEDULE CRM SEARCH BACKFILL',
      loadDurableCapacity: vi.fn().mockResolvedValue({
        dirty: { used: 1, limit: 100_000 },
        operations: { used: 45_000, limit: 50_000 }
      }),
      createDurableOperation
    })).rejects.toThrow('crm_search_dirty_operation_capacity_blocked')
    expect(createDurableOperation).not.toHaveBeenCalled()
  })
})
