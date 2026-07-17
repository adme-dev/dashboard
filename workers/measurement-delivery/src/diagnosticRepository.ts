interface QueryResult {
  rows?: unknown[]
}

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<QueryResult>
}

interface RepositoryDeps {
  transaction: <T>(callback: (db: TransactionClient) => Promise<T>) => Promise<T>
}

interface DiagnosticRow {
  delivery_id: string
  client_id: string
  destination_id: string
  provider_request_id: string
  diagnostic_started_at: Date | string
  diagnostic_check_count: number | string
  refresh_token: string | null
  scopes: unknown
}

export interface MeasurementDiagnosticClaim {
  clientId: string
  deliveryId: string
  destinationId: string
  requestId: string
  startedAt: string
  checkNumber: number
  workerId: string
  refreshToken: string | null
  connectionScopes: string[]
}

export type MeasurementDiagnosticCompletionOutcome
  = 'processing'
    | 'success'
    | 'partial_success'
    | 'failed'
    | 'http_failure'
    | 'timed_out'
    | 'credential_failure'

export interface MeasurementDiagnosticCompletion {
  outcome: MeasurementDiagnosticCompletionOutcome
  warningCount: number
  errorCount: number
  errorClass: string | null
  redactedDiagnostic: string | null
  nextCheckAt: string | null
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function scopes(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((scope): scope is string => typeof scope === 'string')
    : []
}

function diagnosticStatus(outcome: MeasurementDiagnosticCompletionOutcome): string {
  if (outcome === 'http_failure') return 'processing'
  if (outcome === 'credential_failure') return 'failed'
  return outcome
}

export function createMeasurementDiagnosticRepository(deps: RepositoryDeps) {
  return {
    async claimNext(workerId: string, now: Date): Promise<MeasurementDiagnosticClaim | null> {
      return deps.transaction(async (db) => {
        const selected = await db.query(
          `SELECT d.id AS delivery_id,
                  d.client_id,
                  d.destination_id,
                  d.provider_request_id,
                  COALESCE(d.diagnostic_started_at, d.last_attempt_at, d.created_at)
                    AS diagnostic_started_at,
                  d.diagnostic_check_count,
                  sc.refresh_token,
                  sc.scopes
             FROM conversion_deliveries d
             JOIN conversion_destinations dest
               ON dest.client_id = d.client_id
              AND dest.id = d.destination_id
             LEFT JOIN social_connections sc
               ON sc.client_id = dest.client_id
              AND sc.id = dest.social_connection_id
              AND sc.platform = 'google'
              AND sc.status = 'active'
            WHERE dest.platform = 'google_data_manager'
              AND d.status = 'accepted'
              AND d.provider_request_id IS NOT NULL
              AND d.diagnostic_status IN ('pending', 'processing')
              AND d.diagnostic_next_check_at <= $1::timestamptz
              AND (
                d.diagnostic_claimed_at IS NULL
                OR d.diagnostic_claimed_at < $1::timestamptz - INTERVAL '5 minutes'
              )
            ORDER BY d.diagnostic_next_check_at, d.created_at
            FOR UPDATE OF d SKIP LOCKED
            LIMIT 1`,
          [now.toISOString()]
        )
        const row = selected.rows?.[0] as DiagnosticRow | undefined
        if (!row) return null

        const claimed = await db.query(
          `UPDATE conversion_deliveries
              SET diagnostic_claimed_at = $3::timestamptz,
                  diagnostic_claimed_by = $2,
                  diagnostic_check_count = diagnostic_check_count + 1,
                  updated_at = $3::timestamptz
            WHERE id = $1
              AND client_id = $4
          RETURNING diagnostic_check_count`,
          [row.delivery_id, workerId, now.toISOString(), row.client_id]
        )
        const checkNumber = Number(
          (claimed.rows?.[0] as { diagnostic_check_count?: number | string } | undefined)
            ?.diagnostic_check_count
        )
        if (!Number.isInteger(checkNumber) || checkNumber < 1) {
          throw new Error('Measurement diagnostic was not claimed')
        }
        return {
          clientId: row.client_id,
          deliveryId: row.delivery_id,
          destinationId: row.destination_id,
          requestId: row.provider_request_id,
          startedAt: iso(row.diagnostic_started_at),
          checkNumber,
          workerId,
          refreshToken: row.refresh_token,
          connectionScopes: scopes(row.scopes)
        }
      })
    },

    async complete(
      claim: MeasurementDiagnosticClaim,
      result: MeasurementDiagnosticCompletion,
      now: Date
    ): Promise<void> {
      await deps.transaction(async (db) => {
        await db.query(
          `INSERT INTO conversion_delivery_diagnostic_checks (
             client_id, delivery_id, check_number, outcome,
             warning_count, error_count, error_class, redacted_diagnostic, checked_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)`,
          [
            claim.clientId,
            claim.deliveryId,
            claim.checkNumber,
            result.outcome,
            result.warningCount,
            result.errorCount,
            result.errorClass,
            result.redactedDiagnostic,
            now.toISOString()
          ]
        )

        const common = [
          claim.deliveryId,
          diagnosticStatus(result.outcome),
          result.nextCheckAt,
          now.toISOString(),
          result.errorClass,
          result.redactedDiagnostic,
          result.warningCount,
          result.errorCount,
          claim.workerId,
          claim.checkNumber,
          claim.clientId
        ]
        let completed: QueryResult
        if (result.outcome === 'success') {
          completed = await db.query(
            `UPDATE conversion_deliveries
                SET status = 'delivered',
                    delivered_at = $4::timestamptz,
                    diagnostic_status = $2,
                    diagnostic_next_check_at = $3::timestamptz,
                    diagnostic_last_checked_at = $4::timestamptz,
                    diagnostic_claimed_at = NULL,
                    diagnostic_claimed_by = NULL,
                    diagnostic_warning_count = $7,
                    diagnostic_error_count = $8,
                    error_class = $5,
                    redacted_error = $6,
                    updated_at = $4::timestamptz
              WHERE id = $1
                AND client_id = $11
                AND status = 'accepted'
                AND diagnostic_claimed_by = $9
                AND diagnostic_check_count = $10
          RETURNING id`,
            common
          )
        } else if (['partial_success', 'failed', 'timed_out', 'credential_failure'].includes(result.outcome)) {
          completed = await db.query(
            `UPDATE conversion_deliveries
                SET status = 'permanent_failure',
                    diagnostic_status = $2,
                    diagnostic_next_check_at = NULL,
                    diagnostic_last_checked_at = $4::timestamptz,
                    diagnostic_claimed_at = NULL,
                    diagnostic_claimed_by = NULL,
                    diagnostic_warning_count = $7,
                    diagnostic_error_count = $8,
                    error_class = $5,
                    redacted_error = $6,
                    updated_at = $4::timestamptz
              WHERE id = $1
                AND client_id = $11
                AND status = 'accepted'
                AND diagnostic_claimed_by = $9
                AND diagnostic_check_count = $10
          RETURNING id`,
            common
          )
        } else {
          completed = await db.query(
            `UPDATE conversion_deliveries
                SET diagnostic_status = $2,
                    diagnostic_next_check_at = $3::timestamptz,
                    diagnostic_last_checked_at = $4::timestamptz,
                    diagnostic_claimed_at = NULL,
                    diagnostic_claimed_by = NULL,
                    diagnostic_warning_count = $7,
                    diagnostic_error_count = $8,
                    error_class = $5,
                    redacted_error = $6,
                    updated_at = $4::timestamptz
              WHERE id = $1
                AND client_id = $11
                AND status = 'accepted'
                AND diagnostic_claimed_by = $9
                AND diagnostic_check_count = $10
          RETURNING id`,
            common
          )
        }
        if (!completed.rows?.[0]) {
          throw new Error('Measurement diagnostic lease is no longer owned')
        }

        const terminal = result.outcome === 'success'
          || ['partial_success', 'failed', 'timed_out', 'credential_failure'].includes(result.outcome)
        if (terminal) {
          const success = result.outcome === 'success'
          const health = result.outcome === 'credential_failure'
            ? 'blocked'
            : success && result.warningCount === 0
              ? 'ready'
              : 'degraded'
          await db.query(
            `UPDATE conversion_destinations
                SET health_status = $2,
                    last_success_at = CASE WHEN $3 THEN $4::timestamptz ELSE last_success_at END,
                    last_failure_at = CASE WHEN $3 THEN last_failure_at ELSE $4::timestamptz END,
                    provider_request_id = $5,
                    error_class = $6,
                    redacted_error = $7,
                    updated_at = $4::timestamptz
              WHERE id = $1
                AND client_id = $8`,
            [
              claim.destinationId,
              health,
              success,
              now.toISOString(),
              claim.requestId,
              result.errorClass,
              result.redactedDiagnostic,
              claim.clientId
            ]
          )
        }
      })
    }
  }
}
