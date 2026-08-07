/**
 * POST /api/cashflow/commitments/seed-statutory
 *
 * Idempotently seeds the statutory obligation set (wages, super, SRO,
 * ATO instalment) into the commitment register. Existing seeded rows are
 * NEVER updated — human edits win. Returns { created, skipped } seedKeys.
 */

import { defineEventHandler, createError } from 'h3'
import { transaction } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { STATUTORY_SEEDS, seedNoteFor } from '~~/server/utils/statutorySeed'

export async function runStatutorySeed(tenantId: string, userId: string, today: Date) {
  const created: string[] = []
  const skipped: string[] = []

  await transaction(async (client) => {
    for (const def of STATUTORY_SEEDS) {
      const marker = `seedKey:${def.seedKey}%`
      const existing = await client.query(
        `SELECT id FROM cashflow_commitments
         WHERE tenant_id = $1 AND source = 'statutory-seed' AND notes LIKE $2
         LIMIT 1`,
        [tenantId, marker],
      )
      if (existing.rows.length) {
        skipped.push(def.seedKey)
        continue
      }
      await client.query(
        `INSERT INTO cashflow_commitments (
           tenant_id, supplier, contact_id, description, amount_cents, expected_date,
           recurrence, recurrence_end, payment_account, status, confidence,
           owner, notes, source, created_by)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,NULL,$7,'expected',$8,NULL,$9,'statutory-seed',$10)`,
        [
          tenantId, def.supplier, def.description, def.amountCents, def.anchor(today),
          def.recurrence, def.paymentAccount, def.confidence, seedNoteFor(def), userId,
        ],
      )
      created.push(def.seedKey)
    }
  })

  return { created, skipped }
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }
  return runStatutorySeed(tenantId, user.id, new Date())
})
