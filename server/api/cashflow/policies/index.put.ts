/**
 * PUT /api/cashflow/policies
 *
 * Upserts one treasury policy. Body: { policyType, config, active? }.
 * Config shape is validated per policy type — this is forecast-driving
 * money data, reject anything malformed rather than guessing.
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { z } from 'zod'
import { getSelectedTenant } from '~~/server/utils/session'
import { execute } from '~~/server/utils/db'

const taxTransferSchema = z.object({
  fromAccount: z.string().min(1),
  toAccount: z.string().min(1),
  months: z.record(
    z.string().regex(/^\d{4}-\d{2}$/),
    z.object({
      weeklyAmountCents: z.number().int().nonnegative(),
      skipMondays: z.array(z.number().int().min(1).max(5)).optional(),
    }),
  ),
  default: z.object({
    weeklyAmountCents: z.number().int().nonnegative(),
    skipMondays: z.array(z.number().int().min(1).max(5)).optional(),
  }).optional(),
})

const amexPaydownSchema = z.object({
  payFromAccount: z.string().min(1),
  tranches: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amountCents: z.number().int().positive(),
    label: z.string().optional(),
  })),
})

const bodySchema = z.discriminatedUnion('policyType', [
  z.object({ policyType: z.literal('tax_transfer'), config: taxTransferSchema, active: z.boolean().optional() }),
  z.object({ policyType: z.literal('amex_paydown'), config: amexPaydownSchema, active: z.boolean().optional() }),
])

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: `Invalid policy: ${parsed.error.issues[0]?.message}` })
  }
  const { policyType, config, active = true } = parsed.data

  await execute(
    `INSERT INTO treasury_policies (tenant_id, policy_type, config, active, updated_by)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (tenant_id, policy_type) DO UPDATE SET
       config = EXCLUDED.config,
       active = EXCLUDED.active,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [tenantId, policyType, JSON.stringify(config), active, user?.email ?? null],
  )

  return { ok: true }
})
