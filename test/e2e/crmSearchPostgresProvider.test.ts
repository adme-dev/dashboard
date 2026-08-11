import { createPublicKey, verify as verifySignature } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  processCrmSearchOperation,
  type CrmSearchProcessorDependencies
} from '~~/server/utils/crm/searchIndex/processor'
import type { CrmSearchProviderRuntime } from '~~/server/utils/crm/searchIndex/provider'
import {
  publishCrmSearchOperations,
  type CrmSearchIndexPublisherDependencies
} from '~~/server/utils/crm/searchIndex/publisher'
import {
  reconcileCrmSearchIndex,
  type CrmSearchReconciliationDependencies
} from '~~/server/utils/crm/searchIndex/reconciliation'

const ORGANISATION_ID = '10000000-0000-4000-8000-000000000001'
const CLIENT_ID = '10000000-0000-4000-8000-000000000002'
const NEW_CLIENT_ID = '10000000-0000-4000-8000-000000000003'
const ENTITY_ID = '10000000-0000-4000-8000-000000000004'
const OPERATION_ID = '10000000-0000-4000-8000-000000000005'
const DELETE_OPERATION_ID = '10000000-0000-4000-8000-000000000006'
const DOCUMENT_ID = '10000000-0000-4000-8000-000000000007'
const CORRELATION_ID = '10000000-0000-4000-8000-000000000008'
const LEASE_TOKEN = '10000000-0000-4000-8000-000000000009'
const TEARDOWN_ID = '10000000-0000-4000-8000-000000000010'
const NAMESPACE = 'n'.repeat(43)
const NEW_NAMESPACE = 'm'.repeat(43)
const VECTOR_ID = 'v'.repeat(43)
const CONTENT_HASH = 'b'.repeat(64)
const CONFIRMATION_TAG = `hmac-sha256:${'c'.repeat(64)}`
const NOW = '2026-08-11T03:00:00.000Z'

type Operation = ReturnType<typeof operation>

function operation(overrides: Record<string, unknown> = {}) {
  return {
    id: OPERATION_ID,
    organisationScopeId: ORGANISATION_ID,
    clientId: CLIENT_ID,
    entityType: 'company' as const,
    entityId: ENTITY_ID,
    schemaVersion: 'crm-search-v1',
    sourceRevision: 7,
    sourceEventSequence: 12,
    desiredAction: 'upsert' as const,
    vectorId: VECTOR_ID,
    namespace: NAMESPACE,
    contentHash: CONTENT_HASH as string | null,
    confirmationTag: CONFIRMATION_TAG as string | null,
    confirmationKeyVersion: 'confirmation-v1' as string | null,
    controlRevision: 19,
    state: 'processing',
    leaseToken: LEASE_TOKEN,
    leaseGeneration: 3,
    ...overrides
  }
}

function source(overrides: Record<string, unknown> = {}) {
  return {
    exists: true,
    deleted: false,
    clientId: CLIENT_ID,
    revision: 7,
    eventSequence: 12,
    document: {
      canonicalText: 'Name: Atlas Motors',
      providerInput: 'Name: Atlas Motors',
      contentHash: CONTENT_HASH
    },
    ...overrides
  }
}

function createProviderRuntime() {
  const stored = new Map<string, {
    id: string
    namespace: string
    metadata: Record<string, unknown>
  }>()
  const aiRun = vi.fn(async () => ({ data: [Array(768).fill(0.125)] }))
  const upsert = vi.fn(async (vectors: Array<{
    id: string
    namespace: string
    metadata: Record<string, unknown>
  }>) => {
    for (const vector of vectors) {
      stored.set(vector.id, {
        id: vector.id,
        namespace: vector.namespace,
        metadata: { ...vector.metadata }
      })
    }
    return { mutationId: `upsert-${upsert.mock.calls.length}` }
  })
  const deleteByIds = vi.fn(async (ids: string[]) => {
    for (const id of ids) stored.delete(id)
    return { mutationId: `delete-${deleteByIds.mock.calls.length}` }
  })
  const getByIds = vi.fn(async (ids: string[]) => ids.flatMap((id) => {
    const value = stored.get(id)
    return value ? [{ ...value, metadata: { ...value.metadata } }] : []
  }))
  const runtime: CrmSearchProviderRuntime = {
    ai: { run: aiRun },
    vectorize: { upsert, deleteByIds, getByIds }
  }
  return { runtime, stored, aiRun, upsert, deleteByIds, getByIds }
}

function createProcessorHarness(input: {
  operation: Operation
  source: ReturnType<typeof source>
  schemaRole?: 'active' | 'candidate' | 'retiring'
  teardownId?: string | null
  guardDisposition?: 'current' | 'delete' | 'superseded'
  priorAttempt?: null | {
    status: string
    provider: 'workers_ai' | 'vectorize'
    providerCallSent: boolean
    reservationState: string
    providerAttemptId: string
    reservationId: string
  }
}) {
  let priorAttempt = input.priorAttempt ?? null
  const providerGuardInputs: unknown[] = []
  const dependencies: CrmSearchProcessorDependencies = {
    correlationId: CORRELATION_ID,
    claimOperation: vi.fn().mockResolvedValue(input.operation as never),
    loadCurrentContext: vi.fn().mockResolvedValue({
      source: input.source,
      schemaRole: input.schemaRole ?? 'active',
      canonicalNamespace: input.operation.namespace,
      teardownId: input.teardownId ?? null,
      documentAlreadyCurrent: false
    }),
    convertOperationToDelete: vi.fn().mockResolvedValue(undefined),
    withProviderCallGuard: vi.fn(async (guardInput, callback) => {
      providerGuardInputs.push(guardInput)
      return await callback({
        disposition: input.guardDisposition ?? 'current',
        source: input.source,
        documentAlreadyCurrent: false,
        ledger: null
      })
    }),
    admitProviderCall: vi.fn().mockImplementation(async ({ provider }) => ({
      providerAttemptId: `${provider}-attempt-e2e`,
      reservationId: provider === 'workers_ai'
        ? '20000000-0000-4000-8000-000000000001'
        : '20000000-0000-4000-8000-000000000002',
      controlRevision: 19
    })),
    admitOperation: vi.fn().mockResolvedValue(undefined),
    settleProviderCall: vi.fn().mockResolvedValue(undefined),
    markProviderCallSent: vi.fn().mockResolvedValue(undefined),
    recordProviderAcceptance: vi.fn().mockImplementation(async (acceptance) => {
      priorAttempt = {
        status: 'accepted',
        provider: 'vectorize',
        providerCallSent: true,
        reservationState: 'settled',
        providerAttemptId: acceptance.providerAttemptId,
        reservationId: acceptance.reservationId
      }
    }),
    markCompleteNoop: vi.fn().mockResolvedValue(undefined),
    markSuperseded: vi.fn().mockResolvedValue(undefined),
    returnToRetryable: vi.fn().mockResolvedValue(undefined),
    markAmbiguousProviderOutcome: vi.fn().mockResolvedValue(undefined),
    loadProviderAttempt: vi.fn().mockImplementation(async () => priorAttempt),
    markIndexed: vi.fn().mockResolvedValue(undefined)
  }
  return { dependencies, providerGuardInputs, readPriorAttempt: () => priorAttempt }
}

function confirmationClaim(input: {
  operation: Operation
  action: 'upsert' | 'delete'
  confirmationAttemptCount?: number
  confirmationDeadlineAt?: string
}) {
  const isUpsert = input.action === 'upsert'
  return {
    operationId: input.operation.id,
    documentId: DOCUMENT_ID,
    organisationScopeId: input.operation.organisationScopeId,
    clientId: input.operation.clientId,
    entityType: input.operation.entityType,
    entityId: input.operation.entityId,
    schemaVersion: input.operation.schemaVersion,
    schemaRole: 'active' as const,
    sourceRevision: input.operation.sourceRevision,
    sourceEventSequence: input.operation.sourceEventSequence,
    action: input.action,
    vectorId: input.operation.vectorId,
    namespace: input.operation.namespace,
    confirmationTag: isUpsert ? input.operation.confirmationTag : null,
    confirmationKeyVersion: isUpsert ? input.operation.confirmationKeyVersion : null,
    providerMutationId: `${input.action}-mutation-e2e`,
    providerAttemptCount: 1,
    confirmationAttemptCount: input.confirmationAttemptCount ?? 0,
    confirmationDeadlineAt: input.confirmationDeadlineAt ?? '2026-08-11T03:15:00.000Z',
    leaseToken: input.operation.leaseToken,
    leaseGeneration: input.operation.leaseGeneration
  }
}

function reconciliationDependencies(claims: ReturnType<typeof confirmationClaim>[]) {
  const dependencies: CrmSearchReconciliationDependencies = {
    claimPendingConfirmations: vi.fn().mockResolvedValue(claims),
    confirmIndexed: vi.fn().mockResolvedValue(true),
    confirmDeleted: vi.fn().mockResolvedValue(true),
    rescheduleConfirmation: vi.fn().mockResolvedValue(true),
    recoverAmbiguousAcceptance: vi.fn().mockResolvedValue(true),
    recordConfirmationDeadLetter: vi.fn().mockResolvedValue(true),
    createRepairOperation: vi.fn().mockResolvedValue(true),
    claimInventoryRepairs: vi.fn().mockResolvedValue([]),
    resolveRepairEvidence: vi.fn().mockResolvedValue(true),
    schedulePendingTeardowns: vi.fn().mockResolvedValue({
      scheduled: 0,
      finalized: 0
    })
  }
  return dependencies
}

describe('CRM search isolated Postgres/provider E2E harness', () => {
  it('publishes identifier-only work, confirms an upsert, treats replay as pending, then confirms deletion', async () => {
    const provider = createProviderRuntime()
    const queueSend = vi.fn().mockResolvedValue(undefined)
    const publisherDependencies: CrmSearchIndexPublisherDependencies = {
      now: () => Date.parse(NOW),
      randomUUID: () => CORRELATION_ID,
      expandDirtySourceBatch: vi.fn().mockResolvedValue({
        dirtyClaimed: 1,
        operationsCreated: 1,
        skippedByControl: 0
      }),
      claimOperationsForPublication: vi.fn().mockResolvedValue([{
        operationId: OPERATION_ID,
        claimToken: LEASE_TOKEN,
        claimGeneration: 3
      }]),
      confirmOperationPublished: vi.fn().mockResolvedValue(true),
      rescheduleOperationPublication: vi.fn().mockResolvedValue(true),
      resolveQueue: vi.fn().mockReturnValue({ send: queueSend })
    }

    await expect(publishCrmSearchOperations({ context: {} } as never, { limit: 1 }, publisherDependencies))
      .resolves.toEqual({
        dirtyClaimed: 1,
        operationsCreated: 1,
        operationsPublished: 1,
        operationsRescheduled: 0,
        skippedByControl: 0
      })
    const published = queueSend.mock.calls[0]?.[0]
    expect(Object.keys(published).sort()).toEqual([
      'correlationId', 'enqueuedAt', 'operationId', 'protocolVersion'
    ])
    expect(published).toMatchObject({ operationId: OPERATION_ID, correlationId: CORRELATION_ID })
    expect(JSON.stringify(published)).not.toMatch(/Atlas|source|body|content|clientId|organisation/u)

    const upsertOperation = operation()
    const processor = createProcessorHarness({ operation: upsertOperation, source: source() })
    await expect(processCrmSearchOperation(
      upsertOperation.id,
      provider.runtime,
      processor.dependencies
    )).resolves.toEqual({ status: 'accepted_provider_pending' })
    expect(provider.stored.get(VECTOR_ID)).toMatchObject({
      id: VECTOR_ID,
      namespace: NAMESPACE,
      metadata: {
        entityType: 'company',
        schemaVersion: 'crm-search-v1',
        sourceRevision: 7,
        confirmationTag: CONFIRMATION_TAG,
        confirmationKeyVersion: 'confirmation-v1'
      }
    })

    const upsertReconciliation = reconciliationDependencies([
      confirmationClaim({ operation: upsertOperation, action: 'upsert' })
    ])
    await expect(reconcileCrmSearchIndex(
      { limit: 1, now: NOW },
      { vectorize: provider.runtime.vectorize },
      upsertReconciliation
    )).resolves.toMatchObject({ claimed: 1, indexed: 1, deleted: 0 })
    expect(upsertReconciliation.confirmIndexed).toHaveBeenCalledTimes(1)

    await expect(processCrmSearchOperation(
      upsertOperation.id,
      provider.runtime,
      processor.dependencies
    )).resolves.toEqual({ status: 'accepted_provider_pending' })
    expect(provider.upsert).toHaveBeenCalledTimes(1)
    expect(provider.aiRun).toHaveBeenCalledTimes(1)

    const deleteOperation = operation({
      id: DELETE_OPERATION_ID,
      desiredAction: 'delete',
      sourceRevision: 8,
      sourceEventSequence: 13,
      contentHash: null,
      confirmationTag: null,
      confirmationKeyVersion: null
    })
    const deleteProcessor = createProcessorHarness({
      operation: deleteOperation,
      source: source({
        exists: false,
        deleted: true,
        revision: 8,
        eventSequence: 13,
        document: undefined
      }),
      teardownId: TEARDOWN_ID
    })
    await expect(processCrmSearchOperation(
      deleteOperation.id,
      provider.runtime,
      deleteProcessor.dependencies
    )).resolves.toEqual({ status: 'accepted_provider_pending' })
    expect(provider.stored.has(VECTOR_ID)).toBe(false)
    expect(provider.deleteByIds).toHaveBeenCalledWith([VECTOR_ID])
    expect(deleteProcessor.providerGuardInputs).toContainEqual(expect.objectContaining({
      action: 'delete',
      teardownId: TEARDOWN_ID,
      clientId: CLIENT_ID,
      entityId: ENTITY_ID
    }))

    const deleteReconciliation = reconciliationDependencies([
      confirmationClaim({ operation: deleteOperation, action: 'delete' })
    ])
    await expect(reconcileCrmSearchIndex(
      { limit: 1, now: NOW },
      { vectorize: provider.runtime.vectorize },
      deleteReconciliation
    )).resolves.toMatchObject({ claimed: 1, indexed: 0, deleted: 1 })
    expect(deleteReconciliation.confirmDeleted).toHaveBeenCalledTimes(1)
  })

  it('deletes the old namespace on a client move and refuses stale retiring-schema upserts', async () => {
    const provider = createProviderRuntime()
    provider.stored.set(VECTOR_ID, {
      id: VECTOR_ID,
      namespace: NAMESPACE,
      metadata: {
        entityType: 'company',
        schemaVersion: 'crm-search-v1',
        sourceRevision: 7,
        confirmationTag: CONFIRMATION_TAG,
        confirmationKeyVersion: 'confirmation-v1'
      }
    })
    const oldClientOperation = operation()
    const moved = createProcessorHarness({
      operation: oldClientOperation,
      source: source({ clientId: NEW_CLIENT_ID })
    })

    await expect(processCrmSearchOperation(
      oldClientOperation.id,
      provider.runtime,
      moved.dependencies
    )).resolves.toEqual({ status: 'accepted_provider_pending' })
    expect(moved.dependencies.convertOperationToDelete).toHaveBeenCalledWith(expect.objectContaining({
      operationId: OPERATION_ID,
      sourceRevision: 7,
      sourceEventSequence: 12
    }))
    expect(provider.deleteByIds).toHaveBeenCalledWith([VECTOR_ID])
    expect(provider.aiRun).not.toHaveBeenCalled()

    const retiringOperation = operation({
      id: DELETE_OPERATION_ID,
      clientId: NEW_CLIENT_ID,
      namespace: NEW_NAMESPACE
    })
    const retiring = createProcessorHarness({
      operation: retiringOperation,
      source: source({ clientId: NEW_CLIENT_ID }),
      schemaRole: 'retiring'
    })
    await expect(processCrmSearchOperation(
      retiringOperation.id,
      provider.runtime,
      retiring.dependencies
    )).resolves.toEqual({ status: 'superseded' })
    expect(retiring.dependencies.markSuperseded).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'schema_retiring',
      clientId: NEW_CLIENT_ID,
      namespace: NEW_NAMESPACE
    }))
    expect(provider.upsert).not.toHaveBeenCalled()
  })

  it('honors a fresh control flip before provider admission and dead-letters exhausted confirmation', async () => {
    const provider = createProviderRuntime()
    const blocked = createProcessorHarness({
      operation: operation(),
      source: source(),
      guardDisposition: 'superseded'
    })
    await expect(processCrmSearchOperation(
      OPERATION_ID,
      provider.runtime,
      blocked.dependencies
    )).resolves.toEqual({ status: 'superseded' })
    expect(blocked.dependencies.markSuperseded).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'newer_source_intent'
    }))
    expect(blocked.dependencies.admitProviderCall).not.toHaveBeenCalled()
    expect(provider.aiRun).not.toHaveBeenCalled()
    expect(provider.upsert).not.toHaveBeenCalled()

    const exhaustedClaim = confirmationClaim({
      operation: operation(),
      action: 'upsert',
      confirmationAttemptCount: 10,
      confirmationDeadlineAt: '2026-08-11T02:59:59.000Z'
    })
    const reconciliation = reconciliationDependencies([exhaustedClaim])
    await expect(reconcileCrmSearchIndex(
      { limit: 1, now: NOW },
      { vectorize: provider.runtime.vectorize },
      reconciliation
    )).resolves.toMatchObject({ claimed: 1, deadLettered: 1, indexed: 0, deleted: 0 })
    expect(reconciliation.recordConfirmationDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: OPERATION_ID,
        origin: 'provider_confirmation',
        attempts: 10,
        errorClass: 'confirmation_exhausted'
      })
    )
    expect(provider.getByIds).not.toHaveBeenCalled()
  })

  it('reschedules queue transport failures without leaking source data', async () => {
    const rescheduleOperationPublication = vi.fn().mockResolvedValue(true)
    const queueFailure = new Error('provider leaked Atlas Motors alice@example.com')
    const dependencies: CrmSearchIndexPublisherDependencies = {
      now: () => Date.parse(NOW),
      randomUUID: () => CORRELATION_ID,
      expandDirtySourceBatch: vi.fn().mockResolvedValue({
        dirtyClaimed: 1,
        operationsCreated: 1,
        skippedByControl: 0
      }),
      claimOperationsForPublication: vi.fn().mockResolvedValue([{
        operationId: OPERATION_ID,
        claimToken: LEASE_TOKEN,
        claimGeneration: 3
      }]),
      confirmOperationPublished: vi.fn(),
      rescheduleOperationPublication,
      resolveQueue: vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue(queueFailure)
      })
    }

    await expect(publishCrmSearchOperations(
      { context: {} } as never,
      { limit: 1 },
      dependencies
    )).resolves.toMatchObject({ operationsPublished: 0, operationsRescheduled: 1 })
    const serialized = JSON.stringify(rescheduleOperationPublication.mock.calls)
    expect(serialized).toContain('queue_send_failed')
    expect(serialized).not.toMatch(/Atlas|alice@example.com|provider leaked/u)
  })
})

type Task18ExternalAttestation = {
  version: 'crm-search-task18-preview-attestation-v1'
  producer: 'scripts/crm-search/e2e-preview.mjs'
  implementationSha: string
  environment: 'preview'
  createdAt: string
  expiresAt: string
  schemaOnly: true
  artifactVerified: true
  bindingReadbackVerified: true
  pagesHealthUrl: string
  workerHealthUrl: string
  pagesArtifactDigest: string
  workerArtifactDigest: string
  branchName: string
  resources: {
    pagesProject: 'agency-dashboard'
    pagesBranch: 'preview'
    worker: 'agency-crm-search-consumer-preview'
    vectorize: 'agency-crm-search-preview'
    queue: 'agency-crm-search-index-preview'
    deadLetterQueue: 'agency-crm-search-index-preview-dlq'
    retentionSeconds: 1_209_600
  }
  signerKeyId: string
  signatureAlgorithm: 'ed25519'
  signature: string
}

const externalEnvironment = {
  rawAttestation: process.env.CRM_SEARCH_E2E_TASK18_ATTESTATION_JSON?.trim(),
  publicKeyPem: process.env.CRM_SEARCH_E2E_TASK18_ATTESTATION_PUBLIC_KEY_PEM?.trim(),
  signerKeyId: process.env.CRM_SEARCH_E2E_TASK18_ATTESTATION_SIGNER_KEY_ID?.trim()
}
const externalValues = Object.values(externalEnvironment)
const anyExternalInput = externalValues.some(Boolean)
const completeExternalInput = externalValues.every(Boolean)

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function currentHead(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    encoding: 'utf8'
  }).trim()
}

function verifyTask18ExternalAttestation(): Task18ExternalAttestation {
  if (!completeExternalInput) throw new Error('crm_search_task18_external_attestation_incomplete')
  let value: unknown
  try {
    value = JSON.parse(externalEnvironment.rawAttestation!)
  } catch {
    throw new Error('crm_search_task18_external_attestation_invalid_json')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('crm_search_task18_external_attestation_invalid')
  }
  const attestation = value as Task18ExternalAttestation
  const exactKeys = [
    'artifactVerified', 'bindingReadbackVerified', 'branchName', 'createdAt',
    'environment', 'expiresAt', 'implementationSha', 'pagesArtifactDigest',
    'pagesHealthUrl', 'producer', 'resources', 'schemaOnly', 'signature',
    'signatureAlgorithm', 'signerKeyId', 'version', 'workerArtifactDigest',
    'workerHealthUrl'
  ]
  if (Object.keys(attestation).sort().join('\0') !== exactKeys.sort().join('\0')) {
    throw new Error('crm_search_task18_external_attestation_invalid')
  }
  const {
    signature,
    ...signedPayload
  } = attestation
  let verificationKey
  try {
    verificationKey = createPublicKey(externalEnvironment.publicKeyPem!.replaceAll('\\n', '\n'))
  } catch {
    throw new Error('crm_search_task18_external_attestation_key_invalid')
  }
  if (verificationKey.asymmetricKeyType !== 'ed25519'
    || attestation.signatureAlgorithm !== 'ed25519'
    || attestation.signerKeyId !== externalEnvironment.signerKeyId
    || !verifySignature(
      null,
      Buffer.from(canonicalJson(signedPayload), 'utf8'),
      verificationKey,
      Buffer.from(signature || '', 'base64')
    )) throw new Error('crm_search_task18_external_attestation_signature_invalid')

  const createdAt = Date.parse(attestation.createdAt)
  const expiresAt = Date.parse(attestation.expiresAt)
  const expectedSha = currentHead()
  const expectedResources = {
    pagesProject: 'agency-dashboard',
    pagesBranch: 'preview',
    worker: 'agency-crm-search-consumer-preview',
    vectorize: 'agency-crm-search-preview',
    queue: 'agency-crm-search-index-preview',
    deadLetterQueue: 'agency-crm-search-index-preview-dlq',
    retentionSeconds: 1_209_600
  }
  if (attestation.version !== 'crm-search-task18-preview-attestation-v1'
    || attestation.producer !== 'scripts/crm-search/e2e-preview.mjs'
    || attestation.environment !== 'preview'
    || attestation.schemaOnly !== true
    || attestation.artifactVerified !== true
    || attestation.bindingReadbackVerified !== true
    || attestation.implementationSha !== expectedSha
    || attestation.branchName !== `crm-search-e2e-${expectedSha.slice(0, 12)}`
    || !Number.isFinite(createdAt) || !Number.isFinite(expiresAt)
    || createdAt > Date.now() + 5 * 60_000 || expiresAt <= Date.now()
    || expiresAt > createdAt + 24 * 60 * 60_000
    || canonicalJson(attestation.resources) !== canonicalJson(expectedResources)
    || ![attestation.pagesArtifactDigest, attestation.workerArtifactDigest]
      .every(digest => /^[a-f0-9]{64}$/u.test(digest))) {
    throw new Error('crm_search_task18_external_attestation_drift')
  }
  for (const raw of [attestation.pagesHealthUrl, attestation.workerHealthUrl]) {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || (!url.hostname.endsWith('.pages.dev') && !url.hostname.endsWith('.workers.dev'))) {
      throw new Error('crm_search_task18_external_attestation_url_invalid')
    }
  }
  return attestation
}

describe('CRM search external provider guard', () => {
  it('has no generic DATABASE_URL escape hatch and fails closed on partial Task18 evidence', () => {
    const sourceText = readFileSync(new URL('./crmSearchPostgresProvider.test.ts', import.meta.url), 'utf8')
    expect(sourceText).not.toMatch(/process\.env\.DATABASE_URL\b/u)
    if (anyExternalInput) expect(completeExternalInput).toBe(true)
    else expect(completeExternalInput).toBe(false)
  })

  describe.skipIf(!completeExternalInput)('verified Task18 isolated preview readback', () => {
    it('checks the exact deployed Pages and Worker health evidence without mutating resources', async () => {
      const attestation = verifyTask18ExternalAttestation()
      const [pages, worker] = await Promise.all([
        fetch(attestation.pagesHealthUrl, { method: 'GET', redirect: 'error' }),
        fetch(attestation.workerHealthUrl, { method: 'GET', redirect: 'error' })
      ])
      expect(pages.ok).toBe(true)
      expect(worker.ok).toBe(true)
      const [pagesBody, workerBody] = await Promise.all([pages.json(), worker.json()])
      expect(pagesBody).toMatchObject({
        status: 'ready',
        deployedSha: attestation.implementationSha,
        artifactDigest: attestation.pagesArtifactDigest
      })
      expect(workerBody).toMatchObject({
        status: 'ready',
        deployedSha: attestation.implementationSha,
        artifactDigest: attestation.workerArtifactDigest
      })
    })
  })
})
