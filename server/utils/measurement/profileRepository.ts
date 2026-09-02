import {
  execute as defaultExecute,
  queryOne as defaultQueryOne,
  transaction as defaultTransaction
} from '~~/server/utils/db'
import { ClientMeasurementProfileStateSchema } from '~~/server/utils/measurement/contracts'
import type {
  ClientMeasurementProfileState,
  MeasurementActor
} from '~~/server/utils/measurement/contracts'

export type MeasurementProfile = ClientMeasurementProfileState

export interface PersistProfileUpdate {
  clientId: string
  expectedVersion: number
  nextProfile: MeasurementProfile
  changedFields: string[]
  actor: MeasurementActor
  reason: string
}

export type PersistProfileUpdateResult
  = { status: 'updated', profile: MeasurementProfile }
    | { status: 'not_found' }
    | { status: 'version_conflict', currentVersion: number }

export interface CachePublicationRecord {
  clientId: string
  profileId: string
  configVersion: number
  status: 'fresh' | 'stale' | 'error'
  errorClass: string | null
}

export interface MeasurementProfileRepository {
  getByClientId(
    clientId: string,
    options?: { createIfMissing?: boolean }
  ): Promise<MeasurementProfile | null>
  update(input: PersistProfileUpdate): Promise<PersistProfileUpdateResult>
  recordCachePublication(input: CachePublicationRecord): Promise<boolean>
}

interface MeasurementProfileRow {
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

const PROFILE_COLUMNS = `
  id, client_id, desired_enabled, desired_state_source, enabled, environment,
  collection_tier, tracking_site_id,
  first_party_hostname, hostname_status, consent_mode, vertical,
  outcome_authority, native_lifecycle_mode, portal_outcome_mode, config_version,
  cache_status, cache_version, cache_error_class, created_at, updated_at
`

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function mapMeasurementProfileRow(row: MeasurementProfileRow): MeasurementProfile {
  return ClientMeasurementProfileStateSchema.parse({
    id: row.id,
    clientId: row.client_id,
    desiredEnabled: row.desired_enabled,
    desiredStateSource: row.desired_state_source,
    enabled: row.enabled,
    environment: row.environment,
    collectionTier: row.collection_tier,
    trackingSiteId: row.tracking_site_id,
    firstPartyHostname: row.first_party_hostname,
    hostnameStatus: row.hostname_status,
    consentMode: row.consent_mode,
    vertical: row.vertical,
    outcomeAuthority: row.outcome_authority,
    nativeLifecycleMode: row.native_lifecycle_mode,
    portalOutcomeMode: row.portal_outcome_mode,
    configVersion: Number(row.config_version),
    cacheStatus: row.cache_status,
    cacheVersion: row.cache_version === null ? null : Number(row.cache_version),
    cacheErrorClass: row.cache_error_class,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  })
}

function auditAction(before: MeasurementProfile, after: MeasurementProfile) {
  if (before.enabled && !after.enabled) return 'disabled'
  if (!before.enabled && after.enabled) return 'enabled'
  if (before.environment !== 'paused' && after.environment === 'paused') return 'paused'
  return 'updated'
}

export interface PostgresMeasurementProfileRepositoryDeps {
  queryOne: typeof defaultQueryOne
  execute: typeof defaultExecute
  transaction: typeof defaultTransaction
}

const defaultDeps: PostgresMeasurementProfileRepositoryDeps = {
  queryOne: defaultQueryOne,
  execute: defaultExecute,
  transaction: defaultTransaction
}

export function createPostgresMeasurementProfileRepository(
  deps: PostgresMeasurementProfileRepositoryDeps = defaultDeps
): MeasurementProfileRepository {
  return {
    async getByClientId(clientId, options) {
      if (options?.createIfMissing) {
        await deps.execute(
          `INSERT INTO client_measurement_profiles (
             client_id, vertical, desired_enabled, desired_state_source
           )
           SELECT id, COALESCE(NULLIF(TRIM(industry), ''), 'general'),
                  TRUE, 'new_client_default'
             FROM agency_clients
            WHERE id = $1
           ON CONFLICT (client_id) DO NOTHING`,
          [clientId]
        )
        const row = await deps.queryOne<MeasurementProfileRow>(
          `SELECT ${PROFILE_COLUMNS}
             FROM client_measurement_profiles
            WHERE client_id = $1`,
          [clientId]
        )
        return row ? mapMeasurementProfileRow(row) : null
      }

      const row = await deps.queryOne<MeasurementProfileRow>(
        `SELECT ${PROFILE_COLUMNS}
           FROM client_measurement_profiles
          WHERE client_id = $1`,
        [clientId]
      )
      return row ? mapMeasurementProfileRow(row) : null
    },

    async update(input) {
      return deps.transaction(async (db) => {
        const currentResult = await db.query(
          `SELECT ${PROFILE_COLUMNS}
             FROM client_measurement_profiles
            WHERE client_id = $1
            FOR UPDATE`,
          [input.clientId]
        )
        const currentRow = currentResult.rows?.[0] as MeasurementProfileRow | undefined
        if (!currentRow) return { status: 'not_found' as const }

        const current = mapMeasurementProfileRow(currentRow)
        if (current.configVersion !== input.expectedVersion) {
          return {
            status: 'version_conflict' as const,
            currentVersion: current.configVersion
          }
        }

        const next = input.nextProfile
        const updatedResult = await db.query(
          `UPDATE client_measurement_profiles
              SET desired_enabled = $4,
                  desired_state_source = $5,
                  enabled = $6,
                  environment = $7,
                  collection_tier = $8,
                  tracking_site_id = $9,
                  first_party_hostname = $10,
                  hostname_status = $11,
                  consent_mode = $12,
                  vertical = $13,
                  outcome_authority = $14,
                  native_lifecycle_mode = $15,
                  portal_outcome_mode = $16,
                  config_version = config_version + 1,
                  cache_status = 'not_published',
                  cache_version = NULL,
                  cache_error_class = NULL,
                  live_approved_by = NULL,
                  live_approved_at = NULL,
                  privacy_approved_by = NULL,
                  privacy_approved_at = NULL,
                  updated_by = $17
            WHERE client_id = $1
              AND id = $2
              AND config_version = $3
        RETURNING ${PROFILE_COLUMNS}`,
          [
            input.clientId,
            current.id,
            input.expectedVersion,
            next.desiredEnabled,
            next.desiredStateSource,
            next.enabled,
            next.environment,
            next.collectionTier,
            next.trackingSiteId,
            next.firstPartyHostname,
            next.hostnameStatus,
            next.consentMode,
            next.vertical,
            next.outcomeAuthority,
            next.nativeLifecycleMode,
            next.portalOutcomeMode,
            input.actor.id
          ]
        )
        const updatedRow = updatedResult.rows?.[0] as MeasurementProfileRow | undefined
        if (!updatedRow) {
          return {
            status: 'version_conflict' as const,
            currentVersion: current.configVersion
          }
        }
        const updated = mapMeasurementProfileRow(updatedRow)

        await db.query(
          `INSERT INTO measurement_config_audit (
             client_id, profile_id, entity_type, entity_id, action,
             config_version, before_state, after_state, changed_fields,
             actor_type, actor_id, reason
           ) VALUES ($1, $2, 'profile', $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)`,
          [
            input.clientId,
            current.id,
            auditAction(current, updated),
            updated.configVersion,
            JSON.stringify(current),
            JSON.stringify(updated),
            input.changedFields,
            input.actor.type,
            input.actor.id,
            input.reason
          ]
        )

        return { status: 'updated' as const, profile: updated }
      })
    },

    async recordCachePublication(input) {
      const affectedRows = await deps.execute(
        `UPDATE client_measurement_profiles
            SET cache_status = $4,
                cache_version = CASE WHEN $4 = 'fresh' THEN $3 ELSE NULL END,
                cache_error_class = $5
          WHERE client_id = $1
            AND id = $2
            AND config_version = $3`,
        [
          input.clientId,
          input.profileId,
          input.configVersion,
          input.status,
          input.errorClass
        ]
      )
      return affectedRows === 1
    }
  }
}
