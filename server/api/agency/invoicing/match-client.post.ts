/**
 * POST /api/agency/invoicing/match-client
 * Fuzzy match a Monday.com client name to a Xero contact.
 *
 * Body: { name: string }
 * Returns: { match: { name, code, contactId } | null, exact: boolean, score: number }
 *
 * Fetches contacts from Xero API (or local DB fallback) then runs
 * the matching algorithm against the live contact list.
 */
import { createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { fetchXeroContacts, fetchLocalClients, matchClient, getPaymentTermDays } from '~~/server/utils/invoicing/xero-clients'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const name = body?.name

  if (!name || typeof name !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing required field: name' })
  }

  try {
    // Get contacts — try Xero, fall back to local
    let contacts
    try {
      contacts = await fetchXeroContacts(event)
    } catch {
      contacts = await fetchLocalClients()
    }

    const result = matchClient(name, contacts)

    if (!result) {
      return { match: null, exact: false, score: 0 }
    }

    return {
      match: {
        name: result.contact.name,
        code: result.contact.code,
        contactId: result.contact.contactId,
        paymentTermDays: getPaymentTermDays(result.contact.name),
      },
      exact: result.exact,
      score: result.score,
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to match client',
    })
  }
})
