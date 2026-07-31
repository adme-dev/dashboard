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
  hasSuccessfulSync?: boolean
}

interface PropertySyncInput {
  map: SearchConsolePropertyMap
  startDate: string
  endDate: string
  triggerType: TriggerType
  credential?: ResolvedSearchConsoleCredential
  credentialError?: unknown
}

interface ClientSyncInput {
  clientId: string
  startDate?: string
  endDate?: string
  triggerType: TriggerType
}

interface RunUpdate {
  status: 'running' | SyncStatus
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
  syncProperty?: (
    input: PropertySyncInput,
    dependencies?: SyncDependencies
  ) => Promise<{ status: SyncStatus }>
}

const REFRESH_SKEW_MS = 5 * 60 * 1000
const PROVIDER_ATTEMPTS = 3

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

async function defaultUpdateRun(runId: string, update: RunUpdate): Promise<void> {
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
       WHERE run.id = $1 AND map.id = run.property_map_id`,
      [
        runId,
        update.status,
        update.errors?.length ? JSON.stringify(update.errors) : null
      ]
    )
  }
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
  const updateRun = dependencies.updateRun ?? defaultUpdateRun
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

    for (const metricDate of listSearchConsoleDates(input.startDate, input.endDate)) {
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
      const providerResults = await Promise.all(projections.map(async (projection) => {
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
          if (result.truncated) {
            dateComplete = false
            errors.push({
              date: metricDate,
              projection: projection.name,
              message: 'Provider result reached the 50,000-row safety cap'
            })
          }
        } catch (error: unknown) {
          dateComplete = false
          errors.push(errorRecord(metricDate, projection.name, error))
        }
      }
      if (dateComplete) datesSucceeded += 1
      else datesFailed += 1
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
    errors
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
    has_successful_sync: boolean
  }>(
    `SELECT
       client_id,
       id AS property_map_id,
       connection_id,
       property_uri,
       (
         last_sync_status = 'succeeded'
         AND last_sync_completed_at IS NOT NULL
       ) AS has_successful_sync
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
    hasSuccessfulSync: row.has_successful_sync
  }))
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
    const window = input.startDate && input.endDate
      ? { startDate: input.startDate, endDate: input.endDate }
      : searchConsoleSyncWindow({
          now,
          hasSuccessfulSync: map.hasSuccessfulSync
        })
    results.push(await syncProperty({
      map,
      startDate: window.startDate,
      endDate: window.endDate,
      triggerType: input.triggerType,
      credential: cached.credential,
      credentialError: cached.error
    }, dependencies))
  }
  return results
}
