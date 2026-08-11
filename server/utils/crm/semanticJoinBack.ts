import { queryRowsFresh } from '~~/server/utils/db'
import {
  requireCrmRecordAccess,
  type AuthoritativeCrmRecord
} from './recordAccess'
import type { CrmSearchContext } from './searchContext'
import {
  CRM_SEARCH_ENTITY_TYPES,
  type CrmSearchEntityType
} from './searchIndex/contracts'
import { deriveCrmSearchVectorId } from './searchIndex/identity'
import type { CrmSearchSemanticMatch } from './semanticCandidates'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
const providerIdentityPattern = /^[A-Za-z0-9_-]{43}$/u
const schemaVersionPattern = /^crm-search-v[1-9][0-9]{0,5}$/u

export interface CrmSearchLedgerCandidate {
  organisationScopeId: string
  clientId: string
  schemaVersion: string
  namespace: string
  vectorId: string
  entityType: CrmSearchEntityType
  entityId: string
  sourceRevision: number
  confirmationState: string
  tombstone: boolean
}

export interface CrmSearchSemanticCurrentRow {
  organisationScopeId: string
  clientId: string
  entityType: CrmSearchEntityType
  entityId: string
  sourceRevision: number
  deletedAt: string | null
  authorized: boolean
  title: string
  subtitle: string | null
}

export interface CrmSearchJoinedSemanticHit {
  entityType: CrmSearchEntityType
  entityId: string
  title: string
  subtitle: string | null
  score: number
  semanticRank: number
}

export interface CrmSearchSemanticJoinBackDependencies {
  loadLedgerCandidates: (input: {
    organisationScopeId: string
    clientId: string
    activeSchemaVersion: string
    canonicalNamespace: string
    vectorIds: readonly string[]
    confirmationState: 'indexed'
    tombstone: false
  }) => Promise<readonly CrmSearchLedgerCandidate[]>
  revalidateContext: (context: CrmSearchContext) => Promise<CrmSearchContext | null>
  loadCurrentRows: (input: {
    context: CrmSearchContext
    references: readonly {
      entityType: CrmSearchEntityType
      entityId: string
      sourceRevision: number
    }[]
  }) => Promise<readonly CrmSearchSemanticCurrentRow[]>
  recordSecurityRejection: (input: {
    correlationId: string
    reasonClass: 'foreign_candidate' | 'deleted_candidate' | 'stale_candidate' | 'unauthorized_candidate'
    entityType?: CrmSearchEntityType
  }) => Promise<void>
}

interface LedgerRow {
  organisation_scope_id: string
  client_id: string
  schema_version: string
  namespace: string
  vector_id: string
  entity_type: CrmSearchEntityType
  entity_id: string
  source_revision: string | number
  confirmation_state: string
  tombstoned: boolean
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value)
}

function safeRevision(value: unknown): number | null {
  const revision = typeof value === 'string' && /^[0-9]+$/u.test(value)
    ? Number(value)
    : value
  return Number.isSafeInteger(revision) && (revision as number) >= 1
    ? revision as number
    : null
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && [...new Set(left)].sort().join('\u0000') === [...new Set(right)].sort().join('\u0000')
}

function sameAssistantScope(
  left: CrmSearchContext['assistantScope'],
  right: CrmSearchContext['assistantScope']
): boolean {
  if (!left || !right) return left === right
  return left.sourceRevision === right.sourceRevision
    && sameSet(left.clientIds, right.clientIds)
}

function sameAuthority(original: CrmSearchContext, fresh: CrmSearchContext): boolean {
  return original.organisationScopeId === fresh.organisationScopeId
    && original.clientId === fresh.clientId
    && original.actorType === fresh.actorType
    && original.actorId === fresh.actorId
    && original.surface === fresh.surface
    && original.visibility.ownerScoped === fresh.visibility.ownerScoped
    && sameSet(original.permissionSet, fresh.permissionSet)
    && sameAssistantScope(original.assistantScope, fresh.assistantScope)
}

async function rejectCandidate(
  dependencies: CrmSearchSemanticJoinBackDependencies,
  context: CrmSearchContext,
  reasonClass: Parameters<CrmSearchSemanticJoinBackDependencies['recordSecurityRejection']>[0]['reasonClass'],
  entityType?: CrmSearchEntityType
): Promise<void> {
  await dependencies.recordSecurityRejection({
    correlationId: context.correlationId,
    reasonClass,
    ...(entityType ? { entityType } : {})
  })
}

function currentKey(entityType: CrmSearchEntityType, entityId: string): string {
  return `${entityType}:${entityId}`
}

export async function joinBackSemanticCandidates(
  input: {
    context: CrmSearchContext
    activeSchemaVersion: string
    canonicalNamespace: string
    candidates: readonly CrmSearchSemanticMatch[]
  },
  dependencies: CrmSearchSemanticJoinBackDependencies
): Promise<CrmSearchJoinedSemanticHit[]> {
  if (!input || !Array.isArray(input.candidates) || input.candidates.length > 30
    || !schemaVersionPattern.test(input.activeSchemaVersion)
    || !providerIdentityPattern.test(input.canonicalNamespace)) {
    throw new TypeError('CRM search semantic join-back input is invalid')
  }
  if (input.candidates.length === 0) return []

  const ledgers = await dependencies.loadLedgerCandidates({
    organisationScopeId: input.context.organisationScopeId,
    clientId: input.context.clientId,
    activeSchemaVersion: input.activeSchemaVersion,
    canonicalNamespace: input.canonicalNamespace,
    vectorIds: input.candidates.map(candidate => candidate.vectorId),
    confirmationState: 'indexed',
    tombstone: false
  })
  if (!Array.isArray(ledgers)) throw new Error('crm_search_ledger_failure')

  const candidatesByVector = new Map(input.candidates.map(candidate => [candidate.vectorId, candidate]))
  const validLedgers = new Map<string, CrmSearchLedgerCandidate>()
  for (const ledger of ledgers) {
    const sourceRevision = safeRevision(ledger?.sourceRevision)
    const structurallyValid = ledger
      && ledger.organisationScopeId === input.context.organisationScopeId
      && ledger.clientId === input.context.clientId
      && ledger.schemaVersion === input.activeSchemaVersion
      && ledger.namespace === input.canonicalNamespace
      && providerIdentityPattern.test(ledger.vectorId)
      && candidatesByVector.has(ledger.vectorId)
      && CRM_SEARCH_ENTITY_TYPES.includes(ledger.entityType)
      && validUuid(ledger.entityId)
      && sourceRevision !== null
      && ledger.confirmationState === 'indexed'
      && ledger.tombstone === false
    if (!structurallyValid) {
      await rejectCandidate(dependencies, input.context, 'foreign_candidate')
      continue
    }
    const expectedVectorId = await deriveCrmSearchVectorId({
      organisationScopeId: ledger.organisationScopeId,
      clientId: ledger.clientId,
      schemaVersion: ledger.schemaVersion,
      entityType: ledger.entityType,
      entityId: ledger.entityId
    })
    if (expectedVectorId !== ledger.vectorId || validLedgers.has(ledger.vectorId)) {
      await rejectCandidate(dependencies, input.context, 'foreign_candidate', ledger.entityType)
      continue
    }
    validLedgers.set(ledger.vectorId, { ...ledger, sourceRevision })
  }
  if (validLedgers.size === 0) return []

  const freshContext = await dependencies.revalidateContext(input.context)
  if (!freshContext || !sameAuthority(input.context, freshContext)) {
    throw new Error('crm_search_authorization_changed')
  }
  const references = [...validLedgers.values()].map(ledger => ({
    entityType: ledger.entityType,
    entityId: ledger.entityId,
    sourceRevision: ledger.sourceRevision
  }))
  const currentRows = await dependencies.loadCurrentRows({ context: freshContext, references })
  if (!Array.isArray(currentRows)) throw new Error('crm_search_join_back_failure')
  const currentByKey = new Map<string, CrmSearchSemanticCurrentRow>()
  for (const row of currentRows) {
    if (row && CRM_SEARCH_ENTITY_TYPES.includes(row.entityType) && validUuid(row.entityId)) {
      currentByKey.set(currentKey(row.entityType, row.entityId), row)
    }
  }

  const joined: CrmSearchJoinedSemanticHit[] = []
  for (const candidate of input.candidates) {
    const ledger = validLedgers.get(candidate.vectorId)
    if (!ledger) continue
    const current = currentByKey.get(currentKey(ledger.entityType, ledger.entityId))
    if (!current
      || current.organisationScopeId !== input.context.organisationScopeId
      || current.clientId !== input.context.clientId
      || current.entityType !== ledger.entityType
      || current.entityId !== ledger.entityId) {
      await rejectCandidate(dependencies, input.context, 'unauthorized_candidate', ledger.entityType)
      continue
    }
    if (current.deletedAt !== null) {
      await rejectCandidate(dependencies, input.context, 'deleted_candidate', ledger.entityType)
      continue
    }
    if (safeRevision(current.sourceRevision) !== ledger.sourceRevision) {
      await rejectCandidate(dependencies, input.context, 'stale_candidate', ledger.entityType)
      continue
    }
    if (current.authorized !== true
      || typeof current.title !== 'string'
      || (current.subtitle !== null && typeof current.subtitle !== 'string')) {
      await rejectCandidate(dependencies, input.context, 'unauthorized_candidate', ledger.entityType)
      continue
    }
    joined.push({
      entityType: ledger.entityType,
      entityId: ledger.entityId,
      title: current.title,
      subtitle: current.subtitle,
      score: candidate.score,
      semanticRank: candidate.semanticRank
    })
  }
  return joined
}

function boundedText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function projectAuthoritativeRecord(
  context: CrmSearchContext,
  record: AuthoritativeCrmRecord
): CrmSearchSemanticCurrentRow {
  const sourceRevision = safeRevision(record.row.search_revision)
  if (sourceRevision === null) throw new Error('crm_search_join_back_failure')
  let projection: { title: string, subtitle: string | null }
  if (record.type === 'person') {
    projection = {
      title: `${boundedText(record.row.first_name)} ${boundedText(record.row.last_name)}`.trim(),
      subtitle: boundedText(record.row.email) || null
    }
  } else if (record.type === 'company') {
    projection = {
      title: boundedText(record.row.name),
      subtitle: boundedText(record.row.domain) || null
    }
  } else if (record.type === 'opportunity') {
    projection = {
      title: boundedText(record.row.name),
      subtitle: boundedText(record.row.status) || null
    }
  } else {
    throw new Error('crm_search_join_back_failure')
  }
  return {
    organisationScopeId: context.organisationScopeId,
    clientId: context.clientId,
    entityType: record.type,
    entityId: record.id,
    sourceRevision,
    deletedAt: record.row.deleted_at instanceof Date
      ? record.row.deleted_at.toISOString()
      : typeof record.row.deleted_at === 'string' ? record.row.deleted_at : null,
    authorized: true,
    title: projection.title || '(untitled)',
    subtitle: projection.subtitle
  }
}

export function createCrmSemanticJoinBackDependencies(
  revalidateContext: CrmSearchSemanticJoinBackDependencies['revalidateContext'],
  recordSecurityRejection: CrmSearchSemanticJoinBackDependencies['recordSecurityRejection']
    = async () => {}
): CrmSearchSemanticJoinBackDependencies {
  return {
    async loadLedgerCandidates(input) {
      const rows = await queryRowsFresh<LedgerRow>(`
        SELECT organisation_scope_id::text, client_id::text, schema_version,
               namespace, vector_id, entity_type, entity_id::text,
               source_revision, confirmation_state, tombstoned
          FROM crm_search_documents
         WHERE organisation_scope_id = $1
           AND client_id = $2
           AND schema_version = $3
           AND namespace = $4
           AND vector_id = ANY($5::text[])
           AND confirmation_state = 'indexed'
           AND tombstoned = FALSE
         ORDER BY vector_id
      `, [
        input.organisationScopeId,
        input.clientId,
        input.activeSchemaVersion,
        input.canonicalNamespace,
        [...input.vectorIds]
      ])
      return rows.map(row => ({
        organisationScopeId: row.organisation_scope_id,
        clientId: row.client_id,
        schemaVersion: row.schema_version,
        namespace: row.namespace,
        vectorId: row.vector_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        sourceRevision: Number(row.source_revision),
        confirmationState: row.confirmation_state,
        tombstone: row.tombstoned
      }))
    },
    revalidateContext,
    async loadCurrentRows(input) {
      const rows: CrmSearchSemanticCurrentRow[] = []
      for (const reference of input.references) {
        try {
          const record = await requireCrmRecordAccess(input.context, {
            type: reference.entityType,
            id: reference.entityId
          })
          rows.push(projectAuthoritativeRecord(input.context, record))
        } catch (error: unknown) {
          const statusCode = error && typeof error === 'object'
            ? (error as Record<string, unknown>).statusCode
            : null
          if (statusCode !== 404) throw error
        }
      }
      return rows
    },
    recordSecurityRejection
  }
}
