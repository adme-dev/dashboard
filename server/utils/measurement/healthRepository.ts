import { transaction as defaultTransaction } from '~~/server/utils/db'
import type {
  CapabilityStatusSchema,
  RecordDestinationValidationEvidence
} from '~~/server/utils/measurement/contracts'
import type { z } from 'zod'

type HealthStatus = z.infer<typeof CapabilityStatusSchema>

interface ProfileVersionRow {
  id: string
  config_version: number | string
}

interface DestinationVersionRow {
  platform: 'meta' | 'google_data_manager' | 'ga4' | 'tiktok'
  config_version: number | string
  health_status: HealthStatus
}

interface CapabilityIdentityRow {
  id: string
  mode: string
  status: HealthStatus
}

export interface DestinationValidationEvidenceState {
  clientId: string
  destinationId: string
  configVersion: number
  healthStatus: HealthStatus
  observedAt: string
  capabilities: RecordDestinationValidationEvidence['capabilities']
}

export type RecordDestinationValidationResult
  = { status: 'recorded', evidence: DestinationValidationEvidenceState }
    | { status: 'not_found' }
    | { status: 'invalid_capability' }
    | { status: 'version_conflict', currentVersion: number }

export interface MeasurementHealthRepository {
  recordValidation(
    input: RecordDestinationValidationEvidence
  ): Promise<RecordDestinationValidationResult>
}

export interface PostgresMeasurementHealthRepositoryDeps {
  transaction: typeof defaultTransaction
}

const defaultDeps: PostgresMeasurementHealthRepositoryDeps = {
  transaction: defaultTransaction
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function createPostgresMeasurementHealthRepository(
  deps: PostgresMeasurementHealthRepositoryDeps = defaultDeps
): MeasurementHealthRepository {
  return {
    async recordValidation(input) {
      return deps.transaction(async (db) => {
        const profileResult = await db.query(
          `SELECT id, config_version
             FROM client_measurement_profiles
            WHERE client_id = $1
            FOR UPDATE`,
          [input.clientId]
        )
        const profile = profileResult.rows?.[0] as ProfileVersionRow | undefined
        if (!profile) return { status: 'not_found' as const }

        const currentVersion = Number(profile.config_version)
        if (currentVersion !== input.expectedConfigVersion) {
          return { status: 'version_conflict' as const, currentVersion }
        }

        const destinationResult = await db.query(
          `SELECT platform, config_version, health_status
             FROM conversion_destinations
            WHERE client_id = $1
              AND id = $2
            FOR UPDATE`,
          [input.clientId, input.destinationId]
        )
        const destination = destinationResult.rows?.[0] as DestinationVersionRow | undefined
        if (!destination) return { status: 'not_found' as const }
        if (Number(destination.config_version) !== input.expectedConfigVersion) {
          return { status: 'version_conflict' as const, currentVersion }
        }

        const capabilityResult = await db.query(
          `SELECT id, mode, status
             FROM conversion_destination_capabilities
            WHERE client_id = $1
              AND destination_id = $2
            FOR UPDATE`,
          [input.clientId, input.destinationId]
        )
        const capabilityRows = capabilityResult.rows as CapabilityIdentityRow[]
        const capabilityByMode = new Map(capabilityRows.map(row => [row.mode, row]))
        const invalidCapability = input.capabilities.some((capability) => {
          const platformPrefix = destination.platform === 'google_data_manager'
            ? 'google_'
            : `${destination.platform}_`
          const platformMatches = capability.mode.startsWith(platformPrefix)
          return !platformMatches || !capabilityByMode.has(capability.mode)
        })
        if (invalidCapability) return { status: 'invalid_capability' as const }

        for (const capability of input.capabilities) {
          const row = capabilityByMode.get(capability.mode)!
          await db.query(
            `UPDATE conversion_destination_capabilities
                SET status = $4,
                    evidence_at = $5,
                    blocking_reason = $6,
                    updated_at = NOW()
              WHERE client_id = $1
                AND destination_id = $2
                AND id = $3`,
            [
              input.clientId,
              input.destinationId,
              row.id,
              capability.status,
              input.observedAt,
              capability.blockingReason
            ]
          )
        }

        const aggregateResult = await db.query(
          `SELECT CASE
                    WHEN COUNT(*) FILTER (WHERE status = 'blocked') > 0 THEN 'blocked'
                    WHEN COUNT(*) FILTER (WHERE status = 'degraded') > 0 THEN 'degraded'
                    WHEN COUNT(*) > 0
                     AND COUNT(*) FILTER (WHERE status = 'ready') = COUNT(*) THEN 'ready'
                    ELSE 'validating'
                  END AS health_status
             FROM conversion_destination_capabilities
            WHERE client_id = $1
              AND destination_id = $2`,
          [input.clientId, input.destinationId]
        )
        const healthStatus = aggregateResult.rows?.[0]?.health_status as HealthStatus

        const updatedResult = await db.query(
          `UPDATE conversion_destinations
              SET health_status = $3,
                  last_validated_at = $4,
                  last_success_at = CASE WHEN $3 = 'ready' THEN $4 ELSE last_success_at END,
                  last_failure_at = CASE
                    WHEN $3 IN ('degraded', 'blocked') THEN $4
                    ELSE last_failure_at
                  END,
                  provider_request_id = $5,
                  error_class = $6,
                  redacted_error = $7,
                  updated_at = NOW()
            WHERE client_id = $1
              AND id = $2
        RETURNING health_status, last_validated_at`,
          [
            input.clientId,
            input.destinationId,
            healthStatus,
            input.observedAt,
            input.providerRequestId,
            input.errorClass,
            input.redactedError
          ]
        )
        const updated = updatedResult.rows?.[0] as {
          health_status: HealthStatus
          last_validated_at: Date | string
        }
        const evidence: DestinationValidationEvidenceState = {
          clientId: input.clientId,
          destinationId: input.destinationId,
          configVersion: currentVersion,
          healthStatus: updated.health_status,
          observedAt: iso(updated.last_validated_at),
          capabilities: input.capabilities
        }

        await db.query(
          `INSERT INTO measurement_config_audit (
             client_id, profile_id, entity_type, entity_id, action,
             config_version, before_state, after_state, changed_fields,
             actor_type, actor_id, reason
           ) VALUES (
             $1, $2, 'destination', $3, 'validated', $4,
             $5::jsonb, $6::jsonb, $7, $8, $9, $10
           )`,
          [
            input.clientId,
            profile.id,
            input.destinationId,
            currentVersion,
            JSON.stringify({ healthStatus: destination.health_status }),
            JSON.stringify({
              healthStatus: evidence.healthStatus,
              observedAt: evidence.observedAt,
              providerRequestId: input.providerRequestId,
              errorClass: input.errorClass,
              redactedError: input.redactedError,
              capabilities: evidence.capabilities
            }),
            ['health_status', 'capabilities', 'last_validated_at'],
            input.actor.type,
            input.actor.id,
            input.reason
          ]
        )

        return { status: 'recorded' as const, evidence }
      })
    }
  }
}
