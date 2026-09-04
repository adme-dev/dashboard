import { z } from 'zod'
import { queryOne as defaultQueryOne } from '~~/server/utils/db'
import { MeasurementError } from '~~/server/utils/measurement/errors'

const IdentifierCoverageSchema = z.strictObject({
  ttclid: z.number().int().nonnegative(),
  ttp: z.number().int().nonnegative(),
  fbc: z.number().int().nonnegative(),
  fbp: z.number().int().nonnegative(),
  gclid: z.number().int().nonnegative(),
  gbraid: z.number().int().nonnegative(),
  wbraid: z.number().int().nonnegative()
})

export const MeasurementSignalSummarySchema = z.strictObject({
  captured: z.number().int().nonnegative(),
  confirmed: z.number().int().nonnegative(),
  consentGranted: z.number().int().nonnegative(),
  policySkipped: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  retrying: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  identifierCoverage: IdentifierCoverageSchema,
  freshnessAt: z.string().datetime({ offset: true }).nullable()
})

export type MeasurementSignalSummary = z.infer<typeof MeasurementSignalSummarySchema>

interface MeasurementSignalSummaryRow {
  captured: number | string | null
  confirmed: number | string | null
  consent_granted: number | string | null
  policy_skipped: number | string | null
  delivered: number | string | null
  retrying: number | string | null
  failed: number | string | null
  ttclid_coverage: number | string | null
  ttp_coverage: number | string | null
  fbc_coverage: number | string | null
  fbp_coverage: number | string | null
  gclid_coverage: number | string | null
  gbraid_coverage: number | string | null
  wbraid_coverage: number | string | null
  freshness_at: Date | string | null
}

interface SignalSummaryDeps {
  queryOne: typeof defaultQueryOne
}

const defaultDeps: SignalSummaryDeps = { queryOne: defaultQueryOne }

function count(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function optionalIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function mapSummary(row: MeasurementSignalSummaryRow | null): MeasurementSignalSummary {
  return MeasurementSignalSummarySchema.parse({
    captured: count(row?.captured),
    confirmed: count(row?.confirmed),
    consentGranted: count(row?.consent_granted),
    policySkipped: count(row?.policy_skipped),
    delivered: count(row?.delivered),
    retrying: count(row?.retrying),
    failed: count(row?.failed),
    identifierCoverage: {
      ttclid: count(row?.ttclid_coverage),
      ttp: count(row?.ttp_coverage),
      fbc: count(row?.fbc_coverage),
      fbp: count(row?.fbp_coverage),
      gclid: count(row?.gclid_coverage),
      gbraid: count(row?.gbraid_coverage),
      wbraid: count(row?.wbraid_coverage)
    },
    freshnessAt: optionalIso(row?.freshness_at)
  })
}

function validationError() {
  return new MeasurementError(
    'MEASUREMENT_VALIDATION_ERROR',
    422,
    'Invalid measurement signal summary request'
  )
}

export function createMeasurementSignalSummaryService(
  deps: SignalSummaryDeps = defaultDeps
) {
  return {
    async get(clientId: unknown): Promise<MeasurementSignalSummary> {
      const clientResult = z.string().uuid().safeParse(clientId)
      if (!clientResult.success) throw validationError()

      const row = await deps.queryOne<MeasurementSignalSummaryRow>(
        `WITH tracking AS (
           SELECT COUNT(*) AS captured,
                  COUNT(*) FILTER (WHERE consent->>'marketing' = 'granted') AS consent_granted,
                  COUNT(*) FILTER (WHERE ttclid IS NOT NULL) AS ttclid_coverage,
                  COUNT(*) FILTER (WHERE ttp IS NOT NULL) AS ttp_coverage,
                  COUNT(*) FILTER (WHERE fbc IS NOT NULL) AS fbc_coverage,
                  COUNT(*) FILTER (WHERE fbp IS NOT NULL) AS fbp_coverage,
                  COUNT(*) FILTER (WHERE gclid IS NOT NULL) AS gclid_coverage,
                  COUNT(*) FILTER (WHERE gbraid IS NOT NULL) AS gbraid_coverage,
                  COUNT(*) FILTER (WHERE wbraid IS NOT NULL) AS wbraid_coverage,
                  MAX(received_at) AS freshness_at
             FROM tracking_events
            WHERE client_id = $1
         ), canonical AS (
           SELECT COUNT(*) AS confirmed,
                  COUNT(*) FILTER (WHERE outbox_status = 'policy_skipped') AS policy_skipped,
                  MAX(created_at) AS freshness_at
             FROM conversion_events
            WHERE client_id = $1
         ), delivery AS (
           SELECT COUNT(*) FILTER (WHERE status = 'policy_skipped') AS policy_skipped,
                  COUNT(*) FILTER (WHERE status IN ('accepted', 'delivered')) AS delivered,
                  COUNT(*) FILTER (WHERE status IN ('pending', 'claimed', 'retryable')) AS retrying,
                  COUNT(*) FILTER (WHERE status = 'permanent_failure') AS failed,
                  MAX(updated_at) AS freshness_at
             FROM conversion_deliveries
            WHERE client_id = $1
         )
         SELECT tracking.captured,
                canonical.confirmed,
                tracking.consent_granted,
                canonical.policy_skipped + delivery.policy_skipped AS policy_skipped,
                delivery.delivered,
                delivery.retrying,
                delivery.failed,
                tracking.ttclid_coverage,
                tracking.ttp_coverage,
                tracking.fbc_coverage,
                tracking.fbp_coverage,
                tracking.gclid_coverage,
                tracking.gbraid_coverage,
                tracking.wbraid_coverage,
                (
                  SELECT MAX(observed_at)
                    FROM (VALUES
                      (tracking.freshness_at),
                      (canonical.freshness_at),
                      (delivery.freshness_at)
                    ) AS observations(observed_at)
                ) AS freshness_at
           FROM tracking, canonical, delivery`,
        [clientResult.data]
      )
      return mapSummary(row)
    }
  }
}
