import { createHash, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const SHA = /^[a-f0-9]{40}$/u
const DIGEST = /^[a-f0-9]{64}$/u
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
const REQUIRED_MIGRATION_PATHS = Object.freeze([
  'server/database/migrations/350_crm_search_expand.sql',
  'server/database/migrations/351_crm_search_validate_backfill.sql',
  'server/database/migrations/352_crm_search_activate_capture.sql'
])

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  throw new Error('crm_search_neon_attestation_noncanonical')
}

function digest(value) {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex')
}

function workspaceMigrationDigests() {
  return Object.fromEntries(REQUIRED_MIGRATION_PATHS.map(file => [
    file,
    createHash('sha256').update(readFileSync(new URL(`../../${file}`, import.meta.url))).digest('hex')
  ]))
}

function assertDirectEndpoint(endpoint, trustedSharedEndpointDenyset) {
  const firstLabel = endpoint?.host?.split('.')[0] || ''
  const endpointFromHost = firstLabel.replace(/-pooler$/u, '')
  if (!endpoint?.id || !endpoint?.branchId || endpointFromHost !== endpoint.id
    || !endpoint.host.endsWith('.neon.tech') || !firstLabel.startsWith('ep-')
    || firstLabel.endsWith('-pooler')
    || !Array.isArray(trustedSharedEndpointDenyset) || trustedSharedEndpointDenyset.length === 0
    || new Set(trustedSharedEndpointDenyset).size !== trustedSharedEndpointDenyset.length
    || trustedSharedEndpointDenyset.some(value => !/^ep-[a-z0-9-]{3,119}$/iu.test(value))
    || trustedSharedEndpointDenyset.includes(endpoint.id)) {
    throw new Error('crm_search_neon_endpoint_invalid')
  }
  const identity = `${endpoint.id} ${endpoint.branchId}`.toLowerCase()
  if (/(^|[^a-z])(prod|production|main|primary|shared|default)([^a-z]|$)/u.test(identity)) {
    throw new Error('crm_search_neon_endpoint_invalid')
  }
}

function requireMutationAuthorization(value, plan) {
  const keys = [
    'version', 'purpose', 'environment', 'approvalId', 'approvalRevision',
    'approvalType', 'projectId', 'expiresAt'
  ]
  if (!value || Object.keys(value).sort().join('\0') !== keys.sort().join('\0')
    || value.version !== 'crm-search-neon-mutation-authorization-v1'
    || value.purpose !== 'crm-search-task18-neon-lifecycle'
    || value.environment !== 'preview' || value.approvalType !== 'production_migration'
    || value.projectId !== plan.projectId || !UUID.test(value.approvalId)
    || !Number.isSafeInteger(value.approvalRevision) || value.approvalRevision < 1
    || !Number.isFinite(Date.parse(value.expiresAt)) || Date.now() >= Date.parse(value.expiresAt)) {
    throw new Error('crm_search_neon_mutation_authorization_invalid')
  }
}

export function buildNeonLifecyclePlan(input) {
  if (!input.projectId || input.projectId !== input.expectedProjectId) {
    throw new Error('crm_search_neon_project_mismatch')
  }
  if (!input.parentBranchId?.startsWith('br-') || !SHA.test(input.implementationSha)) {
    throw new Error('crm_search_neon_plan_invalid')
  }
  const expiresAt = new Date(input.nowMs + 6 * 60 * 60 * 1_000).toISOString()
  return Object.freeze({
    projectId: input.projectId,
    create: {
      branch: {
        name: `crm-search-e2e-${input.implementationSha.slice(0, 12)}`,
        parent_id: input.parentBranchId,
        init_source: 'schema-only',
        expires_at: expiresAt
      },
      endpoints: [{ type: 'read_write' }]
    },
    pollOperations: true,
    assertEmptyTables: ['crm_people', 'crm_companies', 'crm_opportunities'],
    migrations: [350, 351, 352],
    migrationPaths: [...REQUIRED_MIGRATION_PATHS],
    migrationDigests: workspaceMigrationDigests(),
    implementationSha: input.implementationSha
  })
}

export function createNeonTargetAttestation(input) {
  const neonApi = input.neonApi
    ? { ...input.neonApi, endpoint: input.endpoint ?? input.neonApi.endpoint }
    : input.neonApi
  assertDirectEndpoint(neonApi?.endpoint, input.trustedSharedEndpointDenyset)
  if (!input.signing?.signerKeyId || !input.signing?.privateKey) {
    throw new Error('crm_search_neon_attestation_signer_required')
  }
  const unsigned = {
    version: 'crm-search-neon-target-attestation-v1',
    producer: 'scripts/crm-search/neon-lifecycle.mjs',
    sourceGitSha: input.sourceGitSha,
    migrationPaths: input.migrationPaths,
    migrationDigests: input.migrationDigests,
    schemaOnly: true,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    neonApi,
    apiResponseSha256: digest(neonApi),
    signerKeyId: input.signing.signerKeyId,
    signatureAlgorithm: 'ed25519'
  }
  const createdAt = Date.parse(unsigned.createdAt)
  const expiresAt = Date.parse(unsigned.expiresAt)
  const branch = neonApi?.branch
  const exactMigrationDigests = workspaceMigrationDigests()
  if (!SHA.test(unsigned.sourceGitSha)
    || canonical(unsigned.migrationPaths) !== canonical(REQUIRED_MIGRATION_PATHS)
    || Object.keys(unsigned.migrationDigests).sort().join('\0') !== [...REQUIRED_MIGRATION_PATHS].sort().join('\0')
    || Object.values(unsigned.migrationDigests).some(value => !DIGEST.test(value))
    || canonical(unsigned.migrationDigests) !== canonical(exactMigrationDigests)
    || !Number.isFinite(createdAt) || !Number.isFinite(expiresAt)
    || expiresAt <= createdAt || expiresAt > createdAt + 24 * 60 * 60_000
    || !neonApi?.project?.id || !neonApi?.sourceBranch?.id || !branch?.id
    || branch.projectId !== neonApi.project.id || branch.parentId !== neonApi.sourceBranch.id
    || branch.id === neonApi.sourceBranch.id || neonApi.endpoint.branchId !== branch.id
    || branch.name !== `crm-search-e2e-${unsigned.sourceGitSha.slice(0, 12)}`
    || branch.initSource !== 'schema-only'
    || branch.createdAt !== unsigned.createdAt || branch.expiresAt !== unsigned.expiresAt
    || /(^|[^a-z])(prod|production|main|primary|shared|default)([^a-z]|$)/u.test(
      `${neonApi.project.id} ${branch.id} ${branch.name}`.toLowerCase()
    )) {
    throw new Error('crm_search_neon_attestation_invalid')
  }
  const signature = sign(
    null, Buffer.from(canonical(unsigned), 'utf8'), input.signing.privateKey
  ).toString('base64url')
  const signed = { ...unsigned, signature }
  return Object.freeze({ ...signed, attestationSha256: digest(signed) })
}

export function createNeonLifecycleExecutor(options) {
  const fetchImpl = options?.fetchImpl
  const databaseAdapter = options?.databaseAdapter
  const sleep = options?.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
  const maxPolls = options?.maxPolls ?? 120
  if (typeof fetchImpl !== 'function' || !databaseAdapter
    || typeof databaseAdapter.assertEmpty !== 'function'
    || typeof databaseAdapter.applyMigrations !== 'function'
    || typeof options.apiKey !== 'string' || options.apiKey.length < 20
    || !Number.isSafeInteger(maxPolls) || maxPolls < 1 || maxPolls > 240) {
    throw new Error('crm_search_neon_executor_invalid')
  }
  const request = async (pathname, init) => {
    const response = await fetchImpl(`https://console.neon.tech/api/v2${pathname}`, {
      ...init,
      headers: {
        accept: 'application/json', authorization: `Bearer ${options.apiKey}`,
        ...(init?.body ? { 'content-type': 'application/json' } : {})
      }
    })
    if (!response?.ok) throw new Error('crm_search_neon_api_failed')
    return await response.json()
  }
  return async (step) => {
    if (step.action === 'create') {
      return await request(`/projects/${encodeURIComponent(step.projectId)}/branches`, {
        method: 'POST', body: JSON.stringify(step.body)
      })
    }
    if (step.action === 'delete') {
      return await request(
        `/projects/${encodeURIComponent(step.projectId)}/branches/${encodeURIComponent(step.branchId)}`,
        { method: 'DELETE' }
      )
    }
    if (step.action === 'poll') {
      for (const operationId of step.operationIds ?? []) {
        let terminal = false
        for (let attempt = 0; attempt < maxPolls; attempt += 1) {
          const response = await request(
            `/projects/${encodeURIComponent(step.projectId)}/operations/${encodeURIComponent(operationId)}`,
            { method: 'GET' }
          )
          const status = response.operation?.status ?? response.status
          if (['finished', 'succeeded'].includes(status)) {
            terminal = true
            break
          }
          if (['failed', 'cancelled'].includes(status)) throw new Error('crm_search_neon_operation_failed')
          await sleep(1_000)
        }
        if (!terminal) throw new Error('crm_search_neon_operation_timeout')
      }
      return { ok: true }
    }
    if (step.action === 'assert-empty') {
      return await databaseAdapter.assertEmpty({
        projectId: step.projectId, branchId: step.branchId,
        endpoint: step.endpoint, tables: step.tables
      })
    }
    if (step.action === 'migrate') {
      return await databaseAdapter.applyMigrations({
        projectId: step.projectId, branchId: step.branchId, endpoint: step.endpoint,
        migrationPaths: step.migrationPaths, migrationDigests: step.migrationDigests
      })
    }
    throw new Error('crm_search_neon_action_invalid')
  }
}

export async function runNeonLifecycle({
  dryRun, mutationAuthorization, plan, trustedSharedEndpointDenyset, signing, execute
}) {
  if (!plan || typeof execute !== 'function') throw new Error('crm_search_neon_runtime_invalid')
  if (dryRun === true) return { dryRun: true, mutationCount: 0, plan }
  requireMutationAuthorization(mutationAuthorization, plan)
  let branchId = null
  let result
  let lifecycleError
  let cleanupError
  try {
    const created = await execute({ action: 'create', projectId: plan.projectId, body: plan.create })
    branchId = created?.branch?.id ?? created?.branchId
    if (!branchId?.startsWith('br-')) throw new Error('crm_search_neon_create_invalid')
    const operationIds = created.operations?.map(operation => operation.id) ?? created.operationIds
    if (!Array.isArray(operationIds) || operationIds.length === 0) {
      throw new Error('crm_search_neon_operation_ids_required')
    }
    await execute({ action: 'poll', projectId: plan.projectId, branchId, operationIds })
    const endpointRecord = created.endpoints?.find(endpoint => endpoint.branch_id === branchId)
    const endpoint = endpointRecord && {
      id: endpointRecord.id,
      branchId: endpointRecord.branch_id,
      host: endpointRecord.host
    }
    assertDirectEndpoint(endpoint, trustedSharedEndpointDenyset)
    const empty = await execute({
      action: 'assert-empty', projectId: plan.projectId, branchId,
      endpoint, tables: plan.assertEmptyTables
    })
    if (empty?.emptySourceProof !== true) throw new Error('crm_search_neon_empty_source_proof_required')
    await execute({
      action: 'migrate', projectId: plan.projectId, branchId, endpoint,
      migrationPaths: plan.migrationPaths, migrationDigests: plan.migrationDigests
    })
    const branch = created.branch
    const neonApi = {
      project: { id: plan.projectId },
      sourceBranch: { id: plan.create.branch.parent_id },
      branch: {
        id: branch.id,
        projectId: branch.project_id,
        parentId: branch.parent_id,
        name: branch.name,
        initSource: plan.create.branch.init_source,
        createdAt: branch.created_at,
        expiresAt: branch.expires_at
      },
      endpoint
    }
    if (neonApi.branch.projectId !== neonApi.project.id
      || neonApi.branch.parentId !== neonApi.sourceBranch.id
      || neonApi.branch.expiresAt !== plan.create.branch.expires_at) {
      throw new Error('crm_search_neon_api_binding_invalid')
    }
    const attestation = createNeonTargetAttestation({
      sourceGitSha: plan.implementationSha,
      migrationPaths: plan.migrationPaths,
      migrationDigests: plan.migrationDigests,
      createdAt: neonApi.branch.createdAt,
      expiresAt: neonApi.branch.expiresAt,
      neonApi,
      trustedSharedEndpointDenyset,
      signing
    })
    result = { dryRun: false, branchId, attestation }
  } catch (error) {
    lifecycleError = error
  } finally {
    if (branchId) {
      try {
        const deleted = await execute({ action: 'delete', projectId: plan.projectId, branchId })
        const operationIds = deleted?.operations?.map(operation => operation.id) ?? deleted?.operationIds
        if (!Array.isArray(operationIds) || operationIds.length === 0) {
          cleanupError = new Error('crm_search_neon_cleanup_operation_ids_required')
        } else {
          await execute({ action: 'poll', projectId: plan.projectId, branchId, operationIds })
        }
      } catch (error) {
        cleanupError = error
      }
    }
  }
  if (lifecycleError && cleanupError) {
    throw new AggregateError([lifecycleError, cleanupError], 'crm_search_neon_lifecycle_and_cleanup_failed')
  }
  if (lifecycleError) throw lifecycleError
  if (cleanupError) throw cleanupError
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (!process.argv.includes('--dry-run') && !process.argv.includes('--execute')) {
    throw new Error('crm_search_neon_dry_run_required')
  }
  if (process.argv.includes('--execute')) {
    throw new Error('crm_search_neon_injected_executor_required')
  }
  console.log(JSON.stringify({
    status: 'schema-only-ttl-plan',
    mutationCount: 0,
    requires: ['expected-project', 'parent-branch', 'expires_at', 'operation-polling', 'outer-finally']
  }))
}
