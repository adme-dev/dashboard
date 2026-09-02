import {
  query as defaultQuery,
  queryOne as defaultQueryOne,
  transaction as defaultTransaction
} from '~~/server/utils/db'
import {
  ConversionDestinationCapabilityStateSchema,
  ConversionDestinationReadModelSchema,
  ConversionEventMappingStateSchema
} from '~~/server/utils/measurement/contracts'
import { PLATFORM_MODE_PREFIX } from '~~/shared/utils/measurementPlatform'
import type {
  CreateConversionDestinationConfiguration,
  ConversionDestinationCapabilityState,
  ConversionDestinationReadModel,
  ConversionEventMappingState,
  ListConversionDestinations,
  UpdateConversionDestinationConfiguration
} from '~~/server/utils/measurement/contracts'
import {
  mapMeasurementProfileRow,
  type MeasurementProfile
} from '~~/server/utils/measurement/profileRepository'

interface DestinationRow {
  id: string
  client_id: string
  profile_id: string
  platform: string
  social_connection_id: string | null
  external_destination_id: string
  credential_configured: boolean
  enabled: boolean
  environment: string
  health_status: string
  config_version: number | string
  last_validated_at: Date | string | null
  last_success_at: Date | string | null
  last_failure_at: Date | string | null
  provider_request_id: string | null
  error_class: string | null
  redacted_error: string | null
  created_at: Date | string
  updated_at: Date | string
}

interface CapabilityRow {
  id: string
  destination_id: string
  platform: string
  mode: string
  status: string
  management_origin: string
  can_zero_mutate: boolean
  evidence_at: Date | string | null
  blocking_reason: string | null
  config_version: number | string
  created_at: Date | string
  updated_at: Date | string
}

interface MappingRow {
  id: string
  destination_id: string
  canonical_event_name: string
  enquiry_type: string | null
  provider_event_name: string
  is_active: boolean
  config_version: number | string
  created_at: Date | string
  updated_at: Date | string
}

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

const PROFILE_COLUMNS = `
  id, client_id, desired_enabled, desired_state_source, enabled, environment,
  collection_tier, tracking_site_id,
  first_party_hostname, hostname_status, consent_mode, vertical,
  outcome_authority, native_lifecycle_mode, portal_outcome_mode, config_version,
  cache_status, cache_version, cache_error_class, created_at, updated_at
`

const DESTINATION_COLUMNS = `
  id, client_id, profile_id, platform, social_connection_id,
  external_destination_id, (credential_ref IS NOT NULL) AS credential_configured,
  enabled, environment, health_status, config_version, last_validated_at,
  last_success_at, last_failure_at, provider_request_id, error_class,
  redacted_error, created_at, updated_at
`

const CAPABILITY_COLUMNS = `
  id, destination_id, platform, mode, status, management_origin,
  can_zero_mutate, evidence_at, blocking_reason, config_version,
  created_at, updated_at
`

const MAPPING_COLUMNS = `
  id, destination_id, canonical_event_name, enquiry_type, provider_event_name,
  is_active, config_version, created_at, updated_at
`

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function optionalIso(value: Date | string | null): string | null {
  return value === null ? null : iso(value)
}

function mapCapability(row: CapabilityRow): ConversionDestinationCapabilityState {
  return ConversionDestinationCapabilityStateSchema.parse({
    id: row.id,
    destinationId: row.destination_id,
    platform: row.platform,
    mode: row.mode,
    status: row.status,
    managementOrigin: row.management_origin,
    canZeroMutate: row.can_zero_mutate,
    evidenceAt: optionalIso(row.evidence_at),
    blockingReason: row.blocking_reason,
    configVersion: Number(row.config_version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  })
}

function mapMapping(row: MappingRow): ConversionEventMappingState {
  return ConversionEventMappingStateSchema.parse({
    id: row.id,
    destinationId: row.destination_id,
    canonicalEventName: row.canonical_event_name,
    enquiryType: row.enquiry_type,
    providerEventName: row.provider_event_name,
    isActive: row.is_active,
    configVersion: Number(row.config_version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  })
}

function mapDestination(
  row: DestinationRow,
  capabilities: ConversionDestinationCapabilityState[],
  mappings: ConversionEventMappingState[]
): ConversionDestinationReadModel {
  return ConversionDestinationReadModelSchema.parse({
    id: row.id,
    clientId: row.client_id,
    profileId: row.profile_id,
    platform: row.platform,
    socialConnectionId: row.social_connection_id,
    externalDestinationId: row.external_destination_id,
    credentialConfigured: row.credential_configured,
    enabled: row.enabled,
    environment: row.environment,
    healthStatus: row.health_status,
    configVersion: Number(row.config_version),
    lastValidatedAt: optionalIso(row.last_validated_at),
    lastSuccessAt: optionalIso(row.last_success_at),
    lastFailureAt: optionalIso(row.last_failure_at),
    providerRequestId: row.provider_request_id,
    errorClass: row.error_class,
    redactedError: row.redacted_error,
    capabilities,
    mappings,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  })
}

function aggregateHealth(input: CreateConversionDestinationConfiguration['destination']) {
  if (input.capabilities.some(capability => capability.status === 'blocked')) return 'blocked'
  if (input.capabilities.some(capability => capability.status === 'configured')) return 'configured'
  return 'not_configured'
}

function connectionPlatform(platform: CreateConversionDestinationConfiguration['destination']['platform']) {
  if (platform === 'meta') return 'meta'
  if (platform === 'ga4') return 'ga4'
  return 'google'
}

export interface DestinationPage {
  items: ConversionDestinationReadModel[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

export type CreateDestinationResult
  = { status: 'created', profile: MeasurementProfile, destination: ConversionDestinationReadModel }
    | { status: 'not_found' }
    | { status: 'connection_not_found' }
    | { status: 'version_conflict', currentVersion: number }
    | { status: 'duplicate' }

export type UpdateDestinationResult
  = { status: 'updated', profile: MeasurementProfile, destination: ConversionDestinationReadModel }
    | { status: 'not_found' }
    | { status: 'connection_not_found' }
    | { status: 'invalid_configuration' }
    | { status: 'version_conflict', currentVersion: number }
    | { status: 'duplicate' }

export interface MeasurementDestinationRepository {
  list(input: ListConversionDestinations): Promise<DestinationPage>
  create(input: CreateConversionDestinationConfiguration): Promise<CreateDestinationResult>
  update(input: UpdateConversionDestinationConfiguration): Promise<UpdateDestinationResult>
}

export interface PostgresMeasurementDestinationRepositoryDeps {
  query: typeof defaultQuery
  queryOne: typeof defaultQueryOne
  transaction: typeof defaultTransaction
}

const defaultDeps: PostgresMeasurementDestinationRepositoryDeps = {
  query: defaultQuery,
  queryOne: defaultQueryOne,
  transaction: defaultTransaction
}

export function createPostgresMeasurementDestinationRepository(
  deps: PostgresMeasurementDestinationRepositoryDeps = defaultDeps
): MeasurementDestinationRepository {
  return {
    async list(input) {
      const countRow = await deps.queryOne<{ count: number | string }>(
        `SELECT COUNT(*) AS count
           FROM conversion_destinations
          WHERE client_id = $1
            AND ($2::text IS NULL OR platform = $2)`,
        [input.clientId, input.platform ?? null]
      )
      const totalItems = Number(countRow?.count ?? 0)
      const offset = (input.page - 1) * input.pageSize
      const destinationRows = await deps.query<DestinationRow>(
        `SELECT ${DESTINATION_COLUMNS}
           FROM conversion_destinations
          WHERE client_id = $1
            AND ($2::text IS NULL OR platform = $2)
          ORDER BY created_at DESC, id DESC
          LIMIT $3 OFFSET $4`,
        [input.clientId, input.platform ?? null, input.pageSize, offset]
      )
      const destinationIds = destinationRows.map(row => row.id)
      if (destinationIds.length === 0) {
        return {
          items: [],
          pagination: {
            page: input.page,
            pageSize: input.pageSize,
            totalItems,
            totalPages: Math.ceil(totalItems / input.pageSize)
          }
        }
      }

      const capabilityRows = await deps.query<CapabilityRow>(
        `SELECT ${CAPABILITY_COLUMNS}
           FROM conversion_destination_capabilities
          WHERE client_id = $1
            AND destination_id = ANY($2::uuid[])
          ORDER BY mode ASC`,
        [input.clientId, destinationIds]
      )
      const mappingRows = await deps.query<MappingRow>(
        `SELECT ${MAPPING_COLUMNS}
           FROM conversion_event_mappings
          WHERE client_id = $1
            AND destination_id = ANY($2::uuid[])
          ORDER BY canonical_event_name ASC, enquiry_type NULLS FIRST`,
        [input.clientId, destinationIds]
      )

      return {
        items: destinationRows.map(row => mapDestination(
          row,
          capabilityRows.filter(capability => capability.destination_id === row.id).map(mapCapability),
          mappingRows.filter(mapping => mapping.destination_id === row.id).map(mapMapping)
        )),
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

          const currentProfile = mapMeasurementProfileRow(currentRow)
          if (currentProfile.configVersion !== input.expectedProfileVersion) {
            return {
              status: 'version_conflict' as const,
              currentVersion: currentProfile.configVersion
            }
          }

          const destinationInput = input.destination
          if (destinationInput.socialConnectionId) {
            const connectionResult = await db.query(
              `SELECT id
                 FROM social_connections
                WHERE id = $1
                  AND client_id = $2
                  AND platform = $3
                  AND status = 'active'`,
              [
                destinationInput.socialConnectionId,
                input.clientId,
                connectionPlatform(destinationInput.platform)
              ]
            )
            if (!connectionResult.rows?.[0]) return { status: 'connection_not_found' as const }
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
                    updated_by = $3
              WHERE client_id = $1
                AND config_version = $2
          RETURNING ${PROFILE_COLUMNS}`,
            [input.clientId, input.expectedProfileVersion, input.actor.id]
          )
          const profileRow = profileResult.rows?.[0] as ProfileRow | undefined
          if (!profileRow) {
            return {
              status: 'version_conflict' as const,
              currentVersion: currentProfile.configVersion
            }
          }
          const profile = mapMeasurementProfileRow(profileRow)
          const configVersion = profile.configVersion
          const healthStatus = aggregateHealth(destinationInput)

          const destinationResult = await db.query(
            `INSERT INTO conversion_destinations (
               client_id, profile_id, platform, social_connection_id,
               external_destination_id, credential_ref, enabled, environment,
               health_status, config_version, created_by, updated_by
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
             RETURNING ${DESTINATION_COLUMNS}`,
            [
              input.clientId,
              profile.id,
              destinationInput.platform,
              destinationInput.socialConnectionId,
              destinationInput.externalDestinationId,
              destinationInput.credentialRef,
              false,
              'test',
              healthStatus,
              configVersion,
              input.actor.id
            ]
          )
          const destinationRow = destinationResult.rows?.[0] as DestinationRow

          const capabilities: ConversionDestinationCapabilityState[] = []
          for (const capability of destinationInput.capabilities) {
            const capabilityResult = await db.query(
              `INSERT INTO conversion_destination_capabilities (
                 client_id, destination_id, platform, mode, status,
                 management_origin, can_zero_mutate, evidence_at,
                 blocking_reason, config_version
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9)
               RETURNING ${CAPABILITY_COLUMNS}`,
              [
                input.clientId,
                destinationRow.id,
                destinationInput.platform,
                capability.mode,
                capability.status,
                capability.managementOrigin,
                capability.canZeroMutate,
                capability.blockingReason,
                configVersion
              ]
            )
            capabilities.push(mapCapability(capabilityResult.rows[0] as CapabilityRow))
          }

          const mappings: ConversionEventMappingState[] = []
          for (const mapping of destinationInput.mappings) {
            const mappingResult = await db.query(
              `INSERT INTO conversion_event_mappings (
                 client_id, destination_id, canonical_event_name,
                 enquiry_type, provider_event_name, is_active, config_version,
                 created_by, updated_by
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
               RETURNING ${MAPPING_COLUMNS}`,
              [
                input.clientId,
                destinationRow.id,
                mapping.canonicalEventName,
                mapping.enquiryType,
                mapping.providerEventName,
                mapping.isActive,
                configVersion,
                input.actor.id
              ]
            )
            mappings.push(mapMapping(mappingResult.rows[0] as MappingRow))
          }

          const destination = mapDestination(destinationRow, capabilities, mappings)
          await db.query(
            `INSERT INTO measurement_config_audit (
               client_id, profile_id, entity_type, entity_id, action,
               config_version, before_state, after_state, changed_fields,
               actor_type, actor_id, reason
             ) VALUES (
               $1, $2, 'destination', $3, 'created', $4,
               NULL, $5::jsonb, $6, $7, $8, $9
             )`,
            [
              input.clientId,
              profile.id,
              destination.id,
              configVersion,
              JSON.stringify(destination),
              ['destination', 'capabilities', 'mappings'],
              input.actor.type,
              input.actor.id,
              input.reason
            ]
          )

          return { status: 'created' as const, profile, destination }
        })
      } catch (error) {
        if ((error as { code?: string }).code === '23505') return { status: 'duplicate' }
        throw error
      }
    },

    async update(input) {
      try {
        return await deps.transaction(async (db) => {
          const currentProfileResult = await db.query(
            `SELECT ${PROFILE_COLUMNS}
               FROM client_measurement_profiles
              WHERE client_id = $1
              FOR UPDATE`,
            [input.clientId]
          )
          const currentProfileRow = currentProfileResult.rows?.[0] as ProfileRow | undefined
          if (!currentProfileRow) return { status: 'not_found' as const }

          const currentProfile = mapMeasurementProfileRow(currentProfileRow)
          if (currentProfile.configVersion !== input.expectedProfileVersion) {
            return {
              status: 'version_conflict' as const,
              currentVersion: currentProfile.configVersion
            }
          }

          const currentDestinationResult = await db.query(
            `SELECT ${DESTINATION_COLUMNS}
               FROM conversion_destinations
              WHERE client_id = $1
                AND id = $2
              FOR UPDATE`,
            [input.clientId, input.destinationId]
          )
          const currentDestinationRow = currentDestinationResult.rows?.[0] as DestinationRow | undefined
          if (!currentDestinationRow) return { status: 'not_found' as const }

          const currentCapabilityResult = await db.query(
            `SELECT ${CAPABILITY_COLUMNS}
               FROM conversion_destination_capabilities
              WHERE client_id = $1
                AND destination_id = $2
              ORDER BY mode ASC`,
            [input.clientId, input.destinationId]
          )
          const currentMappingResult = await db.query(
            `SELECT ${MAPPING_COLUMNS}
               FROM conversion_event_mappings
              WHERE client_id = $1
                AND destination_id = $2
              ORDER BY canonical_event_name ASC, enquiry_type NULLS FIRST`,
            [input.clientId, input.destinationId]
          )
          const currentCapabilities = (currentCapabilityResult.rows as CapabilityRow[]).map(mapCapability)
          const currentMappings = (currentMappingResult.rows as MappingRow[]).map(mapMapping)
          const currentDestination = mapDestination(
            currentDestinationRow,
            currentCapabilities,
            currentMappings
          )

          const capabilities = input.patch.capabilities ?? currentCapabilities.map(capability => ({
            mode: capability.mode,
            status: capability.status === 'blocked'
              ? 'blocked' as const
              : capability.status === 'not_configured'
                ? 'not_configured' as const
                : 'configured' as const,
            managementOrigin: capability.managementOrigin,
            canZeroMutate: capability.canZeroMutate,
            blockingReason: capability.status === 'blocked' ? capability.blockingReason : null
          }))
          const mappings = input.patch.mappings ?? currentMappings.map(mapping => ({
            canonicalEventName: mapping.canonicalEventName,
            enquiryType: mapping.enquiryType ?? null,
            providerEventName: mapping.providerEventName,
            isActive: mapping.isActive
          }))
          const socialConnectionId = input.patch.socialConnectionId === undefined
            ? currentDestination.socialConnectionId
            : input.patch.socialConnectionId
          const credentialConfigured = input.patch.credentialRef === undefined
            ? currentDestination.credentialConfigured
            : input.patch.credentialRef !== null

          const invalidPlatformMode = capabilities.some(capability => (
            !capability.mode.startsWith(PLATFORM_MODE_PREFIX[currentDestination.platform])
          ))
          const configuredZeroCapability = capabilities.some(capability => (
            capability.managementOrigin === 'zero' && capability.status === 'configured'
          ))
          if (
            invalidPlatformMode
            || (configuredZeroCapability && socialConnectionId === null && !credentialConfigured)
          ) return { status: 'invalid_configuration' as const }

          if (socialConnectionId) {
            const connectionResult = await db.query(
              `SELECT id
                 FROM social_connections
                WHERE id = $1
                  AND client_id = $2
                  AND platform = $3
                  AND status = 'active'`,
              [
                socialConnectionId,
                input.clientId,
                connectionPlatform(currentDestination.platform)
              ]
            )
            if (!connectionResult.rows?.[0]) return { status: 'connection_not_found' as const }
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
                    updated_by = $3
              WHERE client_id = $1
                AND config_version = $2
          RETURNING ${PROFILE_COLUMNS}`,
            [input.clientId, input.expectedProfileVersion, input.actor.id]
          )
          const profileRow = profileResult.rows?.[0] as ProfileRow | undefined
          if (!profileRow) {
            return {
              status: 'version_conflict' as const,
              currentVersion: currentProfile.configVersion
            }
          }
          const profile = mapMeasurementProfileRow(profileRow)
          const configVersion = profile.configVersion
          const healthStatus = aggregateHealth({
            platform: currentDestination.platform,
            socialConnectionId,
            externalDestinationId: input.patch.externalDestinationId
              ?? currentDestination.externalDestinationId,
            credentialRef: input.patch.credentialRef ?? null,
            capabilities,
            mappings
          })

          const destinationResult = await db.query(
            `UPDATE conversion_destinations
                SET social_connection_id = CASE WHEN $3 THEN $4::uuid ELSE social_connection_id END,
                    external_destination_id = CASE WHEN $5 THEN $6 ELSE external_destination_id END,
                    credential_ref = CASE WHEN $7 THEN $8 ELSE credential_ref END,
                    enabled = FALSE,
                    environment = 'test',
                    health_status = $9,
                    config_version = $10,
                    last_validated_at = NULL,
                    last_success_at = NULL,
                    last_failure_at = NULL,
                    provider_request_id = NULL,
                    error_class = NULL,
                    redacted_error = NULL,
                    updated_by = $11,
                    updated_at = NOW()
              WHERE client_id = $1
                AND id = $2
          RETURNING ${DESTINATION_COLUMNS}`,
            [
              input.clientId,
              input.destinationId,
              input.patch.socialConnectionId !== undefined,
              input.patch.socialConnectionId ?? null,
              input.patch.externalDestinationId !== undefined,
              input.patch.externalDestinationId ?? null,
              input.patch.credentialRef !== undefined,
              input.patch.credentialRef ?? null,
              healthStatus,
              configVersion,
              input.actor.id
            ]
          )
          const destinationRow = destinationResult.rows?.[0] as DestinationRow

          await db.query(
            `DELETE FROM conversion_destination_capabilities
              WHERE client_id = $1
                AND destination_id = $2`,
            [input.clientId, input.destinationId]
          )
          const updatedCapabilities: ConversionDestinationCapabilityState[] = []
          for (const capability of capabilities) {
            const capabilityResult = await db.query(
              `INSERT INTO conversion_destination_capabilities (
                 client_id, destination_id, platform, mode, status,
                 management_origin, can_zero_mutate, evidence_at,
                 blocking_reason, config_version
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9)
               RETURNING ${CAPABILITY_COLUMNS}`,
              [
                input.clientId,
                input.destinationId,
                currentDestination.platform,
                capability.mode,
                capability.status,
                capability.managementOrigin,
                capability.canZeroMutate,
                capability.blockingReason,
                configVersion
              ]
            )
            updatedCapabilities.push(mapCapability(capabilityResult.rows[0] as CapabilityRow))
          }

          await db.query(
            `DELETE FROM conversion_event_mappings
              WHERE client_id = $1
                AND destination_id = $2`,
            [input.clientId, input.destinationId]
          )
          const updatedMappings: ConversionEventMappingState[] = []
          for (const mapping of mappings) {
            const mappingResult = await db.query(
              `INSERT INTO conversion_event_mappings (
                 client_id, destination_id, canonical_event_name,
                 enquiry_type, provider_event_name, is_active, config_version,
                 created_by, updated_by
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
               RETURNING ${MAPPING_COLUMNS}`,
              [
                input.clientId,
                input.destinationId,
                mapping.canonicalEventName,
                mapping.enquiryType,
                mapping.providerEventName,
                mapping.isActive,
                configVersion,
                input.actor.id
              ]
            )
            updatedMappings.push(mapMapping(mappingResult.rows[0] as MappingRow))
          }

          const destination = mapDestination(destinationRow, updatedCapabilities, updatedMappings)
          await db.query(
            `INSERT INTO measurement_config_audit (
               client_id, profile_id, entity_type, entity_id, action,
               config_version, before_state, after_state, changed_fields,
               actor_type, actor_id, reason
             ) VALUES (
               $1, $2, 'destination', $3, 'updated', $4,
               $5::jsonb, $6::jsonb, $7, $8, $9, $10
             )`,
            [
              input.clientId,
              profile.id,
              destination.id,
              configVersion,
              JSON.stringify(currentDestination),
              JSON.stringify(destination),
              Object.keys(input.patch),
              input.actor.type,
              input.actor.id,
              input.reason
            ]
          )

          return { status: 'updated' as const, profile, destination }
        })
      } catch (error) {
        if ((error as { code?: string }).code === '23505') return { status: 'duplicate' }
        throw error
      }
    }
  }
}
