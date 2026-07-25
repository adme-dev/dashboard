import { queryOne } from '~~/server/utils/db'

export interface UsageEventInput {
  clientId: string
  featureKey: string
  meterKey: string
  quantity: number
  unit: string
  providerCostMinor?: number | null
  currency?: string
  sourceSystem: string
  sourceEventId: string
  idempotencyKey: string
  occurredAt: string
  metadata?: Record<string, unknown>
}

const USAGE_METADATA_KEYS = new Set([
  'provider',
  'model',
  'region',
  'operation',
  'channel',
  'product',
  'rateCardVersion'
])

function safeMetadata(input: Record<string, unknown> | undefined) {
  const output: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!USAGE_METADATA_KEYS.has(key)) continue
    if (typeof value === 'string') output[key] = value.slice(0, 120)
    else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value
    else if (typeof value === 'boolean') output[key] = value
  }
  return output
}

export async function recordBillingUsage(input: UsageEventInput) {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO billing_usage_events (
       client_id, feature_key, meter_key, quantity, unit,
       provider_cost_minor, currency, source_system, source_event_id,
       idempotency_key, occurred_at, metadata
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::jsonb
     )
     ON CONFLICT (client_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      input.clientId,
      input.featureKey,
      input.meterKey,
      input.quantity,
      input.unit,
      input.providerCostMinor ?? null,
      input.currency ?? 'AUD',
      input.sourceSystem,
      input.sourceEventId,
      input.idempotencyKey,
      input.occurredAt,
      JSON.stringify(safeMetadata(input.metadata))
    ]
  )
  if (row) return { status: 'recorded' as const, id: row.id }

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM billing_usage_events
      WHERE client_id = $1 AND idempotency_key = $2`,
    [input.clientId, input.idempotencyKey]
  )
  return { status: 'duplicate' as const, id: existing?.id ?? null }
}
