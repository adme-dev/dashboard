// server/api/crm/opportunities/[id]/create-quote.post.ts
// F14 follow-up — generate a Pricing quote from an opportunity's line-items and
// link it back onto the opportunity. Agency-only + pricing-gated (creating a
// quote is a billing action). Additive: reuses the quotes tables/triggers.
import { z } from 'zod'
import { requirePricingAccess } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { listLineItems } from '~~/server/utils/crm/lineItemsDb'
import { createQuoteFromOpportunity, mapLineItemsToQuoteItems } from '~~/server/utils/crm/oppQuote'
import { recordFieldChanges } from '~~/server/utils/crm/audit'

const Body = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const user = await requirePricingAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const { client_id } = parsed.data

  const opp = await queryOne<{ id: string, name: string | null, quote_id: string | null }>(
    `SELECT id, name, quote_id FROM crm_opportunities
      WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client_id],
  )
  if (!opp) throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
  if (opp.quote_id) {
    throw createError({ statusCode: 409, statusMessage: 'This opportunity already has a linked quote — unlink it first.' })
  }

  const lines = await listLineItems(client_id, opp.id)
  if (lines.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Add line items before generating a quote.' })
  }

  const quote = await createQuoteFromOpportunity({
    clientId: client_id,
    opp: { name: opp.name },
    items: mapLineItemsToQuoteItems(lines),
    userId: user.id,
  })

  // Link conditionally on quote_id IS NULL — closes the TOCTOU between the 409
  // check above and this write (two tabs / a retry could both pass the check).
  const linked = await queryOne<{ id: string }>(
    `UPDATE crm_opportunities SET quote_id = $1, updated_at = NOW()
      WHERE id = $2 AND client_id = $3 AND quote_id IS NULL
      RETURNING id`,
    [quote.id, opp.id, client_id],
  )
  if (!linked) {
    // Lost the race — another request linked a quote first. Drop the just-created
    // orphan quote (cascade removes its line items) so no dangling draft remains.
    await execute(`DELETE FROM quotes WHERE id = $1`, [quote.id])
    throw createError({ statusCode: 409, statusMessage: 'This opportunity already has a linked quote — unlink it first.' })
  }
  try {
    await recordFieldChanges({
      clientId: client_id, entityType: 'opportunity', entityId: opp.id,
      before: { quote_id: null }, after: { quote_id: quote.id }, fields: ['quote_id'], actor: user.id,
    })
  } catch (e) { console.error('[crm] audit failed', e) }

  return { quote, quote_id: quote.id }
})
