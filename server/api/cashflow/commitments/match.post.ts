/**
 * POST /api/cashflow/commitments/match
 *
 * Runs the matching engine over open commitments. Body:
 *  - apply (boolean, default false): when true, auto-confidence matches are
 *    applied (commitment → matched, linked to the bill). Suggested matches
 *    are always returned for human confirmation and never auto-applied.
 *  - confirm ({ commitmentId, invoiceId }, optional): applies one specific
 *    suggested match after human review.
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { getSelectedTenant } from '~~/server/utils/session'
import { findCommitmentMatches, applyMatch } from '~~/server/utils/commitmentMatcher'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  const body = await readBody<{ apply?: boolean; confirm?: { commitmentId?: string; invoiceId?: string } }>(event) ?? {}

  if (body.confirm) {
    const { commitmentId, invoiceId } = body.confirm
    if (!commitmentId || !invoiceId) {
      throw createError({ statusCode: 400, statusMessage: 'confirm requires commitmentId and invoiceId' })
    }
    await applyMatch(tenantId, commitmentId, invoiceId)
    return { applied: 1, matches: [] }
  }

  const matches = await findCommitmentMatches(tenantId)
  let applied = 0
  if (body.apply) {
    for (const m of matches) {
      if (m.confidence === 'auto') {
        await applyMatch(tenantId, m.commitmentId, m.invoiceId)
        applied++
      }
    }
  }
  return { applied, matches }
})
