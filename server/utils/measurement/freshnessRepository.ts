import { queryRows as defaultQueryRows } from '~~/server/utils/db'
import {
  deriveMeasurementFreshness,
  type MeasurementDataStream
} from '~~/server/utils/measurement/freshness'

const STREAMS: readonly MeasurementDataStream[] = [
  'spend', 'campaign_conversions', 'conversion_actions', 'website_events', 'provider_calls'
]

interface FreshnessRow {
  stream: MeasurementDataStream
  last_attempt_at: Date | string | null
  last_success_at: Date | string | null
  requested_start_date?: Date | string | null
  requested_end_date?: Date | string | null
  covered_start_date?: Date | string | null
  covered_end_date?: Date | string | null
  current_job_state: string | null
  unavailable_reason_code?: string | null
}

interface FreshnessRepositoryDependencies {
  queryRows<T>(sql: string, params?: unknown[]): Promise<T[]>
}

function timestamp(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null
}

function date(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString().slice(0, 10) : null
}

function range(start: Date | string | null | undefined, end: Date | string | null | undefined) {
  const startDate = date(start)
  const endDate = date(end)
  return startDate && endDate ? { startDate, endDate } : null
}

export function createMeasurementFreshnessRepository(
  dependencies: FreshnessRepositoryDependencies = { queryRows: defaultQueryRows }
) {
  return {
    async list(input: { clientId: string, now?: Date }) {
      const [configuredRows, derivedRows] = await Promise.all([
        dependencies.queryRows<FreshnessRow>(
          `SELECT stream, last_attempt_at, last_success_at,
                  requested_start_date, requested_end_date,
                  covered_start_date, covered_end_date,
                  current_job_state, unavailable_reason_code
             FROM measurement_data_freshness
            WHERE client_id = $1
            ORDER BY stream ASC`,
          [input.clientId]
        ),
        dependencies.queryRows<FreshnessRow>(
          `SELECT 'spend'::text AS stream,
                  MAX(synced_at) AS last_attempt_at,
                  MAX(synced_at) AS last_success_at,
                  'completed'::text AS current_job_state
             FROM media_spend
            WHERE client_id = $1
           UNION ALL
           SELECT 'campaign_conversions'::text AS stream,
                  MAX(synced_at), MAX(synced_at), 'completed'::text
             FROM media_spend
            WHERE client_id = $1
           UNION ALL
           SELECT 'website_events'::text AS stream,
                  MAX(received_at), MAX(received_at), 'completed'::text
             FROM measurement_evidence_events
            WHERE client_id = $1
           UNION ALL
           SELECT 'provider_calls'::text AS stream,
                  MAX(state.last_attempt_at), MAX(state.last_success_at),
                  CASE
                    WHEN COUNT(*) FILTER (WHERE state.current_job_state = 'failed') > 0 THEN 'failed'
                    WHEN COUNT(*) FILTER (WHERE state.current_job_state = 'running') > 0 THEN 'running'
                    WHEN COUNT(*) FILTER (WHERE state.current_job_state = 'pending') > 0 THEN 'pending'
                    WHEN COUNT(*) FILTER (WHERE state.current_job_state = 'completed') > 0 THEN 'completed'
                    ELSE 'idle'
                  END
             FROM google_ads_call_sync_state state
             JOIN social_connections connection ON connection.id = state.connection_id
            WHERE connection.client_id = $1`,
          [input.clientId]
        )
      ])
      const rows = new Map<MeasurementDataStream, FreshnessRow>()
      for (const row of derivedRows) {
        if (row.last_attempt_at || row.last_success_at) rows.set(row.stream, row)
      }
      for (const row of configuredRows) rows.set(row.stream, row)

      return {
        clientId: input.clientId,
        streams: STREAMS.map((stream) => {
          const row = rows.get(stream)
          return deriveMeasurementFreshness({
            stream,
            lastAttemptAt: timestamp(row?.last_attempt_at),
            lastSuccessAt: timestamp(row?.last_success_at),
            requestedRange: range(row?.requested_start_date, row?.requested_end_date),
            coveredRange: range(row?.covered_start_date, row?.covered_end_date),
            currentJobState: row?.current_job_state ?? 'idle',
            unavailableReasonCode: row?.unavailable_reason_code ?? null,
            now: input.now
          })
        })
      }
    }
  }
}

export const measurementFreshnessRepository = createMeasurementFreshnessRepository()
