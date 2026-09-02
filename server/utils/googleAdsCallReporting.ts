import { execute, queryRows } from '~~/server/utils/db'
import { gaqlQuery, refreshGoogleToken } from '~~/server/utils/googleAdsClient'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  GOOGLE_CREDENTIAL_PROFILE_SELECT,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow
} from '~~/server/utils/googleCredentialProfiles'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'

// Google Ads API v23 field compatibility and resource identity:
// https://developers.google.com/google-ads/api/fields/v23/call_view
// Google documents call_view as the record-level source for calls from call ads
// and call assets. campaign, ad_group and customer are attributed resources.
// metrics.phone_calls is intentionally not selected: its v23 compatibility list
// does not include call_view, and it represents a separate aggregate metric.
// https://developers.google.com/google-ads/api/fields/v23/metrics#metrics.phone_calls

export const GOOGLE_CALL_DEFAULT_LOOKBACK_DAYS = 14
export const GOOGLE_CALL_MAX_LOOKBACK_MONTHS = 37
export const GOOGLE_CALL_UPSERT_CHUNK = 250
export const GOOGLE_CALL_CONNECTION_CONCURRENCY = 8

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const GOOGLE_LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/
const ALLOWED_STATUSES = new Set(['MISSED', 'RECEIVED', 'UNKNOWN', 'UNSPECIFIED'])

type GoogleCallStatus = 'MISSED' | 'RECEIVED' | 'UNKNOWN' | 'UNSPECIFIED'

export interface GoogleCallRecord {
  connectionId: string
  customerId: string
  providerCallId: string
  providerResourceName: string
  clientId: string | null
  campaignId: string | null
  campaignName: string | null
  adGroupId: string | null
  adGroupName: string | null
  status: GoogleCallStatus
  /** Google reports this in the Ads customer's local timezone. */
  startedAt: string
  /** Google reports this in the Ads customer's local timezone. */
  endedAt: string | null
  customerTimeZone: string | null
  durationSeconds: number | null
  displayLocation: string | null
  callType: string | null
  callerCountryCode: string | null
  callerAreaCode: string | null
}

export interface GoogleCallClientMapping {
  connectionId: string
  campaignId: string | null
  campaignNamePattern: string | null
  clientId: string | null
}

interface GoogleCallConnection extends GoogleCredentialRow {
  id: string
  account_id: string
  account_name: string | null
  metadata: Record<string, unknown> | null
}

interface GoogleCallRuntimeConfig {
  googleClientId: string
  googleClientSecret: string
  googleDeveloperToken: string
  googleAdsLoginCustomerId: string
}

interface GoogleCallSyncDeps {
  loadConnections: () => Promise<GoogleCallConnection[]>
  loadMappings: () => Promise<GoogleCallClientMapping[]>
  resolveCredential: typeof resolveGoogleCredential
  refreshToken: typeof refreshGoogleToken
  persistCredentialRefresh: typeof persistGoogleCredentialRefresh
  gaqlQuery: typeof gaqlQuery
  execute: typeof execute
}

export interface GoogleCallSyncResult {
  connectionsSynced: number
  callsUpserted: number
  errors: string[]
}

function dateFromIso(value: string): Date {
  if (!DATE_ONLY.test(value)) throw new Error(`Invalid date ${value}; expected YYYY-MM-DD`)
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid date ${value}; expected YYYY-MM-DD`)
  }
  return parsed
}

function dateToIso(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function addUtcDays(value: string, days: number): string {
  const date = dateFromIso(value)
  date.setUTCDate(date.getUTCDate() + days)
  return dateToIso(date)
}

function subtractUtcMonths(value: string, months: number): string {
  const source = dateFromIso(value)
  const day = source.getUTCDate()
  source.setUTCDate(1)
  source.setUTCMonth(source.getUTCMonth() - months)
  const finalMonth = source.getUTCMonth()
  source.setUTCDate(day)
  if (source.getUTCMonth() !== finalMonth) source.setUTCDate(0)
  return dateToIso(source)
}

/**
 * Google Ads granular reporting data is retained for 37 months from 1 June
 * 2026. Keep normal syncs small while allowing bounded historical backfills.
 * https://support.google.com/google-ads/answer/15188209
 */
export function googleCallSyncWindow(options: {
  startDate?: string
  endDate?: string
  lookbackDays?: number
  today?: string
} = {}): { startDate: string, endDate: string } {
  const today = options.today || new Date().toISOString().slice(0, 10)
  dateFromIso(today)
  const endDate = options.endDate || today
  dateFromIso(endDate)
  if (endDate > today) throw new Error('Google call sync endDate cannot be in the future')

  const startDate = options.startDate || addUtcDays(endDate, -(options.lookbackDays ?? GOOGLE_CALL_DEFAULT_LOOKBACK_DAYS))
  dateFromIso(startDate)
  if (startDate > endDate) throw new Error('Google call sync startDate must be on or before endDate')

  const earliest = subtractUtcMonths(today, GOOGLE_CALL_MAX_LOOKBACK_MONTHS)
  if (startDate < earliest) {
    throw new Error(`Google call sync startDate exceeds the ${GOOGLE_CALL_MAX_LOOKBACK_MONTHS}-month reporting window`)
  }
  return { startDate, endDate }
}

/**
 * Uses the filterable call_view start timestamp rather than segments.date.
 * An exclusive next-day upper bound includes every call on endDate without
 * relying on fractional-second precision.
 * https://developers.google.com/google-ads/api/fields/v23/call_view
 * https://developers.google.com/google-ads/api/docs/query/grammar
 */
export function buildGoogleCallViewQuery(startDate: string, endDate: string): string {
  dateFromIso(startDate)
  dateFromIso(endDate)
  if (startDate > endDate) throw new Error('startDate must be on or before endDate')
  const endExclusive = addUtcDays(endDate, 1)
  return `SELECT
    call_view.resource_name,
    call_view.call_duration_seconds,
    call_view.call_status,
    call_view.call_tracking_display_location,
    call_view.caller_area_code,
    call_view.caller_country_code,
    call_view.start_call_date_time,
    call_view.end_call_date_time,
    call_view.type,
    customer.id,
    customer.time_zone,
    campaign.id,
    campaign.name,
    ad_group.id,
    ad_group.name
  FROM call_view
  WHERE call_view.start_call_date_time >= '${startDate}'
    AND call_view.start_call_date_time < '${endExclusive}'
  ORDER BY call_view.start_call_date_time ASC`
}

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function nullableId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  return null
}

function localDateTime(value: unknown, field: string, required: boolean): string | null {
  const parsed = nullableString(value)
  if (!parsed) {
    if (required) throw new Error(`Google call row has no ${field}`)
    return null
  }
  if (!GOOGLE_LOCAL_DATE_TIME.test(parsed)) throw new Error(`Google call row has invalid ${field}`)
  return parsed.replace('T', ' ')
}

/** Validate and map the untrusted REST GoogleAdsRow response. */
export function mapGoogleCallRow(value: unknown, connectionId: string): GoogleCallRecord {
  const row = objectRecord(value)
  const callView = objectRecord(row.callView)
  const customer = objectRecord(row.customer)
  const campaign = objectRecord(row.campaign)
  const adGroup = objectRecord(row.adGroup)
  const providerResourceName = nullableString(callView.resourceName)
  const identity = providerResourceName?.match(/^customers\/(\d+)\/callViews\/([^/]+)$/)
  if (!providerResourceName || !identity) throw new Error('Google call row has invalid resource name')

  const rawStatus = nullableString(callView.callStatus) || 'UNSPECIFIED'
  if (!ALLOWED_STATUSES.has(rawStatus)) throw new Error(`Google call row has invalid call status: ${rawStatus}`)

  const rawDuration = callView.callDurationSeconds
  let durationSeconds: number | null = null
  if (rawDuration !== undefined && rawDuration !== null && rawDuration !== '') {
    durationSeconds = Number(rawDuration)
    if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 0) {
      throw new Error('Google call row has invalid duration')
    }
  }

  return {
    connectionId,
    customerId: nullableId(customer.id) || identity[1]!,
    providerCallId: identity[2]!,
    providerResourceName,
    clientId: null,
    campaignId: nullableId(campaign.id),
    campaignName: nullableString(campaign.name),
    adGroupId: nullableId(adGroup.id),
    adGroupName: nullableString(adGroup.name),
    status: rawStatus as GoogleCallStatus,
    startedAt: localDateTime(callView.startCallDateTime, 'start timestamp', true)!,
    endedAt: localDateTime(callView.endCallDateTime, 'end timestamp', false),
    customerTimeZone: nullableString(customer.timeZone),
    durationSeconds,
    displayLocation: nullableString(callView.callTrackingDisplayLocation),
    callType: nullableString(callView.type),
    callerCountryCode: nullableString(callView.callerCountryCode),
    callerAreaCode: nullableString(callView.callerAreaCode)
  }
}

export function matchGoogleCallClient(
  mappings: GoogleCallClientMapping[],
  connectionId: string,
  campaignId: string | null,
  campaignName: string | null
): string | null {
  const candidates = mappings.filter(mapping => mapping.connectionId === connectionId && mapping.clientId)
  const exact = candidates.find(mapping => mapping.campaignId && mapping.campaignId === campaignId)
  if (exact) return exact.clientId

  if (campaignName) {
    const pattern = candidates.find((mapping) => {
      if (!mapping.campaignNamePattern) return false
      try {
        return new RegExp(mapping.campaignNamePattern, 'i').test(campaignName)
      } catch {
        return false
      }
    })
    if (pattern) return pattern.clientId
  }

  return candidates.find(mapping => !mapping.campaignId && !mapping.campaignNamePattern)?.clientId || null
}

const UPSERT_COLUMNS = 18

export function buildGoogleCallUpsert(rows: GoogleCallRecord[]): { text: string, values: unknown[] } {
  if (!rows.length) throw new Error('Cannot build an empty Google call upsert')
  const values: unknown[] = []
  const tuples = rows.map((row, index) => {
    const base = index * UPSERT_COLUMNS
    values.push(
      row.connectionId,
      row.customerId,
      row.providerCallId,
      row.providerResourceName,
      row.clientId,
      row.campaignId,
      row.campaignName,
      row.adGroupId,
      row.adGroupName,
      row.status,
      row.startedAt,
      row.endedAt,
      row.customerTimeZone,
      row.durationSeconds,
      row.displayLocation,
      row.callType,
      row.callerCountryCode,
      row.callerAreaCode
    )
    return `(${Array.from({ length: UPSERT_COLUMNS }, (_, offset) => `$${base + offset + 1}`).join(',')},NOW(),NOW(),NOW())`
  })

  return {
    text: `INSERT INTO google_ads_calls (
      connection_id, customer_id, provider_call_id, provider_resource_name,
      client_id, campaign_id, campaign_name, ad_group_id, ad_group_name,
      status, started_at, ended_at, customer_timezone, duration_seconds,
      display_location, call_type, caller_country_code, caller_area_code,
      first_synced_at, last_synced_at, updated_at
    ) VALUES ${tuples.join(',')}
    ON CONFLICT (connection_id, provider_call_id)
    DO UPDATE SET
      provider_resource_name = EXCLUDED.provider_resource_name,
      client_id = COALESCE(EXCLUDED.client_id, google_ads_calls.client_id),
      campaign_id = EXCLUDED.campaign_id,
      campaign_name = EXCLUDED.campaign_name,
      ad_group_id = EXCLUDED.ad_group_id,
      ad_group_name = EXCLUDED.ad_group_name,
      status = EXCLUDED.status,
      started_at = EXCLUDED.started_at,
      ended_at = EXCLUDED.ended_at,
      customer_timezone = EXCLUDED.customer_timezone,
      duration_seconds = EXCLUDED.duration_seconds,
      display_location = EXCLUDED.display_location,
      call_type = EXCLUDED.call_type,
      caller_country_code = EXCLUDED.caller_country_code,
      caller_area_code = EXCLUDED.caller_area_code,
      last_synced_at = NOW(),
      updated_at = NOW()`,
    values
  }
}

async function loadConnections(): Promise<GoogleCallConnection[]> {
  return queryRows<GoogleCallConnection>(
    `SELECT sc.id, sc.account_id, sc.account_name, sc.access_token,
            sc.refresh_token, sc.token_expires_at, sc.metadata,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
     FROM social_connections sc
     ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
     WHERE sc.platform = 'google' AND sc.status = 'active'`
  )
}

export const GOOGLE_CALL_MAPPING_QUERY = `SELECT connection_id,
        campaign_id,
        campaign_name_pattern,
        client_id
   FROM (
     SELECT mapping.connection_id,
            mapping.campaign_id,
            mapping.campaign_name_pattern,
            matched_client.id AS client_id,
            0 AS priority
       FROM ad_account_client_map mapping
       LEFT JOIN LATERAL (
         SELECT client.id
           FROM agency_clients client
          WHERE client.name = mapping.xero_client_name
             OR (client.xero_contact_id IS NOT NULL AND client.xero_contact_id = mapping.xero_client_code)
          ORDER BY CASE WHEN client.name = mapping.xero_client_name THEN 0 ELSE 1 END
          LIMIT 1
       ) matched_client ON TRUE
     UNION ALL
     SELECT connection.id AS connection_id,
            NULL::text AS campaign_id,
            NULL::text AS campaign_name_pattern,
            connection.client_id,
            1 AS priority
       FROM social_connections connection
      WHERE connection.platform = 'google'
        AND connection.status = 'active'
        AND connection.client_id IS NOT NULL
   ) mappings
  ORDER BY priority ASC`

async function loadMappings(): Promise<GoogleCallClientMapping[]> {
  const rows = await queryRows<{
    connection_id: string
    campaign_id: string | null
    campaign_name_pattern: string | null
    client_id: string | null
  }>(GOOGLE_CALL_MAPPING_QUERY)
  return rows.map(row => ({
    connectionId: row.connection_id,
    campaignId: row.campaign_id,
    campaignNamePattern: row.campaign_name_pattern,
    clientId: row.client_id
  }))
}

const defaultDeps: GoogleCallSyncDeps = {
  loadConnections,
  loadMappings,
  resolveCredential: resolveGoogleCredential,
  refreshToken: refreshGoogleToken,
  persistCredentialRefresh: persistGoogleCredentialRefresh,
  gaqlQuery,
  execute
}

async function noteSyncAttempt(
  deps: GoogleCallSyncDeps,
  connectionId: string,
  startDate: string,
  endDate: string
): Promise<void> {
  await deps.execute(
    `INSERT INTO google_ads_call_sync_state (
       connection_id, last_attempt_at, last_requested_start_date,
       last_requested_end_date, current_job_state, updated_at
     ) VALUES ($1, NOW(), $2::date, $3::date, 'running', NOW())
     ON CONFLICT (connection_id) DO UPDATE SET
       last_attempt_at = NOW(),
       last_requested_start_date = EXCLUDED.last_requested_start_date,
       last_requested_end_date = EXCLUDED.last_requested_end_date,
       current_job_state = 'running',
       updated_at = NOW()`,
    [connectionId, startDate, endDate]
  )
}

async function noteSyncSuccess(
  deps: GoogleCallSyncDeps,
  connectionId: string,
  rows: number,
  startDate: string,
  endDate: string
): Promise<void> {
  await deps.execute(
    `INSERT INTO google_ads_call_sync_state (
       connection_id, last_attempt_at, last_success_at, last_row_count, last_error,
       last_requested_start_date, last_requested_end_date, covered_start_date,
       covered_end_date, current_job_state, updated_at
     ) VALUES ($1, NOW(), NOW(), $2, NULL, $3::date, $4::date, $3::date, $4::date, 'completed', NOW())
     ON CONFLICT (connection_id) DO UPDATE SET
       last_attempt_at = NOW(),
       last_success_at = NOW(),
       last_row_count = EXCLUDED.last_row_count,
       last_error = NULL,
       last_requested_start_date = EXCLUDED.last_requested_start_date,
       last_requested_end_date = EXCLUDED.last_requested_end_date,
       covered_start_date = EXCLUDED.covered_start_date,
       covered_end_date = EXCLUDED.covered_end_date,
       current_job_state = 'completed',
       updated_at = NOW()`,
    [connectionId, rows, startDate, endDate]
  )
}

async function noteSyncFailure(
  deps: GoogleCallSyncDeps,
  connectionId: string,
  message: string,
  startDate: string,
  endDate: string
): Promise<void> {
  await deps.execute(
    `INSERT INTO google_ads_call_sync_state (
       connection_id, last_attempt_at, last_error, last_requested_start_date,
       last_requested_end_date, current_job_state, updated_at
     ) VALUES ($1, NOW(), $2, $3::date, $4::date, 'failed', NOW())
     ON CONFLICT (connection_id) DO UPDATE SET
       last_attempt_at = NOW(),
       last_error = EXCLUDED.last_error,
       last_requested_start_date = EXCLUDED.last_requested_start_date,
       last_requested_end_date = EXCLUDED.last_requested_end_date,
       current_job_state = 'failed',
       updated_at = NOW()`,
    [connectionId, message.slice(0, 2000), startDate, endDate]
  )
}

function syncErrorMessage(error: unknown): string {
  const value = objectRecord(error)
  const rawStatus = value.status ?? value.statusCode
  const status = typeof rawStatus === 'number' || /^\d{3}$/.test(String(rawStatus || ''))
    ? Number(rawStatus)
    : null
  return status
    ? `Google Ads call sync failed (status ${status})`
    : 'Google Ads call sync failed'
}

export async function syncGoogleAdsCalls(options: {
  startDate?: string
  endDate?: string
  lookbackDays?: number
  today?: string
  runtimeConfig?: GoogleCallRuntimeConfig
  deps?: Partial<GoogleCallSyncDeps>
} = {}): Promise<GoogleCallSyncResult> {
  const deps: GoogleCallSyncDeps = { ...defaultDeps, ...options.deps }
  const config = options.runtimeConfig || resolveGoogleAdsRuntimeConfig()
  if (!config.googleDeveloperToken) throw new Error('GOOGLE_DEVELOPER_TOKEN is required for Google call reporting')

  const { startDate, endDate } = googleCallSyncWindow(options)
  const query = buildGoogleCallViewQuery(startDate, endDate)
  const [connections, mappings] = await Promise.all([deps.loadConnections(), deps.loadMappings()])
  const result: GoogleCallSyncResult = { connectionsSynced: 0, callsUpserted: 0, errors: [] }

  // A bounded pool keeps 100+ account estates inside the request window while
  // holding Google and Neon concurrency to a deliberately small fixed number.
  // SearchStream is one daily operation per request regardless of batches:
  // https://developers.google.com/google-ads/api/docs/best-practices/quotas#search_requests
  async function syncConnection(connection: GoogleCallConnection): Promise<void> {
    try {
      await noteSyncAttempt(deps, connection.id, startDate, endDate)
      const credential = await deps.resolveCredential(connection)
      let accessToken = credential.accessToken
      if (
        credential.refreshToken
        && credential.tokenExpiresAt
        && new Date(credential.tokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000
      ) {
        if (!config.googleClientId || !config.googleClientSecret) {
          throw new Error('Google OAuth client credentials are required to refresh the access token')
        }
        const refreshed = await deps.refreshToken(
          credential.refreshToken,
          config.googleClientId,
          config.googleClientSecret
        )
        accessToken = refreshed.access_token
        await deps.persistCredentialRefresh({
          connectionId: connection.id,
          profileId: credential.profileId,
          accessToken,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000)
        })
      }

      const metadataManager = nullableString(connection.metadata?.managerCustomerId)
      const managerId = (config.googleAdsLoginCustomerId || metadataManager || '').replace(/-/g, '') || undefined
      let providerRows: unknown[]
      try {
        providerRows = await deps.gaqlQuery(
          connection.account_id,
          accessToken,
          config.googleDeveloperToken,
          query,
          managerId
        )
      } catch (error) {
        const status = objectRecord(error).status || objectRecord(error).statusCode
        if (status === 403 && managerId) {
          providerRows = await deps.gaqlQuery(
            connection.account_id,
            accessToken,
            config.googleDeveloperToken,
            query,
            undefined
          )
        } else {
          throw error
        }
      }

      const calls = providerRows.map((row) => {
        const call = mapGoogleCallRow(row, connection.id)
        return {
          ...call,
          clientId: matchGoogleCallClient(
            mappings,
            connection.id,
            call.campaignId,
            call.campaignName
          )
        }
      })

      for (let offset = 0; offset < calls.length; offset += GOOGLE_CALL_UPSERT_CHUNK) {
        const statement = buildGoogleCallUpsert(calls.slice(offset, offset + GOOGLE_CALL_UPSERT_CHUNK))
        await deps.execute(statement.text, statement.values)
      }
      await noteSyncSuccess(deps, connection.id, calls.length, startDate, endDate)
      result.connectionsSynced++
      result.callsUpserted += calls.length
    } catch (error) {
      const message = `${connection.account_name || connection.account_id}: ${syncErrorMessage(error)}`
      result.errors.push(message)
      await noteSyncFailure(deps, connection.id, message, startDate, endDate)
    }
  }

  let nextConnection = 0
  async function runWorker(): Promise<void> {
    while (nextConnection < connections.length) {
      const connection = connections[nextConnection++]
      if (connection) await syncConnection(connection)
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(GOOGLE_CALL_CONNECTION_CONCURRENCY, connections.length) },
      () => runWorker()
    )
  )

  return result
}
