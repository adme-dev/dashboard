import {
  query as defaultQuery,
  queryOne as defaultQueryOne,
  transaction as defaultTransaction
} from '~~/server/utils/db'
import { OutcomeEndpointReadModelSchema } from '~~/server/utils/measurement/contracts'
import type {
  CreateOutcomeEndpointConfiguration,
  ListOutcomeEndpoints,
  OutcomeEndpointReadModel
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

interface OutcomeEndpointRow {
  id: string
  client_id: string
  profile_id: string
  endpoint_key: string
  label: string
  source_system: string
  secret_configured: boolean
  secret_version: number | string
  status: string
  replay_window_seconds: number | string
  rate_limit_per_minute: number | string
  config_version: number | string
  last_received_at: Date | string | null
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

const ENDPOINT_COLUMNS = `
  id, client_id, profile_id, endpoint_key, label, source_system,
  (current_secret_ref IS NOT NULL) AS secret_configured, secret_version,
  status, replay_window_seconds, rate_limit_per_minute, config_version,
  last_received_at, created_at, updated_at
`

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function optionalIso(value: Date | string | null): string | null {
  return value === null ? null : iso(value)
}

function mapEndpoint(row: OutcomeEndpointRow): OutcomeEndpointReadModel {
  return OutcomeEndpointReadModelSchema.parse({
    id: row.id,
    clientId: row.client_id,
    profileId: row.profile_id,
    endpointKey: row.endpoint_key,
    label: row.label,
    sourceSystem: row.source_system,
    secretConfigured: row.secret_configured,
    secretVersion: Number(row.secret_version),
    status: row.status,
    replayWindowSeconds: Number(row.replay_window_seconds),
    rateLimitPerMinute: Number(row.rate_limit_per_minute),
    configVersion: Number(row.config_version),
    lastReceivedAt: optionalIso(row.last_received_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  })
}

export interface PersistOutcomeEndpointInput extends CreateOutcomeEndpointConfiguration {
  endpointKey: string
}

export interface OutcomeEndpointPage {
  items: OutcomeEndpointReadModel[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

export type CreateOutcomeEndpointResult
  = { status: 'created', profile: MeasurementProfile, endpoint: OutcomeEndpointReadModel }
    | { status: 'not_found' }
    | { status: 'not_available' }
    | { status: 'duplicate' }
    | { status: 'version_conflict', currentVersion: number }

export interface MeasurementOutcomeEndpointRepository {
  list(input: ListOutcomeEndpoints): Promise<OutcomeEndpointPage>
  create(input: PersistOutcomeEndpointInput): Promise<CreateOutcomeEndpointResult>
}

export interface PostgresMeasurementOutcomeEndpointRepositoryDeps {
  query: typeof defaultQuery
  queryOne: typeof defaultQueryOne
  transaction: typeof defaultTransaction
}

const defaultDeps: PostgresMeasurementOutcomeEndpointRepositoryDeps = {
  query: defaultQuery,
  queryOne: defaultQueryOne,
  transaction: defaultTransaction
}

export function createPostgresMeasurementOutcomeEndpointRepository(
  deps: PostgresMeasurementOutcomeEndpointRepositoryDeps = defaultDeps
): MeasurementOutcomeEndpointRepository {
  return {
    async list(input) {
      const countRow = await deps.queryOne<{ count: number | string }>(
        `SELECT COUNT(*) AS count
           FROM outcome_endpoints
          WHERE client_id = $1`,
        [input.clientId]
      )
      const totalItems = Number(countRow?.count ?? 0)
      const rows = await deps.query<OutcomeEndpointRow>(
        `SELECT ${ENDPOINT_COLUMNS}
           FROM outcome_endpoints
          WHERE client_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2 OFFSET $3`,
        [input.clientId, input.pageSize, (input.page - 1) * input.pageSize]
      )
      return {
        items: rows.map(mapEndpoint),
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / input.pageSize)
        }
      }
    },

    async create(input) {
      try {
        return await deps.transaction(async (db) => {
          const currentResult = await db.query(
            `SELECT ${PROFILE_COLUMNS}
               FROM client_measurement_profiles
              WHERE client_id = $1
              FOR UPDATE`,
            [input.clientId]
          )
          const currentRow = currentResult.rows?.[0] as ProfileRow | undefined
          if (!currentRow) return { status: 'not_found' as const }
          const current = mapMeasurementProfileRow(currentRow)
          if (current.configVersion !== input.expectedProfileVersion) {
            return {
              status: 'version_conflict' as const,
              currentVersion: current.configVersion
            }
          }
          if (current.enabled || current.environment !== 'test') {
            return { status: 'not_available' as const }
          }

          const profileResult = await db.query(
            `UPDATE client_measurement_profiles
                SET config_version = config_version + 1,
                    cache_status = 'not_published',
                    cache_version = NULL,
                    cache_error_class = NULL,
                    live_approved_by = NULL,
                    live_approved_at = NULL,
                    privacy_approved_by = NULL,
                    privacy_approved_at = NULL,
                    updated_by = $3,
                    updated_at = NOW()
              WHERE client_id = $1
                AND config_version = $2
          RETURNING ${PROFILE_COLUMNS}`,
            [input.clientId, input.expectedProfileVersion, input.actor.id]
          )
          const profile = mapMeasurementProfileRow(profileResult.rows[0] as ProfileRow)

          const endpointResult = await db.query(
            `INSERT INTO outcome_endpoints (
               client_id, profile_id, endpoint_key, label, source_system,
               current_secret_ref, status, replay_window_seconds,
               rate_limit_per_minute, config_version, created_by, updated_by
             ) VALUES (
               $1, $2, $3, $4, $5, $6, 'disabled', $7, $8, $9, $10, $10
             )
             RETURNING ${ENDPOINT_COLUMNS}`,
            [
              input.clientId,
              profile.id,
              input.endpointKey,
              input.endpoint.label,
              input.endpoint.sourceSystem,
              input.endpoint.currentSecretRef,
              input.endpoint.replayWindowSeconds,
              input.endpoint.rateLimitPerMinute,
              profile.configVersion,
              input.actor.id
            ]
          )
          const endpoint = mapEndpoint(endpointResult.rows[0] as OutcomeEndpointRow)
          const { endpointKey: _endpointKey, ...auditedEndpoint } = endpoint

          await db.query(
            `INSERT INTO measurement_config_audit (
               client_id, profile_id, entity_type, entity_id, action,
               config_version, before_state, after_state, changed_fields,
               actor_type, actor_id, reason
             ) VALUES (
               $1, $2, 'outcome_endpoint', $3, 'created', $4,
               NULL, $5::jsonb, $6, 'team_member', $7, $8
             )`,
            [
              input.clientId,
              profile.id,
              endpoint.id,
              profile.configVersion,
              JSON.stringify({ ...auditedEndpoint, endpointKeyConfigured: true }),
              ['endpoint', 'secret_reference'],
              input.actor.id,
              input.reason
            ]
          )

          return { status: 'created' as const, profile, endpoint }
        })
      } catch (error) {
        if ((error as { code?: string }).code === '23505') return { status: 'duplicate' }
        throw error
      }
    }
  }
}
