import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { crmSearchRepositoryDependencies } from '~~/server/utils/crm/searchIndex/repository'

const operationsRoot = new URL('../../../../server/utils/crm/search/operations/', import.meta.url)

describe('CRM search operations acceptance fixes', () => {
  it('executes approved backfill scheduling into real worker-consumable operation IDs', async () => {
    const { executeCrmSearchBackfill } = await import(
      '~~/server/utils/crm/search/operations/execution'
    )
    const operationIds = [
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000002'
    ]
    const createCandidateOperation = vi.fn()
      .mockResolvedValueOnce({ created: true, operationId: operationIds[0] })
      .mockResolvedValueOnce({ created: true, operationId: operationIds[1] })
    const scheduleBackfill = vi.fn(async (_input, dependencies) => {
      await dependencies.createCandidateOperation({ entityId: 'person-1' })
      await dependencies.createCandidateOperation({ entityId: 'company-1' })
      await dependencies.recordBackfillAudit({ operationsCreated: 2 })
      return {
        scanned: 2,
        operationsCreated: 2,
        candidateSchemaVersion: 'crm-search-v1',
        complete: true
      }
    })

    await expect(executeCrmSearchBackfill({
      organisationScopeId: '20000000-0000-4000-8000-000000000001',
      clientId: '40000000-0000-4000-8000-000000000001',
      candidateSchemaVersion: 'crm-search-v1',
      expectedPolicyRevision: 3,
      approvalId: '70000000-0000-4000-8000-000000000001',
      requestedByActorId: '10000000-0000-4000-8000-000000000001',
      reason: 'Approved durable candidate backfill',
      limit: 25,
      requestedAt: '2026-08-11T01:02:03.456Z'
    }, {
      scheduleBackfill,
      loadBackfillAuthority: vi.fn(),
      listCurrentSources: vi.fn(),
      createCandidateOperation,
      recordBackfillAudit: vi.fn().mockResolvedValue({ auditId: 'audit-evidence-1' })
    } as never)).resolves.toEqual(expect.objectContaining({
      status: 'pending',
      operationIds,
      auditId: 'audit-evidence-1',
      operationsCreated: 2
    }))

    expect(scheduleBackfill).toHaveBeenCalledOnce()
  })

  it('reschedules real pending confirmations and returns their IDs for cron consumption', async () => {
    const { executeCrmSearchReconciliationSchedule } = await import(
      '~~/server/utils/crm/search/operations/execution'
    )
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ revision: 7 }] })
      .mockResolvedValueOnce({ rows: [
        { id: '92000000-0000-4000-8000-000000000001' },
        { id: '92000000-0000-4000-8000-000000000002' }
      ] })
      .mockResolvedValueOnce({ rows: [{ id: 'audit-evidence-2' }] })
    const transactionWithoutRetry = vi.fn(async work => await work({ query }))

    await expect(executeCrmSearchReconciliationSchedule({
      organisationScopeId: '20000000-0000-4000-8000-000000000001',
      expectedControlRevision: 7,
      requestedByActorId: '10000000-0000-4000-8000-000000000001',
      reason: 'Reconcile durable provider confirmations',
      limit: 25
    }, { transactionWithoutRetry } as never)).resolves.toEqual({
      status: 'pending',
      operationIds: [
        '92000000-0000-4000-8000-000000000001',
        '92000000-0000-4000-8000-000000000002'
      ],
      auditId: 'audit-evidence-2'
    })

    const scheduleSql = String(query.mock.calls[1]?.[0])
    expect(scheduleSql).toMatch(/operation\.state\s*=\s*'provider_pending'\s+OR\s+EXISTS[\s\S]*attempt\.provider\s*=\s*'vectorize'[\s\S]*attempt\.state\s*=\s*'ambiguous'/i)
    expect(scheduleSql).toMatch(/SET\s+next_attempt_at\s*=\s*NOW\(\)/i)
  })

  it('returns an empty durable reconciliation request when no worker-eligible rows exist', async () => {
    const { executeCrmSearchReconciliationSchedule } = await import(
      '~~/server/utils/crm/search/operations/execution'
    )
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ revision: 7 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'audit-empty-reconciliation' }] })
    const transactionWithoutRetry = vi.fn(async work => await work({ query }))

    await expect(executeCrmSearchReconciliationSchedule({
      organisationScopeId: '20000000-0000-4000-8000-000000000001',
      expectedControlRevision: 7,
      requestedByActorId: '10000000-0000-4000-8000-000000000001',
      reason: 'Record that no reconciliation work is eligible',
      limit: 25
    }, { transactionWithoutRetry } as never)).resolves.toEqual({
      status: 'pending',
      operationIds: [],
      auditId: 'audit-empty-reconciliation'
    })
  })

  it('makes each scheduled ID immediately claimable through the worker due-time gate', async () => {
    const [{ executeCrmSearchReconciliationSchedule }, {
      createDefaultCrmSearchReconciliationDependencies
    }] = await Promise.all([
      import('~~/server/utils/crm/search/operations/execution'),
      import('~~/server/utils/crm/searchIndex/reconciliation')
    ])
    const operationId = '92000000-0000-4000-8000-000000000003'
    const manualNow = '2026-08-11T01:02:03.456Z'
    let nextAttemptAt = '2026-08-11T02:02:03.456Z'
    const scheduleQuery = vi.fn(async (sql: string) => {
      if (sql.includes('FROM crm_search_global_control')) return { rows: [{ revision: 7 }] }
      if (sql.includes('UPDATE crm_search_operations operation')) {
        nextAttemptAt = manualNow
        return { rows: [{ id: operationId }] }
      }
      return { rows: [{ id: 'audit-scheduler-claimer' }] }
    })
    const transactionWithoutRetry = vi.fn(async work => await work({ query: scheduleQuery }))

    const scheduled = await executeCrmSearchReconciliationSchedule({
      organisationScopeId: '20000000-0000-4000-8000-000000000001',
      expectedControlRevision: 7,
      requestedByActorId: '10000000-0000-4000-8000-000000000001',
      reason: 'Prioritize this eligible reconciliation now',
      limit: 25
    }, { transactionWithoutRetry } as never)

    const claimQuery = vi.fn(async (_sql: string, params: unknown[]) => ({
      rows: Date.parse(nextAttemptAt) <= Date.parse(String(params[0]))
        ? [{
            operation_id: operationId,
            document_id: '95000000-0000-4000-8000-000000000001',
            organisation_scope_id: '20000000-0000-4000-8000-000000000001',
            client_id: '40000000-0000-4000-8000-000000000001',
            entity_type: 'company',
            entity_id: '96000000-0000-4000-8000-000000000001',
            schema_version: 'crm-search-v1', schema_role: 'active',
            source_revision: 4, source_event_sequence: 8, desired_action: 'upsert',
            vector_id: 'vector_1', namespace: 'namespace_1',
            confirmation_tag: `hmac-sha256:${'a'.repeat(64)}`,
            confirmation_key_version: 'key-v1', provider_mutation_id: 'mutation-1',
            provider_attempt_count: 1, confirmation_attempt_count: 0,
            confirmation_deadline_at: '2026-08-11T01:17:03.456Z',
            ambiguous_attempt_id: null,
            lease_token: '97000000-0000-4000-8000-000000000001', lease_generation: 1
          }]
        : []
    }))
    const transactionSpy = vi.spyOn(crmSearchRepositoryDependencies, 'transactionWithoutRetry')
      .mockImplementation(async work => await work({ query: claimQuery } as never))
    try {
      const claims = await createDefaultCrmSearchReconciliationDependencies()
        .claimPendingConfirmations({ limit: 25, now: manualNow })
      expect(scheduled.operationIds).toEqual([operationId])
      expect(claims.map(claim => claim.operationId)).toEqual(scheduled.operationIds)
      expect(String(claimQuery.mock.calls[0]?.[0])).toMatch(/next_attempt_at\s*<=\s*\$1/i)
    } finally {
      transactionSpy.mockRestore()
    }
  })

  it('requires exact dead-letter revision and terminal-operation generation before replacement', async () => {
    const { requestCrmSearchDeadLetterRecoveryRecord } = await import(
      '~~/server/utils/crm/search/operations/commands'
    )
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        id: '80000000-0000-4000-8000-000000000001',
        operation_id: '93000000-0000-4000-8000-000000000001',
        origin: 'provider_confirmation',
        resolution_state: 'open',
        revision: '2026-08-11T01:02:03.456789Z',
        generation: 9,
        source_revision: 12,
        source_event_sequence: 44,
        desired_action: 'upsert',
        vector_id: 'vector_1',
        namespace: 'namespace_1',
        content_hash: 'a'.repeat(64),
        confirmation_tag: `hmac-sha256:${'b'.repeat(64)}`,
        confirmation_key_version: 'key-v1'
      }] })
      .mockResolvedValueOnce({ rows: [{ replacement_operation_id: '94000000-0000-4000-8000-000000000001' }] })
    const transactionWithoutRetry = vi.fn(async work => await work({ query }))

    await expect(requestCrmSearchDeadLetterRecoveryRecord({
      deadLetterId: '80000000-0000-4000-8000-000000000001',
      organisationScopeId: '20000000-0000-4000-8000-000000000001',
      origin: 'provider_confirmation',
      action: 'confirmation_reconcile',
      expectedRevision: '2026-08-11T01:02:03.456789Z',
      expectedGeneration: 9,
      actorId: '10000000-0000-4000-8000-000000000001',
      reason: 'Recover exact accepted provider mutation'
    }, { transactionWithoutRetry } as never)).resolves.toEqual({
      recoveryId: '94000000-0000-4000-8000-000000000001',
      operationId: '94000000-0000-4000-8000-000000000001',
      status: 'confirmation_reconcile_requested'
    })

    expect(String(query.mock.calls[0]?.[0])).toMatch(/updated_at[\s\S]*lease_generation[\s\S]*FOR UPDATE/i)
    expect(String(query.mock.calls[1]?.[0])).toContain('crm_search_replace_terminal_operation')
  })

  it('freshly verifies signed session issuance and rejects invalidated or machine-only authority', async () => {
    const { requireFreshCrmSearchAdmin } = await import(
      '~~/server/utils/crm/search/operations/audit'
    )
    const authority = {
      actorId: '10000000-0000-4000-8000-000000000001',
      orgId: '20000000-0000-4000-8000-000000000001',
      permissions: ['ADMIN'],
      authorityRevision: 'fresh-8',
      active: true,
      sessionsInvalidatedAt: '2026-08-11T01:02:04.000Z'
    }

    await expect(requireFreshCrmSearchAdmin({ context: { user: { id: authority.actorId } } } as never, {
      getAuthenticatedSession: vi.fn().mockResolvedValue({
        actorId: authority.actorId,
        issuedAt: '2026-08-11T01:02:03.000Z'
      }),
      loadFreshAuthority: vi.fn().mockResolvedValue(authority)
    })).rejects.toMatchObject({ statusCode: 401 })

    await expect(requireFreshCrmSearchAdmin({ context: { user: { id: authority.actorId } } } as never, {
      getAuthenticatedSession: vi.fn().mockResolvedValue(null),
      loadFreshAuthority: vi.fn()
    })).rejects.toMatchObject({ statusCode: 401 })
  })

  it('loads session invalidation, provider-specific evidence and real high-watermark lag from fresh storage', async () => {
    const [audit, health] = await Promise.all([
      readFile(new URL('audit.ts', operationsRoot), 'utf8'),
      readFile(new URL('health.ts', operationsRoot), 'utf8')
    ])

    expect(audit).toContain('sessions_invalidated_at')
    expect(audit).toContain('verifyJwt')
    expect(audit).not.toMatch(/return\s+\(await requireAuth\(event\)\)\.id/)
    expect(health).toMatch(/captured_source_high_watermark[\s\S]*confirmed_source_high_watermark/)
    expect(health).toMatch(/source\.search_revision[\s\S]*document\.source_revision/)
    expect(health).toMatch(/provider\s*=\s*'workers_ai'/)
    expect(health).toMatch(/provider\s*=\s*'vectorize'/)
    expect(health).not.toContain('providerDegraded')
  })

  it('connects created operations to the accepted publisher and reconciliation cron consumers', async () => {
    const [execution, publisher, cron] = await Promise.all([
      readFile(new URL('execution.ts', operationsRoot), 'utf8'),
      readFile(new URL('../../searchIndex/publisher.ts', operationsRoot), 'utf8'),
      readFile(new URL('../../../../api/cron/crm-search-reconcile.post.ts', operationsRoot), 'utf8')
    ])

    expect(execution).toContain('scheduleCrmSearchBackfill')
    expect(execution).toContain('upsertCrmSearchOperation')
    expect(publisher).toContain('claimCrmSearchOperationsForPublication')
    expect(cron).toContain('reconcileCrmSearchIndexRequest')
    expect(execution).not.toMatch(/\$fetch\s*\(|\bfetch\s*\(|\.send\s*\(/)
  })

  it('persists and returns full approval provenance, capacity and immutable requester evidence', async () => {
    const commands = await readFile(new URL('commands.ts', operationsRoot), 'utf8')

    for (const field of [
      'requested_by', 'implementation_git_sha', 'artifact_manifest_digest',
      'pages_bundle_digest', 'worker_bundle_digest', 'binding_manifest_digest',
      'evidence_bundle_hash', 'load_protocol_digest', 'provider_contract_digest',
      'expected_control_revision', 'expected_policy_revision',
      'expected_deployment_approval_id', 'target_schema_version', 'requested_action',
      'active_vector_count', 'candidate_vector_count', 'retiring_vector_count',
      'sentinel_vector_count', 'deletion_pending_vector_count', 'forecast_vector_count',
      'vector_capacity', 'active_namespace_count', 'candidate_namespace_count',
      'retiring_namespace_count', 'sentinel_namespace_count',
      'deletion_pending_namespace_count', 'forecast_namespace_count',
      'namespace_capacity', 'imported_provenance_hash', 'issued_at'
    ]) expect(commands).toContain(field)
  })
})
