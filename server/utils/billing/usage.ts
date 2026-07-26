import { createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { resolveClientEntitlement } from '~~/server/utils/billing/entitlements'

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

interface MeterLimit {
  included?: number
  hardLimit?: number
  period?: 'subscription' | 'monthly'
}

function meterLimit(limits: Record<string, unknown>, meterKey: string): MeterLimit | null {
  const meters = limits.meters
  if (!meters || typeof meters !== 'object' || Array.isArray(meters)) return null
  const meter = (meters as Record<string, unknown>)[meterKey]
  if (!meter || typeof meter !== 'object' || Array.isArray(meter)) return null
  const candidate = meter as Record<string, unknown>
  return {
    included: typeof candidate.included === 'number' ? candidate.included : undefined,
    hardLimit: typeof candidate.hardLimit === 'number' ? candidate.hardLimit : undefined,
    period: candidate.period === 'monthly' ? 'monthly' : 'subscription'
  }
}

export async function resolveBillingUsageCapacity(
  clientId: string,
  featureKey: string,
  meterKey: string,
  requestedQuantity = 0
) {
  const entitlement = await resolveClientEntitlement(clientId, featureKey)
  const limit = meterLimit(entitlement.limits, meterKey)
  if (!entitlement.enabled || limit?.hardLimit == null) {
    return {
      entitlement,
      meterKey,
      allowed: entitlement.enabled,
      unlimited: entitlement.enabled && limit?.hardLimit == null,
      used: 0,
      requested: requestedQuantity,
      included: limit?.included ?? null,
      hardLimit: limit?.hardLimit ?? null,
      remaining: null,
      periodStartsAt: null,
      periodEndsAt: null
    }
  }

  const row = await queryOne<any>(
    `WITH usage_window AS (
       SELECT
         CASE
           WHEN $4 = 'monthly' THEN date_trunc('month', NOW())
           ELSE COALESCE(
             (
               SELECT current_period_starts_at
                 FROM client_subscriptions
                WHERE client_id = $1
                  AND status IN ('trial', 'active', 'grace')
                ORDER BY updated_at DESC
                LIMIT 1
             ),
             date_trunc('month', NOW())
           )
         END AS starts_at,
         CASE
           WHEN $4 = 'monthly' THEN date_trunc('month', NOW()) + INTERVAL '1 month'
           ELSE COALESCE(
             (
               SELECT current_period_ends_at
                 FROM client_subscriptions
                WHERE client_id = $1
                  AND status IN ('trial', 'active', 'grace')
                ORDER BY updated_at DESC
                LIMIT 1
             ),
             date_trunc('month', NOW()) + INTERVAL '1 month'
           )
         END AS ends_at
     )
     SELECT usage_window.starts_at,
            usage_window.ends_at,
            COALESCE(SUM(event.quantity), 0) AS used
       FROM usage_window
       LEFT JOIN billing_usage_events event
         ON event.client_id = $1
        AND event.feature_key = $2
        AND event.meter_key = $3
        AND event.occurred_at >= usage_window.starts_at
        AND event.occurred_at < usage_window.ends_at
      GROUP BY usage_window.starts_at, usage_window.ends_at`,
    [clientId, featureKey, meterKey, limit.period]
  )
  const used = Number(row?.used ?? 0)
  const remaining = Math.max(0, limit.hardLimit - used)
  return {
    entitlement,
    meterKey,
    allowed: used + requestedQuantity <= limit.hardLimit,
    unlimited: false,
    used,
    requested: requestedQuantity,
    included: limit.included ?? null,
    hardLimit: limit.hardLimit,
    remaining,
    periodStartsAt: row?.starts_at ?? null,
    periodEndsAt: row?.ends_at ?? null
  }
}

export async function requireBillingUsageCapacity(
  clientId: string,
  featureKey: string,
  meterKey: string,
  requestedQuantity = 1
) {
  const capacity = await resolveBillingUsageCapacity(
    clientId,
    featureKey,
    meterKey,
    requestedQuantity
  )
  if (!capacity.entitlement.enabled) {
    throw createError({
      statusCode: 402,
      statusMessage: `Feature entitlement required: ${featureKey}`,
      data: {
        code: 'feature_entitlement_required',
        featureKey,
        entitlementStatus: capacity.entitlement.status
      }
    })
  }
  if (!capacity.allowed) {
    throw createError({
      statusCode: 402,
      statusMessage: `Usage limit reached: ${featureKey}.${meterKey}`,
      data: {
        code: 'usage_limit_reached',
        featureKey,
        meterKey,
        hardLimit: capacity.hardLimit,
        remaining: capacity.remaining,
        periodEndsAt: capacity.periodEndsAt
      }
    })
  }
  return capacity
}
