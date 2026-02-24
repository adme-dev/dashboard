/**
 * GET /api/agency/invoicing/clients
 * Returns Xero contacts for invoicing. Fetches from Xero API if connected,
 * falls back to agency_clients table if not.
 *
 * Query params:
 *   ?search= — filter by name (case-insensitive substring match)
 *   ?source=xero|local — force a specific data source
 */
import { createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { fetchXeroContacts, fetchLocalClients, DEALER_GROUPS, getPaymentTermDays } from '~~/server/utils/invoicing/xero-clients'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const search = (query.search as string || '').toLowerCase().trim()
  const source = query.source as string | undefined

  try {
    let contacts
    let dataSource: 'xero' | 'local'

    if (source === 'local') {
      contacts = await fetchLocalClients()
      dataSource = 'local'
    } else {
      // Try Xero API first, fall back to local DB
      try {
        contacts = await fetchXeroContacts(event)
        dataSource = 'xero'
      } catch {
        contacts = await fetchLocalClients()
        dataSource = 'local'
      }
    }

    // Apply search filter
    if (search) {
      contacts = contacts.filter(c => c.name.toLowerCase().includes(search))
    }

    return {
      clients: contacts,
      dealerGroups: DEALER_GROUPS,
      total: contacts.length,
      source: dataSource,
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to fetch clients',
    })
  }
})
