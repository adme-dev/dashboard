import { transaction as defaultTransaction } from '~~/server/utils/db'
import { MeasurementActivationApprovalSchema } from '~~/server/utils/measurement/contracts'
import type {
  ActivateMeasurementProfile,
  ApproveMeasurementActivation,
  MeasurementActivationApproval
} from '~~/server/utils/measurement/contracts'
import {
  mapMeasurementProfileRow,
  type MeasurementProfile
} from '~~/server/utils/measurement/profileRepository'

interface ProfileRow {
  id: string
  client_id: string
  desired_enabled: boolean
  desired_state_source: string
  enabled: boolean
  environment: string
  collection_tier: string
  tracking_site_id: string | null
  first_party_hostname: string | null
  hostname_status: string
  consent_mode: string
  vertical: string
  outcome_authority: string
  native_lifecycle_mode: string
  portal_outcome_mode: string
  config_version: number | string
  cache_status: string
  cache_version: number | string | null
  cache_error_class: string | null
  created_at: Date | string
  updated_at: Date | string
}

interface ApprovalRow {
  id: string
  client_id: string
  profile_id: string
  config_version: number | string
  approval_kind: string
  approved_by: string
  reason: string
  separation_override: boolean
  created_at: Date | string
}

interface ApprovalIdentityRow {
  approval_kind: 'privacy' | 'live'
  approved_by: string
  separation_override: boolean
  created_at: Date | string
}

interface ReadinessRow {
  destinations: number | string
  ready_destinations: number | string
  capabilities: number | string
  ready_capabilities: number | string
  active_mappings: number | string
  outcome_endpoints: number | string
  ready_outcome_endpoints: number | string
}

const PROFILE_COLUMNS = `
  id, client_id, desired_enabled, desired_state_source, enabled, environment,
  collection_tier, tracking_site_id,
  first_party_hostname, hostname_status, consent_mode, vertical,
  outcome_authority, native_lifecycle_mode, portal_outcome_mode, config_version,
  cache_status, cache_version, cache_error_class, created_at, updated_at
`

const APPROVAL_COLUMNS = `
  id, client_id, profile_id, config_version, approval_kind,
  approved_by, reason, separation_override, created_at
`

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapApproval(row: ApprovalRow): MeasurementActivationApproval {
  return MeasurementActivationApprovalSchema.parse({
    id: row.id,
    clientId: row.client_id,
    profileId: row.profile_id,
    configVersion: Number(row.config_version),
    approvalKind: row.approval_kind,
    approvedBy: row.approved_by,
    reason: row.reason,
    separationOverride: row.separation_override,
    createdAt: iso(row.created_at)
  })
}

export type ApprovalResult
  = { status: 'approved', approval: MeasurementActivationApproval }
    | { status: 'not_found' }
    | { status: 'not_available' }
    | { status: 'duplicate_approval' }
    | { status: 'approver_conflict' }
    | { status: 'version_conflict', currentVersion: number }

export type ActivationBlocker
  = 'desired_disabled'
    | 'cache_stale'
    | 'hostname_not_ready'
    | 'approval_missing'
    | 'approver_conflict'
    | 'no_destinations'
    | 'destination_not_ready'
    | 'capability_not_ready'
    | 'no_active_mappings'
    | 'outcome_endpoint_not_ready'

export type ActivationResult
  = { status: 'activated', profile: MeasurementProfile, activatedDestinations: number }
    | { status: 'not_found' }
    | { status: 'already_active' }
    | { status: 'not_ready', blockers: ActivationBlocker[] }
    | { status: 'version_conflict', currentVersion: number }

export interface MeasurementActivationRepository {
  approve(input: ApproveMeasurementActivation): Promise<ApprovalResult>
  activate(input: ActivateMeasurementProfile): Promise<ActivationResult>
}

export interface PostgresMeasurementActivationRepositoryDeps {
  transaction: typeof defaultTransaction
}

const defaultDeps: PostgresMeasurementActivationRepositoryDeps = {
  transaction: defaultTransaction
}

export function createPostgresMeasurementActivationRepository(
  deps: PostgresMeasurementActivationRepositoryDeps = defaultDeps
): MeasurementActivationRepository {
  return {
    async approve(input) {
      try {
        return await deps.transaction(async (db) => {
          const profileResult = await db.query(
            `SELECT ${PROFILE_COLUMNS}
               FROM client_measurement_profiles
              WHERE client_id = $1
              FOR UPDATE`,
            [input.clientId]
          )
          const profileRow = profileResult.rows?.[0] as ProfileRow | undefined
          if (!profileRow) return { status: 'not_found' as const }
          const profile = mapMeasurementProfileRow(profileRow)
          if (profile.configVersion !== input.expectedConfigVersion) {
            return {
              status: 'version_conflict' as const,
              currentVersion: profile.configVersion
            }
          }
          if (!profile.desiredEnabled || profile.enabled || profile.environment !== 'test') {
            return { status: 'not_available' as const }
          }

          const existingResult = await db.query(
            `SELECT approval_kind, approved_by, separation_override
               FROM measurement_activation_approvals
              WHERE client_id = $1
                AND profile_id = $2
                AND config_version = $3`,
            [input.clientId, profile.id, profile.configVersion]
          )
          const existingApprovals = existingResult.rows as ApprovalIdentityRow[]
          if (existingApprovals.some(approval => (
            approval.approval_kind === input.approvalKind
          ))) return { status: 'duplicate_approval' as const }
          if (
            existingApprovals.some(approval => approval.approved_by === input.actor.id)
            && !input.separationOverride
          ) {
            return { status: 'approver_conflict' as const }
          }

          const approvalResult = await db.query(
            `INSERT INTO measurement_activation_approvals (
               client_id, profile_id, config_version, approval_kind,
               approved_by, reason, separation_override
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING ${APPROVAL_COLUMNS}`,
            [
              input.clientId,
              profile.id,
              profile.configVersion,
              input.approvalKind,
              input.actor.id,
              input.reason,
              input.separationOverride
            ]
          )
          const approval = mapApproval(approvalResult.rows[0] as ApprovalRow)

          await db.query(
            `INSERT INTO measurement_config_audit (
               client_id, profile_id, entity_type, entity_id, action,
               config_version, before_state, after_state, changed_fields,
               actor_type, actor_id, reason
             ) VALUES (
               $1, $2, 'profile', $2, 'approved', $3,
               NULL, $4::jsonb, $5, 'team_member', $6, $7
             )`,
            [
              input.clientId,
              profile.id,
              profile.configVersion,
              JSON.stringify({
                approvalKind: approval.approvalKind,
                approvedBy: approval.approvedBy,
                configVersion: approval.configVersion,
                separationOverride: approval.separationOverride
              }),
              [`${approval.approvalKind}_approval`],
              input.actor.id,
              input.reason
            ]
          )

          return { status: 'approved' as const, approval }
        })
      } catch (error) {
        const dbError = error as { code?: string }
        if (dbError.code === '23505') return { status: 'duplicate_approval' }
        if (dbError.code === '23514') return { status: 'approver_conflict' }
        throw error
      }
    },

    async activate(input) {
      return deps.transaction(async (db) => {
        const profileResult = await db.query(
          `SELECT ${PROFILE_COLUMNS}
             FROM client_measurement_profiles
            WHERE client_id = $1
            FOR UPDATE`,
          [input.clientId]
        )
        const profileRow = profileResult.rows?.[0] as ProfileRow | undefined
        if (!profileRow) return { status: 'not_found' as const }
        const profile = mapMeasurementProfileRow(profileRow)
        if (profile.configVersion !== input.expectedConfigVersion) {
          return {
            status: 'version_conflict' as const,
            currentVersion: profile.configVersion
          }
        }
        if (profile.enabled || profile.environment === 'live') {
          return { status: 'already_active' as const }
        }
        if (!profile.desiredEnabled) {
          return { status: 'not_ready' as const, blockers: ['desired_disabled' as const] }
        }

        const approvalResult = await db.query(
          `SELECT approval.approval_kind,
                  approval.approved_by,
                  CASE
                    WHEN approval.separation_override THEN EXISTS (
                      SELECT 1
                        FROM team_members owner
                       WHERE owner.id = approval.approved_by
                         AND owner.user_role = 'owner'
                         AND owner.is_active = TRUE
                    )
                    ELSE FALSE
                  END AS separation_override,
                  approval.created_at
             FROM measurement_activation_approvals approval
            WHERE approval.client_id = $1
              AND approval.profile_id = $2
              AND approval.config_version = $3
            ORDER BY approval.approval_kind ASC`,
          [input.clientId, profile.id, profile.configVersion]
        )
        const approvals = approvalResult.rows as ApprovalIdentityRow[]
        const privacyApproval = approvals.find(approval => approval.approval_kind === 'privacy')
        const liveApproval = approvals.find(approval => approval.approval_kind === 'live')

        const readinessResult = await db.query(
          `SELECT COUNT(DISTINCT d.id) AS destinations,
                  COUNT(DISTINCT d.id) FILTER (WHERE d.health_status = 'ready') AS ready_destinations,
                  COUNT(DISTINCT c.id) AS capabilities,
                  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'ready') AS ready_capabilities,
                  COUNT(DISTINCT m.id) FILTER (WHERE m.is_active) AS active_mappings,
                  (SELECT COUNT(*)
                     FROM outcome_endpoints oe
                    WHERE oe.client_id = $1
                      AND oe.profile_id = $2) AS outcome_endpoints,
                  (SELECT COUNT(*)
                     FROM outcome_endpoints oe
                    WHERE oe.client_id = $1
                      AND oe.profile_id = $2
                      AND oe.status IN ('test', 'live')) AS ready_outcome_endpoints
             FROM conversion_destinations d
             LEFT JOIN conversion_destination_capabilities c
               ON c.client_id = d.client_id
              AND c.destination_id = d.id
             LEFT JOIN conversion_event_mappings m
               ON m.client_id = d.client_id
              AND m.destination_id = d.id
            WHERE d.client_id = $1
              AND d.profile_id = $2`,
          [input.clientId, profile.id]
        )
        const readiness = readinessResult.rows?.[0] as ReadinessRow
        const destinations = Number(readiness.destinations)
        const readyDestinations = Number(readiness.ready_destinations)
        const capabilities = Number(readiness.capabilities)
        const readyCapabilities = Number(readiness.ready_capabilities)
        const activeMappings = Number(readiness.active_mappings)
        const readyOutcomeEndpoints = Number(readiness.ready_outcome_endpoints)
        const blockers: ActivationBlocker[] = []

        if (profile.cacheStatus !== 'fresh' || profile.cacheVersion !== profile.configVersion) {
          blockers.push('cache_stale')
        }
        if (profile.collectionTier === 'first_party_cname' && profile.hostnameStatus !== 'active') {
          blockers.push('hostname_not_ready')
        }
        if (!privacyApproval || !liveApproval) blockers.push('approval_missing')
        if (
          privacyApproval
          && liveApproval
          && privacyApproval.approved_by === liveApproval.approved_by
          && !liveApproval.separation_override
        ) {
          blockers.push('approver_conflict')
        }
        if (destinations === 0) blockers.push('no_destinations')
        else if (readyDestinations !== destinations) blockers.push('destination_not_ready')
        if (capabilities === 0 || readyCapabilities !== capabilities) {
          blockers.push('capability_not_ready')
        }
        if (activeMappings === 0) blockers.push('no_active_mappings')
        if (profile.outcomeAuthority === 'client_webhook' && readyOutcomeEndpoints === 0) {
          blockers.push('outcome_endpoint_not_ready')
        }
        if (blockers.length > 0) return { status: 'not_ready' as const, blockers }

        const nextVersion = profile.configVersion + 1
        const updatedProfileResult = await db.query(
          `UPDATE client_measurement_profiles
              SET enabled = TRUE,
                  environment = 'live',
                  config_version = $3,
                  cache_status = 'not_published',
                  cache_version = NULL,
                  cache_error_class = NULL,
                  privacy_approved_by = $4,
                  privacy_approved_at = $5,
                  live_approved_by = $6,
                  live_approved_at = $7,
                  updated_by = $8,
                  updated_at = NOW()
            WHERE client_id = $1
              AND id = $2
          RETURNING ${PROFILE_COLUMNS}`,
          [
            input.clientId,
            profile.id,
            nextVersion,
            privacyApproval!.approved_by,
            privacyApproval!.created_at,
            liveApproval!.approved_by,
            liveApproval!.created_at,
            input.actor.id
          ]
        )
        const updatedProfile = mapMeasurementProfileRow(
          updatedProfileResult.rows[0] as ProfileRow
        )

        await db.query(
          `UPDATE conversion_destinations
              SET enabled = TRUE,
                  environment = 'live',
                  config_version = $3,
                  updated_by = $4,
                  updated_at = NOW()
            WHERE client_id = $1
              AND profile_id = $2`,
          [input.clientId, profile.id, nextVersion, input.actor.id]
        )
        await db.query(
          `UPDATE conversion_destination_capabilities
              SET config_version = $3,
                  updated_at = NOW()
            WHERE client_id = $1
              AND destination_id IN (
                SELECT id FROM conversion_destinations WHERE client_id = $1 AND profile_id = $2
              )`,
          [input.clientId, profile.id, nextVersion]
        )
        await db.query(
          `UPDATE conversion_event_mappings
              SET config_version = $3,
                  updated_by = $4,
                  updated_at = NOW()
            WHERE client_id = $1
              AND destination_id IN (
                SELECT id FROM conversion_destinations WHERE client_id = $1 AND profile_id = $2
              )`,
          [input.clientId, profile.id, nextVersion, input.actor.id]
        )

        await db.query(
          `INSERT INTO measurement_config_audit (
             client_id, profile_id, entity_type, entity_id, action,
             config_version, before_state, after_state, changed_fields,
             actor_type, actor_id, reason
           ) VALUES (
             $1, $2, 'profile', $2, 'activated', $3,
             $4::jsonb, $5::jsonb, $6, 'team_member', $7, $8
           )`,
          [
            input.clientId,
            profile.id,
            nextVersion,
            JSON.stringify(profile),
            JSON.stringify(updatedProfile),
            ['enabled', 'environment', 'config_version'],
            input.actor.id,
            input.reason
          ]
        )

        return {
          status: 'activated' as const,
          profile: updatedProfile,
          activatedDestinations: destinations
        }
      })
    }
  }
}
