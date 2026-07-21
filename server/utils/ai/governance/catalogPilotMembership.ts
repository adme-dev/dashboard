import { queryRows, transaction } from '~~/server/utils/db'
import type { CatalogReleaseKind, CatalogReleaseState } from './catalogReleaseGovernance'

export interface CatalogPilotRelease {
  id: string
  kind: CatalogReleaseKind
  departmentId: string
  state: CatalogReleaseState
  rolloutScope: 'pilot' | 'department'
}

export interface CatalogPilotMembership {
  id: string
  releaseId: string
  kind: CatalogReleaseKind
  departmentId: string
  memberUserId: string
  memberName: string
  assignedBy: string
  assignmentReason: string
  assignedAt: string
  eligible: boolean
}

export interface CatalogPilotMembershipMutationInput {
  kind: CatalogReleaseKind
  releaseId: string
  memberUserId: string
  actorUserId: string
  reason: string
}

export interface CatalogPilotMembershipTransaction {
  lockRelease(kind: CatalogReleaseKind, releaseId: string): Promise<CatalogPilotRelease | null>
  getEligibleDepartmentMember(
    departmentId: string,
    memberUserId: string
  ): Promise<{ userId: string, name: string } | null>
  getActiveMembership(
    kind: CatalogReleaseKind,
    releaseId: string,
    memberUserId: string
  ): Promise<CatalogPilotMembership | null>
  insertMembership(input: {
    kind: CatalogReleaseKind
    releaseId: string
    departmentId: string
    memberUserId: string
    memberName: string
    actorUserId: string
    reason: string
  }): Promise<CatalogPilotMembership>
  revokeMembership(
    current: CatalogPilotMembership,
    input: { actorUserId: string, reason: string }
  ): Promise<CatalogPilotMembership>
}

export interface CatalogPilotMembershipRepository {
  transaction<T>(callback: (tx: CatalogPilotMembershipTransaction) => Promise<T>): Promise<T>
}

export interface CatalogPilotMembershipReadDb {
  queryRows<T>(sql: string, params?: unknown[]): Promise<T[]>
}

export class CatalogPilotMembershipError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'CatalogPilotMembershipError'
  }
}

const ENROLLABLE_RELEASE_STATES = new Set<CatalogReleaseState>(['draft', 'pilot', 'suspended'])

function validatedReason(input: string): string {
  const reason = input.trim()
  if (reason.length < 1 || reason.length > 2_000) {
    throw new CatalogPilotMembershipError('invalid_reason', 422, 'Reason must contain 1 to 2000 characters')
  }
  return reason
}

export async function enrollCatalogPilotMember(
  input: CatalogPilotMembershipMutationInput,
  repository: CatalogPilotMembershipRepository = postgresCatalogPilotMembershipRepository
): Promise<{ created: boolean, membership: CatalogPilotMembership }> {
  const reason = validatedReason(input.reason)
  return repository.transaction(async (tx) => {
    const release = await tx.lockRelease(input.kind, input.releaseId)
    if (!release) {
      throw new CatalogPilotMembershipError('pilot_release_not_found', 404, 'Catalog release not found')
    }
    if (!ENROLLABLE_RELEASE_STATES.has(release.state)) {
      throw new CatalogPilotMembershipError(
        'pilot_release_state_invalid',
        409,
        `Pilot membership cannot be changed for a ${release.state} release`
      )
    }

    const member = await tx.getEligibleDepartmentMember(release.departmentId, input.memberUserId)
    if (!member) {
      throw new CatalogPilotMembershipError(
        'pilot_member_ineligible',
        422,
        'Pilot member must be an active member of the release department'
      )
    }
    const existing = await tx.getActiveMembership(input.kind, input.releaseId, input.memberUserId)
    if (existing) return { created: false, membership: existing }

    const membership = await tx.insertMembership({
      kind: input.kind,
      releaseId: input.releaseId,
      departmentId: release.departmentId,
      memberUserId: member.userId,
      memberName: member.name,
      actorUserId: input.actorUserId,
      reason
    })
    return { created: true, membership }
  })
}

export async function revokeCatalogPilotMember(
  input: CatalogPilotMembershipMutationInput,
  repository: CatalogPilotMembershipRepository = postgresCatalogPilotMembershipRepository
): Promise<{ removed: boolean, membership: CatalogPilotMembership | null }> {
  const reason = validatedReason(input.reason)
  return repository.transaction(async (tx) => {
    const release = await tx.lockRelease(input.kind, input.releaseId)
    if (!release) {
      throw new CatalogPilotMembershipError('pilot_release_not_found', 404, 'Catalog release not found')
    }
    const existing = await tx.getActiveMembership(input.kind, input.releaseId, input.memberUserId)
    if (!existing) return { removed: false, membership: null }
    const membership = await tx.revokeMembership(existing, {
      actorUserId: input.actorUserId,
      reason
    })
    return { removed: true, membership }
  })
}

interface CatalogPilotSqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>
}

type PilotMembershipDbRow = {
  id: string
  release_id: string
  release_kind: CatalogReleaseKind
  department_id: string
  team_member_id: string
  member_name: string
  assigned_by: string
  assignment_reason: string
  assigned_at: string | Date
  eligible: boolean
}

const RELEASE_TABLES = {
  pack: { table: 'ai_pack_releases', membershipColumn: 'pack_release_id' },
  capability: { table: 'ai_capability_releases', membershipColumn: 'capability_release_id' }
} as const

function mapMembership(row: PilotMembershipDbRow): CatalogPilotMembership {
  return {
    id: row.id,
    releaseId: row.release_id,
    kind: row.release_kind,
    departmentId: row.department_id,
    memberUserId: row.team_member_id,
    memberName: row.member_name,
    assignedBy: row.assigned_by,
    assignmentReason: row.assignment_reason,
    assignedAt: new Date(row.assigned_at).toISOString(),
    eligible: row.eligible === true
  }
}

const defaultReadDb: CatalogPilotMembershipReadDb = {
  queryRows: queryRows as CatalogPilotMembershipReadDb['queryRows']
}

export async function listCatalogPilotMembers(
  input: { kind: CatalogReleaseKind, releaseId: string },
  db: CatalogPilotMembershipReadDb = defaultReadDb
): Promise<{ release: CatalogPilotRelease, memberships: CatalogPilotMembership[] }> {
  const config = RELEASE_TABLES[input.kind]
  const releases = await db.queryRows<{
    id: string
    department_id: string
    release_state: CatalogReleaseState
    rollout_scope: 'pilot' | 'department'
  }>(
    `SELECT id, department_id, release_state, rollout_scope
       FROM ${config.table}
      WHERE id = $1`,
    [input.releaseId]
  )
  const releaseRow = releases[0]
  if (!releaseRow) {
    throw new CatalogPilotMembershipError('pilot_release_not_found', 404, 'Catalog release not found')
  }

  const rows = await db.queryRows<PilotMembershipDbRow>(
    `SELECT pilot.id, pilot.${config.membershipColumn} AS release_id, pilot.release_kind,
            pilot.department_id, pilot.team_member_id, member.name AS member_name,
            pilot.assigned_by, pilot.assignment_reason, pilot.assigned_at,
            (
              member.is_active = TRUE
              AND EXISTS (
                SELECT 1 FROM department_members current_membership
                 WHERE current_membership.department_id = pilot.department_id
                   AND current_membership.team_member_id = pilot.team_member_id
              )
            ) AS eligible
       FROM ai_release_pilot_members pilot
       JOIN team_members member ON member.id = pilot.team_member_id
      WHERE pilot.release_kind = $1
        AND pilot.${config.membershipColumn} = $2
        AND pilot.revoked_at IS NULL
      ORDER BY member.name, pilot.team_member_id
      LIMIT 101`,
    [input.kind, input.releaseId]
  )
  if (rows.length > 100) {
    throw new CatalogPilotMembershipError(
      'pilot_cohort_unbounded',
      409,
      'Pilot cohort exceeds the supported limit of 100 members'
    )
  }
  return {
    release: {
      id: releaseRow.id,
      kind: input.kind,
      departmentId: releaseRow.department_id,
      state: releaseRow.release_state,
      rolloutScope: releaseRow.rollout_scope
    },
    memberships: rows.map(mapMembership)
  }
}

export function createPostgresCatalogPilotMembershipTransaction(
  db: CatalogPilotSqlClient
): CatalogPilotMembershipTransaction {
  return {
    async lockRelease(kind, releaseId) {
      const config = RELEASE_TABLES[kind]
      const result = await db.query(
        `SELECT id, department_id, release_state, rollout_scope
           FROM ${config.table}
          WHERE id = $1
          FOR UPDATE`,
        [releaseId]
      )
      const row = result.rows[0] as {
        id: string
        department_id: string
        release_state: CatalogReleaseState
        rollout_scope: 'pilot' | 'department'
      } | undefined
      return row
        ? {
            id: row.id,
            kind,
            departmentId: row.department_id,
            state: row.release_state,
            rolloutScope: row.rollout_scope
          }
        : null
    },

    async getEligibleDepartmentMember(departmentId, memberUserId) {
      const result = await db.query(
        `SELECT member.id AS user_id, member.name
           FROM department_members membership
           JOIN team_members member ON member.id = membership.team_member_id
          WHERE membership.department_id = $1
            AND membership.team_member_id = $2
            AND member.is_active = TRUE`,
        [departmentId, memberUserId]
      )
      const row = result.rows[0] as { user_id: string, name: string } | undefined
      return row ? { userId: row.user_id, name: row.name } : null
    },

    async getActiveMembership(kind, releaseId, memberUserId) {
      const config = RELEASE_TABLES[kind]
      const result = await db.query(
        `SELECT pilot.id, pilot.${config.membershipColumn} AS release_id, pilot.release_kind,
                pilot.department_id, pilot.team_member_id, member.name AS member_name,
                pilot.assigned_by, pilot.assignment_reason, pilot.assigned_at,
                (
                  member.is_active = TRUE
                  AND EXISTS (
                    SELECT 1 FROM department_members current_membership
                     WHERE current_membership.department_id = pilot.department_id
                       AND current_membership.team_member_id = pilot.team_member_id
                  )
                ) AS eligible
           FROM ai_release_pilot_members pilot
           JOIN team_members member ON member.id = pilot.team_member_id
          WHERE pilot.release_kind = $1
            AND pilot.${config.membershipColumn} = $2
            AND pilot.team_member_id = $3
            AND pilot.revoked_at IS NULL
          FOR UPDATE OF pilot`,
        [kind, releaseId, memberUserId]
      )
      const row = result.rows[0] as PilotMembershipDbRow | undefined
      return row ? mapMembership(row) : null
    },

    async insertMembership(input) {
      const config = RELEASE_TABLES[input.kind]
      const result = await db.query(
        `INSERT INTO ai_release_pilot_members (
           release_kind, ${config.membershipColumn}, department_id, team_member_id,
           assigned_by, assignment_reason
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, ${config.membershipColumn} AS release_id, release_kind,
                   department_id, team_member_id, $7::text AS member_name,
                   assigned_by, assignment_reason, assigned_at, $8::boolean AS eligible`,
        [
          input.kind,
          input.releaseId,
          input.departmentId,
          input.memberUserId,
          input.actorUserId,
          input.reason,
          input.memberName,
          true
        ]
      )
      return mapMembership(result.rows[0] as PilotMembershipDbRow)
    },

    async revokeMembership(current, input) {
      await db.query(
        `UPDATE ai_release_pilot_members
            SET revoked_at = NOW(), revoked_by = $2, revocation_reason = $3
          WHERE id = $1 AND revoked_at IS NULL`,
        [current.id, input.actorUserId, input.reason]
      )
      return current
    }
  }
}

export const postgresCatalogPilotMembershipRepository: CatalogPilotMembershipRepository = {
  transaction(callback) {
    return transaction(db => callback(
      createPostgresCatalogPilotMembershipTransaction(db as unknown as CatalogPilotSqlClient)
    ))
  }
}
