import { transaction } from '~~/server/utils/db'

export type CatalogReleaseKind = 'pack' | 'capability'
export type CatalogReleaseState = 'draft' | 'pilot' | 'active' | 'suspended' | 'retired'
export type CatalogReleaseTargetState = Exclude<CatalogReleaseState, 'draft'>

export interface CatalogReleaseRecord {
  id: string
  kind: CatalogReleaseKind
  entityId: string
  versionId: string
  departmentId: string
  state: CatalogReleaseState
  evaluationRunId: string | null
  evaluationGatePassed: boolean | null
  evaluationRunStatus: 'completed' | null
  changeReason: string
  changedBy: string
  updatedAt: string
}

export interface CatalogEvaluationEvidence {
  id: string
  departmentId: string
  packVersionId: string | null
  capabilityVersionId: string | null
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  gatePassed: boolean | null
}

export interface CatalogReleaseAudit {
  departmentId: string
  entityType: CatalogReleaseKind
  entityId: string
  action: 'pilot' | 'activated' | 'suspended' | 'retired'
  previousVersionId: string
  nextVersionId: string
  evaluationRunId: string | null
  actorUserId: string
  reason: string
  details: {
    releaseId: string
    previousReleaseState: CatalogReleaseState
    nextReleaseState: CatalogReleaseTargetState
  }
}

export interface CatalogReleaseTransaction {
  lockRelease(kind: CatalogReleaseKind, id: string): Promise<CatalogReleaseRecord | null>
  getEvaluationEvidence(id: string): Promise<CatalogEvaluationEvidence | null>
  updateRelease(next: CatalogReleaseRecord): Promise<CatalogReleaseRecord>
  appendAudit(event: CatalogReleaseAudit): Promise<void>
}

export interface CatalogReleaseRepository {
  transaction<T>(callback: (transaction: CatalogReleaseTransaction) => Promise<T>): Promise<T>
}

export interface CatalogReleaseTransitionRequest {
  kind: CatalogReleaseKind
  releaseId: string
  targetState: CatalogReleaseTargetState
  evaluationRunId: string | null
  expectedUpdatedAt: string
  reason: string
  actorUserId: string
}

export class CatalogGovernanceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'CatalogGovernanceError'
  }
}

const ALLOWED_TRANSITIONS: Record<CatalogReleaseState, readonly CatalogReleaseTargetState[]> = {
  draft: ['pilot', 'retired'],
  pilot: ['active', 'suspended', 'retired'],
  active: ['suspended', 'retired'],
  suspended: ['pilot', 'active', 'retired'],
  retired: []
}

const AUDIT_ACTION: Record<CatalogReleaseTargetState, CatalogReleaseAudit['action']> = {
  pilot: 'pilot',
  active: 'activated',
  suspended: 'suspended',
  retired: 'retired'
}

function sameInstant(left: string, right: string): boolean {
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime
}

function validateRequest(request: CatalogReleaseTransitionRequest): string {
  const reason = request.reason.trim()
  if (reason.length < 1 || reason.length > 2_000) {
    throw new CatalogGovernanceError('invalid_reason', 422, 'Reason must contain 1 to 2000 characters')
  }
  if (!Number.isFinite(Date.parse(request.expectedUpdatedAt))) {
    throw new CatalogGovernanceError('invalid_expected_updated_at', 422, 'Expected update timestamp is invalid')
  }
  if ((request.targetState === 'pilot' || request.targetState === 'active') && !request.evaluationRunId) {
    throw new CatalogGovernanceError('evaluation_required', 422, 'A passing evaluation run is required')
  }
  return reason
}

function assertEligibleEvidence(
  release: CatalogReleaseRecord,
  evidence: CatalogEvaluationEvidence | null
): asserts evidence is CatalogEvaluationEvidence {
  const targetVersionId = release.kind === 'pack'
    ? evidence?.packVersionId
    : evidence?.capabilityVersionId
  if (
    !evidence
    || evidence.status !== 'completed'
    || evidence.gatePassed !== true
    || evidence.departmentId !== release.departmentId
    || targetVersionId !== release.versionId
  ) {
    throw new CatalogGovernanceError(
      'evaluation_not_eligible',
      422,
      'Evaluation evidence must be completed, passing, and bound to the exact release version'
    )
  }
}

function isActiveReleaseConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown, constraint?: unknown }
  return candidate.code === '23505' && (
    candidate.constraint === 'idx_ai_capability_releases_one_active'
    || candidate.constraint === 'idx_ai_pack_releases_one_active'
  )
}

export async function transitionCatalogRelease(
  request: CatalogReleaseTransitionRequest,
  repository: CatalogReleaseRepository = postgresCatalogReleaseRepository
): Promise<CatalogReleaseRecord> {
  const reason = validateRequest(request)

  try {
    return await repository.transaction(async (tx) => {
      const current = await tx.lockRelease(request.kind, request.releaseId)
      if (!current) {
        throw new CatalogGovernanceError('release_not_found', 404, 'Catalog release not found')
      }
      if (!sameInstant(current.updatedAt, request.expectedUpdatedAt)) {
        throw new CatalogGovernanceError(
          'release_version_conflict',
          409,
          'Catalog release changed after it was loaded'
        )
      }
      if (!ALLOWED_TRANSITIONS[current.state].includes(request.targetState)) {
        throw new CatalogGovernanceError(
          'invalid_release_transition',
          409,
          `Cannot transition a ${current.state} release to ${request.targetState}`
        )
      }

      let evaluationRunId = current.evaluationRunId
      let evaluationGatePassed = current.evaluationGatePassed
      let evaluationRunStatus = current.evaluationRunStatus

      if (request.targetState === 'pilot' || request.targetState === 'active') {
        const evidence = await tx.getEvaluationEvidence(request.evaluationRunId as string)
        assertEligibleEvidence(current, evidence)
        evaluationRunId = evidence.id
        evaluationGatePassed = true
        evaluationRunStatus = 'completed'
      }

      const next = await tx.updateRelease({
        ...current,
        state: request.targetState,
        evaluationRunId,
        evaluationGatePassed,
        evaluationRunStatus,
        changeReason: reason,
        changedBy: request.actorUserId,
        updatedAt: new Date().toISOString()
      })

      await tx.appendAudit({
        departmentId: current.departmentId,
        entityType: current.kind,
        entityId: current.entityId,
        action: AUDIT_ACTION[request.targetState],
        previousVersionId: current.versionId,
        nextVersionId: current.versionId,
        evaluationRunId: next.evaluationRunId,
        actorUserId: request.actorUserId,
        reason,
        details: {
          releaseId: current.id,
          previousReleaseState: current.state,
          nextReleaseState: request.targetState
        }
      })

      return next
    })
  } catch (error) {
    if (error instanceof CatalogGovernanceError) throw error
    if (isActiveReleaseConflict(error)) {
      throw new CatalogGovernanceError(
        'active_release_conflict',
        409,
        'Another version of this catalog entity is already active'
      )
    }
    throw error
  }
}

type DbReleaseRow = {
  id: string
  entity_id: string
  version_id: string
  department_id: string
  release_state: CatalogReleaseState
  evaluation_run_id: string | null
  evaluation_gate_passed: boolean | null
  evaluation_run_status: 'completed' | null
  change_reason: string
  changed_by: string
  updated_at: string | Date
}

type DbEvaluationRow = {
  id: string
  department_id: string
  pack_version_id: string | null
  capability_version_id: string | null
  status: CatalogEvaluationEvidence['status']
  gate_passed: boolean | null
}

const RELEASE_TABLES = {
  pack: {
    table: 'ai_pack_releases',
    entityColumn: 'pack_id',
    versionColumn: 'pack_version_id'
  },
  capability: {
    table: 'ai_capability_releases',
    entityColumn: 'capability_id',
    versionColumn: 'capability_version_id'
  }
} as const

function mapRelease(row: DbReleaseRow, kind: CatalogReleaseKind): CatalogReleaseRecord {
  return {
    id: row.id,
    kind,
    entityId: row.entity_id,
    versionId: row.version_id,
    departmentId: row.department_id,
    state: row.release_state,
    evaluationRunId: row.evaluation_run_id,
    evaluationGatePassed: row.evaluation_gate_passed,
    evaluationRunStatus: row.evaluation_run_status,
    changeReason: row.change_reason,
    changedBy: row.changed_by,
    updatedAt: new Date(row.updated_at).toISOString()
  }
}

interface CatalogSqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>
}

export function createPostgresCatalogReleaseTransaction(db: CatalogSqlClient): CatalogReleaseTransaction {
  return {
    async lockRelease(kind, id) {
      const config = RELEASE_TABLES[kind]
      const result = await db.query(
        `SELECT id, ${config.entityColumn} AS entity_id, ${config.versionColumn} AS version_id,
                department_id, release_state, evaluation_run_id, evaluation_gate_passed,
                evaluation_run_status, change_reason, changed_by, updated_at
           FROM ${config.table}
          WHERE id = $1
          FOR UPDATE`,
        [id]
      )
      return result.rows[0] ? mapRelease(result.rows[0] as DbReleaseRow, kind) : null
    },

    async getEvaluationEvidence(id) {
      const result = await db.query(
        `SELECT id, department_id, pack_version_id, capability_version_id, status, gate_passed
           FROM ai_eval_runs
          WHERE id = $1`,
        [id]
      )
      const row = result.rows[0] as DbEvaluationRow | undefined
      if (!row) return null
      return {
        id: row.id,
        departmentId: row.department_id,
        packVersionId: row.pack_version_id,
        capabilityVersionId: row.capability_version_id,
        status: row.status,
        gatePassed: row.gate_passed
      }
    },

    async updateRelease(next) {
      const config = RELEASE_TABLES[next.kind]
      const result = await db.query(
        `UPDATE ${config.table}
            SET release_state = $2,
                evaluation_run_id = $3,
                evaluation_gate_passed = $4,
                evaluation_run_status = $5,
                change_reason = $6,
                changed_by = $7,
                updated_at = NOW()
          WHERE id = $1
        RETURNING id, ${config.entityColumn} AS entity_id, ${config.versionColumn} AS version_id,
                  department_id, release_state, evaluation_run_id, evaluation_gate_passed,
                  evaluation_run_status, change_reason, changed_by, updated_at`,
        [
          next.id,
          next.state,
          next.evaluationRunId,
          next.evaluationGatePassed,
          next.evaluationRunStatus,
          next.changeReason,
          next.changedBy
        ]
      )
      const row = result.rows[0] as DbReleaseRow | undefined
      if (!row) {
        throw new CatalogGovernanceError('release_update_failed', 409, 'Catalog release could not be updated')
      }
      return mapRelease(row, next.kind)
    },

    async appendAudit(event) {
      await db.query(
        `INSERT INTO ai_catalog_audit_events (
           department_id, entity_type, entity_id, action,
           previous_version_id, next_version_id, evaluation_run_id,
           actor_user_id, reason, details
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
          event.departmentId,
          event.entityType,
          event.entityId,
          event.action,
          event.previousVersionId,
          event.nextVersionId,
          event.evaluationRunId,
          event.actorUserId,
          event.reason,
          JSON.stringify(event.details)
        ]
      )
    }
  }
}

export const postgresCatalogReleaseRepository: CatalogReleaseRepository = {
  transaction(callback) {
    return transaction(db => callback(createPostgresCatalogReleaseTransaction(db as unknown as CatalogSqlClient)))
  }
}
