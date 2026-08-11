// server/api/crm/opportunities/[id]/create-quote.post.ts
// F14 follow-up — generate a Pricing quote from an opportunity's line-items and
// link it back onto the opportunity. Agency-only + pricing-gated (creating a
// quote is a billing action). Additive: reuses the quotes tables/triggers.
import { z } from 'zod'
import { requirePricingAccess } from '~~/server/utils/auth'
import { listLineItems } from '~~/server/utils/crm/lineItemsDb'
import { createQuoteFromOpportunity, mapLineItemsToQuoteItems } from '~~/server/utils/crm/oppQuote'
import { recordFieldChanges } from '~~/server/utils/crm/audit'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'

const Body = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const user = await requirePricingAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const { client_id } = parsed.data
  if (!id) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  const context = await resolveAgencyCrmSearchContext(event, { clientId: client_id, surface: 'agency_global' })
  const authorized = await requireCrmRecordAccess(context, { type: 'opportunity', id })
  const opp = authorized.row as { id: string, name: string | null, quote_id: string | null }
  if (opp.quote_id) {
    throw createError({ statusCode: 409, statusMessage: 'This opportunity already has a linked quote — unlink it first.' })
  }

  const lines = await listLineItems(context, opp.id)
  if (lines.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Add line items before generating a quote.' })
  }

  const quote = await createQuoteFromOpportunity({
    context,
    opportunityId: opp.id,
    clientId: context.clientId,
    opp: { name: opp.name },
    items: mapLineItemsToQuoteItems(lines),
    userId: context.actorId,
  })
  try {
    await recordFieldChanges({
      clientId: context.clientId, entityType: 'opportunity', entityId: opp.id,
      before: { quote_id: null }, after: { quote_id: quote.id }, fields: ['quote_id'], actor: context.actorId,
    })
  } catch (e) { console.error('[crm] audit failed', e) }

  return { quote, quote_id: quote.id }
})
