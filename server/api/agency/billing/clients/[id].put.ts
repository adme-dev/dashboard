import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { updateClientBilling } from '~~/server/utils/billing/operations'

const FeatureKey = z.string().regex(/^[a-z][a-z0-9._-]{1,119}$/)
const MeterLimit = z.strictObject({
  included: z.number().nonnegative().optional(),
  hardLimit: z.number().nonnegative().optional(),
  period: z.enum(['subscription', 'monthly']).default('subscription')
})
const Limits = z.strictObject({
  meters: z.record(FeatureKey, MeterLimit).optional()
})

const Body = z.strictObject({
  planCode: z.string().regex(/^[a-z][a-z0-9._-]{1,79}$/),
  status: z.enum(['trial', 'active', 'grace', 'overdue', 'suspended', 'cancelled']),
  currentPeriodStartsAt: z.string().datetime({ offset: true }).nullable().optional(),
  currentPeriodEndsAt: z.string().datetime({ offset: true }).nullable().optional(),
  overrides: z.array(z.strictObject({
    featureKey: FeatureKey,
    status: z.enum(['trial', 'active', 'grace', 'capped', 'overdue', 'suspended', 'cancelled']),
    limits: Limits.default({}),
    reason: z.string().trim().min(3).max(1000),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional()
  })).max(50).default([]),
  removeOverrideKeys: z.array(FeatureKey).max(50).default([])
}).superRefine((value, context) => {
  if (
    value.currentPeriodStartsAt
    && value.currentPeriodEndsAt
    && new Date(value.currentPeriodEndsAt) <= new Date(value.currentPeriodStartsAt)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['currentPeriodEndsAt'],
      message: 'Period end must be after period start'
    })
  }
})

export default defineEventHandler(async event => {
  const user = await requireRole(event, ['owner', 'admin'])
  const clientId = getRouterParam(event, 'id')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }
  return updateClientBilling(clientId, user.id, parsed.data)
})
