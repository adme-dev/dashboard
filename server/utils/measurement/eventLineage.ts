import { z } from 'zod'
import { queryRows as defaultQueryRows } from '~~/server/utils/db'
import {
  CanonicalEventNameSchema,
  MeasurementPlatformSchema
} from '~~/server/utils/measurement/contracts'
import { MeasurementError } from '~~/server/utils/measurement/errors'

const DELIVERY_OUTCOMES = [
  'paused',
  'pending',
  'claimed',
  'published',
  'accepted',
  'delivered',
  'retryable',
  'permanent_failure',
  'policy_skipped',
  'failed',
  'cancelled'
] as const

const LineageOutcomeSchema = z.enum(DELIVERY_OUTCOMES)
const LineageFiltersSchema = z.strictObject({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  state: LineageOutcomeSchema.optional(),
  eventName: CanonicalEventNameSchema.optional(),
  platform: MeasurementPlatformSchema.optional(),
  cursor: z.string().trim().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
})

const CursorSchema = z.strictObject({
  occurredAt: z.string().datetime({ offset: true }),
  eventId: z.string().uuid(),
  lineageId: z.string().uuid()
})

const DestinationSchema = z.strictObject({
  id: z.string().uuid(),
  platform: MeasurementPlatformSchema
})

export const MeasurementLineageItemSchema = z.strictObject({
  eventId: z.string().uuid(),
  eventName: CanonicalEventNameSchema,
  occurredAt: z.string().datetime({ offset: true }),
  recordedAt: z.string().datetime({ offset: true }),
  consentState: z.enum(['granted', 'denied', 'unknown']),
  mappingVersion: z.number().int().positive(),
  destination: DestinationSchema.nullable(),
  outcome: LineageOutcomeSchema,
  outcomeAt: z.string().datetime({ offset: true }),
  receiptId: z.string().max(255).nullable(),
  redactedReason: z.string().max(500).nullable()
})

export const MeasurementLineagePageSchema = z.strictObject({
  items: z.array(MeasurementLineageItemSchema),
  nextCursor: z.string().nullable()
})

export type MeasurementLineageItem = z.infer<typeof MeasurementLineageItemSchema>
export type MeasurementLineagePage = z.infer<typeof MeasurementLineagePageSchema>

interface LineageRow {
  event_id: string
  event_name: string
  occurred_at: Date | string
  recorded_at: Date | string
  consent_decision: string
  mapping_version: number | string
  lineage_id: string
  delivery_id: string | null
  destination_id: string | null
  platform: string | null
  outcome: string
  outcome_at: Date | string
  provider_request_id: string | null
  redacted_reason: string | null
}

interface EventLineageDeps {
  queryRows: typeof defaultQueryRows
  now: () => Date
}

const defaultDeps: EventLineageDeps = {
  queryRows: defaultQueryRows,
  now: () => new Date()
}

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_RANGE_MS = 93 * DAY_MS
const DEFAULT_RANGE_MS = 30 * DAY_MS

function validationError() {
  return new MeasurementError(
    'MEASUREMENT_VALIDATION_ERROR',
    422,
    'Invalid measurement event lineage request'
  )
}

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) throw validationError()
  return date.toISOString()
}

function encodeCursor(row: LineageRow): string {
  return Buffer.from(JSON.stringify({
    occurredAt: iso(row.occurred_at),
    eventId: row.event_id,
    lineageId: row.lineage_id
  })).toString('base64url')
}

function decodeCursor(value: string) {
  try {
    return CursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')))
  } catch {
    throw validationError()
  }
}

function safeReceipt(value: string | null): string | null {
  const candidate = value?.trim()
  return candidate && /^[A-Za-z0-9._:/-]{1,255}$/.test(candidate) ? candidate : null
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol)
      ? `${url.origin}${url.pathname}`
      : '[redacted-url]'
  } catch {
    return '[redacted-url]'
  }
}

export function redactMeasurementReason(value: string | null): string | null {
  const candidate = value?.trim()
  if (!candidate) return null

  return candidate
    .replace(/https?:\/\/[^\s]+/gi, redactUrl)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?61|0)4(?:[\s-]?\d){8}\b/g, '[redacted-phone]')
    .replace(/\b(?:authorization|bearer|access[_ -]?token|api[_ -]?key|secret)\b(?:\s*[:=]?\s*[^\s,;]+)?/gi, '[redacted-secret]')
    .replace(/\s+/g, ' ')
    .slice(0, 500)
}

function mapRow(row: LineageRow): MeasurementLineageItem {
  const destination = row.destination_id && row.platform
    ? { id: row.destination_id, platform: row.platform }
    : null

  return MeasurementLineageItemSchema.parse({
    eventId: row.event_id,
    eventName: row.event_name,
    occurredAt: iso(row.occurred_at),
    recordedAt: iso(row.recorded_at),
    consentState: row.consent_decision,
    mappingVersion: Number(row.mapping_version),
    destination,
    outcome: row.outcome,
    outcomeAt: iso(row.outcome_at),
    receiptId: safeReceipt(row.provider_request_id),
    redactedReason: redactMeasurementReason(row.redacted_reason)
  })
}

export function createMeasurementEventLineageService(
  deps: EventLineageDeps = defaultDeps
) {
  return {
    async list(clientId: unknown, rawFilters: unknown = {}): Promise<MeasurementLineagePage> {
      const clientResult = z.string().uuid().safeParse(clientId)
      const filtersResult = LineageFiltersSchema.safeParse(rawFilters)
      if (!clientResult.success || !filtersResult.success) throw validationError()

      const filters = filtersResult.data
      const to = filters.to ? new Date(filters.to) : deps.now()
      const from = filters.from ? new Date(filters.from) : new Date(to.getTime() - DEFAULT_RANGE_MS)
      if (to.getTime() < from.getTime() || to.getTime() - from.getTime() > MAX_RANGE_MS) {
        throw validationError()
      }

      const params: unknown[] = [clientResult.data, from.toISOString(), to.toISOString()]
      const conditions = [
        'ce.client_id = $1',
        'ce.occurred_at >= $2::timestamptz',
        'ce.occurred_at <= $3::timestamptz'
      ]
      const addParam = (value: unknown) => {
        params.push(value)
        return `$${params.length}`
      }

      if (filters.state) {
        conditions.push(`COALESCE(cd.status, ce.outbox_status) = ${addParam(filters.state)}`)
      }
      if (filters.eventName) {
        conditions.push(`ce.event_name = ${addParam(filters.eventName)}`)
      }
      if (filters.platform) {
        conditions.push(`d.platform = ${addParam(filters.platform)}`)
      }
      if (filters.cursor) {
        const cursor = decodeCursor(filters.cursor)
        const timeParam = addParam(cursor.occurredAt)
        const eventParam = addParam(cursor.eventId)
        const lineageParam = addParam(cursor.lineageId)
        conditions.push(
          `(ce.occurred_at, ce.id, COALESCE(cd.id, ce.id)) < (${timeParam}::timestamptz, ${eventParam}::uuid, ${lineageParam}::uuid)`
        )
      }

      const limitParam = addParam(filters.limit + 1)
      const rows = await deps.queryRows<LineageRow>(
        `SELECT ce.id AS event_id,
                ce.event_name,
                ce.occurred_at,
                ce.created_at AS recorded_at,
                ce.consent_decision,
                ce.config_version AS mapping_version,
                COALESCE(cd.id, ce.id) AS lineage_id,
                cd.id AS delivery_id,
                d.id AS destination_id,
                d.platform,
                COALESCE(cd.status, ce.outbox_status) AS outcome,
                COALESCE(latest.attempted_at, cd.delivered_at, cd.last_attempt_at, cd.updated_at, ce.created_at) AS outcome_at,
                COALESCE(latest.provider_request_id, cd.provider_request_id) AS provider_request_id,
                COALESCE(latest.error_class, cd.error_class, latest.redacted_diagnostic, cd.redacted_error, ce.last_error_class) AS redacted_reason
           FROM conversion_events ce
      LEFT JOIN conversion_deliveries cd
             ON cd.client_id = ce.client_id
            AND cd.event_id = ce.id
      LEFT JOIN conversion_destinations d
             ON d.client_id = ce.client_id
            AND d.id = cd.destination_id
      LEFT JOIN LATERAL (
             SELECT attempt.provider_request_id,
                    attempt.error_class,
                    attempt.redacted_diagnostic,
                    attempt.attempted_at
               FROM conversion_delivery_attempts attempt
              WHERE attempt.client_id = ce.client_id
                AND attempt.delivery_id = cd.id
              ORDER BY attempt.attempt_number DESC
              LIMIT 1
           ) latest ON cd.id IS NOT NULL
          WHERE ${conditions.join('\n            AND ')}
          ORDER BY ce.occurred_at DESC, ce.id DESC, COALESCE(cd.id, ce.id) DESC
          LIMIT ${limitParam}`,
        params
      )

      const hasMore = rows.length > filters.limit
      const pageRows = rows.slice(0, filters.limit)
      return MeasurementLineagePageSchema.parse({
        items: pageRows.map(mapRow),
        nextCursor: hasMore && pageRows.length > 0
          ? encodeCursor(pageRows[pageRows.length - 1]!)
          : null
      })
    }
  }
}
