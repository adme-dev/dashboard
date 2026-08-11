import { describe, expect, it, vi } from 'vitest'
import { requireCrmSearchApproval } from '~~/server/utils/crm/searchIndex/approvalRepository'

const approvalId = '11111111-1111-4111-8111-111111111111'
const organisationScopeId = '22222222-2222-4222-8222-222222222222'
const clientId = '33333333-3333-4333-8333-333333333333'
const actorId = '44444444-4444-4444-8444-444444444444'

const required = {
  approvalId,
  approvalType: 'client_indexing' as const,
  environment: 'production' as const,
  organisationScopeId,
  scopeKind: 'client' as const,
  clientId,
  implementationGitSha: 'a'.repeat(40),
  artifactManifestDigest: 'b'.repeat(64),
  pagesBundleDigest: 'c'.repeat(64),
  workerBundleDigest: 'd'.repeat(64),
  bindingManifestDigest: 'e'.repeat(64),
  evidenceBundleHash: 'f'.repeat(64),
  expectedControlRevision: 7,
  expectedPolicyRevision: 9,
  expectedDeploymentApprovalId: '55555555-5555-4555-8555-555555555555',
  targetSchemaVersion: 'crm-search-v1',
  requestedAction: 'policy_indexing',
  maximumCostUsdMicros: 1000,
  transitionActorId: actorId,
  now: '2026-08-10T00:00:00.000Z'
}

const row = {
  id: approvalId,
  approval_type: 'client_indexing',
  environment: 'production',
  organisation_scope_id: organisationScopeId,
  scope_kind: 'client',
  client_id: clientId,
  implementation_git_sha: 'a'.repeat(40),
  artifact_manifest_digest: 'b'.repeat(64),
  pages_bundle_digest: 'c'.repeat(64),
  worker_bundle_digest: 'd'.repeat(64),
  binding_manifest_digest: 'e'.repeat(64),
  evidence_bundle_hash: 'f'.repeat(64),
  expected_control_revision: '7',
  expected_policy_revision: '9',
  expected_deployment_approval_id: '55555555-5555-4555-8555-555555555555',
  target_schema_version: 'crm-search-v1',
  requested_action: 'policy_indexing',
  maximum_cost_usd_micros: '1000',
  approved_by: '66666666-6666-4666-8666-666666666666',
  issued_at: '2026-08-09T00:00:00.000Z',
  expires_at: '2026-08-11T00:00:00.000Z',
  revoked_at: null,
  consumed_at: null
}

describe('CRM search approval repository', () => {
  it('locks and returns only exact, current, unrevoked, unconsumed authority', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row] })
    await expect(requireCrmSearchApproval(required, { query } as never)).resolves.toMatchObject({
      id: approvalId,
      approvedBy: row.approved_by,
      maximumCostUsdMicros: 1000
    })
    expect(query.mock.calls[0]?.[0]).toContain('FOR UPDATE OF approval')
    expect(query.mock.calls[0]?.[0]).toContain('crm_search_change_approval_revocations')
    expect(query.mock.calls[0]?.[0]).toContain('crm_search_change_approval_consumptions')
    expect(query.mock.calls[0]?.[0]).toContain('revocation.approval_id = approval.id')
    expect(query.mock.calls[0]?.[0]).toContain('consumption.approval_id = approval.id')
  })

  it.each([
    ['approval_type', 'client_shadow'],
    ['environment', 'preview'],
    ['client_id', '77777777-7777-4777-8777-777777777777'],
    ['expected_policy_revision', '10'],
    ['implementation_git_sha', '0'.repeat(40)],
    ['artifact_manifest_digest', '0'.repeat(64)],
    ['binding_manifest_digest', '0'.repeat(64)],
    ['evidence_bundle_hash', '0'.repeat(64)],
    ['maximum_cost_usd_micros', '1001'],
    ['expires_at', '2026-08-10T00:00:00.000Z'],
    ['revoked_at', '2026-08-09T12:00:00.000Z'],
    ['consumed_at', '2026-08-09T12:00:00.000Z'],
    ['approved_by', actorId]
  ])('rejects exact approval mismatch in %s', async (key, value) => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ...row, [key]: value }] })
    await expect(requireCrmSearchApproval(required, { query } as never))
      .rejects.toThrow('crm_search_approval_mismatch')
  })

  it('fails closed when approval evidence is absent or malformed', async () => {
    await expect(requireCrmSearchApproval(required, {
      query: vi.fn().mockResolvedValue({ rows: [] })
    } as never)).rejects.toThrow('crm_search_approval_mismatch')
  })
})
