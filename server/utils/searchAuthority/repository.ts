import { transaction } from '~~/server/utils/db'
import type { SearchAnalyticsRow } from '~~/server/utils/searchAuthority/googleClient'

type SearchType = 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews'

interface TransactionClient {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}

type TransactionRunner = <T>(
  callback: (db: TransactionClient) => Promise<T>
) => Promise<T>

interface RepositoryDependencies {
  runTransaction?: TransactionRunner
}

export interface ReplaceProjectionDateInput {
  clientId: string
  propertyMapId: string
  metricDate: string
  searchType?: SearchType
  firstIncompleteDate: string | null
  rows: SearchAnalyticsRow[]
}

const INSERT_BATCH_SIZE = 500

function isProvisional(input: ReplaceProjectionDateInput): boolean {
  return Boolean(
    input.firstIncompleteDate
    && input.metricDate >= input.firstIncompleteDate
  )
}

async function markProjectionChecked(
  db: TransactionClient,
  input: ReplaceProjectionDateInput,
  projection: 'property' | 'page' | 'query_page',
  rowCount: number
) {
  await db.query(
    `INSERT INTO gsc_projection_checks (
       client_id, property_map_id, metric_date, search_type,
       projection, row_count, provisional, first_incomplete_date
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (property_map_id, metric_date, search_type, projection)
     DO UPDATE SET
       row_count = EXCLUDED.row_count,
       provisional = EXCLUDED.provisional,
       first_incomplete_date = EXCLUDED.first_incomplete_date,
       checked_at = NOW()`,
    [
      input.clientId,
      input.propertyMapId,
      input.metricDate,
      input.searchType ?? 'web',
      projection,
      rowCount,
      isProvisional(input),
      input.firstIncompleteDate
    ]
  )
}

function valuesSql(rowCount: number, columnCount: number): string {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const start = rowIndex * columnCount
    return `(${Array.from({ length: columnCount }, (
      __,
      columnIndex
    ) => `$${start + columnIndex + 1}`).join(', ')})`
  }).join(', ')
}

async function insertBatches<T>(
  db: TransactionClient,
  rows: T[],
  insert: (batch: T[]) => Promise<void>
) {
  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    await insert(rows.slice(index, index + INSERT_BATCH_SIZE))
  }
}

export async function replaceQueryPageDate(
  input: ReplaceProjectionDateInput,
  dependencies: RepositoryDependencies = {}
): Promise<void> {
  const runTransaction = dependencies.runTransaction
    ?? transaction as unknown as TransactionRunner
  await runTransaction(async (db) => {
    await db.query(
      `DELETE FROM gsc_daily_query_page
       WHERE client_id = $1 AND property_map_id = $2
         AND metric_date = $3 AND search_type = $4`,
      [input.clientId, input.propertyMapId, input.metricDate, input.searchType ?? 'web']
    )
    const rows = input.rows.filter(row => row.keys.length >= 2)
    await insertBatches(db, rows, async (batch) => {
      const params = batch.flatMap(row => [
        input.clientId,
        input.propertyMapId,
        input.metricDate,
        input.searchType ?? 'web',
        row.keys[0],
        row.keys[1],
        row.clicks,
        row.impressions,
        row.ctr,
        row.position,
        isProvisional(input),
        input.firstIncompleteDate
      ])
      await db.query(
        `INSERT INTO gsc_daily_query_page (
           client_id, property_map_id, metric_date, search_type,
           query_text, page_url, clicks, impressions, ctr, position,
           provisional, first_incomplete_date
         ) VALUES ${valuesSql(batch.length, 12)}`,
        params
      )
    })
    await markProjectionChecked(db, input, 'query_page', rows.length)
  })
}

export async function replacePageDate(
  input: ReplaceProjectionDateInput,
  dependencies: RepositoryDependencies = {}
): Promise<void> {
  const runTransaction = dependencies.runTransaction
    ?? transaction as unknown as TransactionRunner
  await runTransaction(async (db) => {
    await db.query(
      `DELETE FROM gsc_daily_page
       WHERE client_id = $1 AND property_map_id = $2
         AND metric_date = $3 AND search_type = $4`,
      [input.clientId, input.propertyMapId, input.metricDate, input.searchType ?? 'web']
    )
    const rows = input.rows.filter(row => row.keys.length >= 1)
    await insertBatches(db, rows, async (batch) => {
      const params = batch.flatMap(row => [
        input.clientId,
        input.propertyMapId,
        input.metricDate,
        input.searchType ?? 'web',
        row.keys[0],
        row.clicks,
        row.impressions,
        row.ctr,
        row.position,
        isProvisional(input),
        input.firstIncompleteDate
      ])
      await db.query(
        `INSERT INTO gsc_daily_page (
           client_id, property_map_id, metric_date, search_type,
           page_url, clicks, impressions, ctr, position,
           provisional, first_incomplete_date
         ) VALUES ${valuesSql(batch.length, 11)}`,
        params
      )
    })
    await markProjectionChecked(db, input, 'page', rows.length)
  })
}

export async function replacePropertyDate(
  input: ReplaceProjectionDateInput,
  dependencies: RepositoryDependencies = {}
): Promise<void> {
  const runTransaction = dependencies.runTransaction
    ?? transaction as unknown as TransactionRunner
  await runTransaction(async (db) => {
    await db.query(
      `DELETE FROM gsc_daily_property
       WHERE client_id = $1 AND property_map_id = $2
         AND metric_date = $3 AND search_type = $4`,
      [input.clientId, input.propertyMapId, input.metricDate, input.searchType ?? 'web']
    )
    const row = input.rows[0]
    if (row) {
      await db.query(
        `INSERT INTO gsc_daily_property (
           client_id, property_map_id, metric_date, search_type,
           clicks, impressions, ctr, position,
           provisional, first_incomplete_date
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          input.clientId,
          input.propertyMapId,
          input.metricDate,
          input.searchType ?? 'web',
          row.clicks,
          row.impressions,
          row.ctr,
          row.position,
          isProvisional(input),
          input.firstIncompleteDate
        ]
      )
    }
    await markProjectionChecked(db, input, 'property', row ? 1 : 0)
  })
}
