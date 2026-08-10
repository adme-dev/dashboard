import type { Client } from 'pg'
import { expect } from 'vitest'

export async function verifyReleaseApprovalFinalization(
  client: Client,
  organisationScopeId: string
): Promise<void> {
  const actorId = '72000000-0000-4000-8000-000000000010'
  const approverId = '72000000-0000-4000-8000-000000000011'
  const artifactManifestDigest = 'a'.repeat(64)
  const insertApproval = async (approvalId: string, revision: number) => {
    await client.query(
      `INSERT INTO crm_search_change_approvals (
         id, approval_type, environment, implementation_git_sha,
         artifact_manifest_digest, pages_bundle_digest, worker_bundle_digest,
         binding_manifest_digest, evidence_bundle_hash, rate_card_id,
         organisation_scope_id, scope_kind, maximum_cost_usd_micros,
         expected_control_revision, requested_by, approved_by, reason, expires_at
       ) VALUES (
         $1, 'production_deploy', 'production', $2, $3, $4, $5, $6, $7,
         '00000000-0000-4351-8351-000000000004', $8, 'global', 0,
         $9, $10, $11, 'Approve exact frozen production deployment',
         NOW() + INTERVAL '1 hour'
       )`,
      [approvalId, '1'.repeat(40), artifactManifestDigest, 'b'.repeat(64),
        'c'.repeat(64), 'd'.repeat(64), 'e'.repeat(64), organisationScopeId, revision,
        actorId, approverId]
    )
  }
  const insertPhase = async (
    approvalId: string,
    phase: 'pages' | 'worker_upload' | 'worker_activate',
    status: 'started' | 'succeeded' | 'failed',
    sequence: number,
    identifiers: { deploymentId?: string, versionId?: string } = {}
  ) => {
    const details = {
      approvalId,
      approvalRevision: 0,
      artifactManifestDigest,
      phase,
      status,
      ...identifiers,
      ...(status === 'failed' ? { failureCode: 'external_spawn_failed' } : {})
    }
    await client.query(
      `INSERT INTO crm_search_audit_log (
         organisation_scope_id, event_type, actor_id, correlation_id,
         reason, evidence_hash, details, created_at
       ) VALUES (
         $1, 'deployment.phase_' || $2, $3, gen_random_uuid(),
         'Record exact CRM search deployment phase evidence', $4, $5::JSONB,
         clock_timestamp() + ($6::INTEGER * INTERVAL '1 millisecond')
       )`,
      [organisationScopeId, status, actorId, 'e'.repeat(64),
        JSON.stringify(details), sequence]
    )
  }

  const approvalId = '72000000-0000-4000-8000-000000000001'
  await insertApproval(approvalId, 0)
  await expect(client.query(
    `SELECT crm_search_record_dormant_deployment($1, 0, $2, $3, $4)`,
    [organisationScopeId, actorId,
      'Reject dormant deployment before exact phase evidence exists', approvalId]
  )).rejects.toThrow('lacks exact successful phase evidence')
  await insertPhase(approvalId, 'pages', 'succeeded', 1, {
    deploymentId: 'pages-deployment-123'
  })
  await insertPhase(approvalId, 'worker_upload', 'succeeded', 2, {
    versionId: 'worker-version-123'
  })
  await insertPhase(approvalId, 'worker_activate', 'failed', 3)
  await expect(client.query(
    `SELECT crm_search_record_dormant_deployment($1, 0, $2, $3, $4)`,
    [organisationScopeId, actorId,
      'Reject dormant deployment after a failed activation phase', approvalId]
  )).rejects.toThrow('lacks exact successful phase evidence')
  await insertPhase(approvalId, 'worker_activate', 'succeeded', 4, {
    versionId: 'worker-version-123', deploymentId: 'worker-deployment-123'
  })
  expect((await client.query(
    `SELECT crm_search_record_dormant_deployment($1, 0, $2, $3, $4) AS revision`,
    [organisationScopeId, actorId,
      'Finalize dormant deployment after all exact phases succeed', approvalId]
  )).rows).toEqual([{ revision: '1' }])
  expect((await client.query(
    `SELECT consumption_kind FROM crm_search_change_approval_consumptions
      WHERE approval_id = $1`,
    [approvalId]
  )).rows).toEqual([{ consumption_kind: 'dormant_deployment' }])

  const revokedApprovalId = '72000000-0000-4000-8000-000000000002'
  await insertApproval(revokedApprovalId, 1)
  await insertPhase(revokedApprovalId, 'pages', 'succeeded', 5, {
    deploymentId: 'pages-deployment-456'
  })
  await insertPhase(revokedApprovalId, 'worker_upload', 'succeeded', 6, {
    versionId: 'worker-version-456'
  })
  await insertPhase(revokedApprovalId, 'worker_activate', 'succeeded', 7, {
    versionId: 'worker-version-456', deploymentId: 'worker-deployment-456'
  })
  await client.query(
    `INSERT INTO crm_search_change_approval_revocations (
       approval_id, revoked_by, reason
     ) VALUES ($1, $2, 'Revoke deployment before final approval consumption')`,
    [revokedApprovalId, approverId]
  )
  await expect(client.query(
    `SELECT crm_search_record_dormant_deployment($1, 1, $2, $3, $4)`,
    [organisationScopeId, actorId,
      'Reject dormant deployment after approval revocation', revokedApprovalId]
  )).rejects.toThrow('lacks exact production-deploy approval')
  expect((await client.query(
    `SELECT id FROM crm_search_change_approval_consumptions WHERE approval_id = $1`,
    [revokedApprovalId]
  )).rows).toEqual([])
}
