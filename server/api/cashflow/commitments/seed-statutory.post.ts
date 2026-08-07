/**
 * POST /api/cashflow/commitments/seed-statutory
 *
 * Idempotently seeds the statutory obligation set (wages, super, SRO,
 * ATO instalment) into the commitment register. Identity is the seed_key
 * column with a partial unique index, so re-runs and concurrent clicks
 * INSERT ... ON CONFLICT DO NOTHING — existing rows are NEVER updated;
 * human edits win. Returns { created, skipped } seedKeys.
 */

import { defineEventHandler, createError } from 'h3'
import { transaction } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { STATUTORY_SEEDS, seedNoteFor, melbourneToday } from '~~/server/utils/statutorySeed'

export async function runStatutorySeed(tenantId: string, userId: string, today: Date) {
  const created: string[] = []
  const skipped: string[] = []

  await transaction(async (client) => {
    for (const def of STATUTORY_SEEDS) {
      // Link the seed to a real Xero contact where one exists (e.g. the ATO)
      // so the forecast's bill-suppression guard can prevent double counting
      // if the obligation ever appears as a real bill.
      let contactId: string | null = null
      if (def.contactNamePattern) {
        const contact = await client.query(
          `SELECT contact_id FROM xero_contacts_cache
           WHERE tenant_id = $1 AND name ILIKE $2
           ORDER BY name LIMIT 1`,
          [tenantId, def.contactNamePattern]
        )
        contactId = (contact.rows[0] as { contact_id?: string } | undefined)?.contact_id ?? null
      }

      const inserted = await client.query(
        `INSERT INTO cashflow_commitments (
           tenant_id, supplier, contact_id, description, amount_cents, expected_date,
           recurrence, recurrence_end, payment_account, status, confidence,
           owner, notes, source, seed_key, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,'expected',$9,NULL,$10,'statutory-seed',$11,$12)
         ON CONFLICT (tenant_id, seed_key) WHERE source = 'statutory-seed' AND seed_key IS NOT NULL
         DO NOTHING
         RETURNING id`,
        [
          tenantId, def.supplier, contactId, def.description, def.amountCents, def.anchor(today),
          def.recurrence, def.paymentAccount, def.confidence, seedNoteFor(def), def.seedKey, userId
        ]
      )
      if (inserted.rows.length) created.push(def.seedKey)
      else skipped.push(def.seedKey)
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
  return runStatutorySeed(tenantId, user.id, melbourneToday())
})
