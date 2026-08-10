import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

const operationsRoot = new URL('../../../../server/utils/crm/search/operations/', import.meta.url)

async function loadContracts() {
  return await import('~~/server/utils/crm/search/operations/contracts')
}

async function loadAudit() {
  return await import('~~/server/utils/crm/search/operations/audit')
}

async function loadCommands() {
  return await import('~~/server/utils/crm/search/operations/commands')
}

const admin = {
  actorId: '10000000-0000-4000-8000-000000000001',
  orgId: '20000000-0000-4000-8000-000000000001',
  permissions: ['ADMIN'],
  authorityRevision: 'fresh-authority-7'
}

const baseApproval = {
  environment: 'production',
  organisationScopeId: admin.orgId,
  implementationGitSha: 'a'.repeat(40),
  artifactManifestDigest: 'b'.repeat(64),
  bindingManifestDigest: 'c'.repeat(64),
  evidenceBundleHash: 'd'.repeat(64),
  maximumCostUsdMicros: 25_000_000,
  expiresAt: '2026-08-20T00:00:00.000Z',
  reason: 'Approved production CRM search change',
  approvedBy: '30000000-0000-4000-8000-000000000001'
}

describe('CRM search operations authorization and audited commands', () => {
  it('uses fresh server-owned authority and rejects non-ADMIN actors before command execution', async () => {
    const { requireFreshCrmSearchAdmin } = await loadAudit()
    const execute = vi.fn()
    const loadFreshAuthority = vi.fn().mockResolvedValue({
      ...admin,
      permissions: [],
      active: true
    })

    await expect(requireFreshCrmSearchAdmin({
      context: {
        user: { id: admin.actorId, role: 'owner', permissions: ['ADMIN'] },
        org: { id: 'attacker-controlled-org' }
      }
    } as never, {
      getAuthenticatedActorId: vi.fn().mockResolvedValue(admin.actorId),
      loadFreshAuthority,
      execute
    })).rejects.toMatchObject({ statusCode: 403 })

    expect(loadFreshAuthority).toHaveBeenCalledWith(admin.actorId)
    expect(execute).not.toHaveBeenCalled()
  })

  it('runs a mutation only after fresh ADMIN authorization and pairs it with one append-only audit record', async () => {
    const { runAuditedCrmSearchCommand } = await loadAudit()
    const mutate = vi.fn().mockResolvedValue({ revision: 8 })
    const appendAudit = vi.fn().mockResolvedValue({ auditId: 'audit-8' })
    const runTransaction = vi.fn(async <T>(work: () => Promise<T>) => await work())

    await expect(runAuditedCrmSearchCommand({
      event: { context: { user: { id: admin.actorId } } },
      command: 'global_control.transition',
      reason: 'Pause indexing during a provider incident',
      expectedRevision: 7,
      confirmation: 'HALT CRM SEARCH',
      getAuthenticatedActorId: vi.fn().mockResolvedValue(admin.actorId),
      loadFreshAuthority: vi.fn().mockResolvedValue({ ...admin, active: true }),
      runTransaction,
      mutate,
      appendAudit
    })).resolves.toEqual({ revision: 8, auditId: 'audit-8' })

    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      actorId: admin.actorId,
      orgId: admin.orgId,
      expectedRevision: 7
    }))
    expect(appendAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: admin.actorId,
      orgId: admin.orgId,
      command: 'global_control.transition',
      beforeRevision: 7,
      afterRevision: 8
    }))
    expect(runTransaction).toHaveBeenCalledOnce()
  })

  it('requires expected revisions, reasons and exact typed confirmations for destructive transitions', async () => {
    const { parseGlobalControlCommand, parseClientPolicyCommand } = await loadCommands()

    expect(() => parseGlobalControlCommand({
      nextState: 'halted',
      expectedRevision: 7,
      reason: 'Provider incident',
      confirmation: 'halt crm search'
    })).toThrow('crm_search_confirmation_mismatch')

    expect(() => parseGlobalControlCommand({
      nextState: 'halted',
      reason: 'Provider incident',
      confirmation: 'HALT CRM SEARCH'
    })).toThrow('crm_search_expected_revision_required')

    expect(() => parseClientPolicyCommand({
      clientId: '40000000-0000-4000-8000-000000000001',
      nextState: 'off',
      expectedControlRevision: 7,
      expectedPolicyRevision: 3,
      reason: '',
      confirmation: 'DISABLE CLIENT CRM SEARCH'
    })).toThrow('crm_search_reason_required')
  })

  it('maps stale CAS failures to a generic conflict with an explicit refresh action', async () => {
    const { mapCrmSearchCommandError } = await loadCommands()

    expect(mapCrmSearchCommandError({ code: 'crm_search_stale_revision' })).toEqual({
      statusCode: 409,
      statusMessage: 'CRM search state changed. Refresh before retrying.',
      code: 'crm_search_stale_revision',
      action: 'refresh'
    })
  })
})

describe('CRM search change approvals', () => {
  it('exposes exactly the six accepted approval types and their global/client scopes', async () => {
    const {
      CRM_SEARCH_CHANGE_APPROVAL_TYPES,
      crmSearchApprovalScope
    } = await loadContracts()

    expect(CRM_SEARCH_CHANGE_APPROVAL_TYPES).toEqual([
      'resource_provision',
      'production_migration',
      'production_deploy',
      'client_indexing',
      'client_shadow',
      'client_assist'
    ])

    for (const type of CRM_SEARCH_CHANGE_APPROVAL_TYPES.slice(0, 3)) {
      expect(crmSearchApprovalScope(type)).toBe('global')
    }
    for (const type of CRM_SEARCH_CHANGE_APPROVAL_TYPES.slice(3)) {
      expect(crmSearchApprovalScope(type)).toBe('client')
    }
  })

  it('requires immutable scope, evidence, cost, expiry and actor separation on every approval', async () => {
    const { parseCrmSearchApprovalDraft } = await loadContracts()

    expect(() => parseCrmSearchApprovalDraft({
      ...baseApproval,
      approvalType: 'production_deploy',
      approvedBy: admin.actorId,
      requestedByActorId: admin.actorId
    })).toThrow('crm_search_approval_actor_separation_required')

    for (const missing of [
      'implementationGitSha',
      'artifactManifestDigest',
      'bindingManifestDigest',
      'evidenceBundleHash',
      'maximumCostUsdMicros',
      'expiresAt'
    ] as const) {
      const draft = {
        ...baseApproval,
        approvalType: 'production_deploy',
        requestedByActorId: admin.actorId
      } as Record<string, unknown>
      delete draft[missing]
      expect(() => parseCrmSearchApprovalDraft(draft)).toThrow('crm_search_invalid_approval')
    }
  })

  it('pins client approvals to client scope, deployment and fresh control/policy revisions', async () => {
    const { parseCrmSearchApprovalDraft } = await loadContracts()
    const clientFields = {
      clientId: '40000000-0000-4000-8000-000000000001',
      pagesBundleDigest: 'e'.repeat(64),
      workerBundleDigest: 'f'.repeat(64),
      loadProtocolDigest: '1'.repeat(64),
      providerContractDigest: '2'.repeat(64),
      rateCardId: '50000000-0000-4000-8000-000000000001',
      expectedControlRevision: 7,
      expectedPolicyRevision: 3,
      expectedDeploymentApprovalId: '60000000-0000-4000-8000-000000000001',
      requestedByActorId: admin.actorId
    }

    expect(parseCrmSearchApprovalDraft({
      ...baseApproval,
      ...clientFields,
      approvalType: 'client_shadow'
    })).toEqual(expect.objectContaining(clientFields))

    expect(() => parseCrmSearchApprovalDraft({
      ...baseApproval,
      ...clientFields,
      approvalType: 'client_shadow',
      expectedPolicyRevision: undefined
    })).toThrow('crm_search_invalid_approval')
  })

  it('requires indexing schema/action and capacity evidence below the page threshold', async () => {
    const { parseCrmSearchApprovalDraft } = await loadContracts()
    const clientIndexing = {
      ...baseApproval,
      approvalType: 'client_indexing',
      clientId: '40000000-0000-4000-8000-000000000001',
      pagesBundleDigest: 'e'.repeat(64),
      workerBundleDigest: 'f'.repeat(64),
      loadProtocolDigest: '1'.repeat(64),
      providerContractDigest: '2'.repeat(64),
      rateCardId: '50000000-0000-4000-8000-000000000001',
      expectedControlRevision: 7,
      expectedPolicyRevision: 3,
      expectedDeploymentApprovalId: '60000000-0000-4000-8000-000000000001',
      requestedByActorId: admin.actorId,
      targetSchemaVersion: 'crm-search-v1',
      requestedAction: 'enable_indexing',
      activeVectorCount: 4_000,
      candidateVectorCount: 1_000,
      retiringVectorCount: 500,
      sentinelVectorCount: 1,
      deletionPendingVectorCount: 499,
      activeNamespaceCount: 4,
      candidateNamespaceCount: 1,
      retiringNamespaceCount: 1,
      sentinelNamespaceCount: 1,
      deletionPendingNamespaceCount: 1
    }

    expect(() => parseCrmSearchApprovalDraft({
      ...clientIndexing,
      forecastVectorCount: 6_000,
      vectorCapacity: 7_500,
      forecastNamespaceCount: 8,
      namespaceCapacity: 10
    })).toThrow('crm_search_capacity_approval_blocked')

    expect(parseCrmSearchApprovalDraft({
      ...clientIndexing,
      forecastVectorCount: 6_000,
      vectorCapacity: 7_501,
      forecastNamespaceCount: 8,
      namespaceCapacity: 11
    })).toEqual(expect.objectContaining({
      targetSchemaVersion: 'crm-search-v1',
      requestedAction: 'enable_indexing'
    }))
  })

  it('imports only a resource-provision bootstrap with preserved provenance and never reissues it', async () => {
    const { importCrmSearchApproval } = await loadCommands()
    const insertImportedApproval = vi.fn().mockResolvedValue({ approvalId: 'approval-imported' })

    await expect(importCrmSearchApproval({
      actor: admin,
      approval: {
        ...baseApproval,
        approvalType: 'resource_provision',
        issuedAt: '2026-08-09T00:00:00.000Z',
        importedProvenanceHash: '3'.repeat(64),
        requestedByActorId: admin.actorId
      },
      insertImportedApproval
    })).resolves.toEqual({ approvalId: 'approval-imported' })

    expect(insertImportedApproval).toHaveBeenCalledWith(expect.objectContaining({
      approvalType: 'resource_provision',
      issuedAt: '2026-08-09T00:00:00.000Z',
      importedProvenanceHash: '3'.repeat(64)
    }))

    await expect(importCrmSearchApproval({
      actor: admin,
      approval: { ...baseApproval, approvalType: 'production_deploy' },
      insertImportedApproval
    })).rejects.toThrow('crm_search_import_resource_provision_only')
  })

  it('revokes by appending an immutable revocation and never updates or deletes the approval', async () => {
    const { revokeCrmSearchApproval } = await loadCommands()
    const appendRevocation = vi.fn().mockResolvedValue({ revocationId: 'revocation-16' })
    const updateApproval = vi.fn()
    const deleteApproval = vi.fn()

    await revokeCrmSearchApproval({
      actor: admin,
      approvalId: '70000000-0000-4000-8000-000000000001',
      expectedRevision: 2,
      reason: 'Superseded deployment evidence',
      confirmation: 'REVOKE CRM SEARCH APPROVAL',
      appendRevocation,
      updateApproval,
      deleteApproval
    })

    expect(appendRevocation).toHaveBeenCalledWith(expect.objectContaining({
      approvalId: '70000000-0000-4000-8000-000000000001',
      revokedByActorId: admin.actorId,
      expectedRevision: 2
    }))
    expect(updateApproval).not.toHaveBeenCalled()
    expect(deleteApproval).not.toHaveBeenCalled()
  })
})

describe('CRM search durable operator work', () => {
  it('creates durable backfill and reconciliation requests without doing provider work inline', async () => {
    const {
      scheduleCrmSearchBackfillCommand,
      scheduleCrmSearchReconciliationCommand
    } = await loadCommands()
    const createDurableOperation = vi.fn()
      .mockResolvedValueOnce({ operationId: 'backfill-16', status: 'pending' })
      .mockResolvedValueOnce({ operationId: 'reconcile-16', status: 'pending' })

    await expect(scheduleCrmSearchBackfillCommand({
      actor: admin,
      clientId: '40000000-0000-4000-8000-000000000001',
      candidateSchemaVersion: 'crm-search-v1',
      expectedPolicyRevision: 3,
      approvalId: 'approval-indexing-16',
      limit: 500,
      reason: 'Initial approved client backfill',
      confirmation: 'SCHEDULE CRM SEARCH BACKFILL',
      createDurableOperation
    })).resolves.toMatchObject({ status: 'pending' })

    await expect(scheduleCrmSearchReconciliationCommand({
      actor: admin,
      expectedControlRevision: 7,
      reason: 'Compare durable provider confirmation state',
      confirmation: 'SCHEDULE CRM SEARCH RECONCILIATION',
      createDurableOperation
    })).resolves.toMatchObject({ status: 'pending' })

    expect(createDurableOperation).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'backfill',
      requestedByActorId: admin.actorId
    }))
    expect(createDurableOperation).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'reconcile',
      requestedByActorId: admin.actorId
    }))
  })

  it.each([
    ['cloudflare_transport', 'transport_retry'],
    ['provider_confirmation', 'confirmation_reconcile']
  ] as const)('allows only the origin-specific %s -> %s dead-letter action', async (origin, action) => {
    const { recoverCrmSearchDeadLetterCommand } = await loadCommands()
    const requestDurableRecovery = vi.fn().mockResolvedValue({ recoveryId: 'recovery-16' })

    await expect(recoverCrmSearchDeadLetterCommand({
      actor: admin,
      deadLetterId: '80000000-0000-4000-8000-000000000001',
      origin,
      action,
      expectedRevision: '2026-08-11T01:02:03.456789Z',
      expectedGeneration: 4,
      reason: 'Operator reviewed durable failure evidence',
      confirmation: 'RECOVER CRM SEARCH DEAD LETTER',
      requestDurableRecovery
    })).resolves.toEqual({ recoveryId: 'recovery-16' })

    const wrongAction = action === 'transport_retry' ? 'confirmation_reconcile' : 'transport_retry'
    await expect(recoverCrmSearchDeadLetterCommand({
      actor: admin,
      deadLetterId: '80000000-0000-4000-8000-000000000001',
      origin,
      action: wrongAction,
      expectedRevision: '2026-08-11T01:02:03.456789Z',
      expectedGeneration: 4,
      reason: 'Operator reviewed durable failure evidence',
      confirmation: 'RECOVER CRM SEARCH DEAD LETTER',
      requestDurableRecovery
    })).rejects.toThrow('crm_search_dead_letter_action_mismatch')
  })

  it('resolves the requested-by actor from fresh active storage before persisting approval provenance', async () => {
    const { createCrmSearchApproval } = await loadCommands()
    const requesterId = '30000000-0000-4000-8000-000000000001'
    const insert = vi.fn().mockResolvedValue({ approvalId: 'approval-16' })
    const loadActiveRequester = vi.fn().mockResolvedValue({ actorId: requesterId, active: true })

    await expect(createCrmSearchApproval({
      ...baseApproval,
      approvalType: 'resource_provision',
      requestedByActorId: requesterId
    }, admin, { insert, loadActiveRequester })).resolves.toEqual({ approvalId: 'approval-16' })

    expect(loadActiveRequester).toHaveBeenCalledWith(requesterId, admin.orgId)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ requestedByActorId: requesterId }))

    loadActiveRequester.mockResolvedValueOnce(null)
    await expect(createCrmSearchApproval({
      ...baseApproval,
      approvalType: 'resource_provision',
      requestedByActorId: requesterId
    }, admin, { insert, loadActiveRequester })).rejects.toThrow('crm_search_approval_requester_unavailable')
  })

  it('contains no direct provider, queue transport, HTTP or deployment boundary', async () => {
    const source = await Promise.all([
      'contracts.ts',
      'health.ts',
      'commands.ts',
      'audit.ts'
    ].map(async file => await readFile(new URL(file, operationsRoot), 'utf8')))
    const joined = source.join('\n')

    expect(joined).not.toMatch(/\$fetch\s*\(|\bfetch\s*\(/)
    expect(joined).not.toMatch(/wrangler|pages\s+deploy|deploy:production/i)
    expect(joined).not.toMatch(/CRM_SEARCH_VECTORIZE|vectorize\.(?:query|insert|upsert)|AI\.run|env\.AI/i)
    expect(joined).not.toMatch(/(?:queue|env\.[A-Z_]*QUEUE)\.(?:send|sendBatch)\s*\(/i)
  })
})
