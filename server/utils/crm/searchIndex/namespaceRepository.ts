import {
  deriveCrmSearchNamespaceIdentity,
  type CrmSearchDerivedIdentity
} from './identity'
import {
  forecastCrmSearchCapacity,
  CRM_SEARCH_VECTORIZE_MAX_NAMESPACES,
  CRM_SEARCH_VECTORIZE_MAX_VECTORS
} from './usage'
import {
  crmSearchRepositoryDependencies,
  crmSearchRepositoryError,
  firstRow,
  requireDigest,
  requireEnum,
  requireOptionalTimestamp,
  requireSafeInteger,
  requireString,
  requireUuid,
  type CrmSearchTransactionWithoutRetry
} from './repository'

const errorCode = 'crm_search_capacity_unproven'
const namespaceStates = [
  'allocated',
  'active',
  'teardown_pending',
  'provider_confirmed_empty',
  'retired'
] as const

interface NamespaceRow extends Record<string, unknown> {
  id: unknown
  organisation_scope_id: unknown
  client_id: unknown
  namespace: unknown
  source_tuple_digest: unknown
  derivation_revision: unknown
  state: unknown
  provider_confirmed_empty_at: unknown
}

export interface CrmSearchNamespaceRecord {
  id: string
  organisationScopeId: string
  clientId: string
  namespace: string
  sourceTupleDigest: string
  derivationRevision: string
  state: typeof namespaceStates[number]
  providerConfirmedEmptyAt: string | null
}

export interface AllocateCrmSearchNamespaceInput {
  organisationScopeId: string
  clientId: string
  limits: {
    namespaces: number | null | undefined
    vectors: number | null | undefined
  }
}

export interface NamespaceRepositoryDependencies {
  deriveNamespaceIdentity?: typeof deriveCrmSearchNamespaceIdentity
  transactionWithoutRetry?: CrmSearchTransactionWithoutRetry
}

function mapNamespace(row: NamespaceRow): CrmSearchNamespaceRecord {
  return {
    id: requireUuid(row.id, errorCode),
    organisationScopeId: requireUuid(row.organisation_scope_id, errorCode),
    clientId: requireUuid(row.client_id, errorCode),
    namespace: requireString(row.namespace, errorCode, {
      minimumLength: 16,
      maximumLength: 64,
      pattern: /^[A-Za-z0-9_-]+$/
    }),
    sourceTupleDigest: requireDigest(row.source_tuple_digest, errorCode),
    derivationRevision: requireString(row.derivation_revision, errorCode, { maximumLength: 120 }),
    state: requireEnum(row.state, namespaceStates, errorCode),
    providerConfirmedEmptyAt: requireOptionalTimestamp(row.provider_confirmed_empty_at, errorCode)
  }
}

function requireLimits(input: AllocateCrmSearchNamespaceInput['limits']): {
  namespaces: number
  vectors: number
} {
  const namespaces = requireSafeInteger(input?.namespaces, errorCode, {
    minimum: 1,
    maximum: CRM_SEARCH_VECTORIZE_MAX_NAMESPACES
  })
  const vectors = requireSafeInteger(input?.vectors, errorCode, {
    minimum: 1,
    maximum: CRM_SEARCH_VECTORIZE_MAX_VECTORS
  })
  return { namespaces, vectors }
}

function requireIdentity(identity: CrmSearchDerivedIdentity): CrmSearchDerivedIdentity {
  requireString(identity?.value, errorCode, {
    minimumLength: 16,
    maximumLength: 64,
    pattern: /^[A-Za-z0-9_-]+$/
  })
  requireString(identity?.sourceTuple, errorCode, { maximumLength: 2000 })
  requireDigest(identity?.sourceTupleDigest, errorCode)
  requireString(identity?.derivationRevision, errorCode, { maximumLength: 120 })
  return identity
}

function inventoryFromRow(row: Record<string, unknown>, addNamespace: boolean) {
  const bucket = (prefix: string) => ({
    namespaces: requireSafeInteger(row[`${prefix}_namespaces`], errorCode),
    vectors: requireSafeInteger(row[`${prefix}_vectors`], errorCode)
  })
  const active = bucket('active')
  if (addNamespace) active.namespaces += 1
  return {
    active,
    candidate: bucket('candidate'),
    retiring: bucket('retiring'),
    sentinel: bucket('sentinel'),
    deletionPending: bucket('deletion_pending')
  }
}

export async function allocateCrmSearchNamespace(
  input: AllocateCrmSearchNamespaceInput,
  dependencies: NamespaceRepositoryDependencies = {}
): Promise<CrmSearchNamespaceRecord> {
  const organisationScopeId = requireUuid(input.organisationScopeId, errorCode)
  const clientId = requireUuid(input.clientId, errorCode)
  const limits = requireLimits(input.limits)
  const deriveIdentity = dependencies.deriveNamespaceIdentity ?? deriveCrmSearchNamespaceIdentity
  const identity = requireIdentity(await deriveIdentity({ organisationScopeId, clientId }))
  const run = dependencies.transactionWithoutRetry
    ?? crmSearchRepositoryDependencies.transactionWithoutRetry

  return run(async (transaction) => {
    await transaction.query(`
      SELECT
        pg_advisory_xact_lock(hashtextextended($1, 0)),
        pg_advisory_xact_lock(hashtextextended($2, 0)),
        pg_advisory_xact_lock(hashtextextended($3, 0))
    `, [
      'crm-search-namespace-capacity-global',
      `crm-search-namespace-owner:${organisationScopeId}:${clientId}`,
      `crm-search-namespace-value:${identity.value}`
    ])

    const existingRow = firstRow<NamespaceRow>(await transaction.query<NamespaceRow>(`
      SELECT id, organisation_scope_id, client_id, namespace, source_tuple_digest,
             derivation_revision, state, provider_confirmed_empty_at
      FROM crm_search_namespaces
      WHERE (organisation_scope_id = $1 AND client_id = $2)
         OR namespace = $3
      FOR UPDATE
    `, [organisationScopeId, clientId, identity.value]))
    const existing = existingRow ? mapNamespace(existingRow) : null
    if (existing && (existing.organisationScopeId !== organisationScopeId
      || existing.clientId !== clientId
      || existing.namespace !== identity.value
      || existing.sourceTupleDigest !== identity.sourceTupleDigest
      || existing.derivationRevision !== identity.derivationRevision)) {
      throw crmSearchRepositoryError('crm_search_namespace_collision')
    }
    if (existing && existing.state !== 'provider_confirmed_empty') {
      if (existing.state === 'teardown_pending' || existing.state === 'retired') {
        throw crmSearchRepositoryError('crm_search_namespace_not_empty')
      }
      return existing
    }
    if (existing && !existing.providerConfirmedEmptyAt) {
      throw crmSearchRepositoryError('crm_search_namespace_not_empty')
    }

    const capacity = firstRow(await transaction.query(`
      WITH classified_documents AS (
        SELECT
          document.namespace,
          CASE
            WHEN document.schema_version = policy.active_schema_version THEN 'active'
            WHEN document.schema_version = policy.candidate_schema_version THEN 'candidate'
            ELSE 'retiring'
          END AS role
        FROM crm_search_documents document
        LEFT JOIN crm_search_policies policy
          ON policy.organisation_scope_id = document.organisation_scope_id
         AND policy.client_id = document.client_id
        WHERE document.confirmation_state NOT IN ('absent', 'deleted')
      ), deletion_inventory AS (
        SELECT namespace
        FROM crm_search_teardown_vectors
        WHERE deletion_state <> 'confirmed_absent'
      ), sentinel_inventory AS (
        SELECT id
        FROM crm_search_schema_versions
        WHERE sentinel_state IN ('upsert_pending', 'query_verified', 'delete_pending')
      )
      SELECT
        (SELECT COUNT(*) FROM crm_search_namespaces
          WHERE state IN ('allocated', 'active'))::TEXT AS active_namespaces,
        (SELECT COUNT(*) FROM classified_documents WHERE role = 'active')::TEXT AS active_vectors,
        (SELECT COUNT(DISTINCT namespace) FROM classified_documents
          WHERE role = 'candidate')::TEXT AS candidate_namespaces,
        (SELECT COUNT(*) FROM classified_documents WHERE role = 'candidate')::TEXT AS candidate_vectors,
        (SELECT COUNT(DISTINCT namespace) FROM classified_documents
          WHERE role = 'retiring')::TEXT AS retiring_namespaces,
        (SELECT COUNT(*) FROM classified_documents WHERE role = 'retiring')::TEXT AS retiring_vectors,
        (SELECT COUNT(*) FROM sentinel_inventory)::TEXT AS sentinel_namespaces,
        (SELECT COUNT(*) FROM sentinel_inventory)::TEXT AS sentinel_vectors,
        (SELECT COUNT(DISTINCT namespace) FROM deletion_inventory)::TEXT
          AS deletion_pending_namespaces,
        (SELECT COUNT(*) FROM deletion_inventory)::TEXT AS deletion_pending_vectors
    `))
    if (!capacity) throw crmSearchRepositoryError(errorCode)
    const forecast = forecastCrmSearchCapacity({
      limits,
      inventory: inventoryFromRow(capacity, true)
    })
    if (!forecast.capacityReady) throw crmSearchRepositoryError(errorCode)

    const write = existing
      ? await transaction.query<NamespaceRow>(`
          UPDATE crm_search_namespaces
          SET state = 'allocated', provider_confirmed_empty_at = NULL, updated_at = NOW()
          WHERE id = $1
            AND state = 'provider_confirmed_empty'
            AND provider_confirmed_empty_at IS NOT NULL
            AND source_tuple_digest = $2
          RETURNING *
        `, [existing.id, identity.sourceTupleDigest])
      : await transaction.query<NamespaceRow>(`
          INSERT INTO crm_search_namespaces (
            organisation_scope_id, client_id, namespace, source_tuple_digest,
            derivation_revision, state
          ) VALUES ($1, $2, $3, $4, $5, 'allocated')
          RETURNING *
        `, [organisationScopeId, clientId, identity.value,
          identity.sourceTupleDigest, identity.derivationRevision])
    const stored = firstRow(write)
    if (!stored) throw crmSearchRepositoryError(errorCode)
    return mapNamespace(stored)
  })
}
