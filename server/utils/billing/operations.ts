import { createError } from 'h3'
import { queryOneFresh, queryRowsFresh, transaction } from '~~/server/utils/db'
import { resolveClientEntitlement } from '~~/server/utils/billing/entitlements'

export const BILLING_FEATURE_KEYS = [
  'crm.core',
  'crm.external',
  'catalog.sync',
  'mobile.crm',
  'persona.identity',
  'audience.google',
  'audience.meta',
  'communications.sms',
  'communications.voice',
  'ai.receptionist',
  'mcp.crm'
] as const

type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'overdue' | 'suspended' | 'cancelled'
type OverrideStatus = 'trial' | 'active' | 'grace' | 'capped' | 'overdue' | 'suspended' | 'cancelled'

interface SubscriptionMutation {
  planCode: string
  status: SubscriptionStatus
  currentPeriodStartsAt?: string | null
  currentPeriodEndsAt?: string | null
  overrides?: Array<{
    featureKey: string
    status: OverrideStatus
    limits: Record<string, unknown>
    reason: string
    expiresAt?: string | null
  }>
  removeOverrideKeys?: string[]
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function getClientBillingOverview(clientId: string, includeAdmin = false) {
  const client = await queryOneFresh<{ id: string, name: string }>(
    `SELECT id, name FROM agency_clients WHERE id = $1`,
    [clientId]
  )
  if (!client) {
    throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  }

  const subscription = await queryOneFresh<any>(
    `SELECT subscription.id,
            subscription.status,
            subscription.billing_provider,
            subscription.external_subscription_ref,
            subscription.current_period_starts_at,
            subscription.current_period_ends_at,
            subscription.cancelled_at,
            plan.id AS plan_id,
            plan.code AS plan_code,
            plan.name AS plan_name,
            plan.billing_period,
            plan.currency,
            plan.base_price_minor
       FROM client_subscriptions subscription
       JOIN billing_plans plan ON plan.id = subscription.plan_id
      WHERE subscription.client_id = $1
      ORDER BY
        CASE WHEN subscription.status IN ('trial', 'active', 'grace', 'overdue', 'suspended')
          THEN 0 ELSE 1 END,
        subscription.updated_at DESC
      LIMIT 1`,
    [clientId]
  )

  const discovered = await queryRowsFresh<{ feature_key: string }>(
    `SELECT feature_key
       FROM client_feature_entitlements
      WHERE client_id = $1
     UNION
     SELECT feature_key
       FROM client_entitlement_overrides
      WHERE client_id = $1
     UNION
     SELECT plan_feature.feature_key
       FROM client_subscriptions subscription
       JOIN billing_plan_entitlements plan_feature
         ON plan_feature.plan_id = subscription.plan_id
      WHERE subscription.client_id = $1`,
    [clientId]
  )
  const featureKeys = [...new Set([
    ...BILLING_FEATURE_KEYS,
    ...discovered.map(row => row.feature_key)
  ])].sort()
  const entitlementList = await Promise.all(
    featureKeys.map(featureKey => resolveClientEntitlement(clientId, featureKey))
  )

  const usage = await queryRowsFresh<any>(
    `WITH usage_window AS (
       SELECT
         COALESCE($2::timestamptz, date_trunc('month', NOW())) AS starts_at,
         COALESCE($3::timestamptz, date_trunc('month', NOW()) + INTERVAL '1 month') AS ends_at
     )
     SELECT event.feature_key,
            event.meter_key,
            event.unit,
            SUM(event.quantity) AS quantity,
            SUM(COALESCE(event.provider_cost_minor, 0)) AS provider_cost_minor,
            MIN(event.occurred_at) AS first_occurred_at,
            MAX(event.occurred_at) AS last_occurred_at
       FROM billing_usage_events event
       CROSS JOIN usage_window
      WHERE event.client_id = $1
        AND event.occurred_at >= usage_window.starts_at
        AND event.occurred_at < usage_window.ends_at
      GROUP BY event.feature_key, event.meter_key, event.unit
      ORDER BY event.feature_key, event.meter_key`,
    [
      clientId,
      subscription?.current_period_starts_at ?? null,
      subscription?.current_period_ends_at ?? null
    ]
  )

  const response: Record<string, unknown> = {
    client,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          provider: includeAdmin ? subscription.billing_provider : undefined,
          externalReference: includeAdmin ? subscription.external_subscription_ref : undefined,
          currentPeriodStartsAt: subscription.current_period_starts_at,
          currentPeriodEndsAt: subscription.current_period_ends_at,
          cancelledAt: subscription.cancelled_at,
          plan: {
            id: subscription.plan_id,
            code: subscription.plan_code,
            name: subscription.plan_name,
            billingPeriod: subscription.billing_period,
            currency: subscription.currency,
            basePriceMinor: number(subscription.base_price_minor)
          }
        }
      : null,
    entitlements: Object.fromEntries(
      entitlementList.map(item => [item.featureKey, item])
    ),
    usage: usage.map(row => ({
      featureKey: row.feature_key,
      meterKey: row.meter_key,
      unit: row.unit,
      quantity: number(row.quantity),
      providerCostMinor: number(row.provider_cost_minor),
      firstOccurredAt: row.first_occurred_at,
      lastOccurredAt: row.last_occurred_at
    }))
  }

  if (!includeAdmin) return response

  const [plans, planFeatures, subscriptionAudit, entitlementAudit] = await Promise.all([
    queryRowsFresh<any>(
      `SELECT id, code, name, status, billing_period, currency, base_price_minor, version
         FROM billing_plans
        WHERE status IN ('active', 'retired')
        ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, name`
    ),
    queryRowsFresh<any>(
      `SELECT plan_id, feature_key, status, limits, metered
         FROM billing_plan_entitlements
        ORDER BY feature_key`
    ),
    queryRowsFresh<any>(
      `SELECT audit.*, previous_plan.code AS previous_plan_code,
              next_plan.code AS next_plan_code
         FROM billing_subscription_audit audit
         LEFT JOIN billing_plans previous_plan ON previous_plan.id = audit.previous_plan_id
         LEFT JOIN billing_plans next_plan ON next_plan.id = audit.next_plan_id
        WHERE audit.client_id = $1
        ORDER BY audit.occurred_at DESC
        LIMIT 50`,
      [clientId]
    ),
    queryRowsFresh<any>(
      `SELECT id, feature_key, action, previous_status, next_status,
              actor_id, source, occurred_at, metadata
         FROM billing_entitlement_audit
        WHERE client_id = $1
        ORDER BY occurred_at DESC
        LIMIT 50`,
      [clientId]
    )
  ])

  response.availablePlans = plans.map(plan => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    status: plan.status,
    billingPeriod: plan.billing_period,
    currency: plan.currency,
    basePriceMinor: number(plan.base_price_minor),
    version: plan.version,
    entitlements: planFeatures
      .filter(feature => feature.plan_id === plan.id)
      .map(feature => ({
        featureKey: feature.feature_key,
        status: feature.status,
        limits: feature.limits ?? {},
        metered: feature.metered
      }))
  }))
  response.audit = {
    subscriptions: subscriptionAudit,
    entitlements: entitlementAudit
  }
  return response
}

export async function updateClientBilling(
  clientId: string,
  actorId: string,
  input: SubscriptionMutation
) {
  await transaction(async db => {
    const client = await db.query(
      `SELECT id FROM agency_clients WHERE id = $1 FOR UPDATE`,
      [clientId]
    )
    if (!client.rows[0]) {
      throw createError({ statusCode: 404, statusMessage: 'Client not found' })
    }

    const plan = await db.query(
      `SELECT id FROM billing_plans WHERE code = $1 AND status = 'active'`,
      [input.planCode]
    )
    if (!plan.rows[0]) {
      throw createError({ statusCode: 400, statusMessage: 'Active billing plan not found' })
    }

    const current = await db.query(
      `SELECT id
         FROM client_subscriptions
        WHERE client_id = $1
          AND status IN ('trial', 'active', 'grace', 'overdue', 'suspended')
        ORDER BY updated_at DESC
        LIMIT 1
        FOR UPDATE`,
      [clientId]
    )
    if (current.rows[0]) {
      await db.query(
        `UPDATE client_subscriptions
            SET plan_id = $2,
                status = $3,
                current_period_starts_at = COALESCE($4::timestamptz, current_period_starts_at),
                current_period_ends_at = COALESCE($5::timestamptz, current_period_ends_at),
                cancelled_at = CASE WHEN $3 = 'cancelled' THEN NOW() ELSE NULL END,
                updated_by = $6,
                updated_at = NOW()
          WHERE id = $1`,
        [
          current.rows[0].id,
          plan.rows[0].id,
          input.status,
          input.currentPeriodStartsAt ?? null,
          input.currentPeriodEndsAt ?? null,
          actorId
        ]
      )
    } else if (input.status !== 'cancelled') {
      await db.query(
        `INSERT INTO client_subscriptions (
           client_id, plan_id, status, current_period_starts_at,
           current_period_ends_at, updated_by
         ) VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6)`,
        [
          clientId,
          plan.rows[0].id,
          input.status,
          input.currentPeriodStartsAt ?? null,
          input.currentPeriodEndsAt ?? null,
          actorId
        ]
      )
    }

    for (const featureKey of input.removeOverrideKeys ?? []) {
      await db.query(
        `UPDATE client_entitlement_overrides
            SET updated_by = $3
          WHERE client_id = $1 AND feature_key = $2`,
        [clientId, featureKey, actorId]
      )
      await db.query(
        `DELETE FROM client_entitlement_overrides
          WHERE client_id = $1 AND feature_key = $2`,
        [clientId, featureKey]
      )
    }

    for (const override of input.overrides ?? []) {
      await db.query(
        `INSERT INTO client_entitlement_overrides (
           client_id, feature_key, status, limits, reason,
           expires_at, created_by, updated_by
         ) VALUES ($1, $2, $3, $4::jsonb, $5, $6::timestamptz, $7, $7)
         ON CONFLICT (client_id, feature_key) DO UPDATE
           SET status = EXCLUDED.status,
               limits = EXCLUDED.limits,
               reason = EXCLUDED.reason,
               expires_at = EXCLUDED.expires_at,
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()`,
        [
          clientId,
          override.featureKey,
          override.status,
          JSON.stringify(override.limits),
          override.reason,
          override.expiresAt ?? null,
          actorId
        ]
      )
    }
  })

  return getClientBillingOverview(clientId, true)
}
