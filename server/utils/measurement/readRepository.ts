import {
  query as defaultQuery,
  queryOne as defaultQueryOne
} from '~~/server/utils/db'
import { MeasurementAuditEntrySchema } from '~~/server/utils/measurement/contracts'
import type {
  ListMeasurementAudit,
  MeasurementAuditEntry
} from '~~/server/utils/measurement/contracts'

interface AuditRow {
  id: string
  profile_id: string
  entity_type: string
  entity_id: string
  action: string
  config_version: number | string
  changed_fields: string[]
  actor_type: string
  actor_id: string | null
  reason: string
  request_id: string | null
  created_at: Date | string
}

interface ReadinessRow {
  client_id: string
  profile_id: string
  config_version: number | string
  desired_enabled: boolean
  profile_enabled: boolean
  profile_environment: 'test' | 'live' | 'paused'
  cache_status: 'not_published' | 'fresh' | 'stale' | 'error'
  outcome_authority: 'zero_native' | 'client_webhook' | 'connector_sync' | 'manual_import'
  live_approved: boolean
  privacy_approved: boolean
  destinations: number | string
  ready_destinations: number | string
  degraded_destinations: number | string
  blocked_destinations: number | string
  capabilities: number | string
  ready_capabilities: number | string
  degraded_capabilities: number | string
  blocked_capabilities: number | string
  active_mappings: number | string
  outcome_endpoints: number | string
  ready_outcome_endpoints: number | string
  last_validated_at: Date | string | null
  last_success_at: Date | string | null
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function optionalIso(value: Date | string | null): string | null {
  return value === null ? null : iso(value)
}

function mapAudit(row: AuditRow): MeasurementAuditEntry {
  return MeasurementAuditEntrySchema.parse({
    id: row.id,
    profileId: row.profile_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    configVersion: Number(row.config_version),
    changedFields: row.changed_fields,
    actorType: row.actor_type,
    actorId: row.actor_id,
    reason: row.reason,
    requestId: row.request_id,
    createdAt: iso(row.created_at)
  })
}

export interface MeasurementAuditPage {
  items: MeasurementAuditEntry[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

export interface MeasurementReadinessEvidence {
  clientId: string
  profileId: string
  configVersion: number
  profile: {
    desiredEnabled: boolean
    enabled: boolean
    environment: 'test' | 'live' | 'paused'
    cacheStatus: 'not_published' | 'fresh' | 'stale' | 'error'
    outcomeAuthority: 'zero_native' | 'client_webhook' | 'connector_sync' | 'manual_import'
  }
  liveApproved: boolean
  privacyApproved: boolean
  counts: {
    destinations: number
    readyDestinations: number
    degradedDestinations: number
    blockedDestinations: number
    capabilities: number
    readyCapabilities: number
    degradedCapabilities: number
    blockedCapabilities: number
    activeMappings: number
    outcomeEndpoints: number
    readyOutcomeEndpoints: number
  }
  lastValidatedAt: string | null
  lastSuccessAt: string | null
}

export interface MeasurementReadRepository {
  listAudit(input: ListMeasurementAudit): Promise<MeasurementAuditPage>
  getReadinessEvidence(clientId: string): Promise<MeasurementReadinessEvidence | null>
}

export interface PostgresMeasurementReadRepositoryDeps {
  query: typeof defaultQuery
  queryOne: typeof defaultQueryOne
}

const defaultDeps: PostgresMeasurementReadRepositoryDeps = {
  query: defaultQuery,
  queryOne: defaultQueryOne
}

export function createPostgresMeasurementReadRepository(
  deps: PostgresMeasurementReadRepositoryDeps = defaultDeps
): MeasurementReadRepository {
  return {
    async listAudit(input) {
      const countRow = await deps.queryOne<{ count: number | string }>(
        `SELECT COUNT(*) AS count
           FROM measurement_config_audit
          WHERE client_id = $1
            AND ($2::text IS NULL OR entity_type = $2)`,
        [input.clientId, input.entityType ?? null]
      )
      const totalItems = Number(countRow?.count ?? 0)
      const offset = (input.page - 1) * input.pageSize
      const rows = await deps.query<AuditRow>(
        `SELECT id, profile_id, entity_type, entity_id, action,
                config_version, changed_fields, actor_type, actor_id,
                reason, request_id, created_at
           FROM measurement_config_audit
          WHERE client_id = $1
            AND ($2::text IS NULL OR entity_type = $2)
          ORDER BY created_at DESC, id DESC
          LIMIT $3 OFFSET $4`,
        [input.clientId, input.entityType ?? null, input.pageSize, offset]
      )

      return {
        items: rows.map(mapAudit),
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / input.pageSize)
        }
      }
    },

    async getReadinessEvidence(clientId) {
      const row = await deps.queryOne<ReadinessRow>(
        `SELECT p.client_id,
                p.id AS profile_id,
                p.config_version,
                p.desired_enabled,
                p.enabled AS profile_enabled,
                p.environment AS profile_environment,
                p.cache_status,
                p.outcome_authority,
                COALESCE(approvals.live_approved, FALSE) AS live_approved,
                COALESCE(approvals.privacy_approved, FALSE) AS privacy_approved,
                COALESCE(d.destinations, 0) AS destinations,
                COALESCE(d.ready_destinations, 0) AS ready_destinations,
                COALESCE(d.degraded_destinations, 0) AS degraded_destinations,
                COALESCE(d.blocked_destinations, 0) AS blocked_destinations,
                COALESCE(c.capabilities, 0) AS capabilities,
                COALESCE(c.ready_capabilities, 0) AS ready_capabilities,
                COALESCE(c.degraded_capabilities, 0) AS degraded_capabilities,
                COALESCE(c.blocked_capabilities, 0) AS blocked_capabilities,
                COALESCE(m.active_mappings, 0) AS active_mappings,
                COALESCE(oe.outcome_endpoints, 0) AS outcome_endpoints,
                COALESCE(oe.ready_outcome_endpoints, 0) AS ready_outcome_endpoints,
                d.last_validated_at,
                d.last_success_at
           FROM client_measurement_profiles p
           LEFT JOIN LATERAL (
             SELECT BOOL_OR(a.approval_kind = 'live') AS live_approved,
                    BOOL_OR(a.approval_kind = 'privacy') AS privacy_approved
               FROM measurement_activation_approvals a
              WHERE a.client_id = p.client_id
                AND a.profile_id = p.id
                AND a.config_version = p.config_version
           ) approvals ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS destinations,
                    COUNT(*) FILTER (WHERE health_status = 'ready') AS ready_destinations,
                    COUNT(*) FILTER (WHERE health_status = 'degraded') AS degraded_destinations,
                    COUNT(*) FILTER (WHERE health_status = 'blocked') AS blocked_destinations,
                    MAX(last_validated_at) AS last_validated_at,
                    MAX(last_success_at) AS last_success_at
               FROM conversion_destinations
              WHERE client_id = p.client_id
                AND profile_id = p.id
           ) d ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS capabilities,
                    COUNT(*) FILTER (WHERE status = 'ready') AS ready_capabilities,
                    COUNT(*) FILTER (WHERE status = 'degraded') AS degraded_capabilities,
                    COUNT(*) FILTER (WHERE status = 'blocked') AS blocked_capabilities
               FROM conversion_destination_capabilities
              WHERE client_id = p.client_id
           ) c ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*) FILTER (WHERE is_active) AS active_mappings
               FROM conversion_event_mappings
              WHERE client_id = p.client_id
           ) m ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS outcome_endpoints,
                    COUNT(*) FILTER (WHERE status IN ('test', 'live')) AS ready_outcome_endpoints
               FROM outcome_endpoints
              WHERE client_id = p.client_id
                AND profile_id = p.id
           ) oe ON TRUE
          WHERE p.client_id = $1`,
        [clientId]
      )
      if (!row) return null

      return {
        clientId: row.client_id,
        profileId: row.profile_id,
        configVersion: Number(row.config_version),
        profile: {
          desiredEnabled: row.desired_enabled,
          enabled: row.profile_enabled,
          environment: row.profile_environment,
          cacheStatus: row.cache_status,
          outcomeAuthority: row.outcome_authority
        },
        liveApproved: row.live_approved,
        privacyApproved: row.privacy_approved,
        counts: {
          destinations: Number(row.destinations),
          readyDestinations: Number(row.ready_destinations),
          degradedDestinations: Number(row.degraded_destinations),
          blockedDestinations: Number(row.blocked_destinations),
          capabilities: Number(row.capabilities),
          readyCapabilities: Number(row.ready_capabilities),
          degradedCapabilities: Number(row.degraded_capabilities),
          blockedCapabilities: Number(row.blocked_capabilities),
          activeMappings: Number(row.active_mappings),
          outcomeEndpoints: Number(row.outcome_endpoints),
          readyOutcomeEndpoints: Number(row.ready_outcome_endpoints)
        },
        lastValidatedAt: optionalIso(row.last_validated_at),
        lastSuccessAt: optionalIso(row.last_success_at)
      }
    }
  }
}
