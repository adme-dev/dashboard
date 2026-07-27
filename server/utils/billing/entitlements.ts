import { createError } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'

export type FeatureEntitlementStatus
  = 'trial' | 'active' | 'grace' | 'capped' | 'overdue' | 'suspended' | 'cancelled' | 'missing'

export interface FeatureEntitlement {
  clientId: string
  featureKey: string
  enabled: boolean
  status: FeatureEntitlementStatus
  source: 'override' | 'client' | 'plan' | 'missing'
  limits: Record<string, unknown>
  expiresAt: string | null
}

const ENABLED = new Set<FeatureEntitlementStatus>(['trial', 'active', 'grace'])

export async function resolveClientEntitlement(
  clientId: string,
  featureKey: string
): Promise<FeatureEntitlement> {
  const row = await queryOneFresh<{
    status: FeatureEntitlementStatus
    source: FeatureEntitlement['source']
    limits: Record<string, unknown> | null
    expires_at: string | null
  }>(
    `WITH candidates AS (
       SELECT entitlement_override.status, 'override'::text AS source, entitlement_override.limits,
              entitlement_override.expires_at, 1 AS priority
         FROM client_entitlement_overrides entitlement_override
        WHERE entitlement_override.client_id = $1
          AND entitlement_override.feature_key = $2
          AND entitlement_override.starts_at <= NOW()
          AND (
            entitlement_override.expires_at IS NULL
            OR entitlement_override.expires_at > NOW()
          )
       UNION ALL
       SELECT entitlement.status, 'client'::text, entitlement.limits,
              entitlement.expires_at, 2
         FROM client_feature_entitlements entitlement
        WHERE entitlement.client_id = $1
          AND entitlement.feature_key = $2
          AND entitlement.starts_at <= NOW()
          AND (entitlement.expires_at IS NULL OR entitlement.expires_at > NOW())
       UNION ALL
       SELECT plan_feature.status, 'plan'::text, plan_feature.limits,
              subscription.current_period_ends_at, 3
         FROM client_subscriptions subscription
         JOIN billing_plans plan
           ON plan.id = subscription.plan_id
          AND plan.status = 'active'
         JOIN billing_plan_entitlements plan_feature
           ON plan_feature.plan_id = plan.id
          AND plan_feature.feature_key = $2
        WHERE subscription.client_id = $1
          AND subscription.status IN ('trial', 'active', 'grace')
          AND (
            subscription.current_period_ends_at IS NULL
            OR subscription.current_period_ends_at > NOW()
          )
     )
     SELECT status, source, limits, expires_at
       FROM candidates
      ORDER BY priority
      LIMIT 1`,
    [clientId, featureKey]
  )

  const status = row?.status ?? 'missing'
  return {
    clientId,
    featureKey,
    enabled: ENABLED.has(status),
    status,
    source: row?.source ?? 'missing',
    limits: row?.limits ?? {},
    expiresAt: row?.expires_at ?? null
  }
}

export async function requireClientEntitlement(clientId: string, featureKey: string) {
  const entitlement = await resolveClientEntitlement(clientId, featureKey)
  if (!entitlement.enabled) {
    throw createError({
      statusCode: 402,
      statusMessage: `Feature entitlement required: ${featureKey}`,
      data: {
        code: 'feature_entitlement_required',
        featureKey,
        entitlementStatus: entitlement.status
      }
    })
  }
  return entitlement
}
