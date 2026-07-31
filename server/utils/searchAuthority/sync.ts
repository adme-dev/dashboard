import { execute, queryOne, queryRows } from '~~/server/utils/db'
import {
  refreshSearchConsoleCredential,
  resolveSearchConsoleCredential,
  type ResolvedSearchConsoleCredential
} from '~~/server/utils/searchAuthority/credentials'
import {
  listSearchConsoleDates,
  searchConsoleSyncWindow
} from '~~/server/utils/searchAuthority/dates'
import {
  querySearchAnalytics,
  type SearchAnalyticsRequest,
  type SearchAnalyticsResult
} from '~~/server/utils/searchAuthority/googleClient'
import {
  replacePageDate,
  replacePropertyDate,
  replaceQueryPageDate,
  type ReplaceProjectionDateInput
} from '~~/server/utils/searchAuthority/repository'

type TriggerType = 'initial' | 'scheduled' | 'manual' | 'retry'
type SyncStatus = 'succeeded' | 'partial' | 'failed'

export interface SearchConsolePropertyMap {
  clientId: string
  propertyMapId: string
  connectionId: string
  propertyUri: string
  baselineCompleted?: boolean
  baselineStartDate?: string | null
  baselineEndDate?: string | null
}

interface PropertySyncInput {
  map: SearchConsolePropertyMap
  startDate: string
  endDate: string
  triggerType: TriggerType
  credential?: ResolvedSearchConsoleCredential
  credentialError?: unknown
  leaseToken?: string
  resumeFromProjectionChecks?: boolean
}

interface ClientSyncInput {
  clientId: string
  startDate?: string
  endDate?: string
  triggerType: TriggerType
}

interface RunUpdate {
  status: 'running' | SyncStatus
  leaseToken?: string
  rowsReceived?: number
  datesSucceeded?: number
  datesFailed?: number
  firstIncompleteDate?: string | null
  errors?: Array<Record<string, unknown>>
}

interface SyncDependencies {
  now?: () => Date
  sleep?: (milliseconds: number) => Promise<void>
  resolveCredential?: typeof resolveSearchConsoleCredential
  refreshCredential?: typeof refreshSearchConsoleCredential
  queryAnalytics?: typeof querySearchAnalytics
  replacePropertyDate?: (input: ReplaceProjectionDateInput) => Promise<void>
  replacePageDate?: (input: ReplaceProjectionDateInput) => Promise<void>
  replaceQueryPageDate?: (input: ReplaceProjectionDateInput) => Promise<void>
  createRun?: (
    input: PropertySyncInput
  ) => Promise<string>
  updateRun?: (runId: string, update: RunUpdate) => Promise<void>
  listMaps?: (clientId: string) => Promise<SearchConsolePropertyMap[]>
  listCompletedProjections?: (
    input: PropertySyncInput
  ) => Promise<string[]>
  acquireLease?: (propertyMapId: string) => Promise<string | null>
  renewLease?: (propertyMapId: string, token: string) => Promise<boolean>
  releaseLease?: (propertyMapId: string, token: string) => Promise<void>
  initializeBaseline?: (
    propertyMapId: string,
    window: { startDate: string, endDate: string }
  ) => Promise<{ startDate: string, endDate: string }>
  completeBaseline?: (
    propertyMapId: string,
    window: { startDate: string, endDate: string }
  ) => Promise<boolean>
  syncProperty?: (
    input: PropertySyncInput,
    dependencies?: SyncDependencies
  ) => Promise<{ status: SyncStatus }>
}

const REFRESH_SKEW_MS = 5 * 60 * 1000
const PROVIDER_ATTEMPTS = 3
const MAX_DATES_PER_RUN = 30
const SYNC_LEASE_INTERVAL = '2 hours'

function needsRefresh(
  credential: ResolvedSearchConsoleCredential,
  now: Date
): boolean {
  return Boolean(
    credential.tokenExpiresAt
    && new Date(credential.tokenExpiresAt).getTime()
    <= now.getTime() + REFRESH_SKEW_MS
  )
}

function isRetryable(error: unknown): boolean {
  const candidate = error as {
    statusCode?: number
    status?: number
    code?: string
    message?: string
  }
  const status = candidate?.statusCode ?? candidate?.status
  return status === 429
    || Boolean(status && status >= 500)
    || ['ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(candidate?.code || '')
    || /fetch failed|network|socket hang up/i.test(candidate?.message || '')
}

async function withProviderRetry<T>(
  operation: () => Promise<T>,
  sleep: (milliseconds: number) => Promise<void>
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < PROVIDER_ATTEMPTS; attempt += 1) {
    try {
      return await operation()
    } catch (error: unknown) {
      lastError = error
      if (!isRetryable(error) || attempt === PROVIDER_ATTEMPTS - 1) throw error
      await sleep(250 * 2 ** attempt)
    }
  }
  throw lastError
}

async function defaultCreateRun(input: PropertySyncInput): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO gsc_sync_runs (
       client_id, property_map_id, trigger_type, status,
       requested_start_date, requested_end_date
     ) VALUES ($1, $2, $3, 'queued', $4, $5)
     RETURNING id`,
    [
      input.map.clientId,
      input.map.propertyMapId,
      input.triggerType,
      input.startDate,
      input.endDate
    ]
  )
  if (!row) throw new Error('Unable to create Search Console sync run')
  return row.id
}

export async function updateSearchConsoleSyncRun(
  runId: string,
  update: RunUpdate
): Promise<void> {
  const terminal = update.status !== 'running'
  await execute(
    `UPDATE gsc_sync_runs
     SET status = $2,
         started_at = COALESCE(started_at, NOW()),
         completed_at = CASE WHEN $3 THEN NOW() ELSE completed_at END,
         rows_received = COALESCE($4, rows_received),
         dates_succeeded = COALESCE($5, dates_succeeded),
         dates_failed = COALESCE($6, dates_failed),
         first_incomplete_date = COALESCE($7::date, first_incomplete_date),
         error_summary = COALESCE($8::jsonb, error_summary)
     WHERE id = $1`,
    [
      runId,
      update.status,
      terminal,
      update.rowsReceived ?? null,
      update.datesSucceeded ?? null,
      update.datesFailed ?? null,
      update.firstIncompleteDate ?? null,
      update.errors ? JSON.stringify(update.errors) : null
    ]
  )
  if (terminal) {
    await execute(
      `UPDATE search_console_property_maps map
       SET last_sync_status = $2,
           last_sync_started_at = run.started_at,
           last_sync_completed_at = run.completed_at,
           last_sync_error = CASE
             WHEN $2 IN ('partial', 'failed') THEN $3
             ELSE NULL
           END,
           updated_at = NOW()
       FROM gsc_sync_runs run
       WHERE run.id = $1
         AND map.id = run.property_map_id
         AND ($4::uuid IS NULL OR map.sync_lease_token = $4::uuid)`,
      [
        runId,
        update.status,
        update.errors?.length ? JSON.stringify(update.errors) : null,
        update.leaseToken ?? null
      ]
    )
    await execute(
      `WITH complete_dates AS (
         SELECT
           checks.metric_date,
           BOOL_OR(checks.provisional) AS provisional
         FROM gsc_projection_checks checks
         JOIN gsc_sync_runs run
           ON run.property_map_id = checks.property_map_id
         WHERE run.id = $1
           AND checks.search_type = 'web'
         GROUP BY checks.metric_date
         HAVING COUNT(DISTINCT checks.projection) = 3
       )
       UPDATE search_console_property_maps map
       SET data_through_date = (
             SELECT MAX(metric_date) FROM complete_dates
           ),
           provisional_from_date = (
             SELECT MIN(metric_date)
             FROM complete_dates
             WHERE provisional
           ),
           updated_at = NOW()
       FROM gsc_sync_runs run
       WHERE run.id = $1
         AND map.id = run.property_map_id
         AND ($2::uuid IS NULL OR map.sync_lease_token = $2::uuid)`,
      [runId, update.leaseToken ?? null]
    )
    await execute(
      `UPDATE search_console_connections connection
       SET status = CASE
             WHEN $2 = 'succeeded' THEN 'active'
             WHEN connection.status = 'disconnected' THEN 'disconnected'
             ELSE 'degraded'
           END,
           last_checked_at = NOW(),
           last_success_at = CASE
             WHEN $2 = 'succeeded' THEN NOW()
             ELSE connection.last_success_at
           END,
           last_error_code = CASE
             WHEN $2 = 'succeeded' THEN NULL
             ELSE 'search_console_sync_failed'
           END,
           last_error_message = CASE
             WHEN $2 = 'succeeded' THEN NULL
             ELSE 'Search Console evidence refresh did not complete.'
           END,
           updated_at = NOW()
       FROM search_console_property_maps map, gsc_sync_runs run
       WHERE run.id = $1
         AND map.id = run.property_map_id
         AND connection.id = map.connection_id
         AND ($3::uuid IS NULL OR map.sync_lease_token = $3::uuid)`,
      [runId, update.status, update.leaseToken ?? null]
    )
  }
}

async function defaultListCompletedProjections(
  input: PropertySyncInput
): Promise<string[]> {
  const rows = await queryRows<{
    metric_date: string
    projection: 'property' | 'page' | 'query_page'
  }>(
    `SELECT metric_date::text, projection
     FROM gsc_projection_checks
     WHERE client_id = $1
       AND property_map_id = $2
       AND search_type = 'web'
       AND metric_date BETWEEN $3::date AND $4::date`,
    [
      input.map.clientId,
      input.map.propertyMapId,
      input.startDate,
      input.endDate
    ]
  )
  return rows.map(row => (
    `${row.metric_date}:${row.projection === 'query_page' ? 'queryPage' : row.projection}`
  ))
}

function errorRecord(
  date: string,
  projection: string,
  error: unknown
): Record<string, unknown> {
  return {
    date,
    projection,
    message: error instanceof Error ? error.message : 'Unknown sync failure'
  }
}

export async function syncSearchConsoleProperty(
  input: PropertySyncInput,
  dependencies: SyncDependencies = {}
): Promise<{ runId: string, status: SyncStatus }> {
  const createRun = dependencies.createRun ?? defaultCreateRun
  const updateRun = dependencies.updateRun ?? updateSearchConsoleSyncRun
  const runId = await createRun(input)
  await updateRun(runId, { status: 'running' })

  const errors: Array<Record<string, unknown>> = []
  let rowsReceived = 0
  let projectionsSucceeded = 0
  let datesSucceeded = 0
  let datesFailed = 0
  let firstIncompleteDate: string | null = null

  try {
    if (input.credentialError) throw input.credentialError
    let credential = input.credential
      ?? await (dependencies.resolveCredential ?? resolveSearchConsoleCredential)(
        input.map.connectionId
      )
    if (needsRefresh(credential, (dependencies.now ?? (() => new Date()))())) {
      credential = await (dependencies.refreshCredential
        ?? refreshSearchConsoleCredential)(input.map.connectionId)
    }

    const queryAnalytics = dependencies.queryAnalytics ?? querySearchAnalytics
    const sleep = dependencies.sleep
      ?? ((milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds)))
    const replacements = {
      property: dependencies.replacePropertyDate ?? replacePropertyDate,
      page: dependencies.replacePageDate ?? replacePageDate,
      queryPage: dependencies.replaceQueryPageDate ?? replaceQueryPageDate
    }

    const resumeFromProjectionChecks = input.resumeFromProjectionChecks
      ?? !input.map.baselineCompleted
    const completed = new Set(!resumeFromProjectionChecks
      ? []
      : await (
          dependencies.listCompletedProjections ?? defaultListCompletedProjections
        )(input))
    const incompleteDates = listSearchConsoleDates(input.startDate, input.endDate)
      .filter(metricDate => (
        ['property', 'page', 'queryPage']
          .some(projection => !completed.has(`${metricDate}:${projection}`))
      ))
    const datesToProcess = incompleteDates.slice(0, MAX_DATES_PER_RUN)

    for (const metricDate of datesToProcess) {
      if (
        input.leaseToken
        && !await (dependencies.renewLease ?? defaultRenewLease)(
          input.map.propertyMapId,
          input.leaseToken
        )
      ) {
        throw new Error('Search Console sync lease ownership was lost')
      }
      const projections: Array<{
        name: 'property' | 'page' | 'queryPage'
        request: SearchAnalyticsRequest
      }> = [
        {
          name: 'property',
          request: { startDate: metricDate, endDate: metricDate, dimensions: [], dataState: 'all' }
        },
        {
          name: 'page',
          request: { startDate: metricDate, endDate: metricDate, dimensions: ['page'], dataState: 'all' }
        },
        {
          name: 'queryPage',
          request: {
            startDate: metricDate,
            endDate: metricDate,
            dimensions: ['query', 'page'],
            dataState: 'all'
          }
        }
      ]
      const pendingProjections = projections.filter(
        projection => !completed.has(`${metricDate}:${projection.name}`)
      )
      const providerResults = await Promise.all(pendingProjections.map(async (projection) => {
        try {
          const result = await withProviderRetry(
            () => queryAnalytics(
              credential.accessToken,
              input.map.propertyUri,
              projection.request
            ),
            sleep
          )
          return { projection, result } as {
            projection: typeof projection
            result: SearchAnalyticsResult
          }
        } catch (error: unknown) {
          return { projection, error }
        }
      }))

      let dateComplete = true
      for (const providerResult of providerResults) {
        if ('error' in providerResult) {
          dateComplete = false
          errors.push(errorRecord(
            metricDate,
            providerResult.projection.name,
            providerResult.error
          ))
          continue
        }
        const { projection, result } = providerResult
        if (result.truncated) {
          dateComplete = false
          errors.push({
            date: metricDate,
            projection: projection.name,
            message: 'Provider result reached the 50,000-row safety cap'
          })
          continue
        }
        rowsReceived += result.rows.length
        if (
          result.firstIncompleteDate
          && (!firstIncompleteDate || result.firstIncompleteDate < firstIncompleteDate)
        ) {
          firstIncompleteDate = result.firstIncompleteDate
        }
        try {
          await replacements[projection.name]({
            clientId: input.map.clientId,
            propertyMapId: input.map.propertyMapId,
            metricDate,
            searchType: 'web',
            firstIncompleteDate: result.firstIncompleteDate,
            rows: result.rows
          })
          projectionsSucceeded += 1
        } catch (error: unknown) {
          dateComplete = false
          errors.push(errorRecord(metricDate, projection.name, error))
        }
      }
      if (dateComplete) datesSucceeded += 1
      else datesFailed += 1
    }
    if (incompleteDates.length > datesToProcess.length) {
      errors.push({
        date: datesToProcess.at(-1) ?? input.startDate,
        projection: 'continuation',
        message: 'Backfill paused at the per-run safety limit and will resume.'
      })
    }
  } catch (error: unknown) {
    errors.push(errorRecord(input.startDate, 'connection', error))
    datesFailed = Math.max(1, datesFailed)
  }

  const status: SyncStatus = errors.length === 0
    ? 'succeeded'
    : projectionsSucceeded > 0
      ? 'partial'
      : 'failed'
  await updateRun(runId, {
    status,
    rowsReceived,
    datesSucceeded,
    datesFailed,
    firstIncompleteDate,
    errors,
    leaseToken: input.leaseToken
  })
  return { runId, status }
}

async function defaultListMaps(
  clientId: string
): Promise<SearchConsolePropertyMap[]> {
  const rows = await queryRows<{
    client_id: string
    property_map_id: string
    connection_id: string
    property_uri: string
    baseline_completed: boolean
    baseline_start_date: string | null
    baseline_end_date: string | null
  }>(
    `SELECT
       client_id,
       id AS property_map_id,
       connection_id,
       property_uri,
       baseline_completed_at IS NOT NULL AS baseline_completed,
       baseline_start_date::text,
       baseline_end_date::text
     FROM search_console_property_maps
     WHERE client_id = $1 AND status IN ('active', 'restricted')
     ORDER BY created_at`,
    [clientId]
  )
  return rows.map(row => ({
    clientId: row.client_id,
    propertyMapId: row.property_map_id,
    connectionId: row.connection_id,
    propertyUri: row.property_uri,
    baselineCompleted: row.baseline_completed,
    baselineStartDate: row.baseline_start_date,
    baselineEndDate: row.baseline_end_date
  }))
}

async function defaultAcquireLease(propertyMapId: string): Promise<string | null> {
  const row = await queryOne<{ sync_lease_token: string }>(
    `UPDATE search_console_property_maps
     SET sync_lease_token = gen_random_uuid(),
         sync_lease_expires_at = NOW() + INTERVAL '${SYNC_LEASE_INTERVAL}',
         updated_at = NOW()
     WHERE id = $1
       AND (
         sync_lease_expires_at IS NULL
         OR sync_lease_expires_at < NOW()
       )
     RETURNING sync_lease_token`,
    [propertyMapId]
  )
  return row?.sync_lease_token ?? null
}

async function defaultRenewLease(
  propertyMapId: string,
  token: string
): Promise<boolean> {
  const updated = await execute(
    `UPDATE search_console_property_maps
     SET sync_lease_expires_at = NOW() + INTERVAL '${SYNC_LEASE_INTERVAL}',
         updated_at = NOW()
     WHERE id = $1 AND sync_lease_token = $2::uuid`,
    [propertyMapId, token]
  )
  return updated === 1
}

async function defaultReleaseLease(
  propertyMapId: string,
  token: string
): Promise<void> {
  await execute(
    `UPDATE search_console_property_maps
     SET sync_lease_token = NULL,
         sync_lease_expires_at = NULL,
         updated_at = NOW()
     WHERE id = $1 AND sync_lease_token = $2::uuid`,
    [propertyMapId, token]
  )
}

async function defaultInitializeBaseline(
  propertyMapId: string,
  window: { startDate: string, endDate: string }
): Promise<{ startDate: string, endDate: string }> {
  const row = await queryOne<{
    baseline_start_date: string
    baseline_end_date: string
  }>(
    `UPDATE search_console_property_maps
     SET baseline_start_date = CASE
           WHEN baseline_start_date IS NULL OR baseline_end_date IS NULL
             THEN $2::date
           ELSE baseline_start_date
         END,
         baseline_end_date = CASE
           WHEN baseline_start_date IS NULL OR baseline_end_date IS NULL
             THEN $3::date
           ELSE baseline_end_date
         END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING baseline_start_date::text, baseline_end_date::text`,
    [propertyMapId, window.startDate, window.endDate]
  )
  if (!row) throw new Error('Unable to initialize Search Console baseline')
  return {
    startDate: row.baseline_start_date,
    endDate: row.baseline_end_date
  }
}

async function defaultCompleteBaseline(
  propertyMapId: string,
  window: { startDate: string, endDate: string }
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `WITH complete_dates AS (
       SELECT checks.metric_date
       FROM gsc_projection_checks checks
       WHERE checks.property_map_id = $1
         AND checks.search_type = 'web'
         AND checks.metric_date BETWEEN $2::date AND $3::date
       GROUP BY checks.metric_date
       HAVING COUNT(DISTINCT checks.projection) = 3
     )
     UPDATE search_console_property_maps map
     SET baseline_completed_at = NOW(),
         updated_at = NOW()
     WHERE map.id = $1
       AND map.baseline_start_date = $2::date
       AND map.baseline_end_date = $3::date
       AND (
         SELECT COUNT(*) FROM complete_dates
       ) = ($3::date - $2::date + 1)
     RETURNING map.id`,
    [propertyMapId, window.startDate, window.endDate]
  )
  return Boolean(row)
}

export async function syncSearchConsoleClient(
  input: ClientSyncInput,
  dependencies: SyncDependencies = {}
): Promise<Array<{ status: SyncStatus }>> {
  const maps = await (dependencies.listMaps ?? defaultListMaps)(input.clientId)
  const credentialCache = new Map<string, {
    credential?: ResolvedSearchConsoleCredential
    error?: unknown
  }>()
  const now = (dependencies.now ?? (() => new Date()))()

  for (const map of maps) {
    if (credentialCache.has(map.connectionId)) continue
    try {
      let credential = await (dependencies.resolveCredential
        ?? resolveSearchConsoleCredential)(map.connectionId)
      if (needsRefresh(credential, now)) {
        credential = await (dependencies.refreshCredential
          ?? refreshSearchConsoleCredential)(map.connectionId)
      }
      credentialCache.set(map.connectionId, { credential })
    } catch (error: unknown) {
      credentialCache.set(map.connectionId, { error })
    }
  }

  const syncProperty = dependencies.syncProperty ?? syncSearchConsoleProperty
  const results = []
  for (const map of maps) {
    const cached = credentialCache.get(map.connectionId)!
    const leaseToken = await (
      dependencies.acquireLease ?? defaultAcquireLease
    )(map.propertyMapId)
    if (!leaseToken) continue
    try {
      const explicitWindow = Boolean(input.startDate && input.endDate)
      const isBaselineRun = !explicitWindow && !map.baselineCompleted
      let window = explicitWindow
        ? { startDate: input.startDate!, endDate: input.endDate! }
        : searchConsoleSyncWindow({
            now,
            baselineCompleted: map.baselineCompleted
          })
      if (isBaselineRun) {
        window = await (dependencies.initializeBaseline
          ?? defaultInitializeBaseline)(
          map.propertyMapId,
          map.baselineStartDate && map.baselineEndDate
            ? {
                startDate: map.baselineStartDate,
                endDate: map.baselineEndDate
              }
            : window
        )
      }
      const result = await syncProperty({
        map,
        startDate: window.startDate,
        endDate: window.endDate,
        triggerType: input.triggerType,
        credential: cached.credential,
        credentialError: cached.error,
        leaseToken,
        resumeFromProjectionChecks: isBaselineRun
      }, dependencies)
      results.push(result)
      if (isBaselineRun) {
        await (dependencies.completeBaseline ?? defaultCompleteBaseline)(
          map.propertyMapId,
          window
        )
      }
    } finally {
      await (dependencies.releaseLease ?? defaultReleaseLease)(
        map.propertyMapId,
        leaseToken
      )
    }
  }
  return results
}
